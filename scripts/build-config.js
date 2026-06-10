/**
 * build-config.js — inject GEMINI_API_KEY from env var into config.js at deploy time
 * Vercel: set GEMINI_API_KEY in Dashboard → Settings → Environment Variables
 */
const fs = require('fs');
const path = require('path');

const geminiKey = process.env.GEMINI_API_KEY || '';

const configPath = path.join(__dirname, '..', 'js', 'config.js');
let content = fs.readFileSync(configPath, 'utf8');

content = content.replace(
  /export const GEMINI_API_KEY = ".*?";/,
  `export const GEMINI_API_KEY = "${geminiKey}";`
);

fs.writeFileSync(configPath, content, 'utf8');
console.log('build-config: GEMINI_API_KEY', geminiKey ? '✓ injected' : '(empty — set env var in Vercel dashboard)');
