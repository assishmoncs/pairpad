import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import socketService from '../services/socketService';
import { appendUniqueMessage } from '../utils/messages';

/**
 * Encapsulates room chat state: history loading, sending, and live
 * (deduplicated) updates broadcast over the socket.
 *
 * @param {{ roomCode: string }} deps
 */
export const useChat = ({ roomCode }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const messagesEndRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await axios.get(`/api/messages/room/${roomCode}`);
      setMessages(response.data.data.messages || []);
      setMessagesError('');
    } catch (err) {
      console.error('[Room] Failed to fetch messages:', err);
      setMessagesError(err.response?.data?.message || 'Failed to load chat history.');
    }
  }, [roomCode]);

  // Scroll to bottom whenever new messages arrive.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(
    async (e) => {
      e.preventDefault();
      if (!newMessage.trim() || sendingMessage) return;

      setSendingMessage(true);
      setMessagesError('');
      try {
        await socketService.sendChatMessage(newMessage.trim());
        setNewMessage('');
      } catch (err) {
        console.error('[Room] Failed to send message:', err);
        setMessagesError('Failed to send message: ' + (err.message || 'Unknown error'));
      } finally {
        setSendingMessage(false);
      }
    },
    [newMessage, sendingMessage]
  );

  const handleIncomingMessage = useCallback((message) => {
    setMessages((prev) => appendUniqueMessage(prev, message));
  }, []);

  return {
    messages,
    newMessage,
    setNewMessage,
    sendingMessage,
    messagesError,
    messagesEndRef,
    fetchMessages,
    handleSendMessage,
    handleIncomingMessage,
  };
};
