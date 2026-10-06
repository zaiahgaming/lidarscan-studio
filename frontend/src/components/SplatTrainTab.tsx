import React, { useState } from 'react';
import {
  Sparkles,
  ExternalLink,
  Upload,
  Cpu,
  Zap,
  Terminal,
  Play,
  CheckCircle,
  AlertCircle,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Capture, SystemStatus } from '../types';

interface SplatTrainTabProps {
  capture: Capture;
  status: SystemStatus | null;
  onImportSplat: (file: File) => void;
  onTrainColab: (totalSteps: number) => void;
  onTrainLocal: (steps: number, maxSplats: number, res: number) => void;
  isProcessing: boolean;
}

export const SplatTrainTab: React.FC<SplatTrainTabProps> = ({
  capture,
  status,
  onImportSplat,
  onTrainColab,
  onTrainLocal,
  isProcessing,
}) => {
  // Option A (Colab) state
  const [colabSteps, setColabSteps] = useState(7000);

  // Option B (Local) state
  const [showLocal, setShowLocal] = useState(false);
  const [localSteps, setLocalSteps] = useState(5000);
  const [maxSplats, setMaxSplats] = useState(500000);
  const [maxRes, setMaxRes] = useState(960);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const colabCliAuth = status?.colab_cli?.authenticated || false;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImportSplat(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportSplat(e.target.files[0]);
    }
  };

  return (
    <div className="p-4 space-y-4 text-slate-200">
      {/* ================= OPTION A: GOOGLE COLAB GPU (PRIMARY) ================= */}
      <div className="bg-gradient-to-br from-indigo-950/60 to-studio-750/80 border border-indigo-500/30 rounded-2xl p-4 space-y-3.5 shadow-xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-sm text-white">Option A: Train on Free Google Colab GPU</h3>
              </div>
              <p className="text-[11px] text-indigo-200/70">Recommended: High-speed CUDA splat training on free NVIDIA T4 GPU</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Primary
          </span>
        </div>

        {/* 1-Click Colab Notebook Badge & Button */}
        <div className="bg-studio-900/80 border border-studio-border rounded-xl p-3 space-y-2.5">
          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-medium text-white flex items-center space-x-1.5">
              <span>1-Click Google Colab Notebook:</span>
            </p>
            <ol className="text-[11px] text-slate-400 list-decimal list-inside space-y-0.5">
              <li>Open the notebook in Google Colab (free T4 GPU)</li>
              <li>Upload <span className="font-mono text-cyan-300">{capture.name}.lidarscan.zip</span></li>
              <li>Run the cells to train CUDA Gaussian splats in ~2–4 minutes</li>
              <li>Download the resulting <span className="font-mono text-cyan-300">trained_splat.splat</span> and import below</li>
            </ol>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <a
              href="https://colab.research.google.com/github/zaiahgaming/lidarscan-studio/blob/main/colab_trainer.ipynb"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-md transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in Google Colab</span>
            </a>

            <a
              href={`/api/captures/${capture.id}/export`}
              download
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-studio-750 hover:bg-studio-700 border border-studio-border text-xs text-slate-200 transition-colors"
              title="Download capture zip for Colab upload"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Get Zip</span>
            </a>
          </div>
        </div>

        {/* Automated Colab CLI trigger if available */}
        {colabCliAuth && (
          <div className="bg-studio-900/60 border border-studio-border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Colab CLI Authenticated</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">{colabSteps} steps</span>
            </div>
            <button
              onClick={() => onTrainColab(colabSteps)}
              disabled={isProcessing}
              className="w-full flex items-center justify-center space-x-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Automate via Colab CLI</span>
            </button>
          </div>
        )}

        {/* Import Splat Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-studio-border hover:border-cyan-500/60 rounded-xl p-4 text-center cursor-pointer transition-colors bg-studio-900/40 hover:bg-studio-900/70"
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".splat,.ply,.ksplat,.spz"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Upload className="w-6 h-6 text-cyan-400 mx-auto mb-1.5 stroke-1" />
          <p className="text-xs font-semibold text-slate-200">Import Trained .splat or .ply</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Drop the downloaded splat file here or click to browse
          </p>
        </div>
      </div>

      {/* ================= OPTION B: LOCAL BRUSH ENGINE (FALLBACK) ================= */}
      <div className="bg-studio-750/40 border border-studio-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowLocal(!showLocal)}
          className="w-full p-3 flex items-center justify-between text-left hover:bg-studio-700/30 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-300">Option B: Local Training Fallback (Brush)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-500">AMD GPU / Vulkan</span>
            {showLocal ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </div>
        </button>

        {showLocal && (
          <div className="p-3.5 pt-1 space-y-3 border-t border-studio-border/60 text-xs">
            <p className="text-[11px] text-slate-400">
              Runs Brush directly on your local machine using Rust + wgpu / Vulkan. Note: Recommended only for small scenes or quick testing.
            </p>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Training Steps:</span>
                <span className="font-mono text-cyan-400">{localSteps}</span>
              </div>
              <input
                type="range"
                min="1000"
                max="15000"
                step="500"
                value={localSteps}
                onChange={(e) => setLocalSteps(parseInt(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Max Splats:</span>
                <span className="font-mono text-cyan-400">{maxSplats.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="100000"
                max="1000000"
                step="50000"
                value={maxSplats}
                onChange={(e) => setMaxSplats(parseInt(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Image Resolution Downscale:</span>
                <span className="font-mono text-cyan-400">{maxRes}px</span>
              </div>
              <input
                type="range"
                min="480"
                max="1440"
                step="120"
                value={maxRes}
                onChange={(e) => setMaxRes(parseInt(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <button
              onClick={() => onTrainLocal(localSteps, maxSplats, maxRes)}
              disabled={isProcessing}
              className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-studio-700 hover:bg-studio-600 disabled:opacity-50 text-slate-200 font-semibold border border-studio-border transition-colors mt-2"
            >
              <Play className="w-3.5 h-3.5 text-cyan-400" />
              <span>Train Locally with Brush</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
