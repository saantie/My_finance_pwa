// js/config.js — แก้ครั้งเดียวก่อน deploy
//
// Google OAuth Client ID เป็น PUBLIC value (ไม่ใช่ secret) — ใช้บอก Google
// ว่าเป็นแอปไหน และผูกกับ origin ที่กำหนดไว้ใน Google Cloud Console
// ใส่ค่านี้แล้ว end user ไม่ต้องตั้ง Client ID เอง — แค่ sign in ก็พอ
//
// วิธีรับค่า: console.cloud.google.com → APIs & Services → Credentials
// → Create OAuth Client ID → Web Application → Authorized JS origin =
// URL ของหน้าแอปนี้ (เช่น https://you.github.io)
//
// ถ้าเว้นว่างไว้ แอปจะ fallback ไปอ่านจาก localStorage (per-user setup)

window.APP_CONFIG = {
  GOOGLE_CLIENT_ID: '444691436468-enqqrqqvmt7c58i9sstsjmmjuo8qahp1.apps.googleusercontent.com',  // ← ใส่ Client ID ของคุณตรงนี้ก่อน deploy

  // ชื่อ default สำหรับ sheet ที่แอปสร้างให้
  DEFAULT_SHEET_NAME: 'การเงินส่วนตัว'
};
