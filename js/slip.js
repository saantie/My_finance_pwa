/* ===================================================================
   slip.js — Camera + QR scanner สำหรับ PromptPay slip
   ===================================================================
   ให้ 2 ทาง:
   - scanSlipImage(file) → process ไฟล์ที่ user เลือก/ถ่าย (ใช้ใน Import view)
   - openSlipScanner(onSuccess, onCancel) → กล้อง realtime (เผื่อใช้ตอน mobile)

   Mobile + capture="environment" → file input เปิดกล้องอัตโนมัติ → ใช้ scanSlipImage
   Desktop → ไฟล์ pic → ใช้ scanSlipImage
   Realtime camera → ใช้ openSlipScanner (เปิด modal full-screen)

   PromptPay slip QR = EMVCo TLV format
   - Tag 00: payload format indicator
   - Tag 30/29: PromptPay merchant info
   - Tag 53: currency (764 = THB)
   - Tag 54: amount
   - Tag 62: additional data (ref ID)

   jsQR load on-demand จาก CDN (ESM, ~30KB gzipped)
   =================================================================== */


let _jsQR = null;


/* === Lazy-load jsQR ============================================= */
async function loadJsQR() {
  if (_jsQR) return _jsQR;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm');
    _jsQR = mod.default || mod;
    return _jsQR;
  } catch (e) {
    console.error('Failed to load jsQR', e);
    throw new Error('library_load_failed');
  }
}


/* === Public: Scan ภาพที่ user เลือก/ถ่าย ======================== */

/**
 * ประมวลผลไฟล์ภาพ → หา QR → parse slip
 * @param {File} file ไฟล์ภาพ slip
 * @returns {Promise<object|null>} { amount, ref, bank, raw } หรือ null
 */
export async function scanSlipImage(file) {
  if (!file || !file.type.startsWith('image/')) return null;

  const jsQR = await loadJsQR();

  // 1. โหลดเป็น Image
  const img = await fileToImage(file);

  // 2. วาดลง canvas
  const canvas = document.createElement('canvas');
  // ลด resolution ลงถ้าใหญ่เกินไป (เร็วขึ้น)
  const maxDim = 1200;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  canvas.width = Math.floor(img.width * scale);
  canvas.height = Math.floor(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 3. หา QR
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, canvas.width, canvas.height, {
    inversionAttempts: 'attemptBoth'
  });
  if (!code) return null;

  // 4. Parse
  return parseSlipQR(code.data);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    img.src = url;
  });
}


/* === Public: Camera realtime scanner ============================ */

let _stream = null;
let _scanLoop = null;

/**
 * เปิด full-screen camera scanner
 * @param {function} onSuccess รับ slip data
 * @param {function} onCancel เรียกเมื่อ cancel/error
 */
export async function openSlipScanner(onSuccess, onCancel) {
  let jsQR;
  try {
    jsQR = await loadJsQR();
  } catch {
    onCancel && onCancel('library_load_failed');
    return;
  }

  const modal = createScannerModal();
  document.body.appendChild(modal);

  const video = modal.querySelector('video');
  const canvas = modal.querySelector('canvas');
  const status = modal.querySelector('.scanner-status');

  const cleanup = () => {
    stopCameraScan();
    if (modal.parentNode) modal.parentNode.removeChild(modal);
  };

  modal.querySelector('[data-action="close"]').addEventListener('click', () => {
    cleanup();
    onCancel && onCancel('user_cancelled');
  });

  modal.querySelector('[data-action="manual"]').addEventListener('click', () => {
    cleanup();
    onCancel && onCancel('manual_entry');
  });

  // Request camera
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = _stream;
    await video.play();
    status.textContent = 'จัดให้ QR code อยู่ในกรอบ';
  } catch (e) {
    status.textContent = 'ไม่สามารถเปิดกล้องได้ — โปรดอนุญาตการเข้าถึงกล้อง';
    return;
  }

  // Scan loop — 5 fps
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  _scanLoop = setInterval(() => {
    if (video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth'
    });
    if (code) {
      const slip = parseSlipQR(code.data);
      if (slip) {
        if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
        cleanup();
        onSuccess && onSuccess(slip);
      } else {
        status.textContent = 'พบ QR แต่ไม่ใช่ slip — ลองใหม่';
      }
    }
  }, 200);
}

function stopCameraScan() {
  if (_scanLoop) { clearInterval(_scanLoop); _scanLoop = null; }
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
}

function createScannerModal() {
  const div = document.createElement('div');
  div.className = 'scanner-modal';
  div.innerHTML = `
    <div class="scanner-topbar">
      <button class="scanner-close" data-action="close" aria-label="ปิด">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="scanner-title">สแกน Slip</div>
      <button class="scanner-manual" data-action="manual">กรอกเอง</button>
    </div>
    <div class="scanner-stage">
      <video playsinline muted autoplay></video>
      <canvas hidden></canvas>
      <div class="scanner-frame">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
      </div>
    </div>
    <div class="scanner-status">เปิดกล้อง...</div>
    <div class="scanner-hint">
      รองรับ slip โอนผ่าน PromptPay ของทุกธนาคาร<br>
      <em>ภาพไม่ส่งออกจากเครื่อง</em>
    </div>
  `;
  return div;
}


/* === Parse PromptPay slip QR ====================================
   EMVCo TLV format: TT(tag) + LL(length) + V*L(value)
   เช่น "5404150" → tag 54, length 4, value "150" (150 บาท)
=============================================================== */

function parseSlipQR(data) {
  if (!data || typeof data !== 'string') return null;

  try {
    const parsed = parseTLV(data);

    // Slip valid → ต้องมี payload version (00)
    if (!parsed['00']) return null;

    // Amount (tag 54)
    let amount = null;
    if (parsed['54']) {
      const v = parseFloat(parsed['54']);
      if (!isNaN(v) && v > 0) amount = v;
    }

    // Reference ID (tag 62 sub-field 01 หรือ 05)
    let ref = null;
    if (parsed['62']) {
      const sub = parseTLV(parsed['62']);
      ref = sub['01'] || sub['05'] || null;
    }

    // Merchant info (PromptPay = tag 30 หรือ 29)
    let merchant = null;
    let bank = null;
    if (parsed['30']) {
      merchant = parseTLV(parsed['30']);
      // Bank code อาจอยู่ใน sub-field 01 (BIC/AID)
      if (merchant['01']) bank = inferBankFromAID(merchant['01']);
    } else if (parsed['29']) {
      merchant = parseTLV(parsed['29']);
    }

    return {
      amount,
      ref,
      bank,
      merchant,
      raw: data,
      isPromptPay: !!merchant
    };
  } catch {
    return null;
  }
}

/** Parse EMVCo TLV string → { tag: value } */
function parseTLV(str) {
  const result = {};
  let i = 0;
  while (i < str.length - 4) {
    const tag = str.slice(i, i + 2);
    const len = parseInt(str.slice(i + 2, i + 4), 10);
    if (isNaN(len) || i + 4 + len > str.length) break;
    const value = str.slice(i + 4, i + 4 + len);
    result[tag] = value;
    i += 4 + len;
  }
  return result;
}

/** เดาธนาคารจาก AID (Application ID) — bank code ในไทย */
function inferBankFromAID(aid) {
  // AID prefix mapping — ครอบคลุมเท่าที่รู้
  // Production ควร table จริงๆ
  if (!aid) return null;
  if (aid.startsWith('A0000006')) return 'promptpay';
  return null;
}
