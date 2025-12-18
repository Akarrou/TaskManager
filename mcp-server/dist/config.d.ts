import { z } from 'zod';
declare const envSchema: z.ZodObject<{
    SUPABASE_URL: z.ZodDefault<z.ZodString>;
    SUPABASE_SERVICE_ROLE_KEY: z.ZodString;
    STORAGE_BUCKET: z.ZodDefault<z.ZodString>;
    HTTP_PORT: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    STORAGE_BUCKET: string;
    HTTP_PORT: number;
}, {
    SUPABASE_SERVICE_ROLE_KEY: string;
    SUPABASE_URL?: string | undefined;
    STORAGE_BUCKET?: string | undefined;
    HTTP_PORT?: number | undefined;
}>;
export declare const env: {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    STORAGE_BUCKET: string;
    HTTP_PORT: number;
};
export type Env = z.infer<typeof envSchema>;
export {};
//# sourceMappingURL=config.d.ts.map