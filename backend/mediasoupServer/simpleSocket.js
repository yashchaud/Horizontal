  process.env.DEBUG = "mediasoup*";
  process.stdout.write("!!! CASCADE CANARY LOG: simpleSocket.js IS BEING LOADED BY SERVER 2 !!!\n");
console.log("!!! CASCADE CANARY CONSOLE LOG: simpleSocket.js IS BEING LOADED BY SERVER 2 !!!");

const mediasoup = require("mediasoup");
  const os = require("os");
  // Import piping functionality
  const {
    pipeMediaBetweenRouters,
    PipeContext,
  } = require("./pipinglogic/pipetoremote");
  // Import WebSocket for inter-server communication
  const WebSocket = require("ws");
  // Import centralized logger
  const { logger } = require("./logger");
  const path = require("path");

  module.exports = async function (io) {
    let worker;
    let router;
    let rooms = new Map(); // { roomName1: { Router, peers: [ socketId1, ... ] }, ...}
    let peers = new Map(); // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,], consumers = [id1, id2,] }, ...}
    let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
    let producers = []; // [ { socketId1, roomName1, producer, }, ... ]
    let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]
    let dataProducers = []; // [ { socketId1, roomName1, dataProducer, type: 'sctp' | 'direct', sctpStreamParameters, label, protocol }, ... ]

    // Piping configuration
    const pipeConfig = {
      targetServerId: process.env.TARGET_SERVER_ID || "server2", // Target server ID to pipe to
      pipeRemoteEnabled: process.env.PIPE_REMOTE_ENABLED === "true", // Enable/disable piping feature
      pendingRequests: new Map(), // Map for tracking pipe requests
      remotePipeTransports: new Map(), // Map for tracking pipe transports
      // Queue for pending notifications that arrived before rooms were created
      pendingNotifications: new Map(), // Map of roomName -> array of notifications
      // Store the remote router IDs mapped by server ID
      remoteRouterIds: new Map(), // Map of serverId -> routerId
      // WebSocket config for server-to-server communication
      wsConfig: {
        // Map of WebSocket connections to other servers
        connections: new Map(),
        // The WebSocket server port for receiving messages from other servers
        serverPort: process.env.WS_SERVER_PORT || 8080,
        // The target server's WebSocket URL
        targetUrl: process.env.TARGET_SERVER_WS_URL || "ws://localhost:8081",
      },
    };

    // Initialize WebSocket server for receiving messages from other servers
    const initializeWsServer = () => {
      const wss = new WebSocket.Server({ port: pipeConfig.wsConfig.serverPort });

      wss.on("connection", (ws) => {
        logger.info("Received connection from another server");

        ws.on("message", async (message) => {
          try {
            const parsedMessage = JSON.parse(message);
            logger.debug(
              "Received message from another server: %j",
              parsedMessage
            );
            await processIncomingMessage(parsedMessage);
          } catch (error) {
            logger.error("Error processing WebSocket message: %s", error);
          }
        });

        ws.on("error", (error) => {
          logger.error("WebSocket server error: %s", error);
        });
      });

      logger.info(
        `WebSocket server listening on port ${pipeConfig.wsConfig.serverPort}`
      );
      return wss;
    };

    // Function to send router ID handshake
    const sendRouterHandshake = (targetServerId) => {
      if (!router) {
        logger.warn("Cannot send router handshake: local router not initialized");
        return;
      }

      const ws = pipeConfig.wsConfig.connections.get(targetServerId);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        logger.warn(`Cannot send router handshake: WebSocket not connected to ${targetServerId}`);
        return;
      }

      try {
        const handshakeMsg = {
          type: "router_handshake",
          routerId: router.id,
          serverId: process.env.SERVER_ID || "server1",
          timestamp: Date.now() // Add timestamp to detect stale messages
        };
        
        logger.info(`Sending router handshake to ${targetServerId}: ${router.id}`);
        ws.send(JSON.stringify(handshakeMsg));
      } catch (error) {
        logger.error(`Error sending router handshake: ${error}`);
      }
    };

    // Connect to other servers via WebSocket
    const connectToTargetServer = () => {
      if (!pipeConfig.wsConfig.targetUrl || !pipeConfig.pipeRemoteEnabled) {
        return;
      }

      try {
        logger.info(
          `Connecting to target server at ${pipeConfig.wsConfig.targetUrl}`
        );
        const ws = new WebSocket(pipeConfig.wsConfig.targetUrl);

        ws.on("open", () => {
          logger.info(
            `Connected to target server at ${pipeConfig.wsConfig.targetUrl}`
          );
          pipeConfig.wsConfig.connections.set(pipeConfig.targetServerId, ws);
          
          // Send router handshake message immediately after connection is established
          sendRouterHandshake(pipeConfig.targetServerId);
          
          // Set up a periodic handshake in case the first one is missed
          const handshakeInterval = setInterval(() => {
            // Only send if we still don't have the remote router ID
            if (!pipeConfig.remoteRouterIds.has(pipeConfig.targetServerId)) {
              logger.info(`Sending periodic router handshake to ${pipeConfig.targetServerId}`);
              sendRouterHandshake(pipeConfig.targetServerId);
            } else {
              // We have the router ID, clear the interval
              clearInterval(handshakeInterval);
            }
          }, 5000);
          
          // Clear the interval on close
          ws.on("close", () => {
            clearInterval(handshakeInterval);
          });
        });

        ws.on("close", () => {
          logger.info(
            `Disconnected from target server at ${pipeConfig.wsConfig.targetUrl}`
          );
          pipeConfig.wsConfig.connections.delete(pipeConfig.targetServerId);
          // Remove the router ID when connection is closed
          pipeConfig.remoteRouterIds.delete(pipeConfig.targetServerId);

          // Reconnect after delay
          setTimeout(() => {
            logger.info("Attempting to reconnect to target server...");
            connectToTargetServer();
          }, 5000);
        });

        ws.on("error", (error) => {
          logger.error(`WebSocket client error: %s`, error);
        });

        return ws;
      } catch (error) {
        logger.error(`Error connecting to target server: %s`, error);

        // Retry connection after delay
        setTimeout(() => {
          logger.info("Retrying connection to target server...");
          connectToTargetServer();
        }, 5000);
      }
    };

    // Handle router handshake response
    const handleRouterHandshake = (message) => {
      if (!message.routerId || !message.serverId) {
        logger.error("Invalid router handshake message: missing required fields");
        return;
      }

      logger.info(`Received router ID ${message.routerId} from server ${message.serverId}`);
      
      // Store the remote router ID
      pipeConfig.remoteRouterIds.set(message.serverId, message.routerId);
      
      // Send back our router ID if this is an incoming handshake
      const ws = pipeConfig.wsConfig.connections.get(message.serverId);
      if (ws && ws.readyState === WebSocket.OPEN && router) {
        // Always acknowledge receipt of router ID
        const ackMessage = {
          type: "router_handshake_ack",
          routerId: router.id,
          serverId: process.env.SERVER_ID || "server1",
          receivedRouterId: message.routerId,
          timestamp: Date.now()
        };
        
        logger.info(`Sending router handshake acknowledgment to ${message.serverId}`);
        ws.send(JSON.stringify(ackMessage));
      }
    };
    
    // Handle router handshake acknowledgment
    const handleRouterHandshakeAck = (message) => {
      if (!message.routerId || !message.serverId || !message.receivedRouterId) {
        logger.error("Invalid router handshake ack: missing required fields");
        return;
      }
      
      logger.info(`Received handshake ack from ${message.serverId}. They received our router ID ${message.receivedRouterId}`);
      
      // Update our stored router ID if we don't have it yet
      if (!pipeConfig.remoteRouterIds.has(message.serverId)) {
        logger.info(`Storing router ID ${message.routerId} from server ${message.serverId} (from ack)`);
        pipeConfig.remoteRouterIds.set(message.serverId, message.routerId);
      }
      
      // Process any pending pipe attempts that were waiting for router ID
      producers.forEach((producerData) => {
        const { producer, roomName, socketId } = producerData;
        
        // Skip if producer is already piped or from a remote source
        if (producerData.isPiped || socketId.startsWith('remote-')) {
          return;
        }
        
        // Try to pipe this producer now that we have the router ID
        logger.info(`Attempting to pipe previously pending producer ${producer.id}`);
        pipeProducerToRemote(producer, roomName, socketId).catch((error) =>
          logger.error(`Failed to pipe producer ${producer.id}: %s`, error)
        );
      });
    };

    // Initialize WebSocket connections
    const wsServer = initializeWsServer();
    connectToTargetServer();

    const videoEncodings = [
      { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
      { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
      { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" },
    ];

    const mediaCodecs = [
      {
        kind: "audio",
        mimeType: "audio/opus",
        preferredPayloadType: 100,
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        preferredPayloadType: 101,
        clockRate: 90000,
        parameters: {
          "x-google-start-bitrate": 1000,
        },
      }
    ];

    // Create a single worker
    worker = await mediasoup.createWorker({
      logLevel: "debug",
      logTags: ["rtp", "srtp", "rtcp"],
      rtcMinPort: 10000,
      rtcMaxPort: 10999,
    });

    worker.on("died", () => {
      logger.error(
        "mediasoup worker died, exiting in 2 seconds... [pid:%d]",
        worker.pid
      );
      setTimeout(() => process.exit(1), 2000);
    });

    // Create router
    router = await worker.createRouter({ mediaCodecs });

    // Add a handler for incoming pipe notifications from other servers
    const handleRemotePipeNotification = (message) => {
      try {
        logger.debug(`Received remote pipe notification: %j`, message);
        const { 
          producerId, 
          roomName, 
          kind, 
          socketId: remoteSocketId, 
          rtpParameters, 
          sourceServerId,  
          paused
        } = message;

        if (!roomName || !producerId) {
          logger.error("Invalid pipe notification: missing required fields");
          return;
        }

        // If room doesn't exist yet, create it or queue the notification
        if (!rooms.has(roomName)) {
          logger.info(
            `Creating room ${roomName} for piped producer ${producerId}`
          );

          // Create room for incoming piped producers
          rooms.set(roomName, {
            router: router,
            peers: new Set(),
            isPipedRoom: true, // Mark as created from piping
          });
        }

        // Now notify all peers in the room about the new piped producer
        const room = rooms.get(roomName);

        // Add the producer to our local producers list if not already there
        const existingProducer = producers.find(
          (p) => p.producer.id === producerId
        );
        
        if (!existingProducer) {
          logger.info(
            `Adding remote piped producer ${producerId} to local producers list`
          );

          // Create an enhanced proxy producer object
          const proxyProducer = {
            id: producerId,
            kind,
            rtpParameters: rtpParameters,
            paused: paused || false,
            closed: false,
            appData: {
              isPipeProducer: true,
              sourceServerId: sourceServerId,
              originalProducerId: producerId,
              roomName
            },
            // Add methods with properly bound 'this'
            close() {
              logger.debug(`Remote producer ${producerId} close called`);
              this.closed = true;
            },
            pause() {
              logger.debug(`Remote producer ${producerId} pause called`);
              this.paused = true;
              return Promise.resolve();
            },
            resume() {
              logger.debug(`Remote producer ${producerId} resume called`);
              this.paused = false;
              return Promise.resolve();
            },
            requestKeyFrame() {
              logger.debug(`Key frame requested for remote producer ${producerId}`);
              // Forward keyframe request to origin server
              if (pipeConfig.wsConfig.connections.has(sourceServerId)) {
                pipeContext.webSocketService.sendMessage(sourceServerId, {
                  type: "request_origin_keyframe",
                  producerId: producerId,
                  roomName: roomName
                });
                return Promise.resolve();
              }
              return Promise.reject(new Error(`No connection to origin server ${sourceServerId}`));
            }
          };

          // Add to producers list
          producers.push({
            socketId: `remote-${remoteSocketId || producerId}`,
            producer: proxyProducer,
            roomName,
            isPiped: true,
            originServerId: sourceServerId,
            transportId: null // Mark as a remote producer without local transport
          });
        }

        // Notify all peers in the room
        if (room.peers.size > 0) {
          room.peers.forEach((socketId) => {
            const peer = peers.get(socketId);
            if (peer && peer.socket) {
              logger.debug(
                `Notifying peer ${socketId} about piped producer ${producerId}`
              );
              peer.socket.emit("new-producer", {
                producerId,
                producerSocket: remoteSocketId || `remote-${producerId}`,
                isRemotePiped: true,
                kind: kind,
                encodings: kind === 'video' ? videoEncodings : undefined
              });
            }
          });
        } else {
          logger.info(
            `Room ${roomName} exists but has no peers yet. Producer ${producerId} will be available when peers join.`
          );
        }
      } catch (error) {
        logger.error("Error handling remote pipe notification: %s", error);
      }
    };

    // Helper function to get the actual Mediasoup Producer object by ID
    const getActualMediasoupProducerById = async (producerId) => {
      // Fallback: Search through transports (less efficient)
      for (const transportData of transports) {
        if (transportData.transport && !transportData.transport.closed) {
          try {
            // Check if this transport produced the producerId
            const prod = producers.find(p => p.producer.id === producerId && p.transportId === transportData.transport.id);
            if (prod) return prod.producer;

            // Check PipeTransports specifically if appData is stored there
            if (transportData.transport.constructor.name === 'PipeTransport') {
              // PipeTransports have .producer and .consumer properties
              if (transportData.transport.producer && transportData.transport.producer.id === producerId) {
                return transportData.transport.producer;
              }
              // Or if it's a PipeProducer on the target server stored in your main 'producers' list
              const pipeProdData = producers.find(p => p.producer.id === producerId && p.isPiped);
              if (pipeProdData) return pipeProdData.producer;
            }
          } catch (e) { 
            logger.error(`Error checking transport ${transportData.transport.id} for producer ${producerId}: ${e}`);
          }
        }
      }
      
      // Check the main producers list again (specifically for PipeProducers added via createRemoteProducer)
      const mainProdData = producers.find(p => p.producer.id === producerId);
      if (mainProdData) return mainProdData.producer;

      logger.warn(`Could not find actual Mediasoup producer object for ID: ${producerId}`);
      return null;
    };

    // Process incoming messages from other servers
    const processIncomingMessage = async (message) => {
      if (!message || !message.type) return;

      switch (message.type) {
        case "router_handshake":
          handleRouterHandshake(message);
          break;
        case "router_handshake_ack":
          handleRouterHandshakeAck(message);
          break;
        case "new-producer-piped":
          // If this message has a roomName and the room doesn't exist,
          // queue it for later processing
          if (message.roomName && !rooms.has(message.roomName)) {
            logger.info(
              `Queueing notification for producer ${message.producerId} in non-existent room ${message.roomName}`
            );
            const pendingNotifs =
              pipeConfig.pendingNotifications.get(message.roomName) || [];
            pendingNotifs.push(message);
            pipeConfig.pendingNotifications.set(message.roomName, pendingNotifs);
          } else {
            handleRemotePipeNotification(message);
          }
          break;
        case "pipe_initiate":
        case "pipe_confirm":
        case "pipe_reject":
          // These messages are handled by the pipetoremote module
          if (pipeConfig.pipeRemoteEnabled) {
            const {
              handlePipeSignalingMessage,
            } = require("./pipinglogic/pipetoremote");
            handlePipeSignalingMessage(message, pipeContext).catch((error) =>
              logger.error(`Error handling pipe signaling message: ${error}`)
            );
          }
          break;
        case "keyframe-request":
          // Handle keyframe request for a producer
          if (message.producerId) {
            const producerData = producers.find(p => p.producer.id === message.producerId);
            if (producerData && producerData.producer) {
              logger.debug(`Received keyframe request for producer ${message.producerId}`);
              if (typeof producerData.producer.requestKeyFrame === 'function') {
                producerData.producer.requestKeyFrame();
              }
            }
          }
          break;
        case "request_origin_keyframe":
          if (message.producerId) {
            logger.debug(`Received forwarded keyframe request for origin producer ${message.producerId}`);
            const producerData = producers.find(p => p.producer.id === message.producerId && !p.isPiped && !p.socketId.startsWith('remote-'));
            
            if (producerData && producerData.producer) {
              if (typeof producerData.producer.requestKeyFrame === 'function') {
                try {
                  await producerData.producer.requestKeyFrame();
                  logger.debug(`Successfully requested keyframe for origin producer ${message.producerId}`);
                  
                  // Acknowledge the successful keyframe request back to the requesting server if possible
                  if (message.sourceServerId && pipeConfig.wsConfig.connections.has(message.sourceServerId)) {
                    pipeContext.webSocketService.sendMessage(message.sourceServerId, {
                      type: 'keyframe_request_result',
                      producerId: message.producerId,
                      success: true
                    });
                  }
                } catch (err) {
                  logger.error(`Origin requestKeyFrame failed for ${message.producerId}: ${err.message}`);
                  
                  // Notify the requesting server about the failure if possible
                  if (message.sourceServerId && pipeConfig.wsConfig.connections.has(message.sourceServerId)) {
                    pipeContext.webSocketService.sendMessage(message.sourceServerId, {
                      type: 'keyframe_request_result',
                      producerId: message.producerId,
                      success: false,
                      error: err.message
                    });
                  }
                }
              } else {
                logger.warn(`Origin producer ${message.producerId} does not have requestKeyFrame method`);
                
                // Notify the requesting server about the missing method
                if (message.sourceServerId && pipeConfig.wsConfig.connections.has(message.sourceServerId)) {
                  pipeContext.webSocketService.sendMessage(message.sourceServerId, {
                    type: 'keyframe_request_result',
                    producerId: message.producerId,
                    success: false,
                    error: 'Producer does not have requestKeyFrame method'
                  });
                }
              }
            } else {
              logger.warn(`Origin producer ${message.producerId} not found for keyframe request`);
              
              // Notify the requesting server about the missing producer
              if (message.sourceServerId && pipeConfig.wsConfig.connections.has(message.sourceServerId)) {
                pipeContext.webSocketService.sendMessage(message.sourceServerId, {
                  type: 'keyframe_request_result',
                  producerId: message.producerId, 
                  success: false,
                  error: 'Producer not found'
                });
              }
            }
          }
          break;
        case "keyframe_request_result":
          if (message.producerId) {
            const status = message.success ? 'succeeded' : 'failed';
            logger.debug(`Keyframe request for producer ${message.producerId} ${status} on remote server. ${message.error ? 'Error: ' + message.error : ''}`);
            
            // If we have any open sockets that requested this keyframe, notify them
            // This would be more efficient with a keyframe request tracking system
            // For now, broadcast to all relevant sockets in rooms containing this producer
            const producerData = producers.find(p => p.producer.id === message.producerId);
            if (producerData && producerData.roomName) {
              const room = rooms.get(producerData.roomName);
              if (room && room.peers.size > 0) {
                room.peers.forEach(peerId => {
                  const peer = peers.get(peerId);
                  if (peer && peer.socket) {
                    if (message.success) {
                      peer.socket.emit('keyframe-requested', { producerId: message.producerId });
                    } else {
                      peer.socket.emit('keyframe-request-failed', { 
                        producerId: message.producerId,
                        error: message.error || 'Unknown error on remote server'
                      });
                    }
                  }
                });
              }
            }
          }
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    };

    // Setup pipe context for remote piping
    const pipeContext = {
      localRouter: router, // Must be the initialized main mediasoup Router for this server
      pendingRequests: pipeConfig.pendingRequests,
      remotePipeTransports: pipeConfig.remotePipeTransports,
      transportConsumerMap: new Map(), // Original property, keeping it.

      getProducer: async (producerId) => {
        // Ensure 'producers' array is accessible and correctly structured
        const producerData = producers.find((p) => p.producer && p.producer.id === producerId);
        if (!producerData) logger.warn(`[pipeContext.getProducer] Producer ${producerId} not found.`);
        return producerData?.producer;
      },

      getDataProducer: async (dataProducerId) => {
        logger.warn(`[pipeContext.getDataProducer] Data producer ${dataProducerId} lookup not fully implemented.`);
        // Placeholder: Replace with actual 'getDataProducer' function logic from simpleSocket.js if available
        return null;
      },

      // Function to create a remote producer when media is piped *in*
      // Replace 'createRemoteProducerInSocket' with the actual function name from simpleSocket.js (e.g., the one at line 671 of outline)
      createRemoteProducer: async (params) => {
        const { producerId, kind, rtpParameters, sourceServerId, roomName, paused, socketId: remoteSocketId } = params;
        logger.info(`[pipeContext.createRemoteProducer] Creating remote producer proxy for ${producerId} from server ${sourceServerId} in room ${roomName}`);

        const existingProducer = producers.find((p) => p.producer.id === producerId);
        if (existingProducer) {
          logger.warn(`[pipeContext.createRemoteProducer] Producer ${producerId} already exists. Returning existing.`);
          return existingProducer.producer; // Or handle as an update if necessary
        }

        // Logic adapted from handleRemotePipeNotification
        const proxyProducer = {
          id: producerId,
          kind,
          rtpParameters: rtpParameters,
          paused: paused || false,
          closed: false,
          appData: {
            isPipeProducer: true,
            sourceServerId: sourceServerId,
            originalProducerId: producerId,
            roomName
          },
          close() {
            logger.debug(`[proxyProducer ${this.id}] close() called`);
            this.closed = true;
            // Optionally, notify other local consumers or clean up
          },
          pause() {
            logger.debug(`[proxyProducer ${this.id}] pause() called`);
            this.paused = true;
            // Notify origin server if two-way state management is desired for pause/resume
            return Promise.resolve();
          },
          resume() {
            logger.debug(`[proxyProducer ${this.id}] resume() called`);
            this.paused = false;
            // Notify origin server if two-way state management is desired for pause/resume
            return Promise.resolve();
          },
          requestKeyFrame() {
            logger.debug(`[proxyProducer ${this.id}] requestKeyFrame() called`);
            if (pipeConfig.wsConfig.connections.has(sourceServerId)) {
              pipeContext.webSocketService.sendMessage(sourceServerId, {
                type: "request_origin_keyframe",
                producerId: this.id, // Use this.id to ensure it's the correct producerId
                roomName: this.appData.roomName
              });
              return Promise.resolve();
            }
            logger.error(`[proxyProducer ${this.id}] No connection to origin server ${sourceServerId} to request keyframe.`);
            return Promise.reject(new Error(`No connection to origin server ${sourceServerId}`));
          }
        };

        producers.push({
          socketId: `remote-${remoteSocketId || producerId}`, // Use provided remoteSocketId or fallback
          producer: proxyProducer,
          roomName,
          isPiped: true,
          originServerId: sourceServerId,
          transportId: null // Mark as a remote producer without a local WebRTCTransport
        });

        // IMPORTANT: Notify local clients in the room about this new "remote" producer
        peers.forEach((peer) => {
          if (peer.roomName === roomName && peer.socketId !== `remote-${remoteSocketId || producerId}`) {
            try {
                logger.info(`[pipeContext.createRemoteProducer] Notifying peer ${peer.socketId} in room ${roomName} about new remote producer ${producerId}`);
                peer.socket.emit("new-producer", {
                    producerId: proxyProducer.id,
                    kind: proxyProducer.kind,
                    // Potentially other relevant info for the client
                });
            } catch (e) {
                logger.error(`[pipeContext.createRemoteProducer] Error notifying peer ${peer.socketId}: ${e.message}`);
            }
          }
        });
        
        logger.info(`[pipeContext.createRemoteProducer] Successfully created and registered proxy producer ${producerId}`);
        return proxyProducer; // Return the created proxy producer object

        logger.info(`[pipeContext.createRemoteProducer] Successfully created and registered proxy for producer ${producerId}`);
        
        // Notify local clients in the room about this new remotely piped producer
        // This logic is similar to what's in handleRemotePipeNotification
        const roomData = rooms.get(roomName);
        if (roomData && roomData.peers.size > 0) {
          roomData.peers.forEach((peerSocketId) => {
            const peer = peers.get(peerSocketId);
            if (peer && peer.socket) {
              logger.debug(
                `[pipeContext.createRemoteProducer] Notifying peer ${peerSocketId} about new remote producer ${producerId}`
              );
              peer.socket.emit("new-producer", {
                producerId: producerId,
                producerSocket: `remote-${remoteSocketId || producerId}`,
                isRemotePiped: true,
                kind: kind,
                // Encodings might be needed if kind is video, similar to handleRemotePipeNotification
                encodings: kind === 'video' ? videoEncodings : undefined 
              });
            }
          });
        } else {
          logger.info(
            `[pipeContext.createRemoteProducer] Room ${roomName} has no peers to notify about new remote producer ${producerId}, or room does not exist.`
          );
        }

        return proxyProducer;
      },

      webSocketService: {
        getCurrentServerId: () => process.env.SERVER_ID || "server1", // Ensure SERVER_ID is set
        getPublicIp: () => process.env.PUBLIC_IP || "127.0.0.1", // CRITICAL: PUBLIC_IP env var must be set for multi-server
        sendMessage: async (targetServerId, message) => {
          const ws = pipeConfig.wsConfig.connections.get(targetServerId);
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            logger.warn(
              `[pipeContext.webSocketService.sendMessage] WebSocket to ${targetServerId} not available/open.`
            );
            return;
          }
          try {
            ws.send(JSON.stringify(message));
            logger.debug(`[pipeContext.webSocketService.sendMessage] Sent to ${targetServerId}: %j`, message);
          } catch (error) {
            logger.error(
              `[pipeContext.webSocketService.sendMessage] Error sending to ${targetServerId}: ${error.message}`
            );
          }
        },
      },

      // Router registry for tracking routers across servers
      routerRegistry: {
        isLocalRouter: (routerId) => router && router.id === routerId, // 'router' must be initialized
        getLocalRouter: (routerId) => {
            if (router && router.id === routerId) return router; // 'router' must be initialized
            logger.warn(`[pipeContext.routerRegistry.getLocalRouter] Router ${routerId} not found or main router not initialized.`);
            return undefined;
        },
        getServerIdForRouter: (routerId) => {
            if (router && router.id === routerId) { // Check local router first
                return process.env.SERVER_ID || "server1"; // Return current server's ID
            }
            // Look for remote routerId in pipeConfig.remoteRouterIds (Map of serverId -> routerId)
            for (const [serverId, id] of pipeConfig.remoteRouterIds.entries()) {
                if (id === routerId) {
                    return serverId;
                }
            }
            logger.warn(`[pipeContext.routerRegistry.getServerIdForRouter] Server ID for router ${routerId} not found.`);
            return undefined;
        },
        // Stubs for now; pipetoremote.ts might manage this sufficiently with its internal maps
        // and the shared remotePipeTransports map.
        findPipeTransport: async (sourceRouterId, targetRouterId) => {
            logger.debug(`[pipeContext.routerRegistry.findPipeTransport] (Stub) Called for ${sourceRouterId} to ${targetRouterId}.`);
            return undefined;
        },
        registerPipeTransport: async (sourceRouterId, targetRouterId, transportId) => {
            logger.debug(`[pipeContext.routerRegistry.registerPipeTransport] (Stub) Called for ${transportId} between ${sourceRouterId} and ${targetRouterId}.`);
        },
        removePipeTransport: async (transportId) => {
            logger.debug(`[pipeContext.routerRegistry.removePipeTransport] (Stub) Called for ${transportId}.`);
        }
      },

      // Function to create a remote producer proxy
      // Renamed to avoid conflict with the more complete createRemoteProducer (defined around line 609)
      // This version creates an incomplete proxy and was likely causing issues.
      _internalCreateRemoteProducerStub: async ({
        id,
        kind,
        rtpParameters,
        routerId,
        proxyProducer,
        roomName,
      }) => {
        logger.debug(
          `Created remote producer proxy for ${id} in room ${roomName}`
        );
        // This would create a representation of a remote producer locally
        // For now, we'll just add it to our producers list so clients can consume it

        // We don't have a real socketId for remote producers, so use a special prefix
        const remoteSocketId = `remote-${id}`;

        // Add to producers list if not already present
        const existing = producers.find((p) => p.producer.id === id);
        if (!existing) {
          logger.debug(`Adding remote producer ${id} to local producers list`);
          producers.push({
            socketId: remoteSocketId,
            producer: proxyProducer || {
              id,
              kind,
              rtpParameters,
              // Add minimal producer interface methods
              close: () => logger.debug(`Remote producer ${id} close called`),
              pause: () => logger.debug(`Remote producer ${id} pause called`),
              resume: () => logger.debug(`Remote producer ${id} resume called`),
              closed: false,
              paused: false,
            },
            roomName,
          });
        }
      },

      // Timeout for pipe operations
      pipeTimeout: 30000, // 30 seconds
      createRemoteDataProducer: async ({
        id, // Original data producer ID from source server
        sctpStreamParameters,
        label,
        protocol,
        routerId, // Local router ID
        proxyDataProducer, // Actual DataConsumer object from pipetoremote.ts
        roomName,
        sourceServerId,
        appData = {}
      }) => {
        logger.debug(
          `[pipeContext.createRemoteDataProducer] Attempting to create remote data producer proxy for ${id} from server ${sourceServerId} in room ${roomName}`
        );

        const existingDataProducer = dataProducers.find((dp) => dp.dataProducer && dp.dataProducer.id === id);
        if (existingDataProducer) {
          logger.warn(`[pipeContext.createRemoteDataProducer] DataProducer ${id} already exists. Returning existing.`);
          return existingDataProducer.dataProducer;
        }

        // The proxyDataProducer is the actual mediasoup DataConsumer object
        // We store it directly or a representation of it.
        const remoteSocketId = `remote-data-${id}`; // Create a unique socketId for remote entities

        dataProducers.push({
          socketId: remoteSocketId,
          dataProducer: proxyDataProducer, // Store the actual DataConsumer
          roomName,
          isPiped: true,
          originServerId: sourceServerId,
          label: proxyDataProducer.label,
          protocol: proxyDataProducer.protocol,
          sctpStreamParameters: proxyDataProducer.sctpStreamParameters,
          appData: { ...(proxyDataProducer.appData || {}), ...appData } // Merge appData
        });

        logger.info(`[pipeContext.createRemoteDataProducer] Successfully registered remote DataProducer ${id} (via DataConsumer ${proxyDataProducer.id}) locally.`);

        // Notify local clients in the room about this new remote data producer
        const roomData = rooms.get(roomName);
        if (roomData && roomData.peers.size > 0) {
          roomData.peers.forEach((peerSocketId) => {
            const peer = peers.get(peerSocketId);
            if (peer && peer.socket && peer.socketId !== remoteSocketId) { // Don't notify itself if it were a peer
              try {
                logger.debug(
                  `[pipeContext.createRemoteDataProducer] Notifying peer ${peerSocketId} in room ${roomName} about new remote data producer ${id}`
                );
                peer.socket.emit("new-data-producer", {
                  dataProducerId: id, // Use the original ID for client consistency
                  sctpStreamParameters: proxyDataProducer.sctpStreamParameters,
                  label: proxyDataProducer.label,
                  protocol: proxyDataProducer.protocol,
                  appData: proxyDataProducer.appData,
                  isRemotePiped: true,
                  producerSocketId: remoteSocketId // Client might need this to differentiate
                });
              } catch (e) {
                logger.error(`[pipeContext.createRemoteDataProducer] Error notifying peer ${peerSocketId}: ${e.message}`);
              }
            }
          });
        } else {
          logger.info(
            `[pipeContext.createRemoteDataProducer] Room ${roomName} has no peers to notify about new remote data producer ${id}, or room does not exist.`
          );
        }
        return proxyDataProducer; // Return the actual DataConsumer object
      }
    };

    // Helper function to pipe a producer to remote server
    const pipeProducerToRemote = async (producer, roomName, socketId) => {
      if (!pipeConfig.pipeRemoteEnabled) {
        logger.debug(`Piping disabled. Not piping producer ${producer.id}`);
        return;
      }

      try {
        // Get the remote router ID for the target server
        const remoteRouterId = pipeConfig.remoteRouterIds.get(pipeConfig.targetServerId);
        
        if (!remoteRouterId) {
          logger.error(`Cannot pipe producer ${producer.id}: No remote router ID available for ${pipeConfig.targetServerId}`);
          
          // Set up a retry after delay if no router ID is available yet
          setTimeout(() => {
            if (pipeConfig.remoteRouterIds.has(pipeConfig.targetServerId)) {
              logger.info(`Retrying pipe for producer ${producer.id} after obtaining router ID`);
              pipeProducerToRemote(producer, roomName, socketId).catch(err => 
                logger.error(`Retry pipe failed for producer ${producer.id}: ${err}`)
              );
            }
          }, 3000);
          
          return;
        }

        logger.info(
          `Piping producer ${producer.id} (kind: ${producer.kind}) in room ${roomName} to remote server ` +
          `with router ID ${remoteRouterId}`
        );

        // Get the pipe function
        const pipeFunc = await pipeMediaBetweenRouters(
          {
            producerId: producer.id,
            targetRouterId: remoteRouterId,
            roomName: roomName,
            enableRtx: true,
            enableSctp: true,
          },
          pipeContext
        );

        // Execute the pipe function
        const result = await pipeFunc();
        logger.info(
          `Successfully piped producer ${producer.id} to remote server with router ${remoteRouterId}`
        );

        // After successful piping, notify the target server about this producer
        pipeContext.webSocketService.sendMessage(pipeConfig.targetServerId, {
          type: "new-producer-piped",
          producerId: producer.id,
          socketId: socketId,
          roomName: roomName,
          kind: producer.kind,
          rtpParameters: producer.rtpParameters,
          sourceServerId: pipeContext.webSocketService.getCurrentServerId(),
          paused: producer.paused
        });

        return result;
      } catch (error) {
        logger.error(
          `Error piping producer ${producer.id} to remote server: ${error}`
        );
        
        // Try to pipe again after a short delay if it's a temporary issue
        setTimeout(() => {
          logger.info(`Retrying pipe for producer ${producer.id} after error`);
          pipeProducerToRemote(producer, roomName, socketId).catch(err => 
            logger.error(`Retry pipe failed for producer ${producer.id}: ${err}`)
          );
        }, 5000);
      }
    };

    // Utility functions
    const createWebRtcTransport = async () => {
      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: process.env.PUBLIC_IP || "127.0.0.1", // use environment variable for public IP
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
        maxIncomingBitrate: 1500000,
        // Add STUN servers for better NAT traversal
        iceServers: [
          { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
        ]
      });

      // Monitor transport
      transport.on("icestatechange", (iceState) => {
        logger.debug("ICE state changed to %s", iceState);
      });

      transport.on("iceselectedtuplechange", (tupleData) => {
        logger.debug("ICE tuple changed: %j", tupleData);
      });

      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "failed" || dtlsState === "closed") {
          logger.warn("DTLS state changed to %s", dtlsState);
        }
      });

      transport.on("sctpstatechange", (sctpState) => {
        logger.debug("SCTP state changed to %s", sctpState);
      });

      return transport;
    };

    const getTransport = (socketId) => {
      logger.debug(`getTransport called for socketId: ${socketId}`);
      const matchingTransports = transports.filter(
        (t) => t.socketId === socketId && !t.consumer
      );
      if (matchingTransports.length === 0) {
        logger.warn(`No producer transport found for socketId: ${socketId}. Transports: %o`, transports.map(t => ({id: t.transport.id, socketId: t.socketId, consumer: t.consumer})));
        return undefined;
      }
      if (matchingTransports.length > 1) {
        logger.warn(`Multiple producer transports found for socketId: ${socketId}, returning the first. Transports: %o`, matchingTransports.map(t => ({id: t.transport.id, socketId: t.socketId, consumer: t.consumer})));
      }
      const transport = matchingTransports[0]?.transport;
      logger.debug(`getTransport for socketId ${socketId} found transport: ${transport ? transport.id : 'undefined'}`);
      return transport;
    };

    const informConsumers = (roomName, socketId, producerId) => {
      logger.debug(
        `Informing consumers in room ${roomName} about new producer ${producerId}`
      );
      
      // Find the room
      const room = rooms.get(roomName);
      if (!room) {
        logger.warn(`Cannot inform consumers: Room ${roomName} not found`);
        return;
      }
      
      // Find the producer data to check kind
      const producerData = producers.find(p => p.producer.id === producerId);
      if (!producerData) {
        logger.warn(`Cannot inform consumers: Producer ${producerId} not found`);
        return;
      }
      
      // Inform all peers in the room except the sender
      room.peers.forEach((peerId) => {
        if (peerId !== socketId) {
          const peer = peers.get(peerId);
          if (peer && peer.socket) {
            logger.debug(`Notifying peer ${peerId} about producer ${producerId}`);
            peer.socket.emit("new-producer", { 
              producerId, 
              producerSocket: socketId,
              kind: producerData.producer.kind,
              // Include specific encoding params for video
              encodings: producerData.producer.kind === 'video' ? videoEncodings : undefined
            });
          }
        }
      });
    };

    io.on("connection", (socket) => {
      logger.info("Peer connected: %s", socket.id);
      socket.emit("connection-success", { socketId: socket.id });

      const addTransport = (transport, roomName, consumer) => {
        transports = [
          ...transports,
          { socketId: socket.id, transport, roomName, consumer },
        ];

        peers.get(socket.id).transports.push(transport.id);
      };

      const addProducer = (producer, roomName) => {
        producers = [...producers, { socketId: socket.id, producer, roomName }];

        peers.get(socket.id).producers.push(producer.id);

        // Pipe the new producer to remote server
        if (pipeConfig.pipeRemoteEnabled) {
          pipeProducerToRemote(producer, roomName, socket.id).catch((error) =>
            logger.error(`Failed to pipe producer ${producer.id}: %s`, error)
          );
        }
      };

      const addConsumer = (consumer, roomName) => {
        consumers = [...consumers, { socketId: socket.id, consumer, roomName }];

        peers.get(socket.id).consumers.push(consumer.id);
      };

      socket.on("joinRoom", async ({ roomName }, callback) => {
        try {
          // Create Router if it doesn't exist
          if (!rooms.has(roomName)) {
            rooms.set(roomName, {
              router: router,
              peers: new Set([socket.id]),
            });
            logger.info("Created new room: %s", roomName);

            // Process any pending notifications for this room
            if (pipeConfig.pendingNotifications.has(roomName)) {
              const pendingNotifs =
                pipeConfig.pendingNotifications.get(roomName) || [];
              logger.info(
                `Processing ${pendingNotifs.length} pending notifications for room ${roomName}`
              );

              // Process all pending notifications
              for (const notification of pendingNotifs) {
                handleRemotePipeNotification(notification);
              }

              // Clear the queue
              pipeConfig.pendingNotifications.delete(roomName);
            }
          } else {
            rooms.get(roomName).peers.add(socket.id);
            logger.info("Peer %s joined existing room: %s", socket.id, roomName);
          }

          // Add peer
          peers.set(socket.id, {
            socket,
            roomName,
            transports: [],
            producers: [],
            consumers: [],
            peerDetails: {
              name: "",
              isAdmin: false,
            },
          });

          // Get existing producers in the room
          const producerList = producers
            .filter((producer) => producer.roomName === roomName)
            .map((producer) => ({
              producerId: producer.producer.id,
              producerSocket: producer.socketId,
              isRemotePiped: producer.isPiped === true,
            }));

          logger.debug(
            "Returning %d producers in room %s to peer %s",
            producerList.length,
            roomName,
            socket.id
          );

          // Format response to match frontend expectations
          callback({
            Routers: [router.rtpCapabilities],
            Currentindex: 0,
            producerList,
          });
        } catch (error) {
          logger.error("Error joining room: %s", error.message);
          callback({
            error: error.message,
            Routers: [],
            Currentindex: 0,
            producerList: [],
          });
        }
      });

      socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
        try {
          const transport = await createWebRtcTransport();

          addTransport(transport, peers.get(socket.id).roomName, consumer);
          logger.debug(
            "Created WebRTC transport %s for peer %s",
            transport.id,
            socket.id
          );
          logger.debug(`Current transports on server after adding ${transport.id}: %o`, transports.map(t => t.transport.id));

          callback({
            params: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
              sctpParameters: transport.sctpParameters,
            },
          });
        } catch (error) {
          logger.error("Error creating WebRTC transport: %s", error.message);
          callback({ error: error.message });
        }
      });

      socket.on("transport-connect", async ({ transportId, dtlsParameters }) => {
        try {
          logger.info(`Received transport-connect for transportId ${transportId}`);
          
          // Find transport by both socketId and transportId
          const transportData = transports.find(
            (t) => t.transport.id === transportId && t.socketId === socket.id
          );
          
          if (!transportData || !transportData.transport) {
            const errorMsg = `Transport ${transportId} not found for socket ${socket.id}`;
            logger.error(errorMsg);
            return socket.emit("transport-connect-failed", {
              id: transportId,
              error: errorMsg
            });
          }
          
          const transport = transportData.transport;
          
          logger.debug(`Connecting transport ${transportId} with DTLS parameters`);
          
          await transport.connect({ dtlsParameters });
          
          logger.info(`Transport ${transportId} connected successfully`);
          
          // Notify client of successful connection
          socket.emit("transport-connected", { 
            id: transportId 
          });
        } catch (error) {
          logger.error(`Error connecting transport ${transportId}: ${error.message}`);
          socket.emit("transport-connect-failed", { 
            id: transportId, 
            error: error.message 
          });
        }
      });

      socket.on(
        "transport-produce",
        async ({ kind, rtpParameters, appData }, callback) => {
          try {
            const transport = getTransport(socket.id);
            if (!transport) {
              const errorMsg = `Producer transport not found for socket ${socket.id}`;
              logger.error(errorMsg);
              // Ensure callback is invoked with an error object as expected by client
              return callback({ error: errorMsg });
            }

            let producer;
            logger.debug(`Attempting to produce ${kind} on transport ${transport.id} for socket ${socket.id}`);
            if (kind === "video") {
              producer = await transport.produce({
                kind,
                rtpParameters,
                encodings: videoEncodings,
                codecOptions: {
                  videoGoogleStartBitrate: 1000,
                },
                appData,
              });
            } else {
              producer = await transport.produce({
                kind,
                rtpParameters,
                appData,
              });
            }
            logger.debug(`Successfully produced ${kind} with id ${producer.id} on transport ${transport.id} for socket ${socket.id}`);

            const roomName = peers.get(socket.id).roomName;
            addProducer(producer, roomName);

            informConsumers(roomName, socket.id, producer.id);
            logger.info(
              "Producer %s created for peer %s, kind: %s",
              producer.id,
              socket.id,
              kind
            );

            producer.on("transportclose", () => {
              logger.debug(
                "Producer transport closed for producer %s",
                producer.id
              );
              producer.close();
            });

            producer.on("score", (score) => {
              logger.debug("Producer %s score: %j", producer.id, score);
            });

            callback({ id: producer.id }); // Successfully created producer, inform client

            // Inform other consumers (local)
            informConsumers(peers.get(socket.id).roomName, socket.id, producer.id);

            // Try piping producer to remote server if enabled and handshake is complete
            if (pipeConfig.pipeRemoteEnabled) {
              const remoteRouterId = pipeConfig.remoteRouterIds.get(pipeConfig.targetServerId);
              if (remoteRouterId) {
                  logger.info(`Handshake complete, attempting immediate pipe for producer ${producer.id}`);
                  // Asynchronously pipe and log errors, client already notified of producer creation
                  pipeProducerToRemote(producer, peers.get(socket.id).roomName, socket.id).catch(pipeError => {
                      logger.error(`Piping attempt failed for producer ${producer.id} after successful creation: %s`, pipeError);
                  });
              } else {
                  logger.info(`Handshake not yet complete for ${pipeConfig.targetServerId}, delaying pipe attempt for producer ${producer.id}`);
                  // Rely on handleRouterHandshakeAck to trigger the pipe later
              }
            }
          } catch (error) { // Catch errors from getTransport, transport.produce(), addProducer, etc.
            process.stdout.write(`!!! STDOUT_WRITE_SSRC_DEBUG !!! Error for socket ${socket.id}, kind ${kind}: ${error.message}\n`);
            if (error.message && error.message.toLowerCase().includes("ssrc")) {
              process.stdout.write(`!!! STDOUT_WRITE_SSRC_CONFLICT_DETECTED !!! SSRC: ${error.message}\n`);
            }
            // Also try a simple console.log as a fallback test
            console.log(`!!! FALLBACK_CONSOLE_LOG_SSRC_DEBUG !!! Error for socket ${socket.id}, kind ${kind}: ${error.message}`);

            // Ensure client gets an error in the format it expects, only if callback hasn't been successfully called yet
            if (typeof callback.called === 'undefined' || !callback.called) {
                 callback({ error: `Server-side producer creation failed: ${error.message}` });
                 callback.called = true; // Mark as called to prevent multiple calls
            }
          }
        }
      );

      socket.on("getProducers", (callback) => {
        try {
          const roomName = peers.get(socket.id)?.roomName;
          if (!roomName) {
            callback([]);
            return;
          }

          let producerList = [];
          producers.forEach((producerData) => {
            if (
              producerData.socketId !== socket.id &&
              producerData.roomName === roomName
            ) {
              producerList = [...producerList, producerData.producer.id];
            }
          });

          logger.debug(
            "Returning %d producers to peer %s",
            producerList.length,
            socket.id
          );
          callback(producerList);
        } catch (error) {
          logger.error("Get producers error: %s", error.message);
          callback({ error: error.message });
        }
      });

      socket.on(
        "transport-recv-connect",
        async ({ dtlsParameters, serverConsumerTransportId, transportId }) => {
          try {
            logger.info(`Received transport-recv-connect for transportId ${transportId || serverConsumerTransportId}`);
            
            // Use transportId if provided, otherwise fall back to serverConsumerTransportId
            const actualTransportId = transportId || serverConsumerTransportId;
            
            const transportData = transports.find(
              (transportData) =>
                transportData.transport.id === actualTransportId
            );
            
            if (!transportData || !transportData.transport) {
              const errorMsg = `Consumer transport ${actualTransportId} not found`;
              logger.error(errorMsg);
              return socket.emit("transport-connect-failed", { 
                id: actualTransportId, 
                error: errorMsg 
              });
            }
            
            const consumerTransport = transportData.transport;
            
            logger.debug(
              `Connecting consumer transport ${actualTransportId} with DTLS parameters`
            );
            
            await consumerTransport.connect({ dtlsParameters });
            
            logger.info(
              `Consumer transport ${actualTransportId} connected successfully`
            );
            
            // Notify the client of successful connection
            socket.emit("transport-connected", { 
              id: actualTransportId
            });
            
            // Also emit the old style notification for backward compatibility
            socket.emit("transport-recv-connect-done", { id: actualTransportId });
          } catch (error) {
            const actualTransportId = transportId || serverConsumerTransportId;
            logger.error(`Transport receive connect error: ${error.message}`);
            
            // Emit both new and old style error notifications
            socket.emit("transport-connect-failed", { 
              id: actualTransportId, 
              error: error.message 
            });
            socket.emit("transport-recv-connect-failed", { 
              error: error.message 
            });
          }
        }
      );

      socket.on(
        "consume",
          async (
            { rtpCapabilities, remoteProducerId, serverConsumerTransportId },
            callback
          ) => {
            // Log received parameters for 'consume' event
            logger.debug(`'consume' event received for socket: ${socket.id}`);
            logger.debug(`  remoteProducerId: ${remoteProducerId}`);
            logger.debug(`  serverConsumerTransportId: ${serverConsumerTransportId}`);
            logger.debug(`  rtpCapabilities: %o`, rtpCapabilities);
          try {

            const roomName = peers.get(socket.id).roomName;
            const consumerTransport = transports.find(
              (transportData) =>
                transportData.transport.id === serverConsumerTransportId
            )?.transport;

            if (!consumerTransport) {
              logger.error(`CONSUME_HANDLER: Transport not found. Requested serverConsumerTransportId: ${serverConsumerTransportId} for socket ${socket.id}.`);
              logger.error(`CONSUME_HANDLER: Current transports on server: %o`, transports.map(t => ({ id: t.transport.id, socketId: t.socketId, consumer: t.consumer }) ));
              return callback({ error: `Transport ${serverConsumerTransportId} not found` });
            }

            // Check if rtpCapabilities is valid before calling canConsume
            if (!rtpCapabilities || typeof rtpCapabilities !== 'object' || Object.keys(rtpCapabilities).length === 0) {
                logger.error(`Invalid or empty rtpCapabilities received from client ${socket.id}: %o`, rtpCapabilities);
                return callback({ error: "Invalid rtpCapabilities provided" });
            }
            
            if (
              !router.canConsume({
                producerId: remoteProducerId,
                rtpCapabilities,
              })
            ) {
              logger.warn(`CONSUME_HANDLER: router.canConsume returned false for producer ${remoteProducerId} by socket ${socket.id}.`);
              logger.warn(`  Provided rtpCapabilities: %o`, rtpCapabilities);
              logger.warn(`  Router's rtpCapabilities: %o`, router.rtpCapabilities);
              return callback({ error: "Cannot consume this producer with the provided rtpCapabilities" });
            }

            // Find the producer to check if it's piped
            const producerData = producers.find(
              (p) => p.producer.id === remoteProducerId
            );
            if (!producerData) {
              throw new Error("Producer not found");
            }

            const isPiped = producerData.isPiped === true;
            logger.debug(
              `Consuming producer ${remoteProducerId} (isPiped: ${isPiped})`
            );

            const consumer = await consumerTransport.consume({
              producerId: remoteProducerId,
              rtpCapabilities,
              paused: true,
            });

            logger.debug(
              "Consumer %s created for peer %s, producer: %s",
              consumer.id,
              socket.id,
              remoteProducerId
            );

            // Store consumer
            consumers.push({
              socketId: socket.id,
              consumer,
              roomName,
              isPiped,
            });

            // Add this consumer to the peer's consumer list
            const peer = peers.get(socket.id);
            if (peer) {
              peer.consumers.push(consumer.id);
            }

            // Event handlers
            consumer.on("transportclose", () => {
              logger.debug(
                "Consumer transport closed for consumer %s",
                consumer.id
              );
              consumer.close();
              consumers = consumers.filter(
                (consumerData) => consumerData.consumer.id !== consumer.id
              );
            });

            consumer.on("producerclose", () => {
              logger.debug(
                "Producer closed for consumer %s, producer: %s",
                consumer.id,
                remoteProducerId
              );
              socket.emit("producer-closed", { remoteProducerId });
              consumer.close();
              consumers = consumers.filter(
                (consumerData) => consumerData.consumer.id !== consumer.id
              );
            });

            // Return consumer info to client with isPiped flag
            callback({
              id: consumer.id,
              producerId: remoteProducerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters,
              type: consumer.type,
              producerPaused: consumer.producerPaused,
              serverConsumerId: consumer.id,
              isPiped: isPiped,
            });
          } catch (error) {
            logger.error("Error in consume request: %s", error.message);
            callback({ error: error.message });
          }
        }
      );

      socket.on("consumer-resume", async ({ serverConsumerId }) => {
        try {
          const { consumer } = consumers.find(
            (consumerData) => consumerData.consumer.id === serverConsumerId
          );
          if (!consumer) {
            throw new Error("Consumer not found");
          }
          await consumer.resume();
          logger.debug("Consumer %s resumed", serverConsumerId);
        } catch (error) {
          logger.error("Consumer resume error: %s", error.message);
        }
      });

      socket.on("consumer-pause", async ({ serverConsumerId }) => {
        try {
          const { consumer } = consumers.find(
            (consumerData) => consumerData.consumer.id === serverConsumerId
          );
          if (!consumer) {
            throw new Error("Consumer not found");
          }
          await consumer.pause();
          logger.debug("Consumer %s paused", serverConsumerId);
        } catch (error) {
          logger.error("Consumer pause error: %s", error.message);
        }
      });

      socket.on("producer-pause", async ({ producerId }) => {
        try {
          const producer = producers.find(
            (p) => p.producer.id === producerId
          )?.producer;
          if (!producer) {
            throw new Error("Producer not found");
          }
          await producer.pause();
          logger.debug("Producer %s paused", producerId);
        } catch (error) {
          logger.error("Producer pause error: %s", error.message);
        }
      });

      socket.on("producer-resume", async ({ producerId }) => {
        try {
          const producer = producers.find(
            (p) => p.producer.id === producerId
          )?.producer;
          if (!producer) {
            throw new Error("Producer not found");
          }
          await producer.resume();
          logger.debug("Producer %s resumed", producerId);
        } catch (error) {
          logger.error("Producer resume error: %s", error.message);
        }
      });

      // Screen sharing
      socket.on("producer-start-screen-share", async ({ producerId }) => {
        const roomName = peers.get(socket.id)?.roomName;
        if (roomName) {
          socket
            .to(roomName)
            .emit("producer-started-screen-share", { producerId });
          logger.info(
            "Producer %s started screen sharing in room %s",
            producerId,
            roomName
          );
        }
      });

      socket.on("producer-stop-screen-share", async ({ producerId }) => {
        const roomName = peers.get(socket.id)?.roomName;
        if (roomName) {
          socket
            .to(roomName)
            .emit("producer-stopped-screen-share", { producerId });
          logger.info(
            "Producer %s stopped screen sharing in room %s",
            producerId,
            roomName
          );
        }
      });

      socket.on("disconnect", () => {
        logger.info("Peer disconnected: %s", socket.id);
        const roomName = peers.get(socket.id)?.roomName;

        // Remove from room
        if (roomName) {
          rooms.get(roomName)?.peers.delete(socket.id);
          if (rooms.get(roomName)?.peers.size === 0) {
            rooms.delete(roomName);
            logger.info("Room %s deleted (no peers remaining)", roomName);
          }
        }

        // Close all consumers
        consumers.forEach((consumerData) => {
          if (consumerData.socketId === socket.id) {
            consumerData.consumer.close();
            socket
              .to(roomName)
              .emit("producer-closed", {
                remoteProducerId: consumerData.consumer.producerId,
              });
          }
        });

        // Close all producers
        producers.forEach((producerData) => {
          if (producerData.socketId === socket.id) {
            producerData.producer.close();
          }
        });

        // Close transports
        transports.forEach((transportData) => {
          if (transportData.socketId === socket.id) {
            transportData.transport.close();
          }
        });

        // Remove from peers
        peers.delete(socket.id);

        // Clean up arrays
        producers = producers.filter(
          (producerData) => producerData.socketId !== socket.id
        );
        consumers = consumers.filter(
          (consumerData) => consumerData.socketId !== socket.id
        );
        transports = transports.filter(
          (transportData) => transportData.socketId !== socket.id
        );
      });

      // Add a new socket event handler for keyframe requests
      socket.on("request-keyframe", async ({ producerId, isPipeProducer }) => {
        try {
          logger.debug(`Received 'request-keyframe' for producer ${producerId} (client thinks isPiped: ${isPipeProducer})`);

          // Find producer data in your application's state
          const producerData = producers.find((p) => p.producer.id === producerId);
          if (!producerData) {
            logger.warn(`Keyframe request: Producer data not found for ID ${producerId}`);
            socket.emit('keyframe-request-failed', { 
              producerId, 
              error: 'Producer not found' 
            });
            return;
          }

          // Get the actual Mediasoup producer object
          const actualProducerObject = await getActualMediasoupProducerById(producerId);

          if (!actualProducerObject) {
            logger.warn(`Keyframe request: Actual producer object not found for ID ${producerId}`);
            socket.emit('keyframe-request-failed', { 
              producerId, 
              error: 'Producer object not found' 
            });
            return;
          }

          if (producerData.isPiped || producerData.socketId.startsWith('remote-')) {
            // This is a piped producer - we need to forward request to origin server
            logger.debug(`Forwarding keyframe request for piped producer ${producerId} to origin server`);
            
            // Find the origin server ID
            const originServerId = producerData.originServerId || pipeConfig.targetServerId;
            
            if (pipeConfig.wsConfig.connections.has(originServerId)) {
              try {
                // Send the request to origin server
                pipeContext.webSocketService.sendMessage(originServerId, {
                  type: 'request_origin_keyframe',
                  producerId: producerId,
                  roomName: producerData.roomName
                });
                socket.emit('keyframe-request-forwarded', { producerId });
                
                // Also try to request a keyframe locally as a fallback
                // This might work if the producer has been properly piped
                if (actualProducerObject && typeof actualProducerObject.requestKeyFrame === 'function') {
                  logger.debug(`Also trying local keyframe for piped producer ${producerId} as backup`);
                  try {
                    await actualProducerObject.requestKeyFrame();
                  } catch (err) {
                    logger.debug(`Expected: Local keyframe request failed for piped producer: ${err.message}`);
                  }
                }
              } catch (fwdError) {
                logger.error(`Error forwarding keyframe request: ${fwdError.message}`);
                socket.emit('keyframe-request-failed', { 
                  producerId, 
                  error: `Forwarding failed: ${fwdError.message}` 
                });
              }
            } else {
              logger.warn(`Cannot forward keyframe request: No connection to origin server ${originServerId}`);
              
              // Try local method as fallback if we can't forward
              if (actualProducerObject && typeof actualProducerObject.requestKeyFrame === 'function') {
                logger.debug(`Trying local keyframe as fallback for piped producer ${producerId}`);
                try {
                  await actualProducerObject.requestKeyFrame();
                  socket.emit('keyframe-requested', { producerId });
                } catch (err) {
                  logger.error(`Fallback keyframe request failed: ${err.message}`);
                  socket.emit('keyframe-request-failed', { 
                    producerId, 
                    error: `No connection to origin server and fallback failed: ${err.message}` 
                  });
                }
              } else {
                socket.emit('keyframe-request-failed', { 
                  producerId, 
                  error: 'No connection to origin server and no fallback available' 
                });
              }
            }
          } else if (actualProducerObject && typeof actualProducerObject.requestKeyFrame === 'function') {
            // This is a local producer - we can request keyframe directly
            logger.debug(`Requesting keyframe for local producer ${producerId}`);
            try {
              await actualProducerObject.requestKeyFrame();
              socket.emit('keyframe-requested', { producerId });
              logger.debug(`Keyframe successfully requested for producer ${producerId}`);
            } catch (err) {
              logger.error(`Error requesting keyframe: ${err.message}`);
              socket.emit('keyframe-request-failed', { 
                producerId, 
                error: `Request failed: ${err.message}` 
              });
            }
          } else {
            logger.warn(`Cannot fulfill keyframe request for producer ${producerId}: No valid producer or method`);
            socket.emit('keyframe-request-failed', { 
              producerId, 
              error: 'No valid requestKeyFrame method available' 
            });
          }
        } catch (error) {
          logger.error(`Error handling keyframe request for producer ${producerId}: ${error}`);
          socket.emit('keyframe-request-failed', { 
            producerId, 
            error: error.message 
          });
        }
      });

      // Add a handler for ICE candidates 
      socket.on("ice-candidate", async ({ transportId, candidate }) => {
        try {
          logger.debug(`Received ICE candidate for transport ${transportId}`);
          
          // Find the transport
          const transportData = transports.find(
            (t) => t.transport.id === transportId && t.socketId === socket.id
          );
          
          if (!transportData || !transportData.transport) {
            logger.warn(`Cannot find transport ${transportId} for ICE candidate`);
            return;
          }
          
          const transport = transportData.transport;
          
          // Add the ICE candidate
          await transport.addIceCandidate(candidate);
          logger.debug(`Added ICE candidate to transport ${transportId}`);
        } catch (error) {
          logger.error(`Error adding ICE candidate to transport: ${error.message}`);
        }
      });
      
      // Add handler for client DTLS failure notifications
      socket.on("client-dtls-failure", ({ transportId, state }) => {
        logger.warn(`Client reported DTLS ${state} for transport ${transportId}`);
        
        // Find the transport
        const transportData = transports.find(
          (t) => t.transport.id === transportId && t.socketId === socket.id
        );
        
        if (!transportData || !transportData.transport) {
          logger.warn(`Cannot find transport ${transportId} for DTLS failure`);
          return;
        }
        
        // Log the DTLS state from server perspective
        const transport = transportData.transport;
        logger.info(`Server perspective: transport ${transportId} DTLS state is ${transport.dtlsState}`);
      });
      
      // Add handler for consumer DTLS failures
      socket.on("client-consumer-dtls-failure", ({ transportId, producerId }) => {
        logger.warn(`Client reported consumer DTLS failure for transport ${transportId}, producer ${producerId}`);
        
        // Find the transport
        const transportData = transports.find(
          (t) => t.transport.id === transportId && t.socketId === socket.id
        );
        
        if (!transportData || !transportData.transport) {
          logger.warn(`Cannot find consumer transport ${transportId}`);
          return;
        }
        
        // Try to repair or recreate the consumer
        try {
          // Find the consumer for this producer
          const consumerData = consumers.find(
            (c) => c.consumer.producerId === producerId && c.socketId === socket.id
          );
          
          if (consumerData) {
            logger.info(`Requesting keyframe for producer ${producerId} to recover consumer ${consumerData.consumer.id}`);
            // Request a keyframe to potentially recover
            const producer = producers.find((p) => p.producer.id === producerId)?.producer;
            if (producer && typeof producer.requestKeyFrame === 'function') {
              producer.requestKeyFrame();
            }
          }
        } catch (error) {
          logger.error(`Error handling consumer DTLS failure: ${error.message}`);
        }
      });
    });

    // Clean up function for when the server shuts down
    const cleanup = () => {
      logger.info("Cleaning up server resources...");

      // Close WebSocket server
      if (wsServer) {
        wsServer.close();
      }

      // Close WebSocket client connections
      pipeConfig.wsConfig.connections.forEach((ws, serverId) => {
        logger.info(`Closing WebSocket connection to server ${serverId}`);
        ws.close();
      });

      // Clear pending notifications
      pipeConfig.pendingNotifications.clear();

      // Close mediasoup resources
      if (router && !router.closed) {
        router.close();
      }

      if (worker && !worker.closed) {
        worker.close();
      }
    };

    // Handle process termination
    process.on("SIGINT", () => {
      logger.info("Received SIGINT signal");
      cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM signal");
      cleanup();
      process.exit(0);
    });
  };
