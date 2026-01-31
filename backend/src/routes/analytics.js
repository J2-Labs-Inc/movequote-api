const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get analytics - Pro users only
router.get('/', authenticate, async (req, res) => {
  try {
    // Check if user is Pro
    if (req.user.subscription_status !== 'active') {
      return res.status(403).json({
        error: 'Pro subscription required',
        code: 'UPGRADE_REQUIRED',
        message: 'Advanced analytics is a Pro feature. Upgrade to access detailed insights.'
      });
    }

    const userId = req.user.id;
    const now = new Date();
    
    // Calculate date boundaries
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get all quotes for calculations
    const quotesResult = await db.query(
      `SELECT 
        id, status, total_price, created_at
      FROM quotes 
      WHERE user_id = $1`,
      [userId]
    );
    
    const quotes = quotesResult.rows;
    
    // Calculate totals
    const totalQuotes = quotes.length;
    const thisMonthQuotes = quotes.filter(q => new Date(q.created_at) >= startOfMonth).length;
    const thisWeekQuotes = quotes.filter(q => new Date(q.created_at) >= startOfWeek).length;
    
    // Status breakdown
    const statusCounts = {
      draft: 0,
      sent: 0,
      accepted: 0,
      declined: 0,
      pending: 0
    };
    
    quotes.forEach(q => {
      const status = q.status || 'draft';
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      } else {
        statusCounts.pending++;
      }
    });
    
    // Revenue tracking
    const totalQuotedValue = quotes.reduce((sum, q) => sum + parseFloat(q.total_price || 0), 0);
    const acceptedQuotes = quotes.filter(q => q.status === 'accepted');
    const acceptedValue = acceptedQuotes.reduce((sum, q) => sum + parseFloat(q.total_price || 0), 0);
    
    // Monthly trend data (last 6 months)
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      
      const monthQuotes = quotes.filter(q => {
        const createdAt = new Date(q.created_at);
        return createdAt >= monthStart && createdAt <= monthEnd;
      });
      
      const monthAccepted = monthQuotes.filter(q => q.status === 'accepted');
      
      monthlyData.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        totalQuotes: monthQuotes.length,
        acceptedQuotes: monthAccepted.length,
        revenue: monthAccepted.reduce((sum, q) => sum + parseFloat(q.total_price || 0), 0)
      });
    }
    
    // Conversion rate
    const sentOrAcceptedOrDeclined = quotes.filter(q => 
      ['sent', 'accepted', 'declined'].includes(q.status)
    ).length;
    const conversionRate = sentOrAcceptedOrDeclined > 0 
      ? (statusCounts.accepted / sentOrAcceptedOrDeclined * 100).toFixed(1)
      : 0;
    
    // Average quote value
    const avgQuoteValue = totalQuotes > 0 
      ? (totalQuotedValue / totalQuotes).toFixed(2)
      : 0;
    
    res.json({
      summary: {
        totalQuotes,
        thisMonthQuotes,
        thisWeekQuotes,
        totalQuotedValue: totalQuotedValue.toFixed(2),
        acceptedValue: acceptedValue.toFixed(2),
        conversionRate,
        avgQuoteValue
      },
      statusBreakdown: statusCounts,
      monthlyTrend: monthlyData,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

module.exports = router;
