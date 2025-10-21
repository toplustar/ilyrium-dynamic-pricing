# Ilyrium Dynamic Pricing System

## Overview

A high-performance **Dynamic Pricing API** built with NestJS that implements a sophisticated pricing engine for RPC (Remote Procedure Call) services. The system uses real-time capacity utilization to dynamically adjust pricing tiers, offering a fair and transparent pricing model for blockchain RPC access.

## Key Features

### 🎯 Dynamic Pricing Engine

- Real-time price calculation based on system utilization
- Configurable price ranges (min/max) and total capacity
- Automatic price adjustment as demand changes
- Transparent pricing model for users

### 💰 Tiered Subscription System

- **Starter**: 10 RPS - Ideal for development and testing
- **Developer**: 50 RPS - Perfect for small applications
- **Professional**: 200 RPS - For production applications
- **Enterprise**: 1000 RPS - High-volume production workloads

### 📊 Usage Tracking & Metrics

- Real-time usage monitoring per wallet
- Historical usage data (30-day retention)
- Active purchase tracking
- Rate allocation and utilization analytics

### 🔒 Security & Performance

- Redis-based rate limiting
- JWT authentication support
- Request/response logging
- Application Insights monitoring
- Comprehensive error handling with unique error IDs

### 🏗️ Enterprise Architecture

- Built with NestJS framework
- TypeORM for database operations
- Redis caching layer
- Swagger/OpenAPI documentation
- TypeScript strict mode
- Custom ESLint rules for code quality

## Technology Stack

### Core

- **NestJS 10.4.4** - Progressive Node.js framework
- **TypeScript 5.6.2** - Type-safe JavaScript
- **Node.js >=24.6.0** - JavaScript runtime

### Database & Caching

- **PostgreSQL** - Relational database via TypeORM
- **Redis** - Caching and rate limiting
- **TypeORM 0.3.20** - ORM with migrations support

### Security & Validation

- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Passport JWT** - Authentication
- **Class-validator** - DTO validation
- **Rate Limiting** - Redis-based request throttling

### Monitoring & Logging

- **Application Insights** - Azure monitoring and telemetry
- **Custom Loggers** - Console and AppLogger services

### Development Tools

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Husky** - Git hooks
- **Lint-staged** - Pre-commit linting

## Project Structure

```
├── migrations/                # TypeORM database migrations
├── eslint-rules/              # Custom ESLint rules
├── src/
│   ├── main.ts               # Application bootstrap
│   ├── app.module.ts         # Root module
│   ├── app.controller.ts     # Health check controller
│   ├── app.service.ts        # App service
│   ├── common/
│   │   ├── common.module.ts
│   │   ├── constants/        # Time, port, validation constants
│   │   ├── decorators/       # Custom decorators (Roles, etc.)
│   │   ├── filters/          # GlobalExceptionFilter
│   │   ├── guards/           # JWT, Roles, RateLimit guards
│   │   ├── middleware/       # RequestLoggerMiddleware
│   │   ├── services/         # AppLogger, ConsoleLogger, AppCacheService
│   │   └── utils/            # HttpUtil, EnvironmentUtil
│   ├── config/               # Configuration files
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   └── monitoring.config.ts
│   └── modules/
│       └── pricing/          # Dynamic pricing module
│           ├── controllers/  # API controllers
│           │   ├── pricing.controller.ts
│           │   ├── purchase.controller.ts
│           │   └── usage.controller.ts
│           ├── services/     # Business logic
│           │   ├── pricing-engine.service.ts
│           │   ├── purchase.service.ts
│           │   └── usage.service.ts
│           ├── entities/     # TypeORM entities
│           │   ├── purchase.entity.ts
│           │   ├── usage-metrics.entity.ts
│           │   └── system-metrics.entity.ts
│           ├── dto/          # Data transfer objects
│           └── pricing.module.ts
├── .env.example              # Environment variables template
├── datasource.config.ts      # TypeORM CLI configuration
├── nest-cli.json             # NestJS CLI configuration
├── tsconfig.json             # TypeScript configuration
├── eslint.config.mjs         # ESLint configuration
├── .prettierrc               # Prettier configuration
├── package.json              # Dependencies and scripts
├── README.md                 # This file
├── SETUP.md                  # Detailed setup guide
└── POSTGRESQL_SETUP.md       # PostgreSQL setup guide
```

## Quick Start

For detailed setup instructions, see [SETUP.md](SETUP.md)

### Prerequisites

- Node.js >= 24.6.0
- npm >= 10.0.0
- PostgreSQL database
- Redis server

### Installation

```bash
# 1. Clone and install dependencies
npm install

# 2. Setup environment
cp .env.example .env

# 3. Configure database (see POSTGRESQL_SETUP.md)
# Update .env with your database credentials

# 4. Run migrations
npm run db:migration:run

# 5. Start the development server
npm run start:dev
```

The API will be available at `http://65.109.56.146:3000`

### API Documentation

Once running, access the Swagger documentation at:

- **Swagger UI**: http://65.109.56.146:3000/api-docs

### Quick Test

```bash
# Check health
curl http://65.109.56.146:3000/health

# Get pricing tiers
curl http://65.109.56.146:3000/api/pricing/tiers
```

### Available Scripts

