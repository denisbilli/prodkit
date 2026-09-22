import express from 'express';
import { Logger } from 'tslog';
import { DistributedTracing } from './tracing';

const app = express();
const tracing = new DistributedTracing(new Logger());

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

app.post('/bookings', (req, res) => {
  const trace = tracing.createTrace('bookings.create');
  tracing.info(trace, 'booking requested');
  res.status(201).end();
});

app.listen(3000);
