const express = require('express');

const app = express();

function authMiddleware(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

app.use('/uploads', authMiddleware, express.static('uploads'));

app.listen(3003);
