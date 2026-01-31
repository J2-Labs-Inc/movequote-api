const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Helper to convert snake_case DB row to camelCase for frontend
function toCamelCase(row) {
  if (!row) return row;
  return {
    id: row.id,
    _id: row.id,
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
    totalPrice: parseFloat(row.total_price) || 0,
    notes: row.notes,
    status: row.status,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    recurring: row.recurring,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Get schedule for date range
router.get('/', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end dates are required (YYYY-MM-DD format)' });
    }

    // Get quotes with scheduled dates in range, including assigned team member name
    const result = await db.query(
      `SELECT q.*, tm.name as assigned_to_name
       FROM quotes q
       LEFT JOIN team_members tm ON q.assigned_to = tm.id
       WHERE q.user_id = $1 
       AND q.scheduled_date >= $2 
       AND q.scheduled_date <= $3
       ORDER BY q.scheduled_date ASC, q.scheduled_time ASC`,
      [req.user.id, start, end]
    );

    res.json({ jobs: result.rows.map(toCamelCase) });
  } catch (err) {
    console.error('Get schedule error:', err);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

// Schedule a quote (set date/time)
router.post('/:quoteId', authenticate, async (req, res) => {
  try {
    const { scheduledDate, scheduledTime, recurring, assignedTo } = req.body;

    if (!scheduledDate) {
      return res.status(400).json({ error: 'scheduledDate is required' });
    }

    const result = await db.query(
      `UPDATE quotes SET
        scheduled_date = $1,
        scheduled_time = $2,
        recurring = COALESCE($3, 'none'),
        assigned_to = $4,
        status = CASE WHEN status = 'draft' THEN 'scheduled' ELSE status END,
        updated_at = NOW()
      WHERE id = $5 AND user_id = $6
      RETURNING *`,
      [scheduledDate, scheduledTime || null, recurring, assignedTo || null, req.params.quoteId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ job: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Schedule quote error:', err);
    res.status(500).json({ error: 'Failed to schedule quote' });
  }
});

// Update job status (completed, cancelled, etc)
router.put('/:quoteId/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['draft', 'sent', 'scheduled', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const result = await db.query(
      `UPDATE quotes SET
        status = $1,
        updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING *`,
      [status, req.params.quoteId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ job: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Update job status error:', err);
    res.status(500).json({ error: 'Failed to update job status' });
  }
});

// Unschedule a quote
router.delete('/:quoteId', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE quotes SET
        scheduled_date = NULL,
        scheduled_time = NULL,
        recurring = 'none',
        assigned_to = NULL,
        status = 'draft',
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
      [req.params.quoteId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ success: true, job: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Unschedule quote error:', err);
    res.status(500).json({ error: 'Failed to unschedule quote' });
  }
});

module.exports = router;
