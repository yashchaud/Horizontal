"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupPipedProducerResources = exports.getDataProducerInfo = exports.pipeMediaBetweenRouters = exports.handlePipeSignalingMessage = exports.handlePipeInitiateMessage = void 0;
var uuid_1 = require("uuid"); // For generating correlation IDs
var Logger_1 = require("./Logger");
// Create a logger instance
var logger = new Logger_1.Logger('RemotePiping');
// Set to track correlation IDs currently being processed for pipe initiation
var processingPipeInitiations = new Set();
// Helper to safely extract DataConsumer properties
var safeDataConsumerInfo = function (dataConsumer) {
    return {
        id: dataConsumer.id,
        dataProducerId: dataConsumer.dataProducerId,
        // Ensure sctpStreamParameters is never undefined
        sctpStreamParameters: dataConsumer.sctpStreamParameters || { streamId: 0, ordered: true },
        label: dataConsumer.label,
        protocol: dataConsumer.protocol
    };
};
// Logger is already defined at the top of the file
// Map to track the relationship between pipe transports and their associated consumers
var transportConsumerMap = new Map();
// ===== Pure Functions =====
/**
 * Validate options before piping
 * Pure function that checks if the options are valid
 */
var validatePipeOptions = function (options, localRouterId) {
    if (!options.targetRouterId) {
        throw new Error('Target router ID is required');
    }
    if (options.targetRouterId === localRouterId) {
        throw new Error('Cannot pipe a Router to itself');
    }
    if (!options.producerId && !options.dataProducerId) {
        throw new Error('Either producerId or dataProducerId must be specified');
    }
};
/**
 * Determine routing strategy (local vs remote)
 * Returns a function that will execute the appropriate piping strategy
 */
var determineRoutingStrategy = function (options, context) { return __awaiter(void 0, void 0, void 0, function () {
    var targetRouterId, targetServerId, isLocal, targetRouter_1, resolvedTargetServerId_1, _a, error_1, message;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 7, , 8]);
                targetRouterId = options.targetRouterId, targetServerId = options.targetServerId;
                return [4 /*yield*/, isLocalRouterSafe(targetRouterId, context)];
            case 1:
                isLocal = _b.sent();
                if (!isLocal) return [3 /*break*/, 3];
                logger.debug("Target router ".concat(targetRouterId, " is local. Using local piping."));
                return [4 /*yield*/, getLocalRouterSafe(targetRouterId, context)];
            case 2:
                targetRouter_1 = _b.sent();
                if (!targetRouter_1) {
                    throw new Error("Target router ".concat(targetRouterId, " is marked as local but not found"));
                }
                // Router events - using the correct event names for Router.observer
                targetRouter_1.observer.once('close', function () {
                    // Clean up any associated resources here
                    logger.debug('Target router closed, cleaning up pipe resources');
                });
                return [2 /*return*/, function () { return pipeToLocalRouter(options, __assign(__assign({}, context), { targetRouter: targetRouter_1 })); }];
            case 3:
                logger.debug("Target router ".concat(targetRouterId, " is remote. Using remote piping."));
                _a = targetServerId;
                if (_a) return [3 /*break*/, 5];
                return [4 /*yield*/, getServerIdForRouterSafe(targetRouterId, context)];
            case 4:
                _a = (_b.sent());
                _b.label = 5;
            case 5:
                resolvedTargetServerId_1 = _a;
                if (!resolvedTargetServerId_1) {
                    throw new Error("Could not resolve server ID for router ".concat(targetRouterId));
                }
                return [2 /*return*/, function () { return pipeToRemoteRouter(__assign(__assign({}, options), { targetServerId: resolvedTargetServerId_1 }), context); }];
            case 6: return [3 /*break*/, 8];
            case 7:
                error_1 = _b.sent();
                message = error_1 instanceof Error ? error_1.message : String(error_1);
                logger.error("Error determining routing strategy: ".concat(message));
                throw error_1;
            case 8: return [2 /*return*/];
        }
    });
}); };
/**
 * Pipe to a local router (same server)
 * Implementation of the local piping strategy
 */
var pipeToLocalRouter = function (options, context) { return __awaiter(void 0, void 0, void 0, function () {
    var localRouter_1, targetRouter_2, producerId, dataProducerId, createPipeTransportPair, _a, localTransport, remoteTransport, producer_1, pipeConsumer_1, pipeProducer_1, error_2, dataProducer_1, pipeDataConsumer, pipeDataProducer_1, error_3, error_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                logger.debug("Piping to local router ".concat(options.targetRouterId));
                _b.label = 1;
            case 1:
                _b.trys.push([1, 16, , 17]);
                localRouter_1 = context.localRouter, targetRouter_2 = context.targetRouter;
                producerId = options.producerId, dataProducerId = options.dataProducerId;
                createPipeTransportPair = function () { return __awaiter(void 0, void 0, void 0, function () {
                    var existingId, pipeTransportOptions, transport1, transport2, cleanupTransports;
                    var _a;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0: return [4 /*yield*/, ((_a = context.routerRegistry) === null || _a === void 0 ? void 0 : _a.findPipeTransport(localRouter_1.id, targetRouter_2.id))];
                            case 1:
                                existingId = _b.sent();
                                if (existingId) {
                                    // TODO: Implement reuse of existing pipe transport
                                    // This would require more complex state tracking
                                    logger.debug("Found existing pipe transport ".concat(existingId, ", but reuse not yet implemented"));
                                }
                                pipeTransportOptions = {
                                    listenIp: { ip: '127.0.0.1' }, // Local piping uses loopback
                                    enableSctp: !!options.enableSctp,
                                    enableRtx: !!options.enableRtx,
                                    enableSrtp: !!options.enableSrtp
                                };
                                logger.debug("Creating pipe transport pair with options: ".concat(JSON.stringify(pipeTransportOptions)));
                                return [4 /*yield*/, localRouter_1.createPipeTransport(pipeTransportOptions)];
                            case 2:
                                transport1 = _b.sent();
                                return [4 /*yield*/, targetRouter_2.createPipeTransport(pipeTransportOptions)];
                            case 3:
                                transport2 = _b.sent();
                                // Connect them
                                return [4 /*yield*/, transport1.connect({
                                        ip: '127.0.0.1',
                                        port: transport2.tuple.localPort,
                                        srtpParameters: transport2.srtpParameters // Include SRTP if enabled
                                    })];
                            case 4:
                                // Connect them
                                _b.sent();
                                return [4 /*yield*/, transport2.connect({
                                        ip: '127.0.0.1',
                                        port: transport1.tuple.localPort,
                                        srtpParameters: transport1.srtpParameters // Include SRTP if enabled
                                    })];
                            case 5:
                                _b.sent();
                                cleanupTransports = function () {
                                    var _a, _b;
                                    try {
                                        if (!transport1.closed)
                                            transport1.close();
                                        if (!transport2.closed)
                                            transport2.close();
                                        // Remove from registry on close
                                        (_a = context.routerRegistry) === null || _a === void 0 ? void 0 : _a.removePipeTransport(transport1.id).catch(function (e) {
                                            logger.error("Failed to remove pipe transport ".concat(transport1.id, ": ").concat(e));
                                        });
                                        (_b = context.routerRegistry) === null || _b === void 0 ? void 0 : _b.removePipeTransport(transport2.id).catch(function (e) {
                                            logger.error("Failed to remove pipe transport ".concat(transport2.id, ": ").concat(e));
                                        });
                                    }
                                    catch (cleanupError) {
                                        logger.error("Error during transport cleanup: ".concat(cleanupError));
                                    }
                                };
                                // Transport events - using the correct event name for Transport.observer
                                transport1.observer.once('close', function () {
                                    logger.debug('PipeTransport 1 closed, cleaning up pipe resources');
                                    cleanupTransports();
                                });
                                transport2.observer.once('close', function () {
                                    logger.debug('PipeTransport 2 closed, cleaning up pipe resources');
                                    cleanupTransports();
                                });
                                return [2 /*return*/, {
                                        localTransport: transport1,
                                        remoteTransport: transport2
                                    }];
                        }
                    });
                }); };
                return [4 /*yield*/, createPipeTransportPair()];
            case 2:
                _a = _b.sent(), localTransport = _a.localTransport, remoteTransport = _a.remoteTransport;
                if (!producerId) return [3 /*break*/, 9];
                // Check if producer lookup function is available
                if (!context.getProducer) {
                    throw new Error('getProducer function not available in context');
                }
                _b.label = 3;
            case 3:
                _b.trys.push([3, 7, , 8]);
                return [4 /*yield*/, context.getProducer(producerId)];
            case 4:
                producer_1 = _b.sent();
                if (!producer_1) {
                    throw new Error("Producer ".concat(producerId, " not found"));
                }
                logger.debug("Found producer ".concat(producerId, " for local piping"));
                return [4 /*yield*/, localTransport.consume({
                        producerId: producer_1.id
                    })];
            case 5:
                pipeConsumer_1 = _b.sent();
                return [4 /*yield*/, remoteTransport.produce({
                        id: producer_1.id,
                        kind: pipeConsumer_1.kind,
                        rtpParameters: pipeConsumer_1.rtpParameters,
                        paused: pipeConsumer_1.producerPaused,
                        appData: producer_1.appData
                    })];
            case 6:
                pipeProducer_1 = _b.sent();
                // Set up proper event forwarding
                producer_1.observer.once('close', function () {
                    logger.debug("Original producer ".concat(producer_1.id, " closed, closing pipe producer"));
                    if (!pipeProducer_1.closed)
                        pipeProducer_1.close();
                });
                pipeConsumer_1.observer.once('close', function () {
                    logger.debug("Pipe consumer closed, closing pipe producer");
                    if (!pipeProducer_1.closed)
                        pipeProducer_1.close();
                });
                pipeProducer_1.observer.once('close', function () {
                    logger.debug("Pipe producer closed, cleaning up resources");
                    if (!pipeConsumer_1.closed)
                        pipeConsumer_1.close();
                });
                // Forward pause/resume events
                producer_1.observer.on('pause', function () {
                    if (!pipeProducer_1.paused)
                        pipeProducer_1.pause();
                });
                producer_1.observer.on('resume', function () {
                    if (pipeProducer_1.paused)
                        pipeProducer_1.resume();
                });
                return [2 /*return*/, { pipeConsumer: pipeConsumer_1, pipeProducer: pipeProducer_1 }];
            case 7:
                error_2 = _b.sent();
                logger.error("Error handling producer piping: ".concat(error_2));
                throw error_2;
            case 8: return [3 /*break*/, 15];
            case 9:
                if (!dataProducerId) return [3 /*break*/, 15];
                // Check for data producer lookup function
                if (!context.getDataProducer) {
                    throw new Error('getDataProducer function not available in context');
                }
                _b.label = 10;
            case 10:
                _b.trys.push([10, 14, , 15]);
                return [4 /*yield*/, context.getDataProducer(dataProducerId)];
            case 11:
                dataProducer_1 = _b.sent();
                if (!dataProducer_1) {
                    throw new Error("DataProducer ".concat(dataProducerId, " not found"));
                }
                logger.debug("Found data producer ".concat(dataProducerId, " for local piping"));
                return [4 /*yield*/, localTransport.consumeData({
                        dataProducerId: dataProducer_1.id
                    })];
            case 12:
                pipeDataConsumer = _b.sent();
                return [4 /*yield*/, remoteTransport.produceData({
                        id: dataProducer_1.id,
                        sctpStreamParameters: pipeDataConsumer.sctpStreamParameters || { streamId: 0, ordered: true },
                        label: pipeDataConsumer.label,
                        protocol: pipeDataConsumer.protocol,
                        appData: dataProducer_1.appData
                    })];
            case 13:
                pipeDataProducer_1 = _b.sent();
                // Set up proper event forwarding
                dataProducer_1.observer.once('close', function () {
                    logger.debug("Original data producer ".concat(dataProducer_1.id, " closed, closing pipe data producer"));
                    if (!pipeDataProducer_1.closed)
                        pipeDataProducer_1.close();
                });
                pipeDataConsumer.observer.once('close', function () {
                    logger.debug("Pipe data consumer closed, closing pipe data producer");
                    if (!pipeDataProducer_1.closed)
                        pipeDataProducer_1.close();
                });
                // Return the pipe consumer and producer information
                return [2 /*return*/, {
                        pipeDataConsumer: safeDataConsumerInfo(pipeDataConsumer),
                        pipeDataProducer: pipeDataProducer_1
                    }];
            case 14:
                error_3 = _b.sent();
                logger.error("Error handling data producer piping: ".concat(error_3));
                throw error_3;
            case 15: 
            // If we reach this point, no piping was done
            return [2 /*return*/, {}];
            case 16:
                error_4 = _b.sent();
                logger.error("Error in pipeToLocalRouter: ".concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                throw error_4;
            case 17: return [2 /*return*/];
        }
    });
}); };
/**
 * Handle an incoming pipe initiate message
 * This function processes incoming pipe initiation requests from other servers
 */
