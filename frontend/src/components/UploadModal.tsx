import React, { useRef, useState } from 'react';
import { FileArchive, LoaderCircle, UploadCloud, X } from 'lucide-react';

interface UploadModalProps {
  open: boolean;
  progress: number | null;
  onFile: (file: File) => void;
  onClose: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ open, progress, onFile, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);

  if (!open) return null;

  const uploading = progress !== null;

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setArmed(false);
    if (uploading) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !uploading) onClose();
      }}
    >
      <section className="modal" role="dialog" aria-label="Import a scan">
        <button className="icon-btn modal-close" onClick={onClose} disabled={uploading} aria-label="Close">
          <X size={16} />
        </button>
        <span className="microlabel">Import</span>
        <h2>Add a capture</h2>
        <p>Bring a .lidarscan.zip bundle exported from the iPhone app, or drop one anywhere on this window.</p>

        {uploading ? (
          <div className="upload-progress">
            <div className="row">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <LoaderCircle size={14} className="spin" />
                Importing scan…
              </span>
              <b>{progress}%</b>
            </div>
            <div className="upload-track">
              <div className="upload-fill" style={{ width: progress + '%' }} />
            </div>
          </div>
        ) : (
          <div
            className={'dropzone' + (armed ? ' armed' : '')}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setArmed(true);
            }}
            onDragLeave={() => setArmed(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
            }}
          >
            <UploadCloud size={26} />
            <b>Drop the bundle here</b>
            <span>or click to browse · .zip / .lidarscan.zip</span>
          </div>
        )}

        <div className="insp-note" style={{ marginTop: 14 }}>
          <FileArchive size={13} />
          Exports live in the iPhone app under Captures → Share.
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,.lidarscan.zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onFile(file);
          }}
        />
      </section>
    </div>
  );
};
