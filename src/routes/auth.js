const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, businessName, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, business_name, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, business_name, subscription_status`,
      [email.toLowerCase(), passwordHash, name, businessName, phone]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessName: user.business_name,
        subscriptionStatus: user.subscription_status
      },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const result = await db.query(
      'SELECT id, email, password_hash, name, business_name, subscription_status FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessName: user.business_name,
        subscriptionStatus: user.subscription_status
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    // Get quote count for free tier check
    const quotesResult = await db.query(
      'SELECT COUNT(*) as count FROM quotes WHERE user_id = $1',
      [req.user.id]
    );
    const quoteCount = parseInt(quotesResult.rows[0].count);

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        businessName: req.user.business_name,
        subscriptionStatus: req.user.subscription_status,
        quoteCount,
        quotesRemaining: req.user.subscription_status === 'active' ? 'unlimited' : Math.max(0, 3 - quoteCount)
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;
