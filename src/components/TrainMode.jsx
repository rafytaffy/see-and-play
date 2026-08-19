import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Plus, RotateCw, ArrowLeft, Image, Video, Sparkles, CheckCircle, Search, Mic, Wand2, Download, Upload, HardDrive, RefreshCw, Smartphone } from 'lucide-react';
import { saveToy, getAllToys, deleteToy, syncToysWithViteServer, exportToysPack, importToysPack } from '../utils/db';
import { addExample, saveClassifier, clearClass, initClassifier, classifyZeroShot, reloadClassifierDataset } from '../utils/classifier';
import { startVoiceListener, matchSpeechToVideo, isSpeechSupported } from '../utils/speech';
import { preDownloadAllVideos, getCacheStats, getCachedVideoUrl } from '../utils/videoCache';

const DEFAULT_BUILT_IN_VIDEOS = [
  { id: 'cow', label: 'Cow 🐄', path: 'videos/cow.mp4', defaultName: 'Cow' },
  { id: 'lion', label: 'Lion 🦁', path: 'videos/lion.mp4', defaultName: 'Lion' },
  { id: 'elephant', label: 'Elephant 🐘', path: 'videos/elephant.mp4', defaultName: 'Elephant' },
  { id: 'dog', label: 'Dog 🐶', path: 'videos/dog.mp4', defaultName: 'Dog' },
  { id: 'cat', label: 'Cat 🐱', path: 'videos/cat.mp4', defaultName: 'Cat' },
  { id: 'dino', label: 'Dinosaur 🦖', path: 'videos/dino.mp4', defaultName: 'Dinosaur' },
  { id: 'monkey', label: 'Monkey 🐒', path: 'videos/monkey.mp4', defaultName: 'Monkey' },
  { id: 'sheep', label: 'Sheep 🐑', path: 'videos/sheep.mp4', defaultName: 'Sheep' },
  { id: 'duck', label: 'Duck 🦆', path: 'videos/duck.mp4', defaultName: 'Duck' }
];

