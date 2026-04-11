// Feed View — unified task queue
const Feed = {
  statusFilter: '',
  assigneeFilter: '',
  collapsed: {},
  _undoTimer: null,
  _undoId: null,

  init() {
    try {
      Feed.collapsed = JSON.parse(localStorage.getItem('feed_collapsed') || '{}');
    } catch (e) { Feed.collapsed = {}; }

    document.getElementById('add-task-btn').addEventListener('click', () => {
      Feed.showAddTaskModal();
    });

    document.getElementById('quick-list-btn').addEventListener('click', () => {
      Feed.showQuickListModal();
    });
  },

  async load() {
    const list = document.getElementById('feed-list');
    list.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    Feed.populateAssigneeFilter();

    let { data: tasks, error } = await sb.from('tasks')
      .select('*, assigned_user:users!tasks_assigned_to_fkey(name)')
      .neq('type', 'reimbursement')
      .neq('status', 'Done')
      .order('created_at', { ascending: false });

    if (error) {
      list.innerHTML = '<div class="empty-state"><p>Failed to load tasks</p></div>';
      return;
    }

    tasks = tasks || [];
    tasks.sort((a, b) => {
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      return 0;
    });

    Feed.render(list, tasks);
  },

  render(list, tasks) {
    const doCards = tasks.filter(t => t.type === 'do');
    const getCards = tasks.filter(t => t.type === 'get' && !Feed.isSimpleItem(t));
    const simpleGetItems = tasks.filter(t => t.type === 'get' && Feed.isSimpleItem(t));

    const doBody = doCards.length > 0
      ? doCards.map(t => Feed.renderCard(t)).join('')
      : '<div class="empty-state-sm">Nothing to do right now.</div>';

    const getBody = getCards.length > 0
      ? getCards.map(t => Feed.renderCard(t)).join('')
      : '<div class="empty-state-sm">Nothing to get right now.</div>';

    const shoppingBody = simpleGetItems.length > 0
      ? '<div class="checklist">' + simpleGetItems.map(t => Feed.renderCheckItem(t, false)).join('') + '</div>'
      : '<div class="empty-state-sm">Shopping list is empty.</div>';

    list.innerHTML = [
      Feed.renderSection('do', 'Need to Do', doBody),
      Feed.renderSection('get', 'Need to Get', getBody),
      Feed.renderSection('shopping', 'Shopping List', shoppingBody),
    ].join('');

    list.querySelectorAll('.feed-section-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.section;
        Feed.collapsed[key] = !Feed.collapsed[key];
        try { localStorage.setItem('feed_collapsed', JSON.stringify(Feed.collapsed)); } catch (e) {}
        const section = btn.closest('.feed-section');
        section.classList.toggle('collapsed', Feed.collapsed[key]);
        btn.setAttribute('aria-expanded', String(!Feed.collapsed[key]));
      });
    });

    list.querySelectorAll('.feed-section-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.type;
        if (type === 'shopping') Feed.showQuickListModal();
        else Feed.showAddTaskModal(type);
      });
    });

    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        Router.navigate('task-detail', card.dataset.id);
      });
    });

    list.querySelectorAll('.check-item').forEach(row => {
      const cb = row.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', () => {
        if (cb.checked) Feed.startAcquireTimer(row, row.dataset.id);
        else Feed.toggleGetItem(row.dataset.id, false);
      });
      const editBtn = row.querySelector('.check-edit');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Feed.showCheckItemEditModal(row.dataset.id);
        });
      }
    });
  },

  renderSection(key, label, body) {
    const isCollapsed = !!Feed.collapsed[key];
    const addType = key === 'shopping' ? 'shopping' : key;
    return `
      <div class="feed-section ${isCollapsed ? 'collapsed' : ''}" data-section="${key}">
        <div class="feed-section-header">
          <button type="button" class="feed-section-toggle" aria-expanded="${!isCollapsed}" data-section="${key}">
            <svg class="feed-section-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span>${label.toUpperCase()}</span>
          </button>
          <button type="button" class="feed-section-add" data-type="${addType}">Add</button>
        </div>
        <div class="feed-section-body">${body}</div>
      </div>
    `;
  },

  isSimpleItem(task) {
    return !task.description && !task.due_date && task.cost == null;
  },

  renderCheckItem(task, isDone) {
    return `
      <div class="check-item ${isDone ? 'checked' : ''}" data-id="${task.id}">
        <label class="check-box">
          <input type="checkbox" ${isDone ? 'checked' : ''}>
          <span class="check-mark"></span>
        </label>
        <span class="check-label">${escapeHtml(task.title)}</span>
        <button class="check-edit" aria-label="Edit item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
      </div>
    `;
  },

  startAcquireTimer(row, id) {
    // Cancel any existing timer
    Feed.cancelUndo();

    Feed._undoId = id;
    row.classList.add('acquiring');

    // Show undo toast
    const el = document.getElementById('toast');
    el.innerHTML = 'Marked as acquired <button class="undo-btn" onclick="Feed.cancelUndo(true)">Undo</button>';
    el.hidden = false;
    el.classList.add('show');

    Feed._undoTimer = setTimeout(async () => {
      Feed._undoTimer = null;
      Feed._undoId = null;
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 300);
      await sb.from('tasks')
        .update({ status: 'Done', updated_at: new Date().toISOString() })
        .eq('id', id);
      Feed.load();
    }, 3000);
  },

  cancelUndo(manual) {
    if (Feed._undoTimer) {
      clearTimeout(Feed._undoTimer);
      Feed._undoTimer = null;
    }
    if (Feed._undoId) {
      const row = document.querySelector(`.check-item[data-id="${Feed._undoId}"]`);
      if (row) {
        row.classList.remove('acquiring');
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = false;
      }
      Feed._undoId = null;
    }
    const el = document.getElementById('toast');
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 300);
    if (manual) toast('Undone');
  },

  async toggleGetItem(id, acquired) {
    const status = acquired ? 'Done' : 'Open';
    await sb.from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    Feed.load();
  },

  // ---- Reimbursement from acquired items ----

  showReimbursementModal() {
    // Get acquired items from the currently rendered list
    const doneItems = document.querySelectorAll('.check-item.checked');
    const ids = Array.from(doneItems).map(el => el.dataset.id);
    const names = Array.from(doneItems).map(el => el.querySelector('.check-label').textContent);

    if (ids.length === 0) { toast('No acquired items'); return; }

    const itemListHtml = names.map((n, i) =>
      `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:14px">
        <input type="checkbox" checked data-reimb-id="${ids[i]}" class="reimb-check">
        ${escapeHtml(n)}
      </label>`
    ).join('');

    showModal(`
      <h3 class="modal-title">Submit for Reimbursement</h3>
      <div class="form-group">
        <label>Select items</label>
        <div style="max-height:200px;overflow-y:auto">${itemListHtml}</div>
      </div>
      <div class="form-group">
        <label>Where purchased</label>
        <input type="text" id="modal-reimb-where" placeholder="e.g. Home Depot, Amazon">
      </div>
      <div class="form-group">
        <label>Purchased by</label>
        <select id="modal-reimb-who">
          <option value="">Select person</option>
          ${App.allUsers.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Total cost</label>
        <input type="number" id="modal-reimb-cost" placeholder="0.00" step="0.01">
      </div>
      <div class="photo-capture">
        <label for="reimb-receipt-photo" class="photo-capture-label">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
          <span>Photo of Receipt</span>
        </label>
        <input type="file" id="reimb-receipt-photo" accept="image/*" capture="environment" hidden>
        <img id="reimb-receipt-preview" hidden>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Feed.doSubmitReimbursement()">Submit</button>
      </div>
    `);

    // Photo preview
    setTimeout(() => {
      const input = document.getElementById('reimb-receipt-photo');
      if (input) {
        input.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          Feed._reimbReceiptFile = file;
          const preview = document.getElementById('reimb-receipt-preview');
          preview.src = URL.createObjectURL(file);
          preview.hidden = false;
          input.closest('.photo-capture').querySelector('.photo-capture-label').classList.add('has-photo');
        });
      }
    }, 50);
  },

  _reimbReceiptFile: null,

  async doSubmitReimbursement() {
    const checked = document.querySelectorAll('.reimb-check:checked');
    const ids = Array.from(checked).map(cb => cb.dataset.reimbId);
    if (ids.length === 0) { toast('Select at least one item'); return; }

    const where = document.getElementById('modal-reimb-where').value.trim();
    const who = document.getElementById('modal-reimb-who').value;
    const cost = document.getElementById('modal-reimb-cost').value;

    if (!cost || Number(cost) <= 0) { toast('Enter the total cost'); return; }

    let receiptUrl = null;
    if (Feed._reimbReceiptFile) {
      try {
        receiptUrl = await uploadPhoto('photos', Feed._reimbReceiptFile);
      } catch (e) {
        toast('Failed to upload receipt');
        return;
      }
    }

    // Get item names for the reimbursement title
    const names = Array.from(checked).map(cb => {
      const row = cb.closest('label');
      return row ? row.textContent.trim() : '';
    }).filter(n => n);

    const title = 'Reimbursement: ' + (names.length <= 3 ? names.join(', ') : names.slice(0, 3).join(', ') + ` +${names.length - 3} more`);
    const description = [
      where ? `Purchased at: ${where}` : null,
      `Items: ${names.join(', ')}`,
    ].filter(Boolean).join('\n');

    const { error } = await sb.from('tasks').insert({
      title,
      description,
      receipt_image_url: receiptUrl,
      cost: Number(cost),
      priority: 'HAVE',
      status: 'To Pay',
      type: 'reimbursement',
      created_by: who || App.profile?.id || null,
      assigned_to: who || null,
    });

    if (error) { toast('Failed to submit'); return; }

    // Remove acquired items from the list
    for (const id of ids) {
      await sb.from('tasks').delete().eq('id', id);
    }

    Feed._reimbReceiptFile = null;
    hideModal();
    toast('Reimbursement submitted');
    Feed.load();
  },

  renderCard(task) {
    const assignee = task.assigned_user?.name || 'Unassigned';
    const statusClass = task.status.toLowerCase().replace(/\s/g, '-');
    const badges = [];

    if (task.priority === 'HAVE') badges.push('<span class="badge badge-urgent">Urgent</span>');
    if (task.priority === 'WANT') badges.push('<span class="badge badge-backlog">Backlog</span>');
    if (task.is_blocked_by_purchase && task.type !== 'get') badges.push('<span class="badge badge-blocked">Needs Supply</span>');
    if (task.status !== 'Open') {
      badges.push(`<span class="badge badge-${statusClass}">${escapeHtml(task.status)}</span>`);
    }

    const costHtml = task.cost != null
      ? `<span class="text-sm text-muted">${formatCurrency(task.cost)}</span>`
      : '';

    const metaHtml = badges.length > 0 ? `<div class="card-meta">${badges.join('')}</div>` : '';

    return `
      <div class="card" data-id="${task.id}">
        <div class="card-header">
          <div class="card-title">${escapeHtml(task.title)}</div>
          ${costHtml}
        </div>
        ${metaHtml}
        ${task.description ? `<div class="card-body">${escapeHtml(task.description).slice(0, 100)}</div>` : ''}
        <div class="card-body text-sm" style="margin-top:4px">
          ${escapeHtml(assignee)}${task.due_date ? ' &middot; Due ' + formatDate(task.due_date) : ''}
        </div>
        ${task.photo_url ? `<img class="card-photo" src="${escapeHtml(task.photo_url)}" alt="" loading="lazy">` : ''}
      </div>
    `;
  },

  // ---- Modals ----

  async showCheckItemEditModal(id) {
    const { data: task } = await sb.from('tasks').select('*').eq('id', id).single();
    if (!task) { toast('Item not found'); return; }

    Feed._editId = id;

    showModal(`
      <h3 class="modal-title">Edit Item</h3>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="modal-edit-item-title" value="${escapeHtml(task.title)}">
      </div>
      <div class="form-group">
        <label>Notes / Links</label>
        <textarea id="modal-edit-item-desc" rows="3" placeholder="Notes, product URLs, options...">${escapeHtml(task.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Due Date</label>
        <input type="date" id="modal-edit-item-due" value="${task.due_date || ''}">
      </div>
      <div class="form-group">
        <label>Estimated Cost</label>
        <input type="number" id="modal-edit-item-cost" value="${task.cost ?? ''}" step="0.01" placeholder="0.00">
      </div>
      <p class="text-sm text-muted" style="margin-top:8px">
        Adding any of the above will move this item out of the simple checklist.
      </p>
      <div class="modal-actions">
        <button class="btn btn-danger" onclick="Feed.confirmDeleteCheckItem()">Delete</button>
        <button class="btn btn-primary" onclick="Feed.doSaveCheckItem()">Save</button>
      </div>
    `);
  },

  _editId: null,

  async doSaveCheckItem() {
    const id = Feed._editId;
    if (!id) return;

    const updates = {
      title: document.getElementById('modal-edit-item-title').value.trim(),
      description: document.getElementById('modal-edit-item-desc').value.trim() || null,
      due_date: document.getElementById('modal-edit-item-due').value || null,
      cost: document.getElementById('modal-edit-item-cost').value ? Number(document.getElementById('modal-edit-item-cost').value) : null,
      updated_at: new Date().toISOString(),
    };

    if (!updates.title) { toast('Title is required'); return; }

    const { error } = await sb.from('tasks').update(updates).eq('id', id);
    hideModal();
    if (error) { toast('Failed to save'); return; }
    toast('Item updated');
    Feed.load();
  },

  confirmDeleteCheckItem() {
    const id = Feed._editId;
    if (!id) return;
    const title = document.getElementById('modal-edit-item-title').value.trim();

    showModal(`
      <h3 class="modal-title">Delete Item?</h3>
      <p style="font-size:14px;color:var(--text-muted);line-height:1.5">
        This will permanently remove "${escapeHtml(title)}". This cannot be undone.
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-danger" onclick="Feed.doDeleteCheckItem('${id}')">Delete</button>
      </div>
    `);
  },

  async doDeleteCheckItem(id) {
    const { error } = await sb.from('tasks').delete().eq('id', id);
    hideModal();
    if (error) { toast('Failed to delete'); return; }
    toast('Item deleted');
    Feed.load();
  },

  showQuickListModal() {
    showModal(`
      <h3 class="modal-title">Quick Shopping List</h3>
      <div class="form-group">
        <label>One item per line</label>
        <textarea id="modal-quick-list" rows="8" placeholder="Paper towels\nTrash bags\nDish soap\nLight bulbs"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Feed.doCreateQuickList()">Add All</button>
      </div>
    `);
    setTimeout(() => document.getElementById('modal-quick-list')?.focus(), 100);
  },

  async doCreateQuickList() {
    const raw = document.getElementById('modal-quick-list').value;
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) { toast('Enter at least one item'); return; }

    const rows = lines.map(title => ({
      title,
      type: 'get',
      priority: 'NORMAL',
      status: 'Open',
      is_blocked_by_purchase: true,
      created_by: App.profile?.id || null,
    }));

    const { error } = await sb.from('tasks').insert(rows);
    hideModal();
    if (error) { toast('Failed to add items'); return; }
    toast(`${lines.length} item${lines.length > 1 ? 's' : ''} added`);
    Feed.load();
  },

  showAddTaskModal(initialType) {
    const userOpts = App.allUsers.map(u =>
      `<option value="${u.id}">${escapeHtml(u.name)}</option>`
    ).join('');

    const type = initialType === 'get' ? 'get' : 'do';
    const isGet = type === 'get';
    Feed._modalType = type;
    Feed._modalPriority = 'NORMAL';

    showModal(`
      <h3 class="modal-title">New Item</h3>
      <div class="form-group">
        <label>Type</label>
        <div class="priority-toggle" style="margin:0">
          <button type="button" class="priority-btn ${!isGet ? 'active' : ''}" data-modal-type="do" onclick="Feed.toggleModalType(this)">
            Need to Do
          </button>
          <button type="button" class="priority-btn ${isGet ? 'active' : ''}" data-modal-type="get" onclick="Feed.toggleModalType(this)">
            Need to Get
          </button>
        </div>
      </div>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="modal-task-title" placeholder="${isGet ? 'What needs to be bought?' : 'What needs to be done?'}">
      </div>
      <div class="form-group">
        <label>Description / Notes</label>
        <textarea id="modal-task-desc" rows="2" placeholder="Details, links, options (optional)"></textarea>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <div class="priority-toggle priority-3" style="margin:0">
          <button type="button" class="priority-btn" data-modal-priority="HAVE" onclick="Feed.toggleModalPriority(this)">
            <span class="priority-dot urgent"></span> Urgent
          </button>
          <button type="button" class="priority-btn" data-modal-priority="WANT" onclick="Feed.toggleModalPriority(this)">
            <span class="priority-dot later"></span> Backlog
          </button>
        </div>
      </div>
      <div class="form-group">
        <label>Assign To</label>
        <select id="modal-task-assignee">
          <option value="">Unassigned</option>
          ${userOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Due Date</label>
        <input type="date" id="modal-task-due">
      </div>
      <div class="form-group">
        <label>Estimated Cost</label>
        <input type="number" id="modal-task-cost" placeholder="0.00" step="0.01">
      </div>
      <div class="form-group" id="modal-task-blocked-group" style="display:${isGet ? 'none' : 'flex'};align-items:center;gap:10px">
        <label class="toggle" style="margin:0">
          <input type="checkbox" id="modal-task-blocked">
          <span class="toggle-slider"></span>
        </label>
        <span style="font-size:14px">Blocked by purchase</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Feed.doCreateTask()">Create</button>
      </div>
    `);
  },

  _modalType: 'do',
  _modalPriority: 'HAVE',

  toggleModalType(btn) {
    Feed._modalType = btn.dataset.modalType;
    btn.closest('.priority-toggle').querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const blockedGroup = document.getElementById('modal-task-blocked-group');
    if (blockedGroup) blockedGroup.style.display = Feed._modalType === 'get' ? 'none' : 'flex';
  },

  toggleModalPriority(btn) {
    const toggle = btn.closest('.priority-toggle');
    if (btn.classList.contains('active')) {
      // Deselect — back to normal
      btn.classList.remove('active');
      Feed._modalPriority = 'NORMAL';
    } else {
      toggle.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Feed._modalPriority = btn.dataset.modalPriority;
    }
  },

  async doCreateTask() {
    const title = document.getElementById('modal-task-title').value.trim();
    if (!title) { toast('Enter a title'); return; }

    const task = {
      title,
      description: document.getElementById('modal-task-desc').value.trim() || null,
      priority: Feed._modalPriority,
      status: 'Open',
      type: Feed._modalType,
      due_date: document.getElementById('modal-task-due').value || null,
      cost: document.getElementById('modal-task-cost').value ? Number(document.getElementById('modal-task-cost').value) : null,
      is_blocked_by_purchase: Feed._modalType === 'get' || document.getElementById('modal-task-blocked').checked,
      created_by: App.profile?.id || null,
      assigned_to: document.getElementById('modal-task-assignee').value || null,
    };

    const { error } = await sb.from('tasks').insert(task);
    hideModal();
    if (error) { toast('Failed to create: ' + error.message); return; }
    toast('Item created');
    Feed.load();
  },

  populateAssigneeFilter() {
    const sel = document.getElementById('feed-assignee-filter');
    const current = sel.value;
    sel.innerHTML = '<option value="">Everyone</option><option value="unassigned">Unassigned</option>';
    App.allUsers.forEach(u => {
      sel.innerHTML += `<option value="${u.id}">${escapeHtml(u.name)}</option>`;
    });
    sel.value = current;
  },
};

document.addEventListener('DOMContentLoaded', () => Feed.init());
