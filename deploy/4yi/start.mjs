import { mkdir, writeFile } from 'node:fs/promises'
import { X509Certificate } from 'node:crypto'
import { spawn } from 'node:child_process'
import { makePool } from '../../apps/api/src/db.mjs'

const env = { ...process.env }
for (const name of ['APP_DB_PASSWORD','POSTGRES_PASSWORD','REDIS_PASSWORD','INTERNAL_CA_CERT_B64','OPERATIONS_CONFIG_KEY'])
  if (!env[name]) throw new Error('Missing required secret: ' + name)
if (!/^[a-zA-Z0-9]{32,}$/.test(env.APP_DB_PASSWORD)) throw new Error('Invalid APP_DB_PASSWORD')
if (Buffer.from(env.OPERATIONS_CONFIG_KEY, 'base64').length !== 32) throw new Error('Invalid OPERATIONS_CONFIG_KEY')
const ca = Buffer.from(env.INTERNAL_CA_CERT_B64, 'base64')
if (!new X509Certificate(ca).ca) throw new Error('Invalid internal CA')
await mkdir('/tmp/office-tls', { recursive: true, mode: 0o700 })
await writeFile('/tmp/office-tls/ca.crt', ca, { mode: 0o600 })
env.PGSSLROOTCERT = '/tmp/office-tls/ca.crt'
env.NODE_EXTRA_CA_CERTS = env.PGSSLROOTCERT
// Never inherit an external DATABASE_URL that overrides the internal service.
delete env.DATABASE_URL
env.PGHOST ||= 'ai-office-saas-postgres'
env.PGPORT ||= '5432'
env.PGDATABASE = 'office'
env.REDIS_URL = 'rediss://default:' + encodeURIComponent(env.REDIS_PASSWORD) + '@' + (env.REDIS_HOST || 'ai-office-saas-redis') + ':6379'
let child
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true
  if (child) child.kill(signal)
  else process.exit(0)
})
async function run(file, childEnv) {
  if (stopping) throw new Error('Startup cancelled')
  await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [file], { env: childEnv, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      child = undefined
      if (stopping) process.exit(0)
      code === 0 ? resolve() : reject(new Error(file + ' exited: ' + (signal || code)))
    })
  })
}
const adminEnv = { ...env, PGUSER: 'office_admin', PGPASSWORD: env.POSTGRES_PASSWORD }
const pool = await makePool(adminEnv)
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await pool.query('SELECT 1'); ready = true; break } catch {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  if (!ready) throw new Error('Internal PostgreSQL did not become ready')
} finally { await pool.end() }
// Existing migrations are idempotent and serialized with an advisory lock.
await run('database/bootstrap.mjs', adminEnv)
env.PGUSER = 'office_app'
env.PGPASSWORD = env.APP_DB_PASSWORD
for (const key of ['POSTGRES_PASSWORD','APP_DB_PASSWORD','REDIS_PASSWORD','INTERNAL_CA_CERT_B64']) delete env[key]
await run('apps/api/src/server.mjs', env)