export default function TrainMode({ onBack }) {
  const [toys, setToys] = useState([]);
  const [builtInVideos, setBuiltInVideos] = useState(DEFAULT_BUILT_IN_VIDEOS);
  
  // Creation States
  const [toyName, setToyName] = useState('Cow');
  const [sourceType, setSourceType] = useState('builtin'); // 'builtin' | 'upload'
  const [trainingMethod, setTrainingMethod] = useState('photo'); // 'video' | 'photo'
  const [selectedBuiltInPath, setSelectedBuiltInPath] = useState(DEFAULT_BUILT_IN_VIDEOS[0].path);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState('image'); // 'image' | 'video'
  const [mediaPreview, setMediaPreview] = useState(null);
  
  const [currentToyId, setCurrentToyId] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' or 'environment'
  const [samplesCount, setSamplesCount] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState([]); // Multi-photo snapshot list
  const [isTraining, setIsTraining] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [autoDetectBadge, setAutoDetectBadge] = useState(null);
  const [isVoiceSearching, setIsVoiceSearching] = useState(false);

  // Video Caching & Multi-Device Sync States
  const [cacheStats, setCacheStats] = useState({ count: 0, total: 0, isComplete: false });
  const [isCachingVideos, setIsCachingVideos] = useState(false);
  const [cachingProgress, setCachingProgress] = useState({ current: 0, total: 0 });
  const [isSyncingPC, setIsSyncingPC] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trainingIntervalRef = useRef(null);
  const voiceListenerRef = useRef(null);

  useEffect(() => {
    loadToys();
    initClassifier().then(() => setIsLoadingModel(false));

    const fetchCatalog = async () => {
      try {
        const base = import.meta.env.BASE_URL || '/';
        const response = await fetch(`${base}videos-list.json`);
        if (response.ok) {
          const catalog = await response.json();
          if (catalog && catalog.length > 0) {
            setBuiltInVideos(catalog);
            setSelectedBuiltInPath(catalog[0].path);
            setToyName(catalog[0].defaultName);

            // Check cache stats for catalog
            const stats = await getCacheStats(catalog);
            setCacheStats(stats);
          }
        }
      } catch (err) {
        console.error("Failed to fetch videos-list.json, using defaults.", err);
      }
    };
    fetchCatalog();

    return () => {
      stopCamera();
      if (trainingIntervalRef.current) clearInterval(trainingIntervalRef.current);
      if (voiceListenerRef.current) voiceListenerRef.current.stop();
    };
  }, []);

  useEffect(() => {
    if (cameraActive) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [cameraActive, facingMode]);

  const loadToys = async () => {
    const list = await getAllToys();
    setToys(list);
  };

  const handleMediaChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMediaFile(file);
      const isVideo = file.type.startsWith('video/');
      setMediaType(isVideo ? 'video' : 'image');
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    stopCamera();
    const constraints = [
      { video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: { facingMode: facingMode } },
      { video: true }
    ];

    let stream = null;
    for (const constraint of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        break;
      } catch (err) {
        console.warn('Camera constraint failed in TrainMode:', err.message);
      }
    }

    if (!stream) {
      alert("Could not access camera. Please check permissions.");
      setCameraActive(false);
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
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
        console.warn('video.play() error in TrainMode:', e.message);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleStartSetup = () => {
    if (!toyName.trim()) {
      alert("Please enter a name for the toy!");
      return;
    }
    if (sourceType === 'upload' && !mediaFile) {
      alert("Please upload a photo or video first!");
      return;
    }
    setCurrentToyId('toy_' + Date.now());
    setSamplesCount(0);
    setCapturedPhotos([]);
    setCameraActive(true);
  };

  const toggleFacingMode = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // Zero-Shot AI Auto-Detection of Toy Animal
  const handleAutoDetectAnimal = async () => {
    if (!videoRef.current) return;
    try {
      const predictions = await classifyZeroShot(videoRef.current);
      if (predictions && predictions.length > 0) {
        const top = predictions[0];
        console.log("Zero-shot raw prediction:", top);
        
        const matchedVideo = matchSpeechToVideo(top.className, builtInVideos);
        if (matchedVideo) {
          setSelectedBuiltInPath(matchedVideo.path);
          setToyName(matchedVideo.defaultName);
          setAutoDetectBadge(`✨ AI Auto-Detected: ${matchedVideo.label}`);
          setTimeout(() => setAutoDetectBadge(null), 4000);
        } else {
          // Format raw name nicely
          const cleanName = top.className.split(',')[0];
          setToyName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
          setAutoDetectBadge(`✨ Recognized: ${cleanName}`);
          setTimeout(() => setAutoDetectBadge(null), 4000);
        }
      }
    } catch (err) {
      console.error("Auto detect failed:", err);
    }
  };

  const startTrainingLoop = () => {
    if (isTraining || !videoRef.current || !currentToyId) return;
    setIsTraining(true);
    
    trainingIntervalRef.current = setInterval(async () => {
      try {
        if (videoRef.current) {
          await addExample(currentToyId, videoRef.current);
          setSamplesCount(prev => {
            const next = prev + 1;
            if (next >= 100) {
              stopTrainingLoop();
              return 100;
            }
            return next;
          });
        }
      } catch (err) {
        console.error("Training error:", err);
      }
    }, 100);
  };

  const stopTrainingLoop = () => {
    setIsTraining(false);
    if (trainingIntervalRef.current) {
      clearInterval(trainingIntervalRef.current);
      trainingIntervalRef.current = null;
    }
  };

  // Train via Multi-Photo Snapshots (Each Photo generates 25 Augmented Variations)
  const handleSnapPhoto = async () => {
    if (!videoRef.current || !currentToyId) return;
    setIsTraining(true);

    try {
      // 1. Capture current photo snapshot frame
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = 224;
      snapCanvas.height = 224;
      const snapCtx = snapCanvas.getContext('2d');
      snapCtx.drawImage(videoRef.current, 0, 0, 224, 224);

      const dataUrl = snapCanvas.toDataURL('image/png');
      setCapturedPhotos(prev => [...prev, dataUrl]);

      // 2. Generate 25 augmented variations for this specific photo angle
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 224;
      canvas.height = 224;

      const augmentations = [
        { rotate: 0, scale: 1.0, tx: 0, ty: 0 },
        { rotate: -5, scale: 1.0, tx: 0, ty: 0 },
        { rotate: 5, scale: 1.0, tx: 0, ty: 0 },
        { rotate: -10, scale: 0.95, tx: -5, ty: -5 },
        { rotate: 10, scale: 0.95, tx: 5, ty: 5 },
        { rotate: 0, scale: 1.1, tx: 0, ty: 0 },
        { rotate: 0, scale: 0.9, tx: 0, ty: 0 },
        { rotate: -15, scale: 1.05, tx: 5, ty: -5 },
        { rotate: 15, scale: 1.05, tx: -5, ty: 5 },
        { rotate: 0, scale: 1.0, tx: 10, ty: 0 },
        { rotate: 0, scale: 1.0, tx: -10, ty: 0 },
        { rotate: 0, scale: 1.0, tx: 0, ty: 10 },
        { rotate: 0, scale: 1.0, tx: 0, ty: -10 },
        { rotate: -8, scale: 1.08, tx: -3, ty: 3 },
        { rotate: 8, scale: 1.08, tx: 3, ty: -3 },
        { rotate: -12, scale: 0.92, tx: 4, ty: -4 },
        { rotate: 12, scale: 0.92, tx: -4, ty: 4 },
        { rotate: -3, scale: 1.12, tx: -2, ty: -2 },
        { rotate: 3, scale: 1.12, tx: 2, ty: 2 },
        { rotate: 0, scale: 0.85, tx: 0, ty: 0 },
        { rotate: 0, scale: 1.15, tx: 0, ty: 0 },
        { rotate: -6, scale: 1.0, tx: 8, ty: -8 },
        { rotate: 6, scale: 1.0, tx: -8, ty: 8 },
        { rotate: -14, scale: 1.02, tx: -6, ty: 6 },
        { rotate: 14, scale: 1.02, tx: 6, ty: -6 }
      ];

      for (let i = 0; i < augmentations.length; i++) {
        const aug = augmentations[i];
        ctx.clearRect(0, 0, 224, 224);
        ctx.save();
        ctx.translate(112 + aug.tx, 112 + aug.ty);
        ctx.rotate((aug.rotate * Math.PI) / 180);
        ctx.scale(aug.scale, aug.scale);
        ctx.drawImage(snapCanvas, -112, -112, 224, 224);
        ctx.restore();

        await addExample(currentToyId, canvas);
        setSamplesCount(prev => prev + 1);
      }
    } catch (err) {
      console.error("Multi-photo snap training error:", err);
    } finally {
      setIsTraining(false);
    }
  };

  const handleToggleVoiceSearch = () => {
    if (isVoiceSearching) {
      if (voiceListenerRef.current) voiceListenerRef.current.stop();
      setIsVoiceSearching(false);
    } else {
      setIsVoiceSearching(true);
      voiceListenerRef.current = startVoiceListener({
        onResult: (transcript) => {
          setVideoSearchQuery(transcript);
          const matched = matchSpeechToVideo(transcript, builtInVideos);
          if (matched) {
            setSelectedBuiltInPath(matched.path);
            setToyName(matched.defaultName);
          }
          setIsVoiceSearching(false);
        },
        onError: () => setIsVoiceSearching(false),
        onEnd: () => setIsVoiceSearching(false),
        continuous: false
      });
    }
  };

  // Pre-download all videos for weak connections / offline play
  const handlePreDownloadVideos = async () => {
    setIsCachingVideos(true);
    setCachingProgress({ current: 0, total: builtInVideos.length });

    try {
      await preDownloadAllVideos(builtInVideos, (curr, tot) => {
        setCachingProgress({ current: curr, total: tot });
      });
      const stats = await getCacheStats(builtInVideos);
      setCacheStats(stats);
      alert(`Success! ${stats.count} videos stored locally for offline play!`);
    } catch (err) {
      console.error("Caching error:", err);
      alert("Failed to pre-download videos. Please check connection.");
    } finally {
      setIsCachingVideos(false);
    }
  };

  // Export AI toys pack file
  const handleExportPack = async () => {
    try {
      await exportToysPack();
    } catch (err) {
      console.error("Export pack error:", err);
      alert("Failed to export pack file.");
    }
  };

  // Import AI toys pack file
  const handleImportPackFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const importedCount = await importToysPack(payload);
      await reloadClassifierDataset();
      await loadToys();
      alert(`Successfully imported ${importedCount} toys & AI training dataset!`);
    } catch (err) {
      console.error("Import error:", err);
      alert("Failed to import toys pack file. Please make sure it's a valid see-and-play JSON file.");
    }
    e.target.value = '';
  };

  // Sync to PC Server / Cloud
  const handleSyncToPC = async () => {
    setIsSyncingPC(true);
    try {
      await syncToysWithViteServer();
      alert("Toys & AI training synced successfully! Deploying to all devices...");
    } catch (err) {
      console.error("Sync to PC failed:", err);
      alert(`Sync failed: ${err.message}. Make sure you are connected to the home local server!`);
    } finally {
      setIsSyncingPC(false);
    }
  };

  const handleSaveToy = async () => {
    if (samplesCount < 10) {
      alert("Please capture at least 1 photo angle or 10 training frames so the app can recognize the toy!");
      return;
    }

    try {
      await saveClassifier();
      
      const toyData = {
        id: currentToyId,
        name: toyName,
        mediaType: sourceType === 'builtin' ? 'video' : mediaType,
        isBuiltIn: sourceType === 'builtin',
        mediaBlob: sourceType === 'builtin' ? null : mediaFile,
        mediaUrl: sourceType === 'builtin' ? selectedBuiltInPath : null,
        addedAt: Date.now()
      };
      
      await saveToy(toyData);

      // Automatically sync with local server in dev mode
      const isLocalDev = 
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' || 
        /^10\.\d+\.\d+\.\d+$/.test(window.location.hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+$/.test(window.location.hostname) ||
        /^192\.168\.\d+\.\d+$/.test(window.location.hostname);
        
      if (isLocalDev) {
        console.log("Triggering auto-sync to local Vite server...");
        await syncToysWithViteServer().catch(err => console.error("Auto-sync failed on save:", err));
      }

      // Reset form
      setToyName(builtInVideos[0]?.defaultName || 'Cow');
      setSourceType('builtin');
      setSelectedBuiltInPath(builtInVideos[0]?.path || DEFAULT_BUILT_IN_VIDEOS[0].path);
      setMediaFile(null);
      setMediaPreview(null);
      setCurrentToyId(null);
      setSamplesCount(0);
      setCapturedPhotos([]);
      setCameraActive(false);
      stopCamera();

      loadToys();
      alert("Toy saved successfully! It is now ready to play.");
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save toy.");
    }
  };

  const handleDeleteToy = async (id, name) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      await deleteToy(id);
      await clearClass(id);
      loadToys();
    }
  };

  const getBuiltInPreviewUrl = (path) => {
    const base = import.meta.env.BASE_URL || '/';
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${base}${cleanPath}`;
  };

  const filteredVideos = builtInVideos.filter(v => 
    v.label.toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
    v.defaultName.toLowerCase().includes(videoSearchQuery.toLowerCase())
  );

  if (isLoadingModel) {
    return (
      <div className="loading-container">
        <Sparkles size={48} className="pulse-anim" style={{ color: 'var(--primary)' }} />
        <h2>Loading AI Models...</h2>
        <p>This may take a moment on first load.</p>
      </div>
    );
  }

  return (
    <div className="train-mode-container">
      <header className="train-header">
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={20} /> Back to Play
        </button>
        <h1>Toy Manager</h1>
      </header>

      <div className="train-grid">
        {/* Creation Box */}
        <section className="card form-card">
          <h2><Plus size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Add New Toy</h2>
          
          {!currentToyId ? (
            <div className="form-group-stack">
              {/* Segmented Control */}
              <div className="segmented-control">
                <button 
                  type="button" 
                  className={`control-btn ${sourceType === 'builtin' ? 'active' : ''}`}
                  onClick={() => {
                    setSourceType('builtin');
                    const match = builtInVideos.find(v => v.path === selectedBuiltInPath);
                    if (match) setToyName(match.defaultName);
                  }}
                >
                  Built-in Video
                </button>
                <button 
                  type="button" 
                  className={`control-btn ${sourceType === 'upload' ? 'active' : ''}`}
                  onClick={() => {
                    setSourceType('upload');
                    setToyName('');
                    setMediaFile(null);
                    setMediaPreview(null);
                  }}
                >
                  Upload Custom File
                </button>
              </div>

              <div className="form-group">
                <label>What is this toy called?</label>
                <input 
                  type="text" 
                  value={toyName} 
                  onChange={(e) => setToyName(e.target.value)}
                  placeholder="e.g. Teddy Bear, Blue Dinosaur"
                  className="toy-input"
                />
              </div>

              {sourceType === 'builtin' ? (
                <>
                  <div className="form-group">
                    <label>Select Video ({builtInVideos.length} Available)</label>
                    
                    {/* Search & Voice Filter Bar */}
                    <div className="video-search-bar">
                      <Search size={18} className="search-icon" />
                      <input 
                        type="text" 
                        placeholder="Search animal video (e.g. Tiger, Duck)..." 
                        value={videoSearchQuery}
                        onChange={(e) => setVideoSearchQuery(e.target.value)}
                        className="video-search-input"
                      />
                      {isSpeechSupported() && (
                        <button 
                          type="button" 
                          className={`btn btn-mic-search ${isVoiceSearching ? 'listening pulse-anim' : ''}`}
                          onClick={handleToggleVoiceSearch}
                          title="Search by voice"
                        >
                          <Mic size={18} />
                        </button>
                      )}
                    </div>

                    {/* Scrollable Visual Video Gallery */}
                    <div className="video-picker-grid">
                      {filteredVideos.map(v => {
                        const isSelected = v.path === selectedBuiltInPath;
                        return (
                          <div 
                            key={v.id} 
                            className={`video-card-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedBuiltInPath(v.path);
                              setToyName(v.defaultName);
                            }}
                          >
                            <div className="video-card-thumbnail-wrapper">
                              <video 
                                src={getBuiltInPreviewUrl(v.path)} 
                                preload="metadata" 
                                muted 
                                playsInline 
                                className="video-card-thumbnail"
                              />
                            </div>
                            <span className="video-card-label">{v.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="preview-container">
                    <video 
                      key={selectedBuiltInPath}
                      src={getBuiltInPreviewUrl(selectedBuiltInPath)} 
                      controls 
                      muted 
                      className="media-thumbnail-preview" 
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Upload what plays when recognized (Photo or Video)</label>
                    <div className="file-uploader">
                      <input 
                        type="file" 
                        accept="image/*,video/*" 
                        onChange={handleMediaChange}
                        id="media-upload-input"
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="media-upload-input" className="btn btn-secondary btn-file-label">
                        {mediaType === 'video' ? <Video size={20} /> : <Image size={20} />}
                        Choose Image/Video
                      </label>
                      {mediaFile && <span className="filename-indicator">{mediaFile.name}</span>}
                    </div>
                  </div>

                  {mediaPreview && (
                    <div className="preview-container">
                      {mediaType === 'video' ? (
                        <video src={mediaPreview} controls className="media-thumbnail-preview" />
                      ) : (
                        <img src={mediaPreview} alt="Preview" className="media-thumbnail-preview" />
                      )}
                    </div>
                  )}
                </>
              )}

              <button className="btn btn-primary" onClick={handleStartSetup}>
                Next: Train Toy Camera
              </button>
            </div>
          ) : (
            <div className="training-active-stack">
              <h3>Training: {toyName}</h3>

              {autoDetectBadge && (
                <div className="auto-detect-badge pulse-anim">
                  {autoDetectBadge}
                </div>
              )}
              
              <div className="camera-view-wrapper">
                <video ref={videoRef} autoPlay playsInline muted className="training-video-feed" />
                <button className="btn btn-secondary btn-camera-toggle" onClick={toggleFacingMode}>
                  <RotateCw size={18} /> Switch Camera
                </button>
              </div>

              {/* Training Method Selector */}
              <div className="training-method-bar">
                <button 
                  type="button"
                  className={`btn ${trainingMethod === 'photo' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTrainingMethod('photo')}
                >
                  <Camera size={16} /> Photos / Angles (Snap Multi)
                </button>
                <button 
                  type="button"
                  className={`btn ${trainingMethod === 'video' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTrainingMethod('video')}
                >
                  <Video size={16} /> Record Motion (Hold)
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary btn-auto-detect"
                  onClick={handleAutoDetectAnimal}
                  title="Auto-detect animal name & video"
                >
                  <Wand2 size={16} /> AI Auto-Detect
                </button>
              </div>

              {/* Snapped Photos Gallery Preview */}
              {capturedPhotos.length > 0 && (
                <div className="photo-gallery-preview" style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 0' }}>
                  {capturedPhotos.map((src, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--primary)', flexShrink: 0 }}>
                      <img src={src} alt={`Angle ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <span style={{ position: 'absolute', bottom: 2, right: 4, background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '10px', padding: '1px 4px', borderRadius: '4px' }}>
                        #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="training-controls">
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${Math.min(samplesCount, 100)}%` }}></div>
                  <span className="progress-label">{samplesCount} AI Training Frames ({capturedPhotos.length} Photo Angles)</span>
                </div>

                {trainingMethod === 'photo' ? (
                  <button 
                    className="btn btn-primary btn-record-hold"
                    onClick={handleSnapPhoto}
                    disabled={isTraining}
                  >
                    <Camera size={24} /> {isTraining ? 'Augmenting Image...' : `📸 Snap Photo Angle (${capturedPhotos.length} Taken)`}
                  </button>
                ) : (
                  <button 
                    className={`btn btn-primary btn-record-hold ${isTraining ? 'recording pulse-anim' : ''}`}
                    onMouseDown={startTrainingLoop}
                    onMouseUp={stopTrainingLoop}
                    onMouseLeave={stopTrainingLoop}
                    onTouchStart={startTrainingLoop}
                    onTouchEnd={stopTrainingLoop}
                  >
                    <Camera size={24} /> {isTraining ? 'Recording...' : 'Press & Hold to Record'}
                  </button>
                )}

                <div className="training-save-buttons">
                  <button className="btn btn-success" onClick={handleSaveToy} disabled={samplesCount < 10}>
                    <CheckCircle size={20} /> Save Toy ({samplesCount} frames)
                  </button>
                  <button className="btn btn-danger" onClick={() => {
                    setCurrentToyId(null);
                    setSamplesCount(0);
                    setCapturedPhotos([]);
                    setCameraActive(false);
                    stopCamera();
                  }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Multi-Device Sync & Offline Video Download Tools */}
        <section className="card sync-card">
          <h2><HardDrive size={24} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary)' }} /> Offline Videos & Device Sync</h2>
          
          <div className="sync-section-stack">
            {/* Offline Videos Manager */}
            <div className="sync-block">
              <h4>⚡ Offline Video Cache ({cacheStats.count} / {cacheStats.total} Saved)</h4>
              <p className="sync-help-text">Store all 94 animal videos directly on this device so they play instantly even on weak internet!</p>
              
              {isCachingVideos ? (
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${(cachingProgress.current / cachingProgress.total) * 100}%` }}></div>
                  <span className="progress-label">Caching Videos: {cachingProgress.current} / {cachingProgress.total}</span>
                </div>
              ) : (
                <button className="btn btn-secondary btn-full-width" onClick={handlePreDownloadVideos}>
                  <Download size={18} /> {cacheStats.isComplete ? 'Re-Download / Update Local Videos' : 'Pre-Download All Videos for Offline Play'}
                </button>
              )}
            </div>

            <hr className="divider-line" />

            {/* Cross-Device AI Toys Sync */}
            <div className="sync-block">
              <h4>📱 Sync AI Toys Across Devices</h4>
              <p className="sync-help-text">Share trained toys and AI learning vectors across your Phone, iPad, and Computer.</p>
              
              <div className="sync-actions-grid">
                <button className="btn btn-secondary" onClick={handleExportPack}>
                  <Download size={18} /> Export Toys Pack (.json)
                </button>

                <label className="btn btn-secondary btn-file-label">
                  <Upload size={18} /> Import Toys Pack
                  <input 
                    type="file" 
                    accept=".json,application/json" 
                    onChange={handleImportPackFile}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <button className="btn btn-primary btn-full-width" onClick={handleSyncToPC} disabled={isSyncingPC} style={{ marginTop: '10px' }}>
                <Smartphone size={18} /> {isSyncingPC ? 'Syncing to Cloud/PC...' : 'Sync AI Toys to Home PC & Cloud'}
              </button>
            </div>
          </div>
        </section>

        {/* Existing Toys List */}
        <section className="card list-card">
          <h2><Sparkles size={24} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--warning)' }} /> My Custom Toys ({toys.length})</h2>
          
          {toys.length === 0 ? (
            <div className="empty-toys-state">
              <p>No custom toys trained yet. The app will automatically recognize standard animals out-of-the-box, or you can add a custom toy above!</p>
            </div>
          ) : (
            <div className="toys-grid">
              {toys.map((toy) => (
                <div key={toy.id} className="toy-card-item">
                  <div className="toy-card-info">
                    <h4>{toy.name}</h4>
                    <span className="toy-card-meta">
                      {toy.isBuiltIn ? 'Built-in video' : toy.mediaType === 'video' ? 'Video reward' : 'Photo reward'}
                    </span>
                  </div>
                  <button 
                    className="btn btn-danger btn-delete-toy" 
                    onClick={() => handleDeleteToy(toy.id, toy.name)}
                    title="Delete toy"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
