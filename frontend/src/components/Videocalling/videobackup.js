import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button } from "@ui/button";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

gsap.registerPlugin(useGSAP);

const Videocomponents = ({
  consumer,
  kind,
  serverConsumerId,
  producerId,
  socket,
}) => {
  const track = consumer?.track;

  console.log(`Videocomponents RENDER for producer ${producerId} (kind: ${kind})`, { 
    track: track ? `Track ID: ${track.id}` : 'No track', 
    kind, 
    serverConsumerId, 
    producerId,
    consumerPaused: consumer?.paused,
    trackEnabled: track?.enabled,
    trackReadyState: track?.readyState
  });

  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [videoStats, setVideoStats] = useState({ width: 0, height: 0 });
  const container = useRef();
  const { contextSafe } = useGSAP({ scope: container });
  const videoRef = useRef();
  const streamRef = useRef(null);

  useEffect(() => {
    console.log(`Videocomponents mounted for ${kind} track, producer: ${producerId}`);
    console.log(`Track info:`, track ? { id: track.id, kind: track.kind, enabled: track.enabled } : 'No track');

    return () => {
      console.log(`Videocomponents unmounting for producer: ${producerId}`);
      if (streamRef.current && videoRef.current) {
        videoRef.current.srcObject = null;
        streamRef.current = null;
      }
      
      // Notify socket that we're no longer displaying this producer
      // This helps with cleanup on the server side
      if (socket && producerId) {
        // No need to emit consumer-inactive here, server should handle producer closure
        // socket.emit('consumer-inactive', { 
        //   producerId,
        //   serverConsumerId
        // });
      }
    };
  }, [kind, producerId, track, socket, serverConsumerId]);

  useEffect(() => {
    if (track) {
      console.log(`Track detailed info:`, {
        id: track.id,
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted,
        remote: track.remote || 'unknown',
        ended: track.ended,
        contentHint: track.contentHint || 'none'
      });

      if (kind === 'video') {
        const monitorInterval = setInterval(() => {
          if (videoRef.current) {
            const width = videoRef.current.videoWidth;
            const height = videoRef.current.videoHeight;

            if (width && height) {
              console.log(`Video dimensions for ${producerId}: ${width}x${height}`);
              setVideoStats({ width, height });
              clearInterval(monitorInterval);
            }
          }
        }, 1000);

        return () => clearInterval(monitorInterval);
      }
    }
  }, [track, kind, producerId]);

  const handleMuteToggle = () => {
    if (track && kind === "audio") {
      const newMuteState = !isMuted;
      track.enabled = !newMuteState;
      setIsMuted(newMuteState);
    }
  };

  useEffect(() => {
    const handleError = (err) => {
      console.error("Socket error:", err);
      setHasError(true);
      setErrorMessage("Connection error");
    };

    socket.on("error", handleError);

    return () => {
      socket.off("error", handleError);
    };
  }, [socket]);

  const handleVideoToggle = () => {
    if (kind === "video") {
      if (!isVideoPaused) {
        socket.emit(
          "consumer-pause",
          {
            producerId: producerId,
            serverConsumerId: serverConsumerId,
          },
          () => {
            setIsVideoPaused(true);
            Videopactiy();
          }
        );
      } else {
        socket.emit(
          "consumer-resume",
          {
            serverConsumerId: serverConsumerId,
            producerId: producerId,
          },
          () => {
            setIsVideoPaused(false);
            Videoresume();
          }
        );
      }
    }
  };

  useEffect(() => {
    const currentTrack = consumer?.track;

    if (!videoRef.current || !currentTrack) {
      console.warn(`Videocomponents effect (${producerId}): Skipping setup - videoRef.current: ${!!videoRef.current}, track: ${!!currentTrack}`);
      return;
    }

    console.log(`Videocomponents effect (${producerId}): Setting up ${kind} MediaStream. Track details:`, {
      id: currentTrack.id,
      kind: currentTrack.kind,
      readyState: currentTrack.readyState,
      enabled: currentTrack.enabled,
      muted: currentTrack.muted
    });

    if (currentTrack.readyState !== 'live') {
      console.warn(`Videocomponents effect (${producerId}): Track is not live (state: ${currentTrack.readyState}). Aborting setup.`);
      setHasError(true);
      setErrorMessage(`Track not live (${currentTrack.readyState})`);
      return;
    }

    console.log(`Setting up ${kind} MediaStream for track ID ${currentTrack.id}, producer: ${producerId}`);

    try {
      // Ensure track is enabled (though it should be by default)
      currentTrack.enabled = true;
      console.log(`Track ${currentTrack.id} enabled status set to: ${currentTrack.enabled}`);

      // Debug track constraints for video
      if (kind === 'video' && currentTrack.getConstraints) {
        try {
          const constraints = currentTrack.getConstraints();
          console.log(`Video track constraints:`, constraints);
        } catch (e) {
          console.log(`Could not get track constraints:`, e);
        }
      }

      // Check track settings
      try {
        const settings = currentTrack.getSettings ? currentTrack.getSettings() : 'getSettings not available';
        console.log(`Track settings for ${producerId}:`, settings);
      } catch (e) {
        console.log(`Could not get track settings:`, e);
      }

      const stream = new MediaStream();
      stream.addTrack(currentTrack);
      streamRef.current = stream;

      console.log(`Stream created successfully:`, {
        active: stream.active,
        id: stream.id,
        trackCount: stream.getTracks().length
      });

      // Create a cleanup function to properly handle memory and prevent leaked event listeners
      const cleanupEvents = [];
      const videoEl = videoRef.current;
      
      // Clear any previous sources first
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }

      // For video tracks, set important attributes before assigning srcObject
      if (kind === 'video') {
        videoEl.muted = true;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.style.display = 'block';
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'cover';
      }
      
      // Set new source
      videoEl.srcObject = stream;
      
      // For debugging - log active tracks in the stream after assignment
      if (videoEl.srcObject) {
        const tracks = videoEl.srcObject.getTracks();
        console.log(`videoEl.srcObject has ${tracks.length} tracks after assignment for ${producerId}:`, 
          tracks.map(t => ({ id: t.id, kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
      } else {
        console.warn(`videoEl.srcObject is null after assignment for ${producerId}`);
      }

      // Define a safe play function that handles errors properly
      let isPlayAttemptInProgress = false;
      const safePlay = async () => {
        if (isPlayAttemptInProgress || !videoEl.srcObject) return;
        
        try {
          isPlayAttemptInProgress = true;
          console.log(`Attempting to play video for producer ${producerId}`);
          
          // Force display properties before attempting play
          if (kind === "video") {
            videoEl.style.display = 'block';
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.style.objectFit = 'cover';
            videoEl.style.visibility = 'visible';
            videoEl.style.opacity = '1';
          }
          
          // Try playing with a short timeout to ensure the browser is ready
          setTimeout(async () => {
            try {
              // Log readyState before playing
              console.log(`Videocomponents (${producerId}): ReadyState before play(): ${videoEl.readyState}`);
              
              const playPromise = videoEl.play();
              if (playPromise !== undefined) {
                playPromise.then(() => {
                  console.log(`Play promise resolved successfully for producer ${producerId}`);
                  console.log(`Video playing successfully for producer ${producerId}`);
                  setIsVideoLoaded(true);
                  setHasError(false);
                }).catch(error => {
                   console.error(`Play promise rejected for producer ${producerId}:`, { 
                     name: error.name, 
                     message: error.message, 
                     readyState: videoEl.readyState, 
                     networkState: videoEl.networkState, 
                     error: videoEl.error 
                   });
                  // Try one more time after a short delay
                  setTimeout(() => {
                    videoEl.play().catch(e => {
                      console.error(`Retry play failed for producer ${producerId}:`, e);
                      setHasError(true);
                      setErrorMessage(e.name === 'NotAllowedError' ? 
                        "Autoplay blocked. Click to play." : 
                        `Playback error: ${e.message}`);
                    });
                  }, 500);
                });
              } else {
                console.log(`Video play() did not return a promise for producer ${producerId}. Assuming success or relying on 'playing' event.`);
              }
            } catch (error) {
               console.error(`Play error for producer ${producerId}:`, { 
                 name: error.name, 
                 message: error.message, 
                 readyState: videoEl.readyState, 
                 networkState: videoEl.networkState, 
                 error: videoEl.error 
               });
               setHasError(true);
               setErrorMessage(error.name === 'NotAllowedError' ?
                 "Autoplay failed. Click to play." :
                 `Playback error: ${error.message}`);
              isPlayAttemptInProgress = false;
            }
          }, 100);
        } catch (error) {
          console.error(`Play error for producer ${producerId}:`, error.name, error.message);
          setHasError(true);
          setErrorMessage(error.name === 'NotAllowedError' ?
            "Autoplay failed. Click to play." :
            `Playback error: ${error.message}`);
          isPlayAttemptInProgress = false;
        }
      };

      // --- Consumer Event Listeners ---
      const handleProducerResume = () => {
        console.log(`Videocomponents (${producerId}): Received consumer.on('producerresume'). Attempting safePlay.`);
        safePlay(); // Attempt to play when producer resumes
      };
      const handleTrackEnded = () => {
        console.warn(`Videocomponents (${producerId}): Received consumer.on('trackended'). Video track likely stopped.`);
        setHasError(true);
        setErrorMessage('Video track ended unexpectedly.');
        setIsVideoLoaded(false); // Mark as not loaded
      };

      if (consumer) {
        consumer.on('producerresume', handleProducerResume);
        consumer.on('trackended', handleTrackEnded);
        cleanupEvents.push(() => {
          consumer.off('producerresume', handleProducerResume);
          consumer.off('trackended', handleTrackEnded);
        });
        // Log initial consumer paused state
        console.log(`Videocomponents (${producerId}): Initial consumer state - paused: ${consumer.paused}`);
      }
      // --------------------------------
      
      // --- Add Video Element Event Listeners --- 
      if (kind === "video") {
        const logEvent = (e) => console.log(`Video Event (${producerId}): ${e.type}`);
        const events = ['loadstart', 'progress', 'suspend', 'abort', 'error', 'emptied', 'stalled', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'waiting', 'seeking', 'seeked', 'ended', 'durationchange', 'timeupdate', 'play', 'pause', 'ratechange', 'resize', 'volumechange'];
        
        events.forEach(event => {
          videoEl.addEventListener(event, logEvent);
          cleanupEvents.push(() => videoEl.removeEventListener(event, logEvent));
        });

        const onPlaying = () => {
          console.log(`Video is actually PLAYING now for producer ${producerId}`);
          setIsVideoLoaded(true);
          setHasError(false); // Clear any previous error
        };

        const onError = (event) => {
          console.error(`Video Element Error Event for ${producerId}:`, event);
          console.error('Error code:', videoEl.error?.code, 'Message:', videoEl.error?.message);
          setHasError(true);
          setErrorMessage(`Video error: ${videoEl.error?.message || 'Unknown error'}`);
          // Request a keyframe if there's an error
          if (socket && serverConsumerId) {
            socket.emit('consumer-request-keyframe', { serverConsumerId });
          }
        };

        // *** IMPORTANT: Only call safePlay() when metadata is loaded ***
        const onLoadedMetadata = () => {
          console.log(`Video loadedmetadata for producer ${producerId} - ReadyState: ${videoEl.readyState}. Calling safePlay().`);
          safePlay();
        };

        videoEl.addEventListener('playing', onPlaying);
        videoEl.addEventListener('error', onError);
        videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
        
        cleanupEvents.push(() => videoEl.removeEventListener('playing', onPlaying));
        cleanupEvents.push(() => videoEl.removeEventListener('error', onError));
        cleanupEvents.push(() => videoEl.removeEventListener('loadedmetadata', onLoadedMetadata));

        // *** Check initial readyState *** 
        // If metadata is ALREADY loaded when this effect runs, call safePlay() 
        if (videoEl.readyState >= 1) { // HAVE_METADATA or higher
           console.log(`Videocomponents (${producerId}): Initial readyState is ${videoEl.readyState}. Calling safePlay() immediately.`);
           safePlay();
        } else {
            console.log(`Videocomponents (${producerId}): Initial readyState is ${videoEl.readyState}. Waiting for 'loadedmetadata' event.`);
        }
        
        // Style setting remains the same
         Object.assign(videoEl.style, {
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          visibility: 'visible'
        });
        
      } else if (kind === "audio") {
        // For audio tracks, we can still try to play immediately as readyState is less critical
        safePlay();
      }
      // ------------------------------------
      

      // --- Emit consumer-resume logic --- 
      // Only resume if the consumer is actually paused
      if (socket && serverConsumerId && consumer && consumer.paused) { 
        console.log(`Videocomponents (${producerId}): Setup complete & consumer initially paused. Requesting resume for consumer ${serverConsumerId}`);
        socket.emit("consumer-resume", { serverConsumerId });
      } else if (!consumer) {
          console.warn(`Videocomponents (${producerId}): Cannot request resume - consumer object missing.`);
      } else if (consumer && !consumer.paused) {
          console.log(`Videocomponents (${producerId}): Consumer started in unpaused state.`);
          // We don't call safePlay here anymore, rely on loadedmetadata or producerresume
      }
      // ---------------------------------------------

      return () => {
        console.log(`Cleaning up media for producer ${producerId}`);
        // Execute all cleanup functions
        cleanupEvents.forEach(cleanup => cleanup());
        
        // Clear video source
        if (videoEl) {
          videoEl.srcObject = null;
        }
        
        // Clear reference
        streamRef.current = null;
      };
    } catch (error) {
      console.error(`Error setting up media for producer ${producerId}:`, error);
      setHasError(true);
      setErrorMessage(`Setup error: ${error.message}`);
      return () => {
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        streamRef.current = null;
      };
    }
  }, [consumer, kind, producerId, serverConsumerId, socket]);

  useEffect(() => {
    if (!socket || !producerId || kind !== 'video') return;

    // Set up listeners for server-initiated recovery events
    const handleSyncRtpStreams = (data) => {
      if (data && data.producerId === producerId) {
        console.log(`Received sync-rtp-streams request for ${producerId}, performing advanced recovery`);
        // Execute advanced recovery techniques
        performAdvancedVideoRecovery();
      }
    };

    // Add the listener
    socket.on('sync-rtp-streams', handleSyncRtpStreams);

    // Cleanup listener when component unmounts
    return () => {
      socket.off('sync-rtp-streams', handleSyncRtpStreams);
    };
  }, [socket, producerId, kind]);

  const performAdvancedVideoRecovery = () => {
    if (!videoRef.current || !track) return;
    
    console.log(`Performing advanced video recovery for producer ${producerId}`);
    
    try {
      // Get the video element
      const videoElement = videoRef.current;
      
      // Try multiple techniques
      
      // 1. Force a pause/play cycle
      console.log(`Attempting pause/play cycle for producer ${producerId}`);
      videoElement.pause();
      setTimeout(() => {
        try {
          const playPromise = videoElement.play();
          if (playPromise) {
            playPromise.catch((error) => {
              console.warn(`Error during play: ${error}`);
            });
          }
          console.log(`Play initiated for producer ${producerId}`);
        } catch (error) {
          console.warn(`Error in play attempt: ${error}`);
        }
      }, 100);
      
      // 2. Try removing and re-adding the track
      setTimeout(() => {
        try {
          console.log(`Attempting track removal/re-add for producer ${producerId}`);
          const stream = videoElement.srcObject;
          if (stream) {
            // Store all tracks
            const tracks = stream.getTracks();
            
            // Create a new MediaStream
            const newStream = new MediaStream();
            
            // First remove all tracks
            tracks.forEach(track => {
              stream.removeTrack(track);
            });
            
            // Create a short delay
            setTimeout(() => {
              // Re-add all tracks to the new stream
              tracks.forEach(track => {
                newStream.addTrack(track);
              });
              
              // Set the new stream as source
              videoElement.srcObject = newStream;
              
              // Try to play the video again
              const playPromise = videoElement.play();
              if (playPromise) {
                playPromise.catch(error => {
                  console.warn(`Error playing video after track re-add: ${error}`);
                });
              }
              
              console.log(`Re-added tracks and attempted play for producer ${producerId}`);
            }, 100);
          }
        } catch (error) {
          console.warn(`Error during track manipulation: ${error}`);
        }
      }, 300);
      
      // 4. Nudge the video display by toggling CSS properties
      setTimeout(() => {
        try {
          console.log(`Attempting CSS transform nudge for producer ${producerId}`);
          const originalTransform = videoElement.style.transform;
          
          // Apply a very small transform to force a repaint
          videoElement.style.transform = 'translateZ(0)';
          
          // Reset back to original state
          setTimeout(() => {
            videoElement.style.transform = originalTransform;
          }, 50);
        } catch (error) {
          console.warn(`Error during CSS manipulation: ${error}`);
        }
      }, 700);
    } catch (error) {
      console.warn(`Error in advanced video recovery: ${error}`);
    }
  };

  // Simple stub that just does recovery without keyframe request
  const requestKeyframe = () => {
    if (socket && serverConsumerId) {
        console.log(`Requesting keyframe for consumer ${serverConsumerId} (Producer: ${producerId})`);
        socket.emit('consumer-request-keyframe', { serverConsumerId });
    } else {
        console.warn(`Cannot request keyframe for ${producerId}: socket or serverConsumerId missing.`);
    }
};

  const attemptVideoRecovery = () => {
    const videoElement = videoRef.current; // Get element reference
    // Check if element exists and track is valid before proceeding
    if (!videoElement || !track || track.readyState !== 'live') {
        console.warn(`Skipping video recovery for ${producerId}: Element or track not ready.`);
        return;
    }

    console.log(`Attempting video recovery for producer ${producerId}`);

    try {
      // Pause first
      videoElement.pause();

      // Wait a bit longer for pause to settle, then try play *if* paused
      setTimeout(() => {
        // Re-check element exists and is actually paused before playing
        // It's possible the component unmounted or state changed during the timeout
        if (videoRef.current && videoRef.current.paused) {
             console.log(`Recovery: Video is paused, attempting play for ${producerId}`);
             const playPromise = videoRef.current.play();
             if (playPromise !== undefined) {
                 playPromise.catch(error => {
                     // It's common to get AbortError here if user interacts fast or
                     // another process pauses/plays. Log other errors more seriously.
                     if (error.name !== 'AbortError') {
                         console.warn(`Error during recovery play() for ${producerId}: ${error.name} - ${error.message}`);
                     } else {
                         console.log(`Recovery play() aborted for ${producerId}, likely due to intervening action.`);
                     }
                 });
            }
        } else if (videoRef.current) {
             console.log(`Recovery: Video not paused for ${producerId} after timeout, skipping recovery play.`);
        } else {
             console.log(`Recovery: Video element disappeared during recovery timeout for ${producerId}.`);
        }
      }, 200); // Increased delay slightly to 200ms

    } catch (error) {
      // Catch potential errors from the initial pause() call, though less common
      console.warn(`Error during video recovery initiation for ${producerId}: ${error}`);
    }
  };

  // }, [track, producerId, socket, kind, serverConsumerId, consumerTransports]);

  const Videopactiy = contextSafe(() => {
    gsap.to(".VideoOverlay", {
      opacity: 1,
      duration: 0.5,
      display: "flex",
    });
  });

  const Videoresume = contextSafe(() => {
    gsap.to(".VideoOverlay", {
      opacity: 0,
      duration: 0.5,
      onComplete: () => {
        document.querySelector(".VideoOverlay").style.display = "none";
      },
    });
  });

  const handleManualPlay = () => {
    if (videoRef.current && hasError && kind === "video") {
      videoRef.current.play()
        .then(() => {
          setHasError(false);
          setErrorMessage("");
          setIsVideoLoaded(true);
          console.log(`Manual play succeeded for ${producerId}`);
          /* Commenting out keyframe request after manual play
          requestKeyframe();
          */
        })
        .catch(err => {
          console.error("Manual play failed:", err);
          setErrorMessage("Browser blocked autoplay");
        });
    }
  };

  const shortProducerId = producerId ? producerId.substring(0, 8) + "..." : "Unknown";

  // Add a new effect to handle connection state changes
  useEffect(() => {
    if (!socket || !producerId) return;
    
    // Listen for producer-closed events specific to this producer
    const handleProducerClosed = (data) => {
      if (data.remoteProducerId === producerId) {
        console.log(`Producer ${producerId} was closed on server, reason: ${data.reason || 'unknown'}`);
        
        // If this is the video component, we need to show disconnected state
        if (kind === 'video' && !isVideoPaused) {
          setIsVideoPaused(true);
          Videopactiy(); // Show the overlay
        }
        
        // Additional handling based on reason
        if (data.reason === 'peer-disconnect') {
          setErrorMessage('User disconnected');
          setHasError(true);
        } else if (data.reason === 'remote-close') {
          setErrorMessage('Connection closed by server');
          setHasError(true); 
        }
      }
    };

    socket.on('producer-closed', handleProducerClosed);
    
    return () => {
      socket.off('producer-closed', handleProducerClosed);
    };
  }, [socket, producerId, kind, isVideoPaused, Videopactiy]);

  // Add this new function after the performAdvancedVideoRecovery function
  const detectAndRecoverFromBlankVideo = () => {
    if (!videoRef.current || !track || kind !== 'video') return;
    
    const videoElement = videoRef.current;
    
    // If video has loaded metadata but is not playing, it might be stuck
    if (videoElement.readyState >= 1 && !isVideoLoaded) {
      console.log(`Detected potential blank video for ${producerId} - attempting recovery`);
      
      // Try playing the video
      videoElement.play().catch(e => console.log(`Recovery play attempt failed: ${e.message}`));
      
      // Force a style update to trigger repaint
      requestAnimationFrame(() => {
        videoElement.style.opacity = '0.99';
        
        // Reset opacity in next frame
        requestAnimationFrame(() => {
          videoElement.style.opacity = '1';
        });
      });
      
      // Request a keyframe
      if (socket && serverConsumerId) {
        socket.emit('consumer-request-keyframe', { serverConsumerId });
      }
    }
  };

  // Add this useEffect to monitor for blank video and try to recover
  useEffect(() => {
    if (kind !== 'video' || !track) return;
    
    // Check for blank video after a reasonable time
    const blankVideoTimer = setTimeout(() => {
      if (!isVideoLoaded && videoRef.current) {
        detectAndRecoverFromBlankVideo();
      }
    }, 3000);
    
    // Check again after a longer delay
    const secondCheckTimer = setTimeout(() => {
      if (!isVideoLoaded && videoRef.current) {
        console.log(`Video still not loaded after 8 seconds for ${producerId}`);
        performAdvancedVideoRecovery();
      }
    }, 8000);
    
    return () => {
      clearTimeout(blankVideoTimer);
      clearTimeout(secondCheckTimer);
    };
  }, [kind, track, isVideoLoaded, producerId]);

  return kind === "video" ? (
    <div 
      className="aspect-video bg-[#2f3136] rounded-lg overflow-hidden relative w-full max-w-[450px] max-md:max-w-[300px]"
      onClick={hasError ? handleManualPlay : !isVideoLoaded ? attemptVideoRecovery : undefined}
      ref={container}
      data-producer-id={producerId}
      data-kind={kind}
      style={{ minHeight: "240px" }}
    >
      {isVideoLoaded && videoStats.width > 0 && (
        <div className="absolute top-0 left-0 bg-black bg-opacity-50 text-xs text-white p-1 z-20">
          {videoStats.width}x{videoStats.height}
        </div>
      )}
      
      <video
        ref={videoRef}
        className="w-full h-full object-cover" 
        muted={true} 
        autoPlay
        playsInline
        style={{
          backgroundColor: "#1e1f22",
          minHeight: "100%",
          minWidth: "100%",
          objectPosition: "center",
          zIndex: 1,
          display: "block",
          opacity: 1
        }}
      />
      
      <div
        className="VideoOverlay absolute top-0 left-0 w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-10"
        style={{ display: isVideoPaused ? "flex" : "none", opacity: 0 }}
      >
        <div className="text-white text-lg">Video Paused</div>
      </div>
      
      {hasError && (
        <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-75 flex flex-col items-center justify-center z-10">
          <div className="text-white text-lg mb-2">{errorMessage}</div>
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded mb-2"
            onClick={handleManualPlay}
          >
            Play Video
          </button>
          <button 
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
            onClick={requestKeyframe}
          >
            Request New Frame
          </button>
        </div>
      )}
      
      {!isVideoLoaded && !hasError && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mb-2"></div>
            <div className="text-white text-sm mb-3">Loading video...</div>
            <button 
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
              onClick={attemptVideoRecovery}
            >
              Click to retry
            </button>
          </div>
        </div>
      )}
      
      <div className="absolute bottom-2 left-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white px-3 py-1 rounded-full text-sm shadow-lg z-10">
        Remote User ({shortProducerId})
      </div>
      
      <div className="absolute top-2 right-2 flex space-x-2 z-10">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-black bg-opacity-50 hover:bg-opacity-75"
          onClick={handleVideoToggle}
        >
          {isVideoPaused ? (
            <VideoOff className="h-4 w-4 text-white" />
          ) : (
            <Video className="h-4 w-4 text-white" />
          )}
        </Button>
      </div>
    </div>
  ) : (
    <div className="audio-container">
      <audio ref={videoRef} autoPlay muted={isMuted}></audio>
      <div className="p-2 bg-gray-700 text-white rounded-lg">
        Audio from Remote User ({shortProducerId})
        <Button
          variant="ghost"
          size="icon"
          className="ml-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75"
          onClick={handleMuteToggle}
        >
          {isMuted ? (
            <MicOff className="h-4 w-4 text-white" />
          ) : (
            <Mic className="h-4 w-4 text-white" />
          )}
        </Button>
      </div>
    </div>
  );
};

export default Videocomponents;
