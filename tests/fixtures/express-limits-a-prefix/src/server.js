const express = require('express');
const throttleEverything = require('express-rate-limit');

const app = express();

const gate = throttleEverything({ windowMs: 900_000, max: 100 });
app.use('/api/', gate);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));

module.exports = app;
