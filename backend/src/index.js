require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const authRoutes = require('./routes/auth');
const quotesRoutes = require('./routes/quotes');
const subscriptionRoutes = require('./routes/subscription');
const webhookRoutes = require('./routes/webhook');
const analyticsRoutes = require('./routes/analytics');
const brandingRoutes = require('./routes/branding');
const adminRoutes = require('./routes/admin');
const clientsRoutes = require('./routes/clients');
const scheduleRoutes = require('./routes/schedule');
const teamRoutes = require('./routes/team');
const checklistsRoutes = require('./routes/checklists');

const app = express();
const PORT = process.env.PORT || 3000;

// Auto-migrate database on startup
async function migrate() {
  const migrations = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      business_name VARCHAR(255),
      phone VARCHAR(50),
      stripe_customer_id VARCHAR(255),
      subscription_status VARCHAR(50) DEFAULT 'free',
      subscription_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      client_name VARCHAR(255),
      client_email VARCHAR(255),
      client_phone VARCHAR(50),
      property_type VARCHAR(100),
      bedrooms INTEGER,
      bathrooms DECIMAL(3,1),
      square_feet INTEGER,
      services JSONB DEFAULT '[]',
      frequency VARCHAR(50),
      base_price DECIMAL(10,2),
      addons_price DECIMAL(10,2),
      discount_percent DECIMAL(5,2),
      tax_rate DECIMAL(5,2),
      total_price DECIMAL(10,2),
      notes TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Password reset tokens table
    CREATE TABLE IF NOT EXISTS password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- CLIENTS TABLE
    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      address TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- TEAM MEMBERS TABLE (Pro feature)
    CREATE TABLE IF NOT EXISTS team_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      role VARCHAR(100) DEFAULT 'cleaner',
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- CHECKLIST TEMPLATES TABLE
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      rooms JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- QUOTE CHECKLISTS TABLE (attached checklists to quotes)
    CREATE TABLE IF NOT EXISTS quote_checklists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
      checklist_template_id UUID REFERENCES checklist_templates(id) ON DELETE SET NULL,
      completed_tasks JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
    CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_templates_user_id ON checklist_templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_quote_checklists_quote_id ON quote_checklists(quote_id);

    -- Branding columns for Pro users
    ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_data TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7) DEFAULT '#10b981';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_display_name VARCHAR(255);

    -- Email tracking for quotes
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;

    -- Additional quote columns for full data capture
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS property_address TEXT;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS service_type VARCHAR(100);
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2);
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2);

    -- SCHEDULING COLUMNS for quotes
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS scheduled_date DATE;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS scheduled_time TIME;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS recurring VARCHAR(20) DEFAULT 'none';
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL;

    -- SHAREABLE QUOTE LINK COLUMNS
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_approved BOOLEAN DEFAULT FALSE;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMP;
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS change_request TEXT;

    -- Index for share token lookups
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_share_token ON quotes(share_token);
    CREATE INDEX IF NOT EXISTS idx_quotes_scheduled_date ON quotes(scheduled_date);
  `;

  try {
    await db.query(migrations);
    console.log('Database migrations complete');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

// CORS - allow frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://getcleanlyquote.com',
  credentials: true
}));

// Webhook route needs raw body for Stripe signature verification
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

// JSON parsing for other routes (increased limit for logo uploads)
app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/checklists', checklistsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server with migrations
migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`CleanlyQuote API running on port ${PORT}`);
  });
});
