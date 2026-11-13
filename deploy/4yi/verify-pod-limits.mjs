// kubectl get pods -n NAMESPACE -l APP_SELECTOR -o json | node deploy/4yi/verify-pod-limits.mjs
import { readFileSync } from 'node:fs'
export function cpu(value) {
  if (value === undefined) return Infinity
  const s=String(value), n=Number(s.replace(/[mun]$/, ''))
  return n * (s.endsWith('m')?1e-3:s.endsWith('u')?1e-6:s.endsWith('n')?1e-9:1)
}
export function memory(value) {
  if (value === undefined) return Infinity
  const m=/^([0-9.]+)([KMGT]i?|[kMGT]|)?$/.exec(String(value))
  if (!m) return Infinity
  const unit=m[2]||'', index='KMGT'.indexOf(unit[0]?.toUpperCase())
  return Number(m[1])*(unit? (unit.endsWith('i')?1024:1000)**(index+1):1)
}
export function verify(items) {
  const errors=[]
  if (!items?.length) return ['No Pods supplied']
  for(const pod of items) {
    const name=pod.metadata?.name||'unknown'
    const containers=pod.spec?.containers||[]
    if (!containers.length) errors.push(name+': no containers')
    // Include restartable init sidecars in the steady-state aggregate.
    const init=pod.spec?.initContainers||[]
    const sidecars=init.filter(c=>c.restartPolicy==='Always')
    for(const field of ['requests','limits']) {
      const sum=(list,key,parse)=>list.reduce((n,c)=>n+parse(c.resources?.[field]?.[key]),0)
      for(const [key,parse,max] of [['cpu',cpu,0.5],['memory',memory,1536*1024*1024]]) {
        let used=sum([...containers,...sidecars],key,parse)
        let running=[]
        for(const c of init) {
          if(c.restartPolicy==='Always') running.push(c)
          used=Math.max(used,sum(c.restartPolicy==='Always'?running:[...running,c],key,parse))
        }
        if(!Number.isFinite(used)||used>max) errors.push(name+': '+field+'.'+key+' missing or exceeds per-Pod cap')
      }
    }
  }
  return errors
}
if(process.argv[1]?.endsWith('/verify-pod-limits.mjs')) {
 const errors=verify(JSON.parse(readFileSync(0,'utf8')).items)
 if(errors.length) { console.error(errors.join('\n')); process.exitCode=1 }
 else console.log('All supplied Pods have requests and hard limits within 0.5 CPU / 1536 MiB.')
}
