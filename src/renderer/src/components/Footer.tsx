import { useEffect, useRef, useState } from 'react'
import { useTask } from '../lib/taskbus'

export function Footer() {
  const { logs, progress, clearLogs } = useTask()
  const [open, setOpen] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)

  // 新日志追加时自动滚到底部
  useEffect(() => {
    const el = boxRef.current
    if (el && open) el.scrollTop = el.scrollHeight
  }, [logs, open])

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="footer">
      {progress && (
        <div className="progress">
          <span className="badge info">{progress.name}</span>
          <div className="bar">
            <i style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <span>
            {progress.current}/{progress.total}
          </span>
          {progress.message && <span className="muted">{progress.message}</span>}
        </div>
      )}
      <div className="footer-toggle">
        <span>日志 {logs.length} 条</span>
        <span className="row">
          <button className="btn sm ghost" onClick={() => setOpen(!open)}>
            {open ? '收起' : '展开'}
          </button>
          <button className="btn sm ghost" onClick={clearLogs}>
            清空
          </button>
        </span>
      </div>
      {open && (
        <div className="log-panel" ref={boxRef}>
          {logs.length === 0 ? (
            <div className="log-line">
              <span className="m">暂无日志</span>
            </div>
          ) : (
            logs.map(l => (
              <div key={l.id} className={`log-line ${l.level}`}>
                <span className="t">{l.time}</span>
                <span className="m">{l.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
