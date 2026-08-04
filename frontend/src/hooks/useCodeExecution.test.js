import { renderHook, act } from '@testing-library/react';
import axios from 'axios';
import { useCodeExecution } from './useCodeExecution';

describe('useCodeExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the code and stores a successful result', async () => {
    axios.post.mockResolvedValue({
      data: { data: { result: { status: 'success', stdout: 'hi' } } },
    });

    const { result } = renderHook(() =>
      useCodeExecution({ code: 'console.log(1)', language: 'javascript', roomCode: 'ABC123' })
    );

    await act(async () => {
      await result.current.handleRunCode();
    });

    expect(axios.post).toHaveBeenCalledWith(
      '/api/execute',
      expect.objectContaining({
        source_code: 'console.log(1)',
        language: 'javascript',
        roomCode: 'ABC123',
      })
    );
    expect(result.current.executionResult.stdout).toBe('hi');
    expect(result.current.executing).toBe(false);
  });

  it('captures an API error message', async () => {
    axios.post.mockRejectedValue({ response: { data: { message: 'Nope' } } });

    const { result } = renderHook(() =>
      useCodeExecution({ code: 'x', language: 'javascript', roomCode: 'ABC123' })
    );

    await act(async () => {
      await result.current.handleRunCode();
    });

    expect(result.current.executionError).toBe('Nope');
    expect(result.current.executionResult).toBeNull();
  });

  it('toggles the executing flag while running', async () => {
    let release;
    axios.post.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const { result } = renderHook(() =>
      useCodeExecution({ code: 'x', language: 'javascript', roomCode: 'ABC123' })
    );

    let pending;
    act(() => {
      pending = result.current.handleRunCode();
    });
    expect(result.current.executing).toBe(true);

    await act(async () => {
      release({ data: { data: { result: { status: 'success' } } } });
      await pending;
    });
    expect(result.current.executing).toBe(false);
  });

  it('exposes stdin state', () => {
    const { result } = renderHook(() =>
      useCodeExecution({ code: '', language: 'javascript', roomCode: 'ABC123' })
    );

    act(() => result.current.setStdin('5 10'));
    expect(result.current.stdin).toBe('5 10');
  });
});
