// js/auth.js
import { auth, isDemoMode } from '../firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Toast Notification helper
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${
      type === 'success' ? 'fa-circle-check' : 
      type === 'error' ? 'fa-circle-xmark' : 'fa-triangle-exclamation'
    }"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

// Check local storage for Demo Mode user
export function getDemoUser() {
  const user = localStorage.getItem('demo_user');
  return user ? JSON.parse(user) : null;
}

// Redirect helpers
function redirectTo(path) {
  const currentPath = window.location.pathname;
  if (!currentPath.endsWith(path)) {
    window.location.href = path;
  }
}

// Track Auth State and enforce redirect
export function initAuthProtection() {
  const isLoginPage = window.location.pathname.endsWith('login.html');

  // 1. Check Demo Mode First
  const localDemoUser = getDemoUser();
  if (localDemoUser) {
    if (isLoginPage) {
      redirectTo('index.html');
    }
    return;
  }

  // 2. If in Firebase Demo Mode but no local user is set
  if (isDemoMode) {
    if (!isLoginPage && !localDemoUser) {
      redirectTo('login.html');
    }
    return;
  }

  // 3. Official Firebase Auth check
  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (isLoginPage) {
        redirectTo('index.html');
      }
    } else {
      if (!isLoginPage) {
        redirectTo('login.html');
      }
    }
  });
}

// Initialize on page load
initAuthProtection();

// UI actions for login.html
document.addEventListener('DOMContentLoaded', () => {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  if (!isLoginPage) return;

  const tabLoginBtn = document.getElementById('tab-login-btn');
  const tabRegisterBtn = document.getElementById('tab-register-btn');
  const confirmPasswordGroup = document.getElementById('confirm-password-group');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const btnSubmit = document.getElementById('btn-submit');
  const authForm = document.getElementById('auth-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const googleBtn = document.getElementById('btn-google-login');
  const demoBtn = document.getElementById('btn-demo-login');

  let mode = 'login'; // or 'register'

  // Tab switching
  tabLoginBtn.addEventListener('click', () => {
    mode = 'login';
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    confirmPasswordGroup.style.display = 'none';
    confirmPasswordInput.removeAttribute('required');
    btnSubmit.querySelector('span').textContent = 'Đăng nhập';
    btnSubmit.querySelector('i').className = 'fa-solid fa-right-to-bracket';
  });

  tabRegisterBtn.addEventListener('click', () => {
    mode = 'register';
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    confirmPasswordGroup.style.display = 'block';
    confirmPasswordInput.setAttribute('required', 'true');
    btnSubmit.querySelector('span').textContent = 'Đăng ký';
    btnSubmit.querySelector('i').className = 'fa-solid fa-user-plus';
  });

  // Submit Handler
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode === 'register') {
      const confirmPassword = confirmPasswordInput.value;
      if (password !== confirmPassword) {
        showToast('Mật khẩu xác nhận không trùng khớp!', 'error');
        return;
      }
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="loader"></span> <span>Đang xử lý...</span>`;

    // Local Demo mode auth fallback
    if (isDemoMode) {
      setTimeout(() => {
        if (mode === 'login') {
          // Check if mock user matches (simple bypass)
          const mockUser = {
            uid: 'demo_user',
            email: email,
            displayName: email.split('@')[0],
            photoURL: `https://api.dicebear.com/7.x/adventurer/svg?seed=${email}`
          };
          localStorage.setItem('demo_user', JSON.stringify(mockUser));
          showToast('Đăng nhập Demo thành công!', 'success');
          setTimeout(() => redirectTo('index.html'), 1000);
        } else {
          showToast('Đăng ký Demo thành công! Vui lòng đăng nhập.', 'success');
          tabLoginBtn.click();
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = `<span>Đăng nhập</span> <i class="fa-solid fa-right-to-bracket"></i>`;
        }
      }, 800);
      return;
    }

    // Firebase Auth implementation
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Đăng nhập thành công!', 'success');
        setTimeout(() => redirectTo('index.html'), 1000);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast('Đăng ký tài khoản thành công! Tự động đăng nhập...', 'success');
        setTimeout(() => redirectTo('index.html'), 1000);
      }
    } catch (err) {
      console.error(err);
      let errorMsg = 'Đã có lỗi xảy ra. Vui lòng thử lại!';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = 'Email hoặc mật khẩu không chính xác!';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'Email này đã được sử dụng!';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'Mật khẩu phải dài ít nhất 6 ký tự!';
      }
      showToast(errorMsg, 'error');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<span>${mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</span> <i class="fa-solid ${mode === 'login' ? 'fa-right-to-bracket' : 'fa-user-plus'}"></i>`;
    }
  });

  // Google Sign-In Handler
  googleBtn.addEventListener('click', async () => {
    if (isDemoMode) {
      const mockUser = {
        uid: 'demo_user',
        email: 'google.demo@gmail.com',
        displayName: 'Google Demo User',
        photoURL: 'https://api.dicebear.com/7.x/adventurer/svg?seed=google'
      };
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      showToast('Đăng nhập Google Demo thành công!', 'success');
      setTimeout(() => redirectTo('index.html'), 1000);
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      showToast('Đăng nhập bằng Google thành công!', 'success');
      setTimeout(() => redirectTo('index.html'), 1000);
    } catch (err) {
      console.error(err);
      showToast('Không thể kết nối với Google: ' + err.message, 'error');
    }
  });

  // Demo Sign-In Handler
  demoBtn.addEventListener('click', () => {
    const mockUser = {
      uid: 'demo_user',
      email: 'student.demo@cutevocab.com',
      displayName: 'Học viên Chăm chỉ',
      photoURL: 'https://api.dicebear.com/7.x/adventurer/svg?seed=chimney'
    };
    localStorage.setItem('demo_user', JSON.stringify(mockUser));
    showToast('Bắt đầu dùng thử ngoại tuyến!', 'success');
    setTimeout(() => redirectTo('index.html'), 1000);
  });
});

// Logout Helper
export async function logoutUser() {
  localStorage.removeItem('demo_user');
  if (!isDemoMode) {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error", err);
    }
  }
  redirectTo('login.html');
}
