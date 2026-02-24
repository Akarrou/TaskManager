import pino from 'pino';

/**
 * Structured logger for MCP server
 * Uses pino for high-performance JSON logging
 */

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'kodo-mcp',
    version: '0.3.1',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Use pino-pretty for development, JSON for production
// IMPORTANT: Always write to stderr (fd 2) to avoid corrupting MCP stdio transport on stdout
const transport = process.env.NODE_ENV === 'production'
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        destination: 2, // stderr — stdout is reserved for MCP JSON-RPC
      },
    };

export const logger = transport
  ? pino({ ...baseConfig, transport })
  : pino(baseConfig, pino.destination(2));

/**
 * Create a child logger with session context
 */
export function createSessionLogger(sessionId: string) {
  return logger.child({ sessionId });
}

/**
 * Create a child logger for a specific tool
 */
export function createToolLogger(toolName: string, sessionId?: string) {
  return logger.child({
    tool: toolName,
    ...(sessionId ? { sessionId } : {}),
  });
}

/**
 * Log an MCP request
 */
export function logRequest(method: string, params?: unknown, sessionId?: string) {
  logger.info({ method, params, sessionId }, `MCP request: ${method}`);
}

/**
 * Log an MCP response
 */
export function logResponse(method: string, duration: number, error?: Error, sessionId?: string) {
  if (error) {
    logger.error({ method, duration, error: error.message, sessionId }, `MCP error: ${method}`);
  } else {
    logger.info({ method, duration, sessionId }, `MCP response: ${method}`);
  }
}

/**
 * Log a Supabase operation
 */
export function logSupabase(operation: string, table: string, duration?: number, error?: Error) {
  if (error) {
    logger.error({ operation, table, duration, error: error.message }, `Supabase error: ${operation} on ${table}`);
  } else {
    logger.debug({ operation, table, duration }, `Supabase: ${operation} on ${table}`);
  }
}

export type Logger = pino.Logger;
