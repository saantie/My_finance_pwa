/* ===================================================================
   drive.js — Google Drive backup / restore
   ===================================================================
   ใช้ scope: https://www.googleapis.com/auth/drive.file
   - non-sensitive scope → ไม่ต้อง OAuth verification จาก Google
   - แอปเข้าถึงได้เฉพาะไฟล์ที่แอปสร้างเองใน Drive

   Public API:
   - requestDriveAccess()      : popup ขอ Drive scope (ผ่าน Firebase Auth)
   - hasDriveToken()           : true ถ้ามี token พร้อมใช้
   - setDriveToken(token)      : เซ็ต token จาก signInWithGoogle
   - uploadBackup(jsonStr)     : อัปโหลด/อัปเดต backup file
   - downloadBackup()          : ดาวน์โหลด backup → JSON string หรือ null
   - getBackupInfo()           : { modifiedTime, size } หรือ null
   =================================================================== */

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_NAME = 'diary-finance-backup.json';
const DRIVE_API   = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API  = 'https://www.googleapis.com/upload/drive/v3/files';

let _driveToken = null;


/* === Token management =========================================== */

export function hasDriveToken() {
  return !!_driveToken;
}

/** รับ token จากภายนอก (เรียกหลัง signInWithGoogle สำเร็จ) */
export function setDriveToken(token) {
  _driveToken = token || null;
  if (_driveToken) {
    // access token หมดอายุใน ~1 ชม. — เคลียร์อัตโนมัติ
    setTimeout(() => { _driveToken = null; }, 55 * 60 * 1000);
  }
}

/**
 * ขอ Drive access ด้วย Firebase GoogleAuthProvider + drive.file scope
 * เรียกเมื่อ _driveToken ไม่มี (เช่น session restore หลัง reload)
 */
export async function requestDriveAccess() {
  // lazy-import firebase เพื่อหลีกเลี่ยง circular dependency
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  const firebase = await import('./firebase.js');
  const auth = getAuth();

  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  // hint: ถ้า user ล็อกอิน Firebase อยู่แล้ว ใส่ email เพื่อข้ามหน้า account picker
  const currentUser = firebase.getCurrentUser();
  if (currentUser?.email) provider.setCustomParameters({ login_hint: currentUser.email });

  const result = await signInWithPopup(auth, provider);
  const token  = result._tokenResponse?.oauthAccessToken ?? null;
  if (!token) throw new Error('Drive token ไม่พบใน response');
  setDriveToken(token);
  return token;
}


/* === Drive REST helpers ========================================= */

function authHeader() {
  if (!_driveToken) throw new Error('no_drive_token');
  return { Authorization: `Bearer ${_driveToken}` };
}

/** หา metadata ของ backup file ใน Drive */
async function findFile() {
  const q   = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
  const res = await fetch(`${DRIVE_API}?q=${q}&fields=files(id,modifiedTime,size)`, {
    headers: authHeader()
  });
  if (!res.ok) throw new Error(`Drive list: ${res.status}`);
  const data = await res.json();
  return data.files?.[0] ?? null;
}

/** multipart upload (create หรือ update) */
async function multipartUpload(method, url, jsonStr) {
  const meta  = JSON.stringify({ name: BACKUP_NAME, mimeType: 'application/json' });
  const delim = '-------diaryBoundary7f3k9';
  const body  = [
    `--${delim}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    meta,
    `\r\n--${delim}\r\nContent-Type: application/json\r\n\r\n`,
    jsonStr,
    `\r\n--${delim}--`
  ].join('');

  const res = await fetch(`${url}?uploadType=multipart`, {
    method,
    headers: {
      ...authHeader(),
      'Content-Type': `multipart/related; boundary=${delim}`
    },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive upload ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}


/* === Public API ================================================= */

/**
 * ข้อมูล backup ล่าสุด → { id, modifiedTime, size } หรือ null
 * คืน null เงียบๆ ถ้าไม่มี token หรือ error
 */
export async function getBackupInfo() {
  if (!_driveToken) return null;
  try { return await findFile(); } catch { return null; }
}

/**
 * อัปโหลด JSON string ขึ้น Drive
 * ถ้าไฟล์มีอยู่แล้ว → update, ถ้ายังไม่มี → create
 */
export async function uploadBackup(jsonStr) {
  if (!_driveToken) throw new Error('no_drive_token');
  const existing = await findFile();
  if (existing?.id) {
    return multipartUpload('PATCH', `${UPLOAD_API}/${existing.id}`, jsonStr);
  }
  return multipartUpload('POST', UPLOAD_API, jsonStr);
}

/**
 * ดาวน์โหลด backup JSON string จาก Drive
 * @returns {string|null}
 */
export async function downloadBackup() {
  if (!_driveToken) throw new Error('no_drive_token');
  const file = await findFile();
  if (!file?.id) return null;
  const res = await fetch(`${DRIVE_API}/${file.id}?alt=media`, {
    headers: authHeader()
  });
  if (!res.ok) throw new Error(`Drive download ${res.status}`);
  return res.text();
}
