import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { getUserConversations } from '../services/message.js';
import { chatWithOllama, getBotChatHistory, clearBotChatHistory, checkOllamaStatus, getQueueStatus } from '../services/ollama.js';
import { createSampleProject, getProjectStats } from '../services/context.js';

const router = Router();

// ===== User Routes =====

// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            where: { isBot: false },
            select: {
                id: true,
                username: true,
                email: true,
                avatar: true,
                role: true,
                company: true,
                isOnline: true,
                lastSeen: true,
            },
            orderBy: { username: 'asc' },
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Create or get user (simple auth for demo)
router.post('/users/login', async (req, res) => {
    const { username, email, company } = req.body;

    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        let user = await prisma.user.findUnique({ where: { username } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    username,
                    email: email || null,
                    company: company || null,
                    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}`,
                },
            });

            // Create a sample project for new users to demo the AI context feature
            await createSampleProject(user.id);
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to login' });
    }
});

// Update user profile
router.patch('/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const { email, company, bio, role } = req.body;

    try {
        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(email !== undefined && { email }),
                ...(company !== undefined && { company }),
                ...(bio !== undefined && { bio }),
                ...(role !== undefined && { role }),
            },
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ===== Conversation Routes =====

// Get user's conversations
router.get('/conversations/:userId', async (req, res) => {
    try {
        const conversations = await getUserConversations(req.params.userId);
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Create a new group conversation
router.post('/conversations', async (req, res) => {
    const { name, participantIds } = req.body;

    if (!participantIds || participantIds.length < 2) {
        return res.status(400).json({ error: 'At least 2 participants required' });
    }

    try {
        const conversation = await prisma.conversation.create({
            data: {
                name,
                isGroup: true,
                participants: {
                    create: participantIds.map((userId: string) => ({ userId })),
                },
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { id: true, username: true, avatar: true },
                        },
                    },
                },
            },
        });
        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// ===== Project Routes =====

// Get user's projects
router.get('/projects/:userId', async (req, res) => {
    try {
        const projects = await prisma.project.findMany({
            where: { userId: req.params.userId },
            include: {
                tasks: {
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// Create a project
router.post('/projects', async (req, res) => {
    const { userId, name, description, priority, deadline, budget } = req.body;

    if (!userId || !name) {
        return res.status(400).json({ error: 'userId and name are required' });
    }

    try {
        const project = await prisma.project.create({
            data: {
                userId,
                name,
                description,
                priority: priority || 'medium',
                deadline: deadline ? new Date(deadline) : null,
                budget: budget || null,
            },
        });
        res.json(project);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Update a project
router.patch('/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const { name, description, status, priority, progress, deadline, budget } = req.body;

    try {
        const project = await prisma.project.update({
            where: { id: projectId },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(status !== undefined && { status }),
                ...(priority !== undefined && { priority }),
                ...(progress !== undefined && { progress }),
                ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
                ...(budget !== undefined && { budget }),
            },
        });
        res.json(project);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Get project stats
router.get('/projects/:userId/stats', async (req, res) => {
    try {
        const stats = await getProjectStats(req.params.userId);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get project stats' });
    }
});

// ===== Task Routes =====

// Create a task
router.post('/tasks', async (req, res) => {
    const { projectId, title, description, priority, dueDate, assigneeId } = req.body;

    if (!projectId || !title) {
        return res.status(400).json({ error: 'projectId and title are required' });
    }

    try {
        const task = await prisma.task.create({
            data: {
                projectId,
                title,
                description,
                priority: priority || 'medium',
                dueDate: dueDate ? new Date(dueDate) : null,
                assigneeId: assigneeId || null,
            },
        });
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Update a task
router.patch('/tasks/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const { title, description, status, priority, dueDate, assigneeId } = req.body;

    try {
        const task = await prisma.task.update({
            where: { id: taskId },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(status !== undefined && { status }),
                ...(priority !== undefined && { priority }),
                ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
                ...(assigneeId !== undefined && { assigneeId }),
            },
        });
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// ===== Bot/Ollama Routes =====

// Check Ollama status
router.get('/bot/status', async (req, res) => {
    try {
        const status = await checkOllamaStatus();
        const queue = getQueueStatus();
        res.json({ ...status, queue });
    } catch (error) {
        res.json({ available: false, models: [], queue: getQueueStatus() });
    }
});

// Chat with bot
router.post('/bot/chat', async (req, res) => {
    const { userId, message, model } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ error: 'userId and message are required' });
    }

    try {
        const response = await chatWithOllama(userId, message, model);
        res.json({ response, queue: getQueueStatus() });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get bot response' });
    }
});

// Get bot chat history
router.get('/bot/history/:userId', async (req, res) => {
    try {
        const history = await getBotChatHistory(req.params.userId, 50);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bot history' });
    }
});

// Clear bot chat history
router.delete('/bot/history/:userId', async (req, res) => {
    try {
        await clearBotChatHistory(req.params.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear history' });
    }
});

export default router;
