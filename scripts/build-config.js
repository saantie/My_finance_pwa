// สร้าง js/config.js จาก environment variables ตอน Vercel build
const fs = require('fs');
const path = require('path');

const geminiKey = process.env.GEMINI_API_KEY || '';

const content = `export const FIREBASE_CONFIG = { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };
export const GEMINI_API_KEY = ${JSON.stringify(geminiKey)};
`;

fs.writeFileSync(path.join(__dirname, '../js/config.js'), content);
console.log('config.js generated, GEMINI_API_KEY:', geminiKey ? '(set)' : '(empty)');
