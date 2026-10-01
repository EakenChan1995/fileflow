import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { FileEntry, ScanOptions } from '../../shared/types'

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.tiff', '.tif']

export function isImageExt(ext: string): boolean {
  return IMAGE_EXTS.includes(ext.toLowerCase())
}

export function normalizeExts(list?: string[]): string[] {
  if (!list?.length) return []
  return list
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
    .map(e => (e.startsWith('.') ? e : `.${e}`))
}

/**
 * 递归扫描目录。出于内存与响应速度考虑，返回扁平数组；
 * 超大目录由调用方通过 maxDepth / 后缀过滤控制规模。
 */
export async function scanDir(root: string, opts: ScanOptions = {}): Promise<FileEntry[]> {
  const {
    recursive = true,
    maxDepth = Number.MAX_SAFE_INTEGER,
    includeExts,
    excludeExts,
    minSize,
    maxSize,
    includeDirs = false
  } = opts

  const inc = normalizeExts(includeExts)
  const exc = normalizeExts(excludeExts)
  const out: FileEntry[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      // 无权限 / 目录被删除：静默跳过，不中断整次扫描
      return
    }

    for (const dirent of entries) {
      const full = path.join(dir, dirent.name)
      if (dirent.isDirectory()) {
        if (includeDirs) {
          out.push({
            path: full,
            name: dirent.name,
            dir,
            ext: '',
            size: 0,
            mtime: 0,
            isDir: true
          })
        }
        if (recursive && depth < maxDepth) await walk(full, depth + 1)
        continue
      }
      if (!dirent.isFile()) continue

      const ext = path.extname(dirent.name).toLowerCase()
      if (inc.length && !inc.includes(ext)) continue
      if (exc.length && exc.includes(ext)) continue

      let stat
      try {
        stat = await fsp.stat(full)
      } catch {
        continue
      }
      if (minSize != null && stat.size < minSize) continue
      if (maxSize != null && stat.size > maxSize) continue

      out.push({
        path: full,
        name: dirent.name,
        dir,
        ext,
        size: stat.size,
        mtime: stat.mtimeMs,
        isDir: false
      })
    }
  }

  await walk(root, 0)
  return out
}

/** 简单通配符匹配：`*` 与 `?`，其余字符按字面量处理 */
export function wildcardMatch(name: string, pattern: string): boolean {
  if (!pattern.trim()) return false
  const escaped = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i').test(name)
}
