import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { TaskProgress } from '../../shared/types'

type Sender = (payload: TaskProgress) => void

let sender: Sender = () => undefined

/** 由窗口创建处注入，主进程所有任务通过它广播进度 */
export function bindProgressSink(fn: Sender): void {
  sender = fn
}

export function emit(p: Omit<TaskProgress, 'taskId'> & { taskId?: string }): void {
  sender({ taskId: p.taskId ?? 'global', ...p } as TaskProgress)
}

export function log(message: string, level: TaskProgress['level'] = 'info'): void {
  emit({ taskId: 'global', name: 'log', phase: 'log', current: 0, total: 0, message, level })
}

export interface TaskHandle {
  id: string
  cancelled: boolean
}

const running = new Map<string, TaskHandle>()

export interface RunTaskOptions {
  /** 进度广播节流间隔（毫秒） */
  throttleMs?: number
  /** 并发数，1 表示严格串行 */
  concurrency?: number
}

export interface RunTaskOutcome {
  ok: boolean
  total: number
  succeeded: number
  failed: number
  cancelled: boolean
  errors: { path: string; reason: string }[]
}

/**
 * 统一的批处理执行器：
 * - 进度广播（带节流，避免高频 IPC 拖慢渲染进程）
 * - 支持取消
 * - 单条失败不影响整体，错误统一收集
 */
export async function runTask<T>(
  name: string,
  items: T[],
  worker: (item: T, index: number, handle: TaskHandle) => Promise<string | void>,
  opts: RunTaskOptions = {}
): Promise<RunTaskOutcome> {
  const throttleMs = opts.throttleMs ?? 60
  const concurrency = Math.max(1, opts.concurrency ?? 1)
  const handle: TaskHandle = { id: randomUUID(), cancelled: false }
  running.set(handle.id, handle)

  const total = items.length
  const errors: { path: string; reason: string }[] = []
  let succeeded = 0
  let processed = 0
  let last = 0

  emit({ taskId: handle.id, name, phase: 'start', current: 0, total, message: `开始执行「${name}」` })

  const pathOf = (item: T, i: number): string =>
    String(
      (item as { path?: string; from?: string })?.path ?? (item as { from?: string })?.from ?? `#${i + 1}`
    )

  const step = async (item: T, i: number): Promise<void> => {
    if (handle.cancelled) return
    try {
      const label = await worker(item, i, handle)
      succeeded++
      processed++
      const now = Date.now()
      if (now - last > throttleMs || processed === total) {
        last = now
        emit({
          taskId: handle.id,
          name,
          phase: 'progress',
          current: processed,
          total,
          message: label ? `${processed}/${total} ${label}` : `${processed}/${total}`
        })
      }
    } catch (err) {
      processed++
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ path: pathOf(item, i), reason })
      emit({
        taskId: handle.id,
        name,
        phase: 'log',
        current: processed,
        total,
        message: `失败：${pathOf(item, i)} — ${reason}`,
        level: 'error'
      })
    }
  }

  try {
    if (concurrency <= 1) {
      for (let i = 0; i < total; i++) await step(items[i], i)
    } else {
      await mapPool(items, concurrency, step)
    }
  } finally {
    running.delete(handle.id)
  }

  const failed = errors.length
  emit({
    taskId: handle.id,
    name,
    phase: 'done',
    current: succeeded,
    total,
    message: handle.cancelled
      ? `已取消，完成 ${succeeded}/${total}`
      : `完成 ${succeeded}/${total}，失败 ${failed}`,
    level: handle.cancelled ? 'warn' : failed ? 'warn' : 'success'
  })

  return {
    ok: failed === 0 && !handle.cancelled,
    total,
    succeeded,
    failed,
    cancelled: handle.cancelled,
    errors
  }
}

export function cancelTask(id: string): boolean {
  const h = running.get(id)
  if (!h) return false
  h.cancelled = true
  return true
}

export function listRunningTasks(): string[] {
  return [...running.keys()]
}

/** 极简并发池：控制同时打开的文件句柄数量 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

/** 便于主进程主动推送与窗口交互 */
export function getWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}
