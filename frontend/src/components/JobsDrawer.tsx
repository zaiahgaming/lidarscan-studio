import React, { useState, useEffect } from 'react';
import { X, Activity, CheckCircle2, AlertCircle, Clock, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { Job } from '../types';

interface JobsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: Job[];
}

export const JobsDrawer: React.FC<JobsDrawerProps> = ({ isOpen, onClose, jobs }) => {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Fetch logs when a job is expanded
  useEffect(() => {
    if (!expandedJobId) return;

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/jobs/${expandedJobId}/logs`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Error fetching logs:', err);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, [expandedJobId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-studio-800 border-l border-studio-border shadow-2xl z-40 flex flex-col select-none">
      {/* Header */}
      <div className="h-16 px-4 border-b border-studio-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white">Background Jobs</h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-studio-700 text-slate-300">
            {jobs.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-studio-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Jobs List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {jobs.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Clock className="w-8 h-8 stroke-1 mb-2 text-slate-600" />
            <p className="text-xs font-medium">No processing jobs active</p>
          </div>
        ) : (
          jobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            return (
              <div
                key={job.id}
                className="bg-studio-750/60 border border-studio-border rounded-xl p-3 space-y-2 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{job.name}</h4>
                    <p className="text-[10px] font-mono text-slate-400">{job.status_message}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1 ${
                      job.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : job.status === 'running'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                        : job.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {job.status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                    {job.status === 'failed' && <AlertCircle className="w-2.5 h-2.5" />}
                    <span>{job.status}</span>
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Progress</span>
                    <span>{Math.round(job.progress * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-studio-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        job.status === 'completed'
                          ? 'bg-emerald-400'
                          : job.status === 'failed'
                          ? 'bg-rose-500'
                          : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                      }`}
                      style={{ width: `${Math.max(job.progress * 100, 5)}%` }}
                    />
                  </div>
                </div>

                {/* Expand Logs button */}
                <div className="pt-1 flex items-center justify-between border-t border-studio-border/50 text-[11px]">
                  <button
                    onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                    className="flex items-center space-x-1 text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    <Terminal className="w-3 h-3" />
                    <span>{isExpanded ? 'Hide Console' : 'View Logs'}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <span className="text-[10px] font-mono text-slate-500">ID: {job.id}</span>
                </div>

                {/* Log terminal */}
                {isExpanded && (
                  <div className="mt-2 p-2 rounded-lg bg-black/80 border border-studio-border text-[10px] font-mono text-slate-300 max-h-48 overflow-y-auto space-y-0.5">
                    {logs.length === 0 ? (
                      <p className="text-slate-600">Waiting for logs...</p>
                    ) : (
                      logs.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
