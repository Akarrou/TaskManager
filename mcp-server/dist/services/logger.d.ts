import pino from 'pino';
export declare const logger: pino.Logger<never, boolean>;
/**
 * Create a child logger with session context
 */
export declare function createSessionLogger(sessionId: string): pino.Logger<never, boolean>;
/**
 * Create a child logger for a specific tool
 */
export declare function createToolLogger(toolName: string, sessionId?: string): pino.Logger<never, boolean>;
/**
 * Log an MCP request
 */
export declare function logRequest(method: string, params?: unknown, sessionId?: string): void;
/**
 * Log an MCP response
 */
export declare function logResponse(method: string, duration: number, error?: Error, sessionId?: string): void;
/**
 * Log a Supabase operation
 */
export declare function logSupabase(operation: string, table: string, duration?: number, error?: Error): void;
export type Logger = pino.Logger;
//# sourceMappingURL=logger.d.ts.map