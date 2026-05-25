const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use('/uploads', express.static('uploads'));

app.post('/login', (req, res) => {
  const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET || 'changeme');
  res.json({ token });
});

app.post('/register', (req, res) => {
  res.json({ ok: true });
});

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ ok: true, file: req.file?.filename });
});

app.listen(3000);
