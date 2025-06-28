const winston = require('winston');
const path = require('path');
// Import DailyRotateFile correctly
const DailyRotateFile = require('winston-daily-rotate-file');

// Configure log directory
const logDir = path.join(__dirname, '..', '..', 'logs');

// Create custom format
const logFormat = winston.format.printf(({ level, message, timestamp, component }) => {
  return `${timestamp} [${level.toUpperCase()}] [${component || 'server'}]: ${message}`;
});

// Create logger factory function
const createLogger = (component) => {
  return winston.createLogger({
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
        filename: path.join(logDir, `${component}-info-%DATE%.log`),
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        maxSize: '20m',
        maxFiles: '14d'
      }),
      
      // Error logs
      new DailyRotateFile({
        filename: path.join(logDir, `${component}-error-%DATE%.log`),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: '20m',
        maxFiles: '30d'
      }),
      
      // Debug logs (if debug level is enabled)
      new DailyRotateFile({
        filename: path.join(logDir, `${component}-debug-%DATE%.log`),
        datePattern: 'YYYY-MM-DD',
        level: 'debug',
        maxSize: '20m',
        maxFiles: '7d'
      })
    ]
  });
};

// Default logger
const defaultLogger = createLogger('mediasoup-server');

// Export both the factory and default logger
module.exports = {
  createLogger,
  logger: defaultLogger
}; 