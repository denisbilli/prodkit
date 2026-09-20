function forDisplay(config) {
  const shown = { ...config };
  if (shown.jwt_secret) shown.jwt_secret = "***";
  if (shown.session_secret) shown.session_secret = "<redacted>";
  return shown;
}

module.exports = { forDisplay };
