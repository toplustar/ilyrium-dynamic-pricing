# Ilyrium Dynamic Pricing System - Complete Setup Guide

This comprehensive guide will walk you through setting up the Ilyrium Dynamic Pricing System from scratch.

## Table of Contents

- [Prerequisites](#prerequisites)
- [System Requirements](#system-requirements)
- [Step-by-Step Setup](#step-by-step-setup)
  - [1. Install Node.js](#1-install-nodejs)
  - [2. Install PostgreSQL](#2-install-postgresql)
  - [3. Install Redis](#3-install-redis)
  - [4. Clone and Install Project](#4-clone-and-install-project)
  - [5. Configure Environment](#5-configure-environment)
  - [6. Database Setup](#6-database-setup)
  - [7. Run the Application](#7-run-the-application)
- [Verification](#verification)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

## Prerequisites

Before starting, ensure you have:

- Terminal/Command Line access
- Administrator/sudo privileges (for package installation)
- Basic knowledge of command line operations
- Text editor (VS Code, Sublime, etc.)

## System Requirements

### Minimum Requirements

- **OS**: macOS 10.15+, Ubuntu 20.04+, Windows 10+
- **CPU**: 2 cores
- **RAM**: 4 GB
- **Storage**: 2 GB free space

### Recommended Requirements

- **OS**: macOS 13+, Ubuntu 22.04+, Windows 11
- **CPU**: 4+ cores
- **RAM**: 8+ GB
- **Storage**: 5+ GB free space

## Step-by-Step Setup

### 1. Install Node.js

The project requires Node.js version 24.6.0 or higher.

#### Option A: Using Node Version Manager (nvm) - Recommended

**macOS/Linux:**

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or run:
source ~/.bashrc  # or ~/.zshrc for zsh

# Install Node.js
nvm install 24
nvm use 24
nvm alias default 24

# Verify installation
node --version  # Should show v24.x.x
npm --version   # Should show 10.x.x+
```

**Windows:**

Download and install nvm-windows from: https://github.com/coreybutler/nvm-windows/releases

```powershell
# Install Node.js
nvm install 24
nvm use 24

# Verify installation
node --version
npm --version
```

#### Option B: Direct Installation

Download the installer from https://nodejs.org/

- **macOS**: Download the .pkg installer
- **Windows**: Download the .msi installer
- **Linux**: Use your package manager or download from nodejs.org

### 2. Install PostgreSQL

See [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md) for detailed PostgreSQL installation instructions.

#### Quick Setup (Docker - Recommended for Development)

```bash
# Pull and run PostgreSQL in Docker
docker run --name ilyrium-postgres \
  -e POSTGRES_USER=ilyrium \
  -e POSTGRES_PASSWORD=ilyrium123 \
  -e POSTGRES_DB=ilyrium_pricing \
  -p 5432:5432 \
  -d postgres:16-alpine

# Verify it's running
docker ps | grep ilyrium-postgres
```

#### Native Installation (macOS)

```bash
# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL
brew services start postgresql@16

# Create database and user
psql postgres <<EOF
CREATE DATABASE ilyrium_pricing;
CREATE USER ilyrium WITH PASSWORD 'ilyrium123';
GRANT ALL PRIVILEGES ON DATABASE ilyrium_pricing TO ilyrium;
ALTER DATABASE ilyrium_pricing OWNER TO ilyrium;
\q
EOF
```

#### Native Installation (Ubuntu/Debian)

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE ilyrium_pricing;
CREATE USER ilyrium WITH PASSWORD 'ilyrium123';
GRANT ALL PRIVILEGES ON DATABASE ilyrium_pricing TO ilyrium;
ALTER DATABASE ilyrium_pricing OWNER TO ilyrium;
\q
EOF
```

### 3. Install Redis

Redis is required for caching and rate limiting.

#### Option A: Using Docker (Recommended for Development)

```bash
# Pull and run Redis
docker run --name ilyrium-redis \
  -p 6379:6379 \
  -d redis:7-alpine

# Verify it's running
docker ps | grep ilyrium-redis

# Test connection
docker exec -it ilyrium-redis redis-cli ping
# Should return: PONG
```

#### Option B: Native Installation

**macOS:**

```bash
# Install Redis
brew install redis

# Start Redis
brew services start redis

# Verify
redis-cli ping  # Should return: PONG
```

**Ubuntu/Debian:**

```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping  # Should return: PONG
```

**Windows:**

Download Redis for Windows from: https://github.com/microsoftarchive/redis/releases

Or use WSL2 with Ubuntu and follow Linux instructions.

### 4. Clone and Install Project

```bash
# Clone the repository (or download and extract)
git clone <repository-url> ilyrium-dynamic-pricing
cd ilyrium-dynamic-pricing

# Install dependencies
npm install

# This will install all required packages
# May take 2-5 minutes depending on your internet connection
```

### 5. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Open .env in your text editor
# Update the following values:
```

**Edit `.env` file:**

```env
# Application Configuration
NODE_ENV=local
PORT=3000
HOST=0.0.0.0

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=ilyrium
DB_PASSWORD=ilyrium123
DB_NAME=ilyrium_pricing

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DATABASE=0
CACHE_TTL=3600
REDIS_KEY_PREFIX=il:

# Pricing Engine Configuration
PRICE_MIN=0.001
PRICE_MAX=0.01
TOTAL_RPS=10000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# RPC Backend URL (optional - for proxy mode)
RPC_BACKEND_URL=http://localhost:4000

# Azure Application Insights (optional)
APPLICATIONINSIGHTS_CONNECTION_STRING=
```

**Important Notes:**

- If using Docker for PostgreSQL/Redis, use `localhost` for hosts
- Update `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` to match your setup
- Leave `REDIS_PASSWORD` empty if Redis has no password (default)
- `TOTAL_RPS` defines your system's total capacity
- `PRICE_MIN` and `PRICE_MAX` set the pricing range

### 6. Database Setup

```bash
# Run database migrations
npm run db:migration:run

# You should see output like:
# query: SELECT * FROM "information_schema"."tables"...
# Migration InitialSchema has been executed successfully.
```

**If migrations fail:**

1. Verify PostgreSQL is running:
   ```bash
   # Docker:
   docker ps | grep postgres

   # Native (macOS):
   brew services list | grep postgresql

   # Native (Linux):
   sudo systemctl status postgresql
   ```

2. Test database connection:
   ```bash
   psql -U ilyrium -d ilyrium_pricing -h localhost
   # Enter password when prompted
   ```

3. Check environment variables are correct in `.env`

### 7. Run the Application

```bash
# Start the development server
npm run start:dev

# You should see output like:
# [Nest] 12345  - 01/11/2025, 10:30:15 AM     LOG [NestFactory] Starting Nest application...
# [Nest] 12345  - 01/11/2025, 10:30:15 AM     LOG [InstanceLoader] AppModule dependencies initialized
# [Nest] 12345  - 01/11/2025, 10:30:16 AM     LOG [RoutesResolver] PricingController {/api/pricing}
# [Nest] 12345  - 01/11/2025, 10:30:16 AM     LOG [NestApplication] Nest application successfully started
```

**Application is now running on http://localhost:3000**

## Verification

### 1. Check Health Endpoint

```bash
curl http://localhost:3000/health
```

**Expected Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-01-11T..."
}
```

### 2. Check API Documentation

Open your browser and navigate to:

**http://localhost:3000/api-docs**

You should see the Swagger UI with all available endpoints.

### 3. Test Pricing Endpoint

```bash
curl http://localhost:3000/api/pricing/tiers
```

**Expected Response:**

```json
{
  "utilization": {
    "usedRps": 0,
    "totalRps": 10000,
    "utilizationPercentage": 0
  },
  "tiers": [
    {
      "name": "Starter",
      "rps": 10,
      "price": 0.001,
      "description": "Perfect for development and testing"
    },
    ...
  ]
}
```

### 4. Verify Database Connection

```bash
# Connect to PostgreSQL
psql -U ilyrium -d ilyrium_pricing -h localhost

# Check tables
\dt

# You should see:
# purchases
# usage_metrics
# system_metrics
# migrations

# Exit
\q
```

### 5. Verify Redis Connection

```bash
# Connect to Redis
redis-cli

# Test basic commands
PING  # Should return: PONG
KEYS il:*  # Should return empty or cached keys

# Exit
exit
```

## Development Workflow

### Daily Development

```bash
# Start development server (auto-restarts on file changes)
npm run start:dev

# In another terminal, watch for TypeScript errors
npm run build -- --watch
```

### Code Quality

```bash
# Format code
npm run format

# Lint code and auto-fix issues
npm run lint

# Run both before committing
npm run format && npm run lint
```

### Database Management

```bash
# Create a new migration
npm run db:migration:create -- migrations/AddNewFeature

# Run pending migrations
npm run db:migration:run

# Revert last migration
npm run db:migration:revert

# View migration status
psql -U ilyrium -d ilyrium_pricing -h localhost -c "SELECT * FROM migrations;"
```

### Redis Management

```bash
# Clear all cache
npm run cache:clear

# Or manually with redis-cli:
redis-cli FLUSHDB
```

## Troubleshooting

### Port 3000 Already in Use

**Problem:** Error: `listen EADDRINUSE: address already in use :::3000`

**Solution:**

```bash
# The start:dev script automatically kills port 3000
npm run start:dev

# Or manually:
lsof -ti:3000 | xargs kill -9

# Or change port in .env:
PORT=3001
```

### Database Connection Failed

**Problem:** `error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions:**

1. Check PostgreSQL is running:
   ```bash
   # Docker:
   docker start ilyrium-postgres

   # Native (macOS):
   brew services start postgresql@16

   # Native (Linux):
   sudo systemctl start postgresql
   ```

2. Verify credentials in `.env` match your setup

3. Test connection manually:
   ```bash
   psql -U ilyrium -d ilyrium_pricing -h localhost
   ```

### Redis Connection Failed

**Problem:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solutions:**

1. Check Redis is running:
   ```bash
   # Docker:
   docker start ilyrium-redis

   # Native (macOS):
   brew services start redis

   # Native (Linux):
   sudo systemctl start redis-server
   ```

2. Test connection:
   ```bash
   redis-cli ping  # Should return: PONG
   ```

### Migration Errors

**Problem:** `QueryFailedError: relation "purchases" already exists`

**Solution:**

```bash
# Check which migrations have run
psql -U ilyrium -d ilyrium_pricing -h localhost -c "SELECT * FROM migrations;"

# If tables exist but migrations table is empty, you may need to:
# 1. Drop the database (CAUTION: destroys all data)
npm run db:drop

# 2. Re-run migrations
npm run db:migration:run
```

### TypeScript Build Errors

**Problem:** Build fails with TypeScript errors

**Solutions:**

1. Clear build cache:
   ```bash
   rm -rf dist/
   npm run build
   ```

2. Ensure all dependencies are installed:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Check Node.js version:
   ```bash
   node --version  # Should be >= 24.6.0
   ```

### Module Not Found Errors

**Problem:** `Error: Cannot find module '~/...'`

**Solution:**

The `~` alias is configured in `tsconfig.json`. If you see this error:

1. Restart your development server
2. Restart your IDE/editor
3. Verify `tsconfig.json` has:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "~/*": ["src/*"]
       }
     }
   }
   ```

## Advanced Configuration

### Custom Port

```env
# .env
PORT=8080
```

### Custom Database

```env
# Using connection URL instead of individual parameters
DATABASE_URL=postgresql://user:password@host:port/database
```

### Production Mode

```bash
# Build the application
npm run build

# Set environment to production
NODE_ENV=prd

# Start production server
npm run start:prod
```

### Enable SSL for PostgreSQL

```env
NODE_ENV=prd  # Automatically enables SSL in production
```

### Configure Application Insights

```env
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;IngestionEndpoint=https://...
```

### Adjust Rate Limiting

```env
# 15 minutes window, 100 requests
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Modify Pricing Parameters

```env
# Minimum and maximum price per RPS per day
PRICE_MIN=0.001
PRICE_MAX=0.01

# Total system capacity
TOTAL_RPS=10000
```

## Docker Compose Setup (Alternative)

For a complete Docker setup, create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ilyrium
      POSTGRES_PASSWORD: ilyrium123
      POSTGRES_DB: ilyrium_pricing
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

**Usage:**

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f
```

## Next Steps

Now that your setup is complete:

1. **Explore the API**
   - Open http://localhost:3000/api-docs
   - Try the endpoints using Swagger UI

2. **Review the Code**
   - Start with `src/modules/pricing/`
   - Understand the pricing engine logic

3. **Read Documentation**
   - [README.md](README.md) - Project overview
   - [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md) - Database details

4. **Customize**
   - Adjust pricing tiers
   - Modify rate limits
   - Add custom features

## Getting Help

If you encounter issues not covered here:

1. Check application logs in the console
2. Check PostgreSQL logs: `docker logs ilyrium-postgres`
3. Check Redis logs: `docker logs ilyrium-redis`
4. Review the [README.md](README.md) troubleshooting section
5. Search for error messages in NestJS documentation

## Summary

You've successfully set up the Ilyrium Dynamic Pricing System! 🎉

**What you now have:**
- ✅ Node.js environment
- ✅ PostgreSQL database
- ✅ Redis cache
- ✅ Running application on http://localhost:3000
- ✅ API documentation at http://localhost:3000/api-docs

**Quick Commands Reference:**

```bash
# Development
npm run start:dev      # Start dev server
npm run format         # Format code
npm run lint           # Lint code

# Database
npm run db:migration:run       # Run migrations
npm run db:migration:revert    # Revert migration

# Cache
npm run cache:clear    # Clear Redis cache

# Services
docker start ilyrium-postgres  # Start PostgreSQL
docker start ilyrium-redis     # Start Redis
```

Happy coding! 🚀
