import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface ToastState {
  message: string;
  error?: boolean;
}

export const Toasts: React.FC<{ toast: ToastState | null }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      <div className={'toast' + (toast.error ? ' error' : '')}>
        {toast.error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
        <span>{toast.message}</span>
      </div>
    </div>
  );
};
