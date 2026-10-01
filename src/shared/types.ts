/**
 * 主进程 / 渲染进程共享的类型定义。
 * 这里只放纯类型，不允许引入任何运行时依赖。
 */

/** 一条被扫描到的文件记录 */
export interface FileEntry {
  path: string
  name: string
  dir: string
  /** 小写、带点，例如 `.png`；目录为空字符串 */
  ext: string
  size: number
  mtime: number
  isDir: boolean
}

/** 目录扫描参数 */
export interface ScanOptions {
  recursive?: boolean
  maxDepth?: number
  /** 仅保留这些后缀（小写带点），为空表示不限制 */
  includeExts?: string[]
  /** 排除这些后缀 */
  excludeExts?: string[]
  minSize?: number
  maxSize?: number
  includeDirs?: boolean
}

/* ------------------------------------------------------------------ */
/* 批量重命名                                                          */
/* ------------------------------------------------------------------ */

export type RenameRule =
  /** 大小写转换 */
  | { type: 'case'; value: 'upper' | 'lower' | 'title' | 'sentence' }
  /** 查找替换，支持正则 */
  | { type: 'replace'; find: string; to: string; useRegex: boolean; caseSensitive: boolean }
  /** 前后缀插入 */
  | { type: 'insert'; position: 'prefix' | 'suffix'; text: string }
  /** 序号（按当前排序依次递增） */
  | {
      type: 'number'
      start: number
      step: number
      digits: number
      position: 'prefix' | 'suffix'
      separator: string
    }
  /** 截断 / 删除 N 个字符 */
  | { type: 'trim'; from: 'start' | 'end'; count: number }
  /** 扩展名处理 */
  | { type: 'ext'; mode: 'keep' | 'lower' | 'upper' | 'set'; value?: string }
  /** 插入时间戳 */
  | {
      type: 'date'
      position: 'prefix' | 'suffix'
      format: string
      source: 'now' | 'mtime'
      separator: string
    }

export interface RenamePreviewItem {
  from: string
  to: string
  fromName: string
  toName: string
  changed: boolean
  /** 冲突：目标已存在 / 同批次内重名 */
  conflict?: string
}

/* ------------------------------------------------------------------ */
/* 图片批处理                                                          */
/* ------------------------------------------------------------------ */

export type ImageFormat = 'keep' | 'jpeg' | 'png' | 'webp' | 'avif'

export interface ImageResizeOptions {
  enabled: boolean
  /** percent：按比例；longest：限制最长边；exact：固定宽高 */
  mode: 'percent' | 'longest' | 'exact'
  percent: number
  longest: number
  width: number
  height: number
  /** 固定宽高时的适配方式 */
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
  /** 是否允许放大 */
  enlarge: boolean
}

export interface ImageOptions {
  format: ImageFormat
  quality: number
  resize: ImageResizeOptions
  /** 输出目录；custom 模式下必填 */
  outputDir: string
  outputMode: 'overwrite' | 'sibling' | 'custom'
  /** sibling 模式下的文件名后缀，例如 `_min` */
  suffix: string
  /** custom 模式下是否保留源目录的相对结构 */
  keepStructure: boolean
}

/* ------------------------------------------------------------------ */
/* 重复文件                                                            */
/* ------------------------------------------------------------------ */

export interface DuplicateGroup {
  hash: string
  size: number
  files: FileEntry[]
}

export interface DedupeOptions {
  recursive: boolean
  /** 最小体积（字节），过滤掉小文件能显著提速 */
  minSize: number
  /** 完整哈希；关闭时只用「首尾各 64KB」快速哈希 */
  thorough: boolean
}

/* ------------------------------------------------------------------ */
/* 目录同步                                                            */
/* ------------------------------------------------------------------ */

export type SyncActionKind = 'create' | 'update' | 'delete' | 'skip'

export interface SyncAction {
  kind: SyncActionKind
  /** 源路径（delete 动作为空） */
  from: string
  /** 目标路径 */
  to: string
  /** 相对源根目录的路径，便于 UI 展示 */
  rel: string
  size: number
  reason: string
}

export interface SyncOptions {
  recursive: boolean
  /** 镜像模式：删除目标端多余文件 */
  mirror: boolean
  /** 比较策略 */
  compareBy: 'size' | 'mtime' | 'hash'
}

/* ------------------------------------------------------------------ */
/* 文件整理归档                                                        */
/* ------------------------------------------------------------------ */

export interface OrganizeOptions {
  targetDir: string
  /** 归类维度 */
  by: 'ext' | 'date' | 'size'
  /** date 维度下的分组格式 */
  dateFormat: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'
  /** 是移动还是复制 */
  mode: 'move' | 'copy'
  /** 目标目录名映射（ext 维度下，key 为不带点的后缀） */
  extMap: Record<string, string>
  /** 同名冲突处理 */
  onConflict: 'rename' | 'skip' | 'overwrite'
}

/* ------------------------------------------------------------------ */
/* 规则清理                                                            */
/* ------------------------------------------------------------------ */

export interface CleanOptions {
  emptyFiles: boolean
  emptyDirs: boolean
  largerThanMB: number
  olderThanDays: number
  /** 命中的后缀列表（小写带点） */
  exts: string[]
  /** 文件名匹配（支持 * 通配） */
  namePattern: string
}

/* ------------------------------------------------------------------ */
/* 任务与撤销                                                          */
/* ------------------------------------------------------------------ */

export type OpKind = 'rename' | 'copy' | 'move' | 'trash' | 'mkdir'

/** 单个原子操作，构成撤销栈的最小单位 */
export interface Op {
  kind: OpKind
  from: string
  to?: string
}

/** 一次可撤销的批处理记录 */
export interface UndoRecord {
  id: string
  name: string
  createdAt: number
  ops: Op[]
  /** 主进程重启后是否仍可回滚（路径可能已失效） */
  reversible: boolean
}

export interface TaskResult {
  ok: boolean
  total: number
  succeeded: number
  failed: number
  message?: string
  /** 失败明细（最多 50 条，避免 IPC 传输过大） */
  errors?: { path: string; reason: string }[]
  /** 本次操作对应的撤销记录 id */
  undoId?: string
}

/** 主进程 → 渲染进程的进度事件 */
export interface TaskProgress {
  taskId: string
  name: string
  phase: 'start' | 'progress' | 'done' | 'error' | 'log'
  current: number
  total: number
  message?: string
  level?: 'info' | 'warn' | 'error' | 'success'
}

export interface AppSettings {
  lastDirs: string[]
  theme: 'light' | 'dark'
  concurrency: number
  confirmBeforeApply: boolean
}
