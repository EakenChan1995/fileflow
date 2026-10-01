import { ReactNode } from 'react'
import {
  IconClean,
  IconDedupe,
  IconHistory,
  IconImage,
  IconOrganize,
  IconRename,
  IconSettings,
  IconSync
} from './icons'

export type ModuleKey = 'rename' | 'image' | 'dedupe' | 'sync' | 'organize' | 'clean' | 'history' | 'settings'

export interface ModuleMeta {
  key: ModuleKey
  title: string
  desc: string
  icon: ReactNode
  /** 是否属于设置类（渲染在底部） */
  footer?: boolean
}

export const MODULES: ModuleMeta[] = [
  { key: 'rename', title: '批量重命名', desc: '规则管道：替换 / 序号 / 日期 / 大小写', icon: <IconRename /> },
  { key: 'image', title: '图片批处理', desc: '格式转换、压缩、缩放', icon: <IconImage /> },
  { key: 'dedupe', title: '重复文件清理', desc: '按体积与哈希分组查重', icon: <IconDedupe /> },
  { key: 'sync', title: '目录同步', desc: '增量镜像，先预览后执行', icon: <IconSync /> },
  { key: 'organize', title: '文件整理', desc: '按类型 / 日期 / 体积归档', icon: <IconOrganize /> },
  { key: 'clean', title: '规则清理', desc: '空文件、超大、过期文件', icon: <IconClean /> },
  { key: 'history', title: '操作历史', desc: '查看与回滚', icon: <IconHistory />, footer: true },
  { key: 'settings', title: '设置', desc: '并发、主题、确认', icon: <IconSettings />, footer: true }
]

export function Sidebar({
  active,
  onSelect,
  version
}: {
  active: ModuleKey
  onSelect: (k: ModuleKey) => void
  version: string
}) {
  const main = MODULES.filter(m => !m.footer)
  const foot = MODULES.filter(m => m.footer)

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">F</div>
        <div>
          <div className="brand-name">FileFlow</div>
          <div className="brand-sub">文件批处理工具箱</div>
        </div>
      </div>
      <nav className="nav">
        {main.map(m => (
          <button
            key={m.key}
            className={`nav-item ${active === m.key ? 'active' : ''}`}
            onClick={() => onSelect(m.key)}
          >
            <span className="ic">{m.icon}</span>
            {m.title}
          </button>
        ))}
      </nav>
      <div className="nav-spacer" />
      <nav className="nav">
        {foot.map(m => (
          <button
            key={m.key}
            className={`nav-item ${active === m.key ? 'active' : ''}`}
            onClick={() => onSelect(m.key)}
          >
            <span className="ic">{m.icon}</span>
            {m.title}
          </button>
        ))}
      </nav>
      <div className="nav-footer">
        v{version} · Electron
        <br />
        所有写操作均可先预览
      </div>
    </aside>
  )
}
