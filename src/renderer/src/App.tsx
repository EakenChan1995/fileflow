import { useEffect, useState } from 'react'
import { MODULES, ModuleKey, Sidebar } from './components/Sidebar'
import { Footer } from './components/Footer'
import { RenameModule } from './modules/RenameModule'
import { ImageModule } from './modules/ImageModule'
import { DedupeModule } from './modules/DedupeModule'
import { SyncModule } from './modules/SyncModule'
import { OrganizeModule } from './modules/OrganizeModule'
import { CleanModule } from './modules/CleanModule'
import { HistoryModule } from './modules/HistoryModule'
import { SettingsModule } from './modules/SettingsModule'

function renderModule(key: ModuleKey) {
  switch (key) {
    case 'rename':
      return <RenameModule />
    case 'image':
      return <ImageModule />
    case 'dedupe':
      return <DedupeModule />
    case 'sync':
      return <SyncModule />
    case 'organize':
      return <OrganizeModule />
    case 'clean':
      return <CleanModule />
    case 'history':
      return <HistoryModule />
    case 'settings':
      return <SettingsModule />
  }
}

export function App() {
  const [active, setActive] = useState<ModuleKey>('rename')
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])

  const meta = MODULES.find(m => m.key === active)!

  return (
    <div className="app">
      <Sidebar active={active} onSelect={setActive} version={version || '—'} />
      <div className="main">
        <header className="topbar">
          <h1>{meta.title}</h1>
          <span className="desc">{meta.desc}</span>
        </header>
        <div className="content" key={active}>
          {renderModule(active)}
        </div>
        <Footer />
      </div>
    </div>
  )
}
