const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get branding settings
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT logo_data, brand_color, company_display_name FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    res.json({
      branding: {
        logoData: user.logo_data,
        brandColor: user.brand_color || '#10b981',
        companyDisplayName: user.company_display_name || req.user.business_name || ''
      },
      isPro: req.user.subscription_status === 'active'
    });
  } catch (err) {
    console.error('Get branding error:', err);
    res.status(500).json({ error: 'Failed to get branding settings' });
  }
});

// Update branding settings - Pro only
router.put('/', authenticate, async (req, res) => {
  try {
    // Check if user is Pro
    if (req.user.subscription_status !== 'active') {
      return res.status(403).json({
        error: 'Pro subscription required',
        code: 'UPGRADE_REQUIRED',
        message: 'Custom branding is a Pro feature. Upgrade to customize your brand.'
      });
    }
    
    const { logoData, brandColor, companyDisplayName } = req.body;
    
    // Validate brand color format
    if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
      return res.status(400).json({ error: 'Invalid color format. Use hex color like #10b981' });
    }
    
    // Validate logo size (limit to ~500KB base64)
    if (logoData && logoData.length > 700000) {
      return res.status(400).json({ error: 'Logo is too large. Please use an image under 500KB.' });
    }
    
    const result = await db.query(
      `UPDATE users SET 
        logo_data = COALESCE($1, logo_data),
        brand_color = COALESCE($2, brand_color),
        company_display_name = COALESCE($3, company_display_name),
        updated_at = NOW()
      WHERE id = $4
      RETURNING logo_data, brand_color, company_display_name`,
      [logoData, brandColor, companyDisplayName, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    res.json({
      branding: {
        logoData: user.logo_data,
        brandColor: user.brand_color,
        companyDisplayName: user.company_display_name
      },
      message: 'Branding updated successfully'
    });
  } catch (err) {
    console.error('Update branding error:', err);
    res.status(500).json({ error: 'Failed to update branding settings' });
  }
});

// Delete logo
router.delete('/logo', authenticate, async (req, res) => {
  try {
    if (req.user.subscription_status !== 'active') {
      return res.status(403).json({
        error: 'Pro subscription required',
        code: 'UPGRADE_REQUIRED'
      });
    }
    
    await db.query(
      `UPDATE users SET logo_data = NULL, updated_at = NOW() WHERE id = $1`,
      [req.user.id]
    );
    
    res.json({ success: true, message: 'Logo removed' });
  } catch (err) {
    console.error('Delete logo error:', err);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

module.exports = router;
