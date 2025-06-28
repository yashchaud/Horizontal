import * as mediasoup from 'mediasoup';
import { v4 as uuidv4 } from 'uuid'; // For generating correlation IDs
import { Logger } from './Logger';

// Create a logger instance
const logger = new Logger('RemotePiping');

// ===== Types =====
// Signaling message types
type MessageType = 'pipe_initiate' | 'pipe_confirm' | 'pipe_reject';

interface PipeSignalingMessage {
    type: MessageType;
    correlationId: string;
    sourceServerId: string;
    targetServerId: string;
    sourceRouterId: string;
    targetRouterId: string;
}

interface PipeInitiateMessage extends PipeSignalingMessage {
    type: 'pipe_initiate';
    pipeTransportInfo: {
        id: string;
        ip: string;
        port: number;
        srtpParameters?: any;
    };
    options: {
        producerId?: string;
        dataProducerId?: string;
        enableSctp?: boolean;
        enableRtx?: boolean;
    };
    producerInfo?: {
        id: string;
        kind: string;
        paused: boolean;
        rtpParameters?: any;
        appData?: any;
    };
}

interface PipeConfirmMessage extends PipeSignalingMessage {
    type: 'pipe_confirm';
    pipeTransportInfo: {
        id: string;
        ip: string;
        port: number;
        srtpParameters?: any;
    };
    consumerInfo?: {
        id: string;
        producerId: string;
        kind: string;
        rtpParameters: any;
    };
}

interface PipeRejectMessage extends PipeSignalingMessage {
    type: 'pipe_reject';
    reason: string;
}

// Result of a pipe operation
interface PipeToRouterResult {
    pipeConsumer?: mediasoup.types.Consumer;
    pipeProducer?: mediasoup.types.Producer;
    pipeDataConsumer?: mediasoup.types.DataConsumer;
    pipeDataProducer?: mediasoup.types.DataProducer;
}

// Options for piping
interface PipeOptions {
    producerId?: string;
    dataProducerId?: string;
    targetRouterId: string;
    targetServerId?: string;
    enableSctp?: boolean;
    enableRtx?: boolean;
    enableSrtp?: boolean;
}

// Context containing necessary services and state
interface PipeContext {
    localRouter: mediasoup.types.Router;
    routerRegistry: {
        isLocalRouter: (routerId: string) => Promise<boolean>;
        getLocalRouter: (routerId: string) => Promise<mediasoup.types.Router | undefined>;
        getServerIdForRouter: (routerId: string) => Promise<string | undefined>;
        findPipeTransport: (sourceId: string, targetId: string) => Promise<string | undefined>;
        registerPipeTransport: (sourceId: string, targetId: string, transportId: string) => Promise<void>;
        removePipeTransport: (transportId: string) => Promise<void>;
    };
    webSocketService: {
        getCurrentServerId: () => string;
        getPublicIp: () => string;
        sendMessage: (targetServerId: string, message: any) => Promise<void>;
    };
    // Cache of pipe transports for reuse
    remotePipeTransports?: Map<string, mediasoup.types.PipeTransport>;
    // Pending requests tracking
    pendingRequests?: Map<string, {
        resolve: (result: PipeToRouterResult) => void;
        reject: (error: Error) => void;
        timeoutTimer: NodeJS.Timeout;
        localPipeTransport: mediasoup.types.PipeTransport;
    }>;
    // Function to get a producer by ID
    getProducer?: (producerId: string) => Promise<mediasoup.types.Producer | null | undefined>;
    // Function to track a remote producer for later use
    createRemoteProducer?: (info: {
        id: string;
        kind: string;
        rtpParameters: any;
        routerId: string;
    }) => Promise<void>;
}

// Logger is already defined at the top of the file

// ===== Pure Functions =====

/**
 * Validate options before piping
 * Pure function that checks if the options are valid
 */
