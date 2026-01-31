# CleanlyQuote API

Backend API for CleanlyQuote - Professional Cleaning Estimates SaaS.

## 🚀 Quick Start

This API is designed to run on Railway with PostgreSQL. Database migrations run automatically on startup.

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Railway provides this)
- Stripe account for payments
- Resend account for emails

### Setup on Railway

1. **Create Railway project** with PostgreSQL
2. **Deploy this repo** - connect your GitHub repo
3. **Set environment variables** (see below)
4. **API will auto-migrate** database on first start

### Required Environment Variables

```env
# Database (automatically set by Railway)
DATABASE_URL=postgresql://...

# Authentication
JWT_SECRET=<generate-a-long-random-string>

# Stripe (see STRIPE_SETUP.md for detailed instructions)
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email Service (optional but recommended)
RESEND_API_KEY=re_...
FROM_EMAIL=hello@getmovequote.com

# Frontend
FRONTEND_URL=https://getmovequote.com

# Port (automatically set by Railway)
PORT=3000
```

### Generate JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📖 Stripe Setup

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for complete Stripe integration instructions.

## API Endpoints

### Auth
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Quotes
- `GET /api/quotes` - List user's quotes
- `POST /api/quotes` - Create quote (enforces 3 free limit)
- `GET /api/quotes/:id` - Get quote
- `PUT /api/quotes/:id` - Update quote
- `DELETE /api/quotes/:id` - Delete quote

### Subscription
- `GET /api/subscription/status` - Check subscription status
- `POST /api/subscription/create-checkout` - Create Stripe checkout session
- `POST /api/subscription/billing-portal` - Access Stripe billing portal

### Webhook
- `POST /api/webhook` - Stripe webhook handler

## Free Tier

Users get 3 free quotes. After that, they must subscribe to Professional ($29/month) for unlimited quotes.
