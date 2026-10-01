import { useState } from 'react'
import { CleanOptions, FileEntry } from '../../../shared/types'
import { Card, Checkbox, Empty, Field, Note, PathPicker, TextInput } from '../components/ui'
import { useTask } from '../lib/taskbus'
import { formatBytes, formatDateTime } from '../lib/format'

const DEFAULT_OPTS: CleanOptions = {
  emptyFiles: true,
  emptyDirs: false,
  largerThanMB: 0,
  olderThanDays: 0,
  exts: [],
  namePattern: ''
}

export function CleanModule() {
  const { busy, run, guard } = useTask()
  const [dir, setDir] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [opts, setOpts] = useState<CleanOptions>(DEFAULT_OPTS)
  const [extText, setExtText] = useState('')
  const [result, setResult] = useState<{ files: FileEntry[]; dirs: string[] } | null>(null)

  const scan = () =>
    run('按规则筛选', async () => {
      if (!dir) return
      const exts = extText
        .split(/[,，\s]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
        .map(s => (s.startsWith('.') ? s : `.${s}`))
      const r = await window.api.clean.preview(dir, { ...opts, exts }, recursive)
      setResult(r)
    })

  const apply = async () => {
    if (
      !(await guard(
        `清理 ${(result?.files.length ?? 0) + (result?.dirs.length ?? 0)} 个项目`,
        '文件会移入系统回收站，可手动恢复，但本工具无法自动回滚。'
      ))
    )
      return
    return run('清理到回收站', async () => {
      if (!result) return
      const res = await window.api.clean.apply(
        result.files.map(f => f.path),
        result.dirs
      )
      setResult(null)
      return res
    })
  }

  const totalBytes = result ? result.files.reduce((s, f) => s + f.size, 0) : 0
  const ruleCount =
    (opts.emptyFiles ? 1 : 0) +
    (opts.emptyDirs ? 1 : 0) +
    (opts.largerThanMB > 0 ? 1 : 0) +
    (opts.olderThanDays > 0 ? 1 : 0) +
    (extText.trim() ? 1 : 0) +
    (opts.namePattern.trim() ? 1 : 0)

  return (
    <>
      <Card title="清理范围">
        <div className="field">
          <label>目录</label>
          <PathPicker value={dir} onChange={setDir} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Checkbox checked={recursive} onChange={setRecursive} label="包含子目录" />
          <div className="spacer" />
          <button className="btn primary" disabled={busy || !dir || ruleCount === 0} onClick={scan}>
            筛选
          </button>
        </div>
      </Card>

      <Card title="筛选规则" hint="命中任意一条即入选（或关系）">
        <div className="row" style={{ gap: 18 }}>
          <Checkbox
            checked={opts.emptyFiles}
            onChange={v => setOpts({ ...opts, emptyFiles: v })}
            label="空文件（0 字节）"
          />
          <Checkbox
            checked={opts.emptyDirs}
            onChange={v => setOpts({ ...opts, emptyDirs: v })}
            label="空目录"
          />
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <Field label="体积大于（MB，0 表示不限制）">
            <input
              type="number"
              min={0}
              value={opts.largerThanMB}
              onChange={e => setOpts({ ...opts, largerThanMB: Math.max(0, Number(e.target.value)) })}
            />
          </Field>
          <Field label="最后修改超过（天，0 表示不限制）">
            <input
              type="number"
              min={0}
              value={opts.olderThanDays}
              onChange={e => setOpts({ ...opts, olderThanDays: Math.max(0, Number(e.target.value)) })}
            />
          </Field>
          <Field label="指定后缀（逗号分隔）">
            <TextInput value={extText} onChange={setExtText} placeholder="tmp, log, bak" />
          </Field>
          <Field label="文件名匹配（支持 * 通配）">
            <TextInput
              value={opts.namePattern}
              onChange={v => setOpts({ ...opts, namePattern: v })}
              placeholder="*.tmp"
            />
          </Field>
        </div>
        {ruleCount === 0 && (
          <div style={{ marginTop: 12 }}>
            <Note kind="warn">至少启用一条规则才能筛选。</Note>
          </div>
        )}
      </Card>

      <Card
        title="命中结果"
        hint={
          result
            ? `文件 ${result.files.length} 个（${formatBytes(totalBytes)}）· 空目录 ${result.dirs.length} 个`
            : '先执行筛选'
        }
        extra={
          result && (
            <button
              className="btn danger"
              disabled={busy || (!result.files.length && !result.dirs.length)}
              onClick={apply}
            >
              清理全部（{result.files.length + result.dirs.length}）
            </button>
          )
        }
      >
        {!result && <Empty>尚未筛选</Empty>}
        {result && result.files.length === 0 && result.dirs.length === 0 && <Empty>没有符合条件的项目</Empty>}
        {result && (result.files.length > 0 || result.dirs.length > 0) && (
          <>
            <div className="table-wrap" style={{ maxHeight: 320 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>类型</th>
                    <th>路径</th>
                    <th style={{ width: 90 }}>体积</th>
                    <th style={{ width: 140 }}>修改时间</th>
                  </tr>
                </thead>
                <tbody>
                  {result.dirs.map(d => (
                    <tr key={`d-${d}`}>
                      <td>
                        <span className="badge">目录</span>
                      </td>
                      <td className="path">{d}</td>
                      <td className="num muted">—</td>
                      <td className="muted">—</td>
                    </tr>
                  ))}
                  {result.files.map(f => (
                    <tr key={f.path}>
                      <td>
                        <span className="badge">文件</span>
                      </td>
                      <td className="path">{f.path}</td>
                      <td className="num">{formatBytes(f.size)}</td>
                      <td className="muted">{formatDateTime(f.mtime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
              <Note kind="danger">
                清理会把文件移入系统回收站，可从回收站恢复，但本工具无法自动回滚。执行前请核对上表。
              </Note>
            </div>
          </>
        )}
      </Card>
    </>
  )
}
