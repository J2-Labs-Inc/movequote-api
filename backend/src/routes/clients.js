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
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Get all clients for user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM clients WHERE user_id = $1 ORDER BY name ASC`,
      [req.user.id]
    );
    res.json({ clients: result.rows.map(toCamelCase) });
  } catch (err) {
    console.error('Get clients error:', err);
    res.status(500).json({ error: 'Failed to get clients' });
  }
});

// Get single client
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ client: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Failed to get client' });
  }
});

// Create client
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    const result = await db.query(
      `INSERT INTO clients (user_id, name, email, phone, address, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, name.trim(), email || null, phone || null, address || null, notes || null]
    );

    res.status(201).json({ client: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;

    const result = await db.query(
      `UPDATE clients SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        notes = COALESCE($5, notes),
        updated_at = NOW()
      WHERE id = $6 AND user_id = $7
      RETURNING *`,
      [name, email, phone, address, notes, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Get client's quotes
router.get('/:id/quotes', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM quotes WHERE client_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
      [req.params.id, req.user.id]
    );
    res.json({ quotes: result.rows });
  } catch (err) {
    console.error('Get client quotes error:', err);
    res.status(500).json({ error: 'Failed to get client quotes' });
  }
});

module.exports = router;
