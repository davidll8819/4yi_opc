import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { fail } from './db.mjs'

const MAX_BYTES = 64 * 1024 * 1024
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
// Only publisher-controlled immutable public snapshots; never user-supplied hosts or redirects.
export function hasRemoteSkill(d) {
  return (
    d?.status === 'downloaded' &&
    /^[a-f0-9]{64}$/.test(d.sha256 || '') &&
    /^skills\/packages\/[a-zA-Z0-9_.-]+\.zip$/.test(d.packagePath || '') &&
    Array.isArray(d.sources) &&
    d.sources.length === 2 &&
    d.sources.every((source, index) => {
      const prefix =
        index === 0
          ? 'https://raw.githubusercontent.com/davidll8819/4yi_opc/'
          : 'https://api.github.com/repos/davidll8819/4yi_opc/git/blobs/'
      if (typeof source !== 'string' || !source.startsWith(prefix)) return false
      const tail = source.slice(prefix.length)
      return index === 1
        ? /^[a-f0-9]{40}$/.test(tail)
        : /^[a-f0-9]{40}\//.test(tail) && tail.slice(41) === d.packagePath
    })
  )
}

export async function loadSkillPackage(d, { root, fetchImpl = fetch } = {}) {
  // Existing local archives remain usable offline. Never follow a link outside the package directory.
  try {
    const allowed = await realpath(resolve(root, 'skills/packages'))
    const path = await realpath(resolve(root, d.packagePath))
    if (!path.startsWith(allowed + sep) || (await stat(path)).size > MAX_BYTES)
      throw fail(409, '技能包路径或大小不符合要求')
    const bytes = await readFile(path)
    if (hash(bytes) !== d.sha256) throw fail(409, '技能包校验失败，请重新下载对应文件')
    return bytes
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    if (!hasRemoteSkill(d)) throw fail(409, '本地技能包缺失，请恢复下载文件')
  }
  for (const source of d.sources) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      const response = await fetchImpl(source, { signal: controller.signal, redirect: 'error' })
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get('content-length')) > MAX_BYTES
      )
        throw new Error('unavailable')
      const chunks = []
      let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > MAX_BYTES) throw new Error('too large')
        chunks.push(Buffer.from(chunk))
      }
      let bytes = Buffer.concat(chunks)
      if (source.startsWith('https://api.github.com/')) {
        const blob = JSON.parse(bytes.toString('utf8'))
        if (blob.encoding !== 'base64' || typeof blob.content !== 'string')
          throw new Error('invalid blob')
        bytes = Buffer.from(blob.content, 'base64')
      }
      if (hash(bytes) !== d.sha256) throw new Error('checksum')
      return bytes
    } catch {
      // Try the independent delivery route; never accept unchecked bytes or log payloads.
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }
  throw fail(503, '技能下载失败或文件校验未通过，请检查网络后重试；已安装技能不受影响')
}
