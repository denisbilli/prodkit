const express = require('express')

const app = express()

app.post('/accedi', (req, res) => res.json({ id: 1 }))

app.listen(3000)
