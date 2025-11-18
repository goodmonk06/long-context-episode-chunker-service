import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string(),

  // Server
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Segmentation
  DEFAULT_SEGMENTATION_MODE: z.enum(['heuristic', 'llm']).default('heuristic'),
  MAX_CHUNK_LENGTH: z.string().default('1000').transform(Number),
  MIN_EPISODE_CHUNKS: z.string().default('3').transform(Number),
  MAX_EPISODE_CHUNKS: z.string().default('50').transform(Number),
});

export type Config = z.infer<typeof envSchema>;

let config: Config;

try {
  config = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Configuration validation failed:');
    console.error(error.errors);
    process.exit(1);
  }
  throw error;
}

export { config };
