import { app, dialog, ipcMain, shell } from 'electron'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import {
  CleanOptions,
  DedupeOptions,
  DuplicateGroup,
  FileEntry,
  ImageOptions,
  Op,
  OrganizeOptions,
  RenamePreviewItem,
  RenameRule,
  SyncAction,
  SyncOptions,
  ScanOptions,
  TaskResult,
  UndoRecord
} from '../../shared/types'
import { scanDir } from '../lib/scanner'
import { runTask, cancelTask, log } from '../lib/task'
import { copyFile, exists, moveFile, trash, uniquePath } from '../lib/fsutil'
import {
  deleteUndo,
  listUndo,
  loadSettings,
  pushRecentDir,
  saveSettings,
  saveUndo,
  PersistedSettings
} from '../lib/store'
import { buildPreview } from '../modules/rename'
import { buildJobs, ImageJob, processOne } from '../modules/image'
import { findDuplicates, pickRemovals } from '../modules/dedupe'
import { buildSyncPlan } from '../modules/sync'
import { buildOrganizePlan } from '../modules/organize'
import { findCleanTargets } from '../modules/clean'

/**
 * 参数用 never[] 让任意具体签名的 handler 都能赋值进来（逆变底类型），
 * 同时在 registerIpc 处统一做一次收口，避免每个 handler 各写各的。
 */
type Handler = (...args: never[]) => unknown