var handlePipeInitiateMessage = function (message, context) { return __awaiter(void 0, void 0, void 0, function () {
    var localRouter, webSocketService, getProducer, correlationId, sourceServerId, sourceRouterId, producerId, dataProducerId, producerInfo, dataProducerInfo, roomName // Get room context
    , localPipeTransport, pipeProducer, pipeDataProducer, confirmMessage, error_5, errorMessage;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                localRouter = context.localRouter, webSocketService = context.webSocketService, getProducer = context.getProducer;
                correlationId = message.correlationId, sourceServerId = message.sourceServerId, sourceRouterId = message.sourceRouterId, producerId = message.producerId, dataProducerId = message.dataProducerId, producerInfo = message.producerInfo, dataProducerInfo = message.dataProducerInfo, roomName = message.roomName;
                // BEGIN FIX: Prevent concurrent processing of same correlation ID
                if (processingPipeInitiations.has(correlationId)) {
                    logger.warn("[Target] Received duplicate pipe_initiate for already processing corrId ".concat(correlationId, ". Ignoring."));
                    return [2 /*return*/]; // Silently ignore duplicates
                }
                processingPipeInitiations.add(correlationId);
                logger.debug("[Target] Added corrId ".concat(correlationId, " to processing set."));
                if (!(!webSocketService || !localRouter)) return [3 /*break*/, 3];
                logger.error("Cannot handle pipe_initiate: webSocketService or localRouter is undefined");
                if (!webSocketService) return [3 /*break*/, 2];
                return [4 /*yield*/, sendPipeRejectMessage(message, 'Internal server error: Missing context', webSocketService)];
            case 1:
                _d.sent();
                _d.label = 2;
            case 2:
                // Ensure cleanup in error case
                processingPipeInitiations.delete(correlationId);
                return [2 /*return*/];
            case 3:
                _d.trys.push([3, 17, 19, 20]);
                return [4 /*yield*/, localRouter.createPipeTransport({
                        // Fix for issue #2: Always use public IP instead of loopback/wildcard
                        listenIp: { ip: '0.0.0.0', announcedIp: webSocketService.getPublicIp() || '127.0.0.1' },
                        // Fix for issue #4: Ensure SRTP/RTX flags are mirrored correctly from options
                        enableSctp: !!((_a = message.options) === null || _a === void 0 ? void 0 : _a.enableSctp),
                        enableRtx: !!((_b = message.options) === null || _b === void 0 ? void 0 : _b.enableRtx),
                        enableSrtp: !!((_c = message.options) === null || _c === void 0 ? void 0 : _c.enableSrtp),
                        // Add roomName to appData for tracking
                        appData: { pipeTarget: true, correlationId: correlationId, roomName: roomName }
                    })];
            case 4:
                // 1. Create the PipeTransport on the target router
                localPipeTransport = _d.sent();
                logger.debug("[Target] Created PipeTransport ".concat(localPipeTransport.id, " for corrId ").concat(correlationId));
                // Handle event cleanup for this transport
                localPipeTransport.observer.once('close', function () {
                    logger.warn("[Target] PipeTransport ".concat(localPipeTransport === null || localPipeTransport === void 0 ? void 0 : localPipeTransport.id, " (corrId: ").concat(correlationId, ") closed."));
                    // Clean up producer if created
                    if (pipeProducer && !pipeProducer.closed)
                        pipeProducer.close();
                    if (pipeDataProducer && !pipeDataProducer.closed)
                        pipeDataProducer.close();
                    // Also remove from processing set on transport close
                    if (processingPipeInitiations.has(correlationId)) {
                        processingPipeInitiations.delete(correlationId);
                        logger.debug("[Target] Removed corrId ".concat(correlationId, " from processing set on transport close."));
                    }
                });
                if (!(producerId && producerInfo)) return [3 /*break*/, 9];
                return [4 /*yield*/, localPipeTransport.produce({
                        id: producerId, // Use the original producer ID
                        kind: producerInfo.kind,
                        rtpParameters: producerInfo.rtpParameters,
                        paused: producerInfo.paused || false,
                        appData: __assign(__assign({}, producerInfo.appData), { isPipeProducer: true, sourceServerId: sourceServerId, originalProducerId: producerId, // Keep original ID reference
                            correlationId: correlationId, roomName: roomName })
                    })];
            case 5:
                // FIXED: In the proper MediaSoup flow, the target router should create a PipeProducer
                // using the rtpParameters from the source producer
                // This producer will later feed data to the consumer created on the source router
                pipeProducer = _d.sent();
                logger.debug("[Target] Created PipeProducer ".concat(pipeProducer.id, " for original producer ").concat(producerId, ", corrId ").concat(correlationId));
                // Handle producer closure
                pipeProducer.observer.once('close', function () {
                    logger.warn("[Target] PipeProducer ".concat(pipeProducer === null || pipeProducer === void 0 ? void 0 : pipeProducer.id, " closed."));
                });
                if (!context.createRemoteProducer) return [3 /*break*/, 7];
                return [4 /*yield*/, context.createRemoteProducer({
                        id: producerId, // Use the original producer ID
                        kind: pipeProducer.kind,
                        rtpParameters: pipeProducer.rtpParameters,
                        routerId: localRouter.id,
                        proxyProducer: pipeProducer, // Store actual pipe producer
                        roomName: roomName // Pass room context
                    })];
            case 6:
                _d.sent();
                logger.debug("[Target] Registered remote producer ".concat(producerId, " locally via context.createRemoteProducer"));
                return [3 /*break*/, 8];
            case 7:
                logger.warn("[Target] createRemoteProducer function missing in context. Cannot register remote producer ".concat(producerId, "."));
                _d.label = 8;
            case 8: return [3 /*break*/, 12];
            case 9:
                if (!(dataProducerId && dataProducerInfo)) return [3 /*break*/, 11];
                return [4 /*yield*/, localPipeTransport.produceData({
                        id: dataProducerId, // Use original data producer ID
                        sctpStreamParameters: dataProducerInfo.sctpStreamParameters,
                        label: dataProducerInfo.label,
                        protocol: dataProducerInfo.protocol,
                        appData: __assign(__assign({}, dataProducerInfo.appData), { pipeDataProducer: true, correlationId: correlationId, roomName: roomName })
                    })];
            case 10:
                // Create a data producer for the data producer
                pipeDataProducer = _d.sent();
                logger.debug("[Target] Created PipeDataProducer ".concat(pipeDataProducer.id, " for dataProducer ").concat(dataProducerId, ", corrId ").concat(correlationId));
                return [3 /*break*/, 12];
            case 11: throw new Error('Pipe initiate message lacks producer or dataProducer details');
            case 12:
                confirmMessage = {
                    type: 'pipe_confirm',
                    correlationId: correlationId,
                    sourceServerId: webSocketService.getCurrentServerId(),
                    targetServerId: sourceServerId, // Send back to original sender
                    sourceRouterId: localRouter.id, // Our router ID
                    targetRouterId: sourceRouterId, // The router ID from the message
                    pipeTransportInfo: {
                        id: localPipeTransport.id,
                        ip: localPipeTransport.tuple.localAddress || webSocketService.getPublicIp(), // Prefer tuple address
                        port: localPipeTransport.tuple.localPort,
                        srtpParameters: localPipeTransport.srtpParameters // Include SRTP if enabled
                    }
                    // We don't include consumerInfo since we created a producer
                };
                if (!message.pipeTransportInfo) return [3 /*break*/, 14];
                logger.debug("[Target] Connecting local transport ".concat(localPipeTransport.id, " to source transport at ").concat(message.pipeTransportInfo.ip, ":").concat(message.pipeTransportInfo.port));
                return [4 /*yield*/, localPipeTransport.connect({
                        ip: message.pipeTransportInfo.ip,
                        port: message.pipeTransportInfo.port,
                        srtpParameters: message.pipeTransportInfo.srtpParameters
                    })];
            case 13:
                _d.sent();
                logger.debug("[Target] Successfully connected local transport to source transport");
                return [3 /*break*/, 15];
            case 14:
                logger.warn("[Target] Cannot connect transport: missing source transport info in message");
                _d.label = 15;
            case 15:
                logger.debug("[Target] Sending pipe_confirm [correlationId:".concat(correlationId, "] with transport ").concat(localPipeTransport.id, " details"));
                return [4 /*yield*/, webSocketService.sendMessage(sourceServerId, confirmMessage)];
            case 16:
                _d.sent();
                // Setup RTP observer AFTER confirming, as it might rely on producer state
                try {
                    setupRtpObserver(localRouter, context);
                }
                catch (err) {
                    logger.error("Failed to set up RTP observer: ".concat(err));
                }
                return [3 /*break*/, 20];
            case 17:
                error_5 = _d.sent();
                errorMessage = error_5 instanceof Error ? error_5.message : String(error_5);
                logger.error("[Target] Error handling pipe_initiate for corrId ".concat(correlationId, ": ").concat(errorMessage));
                // Clean up transport if created on error
                if (localPipeTransport && !localPipeTransport.closed) {
                    localPipeTransport.close();
                }
                // Clean up producer if created
                if (pipeProducer && !pipeProducer.closed) {
                    pipeProducer.close();
                }
                if (pipeDataProducer && !pipeDataProducer.closed) {
                    pipeDataProducer.close();
                }
                // Send rejection message
                return [4 /*yield*/, sendPipeRejectMessage(message, "Failed to process pipe initiate: ".concat(errorMessage), webSocketService)];
            case 18:
                // Send rejection message
                _d.sent();
                return [3 /*break*/, 20];
            case 19:
                // Ensure we always remove this correlation ID from the processing set
                if (processingPipeInitiations.has(correlationId)) {
                    processingPipeInitiations.delete(correlationId);
                    logger.debug("[Target] Removed corrId ".concat(correlationId, " from processing set in finally block."));
                }
                return [7 /*endfinally*/];
            case 20: return [2 /*return*/];
        }
    });
}); };
exports.handlePipeInitiateMessage = handlePipeInitiateMessage;
/**
 * Handle incoming pipe signaling messages
 * This function is responsible for routing the different types of pipe signaling messages
 */
