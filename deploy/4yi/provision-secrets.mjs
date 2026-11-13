// Offline only: writes private material to a NEW ignored .secrets directory.
import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
const [directory, keyFile] = process.argv.slice(2)
if (!directory || !keyFile) throw Error('Usage: node deploy/4yi/provision-secrets.mjs .secrets/4yi <existing-key-file|--new-install>')
const out = resolve(directory)
const key = keyFile === '--new-install' ? randomBytes(32).toString('base64') : (await readFile(keyFile,'utf8')).trim()
if (Buffer.from(key,'base64').length !== 32) throw Error('Existing operations key must decode to 32 bytes')
await mkdir(out, { mode: 0o700 }) // Deliberately refuses existing directory.
const ssl = args => execFileSync('openssl', args, { cwd: out, stdio: ['ignore','ignore','pipe'] })
await writeFile(out+'/ca.cnf', '[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=AI Office internal CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n', {mode:0o600})
ssl(['req','-x509','-newkey','rsa:3072','-nodes','-days','3650','-config','ca.cnf','-keyout','ca.key','-out','ca.crt'])
const secrets = {
  APP_DB_PASSWORD: randomBytes(32).toString('hex'),
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  REDIS_PASSWORD: randomBytes(32).toString('hex'),
  OPERATIONS_CONFIG_KEY: key,
  INTERNAL_CA_CERT_B64: (await readFile(out+'/ca.crt')).toString('base64'),
}
for (const service of ['postgres','redis']) {
  const host = 'ai-office-saas-'+service
  await writeFile(out+'/'+service+'.cnf', 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:'+host+'\n', {mode:0o600})
  ssl(['req','-new','-newkey','rsa:3072','-nodes','-subj','/CN='+host,'-keyout',service+'.key','-out',service+'.csr'])
  ssl(['x509','-req','-in',service+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-days','365','-extfile',service+'.cnf','-out',service+'.crt'])
  await chmod(out+'/'+service+'.key',0o600)
  secrets[service.toUpperCase()+'_TLS_CERT_B64'] = (await readFile(out+'/'+service+'.crt')).toString('base64')
  secrets[service.toUpperCase()+'_TLS_KEY_B64'] = (await readFile(out+'/'+service+'.key')).toString('base64')
}
await chmod(out+'/ca.key',0o600)
await writeFile(out+'/secrets.json',JSON.stringify(secrets,null,2)+'\n',{mode:0o600})
console.log('Private material written to the requested directory. Import values as Secrets; never commit them.')
