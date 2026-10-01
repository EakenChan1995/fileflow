import { useCallback, useEffect, useState } from 'react'
import { UndoRecord } from '../../../shared/types'
import { Badge, Card, Empty } from '../components/ui'
import { useTask } from '../lib/taskbus'
import { formatDateTime } from '../lib/format'

export function HistoryModule() {
  const { busy, run } = useTask()
  const [records, setRecords] = useState<UndoRecord[]>([])

  const load = useCallback(async () => {
    setRecords(await window.api.undo.list())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const revert = (id: string) =>
    run('回滚操作', async () => {
      const res = await window.api.undo.revert(id)
      await load()
      return res
    })

  const remove = (id: string) =>
    run('删除记录', async () => {
      await window.api.undo.remove(id)
      await load()
    })

  return (
    <Card
      title="操作历史"
      hint={`共 ${records.length} 条，最多保留最近 30 条`}
      extra={
        <button className="btn sm" disabled={busy} onClick={() => void load()}>
          刷新
        </button>
      }
    >
      {records.length === 0 && <Empty>还没有可回滚的操作</Empty>}
      {records.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 480 }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 170 }}>时间</th>
                <th style={{ width: 140 }}>操作</th>
                <th style={{ width: 80 }}>步骤</th>
                <th style={{ width: 110 }}>可回滚</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td className="muted">{formatDateTime(r.createdAt)}</td>
                  <td>{r.name}</td>
                  <td className="num">{r.ops.length}</td>
                  <td>
                    {r.reversible ? <Badge kind="ok">可回滚</Badge> : <Badge kind="warn">不可自动回滚</Badge>}
                  </td>
                  <td className="row" style={{ gap: 6 }}>
                    <button className="btn sm" disabled={busy || !r.reversible} onClick={() => revert(r.id)}>
                      回滚
                    </button>
                    <button className="btn sm ghost" disabled={busy} onClick={() => remove(r.id)}>
                      删除记录
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <div className="note">
          移入回收站、覆盖原文件这类操作无法自动回滚（文件仍可从系统回收站手动恢复）。移动、重命名、复制类操作均可一键还原。
        </div>
      </div>
    </Card>
  )
}
