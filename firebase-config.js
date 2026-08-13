// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

// Initialize Firestore with modern, multi-tab persistent cache configuration
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const googleProvider = new GoogleAuthProvider();

// Initialize Analytics safely inside a try-catch to prevent adblockers from blocking initialization
let analyticsInstance = null;
try {
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    analyticsInstance = getAnalytics(app);
  }
} catch (err) {
  console.warn("Firebase Analytics could not be initialized (likely blocked by client browser or adblocker):", err.message);
}
export const analytics = analyticsInstance;

// Firebase is now fully configured, so Demo mode defaults to false
export const isDemoMode = false;
