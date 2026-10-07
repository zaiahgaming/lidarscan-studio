import React from 'react';
import { Box, ChevronRight, FolderOpen, HardDrive, RefreshCw, ScanLine, Search, Sparkles, Upload } from 'lucide-react';
import { Capture } from '../types';
import { dateLabel, formatBytes } from '../lib/format';

interface LibraryPanelProps {
  captures: Capture[];
  filtered: Capture[];
  selectedId: string | null;
  query: string;
  busy: boolean;
  totalBytes: number;
  searchRef: React.RefObject<HTMLInputElement>;
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onImport: () => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  captures,
  filtered,
  selectedId,
  query,
  busy,
  totalBytes,
  searchRef,
  onQuery,
  onSelect,
  onRefresh,
  onImport,
}) => (
  <aside className="library">
    <div className="library-head">
      <div>
        <span className="microlabel">Library</span>
        <h1 className="library-title">
          Scans<span>{captures.length}</span>
        </h1>
      </div>
      <button className="icon-btn" onClick={onRefresh} title="Refresh scans" aria-label="Refresh scans">
        <RefreshCw size={14} className={busy ? 'spin' : ''} />
      </button>
    </div>

    <div className="lib-stats">
      <div className="lib-stat">
        <span className="microlabel">Captures</span>
        <b>{String(captures.length).padStart(2, '0')}</b>
      </div>
      <div className="lib-stat">
        <span className="microlabel">On disk</span>
        <b>
          {formatBytes(totalBytes)}
        </b>
      </div>
    </div>

    <label className="search-box">
      <Search size={14} />
      <input
        ref={searchRef}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Find a scan"
        aria-label="Search scans"
      />
      <kbd>⌘K</kbd>
    </label>

    <div className="capture-scroll">
      {filtered.map((capture) => (
        <button
          key={capture.id}
          className={'scan-card' + (capture.id === selectedId ? ' selected' : '')}
          onClick={() => onSelect(capture.id)}
          aria-pressed={capture.id === selectedId}
        >
          <div className="scan-thumb">
            {capture.has_thumbnail ? (
              <img src={'/captures/' + encodeURIComponent(capture.id) + '/thumbnail.jpg'} alt="" loading="lazy" />
            ) : (
              <ScanLine size={20} />
            )}
            {capture.has_splats && (
              <span className="asset-dot" title="Has Gaussian splats">
                <Sparkles size={9} />
              </span>
            )}
          </div>
          <div className="scan-copy">
            <b>{capture.name}</b>
            <time>{dateLabel(capture.created)}</time>
            <div className="scan-tags">
              {capture.has_splats && <i className="tag tag-splat">SPLAT</i>}
              {capture.has_mesh && <i className="tag tag-mesh">MESH</i>}
              {capture.has_pointcloud && <i className="tag tag-cloud">POINTS</i>}
            </div>
          </div>
          <ChevronRight size={14} className="capture-arrow" style={{ color: 'var(--faint)', flex: 'none' }} />
        </button>
      ))}

      {!filtered.length && (
        <div className="library-empty">
          {query ? <Search size={24} /> : <FolderOpen size={24} />}
          <b>{query ? 'No matching scans' : 'Your library is empty'}</b>
          <p>{query ? 'Try a different name.' : 'Import a LiDAR scan from your iPhone to begin.'}</p>
          {!query && (
            <button className="btn btn-outline" onClick={onImport}>
              <Upload size={14} />
              Import a scan
            </button>
          )}
        </div>
      )}
    </div>

    <div className="library-foot">
      <Box size={16} style={{ color: 'var(--faint)', flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Local library</b>
        <span>Files stay on this PC</span>
      </div>
      <HardDrive size={15} style={{ color: 'var(--faint)' }} />
    </div>
  </aside>
);
