import { app } from 'electron'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Op, UndoRecord } from '../../shared/types'
import { ensureDir } from './fsutil'

/**
 * 轻量持久化：配置 + 操作历史都存成 userData 下的 JSON。
 * 刻意不引入 electron-store，减少依赖面。
 */

const UNDO_LIMIT = 30

function dataDir(): string {
  return app.getPath('userData')
}

function undoDir(): string {
  return path.join(dataDir(), 'undo')
}

function settingsFile(): string {
  return path.join(dataDir(), 'settings.json')
}

export interface PersistedSettings {
  lastDirs: string[]
  theme: 'light' | 'dark'
  concurrency: number
  confirmBeforeApply: boolean
}

const DEFAULT_SETTINGS: PersistedSettings = {
  lastDirs: [],
  theme: 'light',
  concurrency: 4,
  confirmBeforeApply: true
}

export async function loadSettings(): Promise<PersistedSettings> {
  try {
    const raw = await fsp.readFile(settingsFile(), 'utf8')
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PersistedSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(patch: Partial<PersistedSettings>): Promise<PersistedSettings> {
  const next = { ...(await loadSettings()), ...patch }
  await ensureDir(dataDir())
  await fsp.writeFile(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function pushRecentDir(dir: string): Promise<string[]> {
  const s = await loadSettings()
  const lastDirs = [dir, ...s.lastDirs.filter(d => d !== dir)].slice(0, 10)
  await saveSettings({ lastDirs })
  return lastDirs
}

/** 写入一条可撤销记录，返回其 id */
export async function saveUndo(name: string, ops: Op[], reversible?: boolean): Promise<UndoRecord> {
  await ensureDir(undoDir())
  const record: UndoRecord = {
    id: randomUUID(),
    name,
    createdAt: Date.now(),
    ops,
    reversible: reversible ?? ops.every(o => o.kind !== 'trash')
  }
  await fsp.writeFile(path.join(undoDir(), `${record.id}.json`), JSON.stringify(record), 'utf8')
  await pruneUndo()
  return record
}

export async function listUndo(): Promise<UndoRecord[]> {
  try {
    const files = await fsp.readdir(undoDir())
    const records: UndoRecord[] = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        records.push(JSON.parse(await fsp.readFile(path.join(undoDir(), f), 'utf8')) as UndoRecord)
      } catch {
        // 单条记录损坏不影响列表
      }
    }
    return records.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function deleteUndo(id: string): Promise<void> {
  await fsp.rm(path.join(undoDir(), `${id}.json`), { force: true })
}

async function pruneUndo(): Promise<void> {
  const all = await listUndo()
  for (const r of all.slice(UNDO_LIMIT)) await deleteUndo(r.id)
}
