import * as path from 'node:path'
import { FileEntry, SyncAction, SyncOptions } from '../../shared/types'
import { hashFile } from '../lib/hash'
import { scanDir } from '../lib/scanner'

/**
 * 生成同步计划。
 * 只做只读扫描与比对，真正的写操作在 apply 阶段执行，保证「先预览后执行」。
 */
export async function buildSyncPlan(src: string, dst: string, opts: SyncOptions): Promise<SyncAction[]> {
  const scanOpts = { recursive: opts.recursive }
  const srcFiles = await scanDir(src, scanOpts)
  const dstFiles = await scanDir(dst, scanOpts)

  const dstMap = new Map<string, FileEntry>()
  for (const f of dstFiles) dstMap.set(path.relative(dst, f.path).toLowerCase(), f)

  const actions: SyncAction[] = []

  for (const f of srcFiles) {
    const rel = path.relative(src, f.path)
    const target = path.join(dst, rel)
    const existing = dstMap.get(rel.toLowerCase())

    if (!existing) {
      actions.push({ kind: 'create', from: f.path, to: target, rel, size: f.size, reason: '目标不存在' })
      continue
    }

    let changed = false
    let reason = ''
    if (existing.size !== f.size) {
      changed = true
      reason = `体积不同（${existing.size} → ${f.size}）`
    } else if (opts.compareBy === 'mtime' && Math.abs(existing.mtime - f.mtime) > 1000) {
      changed = true
      reason = '修改时间不同'
    } else if (opts.compareBy === 'hash') {
      const [a, b] = await Promise.all([
        hashFile(f.path, f.size, true),
        hashFile(existing.path, existing.size, true)
      ])
      if (a !== b) {
        changed = true
        reason = '内容哈希不同'
      }
    }

    actions.push(
      changed
        ? { kind: 'update', from: f.path, to: target, rel, size: f.size, reason }
        : { kind: 'skip', from: f.path, to: target, rel, size: f.size, reason: '内容一致' }
    )
  }

  if (opts.mirror) {
    const srcRels = new Set(srcFiles.map(f => path.relative(src, f.path).toLowerCase()))
    for (const f of dstFiles) {
      const rel = path.relative(dst, f.path)
      if (!srcRels.has(rel.toLowerCase())) {
        actions.push({ kind: 'delete', from: f.path, to: f.path, rel, size: f.size, reason: '源端已不存在' })
      }
    }
  }

  const order: Record<SyncAction['kind'], number> = { create: 0, update: 1, delete: 2, skip: 3 }
  return actions.sort((a, b) => order[a.kind] - order[b.kind] || a.rel.localeCompare(b.rel))
}