const validatePipeOptions = (options: PipeOptions, localRouterId: string): void => {
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
const determineRoutingStrategy = async (
    options: PipeOptions,
    context: PipeContext
): Promise<() => Promise<PipeToRouterResult>> => {
    try {
        const { targetRouterId, targetServerId } = options;
        const isLocal = await context.routerRegistry.isLocalRouter(targetRouterId);
        
        if (isLocal) {
            logger.debug(`Target router ${targetRouterId} is local. Using local piping.`);
            const targetRouter = await context.routerRegistry.getLocalRouter(targetRouterId);
            
            if (!targetRouter) {
                throw new Error(`Target router ${targetRouterId} is marked as local but not found`);
            }
            
            // Router events - using the correct event names for Router.observer
            targetRouter.observer.once('close', () => {
                // Clean up any associated resources here
                logger.debug('Target router closed, cleaning up pipe resources');
            });
            
            return () => pipeToLocalRouter(
                options, 
                { ...context, targetRouter }
            );
        } else {
            logger.debug(`Target router ${targetRouterId} is remote. Using remote piping.`);
            const resolvedTargetServerId = targetServerId || 
                await context.routerRegistry.getServerIdForRouter(targetRouterId);
                
            if (!resolvedTargetServerId) {
                throw new Error(`Could not resolve server ID for router ${targetRouterId}`);
            }
            
            return () => pipeToRemoteRouter(
                { ...options, targetServerId: resolvedTargetServerId },
                context
            );
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error determining routing strategy: ${message}`);
        throw error;
    }
};

/**
 * Pipe to a local router (same server)
 * Implementation of the local piping strategy
 */
const pipeToLocalRouter = async (
    options: PipeOptions, 
    context: PipeContext & { targetRouter: mediasoup.types.Router }
): Promise<PipeToRouterResult> => {
    logger.debug(`Piping to local router ${options.targetRouterId}`);
    
    try {
        const { localRouter, targetRouter } = context;
        const { producerId, dataProducerId } = options;
        
        // Create or reuse pipe transports between the routers
        const createPipeTransportPair = async (): Promise<{
            localTransport: mediasoup.types.PipeTransport;
            remoteTransport: mediasoup.types.PipeTransport;
        }> => {
            // Check for existing pipe transport in registry
            const existingId = await context.routerRegistry.findPipeTransport(
                localRouter.id, 
                targetRouter.id
            );
            
            if (existingId) {
                // TODO: Implement reuse of existing pipe transport
                // This would require more complex state tracking
            }
            
            // Create new pipe transports
            const transport1 = await localRouter.createPipeTransport({
                listenIp: '127.0.0.1',
                enableSctp: options.enableSctp ?? true,
                enableRtx: options.enableRtx ?? false,
                enableSrtp: options.enableSrtp ?? false
            });
            
            const transport2 = await targetRouter.createPipeTransport({
                listenIp: '127.0.0.1',
                enableSctp: options.enableSctp ?? true,
                enableRtx: options.enableRtx ?? false,
                enableSrtp: options.enableSrtp ?? false
            });
            
            // Connect them
            await transport1.connect({
                ip: '127.0.0.1',
                port: transport2.tuple.localPort,
                srtpParameters: transport2.srtpParameters
            });
            
            await transport2.connect({
                ip: '127.0.0.1',
                port: transport1.tuple.localPort,
                srtpParameters: transport1.srtpParameters
            });
            
            // Set up cleanup of transports
            const cleanupTransports = () => {
                if (!transport1.closed) transport1.close();
                if (!transport2.closed) transport2.close();
            };
            
            // Transport events - using the correct event name for Transport.observer
            transport1.observer.once('close', () => {
                // Remove from registry on close
                logger.debug('PipeTransport closed, cleaning up pipe resources');
            });
            
            transport2.observer.once('close', () => {
                // Remove from registry on close
                logger.debug('PipeTransport closed, cleaning up pipe resources');
            });
            
            return {
                localTransport: transport1,
                remoteTransport: transport2
            };
        };
        
        // Create the transport pair
        const { localTransport, remoteTransport } = await createPipeTransportPair();
        
        // Handle producer piping
        if (producerId) {
            // Router doesn't expose getProducerById directly - we would need to
            // maintain our own map of producers in a real implementation
            // This is a placeholder for that functionality
            const getProducer = async (): Promise<mediasoup.types.Producer> => {
                // In a real implementation, you would look up the producer from your tracking map
                // For example: const producer = this.producers.get(producerId);
                throw new Error(`Producer ${producerId} not found - Router doesn't expose getProducerById`);
            };
            
            try {
                // Note: In a real implementation, we'd use our own tracking map instead
                // of relying on getProducerById which Router doesn't expose
                // For now, we'll simulate a producer with dummy data
                const dummyProducer = {
                    id: producerId,
                    kind: 'audio' as mediasoup.types.MediaKind,
                    paused: false,
                    appData: {},
                    observer: {
                        once: (event: string, cb: () => void) => {},
                        on: (event: string, cb: () => void) => {},
                        off: (event: string, cb: () => void) => {}
                    }
                };
                
                // Create consumer on the local transport
                const pipeConsumer = await localTransport.consume({
                    producerId: dummyProducer.id
                });
                
                // Create producer on the remote transport
                const pipeProducer = await remoteTransport.produce({
                    id: dummyProducer.id,
                    kind: pipeConsumer.kind,
                    rtpParameters: pipeConsumer.rtpParameters,
                    paused: pipeConsumer.producerPaused,
                    appData: dummyProducer.appData
                });
                
                // Set up event forwarding
                // Use correct event names from mediasoup API
                // In mediasoup, producer.observer events use @ prefix
                // But we need to handle state properly
                dummyProducer.observer.once('@close', () => pipeProducer.close());
                
                // In mediasoup, consumer.observer uses regular event names
                pipeConsumer.observer.once('close', () => pipeProducer.close());
                // Add pause/resume handlers if needed
                
                return { pipeConsumer, pipeProducer };
            } catch (error) {
                logger.error(`Error handling producer piping: ${error}`);
                throw error;
            }
        }
        // Handle data producer piping
        else if (dataProducerId) {
            // Router doesn't expose getDataProducerById directly - we would need to
            // maintain our own map of data producers in a real implementation
            // This is a placeholder for that functionality
            const getDataProducer = async (): Promise<mediasoup.types.DataProducer> => {
                // In a real implementation, you would look up the data producer from your tracking map
                // For example: const dataProducer = this.dataProducers.get(dataProducerId);
                throw new Error(`DataProducer ${dataProducerId} not found - Router doesn't expose getDataProducerById`);
            };
            
            try {
                // Note: In a real implementation, we'd use our own tracking map instead
                // of relying on getDataProducerById which Router doesn't expose
                // For now, we'll simulate a data producer with dummy data
                const dummyDataProducer = {
                    id: dataProducerId,
                    sctpStreamParameters: { streamId: 0, ordered: true },
                    label: '',
                    protocol: '',
                    appData: {},
                    observer: {
                        once: (event: string, cb: () => void) => {},
                        on: (event: string, cb: () => void) => {},
                        off: (event: string, cb: () => void) => {}
                    }
                };
                
                // Create data consumer on the local transport
                const pipeDataConsumer = await localTransport.consumeData({
                    dataProducerId: dummyDataProducer.id
                });
                
                // Create data producer on the remote transport
                const pipeDataProducer = await remoteTransport.produceData({
                    id: dummyDataProducer.id,
                    sctpStreamParameters: pipeDataConsumer.sctpStreamParameters,
                    label: pipeDataConsumer.label,
                    protocol: pipeDataConsumer.protocol,
                    appData: dummyDataProducer.appData
                });
                
                // Set up event forwarding
                // Setting up event handlers with correct event names
                dummyDataProducer.observer.once('@close', () => pipeDataProducer.close());
                pipeDataConsumer.observer.once('close', () => pipeDataProducer.close());
                
                return { pipeDataConsumer, pipeDataProducer };
            } catch (error) {
                logger.error(`Error handling data producer piping: ${error}`);
                throw error;
            }
        } else {
            throw new Error('Neither producerId nor dataProducerId specified');
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Local piping failed: ${message}`);
        throw error;
    }
};

/**
 * Pipe to a remote router (different server)
 * Implementation of the remote piping strategy using cross-server signaling
 */
const pipeToRemoteRouter = async (
    options: PipeOptions & { targetServerId: string },
    context: PipeContext
): Promise<PipeToRouterResult> => {
    logger.debug(`Piping to remote router ${options.targetRouterId} on server ${options.targetServerId}`);
    
    const { localRouter, webSocketService, routerRegistry } = context;
    const { targetRouterId, targetServerId, producerId, dataProducerId } = options;
    
    // Ensure we have maps for caching and tracking
    const remotePipeTransports = context.remotePipeTransports || new Map();
    const pendingRequests = context.pendingRequests || new Map();
    
    // Check for reusable transport
    const getExistingTransport = async (): Promise<mediasoup.types.PipeTransport | null> => {
        try {
            const existingId = await routerRegistry.findPipeTransport(
                localRouter.id,
                targetRouterId
            );
            
            if (existingId && remotePipeTransports.has(existingId)) {
                const transport = remotePipeTransports.get(existingId)!;
                if (!transport.closed) {
                    return transport;
                }
            }
            return null;
        } catch (error) {
            logger.warn(`Error checking for existing pipe transport: ${error}`);
            return null;
        }
    };
    
    // Create a new transport and return it
    const createNewTransport = async (): Promise<mediasoup.types.PipeTransport> => {
        const transport = await localRouter.createPipeTransport({
            listenIp: '0.0.0.0', // Listen on all interfaces for remote connection
            enableSctp: options.enableSctp ?? true,
            enableRtx: options.enableRtx ?? false,
            enableSrtp: options.enableSrtp ?? false
        });
        
        remotePipeTransports.set(transport.id, transport);
        
        // Register for potential reuse
        await routerRegistry.registerPipeTransport(
            localRouter.id,
            targetRouterId,
            transport.id
        );
        
        return transport;
    };
    
    // Set up the signaling promise
    const setupSignalingPromise = (
        localPipeTransport: mediasoup.types.PipeTransport
    ): Promise<PipeToRouterResult> => {
        return new Promise<PipeToRouterResult>((resolve, reject) => {
            const correlationId = uuidv4();
            const timeoutMs = 30000; // 30 seconds
            
            // Set up timeout
            const timeoutTimer = setTimeout(() => {
                logger.error(`Pipe request timeout [correlationId:${correlationId}]`);
                pendingRequests.delete(correlationId);
                if (!localPipeTransport.closed) localPipeTransport.close();
                remotePipeTransports.delete(localPipeTransport.id);
                routerRegistry.removePipeTransport(localPipeTransport.id).catch(e => {
                    logger.error(`Failed to remove pipe transport: ${e}`);
                });
                reject(new Error('Pipe request timed out'));
            }, timeoutMs);
            
            // Store pending request
            pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeoutTimer,
                localPipeTransport
            });
            
            // Get producer/dataProducer info if needed
            const getProducerInfo = async (): Promise<any | undefined> => {
                if (!producerId) return undefined;
                
                // Get the actual producer from the context
                // The context should include a way to access the producer registry
                if (!context.getProducer) {
                    logger.error('getProducer function not available in context');
                    throw new Error('getProducer function not available in context');
                }
                
                const producer = await context.getProducer(producerId);
                
                if (!producer) {
                    logger.error(`Producer ${producerId} not found locally`);
                    throw new Error(`Producer ${producerId} not found locally`);
                }
                
                // Return full producer details needed by the remote server
                return {
                    id: producer.id,
                    kind: producer.kind,
                    paused: producer.paused,
                    rtpParameters: producer.rtpParameters, // Very important to include this!
                    appData: producer.appData
                };
            };
            
            // Create and send the initiate message
            const sendInitiateMessage = async (producerInfo?: any): Promise<void> => {
                const message: PipeInitiateMessage = {
                    type: 'pipe_initiate',
                    correlationId,
                    sourceServerId: webSocketService.getCurrentServerId(),
                    targetServerId,
                    sourceRouterId: localRouter.id,
                    targetRouterId,
                    pipeTransportInfo: {
                        id: localPipeTransport.id,
                        ip: webSocketService.getPublicIp(),
                        port: localPipeTransport.tuple.localPort,
                        srtpParameters: localPipeTransport.srtpParameters
                    },
                    options: {
                        producerId,
                        dataProducerId,
                        enableSctp: options.enableSctp,
                        enableRtx: options.enableRtx
                    },
                    producerInfo
                };
                
                logger.debug(`Sending pipe_initiate [correlationId:${correlationId}]`);
                await webSocketService.sendMessage(targetServerId, message);
            };
            
            // Execute the signaling
            getProducerInfo()
                .then(producerInfo => sendInitiateMessage(producerInfo))
                .catch(error => {
                    clearTimeout(timeoutTimer);
                    pendingRequests.delete(correlationId);
                    reject(error);
                });
        });
    };
    
    // Handle signaling response
    const handleSignalingResponse = (
        message: PipeConfirmMessage | PipeRejectMessage,
        pendingRequest: any
    ): Promise<PipeToRouterResult> => {
        const { resolve, reject, timeoutTimer, localPipeTransport } = pendingRequest;
        
        // Clean up the pending request
        clearTimeout(timeoutTimer);
        pendingRequests.delete(message.correlationId);
        
        if (message.type === 'pipe_reject') {
            const error = new Error(`Remote pipe rejected: ${message.reason}`);
            localPipeTransport.close();
            remotePipeTransports.delete(localPipeTransport.id);
            routerRegistry.removePipeTransport(localPipeTransport.id).catch(e => {
                logger.error(`Failed to remove pipe transport: ${e}`);
            });
            reject(error);
            return Promise.reject(error);
        }
        
        if (message.type === 'pipe_confirm') {
            // Connect the local pipe transport to the remote one
            return localPipeTransport.connect({
                ip: message.pipeTransportInfo.ip,
                port: message.pipeTransportInfo.port,
                srtpParameters: message.pipeTransportInfo.srtpParameters
            }).then(() => {
                // Handle consumer if this was a producer pipe
                if (options.producerId && message.consumerInfo) {
                    // Local pipe transport is already connected
                    // Return the result
                    const result: PipeToRouterResult = {
                        // The consumer would be on the remote side, not accessible here
                        // but we could potentially create a local consumer if needed
                    };
                    resolve(result);
                    return result;
                }
                // Handle data consumer if this was a data producer pipe
                else if (options.dataProducerId) {
                    // Similar to above, the data consumer would be on the remote side
                    const result: PipeToRouterResult = {};
                    resolve(result);
                    return result;
                } else {
                    const result: PipeToRouterResult = {};
                    resolve(result);
                    return result;
                }
            }).catch((error: any) => {
                localPipeTransport.close();
                remotePipeTransports.delete(localPipeTransport.id);
                routerRegistry.removePipeTransport(localPipeTransport.id).catch(e => {
                    logger.error(`Failed to remove pipe transport: ${e}`);
                });
                reject(error);
                return Promise.reject(error);
            });
        }
        
        return Promise.reject(new Error(`Unknown message type: ${(message as any).type}`));
    };
    
    // Main function execution
    try {
        // Get existing transport or create a new one
        const localPipeTransport = await getExistingTransport() || await createNewTransport();
        
        // Set up the signaling and wait for response
        return await setupSignalingPromise(localPipeTransport);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Remote piping failed: ${message}`);
        throw error;
    }
};

