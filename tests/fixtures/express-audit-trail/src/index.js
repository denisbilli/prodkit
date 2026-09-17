const express = require('express');
const { Pool } = require('pg');

const pool = new Pool();
const app = express();

async function recordAuditEvent(organizationId, actorId, action, resource) {
  await pool.query(
    'INSERT INTO audit_events (organization_id, actor_id, action, resource, created_at) VALUES ($1,$2,$3,$4,$5)',
    [organizationId, actorId, action, resource, new Date().toISOString()]
  );
}

app.delete('/projects/:id', async (req, res) => {
  await recordAuditEvent(req.user.orgId, req.user.id, 'project.delete', req.params.id);
  res.status(204).end();
});

module.exports = app;
