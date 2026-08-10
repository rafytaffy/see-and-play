import React, { useEffect, useRef, useState } from 'react';
import { Camera, Sparkles, Settings, RotateCw, Mic, MicOff, PlusCircle } from 'lucide-react';
import { predict, getNumClasses } from '../utils/classifier';
import { getAllToys } from '../utils/db';
import { startVoiceListener, matchSpeechToVideo, isSpeechSupported } from '../utils/speech';

export default function PlayMode({ onManageToys, onRecognized, lastClosedToyId }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);
  
  const [facingMode, setFacingMode] = useState('environment'); // Default to back camera
  const [activeDetection, setActiveDetection] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toysCount, setToysCount] = useState(0);
  const [catalog, setCatalog] = useState([]);
  
  // Voice & Prompt States
  const [voiceActive, setVoiceActive] = useState(true);
  const [heardToast, setHeardToast] = useState(null);
  const [unrecognizedPrompt, setUnrecognizedPrompt] = useState(false);

  const consecutiveMatches = useRef(0);
  const lastPredictedLabel = useRef(null);
  const cooldownActive = useRef(false);
  const unrecognizedTimerRef = useRef(null);
  const voiceListenerRef = useRef(null);

  useEffect(() => {
    loadData();

    return () => {
      stopCamera();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (unrecognizedTimerRef.current) clearTimeout(unrecognizedTimerRef.current);
      if (voiceListenerRef.current) voiceListenerRef.current.stop();
    };
  }, []);

  // Re-start camera whenever facingMode changes
  useEffect(() => {
    startCamera(facingMode).then(() => setIsLoading(false));
  }, [facingMode]);

  const loadData = async () => {
    const toys = await getAllToys();
    const count = getNumClasses();
    setToysCount(count + toys.length);

    // Fetch video catalog for zero-shot and voice matching
    try {
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}videos-list.json`);
      if (res.ok) {
        const list = await res.json();
        setCatalog(list);
      }
    } catch (e) {
      console.error("Failed to load catalog in PlayMode:", e);
    }
  };

  useEffect(() => {
    if (videoRef.current && !isLoading) {
      if (lastClosedToyId) {
        cooldownActive.current = true;
        setTimeout(() => {
          cooldownActive.current = false;
          consecutiveMatches.current = 0;
          lastPredictedLabel.current = null;
        }, 2500);
      }
      
      startPredicting();
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [videoRef.current, isLoading, lastClosedToyId, catalog]);

  // Voice listener initialization
  useEffect(() => {
    if (!voiceActive || !isSpeechSupported()) {
      if (voiceListenerRef.current) voiceListenerRef.current.stop();
      return;
    }

    voiceListenerRef.current = startVoiceListener({
      onResult: async (transcript) => {
        if (cooldownActive.current) return;

        setHeardToast(`🎙️ Heard: "${transcript}"`);
        setTimeout(() => setHeardToast(null), 3000);

        // Match against local toys or video catalog
        const toys = await getAllToys();
        for (const toy of toys) {
          if (transcript.includes(toy.name.toLowerCase())) {
            onRecognized(toy.id);
            cooldownActive.current = true;
            return;
          }
        }

        const matchedCatalogItem = matchSpeechToVideo(transcript, catalog);
        if (matchedCatalogItem) {
          // Play built-in video directly out-of-the-box!
          onRecognized({
            id: matchedCatalogItem.id,
            name: matchedCatalogItem.defaultName,
            mediaType: 'video',
            isBuiltIn: true,
            mediaUrl: matchedCatalogItem.path
          });
          cooldownActive.current = true;
        }
      },
      onError: (err) => console.log("Voice listener error:", err),
      continuous: true
    });

    return () => {
      if (voiceListenerRef.current) voiceListenerRef.current.stop();
    };
  }, [voiceActive, catalog]);

  const startCamera = async (mode) => {
    stopCamera();
    const constraints = [
      // Try ideal constraint first
      { video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      // Fallback: exact facingMode, lower res
      { video: { facingMode: mode } },
      // Final fallback: any camera
      { video: true }
    ];

    let stream = null;
    for (const constraint of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        break;
      } catch (err) {
        console.warn('Camera constraint failed, trying next:', constraint, err.message);
      }
    }

    if (!stream) {
      console.error('All camera constraints failed.');
      return;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      // Wait for metadata to be loaded before playing (required on iOS Safari)
      await new Promise((resolve) => {
        const onLoaded = () => {
          videoRef.current.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        if (videoRef.current.readyState >= 1) {
          resolve();
        } else {
          videoRef.current.addEventListener('loadedmetadata', onLoaded);
        }
      });
      try {
        await videoRef.current.play();
      } catch (e) {
        console.warn('video.play() error (may be a benign iOS autoplay block):', e.message);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const toggleCamera = () => {
    setIsLoading(true);
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const startPredicting = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    const predictLoop = async () => {
      if (!videoRef.current || cooldownActive.current) {
        requestRef.current = requestAnimationFrame(predictLoop);
        return;
      }

      try {
        const res = await predict(videoRef.current);

        // LAYER 1: KNN Custom Trained Toy Match
        if (res && res.type === 'knn' && res.confidences) {
          const confidences = res.confidences;
          const predictedLabel = res.label;
          const confidence = confidences[predictedLabel];

          if (confidence > 0.85) {
            setUnrecognizedPrompt(false);
            if (predictedLabel === lastPredictedLabel.current) {
              consecutiveMatches.current += 1;
            } else {
              lastPredictedLabel.current = predictedLabel;
              consecutiveMatches.current = 1;
            }

            setActiveDetection(predictedLabel);

            if (consecutiveMatches.current >= 4) {
              onRecognized(predictedLabel);
              cooldownActive.current = true;
              setActiveDetection(null);
            }
          } else {
            consecutiveMatches.current = 0;
            lastPredictedLabel.current = null;
            setActiveDetection(null);
          }
        } 
        // LAYER 2: Out-of-the-Box Zero-Shot MobileNet Auto-Match
        else if (res && res.type === 'zeroshot' && res.label && res.probability > 0.35) {
          const matchedItem = matchSpeechToVideo(res.label, catalog);
          if (matchedItem) {
            setUnrecognizedPrompt(false);
            if (matchedItem.id === lastPredictedLabel.current) {
              consecutiveMatches.current += 1;
            } else {
              lastPredictedLabel.current = matchedItem.id;
              consecutiveMatches.current = 1;
            }

            setActiveDetection(matchedItem.defaultName);

            if (consecutiveMatches.current >= 4) {
              onRecognized({
                id: matchedItem.id,
                name: matchedItem.defaultName,
                mediaType: 'video',
                isBuiltIn: true,
                mediaUrl: matchedItem.path
              });
              cooldownActive.current = true;
              setActiveDetection(null);
            }
          } else {
            setUnrecognizedPrompt(true);
            setActiveDetection(null);
          }
        } else {
          setActiveDetection(null);
        }
      } catch (err) {
        console.error("Prediction loop error:", err);
      }

      requestRef.current = requestAnimationFrame(predictLoop);
    };

    requestRef.current = requestAnimationFrame(predictLoop);
  };

  return (
    <div className="play-mode-container">
      <div className="camera-fullscreen-container">
        {/* iOS requires playsinline and muted as JSX props, NOT via setAttribute */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="play-video-feed"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }}
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="loading-container" style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--bg-light)' }}>
            <Sparkles size={48} className="pulse-anim" style={{ color: 'var(--primary)' }} />
            <h2>Setting up magic lens...</h2>
          </div>
        )}

        {/* HUD Controls */}
        <div className="hud-overlay">
          <div className="hud-top">
            <button className="btn btn-secondary btn-icon-only glass-panel" onClick={onManageToys} title="Toy Manager">
              <Settings size={24} />
            </button>
            <span className="app-title-badge">See & Play 🦄</span>
            <div className="hud-right-actions">
              {isSpeechSupported() && (
                <button 
                  className={`btn btn-icon-only glass-panel ${voiceActive ? 'active-voice pulse-anim' : ''}`} 
                  onClick={() => setVoiceActive(!voiceActive)}
                  title={voiceActive ? "Voice Activated" : "Voice Off"}
                >
                  {voiceActive ? <Mic size={24} style={{ color: 'var(--primary)' }} /> : <MicOff size={24} />}
                </button>
              )}
              <button className="btn btn-secondary btn-icon-only glass-panel" onClick={toggleCamera} title="Switch Camera">
                <RotateCw size={24} />
              </button>
            </div>
          </div>

          {/* Voice Heard Toast Notification */}
          {heardToast && (
            <div className="voice-toast-alert card float-anim">
              {heardToast}
            </div>
          )}

          {/* Active Recognition Indicator */}
          {activeDetection && (
            <div className="active-detection-toast pulse-anim">
              <Sparkles size={24} />
              <span>Recognized: {activeDetection}!</span>
            </div>
          )}

          {/* Interactive Unrecognized Toy Prompt */}
          {unrecognizedPrompt && !activeDetection && (
            <div className="teach-me-banner card float-anim" onClick={onManageToys}>
              <PlusCircle size={28} style={{ color: 'var(--primary)' }} />
              <div>
                <h4>Is this a new toy? 🧸</h4>
                <p>Tap here to teach the app this toy!</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
