# PostgreSQL Setup Guide

This guide will help you set up PostgreSQL for the RPC Backend application.

## Quick Start

### Option 1: Using Docker (Recommended for Development)

The easiest way to get PostgreSQL running locally:

```bash
# Run PostgreSQL in Docker
docker run --name rpc-postgres \
  -e POSTGRES_USER=rpcbackend \
  -e POSTGRES_PASSWORD=rpcbackend \
  -e POSTGRES_DB=rpcbackend \
  -p 5432:5432 \
  -d postgres:16-alpine

# Verify it's running
docker ps | grep rpc-postgres

# Connect to verify
docker exec -it rpc-postgres psql -U rpcbackend -d rpcbackend
```

To stop/start later:
```bash
docker stop rpc-postgres
docker start rpc-postgres
```

### Option 2: Native Installation

#### macOS (using Homebrew)

```bash
# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL service
brew services start postgresql@16

# Create database and user
psql postgres <<EOF
CREATE DATABASE rpcbackend;
CREATE USER rpcbackend WITH PASSWORD 'rpcbackend';
GRANT ALL PRIVILEGES ON DATABASE rpcbackend TO rpcbackend;
ALTER DATABASE rpcbackend OWNER TO rpcbackend;
\q
EOF

# Verify connection
psql -U rpcbackend -d rpcbackend -h localhost
```

#### Ubuntu/Debian

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE rpcbackend;
CREATE USER rpcbackend WITH PASSWORD 'rpcbackend';
GRANT ALL PRIVILEGES ON DATABASE rpcbackend TO rpcbackend;
ALTER DATABASE rpcbackend OWNER TO rpcbackend;
\q
EOF

# Verify connection
psql -U rpcbackend -d rpcbackend -h localhost
```

#### Windows

1. Download PostgreSQL installer from https://www.postgresql.org/download/windows/
2. Run the installer and follow the setup wizard
3. Use pgAdmin (included) or command line:

```powershell
# Using psql from command prompt
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

# Then run:
CREATE DATABASE rpcbackend;
CREATE USER rpcbackend WITH PASSWORD 'rpcbackend';
GRANT ALL PRIVILEGES ON DATABASE rpcbackend TO rpcbackend;
ALTER DATABASE rpcbackend OWNER TO rpcbackend;
\q
```

## Environment Configuration

### Method 1: Individual Parameters (Default)

Your `.env.local` file should have:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=rpcbackend
DB_PASSWORD=rpcbackend
DB_NAME=rpcbackend
```

### Method 2: Connection URL

Alternatively, you can use a single DATABASE_URL:

```env
DATABASE_URL=postgresql://rpcbackend:rpcbackend@localhost:5432/rpcbackend
```

**Note**: If both are provided, `DATABASE_URL` takes precedence.

## Running Migrations

Once PostgreSQL is set up, run the database migrations:

```bash
# Run all pending migrations
npm run db:migration:run

# Revert last migration (if needed)
npm run db:migration:revert

# Create a new migration
npm run db:migration:create -- migrations/YourMigrationName
```

## Verifying the Setup

### 1. Check PostgreSQL is Running

```bash
# Check if PostgreSQL is listening
nc -zv localhost 5432

# Or check the service
# macOS:
brew services list | grep postgresql

# Linux:
sudo systemctl status postgresql

# Docker:
docker ps | grep rpc-postgres
```

### 2. Test Database Connection

```bash
# Using psql
psql -U rpcbackend -d rpcbackend -h localhost -c "SELECT version();"

# Expected output: PostgreSQL version information
```

### 3. Start the Application

```bash
npm run start:dev
```

If PostgreSQL is configured correctly, you should see:
```
[LOG] TypeOrmModule dependencies initialized
```

If you see connection errors, check the troubleshooting section below.

## Database Management Tools

### Command Line (psql)

```bash
# Connect to database
psql -U rpcbackend -d rpcbackend -h localhost

# Common commands:
\dt              # List tables
\d table_name    # Describe table
\l               # List databases
\du              # List users
\q               # Quit
```

### GUI Tools

**Recommended GUI clients:**

1. **pgAdmin** (Free, cross-platform)
   - Download: https://www.pgadmin.org/download/
   - Most popular PostgreSQL GUI

2. **DBeaver** (Free, cross-platform)
   - Download: https://dbeaver.io/download/
   - Supports multiple databases

3. **TablePlus** (Paid, macOS/Windows)
   - Download: https://tableplus.com/
   - Beautiful UI, great UX

