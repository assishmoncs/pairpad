import React from 'react';
import { Link } from 'react-router-dom';

/** 404 Page Not Found component */
const NotFound = () => (
  <div className="app-state">
    <div className="app-state-panel">
      <h1>404 — Page Not Found</h1>
      <p>The page or room you are looking for does not exist or has been moved.</p>
      <div className="app-state-actions">
        <Link to="/dashboard" className="btn-primary">
          Back to Dashboard
        </Link>
      </div>
    </div>
  </div>
);

export default NotFound;
