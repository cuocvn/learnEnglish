// js/app.js
import { auth, isDemoMode } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getUserWords, addWordToUserList, updateWordProgress, syncLocalWordsToFirestore, escapeHTML } from './firestore.js';
import { logoutUser, showToast, getDemoUser } from './auth.js';

// Global state for aborting active fetch promises to prevent race conditions
let suggestionsAbortController = null;
let searchAbortController = null;

// Decoupled toast system receiver
window.addEventListener('app-toast', (e) => {
  showToast(e.detail.message, e.detail.type);
});

// Custom fetch helper that aborts on timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const signal = options.signal || controller.signal;
  
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }
  
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Cache elements
const tabSearch = document.getElementById('tab-search');
const tabPractice = document.getElementById('tab-practice');
const searchPanel = document.getElementById('search-panel');
const practicePanel = document.getElementById('practice-panel');
const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');
const suggestionsList = document.getElementById('suggestions-list');
const resultArea = document.getElementById('result-area');
const practiceCardContainer = document.getElementById('practice-card-container');
const headerAvatar = document.getElementById('header-avatar');
const headerUsername = document.getElementById('header-username');
const btnLogout = document.getElementById('btn-logout');

// State variables
let currentUser = null;
let savedWords = [];
let debounceTimer = null;
let currentPracticeWord = null;
let isCorrectingState = false;

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  setupUserSession();
  setupNavigation();
  setupSearchAndSuggestions();
  
  // Handle initial tab based on hash
  handleHashChange();
  
  // Listen for hash changes
  window.addEventListener('hashchange', handleHashChange);
});

function handleHashChange() {
  if (window.location.hash === '#practice') {
    switchTab('practice');
  } else {
    switchTab('search');
  }
}

// Setup User Session details
function setupUserSession() {
  const localUser = getDemoUser();
  if (localUser) {
    currentUser = localUser;
    updateUserHeader(localUser);
    loadUserWords();
  } else if (!isDemoMode) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        updateUserHeader(user);
        loadUserWords();
      } else {
        // Redirection handled by auth.js
      }
    });
  }

  btnLogout.addEventListener('click', () => {
    logoutUser();
  });
}

function updateUserHeader(user) {
  headerUsername.textContent = user.displayName || user.email.split('@')[0];
  if (user.photoURL) {
    headerAvatar.src = user.photoURL;
  } else {
    headerAvatar.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`;
  }
}

async function loadUserWords() {
  if (!currentUser) return;
  try {
    // Synchronize offline local storage words to Cloud Firestore if online
    if (!isDemoMode && currentUser.uid !== 'demo_user') {
      await syncLocalWordsToFirestore(currentUser.uid);
    }
    savedWords = await getUserWords(currentUser.uid);
  } catch (err) {
    console.error("Failed to load user words:", err);
  }
}

// Tab and Navigation switches
function setupNavigation() {
  // Navigation is driven naturally by URL hashes (#search, #practice)
  // and handled by handleHashChange via the hashchange event listener.
}

function switchTab(tabName) {
  if (tabName === 'search') {
    tabSearch.parentElement.classList.add('active');
    tabPractice.parentElement.classList.remove('active');
    searchPanel.classList.add('active');
    practicePanel.classList.remove('active');
  } else {
    tabPractice.parentElement.classList.add('active');
    tabSearch.parentElement.classList.remove('active');
    practicePanel.classList.add('active');
    searchPanel.classList.remove('active');
    startPracticeSession();
  }
}

// Auto-suggest and Search handlers
function setupSearchAndSuggestions() {
  // Input event for Suggestions with Debounce
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    if (!query) {
      suggestionsList.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);
  });

  // Hitting Enter triggers search
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) {
        performSearch(query);
      }
    }
  });

  // Search button click
  btnSearch.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      performSearch(query);
    }
  });

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
      suggestionsList.style.display = 'none';
    }
  });
}

// Fetch Autocomplete from Datamuse API (with AbortController and Timeout)
async function fetchSuggestions(query) {
  if (suggestionsAbortController) {
    suggestionsAbortController.abort();
  }
  suggestionsAbortController = new AbortController();
  const { signal } = suggestionsAbortController;

  try {
    const response = await fetchWithTimeout(`https://api.datamuse.com/sug?s=${encodeURIComponent(query)}`, { signal }, 4000);
    if (!response.ok) return;
    const data = await response.json();
    renderSuggestions(data.slice(0, 5)); // Limit to 5 suggestions
  } catch (err) {
    if (err.name === 'AbortError') return; // Cancelled
    console.error("Suggestions API error:", err);
  }
}

function renderSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    suggestionsList.style.display = 'none';
    return;
  }

  // Sanitize suggestion words to block XSS
  suggestionsList.innerHTML = suggestions.map(item => `
    <div class="suggestion-item" data-word="${escapeHTML(item.word)}">${escapeHTML(item.word)}</div>
  `).join('');

  suggestionsList.style.display = 'block';

  // Add click listener to items
  const items = suggestionsList.querySelectorAll('.suggestion-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      const selectedWord = item.getAttribute('data-word');
      searchInput.value = selectedWord;
      suggestionsList.style.display = 'none';
      performSearch(selectedWord);
    });
  });
}

// Main Search Trigger (with AbortController and Timeout error management)
async function performSearch(word) {
  suggestionsList.style.display = 'none';
  resultArea.innerHTML = `
    <div class="loading-container">
      <span class="loader"></span>
      <span style="margin-left: 15px; font-weight: 600; color: var(--text-muted);">Đang tìm kiếm...</span>
    </div>
  `;

  if (searchAbortController) {
    searchAbortController.abort();
  }
  searchAbortController = new AbortController();
  const { signal } = searchAbortController;

  try {
    // 1. Fetch Dictionary Details (8s timeout)
    let dictData = null;
    let isDictTimeout = false;
    try {
      const dictResponse = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal }, 8000);
      if (dictResponse.ok) {
        const responseData = await dictResponse.json();
        dictData = responseData[0];
      }
    } catch (e) {
      if (e.name === 'AbortError' && signal.aborted) return; // parent aborted
      isDictTimeout = e.name === 'AbortError';
      console.warn("Dictionary API failed or timed out:", e);
    }

    // 2. Fetch Vietnamese Translation (8s timeout)
    let viTranslation = "";
    let isTransTimeout = false;
    try {
      const transResponse = await fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(word)}`, { signal }, 8000);
      if (transResponse.ok) {
        const transData = await transResponse.json();
        viTranslation = transData[0][0][0];
      }
    } catch (e) {
      if (e.name === 'AbortError' && signal.aborted) return; // parent aborted
      isTransTimeout = e.name === 'AbortError';
      console.error("Translation API failed or timed out:", e);
    }

    // If both failed to get meaningful details
    if (!dictData && !viTranslation) {
      if (isDictTimeout || isTransTimeout) {
        showToast("Kết nối mạng yếu hoặc máy chủ dịch tạm thời gián đoạn. Vui lòng thử lại!", "error");
      }
      renderNotFoundError(word);
      return;
    }

    renderSearchResult(word, dictData, viTranslation);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error("Search routine failure:", err);
    renderNotFoundError(word);
  }
}

function renderNotFoundError(word) {
  resultArea.innerHTML = `
    <div class="result-card" style="text-align: center; padding: 40px 20px;">
      <i class="fa-solid fa-face-frown" style="font-size: 3rem; color: var(--danger-color); margin-bottom: 15px;"></i>
      <h3 style="margin-bottom: 10px;">Không tìm thấy từ "${word}"</h3>
      <p style="color: var(--text-muted);">Hãy kiểm tra lại chính tả hoặc thử một từ khác.</p>
    </div>
  `;
}

// Render the search results card
function renderSearchResult(word, dictData, viTranslation) {
  // Extract phonetic audio URL
  let audioUrl = "";
  let phoneticText = dictData ? dictData.phonetic : "";

  if (dictData && dictData.phonetics) {
    // Look for phonetic text
    if (!phoneticText) {
      const textPhonetic = dictData.phonetics.find(p => p.text);
      if (textPhonetic) phoneticText = textPhonetic.text;
    }
    // Look for non-empty audio link
    const audioPhonetic = dictData.phonetics.find(p => p.audio && p.audio.trim() !== "");
    if (audioPhonetic) {
      audioUrl = audioPhonetic.audio;
    }
  }

  // Pre-process part of speech tag
  let primaryType = "noun";
  if (dictData && dictData.meanings && dictData.meanings.length > 0) {
    primaryType = dictData.meanings[0].partOfSpeech.toLowerCase();
  }

  // Map parts of speech to Vietnamese tags
  const typeMap = {
    noun: "Danh từ",
    verb: "Động từ",
    adjective: "Tính từ",
    adverb: "Trạng từ",
    pronoun: "Đại từ",
    preposition: "Giới từ",
    conjunction: "Liên từ",
    interjection: "Thán từ"
  };
  const typeBadgeText = typeMap[primaryType] || primaryType;

  // Sanitize values to prevent XSS
  const escapedWord = escapeHTML(word.toLowerCase());
  const escapedPhonetic = escapeHTML(phoneticText || '');
  const escapedType = escapeHTML(primaryType);
  const escapedTypeBadgeText = escapeHTML(typeBadgeText);
  const escapedViTranslation = escapeHTML(viTranslation);

  // Prepare UI content
  let headerHtml = `
    <div class="word-info">
      <div class="result-word">${escapedWord}</div>
      <div class="phonetic-container">
        <span>${escapedPhonetic}</span>
        ${audioUrl ? `
          <button class="btn-audio" id="btn-play-audio" data-url="${escapeHTML(audioUrl)}" title="Nghe phát âm">
            <i class="fa-solid fa-volume-high"></i>
          </button>
        ` : ''}
      </div>
    </div>
    <div class="badge-container">
      <span class="badge badge-${escapedType} badge-default">${escapedTypeBadgeText}</span>
    </div>
  `;

  // Meaning details (English definitions)
  let meaningsHtml = "";
  if (dictData && dictData.meanings) {
    meaningsHtml = dictData.meanings.slice(0, 2).map(meaning => {
      const typeClass = meaning.partOfSpeech.toLowerCase();
      const viType = typeMap[typeClass] || meaning.partOfSpeech;
      const defs = meaning.definitions.slice(0, 2).map((def, idx) => `
        <div class="definition-item">
          <div class="definition-text">${idx + 1}. ${escapeHTML(def.definition)}</div>
          ${def.example ? `<div class="definition-example">e.g. "${escapeHTML(def.example)}"</div>` : ''}
        </div>
      `).join('');

      return `
        <div class="meaning-section">
          <div class="meaning-title">
            <i class="fa-solid fa-caret-right"></i>
            <span>${escapeHTML(viType)} (Definitions)</span>
          </div>
          ${defs}
        </div>
      `;
    }).join('');
  } else {
    // Translation fallback definition
    meaningsHtml = `
      <div class="meaning-section">
        <div class="meaning-title">
          <i class="fa-solid fa-caret-right"></i>
          <span>Định nghĩa</span>
        </div>
        <div class="definition-item">
          <div class="definition-text">Không có định nghĩa tiếng Anh. Bản dịch tự động có sẵn bên dưới.</div>
        </div>
      </div>
    `;
  }

  // Pre-construct the final card layout
  resultArea.innerHTML = `
    <div class="result-card">
      <div class="result-header">
        ${headerHtml}
      </div>
      
      <div class="result-body">
        ${meaningsHtml}
      </div>

      <!-- Add to list module -->
      <div class="add-list-card">
        <h4 style="margin-bottom: 12px; color: var(--primary-color); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-circle-plus"></i> Thêm từ này vào số tay học tập
        </h4>
        <form class="add-list-form" id="add-word-form">
          <div class="add-list-row">
            <div class="form-group">
              <label for="add-meaning">Nghĩa tiếng Việt</label>
              <input type="text" id="add-meaning" class="input-control" value="${escapedViTranslation}" required placeholder="Nghĩa tiếng Việt của từ">
            </div>
            
            <div class="form-group">
              <label for="add-type">Loại từ</label>
              <select id="add-type" class="input-control select-filter">
                <option value="Noun" ${escapedType === 'noun' ? 'selected' : ''}>Danh từ (Noun)</option>
                <option value="Verb" ${escapedType === 'verb' ? 'selected' : ''}>Động từ (Verb)</option>
                <option value="Adjective" ${escapedType === 'adjective' ? 'selected' : ''}>Tính từ (Adj)</option>
                <option value="Adverb" ${escapedType === 'adverb' ? 'selected' : ''}>Trạng từ (Adv)</option>
                <option value="Other" ${!['noun', 'verb', 'adjective', 'adverb'].includes(escapedType) ? 'selected' : ''}>Khác (Other)</option>
              </select>
            </div>
          </div>
          
          <button type="submit" class="btn btn-secondary btn-add-word" id="btn-add-word-submit">
            <i class="fa-solid fa-heart"></i> Lưu vào sổ từ
          </button>
        </form>
      </div>
    </div>
  `;

  // Bind Audio Action
  const playBtn = document.getElementById('btn-play-audio');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const url = playBtn.getAttribute('data-url');
      if (url) {
        // Fix potential protocol issues
        const fullUrl = url.startsWith('//') ? 'https:' + url : url;
        const audio = new Audio(fullUrl);
        audio.play().catch(e => {
          console.error("Audio playback error:", e);
          showToast("Không thể phát âm thanh của từ này.", "warning");
        });
      }
    });
  }

  // Bind Save word action
  const addForm = document.getElementById('add-word-form');
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast("Bạn cần đăng nhập để lưu từ vựng!", "error");
      return;
    }

    const saveBtn = document.getElementById('btn-add-word-submit');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="loader" style="width:16px; height:16px;"></span> Đang lưu...`;

    const vietnameseMeaning = document.getElementById('add-meaning').value.trim();
    const typeValue = document.getElementById('add-type').value;

    try {
      await addWordToUserList(currentUser.uid, {
        word: word,
        meaning: vietnameseMeaning,
        type: typeValue
      });
      showToast(`Đã lưu "${word}" vào danh sách học!`, 'success');
      
      // Update local state
      await loadUserWords();

      // Show success state on form
      saveBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã lưu thành công`;
      saveBtn.style.backgroundColor = 'var(--success-color)';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.style.backgroundColor = '';
        saveBtn.innerHTML = `<i class="fa-solid fa-heart"></i> Lưu vào sổ từ`;
      }, 2000);
      
    } catch (err) {
      showToast("Lưu từ thất bại. Vui lòng thử lại!", "error");
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fa-solid fa-heart"></i> Lưu vào sổ từ`;
    }
  });
}

