import { DedupeOptions, DuplicateGroup, FileEntry } from '../../shared/types'
import { hashFile } from '../lib/hash'
import { scanDir } from '../lib/scanner'
import { emit } from '../lib/task'

/**
 * 三级收敛，避免对所有文件做全量哈希：
 * 1) 体积相同才可能重复
 * 2) 快速哈希（首尾 64KB）分组
 * 3) 可选：完整 SHA-256 复核
 */
export async function findDuplicates(
  dirs: string[],
  opts: DedupeOptions,
  onProgress?: (done: number, total: number) => void
): Promise<DuplicateGroup[]> {
  const all: FileEntry[] = []
  for (const d of dirs) {
    all.push(...(await scanDir(d, { recursive: opts.recursive, minSize: opts.minSize })))
  }
  emit({
    name: '重复文件扫描',
    phase: 'log',
    current: 0,
    total: all.length,
    message: `候选文件 ${all.length} 个`
  })

  const bySize = new Map<number, FileEntry[]>()
  for (const f of all) {
    const arr = bySize.get(f.size)
    if (arr) arr.push(f)
    else bySize.set(f.size, [f])
  }

  const candidates: FileEntry[] = []
  for (const arr of bySize.values()) if (arr.length > 1) candidates.push(...arr)
  emit({
    name: '重复文件扫描',
    phase: 'log',
    current: 0,
    total: candidates.length,
    message: `体积相同候选 ${candidates.length} 个`
  })

  const byFast = new Map<string, FileEntry[]>()
  let done = 0
  for (const f of candidates) {
    const h = await hashFile(f.path, f.size, false)
    const arr = byFast.get(h)
    if (arr) arr.push(f)
    else byFast.set(h, [f])
    done++
    if (onProgress && done % 20 === 0) onProgress(done, candidates.length)
  }

  const groups: DuplicateGroup[] = []
  for (const [hash, arr] of byFast) {
    if (arr.length < 2) continue
    if (opts.thorough) {
      // 完整哈希复核，按最终 hash 再分组一次
      const sub = new Map<string, FileEntry[]>()
      for (const f of arr) {
        const full = await hashFile(f.path, f.size, true)
        const s = sub.get(full)
        if (s) s.push(f)
        else sub.set(full, [f])
      }
      for (const [full, s] of sub) {
        if (s.length > 1) groups.push({ hash: full, size: s[0].size, files: sortFiles(s) })
      }
    } else {
      groups.push({ hash, size: arr[0].size, files: sortFiles(arr) })
    }
  }

  return groups.sort((a, b) => b.size * b.files.length - a.size * a.files.length)
}

/** 默认排序：修改时间早的在前，便于「保留最旧」的默认策略 */
function sortFiles(files: FileEntry[]): FileEntry[] {
  return [...files].sort((a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path))
}

/**
 * 按保留策略挑出待处理文件（每组保留一个）。
 * keep 为每组内的索引依据。
 */
export function pickRemovals(
  groups: DuplicateGroup[],
  keep: 'oldest' | 'newest' | 'shortest-path'
): string[] {
  const out: string[] = []
  for (const g of groups) {
    if (g.files.length < 2) continue
    const sorted = [...g.files]
    if (keep === 'newest') sorted.sort((a, b) => b.mtime - a.mtime)
    else if (keep === 'shortest-path') sorted.sort((a, b) => a.path.length - b.path.length)
    else sorted.sort((a, b) => a.mtime - b.mtime)
    out.push(...sorted.slice(1).map(f => f.path))
  }
  return out
}
