// js/firestore.js
import { db, isDemoMode } from '../firebase-config.js';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// HTML Sanitization helper to prevent Stored XSS
export function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// === LOCAL STORAGE HELPER FOR DEMO MODE ===
function getLocalWords(uid) {
  const data = localStorage.getItem(`vocab_words_${uid}`);
  return data ? JSON.parse(data) : {};
}

function saveLocalWords(uid, wordsMap) {
  localStorage.setItem(`vocab_words_${uid}`, JSON.stringify(wordsMap));
}

// === DATABASE OPERATIONS ===

// 1. Get all words for a user
export async function getUserWords(uid) {
  if (isDemoMode || uid === 'demo_user') {
    const wordsMap = getLocalWords(uid);
    return Object.values(wordsMap);
  }

  try {
    const wordsRef = collection(db, "users", uid, "words");
    const querySnapshot = await getDocs(wordsRef);
    const words = [];
    querySnapshot.forEach((doc) => {
      words.push({ id: doc.id, ...doc.data() });
    });
    return words;
  } catch (err) {
    console.warn("Firestore error in getUserWords, falling back to LocalStorage:", err.message);
    const wordsMap = getLocalWords(uid);
    return Object.values(wordsMap);
  }
}

// 2. Add/Update a word in user's list
export async function addWordToUserList(uid, wordInfo) {
  const wordId = wordInfo.word.toLowerCase().trim();
  const timestamp = new Date();
  
  const wordData = {
    word: escapeHTML(wordInfo.word.trim()),
    meaning: escapeHTML(wordInfo.meaning.trim()),
    type: escapeHTML(wordInfo.type || 'Noun'),
    mastery: wordInfo.mastery !== undefined ? wordInfo.mastery : 0,
    correct_count: wordInfo.correct_count !== undefined ? wordInfo.correct_count : 0,
    wrong_count: wordInfo.wrong_count !== undefined ? wordInfo.wrong_count : 0,
    last_practiced: timestamp
  };

  if (isDemoMode || uid === 'demo_user') {
    const wordsMap = getLocalWords(uid);
    wordsMap[wordId] = { id: wordId, ...wordData };
    saveLocalWords(uid, wordsMap);
    try {
      await recordAttendance(uid);
    } catch (e) {
      console.warn("Failed to record local attendance:", e);
    }
    return wordsMap[wordId];
  }

  try {
    const wordDocRef = doc(db, "users", uid, "words", wordId);
    await setDoc(wordDocRef, {
      ...wordData,
      last_practiced: serverTimestamp()
    });
    try {
      await recordAttendance(uid);
    } catch (e) {
      console.warn("Failed to record firebase attendance:", e);
    }
    return { id: wordId, ...wordData };
  } catch (err) {
    console.error("Error adding word to Firestore:", err);
    throw err;
  }
}

// 3. Remove a word from user's list
export async function removeWordFromUserList(uid, word) {
  const wordId = word.toLowerCase().trim();

  if (isDemoMode || uid === 'demo_user') {
    const wordsMap = getLocalWords(uid);
    delete wordsMap[wordId];
    saveLocalWords(uid, wordsMap);
    return true;
  }

  try {
    const wordDocRef = doc(db, "users", uid, "words", wordId);
    await deleteDoc(wordDocRef);
    return true;
  } catch (err) {
    console.warn("Firestore error in removeWordFromUserList, falling back to LocalStorage:", err.message);
    const wordsMap = getLocalWords(uid);
    delete wordsMap[wordId];
    saveLocalWords(uid, wordsMap);
    return true;
  }
}

