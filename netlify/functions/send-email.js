const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const data = JSON.parse(event.body);
  const RESEND_KEY = 're_3QKcGgDA_G14WmR6XveNgU6vzkvXdVLWK';

  const emailBody = `
    <div style="font-family: 'Courier New', monospace; background: #0d0d0d; color: #f0ece0; padding: 40px; max-width: 600px; margin: 0 auto;">
      <div style="border-left: 4px solid #f97316; padding-left: 20px; margin-bottom: 32px;">
        <div style="font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #f97316; margin-bottom: 8px;">New Submission</div>
        <div style="font-size: 28px; font-weight: bold; color: #f0ece0;">BUILDER DOGS</div>
      </div>
      <div style="background: #141414; border: 1px solid rgba(249,115,22,0.2); padding: 24px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid rgba(249,115,22,0.1);">
            <td style="padding: 10px 0; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #666; width: 140px;">Name</td>
            <td style="padding: 10px 0; font-size: 15px; font-weight: bold; color: #f0ece0;">${data.name}</td>
          </tr>
          <tr style="border-bottom: 1px solid rgba(249,115,22,0.1);">
            <td style="padding: 10px 0; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #666;">Email</td>
            <td style="padding: 10px 0; font-size: 15px; color: #f97316;">${data.email}</td>
          </tr>
          <tr style="border-bottom: 1px solid rgba(249,115,22,0.1);">
            <td style="padding: 10px 0; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #666;">Trade</td>
            <td style="padding: 10px 0; font-size: 15px; color: #f0ece0;">${data.trade}</td>
          </tr>
          <tr style="border-bottom: 1px solid rgba(249,115,22,0.1);">
            <td style="padding: 10px 0; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #666;">Location</td>
            <td style="padding: 10px 0; font-size: 15px; color: #f0ece0;">${data.location}</td>
          </tr>
          <tr style="border-bottom: 1px solid rgba(249,115,22,0.1);">
            <td style="padding: 10px 0; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #666;">Wallet</td>
            <td style="padding: 10px 0; font-size: 12px; color: ${data.wallet ? '#f5c842' : '#666'};">${data.wallet || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #666;">Profile ID</td>
            <td style="padding: 10px 0; font-size: 11px; color: #666; font-family: monospace;">${data.profileId}</td>
          </tr>
        </table>
      </div>
      <a href="https://builderdogs.com/admin.html" style="display: block; background: #f97316; color: #0d0d0d; text-align: center; padding: 16px; font-weight: bold; font-size: 14px; letter-spacing: 2px; text-decoration: none; text-transform: uppercase; margin-bottom: 24px;">
        Review in Admin D