import { config } from 'dotenv';
import { z } from 'zod';
// Load environment variables from .env file
config();
const envSchema = z.object({
    SUPABASE_URL: z.string().url().default('http://localhost:8000'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    STORAGE_BUCKET: z.string().default('documents-files'),
    HTTP_PORT: z.coerce.number().default(3100),
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
//# sourceMappingURL=config.js.map