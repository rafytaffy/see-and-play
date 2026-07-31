import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Plus, Save, RotateCw, ArrowLeft, Image, Video, Sparkles, CheckCircle } from 'lucide-react';
import { saveToy, getAllToys, deleteToy, syncToysWithViteServer } from '../utils/db';
import { addExample, saveClassifier, clearClass, initClassifier } from '../utils/classifier';

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
  const [selectedBuiltInPath, setSelectedBuiltInPath] = useState(DEFAULT_BUILT_IN_VIDEOS[0].path);
  
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState('image'); // 'image' | 'video'
  const [mediaPreview, setMediaPreview] = useState(null);
  
  const [currentToyId, setCurrentToyId] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' or 'environment'
  const [samplesCount, setSamplesCount] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(true);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trainingIntervalRef = useRef(null);

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
    };
  }, []);

  // Update default name when built-in path changes
  useEffect(() => {
    if (sourceType === 'builtin') {
      const match = builtInVideos.find(v => v.path === selectedBuiltInPath);
      if (match) {
        setToyName(match.defaultName);
      }
    }
  }, [selectedBuiltInPath, sourceType, builtInVideos]);

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: 640, height: 480 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(err => console.error("Error playing video feed:", err));
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
      setCameraActive(false);
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
    setCameraActive(true);
  };

  const toggleFacingMode = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
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

  const handleSaveToy = async () => {
    if (samplesCount < 10) {
      alert("Please capture at least 10 training frames so the app can recognize the toy!");
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
                    <label>Choose built-in animal video</label>
                    <select 
                      value={selectedBuiltInPath} 
                      onChange={(e) => setSelectedBuiltInPath(e.target.value)}
                      className="toy-select"
                    >
                      {builtInVideos.map(v => (
                        <option key={v.id} value={v.path}>{v.label}</option>
                      ))}
                    </select>
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
              
              <div className="camera-view-wrapper">
                <video ref={videoRef} autoPlay playsInline muted className="training-video-feed" />
                <button className="btn btn-secondary btn-camera-toggle" onClick={toggleFacingMode}>
                  <RotateCw size={18} /> Switch Camera
                </button>
              </div>

              <div className="training-controls">
                <p className="instruction-text">
                  Hold down the button below while rotating and moving the toy in front of the camera!
                </p>
                
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${samplesCount}%` }}></div>
                  <span className="progress-label">{samplesCount} / 100 Frames</span>
                </div>

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

                <div className="training-save-buttons">
                  <button className="btn btn-success" onClick={handleSaveToy} disabled={samplesCount < 10}>
                    <CheckCircle size={20} /> Save Toy ({samplesCount} frames)
                  </button>
                  <button className="btn btn-danger" onClick={() => {
                    setCurrentToyId(null);
                    setSamplesCount(0);
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

        {/* Existing Toys List */}
        <section className="card list-card">
          <h2><Sparkles size={24} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--warning)' }} /> My Toys ({toys.length})</h2>
          
          {toys.length === 0 ? (
            <div className="empty-toys-state">
              <p>No toys trained yet! Add one above to get started.</p>
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