// === PRACTICE MODE INTERFACE & LOGIC ===
async function startPracticeSession() {
  practiceCardContainer.innerHTML = `
    <div class="loading-container">
      <span class="loader"></span>
      <span style="margin-left: 15px; font-weight: 600; color: var(--text-muted);">Đang thiết lập bài học...</span>
    </div>
  `;

  // Fetch fresh words list
  await loadUserWords();

  if (!savedWords || savedWords.length === 0) {
    renderPracticeEmptyState();
    return;
  }

  // Choose a random word
  // Priority: word with mastery < 100
  let practicePool = savedWords.filter(w => w.mastery < 100);
  
  if (practicePool.length === 0) {
    // If all words are 100%, let them review all words
    practicePool = savedWords;
    showToast("Chúc mừng! Bạn đã hoàn thành tất cả từ vựng. Bắt đầu chế độ ôn tập nâng cao!", "info");
  }

  // Select random word
  const randomIndex = Math.floor(Math.random() * practicePool.length);
  currentPracticeWord = practicePool[randomIndex];
  isCorrectingState = false;

  renderPracticeCard(currentPracticeWord);
}

function renderPracticeEmptyState() {
  practiceCardContainer.innerHTML = `
    <div class="result-card" style="text-align: center; padding: 50px 20px;">
      <i class="fa-solid fa-folder-open" style="font-size: 3rem; color: var(--primary-light); margin-bottom: 20px;"></i>
      <h3>Sổ từ của bạn đang trống!</h3>
      <p style="color: var(--text-muted); margin-bottom: 20px;">Bạn cần tìm kiếm và lưu từ vựng trước khi có thể ôn tập.</p>
      <button class="btn btn-primary" style="max-width: 200px; margin: 0 auto;" id="btn-go-to-search">
        <i class="fa-solid fa-magnifying-glass"></i> Tra từ ngay
      </button>
    </div>
  `;

  document.getElementById('btn-go-to-search').addEventListener('click', () => {
    switchTab('search');
  });
}

