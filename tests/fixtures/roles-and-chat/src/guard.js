const ROLE_EDITOR = 'editor';

function requireRole(allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

const canPublish = (member) => member.role === ROLE_EDITOR;

module.exports = { requireRole, canPublish };
