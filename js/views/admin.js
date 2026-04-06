// Admin View — user management + reimbursements
const Admin = {
  async load() {
    await Promise.all([
      Admin.loadReimbursements(),
      Admin.loadUsers(),
    ]);
  },

  // ---- Reimbursements ----

  async loadReimbursements() {
    const container = document.getElementById('admin-reimbursements');

    const { data: reimbs } = await sb.from('tasks')
      .select('*, creator:users!tasks_created_by_fkey(name)')
      .eq('type', 'reimbursement')
      .order('created_at', { ascending: false });

    if (!reimbs || reimbs.length === 0) {
      container.innerHTML = '';
      return;
    }

    const pending = reimbs.filter(r => r.status !== 'Done');
    const paid = reimbs.filter(r => r.status === 'Done');

    let html = '<h2 class="view-heading">Reimbursements</h2>';

    if (pending.length > 0) {
      html += pending.map(r => Admin.renderReimbCard(r, false)).join('');
    }

    if (paid.length > 0) {
      html += `<div class="checklist-done-header"><span>${paid.length} paid</span></div>`;
      html += paid.map(r => Admin.renderReimbCard(r, true)).join('');
    }

    if (pending.length === 0 && paid.length === 0) {
      html += '<div class="empty-state"><p>No reimbursements</p></div>';
    }

    html += '<div style="height:24px"></div>';
    container.innerHTML = html;

    // Attach handlers
    container.querySelectorAll('.reimb-card').forEach(card => {
      card.addEventListener('click', () => {
        const r = reimbs.find(x => x.id === card.dataset.id);
        if (r) Admin.showReimbDetail(r);
      });
    });
  },

  renderReimbCard(r, isPaid) {
    const who = r.creator?.name || 'Unknown';
    const date = formatDate(r.created_at?.split('T')[0]);

    return `
      <div class="card reimb-card ${isPaid ? 'reimb-paid' : ''}" data-id="${r.id}" style="margin-bottom:8px">
        <div class="card-header">
          <div class="card-title">${escapeHtml(r.title)}</div>
          <span style="font-weight:700;color:${isPaid ? 'var(--success)' : 'var(--text)'}">${formatCurrency(r.cost)}</span>
        </div>
        <div class="card-meta">
          ${isPaid
            ? '<span class="badge badge-done">Paid</span>'
            : '<span class="badge badge-to-pay">To Pay</span>'}
        </div>
        <div class="card-body text-sm" style="margin-top:4px">
          ${escapeHtml(who)} &middot; ${date}
        </div>
        ${r.receipt_image_url ? '<div class="text-sm text-muted" style="margin-top:4px">Receipt attached</div>' : ''}
      </div>
    `;
  },

  showReimbDetail(r) {
    const who = r.creator?.name || 'Unknown';
    const isPaid = r.status === 'Done';

    let html = `
      <h3 class="modal-title">${escapeHtml(r.title)}</h3>
      <div class="detail-field">
        <span class="detail-field-label">Amount</span>
        <span class="detail-field-value">${formatCurrency(r.cost)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Submitted by</span>
        <span class="detail-field-value">${escapeHtml(who)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Date</span>
        <span class="detail-field-value">${formatDate(r.created_at?.split('T')[0])}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Status</span>
        <span class="detail-field-value" style="color:${isPaid ? 'var(--success)' : 'var(--warning)'}">${isPaid ? 'Paid' : 'To Pay'}</span>
      </div>
    `;

    if (r.description) {
      html += `<div style="margin-top:12px;font-size:14px;color:var(--text-muted);line-height:1.5;white-space:pre-wrap">${escapeHtml(r.description)}</div>`;
    }

    if (r.receipt_image_url) {
      html += `<img src="${escapeHtml(r.receipt_image_url)}" alt="Receipt" style="width:100%;border-radius:var(--radius-sm);margin-top:12px">`;
    }

    if (!isPaid) {
      html += `
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="hideModal()">Close</button>
          <button class="btn btn-primary" onclick="Admin.markPaid('${r.id}')">Mark as Paid</button>
        </div>
      `;
    } else {
      html += `<div class="modal-actions"><button class="btn btn-ghost btn-block" onclick="hideModal()">Close</button></div>`;
    }

    showModal(html);
  },

  async markPaid(id) {
    const { error } = await sb.from('tasks')
      .update({ status: 'Done', updated_at: new Date().toISOString() })
      .eq('id', id);
    hideModal();
    if (error) { toast('Failed to update'); return; }
    toast('Marked as paid');
    Admin.loadReimbursements();
  },

  // ---- Users ----

  async loadUsers() {
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
    if (u.can_view_inventory) perms.push({ label: 'Inventory', on: true });

    const chipsHtml = perms.map(p =>
      `<span class="perm-chip ${p.on ? 'on' : ''}">${p.label}</span>`
    ).join('');

    return `
      <div class="admin-card" data-id="${u.id}">
        <div class="admin-name">${escapeHtml(u.name)}</div>
        <div class="admin-phone">${formatPhone(u.phone_number) || 'No phone'}</div>
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
      <div class="perm-row">
        <span class="perm-label">View Inventory</span>
        <label class="toggle">
          <input type="checkbox" id="modal-perm-inventory" ${user.can_view_inventory ? 'checked' : ''}>
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
      can_view_inventory: document.getElementById('modal-perm-inventory').checked,
    };

    if (!updates.name) { toast('Name is required'); return; }

    const { error } = await sb.from('users').update(updates).eq('id', userId);
    hideModal();
    if (error) { toast('Failed to save'); return; }

    if (userId === App.profile?.id) {
      Object.assign(App.profile, updates);
    }

    toast('User updated');
    Admin.loadUsers();
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

      <div class="detail-section-title" style="margin-top:16px">Permissions</div>

      <div class="perm-row">
        <span class="perm-label">Administrator</span>
        <label class="toggle">
          <input type="checkbox" id="modal-new-perm-admin">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="perm-row">
        <span class="perm-label">View Calendar</span>
        <label class="toggle">
          <input type="checkbox" id="modal-new-perm-calendar">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="perm-row">
        <span class="perm-label">Manage Finances</span>
        <label class="toggle">
          <input type="checkbox" id="modal-new-perm-finances">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="perm-row">
        <span class="perm-label">Assign Tasks</span>
        <label class="toggle">
          <input type="checkbox" id="modal-new-perm-assign">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="perm-row">
        <span class="perm-label">View Inventory</span>
        <label class="toggle">
          <input type="checkbox" id="modal-new-perm-inventory">
          <span class="toggle-slider"></span>
        </label>
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
      is_admin: document.getElementById('modal-new-perm-admin').checked,
      can_view_calendar: document.getElementById('modal-new-perm-calendar').checked,
      can_manage_finances: document.getElementById('modal-new-perm-finances').checked,
      can_assign_tasks: document.getElementById('modal-new-perm-assign').checked,
      can_view_inventory: document.getElementById('modal-new-perm-inventory').checked,
    });

    hideModal();
    if (error) { toast('Failed to add user'); return; }
    toast('Team member added');
    Admin.loadUsers();
  },
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
