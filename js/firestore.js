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
  serverTimestamp 
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
    console.error("Error getting user words from Firestore:", err);
    throw err;
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
    return wordsMap[wordId];
  }

  try {
    const wordDocRef = doc(db, "users", uid, "words", wordId);
    await setDoc(wordDocRef, {
      ...wordData,
      last_practiced: serverTimestamp()
    });
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
    console.error("Error deleting word from Firestore:", err);
    throw err;
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
      return null;
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
    console.error("Error updating word progress in Firestore:", err);
    throw err;
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
    console.error("Error resetting word mastery:", err);
    throw err;
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
