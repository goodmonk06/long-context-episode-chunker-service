import pino from 'pino';
import { config } from './config';

// Create the base logger
export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

// Utility functions for structured logging

export interface LogContext {
  [key: string]: unknown;
}

export function logInfo(message: string, context?: LogContext) {
  logger.info(context || {}, message);
}

export function logError(message: string, error?: Error | unknown, context?: LogContext) {
  const errorContext = error instanceof Error ? { err: error, ...context } : context;
  logger.error(errorContext || {}, message);
}

export function logWarn(message: string, context?: LogContext) {
  logger.warn(context || {}, message);
}

export function logDebug(message: string, context?: LogContext) {
  logger.debug(context || {}, message);
}

// Request correlation
let requestIdCounter = 0;

export function generateRequestId(): string {
  return `req-${Date.now()}-${++requestIdCounter}`;
}

export function createChildLogger(context: LogContext) {
  return logger.child(context);
}

// Performance tracking
export function startTimer(label: string): () => void {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    logDebug(`Timer: ${label}`, { duration, label });
    return duration;
  };
}

export { logger as default };
