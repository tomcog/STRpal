import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import './ImageViewer.css';

// openImageViewer(url) from anywhere; <ImageViewerHost /> is mounted once.
let show = null;
export function openImageViewer(url) {
  if (url && show) show(url);
}

export function ImageViewerHost() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    show = setUrl;
    return () => { show = null; };
  }, []);

  useEffect(() => {
    if (!url) return;
    const onKey = (e) => { if (e.key === 'Escape') setUrl(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [url]);

  if (!url) return null;
  return (
    <div className="image-viewer" onClick={() => setUrl(null)}>
      <img className="image-viewer-img" src={url} alt="" />
      <button type="button" className="image-viewer-close" aria-label="Close"><X /></button>
    </div>
  );
}