var handlePipeSignalingMessage = function (message, context) { return __awaiter(void 0, void 0, void 0, function () {
    var type, _a, error_6, errorMessage;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                type = message.type;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 8, , 9]);
                logger.debug("Handling pipe signaling message of type: ".concat(type));
                _a = type;
                switch (_a) {
                    case 'pipe_initiate': return [3 /*break*/, 2];
                    case 'pipe_confirm': return [3 /*break*/, 4];
                    case 'pipe_reject': return [3 /*break*/, 4];
                }
                return [3 /*break*/, 6];
            case 2: return [4 /*yield*/, (0, exports.handlePipeInitiateMessage)(message, context)];
            case 3:
                _b.sent();
                return [3 /*break*/, 7];
            case 4: return [4 /*yield*/, handlePipeResponseMessage(message, context)];
            case 5:
                _b.sent();
                return [3 /*break*/, 7];
            case 6:
                logger.warn("Unknown pipe signaling message type: ".concat(type));
                _b.label = 7;
            case 7: return [3 /*break*/, 9];
            case 8:
                error_6 = _b.sent();
                errorMessage = error_6 instanceof Error ? error_6.message : String(error_6);
                logger.error("Error handling pipe signaling message: ".concat(errorMessage));
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); };
exports.handlePipeSignalingMessage = handlePipeSignalingMessage;
/**
 * Handle an incoming pipe response message (confirm or reject)
 */
var handlePipeResponseMessage = function (message, context) { return __awaiter(void 0, void 0, void 0, function () {
    var type, correlationId, error_7, pendingRequest, cleanupError_1, errorMsg;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                type = message.type, correlationId = message.correlationId;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 13]);
                logger.debug("Processing ".concat(type, " message with correlationId ").concat(correlationId));
                if (!(type === 'pipe_confirm')) return [3 /*break*/, 3];
                return [4 /*yield*/, handlePipeConfirmMessage(message, context)];
            case 2:
                _a.sent();
                return [3 /*break*/, 6];
            case 3:
                if (!(type === 'pipe_reject')) return [3 /*break*/, 5];
                return [4 /*yield*/, handlePipeRejectMessage(message, context)];
            case 4:
                _a.sent();
                return [3 /*break*/, 6];
            case 5: throw new Error("Unknown pipe response message type: ".concat(type));
            case 6: return [3 /*break*/, 13];
            case 7:
                error_7 = _a.sent();
                if (!context.pendingRequests) return [3 /*break*/, 12];
                pendingRequest = context.pendingRequests.get(correlationId);
                if (!pendingRequest) return [3 /*break*/, 12];
                _a.label = 8;
            case 8:
                _a.trys.push([8, 11, , 12]);
                clearTimeout(pendingRequest.timeout);
                // Close the transport if it exists
                if (pendingRequest.transport && !pendingRequest.transport.closed) {
                    pendingRequest.transport.close();
                }
                if (!(context.routerRegistry && pendingRequest.transport)) return [3 /*break*/, 10];
                return [4 /*yield*/, context.routerRegistry.removePipeTransport(pendingRequest.transport.id)
                        .catch(function (e) { return logger.error("Failed to remove pipe transport from registry: ".concat(e)); })];
            case 9:
                _a.sent();
                _a.label = 10;
            case 10:
                // Remove from map
                if (context.remotePipeTransports && pendingRequest.transport) {
                    context.remotePipeTransports.delete(pendingRequest.transport.id);
                }
                // Reject the pending promise
                pendingRequest.reject(new Error("Failed to handle pipe response: ".concat(error_7 instanceof Error ? error_7.message : String(error_7))));
                // Remove from pending requests
                context.pendingRequests.delete(correlationId);
                return [3 /*break*/, 12];
            case 11:
                cleanupError_1 = _a.sent();
                logger.error("Error during cleanup of failed pipe response: ".concat(cleanupError_1));
                return [3 /*break*/, 12];
            case 12:
                errorMsg = error_7 instanceof Error ? error_7.message : String(error_7);
                logger.error("Error handling pipe response message: ".concat(errorMsg));
                throw error_7;
            case 13: return [2 /*return*/];
        }
    });
}); };
/**
 * Handle a pipe confirm message
 * This function processes the confirmation from the target server and creates the consumer on the source side
 */
