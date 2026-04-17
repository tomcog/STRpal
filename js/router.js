// Simple hash-based router
const Router = {
  currentView: 'feed',
  viewHistory: [],

  init() {
    // Bottom nav clicks
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) Router.navigate(view);
      });
    });

    // Profile button
    document.getElementById('profile-btn').addEventListener('click', () => {
      Router.navigate('profile');
    });

    // Handle hash
    window.addEventListener('hashchange', () => Router.handleHash());
    this.handleHash();
  },

  handleHash() {
    const hash = location.hash.slice(1) || 'feed';
    const [view, ...params] = hash.split('/');
    if (view === 'reimburse') { Router.navigate('report', 'invoice'); return; }
    Router.show(view, params.join('/'));
  },

  navigate(view, param) {
    const hash = param ? `${view}/${param}` : view;
    location.hash = hash;
  },

  back() {
    if (this.viewHistory.length > 0) {
      const prev = this.viewHistory.pop();
      location.hash = prev;
    } else {
      location.hash = 'feed';
    }
  },

  show(viewName, param) {
    // Store history (but not if same view)
    if (this.currentView !== viewName) {
      this.viewHistory.push(this.currentView);
      if (this.viewHistory.length > 20) this.viewHistory.shift();
    }

    this.currentView = viewName;

    // Hide all views, show target
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewEl = document.getElementById(`view-${viewName}`);
    if (viewEl) viewEl.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update title
    const titles = {
      feed: 'Tasks',
      report: 'Submit',
      calendar: 'Stayzzz',
      inventory: 'Inventory',
      admin: 'Admin',
      profile: 'Profile',
      'task-detail': 'Task',
      sms: 'Schedule',
    };
    document.getElementById('page-title').textContent = titles[viewName] || 'STRpal';

    // Fire view-specific load (isolated so a view error can't break navigation)
    try {
      if (viewName === 'feed') Feed.load();
      else if (viewName === 'task-detail' && param) TaskDetail.load(param);
      else if (viewName === 'calendar') Calendar.load();
      else if (viewName === 'inventory') Inventory.load();
      else if (viewName === 'admin') Admin.load();
      else if (viewName === 'profile') Profile.load();
      else if (viewName === 'sms') SMS.load();
      else if (viewName === 'report') Report.reset(param);
    } catch (e) {
      console.error(`view ${viewName} failed to load:`, e);
      toast('View failed to load — check console');
    }
  },
};
