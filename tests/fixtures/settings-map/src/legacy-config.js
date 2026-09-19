// Two properties, both plain strings: small enough to be configuration, and this one
// really does hardcode a secret.
const legacy = {
  session_secret: 'change-me-in-production',
  region: 'eu-west-1',
};

module.exports = legacy;
