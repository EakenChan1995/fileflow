import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'

const invoke =
  <T>(channel: string) =>
  (...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args)

const api: Api = {
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openInFolder: invoke('app:openInFolder'),
    openPath: invoke('app:openPath')
  },
  dialog: {
    pickDirectory: invoke('dialog:pickDirectory'),
    pickFiles: invoke('dialog:pickFiles'),
    confirm: invoke('dialog:confirm')
  },
  fs: {
    scan: invoke('fs:scan'),
    stat: invoke('fs:stat')
  },
  rename: {
    preview: invoke('rename:preview'),
    apply: invoke('rename:apply')
  },
  image: {
    preview: invoke('image:preview'),
    apply: invoke('image:apply')
  },
  dedupe: {
    scan: invoke('dedupe:scan'),
    pick: invoke('dedupe:pick'),
    remove: invoke('dedupe:remove')
  },
  sync: {
    preview: invoke('sync:preview'),
    apply: invoke('sync:apply')
  },
  organize: {
    preview: invoke('organize:preview'),
    apply: invoke('organize:apply')
  },
  clean: {
    preview: invoke('clean:preview'),
    apply: invoke('clean:apply')
  },
  undo: {
    list: invoke('undo:list'),
    revert: invoke('undo:revert'),
    remove: invoke('undo:remove')
  },
  settings: {
    get: invoke('settings:get'),
    set: invoke('settings:set'),
    recent: invoke('settings:recent')
  },
  task: {
    cancel: invoke('task:cancel'),
    onProgress: cb => {
      const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload as never)
      ipcRenderer.on('task:progress', listener)
      return () => ipcRenderer.removeListener('task:progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
