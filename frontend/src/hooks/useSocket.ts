import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Message, TypingUser } from '../types';

const SOCKET_URL = 'http://localhost:3001';

interface SocketState {
    messages: Message[];
    onlineUsers: Set<string>;
    typingUsers: Map<string, string>;
    isConnected: boolean;
}

export function useSocket(userId: string | null, username: string | null) {
    const socketRef = useRef<Socket | null>(null);
    const [state, setState] = useState<SocketState>({
        messages: [],
        onlineUsers: new Set(),
        typingUsers: new Map(),
        isConnected: false,
    });
    const currentConversationRef = useRef<string | null>(null);

    useEffect(() => {
        if (!userId || !username) return;

        // Connect to socket server
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Socket connected:', socket.id);
            setState(prev => ({ ...prev, isConnected: true }));
            socket.emit('authenticate', { userId, username });
        });

        socket.on('disconnect', () => {
            console.log('❌ Socket disconnected');
            setState(prev => ({ ...prev, isConnected: false }));
        });

        socket.on('new_message', (message: Message) => {
            console.log('📩 New message received:', message);
            setState(prev => ({
                ...prev,
                messages: [...prev.messages, message],
            }));
        });

        socket.on('message_history', (data: { conversationId: string; messages: Message[] }) => {
            console.log('📚 Message history received:', data.messages.length, 'messages');
            if (data.conversationId === currentConversationRef.current) {
                setState(prev => ({
                    ...prev,
                    messages: data.messages,
                }));
            }
        });

        socket.on('online_users', (userIds: string[]) => {
            console.log('👥 Online users:', userIds);
            setState(prev => ({
                ...prev,
                onlineUsers: new Set(userIds),
            }));
        });

        socket.on('user_online', (data: { userId: string }) => {
            console.log('🟢 User online:', data.userId);
            setState(prev => ({
                ...prev,
                onlineUsers: new Set(prev.onlineUsers).add(data.userId),
            }));
        });

        socket.on('user_offline', (data: { userId: string }) => {
            console.log('🔴 User offline:', data.userId);
            setState(prev => {
                const newOnlineUsers = new Set(prev.onlineUsers);
                newOnlineUsers.delete(data.userId);
                return { ...prev, onlineUsers: newOnlineUsers };
            });
        });

        socket.on('user_typing', (data: TypingUser) => {
            setState(prev => {
                const newTypingUsers = new Map(prev.typingUsers);
                if (data.isTyping) {
                    newTypingUsers.set(data.userId, data.username);
                } else {
                    newTypingUsers.delete(data.userId);
                }
                return { ...prev, typingUsers: newTypingUsers };
            });
        });

        socket.on('conversation_started', (data: { conversationId: string }) => {
            console.log('💬 Conversation started:', data.conversationId);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [userId, username]);

    const joinConversation = (conversationId: string) => {
        currentConversationRef.current = conversationId;
        setState(prev => ({ ...prev, messages: [] }));
        socketRef.current?.emit('join_conversation', conversationId);
    };

    const leaveConversation = (conversationId: string) => {
        socketRef.current?.emit('leave_conversation', conversationId);
        currentConversationRef.current = null;
    };

    const sendMessage = (conversationId: string, content: string) => {
        console.log('📤 Sending message:', content);
        socketRef.current?.emit('send_message', { conversationId, content });
    };

    const sendTyping = (conversationId: string, isTyping: boolean) => {
        socketRef.current?.emit('typing', { conversationId, isTyping });
    };

    const startDirectChat = (targetUserId: string): Promise<string> => {
        return new Promise((resolve) => {
            socketRef.current?.emit('start_direct', targetUserId);
            socketRef.current?.once('conversation_started', (data: { conversationId: string }) => {
                resolve(data.conversationId);
            });
        });
    };

    return {
        ...state,
        joinConversation,
        leaveConversation,
        sendMessage,
        sendTyping,
        startDirectChat,
    };
}
