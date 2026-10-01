import * as path from 'node:path'
import { FileEntry, OrganizeOptions } from '../../shared/types'
import { DEFAULT_EXT_MAP } from '../../shared/constants'
import { exists, uniquePath } from '../lib/fsutil'
import { formatDate } from './rename'

export interface OrganizePlanItem {
  from: string
  to: string
  group: string
}

/** 根据维度计算目标分组目录名 */
export function groupNameFor(file: FileEntry, opts: OrganizeOptions): string {
  if (opts.by === 'ext') {
    const key = file.ext.replace(/^\./, '').toLowerCase()
    return opts.extMap?.[key] || DEFAULT_EXT_MAP[key] || (key ? key.toUpperCase() : '未分类')
  }
  if (opts.by === 'date') {
    return formatDate(new Date(file.mtime), opts.dateFormat)
  }
  const mb = file.size / 1024 / 1024
  if (mb < 1) return '0-1MB'
  if (mb < 10) return '1-10MB'
  if (mb < 100) return '10-100MB'
  return '100MB以上'
}

export async function buildOrganizePlan(
  files: FileEntry[],
  opts: OrganizeOptions
): Promise<OrganizePlanItem[]> {
  const items: OrganizePlanItem[] = []
  const used = new Set<string>()

  for (const f of files) {
    const group = groupNameFor(f, opts)
    const root = opts.targetDir?.trim() || f.dir
    let to = path.join(root, group, f.name)

    if (to.toLowerCase() === f.path.toLowerCase()) {
      // 已在正确位置
      continue
    }
    if (used.has(to.toLowerCase()) || (await exists(to))) {
      if (opts.onConflict === 'skip') continue
      if (opts.onConflict === 'overwrite') {
        used.add(to.toLowerCase())
      } else {
        to = await uniquePath(to)
        used.add(to.toLowerCase())
      }
    } else {
      used.add(to.toLowerCase())
    }

    items.push({ from: f.path, to, group })
  }

  return items
}
