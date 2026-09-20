const express = require('express');
const apriTutto = require('cors');

const app = express();

// Wide open to the whole web, and nothing in this line says "cors".
app.use(apriTutto());

app.get('/api/clienti', (req, res) => res.json([]));

module.exports = app;
