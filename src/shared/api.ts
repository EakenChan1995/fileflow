import {
  AppSettings,
  CleanOptions,
  DedupeOptions,
  DuplicateGroup,
  FileEntry,
  ImageOptions,
  OrganizeOptions,
  RenamePreviewItem,
  RenameRule,
  ScanOptions,
  SyncAction,
  SyncOptions,
  TaskProgress,
  TaskResult,
  UndoRecord
} from './types'

/** preload 暴露给渲染进程的完整能力面 */
export interface Api {
  app: {
    version(): Promise<string>
    openInFolder(p: string): Promise<void>
    openPath(p: string): Promise<string>
  }
  dialog: {
    pickDirectory(opts?: { title?: string; defaultPath?: string }): Promise<string | null>
    pickFiles(opts?: {
      title?: string
      filters?: { name: string; extensions: string[] }[]
    }): Promise<string[]>
    confirm(opts: { title: string; message: string; detail?: string }): Promise<boolean>
  }
  fs: {
    scan(dir: string, opts?: ScanOptions): Promise<FileEntry[]>
    stat(paths: string[]): Promise<FileEntry[]>
  }
  rename: {
    preview(
      files: string[],
      rules: RenameRule[],
      mtimes?: Record<string, number>
    ): Promise<RenamePreviewItem[]>
    apply(items: RenamePreviewItem[]): Promise<TaskResult>
  }
  image: {
    preview(files: FileEntry[], opts: ImageOptions, rootDir: string): Promise<{ from: string; to: string }[]>
    apply(jobs: { from: string; to: string }[], opts: ImageOptions): Promise<TaskResult>
  }
  dedupe: {
    scan(dirs: string[], opts: DedupeOptions): Promise<DuplicateGroup[]>
    pick(groups: DuplicateGroup[], keep: 'oldest' | 'newest' | 'shortest-path'): Promise<string[]>
    remove(files: string[], mode: 'trash' | 'move', targetDir?: string): Promise<TaskResult>
  }
  sync: {
    preview(src: string, dst: string, opts: SyncOptions): Promise<SyncAction[]>
    apply(actions: SyncAction[]): Promise<TaskResult>
  }
  organize: {
    preview(files: FileEntry[], opts: OrganizeOptions): Promise<{ from: string; to: string; group: string }[]>
    apply(items: { from: string; to: string }[], mode: 'move' | 'copy'): Promise<TaskResult>
  }
  clean: {
    preview(
      dir: string,
      opts: CleanOptions,
      recursive: boolean
    ): Promise<{ files: FileEntry[]; dirs: string[] }>
    apply(files: string[], dirs: string[]): Promise<TaskResult>
  }
  undo: {
    list(): Promise<UndoRecord[]>
    revert(id: string): Promise<TaskResult>
    remove(id: string): Promise<boolean>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    recent(): Promise<string[]>
  }
  task: {
    cancel(id: string): Promise<boolean>
    onProgress(cb: (p: TaskProgress) => void): () => void
  }
}

declare global {
  interface Window {
    api: Api
  }
}
