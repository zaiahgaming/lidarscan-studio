import React from 'react';
import { Activity, Plus, RefreshCw, Wifi } from 'lucide-react';
import { SystemStatus } from '../types';

interface TopBarProps {
  status: SystemStatus | null;
  activeJobs: number;
  busy: boolean;
  onRefresh: () => void;
  onOpenJobs: () => void;
  onOpenConnect: () => void;
  onImport: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  status,
  activeJobs,
  busy,
  onRefresh,
  onOpenJobs,
  onOpenConnect,
  onImport,
}) => (
  <header className="topbar">
    <a className="brand" href="/" aria-label="LidarScan Studio">
      <span className="brand-mark">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 5.5V8M12 16v2.5M5.5 12H8M16 12h2.5" />
        </svg>
      </span>
      <span>
        <div className="brand-name">
          LidarScan<em>STUDIO</em>
        </div>
        <div className="brand-tag">iPhone LiDAR companion</div>
      </span>
    </a>

    <div className="topbar-spacer" />

    <button className="connection-pill" onClick={onOpenConnect} title="Phone connection details">
      <span className={'status-dot' + (status ? ' online' : '')} />
      <span className="pill-label">{status ? 'Reachable at' : 'PC offline'}</span>
      <span className="mono">{status ? status.lan_ip : '—'}</span>
      <Wifi size={14} />
    </button>

    <button className="icon-btn" onClick={onRefresh} title="Refresh" aria-label="Refresh data">
      <RefreshCw size={15} className={busy ? 'spin' : ''} />
    </button>

    <button
      className={'jobs-chip' + (activeJobs > 0 ? ' has-active' : '')}
      onClick={onOpenJobs}
      title="Processing jobs"
    >
      <Activity size={14} />
      <span>Jobs</span>
      {activeJobs > 0 && <span className="badge">{activeJobs}</span>}
    </button>

    <button className="btn btn-primary" onClick={onImport}>
      <Plus size={15} />
      Import scan
    </button>
  </header>
);
