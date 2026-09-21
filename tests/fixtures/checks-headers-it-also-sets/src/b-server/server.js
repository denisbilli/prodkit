const express = require('express')

const app = express()

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'")
  next()
})

app.listen(3000)
