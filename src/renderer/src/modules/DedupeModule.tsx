import { useState } from 'react'
import { DedupeOptions, DuplicateGroup } from '../../../shared/types'
import { Badge, Card, Checkbox, Empty, Field, Note, PathPicker, Select } from '../components/ui'
import { useTask } from '../lib/taskbus'
import { formatBytes, formatDateTime } from '../lib/format'

const DEFAULT_OPTS: DedupeOptions = { recursive: true, minSize: 1024, thorough: false }

export function DedupeModule() {
  const { busy, run, guard } = useTask()
  const [dirs, setDirs] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [opts, setOpts] = useState<DedupeOptions>(DEFAULT_OPTS)
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null)
  const [keep, setKeep] = useState<'oldest' | 'newest' | 'shortest-path'>('oldest')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'trash' | 'move'>('trash')
  const [targetDir, setTargetDir] = useState('')

  const addDir = (d: string) => {
    if (!d || dirs.includes(d)) return
    setDirs([...dirs, d])
    setDraft('')
  }

  const scan = () =>
    run('扫描重复文件', async () => {
      if (!dirs.length) return
      const g = await window.api.dedupe.scan(dirs, opts)
      setGroups(g)
      const picked = await window.api.dedupe.pick(g, keep)
      setSelected(new Set(picked))
    })

  const rePick = async (k: typeof keep) => {
    setKeep(k)
    if (!groups) return
    const picked = await window.api.dedupe.pick(groups, k)
    setSelected(new Set(picked))
  }

  const apply = async () => {
    const detail =
      mode === 'trash'
        ? '文件会被移入系统回收站，可从回收站手动恢复。'
        : '文件会被移动到指定目录，可在「操作历史」中回滚。'
    if (!(await guard(`处理 ${selected.size} 个重复文件`, detail))) return
    return run('处理重复文件', async () => {
      const files = [...selected]
      const res = await window.api.dedupe.remove(files, mode, targetDir)
      setGroups(null)
      setSelected(new Set())
      return res
    })
  }

  const waste = groups
    ? [...selected].reduce((sum, p) => {
        const g = groups.find(x => x.files.some(f => f.path === p))
        return g ? sum + g.size : sum
      }, 0)
    : 0

  return (
    <>
      <Card title="扫描范围" hint="可添加多个目录一起比对">
        {dirs.length > 0 && (
          <div className="row" style={{ marginBottom: 10 }}>
            {dirs.map(d => (
              <span key={d} className="chip on" title={d} onClick={() => setDirs(dirs.filter(x => x !== d))}>
                {d.length > 28 ? `…${d.slice(-27)}` : d} ×
              </span>
            ))}
          </div>
        )}
        <div className="field">
          <label>添加目录</label>
          <PathPicker value={draft} onChange={addDir} />
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <Field label="最小体积（KB，过滤小文件可提速）">
            <input
              type="number"
              min={0}
              value={Math.round(opts.minSize / 1024)}
              onChange={e => setOpts({ ...opts, minSize: Math.max(0, Number(e.target.value)) * 1024 })}
            />
          </Field>
          <Field label="哈希精度">
            <Select
              value={opts.thorough ? 'full' : 'fast'}
              onChange={v => setOpts({ ...opts, thorough: v === 'full' })}
              options={[
                { value: 'fast', label: '快速（首尾取样，推荐）' },
                { value: 'full', label: '完整 SHA-256（较慢）' }
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
          <div className="spacer" />
          <button className="btn primary" disabled={busy || !dirs.length} onClick={scan}>
            开始查重
          </button>
        </div>
      </Card>

      {groups && (
        <Card
          title="重复分组"
          hint={
            groups.length
              ? `${groups.length} 组重复，已选 ${selected.size} 个文件，可回收约 ${formatBytes(waste)}`
              : '未发现重复文件'
          }
          extra={
            <Select
              value={keep}
              onChange={v => rePick(v)}
              options={[
                { value: 'oldest', label: '保留最旧' },
                { value: 'newest', label: '保留最新' },
                { value: 'shortest-path', label: '保留路径最短' }
              ]}
            />
          }
        >
          {groups.length === 0 && <Empty>没有发现重复文件</Empty>}
          {groups.map(g => (
            <div className="dup-group" key={g.hash}>
              <div className="dup-head">
                <Badge kind="warn">{g.files.length} 个重复</Badge>
                <span>{formatBytes(g.size)} / 个</span>
                <span className="hash">{g.hash.slice(0, 16)}</span>
                <div className="spacer" />
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    const all = g.files.map(f => f.path)
                    setSelected(prev => {
                      const next = new Set(prev)
                      all.forEach(p => next.delete(p))
                      return next
                    })
                  }}
                >
                  全部保留
                </button>
              </div>
              <table className="data">
                <tbody>
                  {g.files.map(f => (
                    <tr key={f.path}>
                      <td style={{ width: 34 }}>
                        <Checkbox
                          checked={selected.has(f.path)}
                          onChange={v =>
                            setSelected(prev => {
                              const next = new Set(prev)
                              if (v) next.add(f.path)
                              else next.delete(f.path)
                              return next
                            })
                          }
                          label=""
                        />
                      </td>
                      <td className={selected.has(f.path) ? 'path strike' : 'path'}>{f.path}</td>
                      <td style={{ width: 140 }} className="muted">
                        {formatDateTime(f.mtime)}
                      </td>
                      <td style={{ width: 80 }} className="num">
                        {formatBytes(f.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Card>
      )}

      {groups && groups.length > 0 && (
        <Card
          title="处理方式"
          extra={
            <button className="btn primary" disabled={busy || !selected.size} onClick={apply}>
              处理选中（{selected.size}）
            </button>
          }
        >
          <div className="grid">
            <Field label="动作">
              <Select
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'trash', label: '移入回收站' },
                  { value: 'move', label: '移动到指定目录' }
                ]}
              />
            </Field>
            {mode === 'move' && (
              <Field label="目标目录">
                <PathPicker value={targetDir} onChange={setTargetDir} />
              </Field>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <Note kind="warn">
              勾选的文件会被处理，每组至少要保留一个。「移入回收站」可手动恢复；「移动到指定目录」可通过操作历史一键回滚。
            </Note>
          </div>
        </Card>
      )}
    </>
  )
}
