import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendPasswordResetEmail(email, token, username) {
  const resetUrl = `${process.env.CLIENT_URL || 'https://moonbasev3-production.up.railway.app'}/reset-password?token=${token}`;
  
  const msg = {
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@lunara.game',
    subject: 'Lunara - Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 30px; border-radius: 10px;">
        <h1 style="color: #f59e0b; text-align: center;">🌙 Lunara</h1>
        <h2 style="color: #e0e0e0; text-align: center;">Password Reset</h2>
        <p>Hi ${username},</p>
        <p>You requested a password reset. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #f59e0b; color: #000; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #888;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  };

  await sgMail.send(msg);
}
