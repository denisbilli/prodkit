const express = require('express')

const app = express()

app.get('/photos', (req, res) => res.json([]))

app.listen(3000)