const handlers: Record<string, Handler> = {
  /* ---------------- 应用基础 ---------------- */
  'app:version': () => app.getVersion(),
  'app:openInFolder': (p: string) => shell.showItemInFolder(p),
  'app:openPath': (p: string) => shell.openPath(p),

  'dialog:pickDirectory': async (opts?: { title?: string; defaultPath?: string }) => {
    const res = await dialog.showOpenDialog({
      title: opts?.title ?? '选择目录',
      defaultPath: opts?.defaultPath,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths.length) return null
    const dir = res.filePaths[0]
    await pushRecentDir(dir)
    return dir
  },

  'dialog:pickFiles': async (opts?: { title?: string; filters?: Electron.FileFilter[]; multi?: boolean }) => {
    const properties: Electron.OpenDialogOptions['properties'] = ['openFile']
    if (opts?.multi !== false) properties.push('multiSelections')
    const res = await dialog.showOpenDialog({
      title: opts?.title ?? '选择文件',
      defaultPath: (await loadSettings()).lastDirs[0],
      filters: opts?.filters ?? [],
      properties
    })
    return res.canceled ? [] : res.filePaths
  },

  /* ---------------- 文件系统 ---------------- */
  'dialog:confirm': async (opts: { title: string; message: string; detail?: string }) => {
    const res = await dialog.showMessageBox({
      type: 'question',
      buttons: ['取消', '确定'],
      defaultId: 1,
      cancelId: 0,
      title: opts.title,
      message: opts.message,
      detail: opts.detail
    })
    return res.response === 1
  },

  'fs:scan': async (dir: string, opts?: ScanOptions) => scanDir(dir, opts ?? {}),

  'fs:stat': async (paths: string[]): Promise<FileEntry[]> => {
    const out: FileEntry[] = []
    for (const p of paths) {
      try {
        const st = await fsp.stat(p)
        out.push({
          path: p,
          name: path.basename(p),
          dir: path.dirname(p),
          ext: path.extname(p).toLowerCase(),
          size: st.size,
          mtime: st.mtimeMs,
          isDir: st.isDirectory()
        })
      } catch {
        // 跳过不存在或无权访问的路径
      }
    }
    return out
  },

  /* ---------------- 批量重命名 ---------------- */
  'rename:preview': async (files: string[], rules: RenameRule[], mtimes?: Record<string, number>) =>
    buildPreview(files, rules, mtimes ?? {}),

  'rename:apply': async (items: RenamePreviewItem[]): Promise<TaskResult> => {
    const targets = items.filter(i => i.changed && !i.conflict)
    const outcome = await runTask('批量重命名', targets, async item => {
      if (await exists(item.to)) throw new Error('目标已存在，已跳过')
      await fsp.rename(item.from, item.to)
      return path.basename(item.to)
    })
    // 只为真正成功的步骤生成回滚记录
    const failed = new Set(outcome.errors.map(e => e.path))
    const ops: Op[] = targets
      .filter(t => !failed.has(t.from))
      .map(t => ({ kind: 'rename' as const, from: t.from, to: t.to }))
    const record = await saveUndo('批量重命名', ops)
    return toResult(outcome, record.id)
  },

  /* ---------------- 图片处理 ---------------- */
  'image:preview': async (files: FileEntry[], opts: ImageOptions, rootDir: string): Promise<ImageJob[]> =>
    buildJobs(files, opts, rootDir),

  'image:apply': async (jobs: ImageJob[], opts: ImageOptions): Promise<TaskResult> => {
    const settings = await loadSettings()
    const outcome = await runTask(
      '图片处理',
      jobs,
      async job => {
        await processOne(job, opts)
        return path.basename(job.to)
      },
      { concurrency: settings.concurrency }
    )
    // overwrite 模式覆盖了原文件，内容不可恢复
    const ops: Op[] = jobs.map(j => ({ kind: 'copy' as const, from: j.from, to: j.to }))
    const record = await saveUndo('图片处理', ops, opts.outputMode !== 'overwrite' && outcome.succeeded > 0)
    return toResult(outcome, record.id)
  },

  /* ---------------- 重复文件 ---------------- */
  'dedupe:scan': async (dirs: string[], opts: DedupeOptions): Promise<DuplicateGroup[]> =>
    findDuplicates(dirs, opts, (done, total) => {
      log(`哈希计算 ${done}/${total}`, 'info')
    }),

  'dedupe:pick': (groups: DuplicateGroup[], keep: 'oldest' | 'newest' | 'shortest-path') =>
    pickRemovals(groups, keep),

  'dedupe:remove': async (
    files: string[],
    mode: 'trash' | 'move',
    targetDir?: string
  ): Promise<TaskResult> => {
    if (mode === 'move' && !targetDir)
      return { ok: false, total: 0, succeeded: 0, failed: 0, message: '未指定移动目标目录' }
    const ops: Op[] = []
    const outcome = await runTask(mode === 'trash' ? '移至回收站' : '移动重复文件', files, async f => {
      if (mode === 'trash') {
        await trash(f)
        ops.push({ kind: 'trash', from: f })
      } else {
        const to = await uniquePath(path.join(targetDir as string, path.basename(f)))
        await moveFile(f, to)
        ops.push({ kind: 'move', from: f, to })
      }
      return path.basename(f)
    })
    const record = await saveUndo('重复文件清理', ops, mode === 'move')
    return toResult(outcome, record.id)
  },

  /* ---------------- 目录同步 ---------------- */
  'sync:preview': (src: string, dst: string, opts: SyncOptions) => buildSyncPlan(src, dst, opts),

  'sync:apply': async (actions: SyncAction[]): Promise<TaskResult> => {
    const todo = actions.filter(a => a.kind !== 'skip')
    const ops: Op[] = []
    const outcome = await runTask('目录同步', todo, async a => {
      if (a.kind === 'create' || a.kind === 'update') {
        await copyFile(a.from, a.to)
        ops.push({ kind: 'copy', from: a.from, to: a.to })
        return `${a.kind === 'create' ? '新增' : '更新'} ${a.rel}`
      }
      await trash(a.to)
      ops.push({ kind: 'trash', from: a.to })
      return `删除 ${a.rel}`
    })
    const record = await saveUndo('目录同步', ops)
    return toResult(outcome, record.id)
  },

  /* ---------------- 文件整理 ---------------- */
  'organize:preview': (files: FileEntry[], opts: OrganizeOptions) => buildOrganizePlan(files, opts),

  'organize:apply': async (
    items: { from: string; to: string }[],
    mode: 'move' | 'copy'
  ): Promise<TaskResult> => {
    const ops: Op[] = []
    const outcome = await runTask(
      mode === 'move' ? '文件整理（移动）' : '文件整理（复制）',
      items,
      async i => {
        if (mode === 'move') {
          await moveFile(i.from, i.to)
          ops.push({ kind: 'move', from: i.from, to: i.to })
        } else {
          await copyFile(i.from, i.to)
          ops.push({ kind: 'copy', from: i.from, to: i.to })
        }
        return path.basename(i.to)
      }
    )
    const record = await saveUndo('文件整理', ops)
    return toResult(outcome, record.id)
  },

  /* ---------------- 规则清理 ---------------- */
  'clean:preview': (dir: string, opts: CleanOptions, recursive: boolean) =>
    findCleanTargets(dir, opts, recursive),

  'clean:apply': async (files: string[], dirs: string[]): Promise<TaskResult> => {
    const ops: Op[] = []
    const outcome = await runTask('规则清理', files, async f => {
      await trash(f)
      ops.push({ kind: 'trash', from: f })
      return path.basename(f)
    })
    // 空目录单独处理：删除可能失败（权限），失败不影响整体
    for (const d of dirs) {
      try {
        await fsp.rmdir(d)
        ops.push({ kind: 'trash', from: d })
      } catch {
        log(`空目录删除失败：${d}`, 'warn')
      }
    }
    const record = await saveUndo('规则清理', ops, false)
    return toResult(outcome, record.id)
  },

  /* ---------------- 撤销 ---------------- */
  'undo:list': (): Promise<UndoRecord[]> => listUndo(),

  'undo:revert': async (id: string): Promise<TaskResult> => {
    const records = await listUndo()
    const record = records.find(r => r.id === id)
    if (!record) return { ok: false, total: 0, succeeded: 0, failed: 0, message: '记录不存在' }
    if (!record.reversible) {
      return {
        ok: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        message: '该操作包含不可逆步骤（回收站/覆盖），无法自动回滚'
      }
    }
    // 逆序回滚
    const reversed = [...record.ops].reverse()
    const outcome = await runTask('撤销操作', reversed, async op => {
      if (op.kind === 'rename' || op.kind === 'move') {
        if (op.to && (await exists(op.to))) {
          const back = (await exists(op.from)) ? await uniquePath(op.from) : op.from
          await moveFile(op.to, back)
        }
        return path.basename(op.from)
      }
      if (op.kind === 'copy') {
        if (op.to && (await exists(op.to))) await fsp.rm(op.to, { force: true })
        return path.basename(op.to ?? '')
      }
      if (op.kind === 'mkdir') {
        if (op.to && (await exists(op.to))) await fsp.rmdir(op.to)
        return op.to ?? ''
      }
      throw new Error('该步骤不可回滚')
    })
    if (outcome.failed === 0) await deleteUndo(id)
    return toResult(outcome)
  },

  'undo:remove': async (id: string) => {
    await deleteUndo(id)
    return true
  },

  /* ---------------- 设置 ---------------- */
  'settings:get': (): Promise<PersistedSettings> => loadSettings(),
  'settings:set': (patch: Partial<PersistedSettings>) => saveSettings(patch),
  'settings:recent': async () => (await loadSettings()).lastDirs,

  /* ---------------- 任务控制 ---------------- */
  'task:cancel': (id: string) => cancelTask(id)
}

type RunOutcome = {
  ok: boolean
  total: number
  succeeded: number
  failed: number
  errors: { path: string; reason: string }[]
}

function toResult(o: RunOutcome, undoId?: string): TaskResult {
  return {
    ok: o.ok,
    total: o.total,
    succeeded: o.succeeded,
    failed: o.failed,
    message: o.failed > 0 ? `完成 ${o.succeeded}，失败 ${o.failed}` : `完成 ${o.succeeded} 项`,
    errors: o.errors.slice(0, 50),
    undoId
  } as TaskResult & { undoId?: string }
}

export function registerIpc(): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, ...args) => handler(...(args as never[])))
  }
}
