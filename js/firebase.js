/* ===================================================================
   firebase.js — Google Sign-in + Selective Account Sharing
   ===================================================================
   - initFirebase()             : boot ครั้งเดียวตอน app start
   - signInWithGoogle()         : Google popup → { email, displayName, uid, accessToken }
   - signOut()                  : Firebase signOut
   - getCurrentUser()           : sync getter, คืน null ถ้ายังไม่ sign in
   - getAccessToken()           : คืน OAuth access token หรือ null
   - onAuthStateChanged()       : listener เมื่อ auth state เปลี่ยน
   - pushSharedAccount()        : เขียน account doc ลง Firestore
   - updateSharedWith()         : อัปเดต shared_with array
   - pushTransaction()          : เขียน transaction ลง subcollection
   - softDeleteTransaction()    : soft delete ด้วย deleted_by field
   - subscribeSharedAccount()   : realtime listener กรอง soft-deleted
   - migrateAccountToCloud()    : batch write account + transactions
   =================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDoW_TmdkFbby9gHJTVye7pumuKsj3StxY",
  authDomain: "finance-diary-d9d5d.firebaseapp.com",
  projectId: "finance-diary-d9d5d",
  storageBucket: "finance-diary-d9d5d.firebasestorage.app",
  messagingSenderId: "1025954168396",
  appId: "1:1025954168396:web:1092fadb48530db6337ee9"
};

let _app         = null;
let _auth        = null;
let _db          = null;
let _currentUser = null;
let _accessToken = null;


/* === 1. initFirebase =========================================== */

export function initFirebase() {
  try {
    _app  = initializeApp(FIREBASE_CONFIG);
    _auth = getAuth(_app);
    _db   = getFirestore(_app);

    fbOnAuthStateChanged(_auth, user => {
      _currentUser = user
        ? { email: user.email, displayName: user.displayName, uid: user.uid }
        : null;
      if (!user) _accessToken = null;
    });
  } catch (e) {
    console.error('[firebase] initFirebase failed', e);
    throw e;
  }
}


/* === 2. signInWithGoogle ======================================= */

export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/generative-language');
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    const result = await signInWithPopup(_auth, provider);
    const { email, displayName, uid } = result.user;
    _accessToken = result._tokenResponse?.oauthAccessToken ?? null;
    _currentUser = { email, displayName, uid };
    return { email, displayName, uid, accessToken: _accessToken };
  } catch (e) {
    console.error('[firebase] signInWithGoogle failed', e);
    throw e;
  }
}


/* === 3. signOut ================================================ */

export async function signOut() {
  try {
    await fbSignOut(_auth);
    _currentUser = null;
    _accessToken = null;
  } catch (e) {
    console.error('[firebase] signOut failed', e);
    throw e;
  }
}


/* === 4. getCurrentUser ========================================= */

export function getCurrentUser() {
  return _currentUser;
}


/* === 5. getAccessToken ========================================= */

export function getAccessToken() {
  return _accessToken;
}


/* === 6. onAuthStateChanged ===================================== */

export function onAuthStateChanged(callback) {
  try {
    return fbOnAuthStateChanged(_auth, user => {
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


/* === 7. pushSharedAccount ====================================== */

export async function pushSharedAccount(account) {
  try {
    const ref = doc(_db, 'shared_accounts', account.id);
    await setDoc(ref, {
      id:           account.id,
      owner:        account.owner,
      shared_with:  account.shared_with ?? [],
      display_name: account.display_name,
      bank:         account.bank ?? null,
      type:         account.type ?? 'bank',
      threshold:    account.threshold ?? 0,
      created_at:   serverTimestamp()
    });
  } catch (e) {
    console.error('[firebase] pushSharedAccount failed', e);
    throw e;
  }
}


/* === 8. updateSharedWith ======================================= */

export async function updateSharedWith(accountId, emailsArray) {
  try {
    const ref = doc(_db, 'shared_accounts', accountId);
    await updateDoc(ref, { shared_with: emailsArray });
  } catch (e) {
    console.error('[firebase] updateSharedWith failed', e);
    throw e;
  }
}


/* === 9. pushTransaction ======================================== */

export async function pushTransaction(accountId, tx) {
  try {
    const ref = doc(_db, 'shared_accounts', accountId, 'transactions', tx.id);
    await setDoc(ref, tx);
  } catch (e) {
    console.error('[firebase] pushTransaction failed', e);
    throw e;
  }
}


/* === 10. softDeleteTransaction ================================= */

export async function softDeleteTransaction(accountId, txId, deletedByEmail) {
  try {
    const ref = doc(_db, 'shared_accounts', accountId, 'transactions', txId);
    await updateDoc(ref, {
      deleted_by: deletedByEmail,
      updatedAt:  serverTimestamp()
    });
  } catch (e) {
    console.error('[firebase] softDeleteTransaction failed', e);
    throw e;
  }
}


/* === 11. subscribeSharedAccount ================================ */

export function subscribeSharedAccount(accountId, callback) {
  try {
    const col = collection(_db, 'shared_accounts', accountId, 'transactions');
    return onSnapshot(col, snapshot => {
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


/* === 12. migrateAccountToCloud ================================= */

export async function migrateAccountToCloud(account, transactions) {
  try {
    const batch = writeBatch(_db);

    const accountRef = doc(_db, 'shared_accounts', account.id);
    batch.set(accountRef, {
      id:           account.id,
      owner:        account.owner,
      shared_with:  account.shared_with ?? [],
      display_name: account.display_name,
      bank:         account.bank ?? null,
      type:         account.type ?? 'bank',
      threshold:    account.threshold ?? 0,
      created_at:   serverTimestamp()
    });

    for (const tx of transactions) {
      const txRef = doc(_db, 'shared_accounts', account.id, 'transactions', tx.id);
      batch.set(txRef, tx);
    }

    await batch.commit();
  } catch (e) {
    console.error('[firebase] migrateAccountToCloud failed', e);
    throw e;
  }
}
