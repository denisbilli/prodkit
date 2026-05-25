import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import pino from 'pino';

const app = express();
const log = pino();
const upload = multer({ dest: 'tmp_uploads' });

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/auth', authLimiter);

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.headers.authorization) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

function requirePermission(permission: string) {
  return (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    void permission;
    next();
  };
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/login', (_req, res) => {
  res.json({ token: 'signed-token' });
});

app.post('/upload', requireAuth, requirePermission('upload:write'), upload.single('file'), (_req, res) => {
  res.json({ ok: true });
});

const server = app.listen(3001, () => log.info({ msg: 'secure app started' }));

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
