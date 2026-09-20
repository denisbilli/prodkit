const express = require('express');

const router = express.Router();

router.get('/status', (req, res) => res.json({ ok: true }));

module.exports = router;
