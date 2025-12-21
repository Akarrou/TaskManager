import pino from 'pino';
/**
 * Structured logger for MCP server
 * Uses pino for high-performance JSON logging
 */
// Base logger configuration
const baseConfig = {
    level: process.env.LOG_LEVEL || 'info',
    base: {
        service: 'kodo-mcp',
        version: '0.3.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
};
// Use pino-pretty for development, JSON for production
const transport = process.env.NODE_ENV === 'production'
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
        },
    };
export const logger = pino({
    ...baseConfig,
    transport,
});
/**
 * Create a child logger with session context
 */
export function createSessionLogger(sessionId) {
    return logger.child({ sessionId });
}
/**
 * Create a child logger for a specific tool
 */
export function createToolLogger(toolName, sessionId) {
    return logger.child({
        tool: toolName,
        ...(sessionId ? { sessionId } : {}),
    });
}
/**
 * Log an MCP request
 */
export function logRequest(method, params, sessionId) {
    logger.info({ method, params, sessionId }, `MCP request: ${method}`);
}
/**
 * Log an MCP response
 */
export function logResponse(method, duration, error, sessionId) {
    if (error) {
        logger.error({ method, duration, error: error.message, sessionId }, `MCP error: ${method}`);
    }
    else {
        logger.info({ method, duration, sessionId }, `MCP response: ${method}`);
    }
}
/**
 * Log a Supabase operation
 */
export function logSupabase(operation, table, duration, error) {
    if (error) {
        logger.error({ operation, table, duration, error: error.message }, `Supabase error: ${operation} on ${table}`);
    }
    else {
        logger.debug({ operation, table, duration }, `Supabase: ${operation} on ${table}`);
    }
}
//# sourceMappingURL=logger.js.map