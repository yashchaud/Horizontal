// simpleSocket.js (or your main mediasoup logic file)
process.env.DEBUG = "mediasoup*,socket.io*";
const mediasoup = require("mediasoup");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const ioClient = require("socket.io-client");
 // Assuming pipetoremote.ts is compiled to pipetoremote.js
// Ensure this path is correct relative to simpleSocket.js
const {
    handlePipeSignalingMessage,
    pipeMediaBetweenRouters
} = require("./pipinglogic/pipetoremote"); // Check path carefully

// --- Configuration ---
// Read from environment variables
const THIS_SERVER_ID = process.env.SERVER_ID || 'server-1';
const PORT = process.env.PORT || 3001; // Port where THIS server's Socket.IO runs (from app.js)
const PUBLIC_IP = process.env.PUBLIC_IP || '127.0.0.1';
const REMOTE_SERVER_ID = process.env.REMOTE_SERVER_ID || 'server-2';
// IMPORTANT: Ensure this URL points to the *other* server's Socket.IO endpoint
const REMOTE_SERVER_URL = process.env.REMOTE_SERVER_URL || 'http://localhost:3002'; // Example: Use http if not using TLS between servers locally
const INTER_SERVER_SECRET = process.env.INTER_SERVER_SECRET || 'supersecret'; // Shared secret
// --- End Configuration ---

