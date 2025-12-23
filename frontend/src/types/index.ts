export interface User {
    id: string;
    username: string;
    avatar: string | null;
    isOnline: boolean;
    isBot?: boolean;
    lastSeen: string;
}

export interface Message {
    id: string;
    content: string;
    senderId: string;
    conversationId: string;
    createdAt: string;
    sender: {
        id: string;
        username: string;
        avatar: string | null;
    };
}

export interface BotMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface Conversation {
    id: string;
    name: string | null;
    isGroup: boolean;
    participants: {
        user: User;
    }[];
    messages: Message[];
}

export interface TypingUser {
    userId: string;
    username: string;
    isTyping: boolean;
}

export interface OllamaStatus {
    available: boolean;
    models: string[];
}
