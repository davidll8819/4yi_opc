import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const service = process.env.VIDEO_SERVICE
if (!['ai', 'server'].includes(service)) throw new Error('VIDEO_SERVICE must be ai or server')
const config = process.env.VIDEO_CONFIG
if (!config?.startsWith('/')) throw new Error('VIDEO_CONFIG must be an absolute mounted configuration path')
await access(config)
process.umask(0o077)
const child = spawn(process.execPath, [`/app/apps/aitoearn-${service}/src/main.js`, '-c', config], { stdio: 'inherit' })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
child.on('error', () => { process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
