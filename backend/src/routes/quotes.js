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
    clientId: row.client_id,
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
    updatedAt: row.updated_at,
    // Scheduling fields
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    recurring: row.recurring,
    assignedTo: row.assigned_to,
    // Shareable link fields
    shareToken: row.share_token,
    shareExpiresAt: row.share_expires_at,
    clientApproved: row.client_approved,
    clientApprovedAt: row.client_approved_at,
    changeRequest: row.change_request
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
      clientId, // Link to saved client
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
      notes, status,
      scheduledDate, scheduledTime, recurring, assignedTo // Scheduling fields
    } = req.body;

    // Use whichever value was provided (prefer the explicit amount fields)
    const finalAddonsPrice = addonsPrice ?? addonTotal ?? 0;
    const finalDiscountAmount = discountAmount ?? 0;
    const finalTaxAmount = taxAmount ?? 0;
    const finalTotalPrice = totalPrice ?? total ?? 0;

    const result = await db.query(
      `INSERT INTO quotes (
        user_id, client_id, client_name, client_email, client_phone,
        property_type, property_address, service_type,
        bedrooms, bathrooms, square_feet,
        services, frequency,
        base_price, addons_price, discount_percent, discount_amount, tax_rate, tax_amount, total_price,
        notes, status,
        scheduled_date, scheduled_time, recurring, assigned_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        req.user.id, clientId || null, clientName, clientEmail, clientPhone,
        propertyType, propertyAddress, serviceType,
        bedrooms, bathrooms, squareFeet,
        JSON.stringify(services || []), frequency,
        basePrice || 0, finalAddonsPrice, discountPercent || 0, finalDiscountAmount, taxRate || 0, finalTaxAmount, finalTotalPrice,
        notes, status || 'draft',
        scheduledDate || null, scheduledTime || null, recurring || 'none', assignedTo || null
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
      clientId,
      clientName, clientEmail, clientPhone,
      propertyType, propertyAddress, serviceType,
      bedrooms, bathrooms, squareFeet,
      services, frequency,
      basePrice, addonsPrice, addonTotal,
      discountPercent, discountAmount,
      taxRate, taxAmount,
      totalPrice, total,
      notes, status,
      scheduledDate, scheduledTime, recurring, assignedTo
    } = req.body;

    // Use whichever value was provided
    const finalAddonsPrice = addonsPrice ?? addonTotal;
    const finalTotalPrice = totalPrice ?? total;

    const result = await db.query(
      `UPDATE quotes SET
        client_id = COALESCE($1, client_id),
        client_name = COALESCE($2, client_name),
        client_email = COALESCE($3, client_email),
        client_phone = COALESCE($4, client_phone),
        property_type = COALESCE($5, property_type),
        property_address = COALESCE($6, property_address),
        service_type = COALESCE($7, service_type),
        bedrooms = COALESCE($8, bedrooms),
        bathrooms = COALESCE($9, bathrooms),
        square_feet = COALESCE($10, square_feet),
        services = COALESCE($11, services),
        frequency = COALESCE($12, frequency),
        base_price = COALESCE($13, base_price),
        addons_price = COALESCE($14, addons_price),
        discount_percent = COALESCE($15, discount_percent),
        discount_amount = COALESCE($16, discount_amount),
        tax_rate = COALESCE($17, tax_rate),
        tax_amount = COALESCE($18, tax_amount),
        total_price = COALESCE($19, total_price),
        notes = COALESCE($20, notes),
        status = COALESCE($21, status),
        scheduled_date = COALESCE($22, scheduled_date),
        scheduled_time = COALESCE($23, scheduled_time),
        recurring = COALESCE($24, recurring),
        assigned_to = COALESCE($25, assigned_to),
        updated_at = NOW()
      WHERE id = $26 AND user_id = $27
      RETURNING *`,
      [
        clientId, clientName, clientEmail, clientPhone,
        propertyType, propertyAddress, serviceType,
        bedrooms, bathrooms, squareFeet,
        services ? JSON.stringify(services) : null, frequency,
        basePrice, finalAddonsPrice, discountPercent, discountAmount, taxRate, taxAmount, finalTotalPrice,
        notes, status,
        scheduledDate, scheduledTime, recurring, assignedTo,
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

// ==================== PUBLIC SHAREABLE LINKS ====================

// Get share link for a quote
router.get('/:id/share', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT share_token, share_expires_at FROM quotes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const { share_token, share_expires_at } = result.rows[0];
    
    res.json({ 
      shareToken: share_token,
      shareUrl: `https://getcleanlyquote.com/proposal/${share_token}`,
      expiresAt: share_expires_at
    });
  } catch (err) {
    console.error('Get share link error:', err);
    res.status(500).json({ error: 'Failed to get share link' });
  }
});

