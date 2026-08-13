import { auth, isDemoMode } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getUserWords, removeWordFromUserList, resetWordMastery, escapeHTML, getUserProfile } from './firestore.js';
import { logoutUser, showToast, getDemoUser } from './auth.js';

// Decoupled toast system receiver
window.addEventListener('app-toast', (e) => {
  showToast(e.detail.message, e.detail.type);
});

// Cache elements
const headerAvatar = document.getElementById('header-avatar');
const headerUsername = document.getElementById('header-username');
const btnLogout = document.getElementById('btn-logout');

const statTotalWords = document.getElementById('stat-total-words');
const statMasteredWords = document.getElementById('stat-mastered-words');
const statCompletionRate = document.getElementById('stat-completion-rate');

const searchFilter = document.getElementById('search-filter');
const typeFilter = document.getElementById('type-filter');
const sortFilter = document.getElementById('sort-filter');
const wordsListContainer = document.getElementById('words-list-container');

// State variables
let currentUser = null;
let savedWords = [];

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  setupUserSession();
  setupFilters();
});

// Setup User Session details
function setupUserSession() {
  const localUser = getDemoUser();
  if (localUser) {
    currentUser = localUser;
    updateUserHeader(localUser);
    loadDashboardData();
  } else if (!isDemoMode) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        updateUserHeader(user);
        loadDashboardData();
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

// Fetch user data and update metrics
async function loadDashboardData() {
  if (!currentUser) return;
  
  try {
    savedWords = await getUserWords(currentUser.uid);
    updateStatistics();
    renderWordsList();
    
    // Fetch profile and render 100-day attendance grid
    const profile = await getUserProfile(currentUser.uid);
    renderAttendanceGrid(profile);
  } catch (err) {
    console.error("Failed to load dashboard data:", err);
    showToast("Không thể tải danh sách từ vựng. Vui lòng thử lại!", "error");
  }
}

// Compute metrics
function updateStatistics() {
  const total = savedWords.length;
  const mastered = savedWords.filter(w => w.mastery === 100).length;
  
  // Calculate average completion rate
  let avgRate = 0;
  if (total > 0) {
    const sumMastery = savedWords.reduce((sum, w) => sum + (w.mastery || 0), 0);
    avgRate = Math.round(sumMastery / total);
  }

  statTotalWords.textContent = total;
  statMasteredWords.textContent = mastered;
  statCompletionRate.textContent = `${avgRate}%`;
}

// Setup sorting and filtering listeners (with search input debouncing)
function setupFilters() {
  let searchDebounceTimer = null;
  searchFilter.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderWordsList();
    }, 150);
  });
  typeFilter.addEventListener('change', renderWordsList);
  sortFilter.addEventListener('change', renderWordsList);
}

// Helper to convert Firestore timestamp / Date / Milliseconds to number
function getTimestampMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  const parsed = new Date(ts).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

