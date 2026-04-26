# GeoFlood Backend - Docker Setup

## Quick Start

### 1. Clone and Setup

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your secrets
```

### 2. Build Images

```bash
# Build all services
docker-compose build

# Or build specific service
docker-compose build backend
docker-compose build ai-service
```

### 3. Start Services

```bash
# Start all services in background
docker-compose up -d

# Or with logs
docker-compose up

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### 4. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f ai-service
```

## Services Overview

| Service | Port | Purpose |
|---------|------|---------|
| **Nginx** | 80, 443 | Reverse proxy, load balancer, SSL termination |
| **NestJS Backend** | 3000 | REST API + WebSocket |
| **PostgreSQL** | 5432 | Primary database with PostGIS |
| **Redis** | 6379 | Caching, job queue (BullMQ) |
| **AI Service** | 8001 | Python FastAPI for ML/predictions |

## Useful Commands

```bash
# Run database migrations
docker-compose exec backend npm run migration:run

# Access PostgreSQL CLI
docker-compose exec postgres psql -U geoflood -d geoflood_db

# Check service health
docker-compose ps

# View service logs with timestamps
docker-compose logs --timestamps -f backend

# Rebuild after code changes
docker-compose build --no-cache backend
docker-compose up -d backend

# Interactive shell in container
docker-compose exec backend sh
docker-compose exec ai-service bash
```

## Development Workflow

### Backend Development
- The `src` directory is mounted as a volume
- For hot-reload, use `npm run start:dev`
- Changes auto-reflect without container restart

### Database Changes
- Modify migrations in `src/migrations`
- Run: `npm run typeorm migration:run`
- Persist changes in `Dockerfile` and `init-db.sql`

### Environment Variables
- Copy `.env.example` to `.env`
- Update secrets for production
- **Never commit `.env` to git**

## SSL/TLS Setup

For HTTPS support:

1. Place SSL certificate in `nginx/ssl/cert.pem`
2. Place private key in `nginx/ssl/key.pem`
3. Restart nginx: `docker-compose restart nginx`

Or use Let's Encrypt with certbot:

```bash
docker run -it --rm -p 80:80 -v /path/to/certs:/etc/letsencrypt \
  certbot/certbot certonly --standalone -d yourdomain.com
```

## Performance Tuning

### PostgreSQL
- Adjust `POSTGRES_INITDB_ARGS` for connection limits
- Monitor with: `docker-compose exec postgres pg_stat_statements`

### Redis
- Monitor with: `docker-compose exec redis redis-cli INFO`
- Configure persistence in `redis.conf`

### Nginx
- Adjust `worker_connections` in `nginx/nginx.conf`
- Enable caching for static assets

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port
lsof -ti:3000 | xargs kill -9

# Or use different port
docker-compose up -e PORT=3001
```

### Database Connection Error
```bash
# Check PostgreSQL health
docker-compose ps postgres

# View logs
docker-compose logs postgres
```

### Out of Memory
```bash
# Increase Docker Desktop memory limit (Settings > Resources)
# Or limit service memory in docker-compose.yml:
# services:
#   backend:
#     mem_limit: 512m
```

## Production Deployment

See `DEPLOYMENT.md` for:
- Multi-stage builds
- Secret management
- Scaling strategies
- Monitoring setup
- CI/CD integration
