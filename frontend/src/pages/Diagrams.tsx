import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDiagrams, getDiagramUrl } from '../api';
import type { DiagramFile } from '../api';

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
      <div className="page-header">
        <h2>Diagrams</h2>
        <p>Generated PlantUML architecture and call-chain diagrams</p>
      </div>

      {!paramScanId && (
        <div className="card animate-in" style={{ marginBottom: '1.5rem', maxWidth: 500 }}>
          <div className="form-group">
            <label>Scan ID</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="form-input" placeholder="Enter scan ID..." value={scanId}
                     onChange={e => setScanId(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={() => loadDiagrams(scanId)}>Load</button>
            </div>
          </div>
        </div>
      )}

      {diagrams.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
              <button className={`tab ${filter === 'png' ? 'active' : ''}`} onClick={() => setFilter('png')}>
                🖼️ PNG ({pngCount})
              </button>
              <button className={`tab ${filter === 'puml' ? 'active' : ''}`} onClick={() => setFilter('puml')}>
                📝 PUML ({pumlCount})
              </button>
              <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                All ({diagrams.length})
              </button>
            </div>
          </div>

          {filter !== 'puml' && (
            <div className="diagram-grid">
              {filtered.filter(d => d.type === 'png').map((d, i) => {
                const filename = d.name;
                const baseName = filename.replace(/\.[^.]+$/, '');
                return (
                  <div key={i} className="card diagram-card animate-in">
                    <img
                      src={getDiagramUrl(d.path)}
                      alt={d.name}
                      loading="lazy"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/diagrams/${paramScanId || scanId}/view/${encodeURIComponent(filename)}`)}
                    />
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', textAlign: 'center' }}>
                      {baseName}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'center' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/diagrams/${paramScanId || scanId}/view/${encodeURIComponent(filename)}`)}
                      >
                        🔍 View &amp; Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filter !== 'png' && (
            <div style={{ marginTop: '1rem' }}>
              {filtered.filter(d => d.type === 'puml').map((d, i) => (
                <div key={i} className="card animate-in" style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>📄</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{d.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PlantUML source</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <a href={getDiagramUrl(d.path)} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                        🔗 Open
                      </a>
                      <a href={getDiagramUrl(d.path)} download={d.name} className="btn btn-primary btn-sm">
                        📥 Download
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {loading && <div className="empty-state"><div className="empty-state-icon animate-pulse">⏳</div><h3>Loading diagrams...</h3></div>}

      {!loading && diagrams.length === 0 && paramScanId && (
        <div className="empty-state">
          <div className="empty-state-icon">🗺️</div>
          <h3>No diagrams found</h3>
          <p>Diagrams are generated during the scan. Make sure the scan completed successfully.</p>
        </div>
      )}
    </div>
  );
}
