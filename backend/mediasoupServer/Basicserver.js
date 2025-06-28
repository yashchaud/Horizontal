process.env.DEBUG = "mediasoup*";
const mediasoup = require("mediasoup");
const os = require("os");
// Import logger
const { logger } = require('./logger');

module.exports = async function (io) {
  let worker;
  let router;
  let rooms = new Map(); // { roomName1: { Router, peers: [ socketId1, ... ] }, ...}
  let peers = new Map(); // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,], consumers = [id1, id2,] }, ...}
  let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
  let producers = []; // [ { socketId1, roomName1, producer, }, ... ]
  let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]

  const videoEncodings = [
    { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
    { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
    { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" },
  ];

  const mediaCodecs = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {
        "x-google-start-bitrate": 1000,
      },
    },
  ];

  // Create a single worker
  worker = await mediasoup.createWorker({
    logLevel: "debug",
    logTags: ["rtp", "srtp", "rtcp"],
    rtcMinPort: 10000,
    rtcMaxPort: 10999,
  });

  worker.on("died", () => {
    logger.error("mediasoup worker died, exiting in 2 seconds... [pid:%d]", worker.pid);
    setTimeout(() => process.exit(1), 2000);
  });

  // Create router
  router = await worker.createRouter({ mediaCodecs });

  // Utility functions
  const createWebRtcTransport = async () => {
    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: "0.0.0.0",
          announcedIp: "127.0.0.1", // replace with your public IP
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1500000,
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
    const [transport] = transports.filter(
      transport => transport.socketId === socketId && !transport.consumer
    );
    return transport?.transport;
  };

  const informConsumers = (roomName, socketId, producerId) => {
    logger.info(`Informing consumers in room ${roomName} about new producer ${producerId}`);
    producers.forEach((producerData) => {
      if (producerData.socketId !== socketId && producerData.roomName === roomName) {
        const producerSocket = peers.get(producerData.socketId)?.socket;
        if (producerSocket) {
          producerSocket.emit("new-producer", { producerId });
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
      producers = [
        ...producers,
        { socketId: socket.id, producer, roomName },
      ];

      peers.get(socket.id).producers.push(producer.id);
    };

    const addConsumer = (consumer, roomName) => {
      consumers = [
        ...consumers,
        { socketId: socket.id, consumer, roomName },
      ];

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
          .filter(producer => producer.roomName === roomName)
          .map(producer => ({
            producerId: producer.producer.id,
            producerSocket: producer.socketId
          }));

        logger.debug("Returning %d producers to peer %s", producerList.length, socket.id);

        // Format response to match frontend expectations
        callback({
          Routers: [router.rtpCapabilities],
          Currentindex: 0,
          producerList
        });
      } catch (error) {
        logger.error("Error joining room: %s", error.message);
        callback({ 
          error: error.message,
          Routers: [],
          Currentindex: 0,
          producerList: []
        });
      }
    });

    socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
      try {
        const transport = await createWebRtcTransport();

        addTransport(transport, peers.get(socket.id).roomName, consumer);
        logger.debug("Created WebRTC transport %s for peer %s", transport.id, socket.id);

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

    socket.on("transport-connect", ({ dtlsParameters }) => {
      try {
        const transport = getTransport(socket.id);
        if (!transport) {
          throw new Error("Transport not found");
        }
        transport.connect({ dtlsParameters });
        logger.debug("Transport %s connected for peer %s", transport.id, socket.id);
      } catch (error) {
        logger.error("Transport connect error: %s", error.message);
      }
    });

    socket.on("transport-produce", async ({ kind, rtpParameters, appData }, callback) => {
      try {
        const transport = getTransport(socket.id);
        if (!transport) {
          throw new Error("Transport not found");
        }

        let producer;
        if (kind === "video") {
          producer = await transport.produce({
            kind,
            rtpParameters,
            encodings: videoEncodings,
            codecOptions: {
              videoGoogleStartBitrate: 1000
            },
            appData
          });
        } else {
          producer = await transport.produce({
            kind,
            rtpParameters,
            appData
          });
        }

        const roomName = peers.get(socket.id).roomName;
        addProducer(producer, roomName);

        informConsumers(roomName, socket.id, producer.id);
        logger.info("Producer %s created for peer %s, kind: %s", producer.id, socket.id, kind);

        producer.on("transportclose", () => {
          logger.debug("Producer transport closed for producer %s", producer.id);
          producer.close();
        });

        producer.on("score", (score) => {
          logger.debug("Producer %s score: %j", producer.id, score);
        });

        callback({ id: producer.id });
      } catch (error) {
        logger.error("Transport produce error: %s", error.message);
        callback({ error: error.message });
      }
    });

    socket.on("getProducers", (callback) => {
      try {
        const roomName = peers.get(socket.id)?.roomName;
        if (!roomName) {
          callback([]);
          return;
        }

        let producerList = [];
        producers.forEach((producerData) => {
          if (producerData.socketId !== socket.id && producerData.roomName === roomName) {
            producerList = [...producerList, producerData.producer.id];
          }
        });

        logger.debug("Returning %d producers to peer %s", producerList.length, socket.id);
        callback(producerList);
      } catch (error) {
        logger.error("Get producers error: %s", error.message);
        callback({ error: error.message });
      }
    });

    socket.on("transport-recv-connect", async ({ dtlsParameters, serverConsumerTransportId }) => {
      try {
        const consumerTransport = transports.find(
          transportData => transportData.transport.id === serverConsumerTransportId
        )?.transport;
        if (!consumerTransport) {
          throw new Error("Consumer transport not found");
        }
        await consumerTransport.connect({ dtlsParameters });
        logger.debug("Consumer transport %s connected", serverConsumerTransportId);
      } catch (error) {
        logger.error("Transport receive connect error: %s", error.message);
      }
    });

    socket.on("consume", async ({ rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) => {
      try {
        const roomName = peers.get(socket.id).roomName;
        const consumerTransport = transports.find(
          transportData => transportData.transport.id === serverConsumerTransportId
        )?.transport;

        if (!consumerTransport) {
          throw new Error("Transport not found");
        }

        if (!router.canConsume({ producerId: remoteProducerId, rtpCapabilities })) {
          throw new Error("Cannot consume");
        }

        const consumer = await consumerTransport.consume({
          producerId: remoteProducerId,
          rtpCapabilities,
          paused: true,
        });

        logger.debug("Consumer %s created for peer %s, producer: %s", consumer.id, socket.id, remoteProducerId);

        consumer.on("transportclose", () => {
          logger.debug("Consumer transport closed for consumer %s", consumer.id);
          consumer.close();
        });

        consumer.on("producerclose", () => {
          logger.debug("Producer closed for consumer %s, producer: %s", consumer.id, remoteProducerId);
          socket.emit("producer-closed", { remoteProducerId });
          consumer.close();
          consumers = consumers.filter(
            consumerData => consumerData.consumer.id !== consumer.id
          );
        });

        consumer.on("producerpause", () => {
          logger.debug("Producer paused for consumer %s, producer: %s", consumer.id, remoteProducerId);
          socket.emit("producer-paused", { remoteProducerId });
        });

        consumer.on("producerresume", () => {
          logger.debug("Producer resumed for consumer %s, producer: %s", consumer.id, remoteProducerId);
          socket.emit("producer-resumed", { remoteProducerId });
        });

        consumer.on("score", (score) => {
          logger.debug("Consumer %s score: %j", consumer.id, score);
        });

        addConsumer(consumer, roomName);

        callback({
          params: {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
            producerPaused: consumer.producerPaused
          },
        });
      } catch (error) {
        logger.error("Consume error: %s", error.message);
        callback({ error: error.message });
      }
    });

    socket.on("consumer-resume", async ({ serverConsumerId }) => {
      try {
        const { consumer } = consumers.find(
          consumerData => consumerData.consumer.id === serverConsumerId
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
          consumerData => consumerData.consumer.id === serverConsumerId
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
        const producer = producers.find(p => p.producer.id === producerId)?.producer;
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
        const producer = producers.find(p => p.producer.id === producerId)?.producer;
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
        socket.to(roomName).emit("producer-started-screen-share", { producerId });
        logger.info("Producer %s started screen sharing in room %s", producerId, roomName);
      }
    });

    socket.on("producer-stop-screen-share", async ({ producerId }) => {
      const roomName = peers.get(socket.id)?.roomName;
      if (roomName) {
        socket.to(roomName).emit("producer-stopped-screen-share", { producerId });
        logger.info("Producer %s stopped screen sharing in room %s", producerId, roomName);
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
          socket.to(roomName).emit("producer-closed", { remoteProducerId: consumerData.consumer.producerId });
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
      producers = producers.filter(producerData => producerData.socketId !== socket.id);
      consumers = consumers.filter(consumerData => consumerData.socketId !== socket.id);
      transports = transports.filter(transportData => transportData.socketId !== socket.id);
    });
  });
}; 