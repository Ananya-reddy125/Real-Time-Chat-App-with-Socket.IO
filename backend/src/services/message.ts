import { prisma } from '../lib/prisma.js';

export interface CreateMessageInput {
    content: string;
    senderId: string;
    conversationId: string;
}

export interface MessageWithSender {
    id: string;
    content: string;
    senderId: string;
    conversationId: string;
    createdAt: Date;
    sender: {
        id: string;
        username: string;
        avatar: string | null;
    };
}

// Create a new message
export async function createMessage(input: CreateMessageInput): Promise<MessageWithSender> {
    const message = await prisma.message.create({
        data: {
            content: input.content,
            senderId: input.senderId,
            conversationId: input.conversationId,
        },
        include: {
            sender: {
                select: {
                    id: true,
                    username: true,
                    avatar: true,
                },
            },
        },
    });

    return message;
}

// Get messages for a conversation
export async function getConversationMessages(
    conversationId: string,
    limit = 50,
    cursor?: string
): Promise<MessageWithSender[]> {
    const messages = await prisma.message.findMany({
        where: { conversationId },
        take: limit,
        orderBy: { createdAt: 'desc' },
        ...(cursor && {
            cursor: { id: cursor },
            skip: 1,
        }),
        include: {
            sender: {
                select: {
                    id: true,
                    username: true,
                    avatar: true,
                },
            },
        },
    });

    return messages.reverse();
}

// Get or create a direct conversation between two users
export async function getOrCreateDirectConversation(
    userId1: string,
    userId2: string
): Promise<string> {
    // Find existing conversation between these users
    const existing = await prisma.conversation.findFirst({
        where: {
            isGroup: false,
            AND: [
                { participants: { some: { userId: userId1 } } },
                { participants: { some: { userId: userId2 } } },
            ],
        },
    });

    if (existing) return existing.id;

    // Create new conversation
    const conversation = await prisma.conversation.create({
        data: {
            isGroup: false,
            participants: {
                create: [{ userId: userId1 }, { userId: userId2 }],
            },
        },
    });

    return conversation.id;
}

// Get user's conversations
export async function getUserConversations(userId: string) {
    const conversations = await prisma.conversation.findMany({
        where: {
            participants: { some: { userId } },
        },
        include: {
            participants: {
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            avatar: true,
                            isOnline: true,
                        },
                    },
                },
            },
            messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
            },
        },
        orderBy: { updatedAt: 'desc' },
    });

    return conversations;
}
