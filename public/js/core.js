// ============================================================================
// PSH Core — shared client utilities loaded on every page
// ============================================================================
const PSH = (function () {
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[2]) : null;
  }

  async function api(path, { method = 'GET', body, isForm = false } = {}) {
    const headers = {};
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = getCookie('psh_csrf') || '';

    let res = await fetch('/api' + path, {
      method,
      headers,
      credentials: 'include',
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });

    if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/me') {
      const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (refreshed.ok) {
        res = await fetch('/api' + path, {
          method, headers, credentials: 'include',
          body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
        });
      }
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : null;
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Something went wrong.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(message, type = 'info') {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function money(n) {
    return 'Rs. ' + Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr + 'Z').getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(dateStr).toLocaleDateString();
  }

  let currentUser = null;
  async function loadUser() {
    try {
      const { user } = await api('/auth/me');
      currentUser = user;
    } catch (e) {
      currentUser = null;
    }
    renderUserUI();
    return currentUser;
  }

  async function refreshCartCount() {
    const el = document.getElementById('cart-count');
    if (!el) return;
    if (!currentUser) { el.style.display = 'none'; return; }
    try {
      const { items } = await api('/cart');
      const count = items.reduce((s, i) => s + i.quantity, 0);
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    } catch (e) { /* not logged in or empty */ }
  }

  function renderUserUI() {
    const guestEls = document.querySelectorAll('[data-guest-only]');
    const userEls = document.querySelectorAll('[data-user-only]');
    const nameEls = document.querySelectorAll('[data-user-name]');
    const dashLinkEls = document.querySelectorAll('[data-dash-link]');

    guestEls.forEach((el) => el.style.display = currentUser ? 'none' : '');
    userEls.forEach((el) => el.style.display = currentUser ? '' : 'none');
    if (currentUser) {
      nameEls.forEach((el) => el.textContent = currentUser.name);
      const dashPath = currentUser.role === 'super_admin' ? '/dashboard/admin' : currentUser.role === 'vendor' ? '/dashboard/vendor' : '/dashboard';
      dashLinkEls.forEach((el) => el.href = dashPath);
      refreshCartCount();
      loadNotifCount();
    }
  }

  async function loadNotifCount() {
    const el = document.getElementById('notif-count');
    if (!el || !currentUser) return;
    try {
      const { unreadCount } = await api('/notifications');
      el.textContent = unreadCount;
      el.style.display = unreadCount > 0 ? 'flex' : 'none';
    } catch (e) { /* ignore */ }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  function initUserMenu() {
    const btn = document.getElementById('user-menu-btn');
    const dropdown = document.getElementById('user-menu-dropdown');
    if (!btn || !dropdown) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('open'); });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  function initSearchBar() {
    const form = document.getElementById('site-search-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = form.querySelector('input').value.trim();
      window.location.href = '/shop' + (q ? `?q=${encodeURIComponent(q)}` : '');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initUserMenu();
    initSearchBar();
    loadUser();

    const newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = newsletterForm.querySelector('input');
        try {
          await api('/newsletter/subscribe', { method: 'POST', body: { email: input.value } });
          toast('Subscribed! Thanks for joining.', 'success');
          input.value = '';
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  });

  return { api, toast, money, escapeHtml, timeAgo, loadUser, getUser: () => currentUser, refreshCartCount, logout };
})();
