import React, { useState } from 'react';
import { Search, Folder, Smartphone, Calendar, Layers, Sparkles, Box, RefreshCw } from 'lucide-react';
import { Capture } from '../types';

interface InboxSidebarProps {
  captures: Capture[];
  selectedId: string | null;
  onSelectCapture: (id: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const InboxSidebar: React.FC<InboxSidebarProps> = ({
  captures,
  selectedId,
  onSelectCapture,
  onRefresh,
  isLoading,
}) => {
  const [search, setSearch] = useState('');

  const filtered = captures.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.device.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <aside className="w-80 border-r border-studio-border bg-studio-800 flex flex-col h-full select-none flex-shrink-0">
      {/* Header & Search */}
      <div className="p-3 border-b border-studio-border space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Folder className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Captures Library
            </h2>
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-studio-700 text-slate-400">
              {captures.length}
            </span>
          </div>
          <button
            onClick={onRefresh}
            className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-studio-700 transition-colors ${
              isLoading ? 'animate-spin' : ''
            }`}
            title="Refresh library"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search captures..."
            className="w-full pl-8 pr-3 py-1.5 bg-studio-900 border border-studio-border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Captures List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Box className="w-8 h-8 stroke-1 mb-2 text-slate-600" />
            <p className="text-xs font-medium">No captures found</p>
            <p className="text-[11px] text-slate-600 mt-1">Upload a zip or connect your iPhone to stream scans</p>
          </div>
        ) : (
          filtered.map((cap) => {
            const isSelected = cap.id === selectedId;
            const thumbUrl = cap.has_thumbnail
              ? `/captures/${cap.id}/thumbnail.jpg`
              : null;

            return (
              <div
                key={cap.id}
                onClick={() => onSelectCapture(cap.id)}
                className={`p-2.5 rounded-xl cursor-pointer border transition-all duration-150 flex space-x-3 items-center ${
                  isSelected
                    ? 'bg-studio-700/90 border-cyan-500/50 shadow-md shadow-cyan-950/30'
                    : 'bg-studio-750/40 border-studio-border/50 hover:bg-studio-700/40 hover:border-studio-border'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-lg bg-studio-900 border border-studio-border overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={cap.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Box className="w-6 h-6 text-slate-600 stroke-1" />
                  )}
                  {cap.has_splats && (
                    <span className="absolute bottom-1 right-1 p-0.5 bg-cyan-950/80 border border-cyan-400/40 rounded text-cyan-300">
                      <Sparkles className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-100 truncate pr-1">
                      {cap.name}
                    </h3>
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Smartphone className="w-3 h-3 text-slate-500" />
                      <span className="truncate">{cap.device}</span>
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 mt-1">
                    <Calendar className="w-2.5 h-2.5" />
                    <span>{formatDate(cap.created)}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-400">{cap.frame_count} frames</span>
                  </div>

                  {/* Asset tags */}
                  <div className="flex items-center space-x-1 mt-1.5">
                    {cap.has_mesh && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Mesh
                      </span>
                    )}
                    {cap.has_splats && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        Splat
                      </span>
                    )}
                    {cap.has_pointcloud && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        PCD
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
