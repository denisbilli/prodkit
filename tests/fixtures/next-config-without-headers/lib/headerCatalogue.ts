export function headers() {
  return [
    {
      key: "X-Frame-Options",
      description: "Controls whether the page may be framed",
    },
    {
      key: "Strict-Transport-Security",
      description: "Tells browsers to use HTTPS only",
    },
  ];
}
