import { prisma } from '../lib/prisma.js';
import { getUserContext, analyzeQueryIntent } from './context.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';

// Concurrent request handling
const MAX_CONCURRENT_REQUESTS = 5;
let activeRequests = 0;
const requestQueue: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    params: { userId: string; userMessage: string; model: string };
}> = [];

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface OllamaResponse {
    model: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
}

// Get chat history for a user
export async function getBotChatHistory(userId: string, limit = 20): Promise<ChatMessage[]> {
    const messages = await prisma.botChat.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });

    return messages.reverse().map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
    }));
}

// Save a message to chat history
export async function saveBotMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    model: string = DEFAULT_MODEL,
    context?: string
) {
    return prisma.botChat.create({
        data: {
            userId,
            role,
            content,
            model,
            context,
        },
    });
}

// Clear chat history for a user
export async function clearBotChatHistory(userId: string) {
    return prisma.botChat.deleteMany({
        where: { userId },
    });
}

// Process queued requests
async function processQueue() {
    while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
        const request = requestQueue.shift();
        if (request) {
            activeRequests++;
            try {
                const result = await executeOllamaRequest(
                    request.params.userId,
                    request.params.userMessage,
                    request.params.model
                );
                request.resolve(result);
            } catch (error) {
                request.reject(error as Error);
            } finally {
                activeRequests--;
                processQueue(); // Process next in queue
            }
        }
    }
}

// Main chat function with queue management
export async function chatWithOllama(
    userId: string,
    userMessage: string,
    model: string = DEFAULT_MODEL
): Promise<string> {
    return new Promise((resolve, reject) => {
        requestQueue.push({
            resolve,
            reject,
            params: { userId, userMessage, model },
        });
        processQueue();
    });
}

// Execute the actual Ollama request
async function executeOllamaRequest(
    userId: string,
    userMessage: string,
    model: string
): Promise<string> {
    // Analyze the query to see if we need database context
    const intent = analyzeQueryIntent(userMessage);

    // Get user context if it's a data-related query
    let dbContext = '';
    if (intent.isDataQuery) {
        dbContext = await getUserContext(userId);
    }

    // Get conversation history (limited)
    const history = await getBotChatHistory(userId, 6);

    // Save user message
    await saveBotMessage(userId, 'user', userMessage, model);

    // Build system prompt with context
    let systemPrompt = `You are SEO Assistant, an AI helper for the SEO Chat app. You are friendly, helpful, and concise.`;

    if (intent.isDataQuery && dbContext) {
        systemPrompt += `\n\nYou have access to the user's data from the database. When they ask about their projects, tasks, or profile, use this information to give accurate answers:\n${dbContext}\n\nIMPORTANT: Base your answers on the actual data provided above. Be specific about project names, statuses, deadlines, and task details.`;
    } else {
        systemPrompt += ` Keep responses short and conversational unless the user asks for detailed information.`;
    }

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
    ];

    try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
                options: {
                    temperature: 0.7,
                    num_predict: 500, // Limit response length for speed
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as OllamaResponse;
        const assistantMessage = data.message.content;

        // Save assistant response with context info
        await saveBotMessage(
            userId,
            'assistant',
            assistantMessage,
            model,
            intent.isDataQuery ? JSON.stringify({ type: intent.queryType, keywords: intent.keywords }) : undefined
        );

        return assistantMessage;
    } catch (error) {
        console.error('Ollama error:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';

        if (errorMsg.includes('ECONNREFUSED')) {
            return "I'm having trouble connecting to my brain (Ollama). Make sure Ollama is running!";
        }

        return `Sorry, I encountered an error: ${errorMsg}`;
    }
}

// Check if Ollama is available
export async function checkOllamaStatus(): Promise<{ available: boolean; models: string[] }> {
    try {
        const response = await fetch(`${OLLAMA_URL}/api/tags`);
        if (!response.ok) {
            return { available: false, models: [] };
        }
        const data = await response.json();
        const models = data.models?.map((m: { name: string }) => m.name) || [];
        return { available: true, models };
    } catch {
        return { available: false, models: [] };
    }
}

// Get queue status for monitoring
export function getQueueStatus() {
    return {
        activeRequests,
        queuedRequests: requestQueue.length,
        maxConcurrent: MAX_CONCURRENT_REQUESTS,
    };
}
