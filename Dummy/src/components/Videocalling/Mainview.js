import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import io from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
import Videocomponents from "./videocomponents";
import webcam from "@images/webcam.svg";
import webcamon from "@images/webcamon.svg";
import screenshare from "@images/screenshare.svg";
import screenshareoff from "@images/stopscreenshare.svg";
import micenable from "@images/micenable.svg";
import micdisable from "@images/micdisable.svg";
import calldisconnect from "@images/calldisconnect.svg";
import webcamona from "@images/webcamona.svg";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useParams } from "react-router-dom";
import Leftarrow from "@images/leftarrow.svg";
import { useSelector, useDispatch } from "react-redux";
import { settogglesidebar } from "@/Redux/sessionSlice";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@ui/button";

const socket = io("https://localhost:3002", { 
  secure: true,
  rejectUnauthorized: false,
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

const requestKeyframe = (producerId) => {
  console.log(`Requesting keyframe for producer ${producerId}`);
  if (socket && socket.connected) {
    socket.emit("request-keyframe", { producerId });
    return "Keyframe request sent";
  }
  return "Socket not connected";
};

export const requestKeyframeForProducer = requestKeyframe;

const Mainview = () => {
  const dispatch = useDispatch();
  const isMounted = useRef(false);
  const [rtpCapabilities, SetrtpCapabilities] = useState();
  const [audioProducerCreated, setAudioProducerCreated] = useState(false);
  const [videoProducerCreated, setVideoProducerCreated] = useState(false);
  const [peers, Setpeers] = useState([]);
  const [Routers, Setrouters] = useState([]);
  const [RouterId, SetRouterId] = useState(0);
  const [ProducerRouter, SetproducerRouter] = useState([]);
  const [trackingprodu, settrackingprodu] = useState([]);
  const [consumerTracks, setConsumerTracks] = useState([]);
  const Trackingconsumer = useRef(new Set());
  const [consumerTrackIds, setconsumerTrackIds] = useState(new Map());
  const [screenProducer, setScreenProducer] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const producerTransportRef = useRef(null);
  const signalingServerRef = useRef(null);
  const [Selftrack, setSelftrack] = useState();
  const localVideoRef = useRef();
  const [iswebcam, setiswebcam] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [Disconnected, setDisconnected] = useState(false);
  const container = useRef();
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Extract room name from URL parameters
  const { id, channelId } = useParams();
  const roomName = channelId.toString() || "default-room";

  let device;
  let producerTransport;
  let consumerTransports = useRef([]);
  let audioProducer;
  let videoProducer;
  let consumer;
  let isProducer = false;
  let params = {
    // mediasoup params
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

  let audioParams;
  let videoParams = { params };
  let consumingTransports = [];

  // Add buffers for ICE candidates
  let producerIceCandidatesQueue = [];
  let consumerIceCandidatesMap = new Map(); // Map of transportId -> candidate array
  let connectedTransports = new Set();

  useEffect(() => {
    console.log(Selftrack);
  }, [Selftrack]);

  useEffect(() => {
    console.log("Attempting to connect to socket...");
    isMounted.current = true;

    if (isMounted.current) {
      socket.off("connect");
      socket.off("connection-success");
      socket.off("new-producer");
      socket.off("new-screen-share");
      socket.off("new-producer-piped");
      socket.off("producer-closed");
      socket.off("ice-candidate");
      socket.off("transport-connected");
      socket.off("transport-connect-failed");

      // Add debug listeners for transport events
      socket.on("transport-connected", (data) => {
        console.log("✅ Transport connected successfully:", data);
      });

      socket.on("transport-connect-failed", (data) => {
        console.error("❌ Transport connect failed:", data);
      });

      socket.on("transport-recv-connect-done", (data) => {
        console.log("✅ Consumer transport connected (legacy event):", data);
      });

      socket.on("transport-recv-connect-failed", (data) => {
        console.error("❌ Consumer transport connect failed (legacy event):", data);
      });

      // Log connection events
      socket.on("connect", () => {
        console.log(`🟢 Socket connected: ${socket.id}`);
      });

      socket.on("disconnect", () => {
        console.log(`🔴 Socket disconnected`);
      });

      socket.on("connect_error", (error) => {
        console.error(`🔴 Socket connection error:`, error);
      });

      socket.on("connection-success", ({ socketId }) => {
        console.log(`🟢 Socket connection success with ID: ${socketId}`);
      });

      // Define setupIceCandidateHandling before calling it
      const setupIceCandidateHandling = () => {
        socket.on("ice-candidate", ({ candidate, transportId }) => {
          console.log(`Received ICE candidate for transport ${transportId}`);
          
          if (producerTransportRef.current && producerTransportRef.current.id === transportId) {
            // For producer transport
            if (connectedTransports.has(transportId)) {
              console.log("Applying ICE candidate to producer transport");
              producerTransportRef.current.addIceCandidate(candidate).catch(err => {
                console.warn("Error applying ICE candidate to producer transport:", err);
              });
            } else {
              console.log("Queueing ICE candidate for producer transport");
              producerIceCandidatesQueue.push(candidate);
            }
          } else if (consumerTransports.current) {
            // For consumer transports
            const consumerTransportData = consumerTransports.current.find(
              t => t.consumerTransport && t.consumerTransport.id === transportId
            );
            
            if (consumerTransportData) {
              if (connectedTransports.has(transportId)) {
                console.log("Applying ICE candidate to consumer transport");
                consumerTransportData.consumerTransport.addIceCandidate(candidate).catch(err => {
                  console.warn("Error applying ICE candidate to consumer transport:", err);
                });
              } else {
                console.log("Queueing ICE candidate for consumer transport");
                if (!consumerIceCandidatesMap.has(transportId)) {
                  consumerIceCandidatesMap.set(transportId, []);
                }
                consumerIceCandidatesMap.get(transportId).push(candidate);
              }
            }
          }
        });
      };

      socket.on("connect", () => {
        console.log(`socket connected ${socket.id}`);
      });
      socket.on("connection-success", ({ socketId }) => {
        console.log(socketId);
      });

      // Call the setupIceCandidateHandling after it's defined
      setupIceCandidateHandling();

      const getLocalStream = () => {
        console.log("getting params");
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
            console.log("Local stream obtained:", stream);
            console.log("Local video ref:", localVideoRef.current);
            setSelftrack(stream);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
              localVideoRef.current.className = `${stream.id}`;
              console.log("Assigned stream to local video ref");
            } else {
              console.error("localVideoRef.current is null when assigning stream!");
            }
            streamSuccess(stream);
          })
          .catch((error) => {
            console.log(error.message);
          });
      };

      if (socket) {
        console.log(socket);
        getLocalStream();
      }

      const streamSuccess = (stream) => {
        audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
        videoParams = { track: stream.getVideoTracks()[0], ...videoParams };
        joinRoom();
      };

      const joinRoom = async () => {
        socket.emit("joinRoom", { roomName }, async (data) => {
          Setrouters([data.Routers[0], data.Routers[1]]);
          console.log(data.Currentindex);
          console.log(`Router RTP Capabilities... ${data.Currentindex}`);
          let rtpCapabilitiesa = data.Routers[data.Currentindex];
          await createDevice(rtpCapabilitiesa);
          socket.emit("getProducers", (producerIds) => {
            producerIds.forEach((id) => {
              if (!Trackingconsumer.current.has(id)) {
                signalNewConsumerTransport(id);
              }
            });
          });
          let producerid = 1;

          socket.emit("getRouterindex", { producerid }, async (data) => {
            console.log(data.index);
            let router = "012";
            let producer = "123";
            SetproducerRouter((prevRouter) => ({
              ...prevRouter,
              [producer]: router,
            }));
            console.log(ProducerRouter);
            console.log(ProducerRouter[producer]);
          });
        });
      };

      socket.on("new-producer", async ({ producerId, targetRouterindex }) => {
        if (Trackingconsumer.current.has(producerId)) {
          return;
        }
        signalNewConsumerTransport(producerId); 
      });

      const createDevice = async (rtpCapabilitiesa) => {
        try {
          device = new mediasoupClient.Device();

          await device.load({
            routerRtpCapabilities: rtpCapabilitiesa,
          });

          console.log("Device RTP Capabilities", device.rtpCapabilities);

          createSendTransport();
        } catch (error) {
          console.log(error);
          if (error.name === "UnsupportedError")
            console.warn("browser not supported");
        }
      };

      const getProducers = () => {
        socket.emit("getProducers", (producerIds) => {
          console.log(producerIds);
          producerIds.forEach((id) => {
            if (!Trackingconsumer.current.has(id)) {
              signalNewConsumerTransport(id);
            }
          });
        });
      };

      const signalNewConsumerTransport = async (remoteProducerId) => {
        console.log(remoteProducerId);
        if (remoteProducerId === undefined || remoteProducerId === null) return;
        if (consumingTransports.includes(remoteProducerId)) {
          console.log("Already consuming", remoteProducerId);
          return;
        }
        consumingTransports.push(remoteProducerId);
        Trackingconsumer.current.add(remoteProducerId);

        console.log("signaling new users", remoteProducerId);
        await socket.emit(
          "createWebRtcTransport",
          { consumer: true },
          ({ params }) => {
            if (params.error) {
              console.log(params.error);
              return;
            }
            console.log(`PARAMS... ${params}`);

            let consumerTransport;
            try {
              consumerTransport = device.createRecvTransport(params);
            } catch (error) {
              console.log(error);
              return;
            }

            // Add ICE candidate handler
            consumerTransport.on("icecandidate", (iceCandidate) => {
              console.log(`Consumer transport ${consumerTransport.id} ICE candidate generated:`, iceCandidate);
              // Send to server
              socket.emit("ice-candidate", {
                transportId: consumerTransport.id,
                candidate: iceCandidate
              });
            });
            
            consumerTransport.on(
              "connect",
              async ({ dtlsParameters }, callback, errback) => {
                try {
                  console.log(`Consumer transport ${consumerTransport.id} connect event triggered`);
                  
                  const transportId = consumerTransport.id;
                  
                  // Set up timeout for connection
                  const connectTimeout = setTimeout(() => {
                    console.error(`Consumer transport ${transportId} connect timed out after 10 seconds`);
                    errback(new Error("Consumer transport connect timeout"));
                  }, 10000);
                  
                  // Create one-time response handlers
                  const handleConnectSuccess = ({ id }) => {
                    if (id === transportId) {
                      console.log(`Consumer transport ${transportId} connected successfully`);
                      clearTimeout(connectTimeout);
                      socket.off("transport-connect-failed", handleConnectError);
                      connectedTransports.add(transportId);
                      
                      // Process any queued ICE candidates
                      if (consumerIceCandidatesMap.has(transportId)) {
                        const queuedCandidates = consumerIceCandidatesMap.get(transportId);
                        console.log(`Applying ${queuedCandidates.length} queued ICE candidates for consumer transport`);
                        queuedCandidates.forEach(candidate => {
                          consumerTransport.addIceCandidate(candidate).catch(err => {
                            console.warn(`Error applying queued ICE candidate:`, err);
                          });
                        });
                        consumerIceCandidatesMap.delete(transportId);
                      }
                    }
                  };
                  
                  const handleConnectError = ({ id, error }) => {
                    if (id === transportId) {
                      console.error(`Consumer transport ${transportId} connect failed:`, error);
                      clearTimeout(connectTimeout);
                      socket.off("transport-connected", handleConnectSuccess);
                      errback(new Error(error));
                    }
                  };
                  
                  // Set up event listeners for success/failure
                  socket.once("transport-connected", handleConnectSuccess);
                  socket.once("transport-connect-failed", handleConnectError);
                  
                  // Send connection request with all necessary information
                  socket.emit("transport-recv-connect", {
                    dtlsParameters,
                    serverConsumerTransportId: params.id,
                    transportId: transportId // Add explicit transportId
                  });
                  
                  // Immediately call callback - mediasoup will handle the DTLS negotiation internally
                  callback();
                } catch (error) {
                  console.error(`Consumer transport connect error:`, error);
                  errback(error);
                }
              }
            );

            // Add DTLS state monitoring to consumer transport
            consumerTransport.on("dtlsstatechange", (dtlsState) => {
              console.log(`Consumer transport ${consumerTransport.id} DTLS state: ${dtlsState}`);
              if (dtlsState === "failed") {
                console.error(`DTLS failure on consumer transport ${consumerTransport.id}`);
                
                // Notify the application about DTLS failure
                socket.emit("client-consumer-dtls-failure", { 
                  transportId: consumerTransport.id,
                  producerId: remoteProducerId
                });
              }
            });

            // Inside signalNewConsumerTransport, after creating consumerTransport
            consumerTransport.on('icestatechange', (iceState) => {
              console.log(`Consumer transport ${consumerTransport.id} ICE state: ${iceState} for producer ${remoteProducerId}`);
              if (iceState === 'failed') {
                 console.error(`ICE connection failed for consumer transport ${consumerTransport.id}`);
                 
                 // Request a keyframe to potentially recover
                 console.log("Requesting keyframe to attempt recovery");
                 socket.emit("request-keyframe", {
                   producerId: remoteProducerId,
                   isPipeProducer: false
                 });
              }
            });

            connectRecvTransport(
              consumerTransport,
              remoteProducerId,
              device.rtpCapabilities, // Pass the actual device RTP capabilities
              params.id               // This is the serverConsumerTransportId
            );
          }
        );
      };

      socket.on("new-screen-share", async ({ producerId }) => {
        console.log(
          `New screen share started by another participant: ${producerId}`
        );
        signalNewConsumerTransport(producerId);
      });

      const createSendTransport = () => {
        socket.emit(
          "createWebRtcTransport",
          { consumer: false },
          ({ params }) => {
            if (params.error) {
              console.log(params.error);
              return;
            }

            console.log(params);

            producerTransport = device.createSendTransport(params);
            producerTransportRef.current = producerTransport;

            // Add monitoring for transport state changes
            producerTransport.on("dtlsstatechange", (dtlsState) => {
              console.log(`Producer transport DTLS state changed to ${dtlsState}`);
              if (dtlsState === "failed" || dtlsState === "closed") {
                console.error(`Producer transport DTLS failure: ${dtlsState}`);
                // Notify the application about DTLS failure
                socket.emit("client-dtls-failure", { 
                  transportId: producerTransport.id, 
                  state: dtlsState 
                });
              }
            });

            producerTransport.on("icestatechange", (iceState) => {
              console.log(`Producer transport ICE state changed to ${iceState}`);
              if (iceState === "failed") {
                console.error("Producer transport ICE connection failed");
                
                // Try to gather new ICE candidates
                producerTransport.restartIce().catch(err => {
                  console.error("Error restarting ICE:", err);
                });
              }
            });

            // Add ICE candidate handler - needs to be before connect is called
            producerTransport.on("icecandidate", (iceCandidate) => {
              console.log("Producer transport ICE candidate generated:", iceCandidate);
              // Send to server
              socket.emit("ice-candidate", {
                transportId: producerTransport.id,
                candidate: iceCandidate
              });
            });

            // Handler for 'produce' event - ESSENTIAL for creating server-side producers
            producerTransport.on(
              'produce',
              async (parameters, callback, errback) => {
                console.log('Producer transport "produce" event triggered with parameters:', parameters);
                try {
                  // Emit 'transport-produce' to the server
                  socket.emit(
                    'transport-produce',
                    {
                      transportId: producerTransport.id,
                      kind: parameters.kind,
                      rtpParameters: parameters.rtpParameters,
                      appData: parameters.appData, // Ensure appData is passed if you use it
                    },
                    ({ id, error }) => { // Expect an object with 'id' or 'error' from the server
                      if (error) {
                        console.error('Error from server on "transport-produce":', error);
                        errback(new Error(error)); // Propagate server error to Mediasoup
                        return;
                      }
                      if (id) {
                        console.log(`Server successfully created producer with ID: ${id}`);
                        callback({ id }); // Provide the server-side producer's ID to Mediasoup
                      } else {
                        console.error('Invalid response from server on "transport-produce": missing id');
                        errback(new Error('Invalid response from server on "transport-produce": missing id'));
                      }
                    }
                  );
                } catch (error) {
                  console.error('Error in "produce" event handler:', error);
                  errback(error); // Report error to Mediasoup
                }
              }
            );



            // Original connect handler
            producerTransport.on(
              "connect",
              async ({ dtlsParameters }, callback, errback) => {
                try {
                  console.log("Producer transport connect event triggered with DTLS parameters");
                  
                  const transportId = producerTransport.id;
                  
                  // Set up timeout for connection
                  const connectTimeout = setTimeout(() => {
                    console.error(`Transport ${transportId} connect timed out after 10 seconds`);
                    errback(new Error("Transport connect timeout - server did not respond"));
                  }, 10000);
                  
                  // Wait for server acknowledgment
                  await new Promise((resolve, reject) => {
                    // Create one-time response handlers
                    const handleConnectSuccess = ({ id }) => {
                      if (id === transportId) {
                        console.log(`Transport ${transportId} connected successfully`);
                        clearTimeout(connectTimeout);
                        socket.off("transport-connect-failed", handleConnectError);
                        connectedTransports.add(transportId);
                        resolve();
                      }
                    };
                    
                    const handleConnectError = ({ id, error }) => {
                      if (id === transportId) {
                        console.error(`Transport ${transportId} connect failed:`, error);
                        clearTimeout(connectTimeout);
                        socket.off("transport-connected", handleConnectSuccess);
                        reject(new Error(error));
                      }
                    };
                    
                    // Set up event listeners for success/failure
                    socket.once("transport-connected", handleConnectSuccess);
                    socket.once("transport-connect-failed", handleConnectError);
                    
                    // Send connection request
                    socket.emit("transport-connect", {
                      transportId: transportId,
                      dtlsParameters
                    });
                  });
                  
                  // Process any queued ICE candidates
                  if (producerIceCandidatesQueue.length > 0) {
                    console.log(`Applying ${producerIceCandidatesQueue.length} queued ICE candidates for producer transport`);
                    producerIceCandidatesQueue.forEach(candidate => {
                      producerTransport.addIceCandidate(candidate).catch(err => {
                        console.warn(`Error applying queued ICE candidate:`, err);
                      });
                    });
                    producerIceCandidatesQueue = [];
                  }
                  
                  console.log("Calling connect callback");
                  callback();
                } catch (error) {
                  console.error("Transport connect error:", error);
                  errback(error);
                }
              }
            );

            // Original produce handler
            producerTransport.on(
              "produce",
              async (parameters, callback, errback) => {
                console.log(`Producing ${parameters.kind}:`, parameters);

                try {
                  const { kind, rtpParameters, appData } = parameters;
                  
                  // Track what kind of producer we're creating
                  const isScreen = appData && appData.mediaType === 'screen';
                  const logPrefix = isScreen ? "Screen share" : kind === "audio" ? "Audio" : "Video";
                  
                  // Create a Promise-based approach to wait for server acknowledgment
                  const { id, error } = await new Promise((resolve, reject) => {
                    socket.emit(
                      "transport-produce",
                      {
                        transportId: producerTransport.id,
                        kind,
                        rtpParameters,
                        appData
                      },
                      (response) => {
                        if (response && response.error) {
                          console.error(`${logPrefix} producer creation error:`, response.error);
                          resolve({ error: response.error });
                        } else if (!response || response.id === undefined) {
                          console.error(`${logPrefix} producer creation failed: No valid ID returned`);
                          resolve({ error: "No valid producer ID returned from server" });
                        } else {
                          console.log(`${logPrefix} producer created with ID: ${response.id}`);
                          resolve({ id: response.id });
                        }
                      }
                    );
                    
                    // Add timeout to prevent hanging if server doesn't respond
                    setTimeout(() => {
                      const timeoutError = `${logPrefix} producer creation timeout - no response from server`;
                      console.error(timeoutError);
                      resolve({ error: timeoutError });
                    }, 10000);
                  });
                  
                  // Handle any errors from the server
                  if (error) {
                    throw new Error(error);
                  }
                  
                  // Success! Return the ID to mediasoup-client
                  callback({ id });
                  
                  // Update state based on kind
                  if (kind === 'audio') {
                    setAudioProducerCreated(true);
                    console.log("Audio producer created and ready");
                  } else if (kind === 'video' && !isScreen) { 
                    setVideoProducerCreated(true);
                    console.log("Video producer created and ready");
                    
                    // Request a keyframe after a brief delay to ensure good initial quality
                    setTimeout(() => {
                      console.log(`Requesting initial keyframe for new producer ${id}`);
                      // Use our enhanced function for better reliability
                      window.requestKeyframeForProducer(id);
                    }, 500);
                  }
                } catch (error) {
                  console.error(`Error creating producer:`, error);
                  errback(error);
                }
              }
            );

            // Add producer transport monitoring after it's created
            producerTransport.on('connectionstatechange', (state) => {
              console.log(`Producer transport connection state changed to ${state}`);
              
              if (state === 'failed' || state === 'disconnected') {
                console.error(`Producer transport connection ${state}`);
                
                // Notify the user of the issue
                if (state === 'failed') {
                  alert("Your camera connection has failed. Please refresh to reconnect.");
                }
              }
            });

            connectSendTransport();
          }
        );
      };

      socket.on(
        "new-producer-piped",
        async ({ producerId, producerSocket, kind, isRemotePiped, encodings }) => {
          console.log(`Received new piped producer notification: ${producerId} (isPiped: ${isRemotePiped})`);
          
          if (Trackingconsumer.current.has(producerId)) {
            console.log(`Already tracking piped producer ${producerId}, ignoring`);
            return;
          }
          
          // Store any producer routing info needed
          if (producerSocket) {
            console.log(`Associating producer ${producerId} with socket ${producerSocket}`);
            // Store the producer-socket mapping if needed for your UI
          }
          
          // Track the piped status
          const producerInfo = {
            id: producerId,
            isPiped: isRemotePiped === true,
            kind: kind || 'video' // Default to video if not specified
          };
          
          console.log(`Setting up consumer for piped producer ${producerId}`);
          
          try {
            // Standard consume logic
            signalNewConsumerTransport(producerId);
            
            // Request a keyframe after a short delay to ensure we get the video quickly
            setTimeout(() => {
              console.log(`Requesting keyframe for piped producer ${producerId}`);
              // Use enhanced function with retry logic
              window.requestKeyframeForProducer(producerId);
            }, 1000);
          } catch (error) {
            console.error(`Error consuming piped producer ${producerId}:`, error);
          }
        }
      );

      const connectSendTransport = async () => {
  if (!producerTransportRef.current) {
    console.error("Producer transport is not initialized yet!");
    return;
  }

  if (!audioProducerCreated) {
    audioProducer = await producerTransportRef.current.produce(audioParams);
    setAudioProducerCreated(true);
    console.log(`first audio ${audioParams}`);
  }

  if (!videoProducerCreated) {
    videoProducer = await producerTransportRef.current.produce(videoParams);
    console.log(`first video ${videoProducer.track.id}`);
    console.log(`first video ${videoProducer.id}`);
    setVideoProducerCreated(true);
  }

  if (audioProducer) {
    audioProducer.on("trackended", () => {
      console.log("audio track ended");
    });

    audioProducer.on("transportclose", () => {
      console.log("audio transport ended");
    });
  }

  if (videoProducer) {
    videoProducer.on("trackended", () => {
      console.log("video track ended");
    });

    videoProducer.on("transportclose", () => {
      console.log("video transport ended");
    });
  }
};

      const createConsumer = async (
        consumerTransport,
        remoteProducerId,
        rtpCapabilities,
        serverConsumerTransportId
      ) => {
        // Request consumption from the server with a proper Promise
        const params = await new Promise((resolve, reject) => {
          socket.emit(
            "consume",
            {
              rtpCapabilities,
              remoteProducerId,
              serverConsumerTransportId,
            },
            (response) => {
              // Log the raw response from the server
              console.log('[Mainview.js createConsumer] Raw response from server for "consume":', response);

              if (response && response.error) { // If response exists and has an error property
                console.error('[Mainview.js createConsumer] Error from server:', response.error);
                reject(new Error(response.error));
              } else if (response && response.id) { // If response exists and looks like valid consumer params
                resolve(response);
              } else {
                // This case should ideally not happen if the server behaves as expected
                console.error('[Mainview.js createConsumer] Unexpected or undefined response from server:', response);
                reject(new Error('Unexpected or undefined response from server for consume request.'));
              }
            }
          );
          
          // Add timeout to prevent hanging if server doesn't respond
          setTimeout(() => {
            reject(new Error("Consume request timeout - no response from server"));
          }, 10000);
        });

        // Validate received parameters
        if (!params.id || !params.producerId || !params.kind || !params.rtpParameters) {
          throw new Error("Incomplete consumer parameters received from server");
        }

        console.log(`Creating consumer for producer ${remoteProducerId} with params:`, params);
        
        // Create the consumer
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        return { consumer, params };
      };

      const connectRecvTransport = async (
        consumerTransport,
        remoteProducerId,
        deviceRtpCapabilities, // Was serverConsumerTransportId, now correctly named for what's passed
        actualServerConsumerTransportId // New parameter for the actual transport ID
      ) => {
        console.log(`Consuming producer: ${remoteProducerId} on transport: ${actualServerConsumerTransportId}`);

        try {
          const { consumer, params } = await createConsumer(
            consumerTransport,
            remoteProducerId,
            deviceRtpCapabilities,    // Pass the rtpCapabilities received by connectRecvTransport
            actualServerConsumerTransportId // Pass the actual server transport ID received by connectRecvTransport
          );

          // Request keyframe if this is a video consumer
          if (params.kind === 'video') {
            // Request initial keyframe
            requestKeyframe(params.producerId);
            
            // Set up periodic keyframe requests until the video plays or consumer is closed
            let keyframeInterval = null;
            let keyframeAttempts = 0;
            const maxKeyframeAttempts = 15; // Try for about 15 seconds
            
            keyframeInterval = setInterval(() => {
              if (consumer.closed || consumer.paused || keyframeAttempts >= maxKeyframeAttempts) {
                clearInterval(keyframeInterval);
                return;
              }
              
              // Check if video is playing by examining the track's readyState
              const track = consumer.track;
              if (track && track.readyState === "live") {
                // If we have a track and it appears to be active, stop requesting keyframes
                clearInterval(keyframeInterval);
                console.log(`Video consumer ${consumer.id} is playing successfully`);
                return;
              }
              
              // Request another keyframe
              requestKeyframe(params.producerId);
              keyframeAttempts++;
            }, 1000); // Try every second
            
            // Make sure to clean up the interval if the consumer is closed
            consumer.on("close", () => {
              if (keyframeInterval) {
                clearInterval(keyframeInterval);
              }
            });
          }

          // Store consumer transport info
          consumerTransports.current = [
            ...consumerTransports.current,
            {
              consumerTransport,
              serverConsumerTransportId: actualServerConsumerTransportId,
              producerId: remoteProducerId,
              consumer,
            },
          ];

          // Add track to consumer tracks state
          setConsumerTracks((prevTracks) => {
            // Prevent duplicates
            if (prevTracks.some(track => track.id === consumer.id)) {
              return prevTracks;
            }
            
            console.log(`Adding consumer ${consumer.id} to tracks (kind: ${consumer.kind})`);
            return [
              ...prevTracks,
              {
                id: consumer.id,
                consumer,
                kind: consumer.kind,
                producerId: params.producerId,
                serverConsumerId: params.serverConsumerId,
              },
            ];
          });

          // Resume the consumer to start receiving media
          console.log(`Requesting resume for consumer ${consumer.id}`);
          await new Promise((resolve) => {
            socket.emit("consumer-resume", {
              serverConsumerId: params.serverConsumerId,
            }, resolve);
          });
          
          // Request keyframe to ensure immediate playback
          console.log(`Requesting keyframe for producer ${remoteProducerId}`);
          socket.emit("request-keyframe", {
            producerId: remoteProducerId,
            isPipeProducer: params.isPiped || false
          });
          
          console.log(`Consumer ${consumer.id} setup completed successfully`);
          
        } catch (error) {
          console.error(`Error setting up consumer for producer ${remoteProducerId}:`, error);
          // Clean up transport to prevent leaks
          try {
            consumerTransport.close();
          } catch (closeError) {
            console.warn("Error closing consumer transport after failure:", closeError);
          }
          // Remove from tracking
          Trackingconsumer.current.delete(remoteProducerId);
          consumingTransports = consumingTransports.filter(id => id !== remoteProducerId);
        }
      };
      socket.on("producer-closed", ({ remoteProducerId }) => {
        setConsumerTracks((prevTracks) =>
          prevTracks.filter((track) => track.producerId !== remoteProducerId)
        );
        const producerToClose = consumerTransports.current.find(
          (transportData) => transportData.producerId === remoteProducerId
        );
        if (producerToClose) {
          producerToClose.consumerTransport.close();
          producerToClose.consumer.close();
        }
        consumerTransports.current = consumerTransports.current.filter(
          (transportData) => transportData.producerId !== remoteProducerId
        );
      });

      socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
      });
    }
    socket.on("disconnect", () => {
      console.log("socket disconnected");
      isMounted.current = false;
      socket.off("connect");
      socket.disconnect();
      socket.off("user-disconnected");

      // Clean up tracks and transports
      if (producerTransportRef.current) {
        producerTransportRef.current.close();
      }
      consumerTransports.current.forEach((transport) => {
        transport.consumerTransport.close();
        transport.consumer.close();
      });
      setConsumerTracks([]);
      setDisconnected(true);
      socket.disconnect();
      socket.off("connect");

      setDisconnected(true);
    });
    socket.on("user-disconnected", ({ consumerIds }) => {
      console.log(`User disconnected with consumer IDs: ${consumerIds}`);

      if (Array.isArray(consumerIds) && consumerIds.length > 0) {
        setConsumerTracks((prevTracks) =>
          prevTracks.filter((track) => !consumerIds.includes(track.consumer.id))
        );

        consumerIds.forEach((consumerId) => {
          const consumerToClose = consumerTransports.current.find(
            (transportData) => transportData.consumer.id === consumerId
          );
          if (consumerToClose) {
            consumerToClose.consumerTransport.close();
            consumerToClose.consumer.close();
          }
        });
        
        consumerTransports.current = consumerTransports.current.filter(
          (transportData) => !consumerIds.includes(transportData.consumer.id)
        );
      }
    });
    return () => {
      isMounted.current = false;

      socket.off("connect");
      socket.off("user-disconnected");
      socket.disconnect();

      // Clean up tracks and transports
      if (producerTransportRef.current) {
        producerTransportRef.current.close();
      }
      consumerTransports.current.forEach((transport) => {
        transport.consumerTransport.close();
        transport.consumer.close();
      });
      setConsumerTracks([]);
      setDisconnected(true);
    };
  }, [socket]);

  useEffect(() => {
    console.log(peers);
    peers.forEach((stream, index) => {
      stream.getTracks().forEach((track) => {
        console.log(
          `Track - ${track.kind}: Enabled - ${track.enabled}, State - ${track.readyState}`
        );
      });
    });
  }, [peers]);

  const startScreenSharing = async () => {
    if (!producerTransportRef.current) {
      console.error("Producer transport is not initialized.");
      return;
    }
    if (isScreenSharing) {
      console.warn("Screen sharing is already in progress.");
      return;
    }
    try {
      console.log("Requesting screen sharing permission");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });
      
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error("No video track in screen share stream");
      }
      
      console.log(`Screen sharing track obtained: ${videoTrack.id}`);
      
      // Use optimized encoding parameters for screen sharing
      const screenShareEncodings = [
        { rid: "high", maxBitrate: 2500000, scaleResolutionDownBy: 1 },
        { rid: "medium", maxBitrate: 1000000, scaleResolutionDownBy: 2 },
        { rid: "low", maxBitrate: 500000, scaleResolutionDownBy: 4 }
      ];
      
      console.log("Producing screen share stream with specialized encodings");
      const screenShareProducer = await producerTransportRef.current.produce({
        track: videoTrack,
        encodings: screenShareEncodings,
        codecOptions: {
          videoGoogleStartBitrate: 1000
        },
        appData: {
          mediaType: 'screen'
        }
      });

      // Add track ended handler to detect when user stops sharing
      videoTrack.addEventListener('ended', () => {
        console.log("Screen sharing track ended by user");
        stopScreenSharing();
      });
      
      setScreenProducer(screenShareProducer);
      setIsScreenSharing(true);
      
      console.log(`Screen share producer created with ID: ${screenShareProducer.id}`);
      
      // Notify the server about the new screen share producer
      await new Promise((resolve) => {
        socket.emit("new-screen-share-producer", {
          producerId: screenShareProducer.id
        }, resolve);
      });

      screenShareProducer.on("trackended", () => {
        console.log("Screen sharing stopped via producer track ended event");
        stopScreenSharing();
      });
      
      // Request a keyframe immediately to ensure quick start of sharing
      setTimeout(() => {
        socket.emit("request-keyframe", { 
          producerId: screenShareProducer.id 
        });
      }, 500);
      
    } catch (error) {
      console.error("Error starting screen sharing:", error);
      alert("Failed to start screen sharing: " + error.message);
    }
  };

  const stopScreenSharing = () => {
    if (!isScreenSharing || !screenProducer) {
      console.warn("Screen sharing is not active.");
      return;
    }
    
    console.log("Stopping screen sharing");
    try {
      // Close the producer
      screenProducer.close();
      
      // Close any tracks
      if (screenProducer.track) {
        screenProducer.track.stop();
      }
      
      // Update state
      setScreenProducer(null);
      setIsScreenSharing(false);
      
      // Notify server
      socket.emit("producer-close", {
        producerId: screenProducer.id
      });
      
      console.log("Screen sharing stopped successfully");
    } catch (error) {
      console.error("Error stopping screen sharing:", error);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenSharing();
    } else {
      startScreenSharing();
    }
  };

  const startWebcam = async () => {
    if (!producerTransportRef.current) {
      console.error("Producer transport is not initialized.");
      return;
    }
    if (webcamon) {
      console.warn("Webcam is already in progress.");
      return;
    }
    try {
    } catch (error) {
      console.error("Error starting webcam:", error);
    }
  };

  const toggleWebcam = () => {
    if (Selftrack && Selftrack.getVideoTracks().length > 0) {
      const videoTrack = Selftrack.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setiswebcam(videoTrack.enabled);
    }
  };

  const disconnectfun = () => {
    console.log("Disconnecting socket...");
    socket.off("connect");
    socket.disconnect();
    console.log("Socket disconnected.");
    if (producerTransportRef.current) {
      producerTransportRef.current.close();
    }
    consumerTransports.current.forEach((transport) => {
      transport.consumerTransport.close();
      transport.consumer.close();
    });
    console.log("Transports closed.");
    setDisconnected(true);
  };

  const toggleMuteAudio = () => {
    if (Selftrack && Selftrack.getAudioTracks().length > 0) {
      const audioTrack = Selftrack.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
    }
  };

  useGSAP(
    () => {
      gsap.fromTo(
        ".camimg",
        {
          rotateZ: 15,
          translateY: 2,
          translateX: 2,
          translateZ: 20,
          duration: 0.5,
        },
        {
          rotateZ: 0,
          translateY: 0,
          translateX: 0,
          translateZ: 0,
          ease: "elastic.out(1,0.4)",
          duration: 1,
        }
      );
    },
    { scope: container, dependencies: [iswebcam] }
  );
  useGSAP(
    () => {
      gsap.fromTo(
        ".screening",
        {
          rotateZ: 15,
          translateY: 2,
          translateX: 2,
          translateZ: 20,
          duration: 0.5,
        },
        {
          rotateZ: 0,
          translateY: 0,
          translateX: 0,
          translateZ: 0,
          ease: "elastic.out(1,0.4)",
          duration: 1,
        }
      );
    },
    { scope: container, dependencies: [isScreenSharing] }
  );
  useGSAP(
    () => {
      gsap.fromTo(
        ".micing",
        {
          rotateZ: 16,
          translateX: 2,
          translateZ: 5120,
          duration: 0.5,
        },
        {
          rotateZ: 0,
          translateY: 0,
          translateX: 0,
          translateZ: 0,
          ease: "elastic.out(2,0.8)",
          duration: 0.5,
        }
      );
    },
    { scope: container, dependencies: [isAudioMuted] }
  );

  const monitorNetworkConditions = () => {
    // Skip if producer transport isn't initialized
    if (!producerTransportRef.current) return;
    
    let lastTimestamp = Date.now();
    let lastBytesSent = 0;
    let lastBytesReceived = 0;
    let consecutiveLowBandwidth = 0;
    
    const checkInterval = setInterval(async () => {
      try {
        // Skip if no active transport
        if (!producerTransportRef.current || producerTransportRef.current.closed) {
          clearInterval(checkInterval);
          return;
        }
        
        const stats = await producerTransportRef.current.getStats();
        const now = Date.now();
        let totalBytesSent = 0;
        let totalBytesReceived = 0;
        
        // Process stats
        stats.forEach(stat => {
          if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
            totalBytesSent += stat.bytesSent || 0;
          } else if (stat.type === 'inbound-rtp') {
            totalBytesReceived += stat.bytesReceived || 0;
          }
        });
        
        // Calculate bitrates
        const interval = (now - lastTimestamp) / 1000; // seconds
        const uploadBitrate = 8 * (totalBytesSent - lastBytesSent) / interval;
        const downloadBitrate = 8 * (totalBytesReceived - lastBytesReceived) / interval;
        
        console.log(`Network stats - Upload: ${Math.round(uploadBitrate/1000)} kbps, Download: ${Math.round(downloadBitrate/1000)} kbps`);
        
        // Detect poor connection
        if (uploadBitrate < 100000) { // Less than 100 kbps upload
          consecutiveLowBandwidth++;
          
          if (consecutiveLowBandwidth >= 3) {
            console.warn("Poor connection detected, reducing video quality");
            // Find video producer
            const videoProducerData = producers.find(p => 
              p.kind === 'video' && !p.closed && p.appData?.mediaType !== 'screen'
            );
            
            if (videoProducerData) {
              // Reduce quality
              videoProducerData.setMaxSpatialLayer(0); // Use lowest layer
            }
          }
        } else {
          consecutiveLowBandwidth = 0;
          // Could restore quality here if needed
        }
        
        // Update for next calculation
        lastTimestamp = now;
        lastBytesSent = totalBytesSent;
        lastBytesReceived = totalBytesReceived;
        
      } catch (error) {
        console.error("Error monitoring network:", error);
      }
    }, 5000);
    
    return () => clearInterval(checkInterval);
  };
  useEffect(() => {
    monitorNetworkConditions();
  }, []);

  const adjustVideoQuality = (bitrate) => {
    if (bitrate < 300000) {
      // Switch to lower quality
      videoProducer.setParameters({
        encodings: [{ maxBitrate: 100000 }],
      });
    } else if (bitrate < 900000) {
      // Switch to medium quality
      videoProducer.setParameters({
        encodings: [{ maxBitrate: 300000 }],
      });
    } else {
      // Switch to high quality
      videoProducer.setParameters({
        encodings: [{ maxBitrate: 900000 }],
      });
    }
  };

  // Enhance socket.io connection options to improve reliability
  useEffect(() => {
    // Add timeout debug logs
    console.log("Setting up socket timeout debugger");
    const checkConnectionInterval = setInterval(() => {
      if (socket.connected) {
        console.log(`Socket connected: ${socket.id}`);
      } else {
        console.warn(`Socket not connected! Attempting reconnect...`);
        socket.connect();
      }
    }, 10000);

    return () => {
      clearInterval(checkConnectionInterval);
    };
  }, []);

  // Add a signal logger to debug all communications
  const signalLogger = (signal, data) => {
    console.log(`WebRTC signal: ${signal}`, data);
    // You can enable/disable this log for debugging
    return data;
  };

  // Add diagnostic function that can be called from console
  window.checkWebRtcState = () => {
    const status = {
      socketConnected: socket.connected,
      socketId: socket.id,
      device: device ? {
        loaded: device.loaded,
        canProduce: device.canProduce('video'),
        canConsume: device.canConsume({ kind: 'video' })
      } : null,
      producerTransport: producerTransportRef.current ? {
        id: producerTransportRef.current.id,
        closed: producerTransportRef.current.closed,
        connectionState: producerTransportRef.current.connectionState,
        dtlsState: producerTransportRef.current.dtlsState,
        iceState: producerTransportRef.current.iceState
      } : null,
      consumerTransports: consumerTransports.current.map(t => ({
        id: t.consumerTransport?.id,
        closed: t.consumerTransport?.closed,
        connectionState: t.consumerTransport?.connectionState,
        dtlsState: t.consumerTransport?.dtlsState,
        iceState: t.consumerTransport?.iceState,
        producerId: t.producerId,
        consumerId: t.consumer?.id
      })),
      consumerTracks: consumerTracks.map(t => ({
        id: t.id,
        kind: t.kind,
        producerId: t.producerId,
        track: t.consumer?.track ? {
          id: t.consumer.track.id,
          kind: t.consumer.track.kind,
          enabled: t.consumer.track.enabled,
          readyState: t.consumer.track.readyState
        } : null
      }))
    };
    console.log('WebRTC state:', status);
    return status;
  };

  // Add socket event handlers for keyframe response
  socket.on('keyframe-requested', ({ producerId }) => {
    console.log(`✅ Keyframe requested successfully for producer ${producerId}`);
  });

  socket.on('keyframe-request-failed', ({ producerId, error }) => {
    console.warn(`❌ Keyframe request failed for producer ${producerId}: ${error}`);
  });

  socket.on('keyframe-request-forwarded', ({ producerId }) => {
    console.log(`✅ Keyframe request forwarded to origin server for producer ${producerId}`);
  });

  // Add this function to the component for external calls
  window.requestKeyframes = (producerId) => {
    if (socket && socket.connected) {
      console.log(`Manually requesting keyframe for producer ${producerId}`);
      socket.emit("request-keyframe", { producerId });
      return "Keyframe request sent";
    }
    return "Socket not connected";
  };

  // Add keyframe request to recovery function in videocomponents.js
  const requestKeyframeForProducer = (producerId) => {
    if (window.socket && window.socket.connected) {
      console.log(`Recovery: Requesting keyframe for producer ${producerId}`);
      
      // Track if we've received a response
      let responseReceived = false;
      
      // Send initial request
      window.socket.emit("request-keyframe", { producerId });
      
      // Setup listeners for responses if they don't exist
      if (!window.keyframeResponseListenersSet) {
        window.socket.on('keyframe-requested', ({ producerId }) => {
          console.log(`Keyframe request succeeded for producer ${producerId}`);
          responseReceived = true;
        });
        
        window.socket.on('keyframe-request-failed', ({ producerId, error }) => {
          console.warn(`Keyframe request failed for producer ${producerId}: ${error}`);
          responseReceived = true;
        });
        
        window.socket.on('keyframe-request-forwarded', ({ producerId }) => {
          console.log(`Keyframe request forwarded for remote producer ${producerId}`);
          responseReceived = true;
        });
        
        window.keyframeResponseListenersSet = true;
      }
      
      // Add retry logic with exponential backoff
      let retryCount = 0;
      const maxRetries = 3;
      const initialRetryInterval = 500;
      
      const retryKeyframeRequest = () => {
        if (retryCount < maxRetries && !responseReceived) {
          setTimeout(() => {
            if (!responseReceived && window.socket && window.socket.connected) {
              console.log(`Recovery retry #${retryCount+1}: Requesting keyframe for ${producerId}`);
              window.socket.emit("request-keyframe", { producerId });
              retryCount++;
              retryKeyframeRequest();
            }
          }, initialRetryInterval * Math.pow(2, retryCount));
        }
      };
      
      retryKeyframeRequest();
      return true;
    }
    return false;
  };

  // Export for use in videocomponents
  window.requestKeyframeForProducer = requestKeyframeForProducer;

  return (
    <>
      {!Disconnected ? (
        <Cover ref={container}>
          <Nav className="ml-2 flex item-center justify-start gap-4">
            <img
              onClick={() => dispatch(settogglesidebar(true))}
              src={Leftarrow}
              alt=""
            />
            <h1 className="mb-4 ">General</h1>
          </Nav>
          {/* <MainDiv>
            <div className="parent">
              <div className="Localvideo">
                <video ref={localVideoRef} autoPlay muted playsInline></video>
              </div>

              {consumerTracks.map((trackData) => (
                <Videocomponents
                  key={trackData.id}
                  producerId={trackData.producerId}
                  serverConsumerId={trackData.serverConsumerId}
                  track={trackData.consumer.track}
                  kind={trackData.kind}
                  consumerTransports={consumerTransports.current}
                  socket={socket}
                  Selftrack={Selftrack}
                />
              ))}
            </div>
          </MainDiv> */}

          <div className="flex-1 p-4 overflow-y-auto w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 justify-items-center content-start ">
              {/* <div className="Localvideo">
                <video ref={localVideoRef} autoPlay muted playsInline></video>
              </div> */}
              <div className="aspect-video bg-[#2f3136] rounded-lg overflow-hidden relative w-full max-w-[450px] max-md:max-w-[300px]">
                <video
                  ref={localVideoRef}
                  className="w-full h-full object-cover Video"
                  muted={true}
                  autoPlay
                  playsInline
                >
                  Your browser does not support the video tag.
                </video>
                <div
                  className="VideoOverlay absolute top-0 left-0 w-full h-full bg-black bg-opacity-75 flex items-center justify-center"
                  style={{
                    display: isVideoPaused ? "flex" : "none",
                    opacity: 0,
                  }}
                >
                  <div className="text-white text-lg">Video Paused</div>
                </div>
                <div className="absolute bottom-2 left-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white px-3 py-1 rounded-full text-sm shadow-lg">
                  User
                </div>
                {/* <div className="absolute top-2 right-2 flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-black bg-opacity-50 hover:bg-opacity-75"
                  >
                    {isMuted ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-black bg-opacity-50 hover:bg-opacity-75"
                  >
                    {isVideoPaused ? (
                      <VideoOff className="h-4 w-4" />
                    ) : (
                      <Video className="h-4 w-4" />
                    )}
                  </Button>
                </div> */}
              </div>
              {consumerTracks.map((trackData) => (
                <Videocomponents
                  key={trackData.id}
                  producerId={trackData.producerId}
                  serverConsumerId={trackData.serverConsumerId}
                  consumer={trackData.consumer}
                  track={trackData.consumer.track}
                  kind={trackData.kind}
                  consumerTransports={consumerTransports.current}
                  socket={socket}
                  onKeyFrameRequest={() => {
                    console.log(`Manual keyframe request for producer ${trackData.producerId}`);
                    window.requestKeyframeForProducer(trackData.producerId);
                  }}
                />
              ))}
            </div>
          </div>
          <Bottomdiv
            iswebcam={iswebcam}
            isScreenSharing={isScreenSharing}
            isAudioMuted={isAudioMuted}
          >
            <button className="webcam" onClick={toggleWebcam}>
              {iswebcam ? (
                <img className="camimg" src={webcam} alt="" />
              ) : (
                <img className="camimg" src={webcamona} alt="" />
              )}
            </button>

            <button className="screenshare" onClick={toggleScreenShare}>
              {isScreenSharing ? (
                <img className="screening" src={screenshareoff} alt="" />
              ) : (
                <img className="screening" src={screenshare} alt="" />
              )}
            </button>
            <button className="disconnect" onClick={disconnectfun}>
              <img src={calldisconnect} alt="" />
            </button>
            <button className="mic" onClick={toggleMuteAudio}>
              {isAudioMuted ? (
                <img className="micing" src={micenable} alt="" />
              ) : (
                <img className="micing" src={micdisable} alt="" />
              )}
            </button>
          </Bottomdiv>
        </Cover>
      ) : (
        <Buttonrefresh>
          <button onClick={() => window.location.reload()}>Join channel</button>
        </Buttonrefresh>
      )}
    </>
  );
};

