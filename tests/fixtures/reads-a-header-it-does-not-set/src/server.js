const express = require('express')

const app = express()

/** Tells a customer why our script was blocked on their site. */
function checkDisallowedByCSP(responseHeaders, hostToCheck) {
  const policy = responseHeaders?.['content-security-policy']
  if (!policy) return false
  return !policy.split(';').some((directive) => directive.includes(hostToCheck))
}

app.get('/diagnose', async (req, res) => {
  const probe = await fetch(req.query.url)
  res.json({ blocked: checkDisallowedByCSP(Object.fromEntries(probe.headers), req.query.host) })
})

app.listen(3000)
