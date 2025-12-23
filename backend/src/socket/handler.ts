import { Server, Socket } from 'socket.io';
import { createMessage, getConversationMessages, getOrCreateDirectConversation } from '../services/message.js';
import {
    publishMessage,
    setUserOnline,
    setUserOffline,
    getOnlineUsers,
    redisSubscriber,
    CHANNELS
} from '../services/redis.js';
import { prisma } from '../lib/prisma.js';

interface UserSocket extends Socket {
    userId?: string;
    username?: string;
}

export function setupSocketHandlers(io: Server) {
    // Subscribe to Redis channels for cross-server messaging
    redisSubscriber.subscribe(CHANNELS.NEW_MESSAGE, CHANNELS.USER_ONLINE, CHANNELS.USER_OFFLINE);

    redisSubscriber.on('message', (channel, message) => {
        const data = JSON.parse(message);

        if (channel === CHANNELS.NEW_MESSAGE) {
            io.to(data.conversationId).emit('new_message', data.message);
        } else if (channel === CHANNELS.USER_ONLINE) {
            io.emit('user_online', { userId: data.userId });
        } else if (channel === CHANNELS.USER_OFFLINE) {
            io.emit('user_offline', { userId: data.userId });
        }
    });

    io.on('connection', async (socket: UserSocket) => {
        console.log('🔌 New connection:', socket.id);

        // Handle user authentication
        socket.on('authenticate', async (data: { userId: string; username: string }) => {
            socket.userId = data.userId;
            socket.username = data.username;

            // Update user status in database and cache
            await prisma.user.update({
                where: { id: data.userId },
                data: { isOnline: true, lastSeen: new Date() },
            });
            await setUserOnline(data.userId);

            // Notify others
            await publishMessage(CHANNELS.USER_ONLINE, { userId: data.userId });

            // Send online users list
            const onlineUsers = await getOnlineUsers();
            socket.emit('online_users', onlineUsers);

            console.log(`✅ User authenticated: ${data.username}`);
        });

        // Join a conversation room
        socket.on('join_conversation', async (conversationId: string) => {
            socket.join(conversationId);

            // Send message history
            const messages = await getConversationMessages(conversationId);
            socket.emit('message_history', { conversationId, messages });

            console.log(`📥 ${socket.username} joined conversation: ${conversationId}`);
        });

        // Leave a conversation room
        socket.on('leave_conversation', (conversationId: string) => {
            socket.leave(conversationId);
            console.log(`📤 ${socket.username} left conversation: ${conversationId}`);
        });

        // Send a message
        socket.on('send_message', async (data: { conversationId: string; content: string }) => {
            if (!socket.userId) return;

            const message = await createMessage({
                content: data.content,
                senderId: socket.userId,
                conversationId: data.conversationId,
            });

            // Publish to Redis for multi-server support
            await publishMessage(CHANNELS.NEW_MESSAGE, {
                conversationId: data.conversationId,
                message,
            });
        });

        // Typing indicator
        socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
            socket.to(data.conversationId).emit('user_typing', {
                userId: socket.userId,
                username: socket.username,
                isTyping: data.isTyping,
            });
        });

        // Start a direct conversation
        socket.on('start_direct', async (targetUserId: string) => {
            if (!socket.userId) return;

            const conversationId = await getOrCreateDirectConversation(socket.userId, targetUserId);
            socket.emit('conversation_started', { conversationId });
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            if (socket.userId) {
                await prisma.user.update({
                    where: { id: socket.userId },
                    data: { isOnline: false, lastSeen: new Date() },
                });
                await setUserOffline(socket.userId);
                await publishMessage(CHANNELS.USER_OFFLINE, { userId: socket.userId });
            }
            console.log(`👋 User disconnected: ${socket.username || socket.id}`);
        });
    });
}
