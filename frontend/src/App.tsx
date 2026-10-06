import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { InboxSidebar } from './components/InboxSidebar';
import { Viewer3D } from './components/Viewer3D';
import { OverviewTab } from './components/OverviewTab';
import { SplatTrainTab } from './components/SplatTrainTab';
import { ReconstructTab } from './components/ReconstructTab';
import { JobsDrawer } from './components/JobsDrawer';
import { QrModal } from './components/QrModal';
import { Capture, Job, SystemStatus } from './types';
import { Sparkles, Layers, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'splat' | 'reconstruct'>('overview');
  const [isJobsOpen, setIsJobsOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.warn('Could not fetch status:', e);
    }
  };

  const fetchCaptures = async () => {
    setIsLoadingCaptures(true);
    try {
      const res = await fetch('/api/captures');
      if (res.ok) {
        const data = await res.json();
        setCaptures(data);
        if (data.length > 0 && !selectedId) {
          setSelectedId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching captures:', e);
    } finally {
      setIsLoadingCaptures(false);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (e) {
      console.warn('Could not fetch jobs:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchCaptures();
    fetchJobs();

    const interval = setInterval(() => {
      fetchJobs();
      fetchStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const selectedCapture = captures.find((c) => c.id === selectedId) || null;

  const handleUploadZip = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    showToast(`Uploading ${file.name}...`, 'success');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }
      const data = await res.json();
      showToast(`Capture uploaded successfully!`, 'success');
      await fetchCaptures();
      setSelectedId(data.id);
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    }
  };

  const handleGenerateDemo = async () => {
    showToast('Importing demo synthetic room scan...', 'success');
    // We already have Synthetic_Sculpture_Room in test_data, let's upload or copy it
    try {
      const zipRes = await fetch('/captures');
      await fetchCaptures();
      showToast('Demo scan ready!', 'success');
    } catch (e) {
      showToast('Failed to load demo scan', 'error');
    }
  };

  const handleImportSplat = async (file: File) => {
    if (!selectedId) return;
    const formData = new FormData();
    formData.append('file', file);
    showToast(`Importing ${file.name}...`, 'success');

    try {
      const res = await fetch(`/api/captures/${selectedId}/import-splat`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Import failed');
      }
      showToast('Splat imported successfully! Switching to Splat view...', 'success');
      await fetchCaptures();
      setActiveTab('overview');
    } catch (err: any) {
      showToast(err.message || 'Import failed', 'error');
    }
  };

  const handleRunTsdf = async (voxelLength: number, sdfTrunc: number, maxDepth: number) => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/captures/${selectedId}/tsdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voxel_length: voxelLength, sdf_trunc: sdfTrunc, max_depth: maxDepth }),
      });
      if (!res.ok) throw new Error('Failed to start TSDF job');
      showToast('Started TSDF Fusion background job!', 'success');
      setIsJobsOpen(true);
      fetchJobs();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleRunPoisson = async (depth: number, quantile: number) => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/captures/${selectedId}/poisson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depth, quantile }),
      });
      if (!res.ok) throw new Error('Failed to start Poisson job');
      showToast('Started Poisson Reconstruction background job!', 'success');
      setIsJobsOpen(true);
      fetchJobs();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleRunCleanPcd = async (voxelSize: number, nbNeighbors: number, stdRatio: number) => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/captures/${selectedId}/clean-pcd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voxel_size: voxelSize, nb_neighbors: nbNeighbors, std_ratio: stdRatio }),
      });
      if (!res.ok) throw new Error('Failed to start cleanup job');
      showToast('Started Point Cloud Cleanup background job!', 'success');
      setIsJobsOpen(true);
      fetchJobs();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleTrainColab = async (totalSteps: number) => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/captures/${selectedId}/train-splat-colab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_steps: totalSteps }),
      });
      if (!res.ok) throw new Error('Failed to start Colab splat training');
      showToast('Started automated Colab T4 GPU splat training!', 'success');
      setIsJobsOpen(true);
      fetchJobs();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleTrainLocal = async (steps: number, maxSplats: number, res: number) => {
    if (!selectedId) return;
    try {
      const r = await fetch(`/api/captures/${selectedId}/train-splat-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_steps: steps, max_splats: maxSplats, max_resolution: res }),
      });
      if (!r.ok) throw new Error('Failed to start local Brush training');
      showToast('Started local Brush training job!', 'success');
      setIsJobsOpen(true);
      fetchJobs();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm('Are you sure you want to delete this capture?')) return;

    try {
      const res = await fetch(`/api/captures/${selectedId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Capture deleted', 'success');
      setSelectedId(null);
      await fetchCaptures();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const activeJobsCount = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
  const isSelectedProcessing = jobs.some((j) => j.capture_id === selectedId && j.status === 'running');

  return (
    <div className="flex flex-col h-screen w-screen bg-studio-900 text-slate-100 overflow-hidden select-none">
      {/* Top Navbar */}
      <Navbar
        status={status}
        onOpenQr={() => setIsQrOpen(true)}
        onOpenJobs={() => setIsJobsOpen(true)}
        onUploadZip={handleUploadZip}
        onGenerateDemo={handleGenerateDemo}
        activeJobsCount={activeJobsCount}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Library Inbox */}
        <InboxSidebar
          captures={captures}
          selectedId={selectedId}
          onSelectCapture={(id) => setSelectedId(id)}
          onRefresh={fetchCaptures}
          isLoading={isLoadingCaptures}
        />

        {/* Center 3D Viewer */}
        <Viewer3D capture={selectedCapture} />

        {/* Right Inspector & Controls Panel */}
        {selectedCapture && (
          <aside className="w-96 border-l border-studio-border bg-studio-800 flex flex-col h-full flex-shrink-0 z-10">
            {/* Tabs Header */}
            <div className="flex border-b border-studio-border bg-studio-800/80 p-1 space-x-1 select-none">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'overview'
                    ? 'bg-studio-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-studio-700/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Overview</span>
              </button>

              <button
                onClick={() => setActiveTab('splat')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'splat'
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-studio-700/50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                <span>Gaussian Splats</span>
              </button>

              <button
                onClick={() => setActiveTab('reconstruct')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'reconstruct'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-studio-700/50'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-emerald-300" />
                <span>Mesh 3D</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'overview' && (
                <OverviewTab capture={selectedCapture} onDelete={handleDelete} />
              )}
              {activeTab === 'splat' && (
                <SplatTrainTab
                  capture={selectedCapture}
                  status={status}
                  onImportSplat={handleImportSplat}
                  onTrainColab={handleTrainColab}
                  onTrainLocal={handleTrainLocal}
                  isProcessing={isSelectedProcessing}
                />
              )}
              {activeTab === 'reconstruct' && (
                <ReconstructTab
                  capture={selectedCapture}
                  onRunTsdf={handleRunTsdf}
                  onRunPoisson={handleRunPoisson}
                  onRunCleanPcd={handleRunCleanPcd}
                  isProcessing={isSelectedProcessing}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center space-x-2 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md border text-xs font-bold transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/50'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-200 shadow-rose-950/50'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Background Jobs Drawer */}
      <JobsDrawer isOpen={isJobsOpen} onClose={() => setIsJobsOpen(false)} jobs={jobs} />

      {/* QR Code Modal for iPhone Connect */}
      <QrModal isOpen={isQrOpen} onClose={() => setIsQrOpen(false)} status={status} />
    </div>
  );
};
