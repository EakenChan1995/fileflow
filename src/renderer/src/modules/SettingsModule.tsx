import { useEffect, useState } from 'react'
import { AppSettings } from '../../../shared/types'
import { Card, Checkbox, Field, Select } from '../components/ui'
import { useTask } from '../lib/taskbus'

const DEFAULTS: AppSettings = {
  lastDirs: [],
  theme: 'light',
  concurrency: 4,
  confirmBeforeApply: true
}

export function SettingsModule() {
  const { run } = useTask()
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  const update = async (patch: Partial<AppSettings>) => {
    const next = await window.api.settings.set(patch)
    setSettings(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  const clearRecent = () =>
    run('清除历史目录', async () => {
      const next = await window.api.settings.set({ lastDirs: [] })
      setSettings(next)
    })

  return (
    <>
      <Card title="执行参数">
        <div className="grid">
          <Field label="并发数（图片处理等批量任务）">
            <Select
              value={settings.concurrency}
              onChange={v => update({ concurrency: v })}
              options={[
                { value: 1, label: '1（最稳，最慢）' },
                { value: 2, label: '2' },
                { value: 4, label: '4（推荐）' },
                { value: 8, label: '8' },
                { value: 16, label: '16（最快，占用高）' }
              ]}
            />
          </Field>
          <Field label="界面主题">
            <Select
              value={settings.theme}
              onChange={v => update({ theme: v })}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色（暂未启用）' }
              ]}
            />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Checkbox
            checked={settings.confirmBeforeApply}
            onChange={v => update({ confirmBeforeApply: v })}
            label="执行前弹出二次确认"
          />
        </div>
        {saved && (
          <div style={{ marginTop: 12 }}>
            <span className="badge ok">已保存</span>
          </div>
        )}
      </Card>

      <Card
        title="最近目录"
        hint={`${settings.lastDirs.length} 条`}
        extra={
          <button className="btn sm" disabled={!settings.lastDirs.length} onClick={clearRecent}>
            清除
          </button>
        }
      >
        {settings.lastDirs.length === 0 ? (
          <div className="empty">暂无记录</div>
        ) : (
          <div className="chips">
            {settings.lastDirs.map(d => (
              <span key={d} className="chip" title={d}>
                {d.length > 40 ? `…${d.slice(-39)}` : d}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="关于">
        <div className="small muted" style={{ lineHeight: 1.9 }}>
          FileFlow 是一个本地运行的文件批处理工具箱，所有操作都在本机完成，不会上传任何数据。
          <br />
          设置与操作历史保存在应用数据目录（userData）下的 JSON 文件中。
        </div>
      </Card>
    </>
  )
}
