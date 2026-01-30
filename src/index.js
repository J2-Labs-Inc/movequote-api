require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const quotesRoutes = require('./routes/quotes');
const subscriptionRoutes = require('./routes/subscription');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - allow frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://getcleanlyquote.com',
  credentials: true
}));

// Webhook route needs raw body for Stripe signature verification
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

// JSON parsing for other routes
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`CleanlyQuote API running on port ${PORT}`);
});
