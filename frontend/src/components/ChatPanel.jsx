import React from 'react';

/**
 * Room chat sidebar panel: message history, live updates, and the compose form.
 */
const ChatPanel = ({
  messages,
  messagesError,
  newMessage,
  setNewMessage,
  sendingMessage,
  connected,
  handleSendMessage,
  messagesEndRef,
}) => (
  <div className="sidebar-section chat-section">
    <h3>Room Chat</h3>
    {messagesError && <div className="chat-error error-text">{messagesError}</div>}
    <div className="messages-container">
      {messages.map((msg, index) => (
        <div key={(msg._id || msg.id || index).toString()} className="message-item">
          <div className="message-header">
            <span className="message-sender">{msg.sender?.name || 'Unknown'}</span>
            <span className="message-time">
              {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
            </span>
          </div>
          <div className="message-content">{msg.content}</div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>

    <form onSubmit={handleSendMessage} className="chat-form">
      <input
        type="text"
        value={newMessage}
        onChange={(e) => setNewMessage(e.target.value)}
        placeholder="Type a message..."
        maxLength={1000}
        disabled={sendingMessage || !connected}
      />
      <button
        type="submit"
        disabled={!newMessage.trim() || sendingMessage || !connected}
        className="btn-send"
      >
        {sendingMessage ? '...' : 'Send'}
      </button>
    </form>
  </div>
);

export default ChatPanel;
