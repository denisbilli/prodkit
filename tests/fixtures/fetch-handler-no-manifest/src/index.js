// A module somebody imports, not a deployment. There is no manifest naming it.
export default {
  async fetch(request) {
    return new Response(JSON.stringify({ url: request.url }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
