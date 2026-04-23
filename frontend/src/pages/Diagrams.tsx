import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDiagrams, getDiagramUrl } from '../api';
import type { DiagramFile } from '../api';
import { motion } from 'framer-motion';
import { Image, FileCode, Layers, Search, Map as MapIcon } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import MagicCard from '@/components/ui/magic-card';
import { AnimatedList } from '@/components/ui/animated-list';
import ShimmerButton from '@/components/ui/shimmer-button';

export default function Diagrams() {
  const { scanId: paramScanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const [scanId, setScanId] = useState(paramScanId || '');
  const [diagrams, setDiagrams] = useState<DiagramFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'png' | 'puml'>('png');

  useEffect(() => {
    if (paramScanId) loadDiagrams(paramScanId);
  }, [paramScanId]);

  const loadDiagrams = async (id: string) => {
    setLoading(true);
    try {
      const data = await getDiagrams(id);
      setDiagrams(data);
      setScanId(id);
    } catch {
      setDiagrams([]);
    }
    setLoading(false);
  };

  const filtered = diagrams.filter(d => filter === 'all' || d.type === filter);
  const pngCount = diagrams.filter(d => d.type === 'png').length;
  const pumlCount = diagrams.filter(d => d.type === 'puml').length;

  return (
    <div>
      <PageHeader
        title="Diagrams"
        subtitle="Generated PlantUML architecture and call-chain diagrams"
        gradient="from-cyan-400 to-blue-400"
      />

      {!paramScanId && (
        <MagicCard accentColor="#06b6d4" className="mb-6 max-w-[500px] p-6">
          <div className="form-group">
            <label>Scan ID</label>
            <div className="flex gap-2">
              <input
                className="form-input"
                placeholder="Enter scan ID..."
                value={scanId}
                onChange={e => setScanId(e.target.value)}
              />
              <ShimmerButton onClick={() => loadDiagrams(scanId)}>
                Load
              </ShimmerButton>
            </div>
          </div>
        </MagicCard>
      )}

      {diagrams.length > 0 && (
        <>
          <div className="mb-6 flex items-center gap-1">
            {[
              { key: 'png', label: 'PNG', icon: Image, count: pngCount },
              { key: 'puml', label: 'PUML', icon: FileCode, count: pumlCount },
              { key: 'all', label: 'All', icon: Layers, count: diagrams.length },
            ].map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as any)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8rem] font-medium transition-all ${
                  filter === key
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25'
                    : 'text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon size={15} />
                {label} ({count})
              </button>
            ))}
          </div>

          {filter !== 'puml' && (
            <AnimatedList className="diagram-grid" stagger={0.06}>
              {filtered.filter(d => d.type === 'png').map((d, i) => {
                const filename = d.name;
                const baseName = filename.replace(/\.[^.]+$/, '');
                return (
                  <AnimatedList.Item key={i}>
                    <MagicCard
                      accentColor="#06b6d4"
                      className="cursor-pointer p-4"
                      onClick={() => navigate(`/diagrams/${paramScanId || scanId}/view/${encodeURIComponent(filename)}`)}
                    >
                      <motion.img
                        whileHover={{ scale: 1.02 }}
                        src={getDiagramUrl(d.path)}
                        alt={d.name}
                        loading="lazy"
                        className="w-full aspect-[4/3] object-contain rounded-lg border border-white/[0.06] bg-surface-primary transition-all hover:border-indigo-500/20 hover:shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                      />
                      <p className="mt-3 text-center text-[0.8rem] font-medium text-txt-secondary">
                        {baseName}
                      </p>
                      <div className="mt-2 flex justify-center">
                        <ShimmerButton
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/diagrams/${paramScanId || scanId}/view/${encodeURIComponent(filename)}`);
                          }}
                        >
                          <Search size={13} /> View & Download
                        </ShimmerButton>
                      </div>
                    </MagicCard>
                  </AnimatedList.Item>
                );
              })}
            </AnimatedList>
          )}

          {filter !== 'png' && (
            <AnimatedList className="mt-4 flex flex-col gap-3" stagger={0.06}>
              {filtered.filter(d => d.type === 'puml').map((d, i) => (
                <AnimatedList.Item key={i}>
                  <MagicCard accentColor="#8b5cf6" hover={false} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/15">
                          <FileCode size={20} className="text-violet-400" />
                        </div>
                        <div>
                          <div className="text-[0.9rem] font-semibold">{d.name}</div>
                          <div className="text-[0.72rem] text-txt-muted">PlantUML source</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={getDiagramUrl(d.path)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          Open ↗
                        </a>
                        <a
                          href={getDiagramUrl(d.path)}
                          download={d.name}
                          className="btn btn-primary btn-sm"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  </MagicCard>
                </AnimatedList.Item>
              ))}
            </AnimatedList>
          )}
        </>
      )}

      {loading && (
        <div className="empty-state">
          <div className="empty-state-icon animate-pulse">⏳</div>
          <h3>Loading diagrams...</h3>
        </div>
      )}

      {!loading && diagrams.length === 0 && paramScanId && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <MapIcon size={48} className="text-txt-muted" />
          </div>
          <h3>No diagrams found</h3>
          <p>Diagrams are generated during the scan. Make sure the scan completed successfully.</p>
        </div>
      )}
    </div>
  );
}


