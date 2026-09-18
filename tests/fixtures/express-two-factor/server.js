const express = require('express');

const app = express();

app.post('/login/verify', (req, res) => {
  const otpCode = req.body.code;
  if (!verifyOtp(req.user, otpCode)) {
    return res.status(401).json({ error: 'invalid code' });
  }
  return res.json({ ok: true });
});

function verifyOtp(user, code) {
  return user.otp_secret && code.length === 6;
}

module.exports = app;