/**
 * Handle incoming pipe signaling messages
 * This would be registered as a handler for your WebSocket service
 */
export const handlePipeSignalingMessage = async (
    message: any,
    context: PipeContext
): Promise<void> => {
    if (!message || typeof message !== 'object' || !message.type) {
        logger.warn('Received invalid pipe message format');
        return;
    }
    
    const { type, correlationId } = message as PipeSignalingMessage;
    
    switch (type) {
        case 'pipe_initiate':
            await handlePipeInitiateMessage(message as PipeInitiateMessage, context);
            break;
            
        case 'pipe_confirm':
        case 'pipe_reject':
            await handlePipeResponseMessage(message as PipeConfirmMessage | PipeRejectMessage, context);
            break;
            
        default:
            logger.warn(`Unknown pipe message type: ${type}`);
    }
};

/**
 * Handle an incoming pipe initiate message
 */
export const handlePipeInitiateMessage = async (
    message: PipeInitiateMessage,
    context: PipeContext
): Promise<void> => {
    const { producerId, dataProducerId } = message.options || {};
    const { pipeTransportInfo } = message;
    const { correlationId, sourceServerId, sourceRouterId } = message;
    const { localRouter, routerRegistry, webSocketService } = context;
    
    logger.debug(`Received pipe_initiate [correlationId:${correlationId}]`);
    
    try {
        // Create a pipe transport for receiving the media
        const localPipeTransport = await localRouter.createPipeTransport({
            listenIp: '0.0.0.0',
            enableSctp: message.options?.enableSctp ?? true,
            enableRtx: message.options?.enableRtx ?? false
        });
        
        // Connect to the remote pipe transport
        await localPipeTransport.connect({
            ip: pipeTransportInfo.ip,
            port: pipeTransportInfo.port,
            srtpParameters: pipeTransportInfo.srtpParameters
        });
        
        // Register this pipe transport
        await routerRegistry.registerPipeTransport(
            localRouter.id,
            sourceRouterId,
            localPipeTransport.id
        );
        
        // Create the appropriate pipes based on the message
        let consumerInfo: any = undefined;
        
        if (producerId && message.producerInfo) {
            // Verify that we have all the required information from the remote producer
            if (!message.producerInfo.rtpParameters) {
                throw new Error(`Producer ${producerId} doesn't have rtpParameters`);
            }
            
            logger.debug(`Handling remote producer ${producerId} of kind ${message.producerInfo.kind}`);

            try {
                // Register the producer locally first using a direct transport
                const directTransport = await localRouter.createDirectTransport();
                
                // Explicitly cast the kind to mediasoup's MediaKind type
                const mediaKind = message.producerInfo.kind as mediasoup.types.MediaKind;
                
                // Create a producer on our virtual transport
                const registeredProducer = await directTransport.produce({
                    id: message.producerInfo.id, // Use the same ID
                    kind: mediaKind,
                    rtpParameters: message.producerInfo.rtpParameters,
                    paused: message.producerInfo.paused || false,
                    appData: message.producerInfo.appData || {}
                });

                logger.debug(`Created local producer proxy for remote producer ${producerId} with ID ${registeredProducer.id}`);
                
                // Also use the registry function if available
                if (context.createRemoteProducer) {
                    await context.createRemoteProducer({
                        id: message.producerInfo.id,
                        kind: message.producerInfo.kind,
                        rtpParameters: message.producerInfo.rtpParameters,
                        routerId: localRouter.id
                    });
                    logger.debug(`Registered producer ${producerId} with external registry`);
                } else {
                    logger.debug(`No createRemoteProducer function in context. Using direct transport only.`);
                }
                
                // Add a small delay to ensure producer registration is complete
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Now create a pipe consumer that consumes from our newly created producer
                const pipeConsumer = await localPipeTransport.consume({
                    producerId: registeredProducer.id
                });
                
                logger.debug(`Successfully created pipe consumer ${pipeConsumer.id} for producer ${registeredProducer.id}`);
                
                // Prepare consumer info for the confirmation message
                consumerInfo = {
                    id: pipeConsumer.id,
                    producerId: pipeConsumer.producerId,
                    kind: pipeConsumer.kind,
                    rtpParameters: pipeConsumer.rtpParameters
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Failed to create local producer proxy: ${errorMessage}`);
                throw error;
            }
        }
        
        // Send confirmation message
        const confirmMessage: PipeConfirmMessage = {
            type: 'pipe_confirm',
            correlationId,
            sourceServerId: webSocketService.getCurrentServerId(),
            targetServerId: sourceServerId,
            sourceRouterId: localRouter.id,
            targetRouterId: sourceRouterId,
            pipeTransportInfo: {
                id: localPipeTransport.id,
                ip: webSocketService.getPublicIp(),
                port: localPipeTransport.tuple.localPort,
                srtpParameters: localPipeTransport.srtpParameters
            },
            consumerInfo
        };
        
        logger.debug(`Sending pipe_confirm [correlationId:${correlationId}]`);
        await webSocketService.sendMessage(sourceServerId, confirmMessage);
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to handle pipe_initiate: ${errorMessage}`);
        
        // Send rejection message on error
        const rejectMessage: PipeRejectMessage = {
            type: 'pipe_reject',
            correlationId,
            sourceServerId: webSocketService.getCurrentServerId(),
            targetServerId: sourceServerId,
            sourceRouterId: localRouter.id,
            targetRouterId: sourceRouterId,
            reason: errorMessage
        };
        
        try {
            await webSocketService.sendMessage(sourceServerId, rejectMessage);
        } catch (sendError) {
            logger.error(`Failed to send rejection: ${sendError}`);
        }
    }
};

/**
 * Handle an incoming pipe response message
 */
export const handlePipeResponseMessage = async (
    message: PipeConfirmMessage | PipeRejectMessage,
    context: PipeContext
): Promise<void> => {
    const { correlationId, sourceServerId } = message;
    const { localRouter, routerRegistry, webSocketService } = context;
    
    logger.debug(`Received pipe_confirm or pipe_reject [correlationId:${correlationId}]`);
    
    try {
        // Handle the response based on the message type
        if (message.type === 'pipe_confirm') {
            // Handle confirmation message
            await handlePipeConfirmMessage(message, context);
        } else if (message.type === 'pipe_reject') {
            // Handle rejection message
            await handlePipeRejectMessage(message, context);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to handle pipe response: ${errorMessage}`);
    }
};

/**
 * Handle a pipe confirm message
 */
const handlePipeConfirmMessage = async (
    message: PipeConfirmMessage,
    context: PipeContext
): Promise<void> => {
    const { correlationId, consumerInfo } = message;
    const { pendingRequests } = context;
    
    logger.debug(`Received pipe_confirm [correlationId:${correlationId}]`);
    
    try {
        // Find the pending request using the correlation ID
        if (!pendingRequests || !pendingRequests.has(correlationId)) {
            logger.warn(`No pending request found for correlationId: ${correlationId}`);
            return;
        }
        
        // Get the pending request data
        const pendingRequest = pendingRequests.get(correlationId);
        if (!pendingRequest) {
            logger.warn(`Pending request is null for correlationId: ${correlationId}`);
            return;
        }
        
        // Clear the timeout to prevent timeout rejection
        if (pendingRequest.timeoutTimer) {
            clearTimeout(pendingRequest.timeoutTimer);
        }
        
        // Create the result object with consumer info
        const result: PipeToRouterResult = {};
        
        // Add consumer info if available
        if (consumerInfo) {
            result.pipeConsumer = consumerInfo as any; // Type cast as we don't have the full Consumer type
            logger.debug(`Added consumer info to result: ${consumerInfo.id}`);
        }
        
        // Resolve the promise with the result
        pendingRequest.resolve(result);
        
        // Remove the pending request from the map
        pendingRequests.delete(correlationId);
        
        // Notify all connected clients about the new piped producer if consumer info is available
        if (consumerInfo && context.webSocketService) {
            logger.info(`Successfully resolved pipe request for correlationId: ${correlationId}`);
            
            // Get room information - this depends on your room management system
            // You might need to adapt this to how rooms are tracked in your application
            try {
                // Extract room ID from context or get it based on router ID
                // This assumes you have a getRoomByRouterId function or similar in your context
                const roomId = await context.routerRegistry.getRoomByRouterId?.(message.targetRouterId);
                
                if (roomId) {
                    // Get or create a reference to your IO instance
                    // This assumes you have socketIO or similar available in the context
                    const io = context.webSocketService.getSocketIO?.();
                    
                    if (io) {
                        // Broadcast to all clients in the room about the new piped producer
                        io.to(roomId).emit('new-producer-piped', {
                            producerId: consumerInfo.producerId,
                            kind: consumerInfo.kind
                        });
                        
                        logger.info(`Emitted new-producer-piped event for producer ${consumerInfo.producerId} to room ${roomId}`);
                    } else {
                        logger.warn('Socket.IO instance not available, cannot emit new-producer-piped event');
                    }
                } else {
                    logger.warn(`Could not find room for router ${message.targetRouterId}, cannot emit new-producer-piped event`);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error(`Failed to emit new-producer-piped event: ${errorMsg}`);
                // Don't rethrow this error as we don't want to fail the pipe operation if only the notification fails
            }
        }
        
        logger.debug(`Successfully resolved pipe request for correlationId: ${correlationId}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to handle pipe_confirm: ${errorMessage}`);
        
        // Even on error, try to clean up the pending request
        if (pendingRequests && pendingRequests.has(correlationId)) {
            const pendingRequest = pendingRequests.get(correlationId);
            if (pendingRequest && pendingRequest.timeoutTimer) {
                clearTimeout(pendingRequest.timeoutTimer);
            }
            pendingRequests.delete(correlationId);
        }
    }
};

/**
 * Handle a pipe reject message
 */
const handlePipeRejectMessage = async (
    message: PipeRejectMessage,
    context: PipeContext
): Promise<void> => {
    const { correlationId, reason } = message;
    const { pendingRequests } = context;
    
    logger.debug(`Received pipe_reject [correlationId:${correlationId}]`);
    
    try {
        // Find the pending request using the correlation ID
        if (!pendingRequests || !pendingRequests.has(correlationId)) {
            logger.warn(`No pending request found for correlationId: ${correlationId}`);
            return;
        }
        
        // Get the pending request data
        const pendingRequest = pendingRequests.get(correlationId);
        if (!pendingRequest) {
            logger.warn(`Pending request is null for correlationId: ${correlationId}`);
            return;
        }
        
        // Clear the timeout to prevent duplicate rejections
        if (pendingRequest.timeoutTimer) {
            clearTimeout(pendingRequest.timeoutTimer);
        }
        
        // Reject the promise with the reason
        pendingRequest.reject(new Error(`Remote pipe rejected: ${reason}`));
        
        // Remove the pending request from the map
        pendingRequests.delete(correlationId);
        
        logger.debug(`Successfully rejected pipe request for correlationId: ${correlationId}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to handle pipe_reject: ${errorMessage}`);
        
        // Even on error, try to clean up the pending request
        if (pendingRequests && pendingRequests.has(correlationId)) {
            const pendingRequest = pendingRequests.get(correlationId);
            if (pendingRequest && pendingRequest.timeoutTimer) {
                clearTimeout(pendingRequest.timeoutTimer);
            }
            pendingRequests.delete(correlationId);
        }
    }
};

/**
 * Main entry point function that orchestrates the piping between routers
 * This is what you'd export and call from other parts of your application
 */
export const pipeMediaBetweenRouters = async (
    options: PipeOptions,
    context: PipeContext
): Promise<PipeToRouterResult> => {
    logger.info(`Initiating pipe operation: Producer=${options.producerId || 'N/A'}, DataProducer=${options.dataProducerId || 'N/A'} -> Router=${options.targetRouterId}`);
    
    // Add check for context and localRouter
    if (!context || !context.localRouter) {
        logger.error('PipeContext or localRouter is not initialized');
        throw new Error('PipeContext or localRouter is not initialized');
    }
    
    try {
        // 1. Validate options
        validatePipeOptions(options, context.localRouter.id);
        
        // 2. Determine the piping strategy (local vs remote)
        const executePiping = await determineRoutingStrategy(options, context);
        
        // 3. Execute the strategy
        const result = await executePiping();
        
        logger.info(`Pipe operation successful: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Pipe operation failed: ${message}`);
        throw new Error(`Failed to pipe media to router ${options.targetRouterId}: ${message}`);
    }
};