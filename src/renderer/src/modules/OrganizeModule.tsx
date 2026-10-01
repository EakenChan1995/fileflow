import { useMemo, useState } from 'react'
import { FileEntry, OrganizeOptions } from '../../../shared/types'
import { Badge, Card, Checkbox, Empty, Field, Note, PathPicker, Select } from '../components/ui'
import { useTask } from '../lib/taskbus'
import { formatBytes } from '../lib/format'

const DEFAULT_OPTS: OrganizeOptions = {
  targetDir: '',
  by: 'ext',
  dateFormat: 'YYYY-MM',
  mode: 'move',
  extMap: {},
  onConflict: 'rename'
}

/** 每行 `jpg=图片`，用于覆盖内置分类 */
function parseMap(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const [k, v] = line.split(/[=＝]/)
    if (!k?.trim() || !v?.trim()) continue
    out[k.trim().toLowerCase().replace(/^\./, '')] = v.trim()
  }
  return out
}

export function OrganizeModule() {
  const { busy, run, guard } = useTask()
  const [dir, setDir] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [opts, setOpts] = useState<OrganizeOptions>(DEFAULT_OPTS)
  const [mapText, setMapText] = useState('')
  const [plan, setPlan] = useState<{ from: string; to: string; group: string }[] | null>(null)

  const scan = () =>
    run('扫描文件', async () => {
      if (!dir) return
      const list = await window.api.fs.scan(dir, { recursive })
      setFiles(list)
      setPlan(null)
    })

  const preview = () =>
    run('生成归档方案', async () => {
      const merged: OrganizeOptions = { ...opts, extMap: parseMap(mapText) }
      const p = await window.api.organize.preview(files, merged)
      setPlan(p)
    })

  const apply = async () => {
    const detail =
      opts.mode === 'move'
        ? '文件会被移动到子目录，可在「操作历史」中回滚。'
        : '文件会被复制一份，原文件保留。'
    if (!(await guard(`${opts.mode === 'move' ? '移动' : '复制'} ${plan?.length ?? 0} 个文件`, detail)))
      return
    return run('执行归档', async () => {
      if (!plan) return
      const res = await window.api.organize.apply(plan, opts.mode)
      setPlan(null)
      await scan()
      return res
    })
  }

  const groupStats = useMemo(() => {
    const m = new Map<string, number>()
    plan?.forEach(p => m.set(p.group, (m.get(p.group) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [plan])

  return (
    <>
      <Card title="来源目录">
        <div className="field">
          <label>目录</label>
          <PathPicker value={dir} onChange={setDir} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Checkbox checked={recursive} onChange={setRecursive} label="包含子目录" />
          <div className="spacer" />
          <button className="btn primary" disabled={busy || !dir} onClick={scan}>
            扫描
          </button>
        </div>
        {files.length > 0 && (
          <div className="stat-row" style={{ marginTop: 12, borderRadius: 6 }}>
            <span>
              文件 <b>{files.length}</b> 个
            </span>
            <span>
              总体积 <b>{formatBytes(files.reduce((s, f) => s + f.size, 0))}</b>
            </span>
          </div>
        )}
      </Card>

      <Card title="归档规则">
        <div className="grid">
          <Field label="归类维度">
            <Select
              value={opts.by}
              onChange={v => setOpts({ ...opts, by: v })}
              options={[
                { value: 'ext', label: '按文件类型' },
                { value: 'date', label: '按修改日期' },
                { value: 'size', label: '按体积区间' }
              ]}
            />
          </Field>
          {opts.by === 'date' && (
            <Field label="日期分组格式">
              <Select
                value={opts.dateFormat}
                onChange={v => setOpts({ ...opts, dateFormat: v })}
                options={[
                  { value: 'YYYY', label: '年（2026）' },
                  { value: 'YYYY-MM', label: '年月（2026-10）' },
                  { value: 'YYYY-MM-DD', label: '年月日（2026-10-01）' }
                ]}
              />
            </Field>
          )}
          <Field label="处理方式">
            <Select
              value={opts.mode}
              onChange={v => setOpts({ ...opts, mode: v })}
              options={[
                { value: 'move', label: '移动（可回滚）' },
                { value: 'copy', label: '复制（保留原件）' }
              ]}
            />
          </Field>
          <Field label="目标根目录（留空则原地建立子目录）">
            <PathPicker value={opts.targetDir} onChange={v => setOpts({ ...opts, targetDir: v })} />
          </Field>
          <Field label="同名冲突">
            <Select
              value={opts.onConflict}
              onChange={v => setOpts({ ...opts, onConflict: v })}
              options={[
                { value: 'rename', label: '自动重命名' },
                { value: 'skip', label: '跳过' },
                { value: 'overwrite', label: '覆盖' }
              ]}
            />
          </Field>
        </div>
        {opts.by === 'ext' && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>自定义类型目录名（每行一条，例如 jpg=图片；留空使用内置分类）</label>
            <textarea
              rows={4}
              className="mono"
              value={mapText}
              placeholder={'jpg=图片\npdf=文档\nmp4=视频'}
              onChange={e => setMapText(e.target.value)}
            />
          </div>
        )}
        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !files.length} onClick={preview}>
            生成方案
          </button>
        </div>
      </Card>

      <Card
        title="归档方案"
        hint={plan ? `${plan.length} 个文件将被${opts.mode === 'move' ? '移动' : '复制'}` : '先生成方案'}
        extra={
          plan && (
            <button className="btn primary" disabled={busy || !plan.length} onClick={apply}>
              执行归档（{plan.length}）
            </button>
          )
        }
      >
        {!plan && <Empty>尚未生成方案</Empty>}
        {plan && plan.length === 0 && <Empty>所有文件都已在正确的位置</Empty>}
        {plan && plan.length > 0 && (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              {groupStats.map(([g, n]) => (
                <span key={g} className="chip on">
                  {g} · {n}
                </span>
              ))}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>原路径</th>
                    <th style={{ width: 24 }} />
                    <th>新路径</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((p, i) => (
                    <tr key={p.from}>
                      <td className="muted">{i + 1}</td>
                      <td className="path">{p.from}</td>
                      <td className="muted">→</td>
                      <td className="path">
                        {p.to} <Badge kind="info">{p.group}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {opts.mode === 'copy' && (
              <div style={{ marginTop: 12 }}>
                <Note>复制模式会保留原文件，目标目录体积将增加。</Note>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  )
}