function renderPracticeCard(wordObj) {
  const mastery = wordObj.mastery || 0;
  
  // Sanitize strings inside innerHTML template
  const escapedWord = escapeHTML(wordObj.word.toLowerCase());
  const escapedMeaning = escapeHTML(wordObj.meaning);
  const escapedType = escapeHTML(wordObj.type);

  practiceCardContainer.innerHTML = `
    <div class="practice-card" id="current-practice-card">
      <div class="practice-progress">
        <span>Từ: ${escapedWord}</span>
        <span>Thành thạo: ${mastery}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${mastery}%"></div>
      </div>

      <div class="practice-question-type">
        <i class="fa-solid fa-language"></i> Dịch sang Tiếng Anh
      </div>

      <div class="practice-prompt">${escapedMeaning}</div>
      <div class="practice-details">Loại từ: <strong>${escapedType}</strong></div>

      <form id="practice-form" autocomplete="off">
        <div class="practice-input-group">
          <input type="text" id="practice-input" class="input-control practice-input" placeholder="Nhập từ Tiếng Anh..." autofocus required>
        </div>

        <div class="practice-feedback" id="practice-feedback-text">
          <!-- Text feedback renders here -->
        </div>

        <div class="practice-actions">
          <button type="button" class="btn btn-outline" id="btn-practice-skip">Bỏ qua</button>
          <button type="submit" class="btn btn-primary" id="btn-practice-submit">Kiểm tra <i class="fa-solid fa-check"></i></button>
        </div>
      </form>

      <div class="mastery-stats-mini">
        <div class="mastery-mini-item" style="color: var(--success-color);">
          <i class="fa-solid fa-circle-check"></i> Đúng: <span id="mini-correct-count">${wordObj.correct_count || 0}</span>
        </div>
        <div class="mastery-mini-item" style="color: var(--danger-color);">
          <i class="fa-solid fa-circle-xmark"></i> Sai: <span id="mini-wrong-count">${wordObj.wrong_count || 0}</span>
        </div>
      </div>
    </div>
  `;

  // Auto focus input
  const inputEl = document.getElementById('practice-input');
  inputEl.focus();

  // Listeners
  const formEl = document.getElementById('practice-form');
  const skipBtn = document.getElementById('btn-practice-skip');

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    checkPracticeAnswer();
  });

  skipBtn.addEventListener('click', () => {
    startPracticeSession();
  });
}

