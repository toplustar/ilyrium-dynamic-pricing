# 🚀 Ilyrium Dynamic Pricing System

[![NestJS](https://img.shields.io/badge/NestJS-10.4.4-red.svg)](https://nestjs.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.6.2-blue.svg)](https://www.typescriptlang.org/) [![Solana](https://img.shields.io/badge/Solana-Blockchain-purple.svg)](https://solana.com/) [![Discord](https://img.shields.io/badge/Discord-Bot-5865F2.svg)](https://discord.js.org/)

Ilyrium is a NestJS backend that implements dynamic pricing for Solana RPC services. Users purchase API access at real-time prices that adjust based on demand and blockchain activity.

## 🔑 Core Idea

**Dynamic Pricing for Solana RPC Services** - Prices adjust in real-time based on demand and blockchain activity.

### 💰 User Flow

```
User → Discord Bot → Purchase Button → Dynamic Price Calculation
  ↓
Payment to Solana Address → Blockchain Confirmation → API Key Generation
  ↓
Usage Tracking → Analytics Dashboard
```

**Step-by-step:**

1. **User clicks purchase** → System calculates current price using dynamic pricing
2. **Payment sent** → User pays the calculated amount to unique Solana address
3. **API key generated** → Upon payment confirmation, user receives API key
4. **Usage tracking** → System monitors usage and updates analytics

### 📊 Dynamic Pricing Formula

```
P = P_min + (P_max - P_min) × σ(k[αU + φS])
```

Where:

- **P** → current price per RPS
- **P_min/P_max** → price bounds (0.001 - 0.01 SOL)
- **U** → node utilization (0 = empty, 1 = full)
- **S** → Solana chain activity (0 = quiet, 1 = busy)
- **α, φ** → weights (0.6, 0.4)
- **k** → reaction speed (4)
- **σ(x)** → sigmoid smoothing function

## 🧱 Architecture

```
HTTP (REST) → Pricing • Purchase • Analytics
Discord Bot → Commands, charts, notifications
WebSockets → Live analytics stream
Solana → Payment addresses, confirmations
PostgreSQL → Entities (purchases, usage, system_events)
Redis → Cache and rate limiting
```

## 🧰 Tech Stack

- Backend: NestJS 10, TypeScript 5
- Data: PostgreSQL (TypeORM), Redis
- Real-time: Socket.IO/WebSockets
- Blockchain: @solana/web3.js, SPL Token
- Bot/Charts: discord.js, QuickChart

## 📦 Project Layout

```
src/modules/
├─ analytics/      # analytics.controller, websocket + historical logging
├─ pricing/        # pricing-engine, purchase, usage
├─ payment/        # Solana payment handling
├─ discord-bot/    # bot commands and messaging
├─ api-key/        # auth and middleware
└─ rpc/            # request proxying and rate limiting
```

## ⚙️ Configuration

Create `.env` and set required variables:

```bash
# Database (Required)
DB_HOST=Host_url
DB_PORT=5432
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name

# Redis (Required)
REDIS_HOST=Host_url
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DATABASE=0
REDIS_KEY_PREFIX=rpc:

# Solana (Required)
SOLANA_PAYMENT_WALLET=your_solana_wallet_public_key
ENCRYPTION_KEY=your_64_character_hex_encryption_key

# Discord Bot (Required)
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_discord_guild_id
DISCORD_PURCHASE_CHANNEL_ID=your_purchase_channel_id
DISCORD_ANALYTICS_CHANNEL_ID=your_analytics_channel_id

# RPC Configuration (Required)
RPC_BACKEND_URL=your_backend_url
RPC_ENDPOINT=https://elite.rpc.solanavibestation.com/
RPC_API_KEY=Your_api_key
RPC_RATE_LIMIT=


```

## ▶️ Run

```
npm install
npm run db:migration:run
npm run start:dev
```

Production:

```
npm run build && npm run start:prod
```

## 📚 REST API Overview

Global prefix: `/api`. Swagger: `/api-docs`.

- Pricing
  - `GET /api/prices` → current dynamic prices for all tiers
- Purchase
  - `POST /api/purchase` → buy a tier (see `BuyTierDto`)
- Usage
  - `GET /api/usuage` → usage/allocation by wallet (note path spelling)
- Analytics
  - `GET /api/analytics/current`
  - `GET /api/analytics/historical?hours=24`
  - `GET /api/analytics/node-usage`
  - `GET /api/analytics/price-trend`
  - `GET /api/analytics/revenue`
  - `GET /api/analytics/user-stats`
  - `GET /api/analytics/dashboard`
  - `GET /api/analytics/price-demand-chart?hours=24&width=800&height=400`
  - `GET /api/analytics/charts?hours=24`
  - `GET /api/analytics/export/:format?hours=24` (json|csv)

Example WebSocket usage:

```javascript
const socket = io('ws://localhost:3000/analytics');
socket.on('analytics_update', data => console.log(data));
```

## 🔐 Security

- API key middleware for RPC endpoints
- Tier-based rate limiting
- Encrypted Solana keys; unique payment addresses per attempt
- Input validation and global exception filter

## 🗃️ Data Model (key tables)

- `purchases` — subscription records
- `usage_metrics` — usage and allocation by wallet
- `payment_attempts` — on-chain payment attempts
- `system_events` — event stream for analytics
- `api_keys`, `discord_users`

## 🧪 Quality

```
npm run lint
npm run typecheck
npm run build:strict
```

## 📝 Notes

- Endpoints and paths above reflect the current controllers:
  - `PricingController` → `GET /api/prices`
  - `PurchaseController` → `POST /api/purchase`
  - `UsageController` → `GET /api/usuage` (intent likely `usage`)
  - `AnalyticsController` → `/api/analytics/*`
- Update `UsageController` path if you want `/api/usage` instead.

## 📄 License

MIT — see `LICENSE`.
