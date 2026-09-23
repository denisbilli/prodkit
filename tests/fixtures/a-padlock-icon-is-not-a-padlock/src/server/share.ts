import QRCode from 'qrcode';
import express from 'express';

const router = express.Router();

router.get('/shared-links/:id/qr', async (req, res) => {
  const png = await QRCode.toBuffer(`https://albums.example.com/s/${req.params.id}`);
  res.type('png').send(png);
});

export default router;