var handlePipeConfirmMessage = function (message, context) { return __awaiter(void 0, void 0, void 0, function () {
    var correlationId, pipeTransportInfo, pendingRequests, webSocketService, localRouter, pendingRequest, localPipeTransport, pipeConsumer, pipeDataConsumer, result, producer, consumerInfo, dataProducer, error_8, errorMessage;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                correlationId = message.correlationId, pipeTransportInfo = message.pipeTransportInfo;
                pendingRequests = context.pendingRequests, webSocketService = context.webSocketService, localRouter = context.localRouter;
                logger.debug("[Source] Received pipe_confirm [correlationId:".concat(correlationId, "]"));
                if (!pendingRequests || !webSocketService || !localRouter) {
                    logger.error("[Source] Cannot handle pipe_confirm ".concat(correlationId, ": Missing context"));
                    return [2 /*return*/]; // Cannot proceed
                }
                pendingRequest = pendingRequests.get(correlationId);
                if (!pendingRequest) {
                    logger.warn("[Source] No pending request found for correlationId: ".concat(correlationId));
                    return [2 /*return*/];
                }
                localPipeTransport = pendingRequest.transport;
                if (!localPipeTransport || localPipeTransport.closed) {
                    logger.error("[Source] Local PipeTransport for ".concat(correlationId, " not found or closed."));
                    clearTimeout(pendingRequest.timeout);
                    pendingRequest.reject(new Error('Local pipe transport missing or closed'));
                    pendingRequests.delete(correlationId);
                    return [2 /*return*/];
                }
                // Clear timeout now that we have confirmation
                clearTimeout(pendingRequest.timeout);
                result = {};
                _a.label = 1;
            case 1:
                _a.trys.push([1, 10, 11, 12]);
                // 2. Connect Local Transport to Remote Transport
                logger.debug("[Source] Connecting local transport ".concat(localPipeTransport.id, " to remote ").concat(pipeTransportInfo.ip, ":").concat(pipeTransportInfo.port, " for corrId ").concat(correlationId));
                // Fix for issue #3: Ensure transports are fully connected before creating consumers
                // Connect local transport to the remote transport from the confirmation
                return [4 /*yield*/, localPipeTransport.connect({
                        ip: pipeTransportInfo.ip,
                        port: pipeTransportInfo.port,
                        srtpParameters: pipeTransportInfo.srtpParameters // Use SRTP params from remote
                    })];
            case 2:
                // Fix for issue #3: Ensure transports are fully connected before creating consumers
                // Connect local transport to the remote transport from the confirmation
                _a.sent();
                logger.debug("[Source] Local transport ".concat(localPipeTransport.id, " connected successfully."));
                if (!(pendingRequest.type === 'producer' && pendingRequest.producerId)) return [3 /*break*/, 5];
                return [4 /*yield*/, context.getProducer(pendingRequest.producerId)];
            case 3:
                producer = _a.sent();
                if (!producer) {
                    throw new Error("Original producer ".concat(pendingRequest.producerId, " not found"));
                }
                return [4 /*yield*/, localPipeTransport.consume({
                        producerId: pendingRequest.producerId,
                        appData: __assign(__assign({}, producer === null || producer === void 0 ? void 0 : producer.appData), { isPipeConsumer: true, targetServerId: message.sourceServerId, targetPipeProducerId: pipeTransportInfo.id, // ID of the producer on the other side (might be useful)
                            correlationId: correlationId, roomName: pendingRequest.roomName })
                    })];
            case 4:
                // Create the consumer on our local transport that consumes the original producer
                pipeConsumer = _a.sent();
                consumerInfo = {
                    id: pipeConsumer.id,
                    producerId: pipeConsumer.producerId,
                    kind: pipeConsumer.kind,
                    rtpParameters: pipeConsumer.rtpParameters
                };
                result.pipeConsumer = consumerInfo; // Add to result
                logger.debug("[Source] Created PipeConsumer ".concat(pipeConsumer.id, " consuming original producer ").concat(pendingRequest.producerId, " on transport ").concat(localPipeTransport.id));
                // Link consumer lifetime to transport
                pipeConsumer.observer.once('close', function () {
                    logger.warn("[Source] PipeConsumer ".concat(pipeConsumer === null || pipeConsumer === void 0 ? void 0 : pipeConsumer.id, " closed."));
                    if (!localPipeTransport.closed)
                        localPipeTransport.close();
                });
                return [3 /*break*/, 9];
            case 5:
                if (!(pendingRequest.type === 'dataProducer' && pendingRequest.dataProducerId)) return [3 /*break*/, 8];
                return [4 /*yield*/, context.getDataProducer(pendingRequest.dataProducerId)];
            case 6:
                dataProducer = _a.sent();
                if (!dataProducer) {
                    throw new Error("Original data producer ".concat(pendingRequest.dataProducerId, " not found"));
                }
                return [4 /*yield*/, localPipeTransport.consumeData({
                        dataProducerId: pendingRequest.dataProducerId,
                        appData: { pipeDataConsumer: true, correlationId: correlationId, roomName: pendingRequest.roomName }
                    })];
            case 7:
                pipeDataConsumer = _a.sent();
                result.pipeDataConsumer = safeDataConsumerInfo(pipeDataConsumer);
                logger.debug("[Source] Created PipeDataConsumer ".concat(pipeDataConsumer.id, " consuming original data producer ").concat(pendingRequest.dataProducerId, " on transport ").concat(localPipeTransport.id));
                // Link lifetime
                pipeDataConsumer.observer.once('close', function () {
                    logger.warn("[Source] PipeDataConsumer ".concat(pipeDataConsumer === null || pipeDataConsumer === void 0 ? void 0 : pipeDataConsumer.id, " closed."));
                    if (!localPipeTransport.closed)
                        localPipeTransport.close();
                });
                return [3 /*break*/, 9];
            case 8: throw new Error('Missing producer/dataProducer ID in pending request');
            case 9:
                // 4. Resolve the Promise
                pendingRequest.resolve(result);
                logger.debug("[Source] Successfully resolved pipe request ".concat(correlationId));
                return [3 /*break*/, 12];
            case 10:
                error_8 = _a.sent();
                errorMessage = error_8 instanceof Error ? error_8.message : String(error_8);
                logger.error("[Source] Error handling pipe_confirm for ".concat(correlationId, ": ").concat(errorMessage));
                pendingRequest.reject(error_8); // Reject the promise on error
                // Close transport and consumers if created
                if (pipeConsumer && !pipeConsumer.closed)
                    pipeConsumer.close();
                if (pipeDataConsumer && !pipeDataConsumer.closed)
                    pipeDataConsumer.close();
                if (!localPipeTransport.closed)
                    localPipeTransport.close(); // Close transport last
                return [3 /*break*/, 12];
            case 11:
                // Always remove the pending request
                pendingRequests.delete(correlationId);
                return [7 /*endfinally*/];
            case 12: return [2 /*return*/];
        }
    });
}); };
/**
 * Handle a pipe reject message
 */
