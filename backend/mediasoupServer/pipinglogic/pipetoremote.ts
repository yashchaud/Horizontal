import * as mediasoup from 'mediasoup';
import { v4 as uuidv4 } from 'uuid'; // For generating correlation IDs
import { Logger } from './Logger';

// Create a logger instance
const logger = new Logger('RemotePiping');

// Set to track correlation IDs currently being processed for pipe initiation
const processingPipeInitiations = new Set<string>();

// ===== Types =====
// Signaling message types
type MessageType = 'pipe_initiate' | 'pipe_confirm' | 'pipe_reject' | 'new-producer-piped';

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
    producerId?: string;
    dataProducerId?: string;
    transportId?: string; // ID of the transport used for piping
    routerId?: string; // ID of the source router
    ip?: string; // Transport IP
    port?: number; // Transport port
    srtpParameters?: mediasoup.types.SrtpParameters; // Transport SRTP parameters
    roomName?: string; // Room name for context
    
    // Fix for issue #1: Add proper transport details field used in pipe_initiate
    pipeTransportInfo?: {
        id: string;
        ip: string;
        port: number;
        srtpParameters?: mediasoup.types.SrtpParameters;
    };
    
    // Legacy field - kept for backward compatibility
    pipeTransportDetails?: {
        ip: string;
        port: number;
        srtpParameters?: mediasoup.types.SrtpParameters;
    };
    
    producerInfo?: {
        id: string;
        kind: mediasoup.types.MediaKind;
        rtpParameters: mediasoup.types.RtpParameters;
        paused?: boolean;
        appData?: any;
    };
    
    dataProducerInfo?: {
        id?: string;
        sctpStreamParameters: mediasoup.types.SctpStreamParameters;
        label?: string;
        protocol?: string;
        appData?: any;
    };
    
    options?: {
        enableSctp?: boolean;
        enableRtx?: boolean;
        enableSrtp?: boolean;
        numSctpStreams?: { OS: number; MIS: number };
    };
}

interface PipeConfirmMessage extends PipeSignalingMessage {
    type: 'pipe_confirm';
    pipeTransportInfo: {
        id: string;
        ip: string;
        port: number;
        srtpParameters?: mediasoup.types.SrtpParameters;
    };
    consumerInfo?: ConsumerInfo;
    dataConsumerInfo?: any;
}

interface PipeRejectMessage extends PipeSignalingMessage {
    type: 'pipe_reject';
    reason: string;
}

interface NewProducerPipedMessage extends PipeSignalingMessage {
    type: 'new-producer-piped';
    producerId: string;
    kind: string;
}

// Result of a pipe operation
interface PipeToRouterResult {
    pipeConsumer?: ConsumerInfo;
    pipeDataConsumer?: {
        id: string;
        dataProducerId: string;
        sctpStreamParameters: mediasoup.types.SctpStreamParameters;
        label?: string;
        protocol?: string;
    };
    pipeProducer?: mediasoup.types.Producer;
    pipeDataProducer?: mediasoup.types.DataProducer;
}

// Helper to safely extract DataConsumer properties
const safeDataConsumerInfo = (dataConsumer: mediasoup.types.DataConsumer): {
    id: string;
    dataProducerId: string;
    sctpStreamParameters: mediasoup.types.SctpStreamParameters;
    label?: string;
    protocol?: string;
} => {
    return {
        id: dataConsumer.id,
        dataProducerId: dataConsumer.dataProducerId,
        // Ensure sctpStreamParameters is never undefined
        sctpStreamParameters: dataConsumer.sctpStreamParameters || { streamId: 0, ordered: true },
        label: dataConsumer.label,
        protocol: dataConsumer.protocol
    };
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
    roomName?: string; // Add roomName to support tracking which room this pipe is for
}

// Context containing necessary services and state
export interface PipeContext {
    // Essential objects
    localRouter: mediasoup.types.Router; 
    router?: mediasoup.types.Router;     
    routerRegistry?: {
        isLocalRouter: (routerId: string) => Promise<boolean>;
        getLocalRouter: (routerId: string) => Promise<mediasoup.types.Router | undefined>;
        getServerIdForRouter: (routerId: string) => Promise<string | undefined>;
        findPipeTransport: (sourceId: string, targetId: string) => Promise<string | undefined>;
        registerPipeTransport: (sourceId: string, targetId: string, transportId: string) => Promise<void>;
        removePipeTransport: (transportId: string) => Promise<void>;
    };
    webSocketService?: {
        getCurrentServerId: () => string;
        getPublicIp: () => string;
        sendMessage: (targetServerId: string, message: any) => Promise<void>;
    };
    pendingRequests?: Map<string, PendingRequest>;
    producerRegistry?: Map<string, mediasoup.types.Producer>;
    remotePipeTransports?: Map<string, mediasoup.types.PipeTransport>;
    transportConsumerMap?: Map<string, mediasoup.types.Consumer>;
    
    // Fix for issue #6: Add pipedProducers to track producers already piped to specific routers
    pipedProducers?: Set<string>;
    
    // Functions for producers/consumers
    getProducer: (producerId: string) => Promise<any>;
    getDataProducer: (dataProducerId: string) => Promise<any>;
    getConsumer?: (consumerId: string) => Promise<any>;
    
    // Optional function to create a remote producer proxy
    createRemoteProducer?: (info: {
        id: string;
        kind: string;
        rtpParameters: mediasoup.types.RtpParameters;
        routerId: string;
        proxyProducer?: mediasoup.types.Producer;
        roomName?: string; // Room context
    }) => Promise<void>;
    
    // Timeout for pipe operations in milliseconds
    pipeTimeout?: number;
}

// Type definitions for pending requests, used in the PipeContext
export interface PendingRequest {
    resolve: (result: PipeToRouterResult) => void;
    reject: (error: unknown) => void;
    timeout: NodeJS.Timeout;
    timeoutTimer?: NodeJS.Timeout;
    transport?: mediasoup.types.PipeTransport;
    type?: 'producer' | 'dataProducer';
    producerId?: string;
    dataProducerId?: string;
    roomName?: string;
    targetRouterId?: string; // Added for duplicate detection
}

type ConsumerInfo = {
    id: string;
    producerId: string;
    kind: mediasoup.types.MediaKind;
    rtpParameters: mediasoup.types.RtpParameters;
};

// Logger is already defined at the top of the file

