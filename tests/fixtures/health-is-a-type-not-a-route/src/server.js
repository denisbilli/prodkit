const express = require('express')

const app = express()

app.get('/books', (req, res) => res.json([]))

app.listen(3000)
