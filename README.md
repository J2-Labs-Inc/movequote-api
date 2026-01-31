# CleanlyQuote API

Backend API for CleanlyQuote - Professional Cleaning Estimates SaaS.

## Setup on Railway

1. Create new project in Railway
2. Add PostgreSQL database
3. Deploy this repo
4. Set environment variables:
   - `DATABASE_URL` - automatically set by Railway PostgreSQL
   - `JWT_SECRET` - generate random string
   - `STRIPE_SECRET_KEY` - from Stripe dashboard
   - `STRIPE_PRICE_ID` - your $29/month price ID
   - `STRIPE_WEBHOOK_SECRET` - from Stripe webhook settings
   - `FRONTEND_URL` - https://getcleanlyquote.com

5. Run migration: `npm run db:migrate`

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
