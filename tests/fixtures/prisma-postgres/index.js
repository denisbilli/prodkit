const { PrismaClient } = require('@prisma/client');
const express = require('express');

const prisma = new PrismaClient();
const app = express();

app.get('/projects', async (_req, res) => {
  res.json(await prisma.project.findMany());
});

module.exports = app;
