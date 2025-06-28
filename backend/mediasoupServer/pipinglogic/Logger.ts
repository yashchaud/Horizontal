import * as winston from 'winston';
import * as path from 'path';

// Import DailyRotateFile with require to avoid TypeScript issues
const DailyRotateFile = require('winston-daily-rotate-file');

/**
 * Logger class that wraps Winston logger with component-specific logging
 */
export class Logger {
  private logger: winston.Logger;

  /**
   * Create a new logger for a specific component
   * @param component The component name to use in logs
   */
  constructor(component: string) {
    // Configure log directory
    const logDir = path.join(__dirname, '..', '..', '..', 'logs');

    // Create custom format
    const logFormat = winston.format.printf(({ level, message, timestamp, component }) => {
      return `${timestamp} [${level.toUpperCase()}] [${component}]: ${message}`;
    });

    // Create the logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.splat(),
        logFormat
      ),
      defaultMeta: { component },
      transports: [
        // Console transport
        new winston.transports.Console(),
        
        // Info logs
        new DailyRotateFile({
          filename: path.join(logDir, `piping-info-%DATE%.log`),
          datePattern: 'YYYY-MM-DD',
          level: 'info',
          maxSize: '20m',
          maxFiles: '14d'
        }),
        
        // Error logs
        new DailyRotateFile({
          filename: path.join(logDir, `piping-error-%DATE%.log`),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '30d'
        }),
        
        // Debug logs
        new DailyRotateFile({
          filename: path.join(logDir, `piping-debug-%DATE%.log`),
          datePattern: 'YYYY-MM-DD',
          level: 'debug',
          maxSize: '20m',
          maxFiles: '7d'
        })
      ]
    });
  }

  /**
   * Log a debug message
   * @param message The message to log
   * @param args Optional format arguments
   */
  debug(message: string, ...args: any[]): void {
    this.logger.debug(message, ...args);
  }

  /**
   * Log an info message
   * @param message The message to log
   * @param args Optional format arguments
   */
  info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param args Optional format arguments
   */
  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param args Optional format arguments
   */
  error(message: string, ...args: any[]): void {
    this.logger.error(message, ...args);
  }
} 