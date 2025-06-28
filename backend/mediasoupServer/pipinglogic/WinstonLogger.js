"use strict";
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../../backend/mediasoupServer/logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Normalize component name for filename
const normalizeComponentName = (contextName) => {
  // Remove special characters and convert to lowercase
  return contextName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
};

// Configure the Winston logger with formatting and transports
const createLogger = (contextName) => {
  // Get normalized component name for file
  const componentName = normalizeComponentName(contextName);
  
  return winston.createLogger({
    level: 'debug', // Set default log level
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${contextName}] ${level.toUpperCase()}: ${message}`;
      })
    ),
    transports: [
      new winston.transports.Console(),
      // Component-specific combined log file
      new winston.transports.File({ 
        filename: path.join(logsDir, `${componentName}.log`),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      }),
      // Component-specific error log file
      new winston.transports.File({ 
        filename: path.join(logsDir, `${componentName}-error.log`),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      }),
      // Also log to common files for aggregate view
      new winston.transports.File({ 
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      }),
      new winston.transports.File({ 
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      })
    ]
  });
};

// Create a logger wrapper that matches the interface of the original Logger
const WinstonLogger = (contextName) => {
  const logger = createLogger(contextName);
  
  return {
    debug: (message) => logger.debug(message),
    
    info: (message) => logger.info(message),
    
    warn: (message) => logger.warn(message),
    
    error: (message) => {
      const errorMessage = message instanceof Error ? message.message : message;
      logger.error(errorMessage);
    },
    
    // Add trace level
    trace: (message) => {
      // Winston doesn't have a trace level by default, map to debug
      logger.debug(`[TRACE] ${message}`);
    }
  };
};

module.exports = {
  WinstonLogger,
  createWinstonLogger: (contextName) => WinstonLogger(contextName)
}; 