// Map to track the relationship between pipe transports and their associated consumers
const transportConsumerMap = new Map<string, mediasoup.types.Consumer>();

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
        const isLocal = await isLocalRouterSafe(targetRouterId, context);
        
        if (isLocal) {
            logger.debug(`Target router ${targetRouterId} is local. Using local piping.`);
            const targetRouter = await getLocalRouterSafe(targetRouterId, context);
            
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
                await getServerIdForRouterSafe(targetRouterId, context);
                
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
            const existingId = await context.routerRegistry?.findPipeTransport(
                localRouter.id, 
                targetRouter.id
            );
            
            if (existingId) {
                // TODO: Implement reuse of existing pipe transport
                // This would require more complex state tracking
                logger.debug(`Found existing pipe transport ${existingId}, but reuse not yet implemented`);
            }
            
            // Fix for issue #4: Ensure consistent SRTP/RTX flags using !! for boolean conversion
            const pipeTransportOptions = {
                listenIp: { ip: '127.0.0.1' }, // Local piping uses loopback
                enableSctp: !!options.enableSctp,
                enableRtx: !!options.enableRtx,
                enableSrtp: !!options.enableSrtp
            };
            
            logger.debug(`Creating pipe transport pair with options: ${JSON.stringify(pipeTransportOptions)}`);
            
            // Create new pipe transports with IDENTICAL options
            const transport1 = await localRouter.createPipeTransport(pipeTransportOptions);
            const transport2 = await targetRouter.createPipeTransport(pipeTransportOptions);
            
            // Connect them
            await transport1.connect({
                ip: '127.0.0.1',
                port: transport2.tuple.localPort,
                srtpParameters: transport2.srtpParameters // Include SRTP if enabled
            });
            
            await transport2.connect({
                ip: '127.0.0.1',
                port: transport1.tuple.localPort,
                srtpParameters: transport1.srtpParameters // Include SRTP if enabled
            });
            
            // Set up cleanup of transports
            const cleanupTransports = () => {
                try {
                    if (!transport1.closed) transport1.close();
                    if (!transport2.closed) transport2.close();
                    
                    // Remove from registry on close
                    context.routerRegistry?.removePipeTransport(transport1.id).catch(e => {
                        logger.error(`Failed to remove pipe transport ${transport1.id}: ${e}`);
                    });
                    
                    context.routerRegistry?.removePipeTransport(transport2.id).catch(e => {
                        logger.error(`Failed to remove pipe transport ${transport2.id}: ${e}`);
                    });
                } catch (cleanupError) {
                    logger.error(`Error during transport cleanup: ${cleanupError}`);
                }
            };
            
            // Transport events - using the correct event name for Transport.observer
            transport1.observer.once('close', () => {
                logger.debug('PipeTransport 1 closed, cleaning up pipe resources');
                cleanupTransports();
            });
            
            transport2.observer.once('close', () => {
                logger.debug('PipeTransport 2 closed, cleaning up pipe resources');
                cleanupTransports();
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
            // Check if producer lookup function is available
            if (!context.getProducer) {
                throw new Error('getProducer function not available in context');
            }
            
            try {
                // Fetch the actual producer from application state
                const producer = await context.getProducer(producerId);
                
                if (!producer) {
                    throw new Error(`Producer ${producerId} not found`);
                }
                
                logger.debug(`Found producer ${producerId} for local piping`);
                
                // Create consumer on the local transport
                const pipeConsumer = await localTransport.consume({
                    producerId: producer.id
                });
                
                // Create producer on the remote transport
                const pipeProducer = await remoteTransport.produce({
                    id: producer.id,
                    kind: pipeConsumer.kind,
                    rtpParameters: pipeConsumer.rtpParameters,
                    paused: pipeConsumer.producerPaused,
                    appData: producer.appData
                });
                
                // Set up proper event forwarding
                producer.observer.once('close', () => {
                    logger.debug(`Original producer ${producer.id} closed, closing pipe producer`);
                    if (!pipeProducer.closed) pipeProducer.close();
                });
                
                pipeConsumer.observer.once('close', () => {
                    logger.debug(`Pipe consumer closed, closing pipe producer`);
                    if (!pipeProducer.closed) pipeProducer.close();
                });
                
                pipeProducer.observer.once('close', () => {
                    logger.debug(`Pipe producer closed, cleaning up resources`);
                    if (!pipeConsumer.closed) pipeConsumer.close();
                });
                
                // Forward pause/resume events
                producer.observer.on('pause', () => {
                    if (!pipeProducer.paused) pipeProducer.pause();
                });
                
                producer.observer.on('resume', () => {
                    if (pipeProducer.paused) pipeProducer.resume();
                });
                
                return { pipeConsumer, pipeProducer };
            } catch (error) {
                logger.error(`Error handling producer piping: ${error}`);
                throw error;
            }
        }
        // Handle data producer piping
        else if (dataProducerId) {
            // Check for data producer lookup function
            if (!context.getDataProducer) {
                throw new Error('getDataProducer function not available in context');
            }
            
            try {
                // Fetch the actual data producer
                const dataProducer = await context.getDataProducer(dataProducerId);
                
                if (!dataProducer) {
                    throw new Error(`DataProducer ${dataProducerId} not found`);
                }
                
                logger.debug(`Found data producer ${dataProducerId} for local piping`);
                
                // Create data consumer on the local transport
                const pipeDataConsumer = await localTransport.consumeData({
                    dataProducerId: dataProducer.id
                });
                
                // Create data producer on the remote transport
                const pipeDataProducer = await remoteTransport.produceData({
                    id: dataProducer.id,
                    sctpStreamParameters: pipeDataConsumer.sctpStreamParameters || { streamId: 0, ordered: true },
                    label: pipeDataConsumer.label,
                    protocol: pipeDataConsumer.protocol,
                    appData: dataProducer.appData
                });
                
                // Set up proper event forwarding
                dataProducer.observer.once('close', () => {
                    logger.debug(`Original data producer ${dataProducer.id} closed, closing pipe data producer`);
                    if (!pipeDataProducer.closed) pipeDataProducer.close();
                });
                
                pipeDataConsumer.observer.once('close', () => {
                    logger.debug(`Pipe data consumer closed, closing pipe data producer`);
                    if (!pipeDataProducer.closed) pipeDataProducer.close();
                });
                
                // Return the pipe consumer and producer information
                return {
                    pipeDataConsumer: safeDataConsumerInfo(pipeDataConsumer),
                    pipeDataProducer
                };
            } catch (error) {
                logger.error(`Error handling data producer piping: ${error}`);
                throw error;
            }
        }
        
        // If we reach this point, no piping was done
        return {};
    } catch (error) {
        logger.error(`Error in pipeToLocalRouter: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
};

/**
 * Handle an incoming pipe initiate message
 * This function processes incoming pipe initiation requests from other servers
 */
export const handlePipeInitiateMessage = async (
    message: PipeInitiateMessage,
    context: PipeContext
): Promise<void> => {
    const { localRouter, webSocketService, getProducer, createRemoteProducer, createRemoteDataProducer } = context;
    const {
        correlationId, sourceServerId, sourceRouterId,
        producerId, dataProducerId, // Original IDs from source server
        producerInfo, dataProducerInfo, // Detailed info from source server
        roomName,
        pipeTransportInfo: sourcePipeTransportInfo // Info about source server's pipe transport
    } = message;

    if (processingPipeInitiations.has(correlationId)) {
        logger.warn(`[Target] Received duplicate pipe_initiate for already processing corrId ${correlationId}. Ignoring.`);
        return;
    }
    processingPipeInitiations.add(correlationId);
    logger.debug(`[Target] Added corrId ${correlationId} to processing set for pipe_initiate.`);

    if (!webSocketService || !localRouter) {
        logger.error(`[Target] Cannot handle pipe_initiate (corrId ${correlationId}): webSocketService or localRouter is undefined.`);
        if (webSocketService) {
            await sendPipeRejectMessage(message, 'Internal server error: Missing context', webSocketService);
        }
        processingPipeInitiations.delete(correlationId);
        logger.debug(`[Target] Removed corrId ${correlationId} from processing set due to missing context.`);
        return;
    }

    let localPipeTransport: mediasoup.types.PipeTransport | undefined;
    let pipeConsumer: mediasoup.types.Consumer | undefined; // Changed from pipeProducer
    let pipeDataConsumer: mediasoup.types.DataConsumer | undefined; // Changed from pipeDataProducer

    try {
        localPipeTransport = await localRouter.createPipeTransport({
            listenIp: { ip: '0.0.0.0', announcedIp: webSocketService.getPublicIp() || '127.0.0.1' },
            enableSctp: !!message.options?.enableSctp,
            enableRtx: !!message.options?.enableRtx,
            enableSrtp: !!message.options?.enableSrtp,
            appData: { pipeTarget: true, correlationId, roomName, sourceServerId, targetRouterId: localRouter.id }
        });
        logger.debug(`[Target] Created PipeTransport ${localPipeTransport.id} for corrId ${correlationId}`);

        localPipeTransport.observer.once('close', () => {
            logger.warn(`[Target] PipeTransport ${localPipeTransport?.id} (corrId: ${correlationId}) closed.`);
            if (pipeConsumer && !pipeConsumer.closed) pipeConsumer.close();
            if (pipeDataConsumer && !pipeDataConsumer.closed) pipeDataConsumer.close();
            if (processingPipeInitiations.has(correlationId)) {
                processingPipeInitiations.delete(correlationId);
                logger.debug(`[Target] Removed corrId ${correlationId} from processing set on transport close.`);
            }
        });

        // Connect to the source server's pipe transport BEFORE consuming
        if (sourcePipeTransportInfo) {
            logger.debug(`[Target] Connecting local PipeTransport ${localPipeTransport.id} to source transport at ${sourcePipeTransportInfo.ip}:${sourcePipeTransportInfo.port} for corrId ${correlationId}`);
            
            // Fix for issue #3: Ensure transports are fully connected before creating consumers
            // Connect local transport to the remote transport from the confirmation
            await localPipeTransport.connect({
                ip: sourcePipeTransportInfo.ip,
                port: sourcePipeTransportInfo.port,
                srtpParameters: sourcePipeTransportInfo.srtpParameters
            });
            logger.debug(`[Target] Successfully connected local PipeTransport ${localPipeTransport.id} to source transport for corrId ${correlationId}`);
        } else {
            throw new Error('Cannot connect pipe transport: missing sourcePipeTransportInfo in pipe_initiate message');
        }

        if (producerId && producerInfo) {
            logger.debug(`[Target] Attempting to consume remote producer ${producerId} via PipeTransport ${localPipeTransport.id} for corrId ${correlationId}`);
            pipeConsumer = await localPipeTransport.consume({ // CORRECTED: Use consume
                producerId: producerId, // This is the ID of the producer on the SOURCE server
                appData: {
                    ...(producerInfo.appData || {}),
                    isPipeConsumer: true,
                    sourceServerId: sourceServerId,
                    originalProducerId: producerId,
                    correlationId,
                    roomName
                }
            });
            logger.debug(`[Target] Created PipeConsumer ${pipeConsumer.id} (consuming remote producer ${producerId}) for corrId ${correlationId}`);

            pipeConsumer.observer.once('close', () => {
                logger.warn(`[Target] PipeConsumer ${pipeConsumer?.id} (consuming remote producer ${producerId}) closed.`);
            });

            if (createRemoteProducer) {
                await createRemoteProducer({
                    id: pipeConsumer.producerId, // Use original producerId for client-facing ID
                    kind: pipeConsumer.kind,
                    rtpParameters: pipeConsumer.rtpParameters,
                    routerId: localRouter.id,
                    proxyProducer: pipeConsumer, // Pass the actual Consumer object
                    roomName: roomName,
                    appData: { ...(pipeConsumer.appData || {}), type: pipeConsumer.type, paused: pipeConsumer.producerPaused, score: pipeConsumer.score }
                });
                logger.debug(`[Target] Registered remote producer (via PipeConsumer ${pipeConsumer.id}) for original ID ${pipeConsumer.producerId} locally using createRemoteProducer for corrId ${correlationId}`);
            } else {
                logger.warn(`[Target] createRemoteProducer function missing in context. Cannot register remote producer ${pipeConsumer.producerId} for corrId ${correlationId}.`);
            }
        } else if (dataProducerId && dataProducerInfo) {
            logger.debug(`[Target] Attempting to consume remote data producer ${dataProducerId} via PipeTransport ${localPipeTransport.id} for corrId ${correlationId}`);
            pipeDataConsumer = await localPipeTransport.consumeData({ // CORRECTED: Use consumeData
                dataProducerId: dataProducerId, // ID of the data producer on the SOURCE server
                appData: {
                    ...(dataProducerInfo.appData || {}),
                    isPipeDataConsumer: true,
                    sourceServerId: sourceServerId,
                    originalDataProducerId: dataProducerId,
                    correlationId,
                    roomName
                }
            });
            logger.debug(`[Target] Created PipeDataConsumer ${pipeDataConsumer.id} (consuming remote data producer ${dataProducerId}) for corrId ${correlationId}`);
            
            pipeDataConsumer.observer.once('close', () => {
                logger.warn(`[Target] PipeDataConsumer ${pipeDataConsumer?.id} (consuming remote data producer ${dataProducerId}) closed.`);
            });

            if (createRemoteDataProducer) { // Assuming a similar function exists for data producers
                await createRemoteDataProducer({
                    id: pipeDataConsumer.dataProducerId, // Original data producer ID
                    sctpStreamParameters: pipeDataConsumer.sctpStreamParameters,
                    label: pipeDataConsumer.label,
                    protocol: pipeDataConsumer.protocol,
                    routerId: localRouter.id,
                    proxyDataProducer: pipeDataConsumer, // Pass the actual DataConsumer
                    roomName: roomName,
                    appData: { ...(pipeDataConsumer.appData || {}) }
                });
                logger.debug(`[Target] Registered remote data producer (via PipeDataConsumer ${pipeDataConsumer.id}) for original ID ${pipeDataConsumer.dataProducerId} locally using createRemoteDataProducer for corrId ${correlationId}`);
            } else {
                logger.warn(`[Target] createRemoteDataProducer function missing in context. Cannot register remote data producer ${pipeDataConsumer.dataProducerId} for corrId ${correlationId}.`);
            }
        } else {
            throw new Error('Pipe initiate message lacks producer/dataProducer ID or detailed info');
        }

        const confirmMessage: PipeConfirmMessage = {
            type: 'pipe_confirm',
            correlationId: correlationId,
            sourceServerId: webSocketService.getCurrentServerId(),
            targetServerId: sourceServerId,
            sourceRouterId: localRouter.id,
            targetRouterId: sourceRouterId,
            pipeTransportInfo: {
                id: localPipeTransport.id,
                ip: localPipeTransport.tuple.localAddress || webSocketService.getPublicIp(),
                port: localPipeTransport.tuple.localPort,
                srtpParameters: localPipeTransport.srtpParameters
            },
            consumerInfo: pipeConsumer ? {
                id: pipeConsumer.id,
                producerId: pipeConsumer.producerId,
                kind: pipeConsumer.kind,
                rtpParameters: pipeConsumer.rtpParameters,
                type: pipeConsumer.type,
                paused: pipeConsumer.producerPaused, // Reflects source producer's paused state
                score: pipeConsumer.score
            } : undefined,
            dataConsumerInfo: pipeDataConsumer ? safeDataConsumerInfo(pipeDataConsumer) : undefined
        };

        logger.debug(`[Target] Sending pipe_confirm [correlationId:${correlationId}] with transport ${localPipeTransport.id} details and consumer info.`);
        await webSocketService.sendMessage(sourceServerId, confirmMessage);

        if (pipeConsumer) {
             logger.info(`[Target] Successfully processed pipe_initiate for media producer ${producerId} (now Consumer ${pipeConsumer.id}) on corrId ${correlationId}. RTP should flow.`);
        }
        if (pipeDataConsumer) {
            logger.info(`[Target] Successfully processed pipe_initiate for data producer ${dataProducerId} (now DataConsumer ${pipeDataConsumer.id}) on corrId ${correlationId}. SCTP should flow.`);
        }

        // Setup RTP observer (if it exists and is relevant here)
        // try {
        //     setupRtpObserver(localRouter, context); // Consider if this is still needed or how it interacts
        // } catch (err) {
        //     logger.error(`Failed to set up RTP observer: ${err}`);
        // }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[Target] Error handling pipe_initiate for corrId ${correlationId}: ${errorMessage}. Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
        if (localPipeTransport && !localPipeTransport.closed) {
            localPipeTransport.close();
        }
        if (pipeConsumer && !pipeConsumer.closed) {
            pipeConsumer.close();
        }
        if (pipeDataConsumer && !pipeDataConsumer.closed) {
            pipeDataConsumer.close();
        }
        await sendPipeRejectMessage(message, `Failed to process pipe initiate: ${errorMessage}`, webSocketService);
    } finally {
        if (processingPipeInitiations.has(correlationId)) {
            processingPipeInitiations.delete(correlationId);
            logger.debug(`[Target] Removed corrId ${correlationId} from processing set in finally block of pipe_initiate handler.`);
        }
    }
};

export const handlePipeSignalingMessage = async (message: PipeSignalingMessage, context: PipeContext): Promise<void> => {
    const { type } = message;
    
    try {
        logger.debug(`Handling pipe signaling message of type: ${type}`);
        
        switch (type) {
            case 'pipe_initiate':
                await handlePipeInitiateMessage(message as PipeInitiateMessage, context);
                break;
                
            case 'pipe_confirm':
            case 'pipe_reject':
                await handlePipeResponseMessage(message as PipeConfirmMessage | PipeRejectMessage, context);
                break;
                
            default:
                logger.warn(`Unknown pipe signaling message type: ${type}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling pipe signaling message: ${errorMessage}`);
    }
};

/**
 * Handle an incoming pipe response message (confirm or reject)
 */
const handlePipeResponseMessage = async (
    message: PipeConfirmMessage | PipeRejectMessage,
    context: PipeContext
): Promise<void> => {
    const { type, correlationId } = message;
    
    try {
        logger.debug(`Processing ${type} message with correlationId ${correlationId}`);
        
        if (type === 'pipe_confirm') {
            await handlePipeConfirmMessage(message as PipeConfirmMessage, context);
        } else if (type === 'pipe_reject') {
            await handlePipeRejectMessage(message as PipeRejectMessage, context);
        } else {
            throw new Error(`Unknown pipe response message type: ${type}`);
        }
    } catch (error) {
        // Even if we fail to handle the message, make sure we clean up any resources
        // associated with this correlationId
        if (context.pendingRequests) {
            const pendingRequest = context.pendingRequests.get(correlationId);
            if (pendingRequest) {
                try {
                    clearTimeout(pendingRequest.timeout);
                    
                    // Close the transport if it exists
                    if (pendingRequest.transport && !pendingRequest.transport.closed) {
                        pendingRequest.transport.close();
                    }
                    
                    // Unregister from registry
                    if (context.routerRegistry && pendingRequest.transport) {
                        await context.routerRegistry.removePipeTransport(pendingRequest.transport.id)
                            .catch(e => logger.error(`Failed to remove pipe transport from registry: ${e}`));
                    }
                    
                    // Remove from map
                    if (context.remotePipeTransports && pendingRequest.transport) {
                        context.remotePipeTransports.delete(pendingRequest.transport.id);
                    }
                    
                    // Reject the pending promise
                    pendingRequest.reject(new Error(`Failed to handle pipe response: ${error instanceof Error ? error.message : String(error)}`));
                    
                    // Remove from pending requests
                    context.pendingRequests.delete(correlationId);
                } catch (cleanupError) {
                    logger.error(`Error during cleanup of failed pipe response: ${cleanupError}`);
                }
            }
        }
        
        // Re-throw the original error
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling pipe response message: ${errorMsg}`);
        throw error;
    }
};

