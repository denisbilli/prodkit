const express = require('express');
const router = express.Router();

router.post('/password-reset', (req, res) => res.sendStatus(204));
router.post('/login', (req, res) => res.sendStatus(204));
router.post('/verify-email', async (req, res) => {
  const user = await isEmailVerified(req.body.token);
  res.json({ verified: Boolean(user) });
});

async function isEmailVerified(token) {
  return token ? { id: 'user' } : null;
}

module.exports = router;
