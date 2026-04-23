import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDiagramUrl } from '../api';

export default function DiagramViewer() {
  const { scanId, filename } = useParams<{ scanId: string; filename: string }>();
  const navigate = useNavigate();
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState<'png' | 'jpg' | null>(null);

  const imageUrl = getDiagramUrl(`/api/diagrams/${scanId}/${filename}`);
  const baseName = (filename ?? 'diagram').replace(/\.[^.]+$/, '');

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [imageUrl]);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = async () => {
    setDownloading('png');
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      downloadBlob(blob, `${baseName}.png`);
    } catch {
      alert('Failed to download PNG.');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadJpg = async () => {
    setDownloading('jpg');
    try {
      const img = imgRef.current;
      if (!img || !loaded) throw new Error('Image not ready');
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) downloadBlob(blob, `${baseName}.jpg`);
          setDownloading(null);
        },
        'image/jpeg',
        0.95,
      );
    } catch {
      alert('Failed to convert to JPG.');
      setDownloading(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate(-1)}
          style={{ flexShrink: 0 }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, wordBreak: 'break-all' }}>{baseName}</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Diagram Viewer &mdash; Scan: {scanId}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDownloadPng}
            disabled={!loaded || downloading !== null}
          >
            {downloading === 'png' ? '⏳ Downloading…' : '⬇ Download PNG'}
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleDownloadJpg}
            disabled={!loaded || downloading !== null}
          >
            {downloading === 'jpg' ? '⏳ Converting…' : '⬇ Download JPG'}
          </button>
        </div>
      </div>

      {/* Diagram area */}
      <div
        className="card animate-in"
        style={{
          marginTop: '1rem',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          minHeight: 300,
          background: 'var(--card-bg)',
          overflowX: 'auto',
        }}
      >
        {!loaded && !error && (
          <div className="empty-state">
            <div className="empty-state-icon animate-pulse">⏳</div>
            <h3>Loading diagram…</h3>
          </div>
        )}

        {error && (
          <div className="empty-state">
            <div className="empty-state-icon">❌</div>
            <h3>Failed to load diagram</h3>
            <p>Check that the scan completed successfully and the file exists.</p>
          </div>
        )}

        <img
          ref={imgRef}
          src={imageUrl}
          alt={baseName}
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(false); }}
          style={{
            maxWidth: '100%',
            height: 'auto',
            display: loaded ? 'block' : 'none',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          }}
          crossOrigin="anonymous"
        />
      </div>

      {/* Open raw image in new tab */}
      {loaded && (
        <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'underline' }}
          >
            Open raw image in new tab ↗
          </a>
        </div>
      )}
    </div>
  );
}
