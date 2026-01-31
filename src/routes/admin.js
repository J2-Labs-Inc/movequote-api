const express = require('express');
const db = require('../db');
const { adminAuth, isAdmin } = require('../middleware/adminAuth');
const Stripe = require('stripe');

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// All admin routes require admin auth
router.use(adminAuth);

// ============================================
// STATS ENDPOINTS
// ============================================

/**
 * GET /api/admin/stats
 * Dashboard quick stats
 */
router.get('/stats', async (req, res) => {
  try {
    // Total users
    const usersResult = await db.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Total quotes
    const quotesResult = await db.query('SELECT COUNT(*) as count FROM quotes');
    const totalQuotes = parseInt(quotesResult.rows[0].count);

    // Pro users (active subscription)
    const proResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active'"
    );
    const proUsers = parseInt(proResult.rows[0].count);
    const freeUsers = totalUsers - proUsers;

    // Conversion rate
    const conversionRate = totalUsers > 0 ? ((proUsers / totalUsers) * 100).toFixed(1) : 0;

    // Quotes this month
    const quotesThisMonthResult = await db.query(`
      SELECT COUNT(*) as count FROM quotes 
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const quotesThisMonth = parseInt(quotesThisMonthResult.rows[0].count);

    // New users this month
    const newUsersResult = await db.query(`
      SELECT COUNT(*) as count FROM users 
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const newUsersThisMonth = parseInt(newUsersResult.rows[0].count);

    res.json({
      totalUsers,
      totalQuotes,
      proUsers,
      freeUsers,
      conversionRate: parseFloat(conversionRate),
      quotesThisMonth,
      newUsersThisMonth
    });
  } catch (err) {
    console.error('[ADMIN] Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// USERS ENDPOINTS
// ============================================

/**
 * GET /api/admin/users
 * List all users with quote counts
 */
router.get('/users', async (req, res) => {
  try {
    const { status, search, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        u.id, u.email, u.name, u.business_name, u.phone,
        u.subscription_status, u.created_at, u.updated_at,
        u.stripe_customer_id,
        COUNT(q.id) as quote_count
      FROM users u
      LEFT JOIN quotes q ON u.id = q.user_id
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by subscription status
    if (status && status !== 'all') {
      if (status === 'free') {
        conditions.push(`u.subscription_status != 'active'`);
      } else if (status === 'pro') {
        conditions.push(`u.subscription_status = 'active'`);
      }
    }

    // Search by email or name
    if (search) {
      conditions.push(`(u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.business_name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC';
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        businessName: u.business_name,
        phone: u.phone,
        subscriptionStatus: u.subscription_status,
        stripeCustomerId: u.stripe_customer_id,
        quoteCount: parseInt(u.quote_count),
        createdAt: u.created_at,
        updatedAt: u.updated_at
      })),
      total: result.rows.length
    });
  } catch (err) {
    console.error('[ADMIN] Users list error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user and all their quotes (cascade)
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get user info first for logging
    const userResult = await db.query('SELECT email FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userEmail = userResult.rows[0].email;

    // Delete user (quotes cascade automatically via FK)
    await db.query('DELETE FROM users WHERE id = $1', [id]);

    console.log(`[ADMIN] Deleted user: ${userEmail} (${id}) by ${req.user.email}`);

    res.json({ success: true, message: `User ${userEmail} deleted` });
  } catch (err) {
    console.error('[ADMIN] Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// QUOTES ENDPOINTS
// ============================================

/**
 * GET /api/admin/quotes
 * List all quotes with filters
 */
router.get('/quotes', async (req, res) => {
  try {
    const { userId, status, dateFrom, dateTo, search, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT 
        q.*,
        u.email as user_email,
        u.name as user_name,
        u.business_name as user_business
      FROM quotes q
      LEFT JOIN users u ON q.user_id = u.id
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`q.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (status && status !== 'all') {
      conditions.push(`q.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`q.created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`q.created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(q.client_name ILIKE $${paramIndex} OR q.client_email ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY q.created_at DESC';
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM quotes q';
    if (conditions.length > 0) {
      countQuery += ' LEFT JOIN users u ON q.user_id = u.id WHERE ' + conditions.join(' AND ');
    }
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    res.json({
      quotes: result.rows.map(q => ({
        id: q.id,
        userId: q.user_id,
        userEmail: q.user_email,
        userName: q.user_name,
        userBusiness: q.user_business,
        clientName: q.client_name,
        clientEmail: q.client_email,
        clientPhone: q.client_phone,
        propertyType: q.property_type,
        bedrooms: q.bedrooms,
        bathrooms: q.bathrooms,
        squareFeet: q.square_feet,
        services: q.services,
        frequency: q.frequency,
        basePrice: q.base_price,
        addonsPrice: q.addons_price,
        totalPrice: q.total_price,
        status: q.status,
        notes: q.notes,
        createdAt: q.created_at,
        updatedAt: q.updated_at
      })),
      total
    });
  } catch (err) {
    console.error('[ADMIN] Quotes list error:', err);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

/**
 * DELETE /api/admin/quotes/:id
 * Delete single quote
 */
router.delete('/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('DELETE FROM quotes WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    console.log(`[ADMIN] Deleted quote: ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Quote deleted' });
  } catch (err) {
    console.error('[ADMIN] Delete quote error:', err);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

/**
 * POST /api/admin/quotes/bulk-delete
 * Delete multiple quotes
 */
router.post('/quotes/bulk-delete', async (req, res) => {
  try {
    const { quoteIds } = req.body;

    if (!quoteIds || !Array.isArray(quoteIds) || quoteIds.length === 0) {
      return res.status(400).json({ error: 'quoteIds array required' });
    }

    const result = await db.query(
      'DELETE FROM quotes WHERE id = ANY($1) RETURNING id',
      [quoteIds]
    );

    console.log(`[ADMIN] Bulk deleted ${result.rows.length} quotes by ${req.user.email}`);

    res.json({ 
      success: true, 
      deleted: result.rows.length,
      message: `${result.rows.length} quotes deleted` 
    });
  } catch (err) {
    console.error('[ADMIN] Bulk delete error:', err);
    res.status(500).json({ error: 'Failed to delete quotes' });
  }
});

// ============================================
// REVENUE ENDPOINTS
// ============================================

/**
 * GET /api/admin/revenue
 * Get Stripe revenue data
 */
router.get('/revenue', async (req, res) => {
  try {
    // Get all active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: 100
    });

    // Calculate MRR
    let mrr = 0;
    subscriptions.data.forEach(sub => {
      sub.items.data.forEach(item => {
        const amount = item.price.unit_amount / 100;
        const interval = item.price.recurring?.interval;
        if (interval === 'month') {
          mrr += amount;
        } else if (interval === 'year') {
          mrr += amount / 12;
        }
      });
    });

    // Get recent payments (last 30 days)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const charges = await stripe.charges.list({
      limit: 50,
      created: { gte: thirtyDaysAgo }
    });

    // Revenue this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    let revenueThisMonth = 0;
    const recentTransactions = [];
    
    charges.data.forEach(charge => {
      if (charge.status === 'succeeded') {
        if (new Date(charge.created * 1000) >= startOfMonth) {
          revenueThisMonth += charge.amount / 100;
        }
        recentTransactions.push({
          id: charge.id,
          amount: charge.amount / 100,
          currency: charge.currency,
          status: charge.status,
          customerEmail: charge.billing_details?.email || charge.receipt_email,
          description: charge.description,
          created: new Date(charge.created * 1000).toISOString()
        });
      }
    });

    // Get customer count
    const customers = await stripe.customers.list({ limit: 1 });
    
    res.json({
      mrr: Math.round(mrr * 100) / 100,
      activeSubscriptions: subscriptions.data.length,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      recentTransactions: recentTransactions.slice(0, 20)
    });
  } catch (err) {
    console.error('[ADMIN] Revenue error:', err);
    res.status(500).json({ error: 'Failed to fetch revenue data', details: err.message });
  }
});

/**
 * GET /api/admin/check
 * Check if current user is admin
 */
router.get('/check', (req, res) => {
  res.json({ isAdmin: true, email: req.user.email });
});

module.exports = router;
