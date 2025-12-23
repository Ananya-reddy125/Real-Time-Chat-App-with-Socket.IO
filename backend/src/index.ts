import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { setupSocketHandlers } from './socket/handler.js';
import { prisma } from './lib/prisma.js';

const PORT = process.env.PORT || 3001;

// Create Express app
const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
}));
app.use(express.json());

// REST API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server
const httpServer = createServer(app);

// Create Socket.io server
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Setup socket handlers
setupSocketHandlers(io);

// Start server
async function start() {
    try {
        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected');

        httpServer.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════╗
║   🚀 SEO Chat Server Running              ║
╠════════════════════════════════════════════╣
║   HTTP:   http://localhost:${PORT}           ║
║   WS:     ws://localhost:${PORT}             ║
╚════════════════════════════════════════════╝
      `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

start();
