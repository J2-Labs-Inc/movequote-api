const { authenticate } = require('./auth');

// Admin email allowlist
const ADMIN_EMAILS = [
  'steve@janover.ai',
  'codie@janover.ai'
];

/**
 * Admin authentication middleware
 * First authenticates the user, then checks if they're an admin
 */
const adminAuth = async (req, res, next) => {
  // First run standard authentication
  authenticate(req, res, (err) => {
    if (err) return next(err);
    
    // Check if authenticated user is an admin
    if (!req.user || !ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
      console.log(`Admin access denied for: ${req.user?.email || 'unknown'}`);
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Log admin action
    console.log(`[ADMIN] ${req.user.email} - ${req.method} ${req.originalUrl}`);
    
    next();
  });
};

/**
 * Check if email is admin (for login response)
 */
const isAdmin = (email) => {
  return ADMIN_EMAILS.includes(email.toLowerCase());
};

module.exports = { adminAuth, isAdmin, ADMIN_EMAILS };
