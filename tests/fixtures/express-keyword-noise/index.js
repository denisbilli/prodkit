const express = require('express');

const app = express();

const menu = [
  { role: 'undo' },
  { role: 'copy' },
  { role: 'toggleDevTools' },
];

const workspaceViewMode = process.env.WORKSPACE_VIEW_MODE || 'grid';
const workingDir = process.env.GITHUB_WORKSPACE || '/tmp/repo';

app.get('/export/video', (_req, res) => {
  res.json({ ok: true, menu, workspaceViewMode, workingDir });
});

app.listen(3011);