4. **Postico** (macOS only)
   - Download: https://eggerapps.at/postico/
   - Clean, simple interface

### Connection Details for GUI Tools

```
Host: localhost
Port: 5432
Database: rpcbackend
Username: rpcbackend
Password: rpcbackend
```

## Troubleshooting

### Connection Refused

**Symptom**: `error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions**:
1. Check if PostgreSQL is running:
   ```bash
   # macOS:
   brew services list | grep postgresql

   # Linux:
   sudo systemctl status postgresql

   # Docker:
   docker ps | grep postgres
   ```

2. Start PostgreSQL if not running:
   ```bash
   # macOS:
   brew services start postgresql@16

   # Linux:
   sudo systemctl start postgresql

   # Docker:
   docker start rpc-postgres
   ```

### Authentication Failed

**Symptom**: `error: password authentication failed for user "rpcbackend"`

**Solutions**:
1. Verify credentials in `.env.local` match database user
2. Reset password:
   ```sql
   psql postgres
   ALTER USER rpcbackend WITH PASSWORD 'rpcbackend';
   \q
   ```

### Database Does Not Exist

**Symptom**: `error: database "rpcbackend" does not exist`

**Solution**: Create the database:
```bash
psql postgres -c "CREATE DATABASE rpcbackend;"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE rpcbackend TO rpcbackend;"
```

### Role Does Not Exist

**Symptom**: `error: role "rpcbackend" does not exist`

**Solution**: Create the user:
```bash
psql postgres -c "CREATE USER rpcbackend WITH PASSWORD 'rpcbackend';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE rpcbackend TO rpcbackend;"
```

### Port Already in Use

**Symptom**: PostgreSQL won't start, port 5432 is already in use

**Solution**: Check what's using the port:
```bash
# macOS/Linux:
lsof -i :5432

# Windows:
netstat -ano | findstr :5432
```

Kill the process or change the port in `.env.local`:
```env
DB_PORT=5433
```

### SSL Connection Issues

**Symptom**: SSL-related errors

**Solution**: Add to your connection string or `.env.local`:
```env
# For local development, disable SSL
DATABASE_URL=postgresql://rpcbackend:rpcbackend@localhost:5432/rpcbackend?sslmode=disable
```

## Production Considerations

### For Production Deployment:

1. **Use Strong Passwords**:
   ```env
   DB_PASSWORD=<generate-strong-password>
   ```

2. **Enable SSL**:
   ```env
   # The app automatically enables SSL in production (NODE_ENV=prd)
   NODE_ENV=prd
   ```

3. **Use Connection Pooling**:
   - TypeORM has built-in connection pooling
   - Default pool size is 10, adjust if needed

4. **Backup Strategy**:
   ```bash
   # Create backup
   pg_dump -U rpcbackend -h localhost rpcbackend > backup.sql

   # Restore backup
   psql -U rpcbackend -h localhost rpcbackend < backup.sql
   ```

5. **Managed Database Services** (Recommended):
   - AWS RDS for PostgreSQL
   - Azure Database for PostgreSQL
   - Google Cloud SQL for PostgreSQL
   - DigitalOcean Managed Databases
   - Supabase (includes PostgreSQL)

## Useful PostgreSQL Commands

```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size('rpcbackend'));

-- List all tables with row counts
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
       pg_stat_get_live_tuples(c.oid) AS rows
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Show active connections
SELECT * FROM pg_stat_activity WHERE datname = 'rpcbackend';

-- Kill idle connections (if needed)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'rpcbackend'
  AND state = 'idle'
  AND state_change < NOW() - INTERVAL '5 minutes';
```

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TypeORM PostgreSQL Documentation](https://typeorm.io/data-source-options#postgres--cockroachdb-data-source-options)
- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)

## Getting Help

If you encounter issues not covered here:

1. Check application logs: Look for detailed error messages
2. Check PostgreSQL logs:
   - macOS: `/usr/local/var/log/postgres.log`
   - Linux: `/var/log/postgresql/postgresql-*.log`
   - Docker: `docker logs rpc-postgres`
3. Verify environment variables are loaded: Add logging to `database.config.ts`
4. Test connection manually using `psql` before running the app

---

**Quick Reference Card**

```bash
# Start PostgreSQL (choose one):
brew services start postgresql@16        # macOS
sudo systemctl start postgresql          # Linux
docker start rpc-postgres                # Docker

# Run migrations:
npm run db:migration:run

# Start app:
npm run start:dev

# Connect to database:
psql -U rpcbackend -d rpcbackend -h localhost

# Check connection:
nc -zv localhost 5432
```
