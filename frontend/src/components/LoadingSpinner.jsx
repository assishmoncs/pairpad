import React from 'react';

/** Reusable spinner indicator for loading states */
const LoadingSpinner = ({ label = 'Loading...', size = 'medium' }) => (
  <div className={`spinner-container spinner-${size}`}>
    <div className="spinner-ring" />
    {label && <span className="spinner-label">{label}</span>}
  </div>
);

export default LoadingSpinner;