```bash
# Development
npm run start:dev          # Start with hot reload (kills port 3000 first)
npm run start:debug        # Start with debugging
npm run build              # Compile TypeScript
npm run start:prod         # Run production build

# Code Quality
npm run lint               # Lint and auto-fix code
npm run format             # Format code with Prettier

# Database
npm run db:migration:create    # Create a new migration
npm run db:migration:run       # Run pending migrations
npm run db:migration:revert    # Revert last migration
npm run db:drop                # Drop database schema (dangerous!)

# Caching
npm run cache:clear        # Clear Redis cache
```

## API Endpoints

### Core Endpoints

#### Health Check

- **GET** `/health` - Service health status

#### Pricing Information

- **GET** `/api/pricing/tiers` - Get available pricing tiers with current prices
  - Returns dynamic pricing based on current system utilization

#### Purchase Management

- **POST** `/api/purchase/buy-tier` - Purchase a pricing tier
  ```json
  {
    "walletAddress": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFgXz",
    "tier": "Starter",
    "duration": 30
  }
  ```

#### Usage Tracking

- **GET** `/api/usage?walletAddress={address}` - Get usage metrics for a wallet
  - Returns allocation details, usage stats, and recent activity

### API Documentation

- **GET** `/api-docs` - Interactive Swagger UI documentation

## How It Works

### Dynamic Pricing Algorithm

The pricing engine uses a utilization-based algorithm:

```
Current Utilization = Used RPS / Total Available RPS
Price Multiplier = 1 + (Current Utilization × 4)
Final Price = Base Price × Price Multiplier
```

- **Low Utilization (0-25%)**: Prices near minimum
- **Medium Utilization (25-75%)**: Gradual price increase
- **High Utilization (75-100%)**: Prices approach maximum

### Purchase Flow

1. User requests to buy a tier
2. System calculates current dynamic price
3. Checks if capacity is available
4. Creates purchase record with expiration date
5. Updates system utilization metrics
6. Returns purchase confirmation

### Usage Tracking

- Every API request is logged with wallet address
- Usage metrics aggregated per wallet
- Historical data retained for 30 days
- Active purchases tracked with expiration dates

## Configuration

### Environment Variables

See [.env.example](.env.example) for all available options.

**Key configurations:**

- `PRICE_MIN` / `PRICE_MAX`: Price range for dynamic pricing
- `TOTAL_RPS`: Total RPS capacity of the system
- `RATE_LIMIT_WINDOW_MS`: Rate limiting window
- `CACHE_TTL`: Redis cache time-to-live (seconds)

### Pricing Tiers

Modify tiers in `src/modules/pricing/services/pricing-engine.service.ts`:

```typescript
getTiers(): Omit<TierInfo, 'price'>[] {
  return [
    { name: 'Starter', rps: 10, description: '...' },
    // Add more tiers
  ];
}
```

## Database Schema

### Main Tables

**purchases**

- Tracks tier purchases by wallet address
- Stores RPS allocation and expiration
- Automatically managed by TypeORM

**usage_metrics**

- Records API usage per wallet
- Tracks request counts and endpoints
- Partitioned by timestamp for performance

**system_metrics**

- Stores system-wide utilization metrics
- Used for dynamic pricing calculations
- Updated on each purchase

## Development

### Code Quality

The project enforces code quality through:

- **ESLint**: Automatic linting with custom rules
- **Prettier**: Consistent code formatting
- **TypeScript Strict Mode**: Type safety
- **Git Hooks**: Pre-commit linting (Husky + lint-staged)

### Custom ESLint Rules

Located in `eslint-rules/`:

- `consistent-file-naming.js` - Enforce kebab-case file naming
- `dto-validation-rules.js` - Ensure DTOs have validation decorators
- `no-db-queries-outside-services.js` - Prevent repository usage in controllers
- `no-empty-catch-blocks.js` - Disallow empty catch blocks
- `no-mixed-declarations.js` - Enforce consistent variable declarations

### Testing

```bash
# Run tests (when implemented)
npm run test
npm run test:watch
npm run test:cov
```

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=prd`
- [ ] Configure production database with SSL
- [ ] Set strong `REDIS_PASSWORD`
- [ ] Configure Application Insights
- [ ] Set up database backups
- [ ] Configure rate limiting appropriately
- [ ] Review and adjust `TOTAL_RPS` capacity
- [ ] Set appropriate `PRICE_MIN` and `PRICE_MAX`
- [ ] Enable HTTPS/TLS
- [ ] Set up monitoring and alerts

### Environment-Specific Configs

The app automatically adjusts based on `NODE_ENV`:

- `local`: Console logging, no SSL, relaxed CORS
- `dev`/`stg`: Mixed logging, optional SSL
- `prd`: Application Insights only, SSL required, strict CORS

## Troubleshooting

See [SETUP.md](SETUP.md#troubleshooting) for detailed troubleshooting guides.

**Common Issues:**

- Port 3000 in use: Run `npm run start:dev` (auto-kills port)
- Database connection: Check PostgreSQL is running and credentials are correct
- Redis connection: Verify Redis is running with `redis-cli ping`
- Migration errors: Ensure database exists and user has permissions

## Resources

- **Documentation**: [SETUP.md](SETUP.md) | [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md)
- **NestJS Docs**: https://docs.nestjs.com
- **TypeORM Docs**: https://typeorm.io
- **Redis Docs**: https://redis.io/docs

## License

MIT

## Support

For issues and questions:

1. Check [SETUP.md](SETUP.md) and troubleshooting guides
2. Review error logs and Application Insights
3. Verify all prerequisites are correctly installed

---

**Last Updated**: January 2025
**Framework**: NestJS 10.4.4
**Node.js**: >= 24.6.0
**Status**: ✅ Production Ready
