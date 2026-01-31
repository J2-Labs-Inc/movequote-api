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
    role: row.role,
    createdAt: row.created_at
  };
}

// Middleware to check Pro subscription
async function requirePro(req, res, next) {
  if (req.user.subscription_status !== 'active') {
    return res.status(403).json({ 
      error: 'Team management is a Pro feature',
      code: 'UPGRADE_REQUIRED'
    });
  }
  next();
}

// Get all team members for user
router.get('/', authenticate, requirePro, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM team_members WHERE user_id = $1 ORDER BY name ASC`,
      [req.user.id]
    );
    res.json({ team: result.rows.map(toCamelCase) });
  } catch (err) {
    console.error('Get team error:', err);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

// Get single team member
router.get('/:id', authenticate, requirePro, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM team_members WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    res.json({ member: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Get team member error:', err);
    res.status(500).json({ error: 'Failed to get team member' });
  }
});

// Add team member
router.post('/', authenticate, requirePro, async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team member name is required' });
    }

    const result = await db.query(
      `INSERT INTO team_members (user_id, name, email, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, name.trim(), email || null, role || 'cleaner']
    );

    res.status(201).json({ member: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Add team member error:', err);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// Update team member
router.put('/:id', authenticate, requirePro, async (req, res) => {
  try {
    const { name, email, role } = req.body;

    const result = await db.query(
      `UPDATE team_members SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        role = COALESCE($3, role)
      WHERE id = $4 AND user_id = $5
      RETURNING *`,
      [name, email, role, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    res.json({ member: toCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Update team member error:', err);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// Delete team member
router.delete('/:id', authenticate, requirePro, async (req, res) => {
  try {
    // First unassign this team member from any quotes
    await db.query(
      'UPDATE quotes SET assigned_to = NULL WHERE assigned_to = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    const result = await db.query(
      'DELETE FROM team_members WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete team member error:', err);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// Get jobs assigned to team member
router.get('/:id/jobs', authenticate, requirePro, async (req, res) => {
  try {
    // Verify team member belongs to user
    const memberCheck = await db.query(
      'SELECT id FROM team_members WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    const result = await db.query(
      `SELECT * FROM quotes 
       WHERE assigned_to = $1 AND user_id = $2 
       ORDER BY scheduled_date ASC, scheduled_time ASC`,
      [req.params.id, req.user.id]
    );
    
    res.json({ jobs: result.rows });
  } catch (err) {
    console.error('Get team member jobs error:', err);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

module.exports = router;