// Verify User Answer
async function checkPracticeAnswer() {
  const inputEl = document.getElementById('practice-input');
  const feedbackEl = document.getElementById('practice-feedback-text');
  const cardEl = document.getElementById('current-practice-card');
  const submitBtn = document.getElementById('btn-practice-submit');

  const userAnswer = inputEl.value.trim().toLowerCase();
  const correctAnswer = currentPracticeWord.word.toLowerCase().trim();
  const escapedCorrectAnswer = escapeHTML(correctAnswer);

  // 1. IF IT IS A CORRECT ANSWER
  if (userAnswer === correctAnswer) {
    if (isCorrectingState) {
      // Retyped correctly after a wrong guess
      isCorrectingState = false;
      feedbackEl.innerHTML = `<span class="feedback-correct"><i class="fa-solid fa-face-smile"></i> Tuyệt vời! Bạn đã viết lại chính xác.</span>`;
      inputEl.disabled = true;
      submitBtn.disabled = true;
      
      setTimeout(() => {
        startPracticeSession();
      }, 1500);
      return;
    }

    // Normal correct answer
    feedbackEl.innerHTML = `<span class="feedback-correct"><i class="fa-solid fa-circle-check"></i> Chính xác! (+10% thành thạo) 🎉</span>`;
    inputEl.disabled = true;
    submitBtn.disabled = true;

    try {
      // Update db
      const updatedWord = await updateWordProgress(currentUser.uid, currentPracticeWord.word, true);
      
      // If reached 100% mastery, play confetti!
      if (updatedWord && updatedWord.mastery === 100 && currentPracticeWord.mastery < 100) {
        triggerConfettiCelebration(updatedWord.word);
      }

      // Update counters in layout
      document.getElementById('mini-correct-count').textContent = updatedWord.correct_count;
      document.querySelector('.progress-fill').style.width = `${updatedWord.mastery}%`;
      
      setTimeout(() => {
        startPracticeSession();
      }, 1500);

    } catch (err) {
      console.error(err);
      setTimeout(() => startPracticeSession(), 1500);
    }

  } else {
    // 2. INCORRECT ANSWER
    if (isCorrectingState) {
      // Failed to type correctly again during retype phase
      cardEl.classList.remove('shake');
      void cardEl.offsetWidth; // Trigger reflow to restart animation
      cardEl.classList.add('shake');
      
      inputEl.value = "";
      inputEl.focus();
      showToast("Vui lòng gõ chính xác đáp án gợi ý màu đỏ để tiếp tục!", "warning");
      return;
    }

    // First wrong guess
    isCorrectingState = true;
    cardEl.classList.add('shake');
    inputEl.value = "";
    inputEl.style.borderColor = 'var(--danger-color)';
    inputEl.focus();

    // Show correct answer and prompt retype
    feedbackEl.innerHTML = `
      <span class="feedback-wrong"><i class="fa-solid fa-circle-xmark"></i> Chưa đúng! (-10% thành thạo)</span>
      <span class="feedback-info">Đáp án đúng là: <strong style="color: var(--danger-color); font-size: 1.25rem;">${escapedCorrectAnswer}</strong></span>
      <span class="feedback-info" style="font-size:0.85rem;">(Vui lòng gõ lại từ trên để ghi nhớ)</span>
    `;

    try {
      const updatedWord = await updateWordProgress(currentUser.uid, currentPracticeWord.word, false);
      if (updatedWord) {
        document.getElementById('mini-wrong-count').textContent = updatedWord.wrong_count;
        document.querySelector('.progress-fill').style.width = `${updatedWord.mastery}%`;
      }
    } catch (err) {
      console.error("Failed to register wrong answer in database", err);
    }
  }
}

// Confetti Cannon celebration trigger (performance optimized, no loop thrashes)
function triggerConfettiCelebration(word) {
  showToast(`🥳 Chúc mừng! Bạn đã hoàn toàn làm chủ từ "${word.toUpperCase()}"!`, 'success');
  
  if (typeof confetti === 'function') {
    // Fire double burst confetti explosions instead of a 2s animation frame loop
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
    
    // Slight delayed burst for extra visual depth without blocking UI thread
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 }
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 }
      });
    }, 250);
  }
}