// Main list render routine
function renderWordsList() {
  if (!savedWords || savedWords.length === 0) {
    renderEmptyState();
    return;
  }

  const query = searchFilter.value.trim().toLowerCase();
  const typeSelected = typeFilter.value;
  const sortBy = sortFilter.value;

  // 1. Filter
  let filtered = savedWords.filter(item => {
    // Text search
    const matchesSearch = item.word.toLowerCase().includes(query) || 
                          item.meaning.toLowerCase().includes(query);
    
    // Type Filter
    const matchesType = typeSelected === 'All' || item.type === typeSelected;

    return matchesSearch && matchesType;
  });

  if (filtered.length === 0) {
    wordsListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>Không tìm thấy từ nào phù hợp</h3>
        <p>Thử nhập từ khóa khác hoặc chỉnh bộ lọc loại từ.</p>
      </div>
    `;
    return;
  }

  // 2. Sort
  filtered.sort((a, b) => {
    if (sortBy === 'mastery-asc') {
      return (a.mastery || 0) - (b.mastery || 0);
    }
    if (sortBy === 'mastery-desc') {
      return (b.mastery || 0) - (a.mastery || 0);
    }
    if (sortBy === 'alphabet-asc') {
      return a.word.localeCompare(b.word);
    }
    if (sortBy === 'date-desc') {
      return getTimestampMs(b.last_practiced) - getTimestampMs(a.last_practiced);
    }
    return 0;
  });

  // 3. Render Grid of Cards
  const typeMap = {
    Noun: "Danh từ",
    Verb: "Động từ",
    Adjective: "Tính từ",
    Adverb: "Trạng từ",
    Other: "Khác"
  };

  const cardsHtml = filtered.map(item => {
    const mastery = item.mastery || 0;
    
    // Determine progress bar color code
    let barColorClass = "mastery-red";
    if (mastery >= 80) {
      barColorClass = "mastery-green";
    } else if (mastery >= 40) {
      barColorClass = "mastery-yellow";
    }

    const itemTypeLower = item.type ? item.type.toLowerCase() : 'other';
    const typeLabel = typeMap[item.type] || item.type || "Khác";

    // Escape dynamic strings to prevent XSS
    const escapedWord = escapeHTML(item.word);
    const escapedWordLower = escapeHTML(item.word.toLowerCase());
    const escapedTypeClass = escapeHTML(itemTypeLower);
    const escapedTypeLabel = escapeHTML(typeLabel);
    const escapedMeaning = escapeHTML(item.meaning);

    return `
      <div class="word-card" data-word="${escapedWord}">
        <div class="word-card-top">
          <div class="word-card-title">${escapedWordLower}</div>
          <span class="badge badge-${escapedTypeClass} badge-default">${escapedTypeLabel}</span>
        </div>
        <div class="word-card-meaning">${escapedMeaning}</div>
        
        <div class="word-card-mastery">
          <div class="mastery-bar-container">
            <span>Thành thạo:</span>
            <div class="mastery-bar">
              <div class="mastery-bar-fill ${barColorClass}" style="width: ${mastery}%"></div>
            </div>
            <span>${mastery}%</span>
          </div>
        </div>

        <div class="word-card-actions">
          <button class="btn-card-action btn-card-reset" title="Đặt lại tiến trình học">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
          <button class="btn-card-action btn-card-delete" title="Xóa từ này">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  wordsListContainer.innerHTML = `<div class="words-grid">${cardsHtml}</div>`;

  // Bind Actions to Cards
  const cardElements = wordsListContainer.querySelectorAll('.word-card');
  cardElements.forEach(card => {
    const wordText = card.getAttribute('data-word');
    
    const resetBtn = card.querySelector('.btn-card-reset');
    const deleteBtn = card.querySelector('.btn-card-delete');

    // Reset Mastery Action
    resetBtn.addEventListener('click', async () => {
      if (confirm(`Bạn có chắc muốn đặt lại mức độ thành thạo của từ "${wordText}" về 0% không?`)) {
        try {
          await resetWordMastery(currentUser.uid, wordText);
          showToast(`Đã đặt lại tiến độ từ "${wordText}".`, 'success');
          loadDashboardData();
        } catch (err) {
          showToast("Có lỗi xảy ra khi đặt lại tiến độ.", 'error');
        }
      }
    });

    // Delete Word Action
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`Bạn có chắc muốn xóa từ "${wordText}" ra khỏi sổ từ không?`)) {
        try {
          await removeWordFromUserList(currentUser.uid, wordText);
          showToast(`Đã xóa từ "${wordText}".`, 'success');
          loadDashboardData();
        } catch (err) {
          showToast("Xóa từ thất bại.", 'error');
        }
      }
    });
  });
}

function renderEmptyState() {
  wordsListContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📚</div>
      <h3>Chưa có từ vựng nào trong danh sách!</h3>
      <p style="margin-bottom: 20px;">Hãy quay lại trang chủ và tra cứu để thêm những từ vựng đầu tiên nhé.</p>
      <a href="index.html" class="btn btn-primary" style="max-width: 200px; margin: 0 auto; display: inline-flex;">
        <i class="fa-solid fa-magnifying-glass"></i> Bắt đầu học ngay
      </a>
    </div>
  `;
}

// 4. Render 100-Day Attendance Grid (GitHub style)
function renderAttendanceGrid(profile) {
  const gridContainer = document.getElementById('attendance-grid-container');
  const streakBadge = document.getElementById('attendance-streak-badge');
  
  if (!gridContainer || !streakBadge) return;
  
  gridContainer.innerHTML = '';
  
  let start = new Date();
  if (profile && profile.startDate) {
    const parts = profile.startDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      start = new Date(year, month, day);
    }
  }

  if (profile && profile.startDate && profile.attendanceDates) {
    profile.attendanceDates.forEach(dateStr => {
      let current = start;
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        current = new Date(year, month, day);
      }
      const diffTime = current - start;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays >= 1 && diffDays <= 100) {
        checkedDays.add(diffDays);
      }
    });
    
    completedDaysCount = checkedDays.size;
  }
  
  streakBadge.textContent = `Đã tích lũy: ${completedDaysCount}/100 ngày`;
  
  // Batch updates using DocumentFragment for maximum performance (avoids layout repaints)
  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'attendance-cell';
    if (checkedDays.has(i)) {
      cell.classList.add('checked');
    }
    cell.textContent = i;
    
    // Calculate calendar date for this Day cell index (i) safely, preventing timezone/DST bugs
    const cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (i - 1));
    const day = String(cellDate.getDate()).padStart(2, '0');
    const month = String(cellDate.getMonth() + 1).padStart(2, '0');
    const year = cellDate.getFullYear();
    const dateFormatted = `${day}/${month}/${year}`;
    
    const status = checkedDays.has(i) ? 'Đã điểm danh ✅' : 'Chưa điểm danh';
    cell.title = `Ngày ${i} (${dateFormatted}): ${status}`;
    
    fragment.appendChild(cell);
  }
  
  gridContainer.appendChild(fragment);
}
