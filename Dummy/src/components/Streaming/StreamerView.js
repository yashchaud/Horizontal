import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const StreamerView = () => {
  const [socket, setSocket] = useState(null);
  const [device, setDevice] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [videoProducer, setVideoProducer] = useState(null);
  const [audioProducer, setAudioProducer] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamId, setStreamId] = useState('');
  const videoRef = useRef();
  const isMounted = useRef(false);
  const [localStream, setLocalStream] = useState(null);
  const [rtpCapabilities, setRtpCapabilities] = useState(null);
  const [audioProducerCreated, setAudioProducerCreated] = useState(false);
  const [videoProducerCreated, setVideoProducerCreated] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  let params = {
    encodings: [
      {
        rid: "r0",
        maxBitrate: 100000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "S1T3",
      },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };

  useEffect(() => {
    console.log("Attempting to connect to producer socket...");
    isMounted.current = true;

    const newSocket = io('https://localhost:3001', {
      path: '/socket.io',
      namespace: '/producer',
      transports: ['websocket', 'polling'],
      secure: true,
      rejectUnauthorized: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 60000,
      query: { role: 'producer' },
      upgrade: true,
      rememberUpgrade: true,
      forceNew: true,
      withCredentials: true,
      autoConnect: true
    });

    if (isMounted.current) {
      newSocket.removeAllListeners();

      newSocket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        setConnectionError(error.message);
        
        if (error.message.includes('websocket')) {
          console.log("Falling back to polling transport");
          newSocket.io.opts.transports = ['polling', 'websocket'];
        }
      });

      newSocket.on("connect", () => {
        console.log(`Producer socket connected ${newSocket.id}`);
        setConnectionError(null);
        getLocalStream();
      });

      newSocket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
        if (reason === 'io server disconnect') {
          newSocket.connect();
        }
      });

      const getLocalStream = () => {
        navigator.mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 44100,
              sampleSize: 16,
            },
            video: {
              width: {
                min: 640,
                max: 1920,
              },
              height: {
                min: 400,
                max: 1080,
              },
              frameRate: {
                min: 15,
                max: 30,
              },
            },
          })
          .then((stream) => {
            console.log("Got local stream");
            setLocalStream(stream);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.className = `${stream.id}`;
            }
            streamSuccess(stream);
          })
          .catch((error) => {
            console.error("Error getting local stream:", error);
            setConnectionError("Failed to access camera/microphone: " + error.message);
          });
      };

      const streamSuccess = (stream) => {
        const audioParams = { track: stream.getAudioTracks()[0], ...params };
        const videoParams = { track: stream.getVideoTracks()[0], ...params };
        joinRoom(audioParams, videoParams);
      };

      const joinRoom = async (audioParams, videoParams) => {
        console.log("Joining room as producer");
        newSocket.emit("joinRoom", { roomName: "producer-room" }, async (data) => {
          console.log("Join room response:", data);
          if (data?.rtpCapabilities) {
            setRtpCapabilities(data.rtpCapabilities);
            await createDevice(data.rtpCapabilities, audioParams, videoParams);
          } else {
            console.error("No RTP capabilities received");
            setConnectionError("Failed to get RTP capabilities from server");
          }
        });
      };

      const createDevice = async (rtpCapabilities, audioParams, videoParams) => {
        try {
          const newDevice = new mediasoupClient.Device();
          await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
          setDevice(newDevice);
          await createSendTransport(newDevice, audioParams, videoParams);
        } catch (error) {
          console.error("Error creating device:", error);
          setConnectionError("Failed to create media device: " + error.message);
        }
      };

      const createSendTransport = async (device, audioParams, videoParams) => {
        newSocket.emit("createWebRtcTransport", { consumer: false }, async ({ params }) => {
          if (params.error) {
            console.error(params.error);
            setConnectionError("Transport creation failed: " + params.error);
            return;
          }

          const transport = device.createSendTransport(params);

          transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
            try {
              await newSocket.emit("transport-connect", {
                dtlsParameters,
              });
              callback();
            } catch (error) {
              errback(error);
              setConnectionError("Transport connection failed: " + error.message);
            }
          });

          transport.on("produce", async (parameters, callback, errback) => {
            try {
              newSocket.emit(
                "transport-produce",
                {
                  kind: parameters.kind,
                  rtpParameters: parameters.rtpParameters,
                  appData: parameters.appData,
                },
                ({ id }) => {
                  callback({ id });
                }
              );
            } catch (error) {
              errback(error);
              setConnectionError("Media production failed: " + error.message);
            }
          });

          setProducerTransport(transport);
          await connectSendTransport(transport, audioParams, videoParams);
        });
      };

      const connectSendTransport = async (transport, audioParams, videoParams) => {
        try {
          if (!audioProducerCreated) {
            const audioProducer = await transport.produce(audioParams);
            setAudioProducer(audioProducer);
            setAudioProducerCreated(true);

            audioProducer.on("transportclose", () => {
              console.log("Audio transport closed");
              setAudioProducerCreated(false);
            });

            audioProducer.on("trackended", () => {
              console.log("Audio track ended");
              stopStreaming();
            });
          }

          if (!videoProducerCreated) {
            const videoProducer = await transport.produce(videoParams);
            setVideoProducer(videoProducer);
            setVideoProducerCreated(true);

            videoProducer.on("transportclose", () => {
              console.log("Video transport closed");
              setVideoProducerCreated(false);
            });

            videoProducer.on("trackended", () => {
              console.log("Video track ended");
              stopStreaming();
            });
          }

          setIsStreaming(true);
        } catch (error) {
          console.error("Error connecting send transport:", error);
          setConnectionError("Failed to start streaming: " + error.message);
        }
      };
    }

    setSocket(newSocket);

    return () => {
      console.log("Cleaning up producer component...");
      isMounted.current = false;
      
      if (newSocket) {
        newSocket.removeAllListeners();
        newSocket.close();
      }

      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      if (producerTransport) {
        try {
          producerTransport.close();
        } catch (error) {
          console.error("Error closing producer transport:", error);
        }
      }

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  const stopStreaming = () => {
    if (videoProducer) {
      videoProducer.close();
      setVideoProducer(null);
      setVideoProducerCreated(false);
    }
    if (audioProducer) {
      audioProducer.close();
      setAudioProducer(null);
      setAudioProducerCreated(false);
    }
    if (videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  };

  return (
    <div className="streamer-view">
      <h2>Streamer View</h2>
      {connectionError && (
        <div className="error-message" style={{ color: 'red', margin: '10px 0' }}>
          Connection Error: {connectionError}
        </div>
      )}
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', maxWidth: '800px' }}
        />
      </div>
      <div className="controls">
        {isStreaming ? (
          <button onClick={stopStreaming} className="stop-button">
            Stop Streaming
          </button>
        ) : (
          <div className="status">
            {connectionError ? "Connection failed" : "Ready to stream"}
          </div>
        )}
      </div>
    </div>
  );
};

export default StreamerView; 