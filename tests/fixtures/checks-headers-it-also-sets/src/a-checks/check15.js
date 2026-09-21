export function check15(responseHeaders) {
  const policy = responseHeaders?.['content-security-policy']
  const frame = responseHeaders?.['x-frame-options']
  return Boolean(policy && frame)
}
