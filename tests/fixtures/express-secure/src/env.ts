import { z } from 'zod';

const envSchema = z.object({
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().or(z.string().startsWith('http://localhost')),
});

export const env = envSchema.parse(process.env);
