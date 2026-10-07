import React, { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, Box, Check, ChevronRight, Cloud, Copy, Cpu, Database, Download,
  ExternalLink, FileArchive, FolderOpen, HardDrive, Image as ImageIcon, Layers, LoaderCircle,
  Plus, RefreshCw, ScanLine, Search, Sparkles, Trash2, Upload, Wifi, X,
} from 'lucide-react';
import { Viewer3D } from './components/Viewer3D';
import { Capture, Job, SystemStatus } from './types';

type PanelTab = 'details' | 'process' | 'splat';
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + ' ' + units[index];
};
const dateLabel = (date: string) => {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? 'Date unknown' : value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const App: React.FC = () => {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<PanelTab>('details');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [copied, setCopied] = useState(false);
  const [steps, setSteps] = useState(7000);
  const [dragging, setDragging] = useState(false);
  const zipInput = useRef<HTMLInputElement>(null);
  const splatInput = useRef<HTMLInputElement>(null);

  const selected = captures.find((capture) => capture.id === selectedId) ?? null;
  const activeJobs = jobs.filter((job) => job.status === 'running' || job.status === 'queued').length;
  const filtered = useMemo(() => captures.filter((capture) => capture.name.toLowerCase().includes(query.toLowerCase())), [captures, query]);

  const flash = (message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 3600);
  };
  const loadCaptures = async (showSpinner = false) => {
    if (showSpinner) setBusy(true);
    try {
      const response = await fetch('/api/captures');
      if (!response.ok) throw new Error('Capture library could not be loaded.');
      const data: Capture[] = await response.json();
      setCaptures(data);
      setSelectedId((previous) => previous && data.some((item) => item.id === previous) ? previous : data[0]?.id ?? null);
    } catch (reason) {
      if (showSpinner) flash(reason instanceof Error ? reason.message : 'Connection failed.', true);
    } finally {
      if (showSpinner) setBusy(false);
    }
  };
  const loadJobs = async () => {
    try { const response = await fetch('/api/jobs'); if (response.ok) setJobs(await response.json()); } catch { /* next poll retries */ }
  };
  const loadStatus = async () => {
    try { const response = await fetch('/api/status'); if (response.ok) setStatus(await response.json()); } catch { setStatus(null); }
  };

  useEffect(() => {
    void loadCaptures(true); void loadJobs(); void loadStatus();
    const timer = window.setInterval(() => { void loadCaptures(); void loadJobs(); void loadStatus(); }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  const upload = (file: File) => new Promise<void>((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith('.zip')) { reject(new Error('Choose a .lidarscan.zip capture.')); return; }
    const data = new FormData(); data.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round(100 * event.loaded / event.total)); };
    xhr.onerror = () => reject(new Error('Upload failed. Check that the phone and PC are on the same Wi-Fi.'));
    xhr.onload = async () => {
      const payload = xhr.response ?? {};
      if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(payload.detail || 'Could not import the capture.')); return; }
      await loadCaptures();
      if (payload.id) setSelectedId(payload.id);
      flash('Scan added to your library.');
      resolve();
    };
    setUploadProgress(0); xhr.send(data);
  }).catch((reason) => flash(reason instanceof Error ? reason.message : 'Upload failed.', true)).finally(() => setUploadProgress(null));

  const startJob = async (kind: string, body: object = {}) => {
    if (!selected) return;
    try {
      const response = await fetch('/api/captures/' + encodeURIComponent(selected.id) + '/' + kind, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Could not start processing.');
      flash('Processing started. Follow its progress in Jobs.');
      void loadJobs();
    } catch (reason) { flash(reason instanceof Error ? reason.message : 'Could not start processing.', true); }
  };

  const importSplat = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !selected) return;
    const data = new FormData(); data.append('file', file);
    try {
      const response = await fetch('/api/captures/' + encodeURIComponent(selected.id) + '/import-splat', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Splat import failed.');
      await loadCaptures(); setTab('splat'); flash('Splat added to this scan.');
    } catch (reason) { flash(reason instanceof Error ? reason.message : 'Splat import failed.', true); }
  };

  const deleteCapture = async () => {
    if (!selected || !window.confirm('Delete “' + selected.name + '” and its files?')) return;
    const response = await fetch('/api/captures/' + encodeURIComponent(selected.id), { method: 'DELETE' });
    if (!response.ok) { flash('Could not delete this scan.', true); return; }
    setSelectedId(null); await loadCaptures(); flash('Scan deleted.');
  };

  const pickZip = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (file) void upload(file);
  };
  const dropZip = (event: DragEvent) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files[0]; if (file) void upload(file);
  };
  const copyAddress = async () => {
    if (!status?.lan_url) return;
    await navigator.clipboard.writeText(status.lan_url); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };
  const demoScan = captures.find((item) => item.id.includes('Synthetic_Sculpture_Room'));

  return <div className="studio-app" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (event.target === event.currentTarget) setDragging(false); }} onDrop={dropZip}>
    <header className="studio-topbar">
      <a className="brand" href="/" aria-label="LidarScan Studio"><span className="brand-mark"><ScanLine size={20} /></span><span><b>LidarScan</b><small>STUDIO</small></span></a>
      <div className="topbar-location"><span>Workspace</span><ChevronRight size={14} /><b>{selected?.name ?? 'All scans'}</b></div>
      <div className="topbar-actions">
        <button className="connection-pill" onClick={() => setShowConnect(true)}><i className={status ? 'online' : ''} /><span>{status ? status.lan_ip : 'PC offline'}</span><Wifi size={15} /></button>
        <button className="icon-button" onClick={() => { void loadCaptures(true); void loadJobs(); }} title="Refresh"><RefreshCw size={16} /></button>
        <button className="jobs-button" onClick={() => document.getElementById('jobs-anchor')?.scrollIntoView({ behavior: 'smooth' })}><Activity size={16} /><span>Jobs</span>{activeJobs > 0 && <b>{activeJobs}</b>}</button>
        <button className="primary-button top-import" onClick={() => zipInput.current?.click()}><Plus size={16} />Import scan</button>
        <input ref={zipInput} type="file" accept=".zip,.lidarscan.zip" hidden onChange={pickZip} />
      </div>
    </header>

    <main className="workspace">
      <aside className="library-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR PROJECTS</span><h1>Scans <span>{captures.length}</span></h1></div><button className="icon-button" title="Refresh scans" onClick={() => void loadCaptures(true)}><RefreshCw size={15} className={busy ? 'spin' : ''} /></button></div>
        <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a scan" /><kbd>⌘ K</kbd></label>
        <div className="capture-list">
          {filtered.map((capture) => <button key={capture.id} className={'capture-card ' + (capture.id === selectedId ? 'selected' : '')} onClick={() => setSelectedId(capture.id)}>
            <div className="capture-thumb">{capture.has_thumbnail ? <img src={'/captures/' + encodeURIComponent(capture.id) + '/thumbnail.jpg'} alt="" /> : <ScanLine size={21} />}</div>
            <div className="capture-copy"><b>{capture.name}</b><span>{dateLabel(capture.created)}</span><div className="capture-tags">{capture.has_splats && <i className="tag-splat">SPLAT</i>}{capture.has_mesh && <i className="tag-mesh">MESH</i>}{capture.has_pointcloud && <i className="tag-cloud">POINTS</i>}</div></div>
            <ChevronRight size={15} className="capture-arrow" />
          </button>)}
          {!filtered.length && <div className="library-empty"><FolderOpen size={25} /><b>{query ? 'No matching scans' : 'Your library is empty'}</b><p>{query ? 'Try a different name.' : 'Import a LiDAR scan from your iPhone to begin.'}</p>{!query && <button className="secondary-button" onClick={() => zipInput.current?.click()}><Upload size={15} />Import a scan</button>}</div>}
        </div>
        <div className="library-footer"><div className="footer-icon"><HardDrive size={16} /></div><div><b>Local library</b><span>Files stay on this PC</span></div><span className="footer-status"><i /></span></div>
      </aside>

      <section className="center-stage">
        {selected ? <><div className="stage-title"><div><span className="eyebrow">MODEL VIEWER</span><h2>{selected.name}</h2></div><span className="stage-device"><ScanLine size={14} />{selected.device || 'LiDAR capture'}</span></div><Viewer3D capture={selected} /></> :
          <div className="welcome-stage"><div className="welcome-orbit"><div className="orbit-ring ring-a" /><div className="orbit-ring ring-b" /><div className="welcome-cube"><Box size={32} /></div></div><span className="eyebrow">LIDARSCAN STUDIO</span><h2>Bring a scan into focus.</h2><p>Your capture library, reconstruction tools, and Gaussian splat workflow live here.</p><div className="welcome-actions"><button className="primary-button" onClick={() => zipInput.current?.click()}><Upload size={16} />Import a scan</button>{demoScan && <button className="secondary-button" onClick={() => setSelectedId(demoScan.id)}>Open sample room</button>}</div></div>}
      </section>

      <aside className="inspector-panel">
        {selected ? <>
          <div className="inspector-head"><div><span className="eyebrow">INSPECTOR</span><h2>Scan tools</h2></div><button className="icon-button" title="Delete scan" onClick={() => void deleteCapture()}><Trash2 size={15} /></button></div>
          <nav className="inspector-tabs">{([['details', 'Details'], ['process', 'Process'], ['splat', 'Splat']] as const).map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
          <div className="inspector-content">
            {tab === 'details' && <><div className="selected-summary">{selected.has_thumbnail && <img src={'/captures/' + encodeURIComponent(selected.id) + '/thumbnail.jpg'} alt="" />}<div><b>{selected.name}</b><span>{dateLabel(selected.created)}</span></div></div><div className="stat-grid"><div><span>FRAMES</span><b>{selected.frame_count.toLocaleString()}</b></div><div><span>SIZE</span><b>{formatBytes(selected.size_bytes)}</b></div><div><span>DEVICE</span><b>{selected.device || 'iPhone'}</b></div><div><span>DEPTH</span><b>{selected.has_depth ? 'Included' : 'Missing'}</b></div></div><div className="asset-section"><h3>Available files</h3>{selected.meshes.map((name) => <div className="asset-row" key={name}><Box size={15} /><span>{name.split('/').pop()}</span><i>Mesh</i></div>)}{selected.pointclouds.map((name) => <div className="asset-row" key={name}><Cloud size={15} /><span>{name}</span><i>Points</i></div>)}{selected.splats.map((name) => <div className="asset-row" key={name}><Sparkles size={15} /><span>{name.split('/').pop()}</span><i>Splat</i></div>)}{!selected.meshes.length && !selected.pointclouds.length && !selected.splats.length && <p className="empty-note">No processed 3D files yet. Start with Process.</p>}</div><a className="download-row" href={'/api/captures/' + encodeURIComponent(selected.id) + '/export'}><Download size={16} /><span><b>Download capture bundle</b><small>.lidarscan.zip</small></span><ChevronRight size={15} /></a></>}
            {tab === 'process' && <><div className="tool-intro"><div className="tool-icon teal"><Layers size={18} /></div><h3>Reconstruct a mesh</h3><p>Fuse captured depth frames or clean the exported point cloud.</p></div><button className="tool-action" onClick={() => void startJob('tsdf', {})}><span><b>Depth fusion</b><small>Build a surface from LiDAR depth</small></span><ChevronRight size={16} /></button><button className="tool-action" onClick={() => void startJob('poisson', {})}><span><b>Surface reconstruction</b><small>Close and smooth the point cloud</small></span><ChevronRight size={16} /></button><button className="tool-action" onClick={() => void startJob('clean-pcd', {})}><span><b>Clean point cloud</b><small>Remove isolated points and noise</small></span><ChevronRight size={16} /></button><div className="inline-note"><Cpu size={15} />Mesh reconstruction uses your PC CPU.</div></>}
            {tab === 'splat' && <><div className="tool-intro"><div className="tool-icon violet"><Sparkles size={18} /></div><h3>Gaussian splats</h3><p>Train on a Colab GPU, then bring the result back into this viewer.</p></div><div className="steps-control"><label htmlFor="train-steps">Training steps</label><select id="train-steps" value={steps} onChange={(e) => setSteps(Number(e.target.value))}><option value={3000}>3,000 · quick</option><option value={7000}>7,000 · balanced</option><option value={12000}>12,000 · detailed</option></select></div>{status?.colab_cli?.authenticated ? <button className="primary-button wide" onClick={() => void startJob('train-splat-colab', { total_steps: steps })}><Sparkles size={16} />Train with Colab CLI</button> : <a className="primary-button wide" href="https://colab.research.google.com/github/zaiahgaming/lidarscan-studio/blob/main/colab_trainer.ipynb" target="_blank" rel="noreferrer"><ExternalLink size={15} />Open Colab notebook</a>}<a className="tool-action notebook-download" href={'/api/captures/' + encodeURIComponent(selected.id) + '/export'}><span><b>Download scan bundle</b><small>Upload the ZIP in Colab</small></span><Download size={16} /></a><input ref={splatInput} type="file" accept=".splat,.ply,.ksplat,.spz" hidden onChange={(e) => void importSplat(e)} /><button className="secondary-button wide" onClick={() => splatInput.current?.click()}><Upload size={15} />Import trained splat</button><div className="inline-note"><Cloud size={15} />Training runs on Colab’s GPU.</div></>}
          </div>
        </> : <div className="inspector-blank"><Database size={23} /><b>Nothing selected</b><p>Choose a scan to see its files and tools.</p></div>}
      </aside>
    </main>

    <footer className="statusbar"><div><i className={status ? 'online' : ''} />{status ? 'Studio connected' : 'Connecting to Studio'}<span>·</span>Local processing workspace</div><button id="jobs-anchor" onClick={() => document.getElementById('jobs-popover')?.classList.toggle('open')}><Activity size={14} />{activeJobs ? activeJobs + ' active job' + (activeJobs > 1 ? 's' : '') : 'Jobs & activity'}<ChevronRight size={13} /></button></footer>
    <div id="jobs-popover" className="jobs-popover"><div className="jobs-title"><b><Activity size={15} />Processing jobs</b><button className="icon-button" onClick={() => document.getElementById('jobs-popover')?.classList.remove('open')}><X size={15} /></button></div>{jobs.length ? jobs.slice(0, 8).map((job) => <div className="job-row" key={job.id}><span className={'job-indicator ' + job.status} /><div><b>{job.name}</b><small>{job.status_message || job.status}</small><div className="job-progress"><i style={{ width: Math.max(job.progress * 100, job.status === 'running' ? 5 : 0) + '%' }} /></div></div><span>{Math.round(job.progress * 100)}%</span></div>) : <p className="empty-note">No jobs yet. Reconstruction and training appear here.</p>}</div>
    {dragging && <div className="drop-overlay"><div><FileArchive size={30} /><b>Drop your LiDAR scan</b><span>Choose a .lidarscan.zip bundle</span></div></div>}
    {uploadProgress !== null && <div className="upload-banner"><LoaderCircle size={16} className="spin" /><span>Importing scan…</span><b>{uploadProgress}%</b><i><em style={{ width: uploadProgress + '%' }} /></i></div>}
    {toast && <div className={'toast ' + (toast.error ? 'toast-error' : '')}>{toast.error ? <AlertCircle size={16} /> : <Check size={16} />}{toast.message}</div>}
    {showConnect && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowConnect(false); }}><section className="connect-modal"><button className="modal-close" onClick={() => setShowConnect(false)}><X size={17} /></button><span className="eyebrow">PHONE CONNECTION</span><h2>Send a scan to this PC</h2><p>Keep your iPhone and PC on the same Wi-Fi network. In LidarScan, choose Manual Entry and use this address.</p><div className="address-box"><Wifi size={16} /><code>{status?.lan_url ?? 'Studio is not connected'}</code><button onClick={() => void copyAddress()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><span className="modal-hint"><i className="online" /> Server receives uploads on port {status?.port ?? 8765}</span></section></div>}
  </div>;
};
