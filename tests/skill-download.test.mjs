import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { hasRemoteSkill, loadSkillPackage } from '../apps/api/src/skill-download.mjs'
import { readSkillCatalog } from '../apps/api/src/skill-catalog.mjs'
const rev = 'e3a7b9103dfbb5fea4ee33022d501eba2f7680d8'
const bytes = Buffer.from('verified fixture')
const d = {
  status: 'downloaded',
  packagePath: 'skills/packages/test.zip',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sources: [
    `https://raw.githubusercontent.com/davidll8819/4yi_opc/${rev}/skills/packages/test.zip`,
    `https://api.github.com/repos/davidll8819/4yi_opc/git/blobs/${rev}`,
  ],
}
test('remote catalog remains installable without archives; primary and fallback are verified', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-remote-'))
  try {
    const catalog = await readSkillCatalog({
      root,
      catalog: { items: [{ id: 'one', download: d }] },
    })
    assert.equal(catalog.items[0].download.status, 'downloaded')
    assert.equal(catalog.items[0].download.remote, true)
    for (const first of ['ok', 'offline', 'corrupt', 'oversize']) {
      const calls = []
      const result = await loadSkillPackage(d, {
        root,
        fetchImpl: async (url, opts) => {
          calls.push(url)
          assert.equal(opts.redirect, 'error')
          assert.ok(opts.signal)
          if (calls.length === 1) {
            if (first === 'offline') throw new Error('network')
            if (first === 'corrupt') return new Response('wrong')
            if (first === 'oversize')
              return new Response('large', {
                headers: { 'content-length': String(65 * 1024 * 1024) },
              })
          }
          return url.startsWith('https://api.github.com/')
            ? Response.json({ encoding: 'base64', content: bytes.toString('base64') })
            : new Response(bytes)
        },
      })
      assert.deepEqual(result, bytes)
      assert.equal(calls.length, first === 'ok' ? 1 : 2)
    }
    await assert.rejects(
      loadSkillPackage(d, { root, fetchImpl: async () => new Response('bad') }),
      (e) => e.statusCode === 503,
    )
    for (const sources of [
      [d.sources[0].replace(rev, 'main'), d.sources[1]],
      ['http://localhost/secret', d.sources[1]],
      [d.sources[0] + '?x=1', d.sources[1]],
    ]) {
      const bad = { ...d, sources }
      assert.equal(hasRemoteSkill(bad), false)
      await assert.rejects(
        loadSkillPackage(bad, { root, fetchImpl: () => assert.fail('must not fetch') }),
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
