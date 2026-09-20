const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

router.get('/feed', rateLimit({ windowMs: 60_000, max: 30 }), (req, res) => {
  res.json([]);
});

module.exports = router;
