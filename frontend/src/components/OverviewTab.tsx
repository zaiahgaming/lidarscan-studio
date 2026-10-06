import React from 'react';
import { Download, Trash2, Smartphone, Calendar, FileText, Image as ImageIcon, Camera, HardDrive } from 'lucide-react';
import { Capture } from '../types';

interface OverviewTabProps {
  capture: Capture;
  onDelete: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ capture, onDelete }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-4 space-y-4 text-slate-200">
      {/* Title & Metadata Card */}
      <div className="bg-studio-750/70 border border-studio-border rounded-xl p-3.5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-sm text-white">{capture.name}</h3>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">ID: {capture.id}</p>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {capture.frame_count} Frames
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-studio-border/60">
          <div className="flex items-center space-x-2 text-slate-400">
            <Smartphone className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-300 truncate">{capture.device}</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-300">{formatBytes(capture.size_bytes)}</span>
          </div>
          <div className="col-span-2 flex items-center space-x-2 text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-300">{formatDate(capture.created)}</span>
          </div>
        </div>
      </div>

      {/* Camera Intrinsics if available */}
      {capture.camera_info?.w && (
        <div className="bg-studio-750/40 border border-studio-border rounded-xl p-3 space-y-1.5">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-300">
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span>ARKit Camera Intrinsics</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 pt-1">
            <div>Sensor: {capture.camera_info.w} × {capture.camera_info.h}</div>
            <div>Model: {capture.camera_info.camera_model || 'OPENCV'}</div>
          </div>
        </div>
      )}

      {/* Keyframe Images Strip */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300 flex items-center space-x-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>Captured Keyframes</span>
          </span>
          <span className="text-[11px] text-slate-500">{capture.frame_count} images</span>
        </div>
        <div className="flex space-x-2 overflow-x-auto pb-2">
          {Array.from({ length: Math.min(capture.frame_count, 12) }).map((_, idx) => {
            const frameStr = `${idx}`.padStart(5, '0');
            const imgUrl = `/captures/${capture.id}/images/frame_${frameStr}.jpg`;
            return (
              <div
                key={idx}
                className="w-20 h-16 rounded-lg bg-studio-900 border border-studio-border overflow-hidden flex-shrink-0 relative group"
              >
                <img
                  src={imgUrl}
                  alt={`Frame ${idx}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                  onError={(e) => {
                    // Fallback to thumbnail or placeholder
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="absolute bottom-0.5 right-1 text-[9px] font-mono bg-black/70 px-1 rounded text-slate-300">
                  #{idx}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export & Delete Actions */}
      <div className="pt-2 border-t border-studio-border/60 flex items-center space-x-2">
        <a
          href={`/api/captures/${capture.id}/export`}
          download
          className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-studio-700 hover:bg-studio-600 border border-studio-border text-xs font-semibold text-slate-200 transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export .lidarscan.zip</span>
        </a>

        <button
          onClick={onDelete}
          className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
          title="Delete Capture"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
