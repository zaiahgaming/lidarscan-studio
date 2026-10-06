import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Smartphone, Wifi, Copy, Check, Radio } from 'lucide-react';
import { SystemStatus } from '../types';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SystemStatus | null;
}

export const QrModal: React.FC<QrModalProps> = ({ isOpen, onClose, status }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status?.lan_url) {
      QRCode.toDataURL(status.lan_url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Error generating QR code:', err));
    }
  }, [status?.lan_url]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (status?.lan_url) {
      navigator.clipboard.writeText(status.lan_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-studio-800 border border-studio-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-studio-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Connect iPhone App</h3>
            <p className="text-xs text-slate-400">Stream captures directly from your iPhone LiDAR</p>
          </div>
        </div>

        {/* QR Code Card */}
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-inner mx-auto w-56 h-56">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="LidarScan Studio LAN QR Code" className="w-48 h-48" />
          ) : (
            <div className="text-slate-400 text-xs animate-pulse">Generating QR code...</div>
          )}
        </div>

        {/* Server Address Box */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Server LAN Address
          </label>
          <div className="flex items-center justify-between p-2.5 bg-studio-900 border border-studio-border rounded-xl">
            <span className="font-mono text-sm font-bold text-emerald-400">
              {status?.lan_url || 'http://192.168.0.87:8765'}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-studio-700 hover:bg-studio-600 text-xs font-semibold text-slate-200 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-2 text-xs text-slate-300 bg-studio-750/50 p-3.5 rounded-xl border border-studio-border/60">
          <div className="flex items-center space-x-2 text-slate-200 font-bold">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Automatic Bonjour Discovery</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The studio broadcasts via Bonjour as <span className="font-mono text-cyan-300">_lidarscan._tcp</span>. If your iPhone is on the same Wi-Fi, it will discover this PC automatically without typing!
          </p>
        </div>
      </div>
    </div>
  );
};
