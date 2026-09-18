const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ dest: 'uploads/' });

function authMiddleware(req, res, next) {
  return req.session?.userId ? next() : res.status(401).end();
}

app.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  const mimetype = req.file.mimetype;
  if (!['image/png', 'image/jpeg'].includes(mimetype)) {
    return res.status(415).json({ error: 'unsupported content-type' });
  }

  return res.json({ ok: true });
});

app.use('/uploads', authMiddleware, express.static('uploads'));

module.exports = app;
