import React, { useState, useEffect, useRef } from 'react';
import { Settings, RotateCw, Sparkles, AlertCircle } from 'lucide-react';
import { predict, initClassifier, getNumClasses } from '../utils/classifier';
import { getAllToys } from '../utils/db';

export default function PlayMode({ onManageToys, onRecognized, lastClosedToyId }) {
  const [facingMode, setFacingMode] = useState('environment'); // 'user' or 'environment'
  const [isLoading, setIsLoading] = useState(true);
  const [toysCount, setToysCount] = useState(0);
  const [activeDetection, setActiveDetection] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);
  
  // Stabilization ref values
  const consecutiveMatches = useRef(0);
  const lastPredictedLabel = useRef(null);
  const cooldownActive = useRef(false);

  // Initialize and load classifier / toys
  useEffect(() => {
    const setup = async () => {
      try {
        await initClassifier();
        const toys = await getAllToys();
        setToysCount(toys.length);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed initializing play mode:", err);
      }
    };
    setup();

    return () => {
      stopCamera();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Control camera startup
  useEffect(() => {
    if (!isLoading && toysCount > 0) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isLoading, toysCount, facingMode]);

  // Restart predicting loop if camera/video is ready
  useEffect(() => {
    if (videoRef.current && !isLoading && toysCount > 0) {
      // Cooldown reset if a media overlay was closed
      if (lastClosedToyId) {
        cooldownActive.current = true;
        setTimeout(() => {
          cooldownActive.current = false;
          consecutiveMatches.current = 0;
          lastPredictedLabel.current = null;
        }, 2500); // 2.5s cooldown after user closes media overlay
      }
      
      startPredicting();
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [videoRef.current, isLoading, toysCount, lastClosedToyId]);

  const startCamera = async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(e => console.error("Error playing standard camera feed:", e));
      }
    } catch (err) {
      console.error("Failed to start camera in PlayMode with preferred constraints:", err);
      // Fallback to default camera constraints if environment/specific size fails
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.muted = true;
          videoRef.current.play().catch(e => console.error("Error playing fallback camera feed:", e));
        }
      } catch (e) {
        console.error("Camera access failed completely:", e);
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
        if (res && res.confidences) {
          const confidences = res.confidences;
          const predictedLabel = res.label;
          const confidence = confidences[predictedLabel];

          // 85% confidence threshold for toddler proofing
          if (confidence > 0.85) {
            if (predictedLabel === lastPredictedLabel.current) {
              consecutiveMatches.current += 1;
            } else {
              lastPredictedLabel.current = predictedLabel;
              consecutiveMatches.current = 1;
            }

            // Show active detection name (e.g. pulsing outline)
            setActiveDetection(predictedLabel);

            // Require 4 consecutive matches (about 400ms stabilization)
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

  if (isLoading) {
    return (
      <div className="loading-container">
        <Sparkles size={48} className="pulse-anim" style={{ color: 'var(--primary)' }} />
        <h2>Setting up magic lens...</h2>
      </div>
    );
  }

  return (
    <div className="play-mode-container">
      {toysCount === 0 ? (
        <div className="no-toys-container card float-anim">
          <AlertCircle size={64} style={{ color: 'var(--primary)' }} />
          <h2>Welcome to See and Play!</h2>
          <p>You don't have any toys set up yet. Pointing the camera won't recognize anything until you teach it a toy.</p>
          <button className="btn btn-primary" onClick={onManageToys}>
            <Settings size={20} /> Teach a Toy Now
          </button>
        </div>
      ) : (
        <div className="camera-fullscreen-container">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`play-video-feed ${activeDetection ? 'detecting-highlight' : ''}`}
          />
          
          {/* Toddler HUD Overlay */}
          <div className="hud-overlay-top">
            <button className="btn btn-secondary btn-icon-round" onClick={onManageToys}>
              <Settings size={24} />
            </button>
            <button className="btn btn-secondary btn-icon-round" onClick={toggleCamera}>
              <RotateCw size={24} />
            </button>
          </div>

          <div className="hud-overlay-bottom">
            <div className="scanning-indicator pulse-anim">
              <Sparkles size={24} style={{ color: 'var(--warning)', marginRight: '8px' }} />
              <span>Show me a toy!</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
