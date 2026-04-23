import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDiagramUrl } from '../api';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '@/components/ui/page-header';
import MagicCard from '@/components/ui/magic-card';
import ShimmerButton from '@/components/ui/shimmer-button';

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
      <PageHeader
        title={baseName}
        subtitle={`Diagram Viewer — Scan: ${scanId}`}
        gradient="from-cyan-400 to-indigo-400"
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.8rem] font-medium text-txt-secondary transition-all hover:border-white/20 hover:text-txt-primary"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <ShimmerButton
            onClick={handleDownloadPng}
            disabled={!loaded || downloading !== null}
          >
            <Download size={14} />
            {downloading === 'png' ? 'Downloading…' : 'Download PNG'}
          </ShimmerButton>
          <button
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.8rem] font-medium text-txt-secondary transition-all hover:border-white/20 hover:text-txt-primary disabled:opacity-40"
            onClick={handleDownloadJpg}
            disabled={!loaded || downloading !== null}
          >
            <Download size={14} />
            {downloading === 'jpg' ? 'Converting…' : 'Download JPG'}
          </button>
        </div>
      </PageHeader>

      <MagicCard
        accentColor="#06b6d4"
        beam
        hover={false}
        className="mt-4 flex min-h-[300px] items-start justify-center overflow-x-auto p-6"
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

        <motion.img
          ref={imgRef}
          src={imageUrl}
          alt={baseName}
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(false); }}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-full h-auto rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
          style={{ display: loaded ? 'block' : 'none' }}
          crossOrigin="anonymous"
        />
      </MagicCard>

      {loaded && (
        <div className="mt-3 text-center">
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.8rem] text-txt-muted underline-offset-2 hover:text-indigo-400 hover:underline transition-colors"
          >
            <ExternalLink size={13} /> Open raw image in new tab
          </a>
        </div>
      )}
    </div>
  );
}
