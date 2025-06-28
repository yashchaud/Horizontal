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

const socket = io("http://localhost:3002", { secure: true });

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

  useEffect(() => {
    console.log(Selftrack);
  }, [Selftrack]);

  useEffect(() => {
    console.log("Attempting to connect to socket...");
    isMounted.current = true;

    if (isMounted.current) {
      socket.on("connect", () => {
        console.log(`socket connected ${socket.id}`);
      });
      socket.on("connection-success", ({ socketId }) => {
        console.log(socketId);
      });

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
            setSelftrack(stream);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
              localVideoRef.current.className = `${stream.id}`;
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

            consumerTransport.on(
              "connect",
              async ({ dtlsParameters }, callback, errback) => {
                try {
                  socket.emit("transport-recv-connect", {
                    dtlsParameters,
                    serverConsumerTransportId: params.id,
                  });
                  callback();
                } catch (error) {
                  errback(error);
                }
              }
            );

            connectRecvTransport(
              consumerTransport,
              remoteProducerId,
              params.id
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

            producerTransport.on(
              "connect",
              async ({ dtlsParameters }, callback, errback) => {
                try {
                  socket.emit("transport-connect", {
                    dtlsParameters,
                  });
                  callback();
                } catch (error) {
                  errback(error);
                }
              }
            );

            producerTransport.on(
              "produce",
              async (parameters, callback, errback) => {
                console.log(parameters);

                try {
                  if (
                    (parameters.kind === "audio" &&
                      audioProducerCreated &&
                      parameters.kind === "video" &&
                      isScreenSharing) ||
                    videoProducerCreated
                  ) {
                    console.log(`${parameters.kind} producer already exists`);
                    return;
                  }

                  socket.emit(
                    "transport-produce",
                    {
                      kind: parameters.kind,
                      rtpParameters: parameters.rtpParameters,
                      appData: parameters.appData,
                    },
                    ({ id, producersExist }) => {
                      callback({ id });
                      if (producersExist) getProducers();
                    }
                  );
                } catch (error) {
                  errback(error);
                }
              }
            );

            connectSendTransport();
          }
        );
      };

      socket.on(
        "new-producer-piped",
        async ({ producerId, targetRouterindex }) => {
          if (Trackingconsumer.current.has(producerId)) {
            return;
          }
          console.log("pipedProducer ", producerId);
          console.log(producerId, targetRouterindex);

          const targetRouterRtpCapabilities = Routers[targetRouterindex];
          if (
            !device.loaded ||
            device.routerRtpCapabilities !== targetRouterRtpCapabilities
          ) {
            device.load({
              routerRtpCapabilities: targetRouterRtpCapabilities,
            });
          }
          if (producerId !== undefined && producerId !== null) {
            signalNewConsumerTransport(producerId);
          }
        }
      );

      const connectSendTransport = async () => {
        if (!audioProducerCreated) {
          audioProducer = await producerTransport.produce(audioParams);
          setAudioProducerCreated(true);
          console.log(`first audio ${audioParams}`);
        }

        if (!videoProducerCreated) {
          videoProducer = await producerTransport.produce(videoParams);
          console.log(`first video ${videoProducer.track.id}`);
          console.log(`first video ${videoProducer.id}`);
          setVideoProducerCreated(true);
        }

        audioProducer.on("trackended", () => {
          console.log("audio track ended");
        });

        audioProducer.on("transportclose", () => {
          console.log("audio transport ended");
        });

        videoProducer.on("trackended", () => {
          console.log("video track ended");
        });

        videoProducer.on("transportclose", () => {
          console.log("video transport ended");
        });
      };

      const connectRecvTransport = async (
        consumerTransport,
        remoteProducerId,
        serverConsumerTransportId
      ) => {
        console.log("Consuming rn");

        socket.emit(
          "consume",
          {
            rtpCapabilities: device.rtpCapabilities,
            remoteProducerId,
            serverConsumerTransportId,
          },
          async ({ params }) => {
            if (params.error) {
              console.log("Cannot Consume");
              return;
            }

            console.log(`Consumer Params ${params}`);
            settrackingprodu(params.producerId);
            const consumer = await consumerTransport.consume({
              id: params.id,
              producerId: params.producerId,
              kind: params.kind,
              rtpParameters: params.rtpParameters,
            });

            consumerTransports.current = [
              ...consumerTransports.current,
              {
                consumerTransport,
                serverConsumerTransportId: params.id,
                producerId: remoteProducerId,
                consumer,
              },
            ];
            Trackingconsumer.current.add(params.producerId);
            setConsumerTracks((prevTracks) => [
              ...prevTracks,
              {
                id: consumer.id,
                consumer,
                kind: consumer.kind,
                producerId: params.producerId,
                serverConsumerId: params.serverConsumerId,
              },
            ]);

            socket.emit("consumer-resume", {
              serverConsumerId: params.serverConsumerId,
            });
          }
        );
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
      setDisconnected(true);
    });

    return () => {
      isMounted.current = false;
      socket.off("connect");
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
  }, []);

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

  const stopScreenSharing = () => {
    if (!isScreenSharing || !screenProducer) {
      console.warn("Screen sharing is not active.");
      return;
    }
    screenProducer.close();
    setScreenProducer(null);
    setIsScreenSharing(false);
    socket.emit("producer-close", {
      producerId: screenProducer.id,
    });
  };

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
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: 1920,
          height: 1080,
        },
        audio: true,
      });
      const [track] = stream.getVideoTracks();
      const screenShareProducer = await producerTransportRef.current.produce({
        track,
      });

      setScreenProducer(screenShareProducer);
      setIsScreenSharing(true);

      socket.emit("new-screen-share-producer", {
        producerId: screenShareProducer.id,
      });

      screenShareProducer.on("trackended", () => {
        console.log("Screen sharing stopped");
        stopScreenSharing();
      });
    } catch (error) {
      console.error("Error starting screen sharing:", error);
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

  return (
    <>
      {!Disconnected ? (
        <Cover ref={container}>
          <Nav className="ml-2 flex item-center justify-center gap-4">
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
          <div className="w-full h-screen flex flex-col justify-center items-center  ">
            <div className="w-full h-[90%] flex justify-center items-center flex-wrap  gap-4 p-4 overflow-y-auto">
              <div className="Localvideo min-w-[300px] max-w-[300px] max-h-[200px]">
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
  position: absolute;
  bottom: 1rem;
  display: flex;
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
  position: absolute;
  top: 0rem;
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
