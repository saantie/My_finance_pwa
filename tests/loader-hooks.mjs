/* ESM loader hooks — mock all https:// CDN imports (Firebase etc.)
   ครอบคลุมทุก named export ที่ firebase.js ต้องการ */

const FIREBASE_APP_STUB = `
export const initializeApp = () => ({});
export default {};
`;

const FIREBASE_AUTH_STUB = `
export const getAuth            = () => ({});
export class GoogleAuthProvider { static PROVIDER_ID = 'google.com'; }
export const signInWithPopup    = async () => ({ user: null });
export const signOut            = async () => {};
export const onAuthStateChanged = () => () => {};
export default {};
`;

const FIREBASE_FIRESTORE_STUB = `
export const getFirestore    = () => ({});
export const doc             = () => ({});
export const setDoc          = async () => {};
export const updateDoc       = async () => {};
export const deleteDoc       = async () => {};
export const collection      = () => ({});
export const onSnapshot      = () => () => {};
export const writeBatch      = () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} });
export const serverTimestamp = () => new Date();
export const query           = () => ({});
export const where           = () => ({});
export const addDoc          = async () => ({});
export const getDocs         = async () => ({ docs: [], forEach: () => {} });
export const getDoc          = async () => ({ exists: () => false, data: () => ({}) });
export default {};
`;

function stubFor(url) {
  if (url.includes('firebase-app'))       return FIREBASE_APP_STUB;
  if (url.includes('firebase-auth'))      return FIREBASE_AUTH_STUB;
  if (url.includes('firebase-firestore')) return FIREBASE_FIRESTORE_STUB;
  return 'export default {};';
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('https://')) {
    return { shortCircuit: true, url: specifier };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('https://')) {
    return { format: 'module', shortCircuit: true, source: stubFor(url) };
  }
  return nextLoad(url, context);
}
