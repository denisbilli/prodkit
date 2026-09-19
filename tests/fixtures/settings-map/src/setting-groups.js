// Which group each setting belongs to. Sixty of these in the real thing.
const SETTING_GROUP = {
  members_public_key: 'core',
  members_private_key: 'core',
  members_email_auth_secret: 'core',
  admin_session_secret: 'core',
  theme_session_secret: 'core',
  ghost_public_key: 'core',
  db_hash: 'core',
  next_update_check: 'core',
  notifications: 'site',
  title: 'site',
};

module.exports = { SETTING_GROUP };
