const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const FREE_QUOTE_LIMIT = 3;

// Get all quotes for user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM quotes WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ quotes: result.rows });
  } catch (err) {
    console.error('Get quotes error:', err);
    res.status(500).json({ error: 'Failed to get quotes' });
  }
});

// Get single quote
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM quotes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.json({ quote: result.rows[0] });
  } catch (err) {
    console.error('Get quote error:', err);
    res.status(500).json({ error: 'Failed to get quote' });
  }
});

// Create quote - enforces free tier limit
router.post('/', authenticate, async (req, res) => {
  try {
    // Check if user is on free tier and has hit limit
    if (req.user.subscription_status !== 'active') {
      const countResult = await db.query(
        'SELECT COUNT(*) as count FROM quotes WHERE user_id = $1',
        [req.user.id]
      );
      const quoteCount = parseInt(countResult.rows[0].count);
      
      if (quoteCount >= FREE_QUOTE_LIMIT) {
        return res.status(403).json({
          error: 'Free quote limit reached',
          code: 'UPGRADE_REQUIRED',
          message: `You've used all ${FREE_QUOTE_LIMIT} free quotes. Upgrade to Professional for unlimited quotes.`,
          quoteCount,
          limit: FREE_QUOTE_LIMIT
        });
      }
    }

    const {
      clientName, clientEmail, clientPhone,
      propertyType, bedrooms, bathrooms, squareFeet,
      services, frequency,
      basePrice, addonsPrice, discountPercent, taxRate, totalPrice,
      notes, status
    } = req.body;

    const result = await db.query(
      `INSERT INTO quotes (
        user_id, client_name, client_email, client_phone,
        property_type, bedrooms, bathrooms, square_feet,
        services, frequency,
        base_price, addons_price, discount_percent, tax_rate, total_price,
        notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        req.user.id, clientName, clientEmail, clientPhone,
        propertyType, bedrooms, bathrooms, squareFeet,
        JSON.stringify(services || []), frequency,
        basePrice, addonsPrice, discountPercent, taxRate, totalPrice,
        notes, status || 'draft'
      ]
    );

    // Get updated quote count
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM quotes WHERE user_id = $1',
      [req.user.id]
    );
    const newQuoteCount = parseInt(countResult.rows[0].count);

    res.status(201).json({
      quote: result.rows[0],
      quoteCount: newQuoteCount,
      quotesRemaining: req.user.subscription_status === 'active' ? 'unlimited' : Math.max(0, FREE_QUOTE_LIMIT - newQuoteCount)
    });
  } catch (err) {
    console.error('Create quote error:', err);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// Update quote
router.put('/:id', authenticate, async (req, res) => {
  try {
    const {
      clientName, clientEmail, clientPhone,
      propertyType, bedrooms, bathrooms, squareFeet,
      services, frequency,
      basePrice, addonsPrice, discountPercent, taxRate, totalPrice,
      notes, status
    } = req.body;

    const result = await db.query(
      `UPDATE quotes SET
        client_name = COALESCE($1, client_name),
        client_email = COALESCE($2, client_email),
        client_phone = COALESCE($3, client_phone),
        property_type = COALESCE($4, property_type),
        bedrooms = COALESCE($5, bedrooms),
        bathrooms = COALESCE($6, bathrooms),
        square_feet = COALESCE($7, square_feet),
        services = COALESCE($8, services),
        frequency = COALESCE($9, frequency),
        base_price = COALESCE($10, base_price),
        addons_price = COALESCE($11, addons_price),
        discount_percent = COALESCE($12, discount_percent),
        tax_rate = COALESCE($13, tax_rate),
        total_price = COALESCE($14, total_price),
        notes = COALESCE($15, notes),
        status = COALESCE($16, status),
        updated_at = NOW()
      WHERE id = $17 AND user_id = $18
      RETURNING *`,
      [
        clientName, clientEmail, clientPhone,
        propertyType, bedrooms, bathrooms, squareFeet,
        services ? JSON.stringify(services) : null, frequency,
        basePrice, addonsPrice, discountPercent, taxRate, totalPrice,
        notes, status,
        req.params.id, req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ quote: result.rows[0] });
  } catch (err) {
    console.error('Update quote error:', err);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

// Delete quote
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM quotes WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete quote error:', err);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

module.exports = router;
