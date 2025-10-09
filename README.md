# Ilyrium Dynamic Pricing System

A demand-based pricing system for Solana RPC node rentals with real-time utilization tracking and tiered subscription management.

## Architecture

### Current (Phase 1)
- **Node.js Backend** (TypeScript + Express) - Business logic, pricing API, purchase management
- **PostgreSQL** - Persistent data storage (purchases, usage, metrics)
- **Redis** - Caching and real-time utilization tracking

### Future (Phase 2)
- **Go RPC Proxy** - High-performance request forwarding and rate limiting

## Features

- ✅ Dynamic pricing based on demand: `P(U) = Pmin + (Pmax - Pmin) * U`
- ✅ Four subscription tiers (Starter, Developer, Professional, Enterprise)
- ✅ Real-time capacity tracking and utilization metrics
- ✅ Purchase management with expiration tracking
- ✅ Usage analytics and reporting
- ✅ RESTful API with rate limiting
- ✅ Docker containerization for easy deployment

## Tech Stack

- **Backend**: Node.js 20, TypeScript 5.3, Express 4
- **Database**: PostgreSQL 16 with Prisma ORM
- **Cache**: Redis 7
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate limiting
- **Containerization**: Docker & Docker Compose

## Project Structure

```
dynamic-pricing-system/
├── src/
│   ├── config/           # Configuration management
│   ├── services/         # Business logic (pricing, database, redis)
│   ├── routes/           # API endpoints
│   ├── middleware/       # Express middleware
│   └── index.ts          # Application entry point
├── prisma/
│   └── schema.prisma     # Database schema
├── rpc-proxy/            # Future Go microservice
├── docker-compose.yml    # Multi-container orchestration
├── Dockerfile            # Backend container definition
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for containerized setup)
- OR PostgreSQL 16+ and Redis 7+ (for local setup)

### Quick Start (Docker)

1. **Clone and setup**
   ```bash
   cd dynamic-pricing-system
   cp env.example .env
   # Edit .env with your configuration
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```

3. **Check health**
   ```bash
   curl http://localhost:3000/health
   ```

### Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp env.example .env
   # Update DATABASE_URL, REDIS_HOST, etc.
   ```

3. **Setup database**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## API Endpoints

### GET /api/getPrices
Get current dynamic prices for all tiers.

**Response:**
```json
{
  "success": true,
  "data": {
    "tiers": [
      {
        "name": "Starter",
        "rps": 10,
        "price": 0.03,
        "description": "Perfect for testing and small applications"
      }
    ],
    "timestamp": "2025-10-09T12:00:00.000Z"
  }
}
```

### POST /api/buyTier
Purchase a subscription tier.

**Request:**
```json
{
  "walletAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJ4qjAF",
  "tier": "Developer",
  "duration": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "purchaseId": "uuid-here",
    "tier": "Developer",
    "rpsAllocated": 50,
    "price": 1.5,
    "expiresAt": "2025-11-08T12:00:00.000Z"
  }
}
```

### GET /api/getUsage
Get usage statistics for a wallet.

**Query Parameters:**
- `walletAddress` (required): Solana wallet address

**Response:**
```json
{
  "success": true,
  "data": {
    "walletAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJ4qjAF",
    "allocation": {
      "totalRps": 50,
      "activePurchases": 1,
      "purchases": [...]
    },
    "usage": {
      "totalRequests": 12345,
      "last30Days": 45,
      "recentActivity": [...]
    }
  }
}
```

## Pricing Model

The system uses a dynamic pricing formula based on real-time demand:

```
P(U) = Pmin + (Pmax - Pmin) × U

where:
  U = used_rps / total_rps (utilization ratio)
  Pmin = minimum price per RPS per day
  Pmax = maximum price per RPS per day
```

**Example:**
- Total capacity: 10,000 RPS
- Used capacity: 5,000 RPS
- Utilization (U): 0.5 (50%)
- Pmin: $0.001, Pmax: $0.01
- Current price: $0.001 + ($0.01 - $0.001) × 0.5 = $0.0055 per RPS per day

## Configuration

Key environment variables:

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ilyrium_pricing

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Pricing
PRICE_MIN=0.001
PRICE_MAX=0.01
TOTAL_RPS=10000

# Security
ADMIN_KEY=your_admin_key_here
```

## Database Schema

### Tables

- **purchases** - Tier subscriptions and allocations
- **usage_metrics** - Request tracking per wallet
- **system_metrics** - Overall system utilization over time

See `prisma/schema.prisma` for complete schema.

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production build
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio GUI

### Code Structure

The codebase follows a modular architecture:

- **Config Layer** - Environment and configuration management
- **Service Layer** - Business logic (pricing engine, database, cache)
- **Route Layer** - HTTP endpoint handlers
- **Middleware Layer** - Request processing (auth, rate limiting, errors)

## Future Roadmap

- [ ] **Phase 2**: Implement Go RPC proxy microservice
- [ ] **Phase 3**: Add wallet signature verification
- [ ] **Phase 4**: Implement payment processing (Solana Pay)
- [ ] **Phase 5**: Advanced analytics dashboard
- [ ] **Phase 6**: WebSocket support for real-time pricing updates
- [ ] **Phase 7**: Multi-region deployment

## Docker Deployment

The project includes full Docker support:

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

## Contributing

1. Follow TypeScript best practices
2. Maintain modular structure
3. Add proper error handling
4. Update documentation for API changes
5. Test changes before committing

## License

MIT