var handlePipeRejectMessage = function (message, context) { return __awaiter(void 0, void 0, void 0, function () {
    var correlationId, reason, pendingRequests, pendingRequest, errorMessage, pendingRequest;
    return __generator(this, function (_a) {
        correlationId = message.correlationId, reason = message.reason;
        pendingRequests = context.pendingRequests;
        logger.debug("Received pipe_reject [correlationId:".concat(correlationId, "]"));
        try {
            // Find the pending request using the correlation ID
            if (!pendingRequests || !pendingRequests.has(correlationId)) {
                logger.warn("No pending request found for correlationId ".concat(correlationId));
                return [2 /*return*/];
            }
            pendingRequest = pendingRequests.get(correlationId);
            if (!pendingRequest) {
                logger.warn("Pending request is null for correlationId: ".concat(correlationId));
                return [2 /*return*/];
            }
            // If we have timeouts set, clear them
            if (pendingRequest.timeout) {
                clearTimeout(pendingRequest.timeout);
            }
            // Reject the promise
            pendingRequest.reject(new Error("Remote pipe rejected: ".concat(reason)));
            // And remove from pendingRequests
            pendingRequests.delete(correlationId);
            logger.info("Pipe request ".concat(correlationId, " rejected: ").concat(reason));
        }
        catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
            logger.error("Failed to handle pipe_reject: ".concat(errorMessage));
            // Even on error, try to clean up the pending request
            if (pendingRequests && pendingRequests.has(correlationId)) {
                pendingRequest = pendingRequests.get(correlationId);
                if (pendingRequest && pendingRequest.timeout) {
                    clearTimeout(pendingRequest.timeout);
                }
                pendingRequests.delete(correlationId);
            }
        }
        return [2 /*return*/];
    });
}); };
/**
 * Pipe to a remote router (different server)
 * Implementation of the remote piping strategy using cross-server signaling
 */
var pipeToRemoteRouter = function (options, context) { return __awaiter(void 0, void 0, void 0, function () {
    var localRouter, webSocketService, pendingRequests, getProducer, getDataProducer // Make sure these are passed in context
    , producerId, dataProducerId, targetRouterId, targetServerId, roomName, pipedProducersSet, pipeKey, correlationId, localPipeTransport, producerInfo, actualProducerId_1, producer, dataProducerInfo, dataProducer, setupSignalingPromise, initiateMessage, error_9, errorMessage, req;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                localRouter = context.localRouter, webSocketService = context.webSocketService, pendingRequests = context.pendingRequests, getProducer = context.getProducer, getDataProducer = context.getDataProducer;
                producerId = options.producerId, dataProducerId = options.dataProducerId, targetRouterId = options.targetRouterId, targetServerId = options.targetServerId, roomName = options.roomName;
                // Validate context
                if (!webSocketService || !pendingRequests || !localRouter) {
                    throw new Error('Missing required context (webSocketService, pendingRequests, localRouter) for remote piping');
                }
                if (!targetServerId) {
                    throw new Error('targetServerId is required');
                }
                // FIX for issue #6: Check if producer is already piped to prevent race conditions
                // Create a piped producers Set if not exists
                if (!context.pipedProducers) {
                    context.pipedProducers = new Set();
                }
                pipedProducersSet = context.pipedProducers;
                pipeKey = "".concat(producerId || dataProducerId, ":").concat(targetRouterId);
                if (pipedProducersSet.has(pipeKey)) {
                    logger.debug("[Source] Producer ".concat(producerId || dataProducerId, " already piped to router ").concat(targetRouterId, ". Skipping duplicate."));
                    return [2 /*return*/, {}]; // Return empty result since already piped
                }
                // Mark as being piped to prevent duplicates
                pipedProducersSet.add(pipeKey);
                logger.debug("[Source] Marking ".concat(pipeKey, " as being piped"));
                correlationId = (0, uuid_1.v4)();
                _d.label = 1;
            case 1:
                _d.trys.push([1, 9, , 10]);
                producerInfo = void 0;
                actualProducerId_1 = producerId;
                if (!producerId) return [3 /*break*/, 3];
                return [4 /*yield*/, (getProducer === null || getProducer === void 0 ? void 0 : getProducer(producerId))];
            case 2:
                producer = _d.sent();
                if (!producer)
                    throw new Error("Producer ".concat(producerId, " not found locally."));
                producerInfo = {
                    id: producer.id,
                    kind: producer.kind,
                    rtpParameters: producer.rtpParameters,
                    paused: producer.paused,
                    appData: producer.appData
                };
                actualProducerId_1 = producer.id; // Confirm ID
                logger.debug("[Source] Retrieved producer info for ".concat(actualProducerId_1));
                _d.label = 3;
            case 3:
                dataProducerInfo = void 0;
                if (!dataProducerId) return [3 /*break*/, 5];
                return [4 /*yield*/, (getDataProducer === null || getDataProducer === void 0 ? void 0 : getDataProducer(dataProducerId))];
            case 4:
                dataProducer = _d.sent();
                if (!dataProducer)
                    throw new Error("DataProducer ".concat(dataProducerId, " not found locally."));
                dataProducerInfo = {
                    id: dataProducer.id,
                    sctpStreamParameters: dataProducer.sctpStreamParameters,
                    label: dataProducer.label,
                    protocol: dataProducer.protocol,
                    appData: dataProducer.appData
                };
                logger.debug("[Source] Retrieved dataProducer info for ".concat(dataProducerId));
                _d.label = 5;
            case 5:
                if (!producerInfo && !dataProducerInfo) {
                    throw new Error('No valid producer or dataProducer found for piping.');
                }
                return [4 /*yield*/, localRouter.createPipeTransport({
                        listenIp: { ip: '127.0.0.1' },
                        enableSctp: (_a = options.enableSctp) !== null && _a !== void 0 ? _a : true,
                        enableRtx: (_b = options.enableRtx) !== null && _b !== void 0 ? _b : true,
                        enableSrtp: (_c = options.enableSrtp) !== null && _c !== void 0 ? _c : false,
                        appData: { pipeSource: true, correlationId: correlationId, roomName: roomName } // Add metadata
                    })];
            case 6:
                // 2. Create the LOCAL PipeTransport *before* sending initiate
                localPipeTransport = _d.sent();
                logger.debug("[Source] Created PipeTransport ".concat(localPipeTransport.id, " for corrId ").concat(correlationId));
                // Handle transport closure for cleanup
                localPipeTransport.observer.once('close', function () {
                    var _a;
                    logger.warn("[Source] PipeTransport ".concat(localPipeTransport === null || localPipeTransport === void 0 ? void 0 : localPipeTransport.id, " (corrId: ").concat(correlationId, ") closed."));
                    // Clean up pending request if it still exists for this transport
                    if (pendingRequests.has(correlationId)) {
                        var req = pendingRequests.get(correlationId);
                        if (req && ((_a = req.transport) === null || _a === void 0 ? void 0 : _a.id) === (localPipeTransport === null || localPipeTransport === void 0 ? void 0 : localPipeTransport.id)) {
                            clearTimeout(req.timeout);
                            req.reject(new Error("PipeTransport ".concat(localPipeTransport === null || localPipeTransport === void 0 ? void 0 : localPipeTransport.id, " closed prematurely.")));
                            pendingRequests.delete(correlationId);
                            logger.debug("[Source] Removed pending request ".concat(correlationId, " due to transport close."));
                        }
                    }
                });
                setupSignalingPromise = new Promise(function (resolve, reject) {
                    var timeoutDuration = context.pipeTimeout || 30000;
                    var timeoutTimer = setTimeout(function () {
                        logger.error("[Source] Pipe request ".concat(correlationId, " timed out after ").concat(timeoutDuration, "ms."));
                        if (pendingRequests.has(correlationId)) {
                            var req = pendingRequests.get(correlationId);
                            if (req) {
                                req.reject(new Error("Pipe operation timed out for ".concat(correlationId, " after ").concat(timeoutDuration, "ms")));
                            }
                            pendingRequests.delete(correlationId);
                            logger.debug("[Source] Removed pending request ".concat(correlationId, " due to timeout."));
                            // Close the transport associated with the timed-out request
                            if (localPipeTransport && !localPipeTransport.closed) {
                                logger.warn("[Source] Closing PipeTransport ".concat(localPipeTransport.id, " due to timeout for ").concat(correlationId, "."));
                                localPipeTransport.close();
                            }
                        }
                    }, timeoutDuration);
                    // Store the transport with the pending request for use in handlePipeConfirmMessage
                    // Include targetRouterId to help identify potential duplicates
                    pendingRequests.set(correlationId, {
                        resolve: resolve,
                        reject: reject,
                        timeout: timeoutTimer,
                        transport: localPipeTransport, // ** Store the transport ** (with non-null assertion)
                        type: producerId ? 'producer' : 'dataProducer',
                        producerId: actualProducerId_1,
                        dataProducerId: dataProducerId,
                        roomName: roomName,
                        targetRouterId: targetRouterId // Add target router ID for duplicate detection
                    });
                    logger.debug("[Source] Stored pending request ".concat(correlationId, " with transport ").concat(localPipeTransport === null || localPipeTransport === void 0 ? void 0 : localPipeTransport.id, " targeting router ").concat(targetRouterId));
                });
                initiateMessage = {
                    type: 'pipe_initiate',
                    correlationId: correlationId,
                    sourceServerId: webSocketService.getCurrentServerId(),
                    targetServerId: targetServerId,
                    sourceRouterId: localRouter.id,
                    targetRouterId: targetRouterId,
                    producerId: actualProducerId_1,
                    dataProducerId: dataProducerId,
                    producerInfo: producerInfo, // Send extracted info
                    dataProducerInfo: dataProducerInfo, // Send extracted info
                    roomName: roomName,
                    // Fix for issue #1 & #2: Include transport details in the initial message
                    pipeTransportInfo: {
                        id: localPipeTransport.id,
                        ip: webSocketService.getPublicIp() || localPipeTransport.tuple.localAddress,
                        port: localPipeTransport.tuple.localPort,
                        srtpParameters: localPipeTransport.srtpParameters
                    },
                    // Include options needed by the target
                    options: {
                        enableSctp: options.enableSctp,
                        enableRtx: options.enableRtx,
                        enableSrtp: options.enableSrtp
                    }
                };
                logger.debug("[Source] Sending pipe_initiate [correlationId:".concat(correlationId, "] to ").concat(targetServerId));
                return [4 /*yield*/, webSocketService.sendMessage(targetServerId, initiateMessage)];
            case 7:
                _d.sent();
                return [4 /*yield*/, setupSignalingPromise];
            case 8: 
            // 5. Wait for the response promise
            return [2 /*return*/, _d.sent()];
            case 9:
                error_9 = _d.sent();
                errorMessage = error_9 instanceof Error ? error_9.message : String(error_9);
                logger.error("[Source] Error in pipeToRemoteRouter for corrId ".concat(correlationId, ": ").concat(errorMessage));
                // Cleanup on error
                if (pendingRequests.has(correlationId)) {
                    req = pendingRequests.get(correlationId);
                    if (req)
                        clearTimeout(req.timeout);
                    pendingRequests.delete(correlationId);
                    logger.debug("[Source] Removed pending request ".concat(correlationId, " due to error."));
                }
                if (localPipeTransport && !localPipeTransport.closed) {
                    logger.warn("[Source] Closing PipeTransport ".concat(localPipeTransport.id, " due to error during initiation for ").concat(correlationId, "."));
                    localPipeTransport.close();
                }
                throw error_9; // Re-throw
            case 10: return [2 /*return*/];
        }
    });
}); };
/**
 * Main entry point function that orchestrates the piping between routers
 * This is what you'd export and call from other parts of your application
 */
