"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
var winston = require("winston");
var path = require("path");
// Import DailyRotateFile with require to avoid TypeScript issues
var DailyRotateFile = require('winston-daily-rotate-file');
/**
 * Logger class that wraps Winston logger with component-specific logging
 */
var Logger = /** @class */ (function () {
    /**
     * Create a new logger for a specific component
     * @param component The component name to use in logs
     */
    function Logger(component) {
        // Configure log directory
        var logDir = path.join(__dirname, '..', '..', '..', 'logs');
        // Create custom format
        var logFormat = winston.format.printf(function (_a) {
            var level = _a.level, message = _a.message, timestamp = _a.timestamp, component = _a.component;
            return "".concat(timestamp, " [").concat(level.toUpperCase(), "] [").concat(component, "]: ").concat(message);
        });
        // Create the logger
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.splat(), logFormat),
            defaultMeta: { component: component },
            transports: [
                // Console transport
                new winston.transports.Console(),
                // Info logs
                new DailyRotateFile({
                    filename: path.join(logDir, "piping-info-%DATE%.log"),
                    datePattern: 'YYYY-MM-DD',
                    level: 'info',
                    maxSize: '20m',
                    maxFiles: '14d'
                }),
                // Error logs
                new DailyRotateFile({
                    filename: path.join(logDir, "piping-error-%DATE%.log"),
                    datePattern: 'YYYY-MM-DD',
                    level: 'error',
                    maxSize: '20m',
                    maxFiles: '30d'
                }),
                // Debug logs
                new DailyRotateFile({
                    filename: path.join(logDir, "piping-debug-%DATE%.log"),
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
    Logger.prototype.debug = function (message) {
        var _a;
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        (_a = this.logger).debug.apply(_a, __spreadArray([message], args, false));
    };
    /**
     * Log an info message
     * @param message The message to log
     * @param args Optional format arguments
     */
    Logger.prototype.info = function (message) {
        var _a;
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        (_a = this.logger).info.apply(_a, __spreadArray([message], args, false));
    };
    /**
     * Log a warning message
     * @param message The message to log
     * @param args Optional format arguments
     */
    Logger.prototype.warn = function (message) {
        var _a;
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        (_a = this.logger).warn.apply(_a, __spreadArray([message], args, false));
    };
    /**
     * Log an error message
     * @param message The message to log
     * @param args Optional format arguments
     */
    Logger.prototype.error = function (message) {
        var _a;
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        (_a = this.logger).error.apply(_a, __spreadArray([message], args, false));
    };
    return Logger;
}());
exports.Logger = Logger;
