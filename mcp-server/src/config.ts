import { config } from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file (with absolute path for MCP stdio mode)
config({ path: resolve(__dirname, '..', '.env') });

const envSchema = z.object({
  // Supabase configuration
  SUPABASE_URL: z.string().url().default('http://localhost:8000'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  STORAGE_BUCKET: z.string().default('documents-files'),

  // Default user for RLS ownership (required for documents created by MCP to be accessible in Angular app)
  DEFAULT_USER_ID: z.string().uuid().optional(),

  // HTTP server configuration
  HTTP_PORT: z.coerce.number().default(3100),

  // Authentication for HTTP server (production)
  AUTH_ENABLED: z.coerce.boolean().default(true),
  AUTH_USERNAME: z.string().default('admin'),
  AUTH_PASSWORD: z.string().default('changeme'),

  // Logging configuration
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Rate limiting configuration
  RATE_LIMIT_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // Retry configuration for Supabase
  RETRY_MAX_ATTEMPTS: z.coerce.number().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().default(1000),

  // Snapshot configuration
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().default(5),

  // Frontend app URL (for generating links in search results)
  APP_URL: z.string().url().default('http://localhost:4200'),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

export type Env = z.infer<typeof envSchema>;
