import React from 'react';

/**
 * Execution output sidebar panel: stdin toggle, output, and errors.
 */
const ExecutionPanel = ({
  executionResult,
  executionError,
  showStdin,
  setShowStdin,
  stdin,
  setStdin,
}) => (
  <div className="sidebar-section execution-section">
    <div className="section-title-row">
      <h3>Execution Output</h3>
      <button
        type="button"
        onClick={() => setShowStdin(!showStdin)}
        className="btn-toggle-stdin"
        title="Configure standard input for code execution"
      >
        {showStdin ? 'Hide Stdin' : 'Input (Stdin)'}
      </button>
    </div>
    {showStdin && (
      <div className="stdin-container">
        <label htmlFor="stdin-input">Standard Input (stdin):</label>
        <textarea
          id="stdin-input"
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Enter input for your program..."
          rows={3}
        />
      </div>
    )}
    {executionError && (
      <div className="execution-error">
        <strong>Error:</strong> {executionError}
      </div>
    )}
    {executionResult && (
      <div className="execution-result">
        {executionResult.stdout && (
          <div className="output-section">
            <strong>Output:</strong>
            <pre>{executionResult.stdout}</pre>
          </div>
        )}
        {executionResult.stderr && !executionError && (
          <div className="error-section">
            <strong>Stderr:</strong>
            <pre>{executionResult.stderr}</pre>
          </div>
        )}
        <div className="execution-meta">
          {executionResult.time && <span>Time: {executionResult.time}</span>}
          {executionResult.memory && <span>Memory: {executionResult.memory}</span>}
          <span>Status: {executionResult.status}</span>
        </div>
      </div>
    )}
    {!executionResult && !executionError && (
      <p className="no-output">Click "Run Code" to see output</p>
    )}
  </div>
);

export default ExecutionPanel;