export default Mainview;

const Buttonrefresh = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
  button {
    width: 10rem;
    height: 3rem;
    border-radius: 0.5rem;
    background-color: #63ff58;

    color: #2f2f2f;
    border: none;
    font-weight: bold;
    cursor: pointer;
  }
`;
const Bottomdiv = styled.div`
  position: relative;
  width: 100%;
  min-height: 4.5rem;
  display: flex;
  /* background-color: #2b2d31; */
  gap: 1rem;
  align-items: center;
  justify-content: center;
  .webcam {
    background-color: ${(props) => (props.iswebcam ? "#2b2d31" : "#f1f1f1")};
  }
  .disconnect {
    background-color: #ff4848;
    &:hover {
      background-color: #ff0e0e;
      color: #2b2d31;
      img {
        margin-bottom: 0.2rem;
        transition: all 0.5s ease-in-out;
      }
    }
  }
  .screenshare {
    background-color: ${(props) =>
      props.isScreenSharing ? "#f1f1f1" : "#2b2d31"};
  }
  .mic {
    background-color: ${(props) =>
      props.isAudioMuted ? "#f1f1f1" : "#2b2d31"};
  }

  @media (max-width: 450px) {
    padding-bottom: 4rem;
    padding-bottom: calc(env(safe-area-inset-bottom) + 9.5rem);
  }

  button {
    width: 3rem;
    height: 3rem;
    border-radius: 100%;
    background-color: #2b2d31;
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;

    @media (max-width: 450px) {
      width: 3rem;
      height: 3rem;
    }
  }
