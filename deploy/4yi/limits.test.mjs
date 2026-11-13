import test from 'node:test'
import assert from 'node:assert/strict'
import { verify } from './verify-pod-limits.mjs'
const c=(cpu='250m',memory='512Mi')=>({resources:{requests:{cpu,memory},limits:{cpu,memory}}})
const pod=(containers,initContainers=[])=>({metadata:{name:'test'},spec:{containers,initContainers}})
test('accepts aggregate under cap; rejects per-container-only cap, absent limits and oversized init',()=>{
 assert.deepEqual(verify([pod([c(),c()])]),[])
 assert.ok(verify([pod([c('500m'),c('500m')])]).length)
 assert.ok(verify([pod([{resources:{requests:{cpu:'100m',memory:'100Mi'}}}])]).length)
 assert.ok(verify([pod([c()], [c('1')])]).length)
 assert.ok(verify([pod([c()], [{...c('500m'),restartPolicy:'Always'}])]).length)
 assert.ok(verify([]).length)
})
