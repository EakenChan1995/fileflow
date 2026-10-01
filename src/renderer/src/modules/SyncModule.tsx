import { useMemo, useState } from 'react'
import { SyncAction, SyncOptions } from '../../../shared/types'
import { Badge, Card, Checkbox, Empty, Field, Note, PathPicker, Select } from '../components/ui'
import { useTask } from '../lib/taskbus'
import { formatBytes } from '../lib/format'

const DEFAULT_OPTS: SyncOptions = { recursive: true, mirror: false, compareBy: 'size' }

const KIND_META: Record<
  SyncAction['kind'],
  { label: string; kind: 'ok' | 'warn' | 'err' | 'info' | 'default' }
> = {
  create: { label: '新增', kind: 'ok' },
  update: { label: '更新', kind: 'info' },
  delete: { label: '删除', kind: 'err' },
  skip: { label: '跳过', kind: 'default' }
}

export function SyncModule() {
  const { busy, run, guard } = useTask()
  const [src, setSrc] = useState('')
  const [dst, setDst] = useState('')
  const [opts, setOpts] = useState<SyncOptions>(DEFAULT_OPTS)
  const [plan, setPlan] = useState<SyncAction[] | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const preview = () =>
    run('生成同步计划', async () => {
      if (!src || !dst) return
      const p = await window.api.sync.preview(src, dst, opts)
      setPlan(p)
      setExcluded(new Set())
    })

  const apply = async () => {
    const detail = opts.mirror
      ? `镜像模式会删除目标端 ${counts.delete} 个文件，请再次确认计划列表。`
      : '同步只写入目标目录，不会修改源目录。'
    if (!(await guard(`执行 ${todoCount} 项同步`, detail))) return
    return run('执行同步', async () => {
      if (!plan) return
      const todo = plan.filter(a => a.kind !== 'skip' && !excluded.has(a.rel))
      const res = await window.api.sync.apply(todo)
      setPlan(null)
      return res
    })
  }

  const counts = useMemo(() => {
    const c = { create: 0, update: 0, delete: 0, skip: 0 }
    plan?.forEach(a => c[a.kind]++)
    return c
  }, [plan])

  const todoCount = plan ? plan.filter(a => a.kind !== 'skip' && !excluded.has(a.rel)).length : 0
  const todoBytes = plan
    ? plan
        .filter(a => (a.kind === 'create' || a.kind === 'update') && !excluded.has(a.rel))
        .reduce((s, a) => s + a.size, 0)
    : 0

  return (
    <>
      <Card title="同步方向" hint="源目录 → 目标目录（单向）">
        <div className="grid">
          <Field label="源目录">
            <PathPicker value={src} onChange={setSrc} />
          </Field>
          <Field label="目标目录">
            <PathPicker value={dst} onChange={setDst} />
          </Field>
          <Field label="比较依据">
            <Select
              value={opts.compareBy}
              onChange={v => setOpts({ ...opts, compareBy: v })}
              options={[
                { value: 'size', label: '文件大小（最快）' },
                { value: 'mtime', label: '大小 + 修改时间' },
                { value: 'hash', label: '内容哈希（最准最慢）' }
              ]}
            />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Checkbox
            checked={opts.recursive}
            onChange={v => setOpts({ ...opts, recursive: v })}
            label="包含子目录"
          />
          <Checkbox
            checked={opts.mirror}
            onChange={v => setOpts({ ...opts, mirror: v })}
            label="镜像模式（删除目标端多余文件）"
          />
          <div className="spacer" />
          <button className="btn primary" disabled={busy || !src || !dst} onClick={preview}>
            生成计划
          </button>
        </div>
        {opts.mirror && (
          <div style={{ marginTop: 12 }}>
            <Note kind="danger">镜像模式会删除目标目录中源端没有的文件，请先确认计划列表。</Note>
          </div>
        )}
      </Card>

      <Card
        title="同步计划"
        hint={
          plan
            ? `新增 ${counts.create} · 更新 ${counts.update} · 删除 ${counts.delete} · 跳过 ${counts.skip}`
            : '先生成计划'
        }
        extra={
          plan && (
            <button className="btn primary" disabled={busy || todoCount === 0} onClick={apply}>
              执行（{todoCount}）
            </button>
          )
        }
      >
        {!plan && <Empty>尚未生成计划</Empty>}
        {plan && plan.length === 0 && <Empty>两个目录内容一致，无需同步</Empty>}
        {plan && plan.length > 0 && (
          <>
            <div className="table-wrap" style={{ maxHeight: 400 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th style={{ width: 70 }}>动作</th>
                    <th>相对路径</th>
                    <th style={{ width: 90 }}>体积</th>
                    <th style={{ width: 220 }}>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((a, i) => (
                    <tr key={`${a.kind}-${a.rel}-${i}`}>
                      <td>
                        {a.kind !== 'skip' && (
                          <Checkbox
                            checked={!excluded.has(a.rel)}
                            onChange={v =>
                              setExcluded(prev => {
                                const next = new Set(prev)
                                if (v) next.delete(a.rel)
                                else next.add(a.rel)
                                return next
                              })
                            }
                            label=""
                          />
                        )}
                      </td>
                      <td>
                        <Badge kind={KIND_META[a.kind].kind}>{KIND_META[a.kind].label}</Badge>
                      </td>
                      <td className={excluded.has(a.rel) ? 'path strike' : 'path'}>{a.rel}</td>
                      <td className="num">{formatBytes(a.size)}</td>
                      <td className="muted">{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="stat-row" style={{ marginTop: 12, borderRadius: 6 }}>
              <span>
                待执行 <b>{todoCount}</b> 项
              </span>
              <span>
                预计传输 <b>{formatBytes(todoBytes)}</b>
              </span>
            </div>
          </>
        )}
      </Card>
    </>
  )
}
