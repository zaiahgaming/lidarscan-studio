import React, { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FileArchive, ScanLine, Upload } from 'lucide-react';
import { Viewer3D } from './components/Viewer3D';
import { TopBar } from './components/TopBar';
import { LibraryPanel } from './components/LibraryPanel';
import { InspectorPanel, PanelTab } from './components/InspectorPanel';
import { JobsDrawer } from './components/JobsDrawer';
import { ConnectDialog } from './components/ConnectDialog';
import { UploadModal } from './components/UploadModal';
import { Toasts, ToastState } from './components/Toasts';
import { Capture, Job, SystemStatus } from './types';

export const App: React.FC = () => {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<PanelTab>('details');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [showJobs, setShowJobs] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [steps, setSteps] = useState(7000);
  const [dragging, setDragging] = useState(false);
  const splatInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const selected = captures.find((capture) => capture.id === selectedId) ?? null;
  const activeJobs = jobs.filter((job) => job.status === 'running' || job.status === 'queued').length;
  const filtered = useMemo(
    () => captures.filter((capture) => capture.name.toLowerCase().includes(query.toLowerCase())),
    [captures, query],
  );
  const totalBytes = useMemo(() => captures.reduce((sum, capture) => sum + (capture.size_bytes || 0), 0), [captures]);
  const demoScan = captures.find((item) => item.id.includes('Synthetic_Sculpture_Room'));

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
      setSelectedId((previous) => (previous && data.some((item) => item.id === previous) ? previous : data[0]?.id ?? null));
    } catch (reason) {
      if (showSpinner) flash(reason instanceof Error ? reason.message : 'Connection failed.', true);
    } finally {
      if (showSpinner) setBusy(false);
    }
  };

  const loadJobs = async () => {
    try {
      const response = await fetch('/api/jobs');
      if (response.ok) setJobs(await response.json());
    } catch { /* next poll retries */ }
  };

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/status');
      if (response.ok) setStatus(await response.json());
      else setStatus(null);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    void loadCaptures(true);
    void loadJobs();
    void loadStatus();
    const timer = window.setInterval(() => { void loadCaptures(); void loadJobs(); void loadStatus(); }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  // Global shortcuts: ⌘K / Ctrl+K focuses search, Escape closes overlays.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
        return;
      }
      if (event.key === 'Escape') {
        setShowConnect(false);
        setShowJobs(false);
        if (uploadProgress === null) setShowUpload(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [uploadProgress]);

  const upload = (file: File) =>
    new Promise<void>((resolve, reject) => {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        reject(new Error('Choose a .lidarscan.zip capture.'));
        return;
      }
      const data = new FormData();
      data.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.responseType = 'json';
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(Math.round((100 * event.loaded) / event.total));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Check that the phone and PC are on the same Wi-Fi.'));
      xhr.onload = async () => {
        const payload = xhr.response ?? {};
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(payload.detail || 'Could not import the capture.'));
          return;
        }
        await loadCaptures();
        if (payload.id) setSelectedId(payload.id);
        flash('Scan added to your library.');
        resolve();
      };
      setUploadProgress(0);
      xhr.send(data);
    })
      .catch((reason) => flash(reason instanceof Error ? reason.message : 'Upload failed.', true))
      .finally(() => {
        setUploadProgress(null);
        setShowUpload(false);
      });

  const startJob = async (kind: string, body: object = {}) => {
    if (!selected) return;
    try {
      const response = await fetch('/api/captures/' + encodeURIComponent(selected.id) + '/' + kind, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Could not start processing.');
      flash('Processing started. Follow its progress in Jobs.');
      setShowJobs(true);
      void loadJobs();
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : 'Could not start processing.', true);
    }
  };

  const importSplat = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    const data = new FormData();
    data.append('file', file);
    try {
      const response = await fetch('/api/captures/' + encodeURIComponent(selected.id) + '/import-splat', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Splat import failed.');
      await loadCaptures();
      setTab('train');
      flash('Splat added to this scan.');
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : 'Splat import failed.', true);
    }
  };

  const deleteCapture = async () => {
    if (!selected || !window.confirm('Delete “' + selected.name + '” and its files?')) return;
    const response = await fetch('/api/captures/' + encodeURIComponent(selected.id), { method: 'DELETE' });
    if (!response.ok) {
      flash('Could not delete this scan.', true);
      return;
    }
    setSelectedId(null);
    await loadCaptures();
    flash('Scan deleted.');
  };

  const refresh = () => {
    void loadCaptures(true);
    void loadJobs();
    void loadStatus();
  };

  const dropZip = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  };

  return (
    <div
      className="app-shell"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (event.target === event.currentTarget) setDragging(false); }}
      onDrop={dropZip}
    >
      <TopBar
        status={status}
        activeJobs={activeJobs}
        busy={busy}
        onRefresh={refresh}
        onOpenJobs={() => setShowJobs(true)}
        onOpenConnect={() => setShowConnect(true)}
        onImport={() => setShowUpload(true)}
      />

      <main className="workspace">
        <LibraryPanel
          captures={captures}
          filtered={filtered}
          selectedId={selectedId}
          query={query}
          busy={busy}
          totalBytes={totalBytes}
          searchRef={searchInput}
          onQuery={setQuery}
          onSelect={setSelectedId}
          onRefresh={() => void loadCaptures(true)}
          onImport={() => setShowUpload(true)}
        />

        <section className="stage">
          {selected && (
            <div className="stage-head">
              <div style={{ minWidth: 0 }}>
                <span className="microlabel">Now viewing</span>
                <h2 className="stage-title">{selected.name}</h2>
              </div>
              <span className="stage-device">
                <ScanLine size={13} />
                {selected.device || 'LiDAR capture'} · {selected.frame_count.toLocaleString()} frames
              </span>
            </div>
          )}
          <div className="stage-body">
            {selected ? (
              <Viewer3D capture={selected} />
            ) : (
              <div className="welcome">
                <div className="welcome-glyph"><ScanLine size={30} /></div>
                <span className="microlabel">LidarScan Studio</span>
                <h2>Bring a scan into focus.</h2>
                <p>Your capture library, reconstruction tools, and Gaussian splat workflow live here.</p>
                <div className="welcome-actions">
                  <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
                    <Upload size={15} />
                    Import a scan
                  </button>
                  {demoScan && (
                    <button className="btn btn-outline" onClick={() => setSelectedId(demoScan.id)}>
                      Open sample room
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <InspectorPanel
          capture={selected}
          tab={tab}
          onTab={setTab}
          colabAuthenticated={Boolean(status?.colab_cli?.authenticated)}
          colabMessage={status?.colab_cli?.message ?? ''}
          steps={steps}
          onSteps={setSteps}
          onStartJob={(kind) => void startJob(kind, kind === 'train-splat-colab' ? { total_steps: steps } : {})}
          onImportSplat={() => splatInput.current?.click()}
          onDelete={() => void deleteCapture()}
        />
      </main>

      <footer className="statusbar">
        <div className="left">
          <span className={'status-dot' + (status ? ' online' : '')} />
          <span>{status ? 'Studio connected' : 'Connecting to Studio'}</span>
          <span className="sep">·</span>
          <span className="mono">{status?.lan_ip ?? 'no LAN address'}</span>
          <span className="sep">·</span>
          <span>{captures.length} scan{captures.length === 1 ? '' : 's'}</span>
        </div>
        <div className="right">
          <button onClick={() => setShowJobs(true)}>
            {activeJobs ? activeJobs + ' active job' + (activeJobs > 1 ? 's' : '') : 'Jobs & activity'}
          </button>
        </div>
      </footer>

      <JobsDrawer open={showJobs} jobs={jobs} onClose={() => setShowJobs(false)} />
      <ConnectDialog open={showConnect} status={status} onClose={() => setShowConnect(false)} />
      <UploadModal
        open={showUpload}
        progress={uploadProgress}
        onFile={(file) => void upload(file)}
        onClose={() => { if (uploadProgress === null) setShowUpload(false); }}
      />

      {dragging && (
        <div className="drop-overlay">
          <div className="frame">
            <FileArchive size={30} />
            <b>Drop your LiDAR scan</b>
            <span>Choose a .lidarscan.zip bundle</span>
          </div>
        </div>
      )}

      <Toasts toast={toast} />

      <input ref={splatInput} type="file" accept=".splat,.ply,.ksplat,.spz" hidden onChange={(e) => void importSplat(e)} />
    </div>
  );
};
