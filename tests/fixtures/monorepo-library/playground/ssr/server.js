const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('playground'));
module.exports = app;
