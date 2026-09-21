export function microsoftFields() {
  return [
    field('authUrl', 'Auth URL', {
      hint: "Ex. https://login.microsoftonline.com/YOUR_DIRECTORY_TENANT_ID/oauth2/v2.0/authorize",
    }),
    field('tokenUrl', 'Token URL', {
      hint: "Ex. https://login.microsoftonline.com/YOUR_DIRECTORY_TENANT_ID/oauth2/v2.0/token",
    }),
  ]
}
