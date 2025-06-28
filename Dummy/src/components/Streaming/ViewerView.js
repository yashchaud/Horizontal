import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const ViewerView = () => {
  const [socket, setSocket] = useState(null);
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const videoRef = useRef();
  const audioRef = useRef();
  const isMounted = useRef(true);
  const consumingTransports = useRef([]);
  const trackingConsumer = useRef(new Set());
  const [consumerTransports, setConsumerTransports] = useState([]);
  const [consumers, setConsumers] = useState(new Map());
  const [consumerTracks, setConsumerTracks] = useState([]);
  const [roomName] = useState('default-room');

  useEffect(() => {
    console.log("Attempting to connect to consumer socket...");
    
    const newSocket = io('https://localhost:3001', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      secure: true,
      rejectUnauthorized: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 60000,
      query: { role: 'consumer' },
      upgrade: true,
      rememberUpgrade: true,
      forceNew: true,
      withCredentials: true,
      autoConnect: true
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setConnectionError(error.message);
      if (error.message.includes('websocket')) {
        console.log("Falling back to polling transport");
        newSocket.io.opts.transports = ['polling', 'websocket'];
      }
    });

    newSocket.on("connect", () => {
      console.log(`Consumer socket connected ${newSocket.id}`);
      setConnectionError(null);
      setIsConnected(true);
      joinRoom();
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        newSocket.connect();
      }
    });

    newSocket.on("connection-success", async ({ socketId }) => {
      console.log("Consumer connection success:", socketId);
    });

    const joinRoom = async () => {
      console.log("Joining room:", roomName);
      newSocket.emit("joinRoom", { roomName }, async ({ Routers, producerList, error }) => {
        console.log("Join room response:", { Routers, producerList, error });
        if (error) {
          console.error("Error joining room:", error);
          setConnectionError(error);
          return;
        }

        try {
          if (!Routers || !Routers[0]) {
            console.error("No router capabilities received");
            setConnectionError("No router capabilities received");
            return;
          }

          console.log("Got router RTP capabilities:", Routers[0]);
          const newDevice = await loadDevice(Routers[0]);
          
          // Get existing producers
          console.log("Requesting producer list...");
          newSocket.emit("getProducers", (producerIds) => {
            console.log("Received producer list:", producerIds);
            if (Array.isArray(producerIds)) {
              producerIds.forEach(id => {
                console.log("Checking producer:", id);
                if (!trackingConsumer.current.has(id)) {
                  console.log("Creating consumer transport for producer:", id);
                  signalNewConsumerTransport(id);
                } else {
                  console.log("Already tracking producer:", id);
                }
              });
            } else {
              console.error("Invalid producer list received:", producerIds);
            }
          });
        } catch (err) {
          console.error("Error in join room process:", err);
          setConnectionError(err.message);
        }
      });
    };

    const loadDevice = async (routerRtpCapabilities) => {
      try {
        console.log("Creating mediasoup device...");
        const newDevice = new mediasoupClient.Device();
        
        console.log("Loading device with capabilities:", routerRtpCapabilities);
        await newDevice.load({ routerRtpCapabilities });
        
        console.log("Device loaded successfully");
        setDevice(newDevice);
        return newDevice;
      } catch (error) {
        console.error("Failed to load device:", error);
        setConnectionError("Failed to load media device: " + error.message);
        throw error;
      }
    };

    const signalNewConsumerTransport = async (remoteProducerId) => {
      console.log("Signaling new consumer transport for producer:", remoteProducerId);
      
      if (consumingTransports.current.includes(remoteProducerId)) {
        console.log("Already consuming producer:", remoteProducerId);
        return;
      }

      if (!device?.canConsume) {
        console.error("Device cannot consume - not loaded properly");
        return;
      }

      consumingTransports.current.push(remoteProducerId);
      trackingConsumer.current.add(remoteProducerId);

      console.log("Creating WebRTC transport...");
      await newSocket.emit('createWebRtcTransport', { consumer: true }, async ({ params }) => {
        console.log("Received transport params:", params);
        if (params.error) {
          console.error("Transport creation failed:", params.error);
          return;
        }

        let consumerTransport;
        try {
          console.log("Creating receive transport with params:", params);
          consumerTransport = device.createRecvTransport(params);
          setConsumerTransports(prev => [...prev, consumerTransport]);

          consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            console.log("Consumer transport connect event", dtlsParameters);
            try {
              await newSocket.emit('transport-recv-connect', {
                dtlsParameters,
                serverConsumerTransportId: params.id,
              });
              console.log("Transport receive connect success");
              callback();
            } catch (error) {
              console.error("Transport receive connect error:", error);
              errback(error);
            }
          });

          consumerTransport.on('connectionstatechange', async (state) => {
            console.log("Consumer transport state changed to", state);
            switch (state) {
              case 'connected':
                console.log("Consumer transport connected successfully");
                break;
              case 'failed':
                console.warn("Consumer transport connection failed");
                consumerTransport.close();
                break;
              default:
                break;
            }
          });

          await connectRecvTransport(consumerTransport, remoteProducerId, params.id);
        } catch (error) {
          console.error("Failed to create consumer transport:", error);
          setConnectionError("Transport creation failed: " + error.message);
        }
      });
    };

    const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
      console.log("Connecting receive transport...", {
        remoteProducerId,
        serverConsumerTransportId
      });

      await newSocket.emit('consume', {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
      }, async ({ params }) => {
        console.log("Consume response:", params);
        if (params.error) {
          console.error("Cannot consume:", params.error);
          return;
        }

        try {
          console.log("Creating consumer with params:", params);
          const consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters,
          });

          console.log("Consumer created successfully:", consumer.id);
          
          // Store consumer
          const newConsumers = new Map(consumers);
          newConsumers.set(remoteProducerId, consumer);
          setConsumers(newConsumers);

          // Handle consumer media
          const stream = new MediaStream([consumer.track]);
          console.log("Created MediaStream:", stream.id);
          setConsumerTracks(prev => [...prev, stream]);

          if (consumer.track.kind === 'video') {
            console.log("Setting up video consumer");
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              try {
                await videoRef.current.play();
                console.log("Video playing successfully");
              } catch (error) {
                console.error("Error playing video:", error);
              }
            }
          } else if (consumer.track.kind === 'audio') {
            console.log("Setting up audio consumer");
            if (audioRef.current) {
              audioRef.current.srcObject = stream;
              try {
                await audioRef.current.play();
                console.log("Audio playing successfully");
              } catch (error) {
                console.error("Error playing audio:", error);
              }
            }
          }

          console.log("Resuming consumer:", params.serverConsumerId);
          newSocket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId });
        } catch (error) {
          console.error("Error in consume process:", error);
          setConnectionError("Failed to consume stream: " + error.message);
        }
      });
    };

    // Handle new producers
    newSocket.on("new-producer", ({ producerId }) => {
      console.log('New producer available:', producerId);
      if (!trackingConsumer.current.has(producerId)) {
        signalNewConsumerTransport(producerId);
      }
    });

    // Handle producer closure
    newSocket.on("producer-closed", ({ remoteProducerId }) => {
      console.log("Producer closed:", remoteProducerId);
      
      if (consumers.has(remoteProducerId)) {
        console.log("Cleaning up consumer for producer:", remoteProducerId);
        const consumer = consumers.get(remoteProducerId);
        consumer.close();
        consumers.delete(remoteProducerId);
        setConsumers(new Map(consumers));
      }

      trackingConsumer.current.delete(remoteProducerId);
      consumingTransports.current = consumingTransports.current.filter(id => id !== remoteProducerId);
      setConsumerTracks(prev => prev.filter(track => track.id !== remoteProducerId));
    });

    setSocket(newSocket);

    return () => {
      console.log("Cleaning up viewer component...");
      isMounted.current = false;

      if (newSocket) {
        newSocket.removeAllListeners();
        newSocket.close();
      }

      consumers.forEach(consumer => {
        try {
          consumer.close();
        } catch (error) {
          console.error("Error closing consumer:", error);
        }
      });

      consumerTransports.forEach(transport => {
        try {
          transport.close();
        } catch (error) {
          console.error("Error closing transport:", error);
        }
      });

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (audioRef.current?.srcObject) {
        audioRef.current.srcObject.getTracks().forEach(track => track.stop());
        audioRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <div className="viewer-view">
      <h2>Viewer View</h2>
      {connectionError && (
        <div className="error-message" style={{ color: 'red', margin: '10px 0' }}>
          Connection Error: {connectionError}
        </div>
      )}
      <div className="connection-status" style={{ margin: '10px 0' }}>
        Status: {isConnected ? 'Connected' : 'Disconnected'}
      </div>
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: '100%', maxWidth: '800px' }}
        />
        <audio ref={audioRef} autoPlay playsInline />
      </div>
      <div className="stream-info" style={{ margin: '10px 0' }}>
        {consumerTracks.length > 0 ? (
          <p>Consuming {consumerTracks.length} stream(s)</p>
        ) : (
          <p>No streams available</p>
        )}
      </div>
    </div>
  );
};

export default ViewerView; 