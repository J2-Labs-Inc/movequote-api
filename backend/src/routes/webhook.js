const express = require('express');
const Stripe = require('stripe');
const db = require('../db');
const { sendPaymentConfirmationEmail } = require('../services/email');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/', async (req, res) => {
  let event;

  try {
    // Verify webhook signature
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // For testing without signature verification
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Webhook event:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        
        // Update user subscription status
        await db.query(
          `UPDATE users 
           SET subscription_status = 'active', subscription_id = $1 
           WHERE stripe_customer_id = $2`,
          [subscriptionId, customerId]
        );
        console.log('Subscription activated for customer:', customerId);
        
        // Send payment confirmation email
        try {
          const userResult = await db.query(
            'SELECT email, name FROM users WHERE stripe_customer_id = $1',
            [customerId]
          );
          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            const amountTotal = session.amount_total ? (session.amount_total / 100) : 29;
            sendPaymentConfirmationEmail(user, { amount: amountTotal, planName: 'Professional' })
              .then(result => {
                if (result.success) {
                  console.log('Payment confirmation email sent to:', user.email);
                } else {
                  console.error('Payment confirmation email failed:', result.error);
                }
              })
              .catch(err => console.error('Payment confirmation email error:', err));
          }
        } catch (emailErr) {
          console.error('Error sending payment confirmation email:', emailErr);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status; // active, past_due, canceled, etc.
        
        await db.query(
          `UPDATE users 
           SET subscription_status = $1 
           WHERE stripe_customer_id = $2`,
          [status, subscription.customer]
        );
        console.log('Subscription updated:', subscription.customer, status);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        
        await db.query(
          `UPDATE users 
           SET subscription_status = 'canceled', subscription_id = NULL 
           WHERE stripe_customer_id = $1`,
          [subscription.customer]
        );
        console.log('Subscription canceled for customer:', subscription.customer);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        
        await db.query(
          `UPDATE users 
           SET subscription_status = 'past_due' 
           WHERE stripe_customer_id = $1`,
          [invoice.customer]
        );
        console.log('Payment failed for customer:', invoice.customer);
        break;
      }

      default:
        console.log('Unhandled webhook event:', event.type);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
