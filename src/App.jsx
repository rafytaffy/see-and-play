import React, { useState, useEffect, useRef } from 'react';
import PlayMode from './components/PlayMode';
import TrainMode from './components/TrainMode';
import MediaOverlay from './components/MediaOverlay';
import { getAllToys, saveToy, saveClassifierDataset, syncToysWithViteServer } from './utils/db';
import { initClassifier } from './utils/classifier';
import { Sparkles, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export default function App() {
  const [view, setView] = useState('play'); // 'play' | 'manage'
  const [activeToy, setActiveToy] = useState(null);
  const [lastClosedToyId, setLastClosedToyId] = useState(null);
  
  // Sync States
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'success' | 'error'
  const iframeRef = useRef(null);

  // Check if we are running in the local network dev server
  const isLocalDev = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    /^10\.\d+\.\d+\.\d+$/.test(window.location.hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+$/.test(window.location.hostname) ||
    /^192\.168\.\d+\.\d+$/.test(window.location.hostname);

  useEffect(() => {
    if (!isLocalDev) return;

    const handleSyncMessage = async (event) => {
      // Security Check: Only accept messages from your official GitHub Pages origin
      if (event.origin !== 'https://rafytaffy.github.io') return;

      if (event.data && event.data.type === 'SYNC_DATA_RESPONSE') {
        const { toys, datasetJson } = event.data.data;
        if (toys && toys.length > 0) {
          console.log(`Sync Bridge: Received ${toys.length} toys from live origin.`);
          
          setSyncStatus('syncing');
          try {
            // 1. Save all toys metadata to local IndexedDB
            for (const toy of toys) {
              await saveToy(toy);
            }
            
            // 2. Save and reload classifier dataset
            if (datasetJson) {
              await saveClassifierDataset(datasetJson);
              await initClassifier(); // re-initialize models to pick up merged tensors
            }

            // 3. Post to PC server to save to public folder and trigger background git deploy
            await syncToysWithViteServer();
            setSyncStatus('success');
            
            // Auto hide success notification after 5s
            setTimeout(() => setSyncStatus('idle'), 5000);
          } catch (err) {
            console.error("Auto-sync deploy failed:", err);
            setSyncStatus('error');
            setTimeout(() => setSyncStatus('idle'), 5000);
          }
        }
      }
    };

    window.addEventListener('message', handleSyncMessage);
    return () => window.removeEventListener('message', handleSyncMessage);
  }, [isLocalDev]);

  const handleIframeLoad = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      console.log("Sync bridge iframe loaded. Requesting data...");
      iframeRef.current.contentWindow.postMessage(
        { type: 'REQUEST_SYNC_DATA' },
        'https://rafytaffy.github.io'
      );
    }
  };

  const handleRecognized = async (toyId) => {
    try {
      const toys = await getAllToys();
      const foundToy = toys.find(t => t.id === toyId);
      if (foundToy) {
        setActiveToy(foundToy);
      }
    } catch (err) {
      console.error("Error recognizing toy:", err);
    }
  };

  const handleCloseMedia = () => {
    if (activeToy) {
      setLastClosedToyId(activeToy.id);
      setActiveToy(null);
    }
  };

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {view === 'play' ? (
        <PlayMode 
          onManageToys={() => setView('manage')} 
          onRecognized={handleRecognized}
          lastClosedToyId={lastClosedToyId}
        />
      ) : (
        <TrainMode 
          onBack={() => {
            setView('play');
            setLastClosedToyId(null);
          }} 
        />
      )}

      {activeToy && (
        <MediaOverlay 
          toy={activeToy} 
          onClose={handleCloseMedia} 
        />
      )}

      {/* Hidden Sync Bridge Iframe */}
      {isLocalDev && (
        <iframe 
          ref={iframeRef}
          src="https://rafytaffy.github.io/see-and-play/sync-bridge.html" 
          onLoad={handleIframeLoad}
          style={{ display: 'none' }}
          title="See and Play Sync Bridge"
        />
      )}

      {/* Floating Sync Notification Toast */}
      {syncStatus !== 'idle' && (
        <div className={`sync-toast-alert card float-anim ${syncStatus}`}>
          {syncStatus === 'syncing' && (
            <>
              <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--secondary)' }} />
              <div>
                <h4>Syncing iPad toys...</h4>
                <p>Deploying iPad-trained toys to GitHub Pages in the background.</p>
              </div>
            </>
          )}
          {syncStatus === 'success' && (
            <>
              <CheckCircle size={24} style={{ color: 'var(--success)' }} />
              <div>
                <h4>Sync successful!</h4>
                <p>Your iPad toys are updated and live on GitHub Pages.</p>
              </div>
            </>
          )}
          {syncStatus === 'error' && (
            <>
              <AlertTriangle size={24} style={{ color: 'var(--danger)' }} />
              <div>
                <h4>Sync Failed</h4>
                <p>Could not push synced toys to GitHub. Check terminal console.</p>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