// 4. Update progress (Mastery algorithm)
export async function updateWordProgress(uid, word, isCorrect) {
  const wordId = word.toLowerCase().trim();
  const timestamp = new Date();

  if (isDemoMode || uid === 'demo_user') {
    const wordsMap = getLocalWords(uid);
    const wordItem = wordsMap[wordId];
    
    if (!wordItem) {
      console.warn("Word not found in local cache:", wordId);
      return null;
    }

    const currentMastery = wordItem.mastery || 0;
    const currentCorrect = wordItem.correct_count || 0;
    const currentWrong = wordItem.wrong_count || 0;

    let newMastery = isCorrect ? currentMastery + 10 : currentMastery - 10;
    newMastery = Math.max(0, Math.min(100, newMastery)); // Bounds: 0 to 100

    wordItem.mastery = newMastery;
    wordItem.correct_count = isCorrect ? currentCorrect + 1 : currentCorrect;
    wordItem.wrong_count = !isCorrect ? currentWrong + 1 : currentWrong;
    wordItem.last_practiced = timestamp;

    wordsMap[wordId] = wordItem;
    saveLocalWords(uid, wordsMap);
    return wordItem;
  }

  try {
    const wordDocRef = doc(db, "users", uid, "words", wordId);
    const docSnap = await getDoc(wordDocRef);
    
    if (!docSnap.exists()) {
      console.warn("Word doc not found in Firestore:", wordId);
      const wordsMap = getLocalWords(uid);
      const wordItem = wordsMap[wordId];
      if (!wordItem) return null;
      return wordItem;
    }

    const data = docSnap.data();
    const currentMastery = data.mastery || 0;
    const currentCorrect = data.correct_count || 0;
    const currentWrong = data.wrong_count || 0;

    let newMastery = isCorrect ? currentMastery + 10 : currentMastery - 10;
    newMastery = Math.max(0, Math.min(100, newMastery));

    const updates = {
      mastery: newMastery,
      correct_count: isCorrect ? currentCorrect + 1 : currentCorrect,
      wrong_count: !isCorrect ? currentWrong + 1 : currentWrong,
      last_practiced: serverTimestamp()
    };

    await updateDoc(wordDocRef, updates);
    return { id: wordId, ...data, ...updates, last_practiced: timestamp };
  } catch (err) {
    console.warn("Firestore error in updateWordProgress, falling back to LocalStorage:", err.message);
    const wordsMap = getLocalWords(uid);
    const wordItem = wordsMap[wordId];
    if (!wordItem) return null;

    const currentMastery = wordItem.mastery || 0;
    const currentCorrect = wordItem.correct_count || 0;
    const currentWrong = wordItem.wrong_count || 0;

    let newMastery = isCorrect ? currentMastery + 10 : currentMastery - 10;
    newMastery = Math.max(0, Math.min(100, newMastery));

    wordItem.mastery = newMastery;
    wordItem.correct_count = isCorrect ? currentCorrect + 1 : currentCorrect;
    wordItem.wrong_count = !isCorrect ? currentWrong + 1 : currentWrong;
    wordItem.last_practiced = timestamp;

    wordsMap[wordId] = wordItem;
    saveLocalWords(uid, wordsMap);
    return wordItem;
  }
}

// 5. Reset Mastery for a word
export async function resetWordMastery(uid, word) {
  const wordId = word.toLowerCase().trim();
  const timestamp = new Date();

  if (isDemoMode || uid === 'demo_user') {
    const wordsMap = getLocalWords(uid);
    if (wordsMap[wordId]) {
      wordsMap[wordId].mastery = 0;
      wordsMap[wordId].correct_count = 0;
      wordsMap[wordId].wrong_count = 0;
      wordsMap[wordId].last_practiced = timestamp;
      saveLocalWords(uid, wordsMap);
      return wordsMap[wordId];
    }
    return null;
  }

  try {
    const wordDocRef = doc(db, "users", uid, "words", wordId);
    const updates = {
      mastery: 0,
      correct_count: 0,
      wrong_count: 0,
      last_practiced: serverTimestamp()
    };
    await updateDoc(wordDocRef, updates);
    return updates;
  } catch (err) {
    console.warn("Firestore error in resetWordMastery, falling back to LocalStorage:", err.message);
    const wordsMap = getLocalWords(uid);
    if (wordsMap[wordId]) {
      wordsMap[wordId].mastery = 0;
      wordsMap[wordId].correct_count = 0;
      wordsMap[wordId].wrong_count = 0;
      wordsMap[wordId].last_practiced = timestamp;
      saveLocalWords(uid, wordsMap);
      return wordsMap[wordId];
    }
    return null;
  }
}

