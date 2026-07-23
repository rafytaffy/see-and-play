import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function MediaOverlay({ toy, onClose }) {
  const [mediaUrl, setMediaUrl] = useState(null);

  useEffect(() => {
    if (!toy) return;
    
    if (toy.isBuiltIn && toy.mediaUrl) {
      const base = import.meta.env.BASE_URL || '/';
      const cleanPath = toy.mediaUrl.startsWith('/') ? toy.mediaUrl.slice(1) : toy.mediaUrl;
      setMediaUrl(`${base}${cleanPath}`);
    } else if (toy.mediaBlob) {
      const url = URL.createObjectURL(toy.mediaBlob);
      setMediaUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [toy]);

  if (!toy || !mediaUrl) return null;

  return (
    <div className="media-overlay-container">
      {toy.mediaType === 'video' ? (
        <video 
          src={mediaUrl} 
          autoPlay 
          loop 
          playsInline
          className="fullscreen-media"
        />
      ) : (
        <img 
          src={mediaUrl} 
          alt={toy.name} 
          className="fullscreen-media"
        />
      )}
      
      <button className="btn btn-close-media pulse-anim" onClick={onClose} aria-label="Close">
        <X size={36} />
      </button>

      <div className="media-label-toast">
        {toy.name}
      </div>
    </div>
  );
}
