import * as crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'

/** 快速哈希：只取首尾各 64KB + 文件大小，用于重复文件的初筛 */
const FAST_CHUNK = 64 * 1024

export async function fastHash(filePath: string, size: number): Promise<string> {
  const h = crypto.createHash('sha1')
  h.update(String(size))
  const fd = await fsp.open(filePath, 'r')
  try {
    const head = Buffer.alloc(Math.min(FAST_CHUNK, size))
    await fd.read(head, 0, head.length, 0)
    h.update(head)
    if (size > FAST_CHUNK * 2) {
      const tail = Buffer.alloc(FAST_CHUNK)
      await fd.read(tail, 0, tail.length, size - FAST_CHUNK)
      h.update(tail)
    }
  } finally {
    await fd.close()
  }
  return h.digest('hex')
}

export async function fullHash(filePath: string): Promise<string> {
  const h = crypto.createHash('sha256')
  const stream = (await import('node:fs')).createReadStream(filePath)
  for await (const chunk of stream) h.update(chunk as Buffer)
  return h.digest('hex')
}

export async function hashFile(filePath: string, size: number, thorough: boolean): Promise<string> {
  return thorough ? fullHash(filePath) : fastHash(filePath, size)
}
