import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { TaskProgress } from '../../../shared/types'
import { formatTime } from './format'

export interface LogLine {
  id: number
  time: string
  message: string
  level: NonNullable<TaskProgress['level']>
}

interface TaskBus {
  logs: LogLine[]
  progress: TaskProgress | null
  busy: boolean
  /** 包裹一次批处理调用：自动维护 busy 状态并在结束时写日志 */
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>
  /** 写操作前的二次确认；设置中关闭时直接放行 */
  guard: (label: string, detail?: string) => Promise<boolean>
  clearLogs: () => void
}

const Ctx = createContext<TaskBus | null>(null)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [progress, setProgress] = useState<TaskProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const confirmRef = useRef(true)
  const seq = useRef(0)

  useEffect(() => {
    void window.api.settings.get().then(s => {
      confirmRef.current = s.confirmBeforeApply
    })
  }, [])

  const push = useCallback((message: string, level: LogLine['level'] = 'info') => {
    setLogs(prev => [
      ...prev.slice(-299),
      { id: ++seq.current, time: formatTime(Date.now()), message, level }
    ])
  }, [])

  useEffect(() => {
    return window.api.task.onProgress(p => {
      if (p.phase === 'log') {
        push(p.message ?? '', p.level ?? 'info')
        return
      }
      if (p.phase === 'done') {
        setProgress({ ...p, current: p.total, phase: 'done' })
        push(p.message ?? '任务结束', p.level ?? 'success')
        window.setTimeout(() => setProgress(null), 1200)
        return
      }
      if (p.phase === 'error') {
        setProgress(null)
        push(p.message ?? '任务失败', 'error')
        return
      }
      setProgress(p)
    })
  }, [push])

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true)
      push(`${label}…`)
      try {
        const res = await fn()
        return res
      } catch (err) {
        push(`${label}失败：${err instanceof Error ? err.message : String(err)}`, 'error')
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [push]
  )

  const guard = useCallback(async (label: string, detail?: string) => {
    if (!confirmRef.current) return true
    return window.api.dialog.confirm({
      title: '确认执行',
      message: `确定要${label}吗？`,
      detail: detail ?? '此操作会写入磁盘，建议先确认预览结果。'
    })
  }, [])

  const value = useMemo<TaskBus>(
    () => ({ logs, progress, busy, run, guard, clearLogs: () => setLogs([]) }),
    [logs, progress, busy, run, guard]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTask(): TaskBus {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTask 必须在 TaskProvider 内使用')
  return ctx
}
