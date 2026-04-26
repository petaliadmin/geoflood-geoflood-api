# GeoFlood Backend - API Documentation

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run database migrations
npm run migration:run

# Start development server
npm run start:dev

# API Documentation
http://localhost:3000/api/docs
```

## Project Structure

```
src/
├── main.ts                    # Application entry point
├── app.module.ts              # Root module
├── common/                    # Shared utilities
│   ├── decorators/           # Custom decorators
│   ├── guards/               # Auth guards (JWT, Roles)
│   ├── dtos/                 # Data transfer objects
│   └── websocket/            # WebSocket gateways
├── modules/                   # Feature modules
│   ├── auth/                 # Authentication
│   ├── users/                # User management
│   ├── zones/                # Flood zones + Alerts
│   ├── reports/              # Flood reports + Terrain + Weather
│   ├── admin/                # Admin dashboard
│   ├── notifications/        # Push notifications
│   └── health/               # Health checks
└── database/                  # Database setup
    ├── migrations/           # TypeORM migrations
    └── seeders/              # Database seeders
```

## Key Features Implemented

✅ **Authentication**
- JWT tokens (access + refresh)
- OTP verification
- Password reset
- Google OAuth ready

✅ **User Management**
- Profile management
- Settings (locale, theme, notifications)
- Avatar upload

✅ **Flood Zones**
- PostGIS geospatial queries
- Polygon-based flood zones
- Risk level classification

✅ **Alerts**
- Real-time WebSocket alerts
- Alert categories and levels
- User read tracking

✅ **Reports**
- Citizen flood reports
- Photo uploads
- Status moderation (pending/verified/rejected)

✅ **Terrain Analysis**
- Risk scoring
- Drainage analysis
- Historical flood data

✅ **Weather**
- Weather snapshots
- Forecast integration
- Flood probability predictions

✅ **Admin Dashboard**
- Critical zones overview
- Statistics and analytics
- Data export (CSV/JSON)

✅ **Security**
- JWT authentication
- Role-based access control (RBAC)
- Input validation
- CORS enabled

## Environment Variables

See `.env` file for all configuration options:
- Database connection
- Redis cache
- JWT secrets
- Firebase configuration
- Weather API keys
- AWS S3 credentials

## API Endpoints

### Auth
- `POST /v1/auth/register` - Register new user
- `POST /v1/auth/login` - Login
- `POST /v1/auth/refresh` - Refresh token
- `POST /v1/auth/send-otp` - Send OTP
- `POST /v1/auth/verify-otp` - Verify OTP
- `POST /v1/auth/forgot-password` - Request password reset
- `POST /v1/auth/reset-password` - Reset password

### Users
- `GET /v1/users/me` - Get profile
- `PATCH /v1/users/me` - Update profile
- `PATCH /v1/users/me/settings` - Update settings
- `DELETE /v1/users/me` - Delete account

### Zones
- `GET /v1/zones` - List zones
- `GET /v1/zones/:id` - Get zone details
- `GET /v1/zones/nearby` - Get nearby zones
- `GET /v1/zones/risk-map` - Get risk map data

### Alerts
- `GET /v1/alerts` - List alerts
- `GET /v1/alerts/:id` - Get alert
- `POST /v1/alerts` - Create alert (admin)
- `PATCH /v1/alerts/:id/read` - Mark as read
- `POST /v1/alerts/mark-all-read` - Mark all as read

### Reports
- `GET /v1/reports` - List reports
- `POST /v1/reports` - Create report
- `GET /v1/reports/:id` - Get report
- `GET /v1/reports/nearby` - Get nearby reports
- `PATCH /v1/reports/:id/status` - Update status (admin)

### Terrain
- `POST /v1/terrain/check` - Analyze terrain
- `GET /v1/terrain/checks` - Get user checks
- `GET /v1/terrain/checks/:id` - Get check details

### Weather
- `GET /v1/weather` - Current weather
- `GET /v1/weather/forecast` - Weather forecast
- `GET /v1/weather/predictions/zone/:zoneId` - Predictions

### Admin
- `GET /v1/admin/dashboard` - Dashboard data
- `GET /v1/admin/statistics` - Statistics
- `POST /v1/admin/export` - Export data

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

## Deployment

```bash
# Build for production
npm run build

# Start production server
npm run start:prod
```

## Contributing

1. Follow NestJS conventions
2. Use TypeScript strict mode
3. Add tests for new features
4. Update API documentation

## License

MIT
