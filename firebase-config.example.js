/**
 * Copy this file to firebase-config.js and fill in your Firebase Web app values.
 * firebase-config.js is gitignored — never commit real keys if you treat them as secrets.
 * (Firebase Web apiKey is public-by-design; Security Rules protect data.)
 *
 * 1) Firebase Console → Project settings → Your apps → Web app → Config
 * 2) cp firebase-config.example.js firebase-config.js
 * 3) Replace the placeholders below
 * 4) Enable Authentication → Email/Password
 * 5) Deploy firestore.rules (see README)
 */
window.__FIREBASE_CONFIG__ = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