var pipeMediaBetweenRouters = function (options, context) { return __awaiter(void 0, void 0, void 0, function () {
    var isLocal, targetRouter_3, resolvedTargetServerId_2, _a, error_10, errorMessage;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                logger.debug("Deciding pipe strategy for router ".concat(options.targetRouterId));
                _b.label = 1;
            case 1:
                _b.trys.push([1, 8, , 9]);
                return [4 /*yield*/, isLocalRouterSafe(options.targetRouterId, context)];
            case 2:
                isLocal = _b.sent();
                if (!isLocal) return [3 /*break*/, 4];
                logger.debug("Target router ".concat(options.targetRouterId, " is local. Using local piping."));
                return [4 /*yield*/, getLocalRouterSafe(options.targetRouterId, context)];
            case 3:
                targetRouter_3 = _b.sent();
                if (!targetRouter_3) {
                    throw new Error("Target router ".concat(options.targetRouterId, " is marked as local but not found"));
                }
                // Router events - using the correct event names for Router.observer
                targetRouter_3.observer.once('close', function () {
                    // Clean up any associated resources here
                    logger.debug('Target router closed, cleaning up pipe resources');
                });
                return [2 /*return*/, function () { return pipeToLocalRouter(options, __assign(__assign({}, context), { targetRouter: targetRouter_3 })); }];
            case 4:
                logger.debug("Target router ".concat(options.targetRouterId, " is remote. Using remote piping."));
                _a = options.targetServerId;
                if (_a) return [3 /*break*/, 6];
                return [4 /*yield*/, getServerIdForRouterSafe(options.targetRouterId, context)];
            case 5:
                _a = (_b.sent());
                _b.label = 6;
            case 6:
                resolvedTargetServerId_2 = _a;
                if (!resolvedTargetServerId_2) {
                    throw new Error("Could not resolve server ID for router ".concat(options.targetRouterId));
                }
                return [2 /*return*/, function () { return pipeToRemoteRouter(__assign(__assign({}, options), { targetServerId: resolvedTargetServerId_2 }), context); }];
            case 7: return [3 /*break*/, 9];
            case 8:
                error_10 = _b.sent();
                errorMessage = error_10 instanceof Error ? error_10.message : String(error_10);
                logger.error("Failed to decide pipe strategy: ".concat(errorMessage));
                throw error_10;
            case 9: return [2 /*return*/];
        }
    });
}); };
exports.pipeMediaBetweenRouters = pipeMediaBetweenRouters;
/**
 * Get data producer information needed for piping
 */
var getDataProducerInfo = function (dataProducerId, context) { return __awaiter(void 0, void 0, void 0, function () {
    var dataProducer, sctpParams;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (!dataProducerId) {
                    throw new Error('dataProducerId is required');
                }
                return [4 /*yield*/, ((_a = context.getDataProducer) === null || _a === void 0 ? void 0 : _a.call(context, dataProducerId))];
            case 1:
                dataProducer = _b.sent();
                if (!dataProducer) {
                    throw new Error("DataProducer with ID ".concat(dataProducerId, " not found"));
                }
                sctpParams = dataProducer.sctpStreamParameters || { streamId: 0, ordered: true };
                // Extract the necessary information for piping
                return [2 /*return*/, {
                        sctpStreamParameters: sctpParams,
                        label: dataProducer.label,
                        protocol: dataProducer.protocol,
                        appData: dataProducer.appData
                    }];
        }
    });
}); };
exports.getDataProducerInfo = getDataProducerInfo;
/**
 * Create an enhanced proxy for a producer that handles keyframe requests for piped producers
 * This is a critical workaround for handling RTP/RTCP PLI (Picture Loss Indication) requests
 */
var createEnhancedProducerProxy = function (originalProducer) {
    // Only add custom implementation for video producers
    if (originalProducer.kind !== 'video') {
        return originalProducer;
    }
    // Create a proxy to intercept method calls
    var producerProxy = new Proxy(originalProducer, {
        get: function (target, prop, receiver) {
            var _this = this;
            // Intercept the requestKeyFrame method
            if (prop === 'requestKeyFrame') {
                // Return our custom implementation as an async function
                return function () { return __awaiter(_this, void 0, void 0, function () {
                    var consumer, error_11, errorMsg, error_12, error_13, error_14;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                logger.debug("Enhanced requestKeyFrame called on producer ".concat(target.id));
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 16, , 17]);
                                if (!transportConsumerMap.has(target.id)) return [3 /*break*/, 5];
                                consumer = transportConsumerMap.get(target.id);
                                if (!(consumer && typeof consumer.requestKeyFrame === 'function')) return [3 /*break*/, 5];
                                _a.label = 2;
                            case 2:
                                _a.trys.push([2, 4, , 5]);
                                logger.debug("Requesting keyframe through pipeConsumer ".concat(consumer.id));
                                return [4 /*yield*/, consumer.requestKeyFrame()];
                            case 3:
                                _a.sent();
                                logger.debug("Successfully requested keyframe through pipeConsumer for producer ".concat(target.id));
                                return [2 /*return*/];
                            case 4:
                                error_11 = _a.sent();
                                errorMsg = error_11 instanceof Error ? error_11.message : String(error_11);
                                // mappedSsrc not found is a common error early in the pipeConsumer lifecycle
                                if (errorMsg.includes('mappedSsrc not found')) {
                                    logger.debug("Expected error when requesting keyframe: ".concat(errorMsg));
                                }
                                else {
                                    logger.warn("Error requesting keyframe through pipeConsumer: ".concat(errorMsg));
                                }
                                return [3 /*break*/, 5];
                            case 5:
                                if (!(typeof target.refresh === 'function')) return [3 /*break*/, 9];
                                _a.label = 6;
                            case 6:
                                _a.trys.push([6, 8, , 9]);
                                return [4 /*yield*/, target.refresh()];
                            case 7:
                                _a.sent();
                                logger.debug("Successfully called refresh() on producer ".concat(target.id));
                                return [2 /*return*/];
                            case 8:
                                error_12 = _a.sent();
                                logger.warn("Failed to call refresh: ".concat(error_12 instanceof Error ? error_12.message : String(error_12)));
                                return [3 /*break*/, 9];
                            case 9:
                                if (!!target.paused) return [3 /*break*/, 15];
                                _a.label = 10;
                            case 10:
                                _a.trys.push([10, 14, , 15]);
                                logger.debug("Attempting pause/resume cycle for producer ".concat(target.id));
                                return [4 /*yield*/, target.pause()];
                            case 11:
                                _a.sent();
                                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                            case 12:
                                _a.sent();
                                return [4 /*yield*/, target.resume()];
                            case 13:
                                _a.sent();
                                logger.debug("Successfully completed pause/resume for producer ".concat(target.id));
                                return [2 /*return*/];
                            case 14:
                                error_13 = _a.sent();
                                logger.warn("Error in pause/resume cycle: ".concat(error_13 instanceof Error ? error_13.message : String(error_13)));
                                return [3 /*break*/, 15];
                            case 15:
                                // If we reach here, all methods have failed
                                logger.warn("All keyframe request methods failed for piped producer ".concat(target.id));
                                return [3 /*break*/, 17];
                            case 16:
                                error_14 = _a.sent();
                                logger.error("Error in requestKeyFrame: ".concat(error_14 instanceof Error ? error_14.message : String(error_14)));
                                return [3 /*break*/, 17];
                            case 17: 
                            // Return without throwing to prevent crashes
                            return [2 /*return*/];
                        }
                    });
                }); };
            }
            // Default behavior for all other properties
            return Reflect.get(target, prop, receiver);
        }
    });
    return producerProxy;
};
/**
 * Utility to setup RTP observers for a router to detect video quality issues
 * and automatically trigger keyframe requests
 */
