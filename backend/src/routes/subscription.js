const express = require('express');
const Stripe = require('stripe');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe Price IDs for CleanlyQuote Pro
const MONTHLY_PRICE_ID = process.env.STRIPE_PRICE_ID || process.env.STRIPE_MONTHLY_PRICE_ID;
const ANNUAL_PRICE_ID = process.env.STRIPE_ANNUAL_PRICE_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://getcleanlyquote.com';

// Get subscription status
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT subscription_status, subscription_id, stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const user = result.rows[0];
    
    // Get quote count for context
    const quotesResult = await db.query(
      'SELECT COUNT(*) as count FROM quotes WHERE user_id = $1',
      [req.user.id]
    );
    const quoteCount = parseInt(quotesResult.rows[0].count);
    
    res.json({
      status: user.subscription_status,
      isActive: user.subscription_status === 'active',
      quoteCount,
      quotesRemaining: user.subscription_status === 'active' ? 'unlimited' : Math.max(0, 3 - quoteCount),
      canCreateQuote: user.subscription_status === 'active' || quoteCount < 3
    });
  } catch (err) {
    console.error('Get subscription status error:', err);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// Create checkout session
router.post('/create-checkout', authenticate, async (req, res) => {
  try {
    const { interval = 'month' } = req.body; // 'month' or 'year'
    
    // Select price based on interval
    const priceId = interval === 'year' && ANNUAL_PRICE_ID ? ANNUAL_PRICE_ID : MONTHLY_PRICE_ID;
    
    if (!priceId) {
      return res.status(500).json({ error: 'Price not configured' });
    }
    
    // Get or create Stripe customer
    let customerId = req.user.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { userId: req.user.id }
      });
      customerId = customer.id;
      
      // Save customer ID
      await db.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, req.user.id]
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${FRONTEND_URL}/app?subscription=success`,
      cancel_url: `${FRONTEND_URL}/app?subscription=cancelled`,
      metadata: {
        userId: req.user.id,
        interval: interval
      }
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Create checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create billing portal session (for managing subscription)
router.post('/billing-portal', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONTEND_URL}/app`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Billing portal error:', err);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

module.exports = router;