// 6. Sync Local Demo words to Firestore
export async function syncLocalWordsToFirestore(uid) {
  if (isDemoMode || !uid || uid === 'demo_user') return;

  const demoKeys = ['vocab_words_demo_user', 'vocab_words_local_user'];
  let mergedWords = {};

  for (const key of demoKeys) {
    const localData = localStorage.getItem(key);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        mergedWords = { ...mergedWords, ...parsed };
      } catch (err) {
        console.error("Failed to parse local offline words:", err);
      }
    }
  }

  const wordList = Object.values(mergedWords);
  if (wordList.length === 0) return;

  console.log(`Syncing ${wordList.length} local words to Firestore for user:`, uid);

  let syncCount = 0;
  for (const wordItem of wordList) {
    try {
      const wordId = wordItem.word.toLowerCase().trim();
      const wordDocRef = doc(db, "users", uid, "words", wordId);
      
      // Sanitise values while syncing just in case
      await setDoc(wordDocRef, {
        word: escapeHTML(wordItem.word.trim()),
        meaning: escapeHTML(wordItem.meaning.trim()),
        type: escapeHTML(wordItem.type || 'Noun'),
        mastery: wordItem.mastery || 0,
        correct_count: wordItem.correct_count || 0,
        wrong_count: wordItem.wrong_count || 0,
        last_practiced: serverTimestamp()
      });
      
      syncCount++;
    } catch (err) {
      console.error(`Failed to sync offline word "${wordItem.word}":`, err);
    }
  }

  if (syncCount > 0) {
    // Clear offline demo data so it doesn't trigger sync again
    for (const key of demoKeys) {
      localStorage.removeItem(key);
    }
    
    // Dispatch a CustomEvent to decouple toast notifications
    const event = new CustomEvent('app-toast', {
      detail: {
        message: `Đã đồng bộ thành công ${syncCount} từ vựng ngoại tuyến lên tài khoản Firebase! ☁️`,
        type: 'success'
      }
    });
    window.dispatchEvent(event);
  }
}

// 7. Record check-in attendance automatically when adding a word
export async function recordAttendance(uid) {
  if (!uid) return null;
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

  if (isDemoMode || uid === 'demo_user') {
    const profileKey = `vocab_profile_${uid}`;
    const profile = JSON.parse(localStorage.getItem(profileKey)) || {
      startDate: todayStr,
      attendanceDates: []
    };

    if (!profile.startDate) {
      profile.startDate = todayStr;
    }
    if (!profile.attendanceDates.includes(todayStr)) {
      profile.attendanceDates.push(todayStr);
    }
    localStorage.setItem(profileKey, JSON.stringify(profile));
    return profile;
  }

  try {
    const userDocRef = doc(db, "users", uid);
    const docSnap = await getDoc(userDocRef);
    
    const updates = {
      attendanceDates: arrayUnion(todayStr)
    };

    if (!docSnap.exists() || !docSnap.data().startDate) {
      updates.startDate = todayStr;
    }

    await setDoc(userDocRef, updates, { merge: true });
    return updates;
  } catch (err) {
    console.error("Error recording attendance in Firestore:", err);
    throw err;
  }
}

// 8. Fetch user profile (startDate and attendance dates list)
export async function getUserProfile(uid) {
  if (!uid) return null;
  const todayStr = new Date().toLocaleDateString('en-CA');

  if (isDemoMode || uid === 'demo_user') {
    const profileKey = `vocab_profile_${uid}`;
    let profile = JSON.parse(localStorage.getItem(profileKey));
    if (!profile) {
      profile = {
        startDate: todayStr,
        attendanceDates: []
      };
      localStorage.setItem(profileKey, JSON.stringify(profile));
    }
    return profile;
  }

  try {
    const userDocRef = doc(db, "users", uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        startDate: data.startDate || todayStr,
        attendanceDates: data.attendanceDates || []
      };
    } else {
      const defaultProfile = { startDate: todayStr, attendanceDates: [] };
      await setDoc(userDocRef, defaultProfile);
      return defaultProfile;
    }
  } catch (err) {
    console.error("Error getting user profile:", err);
    return { startDate: todayStr, attendanceDates: [] };
  }
}
