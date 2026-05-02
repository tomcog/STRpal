// Admin View — user management + reimbursements
const Admin = {
  collapsed: {},

  async load() {
    const DEFAULT_COLLAPSED = { vendors: true, team: true, completed: true };
    try {
      const stored = localStorage.getItem('admin_collapsed');
      Admin.collapsed = stored ? JSON.parse(stored) : { ...DEFAULT_COLLAPSED };
    } catch (e) { Admin.collapsed = { ...DEFAULT_COLLAPSED }; }
    await Promise.all([
      Admin.loadReimbursements(),
      Admin.loadVendors(),
      Admin.loadUsers(),
    ]);
  },

  // ---- Reimbursements ----

  async loadReimbursements() {
    const container = document.getElementById('admin-reimbursements');

    const { data: reimbs } = await sb.from('tasks')
      .select('*, creator:users!tasks_created_by_fkey(name), vendor:vendors!tasks_vendor_id_fkey(name, payment_methods)')
      .eq('type', 'reimbursement')
      .order('created_at', { ascending: false });

    if (!reimbs || reimbs.length === 0) {
      container.innerHTML = '';
      return;
    }

    const pending = reimbs.filter(r => r.status !== 'Done');
    const paid = reimbs.filter(r => r.status === 'Done');

    const pendingBody = pending.length > 0
      ? pending.map(r => Admin.renderReimbCard(r, false)).join('')
      : '<div class="empty-state-sm">No pending reimbursements</div>';

    const completedBody = paid.length > 0
      ? paid.map(r => Admin.renderReimbCard(r, true)).join('')
      : '<div class="empty-state-sm">No completed reimbursements</div>';

    const reimbCollapsed = !!Admin.collapsed.reimbursements;
    const completedCollapsed = !!Admin.collapsed.completed;

    container.innerHTML = `
      <div class="feed-section ${reimbCollapsed ? 'collapsed' : ''}" data-section="reimbursements">
        <div class="feed-section-header">
          <button type="button" class="feed-section-toggle" aria-expanded="${!reimbCollapsed}" data-section="reimbursements">
            <i data-lucide="chevron-down" class="feed-section-chevron icon-16"></i>
            <span>REIMBURSEMENTS</span>
          </button>
        </div>
        <div class="feed-section-body">${pendingBody}</div>
      </div>
      <div class="feed-section ${completedCollapsed ? 'collapsed' : ''}" data-section="completed">
        <div class="feed-section-header">
          <button type="button" class="feed-section-toggle" aria-expanded="${!completedCollapsed}" data-section="completed">
            <i data-lucide="chevron-down" class="feed-section-chevron icon-16"></i>
            <span>COMPLETED</span>
          </button>
          ${paid.length > 0 ? '<button type="button" class="feed-section-add" id="export-reimb-btn">Export</button>' : ''}
        </div>
        <div class="feed-section-body">${completedBody}</div>
      </div>
    `;

    // Card click handlers
    container.querySelectorAll('.reimb-card').forEach(card => {
      card.addEventListener('click', () => {
        const r = reimbs.find(x => x.id === card.dataset.id);
        if (r) Admin.showReimbDetail(r);
      });
    });

    // Export button
    const exportBtn = container.querySelector('#export-reimb-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Admin.exportReimbursements(paid);
      });
    }

    Admin._attachToggleHandlers(container);
  },

  exportReimbursements(paid) {
    const lines = ['REIMBURSEMENT REPORT', ''];
    let total = 0;

    const sorted = [...paid].sort((a, b) =>
      (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || '')
    );

    sorted.forEach(r => {
      const paidDate = r.updated_at ? r.updated_at.split('T')[0] : 'Unknown';
      const submittedDate = r.created_at ? r.created_at.split('T')[0] : 'Unknown';
      const who = r.creator?.name || 'Unknown';
      const items = Admin.parseReimbItems(r.description);
      const amount = Number(r.cost) || 0;
      total += amount;

      lines.push(`Date paid: ${paidDate}`);
      lines.push(`Submitted: ${submittedDate} by ${who}`);
      lines.push(`Amount: $${amount.toFixed(2)}`);
      if (items.length > 0) {
        lines.push('Items:');
        items.forEach(i => lines.push(`  - ${i}`));
      }
      lines.push('');
    });

    lines.push('---');
    lines.push(`Total: $${total.toFixed(2)} (${sorted.length} reimbursement${sorted.length !== 1 ? 's' : ''})`);

    const text = lines.join('\n');

    if (navigator.share) {
      navigator.share({ title: 'Reimbursement Report', text }).catch(() => {
        Admin._downloadReport(text);
      });
    } else {
      Admin._downloadReport(text);
    }
  },

  _downloadReport(text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reimbursement-report.txt';
    a.click();
    URL.revokeObjectURL(url);
  },

  _attachToggleHandlers(container) {
    container.querySelectorAll('.feed-section-toggle').forEach(btn => {
      if (btn.dataset.toggleBound) return;
      btn.dataset.toggleBound = '1';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.section;
        Admin.collapsed[key] = !Admin.collapsed[key];
        try { localStorage.setItem('admin_collapsed', JSON.stringify(Admin.collapsed)); } catch (e2) {}
        const section = btn.closest('.feed-section');
        section.classList.toggle('collapsed', Admin.collapsed[key]);
        btn.setAttribute('aria-expanded', String(!Admin.collapsed[key]));
      });
    });
  },

  renderReimbCard(r, isPaid) {
    if (isPaid) {
      const paidDate = r.updated_at ? formatDate(r.updated_at.split('T')[0]) : '';
      return `
        <div class="reimb-chip reimb-card" data-id="${r.id}">
          <span class="reimb-chip-label">${paidDate ? escapeHtml(paidDate) + ' — ' : ''}Reimbursement</span>
          <span class="reimb-chip-amount">${formatCurrency(r.cost)}</span>
        </div>
      `;
    }

    const who = r.vendor?.name || r.creator?.name || 'Unknown';
    const date = formatDate(r.created_at?.split('T')[0]);
    const badges = ['<span class="badge badge-to-pay">To Pay</span>'];
    if (r.due_date) {
      const today = new Date().toISOString().split('T')[0];
      const overdue = r.due_date < today;
      badges.push(`<span class="badge ${overdue ? 'badge-urgent' : 'badge-blocked'}">Due ${formatDate(r.due_date)}</span>`);
    }

    return `
      <div class="card reimb-card" data-id="${r.id}" style="margin-bottom:8px">
        <div class="card-header">
          <div class="card-title">${r.vendor?.name ? escapeHtml(r.vendor.name) : 'Reimbursement'}</div>
          <span style="font-weight:700;color:var(--text)">${formatCurrency(r.cost)}</span>
        </div>
        <div class="card-meta">${badges.join('')}</div>
        <div class="card-body text-sm" style="margin-top:4px">
          ${escapeHtml(who)} &middot; Submitted ${date}
        </div>
        ${r.receipt_image_url ? '<div class="text-sm text-muted" style="margin-top:4px">Receipt attached</div>' : ''}
      </div>
    `;
  },

  parseReimbItems(description) {
    if (!description) return [];
    const match = description.match(/Items:\s*(.+)/);
    if (!match) return [];
    return match[1].split(',').map(s => s.trim()).filter(Boolean);
  },

  showReimbDetail(r) {
    const who = r.creator?.name || 'Unknown';
    const isPaid = r.status === 'Done';
    const items = Admin.parseReimbItems(r.description);
    const purchasedAt = r.description?.match(/Purchased at:\s*(.+)/)?.[1]?.trim();
    const vendorMethods = Array.isArray(r.vendor?.payment_methods) ? r.vendor.payment_methods : [];

    let html = `<h3 class="modal-title">Reimbursement</h3>`;

    html += `<div class="detail-field">
      <span class="detail-field-label">Amount</span>
      <span class="detail-field-value" style="font-weight:700">${formatCurrency(r.cost)}</span>
    </div>`;

    if (items.length > 0) {
      html += `<div style="margin-top:12px">
        <div class="detail-section-title">Items</div>
        <ul style="margin:0;padding-left:20px;font-size:14px;color:var(--text);line-height:1.8">
          ${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (purchasedAt) {
      html += `<div class="detail-field" style="margin-top:12px">
        <span class="detail-field-label">Purchased at</span>
        <span class="detail-field-value">${escapeHtml(purchasedAt)}</span>
      </div>`;
    }

    if (r.vendor?.name) {
      html += `<div class="detail-field">
        <span class="detail-field-label">Vendor</span>
        <span class="detail-field-value">${escapeHtml(r.vendor.name)}</span>
      </div>`;
    }

    html += `<div class="detail-field">
      <span class="detail-field-label">Submitted by</span>
      <span class="detail-field-value">${escapeHtml(who)}</span>
    </div>`;

    html += `<div class="detail-field">
      <span class="detail-field-label">Submitted</span>
      <span class="detail-field-value">${formatDate(r.created_at?.split('T')[0])}</span>
    </div>`;

    if (!isPaid) {
      html += `<div class="form-group" style="margin-top:12px">
        <label>Pay by</label>
        <input type="date" id="modal-reimb-due" value="${escapeHtml(r.due_date || '')}">
      </div>`;
    } else if (r.due_date) {
      html += `<div class="detail-field">
        <span class="detail-field-label">Was due</span>
        <span class="detail-field-value">${formatDate(r.due_date)}</span>
      </div>`;
    }

    // Payment method — editable when unpaid, display when paid
    if (!isPaid) {
      if (vendorMethods.length > 0) {
        const selectedKey = r.payment_method ? Admin._paymentMethodKey(r.payment_method) : '';
        const opts = vendorMethods.map(m => {
          const key = Admin._paymentMethodKey(m);
          const selected = key === selectedKey ? 'selected' : '';
          return `<option value="${escapeHtml(key)}" ${selected}>${escapeHtml(Admin._paymentMethodLabel(m))}</option>`;
        }).join('');
        html += `<div class="form-group">
          <label>Pay with</label>
          <select id="modal-reimb-payment">
            <option value="">— Choose method —</option>
            ${opts}
          </select>
        </div>`;
      } else if (r.vendor?.name) {
        html += `<div class="text-sm text-muted" style="margin-top:8px">
          No payment methods on file for ${escapeHtml(r.vendor.name)}. Add one in the vendor settings.
        </div>`;
      }
    } else if (r.payment_method) {
      html += `<div class="detail-field">
        <span class="detail-field-label">Paid via</span>
        <span class="detail-field-value">${escapeHtml(Admin._paymentMethodLabel(r.payment_method))}</span>
      </div>`;
    }

    if (isPaid && r.updated_at) {
      html += `<div class="detail-field">
        <span class="detail-field-label">Reimbursed</span>
        <span class="detail-field-value" style="color:var(--success)">${formatDate(r.updated_at.split('T')[0])}</span>
      </div>`;
    }

    if (r.receipt_image_url) {
      html += isPdfUrl(r.receipt_image_url)
        ? `<a class="detail-pdf" href="${escapeHtml(r.receipt_image_url)}" target="_blank" rel="noopener" style="margin-top:12px">
            <i data-lucide="file-text" class="icon-20"></i>
            <span>View Receipt PDF</span>
          </a>`
        : `<img src="${escapeHtml(r.receipt_image_url)}" alt="Receipt" style="width:100%;border-radius:5px;margin-top:12px">`;
    }

    if (!isPaid) {
      html += `
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="Admin.saveReimbDue('${r.id}')">Save</button>
          <button class="btn btn-primary" onclick="Admin.markPaid('${r.id}')">Mark as Paid</button>
        </div>
      `;
    } else {
      html += `<div class="modal-actions"><button class="btn btn-ghost btn-block" onclick="hideModal()">Close</button></div>`;
    }

    Admin._editingReimb = r;
    showModal(html);
  },

  _editingReimb: null,

  _paymentMethodKey(m) {
    if (!m) return '';
    return `${m.type || ''}|${m.handle || ''}|${m.label || ''}`;
  },

  _resolveSelectedPaymentMethod() {
    const sel = document.getElementById('modal-reimb-payment');
    if (!sel || !sel.value) return null;
    const methods = Array.isArray(Admin._editingReimb?.vendor?.payment_methods)
      ? Admin._editingReimb.vendor.payment_methods
      : [];
    return methods.find(m => Admin._paymentMethodKey(m) === sel.value) || null;
  },

  async saveReimbDue(id) {
    const due = document.getElementById('modal-reimb-due').value || null;
    const updates = { due_date: due };
    const method = Admin._resolveSelectedPaymentMethod();
    if (method) updates.payment_method = method;
    else if (document.getElementById('modal-reimb-payment')) updates.payment_method = null;
    const { error } = await sb.from('tasks').update(updates).eq('id', id);
    hideModal();
    if (error) { toast('Failed to save'); return; }
    toast('Saved');
    Admin.loadReimbursements();
  },

  async markPaid(id) {
    const updates = { status: 'Done', updated_at: new Date().toISOString() };
    const method = Admin._resolveSelectedPaymentMethod();
    if (method) updates.payment_method = method;
    const { error } = await sb.from('tasks')
      .update(updates)
      .eq('id', id);
    hideModal();
    if (error) { toast('Failed to update'); return; }
    toast('Marked as paid');
    Admin.loadReimbursements();
  },

  // ---- Vendors ----

  _vendors: [],

  async loadVendors() {
    const container = document.getElementById('admin-vendors');
    const { data: vendors, error } = await sb.from('vendors').select('*').order('name');
    if (error) {
      container.innerHTML = '<div class="empty-state-sm">Failed to load vendors</div>';
      return;
    }
    Admin._vendors = vendors || [];

    const listHtml = Admin._vendors.length === 0
      ? '<div class="empty-state-sm">No vendors yet</div>'
      : `<div class="card-list">${Admin._vendors.map(v => Admin.renderVendor(v)).join('')}</div>`;

    const isCollapsed = !!Admin.collapsed.vendors;
    container.innerHTML = `
      <div class="feed-section ${isCollapsed ? 'collapsed' : ''}" data-section="vendors">
        <div class="feed-section-header">
          <button type="button" class="feed-section-toggle" aria-expanded="${!isCollapsed}" data-section="vendors">
            <i data-lucide="chevron-down" class="feed-section-chevron icon-16"></i>
            <span>VENDORS</span>
          </button>
        </div>
        <div class="feed-section-body">
          ${listHtml}
          <button id="add-vendor-btn" class="btn btn-secondary btn-block" style="margin-top:8px">+ Add Vendor</button>
        </div>
      </div>
    `;

    container.querySelectorAll('.admin-card').forEach(card => {
      card.addEventListener('click', () => {
        Admin.showVendorEditModal(Admin._vendors.find(v => v.id === card.dataset.id));
      });
    });
    container.querySelector('#add-vendor-btn').addEventListener('click', () => {
      Admin.showVendorAddModal();
    });

    Admin._attachToggleHandlers(container);
  },

  renderVendor(v) {
    const meta = [v.trade, formatPhone(v.phone_number)].filter(Boolean).join(' · ');
    const methods = Array.isArray(v.payment_methods) ? v.payment_methods : [];
    const methodChips = methods.length > 0
      ? `<div class="admin-perms" style="margin-top:4px">${methods.map(m =>
          `<span class="perm-chip on">${escapeHtml(Admin._paymentMethodLabel(m))}</span>`
        ).join('')}</div>`
      : '';
    return `
      <div class="admin-card" data-id="${v.id}">
        <div class="admin-name">${escapeHtml(v.name)}</div>
        ${meta ? `<div class="admin-phone">${escapeHtml(meta)}</div>` : ''}
        ${methodChips}
        ${v.notes ? `<div class="text-sm text-muted" style="margin-top:4px">${escapeHtml(v.notes)}</div>` : ''}
      </div>
    `;
  },

  _paymentMethodLabel(m) {
    if (!m) return '';
    const type = Admin._paymentTypeOptions.find(t => t.value === m.type);
    const typeLabel = type ? type.label : (m.type || '');
    if (m.label) return `${typeLabel}: ${m.label}`;
    if (m.handle) return `${typeLabel} ${m.handle}`;
    return typeLabel;
  },

  showVendorAddModal() {
    Admin._editPaymentMethods = [];
    showModal(Admin._renderVendorForm({ title: 'Add Vendor', onSave: 'Admin.doAddVendor()' }));
    Admin._renderPaymentMethodRows();
  },

  showVendorEditModal(v) {
    if (!v) return;
    Admin._editPaymentMethods = Array.isArray(v.payment_methods)
      ? v.payment_methods.map(m => ({ ...m }))
      : [];
    showModal(Admin._renderVendorForm({
      title: 'Edit Vendor',
      onSave: `Admin.doSaveVendor('${v.id}')`,
      onDelete: `Admin.doDeleteVendor('${v.id}')`,
      vendor: v,
    }));
    Admin._renderPaymentMethodRows();
  },

  _editPaymentMethods: [],

  _renderVendorForm({ title, onSave, onDelete, vendor }) {
    const v = vendor || {};
    const deleteBtn = onDelete
      ? `<button class="btn btn-ghost" onclick="${onDelete}">Delete</button>`
      : '';
    return `
      <h3 class="modal-title">${title}</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="modal-vendor-name" placeholder="Vendor / company name" value="${escapeHtml(v.name || '')}">
      </div>
      <div class="form-group">
        <label>Trade</label>
        <input type="text" id="modal-vendor-trade" placeholder="e.g. Plumber, Electrician" value="${escapeHtml(v.trade || '')}">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="tel" id="modal-vendor-phone" placeholder="+1 (555) 123-4567" value="${escapeHtml(v.phone_number || '')}">
      </div>
      <div class="form-group">
        <label>Payment Methods</label>
        <div id="modal-vendor-payment-methods"></div>
        <button type="button" class="btn btn-sm btn-ghost" onclick="Admin.addPaymentMethod()" style="margin-top:6px">+ Add payment method</button>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="modal-vendor-notes" rows="2" placeholder="Optional">${escapeHtml(v.notes || '')}</textarea>
      </div>
      <div class="modal-actions">
        ${deleteBtn}
        <button class="btn btn-primary" onclick="${onSave}">Save</button>
      </div>
    `;
  },

  _paymentTypeOptions: [
    { value: 'venmo',  label: 'Venmo',     placeholder: '@username' },
    { value: 'zelle',  label: 'Zelle',     placeholder: 'email or phone' },
    { value: 'paypal', label: 'PayPal',    placeholder: 'email' },
    { value: 'bank',   label: 'Bank / ACH', placeholder: 'e.g. Chase ****1234' },
    { value: 'check',  label: 'Check',     placeholder: 'Mail address (optional)' },
    { value: 'cash',   label: 'Cash',      placeholder: 'Notes (optional)' },
    { value: 'other',  label: 'Other',     placeholder: 'Details' },
  ],

  _renderPaymentMethodRows() {
    const container = document.getElementById('modal-vendor-payment-methods');
    if (!container) return;
    if (Admin._editPaymentMethods.length === 0) {
      container.innerHTML = '<div class="text-sm text-muted">No payment methods yet.</div>';
      return;
    }
    const typeOpts = Admin._paymentTypeOptions;
    container.innerHTML = Admin._editPaymentMethods.map((m, i) => {
      const selected = typeOpts.find(t => t.value === m.type) || typeOpts[0];
      const optsHtml = typeOpts.map(t =>
        `<option value="${t.value}" ${m.type === t.value ? 'selected' : ''}>${t.label}</option>`
      ).join('');
      return `
        <div class="pm-row" data-pm-i="${i}">
          <select data-pm-field="type">${optsHtml}</select>
          <input type="text" data-pm-field="handle" placeholder="${escapeHtml(selected.placeholder)}" value="${escapeHtml(m.handle || '')}">
          <button type="button" class="icon-btn" aria-label="Remove" onclick="Admin.removePaymentMethod(${i})">&times;</button>
          <input type="text" data-pm-field="label" placeholder="Label (optional)" value="${escapeHtml(m.label || '')}" style="grid-column:1 / -1">
        </div>
      `;
    }).join('');
    container.querySelectorAll('[data-pm-field]').forEach(input => {
      input.addEventListener('input', (e) => Admin._syncPaymentMethod(e));
      input.addEventListener('change', (e) => Admin._syncPaymentMethod(e));
    });
  },

  _syncPaymentMethod(e) {
    const row = e.target.closest('.pm-row');
    if (!row) return;
    const i = Number(row.dataset.pmI);
    const field = e.target.dataset.pmField;
    if (Admin._editPaymentMethods[i]) {
      Admin._editPaymentMethods[i][field] = e.target.value;
      if (field === 'type') Admin._renderPaymentMethodRows();
    }
  },

  addPaymentMethod() {
    Admin._editPaymentMethods.push({ type: 'venmo', handle: '', label: '' });
    Admin._renderPaymentMethodRows();
  },

  removePaymentMethod(i) {
    Admin._editPaymentMethods.splice(i, 1);
    Admin._renderPaymentMethodRows();
  },

  _collectPaymentMethods() {
    return Admin._editPaymentMethods
      .map(m => ({
        type: (m.type || '').trim(),
        handle: (m.handle || '').trim(),
        label: (m.label || '').trim(),
      }))
      .filter(m => m.type && (m.handle || m.type === 'check' || m.type === 'cash'));
  },

  async doAddVendor() {
    const name = document.getElementById('modal-vendor-name').value.trim();
    if (!name) { toast('Name is required'); return; }
    const { error } = await sb.from('vendors').insert({
      name,
      trade: document.getElementById('modal-vendor-trade').value.trim() || null,
      phone_number: document.getElementById('modal-vendor-phone').value.trim() || null,
      notes: document.getElementById('modal-vendor-notes').value.trim() || null,
      payment_methods: Admin._collectPaymentMethods(),
    });
    hideModal();
    if (error) { toast('Failed to add vendor'); return; }
    toast('Vendor added');
    Admin.loadVendors();
  },

  async doSaveVendor(id) {
    const name = document.getElementById('modal-vendor-name').value.trim();
    if (!name) { toast('Name is required'); return; }
    const { error } = await sb.from('vendors').update({
      name,
      trade: document.getElementById('modal-vendor-trade').value.trim() || null,
      phone_number: document.getElementById('modal-vendor-phone').value.trim() || null,
      notes: document.getElementById('modal-vendor-notes').value.trim() || null,
      payment_methods: Admin._collectPaymentMethods(),
    }).eq('id', id);
    hideModal();
    if (error) { toast('Failed to save'); return; }
    toast('Vendor updated');
    Admin.loadVendors();
  },

  async doDeleteVendor(id) {
    if (!confirm('Delete this vendor?')) return;
    const { error } = await sb.from('vendors').delete().eq('id', id);
    hideModal();
    if (error) { toast('Failed to delete'); return; }
    toast('Vendor deleted');
    Admin.loadVendors();
  },

  // ---- Users ----

  async loadUsers() {
    const container = document.getElementById('admin-team');
    container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    const { data: users, error } = await sb.from('users').select('*').order('name');
    if (error) {
      container.innerHTML = '<div class="empty-state"><p>Failed to load users</p></div>';
      return;
    }

    App.allUsers = users || [];

    const listHtml = (!users || users.length === 0)
      ? '<div class="empty-state-sm">No team members yet</div>'
      : `<div class="card-list">${users.map(u => Admin.renderUser(u)).join('')}</div>`;

    const addBtnHtml = `<button id="add-user-btn" class="btn btn-secondary btn-block" style="margin-top:8px">+ Add Team Member</button>`;

    const isCollapsed = !!Admin.collapsed.team;
    container.innerHTML = `
      <div class="feed-section ${isCollapsed ? 'collapsed' : ''}" data-section="team">
        <div class="feed-section-header">
          <button type="button" class="feed-section-toggle" aria-expanded="${!isCollapsed}" data-section="team">
            <i data-lucide="chevron-down" class="feed-section-chevron icon-16"></i>
            <span>TEAM MANAGEMENT</span>
          </button>
        </div>
        <div class="feed-section-body">
          ${listHtml}
          ${addBtnHtml}
        </div>
      </div>
    `;

    container.querySelectorAll('.admin-card').forEach(card => {
      card.addEventListener('click', () => {
        Admin.showEditModal(users.find(u => u.id === card.dataset.id));
      });
    });

    container.querySelector('#add-user-btn').addEventListener('click', () => {
      Admin.showAddModal();
    });

    Admin._attachToggleHandlers(container);
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

  init() {},

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