/**
 * Handle a pipe confirm message
 * This function processes the confirmation from the target server and creates the consumer on the source side
 */
const handlePipeConfirmMessage = async (
    message: PipeConfirmMessage,
    context: PipeContext
): Promise<void> => {
    const { correlationId, pipeTransportInfo } = message;
    const { pendingRequests, webSocketService, localRouter } = context;

    logger.debug(`[Source] Received pipe_confirm [correlationId:${correlationId}]`);

    if (!pendingRequests || !webSocketService || !localRouter) {
        logger.error(`[Source] Cannot handle pipe_confirm ${correlationId}: Missing context`);
        return; // Cannot proceed
    }

    // 1. Find Pending Request and Local Transport
    const pendingRequest = pendingRequests.get(correlationId);
    if (!pendingRequest) {
        logger.warn(`[Source] No pending request found for correlationId: ${correlationId}`);
        return;
    }

    const localPipeTransport = pendingRequest.transport;
    if (!localPipeTransport || localPipeTransport.closed) {
        logger.error(`[Source] Local PipeTransport for ${correlationId} not found or closed.`);
        clearTimeout(pendingRequest.timeout);
        pendingRequest.reject(new Error('Local pipe transport missing or closed'));
        pendingRequests.delete(correlationId);
        return;
    }

    // Clear timeout now that we have confirmation
    clearTimeout(pendingRequest.timeout);

    let pipeConsumer: mediasoup.types.Consumer | undefined;
    let pipeDataConsumer: mediasoup.types.DataConsumer | undefined;
    const result: PipeToRouterResult = {}; // Prepare result object

    try {
        // 2. Connect Local Transport to Remote Transport
        logger.debug(`[Source] Connecting local transport ${localPipeTransport.id} to remote ${pipeTransportInfo.ip}:${pipeTransportInfo.port} for corrId ${correlationId}`);
        
        // Fix for issue #3: Ensure transports are fully connected before creating consumers
        // Connect local transport to the remote transport from the confirmation
        await localPipeTransport.connect({
            ip: pipeTransportInfo.ip,
            port: pipeTransportInfo.port,
            srtpParameters: pipeTransportInfo.srtpParameters // Use SRTP params from remote
        });
        logger.debug(`[Source] Local transport ${localPipeTransport.id} connected successfully.`);

        // 3. Create Local PipeConsumer/PipeDataConsumer AFTER transport is connected
        if (pendingRequest.type === 'producer' && pendingRequest.producerId) {
            // Get the original producer
            const producer = await context.getProducer(pendingRequest.producerId);
            if (!producer) {
                throw new Error(`Original producer ${pendingRequest.producerId} not found`);
            }

            // Create the consumer on our local transport that consumes the original producer
            pipeConsumer = await localPipeTransport.consume({
                producerId: pendingRequest.producerId,
                appData: {
                    ...producer?.appData, // Use original producer's appData if available
                    isPipeConsumer: true, // Mark as pipe consumer
                    targetServerId: message.sourceServerId, // Where the pipe leads
                    targetPipeProducerId: pipeTransportInfo.id, // ID of the producer on the other side (might be useful)
                    correlationId,
                    roomName: pendingRequest.roomName
                }
            });

            const consumerInfo: ConsumerInfo = {
                id: pipeConsumer.id,
                producerId: pipeConsumer.producerId,
                kind: pipeConsumer.kind,
                rtpParameters: pipeConsumer.rtpParameters
            };
            
            result.pipeConsumer = consumerInfo; // Add to result
            logger.debug(`[Source] Created PipeConsumer ${pipeConsumer.id} consuming original producer ${pendingRequest.producerId} on transport ${localPipeTransport.id}`);

            // Link consumer lifetime to transport
            pipeConsumer.observer.once('close', () => {
                logger.warn(`[Source] PipeConsumer ${pipeConsumer?.id} closed.`);
                if (!localPipeTransport.closed) localPipeTransport.close();
            });

        } else if (pendingRequest.type === 'dataProducer' && pendingRequest.dataProducerId) {
            // Get original data producer
            const dataProducer = await context.getDataProducer(pendingRequest.dataProducerId);
            if (!dataProducer) {
                throw new Error(`Original data producer ${pendingRequest.dataProducerId} not found`);
            }

            pipeDataConsumer = await localPipeTransport.consumeData({
                dataProducerId: pendingRequest.dataProducerId,
                appData: { pipeDataConsumer: true, correlationId, roomName: pendingRequest.roomName }
            });
            
            result.pipeDataConsumer = safeDataConsumerInfo(pipeDataConsumer);
            logger.debug(`[Source] Created PipeDataConsumer ${pipeDataConsumer.id} consuming original data producer ${pendingRequest.dataProducerId} on transport ${localPipeTransport.id}`);
            
            // Link lifetime
            pipeDataConsumer.observer.once('close', () => {
                logger.warn(`[Source] PipeDataConsumer ${pipeDataConsumer?.id} closed.`);
                if (!localPipeTransport.closed) localPipeTransport.close();
            });
        } else {
            throw new Error('Missing producer/dataProducer ID in pending request');
        }

        // 4. Resolve the Promise
        pendingRequest.resolve(result);
        logger.debug(`[Source] Successfully resolved pipe request ${correlationId}`);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[Source] Error handling pipe_confirm for ${correlationId}: ${errorMessage}`);
        pendingRequest.reject(error); // Reject the promise on error
        
        // Close transport and consumers if created
        if (pipeConsumer && !pipeConsumer.closed) pipeConsumer.close();
        if (pipeDataConsumer && !pipeDataConsumer.closed) pipeDataConsumer.close();
        if (!localPipeTransport.closed) localPipeTransport.close(); // Close transport last
    } finally {
        // Always remove the pending request
        pendingRequests.delete(correlationId);
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
            logger.warn(`No pending request found for correlationId ${correlationId}`);
            return;
        }
        
        // Get the pending request data
        const pendingRequest = pendingRequests.get(correlationId);
        if (!pendingRequest) {
            logger.warn(`Pending request is null for correlationId: ${correlationId}`);
            return;
        }
        
        // If we have timeouts set, clear them
        if (pendingRequest.timeout) {
            clearTimeout(pendingRequest.timeout);
        }
        
        // Reject the promise
        pendingRequest.reject(new Error(`Remote pipe rejected: ${reason}`));
        
        // And remove from pendingRequests
        pendingRequests.delete(correlationId);
        
        logger.info(`Pipe request ${correlationId} rejected: ${reason}`);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to handle pipe_reject: ${errorMessage}`);
        
        // Even on error, try to clean up the pending request
        if (pendingRequests && pendingRequests.has(correlationId)) {
            const pendingRequest = pendingRequests.get(correlationId);
            if (pendingRequest && pendingRequest.timeout) {
                clearTimeout(pendingRequest.timeout);
            }
            pendingRequests.delete(correlationId);
        }
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
    const {
        localRouter, webSocketService, pendingRequests,
        getProducer, getDataProducer // Make sure these are passed in context
    } = context;

    const {
        producerId, dataProducerId, targetRouterId, targetServerId, roomName
    } = options;

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
        (context as any).pipedProducers = new Set<string>();
    }
    
    // Check if this producer is already being piped to this target
    const pipedProducersSet = (context as any).pipedProducers as Set<string>;
    const pipeKey = `${producerId || dataProducerId}:${targetRouterId}`;
    
    if (pipedProducersSet.has(pipeKey)) {
        logger.debug(`[Source] Producer ${producerId || dataProducerId} already piped to router ${targetRouterId}. Skipping duplicate.`);
        return {}; // Return empty result since already piped
    }
    
    // Mark as being piped to prevent duplicates
    pipedProducersSet.add(pipeKey);
    logger.debug(`[Source] Marking ${pipeKey} as being piped`);

    const correlationId = uuidv4();
    let localPipeTransport: mediasoup.types.PipeTransport | undefined; // Define here for cleanup

    try {
        // 1. Get Producer/DataProducer Info
        let producerInfo;
        let actualProducerId = producerId; // Use original ID
        if (producerId) {
            // Fetch the actual producer object using the context function
            const producer = await getProducer?.(producerId); // Use optional chaining
            if (!producer) throw new Error(`Producer ${producerId} not found locally.`);
            producerInfo = { // Extract info from the producer object
                id: producer.id,
                kind: producer.kind,
                rtpParameters: producer.rtpParameters,
                paused: producer.paused,
                appData: producer.appData
            };
            actualProducerId = producer.id; // Confirm ID
            logger.debug(`[Source] Retrieved producer info for ${actualProducerId}`);
        }

        let dataProducerInfo;
        if (dataProducerId) {
            const dataProducer = await getDataProducer?.(dataProducerId);
            if (!dataProducer) throw new Error(`DataProducer ${dataProducerId} not found locally.`);
            dataProducerInfo = { // Extract info
                id: dataProducer.id,
                sctpStreamParameters: dataProducer.sctpStreamParameters,
                label: dataProducer.label,
                protocol: dataProducer.protocol,
                appData: dataProducer.appData
            };
            logger.debug(`[Source] Retrieved dataProducer info for ${dataProducerId}`);
        }

        if (!producerInfo && !dataProducerInfo) {
            throw new Error('No valid producer or dataProducer found for piping.');
        }

        // 2. Create the LOCAL PipeTransport *before* sending initiate
        localPipeTransport = await localRouter.createPipeTransport({
            listenIp: { ip: '127.0.0.1' },
            enableSctp: options.enableSctp ?? true,
            enableRtx: options.enableRtx ?? true,
            enableSrtp: options.enableSrtp ?? false,
            appData: { pipeSource: true, correlationId, roomName } // Add metadata
        });
        logger.debug(`[Source] Created PipeTransport ${localPipeTransport.id} for corrId ${correlationId}`);

        // Handle transport closure for cleanup
        localPipeTransport.observer.once('close', () => {
            logger.warn(`[Source] PipeTransport ${localPipeTransport?.id} (corrId: ${correlationId}) closed.`);
            // Clean up pending request if it still exists for this transport
            if (pendingRequests.has(correlationId)) {
                const req = pendingRequests.get(correlationId);
                if (req && req.transport?.id === localPipeTransport?.id) {
                    clearTimeout(req.timeout);
                    req.reject(new Error(`PipeTransport ${localPipeTransport?.id} closed prematurely.`));
                    pendingRequests.delete(correlationId);
                    logger.debug(`[Source] Removed pending request ${correlationId} due to transport close.`);
                }
            }
        });

        // 3. Setup Signaling Promise and Pending Request
        const setupSignalingPromise = new Promise<PipeToRouterResult>((resolve, reject) => {
            const timeoutDuration = context.pipeTimeout || 30000;
            const timeoutTimer = setTimeout(() => {
                logger.error(`[Source] Pipe request ${correlationId} timed out after ${timeoutDuration}ms.`);
                if (pendingRequests.has(correlationId)) {
                    const req = pendingRequests.get(correlationId);
                    if (req) {
                        req.reject(new Error(`Pipe operation timed out for ${correlationId} after ${timeoutDuration}ms`));
                    }
                    pendingRequests.delete(correlationId);
                    logger.debug(`[Source] Removed pending request ${correlationId} due to timeout.`);
                    
                    // Close the transport associated with the timed-out request
                    if (localPipeTransport && !localPipeTransport.closed) {
                        logger.warn(`[Source] Closing PipeTransport ${localPipeTransport.id} due to timeout for ${correlationId}.`);
                        localPipeTransport.close();
                    }
                }
            }, timeoutDuration);

            // Store the transport with the pending request for use in handlePipeConfirmMessage
            // Include targetRouterId to help identify potential duplicates
            pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutTimer,
                transport: localPipeTransport!, // ** Store the transport ** (with non-null assertion)
                type: producerId ? 'producer' : 'dataProducer',
                producerId: actualProducerId,
                dataProducerId,
                roomName,
                targetRouterId // Add target router ID for duplicate detection
            });
            logger.debug(`[Source] Stored pending request ${correlationId} with transport ${localPipeTransport?.id} targeting router ${targetRouterId}`);
        });

        // 4. Send Initiate Message
        const initiateMessage: PipeInitiateMessage = {
            type: 'pipe_initiate',
            correlationId,
            sourceServerId: webSocketService.getCurrentServerId(),
            targetServerId,
            sourceRouterId: localRouter.id,
            targetRouterId,
            producerId: actualProducerId,
            dataProducerId,
            producerInfo, // Send extracted info
            dataProducerInfo, // Send extracted info
            roomName,
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

        logger.debug(`[Source] Sending pipe_initiate [correlationId:${correlationId}] to ${targetServerId}`);
        await webSocketService.sendMessage(targetServerId, initiateMessage);

        // 5. Wait for the response promise
        return await setupSignalingPromise;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[Source] Error in pipeToRemoteRouter for corrId ${correlationId}: ${errorMessage}`);

        // Cleanup on error
        if (pendingRequests.has(correlationId)) {
            const req = pendingRequests.get(correlationId);
            if (req) clearTimeout(req.timeout);
            pendingRequests.delete(correlationId);
            logger.debug(`[Source] Removed pending request ${correlationId} due to error.`);
        }
        if (localPipeTransport && !localPipeTransport.closed) {
            logger.warn(`[Source] Closing PipeTransport ${localPipeTransport.id} due to error during initiation for ${correlationId}.`);
            localPipeTransport.close();
        }
        throw error; // Re-throw
    }
};

/**
 * Main entry point function that orchestrates the piping between routers
 * This is what you'd export and call from other parts of your application
 */
export const pipeMediaBetweenRouters = async (
    options: PipeOptions,
    context: PipeContext
): Promise<() => Promise<PipeToRouterResult>> => {
    logger.debug(`Deciding pipe strategy for router ${options.targetRouterId}`);
    
    try {
        // Check if the target router is local or remote
        const isLocal = await isLocalRouterSafe(options.targetRouterId, context);
        
        if (isLocal) {
            logger.debug(`Target router ${options.targetRouterId} is local. Using local piping.`);
            const targetRouter = await getLocalRouterSafe(options.targetRouterId, context);
            
            if (!targetRouter) {
                throw new Error(`Target router ${options.targetRouterId} is marked as local but not found`);
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
            logger.debug(`Target router ${options.targetRouterId} is remote. Using remote piping.`);
            const resolvedTargetServerId = options.targetServerId || 
                await getServerIdForRouterSafe(options.targetRouterId, context);
                
            if (!resolvedTargetServerId) {
                throw new Error(`Could not resolve server ID for router ${options.targetRouterId}`);
            }
            
            return () => pipeToRemoteRouter(
                { ...options, targetServerId: resolvedTargetServerId },
                context
            );
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to decide pipe strategy: ${errorMessage}`);
        throw error;
    }
};

