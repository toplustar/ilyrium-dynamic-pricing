# Quick Setup Guide

## Option 1: Docker (Recommended)

This is the fastest way to get everything running.

```bash
# 1. Create environment file
cp env.example .env

# 2. Edit .env and set ADMIN_KEY
# You can use any secure string for development

# 3. Start all services (PostgreSQL, Redis, Backend)
docker-compose up -d

# 4. Check if services are running
docker-compose ps

# 5. View logs
docker-compose logs -f backend

# 6. Test the API
curl http://localhost:3000/health
curl http://localhost:3000/api/getPrices
```

The backend will automatically run database migrations on startup.

## Option 2: Local Development

If you want to run the backend locally without Docker:

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL and Redis
# You can use Docker for just these services:
docker-compose up -d postgres redis

# 3. Create environment file
cp env.example .env

# 4. Update .env with your settings
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ilyrium_pricing?schema=public
# REDIS_HOST=localhost
# ADMIN_KEY=your_key_here

# 5. Run database migrations
npx prisma migrate dev --name init
npx prisma generate

# 6. Start development server
npm run dev
```

## Testing the API

### Get Current Prices
```bash
curl http://localhost:3000/api/getPrices
```

### Purchase a Tier
```bash
curl -X POST http://localhost:3000/api/buyTier \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJ4qjAF",
    "tier": "Developer",
    "duration": 30
  }'
```

### Get Usage Statistics
```bash
curl "http://localhost:3000/api/getUsage?walletAddress=7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJ4qjAF"
```

## Stopping Services

### Docker
```bash
docker-compose down
```

### Local Development
Just press `Ctrl+C` in the terminal running the dev server.

## Database Management

### View Database in Browser
```bash
npx prisma studio
```

### Create New Migration
```bash
npx prisma migrate dev --name your_migration_name
```

### Reset Database (WARNING: Deletes all data)
```bash
npx prisma migrate reset
```

## Common Issues

### Port Already in Use
If port 3000, 5432, or 6379 is already in use, either:
1. Stop the conflicting service
2. Change the port in `.env` and `docker-compose.yml`

### Database Connection Error
Make sure PostgreSQL is running and the `DATABASE_URL` in `.env` is correct.

### Redis Connection Error
Make sure Redis is running and `REDIS_HOST` in `.env` is correct.

## Next Steps

1. Review the API documentation in `README.md`
2. Explore the database schema in `prisma/schema.prisma`
3. Check the pricing engine logic in `src/services/pricingEngine.ts`
4. Plan the Go RPC proxy implementation (see `rpc-proxy/README.md`)

## Project Structure Overview

```
src/
├── config/          # Environment configuration
├── services/        # Core business logic
│   ├── database.ts      # Prisma client
│   ├── redis.ts         # Redis client
│   └── pricingEngine.ts # Dynamic pricing logic
├── routes/          # API endpoints
│   ├── pricing.routes.ts
│   ├── purchase.routes.ts
│   └── usage.routes.ts
├── middleware/      # Express middleware
└── index.ts         # Application entry point
```