`;

const Cover = styled.div`
  width: 100%;
  min-height: 100%;
  padding: 1rem;
  padding-inline: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  background-color: #000000;
`;
const Nav = styled.div`
  position: relative;
  width: 100%;
  min-height: 2rem;

  left: 1.2rem;
  h1 {
    color: white;
    font-size: 1.2rem;
    font-weight: 400;
    letter-spacing: 0.1rem;
    margin-top: 1rem;
  }
`;

const MainDiv = styled.div`
  width: 95%;
  height: 45rem;
  flex-wrap: wrap;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  @media (max-width: 1440px) {
    height: 60%;
  }
  @media (max-width: 450px) {
    height: 80%;
  }
  .parent {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    grid-auto-rows: minmax(200px, auto);
    // Adjust the minmax as needed
    justify-items: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 8rem; // Adjust the gap as needed
    row-gap: 3rem;
    @media (max-height: 1024px) {
      row-gap: 1rem;
    }
    @media (max-width: 1024px) {
      grid-template-columns: repeat(2, minmax(200px, 1fr));
      gap: 0.5rem; // Adjust the gap as needed
      row-gap: 2rem;
    }

    @media (max-width: 758px) {
      grid-template-columns: repeat(2, minmax(100px, 1fr));
      row-gap: 1rem;
      grid-auto-rows: minmax(161px, auto);
    }
    @media (max-width: 758px) {
      grid-template-columns: repeat(auto-fill, minmax(283px, 1fr));
      row-gap: 0.5rem;
    }
    @media (max-width: 450px) {
      grid-template-columns: repeat(auto-fill, minmax(283px, 1fr));
      row-gap: 0.5rem;
    }
    .Localvideo {
      width: 30.2rem;
      height: 17.3rem;
      border-radius: 0.4rem;
      margin-top: 1rem;
      max-height: 17.3rem;
      @media (max-width: 1440px) {
        width: 20.2rem;
        height: 11.7rem;
        max-height: 11.7rem;
      }
      @media (max-width: 768px) {
        width: 14.2rem;
        height: 8.2rem;
        max-height: 8.2rem;
      }

      video {
        max-width: 30rem;
        max-height: 17.3rem;
        position: relative;
        z-index: 124124;
        border-radius: 0.4rem;
        border: none;
        outline: none;
        z-index: 22;
        @media (max-width: 1440px) {
          max-width: 20rem;
          max-height: 11.3rem;
        }
        @media (max-width: 768px) {
          width: 14rem;
          max-height: 8.2rem;
        }
      }
    }
  }

  .parent > div {
    border: 1px solid #ccc;
    aspect-ratio: 16/9;
  }
  .Space {
    width: 30rem;
    height: 20rem;
    background-color: #c7daeb;
  }
`;