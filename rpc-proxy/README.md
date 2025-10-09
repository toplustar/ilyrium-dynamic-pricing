# RPC Proxy Service (Go)

This folder is reserved for the future Go-based RPC proxy microservice.

## Purpose

The RPC proxy will handle:
- Incoming RPC requests from clients
- Wallet authentication and rate limiting
- Request forwarding to Solana RPC nodes
- Usage tracking and metrics collection
- Load balancing across multiple RPC endpoints

## Architecture

```
Client → Go RPC Proxy → Solana RPC Nodes
           ↓
    Node.js Backend (auth, usage tracking)
```

## Planned Structure

```
rpc-proxy/
├── cmd/
│   └── proxy/
│       └── main.go
├── internal/
│   ├── handler/
│   │   └── rpc_handler.go
│   ├── auth/
│   │   └── wallet_verifier.go
│   ├── ratelimit/
│   │   └── limiter.go
│   └── metrics/
│       └── collector.go
├── pkg/
│   └── client/
│       └── solana_client.go
├── go.mod
├── go.sum
├── Dockerfile
└── README.md
```

## Integration Points

### 1. Authentication
- Verify wallet signatures
- Check allocation via Node.js backend API
- Enforce RPS limits per wallet

### 2. Usage Tracking
- POST usage metrics to Node.js backend
- Real-time Redis updates for rate limiting
- Periodic batch writes to PostgreSQL

### 3. Configuration
- RPC endpoint pool configuration
- Rate limiting rules
- Health check endpoints

## Environment Variables

```bash
# RPC Proxy Configuration
PROXY_PORT=8080
PROXY_HOST=0.0.0.0

# Backend Integration
BACKEND_URL=http://localhost:3000
BACKEND_API_KEY=your_api_key

# Solana RPC Endpoints
SOLANA_RPC_ENDPOINTS=https://api.mainnet-beta.solana.com,https://solana-api.projectserum.com

# Redis for Rate Limiting
REDIS_HOST=localhost
REDIS_PORT=6379

# Performance
MAX_CONCURRENT_REQUESTS=1000
REQUEST_TIMEOUT_MS=30000
```

## Development Roadmap

1. **Phase 1**: Basic HTTP proxy with request forwarding
2. **Phase 2**: Wallet signature verification
3. **Phase 3**: Rate limiting and quota enforcement
4. **Phase 4**: Load balancing and failover
5. **Phase 5**: WebSocket support for subscriptions
6. **Phase 6**: Advanced metrics and monitoring

## Communication with Backend

The proxy will communicate with the Node.js backend via:

1. **REST API** - For authentication and allocation checks
2. **Redis** - For real-time rate limit state
3. **Direct DB** (optional) - For read-only usage queries

## Performance Targets

- **Latency**: < 10ms overhead per request
- **Throughput**: 10,000+ requests per second
- **Availability**: 99.9% uptime
- **Concurrent Connections**: 10,000+

## Getting Started (Future)

```bash
# Install dependencies
go mod download

# Run locally
go run cmd/proxy/main.go

# Build
go build -o bin/rpc-proxy cmd/proxy/main.go

# Run tests
go test ./...

# Build Docker image
docker build -t ilyrium-rpc-proxy .
```

## Notes

This service will be implemented in Phase 2 of the project. The current Node.js backend handles all business logic and provides the necessary APIs for integration.