// Regenerate share token (for security or if link was compromised)
router.post('/:id/share/regenerate', authenticate, async (req, res) => {
  try {
    const { expiresIn } = req.body; // Optional: days until expiration

    let expiresAt = null;
    if (expiresIn && typeof expiresIn === 'number') {
      expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);
    }

    const result = await db.query(
      `UPDATE quotes SET
        share_token = gen_random_uuid(),
        share_expires_at = $1,
        updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING share_token, share_expires_at`,
      [expiresAt, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const { share_token, share_expires_at } = result.rows[0];
    
    res.json({ 
      shareToken: share_token,
      shareUrl: `https://getcleanlyquote.com/proposal/${share_token}`,
      expiresAt: share_expires_at
    });
  } catch (err) {
    console.error('Regenerate share link error:', err);
    res.status(500).json({ error: 'Failed to regenerate share link' });
  }
});

// PUBLIC: View quote via share token (NO AUTH REQUIRED)
router.get('/public/:shareToken', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT q.*, u.business_name, u.name as sender_name, u.email as sender_email, 
              u.brand_color, u.logo_data, u.company_display_name
       FROM quotes q
       JOIN users u ON q.user_id = u.id
       WHERE q.share_token = $1`,
      [req.params.shareToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found or link invalid' });
    }

    const quote = result.rows[0];

    // Check if link has expired
    if (quote.share_expires_at && new Date(quote.share_expires_at) < new Date()) {
      return res.status(410).json({ error: 'This quote link has expired' });
    }

    // Return quote data (sanitized - no internal user data)
    res.json({ 
      quote: {
        id: quote.id,
        clientName: quote.client_name,
        clientEmail: quote.client_email,
        clientPhone: quote.client_phone,
        propertyType: quote.property_type,
        propertyAddress: quote.property_address,
        serviceType: quote.service_type,
        bedrooms: quote.bedrooms,
        bathrooms: quote.bathrooms,
        squareFeet: quote.square_feet,
        services: quote.services,
        frequency: quote.frequency,
        basePrice: parseFloat(quote.base_price) || 0,
        addonsPrice: parseFloat(quote.addons_price) || 0,
        discountPercent: parseFloat(quote.discount_percent) || 0,
        discountAmount: parseFloat(quote.discount_amount) || 0,
        taxRate: parseFloat(quote.tax_rate) || 0,
        taxAmount: parseFloat(quote.tax_amount) || 0,
        totalPrice: parseFloat(quote.total_price) || 0,
        notes: quote.notes,
        status: quote.status,
        scheduledDate: quote.scheduled_date,
        scheduledTime: quote.scheduled_time,
        createdAt: quote.created_at,
        clientApproved: quote.client_approved,
        clientApprovedAt: quote.client_approved_at
      },
      business: {
        name: quote.company_display_name || quote.business_name || quote.sender_name,
        email: quote.sender_email,
        brandColor: quote.brand_color,
        logo: quote.logo_data
      }
    });
  } catch (err) {
    console.error('View public quote error:', err);
    res.status(500).json({ error: 'Failed to load quote' });
  }
});

// PUBLIC: Client approves quote (NO AUTH REQUIRED)
router.post('/public/:shareToken/approve', async (req, res) => {
  try {
    // First check if quote exists and is valid
    const checkResult = await db.query(
      'SELECT id, share_expires_at, client_approved FROM quotes WHERE share_token = $1',
      [req.params.shareToken]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found or link invalid' });
    }

    const quote = checkResult.rows[0];

    // Check if link has expired
    if (quote.share_expires_at && new Date(quote.share_expires_at) < new Date()) {
      return res.status(410).json({ error: 'This quote link has expired' });
    }

    // Check if already approved
    if (quote.client_approved) {
      return res.status(400).json({ error: 'This quote has already been approved' });
    }

    // Approve the quote
    const result = await db.query(
      `UPDATE quotes SET
        client_approved = TRUE,
        client_approved_at = NOW(),
        status = 'approved',
        updated_at = NOW()
      WHERE share_token = $1
      RETURNING *`,
      [req.params.shareToken]
    );

    res.json({ 
      success: true, 
      message: 'Quote approved successfully!',
      approvedAt: result.rows[0].client_approved_at
    });
  } catch (err) {
    console.error('Approve quote error:', err);
    res.status(500).json({ error: 'Failed to approve quote' });
  }
});

// PUBLIC: Client requests changes (NO AUTH REQUIRED)
router.post('/public/:shareToken/request-changes', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Please provide details about the requested changes' });
    }

    // First check if quote exists and is valid
    const checkResult = await db.query(
      'SELECT id, share_expires_at FROM quotes WHERE share_token = $1',
      [req.params.shareToken]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found or link invalid' });
    }

    const quote = checkResult.rows[0];

    // Check if link has expired
    if (quote.share_expires_at && new Date(quote.share_expires_at) < new Date()) {
      return res.status(410).json({ error: 'This quote link has expired' });
    }

    // Save the change request
    const result = await db.query(
      `UPDATE quotes SET
        change_request = $1,
        status = 'changes_requested',
        updated_at = NOW()
      WHERE share_token = $2
      RETURNING *`,
      [message.trim(), req.params.shareToken]
    );

    res.json({ 
      success: true, 
      message: 'Change request submitted. The business will review and get back to you.'
    });
  } catch (err) {
    console.error('Request changes error:', err);
    res.status(500).json({ error: 'Failed to submit change request' });
  }
});

// ==================== QUOTE CHECKLISTS ====================

// Get checklist attached to a quote
router.get('/:id/checklist', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT qc.*, ct.name as template_name, ct.rooms
       FROM quote_checklists qc
       LEFT JOIN checklist_templates ct ON qc.checklist_template_id = ct.id
       WHERE qc.quote_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.json({ checklist: null });
    }

    const row = result.rows[0];
    res.json({ 
      checklist: {
        id: row.id,
        quoteId: row.quote_id,
        templateId: row.checklist_template_id,
        templateName: row.template_name,
        rooms: row.rooms,
        completedTasks: row.completed_tasks,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    console.error('Get quote checklist error:', err);
    res.status(500).json({ error: 'Failed to get checklist' });
  }
});

// Attach checklist to quote
router.post('/:id/checklist', authenticate, async (req, res) => {
  try {
    const { templateId } = req.body;

    // Verify quote belongs to user
    const quoteCheck = await db.query(
      'SELECT id FROM quotes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (quoteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    // Verify template belongs to user (if provided)
    if (templateId) {
      const templateCheck = await db.query(
        'SELECT id FROM checklist_templates WHERE id = $1 AND user_id = $2',
        [templateId, req.user.id]
      );
      
      if (templateCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Checklist template not found' });
      }
    }

    // Check if checklist already exists for this quote
    const existingCheck = await db.query(
      'SELECT id FROM quote_checklists WHERE quote_id = $1',
      [req.params.id]
    );

    let result;
    if (existingCheck.rows.length > 0) {
      // Update existing
      result = await db.query(
        `UPDATE quote_checklists SET
          checklist_template_id = $1,
          completed_tasks = '[]',
          updated_at = NOW()
        WHERE quote_id = $2
        RETURNING *`,
        [templateId, req.params.id]
      );
    } else {
      // Create new
      result = await db.query(
        `INSERT INTO quote_checklists (quote_id, checklist_template_id, completed_tasks)
         VALUES ($1, $2, '[]')
         RETURNING *`,
        [req.params.id, templateId]
      );
    }

    // Get full data with template info
    const fullResult = await db.query(
      `SELECT qc.*, ct.name as template_name, ct.rooms
       FROM quote_checklists qc
       LEFT JOIN checklist_templates ct ON qc.checklist_template_id = ct.id
       WHERE qc.id = $1`,
      [result.rows[0].id]
    );

    const row = fullResult.rows[0];
    res.json({ 
      checklist: {
        id: row.id,
        quoteId: row.quote_id,
        templateId: row.checklist_template_id,
        templateName: row.template_name,
        rooms: row.rooms,
        completedTasks: row.completed_tasks,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    console.error('Attach checklist error:', err);
    res.status(500).json({ error: 'Failed to attach checklist' });
  }
});

// Update checklist completion status
router.put('/:id/checklist', authenticate, async (req, res) => {
  try {
    const { completedTasks } = req.body;

    // Verify quote belongs to user
    const quoteCheck = await db.query(
      'SELECT id FROM quotes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (quoteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const result = await db.query(
      `UPDATE quote_checklists SET
        completed_tasks = $1,
        updated_at = NOW()
      WHERE quote_id = $2
      RETURNING *`,
      [JSON.stringify(completedTasks || []), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No checklist attached to this quote' });
    }

    // Get full data with template info
    const fullResult = await db.query(
      `SELECT qc.*, ct.name as template_name, ct.rooms
       FROM quote_checklists qc
       LEFT JOIN checklist_templates ct ON qc.checklist_template_id = ct.id
       WHERE qc.id = $1`,
      [result.rows[0].id]
    );

    const row = fullResult.rows[0];
    res.json({ 
      checklist: {
        id: row.id,
        quoteId: row.quote_id,
        templateId: row.checklist_template_id,
        templateName: row.template_name,
        rooms: row.rooms,
        completedTasks: row.completed_tasks,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    console.error('Update checklist error:', err);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
});

// Delete checklist from quote
router.delete('/:id/checklist', authenticate, async (req, res) => {
  try {
    // Verify quote belongs to user
    const quoteCheck = await db.query(
      'SELECT id FROM quotes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (quoteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    await db.query(
      'DELETE FROM quote_checklists WHERE quote_id = $1',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete quote checklist error:', err);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

module.exports = router;
