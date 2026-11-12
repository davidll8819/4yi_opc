import { cp, copyFile, mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve(process.argv[2])
await mkdir(target, { recursive: true })
for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc'])
  await copyFile(name, resolve(target, name))
for (const group of ['apps', 'libs']) {
  for (const entry of await readdir(group, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const relative = `${group}/${entry.name}`
    const destination = resolve(target, relative)
    await mkdir(destination, { recursive: true })
    try { await cp(`dist/${relative}`, destination, { recursive: true }) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    // Original manifests preserve workspace links and match the frozen lockfile.
    await copyFile(`${relative}/package.json`, resolve(destination, 'package.json'))
  }
}
