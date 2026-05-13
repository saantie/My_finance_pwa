/* ===================================================================
   firebase.js — Google Sign-in + Selective Account Sharing
   ===================================================================
   - initFirebase()             : boot ครั้งเดียวตอน app start
   - signInWithGoogle()         : Google popup → { email, displayName, uid }
   - signOut()                  : Firebase signOut
   - getCurrentUser()           : sync getter, คืน null ถ้ายังไม่ sign in
   - onAuthStateChanged()       : listener เมื่อ auth state เปลี่ยน
   - pushSharedAccount()        : เขียน account doc ลง Firestore
   - updateSharedWith()         : อัปเดต shared_with array
   - pushTransaction()          : เขียน transaction ลง subcollection
   - softDeleteTransaction()    : soft delete ด้วย deleted_by field
   - subscribeSharedAccount()   : realtime listener กรอง soft-deleted
   - migrateAccountToCloud()    : batch write account + transactions
   =================================================================== */

import { FIREBASE_CONFIG } from './config.js';

const FB_CDN = 'https://www.gstatic.com/firebasejs/10.12.0';

let _app      = null;
let _auth     = null;
let _db       = null;
let _fbMod    = null;   // firebase-app exports
let _authMod  = null;   // firebase-auth exports
let _fsMod    = null;   // firebase-firestore exports
let _currentUser = null;


/* === Lazy-load Firebase SDK ==================================== */

async function loadSDK() {
  if (_fbMod && _authMod && _fsMod) return;
  try {
    [_fbMod, _authMod, _fsMod] = await Promise.all([
      import(`${FB_CDN}/firebase-app.js`),
      import(`${FB_CDN}/firebase-auth.js`),
      import(`${FB_CDN}/firebase-firestore.js`)
    ]);
  } catch (e) {
    console.error('[firebase] SDK load failed', e);
    throw e;
  }
}


/* === 1. initFirebase =========================================== */

export async function initFirebase() {
  try {
    await loadSDK();
    _app  = _fbMod.initializeApp(FIREBASE_CONFIG);
    _auth = _authMod.getAuth(_app);
    _db   = _fsMod.getFirestore(_app);

    // keep _currentUser in sync from the start
    _authMod.onAuthStateChanged(_auth, user => {
      _currentUser = user
        ? { email: user.email, displayName: user.displayName, uid: user.uid }
        : null;
    });
  } catch (e) {
    console.error('[firebase] initFirebase failed', e);
    throw e;
  }
}


/* === 2. signInWithGoogle ======================================= */

export async function signInWithGoogle() {
  try {
    const provider = new _authMod.GoogleAuthProvider();
    const result   = await _authMod.signInWithPopup(_auth, provider);
    const { email, displayName, uid } = result.user;
    _currentUser = { email, displayName, uid };
    return _currentUser;
  } catch (e) {
    console.error('[firebase] signInWithGoogle failed', e);
    throw e;
  }
}


/* === 3. signOut ================================================ */

export async function signOut() {
  try {
    await _authMod.signOut(_auth);
    _currentUser = null;
  } catch (e) {
    console.error('[firebase] signOut failed', e);
    throw e;
  }
}


/* === 4. getCurrentUser ========================================= */

export function getCurrentUser() {
  return _currentUser;
}


/* === 5. onAuthStateChanged ===================================== */

export function onAuthStateChanged(callback) {
  try {
    return _authMod.onAuthStateChanged(_auth, user => {
      callback(user
        ? { email: user.email, displayName: user.displayName, uid: user.uid }
        : null
      );
    });
  } catch (e) {
    console.error('[firebase] onAuthStateChanged failed', e);
    throw e;
  }
}


/* === 6. pushSharedAccount ====================================== */

export async function pushSharedAccount(account) {
  try {
    const ref = _fsMod.doc(_db, 'shared_accounts', account.id);
    await _fsMod.setDoc(ref, {
      id:           account.id,
      owner:        account.owner,
      shared_with:  account.shared_with ?? [],
      display_name: account.display_name,
      bank:         account.bank ?? null,
      type:         account.type ?? 'bank',
      threshold:    account.threshold ?? 0,
      created_at:   _fsMod.serverTimestamp()
    });
  } catch (e) {
    console.error('[firebase] pushSharedAccount failed', e);
    throw e;
  }
}


/* === 7. updateSharedWith ======================================= */

export async function updateSharedWith(accountId, emailsArray) {
  try {
    const ref = _fsMod.doc(_db, 'shared_accounts', accountId);
    await _fsMod.updateDoc(ref, { shared_with: emailsArray });
  } catch (e) {
    console.error('[firebase] updateSharedWith failed', e);
    throw e;
  }
}


/* === 8. pushTransaction ======================================== */

export async function pushTransaction(accountId, tx) {
  try {
    const ref = _fsMod.doc(
      _db, 'shared_accounts', accountId, 'transactions', tx.id
    );
    await _fsMod.setDoc(ref, tx);
  } catch (e) {
    console.error('[firebase] pushTransaction failed', e);
    throw e;
  }
}


/* === 9. softDeleteTransaction ================================== */

export async function softDeleteTransaction(accountId, txId, deletedByEmail) {
  try {
    const ref = _fsMod.doc(
      _db, 'shared_accounts', accountId, 'transactions', txId
    );
    await _fsMod.updateDoc(ref, {
      deleted_by: deletedByEmail,
      updatedAt:  _fsMod.serverTimestamp()
    });
  } catch (e) {
    console.error('[firebase] softDeleteTransaction failed', e);
    throw e;
  }
}


/* === 10. subscribeSharedAccount ================================ */

export function subscribeSharedAccount(accountId, callback) {
  try {
    const col = _fsMod.collection(
      _db, 'shared_accounts', accountId, 'transactions'
    );
    return _fsMod.onSnapshot(col, snapshot => {
      const txs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.deleted_by == null) txs.push(data);
      });
      callback(txs);
    }, e => {
      console.error('[firebase] subscribeSharedAccount snapshot error', e);
    });
  } catch (e) {
    console.error('[firebase] subscribeSharedAccount failed', e);
    throw e;
  }
}


/* === 11. migrateAccountToCloud ================================= */

export async function migrateAccountToCloud(account, transactions) {
  try {
    const batch = _fsMod.writeBatch(_db);

    // account document
    const accountRef = _fsMod.doc(_db, 'shared_accounts', account.id);
    batch.set(accountRef, {
      id:           account.id,
      owner:        account.owner,
      shared_with:  account.shared_with ?? [],
      display_name: account.display_name,
      bank:         account.bank ?? null,
      type:         account.type ?? 'bank',
      threshold:    account.threshold ?? 0,
      created_at:   _fsMod.serverTimestamp()
    });

    // transactions subcollection
    for (const tx of transactions) {
      const txRef = _fsMod.doc(
        _db, 'shared_accounts', account.id, 'transactions', tx.id
      );
      batch.set(txRef, tx);
    }

    await batch.commit();
  } catch (e) {
    console.error('[firebase] migrateAccountToCloud failed', e);
    throw e;
  }
}
