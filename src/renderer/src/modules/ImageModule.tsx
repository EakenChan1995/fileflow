import { useMemo, useState } from 'react'
import { FileEntry, ImageOptions } from '../../../shared/types'
import { IMAGE_EXT_LIST } from '../../../shared/constants'
import { Card, Checkbox, Empty, Field, Note, PathPicker, Select, TextInput } from '../components/ui'
import { useTask } from '../lib/taskbus'
import { formatBytes } from '../lib/format'

const DEFAULT_OPTS: ImageOptions = {
  format: 'keep',
  quality: 80,
  resize: {
    enabled: false,
    mode: 'percent',
    percent: 50,
    longest: 1920,
    width: 1280,
    height: 720,
    fit: 'inside',
    enlarge: false
  },
  outputDir: '',
  outputMode: 'sibling',
  suffix: '_min',
  keepStructure: false
}

export function ImageModule() {
  const { busy, run, guard } = useTask()
  const [dir, setDir] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [opts, setOpts] = useState<ImageOptions>(DEFAULT_OPTS)
  const [jobs, setJobs] = useState<{ from: string; to: string }[] | null>(null)

  const patchResize = (p: Partial<ImageOptions['resize']>) =>
    setOpts(o => ({ ...o, resize: { ...o.resize, ...p } }))

  const scan = () =>
    run('扫描图片', async () => {
      if (!dir) return
      const list = await window.api.fs.scan(dir, { recursive, includeExts: IMAGE_EXT_LIST })
      setFiles(list)
      setJobs(null)
    })

  const doPreview = () =>
    run('生成输出预览', async () => {
      const list = await window.api.image.preview(files, opts, dir)
      setJobs(list)
    })

  const apply = async () => {
    const detail = overwriteRisk
      ? '覆盖模式会替换原始图片，不可自动回滚。'
      : '输出文件不会动到原图，可在「操作历史」中删除本次产物。'
    if (!(await guard(`处理 ${jobs?.length ?? 0} 张图片`, detail))) return
    return run('执行图片处理', async () => {
      if (!jobs) return
      const res = await window.api.image.apply(jobs, opts)
      setJobs(null)
      return res
    })
  }

  const totalIn = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files])
  const overwriteRisk = opts.outputMode === 'overwrite'

  return (
    <>
      <Card title="来源目录" hint={`支持 ${IMAGE_EXT_LIST.join(' / ')}`}>
        <div className="field">
          <label>目录</label>
          <PathPicker value={dir} onChange={setDir} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Checkbox checked={recursive} onChange={setRecursive} label="包含子目录" />
          <div className="spacer" />
          <button className="btn primary" disabled={busy || !dir} onClick={scan}>
            扫描图片
          </button>
        </div>
        {files.length > 0 && (
          <div className="stat-row" style={{ marginTop: 12, borderRadius: 6 }}>
            <span>
              图片 <b>{files.length}</b> 张
            </span>
            <span>
              原始体积 <b>{formatBytes(totalIn)}</b>
            </span>
          </div>
        )}
      </Card>

      <Card title="处理参数">
        <div className="grid">
          <Field label="输出格式">
            <Select
              value={opts.format}
              onChange={v => setOpts({ ...opts, format: v })}
              options={[
                { value: 'keep', label: '保持原格式' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'png', label: 'PNG' },
                { value: 'webp', label: 'WebP' },
                { value: 'avif', label: 'AVIF' }
              ]}
            />
          </Field>
          <Field label={`质量 ${opts.quality}`}>
            <input
              type="range"
              min={1}
              max={100}
              value={opts.quality}
              onChange={e => setOpts({ ...opts, quality: Number(e.target.value) })}
            />
          </Field>
          <Field label="输出位置">
            <Select
              value={opts.outputMode}
              onChange={v => setOpts({ ...opts, outputMode: v })}
              options={[
                { value: 'sibling', label: '源文件同目录' },
                { value: 'custom', label: '指定输出目录' },
                { value: 'overwrite', label: '覆盖原文件' }
              ]}
            />
          </Field>
          {opts.outputMode === 'sibling' && (
            <Field label="文件名后缀">
              <TextInput
                value={opts.suffix}
                onChange={v => setOpts({ ...opts, suffix: v })}
                placeholder="_min"
              />
            </Field>
          )}
          {opts.outputMode === 'custom' && (
            <>
              <Field label="输出目录">
                <PathPicker value={opts.outputDir} onChange={v => setOpts({ ...opts, outputDir: v })} />
              </Field>
              <Field label="目录结构">
                <Checkbox
                  checked={opts.keepStructure}
                  onChange={v => setOpts({ ...opts, keepStructure: v })}
                  label="保留相对子目录"
                />
              </Field>
            </>
          )}
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div className="row">
            <Checkbox
              checked={opts.resize.enabled}
              onChange={v => patchResize({ enabled: v })}
              label="调整尺寸"
            />
            {opts.resize.enabled && (
              <>
                <Select
                  value={opts.resize.mode}
                  onChange={v => patchResize({ mode: v })}
                  options={[
                    { value: 'percent', label: '按百分比' },
                    { value: 'longest', label: '限制最长边' },
                    { value: 'exact', label: '固定宽高' }
                  ]}
                />
                {opts.resize.mode === 'percent' && (
                  <>
                    <input
                      type="number"
                      style={{ width: 80 }}
                      min={1}
                      max={500}
                      value={opts.resize.percent}
                      onChange={e => patchResize({ percent: Number(e.target.value) })}
                    />
                    <span className="muted">%</span>
                  </>
                )}
                {opts.resize.mode === 'longest' && (
                  <>
                    <input
                      type="number"
                      style={{ width: 90 }}
                      min={1}
                      value={opts.resize.longest}
                      onChange={e => patchResize({ longest: Number(e.target.value) })}
                    />
                    <span className="muted">px</span>
                  </>
                )}
                {opts.resize.mode === 'exact' && (
                  <>
                    <input
                      type="number"
                      style={{ width: 84 }}
                      min={1}
                      value={opts.resize.width}
                      onChange={e => patchResize({ width: Number(e.target.value) })}
                    />
                    <span className="muted">×</span>
                    <input
                      type="number"
                      style={{ width: 84 }}
                      min={1}
                      value={opts.resize.height}
                      onChange={e => patchResize({ height: Number(e.target.value) })}
                    />
                    <Select
                      value={opts.resize.fit}
                      onChange={v => patchResize({ fit: v })}
                      options={[
                        { value: 'cover', label: '裁切填充' },
                        { value: 'contain', label: '完整包含' },
                        { value: 'fill', label: '拉伸' },
                        { value: 'inside', label: '内缩适配' },
                        { value: 'outside', label: '外扩适配' }
                      ]}
                    />
                  </>
                )}
                <Checkbox
                  checked={opts.resize.enlarge}
                  onChange={v => patchResize({ enlarge: v })}
                  label="允许放大"
                />
              </>
            )}
          </div>
        </div>

        <div className="row end" style={{ marginTop: 14 }}>
          <button className="btn" disabled={busy || !files.length} onClick={doPreview}>
            生成输出预览
          </button>
        </div>
      </Card>

      <Card
        title="输出预览"
        hint={jobs ? `${jobs.length} 个文件待处理` : '先扫描并生成预览'}
        extra={
          jobs && (
            <button className="btn primary" disabled={busy || !jobs.length} onClick={apply}>
              开始处理（{jobs.length}）
            </button>
          )
        }
      >
        {overwriteRisk && (
          <div style={{ marginBottom: 10 }}>
            <Note kind="danger">
              覆盖模式会替换原始图片，且不可自动回滚（若同时改变格式，原文件会被移入回收站）。建议先备份或使用「源文件同目录」。
            </Note>
          </div>
        )}
        {!jobs && <Empty>尚未生成预览</Empty>}
        {jobs && jobs.length === 0 && <Empty>没有可处理的图片</Empty>}
        {jobs && jobs.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>源文件</th>
                  <th style={{ width: 24 }} />
                  <th>输出</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j, i) => (
                  <tr key={`${j.from}-${i}`}>
                    <td className="muted">{i + 1}</td>
                    <td className="path">{j.from}</td>
                    <td className="muted">→</td>
                    <td className="path">{j.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
