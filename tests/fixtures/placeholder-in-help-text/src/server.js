const express = require('express')
const bcrypt = require('bcryptjs')

const app = express()

app.post('/login', async (req, res) => {
  const user = await db.users.findByEmail(req.body.email)
  if (!user || !(await bcrypt.compare(req.body.password, user.hash))) {
    return res.status(401).json({ error: 'no' })
  }
  res.json({ id: user.id })
})

app.listen(3000)