/**
 * Get data producer information needed for piping
 */
export const getDataProducerInfo = async (dataProducerId: string, context: PipeContext): Promise<any> => {
    if (!dataProducerId) {
        throw new Error('dataProducerId is required');
    }
    
    const dataProducer = await context.getDataProducer?.(dataProducerId);
    if (!dataProducer) {
        throw new Error(`DataProducer with ID ${dataProducerId} not found`);
    }
    
    // Ensure sctpStreamParameters exists
    const sctpParams = dataProducer.sctpStreamParameters || { streamId: 0, ordered: true };
    
    // Extract the necessary information for piping
    return {
        sctpStreamParameters: sctpParams,
        label: dataProducer.label,
        protocol: dataProducer.protocol,
        appData: dataProducer.appData
    };
};

/**
 * Create an enhanced proxy for a producer that handles keyframe requests for piped producers
 * This is a critical workaround for handling RTP/RTCP PLI (Picture Loss Indication) requests
 */
const createEnhancedProducerProxy = (
    originalProducer: mediasoup.types.Producer
): mediasoup.types.Producer & { requestKeyFrame: () => Promise<void> } => {
    // Only add custom implementation for video producers
    if (originalProducer.kind !== 'video') {
        return originalProducer as mediasoup.types.Producer & { requestKeyFrame: () => Promise<void> };
    }
    
    // Create a proxy to intercept method calls
    const producerProxy = new Proxy(originalProducer, {
        get(target, prop, receiver) {
            // Intercept the requestKeyFrame method
            if (prop === 'requestKeyFrame') {
                // Return our custom implementation as an async function
                return async (): Promise<void> => {
                    logger.debug(`Enhanced requestKeyFrame called on producer ${target.id}`);
                    
                    try {
                        // First try: if we have a pipeConsumer, try to request a keyframe through it
                        if (transportConsumerMap.has(target.id)) {
                            const consumer = transportConsumerMap.get(target.id);
                            if (consumer && typeof consumer.requestKeyFrame === 'function') {
                                try {
                                    logger.debug(`Requesting keyframe through pipeConsumer ${consumer.id}`);
                                    await consumer.requestKeyFrame();
                                    logger.debug(`Successfully requested keyframe through pipeConsumer for producer ${target.id}`);
                                    return;
                                } catch (error) {
                                    const errorMsg = error instanceof Error ? error.message : String(error);
                                    // mappedSsrc not found is a common error early in the pipeConsumer lifecycle
                                    if (errorMsg.includes('mappedSsrc not found')) {
                                        logger.debug(`Expected error when requesting keyframe: ${errorMsg}`);
                                    } else {
                                        logger.warn(`Error requesting keyframe through pipeConsumer: ${errorMsg}`);
                                    }
                                    // Continue to other methods, don't return/throw here
                                }
                            }
                        }
                        
                        // Second try: use any existing refresh method
                        if (typeof (target as any).refresh === 'function') {
                            try {
                                await (target as any).refresh();
                                logger.debug(`Successfully called refresh() on producer ${target.id}`);
                                return;
                            } catch (error) {
                                logger.warn(`Failed to call refresh: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        }
                        
                        // Third try: pause and resume the producer to force a new keyframe
                        if (!target.paused) {
                            try {
                                logger.debug(`Attempting pause/resume cycle for producer ${target.id}`);
                                await target.pause();
                                await new Promise(resolve => setTimeout(resolve, 100));
                                await target.resume();
                                logger.debug(`Successfully completed pause/resume for producer ${target.id}`);
                                return;
                            } catch (error) {
                                logger.warn(`Error in pause/resume cycle: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        }
                        
                        // If we reach here, all methods have failed
                        logger.warn(`All keyframe request methods failed for piped producer ${target.id}`);
                    } catch (error) {
                        logger.error(`Error in requestKeyFrame: ${error instanceof Error ? error.message : String(error)}`);
                    }
                    
                    // Return without throwing to prevent crashes
                    return;
                };
            }
            
            // Default behavior for all other properties
            return Reflect.get(target, prop, receiver);
        }
    });
    
    return producerProxy as mediasoup.types.Producer & { requestKeyFrame: () => Promise<void> };
};

/**
 * Utility to setup RTP observers for a router to detect video quality issues
 * and automatically trigger keyframe requests
 */
const setupRtpObserver = (router: mediasoup.types.Router, context: PipeContext): void => {
    if (!router) return;
    
    logger.debug(`Setting up RTP observer for router ${router.id}`);
    
    try {
        // Track producers that have received frames
        const framesReceived = new Set<string>();
        
        // Create RTP observer to monitor RTP packets and detect issues
        // Note: createRtpObserver may not be available in all mediasoup versions
        // Use type assertion to handle this
        const rtpObserver = (router as any).createRtpObserver?.({
            // Required RTP capabilities
            rtpCapabilities: {
                codecs: [
                    { mimeType: 'video/VP8', clockRate: 90000, payloadType: 96 },
                    { mimeType: 'video/H264', clockRate: 90000, payloadType: 97 }
                ]
            }
        });
        
        if (!rtpObserver) {
            logger.warn(`Could not create RTP observer for router ${router.id}`);
            return;
        }
        
        // Listen for PLI (Picture Loss Indication) requests and forward them
        rtpObserver.on('pli', async ({ producerId }: { producerId: string }) => {
            logger.debug(`[RTP] Received PLI request for producer ${producerId}`);
            
            try {
                // Try to find the producer
                if (context.getProducer) {
                    const producer = await context.getProducer(producerId);
                    if (producer) {
                        // Check if this is a regular producer or a piped producer
                        if (producer.appData?.isPipeProducer) {
                            logger.debug(`[RTP] ${producerId} is a pipe producer, forwarding PLI via pipe channel`);
                            // For pipe producers, we might need special handling
                        }
                        
                        // Request keyframe from the producer
                        if (typeof producer.requestKeyFrame === 'function') {
                            await producer.requestKeyFrame();
                            logger.debug(`[RTP] Successfully requested keyframe for producer ${producerId}`);
                        } else {
                            logger.warn(`[RTP] Producer ${producerId} does not have requestKeyFrame method`);
                        }
                    } else {
                        logger.warn(`[RTP] Could not find producer ${producerId} for PLI forwarding`);
                    }
                }
            } catch (error) {
                logger.error(`[RTP] Error forwarding PLI for producer ${producerId}: ${error}`);
            }
        });
        
        // Listen for FIR (Full Intra Request) - similar to PLI but more aggressive
        rtpObserver.on('fir', async ({ producerId }: { producerId: string }) => {
            logger.debug(`[RTP] Received FIR request for producer ${producerId}`);
            
            try {
                if (context.getProducer) {
                    const producer = await context.getProducer(producerId);
                    if (producer && typeof producer.requestKeyFrame === 'function') {
                        await producer.requestKeyFrame();
                        logger.debug(`[RTP] Successfully forwarded FIR to producer ${producerId}`);
                    }
                }
            } catch (error) {
                logger.error(`[RTP] Error forwarding FIR for producer ${producerId}: ${error}`);
            }
        });
        
        // Listen for packet loss events (NACK)
        rtpObserver.on('nack', ({ producerId, ssrc, sequenceNumbers }: { 
            producerId: string; 
            ssrc: number; 
            sequenceNumbers: number[] 
        }) => {
            logger.debug(`[RTP] Received NACK for producer ${producerId}, SSRC ${ssrc}, seq ${sequenceNumbers.length} packets`);
            // NACK is generally handled automatically by mediasoup, but we can log it
        });
        
        // Make sure to setup the RTP observer in both handlePipeInitiateMessage 
        // and pipeToRemoteRouter to ensure both sides handle media quality issues
        
        logger.debug(`[RTP] Successfully set up RTP observer for router ${router.id}`);
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to setup RTP observer: ${errorMessage}`);
    }
};

/**
 * Function to safely check if routerRegistry exists and call isLocalRouter
 */
const isLocalRouterSafe = async (routerId: string, context: PipeContext): Promise<boolean> => {
    if (!routerId) {
        return false;
    }
    
    try {
        return context.routerRegistry?.isLocalRouter(routerId) ?? false;
    } catch (error) {
        logger.error(`Error checking if router ${routerId} is local: ${error}`);
        return false;
    }
};

/**
 * Function to safely get a server ID for a router
 */
const getServerIdForRouterSafe = async (routerId: string, context: PipeContext): Promise<string | undefined> => {
    if (!context.routerRegistry) {
        logger.warn(`routerRegistry is not available in the context. Cannot get server ID for router ${routerId}.`);
        return undefined;
    }
    
    try {
        return await context.routerRegistry.getServerIdForRouter(routerId);
    } catch (error) {
        logger.error(`Failed to get server ID for router ${routerId}: ${error}`);
        return undefined;
    }
};

/**
 * Function to safely get a local router by ID
 */
const getLocalRouterSafe = async (routerId: string, context: PipeContext): Promise<mediasoup.types.Router | undefined> => {
    if (!context.routerRegistry) {
        logger.warn(`routerRegistry is not available in the context. Cannot get router ${routerId}.`);
        return undefined;
    }
    
    try {
        return await context.routerRegistry.getLocalRouter(routerId);
    } catch (error) {
        logger.error(`Failed to get router ${routerId}: ${error}`);
        return undefined;
    }
};

/**
 * Helper function to validate if a serverId string is valid
 */
const isValidServerId = (serverId: string | undefined): serverId is string => {
    return typeof serverId === 'string' && serverId.length > 0;
};

/**
 * Wrap the message sending to handle string | undefined safely
 */
const sendMessageSafely = async (
    message: any, 
    serverId: string,
    webSocketService: { sendMessage: (targetServerId: string, message: any) => Promise<void> } | undefined
): Promise<boolean> => {
    if (!webSocketService) {
        logger.error(`Cannot send message: webSocketService is undefined`);
        return false;
    }
    
    if (!isValidServerId(serverId)) {
        logger.error(`Cannot send message: invalid serverId '${serverId}'`);
        return false;
    }
    
    try {
        await webSocketService.sendMessage(serverId, message);
        return true;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to send message to server ${serverId}: ${errorMessage}`);
        return false;
    }
};

/**
 * Function to send a pipe reject message with proper null checking
 */
const sendPipeRejectMessage = async (
    originalMessage: { 
        correlationId: string; 
        sourceServerId: string; 
        sourceRouterId: string 
    }, 
    reason: string,
    webSocketService: { 
        sendMessage: (targetServerId: string, message: any) => Promise<void>;
        getCurrentServerId: () => string;
    }
): Promise<void> => {
    if (!webSocketService) {
        logger.error(`Cannot send pipe_reject: webSocketService is undefined`);
        return;
    }
    
    const rejectMessage: PipeRejectMessage = {
        type: 'pipe_reject',
        correlationId: originalMessage.correlationId,
        sourceServerId: webSocketService.getCurrentServerId(),
        targetServerId: originalMessage.sourceServerId,
        sourceRouterId: '', // May not have a local router id in error cases
        targetRouterId: originalMessage.sourceRouterId,
        reason
    };
    
    try {
        logger.debug(`Sending pipe_reject [correlationId:${originalMessage.correlationId}] reason: ${reason}`);
        await webSocketService.sendMessage(originalMessage.sourceServerId, rejectMessage);
    } catch (sendError: unknown) {
        logger.error(`Failed to send rejection: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
    }
};

/**
 * Function to get info from a producer object
 */
const getProducerInfo = async (
    producerId: string,
    context: PipeContext
): Promise<{
    id: string;
    kind: mediasoup.types.MediaKind;
    rtpParameters: mediasoup.types.RtpParameters;
    paused?: boolean;
    appData?: any;
} | undefined> => {
    const { localRouter } = context;
    
    if (!producerId) {
        logger.error('Cannot get producer info: producerId is undefined');
        return undefined;
    }
    
    logger.debug(`Getting producerInfo for ${producerId}`);
    
    try {
        // First, see if we have a getProducer function in context
        if (context.getProducer) {
            const producer = await context.getProducer(producerId);
            if (producer) {
                logger.debug(`Found producer ${producerId} using context.getProducer`);
                return {
                    id: producer.id,
                    kind: producer.kind,
                    rtpParameters: producer.rtpParameters,
                    paused: producer.paused,
                    appData: producer.appData
                };
            }
        }
        
        // Next, try the registry if it has a findProducer method
        // Note: We check if the method exists rather than assuming it does
        if (context.routerRegistry && typeof (context.routerRegistry as any).findProducer === 'function') {
            const findProducer = (context.routerRegistry as any).findProducer as (id: string) => Promise<any>;
            const producer = await findProducer(producerId);
            if (producer) {
                logger.debug(`Found producer ${producerId} using routerRegistry.findProducer`);
                return {
                    id: producer.id,
                    kind: producer.kind,
                    rtpParameters: producer.rtpParameters,
                    paused: producer.paused,
                    appData: producer.appData
                };
            }
        }
        
        // Finally, try to get it directly from the router
        if (localRouter) {
            // No good way to get producers from a router in mediasoup API
            // This would require a registry maintained separately
            logger.debug(`No built-in way to get producer ${producerId} directly from router`);
        }
        
        logger.error(`Could not find producer ${producerId}`);
        return undefined;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error getting producer info: ${errorMessage}`);
        return undefined;
    }
};

/**
 * Helper function to get or create a pipe transport pair between routers
 * This helps implement issue #8.1 recommendation to reuse transport pairs
 */
const getOrCreatePipeTransportPair = async (
    sourceRouterId: string,
    targetRouterId: string,
    options: {
        enableSctp?: boolean;
        enableRtx?: boolean;
        enableSrtp?: boolean;
        publicIp?: string;
    },
    context: PipeContext
): Promise<{
    sourceTransport: mediasoup.types.PipeTransport;
    targetTransport?: mediasoup.types.PipeTransport;
    isNewPair: boolean;
}> => {
    try {
        // 1. Check if there is an existing transport pair in the registry
        const existingTransportId = await context.routerRegistry?.findPipeTransport(
            sourceRouterId,
            targetRouterId
        );

        if (existingTransportId && context.remotePipeTransports) {
            const existingTransport = context.remotePipeTransports.get(existingTransportId);
            if (existingTransport && !existingTransport.closed) {
                logger.debug(`Reusing existing pipe transport ${existingTransportId} between routers ${sourceRouterId} and ${targetRouterId}`);
                return { 
                    sourceTransport: existingTransport, 
                    isNewPair: false 
                };
            }
        }

        // 2. If no reusable transport exists, create a new one on the source router
        const sourceRouter = await context.routerRegistry?.getLocalRouter(sourceRouterId);
        if (!sourceRouter) {
            throw new Error(`Source router ${sourceRouterId} not found`);
        }

        // Create with consistent options
        const transportOptions = {
            listenIp: { 
                ip: '0.0.0.0', 
                announcedIp: options.publicIp || '127.0.0.1' 
            },
            enableSctp: !!options.enableSctp,
            enableRtx: !!options.enableRtx,
            enableSrtp: !!options.enableSrtp
        };

        logger.debug(`Creating new pipe transport with options: ${JSON.stringify(transportOptions)}`);
        const sourceTransport = await sourceRouter.createPipeTransport(transportOptions);
        
        // 3. Register this new transport pair
        if (context.routerRegistry) {
            await context.routerRegistry.registerPipeTransport(
                sourceRouterId,
                targetRouterId,
                sourceTransport.id
            );
        }

        // 4. Add to maps for tracking
        if (context.remotePipeTransports) {
            context.remotePipeTransports.set(sourceTransport.id, sourceTransport);
        }

        // 5. Set up cleanup on close
        sourceTransport.observer.once('close', async () => {
            logger.debug(`Pipe transport ${sourceTransport.id} closed, cleaning up registry`);
            
            if (context.routerRegistry) {
                await context.routerRegistry.removePipeTransport(sourceTransport.id)
                    .catch(err => logger.error(`Failed to remove pipe transport from registry: ${err}`));
            }
            
            if (context.remotePipeTransports) {
                context.remotePipeTransports.delete(sourceTransport.id);
            }
            
            // Clean up any piped producer entries related to this transport
            if (context.pipedProducers) {
                // We'd need to track which producer uses which transport
                // This is a simplification - in a real implementation you'd maintain
                // a map of transport->producers
                logger.debug(`Transport ${sourceTransport.id} closed, cleaning up related piped producer entries`);
            }
        });

        return { 
            sourceTransport, 
            isNewPair: true 
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to get or create pipe transport pair: ${errorMessage}`);
        throw error;
    }
};

// Fix for issue #5: Add better cleanup for piped producers on producer close
export const cleanupPipedProducerResources = (
    producerId: string,
    context: PipeContext
): void => {
    if (!context.pipedProducers) return;
    
    // Find and remove all piped producer entries for this producer
    const pipedEntries = Array.from(context.pipedProducers)
        .filter(key => key.startsWith(`${producerId}:`));
        
    if (pipedEntries.length > 0) {
        logger.debug(`Cleaning up ${pipedEntries.length} piped entries for closed producer ${producerId}`);
        
        for (const entry of pipedEntries) {
            context.pipedProducers.delete(entry);
        }
    }
};