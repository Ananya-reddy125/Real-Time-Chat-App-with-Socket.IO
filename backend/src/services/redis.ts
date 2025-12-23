import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Publisher client
export const redisPublisher = new Redis(REDIS_URL);

// Subscriber client (needs separate connection)
export const redisSubscriber = new Redis(REDIS_URL);

// General purpose client for caching
export const redis = new Redis(REDIS_URL);

// Channel names
export const CHANNELS = {
    NEW_MESSAGE: 'new_message',
    USER_ONLINE: 'user_online',
    USER_OFFLINE: 'user_offline',
    TYPING: 'typing',
};

// Publish a message to a channel
export async function publishMessage(channel: string, data: object) {
    await redisPublisher.publish(channel, JSON.stringify(data));
}

// Cache online users
export async function setUserOnline(userId: string) {
    await redis.sadd('online_users', userId);
    await redis.set(`user:${userId}:last_seen`, Date.now().toString());
}

export async function setUserOffline(userId: string) {
    await redis.srem('online_users', userId);
    await redis.set(`user:${userId}:last_seen`, Date.now().toString());
}

export async function getOnlineUsers(): Promise<string[]> {
    return redis.smembers('online_users');
}

// Initialize Redis connection handlers
redisPublisher.on('connect', () => {
    console.log('✅ Redis Publisher connected');
});

redisSubscriber.on('connect', () => {
    console.log('✅ Redis Subscriber connected');
});

redis.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
});
