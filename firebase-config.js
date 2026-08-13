// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDage0ntjUOM0smtrZKJiBjWX-J_eBp1jw",
  authDomain: "learnenglishfirebase-9acc6.firebaseapp.com",
  projectId: "learnenglishfirebase-9acc6",
  storageBucket: "learnenglishfirebase-9acc6.firebasestorage.app",
  messagingSenderId: "901661444934",
  appId: "1:901661444934:web:2bd235bbdeb501cb127347",
  measurementId: "G-28WD2B0YQ9"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize & Export Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Firebase is now fully configured, so Demo mode defaults to false
export const isDemoMode = false;

// Enable Firestore offline caching for reliable mobile performance
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore offline cache disabled:", err.code);
});
