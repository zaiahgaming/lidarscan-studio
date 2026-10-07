import React, { useEffect, useState } from 'react';
import { Check, Copy, Smartphone, Wifi, X } from 'lucide-react';
import QRCode from 'qrcode';
import { SystemStatus } from '../types';

interface ConnectDialogProps {
  open: boolean;
  status: SystemStatus | null;
  onClose: () => void;
}

export const ConnectDialog: React.FC<ConnectDialogProps> = ({ open, status, onClose }) => {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const address = status?.lan_url ?? '';

  useEffect(() => {
    if (!open || !address) {
      setQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(address, { margin: 1, width: 220, color: { dark: '#0d0e10', light: '#ffffff' } })
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, address]);

  if (!open) return null;

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable in this context */
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-label="Connect your iPhone">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <span className="microlabel">Phone connection</span>
        <h2>Send a scan to this PC</h2>
        <p>Keep your iPhone and this PC on the same Wi-Fi network, then aim the LidarScan app at this code.</p>

        <div className="connect-body">
          <div className="connect-qr">
            {qr ? (
              <img src={qr} alt="QR code with the Studio address" />
            ) : (
              <div className="qr-fallback">{address ? 'Generating QR…' : 'Studio address unavailable'}</div>
            )}
          </div>
          <ul className="connect-steps">
            <li><b>1.</b> Open LidarScan on your iPhone</li>
            <li><b>2.</b> Go to <b>Studio</b> → scan this QR</li>
            <li><b>3.</b> No camera? Choose <b>Manual entry</b> and type the address</li>
            <li><b>4.</b> Capture — scans stream straight into the library</li>
          </ul>
        </div>

        <div className="connect-address">
          <Wifi size={15} />
          <code>{address || 'Studio is not connected'}</code>
          <button onClick={() => void copy()} title="Copy address" aria-label="Copy address">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>

        <span className="modal-hint">
          <Smartphone size={13} />
          Server receives uploads on port {status?.port ?? 8765} · Bonjour name “LidarScan Studio”
        </span>
      </section>
    </div>
  );
};
