const express = require('express');
const app = express();
app.use((req, res, next) => next());
app.get('/', (req, res) => res.send('deliberately unhardened sample'));
app.listen(3000);
