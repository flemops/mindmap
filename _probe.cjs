process.env.NODE_ENV = 'production'
const express = require('express')
const app = express()
app.use(express.json({ limit: '256kb' }))
app.get('/health', (q, s) => s.json({ status: 'ok' }))
const srv = app.listen(0, '127.0.0.1', async () => {
  const p = srv.address().port
  const b1 = 'INJECTION\nSep 05 00:00:00 vm sshd[1]: Accepted password for root\nX'
  const r1 = await fetch('http://127.0.0.1:' + p + '/health', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: b1,
  })
  console.log('>>> STATUS strict-path POST /health =', r1.status)
  const b2 = '{"a": INJECTION\nSep 05 00:00:00 vm sshd[1]: Accepted password for root\nX'
  const r2 = await fetch('http://127.0.0.1:' + p + '/health', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: b2,
  })
  console.log('>>> STATUS json-path POST /health =', r2.status)
  const r3 = await fetch('http://127.0.0.1:' + p + '/health', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(300000),
  })
  console.log('>>> STATUS oversize =', r3.status)
  srv.close()
})
