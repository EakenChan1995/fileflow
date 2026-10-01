import { app, BrowserWindow, shell, Menu } from 'electron'
import * as path from 'node:path'
import { registerIpc } from './ipc'
import { bindProgressSink, log } from './lib/task'

const VITE_DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: 'FileFlow',
    backgroundColor: '#f6f7f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // 渲染进程不直连 Node，全部能力经 preload 白名单暴露
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // 外链一律交给系统浏览器，避免在应用内打开网页
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

function buildMenu(): void {
  // Windows/Linux 下隐藏默认菜单栏，界面更干净；macOS 保留以符合平台习惯
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }
}

app.whenReady().then(() => {
  buildMenu()
  registerIpc()
  const win = createWindow()

  bindProgressSink(payload => {
    if (!win.isDestroyed()) win.webContents.send('task:progress', payload)
  })

  log('FileFlow 已启动')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
