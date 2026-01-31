const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Resend } = require('resend');
const db = require('../db');
const { authenticate, generateToken } = require('../middleware/auth');
const { isAdmin } = require('../middleware/adminAuth');
const { sendWelcomeEmail } = require('../services/email');

const router = express.Router();

// Initialize Resend with API key (for inline password reset email)
const resend = new Resend(process.env.RESEND_API_KEY);

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, businessName, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, business_name, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, business_name, subscription_status`,
      [email.toLowerCase(), passwordHash, name, businessName, phone]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    // Send welcome email (don't block response on email sending)
    sendWelcomeEmail({ email: user.email, name: user.name })
      .then(result => {
        if (result.success) {
          console.log('Welcome email sent to:', user.email);
        } else {
          console.error('Welcome email failed:', result.error);
        }
      })
      .catch(err => console.error('Welcome email error:', err));

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessName: user.business_name,
        subscriptionStatus: user.subscription_status
      },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account', details: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const result = await db.query(
      'SELECT id, email, password_hash, name, business_name, subscription_status FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessName: user.business_name,
        subscriptionStatus: user.subscription_status,
        isAdmin: isAdmin(user.email)
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    // Get quote count for free tier check
    const quotesResult = await db.query(
      'SELECT COUNT(*) as count FROM quotes WHERE user_id = $1',
      [req.user.id]
    );
    const quoteCount = parseInt(quotesResult.rows[0].count);
    
    // Get branding data
    const brandingResult = await db.query(
      'SELECT logo_data, brand_color, company_display_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const branding = brandingResult.rows[0] || {};

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        businessName: req.user.business_name,
        subscriptionStatus: req.user.subscription_status,
        isAdmin: isAdmin(req.user.email),
        quoteCount,
        quotesRemaining: req.user.subscription_status === 'active' ? 'unlimited' : Math.max(0, 3 - quoteCount),
        branding: {
          logoData: branding.logo_data,
          brandColor: branding.brand_color || '#10b981',
          companyDisplayName: branding.company_display_name
        }
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Forgot password - request reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user (but always return success to prevent email enumeration)
    const result = await db.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      // Generate secure random token
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Set expiry to 1 hour from now
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      // Invalidate any existing tokens for this user
      await db.query(
        'UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE',
        [user.id]
      );
      
      // Store hashed token
      await db.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );
      
      // Send reset email via Resend
      const resetLink = `https://getcleanlyquote.com/reset-password.html?token=${token}`;
      const userName = user.name || 'there';
      
      try {
        await resend.emails.send({
          from: 'CleanlyQuote <noreply@getcleanlyquote.com>',
          to: user.email,
          subject: 'Reset Your CleanlyQuote Password',
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f0fdfa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdfa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #111827;">
                <span style="color: #10b981;">✨</span> CleanlyQuote
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #111827;">Reset Your Password</h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #4b5563;">
                Hi ${userName},
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #4b5563;">
                We received a request to reset your CleanlyQuote password. Click the button below to create a new password:
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 16px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #6b7280;">
                This link will expire in <strong>1 hour</strong> for security reasons.
              </p>
              
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #6b7280;">
                If you can't click the button, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; line-height: 1.6; color: #9ca3af; word-break: break-all;">
                ${resetLink}
              </p>
              
              <!-- Security Notice -->
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin-top: 8px;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #92400e;">
                  <strong>🔒 Security Notice:</strong> If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af; text-align: center;">
                © ${new Date().getFullYear()} CleanlyQuote. Professional cleaning estimates made easy.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `
        });
        console.log('Password reset email sent to:', user.email);
      } catch (emailErr) {
        console.error('Failed to send reset email:', emailErr);
        // Don't expose email errors to user
      }
    }

    // Always return success to prevent email enumeration
    res.json({ 
      success: true, 
      message: 'If an account exists with that email, you will receive a password reset link shortly.' 
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password - set new password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Hash the provided token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid token
    const result = await db.query(
      `SELECT pr.id, pr.user_id, u.email 
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token_hash = $1 
         AND pr.used = FALSE 
         AND pr.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const resetRecord = result.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, resetRecord.user_id]
    );

    // Mark token as used
    await db.query(
      'UPDATE password_resets SET used = TRUE WHERE id = $1',
      [resetRecord.id]
    );

    // Invalidate all other reset tokens for this user
    await db.query(
      'UPDATE password_resets SET used = TRUE WHERE user_id = $1',
      [resetRecord.user_id]
    );

    console.log('Password reset successful for:', resetRecord.email);

    res.json({ 
      success: true, 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
