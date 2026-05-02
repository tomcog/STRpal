// App Controller — no auth for now, full access
const App = {
  profile: null,
  allUsers: [],

  async init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Default profile — so the UI is usable even if the users query hangs.
    App.profile = {
      id: null,
      name: 'Admin',
      is_admin: true,
      can_view_calendar: true,
      can_manage_finances: true,
      can_assign_tasks: true,
    };

    // Bind nav immediately — don't let a slow/failed Supabase query block nav.
    Router.init();

    try {
      const { data: users } = await sb.from('users').select('*');
      App.allUsers = users || [];
      if (App.allUsers.length > 0) {
        App.profile = { ...App.allUsers[0] };
        App.profile.is_admin = true;
        App.profile.can_view_calendar = true;
        App.profile.can_manage_finances = true;
        App.profile.can_assign_tasks = true;
      }
    } catch (e) {
      console.error('users load failed', e);
    }

    if (typeof Notifications !== 'undefined') Notifications.init();
  },

  can(permission) {
    if (!App.profile) return false;
    return !!App.profile[permission];
  },

  isAdmin() {
    return App.can('is_admin');
  },

  isCrewOnly() {
    return false; // No restrictions for now
  },
};

// Utility functions
function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 300);
  }, duration);
}

function showModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  const headerTitle = document.getElementById('modal-header-title');
  const footer = document.getElementById('modal-footer');

  // Parse html into a temp container to extract title and actions
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Extract title
  const titleEl = tmp.querySelector('.modal-title');
  headerTitle.textContent = titleEl ? titleEl.textContent : '';
  if (titleEl) titleEl.remove();

  // Extract actions into footer
  const actionsEl = tmp.querySelector('.modal-actions');
  if (actionsEl) {
    footer.innerHTML = '';
    footer.appendChild(actionsEl);
    footer.style.display = '';
  } else {
    footer.style.display = 'none';
  }

  content.innerHTML = tmp.innerHTML;
  overlay.classList.add('open');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Handle 10-digit or 11-digit (with leading 1)
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}

function formatCurrency(val) {
  if (val == null) return '—';
  return '$' + Number(val).toFixed(2);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isPdfUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.pdf(\?.*)?$/i.test(url.trim());
}

// Lucide icon refresh — safe to call repeatedly.
let _iconRefreshScheduled = false;
function refreshIcons() {
  if (typeof lucide === 'undefined' || !lucide.createIcons) return;
  if (_iconRefreshScheduled) return;
  _iconRefreshScheduled = true;
  requestAnimationFrame(() => {
    _iconRefreshScheduled = false;
    lucide.createIcons();
  });
}

// Block pinch and double-tap zoom (iOS Safari ignores user-scalable=no since iOS 10)
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

let _lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - _lastTouchEnd <= 300) e.preventDefault();
  _lastTouchEnd = now;
}, { passive: false });

// Boot
document.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
  App.init();

  // Auto-convert any <i data-lucide="..."> that gets inserted anywhere in the app.
  const root = document.body;
  if (root) {
    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if ((n.hasAttribute && n.hasAttribute('data-lucide')) ||
              (n.querySelector && n.querySelector('[data-lucide]'))) {
            refreshIcons();
            return;
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }
});
