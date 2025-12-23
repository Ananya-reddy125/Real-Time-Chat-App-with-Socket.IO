import { prisma } from '../lib/prisma.js';

// Get user context for AI - their profile, projects, tasks
export async function getUserContext(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            projects: {
                include: {
                    tasks: true,
                },
                orderBy: { updatedAt: 'desc' },
                take: 5,
            },
        },
    });

    if (!user) return '';

    const context: string[] = [];

    // User info
    context.push(`\n=== USER PROFILE ===`);
    context.push(`Name: ${user.username}`);
    if (user.email) context.push(`Email: ${user.email}`);
    if (user.role) context.push(`Role: ${user.role}`);
    if (user.company) context.push(`Company: ${user.company}`);
    if (user.bio) context.push(`Bio: ${user.bio}`);

    // Projects summary
    if (user.projects.length > 0) {
        context.push(`\n=== USER'S PROJECTS (${user.projects.length}) ===`);

        for (const project of user.projects) {
            context.push(`\nProject: ${project.name}`);
            context.push(`  Status: ${project.status}`);
            context.push(`  Priority: ${project.priority}`);
            context.push(`  Progress: ${project.progress}%`);
            if (project.description) context.push(`  Description: ${project.description}`);
            if (project.deadline) context.push(`  Deadline: ${project.deadline.toLocaleDateString()}`);
            if (project.budget) context.push(`  Budget: $${project.budget}`);

            // Tasks in this project
            if (project.tasks.length > 0) {
                context.push(`  Tasks (${project.tasks.length}):`);
                for (const task of project.tasks) {
                    context.push(`    - ${task.title} [${task.status}] (${task.priority} priority)`);
                }
            }
        }
    } else {
        context.push(`\n=== No projects yet ===`);
    }

    return context.join('\n');
}

// Analyze user query to determine if it's asking about their data
export function analyzeQueryIntent(query: string): {
    isDataQuery: boolean;
    queryType: 'project' | 'task' | 'profile' | 'general';
    keywords: string[];
} {
    const lowerQuery = query.toLowerCase();

    const projectKeywords = ['project', 'projects', 'status', 'deadline', 'progress', 'budget'];
    const taskKeywords = ['task', 'tasks', 'todo', 'to-do', 'assigned', 'pending', 'completed'];
    const profileKeywords = ['my profile', 'my info', 'my account', 'my details', 'who am i'];

    const hasProjectKeyword = projectKeywords.some(k => lowerQuery.includes(k));
    const hasTaskKeyword = taskKeywords.some(k => lowerQuery.includes(k));
    const hasProfileKeyword = profileKeywords.some(k => lowerQuery.includes(k));

    const isDataQuery = hasProjectKeyword || hasTaskKeyword || hasProfileKeyword ||
        lowerQuery.includes('my ') || lowerQuery.includes('what is my');

    let queryType: 'project' | 'task' | 'profile' | 'general' = 'general';
    if (hasProjectKeyword) queryType = 'project';
    else if (hasTaskKeyword) queryType = 'task';
    else if (hasProfileKeyword) queryType = 'profile';

    return {
        isDataQuery,
        queryType,
        keywords: [...projectKeywords, ...taskKeywords, ...profileKeywords].filter(k => lowerQuery.includes(k)),
    };
}

// Create a sample project for demo purposes
export async function createSampleProject(userId: string) {
    const existingProject = await prisma.project.findFirst({
        where: { userId },
    });

    if (existingProject) return existingProject;

    const project = await prisma.project.create({
        data: {
            name: 'Website Redesign',
            description: 'Complete redesign of company website with modern UI',
            status: 'active',
            priority: 'high',
            progress: 65,
            budget: 5000,
            deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            userId,
            tasks: {
                create: [
                    {
                        title: 'Design mockups',
                        description: 'Create UI/UX mockups in Figma',
                        status: 'completed',
                        priority: 'high',
                    },
                    {
                        title: 'Frontend development',
                        description: 'Build React components',
                        status: 'in_progress',
                        priority: 'high',
                        assigneeId: userId,
                    },
                    {
                        title: 'Backend API',
                        description: 'Set up REST API endpoints',
                        status: 'pending',
                        priority: 'medium',
                    },
                    {
                        title: 'Testing',
                        description: 'Write unit and integration tests',
                        status: 'pending',
                        priority: 'low',
                    },
                ],
            },
        },
        include: {
            tasks: true,
        },
    });

    return project;
}

// Get project statistics for a user
export async function getProjectStats(userId: string) {
    const projects = await prisma.project.findMany({
        where: { userId },
        include: { tasks: true },
    });

    const stats = {
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status === 'active').length,
        completedProjects: projects.filter(p => p.status === 'completed').length,
        totalTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0,
        averageProgress: 0,
    };

    for (const project of projects) {
        stats.totalTasks += project.tasks.length;
        stats.pendingTasks += project.tasks.filter(t => t.status === 'pending').length;
        stats.inProgressTasks += project.tasks.filter(t => t.status === 'in_progress').length;
        stats.completedTasks += project.tasks.filter(t => t.status === 'completed').length;
    }

    if (projects.length > 0) {
        stats.averageProgress = Math.round(
            projects.reduce((sum, p) => sum + p.progress, 0) / projects.length
        );
    }

    return stats;
}
