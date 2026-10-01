import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { shell } from 'electron'

export async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fsp.mkdir(p, { recursive: true })
}

/** 目标已存在时追加 ` (1)`、` (2)` …，避免静默覆盖 */
export async function uniquePath(p: string): Promise<string> {
  if (!(await exists(p))) return p
  const dir = path.dirname(p)
  const ext = path.extname(p)
  const base = path.basename(p, ext)
  for (let i = 1; i < 10000; i++) {
    const candidate = path.join(dir, `${base} (${i})${ext}`)
    if (!(await exists(candidate))) return candidate
  }
  throw new Error(`无法为 ${p} 生成唯一文件名`)
}

/** 同盘用 rename，跨盘自动退化为「复制 + 删除」 */
export async function moveFile(from: string, to: string): Promise<void> {
  await ensureDir(path.dirname(to))
  try {
    await fsp.rename(from, to)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EXDEV') throw err
    await fsp.copyFile(from, to)
    await fsp.rm(from, { force: true })
  }
}

export async function copyFile(from: string, to: string): Promise<void> {
  await ensureDir(path.dirname(to))
  await fsp.copyFile(from, to)
}

/** 删除到系统回收站，避免不可逆丢失 */
export async function trash(p: string): Promise<void> {
  await shell.trashItem(p)
}

export function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

/** 判断 child 是否位于 parent 之下（含自身），用于阻止把目录移进自己 */
export function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** 目标目录位于源目录内部时会产生递归复制，这里做拦截 */
export async function assertNotNested(src: string, dst: string): Promise<void> {
  if (isSubPath(src, dst)) {
    throw new Error('目标目录不能位于源目录内部，会导致递归复制')
  }
}

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
