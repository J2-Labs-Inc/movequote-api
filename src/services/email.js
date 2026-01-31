const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Use onboarding@resend.dev until domain is verified
const FROM_EMAIL = process.env.FROM_EMAIL || 'CleanlyQuote <onboarding@resend.dev>';
const SUPPORT_EMAIL = 'support@getcleanlyquote.com';
const APP_URL = process.env.FRONTEND_URL || 'https://getcleanlyquote.com';

// Brand colors
const BRAND_GREEN = '#10b981';
const BRAND_DARK = '#1f2937';

/**
 * Base email template wrapper
 */
function emailWrapper(content, preheader = '') {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>CleanlyQuote</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: ${BRAND_GREEN}; padding: 30px 40px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 40px; }
    .footer { background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { color: #6b7280; font-size: 14px; margin: 5px 0; }
    .btn { display: inline-block; background-color: ${BRAND_GREEN}; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .btn:hover { background-color: #059669; }
    h2 { color: ${BRAND_DARK}; font-size: 22px; margin: 0 0 20px; }
    p { color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 16px; }
    .highlight { background-color: #f0fdf4; border-left: 4px solid ${BRAND_GREEN}; padding: 16px 20px; margin: 20px 0; }
    .quote-summary { background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 20px 0; }
    .quote-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .quote-row:last-child { border-bottom: none; font-weight: 600; }
    .price-total { font-size: 24px; color: ${BRAND_GREEN}; font-weight: 700; }
    ul { color: #4b5563; font-size: 16px; line-height: 1.8; padding-left: 20px; }
  </style>
</head>
<body>
  <div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>
  <div style="padding: 20px;">
    <div class="container" style="border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <div class="header">
        <h1>✨ CleanlyQuote</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} CleanlyQuote. All rights reserved.</p>
        <p>Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${BRAND_GREEN};">${SUPPORT_EMAIL}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Send welcome email after signup
 */
async function sendWelcomeEmail(user) {
  const { email, name } = user;
  const firstName = name ? name.split(' ')[0] : 'there';

  const content = `
    <h2>Welcome to CleanlyQuote, ${firstName}! 🎉</h2>
    <p>You've taken the first step toward professional, beautiful quotes that win more cleaning jobs.</p>
    
    <div class="highlight">
      <strong>Your free account includes:</strong>
      <ul>
        <li>3 free quotes to get started</li>
        <li>Professional quote templates</li>
        <li>Client email delivery</li>
      </ul>
    </div>

    <p><strong>Here's how to get started:</strong></p>
    <ul>
      <li><strong>Create your first quote</strong> – Enter client details and services</li>
      <li><strong>Customize pricing</strong> – Set your rates for each service</li>
      <li><strong>Send to clients</strong> – One click to email professional quotes</li>
    </ul>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/app" class="btn">Go to Dashboard →</a>
    </p>

    <p>Need unlimited quotes plus custom branding? <a href="${APP_URL}/app" style="color: ${BRAND_GREEN}; font-weight: 600;">Upgrade to Professional</a> for just $29/month.</p>
    
    <p>Happy quoting!<br><strong>The CleanlyQuote Team</strong></p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to CleanlyQuote! 🧹✨',
      html: emailWrapper(content, 'Your professional quote builder is ready!')
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      return { success: false, error };
    }

    console.log('Welcome email sent to:', email, 'ID:', data?.id);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Welcome email error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(user, resetToken) {
  const { email, name } = user;
  const firstName = name ? name.split(' ')[0] : 'there';
  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  const content = `
    <h2>Reset Your Password</h2>
    <p>Hi ${firstName},</p>
    <p>We received a request to reset your CleanlyQuote password. Click the button below to create a new password:</p>
    
    <p style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" class="btn">Reset Password</a>
    </p>

    <p style="font-size: 14px; color: #6b7280;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    
    <p>Best,<br><strong>The CleanlyQuote Team</strong></p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your CleanlyQuote password',
      html: emailWrapper(content, 'Password reset requested')
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      return { success: false, error };
    }

    console.log('Password reset email sent to:', email);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Password reset email error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send quote email to client
 */
async function sendQuoteEmail(quote, sender) {
  const { 
    client_name, client_email, 
    property_type, bedrooms, bathrooms, square_feet,
    services, frequency,
    base_price, addons_price, discount_percent, tax_rate, total_price,
    notes 
  } = quote;

  const senderName = sender.business_name || sender.name || 'Your Cleaning Professional';
  const senderBrandColor = sender.brand_color || BRAND_GREEN;
  const clientFirstName = client_name ? client_name.split(' ')[0] : 'there';

  // Parse services if it's a string
  let servicesList = services;
  if (typeof services === 'string') {
    try {
      servicesList = JSON.parse(services);
    } catch (e) {
      servicesList = [];
    }
  }

  // Build services HTML
  const servicesHtml = Array.isArray(servicesList) && servicesList.length > 0
    ? `<ul>${servicesList.map(s => `<li>${s.name || s}</li>`).join('')}</ul>`
    : '<p>Standard cleaning services</p>';

  // Format frequency
  const frequencyText = frequency ? frequency.charAt(0).toUpperCase() + frequency.slice(1) : 'One-time';

  // Build pricing breakdown
  let pricingRows = '';
  if (base_price) {
    pricingRows += `<tr><td style="padding: 8px 0; color: #4b5563;">Base Price</td><td style="padding: 8px 0; text-align: right; color: #1f2937;">$${parseFloat(base_price).toFixed(2)}</td></tr>`;
  }
  if (addons_price && parseFloat(addons_price) > 0) {
    pricingRows += `<tr><td style="padding: 8px 0; color: #4b5563;">Add-ons</td><td style="padding: 8px 0; text-align: right; color: #1f2937;">$${parseFloat(addons_price).toFixed(2)}</td></tr>`;
  }
  if (discount_percent && parseFloat(discount_percent) > 0) {
    pricingRows += `<tr><td style="padding: 8px 0; color: #4b5563;">Discount (${discount_percent}%)</td><td style="padding: 8px 0; text-align: right; color: ${senderBrandColor};">-${(parseFloat(base_price || 0) * parseFloat(discount_percent) / 100).toFixed(2)}</td></tr>`;
  }
  if (tax_rate && parseFloat(tax_rate) > 0) {
    pricingRows += `<tr><td style="padding: 8px 0; color: #4b5563;">Tax (${tax_rate}%)</td><td style="padding: 8px 0; text-align: right; color: #1f2937;">Included</td></tr>`;
  }

  const content = `
    <h2>Your Cleaning Quote from ${senderName}</h2>
    <p>Hi ${clientFirstName},</p>
    <p>Thank you for your interest in our cleaning services! Here's your customized quote:</p>

    <div class="quote-summary">
      <h3 style="margin: 0 0 16px; color: ${BRAND_DARK};">Property Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Property Type</td>
          <td style="padding: 8px 0; text-align: right; color: #1f2937; font-weight: 500;">${property_type || 'Home'}</td>
        </tr>
        ${bedrooms ? `<tr><td style="padding: 8px 0; color: #6b7280;">Bedrooms</td><td style="padding: 8px 0; text-align: right; color: #1f2937; font-weight: 500;">${bedrooms}</td></tr>` : ''}
        ${bathrooms ? `<tr><td style="padding: 8px 0; color: #6b7280;">Bathrooms</td><td style="padding: 8px 0; text-align: right; color: #1f2937; font-weight: 500;">${bathrooms}</td></tr>` : ''}
        ${square_feet ? `<tr><td style="padding: 8px 0; color: #6b7280;">Square Feet</td><td style="padding: 8px 0; text-align: right; color: #1f2937; font-weight: 500;">${square_feet.toLocaleString()}</td></tr>` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Frequency</td>
          <td style="padding: 8px 0; text-align: right; color: #1f2937; font-weight: 500;">${frequencyText}</td>
        </tr>
      </table>
    </div>

    <div class="quote-summary">
      <h3 style="margin: 0 0 16px; color: ${BRAND_DARK};">Services Included</h3>
      ${servicesHtml}
    </div>

    <div class="quote-summary" style="background-color: #f0fdf4;">
      <h3 style="margin: 0 0 16px; color: ${BRAND_DARK};">Pricing</h3>
      <table style="width: 100%; border-collapse: collapse;">
        ${pricingRows}
        <tr style="border-top: 2px solid ${senderBrandColor};">
          <td style="padding: 16px 0 8px; font-size: 18px; font-weight: 600; color: ${BRAND_DARK};">Total</td>
          <td style="padding: 16px 0 8px; text-align: right; font-size: 24px; font-weight: 700; color: ${senderBrandColor};">$${parseFloat(total_price || 0).toFixed(2)}</td>
        </tr>
      </table>
      ${frequency && frequency !== 'one-time' ? `<p style="font-size: 14px; color: #6b7280; margin: 8px 0 0;">*Price per ${frequency} service</p>` : ''}
    </div>

    ${notes ? `<div class="highlight"><strong>Notes:</strong><br>${notes}</div>` : ''}

    <p style="text-align: center; margin: 30px 0;">
      <a href="mailto:${sender.email}?subject=Re: Cleaning Quote" class="btn" style="background-color: ${senderBrandColor};">Reply to Accept Quote</a>
    </p>

    <p style="font-size: 14px; color: #6b7280;">Questions? Reply to this email or contact ${senderName} directly.</p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: client_email,
      replyTo: sender.email,
      subject: `Your Cleaning Quote from ${senderName} - $${parseFloat(total_price || 0).toFixed(2)}`,
      html: emailWrapper(content, `Quote for ${property_type || 'cleaning'} services - $${parseFloat(total_price || 0).toFixed(2)}`)
    });

    if (error) {
      console.error('Failed to send quote email:', error);
      return { success: false, error };
    }

    console.log('Quote email sent to:', client_email, 'ID:', data?.id);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Quote email error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send payment/subscription confirmation email
 */
async function sendPaymentConfirmationEmail(user, subscriptionDetails = {}) {
  const { email, name } = user;
  const firstName = name ? name.split(' ')[0] : 'there';
  const amount = subscriptionDetails.amount || 29;
  const planName = subscriptionDetails.planName || 'Professional';

  const content = `
    <h2>Payment Confirmed! 🎉</h2>
    <p>Hi ${firstName},</p>
    <p>Thank you for upgrading to CleanlyQuote <strong>${planName}</strong>! Your payment of <strong>$${amount}/month</strong> has been processed successfully.</p>

    <div class="highlight">
      <strong>Your ${planName} plan includes:</strong>
      <ul>
        <li><strong>Unlimited quotes</strong> – Create as many as you need</li>
        <li><strong>Custom branding</strong> – Add your logo and brand colors</li>
        <li><strong>Priority support</strong> – We're here to help</li>
        <li><strong>Advanced analytics</strong> – Track your quote success</li>
      </ul>
    </div>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/app" class="btn">Start Creating Quotes →</a>
    </p>

    <p style="font-size: 14px; color: #6b7280;">Your subscription will automatically renew each month. You can manage or cancel your subscription anytime from your account settings.</p>
    
    <p>Thank you for choosing CleanlyQuote!<br><strong>The CleanlyQuote Team</strong></p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: '✅ Payment Confirmed - Welcome to CleanlyQuote Professional!',
      html: emailWrapper(content, 'Your CleanlyQuote Professional subscription is now active!')
    });

    if (error) {
      console.error('Failed to send payment confirmation email:', error);
      return { success: false, error };
    }

    console.log('Payment confirmation email sent to:', email, 'ID:', data?.id);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Payment confirmation email error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendQuoteEmail,
  sendPaymentConfirmationEmail
};
