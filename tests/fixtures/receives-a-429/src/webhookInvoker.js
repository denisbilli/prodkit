// This project calling somebody else's API and being throttled by them. Nothing here
// throttles anyone: it is the receiving end.
async function invoke(url, body) {
  const response = await fetch(url, { method: 'POST', body });
  if (response.status === 429) {
    const wait = Number(response.headers.get('retry-after') ?? 5);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return invoke(url, body);
  }
  return response;
}

module.exports = { invoke };
