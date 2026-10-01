import { useMemo, useState } from 'react'
import { FileEntry, RenamePreviewItem, RenameRule } from '../../../shared/types'
import { Badge, Card, Checkbox, Empty, Field, Note, PathPicker, Select, TextInput } from '../components/ui'
import { useTask } from '../lib/taskbus'
import { formatBytes, formatDateTime } from '../lib/format'

const RULE_LABELS: { value: RenameRule['type']; label: string }[] = [
  { value: 'replace', label: '查找替换' },
  { value: 'insert', label: '插入前后缀' },
  { value: 'number', label: '添加序号' },
  { value: 'case', label: '大小写转换' },
  { value: 'trim', label: '截断字符' },
  { value: 'date', label: '插入日期' },
  { value: 'ext', label: '扩展名处理' }
]

function defaultRuleOf(type: RenameRule['type']): RenameRule {
  switch (type) {
    case 'replace':
      return { type: 'replace', find: '', to: '', useRegex: false, caseSensitive: false }
    case 'insert':
      return { type: 'insert', position: 'prefix', text: '' }
    case 'number':
      return { type: 'number', start: 1, step: 1, digits: 3, position: 'prefix', separator: '_' }
    case 'case':
      return { type: 'case', value: 'lower' }
    case 'trim':
      return { type: 'trim', from: 'start', count: 1 }
    case 'date':
      return { type: 'date', position: 'prefix', format: 'YYYY-MM-DD', source: 'now', separator: '_' }
    case 'ext':
      return { type: 'ext', mode: 'lower', value: '' }
  }
}

