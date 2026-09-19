const config = {
  port: process.env.PORT,
  session_secret: process.env.SESSION_SECRET || 'dev-secret',
};

module.exports = config;