module.exports = async function (io) {

    // ==== Global Resources (scoped within this module) ====
    let worker = null;
    let router = null; // The single router for this server instance
    let peers = new Map(); // { socketId: { roomName, socket, transports[], producers[], consumers[], peerDetails } }
    let rooms = new Map(); // { roomName: { router, peers: Set<socketId> } } - router is always the local one here
    let transports = []; // [ { socketId, transport, roomName, consumer: boolean } ] - Track transports for cleanup
    let producers = []; // [ { socketId, producer, roomName } ] - Local producers only
    let consumers = []; // [ { socketId, consumer, roomName } ] - Local consumers (consuming local or proxied producers)

    // Connection state with remote server (CLIENT connection TO remote)
    let remoteRouterId = null;
    let connectedToRemoteServer = false;
    let remoteServerSocket = null; // Our client socket connecting TO the remote server

    // Connection state from remote server (SERVER connection FROM remote)
    let authenticatedRemoteSocket = null; // The server socket instance FROM the remote server

    // Cross-server resources tracking
    const localProxyProducers = new Map(); // Stores Producer instances proxied IN from other servers (key: producerId, value: Producer)
    const pendingPipeRequests = new Map(); // Track pipe requests initiated by THIS server (key: correlationId, value: { resolve, reject, producerId, targetRouterId, roomName, socketId, timeout })
    const producerSocketMap = new Map(); // Maps producer IDs (local & remote proxies) -> { socketId (originator/proxy owner), roomName, kind, isRemote, pipeStatus: 'pending'|'completed'|'failed' }
    const pipeTransportRegistry = new Map(); // key: `${sourceRouterId}_${targetRouterId}`, value: transportId
    const remotePipeTransports = new Map(); // Caches pipe transports created for piping *to* the remote server (key: transportId, value: PipeTransport)

    // Mediasoup settings
    const videoEncodings = [
        { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
        { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
        { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" },
    ];

    const mediaCodecs = [
        { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
        { kind: "video", mimeType: "video/VP8", clockRate: 90000, parameters: { "x-google-start-bitrate": 1000 } },
        // { kind: "video", mimeType: "video/H264", clockRate: 90000, parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f', 'level-asymmetry-allowed': 1, 'x-google-start-bitrate': 1000 } }, // Optional H264
    ];

    // ===== Service Implementations for PipeContext =====

    const routerRegistry = {
        isLocalRouter: async (routerId) => routerId === router.id,
        getLocalRouter: async (routerId) => (routerId === router.id ? router : undefined),
        getServerIdForRouter: async (routerId) => {
            if (routerId === router.id) return THIS_SERVER_ID;
            if (routerId === remoteRouterId) return REMOTE_SERVER_ID;
            console.warn(`[${THIS_SERVER_ID}] Cannot determine server ID for router: ${routerId}. Known local: ${router.id}, remote: ${remoteRouterId}`);
            return undefined; // Or throw error?
        },
        findPipeTransport: async (sourceRouterId, targetRouterId) => {
            const key = `${sourceRouterId}_${targetRouterId}`;
            const transportId = pipeTransportRegistry.get(key);
            if (!transportId) return undefined;
            // Check our local router first
            try {
                 // Mediasoup >= 3.11 might not expose _transports directly
                // Need a way to get transport by ID. Let's assume pipeTransportRegistry stores the object or we search remotePipeTransports
                let transport = remotePipeTransports.get(transportId); // Check cache first
                if (transport && !transport.closed) return transport;

                // If not in cache, maybe it's a transport we created earlier but didn't cache? Unlikely with current logic.
                // Fallback: Check if the ID matches any known transport ID in our general list (less efficient)
                 const transportData = transports.find(t => t.transport.id === transportId);
                 if(transportData && transportData.transport.constructor.name === 'PipeTransport' && !transportData.transport.closed) {
                     return transportData.transport;
                 }


            } catch (error) {
                console.error(`[${THIS_SERVER_ID}] Error finding pipe transport ${transportId}: ${error.message}`);
            }

            console.log(`[${THIS_SERVER_ID}] Pipe transport ${transportId} (key: ${key}) not found or closed.`);
            pipeTransportRegistry.delete(key); // Clean up stale entry
            return undefined;
        },
        registerPipeTransport: async (sourceRouterId, targetRouterId, transport) => {
            if (!transport || !transport.id) {
                 console.error(`[${THIS_SERVER_ID}] Attempted to register invalid pipe transport`);
                 return;
            }
            const key = `${sourceRouterId}_${targetRouterId}`;
            pipeTransportRegistry.set(key, transport.id);
            remotePipeTransports.set(transport.id, transport); // Cache the actual transport object
            console.log(`[${THIS_SERVER_ID}] Registered pipe transport ${transport.id} for key ${key}`);

            transport.observer.on('close', () => {
                console.log(`[${THIS_SERVER_ID}] Pipe transport ${transport.id} (key: ${key}) closed, removing registration.`);
                pipeTransportRegistry.delete(key);
                remotePipeTransports.delete(transport.id);
            });
        },
         removePipeTransport: async (transportId) => {
             // Find the key associated with the transportId and remove it
             for (let [key, value] of pipeTransportRegistry.entries()) {
                 if (value === transportId) {
                     pipeTransportRegistry.delete(key);
                     console.log(`[${THIS_SERVER_ID}] Removed pipe transport ${transportId} registration (key: ${key})`);
                     break;
                 }
             }
             // Remove from remotePipeTransports cache as well
             if (remotePipeTransports.has(transportId)) {
                  remotePipeTransports.delete(transportId);
                  console.log(`[${THIS_SERVER_ID}] Removed pipe transport ${transportId} from cache`);
             }
             // Note: The transport object itself should be closed elsewhere
         }
    };

    const webSocketService = {
        getCurrentServerId: () => THIS_SERVER_ID,
        getPublicIp: () => PUBLIC_IP,
        sendMessage: async (targetServerId, message) => {
             // Ensure message has a standard structure if needed by the handler
             const messageToSend = message.payload ? message : { event: 'pipe_signaling', payload: message };

             if (targetServerId === THIS_SERVER_ID) {
                 // Message is intended for this server (e.g., confirmation processed locally)
                 console.log(`[${THIS_SERVER_ID}] Handling local pipe message: Type ${messageToSend.payload?.type}, CorrID: ${messageToSend.payload?.correlationId}`);
                 try {
                     // The piping logic might send messages back to itself, handle them directly
                     await handlePipeSignalingMessage(messageToSend.payload, pipeContext);
                 } catch (error) {
                     console.error(`[${THIS_SERVER_ID}] Error self-handling pipe message: ${error.message}`, messageToSend.payload);
                      // Reject pending request if it exists
                      const corrId = messageToSend.payload?.correlationId;
                      if (corrId && pendingPipeRequests.has(corrId)) {
                          pendingPipeRequests.get(corrId).reject(new Error(`Self-handling failed: ${error.message}`));
                          pendingPipeRequests.delete(corrId);
                      }
                 }
             } else if (targetServerId === REMOTE_SERVER_ID) {
                 // Send message to the *other* server
                 if (remoteServerSocket && remoteServerSocket.connected) {
                     console.log(`[${THIS_SERVER_ID}] Sending pipe signal to ${REMOTE_SERVER_ID} via CLIENT socket: Type ${messageToSend.payload?.type}, CorrID: ${messageToSend.payload?.correlationId}`);
                     remoteServerSocket.emit('pipe-signal-remote', messageToSend.payload); // Send only the payload
                 } else if (authenticatedRemoteSocket && authenticatedRemoteSocket.connected) {
                    // If client socket is down, maybe the server socket is up? (Less common scenario for sending)
                     console.log(`[${THIS_SERVER_ID}] Sending pipe signal to ${REMOTE_SERVER_ID} via SERVER socket: Type ${messageToSend.payload?.type}, CorrID: ${messageToSend.payload?.correlationId}`);
                     authenticatedRemoteSocket.emit('pipe-signal-remote', messageToSend.payload); // Send only the payload
                 }
                 else {
                     const errorMsg = `[${THIS_SERVER_ID}] Cannot send pipe signal to ${REMOTE_SERVER_ID}: No active connection.`;
                     console.error(errorMsg);
                      // If this message was part of a request, reject the pending promise
                      const corrId = messageToSend.payload?.correlationId;
                      if (corrId && pendingPipeRequests.has(corrId)) {
                            pendingPipeRequests.get(corrId).reject(new Error("Remote server disconnected"));
                            pendingPipeRequests.delete(corrId);
                      }
                     throw new Error(errorMsg);
                 }
             } else {
                 const errorMsg = `[${THIS_SERVER_ID}] Cannot send message: Unknown target server ID ${targetServerId}`;
                 console.error(errorMsg);
                 throw new Error(errorMsg);
             }
             return true; // Indicate success if no error thrown
        }
    };

    // ===== Pipe Context Initialization =====
    const pipeContext = {
        localRouter: router, // Will be assigned after router creation
        routerRegistry,
        webSocketService,
        pendingRequests: pendingPipeRequests,
        // remotePipeTransports, // Managed within routerRegistry now
        transportConsumerMap: new Map(), // Track consumers associated with pipe transports if needed
        pipeTimeout: 30000, // Example timeout

        getProducer: async (producerId) => {
            // 1. Check local proxy producers (media piped IN)
            const proxyProducer = localProxyProducers.get(producerId);
            if (proxyProducer && !proxyProducer.closed) {
                console.log(`[${THIS_SERVER_ID}][PipeContext] Found producer ${producerId} in localProxyProducers`);
                return proxyProducer;
            }

            // 2. Check local producers (media originated HERE)
            const localProducerData = producers.find(p => p.producer.id === producerId);
            if (localProducerData && localProducerData.producer && !localProducerData.producer.closed) {
                console.log(`[${THIS_SERVER_ID}][PipeContext] Found producer ${producerId} in local producers`);
                return localProducerData.producer;
            }

            console.warn(`[${THIS_SERVER_ID}][PipeContext] Producer ${producerId} not found locally or as proxy.`);
            return undefined;
        },

        getDataProducer: async (dataProducerId) => {
            // Implement similarly if you use data producers over pipes
            console.warn(`[${THIS_SERVER_ID}][PipeContext] getDataProducer not fully implemented.`);
            return undefined;
        },

        // Called by the piping logic when a producer has been successfully piped *IN* from the remote server
        createRemoteProducer: async ({ id, kind, rtpParameters, appData, roomName, routerId }) => {
             console.log(`[${THIS_SERVER_ID}] createRemoteProducer called for ${id} (Kind: ${kind}) in room ${roomName || 'unknown'}. Origin Router: ${routerId}`);

             if (localProxyProducers.has(id)) {
                 console.warn(`[${THIS_SERVER_ID}] Proxy producer ${id} already exists. Ignoring create request.`);
                 return localProxyProducers.get(id);
             }

            // NOTE: The `pipetoremote` logic likely creates the *consumer* on the pipe transport.
            // This function's role is primarily to *notify local clients* that this producer is now available for *them* to consume.
            // We also need to store some reference if we need to manage these proxies, but the actual Mediasoup Producer object
            // representing the *remote* producer doesn't exist locally in the same way. We consume it via the pipe.
            // Let's store the *info* and treat the ID as available. The actual 'Producer' object for consumption
            // is handled during the `consume` request against the pipe.

            // For simplicity in this example, we won't store a dummy Producer object.
            // We'll store the necessary *metadata* to inform clients.
            // If `pipetoremote` *does* return a local Producer object (e.g., via `router.consume()`), store that instead.
             // Let's assume `pipetoremote`'s `pipe_confirm` handler gives us what we need.
             // For now, just store metadata.
             localProxyProducers.set(id, {
                 id: id,
                 kind: kind,
                 closed: false, // Assume not closed initially
                 appData: appData || {},
                 rtpParameters: rtpParameters, // Store RTP parameters if provided
                 remoteRouterId: routerId,
                 roomName: roomName, // Associate with a room if possible
                 // Add a close method simulation if needed elsewhere
                 close: () => {
                     console.log(`[${THIS_SERVER_ID}] Simulated close for proxy producer info ${id}`);
                     const data = localProxyProducers.get(id);
                     if(data) data.closed = true;
                     // We might need to trigger actual cleanup here if `pipetoremote` doesn't handle pipe consumer closing
                     // This depends heavily on pipetoremote's implementation details.
                 },
                 requestKeyFrame: async () => {
                    // We can't request KF on metadata. Forward the request.
                    console.log(`[${THIS_SERVER_ID}] Proxy producer ${id} keyframe request - forwarding to origin server ${REMOTE_SERVER_ID}`);
                    if (webSocketService && REMOTE_SERVER_ID) {
                       try {
                           await webSocketService.sendMessage(REMOTE_SERVER_ID, {
                               type: 'forward-keyframe-request',
                               producerId: id,
                               originServerId: THIS_SERVER_ID
                           });
                       } catch (err) {
                           console.error(`[${THIS_SERVER_ID}] Error forwarding keyframe request for proxy ${id}: ${err.message}`);
                       }
                    } else {
                         console.warn(`[${THIS_SERVER_ID}] Cannot forward keyframe request for proxy ${id} - service or remote ID unavailable.`);
                    }
                 }
             });


             // Add to producerSocketMap for tracking
             producerSocketMap.set(id, {
                 socketId: null, // No specific local socket owns this proxy
                 roomName: roomName,
                 kind: kind,
                 isRemote: true,
                 pipeStatus: 'completed' // Mark as completed since it's being created after piping
             });

             console.log(`[${THIS_SERVER_ID}] Stored proxy metadata for producer ${id}. Notifying clients.`);

             // CRITICAL: Notify relevant local clients about this new producer
             if (roomName && rooms.has(roomName)) {
                 const room = rooms.get(roomName);
                 console.log(`[${THIS_SERVER_ID}] Notifying ${room.peers.size} peers in room ${roomName} about new remote producer ${id}`);
                 // Use io.to(roomName).emit for efficiency
                 io.to(roomName).emit('new-producer', {
                     producerId: id,
                     kind: kind,
                     isRemote: true // Important flag for the client
                 });
             } else if (!roomName) {
                 // If no room specified, maybe broadcast to all rooms? Or handle based on app logic.
                 console.warn(`[${THIS_SERVER_ID}] No room specified for remote producer ${id}. Broadcasting to all rooms.`);
                 peers.forEach(peerData => {
                     if (peerData.socket) {
                         peerData.socket.emit('new-producer', {
                             producerId: id,
                             kind: kind,
                             isRemote: true
                         });
                     }
                 });
             } else {
                  console.warn(`[${THIS_SERVER_ID}] Room ${roomName} not found for notifying about remote producer ${id}.`);
             }

             // Return the stored metadata or dummy object
             return localProxyProducers.get(id);
        }
    };


    // ===== Mediasoup Worker and Router Setup =====
    try {
        worker = await mediasoup.createWorker({
            logLevel: process.env.DEBUG ? "debug" : "warn", // Use env var for level
            logTags: ["rtp", "srtp", "rtcp", "rtx", "bwe", "score", "simulcast", "svc", "sctp"], // More tags
            rtcMinPort: process.env.RTC_MIN_PORT ? parseInt(process.env.RTC_MIN_PORT, 10) : 40000,
            rtcMaxPort: process.env.RTC_MAX_PORT ? parseInt(process.env.RTC_MAX_PORT, 10) : 49999,
        });

        worker.on("died", (error) => {
            console.error(`[${THIS_SERVER_ID}] mediasoup worker died (PID ${worker.pid}):`, error);
            // Implement graceful shutdown or restart logic here
            setTimeout(() => process.exit(1), 2000); // Quick exit for now
        });

        console.log(`[${THIS_SERVER_ID}] Mediasoup worker created [PID ${worker.pid}]`);

        router = await worker.createRouter({ mediaCodecs });
        pipeContext.localRouter = router; // Assign router to pipeContext
        console.log(`[${THIS_SERVER_ID}] Mediasoup router created [ID ${router.id}]`);

    } catch (error) {
        console.error(`[${THIS_SERVER_ID}] Failed to initialize Mediasoup:`, error);
        process.exit(1);
    }


    // ===== Utility Functions =====

    const createWebRtcTransport = async (socketId) => {
        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "0.0.0.0", announcedIp: PUBLIC_IP }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: 1000000, // mediasoup defaults
            minimumAvailableOutgoingBitrate: 600000, // mediasoup defaults
            // enableSctp: true, // If using data channels
            // numSctpStreams: { OS: 1024, MIS: 1024 },
            appData: { socketId } // Associate transport with socket
        });

        // Monitor transport state for debugging
        transport.on("dtlsstatechange", (dtlsState) => {
            if (dtlsState === "failed" || dtlsState === "closed") {
                console.warn(`[${THIS_SERVER_ID}] WebRtcTransport DTLS state changed to ${dtlsState} [Transport ID: ${transport.id}]`);
                 // Optionally close transport here or let client handle reconnection/new transport
            } else {
                 console.log(`[${THIS_SERVER_ID}] WebRtcTransport DTLS state changed to ${dtlsState} [Transport ID: ${transport.id}]`);
            }
        });

         transport.observer.on("close", () => {
            console.log(`[${THIS_SERVER_ID}] WebRtcTransport closed [ID: ${transport.id}]`);
            // Remove from our tracking
            transports = transports.filter(t => t.transport.id !== transport.id);
         });

        return transport;
    };

    // Find the sending transport for a socket
    const getProduceTransport = (socketId) => {
        const transportData = transports.find(
            t => t.socketId === socketId && !t.consumer && !t.transport.closed
        );
        return transportData?.transport;
    };

    // Find a specific transport by ID (usually a receiving transport)
    const getTransportById = (transportId) => {
         const transportData = transports.find(t => t.transport.id === transportId && !t.transport.closed);
         return transportData?.transport;
    }

    // Inform other clients in the room about a new local producer
    const informConsumersNewLocalProducer = (roomName, socketId, producerId, kind) => {
        console.log(`[${THIS_SERVER_ID}] Informing peers in room ${roomName} about new local producer ${producerId} from ${socketId}`);
        // Use io.to(roomName).except(socketId) potentially, but iterating peers is safer if socket rooms aren't perfectly managed
        const room = rooms.get(roomName);
        if (room) {
            room.peers.forEach(peerSocketId => {
                if (peerSocketId !== socketId) {
                    const peer = peers.get(peerSocketId);
                    if (peer && peer.socket) {
                        console.log(`[${THIS_SERVER_ID}]   -> Emitting 'new-producer' to ${peerSocketId}`);
                        peer.socket.emit('new-producer', { producerId: producerId, kind: kind, isRemote: false });
                    }
                }
            });
        }
    };

    // Attempt to pipe a newly created local producer to the remote server
    const autoPipeProducerToRemote = async (producer, roomName, socketId) => {
        if (!REMOTE_SERVER_ID || !remoteRouterId || (!remoteServerSocket?.connected && !authenticatedRemoteSocket?.connected)) {
            let reason = [];
            if (!REMOTE_SERVER_ID) reason.push("REMOTE_SERVER_ID not set");
            if (!remoteRouterId) reason.push("Remote router ID unknown");
             if (!remoteServerSocket?.connected && !authenticatedRemoteSocket?.connected) reason.push("No connection to remote server");
            console.warn(`[${THIS_SERVER_ID}] Skipping auto-pipe for producer ${producer.id}: ${reason.join(', ')}.`);
            producerSocketMap.set(producer.id, { socketId, roomName, kind: producer.kind, isRemote: false, pipeStatus: 'skipped' });
            return;
        }

        console.log(`[${THIS_SERVER_ID}] Auto-piping producer ${producer.id} (Kind: ${producer.kind}) from room ${roomName} to remote router ${remoteRouterId} on server ${REMOTE_SERVER_ID}`);
        producerSocketMap.set(producer.id, { socketId, roomName, kind: producer.kind, isRemote: false, pipeStatus: 'pending' });

        try {
            // Use pipeMediaBetweenRouters from the imported module
            const { pipeConsumer, pipeProducer } = await pipeMediaBetweenRouters({
                producerId: producer.id,
                sourceRouter: router, // Provide source router object
                targetRouterId: remoteRouterId, // Target router ID
                targetServerId: REMOTE_SERVER_ID, // Target server ID for messaging
                // Optional: Add more context if needed by your piping logic
                roomName: roomName,
                requestingSocketId: socketId,
                enableRtx: true, // Example option
            }, pipeContext); // Pass the context object

            console.log(`[${THIS_SERVER_ID}] Successfully initiated pipe for producer ${producer.id}. Local Pipe Consumer: ${pipeConsumer?.id}, Remote Pipe Producer ID (expected): ${pipeProducer?.id}`);
             producerSocketMap.set(producer.id, { socketId, roomName, kind: producer.kind, isRemote: false, pipeStatus: 'completed' });

             // Optional: Notify originating client that piping started
             const originatorPeer = peers.get(socketId);
             if(originatorPeer?.socket) {
                 originatorPeer.socket.emit('pipe-initiated', { producerId: producer.id, remoteServerId: REMOTE_SERVER_ID });
             }

        } catch (error) {
            console.error(`[${THIS_SERVER_ID}] Failed to auto-pipe producer ${producer.id}: ${error.message}`, error.stack);
            producerSocketMap.set(producer.id, { socketId, roomName, kind: producer.kind, isRemote: false, pipeStatus: 'failed' });
             // Optional: Notify originating client about the failure
             const originatorPeer = peers.get(socketId);
             if(originatorPeer?.socket) {
                 originatorPeer.socket.emit('pipe-failed', { producerId: producer.id, remoteServerId: REMOTE_SERVER_ID, error: error.message });
             }
        }
    };

    // Helper to find producer (local or proxied) - used by consume, keyframe requests etc.
    const findProducerById = (producerId) => {
        // 1. Check local producers
        const local = producers.find(p => p.producer.id === producerId);
        if (local && !local.producer.closed) {
            return { producer: local.producer, isRemote: false };
        }
        // 2. Check proxied producers (metadata stored)
        const proxyInfo = localProxyProducers.get(producerId);
        if (proxyInfo && !proxyInfo.closed) {
            // Return the info object which includes a simulated requestKeyFrame
            return { producer: proxyInfo, isRemote: true };
        }
        return { producer: null, isRemote: false };
    };


    // ===== Socket.IO Connection Handler =====

    io.on("connection", (socket) => {

        // --- Inter-Server Authentication Check ---
        // This happens *before* the regular connection logic if the peer authenticates as a server
        if (socket.isRemoteServer) {
             console.log(`[${THIS_SERVER_ID}] Confirmed authenticated connection from remote server: ${socket.remoteServerId} [Socket ID: ${socket.id}]`);
             // This socket (`authenticatedRemoteSocket`) is used for receiving messages from the other server.
             // The `remoteServerSocket` is our client connection *to* the other server, used for sending.

             // --- Handlers for messages received FROM the other server ---

             socket.on('pipe-signal-remote', async (message) => {
                console.log(`[${THIS_SERVER_ID}] Received pipe signal via SERVER socket from ${socket.remoteServerId}: Type ${message?.type}, CorrID: ${message?.correlationId}`);
                 try {
                    // IMPORTANT: Ensure message has required fields before passing to handler
                    if (!message || typeof message !== 'object') {
                        throw new Error("Received invalid pipe signal message format.");
                    }
                     await handlePipeSignalingMessage(message, pipeContext);
                 } catch (error) {
                     console.error(`[${THIS_SERVER_ID}] Error handling pipe signal from ${socket.remoteServerId}: ${error.message}`, message);
                      // Attempt to reject pending request if applicable
                      if (message.correlationId && pendingPipeRequests.has(message.correlationId)) {
                          pendingPipeRequests.get(message.correlationId).reject(error);
                          pendingPipeRequests.delete(message.correlationId);
                      }
                 }
             });

              socket.on('pipe-producer-close', ({ producerId, reason }) => {
                  console.log(`[${THIS_SERVER_ID}] Received pipe-producer-close from ${socket.remoteServerId} for producer ${producerId}. Reason: ${reason}`);
                  const proxyInfo = localProxyProducers.get(producerId);

                  if (proxyInfo && !proxyInfo.closed) {
                      console.log(`[${THIS_SERVER_ID}] Closing local proxy for producer ${producerId}`);
                      proxyInfo.closed = true; // Mark metadata as closed
                      localProxyProducers.delete(producerId); // Remove from map

                      // Clean up tracking map
                      if (producerSocketMap.has(producerId)) {
                           producerSocketMap.delete(producerId);
                      }

                      // Notify all local consumers that this producer is gone
                      peers.forEach(peerData => {
                           // Check consumers associated with this peer
                           const consumerToClose = consumers.find(c => c.socketId === peerData.socket.id && c.consumer.producerId === producerId);
                           if (consumerToClose) {
                                console.log(`[${THIS_SERVER_ID}]   -> Closing consumer ${consumerToClose.consumer.id} for peer ${peerData.socket.id}`);
                                consumerToClose.consumer.close(); // Close the Mediasoup consumer
                                consumers = consumers.filter(c => c.consumer.id !== consumerToClose.consumer.id); // Remove from global list
                                peerData.consumers = peerData.consumers.filter(cId => cId !== consumerToClose.consumer.id); // Remove from peer list
                                // Send notification to client UI
                                if (peerData.socket) {
                                    peerData.socket.emit('producer-closed', { remoteProducerId: producerId, reason: reason || 'remote-close' });
                                }
                           }
                      });

                  } else {
                       console.warn(`[${THIS_SERVER_ID}] Received pipe-producer-close for unknown or already closed proxy producer ${producerId}`);
                  }
              });

              socket.on('forward-keyframe-request', async ({ producerId, originServerId }) => {
                  console.log(`[${THIS_SERVER_ID}] Received forwarded keyframe request from ${originServerId} for producer ${producerId}`);
                   if (originServerId === THIS_SERVER_ID) return; // Prevent loops

                  try {
                      // This producer MUST be local if we received a forwarded request
                      const localProducerData = producers.find(p => p.producer.id === producerId);
                      if (localProducerData && localProducerData.producer && !localProducerData.producer.closed && typeof localProducerData.producer.requestKeyFrame === 'function') {
                          console.log(`[${THIS_SERVER_ID}] Requesting keyframe on local producer ${producerId} due to forwarded request.`);
                          await localProducerData.producer.requestKeyFrame();
                      } else {
                           console.warn(`[${THIS_SERVER_ID}] Cannot fulfill forwarded keyframe request: Producer ${producerId} not found locally or doesn't support KF.`);
                      }
                  } catch (error) {
                       console.error(`[${THIS_SERVER_ID}] Error handling forwarded keyframe request for ${producerId}: ${error.message}`);
                  }
              });


             // --- End Handlers for messages FROM the other server ---

             // Don't proceed with regular client setup for this server-server connection
             return;
        }

        // --- Regular Client Connection Logic ---
        console.log(`[${THIS_SERVER_ID}] Client peer connected [Socket ID: ${socket.id}]`);
        socket.emit("connection-success", {
            socketId: socket.id,
            serverId: THIS_SERVER_ID
        });

        const addTransportToList = (transport, roomName, isConsumer) => {
            transports.push({ socketId: socket.id, transport, roomName, consumer: isConsumer });
             if (peers.has(socket.id)) {
                peers.get(socket.id).transports.push(transport.id);
             }
        };

        const addProducerToList = (producer, roomName) => {
            producers.push({ socketId: socket.id, producer, roomName });
            if (peers.has(socket.id)) {
                peers.get(socket.id).producers.push(producer.id);
            }
             // Do not add to producerSocketMap here; that's done during auto-pipe initiation
        };

        const addConsumerToList = (consumer, roomName) => {
            consumers.push({ socketId: socket.id, consumer, roomName });
            if (peers.has(socket.id)) {
                peers.get(socket.id).consumers.push(consumer.id);
            }
        };

        socket.on("disconnect", () => {
            console.log(`[${THIS_SERVER_ID}] Client peer disconnected [Socket ID: ${socket.id}]`);
            const peerData = peers.get(socket.id);
            if (!peerData) {
                console.warn(`[${THIS_SERVER_ID}] Disconnected socket ${socket.id} not found in peers map.`);
                return; // Should not happen
            }

            const { roomName } = peerData;
            console.log(`[${THIS_SERVER_ID}] Cleaning up resources for ${socket.id} in room ${roomName}`);

            // 1. Close Consumers associated with this peer
            consumers = consumers.filter(consumerData => {
                if (consumerData.socketId === socket.id) {
                    console.log(`[${THIS_SERVER_ID}]   - Closing consumer ${consumerData.consumer.id} (Producer: ${consumerData.consumer.producerId})`);
                    if (!consumerData.consumer.closed) consumerData.consumer.close();
                    return false; // Remove from list
                }
                return true;
            });

            // 2. Close Producers originated by this peer AND notify remote if piped
            producers = producers.filter(producerData => {
                if (producerData.socketId === socket.id) {
                    const producerId = producerData.producer.id;
                    console.log(`[${THIS_SERVER_ID}]   - Closing local producer ${producerId}`);
                    if (!producerData.producer.closed) producerData.producer.close();

                     // Check if this producer was piped and notify remote server
                     const mapping = producerSocketMap.get(producerId);
                     if (mapping && mapping.pipeStatus === 'completed') {
                         console.log(`[${THIS_SERVER_ID}]   - Notifying remote server to close pipe for producer ${producerId}`);
                         const message = {
                             type: 'pipe-producer-close', // Use a specific event if defined in pipetoremote or a generic one
                             producerId: producerId,
                             reason: 'origin-peer-disconnected'
                         };
                         webSocketService.sendMessage(REMOTE_SERVER_ID, message)
                           .catch(err => console.error(`[${THIS_SERVER_ID}] Error sending pipe-producer-close for ${producerId}: ${err.message}`));
                     }
                     producerSocketMap.delete(producerId); // Clean up tracking map

                    return false; // Remove from list
                }
                return true;
            });

             // 3. Close Transports associated with this peer
             transports = transports.filter(transportData => {
                 if (transportData.socketId === socket.id) {
                      console.log(`[${THIS_SERVER_ID}]   - Closing transport ${transportData.transport.id}`);
                      if (!transportData.transport.closed) transportData.transport.close();
                      return false; // Remove from list
                 }
                 return true;
             });

             // 4. Clean up Pending Pipe Requests initiated by this peer
             pendingPipeRequests.forEach((request, correlationId) => {
                 if (request.socketId === socket.id) {
                      console.log(`[${THIS_SERVER_ID}]   - Cancelling pending pipe request ${correlationId} for disconnected peer`);
                      clearTimeout(request.timeout);
                      request.reject(new Error('Originating peer disconnected'));
                      pendingPipeRequests.delete(correlationId);
                 }
             });


            // 5. Remove peer from room
            if (roomName && rooms.has(roomName)) {
                const room = rooms.get(roomName);
                room.peers.delete(socket.id);
                console.log(`[${THIS_SERVER_ID}]   - Removed peer ${socket.id} from room ${roomName}. Peers remaining: ${room.peers.size}`);
                if (room.peers.size === 0) {
                    console.log(`[${THIS_SERVER_ID}] Room ${roomName} is empty, removing.`);
                    // Optional: Close the room's router if dynamically created per room
                    // router.close(); // Only if router is per-room
                    rooms.delete(roomName);
                }
            }

            // 6. Remove peer from main map
            peers.delete(socket.id);
            console.log(`[${THIS_SERVER_ID}] Cleanup complete for ${socket.id}`);
        });

        socket.on("joinRoom", async ({ roomName }, callback) => {
            if (typeof callback !== 'function') return; // Basic validation
             if (!roomName) return callback({ error: "Room name is required" });

            console.log(`[${THIS_SERVER_ID}] Client ${socket.id} joining room: ${roomName}`);
            try {
                 // Use the single router for all rooms in this simple setup
                 if (!rooms.has(roomName)) {
                     console.log(`[${THIS_SERVER_ID}] Creating new room context: ${roomName}`);
                     rooms.set(roomName, {
                         router: router, // Use the global router
                         peers: new Set(),
                     });
                 }
                 const room = rooms.get(roomName);
                 room.peers.add(socket.id);
                 socket.join(roomName); // Join Socket.IO room for broadcasting

                 // Store peer state
                 peers.set(socket.id, {
                     socket,
                     roomName,
                     transports: [],
                     producers: [],
                     consumers: [],
                     peerDetails: { name: "", isAdmin: false }, // Add more details as needed
                 });

                 // --- Prepare list of available producers ---
                 // 1. Local producers already in the room (excluding self)
                 const localProducerList = producers
                    .filter(p => p.roomName === roomName && p.socketId !== socket.id && !p.producer.closed)
                    .map(p => ({
                         producerId: p.producer.id,
                         kind: p.producer.kind,
                         isRemote: false
                    }));

                 // 2. Remote producers (proxies) associated with this room
                 const remoteProducerList = [];
                 localProxyProducers.forEach((proxyInfo, producerId) => {
                     // Check if proxy is relevant to this room (simple check for now)
                     // More robust check might involve appData or specific room association in proxyInfo
                     if (!proxyInfo.closed && (proxyInfo.roomName === roomName || !proxyInfo.roomName)) { // Include if matching room or no room specified
                           remoteProducerList.push({
                             producerId: proxyInfo.id,
                             kind: proxyInfo.kind,
                             isRemote: true
                           });
                     }
                 });

                 const allProducers = [...localProducerList, ...remoteProducerList];

                 console.log(`[${THIS_SERVER_ID}] Sending join confirmation to ${socket.id} for room ${roomName}. Router Caps sent. ${allProducers.length} producers available.`);

                // Return Router RTP Capabilities and list of existing producers
                callback({
                     // No need to send Routers array if only one router
                     // Routers: [router.rtpCapabilities], // Old format
                    rtpCapabilities: router.rtpCapabilities, // Send single object
                     // Currentindex: 0, // Not needed
                    producerList: allProducers, // Send combined list with metadata
                    // success: true // Explicit success flag can be helpful
                });
            } catch (error) {
                console.error(`[${THIS_SERVER_ID}] Error joining room ${roomName} for ${socket.id}:`, error);
                callback({ error: error.message });
            }
        });

        socket.on("createWebRtcTransport", async ({ producing, consuming }, callback) => {
             if (typeof callback !== 'function') return;
             const peerData = peers.get(socket.id);
             if (!peerData) return callback({ error: "Peer not found or not in a room" });

            console.log(`[${THIS_SERVER_ID}] Client ${socket.id} requesting WebRTC transport (Producing: ${producing}, Consuming: ${consuming})`);
             try {
                 const transport = await createWebRtcTransport(socket.id);
                 const isConsumer = !!consuming; // Determine if mainly for consuming
                 addTransportToList(transport, peerData.roomName, isConsumer);

                 console.log(`[${THIS_SERVER_ID}] Created WebRTC transport ${transport.id} for ${socket.id}`);
                 callback({
                     // No need for 'params' wrapper if client expects flat structure
                     id: transport.id,
                     iceParameters: transport.iceParameters,
                     iceCandidates: transport.iceCandidates,
                     dtlsParameters: transport.dtlsParameters,
                     sctpParameters: transport.sctpParameters, // Include if SCTP enabled
                 });
             } catch (error) {
                 console.error(`[${THIS_SERVER_ID}] Error creating WebRTC transport for ${socket.id}:`, error);
                 callback({ error: error.message });
                 // Clean up transport if partially created? Mediasoup might handle this.
             }
        });

        socket.on("transport-connect", async ({ transportId, dtlsParameters }, callback) => {
            if (typeof callback !== 'function') callback = ()=>{}; // Dummy callback
            console.log(`[${THIS_SERVER_ID}] Client ${socket.id} connecting transport ${transportId}`);
             const transport = getTransportById(transportId); // Use helper to find by ID
             if (!transport) {
                 console.error(`[${THIS_SERVER_ID}] Transport ${transportId} not found for connect request from ${socket.id}`);
                 return callback({ error: "Transport not found" });
             }
             // Ensure this transport belongs to the requesting socket (security)
             if (transport.appData.socketId !== socket.id) {
                 console.error(`[${THIS_SERVER_ID}] Security violation: Socket ${socket.id} tried to connect transport ${transportId} belonging to ${transport.appData.socketId}`);
                 return callback({ error: "Transport ownership mismatch" });
             }

             try {
                 await transport.connect({ dtlsParameters });
                 console.log(`[${THIS_SERVER_ID}] Transport ${transportId} connected successfully`);
                 callback({ connected: true }); // Explicit success
             } catch (error) {
                 console.error(`[${THIS_SERVER_ID}] Error connecting transport ${transportId}:`, error);
                 callback({ error: error.message });
             }
        });

        socket.on("transport-produce", async ({ transportId, kind, rtpParameters, appData }, callback) => {
             if (typeof callback !== 'function') return;
             console.log(`[${THIS_SERVER_ID}] Client ${socket.id} producing (Kind: ${kind}) on transport ${transportId}`);

             const transport = getTransportById(transportId); // Find transport by ID
             const peerData = peers.get(socket.id);

             if (!transport || !peerData) {
                 const errorMsg = !transport ? `Transport ${transportId} not found` : "Peer data not found";
                 console.error(`[${THIS_SERVER_ID}] Cannot produce for ${socket.id}: ${errorMsg}`);
                 return callback({ error: errorMsg });
             }
             // Security check: Ensure transport belongs to this socket
              if (transport.appData.socketId !== socket.id) {
                 console.error(`[${THIS_SERVER_ID}] Security violation: Socket ${socket.id} tried to produce on transport ${transportId} belonging to ${transport.appData.socketId}`);
                 return callback({ error: "Transport ownership mismatch" });
             }

             // Prevent producing on a transport intended only for consuming if necessary
             // const transportInfo = transports.find(t => t.transport.id === transportId);
             // if (transportInfo && transportInfo.consumer) {
             //     return callback({ error: "Cannot produce on a consuming transport" });
             // }

             try {
                 const producer = await transport.produce({
                     kind,
                     rtpParameters,
                     appData: { ...appData, socketId: socket.id, roomName: peerData.roomName }, // Merge appData
                     // Add simulcast encodings if kind is video
                     ...(kind === 'video' && { encodings: videoEncodings })
                 });

                 addProducerToList(producer, peerData.roomName);
                 console.log(`[${THIS_SERVER_ID}] Local producer ${producer.id} (Kind: ${kind}) created for ${socket.id} in room ${peerData.roomName}`);

                  // Handle producer close events
                  producer.on('transportclose', () => {
                        console.log(`[${THIS_SERVER_ID}] Producer ${producer.id} transport closed.`);
                        producer.close(); // Close the producer
                        // No need to filter producers list here, disconnect handler does it
                  });
                  producer.observer.on('close', () => {
                       console.log(`[${THIS_SERVER_ID}] Producer ${producer.id} closed.`);
                       // Remove from list if not already handled by disconnect
                       producers = producers.filter(p => p.producer.id !== producer.id);
                       producerSocketMap.delete(producer.id); // Clean up tracking map too
                       // Inform consumers locally
                       if (peerData.roomName) {
                           io.to(peerData.roomName).emit('producer-closed', { remoteProducerId: producer.id, reason: 'producer-closed' });
                       }
                  });


                 // Inform other LOCAL consumers in the same room
                 informConsumersNewLocalProducer(peerData.roomName, socket.id, producer.id, producer.kind);

                 // Try to AUTO-PIPE this new producer to the remote server
                 await autoPipeProducerToRemote(producer, peerData.roomName, socket.id);

                 callback({ id: producer.id }); // Return the new producer ID

             } catch (error) {
                 console.error(`[${THIS_SERVER_ID}] Error producing for ${socket.id}:`, error);
                 callback({ error: error.message });
             }
        });

        socket.on("consume", async ({ transportId, producerId, rtpCapabilities, // Optional: paused = true,
                                      appData }, callback) => {
             if (typeof callback !== 'function') return;
             console.log(`[${THIS_SERVER_ID}] Client ${socket.id} requesting to consume producer ${producerId} on transport ${transportId}`);

             const consumerTransport = getTransportById(transportId);
             const peerData = peers.get(socket.id);

             if (!consumerTransport || !peerData) {
                const errorMsg = !consumerTransport ? `Consumer transport ${transportId} not found` : "Peer data not found";
                 console.error(`[${THIS_SERVER_ID}] Cannot consume for ${socket.id}: ${errorMsg}`);
                 return callback({ error: errorMsg });
             }
             // Security check
             if (consumerTransport.appData.socketId !== socket.id) {
                 console.error(`[${THIS_SERVER_ID}] Security violation: Socket ${socket.id} tried to consume on transport ${transportId} belonging to ${consumerTransport.appData.socketId}`);
                 return callback({ error: "Transport ownership mismatch" });
             }


             // --- Find the producer (local or remote proxy) ---
             // Note: The `findProducerById` helper returns metadata for proxies.
             // The actual consumption happens against the *local router*. If it's a remote
             // producer, the `pipeMediaBetweenRouters` logic should have set up the necessary
             // internal pipe consumer on the *pipe transport* that feeds into our local router.
             // So, router.canConsume and consumerTransport.consume should work correctly
             // using just the producerId, regardless of whether it originated locally or remotely.

             const { producer: producerInfo, isRemote } = findProducerById(producerId); // producerInfo might be metadata for remote

             if (!producerInfo || producerInfo.closed) {
                 console.error(`[${THIS_SERVER_ID}] Producer ${producerId} not found or closed for consumption request from ${socket.id}`);
                 return callback({ error: `Producer ${producerId} not available` });
             }

             // Check if router can consume the requested producer
             // Use producerInfo.rtpParameters if available for remote, otherwise rely on router's knowledge
              const canConsume = router.canConsume({ producerId, rtpCapabilities });
             if (!canConsume) {
                 console.error(`[${THIS_SERVER_ID}] Router cannot consume producer ${producerId} with provided capabilities from ${socket.id}`);
                 return callback({ error: "Router cannot consume this producer with provided RTP capabilities" });
             }

             try {
                 const consumer = await consumerTransport.consume({
                     producerId: producerId,
                     rtpCapabilities,
                     paused: true, // Start paused, client resumes after setup
                     appData: { ...appData, socketId: socket.id, roomName: peerData.roomName, producerId, isRemote }, // Store context
                 });

                 addConsumerToList(consumer, peerData.roomName);
                 console.log(`[${THIS_SERVER_ID}] Consumer ${consumer.id} created for ${socket.id} consuming ${producerId} (Remote: ${isRemote})`);

                 // Handle consumer events
                 consumer.on('transportclose', () => {
                     console.log(`[${THIS_SERVER_ID}] Consumer ${consumer.id} transport closed.`);
                     // Don't close consumer here, let transport close handle it via observer?
                     // Or close explicitly: consumer.close();
                 });
                 consumer.on('producerclose', () => {
                     console.log(`[${THIS_SERVER_ID}] Consumer ${consumer.id} notified: Producer ${producerId} closed.`);
                     socket.emit('producer-closed', { remoteProducerId: producerId, reason: 'producer-closed' });
                      // No need to close consumer here, its observer handles it? Let's close to be safe.
                      if (!consumer.closed) consumer.close();
                     // Remove from lists (might be redundant if observer handles it)
                      consumers = consumers.filter(c => c.consumer.id !== consumer.id);
                      if(peers.has(socket.id)) peers.get(socket.id).consumers = peers.get(socket.id).consumers.filter(cid => cid !== consumer.id);

                 });
                  consumer.observer.on('close', () => {
                       console.log(`[${THIS_SERVER_ID}] Consumer ${consumer.id} closed.`);
                       // Remove from lists
                       consumers = consumers.filter(c => c.consumer.id !== consumer.id);
                       if (peers.has(socket.id)) peers.get(socket.id).consumers = peers.get(socket.id).consumers.filter(cid => cid !== consumer.id);
                  });
                  // Optional: Forward pause/resume events if needed by client logic
                  // consumer.on('producerpause', () => socket.emit('producer-paused', { remoteProducerId: producerId }));
                  // consumer.on('producerresume', () => socket.emit('producer-resumed', { remoteProducerId: producerId }));


                 // IMPORTANT: Request Keyframe if it's a video consumer, especially if remote
                 if (consumer.kind === 'video') {
                    console.log(`[${THIS_SERVER_ID}] Scheduling keyframe request for new video consumer ${consumer.id} (Producer: ${producerId}, Remote: ${isRemote})`);
                    // Delay slightly to allow client to potentially resume
                     setTimeout(async () => {
                         try {
                             console.log(`[${THIS_SERVER_ID}] Attempting auto keyframe request for producer ${producerId}`);
                              // Use the findProducerById again to get the object/metadata
                              const { producer: kfProducer, isRemote: kfIsRemote } = findProducerById(producerId);
                             if (kfProducer && !kfProducer.closed && typeof kfProducer.requestKeyFrame === 'function') {
                                 await kfProducer.requestKeyFrame(); // Will forward if it's proxy metadata
                                 console.log(`[${THIS_SERVER_ID}] Keyframe request sent for producer ${producerId}`);
                             } else {
                                 console.warn(`[${THIS_SERVER_ID}] Could not request keyframe for producer ${producerId} - producer not found, closed, or function unavailable.`);
                                  // As fallback, try forwarding again just in case
                                  if (kfIsRemote && webSocketService && REMOTE_SERVER_ID) {
                                     await webSocketService.sendMessage(REMOTE_SERVER_ID, { type: 'forward-keyframe-request', producerId: producerId, originServerId: THIS_SERVER_ID });
                                  }
                             }
                         } catch (kfError) {
                             console.error(`[${THIS_SERVER_ID}] Error auto-requesting keyframe for ${producerId}: ${kfError.message}`);
                         }
                     }, 500); // 500ms delay
                 }


                 callback({
                     // No 'params' wrapper needed
                     id: consumer.id,
                     producerId: producerId,
                     kind: consumer.kind,
                     rtpParameters: consumer.rtpParameters,
                     // serverConsumerId: consumer.id, // Redundant if client uses 'id'
                     // type: consumer.type, // 'simple', 'simulcast', 'svc'
                     producerPaused: consumer.producerPaused, // Let client know initial state
                     isRemote: isRemote // Tell client if producer originated remotely
                 });

             } catch (error) {
                 console.error(`[${THIS_SERVER_ID}] Error consuming producer ${producerId} for ${socket.id}:`, error);
                 callback({ error: error.message });
             }
        });

        socket.on("consumer-resume", async ({ consumerId }, callback) => {
            if (typeof callback !== 'function') callback = ()=>{};
             console.log(`[${THIS_SERVER_ID}] Client ${socket.id} resuming consumer ${consumerId}`);
             const consumerData = consumers.find(c => c.consumer.id === consumerId);
             if (!consumerData || consumerData.socketId !== socket.id) {
                 console.error(`[${THIS_SERVER_ID}] Consumer ${consumerId} not found or not owned by ${socket.id} for resume.`);
                 return callback({ error: "Consumer not found or permission denied" });
             }
             if (consumerData.consumer.closed) {
                  console.warn(`[${THIS_SERVER_ID}] Attempt to resume already closed consumer ${consumerId}`);
                  return callback({ error: "Consumer is closed" });
             }

             try {
                 await consumerData.consumer.resume();
                 console.log(`[${THIS_SERVER_ID}] Consumer ${consumerId} resumed.`);
                 callback({ resumed: true });
                 // Optionally request keyframe again after resume
                  if (consumerData.consumer.kind === 'video') {
                       setTimeout(async () => {
                           try {
                             const { producer: kfProducer } = findProducerById(consumerData.consumer.producerId);
                             if (kfProducer && !kfProducer.closed && typeof kfProducer.requestKeyFrame === 'function') {
                                 await kfProducer.requestKeyFrame();
                                  console.log(`[${THIS_SERVER_ID}] Requested keyframe after resuming consumer ${consumerId}`);
                             }
                           } catch (kfError) { /* Ignore */ }
                       }, 100);
                  }

             } catch (error) {
                 console.error(`[${THIS_SERVER_ID}] Error resuming consumer ${consumerId}:`, error);
                 callback({ error: error.message });
             }
        });

        // Add other handlers similarly (consumer-pause, producer-pause/resume, getProducers, request-keyframe etc.)
        // Ensure they use the helper functions (findProducerById) and check ownership.

        socket.on("getProducers", (callback) => { // Simpler version, matching joinRoom response structure
            if (typeof callback !== 'function') return;
            const peerData = peers.get(socket.id);
            if (!peerData) return callback([]); // Return empty list if peer/room unknown

            const { roomName } = peerData;

            // 1. Local producers
            const localProducerList = producers
                .filter(p => p.roomName === roomName && p.socketId !== socket.id && !p.producer.closed)
                .map(p => ({
                    producerId: p.producer.id,
                    kind: p.producer.kind,
                    isRemote: false
                }));

            // 2. Remote producers (proxies)
            const remoteProducerList = [];
            localProxyProducers.forEach((proxyInfo, producerId) => {
                if (!proxyInfo.closed && (proxyInfo.roomName === roomName || !proxyInfo.roomName)) {
                    remoteProducerList.push({
                        producerId: proxyInfo.id,
                        kind: proxyInfo.kind,
                        isRemote: true
                    });
                }
            });

            callback([...localProducerList, ...remoteProducerList]);
        });

        socket.on("request-keyframe", async ({ producerId }, callback) => {
            if (typeof callback !== 'function') callback = ()=>{};
             console.log(`[${THIS_SERVER_ID}] Client ${socket.id} explicitly requesting keyframe for producer ${producerId}`);
             const { producer, isRemote } = findProducerById(producerId);

             if (!producer || producer.closed) {
                 console.warn(`[${THIS_SERVER_ID}] Cannot request keyframe: Producer ${producerId} not found or closed.`);
                 return callback({ error: "Producer not found or closed" });
             }

             // Check if the producer actually supports requesting keyframes
             if (typeof producer.requestKeyFrame !== 'function') {
                  console.warn(`[${THIS_SERVER_ID}] Producer ${producerId} (Remote: ${isRemote}) does not support requestKeyFrame method.`);
                   // If it's remote and doesn't have the method locally, try forwarding anyway
                   if (isRemote && webSocketService && REMOTE_SERVER_ID) {
                       console.log(`[${THIS_SERVER_ID}] Forwarding keyframe request for ${producerId} as local method unavailable.`);
                       try {
                           await webSocketService.sendMessage(REMOTE_SERVER_ID, { type: 'forward-keyframe-request', producerId: producerId, originServerId: THIS_SERVER_ID });
                           return callback({ requested: true, forwarded: true });
                       } catch (fwdError) {
                           console.error(`[${THIS_SERVER_ID}] Error forwarding keyframe request for ${producerId}: ${fwdError.message}`);
                           return callback({ error: `Failed to forward keyframe request: ${fwdError.message}` });
                       }
                   }
                  return callback({ error: "Producer does not support keyframe requests" });
             }

             try {
                  await producer.requestKeyFrame(); // Will call local method or forward via proxy metadata method
                  console.log(`[${THIS_SERVER_ID}] Keyframe requested successfully for producer ${producerId} (Triggered by: ${socket.id}, Forwarded: ${isRemote})`);
                  callback({ requested: true, forwarded: isRemote });
             } catch (error) {
                  console.error(`[${THIS_SERVER_ID}] Error requesting keyframe for producer ${producerId}: ${error.message}`);
                  callback({ error: error.message });
             }
        });


    }); // End io.on('connection')


    // --- Inter-Server Connection Setup ---
    const connectToRemoteServer = () => {
        if (!REMOTE_SERVER_URL || !REMOTE_SERVER_ID) {
             console.log(`[${THIS_SERVER_ID}] Remote server URL or ID not configured. Skipping connection.`);
             return;
        }
        console.log(`[${THIS_SERVER_ID}] Attempting to connect to remote server ${REMOTE_SERVER_ID} at ${REMOTE_SERVER_URL}`);

        // Disconnect previous if exists
        if (remoteServerSocket) {
            console.log(`[${THIS_SERVER_ID}] Disconnecting existing client connection to remote server.`);
            remoteServerSocket.disconnect();
            remoteServerSocket = null;
        }
         connectedToRemoteServer = false;
         // remoteRouterId = null; // Keep remoteRouterId unless connection explicitly fails long-term? Or reset here? Resetting is safer.
         remoteRouterId = null;

        remoteServerSocket = ioClient(REMOTE_SERVER_URL, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1500, // Slightly longer delay
            reconnectionDelayMax: 7000,
            randomizationFactor: 0.5,
            rejectUnauthorized: process.env.NODE_ENV === 'production', // Allow self-signed for dev, require valid for prod
            // path: "/socket.io/", // Only if server uses a non-default path
            auth: {
                token: INTER_SERVER_SECRET,
                serverId: THIS_SERVER_ID // Identify ourselves
            }
        });

        remoteServerSocket.on('connect', () => {
            console.log(`[${THIS_SERVER_ID}] ----> Successfully connected CLIENT socket to remote server ${REMOTE_SERVER_ID}. Authenticated.`);
            connectedToRemoteServer = true;
            // Send our details immediately
            console.log(`[${THIS_SERVER_ID}] Sending own details to ${REMOTE_SERVER_ID}: Router ID ${router.id}`);
            remoteServerSocket.emit('server-details', { serverId: THIS_SERVER_ID, routerId: router.id });
             // Re-trigger any pending pipe requests? Be careful about loops.
             // Maybe check producers with 'skipped' pipeStatus and retry piping.
        });

        remoteServerSocket.on('disconnect', (reason) => {
            console.warn(`[${THIS_SERVER_ID}] ----> Disconnected CLIENT socket from remote server ${REMOTE_SERVER_ID}: ${reason}`);
            connectedToRemoteServer = false;
            remoteRouterId = null; // Remote router is unknown now
             // Clear pending requests that relied on this connection?
             pendingPipeRequests.forEach((req, id) => {
                 if (req.targetServerId === REMOTE_SERVER_ID) {
                    clearTimeout(req.timeout);
                    req.reject(new Error(`Disconnected from remote server ${REMOTE_SERVER_ID}`));
                    pendingPipeRequests.delete(id);
                 }
             });
             // Socket.IO client will attempt to reconnect based on options.
        });

        remoteServerSocket.on('connect_error', (err) => {
            console.error(`[${THIS_SERVER_ID}] ----> CLIENT socket connection error to ${REMOTE_SERVER_ID}: ${err.message}`);
            // Don't set connectedToRemoteServer=false here, 'disconnect' event handles that.
        });

         // Listen for details FROM the other server (when it sends them back on OUR client connection)
         remoteServerSocket.on('receive-server-details', (details) => {
             if (details && details.routerId && details.serverId === REMOTE_SERVER_ID) {
                 if (remoteRouterId !== details.routerId) {
                      console.log(`[${THIS_SERVER_ID}] <---- Received/Updated details from ${REMOTE_SERVER_ID} via CLIENT socket: Remote Router ID ${details.routerId}`);
                      remoteRouterId = details.routerId;
                       // Now we know the remote router, potentially trigger pending pipes
                 }
             } else {
                  console.warn(`[${THIS_SERVER_ID}] Received invalid server details on CLIENT socket:`, details);
             }
         });

         // Listen for pipe signals coming back TO US on our client connection
         remoteServerSocket.on('pipe-signal-remote', async (message) => {
              console.log(`[${THIS_SERVER_ID}] Received pipe signal via CLIENT socket from ${REMOTE_SERVER_ID}: Type ${message?.type}, CorrID: ${message?.correlationId}`);
              try {
                   if (!message || typeof message !== 'object') throw new Error("Invalid message format");
                   await handlePipeSignalingMessage(message, pipeContext);
              } catch (error) {
                   console.error(`[${THIS_SERVER_ID}] Error handling pipe signal on CLIENT socket: ${error.message}`, message);
                   if (message.correlationId && pendingPipeRequests.has(message.correlationId)) {
                        pendingPipeRequests.get(message.correlationId).reject(error);
                        pendingPipeRequests.delete(message.correlationId);
                   }
              }
         });

         // Listen for remote closing pipe (alternative to pipe-producer-close if using different events)
          remoteServerSocket.on('pipe-producer-closed-on-remote', ({ producerId, reason }) => {
               console.log(`[${THIS_SERVER_ID}] Received notification via CLIENT socket: Remote server closed its end for producer ${producerId}. Reason: ${reason}`);
               // Trigger the same cleanup as the server-side 'pipe-producer-close' handler
                const eventSocket = authenticatedRemoteSocket || socket; // Use a dummy socket for context if needed
                if(eventSocket) {
                    eventSocket.emit('pipe-producer-close', { producerId, reason }); // Simulate event for local cleanup logic
                } else {
                    // Manual cleanup if no socket context available (less ideal)
                    console.warn(`[${THIS_SERVER_ID}] No socket context to trigger cleanup for remote close of ${producerId}`);
                }
          });


    }; // End connectToRemoteServer


    // --- Socket.IO Server Middleware for Inter-Server Auth ---
    io.use((socket, next) => {
        const { token, serverId } = socket.handshake.auth;

        if (token === INTER_SERVER_SECRET && serverId && serverId !== THIS_SERVER_ID) {
             // This connection is FROM the other server
             if (serverId !== REMOTE_SERVER_ID) {
                 console.warn(`[${THIS_SERVER_ID}] Rejecting authenticated connection from unexpected server: ${serverId}. Expected: ${REMOTE_SERVER_ID}`);
                 return next(new Error("Invalid server ID"));
             }

             if (authenticatedRemoteSocket && authenticatedRemoteSocket.connected) {
                 console.warn(`[${THIS_SERVER_ID}] Rejecting duplicate authenticated connection attempt from server: ${serverId}. Existing socket: ${authenticatedRemoteSocket.id}`);
                 // Optionally disconnect the old one first?
                 // authenticatedRemoteSocket.disconnect();
                 return next(new Error("Already connected"));
             }

             console.log(`[${THIS_SERVER_ID}] <---- Authenticated SERVER connection received from: ${serverId} [Socket ID: ${socket.id}]`);
             authenticatedRemoteSocket = socket; // Store this socket instance
             socket.isRemoteServer = true; // Mark the socket
             socket.remoteServerId = serverId; // Store the ID on the socket

             // Handle disconnection OF the other server connecting TO US
             socket.on('disconnect', (reason) => {
                 console.warn(`[${THIS_SERVER_ID}] <---- Authenticated remote server ${serverId} disconnected SERVER socket ${socket.id}: ${reason}`);
                 if (authenticatedRemoteSocket && authenticatedRemoteSocket.id === socket.id) {
                     authenticatedRemoteSocket = null;
                     // Should we clear remoteRouterId here? Only if this was the *only* connection.
                     // If the client connection (remoteServerSocket) is still up, we might still know the ID.
                     // Let's clear it if BOTH connections are down.
                     if (!remoteServerSocket || !remoteServerSocket.connected) {
                         remoteRouterId = null;
                     }
                 }
             });

             // Listen for details FROM the server that connected TO US
             socket.on('server-details', (details) => {
                  if (details && details.routerId && details.serverId === REMOTE_SERVER_ID) {
                      if (remoteRouterId !== details.routerId) {
                           console.log(`[${THIS_SERVER_ID}] <---- Received/Updated details from ${REMOTE_SERVER_ID} via SERVER socket: Remote Router ID ${details.routerId}`);
                           remoteRouterId = details.routerId;
                      }
                      // Send *our* details back immediately ON THIS SOCKET
                      console.log(`[${THIS_SERVER_ID}] ----> Sending details back to ${REMOTE_SERVER_ID} via SERVER socket: Router ID ${router.id}`);
                      socket.emit('receive-server-details', { serverId: THIS_SERVER_ID, routerId: router.id });
                  } else {
                       console.warn(`[${THIS_SERVER_ID}] Received invalid server details on SERVER socket from ${serverId}:`, details);
                  }
             });

            // Pass control to the next middleware/handler, but the io.on('connection') handler
            // will check `socket.isRemoteServer` and return early for these connections.
            next();

        } else if (token || serverId) {
             // Auth provided but invalid or for self
             console.warn(`[${THIS_SERVER_ID}] Rejecting connection with invalid auth: ServerID=${serverId}, Token present=${!!token} [Socket ID: ${socket.id}]`);
             next(new Error('Authentication failed'));
        }
        else {
             // Regular client connection (no auth provided)
             socket.isRemoteServer = false;
             console.log(`[${THIS_SERVER_ID}] Accepting regular client connection [Socket ID: ${socket.id}]`);
             next();
        }
    });
    // --- End Middleware ---

    // Start connecting to the remote server after a short delay
    // to allow this server's Socket.IO to fully start.
    console.log(`[${THIS_SERVER_ID}] Scheduling connection attempt to remote server ${REMOTE_SERVER_ID}...`);
    setTimeout(connectToRemoteServer, 3000); // 3-second delay

    console.log(`[${THIS_SERVER_ID}] Mediasoup setup complete. Waiting for connections on port ${PORT}...`);

}; // End module.exports