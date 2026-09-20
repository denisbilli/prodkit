const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/login', async (req, res) => {
  const user = await db.users.findByEmail(req.body.email);
  if (!user || !(await bcrypt.compare(req.body.password, user.hash))) return res.sendStatus(401);
  res.json({ token: jwt.sign({ sub: user.id }, process.env.JWT_SECRET) });
});

module.exports = router;
