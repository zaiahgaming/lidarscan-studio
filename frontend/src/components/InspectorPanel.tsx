import React from 'react';
import {
  Box, ChevronRight, Cloud, Cpu, Database, Download, ExternalLink, Layers,
  ScanLine, Smartphone, Sparkles, Trash2, Upload,
} from 'lucide-react';
import { Capture } from '../types';
import { dateLabel, fileName, formatBytes } from '../lib/format';

export type PanelTab = 'details' | 'process' | 'train';

interface InspectorPanelProps {
  capture: Capture | null;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  colabAuthenticated: boolean;
  colabMessage: string;
  steps: number;
  onSteps: (steps: number) => void;
  onStartJob: (kind: string) => void;
  onImportSplat: () => void;
  onDelete: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  capture,
  tab,
  onTab,
  colabAuthenticated,
  colabMessage,
  steps,
  onSteps,
  onStartJob,
  onImportSplat,
  onDelete,
}) => {
  if (!capture) {
    return (
      <aside className="inspector">
        <div className="insp-head">
          <div>
            <span className="microlabel">Inspector</span>
            <h2 className="insp-title">Scan tools</h2>
          </div>
        </div>
        <div className="insp-blank">
          <Database size={22} />
          <b>Nothing selected</b>
          <p>Choose a scan to see its files and processing tools.</p>
        </div>
      </aside>
    );
  }

  const assets: Array<{ name: string; kind: 'mesh' | 'points' | 'splat'; icon: React.ReactNode }> = [
    ...capture.meshes.map((name) => ({ name, kind: 'mesh' as const, icon: <Box size={14} /> })),
    ...capture.pointclouds.map((name) => ({ name, kind: 'points' as const, icon: <Cloud size={14} /> })),
    ...capture.splats.map((name) => ({ name, kind: 'splat' as const, icon: <Sparkles size={14} /> })),
  ];

  return (
    <aside className="inspector">
      <div className="insp-head">
        <div>
          <span className="microlabel">Inspector</span>
          <h2 className="insp-title">{capture.name}</h2>
        </div>
        <button className="icon-btn" onClick={onDelete} title="Delete scan" aria-label="Delete scan">
          <Trash2 size={15} />
        </button>
      </div>

      <div className="insp-banner">
        {capture.has_thumbnail ? (
          <img src={'/captures/' + encodeURIComponent(capture.id) + '/thumbnail.jpg'} alt="" />
        ) : (
          <div className="noimg">
            <ScanLine size={22} />
          </div>
        )}
      </div>

      <nav className="seg" aria-label="Inspector sections">
        {([['details', 'Details'], ['process', 'Process'], ['train', 'Train']] as const).map(([key, label]) => (
          <button key={key} className={'seg-item' + (tab === key ? ' active' : '')} onClick={() => onTab(key)} aria-pressed={tab === key}>
            {label}
          </button>
        ))}
      </nav>

      <div className="insp-scroll">
        {tab === 'details' && (
          <div className="insp-section">
            <div className="stat-grid">
              <div className="stat-tile">
                <span className="microlabel">Frames</span>
                <b>{capture.frame_count.toLocaleString()}</b>
              </div>
              <div className="stat-tile">
                <span className="microlabel">Size</span>
                <b>{formatBytes(capture.size_bytes)}</b>
              </div>
              <div className="stat-tile">
                <span className="microlabel">Device</span>
                <b title={capture.device}>{capture.device || 'iPhone'}</b>
              </div>
              <div className="stat-tile">
                <span className="microlabel">Captured</span>
                <b style={{ fontSize: 12.5 }}>{dateLabel(capture.created)}</b>
              </div>
            </div>

            {capture.camera_info?.w && (
              <div className="stat-tile">
                <span className="microlabel">Camera</span>
                <b style={{ fontSize: 12.5 }}>
                  {capture.camera_info.w}×{capture.camera_info.h} · {capture.camera_info.camera_model || 'OPENCV'}
                </b>
              </div>
            )}

            <span className="microlabel" style={{ marginTop: 4 }}>Files in this scan</span>
            {assets.map((asset) => (
              <div className="asset-row" key={asset.kind + asset.name}>
                {asset.icon}
                <span>{fileName(asset.name)}</span>
                <i className={asset.kind}>{asset.kind === 'points' ? 'Points' : asset.kind}</i>
              </div>
            ))}
            {!assets.length && (
              <div className="insp-note">
                <ScanLine size={14} />
                No processed 3D files yet — start with the Process tab.
              </div>
            )}

            <a
              className="action-row"
              href={'/api/captures/' + encodeURIComponent(capture.id) + '/export'}
              download
            >
              <span className="tool-icon teal">
                <Download size={16} />
              </span>
              <span>
                <b>Download bundle</b>
                <small>.lidarscan.zip archive</small>
              </span>
              <ChevronRight size={15} />
            </a>

            <div className="insp-note">
              <Smartphone size={14} />
              {capture.has_depth ? 'Depth frames included in this capture.' : 'No depth data in this capture.'}
            </div>
          </div>
        )}

        {tab === 'process' && (
          <div className="insp-section">
            <button className="action-row" onClick={() => onStartJob('tsdf')}>
              <span className="tool-icon teal">
                <Layers size={16} />
              </span>
              <span>
                <b>Depth fusion</b>
                <small>TSDF integration from LiDAR depth frames</small>
              </span>
              <ChevronRight size={15} />
            </button>
            <button className="action-row" onClick={() => onStartJob('poisson')}>
              <span className="tool-icon blue">
                <Cloud size={16} />
              </span>
              <span>
                <b>Surface reconstruction</b>
                <small>Poisson mesh from the point cloud</small>
              </span>
              <ChevronRight size={15} />
            </button>
            <button className="action-row" onClick={() => onStartJob('clean-pcd')}>
              <span className="tool-icon violet">
                <Sparkles size={16} />
              </span>
              <span>
                <b>Clean point cloud</b>
                <small>Remove noise and isolated points</small>
              </span>
              <ChevronRight size={15} />
            </button>
            <div className="insp-note">
              <Cpu size={14} />
              Reconstruction runs locally on this PC. Track progress in Jobs.
            </div>
          </div>
        )}

        {tab === 'train' && (
          <div className="insp-section">
            <div>
              <label className="microlabel field-label" htmlFor="train-steps">Training steps</label>
              <select id="train-steps" className="select" value={steps} onChange={(event) => onSteps(Number(event.target.value))}>
                <option value={3000}>3,000 · quick pass</option>
                <option value={7000}>7,000 · balanced</option>
                <option value={12000}>12,000 · detailed</option>
              </select>
            </div>

            {colabAuthenticated ? (
              <button className="btn btn-primary" style={{ width: '100%', height: 38 }} onClick={() => onStartJob('train-splat-colab')}>
                <Sparkles size={15} />
                Train with Colab CLI
              </button>
            ) : (
              <a
                className="btn btn-outline"
                style={{ width: '100%', height: 38 }}
                href="https://colab.research.google.com/github/zaiahgaming/lidarscan-studio/blob/main/colab_trainer.ipynb"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                Open Colab notebook
              </a>
            )}
            <div className="insp-note">
              <Cloud size={14} />
              {colabMessage || 'Splat training runs on a Colab GPU.'}
            </div>

            <a
              className="action-row"
              href={'/api/captures/' + encodeURIComponent(capture.id) + '/export'}
              download
            >
              <span className="tool-icon teal">
                <Download size={16} />
              </span>
              <span>
                <b>Download scan bundle</b>
                <small>Upload this ZIP in Colab</small>
              </span>
              <ChevronRight size={15} />
            </a>

            <button className="action-row" onClick={onImportSplat}>
              <span className="tool-icon violet">
                <Upload size={16} />
              </span>
              <span>
                <b>Import trained splat</b>
                <small>.splat, .ply, .ksplat or .spz</small>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