var setupRtpObserver = function (router, context) {
    var _a, _b;
    if (!router)
        return;
    logger.debug("Setting up RTP observer for router ".concat(router.id));
    try {
        // Track producers that have received frames
        var framesReceived = new Set();
        // Create RTP observer to monitor RTP packets and detect issues
        // Note: createRtpObserver may not be available in all mediasoup versions
        // Use type assertion to handle this
        var rtpObserver = (_b = (_a = router).createRtpObserver) === null || _b === void 0 ? void 0 : _b.call(_a, {
            // Required RTP capabilities
            rtpCapabilities: {
                codecs: [
                    { mimeType: 'video/VP8', clockRate: 90000, payloadType: 96 },
                    { mimeType: 'video/H264', clockRate: 90000, payloadType: 97 }
                ]
            }
        });
        if (!rtpObserver) {
            logger.warn("Could not create RTP observer for router ".concat(router.id));
            return;
        }
        // Listen for PLI (Picture Loss Indication) requests and forward them
        rtpObserver.on('pli', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var producer, error_15;
            var _c;
            var producerId = _b.producerId;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        logger.debug("[RTP] Received PLI request for producer ".concat(producerId));
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 8, , 9]);
                        if (!context.getProducer) return [3 /*break*/, 7];
                        return [4 /*yield*/, context.getProducer(producerId)];
                    case 2:
                        producer = _d.sent();
                        if (!producer) return [3 /*break*/, 6];
                        // Check if this is a regular producer or a piped producer
                        if ((_c = producer.appData) === null || _c === void 0 ? void 0 : _c.isPipeProducer) {
                            logger.debug("[RTP] ".concat(producerId, " is a pipe producer, forwarding PLI via pipe channel"));
                            // For pipe producers, we might need special handling
                        }
                        if (!(typeof producer.requestKeyFrame === 'function')) return [3 /*break*/, 4];
                        return [4 /*yield*/, producer.requestKeyFrame()];
                    case 3:
                        _d.sent();
                        logger.debug("[RTP] Successfully requested keyframe for producer ".concat(producerId));
                        return [3 /*break*/, 5];
                    case 4:
                        logger.warn("[RTP] Producer ".concat(producerId, " does not have requestKeyFrame method"));
                        _d.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        logger.warn("[RTP] Could not find producer ".concat(producerId, " for PLI forwarding"));
                        _d.label = 7;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_15 = _d.sent();
                        logger.error("[RTP] Error forwarding PLI for producer ".concat(producerId, ": ").concat(error_15));
                        return [3 /*break*/, 9];
                    case 9: return [2 /*return*/];
                }
            });
        }); });
        // Listen for FIR (Full Intra Request) - similar to PLI but more aggressive
        rtpObserver.on('fir', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var producer, error_16;
            var producerId = _b.producerId;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        logger.debug("[RTP] Received FIR request for producer ".concat(producerId));
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 5, , 6]);
                        if (!context.getProducer) return [3 /*break*/, 4];
                        return [4 /*yield*/, context.getProducer(producerId)];
                    case 2:
                        producer = _c.sent();
                        if (!(producer && typeof producer.requestKeyFrame === 'function')) return [3 /*break*/, 4];
                        return [4 /*yield*/, producer.requestKeyFrame()];
                    case 3:
                        _c.sent();
                        logger.debug("[RTP] Successfully forwarded FIR to producer ".concat(producerId));
                        _c.label = 4;
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_16 = _c.sent();
                        logger.error("[RTP] Error forwarding FIR for producer ".concat(producerId, ": ").concat(error_16));
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        }); });
        // Listen for packet loss events (NACK)
        rtpObserver.on('nack', function (_a) {
            var producerId = _a.producerId, ssrc = _a.ssrc, sequenceNumbers = _a.sequenceNumbers;
            logger.debug("[RTP] Received NACK for producer ".concat(producerId, ", SSRC ").concat(ssrc, ", seq ").concat(sequenceNumbers.length, " packets"));
            // NACK is generally handled automatically by mediasoup, but we can log it
        });
        // Make sure to setup the RTP observer in both handlePipeInitiateMessage 
        // and pipeToRemoteRouter to ensure both sides handle media quality issues
        logger.debug("[RTP] Successfully set up RTP observer for router ".concat(router.id));
    }
    catch (error) {
        var errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to setup RTP observer: ".concat(errorMessage));
    }
};
/**
 * Function to safely check if routerRegistry exists and call isLocalRouter
 */
var isLocalRouterSafe = function (routerId, context) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b;
    return __generator(this, function (_c) {
        if (!routerId) {
            return [2 /*return*/, false];
        }
        try {
            return [2 /*return*/, (_b = (_a = context.routerRegistry) === null || _a === void 0 ? void 0 : _a.isLocalRouter(routerId)) !== null && _b !== void 0 ? _b : false];
        }
        catch (error) {
            logger.error("Error checking if router ".concat(routerId, " is local: ").concat(error));
            return [2 /*return*/, false];
        }
        return [2 /*return*/];
    });
}); };
/**
 * Function to safely get a server ID for a router
 */
var getServerIdForRouterSafe = function (routerId, context) { return __awaiter(void 0, void 0, void 0, function () {
    var error_17;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!context.routerRegistry) {
                    logger.warn("routerRegistry is not available in the context. Cannot get server ID for router ".concat(routerId, "."));
                    return [2 /*return*/, undefined];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, context.routerRegistry.getServerIdForRouter(routerId)];
            case 2: return [2 /*return*/, _a.sent()];
            case 3:
                error_17 = _a.sent();
                logger.error("Failed to get server ID for router ".concat(routerId, ": ").concat(error_17));
                return [2 /*return*/, undefined];
            case 4: return [2 /*return*/];
        }
    });
}); };
/**
 * Function to safely get a local router by ID
 */
var getLocalRouterSafe = function (routerId, context) { return __awaiter(void 0, void 0, void 0, function () {
    var error_18;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!context.routerRegistry) {
                    logger.warn("routerRegistry is not available in the context. Cannot get router ".concat(routerId, "."));
                    return [2 /*return*/, undefined];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, context.routerRegistry.getLocalRouter(routerId)];
            case 2: return [2 /*return*/, _a.sent()];
            case 3:
                error_18 = _a.sent();
                logger.error("Failed to get router ".concat(routerId, ": ").concat(error_18));
                return [2 /*return*/, undefined];
            case 4: return [2 /*return*/];
        }
    });
}); };
/**
 * Helper function to validate if a serverId string is valid
 */
var isValidServerId = function (serverId) {
    return typeof serverId === 'string' && serverId.length > 0;
};
/**
 * Wrap the message sending to handle string | undefined safely
 */
var sendMessageSafely = function (message, serverId, webSocketService) { return __awaiter(void 0, void 0, void 0, function () {
    var error_19, errorMessage;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!webSocketService) {
                    logger.error("Cannot send message: webSocketService is undefined");
                    return [2 /*return*/, false];
                }
                if (!isValidServerId(serverId)) {
                    logger.error("Cannot send message: invalid serverId '".concat(serverId, "'"));
                    return [2 /*return*/, false];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, webSocketService.sendMessage(serverId, message)];
            case 2:
                _a.sent();
                return [2 /*return*/, true];
            case 3:
                error_19 = _a.sent();
                errorMessage = error_19 instanceof Error ? error_19.message : String(error_19);
                logger.error("Failed to send message to server ".concat(serverId, ": ").concat(errorMessage));
                return [2 /*return*/, false];
            case 4: return [2 /*return*/];
        }
    });
}); };
/**
 * Function to send a pipe reject message with proper null checking
 */
