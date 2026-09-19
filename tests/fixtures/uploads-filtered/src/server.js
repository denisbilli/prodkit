const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({
  dest: 'tmp/',
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

app.post('/api/photos', upload.single('photo'), (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ stored: req.file.filename });
});

module.exports = app;
