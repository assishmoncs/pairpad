import { useCallback, useState } from 'react';
import { getErrorMessage } from '../utils/apiError';

/**
 * Run an async action while tracking its pending state and API error message.
 * @param {(...args: any[]) => Promise<any>} action
 * @param {string} fallbackMessage - Error shown when the API returns no message.
 * @returns {{run: Function, pending: boolean, error: string, setError: Function}}
 */
export const useAsyncAction = (action, fallbackMessage) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(
    async (...args) => {
      setError('');
      setPending(true);
      try {
        return await action(...args);
      } catch (err) {
        setError(getErrorMessage(err, fallbackMessage));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [action, fallbackMessage]
  );

  return { run, pending, error, setError };
};