var sendPipeRejectMessage = function (originalMessage, reason, webSocketService) { return __awaiter(void 0, void 0, void 0, function () {
    var rejectMessage, sendError_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!webSocketService) {
                    logger.error("Cannot send pipe_reject: webSocketService is undefined");
                    return [2 /*return*/];
                }
                rejectMessage = {
                    type: 'pipe_reject',
                    correlationId: originalMessage.correlationId,
                    sourceServerId: webSocketService.getCurrentServerId(),
                    targetServerId: originalMessage.sourceServerId,
                    sourceRouterId: '', // May not have a local router id in error cases
                    targetRouterId: originalMessage.sourceRouterId,
                    reason: reason
                };
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                logger.debug("Sending pipe_reject [correlationId:".concat(originalMessage.correlationId, "] reason: ").concat(reason));
                return [4 /*yield*/, webSocketService.sendMessage(originalMessage.sourceServerId, rejectMessage)];
            case 2:
                _a.sent();
                return [3 /*break*/, 4];
            case 3:
                sendError_1 = _a.sent();
                logger.error("Failed to send rejection: ".concat(sendError_1 instanceof Error ? sendError_1.message : String(sendError_1)));
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
/**
 * Function to get info from a producer object
 */
var getProducerInfo = function (producerId, context) { return __awaiter(void 0, void 0, void 0, function () {
    var localRouter, producer, findProducer, producer, error_20, errorMessage;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                localRouter = context.localRouter;
                if (!producerId) {
                    logger.error('Cannot get producer info: producerId is undefined');
                    return [2 /*return*/, undefined];
                }
                logger.debug("Getting producerInfo for ".concat(producerId));
                _a.label = 1;
            case 1:
                _a.trys.push([1, 6, , 7]);
                if (!context.getProducer) return [3 /*break*/, 3];
                return [4 /*yield*/, context.getProducer(producerId)];
            case 2:
                producer = _a.sent();
                if (producer) {
                    logger.debug("Found producer ".concat(producerId, " using context.getProducer"));
                    return [2 /*return*/, {
                            id: producer.id,
                            kind: producer.kind,
                            rtpParameters: producer.rtpParameters,
                            paused: producer.paused,
                            appData: producer.appData
                        }];
                }
                _a.label = 3;
            case 3:
                if (!(context.routerRegistry && typeof context.routerRegistry.findProducer === 'function')) return [3 /*break*/, 5];
                findProducer = context.routerRegistry.findProducer;
                return [4 /*yield*/, findProducer(producerId)];
            case 4:
                producer = _a.sent();
                if (producer) {
                    logger.debug("Found producer ".concat(producerId, " using routerRegistry.findProducer"));
                    return [2 /*return*/, {
                            id: producer.id,
                            kind: producer.kind,
                            rtpParameters: producer.rtpParameters,
                            paused: producer.paused,
                            appData: producer.appData
                        }];
                }
                _a.label = 5;
            case 5:
                // Finally, try to get it directly from the router
                if (localRouter) {
                    // No good way to get producers from a router in mediasoup API
                    // This would require a registry maintained separately
                    logger.debug("No built-in way to get producer ".concat(producerId, " directly from router"));
                }
                logger.error("Could not find producer ".concat(producerId));
                return [2 /*return*/, undefined];
            case 6:
                error_20 = _a.sent();
                errorMessage = error_20 instanceof Error ? error_20.message : String(error_20);
                logger.error("Error getting producer info: ".concat(errorMessage));
                return [2 /*return*/, undefined];
            case 7: return [2 /*return*/];
        }
    });
}); };
/**
 * Helper function to get or create a pipe transport pair between routers
 * This helps implement issue #8.1 recommendation to reuse transport pairs
 */
var getOrCreatePipeTransportPair = function (sourceRouterId, targetRouterId, options, context) { return __awaiter(void 0, void 0, void 0, function () {
    var existingTransportId, existingTransport, sourceRouter, transportOptions, sourceTransport_1, error_21, errorMessage;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 6, , 7]);
                return [4 /*yield*/, ((_a = context.routerRegistry) === null || _a === void 0 ? void 0 : _a.findPipeTransport(sourceRouterId, targetRouterId))];
            case 1:
                existingTransportId = _c.sent();
                if (existingTransportId && context.remotePipeTransports) {
                    existingTransport = context.remotePipeTransports.get(existingTransportId);
                    if (existingTransport && !existingTransport.closed) {
                        logger.debug("Reusing existing pipe transport ".concat(existingTransportId, " between routers ").concat(sourceRouterId, " and ").concat(targetRouterId));
                        return [2 /*return*/, {
                                sourceTransport: existingTransport,
                                isNewPair: false
                            }];
                    }
                }
                return [4 /*yield*/, ((_b = context.routerRegistry) === null || _b === void 0 ? void 0 : _b.getLocalRouter(sourceRouterId))];
            case 2:
                sourceRouter = _c.sent();
                if (!sourceRouter) {
                    throw new Error("Source router ".concat(sourceRouterId, " not found"));
                }
                transportOptions = {
                    listenIp: {
                        ip: '0.0.0.0',
                        announcedIp: options.publicIp || '127.0.0.1'
                    },
                    enableSctp: !!options.enableSctp,
                    enableRtx: !!options.enableRtx,
                    enableSrtp: !!options.enableSrtp
                };
                logger.debug("Creating new pipe transport with options: ".concat(JSON.stringify(transportOptions)));
                return [4 /*yield*/, sourceRouter.createPipeTransport(transportOptions)];
            case 3:
                sourceTransport_1 = _c.sent();
                if (!context.routerRegistry) return [3 /*break*/, 5];
                return [4 /*yield*/, context.routerRegistry.registerPipeTransport(sourceRouterId, targetRouterId, sourceTransport_1.id)];
            case 4:
                _c.sent();
                _c.label = 5;
            case 5:
                // 4. Add to maps for tracking
                if (context.remotePipeTransports) {
                    context.remotePipeTransports.set(sourceTransport_1.id, sourceTransport_1);
                }
                // 5. Set up cleanup on close
                sourceTransport_1.observer.once('close', function () { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                logger.debug("Pipe transport ".concat(sourceTransport_1.id, " closed, cleaning up registry"));
                                if (!context.routerRegistry) return [3 /*break*/, 2];
                                return [4 /*yield*/, context.routerRegistry.removePipeTransport(sourceTransport_1.id)
                                        .catch(function (err) { return logger.error("Failed to remove pipe transport from registry: ".concat(err)); })];
                            case 1:
                                _a.sent();
                                _a.label = 2;
                            case 2:
                                if (context.remotePipeTransports) {
                                    context.remotePipeTransports.delete(sourceTransport_1.id);
                                }
                                // Clean up any piped producer entries related to this transport
                                if (context.pipedProducers) {
                                    // We'd need to track which producer uses which transport
                                    // This is a simplification - in a real implementation you'd maintain
                                    // a map of transport->producers
                                    logger.debug("Transport ".concat(sourceTransport_1.id, " closed, cleaning up related piped producer entries"));
                                }
                                return [2 /*return*/];
                        }
                    });
                }); });
                return [2 /*return*/, {
                        sourceTransport: sourceTransport_1,
                        isNewPair: true
                    }];
            case 6:
                error_21 = _c.sent();
                errorMessage = error_21 instanceof Error ? error_21.message : String(error_21);
                logger.error("Failed to get or create pipe transport pair: ".concat(errorMessage));
                throw error_21;
            case 7: return [2 /*return*/];
        }
    });
}); };
// Fix for issue #5: Add better cleanup for piped producers on producer close
var cleanupPipedProducerResources = function (producerId, context) {
    if (!context.pipedProducers)
        return;
    // Find and remove all piped producer entries for this producer
    var pipedEntries = Array.from(context.pipedProducers)
        .filter(function (key) { return key.startsWith("".concat(producerId, ":")); });
    if (pipedEntries.length > 0) {
        logger.debug("Cleaning up ".concat(pipedEntries.length, " piped entries for closed producer ").concat(producerId));
        for (var _i = 0, pipedEntries_1 = pipedEntries; _i < pipedEntries_1.length; _i++) {
            var entry = pipedEntries_1[_i];
            context.pipedProducers.delete(entry);
        }
    }
};
exports.cleanupPipedProducerResources = cleanupPipedProducerResources;
