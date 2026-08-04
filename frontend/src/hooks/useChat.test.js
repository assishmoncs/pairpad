import { renderHook, act } from '@testing-library/react';
import axios from 'axios';
import socketService from '../services/socketService';
import { useChat } from './useChat';

vi.mock('../services/socketService', () => ({
  default: {
    sendChatMessage: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads chat history', async () => {
    axios.get.mockResolvedValue({
      data: { data: { messages: [{ _id: 'm1', content: 'hello' }] } },
    });

    const { result } = renderHook(() => useChat({ roomCode: 'ABC123' }));

    await act(async () => {
      await result.current.fetchMessages();
    });

    expect(axios.get).toHaveBeenCalledWith('/api/messages/room/ABC123');
    expect(result.current.messages).toHaveLength(1);
  });

  it('deduplicates incoming messages by id', () => {
    const { result } = renderHook(() => useChat({ roomCode: 'ABC123' }));

    act(() => result.current.handleIncomingMessage({ _id: 'm1', content: 'a' }));
    act(() => result.current.handleIncomingMessage({ _id: 'm1', content: 'a2' }));
    act(() => result.current.handleIncomingMessage({ _id: 'm2', content: 'b' }));

    expect(result.current.messages).toHaveLength(2);
  });

  it('sends a trimmed message and clears the input', async () => {
    const { result } = renderHook(() => useChat({ roomCode: 'ABC123' }));

    act(() => result.current.setNewMessage('  hi there  '));

    await act(async () => {
      await result.current.handleSendMessage({ preventDefault: vi.fn() });
    });

    expect(socketService.sendChatMessage).toHaveBeenCalledWith('hi there');
    expect(result.current.newMessage).toBe('');
  });

  it('records an error when sending fails', async () => {
    socketService.sendChatMessage.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useChat({ roomCode: 'ABC123' }));

    act(() => result.current.setNewMessage('hi'));

    await act(async () => {
      await result.current.handleSendMessage({ preventDefault: vi.fn() });
    });

    expect(result.current.messagesError).toContain('boom');
  });
});
