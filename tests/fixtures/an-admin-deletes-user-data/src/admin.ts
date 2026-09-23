import express from 'express';
import { requireRole } from './auth';
import { db } from './db';

const router = express.Router();

router.post('/admin/users/:id/purge', requireRole('admin'), async (req, res) => {
  await deleteUserData(req.params.id);
  res.sendStatus(204);
});

async function deleteUserData(id: string) {
  await db.user.delete({ where: { id } });
}

export default router;
