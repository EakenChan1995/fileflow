import { CleanOptions, FileEntry } from '../../shared/types'
import { scanDir, wildcardMatch } from '../lib/scanner'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

const DAY = 24 * 60 * 60 * 1000

/**
 * 按规则筛选待清理文件。规则之间是「或」关系，命中任意一条即入选。
 * 空目录单独处理：需要自底向上判断，否则会误删还能继续递归的父目录。
 */
export async function findCleanTargets(
  dir: string,
  opts: CleanOptions,
  recursive: boolean
): Promise<{ files: FileEntry[]; dirs: string[] }> {
  const files: FileEntry[] = []
  const dirs: string[] = []

  const all = await scanDir(dir, { recursive })
  const now = Date.now()

  for (const f of all) {
    let hit = false
    if (opts.emptyFiles && f.size === 0) hit = true
    if (!hit && opts.largerThanMB > 0 && f.size > opts.largerThanMB * 1024 * 1024) hit = true
    if (!hit && opts.olderThanDays > 0 && now - f.mtime > opts.olderThanDays * DAY) hit = true
    if (!hit && opts.exts?.length && opts.exts.map(e => e.toLowerCase()).includes(f.ext)) hit = true
    if (!hit && opts.namePattern && wildcardMatch(f.name, opts.namePattern)) hit = true
    if (hit) files.push(f)
  }

  if (opts.emptyDirs) {
    dirs.push(...(await findEmptyDirs(dir)))
  }

  return { files, dirs }
}

async function findEmptyDirs(root: string): Promise<string[]> {
  const empties: string[] = []

  async function walk(dir: string): Promise<boolean> {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return false
    }
    let hasContent = false
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        const childHasContent = await walk(full)
        if (childHasContent) hasContent = true
      } else {
        hasContent = true
      }
    }
    if (!hasContent && dir !== root) empties.push(dir)
    return hasContent || false
  }

  await walk(root)
  return empties.sort((a, b) => b.length - a.length)
}
