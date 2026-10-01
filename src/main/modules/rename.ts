import * as path from 'node:path'
import { RenamePreviewItem, RenameRule } from '../../shared/types'
import { exists } from '../lib/fsutil'

const DATE_TOKENS: Record<string, (d: Date) => string> = {
  YYYY: d => String(d.getFullYear()),
  MM: d => String(d.getMonth() + 1).padStart(2, '0'),
  DD: d => String(d.getDate()).padStart(2, '0'),
  HH: d => String(d.getHours()).padStart(2, '0'),
  mm: d => String(d.getMinutes()).padStart(2, '0'),
  ss: d => String(d.getSeconds()).padStart(2, '0')
}

/** 支持的占位符：YYYY MM DD HH mm ss，其余字符原样保留 */
export function formatDate(d: Date, fmt: string): string {
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, t => DATE_TOKENS[t]?.(d) ?? t)
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function toSentenceCase(s: string): string {
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * 按顺序把规则管道应用到「主干名 + 扩展名」上。
 * 规则顺序由 UI 决定，序号规则依赖 index，因此必须传入。
 */
export function applyRules(
  baseName: string,
  ext: string,
  index: number,
  rules: RenameRule[],
  mtime?: number
): { name: string; ext: string } {
  let name = baseName
  let e = ext

  for (const rule of rules) {
    switch (rule.type) {
      case 'case': {
        if (rule.value === 'upper') name = name.toUpperCase()
        else if (rule.value === 'lower') name = name.toLowerCase()
        else if (rule.value === 'title') name = toTitleCase(name)
        else if (rule.value === 'sentence') name = toSentenceCase(name)
        break
      }
      case 'replace': {
        if (!rule.find) break
        if (rule.useRegex) {
          try {
            name = name.replace(new RegExp(rule.find, rule.caseSensitive ? 'g' : 'gi'), rule.to)
          } catch {
            // 非法正则：跳过该规则，不中断整批
          }
        } else if (rule.caseSensitive) {
          name = name.split(rule.find).join(rule.to)
        } else {
          const re = new RegExp(rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
          name = name.replace(re, rule.to)
        }
        break
      }
      case 'insert': {
        name = rule.position === 'prefix' ? rule.text + name : name + rule.text
        break
      }
      case 'number': {
        const n = String(rule.start + index * rule.step).padStart(Math.max(1, rule.digits), '0')
        const sep = rule.separator ?? ''
        name = rule.position === 'prefix' ? `${n}${sep}${name}` : `${name}${sep}${n}`
        break
      }
      case 'trim': {
        if (rule.count <= 0) break
        name = rule.from === 'start' ? name.slice(rule.count) : name.slice(0, -rule.count)
        break
      }
      case 'ext': {
        if (rule.mode === 'lower') e = e.toLowerCase()
        else if (rule.mode === 'upper') e = e.toUpperCase()
        else if (rule.mode === 'set')
          e = rule.value ? (rule.value.startsWith('.') ? rule.value : `.${rule.value}`) : e
        break
      }
      case 'date': {
        const d = rule.source === 'mtime' && mtime ? new Date(mtime) : new Date()
        const text = formatDate(d, rule.format || 'YYYY-MM-DD')
        const sep = rule.separator ?? '_'
        name = rule.position === 'prefix' ? `${text}${sep}${name}` : `${name}${sep}${text}`
        break
      }
    }
  }

  return { name, ext: e }
}

/** 生成重命名预览，并标注冲突（目标已存在 / 批内重名） */
export async function buildPreview(
  files: string[],
  rules: RenameRule[],
  mtimes: Record<string, number> = {}
): Promise<RenamePreviewItem[]> {
  const items: RenamePreviewItem[] = []
  const seen = new Map<string, number>()

  for (let i = 0; i < files.length; i++) {
    const from = files[i]
    const dir = path.dirname(from)
    const ext = path.extname(from)
    const base = path.basename(from, ext)
    const { name, ext: newExt } = applyRules(base, ext, i, rules, mtimes[from])
    const toName = `${name}${newExt}`
    const to = path.join(dir, toName)

    const item: RenamePreviewItem = {
      from,
      to,
      fromName: path.basename(from),
      toName,
      changed: path.basename(from) !== toName
    }

    if (!item.changed) {
      items.push(item)
      continue
    }

    const hit = seen.get(to.toLowerCase())
    if (hit !== undefined) {
      item.conflict = `与第 ${hit + 1} 项的目标名重复`
    } else if (await exists(to)) {
      item.conflict = '目标文件已存在'
    } else {
      seen.set(to.toLowerCase(), i)
    }
    items.push(item)
  }

  return items
}

export function rulesNeedMtime(rules: RenameRule[]): boolean {
  return rules.some(r => r.type === 'date' && r.source === 'mtime')
}
