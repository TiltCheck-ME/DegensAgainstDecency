/**
 * Netlify build step — writes activity/config.js from environment variables.
 */

const fs = require('fs');
const path = require('path');

const isNetlify = process.env.NETLIFY === 'true';

const config = {
  WS_URL: process.env.WS_URL || (isNetlify ? 'wss://degensagainstdecency.fly.dev' : 'ws://localhost:3000'),
  API_URL: process.env.API_URL || (isNetlify ? 'https://degensagainstdecency.fly.dev' : 'http://localhost:3000'),
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
};

const out = `/**
 * Generated at build time — do not edit on Netlify; change env vars instead.
 */
window.APP_CONFIG = ${JSON.stringify(config, null, 4)};
`;

const target = path.join(__dirname, '..', 'activity', 'config.js');
fs.writeFileSync(target, out, 'utf8');
console.log('Wrote activity/config.js for', config.API_URL);
