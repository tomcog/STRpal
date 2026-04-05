// Admin View — user management
const Admin = {
  async load() {
    if (!App.isAdmin()) {
      document.getElementById('admin-user-list').innerHTML = '<div class="empty-state"><p>Admin access required</p></div>';
      return;
    }

    const list = document.getElementById('admin-user-list');
    list.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    const { data: users, error } = await sb.from('users').select('*').order('name');
    if (error) {
      list.innerHTML = '<div class="empty-state"><p>Failed to load users</p></div>';
      return;
    }

    App.allUsers = users || [];

    if (!users || users.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No team members yet</p></div>';
      return;
    }

    list.innerHTML = users.map(u => Admin.renderUser(u)).join('');

    list.querySelectorAll('.admin-card').forEach(card => {
      card.addEventListener('click', () => {
        Admin.showEditModal(users.find(u => u.id === card.dataset.id));
      });
    });
  },

  renderUser(u) {
    const perms = [];
    if (u.is_admin) perms.push({ label: 'Admin', on: true });
    if (u.can_view_calendar) perms.push({ label: 'Calendar', on: true });
    if (u.can_manage_finances) perms.push({ label: 'Finances', on: true });
    if (u.can_assign_tasks) perms.push({ label: 'Assign', on: true });

    const chipsHtml = perms.map(p =>
      `<span class="perm-chip ${p.on ? 'on' : ''}">${p.label}</span>`
    ).join('');

    return `
      <div class="admin-card" data-id="${u.id}">
        <div class="admin-name">${escapeHtml(u.name)}</div>
        <div class="admin-phone">${escapeHtml(u.phone_number || 'No phone')}</div>
        <div class="admin-perms">${chipsHtml || '<span class="text-sm text-muted">Crew (basic access)</span>'}</div>
      </div>
    `;
  },

  showEditModal(user) {
    if (!user) return;

    showModal(`
      <h3 class="modal-title">Edit ${escapeHtml(user.name)}</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="modal-user-name" value="${escapeHtml(user.name)}">
      </div>
      <div class="form-group">
        <label>Phone Number</label>
        <input type="tel" id="modal-user-phone" value="${escapeHtml(user.phone_number || '')}">
      </div>

      <div class="detail-section-title" style="margin-top:16px">Permissions</div>

      <div class="perm-row">
        <span class="perm-label">Administrator</span>
        <label class="toggle">
          <input type="checkbox" id="modal-perm-admin" ${user.is_admin ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="perm-row">
        <span class="perm-label">View Calendar</span>
        <label class="toggle">
          <input type="checkbox" id="modal-perm-calendar" ${user.can_view_calendar ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="perm-row">
        <span class="perm-label">Manage Finances</span>
        <label class="toggle">
          <input type="checkbox" id="modal-perm-finances" ${user.can_manage_finances ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="perm-row">
        <span class="perm-label">Assign Tasks</span>
        <label class="toggle">
          <input type="checkbox" id="modal-perm-assign" ${user.can_assign_tasks ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Admin.doSaveUser('${user.id}')">Save</button>
      </div>
    `);
  },

  async doSaveUser(userId) {
    const updates = {
      name: document.getElementById('modal-user-name').value.trim(),
      phone_number: document.getElementById('modal-user-phone').value.trim() || null,
      is_admin: document.getElementById('modal-perm-admin').checked,
      can_view_calendar: document.getElementById('modal-perm-calendar').checked,
      can_manage_finances: document.getElementById('modal-perm-finances').checked,
      can_assign_tasks: document.getElementById('modal-perm-assign').checked,
    };

    if (!updates.name) { toast('Name is required'); return; }

    const { error } = await sb.from('users').update(updates).eq('id', userId);
    hideModal();
    if (error) { toast('Failed to save'); return; }

    // If editing own profile, refresh permissions
    if (userId === App.profile?.id) {
      Object.assign(App.profile, updates);
      App.applyPermissions();
    }

    toast('User updated');
    Admin.load();
  },

  init() {
    document.getElementById('add-user-btn').addEventListener('click', () => {
      Admin.showAddModal();
    });
  },

  showAddModal() {
    showModal(`
      <h3 class="modal-title">Add Team Member</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="modal-newuser-name" placeholder="Full name">
      </div>
      <div class="form-group">
        <label>Phone Number</label>
        <input type="tel" id="modal-newuser-phone" placeholder="+1 (555) 123-4567">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Admin.doAddUser()">Add</button>
      </div>
    `);
  },

  async doAddUser() {
    const name = document.getElementById('modal-newuser-name').value.trim();
    const phone = document.getElementById('modal-newuser-phone').value.trim();
    if (!name) { toast('Name is required'); return; }

    const { error } = await sb.from('users').insert({
      name,
      phone_number: phone || null,
      is_admin: false,
      can_view_calendar: false,
      can_manage_finances: false,
      can_assign_tasks: false,
    });

    hideModal();
    if (error) { toast('Failed to add user'); return; }
    toast('Team member added');
    Admin.load();
  },
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
