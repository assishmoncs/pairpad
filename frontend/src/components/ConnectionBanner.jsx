import React from 'react';

export default function ConnectionBanner({ status, message, onRetry }) {
  if (status === 'connected') return null;

  const labels = {
    reconnecting: 'Reconnecting to PairPad…',
    disconnected: 'Disconnected from the collaboration server.',
  };

  return (
    <div
      className={`connection-banner connection-banner-${status}`}
      role="status"
      aria-live="polite"
    >
      <div>
        <strong>{labels[status] || 'Connection unavailable'}</strong>
        {message ? <span>{message}</span> : null}
      </div>
      {status === 'disconnected' && onRetry ? (
        <button type="button" className="btn-retry-connection" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
