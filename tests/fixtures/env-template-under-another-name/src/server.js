const express = require('express')

const app = express()

app.get('/photos', (req, res) => {
  res.json({ location: process.env.UPLOAD_LOCATION, db: process.env.DB_URL })
})

app.listen(process.env.PORT || 3000)
