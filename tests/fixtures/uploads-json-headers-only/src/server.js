const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ dest: 'tmp/' });

app.post('/api/documents', upload.single('document'), (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.json({ stored: req.file.filename });
});

app.use((err, req, res, next) => {
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end('{}');
});

module.exports = app;
