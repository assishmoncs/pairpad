import { useCallback, useState } from 'react';
import axios from 'axios';
import { getErrorMessage } from '../utils/apiError';

/**
 * Encapsulates the "Run Code" flow: state, stdin, output, and error handling.
 *
 * @param {{ code: string, language: string, roomCode: string }} deps
 */
export const useCodeExecution = ({ code, language, roomCode }) => {
  const [executing, setExecuting] = useState(false);
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionError, setExecutionError] = useState('');

  const handleRunCode = useCallback(async () => {
    setExecuting(true);
    setExecutionResult(null);
    setExecutionError('');

    try {
      const response = await axios.post('/api/execute', {
        source_code: code,
        language,
        roomCode,
        stdin,
      });

      const result = response.data.data.result;
      setExecutionResult(result);

      if (result.status !== 'success' && result.stderr) {
        setExecutionError(result.stderr);
      }
    } catch (err) {
      console.error('[Room] Failed to execute code:', err);
      setExecutionError(getErrorMessage(err, 'Failed to execute code.'));
    } finally {
      setExecuting(false);
    }
  }, [code, language, roomCode, stdin]);

  return {
    executing,
    stdin,
    setStdin,
    showStdin,
    setShowStdin,
    executionResult,
    setExecutionResult,
    executionError,
    setExecutionError,
    handleRunCode,
  };
};
