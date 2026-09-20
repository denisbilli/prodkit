const express = require('express');
const bcrypt = require('bcrypt');

const app = express();

app.post('/login', async (req, res) => {
  const user = await db.users.findByEmail(req.body.email);
  if (!user || !(await bcrypt.compare(req.body.password, user.hash))) return res.sendStatus(401);
  res.sendStatus(204);
});

module.exports = app;
