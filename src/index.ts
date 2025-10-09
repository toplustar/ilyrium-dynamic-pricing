import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './config/config';
import { initDatabase, closeDatabase } from './services/database';
import { initRedis, closeRedis } from './services/redis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';

// Routes
import pricingRoutes from './routes/pricing.routes';
import purchaseRoutes from './routes/purchase.routes';
import usageRoutes from './routes/usage.routes';

const app: Application = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Ilyrium Dynamic Pricing System',
  });
});

// API Routes
app.use('/api', pricingRoutes);
app.use('/api', purchaseRoutes);
app.use('/api', usageRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services and start server
const startServer = async () => {
  try {
    // Validate configuration
    validateConfig();
    console.log('Configuration validated');

    // Initialize database
    initDatabase();
    console.log('Database initialized');

    // Initialize Redis
    await initRedis();
    console.log('Redis initialized');

    // Start server
    app.listen(config.server.port, config.server.host, () => {
      console.log(`
🚀 Ilyrium Dynamic Pricing System
📡 Server running on http://${config.server.host}:${config.server.port}
🌍 Environment: ${config.server.nodeEnv}
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  
  try {
    await closeDatabase();
    await closeRedis();
    console.log('Services closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer();