function RuleEditor({
  rule,
  index,
  total,
  onChange,
  onRemove,
  onMove
}: {
  rule: RenameRule
  index: number
  total: number
  onChange: (r: RenameRule) => void
  onRemove: () => void
  onMove: (delta: number) => void
}) {
  return (
    <div className="rule">
      <span className="idx">{index + 1}</span>
      <Select value={rule.type} options={RULE_LABELS} onChange={v => onChange(defaultRuleOf(v))} />
      {rule.type === 'replace' && (
        <>
          <TextInput value={rule.find} onChange={v => onChange({ ...rule, find: v })} placeholder="查找" />
          <span className="muted">→</span>
          <TextInput value={rule.to} onChange={v => onChange({ ...rule, to: v })} placeholder="替换为" />
          <Checkbox checked={rule.useRegex} onChange={v => onChange({ ...rule, useRegex: v })} label="正则" />
          <Checkbox
            checked={rule.caseSensitive}
            onChange={v => onChange({ ...rule, caseSensitive: v })}
            label="区分大小写"
          />
        </>
      )}
      {rule.type === 'insert' && (
        <>
          <Select
            value={rule.position}
            options={[
              { value: 'prefix', label: '前缀' },
              { value: 'suffix', label: '后缀' }
            ]}
            onChange={v => onChange({ ...rule, position: v })}
          />
          <TextInput value={rule.text} onChange={v => onChange({ ...rule, text: v })} placeholder="文本" />
        </>
      )}
      {rule.type === 'number' && (
        <>
          <Select
            value={rule.position}
            options={[
              { value: 'prefix', label: '前缀' },
              { value: 'suffix', label: '后缀' }
            ]}
            onChange={v => onChange({ ...rule, position: v })}
          />
          <span className="muted">起始</span>
          <input
            type="number"
            style={{ width: 68 }}
            value={rule.start}
            onChange={e => onChange({ ...rule, start: Number(e.target.value) })}
          />
          <span className="muted">步长</span>
          <input
            type="number"
            style={{ width: 62 }}
            value={rule.step}
            onChange={e => onChange({ ...rule, step: Number(e.target.value) })}
          />
          <span className="muted">位数</span>
          <input
            type="number"
            style={{ width: 62 }}
            min={1}
            value={rule.digits}
            onChange={e => onChange({ ...rule, digits: Math.max(1, Number(e.target.value)) })}
          />
          <span className="muted">分隔</span>
          <TextInput
            value={rule.separator}
            onChange={v => onChange({ ...rule, separator: v })}
            placeholder="_"
          />
        </>
      )}
      {rule.type === 'case' && (
        <Select
          value={rule.value}
          options={[
            { value: 'lower', label: '全小写' },
            { value: 'upper', label: '全大写' },
            { value: 'title', label: '首字母大写' },
            { value: 'sentence', label: '句首大写' }
          ]}
          onChange={v => onChange({ ...rule, value: v })}
        />
      )}
      {rule.type === 'trim' && (
        <>
          <Select
            value={rule.from}
            options={[
              { value: 'start', label: '从开头删除' },
              { value: 'end', label: '从结尾删除' }
            ]}
            onChange={v => onChange({ ...rule, from: v })}
          />
          <input
            type="number"
            style={{ width: 68 }}
            min={1}
            value={rule.count}
            onChange={e => onChange({ ...rule, count: Math.max(1, Number(e.target.value)) })}
          />
          <span className="muted">个字符</span>
        </>
      )}
      {rule.type === 'date' && (
        <>
          <Select
            value={rule.position}
            options={[
              { value: 'prefix', label: '前缀' },
              { value: 'suffix', label: '后缀' }
            ]}
            onChange={v => onChange({ ...rule, position: v })}
          />
          <Select
            value={rule.source}
            options={[
              { value: 'now', label: '当前时间' },
              { value: 'mtime', label: '文件修改时间' }
            ]}
            onChange={v => onChange({ ...rule, source: v })}
          />
          <TextInput
            value={rule.format}
            onChange={v => onChange({ ...rule, format: v })}
            placeholder="YYYY-MM-DD"
          />
          <span className="muted">分隔</span>
          <TextInput
            value={rule.separator}
            onChange={v => onChange({ ...rule, separator: v })}
            placeholder="_"
          />
        </>
      )}
      {rule.type === 'ext' && (
        <>
          <Select
            value={rule.mode}
            options={[
              { value: 'keep', label: '保持不变' },
              { value: 'lower', label: '转小写' },
              { value: 'upper', label: '转大写' },
              { value: 'set', label: '强制改为' }
            ]}
            onChange={v => onChange({ ...rule, mode: v })}
          />
          {rule.mode === 'set' && (
            <TextInput
              value={rule.value ?? ''}
              onChange={v => onChange({ ...rule, value: v })}
              placeholder="jpg"
            />
          )}
        </>
      )}
      <div className="spacer" />
      <button className="btn sm ghost" disabled={index === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button className="btn sm ghost" disabled={index === total - 1} onClick={() => onMove(1)}>
        ↓
      </button>
      <button className="btn sm danger" onClick={onRemove}>
        删除
      </button>
    </div>
  )
}

export function RenameModule() {
  const { busy, run, guard } = useTask()
  const [dir, setDir] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [extFilter, setExtFilter] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'mtime' | 'size'>('name')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [rules, setRules] = useState<RenameRule[]>([
    { type: 'replace', find: '', to: '', useRegex: false, caseSensitive: false }
  ])
  const [preview, setPreview] = useState<RenamePreviewItem[] | null>(null)

  const activeFiles = useMemo(() => files.filter(f => !excluded.has(f.path)), [files, excluded])

  const sortedFiles = useMemo(() => {
    const arr = [...activeFiles]
    if (sortBy === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    else if (sortBy === 'mtime') arr.sort((a, b) => a.mtime - b.mtime)
    else arr.sort((a, b) => b.size - a.size)
    return arr
  }, [activeFiles, sortBy])

  const scan = () =>
    run('扫描目录', async () => {
      if (!dir) return
      const exts = extFilter
        .split(/[,，\s]+/)
        .map(s => s.trim())
        .filter(Boolean)
      const list = await window.api.fs.scan(dir, {
        recursive,
        includeExts: exts.length ? exts : undefined
      })
      setFiles(list)
      setExcluded(new Set())
      setPreview(null)
    })

  const doPreview = () =>
    run('生成预览', async () => {
      const mtimes: Record<string, number> = {}
      for (const f of sortedFiles) mtimes[f.path] = f.mtime
      const items = await window.api.rename.preview(
        sortedFiles.map(f => f.path),
        rules,
        mtimes
      )
      setPreview(items)
    })

  const apply = async () => {
    if (!(await guard(`重命名 ${changed} 个文件`, '重命名可在「操作历史」中一键回滚。'))) return
    return run('执行重命名', async () => {
      if (!preview) return
      const res = await window.api.rename.apply(preview)
      await scan()
      setPreview(null)
      return res
    })
  }

  const changed = preview?.filter(p => p.changed).length ?? 0
  const conflicts = preview?.filter(p => p.conflict).length ?? 0

  return (
    <>
      <Card title="来源目录" hint="扫描结果按所选排序依次编号">
        <div className="field">
          <label>目录</label>
          <PathPicker value={dir} onChange={setDir} />
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <Field label="后缀过滤（逗号分隔，留空表示全部）">
            <TextInput value={extFilter} onChange={setExtFilter} placeholder="jpg, png, pdf" />
          </Field>
          <Field label="排序方式">
            <Select
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'name', label: '文件名' },
                { value: 'mtime', label: '修改时间' },
                { value: 'size', label: '体积（大→小）' }
              ]}
            />
          </Field>
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
              共 <b>{files.length}</b> 个文件
            </span>
            <span>
              参与 <b>{activeFiles.length}</b> 个
            </span>
            <span>
              总体积 <b>{formatBytes(activeFiles.reduce((s, f) => s + f.size, 0))}</b>
            </span>
          </div>
        )}
      </Card>

      <Card
        title="重命名规则"
        hint="自上而下依次生效"
        extra={
          <button className="btn sm" onClick={() => setRules(r => [...r, defaultRuleOf('insert')])}>
            + 添加规则
          </button>
        }
      >
        <div className="rule-list">
          {rules.length === 0 && <Empty>还没有规则，点击右上角添加</Empty>}
          {rules.map((r, i) => (
            <RuleEditor
              key={i}
              rule={r}
              index={i}
              total={rules.length}
              onChange={nr => setRules(arr => arr.map((x, k) => (k === i ? nr : x)))}
              onRemove={() => setRules(arr => arr.filter((_, k) => k !== i))}
              onMove={d =>
                setRules(arr => {
                  const j = i + d
                  if (j < 0 || j >= arr.length) return arr
                  const copy = [...arr]
                  ;[copy[i], copy[j]] = [copy[j], copy[i]]
                  return copy
                })
              }
            />
          ))}
        </div>
        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !sortedFiles.length} onClick={doPreview}>
            生成预览
          </button>
        </div>
      </Card>

      <Card
        title="预览"
        hint={
          preview ? `${changed} 项将被改名${conflicts ? `，${conflicts} 项冲突` : ''}` : '先在上方生成预览'
        }
        extra={
          preview && (
            <button className="btn primary" disabled={busy || changed === 0} onClick={apply}>
              执行重命名（{changed}）
            </button>
          )
        }
      >
        {!preview && <Empty>尚未生成预览</Empty>}
        {preview && preview.length === 0 && <Empty>没有匹配的文件</Empty>}
        {preview && preview.length > 0 && (
          <>
            {conflicts > 0 && (
              <div style={{ marginBottom: 10 }}>
                <Note kind="warn">
                  存在 {conflicts} 项冲突（目标已存在或批内重名），这些项会被自动跳过，不会覆盖任何文件。
                </Note>
              </div>
            )}
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>原文件名</th>
                    <th style={{ width: 24 }} />
                    <th>新文件名</th>
                    <th style={{ width: 150 }}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={p.from}>
                      <td className="muted">{i + 1}</td>
                      <td className="path">{p.fromName}</td>
                      <td className="muted">→</td>
                      <td className="path">{p.changed ? p.toName : '（不变）'}</td>
                      <td>
                        {p.conflict ? (
                          <Badge kind="err">{p.conflict}</Badge>
                        ) : p.changed ? (
                          <Badge kind="ok">将改名</Badge>
                        ) : (
                          <Badge>无变化</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {files.length > 0 && (
        <Card title="参与文件" hint="取消勾选可排除单个文件">
          <div className="table-wrap" style={{ maxHeight: 260 }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <Checkbox
                      checked={excluded.size === 0}
                      onChange={v => setExcluded(v ? new Set() : new Set(files.map(f => f.path)))}
                      label=""
                    />
                  </th>
                  <th>文件名</th>
                  <th style={{ width: 90 }}>体积</th>
                  <th style={{ width: 140 }}>修改时间</th>
                </tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.path}>
                    <td>
                      <Checkbox
                        checked={!excluded.has(f.path)}
                        onChange={v =>
                          setExcluded(prev => {
                            const next = new Set(prev)
                            if (v) next.delete(f.path)
                            else next.add(f.path)
                            return next
                          })
                        }
                        label=""
                      />
                    </td>
                    <td className="path">{f.name}</td>
                    <td className="num">{formatBytes(f.size)}</td>
                    <td className="muted">{formatDateTime(f.mtime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
