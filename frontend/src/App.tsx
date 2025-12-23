import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import type { User, BotMessage, OllamaStatus } from './types';

const API_URL = 'http://localhost:3001/api';

// Icons
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-state-icon">
    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <circle cx="8" cy="16" r="1" fill="currentColor" />
    <circle cx="16" cy="16" r="1" fill="currentColor" />
  </svg>
);

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const ConnectionDot = ({ connected }: { connected: boolean }) => (
  <span className={`connection-dot ${connected ? 'connected' : ''}`} title={connected ? 'Connected' : 'Disconnected'} />
);

function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Chat state
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  // Bot state
  const [chatMode, setChatMode] = useState<'users' | 'bot'>('users');
  const [botMessages, setBotMessages] = useState<BotMessage[]>([]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ available: false, models: [] });

  // Mobile state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Socket connection
  const {
    messages,
    onlineUsers,
    typingUsers,
    isConnected,
    joinConversation,
    leaveConversation,
    sendMessage,
    sendTyping,
    startDirectChat,
  } = useSocket(currentUser?.id ?? null, currentUser?.username ?? null);

  // Check Ollama status
  const checkOllama = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/bot/status`);
      const status = await res.json();
      setOllamaStatus(status);
    } catch {
      setOllamaStatus({ available: false, models: [] });
    }
  }, []);

  // Fetch users and check Ollama after login
  useEffect(() => {
    if (currentUser) {
      fetchUsers();
      checkOllama();
      fetchBotHistory();
      const interval = setInterval(fetchUsers, 10000);
      return () => clearInterval(interval);
    }
  }, [currentUser, checkOllama]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/users`);
      const data = await res.json();
      setUsers(data.filter((u: User) => u.id !== currentUser?.id));
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchBotHistory = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/bot/history/${currentUser.id}`);
      const history = await res.json();
      setBotMessages(history);
    } catch (error) {
      console.error('Failed to fetch bot history:', error);
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, botMessages]);

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) return;

    setIsLoggingIn(true);
    try {
      const res = await fetch(`${API_URL}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim() }),
      });
      const user = await res.json();
      setCurrentUser(user);
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    if (currentConversationId) {
      leaveConversation(currentConversationId);
    }
    setCurrentUser(null);
    setSelectedUser(null);
    setCurrentConversationId(null);
    setLoginUsername('');
    setBotMessages([]);
    setChatMode('users');
  };

  // Handle selecting a user to chat with
  const handleSelectUser = async (user: User) => {
    if (selectedUser?.id === user.id) return;
    
    if (currentConversationId) {
      leaveConversation(currentConversationId);
    }

    setSelectedUser(user);
    setChatMode('users');
    setIsSidebarOpen(false);

    const conversationId = await startDirectChat(user.id);
    setCurrentConversationId(conversationId);
    joinConversation(conversationId);
  };

  // Handle selecting bot chat
  const handleSelectBot = () => {
    if (currentConversationId) {
      leaveConversation(currentConversationId);
    }
    setSelectedUser(null);
    setCurrentConversationId(null);
    setChatMode('bot');
    setIsSidebarOpen(false);
    fetchBotHistory();
  };

  // Handle sending a message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    if (chatMode === 'bot' && currentUser) {
      // Bot chat
      const userMsg = messageInput.trim();
      setBotMessages(prev => [...prev, { role: 'user', content: userMsg }]);
      setMessageInput('');
      setIsBotTyping(true);

      try {
        const res = await fetch(`${API_URL}/bot/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            message: userMsg,
          }),
        });
        const data = await res.json();
        setBotMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } catch (error) {
        setBotMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble processing that. Please try again.' }]);
      } finally {
        setIsBotTyping(false);
      }
    } else if (currentConversationId) {
      // User chat
      sendMessage(currentConversationId, messageInput.trim());
      setMessageInput('');
      sendTyping(currentConversationId, false);
    }
  };

  // Handle clearing bot history
  const handleClearBotHistory = async () => {
    if (!currentUser) return;
    try {
      await fetch(`${API_URL}/bot/history/${currentUser.id}`, { method: 'DELETE' });
      setBotMessages([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  // Handle typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);

    if (currentConversationId && chatMode === 'users') {
      sendTyping(currentConversationId, true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(currentConversationId, false);
      }, 2000);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Format time
  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Get initials
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Login screen
  if (!currentUser) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-logo">💬</div>
          <h1 className="login-title">SEO Chat</h1>
          <p className="login-subtitle">Real-time messaging with AI assistant powered by Ollama</p>
          <input
            type="text"
            className="login-input"
            placeholder="Enter your username"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            autoFocus
          />
          <button type="submit" className="login-button" disabled={isLoggingIn || !loginUsername.trim()}>
            {isLoggingIn ? (
              <span className="button-loading">
                <span className="spinner" />
                Connecting...
              </span>
            ) : (
              'Start Chatting'
            )}
          </button>
          <p className="login-hint">Chat with other users or talk to the AI assistant</p>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Mobile overlay */}
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <h1 className="sidebar-title">SEO Chat</h1>
            <ConnectionDot connected={isConnected} />
          </div>
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.username} />
              ) : (
                getInitials(currentUser.username)
              )}
            </div>
            <span className="sidebar-username">{currentUser.username}</span>
            <button className="logout-button" onClick={handleLogout} title="Logout">
              <LogoutIcon />
            </button>
          </div>
        </div>
        
        <div className="user-list">
          {/* Bot Option */}
          <p className="user-list-title">
            <span>AI Assistant</span>
            {ollamaStatus.available && <span className="badge-online">Online</span>}
          </p>
          <div
            className={`user-item bot-item ${chatMode === 'bot' ? 'active' : ''}`}
            onClick={handleSelectBot}
          >
            <div className="user-avatar bot-avatar">
              <BotIcon />
              <span className={`status-badge ${ollamaStatus.available ? 'online' : 'offline'}`} />
            </div>
            <div className="user-info">
              <div className="user-name">SEO Assistant</div>
              <div className="user-status">
                {ollamaStatus.available ? (
                  <span className="status-online">● Powered by Ollama</span>
                ) : (
                  <span className="status-offline">○ Ollama not running</span>
                )}
              </div>
            </div>
          </div>

          {/* Users */}
          <p className="user-list-title">
            <span>Users</span>
            <span className="user-count">{users.length}</span>
          </p>
          {users.length === 0 ? (
            <div className="no-users">
              <p>No other users yet</p>
              <p className="hint">Open another browser window and login</p>
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className={`user-item ${selectedUser?.id === user.id && chatMode === 'users' ? 'active' : ''}`}
                onClick={() => handleSelectUser(user)}
              >
                <div className="user-avatar">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.username} />
                  ) : (
                    getInitials(user.username)
                  )}
                  <span className={`status-badge ${onlineUsers.has(user.id) ? 'online' : 'offline'}`} />
                </div>
                <div className="user-info">
                  <div className="user-name">{user.username}</div>
                  <div className="user-status">
                    {onlineUsers.has(user.id) ? (
                      <span className="status-online">● Online</span>
                    ) : (
                      <span className="status-offline">○ Offline</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {chatMode === 'bot' ? (
          <>
            {/* Bot Chat Header */}
            <header className="chat-header">
              <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
                <MenuIcon />
              </button>
              <div className="chat-header-avatar bot-avatar">
                <BotIcon />
                <span className={`status-badge ${ollamaStatus.available ? 'online' : 'offline'}`} />
              </div>
              <div className="chat-header-info">
                <div className="chat-header-name">SEO Assistant</div>
                <div className="chat-header-status">
                  {ollamaStatus.available ? (
                    <span className="status-online">Powered by Ollama</span>
                  ) : (
                    <span className="status-offline">Ollama not available</span>
                  )}
                </div>
              </div>
              {botMessages.length > 0 && (
                <button className="clear-history-btn" onClick={handleClearBotHistory} title="Clear chat history">
                  <TrashIcon />
                </button>
              )}
            </header>

            {/* Bot Messages */}
            <div className="messages-container">
              {botMessages.length === 0 ? (
                <div className="messages-empty">
                  <div className="bot-welcome-icon">🤖</div>
                  <p className="welcome-title">Hi, I'm SEO Assistant!</p>
                  <p className="hint">
                    {ollamaStatus.available 
                      ? "Ask me anything. I'm here to help!"
                      : "Make sure Ollama is running to chat with me."}
                  </p>
                </div>
              ) : (
                botMessages.map((msg, index) => (
                  <div key={index} className={`message ${msg.role === 'user' ? 'self' : ''}`}>
                    {msg.role === 'assistant' && (
                      <div className="message-avatar bot-msg-avatar">
                        <BotIcon />
                      </div>
                    )}
                    <div className="message-bubble">
                      <div className="message-text">{msg.content}</div>
                    </div>
                  </div>
                ))
              )}
              {isBotTyping && (
                <div className="message">
                  <div className="message-avatar bot-msg-avatar">
                    <BotIcon />
                  </div>
                  <div className="typing-bubble">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="message-input-container">
              <form className="message-input-wrapper" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  className="message-input"
                  placeholder={ollamaStatus.available ? "Ask me anything..." : "Ollama not running..."}
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={!ollamaStatus.available}
                  autoFocus
                />
                <button type="submit" className="send-button" disabled={!messageInput.trim() || !ollamaStatus.available}>
                  <SendIcon />
                </button>
              </form>
            </div>
          </>
        ) : selectedUser ? (
          <>
            {/* User Chat Header */}
            <header className="chat-header">
              <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
                <MenuIcon />
              </button>
              <div className="chat-header-avatar">
                {selectedUser.avatar ? (
                  <img src={selectedUser.avatar} alt={selectedUser.username} />
                ) : (
                  getInitials(selectedUser.username)
                )}
                <span className={`status-badge ${onlineUsers.has(selectedUser.id) ? 'online' : 'offline'}`} />
              </div>
              <div className="chat-header-info">
                <div className="chat-header-name">{selectedUser.username}</div>
                <div className="chat-header-status">
                  {onlineUsers.has(selectedUser.id) ? (
                    <span className="status-online">Online now</span>
                  ) : (
                    <span className="status-offline">Last seen recently</span>
                  )}
                </div>
              </div>
            </header>

            {/* Messages */}
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="messages-empty">
                  <p>No messages yet</p>
                  <p className="hint">Send a message to start the conversation!</p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isSelf = message.senderId === currentUser.id;
                  const showAvatar = index === 0 || messages[index - 1].senderId !== message.senderId;
                  
                  return (
                    <div key={message.id} className={`message ${isSelf ? 'self' : ''} ${!showAvatar ? 'grouped' : ''}`}>
                      {!isSelf && showAvatar && (
                        <div className="message-avatar">
                          <img
                            src={message.sender.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${message.sender.username}`}
                            alt={message.sender.username}
                          />
                        </div>
                      )}
                      <div className="message-bubble">
                        <div className="message-text">{message.content}</div>
                        <div className="message-time">{formatTime(message.createdAt)}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
              <div className="typing-indicator">
                <div className="typing-avatar">
                  <img
                    src={selectedUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${selectedUser.username}`}
                    alt={selectedUser.username}
                  />
                </div>
                <div className="typing-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="message-input-container">
              <form className="message-input-wrapper" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  className="message-input"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
                <button type="submit" className="send-button" disabled={!messageInput.trim()}>
                  <SendIcon />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <button className="mobile-menu-btn floating" onClick={() => setIsSidebarOpen(true)}>
              <MenuIcon />
            </button>
            <ChatIcon />
            <h2 className="empty-state-title">Select a conversation</h2>
            <p className="empty-state-text">
              Choose a user or try the AI assistant
            </p>
            {!isConnected && (
              <p className="empty-state-warning">
                ⚠️ Connecting to server...
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
