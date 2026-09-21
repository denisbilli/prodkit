const express = require('express')

const app = express()

app.get('/notes', (req, res) => {
  res.json({ db: process.env.DB_URL })
})

app.listen(process.env.PORT || 3000)
