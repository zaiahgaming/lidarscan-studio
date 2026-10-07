import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Job } from '../types';
import { dateTimeLabel } from '../lib/format';

interface JobsDrawerProps {
  open: boolean;
  jobs: Job[];
  onClose: () => void;
}

const STATUS_LABEL: Record<Job['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export const JobsDrawer: React.FC<JobsDrawerProps> = ({ open, jobs, onClose }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, string>>({});

  if (!open) return null;

  const toggleLogs = async (job: Job) => {
    if (expanded === job.id) {
      setExpanded(null);
      return;
    }
    setExpanded(job.id);
    if (logs[job.id] === undefined) {
      try {
        const response = await fetch('/api/jobs/' + encodeURIComponent(job.id) + '/logs');
        const payload = response.ok ? await response.json() : { logs: [] };
        const lines = Array.isArray(payload.logs)
          ? payload.logs.map((entry: unknown) =>
              typeof entry === 'string' ? entry : JSON.stringify(entry),
            )
          : [];
        setLogs((previous) => ({ ...previous, [job.id]: lines.join('\n') || 'No log output yet.' }));
      } catch {
        setLogs((previous) => ({ ...previous, [job.id]: 'Logs are unavailable right now.' }));
      }
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-label="Processing jobs">
        <div className="drawer-head">
          <div>
            <span className="microlabel">Activity</span>
            <h2>Processing jobs</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close jobs">
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          {jobs.length === 0 && (
            <div className="drawer-empty">
              <Activity size={22} />
              <b>No jobs yet</b>
              <p>Reconstruction and splat training appear here once started.</p>
            </div>
          )}

          {jobs.slice(0, 12).map((job) => (
            <div className="job-card" key={job.id}>
              <div className="job-card-top">
                <span className="job-kind">{job.type}</span>
                <b>{job.name}</b>
                <span className="pct">{Math.round(job.progress * 100)}%</span>
              </div>
              <div className="job-status">
                <span
                  className={'status-dot' + (job.status === 'running' ? ' pulse-dot' : '')}
                  style={{
                    background:
                      job.status === 'running' ? 'var(--amber)'
                      : job.status === 'completed' ? 'var(--accent)'
                      : job.status === 'failed' ? 'var(--rose)'
                      : 'var(--faint)',
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {job.status_message || STATUS_LABEL[job.status]}
                  {job.error ? ' — ' + job.error : ''}
                </span>
              </div>
              <div className="job-track">
                <div
                  className={'job-fill ' + job.status}
                  style={{ width: Math.max(job.progress * 100, job.status === 'running' ? 6 : job.status === 'failed' ? 100 : 0) + '%' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span className="microlabel" style={{ letterSpacing: '0.08em' }}>
                  {dateTimeLabel(job.started_at || job.created_at)}
                </span>
                <button className="job-logs-toggle" onClick={() => void toggleLogs(job)}>
                  {expanded === job.id ? (
                    <>
                      <ChevronUp size={12} style={{ verticalAlign: -1 }} /> Hide logs
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} style={{ verticalAlign: -1 }} /> Logs
                    </>
                  )}
                </button>
              </div>
              {expanded === job.id && <pre className="job-logs">{logs[job.id] ?? 'Loading…'}</pre>}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
};
