import React, { useState } from 'react';
import { Box, Copy, Check, QrCode, Wifi, Layers, Activity, Upload, Sparkles } from 'lucide-react';
import { SystemStatus } from '../types';

interface NavbarProps {
  status: SystemStatus | null;
  onOpenQr: () => void;
  onOpenJobs: () => void;
  onUploadZip: (file: File) => void;
  onGenerateDemo: () => void;
  activeJobsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  status,
  onOpenQr,
  onOpenJobs,
  onUploadZip,
  onGenerateDemo,
  activeJobsCount,
}) => {
  const [copied, setCopied] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleCopy = () => {
    if (status?.lan_url) {
      navigator.clipboard.writeText(status.lan_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadZip(e.target.files[0]);
    }
  };

  return (
    <header className="h-16 border-b border-studio-border bg-studio-800/90 backdrop-blur px-4 flex items-center justify-between z-30 select-none">
      {/* Brand */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-500 p-0.5 shadow-lg shadow-cyan-500/20">
          <div className="w-full h-full bg-studio-900 rounded-[10px] flex items-center justify-center">
            <Box className="w-5 h-5 text-cyan-400" />
          </div>
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-base tracking-tight text-white">LidarScan</span>
            <span className="text-xs uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Studio
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">iPhone LiDAR Companion & 3D Reconstruction</p>
        </div>
      </div>

      {/* LAN IP & Mobile Connect */}
      <div className="flex items-center space-x-3">
        <div className="hidden md:flex items-center bg-studio-700/60 border border-studio-border rounded-lg p-1 px-3 space-x-2 shadow-inner">
          <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-400">Phone Connect:</span>
          <span className="font-mono text-xs font-semibold text-emerald-300">
            {status?.lan_url || 'Detecting LAN...'}
          </span>
          <button
            onClick={handleCopy}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-studio-600/50 transition-colors"
            title="Copy URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onOpenQr}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-studio-600/50 transition-colors"
            title="Show QR Code"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Bonjour indicator */}
        <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-studio-750 border border-studio-border text-[11px] text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
          <span className="font-mono text-slate-300">_lidarscan._tcp</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2.5">
        <input
          type="file"
          ref={fileInputRef}
          accept=".zip,.lidarscan.zip"
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-studio-700 hover:bg-studio-600 border border-studio-border text-slate-200 text-xs font-semibold shadow-sm transition-all"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-400" />
          <span>Import Zip</span>
        </button>

        <button
          onClick={onGenerateDemo}
          className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold shadow-sm transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Demo Scan</span>
        </button>

        {/* Jobs monitor trigger */}
        <button
          onClick={onOpenJobs}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            activeJobsCount > 0
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse'
              : 'bg-studio-700/60 border-studio-border text-slate-300 hover:bg-studio-600'
          }`}
        >
          <Activity className={`w-3.5 h-3.5 ${activeJobsCount > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
          <span>Jobs</span>
          {activeJobsCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-extrabold flex items-center justify-center">
              {activeJobsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
