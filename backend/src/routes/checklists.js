const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Helper to convert snake_case DB row to camelCase for frontend
function templateToCamelCase(row) {
  if (!row) return row;
  return {
    id: row.id,
    _id: row.id,
    userId: row.user_id,
    name: row.name,
    rooms: row.rooms,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function quoteChecklistToCamelCase(row) {
  if (!row) return row;
  return {
    id: row.id,
    _id: row.id,
    quoteId: row.quote_id,
    checklistTemplateId: row.checklist_template_id,
    templateName: row.template_name,
    rooms: row.rooms,
    completedTasks: row.completed_tasks,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ==================== CHECKLIST TEMPLATES ====================

// Get all checklist templates for user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM checklist_templates WHERE user_id = $1 ORDER BY name ASC`,
      [req.user.id]
    );
    res.json({ checklists: result.rows.map(templateToCamelCase) });
  } catch (err) {
    console.error('Get checklists error:', err);
    res.status(500).json({ error: 'Failed to get checklists' });
  }
});

// Get single checklist template
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM checklist_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    res.json({ checklist: templateToCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Get checklist error:', err);
    res.status(500).json({ error: 'Failed to get checklist' });
  }
});

// Create checklist template
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, rooms } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Checklist name is required' });
    }

    // rooms should be an array like: [{ room: "Kitchen", tasks: ["Wipe counters", "Clean sink"] }]
    const roomsJson = rooms || [];

    const result = await db.query(
      `INSERT INTO checklist_templates (user_id, name, rooms)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, name.trim(), JSON.stringify(roomsJson)]
    );

    res.status(201).json({ checklist: templateToCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Create checklist error:', err);
    res.status(500).json({ error: 'Failed to create checklist' });
  }
});

// Update checklist template
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, rooms } = req.body;

    const result = await db.query(
      `UPDATE checklist_templates SET
        name = COALESCE($1, name),
        rooms = COALESCE($2, rooms),
        updated_at = NOW()
      WHERE id = $3 AND user_id = $4
      RETURNING *`,
      [name, rooms ? JSON.stringify(rooms) : null, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }

    res.json({ checklist: templateToCamelCase(result.rows[0]) });
  } catch (err) {
    console.error('Update checklist error:', err);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
});

// Delete checklist template
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM checklist_templates WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete checklist error:', err);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

module.exports = router;
