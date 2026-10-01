import * as path from 'node:path'
import * as fsp from 'node:fs/promises'
import sharp, { type FitEnum, type ResizeOptions } from 'sharp'
import { FileEntry, ImageOptions } from '../../shared/types'
import { ensureDir } from '../lib/fsutil'

export interface ImageJob {
  from: string
  to: string
}

const EXT_BY_FORMAT: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  avif: '.avif'
}

/** 计算单张图片的输出路径 */
export function resolveOutput(file: FileEntry, opts: ImageOptions, rootDir: string): string {
  const ext = path.extname(file.path)
  const base = path.basename(file.path, ext)
  const newExt = opts.format === 'keep' ? ext.toLowerCase() : EXT_BY_FORMAT[opts.format]

  if (opts.outputMode === 'overwrite') {
    return path.join(file.dir, `${base}${newExt}`)
  }
  if (opts.outputMode === 'sibling') {
    return path.join(file.dir, `${base}${opts.suffix ?? ''}${newExt}`)
  }
  const rel = opts.keepStructure && rootDir ? path.relative(rootDir, file.dir) : ''
  return path.join(opts.outputDir || file.dir, rel, `${base}${opts.suffix ?? ''}${newExt}`)
}

/** 生成「源 → 目标」作业列表，供预览与执行共用 */
export function buildJobs(files: FileEntry[], opts: ImageOptions, rootDir: string): ImageJob[] {
  return files.map(f => ({ from: f.path, to: resolveOutput(f, opts, rootDir) }))
}

export async function processOne(
  job: ImageJob,
  opts: ImageOptions,
  concurrencySignal?: { cancelled: boolean }
) {
  if (concurrencySignal?.cancelled) return
  await ensureDir(path.dirname(job.to))

  let pipeline = sharp(job.from, { failOn: 'none' }).rotate()

  if (opts.resize.enabled) {
    const meta = await sharp(job.from).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    let target: { width?: number; height?: number; fit?: keyof FitEnum } = {}

    if (opts.resize.mode === 'percent') {
      target = { width: Math.max(1, Math.round((w * opts.resize.percent) / 100)) }
    } else if (opts.resize.mode === 'longest') {
      if (w >= h) target = { width: opts.resize.longest }
      else target = { height: opts.resize.longest }
    } else {
      target = { width: opts.resize.width, height: opts.resize.height, fit: opts.resize.fit }
    }

    pipeline = pipeline.resize({
      ...target,
      withoutEnlargement: !opts.resize.enlarge
    } as ResizeOptions)
  }

  const q = Math.min(100, Math.max(1, Math.round(opts.quality)))
  const outExt = path.extname(job.to).toLowerCase()

  if (outExt === '.jpg' || outExt === '.jpeg') pipeline = pipeline.jpeg({ quality: q, mozjpeg: true })
  else if (outExt === '.png') pipeline = pipeline.png({ quality: q, compressionLevel: 9 })
  else if (outExt === '.webp') pipeline = pipeline.webp({ quality: q })
  else if (outExt === '.avif') pipeline = pipeline.avif({ quality: q })
  else if (outExt === '.tiff' || outExt === '.tif') pipeline = pipeline.tiff({ quality: q })

  const buf = await pipeline.toBuffer()
  await fsp.writeFile(job.to, buf)
  return buf.length
}
