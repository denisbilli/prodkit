export function check23(responseHeaders) {
  const policy = responseHeaders?.['content-security-policy']
  const frame = responseHeaders?.['x-frame-options']
  return Boolean(policy && frame)
}
