const { z } = require('zod');

// A form where *users* configure limits on the API keys they issue. This application
// throttles nothing itself.
const apiKeySchema = z.object({
  name: z.string(),
  rateLimitEnabled: z.boolean().optional(),
  rateLimitTimeWindow: z.number().optional(),
  rateLimitMax: z.number().optional(),
});

module.exports = { apiKeySchema };
