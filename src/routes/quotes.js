const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendQuoteEmail } = require('../services/email');

const router = express.Router();
const FREE_QUOTE_LIMIT = 3;

// Helper to convert snake_case DB row to camelCase for frontend
function toCamelCase(row) {
  if (!row) return row;
  return {
    id: row.id,
    _id: row.id, // Alias for frontend compatibility
    userId: row.user_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    propertyType: row.property_type,
    propertyAddress: row.property_address,
    serviceType: row.service_type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    squareFeet: row.square_feet,
    services: row.services,
    frequency: row.frequency,
    basePrice: parseFloat(row.base_price) || 0,
    addonsPrice: parseFloat(row.addons_price) || 0,
    addonTotal: parseFloat(row.addons_price) || 0, // Alias for frontend
    discountPercent: parseFloat(row.discount_percent) || 0,
    discountAmount: parseFloat(row.discount_amount) || 0,
    taxRate: parseFloat(row.tax_rate) || 0,
    taxAmount: parseFloat(row.tax_amount) || 0,
    totalPrice: parseFloat(row.total_price) || 0,
    total: parseFloat(row.total_price) || 0, // Alias for frontend
    amount: parseFloat(row.total_price) || 0, // Alias for frontend
    notes: row.notes,
    status: row.status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    date: row.created_at, // Alias for frontend
    updatedAt: row.updated_at
  };
}

// Get all quotes for user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM quotes WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ quotes: result.rows.map(toCamelCase) });
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
    res.json({ quote: toCamelCase(result.rows[0]) });
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

    // Accept both frontend naming conventions (camelCase) and backend naming
    const {
      clientName, clientEmail, clientPhone,
      propertyType, propertyAddress,
      serviceType,
      bedrooms, bathrooms, squareFeet,
      services, frequency,
      basePrice, 
      addonsPrice, addonTotal, // Accept either name
      discountPercent, discountAmount, // Accept either name
      taxRate, taxAmount, // Accept either name
      totalPrice, total, // Accept either name
      notes, status
    } = req.body;

    // Use whichever value was provided (prefer the explicit amount fields)
    const finalAddonsPrice = addonsPrice ?? addonTotal ?? 0;
    const finalDiscountAmount = discountAmount ?? 0;
    const finalTaxAmount = taxAmount ?? 0;
    const finalTotalPrice = totalPrice ?? total ?? 0;

    const result = await db.query(
      `INSERT INTO quotes (
        user_id, client_name, client_email, client_phone,
        property_type, property_address, service_type,
        bedrooms, bathrooms, square_feet,
        services, frequency,
        base_price, addons_price, discount_percent, discount_amount, tax_rate, tax_amount, total_price,
        notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        req.user.id, clientName, clientEmail, clientPhone,
        propertyType, propertyAddress, serviceType,
        bedrooms, bathrooms, squareFeet,
        JSON.stringify(services || []), frequency,
        basePrice || 0, finalAddonsPrice, discountPercent || 0, finalDiscountAmount, taxRate || 0, finalTaxAmount, finalTotalPrice,
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
      quote: toCamelCase(result.rows[0]),
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
      propertyType, propertyAddress, serviceType,
      bedrooms, bathrooms, squareFeet,
      services, frequency,
      basePrice, addonsPrice, addonTotal,
      discountPercent, discountAmount,
      taxRate, taxAmount,
      totalPrice, total,
      notes, status
    } = req.body;

    // Use whichever value was provided
    const finalAddonsPrice = addonsPrice ?? addonTotal;
    const finalTotalPrice = totalPrice ?? total;

    const result = await db.query(
      `UPDATE quotes SET
        client_name = COALESCE($1, client_name),
        client_email = COALESCE($2, client_email),
        client_phone = COALESCE($3, client_phone),
        property_type = COALESCE($4, property_type),
        property_address = COALESCE($5, property_address),
        service_type = COALESCE($6, service_type),
        bedrooms = COALESCE($7, bedrooms),
        bathrooms = COALESCE($8, bathrooms),
        square_feet = COALESCE($9, square_feet),
        services = COALESCE($10, services),
        frequency = COALESCE($11, frequency),
        base_price = COALESCE($12, base_price),
        addons_price = COALESCE($13, addons_price),
        discount_percent = COALESCE($14, discount_percent),
        discount_amount = COALESCE($15, discount_amount),
        tax_rate = COALESCE($16, tax_rate),
        tax_amount = COALESCE($17, tax_amount),
        total_price = COALESCE($18, total_price),
        notes = COALESCE($19, notes),
        status = COALESCE($20, status),
        updated_at = NOW()
      WHERE id = $21 AND user_id = $22
      RETURNING *`,
      [
        clientName, clientEmail, clientPhone,
        propertyType, propertyAddress, serviceType,
        bedrooms, bathrooms, squareFeet,
        services ? JSON.stringify(services) : null, frequency,
        basePrice, finalAddonsPrice, discountPercent, discountAmount, taxRate, taxAmount, finalTotalPrice,
        notes, status,
        req.params.id, req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ quote: toCamelCase(result.rows[0]) });
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

// Send quote to client via email
router.post('/:id/send', authenticate, async (req, res) => {
  try {
    // Get the quote
    const quoteResult = await db.query(
      'SELECT * FROM quotes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];

    // Validate client email exists
    if (!quote.client_email) {
      return res.status(400).json({ error: 'Client email is required to send quote' });
    }

    // Get sender (user) info for the email
    const sender = {
      email: req.user.email,
      name: req.user.name,
      business_name: req.user.business_name,
      brand_color: req.user.brand_color
    };

    // Send the email
    const emailResult = await sendQuoteEmail(quote, sender);

    if (!emailResult.success) {
      console.error('Failed to send quote email:', emailResult.error);
      return res.status(500).json({ error: 'Failed to send quote email', details: emailResult.error });
    }

    // Update quote with sent_at timestamp and status
    const updateResult = await db.query(
      `UPDATE quotes 
       SET sent_at = NOW(), status = 'sent', updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );

    res.json({ 
      success: true, 
      message: `Quote sent to ${quote.client_email}`,
      quote: toCamelCase(updateResult.rows[0]),
      emailId: emailResult.id
    });
  } catch (err) {
    console.error('Send quote error:', err);
    res.status(500).json({ error: 'Failed to send quote' });
  }
});

module.exports = router;
