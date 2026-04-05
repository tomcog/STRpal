// Feed View — unified task queue
const Feed = {
  type: 'do',
  statusFilter: '',
  assigneeFilter: '',

  init() {
    document.getElementById('add-task-btn').addEventListener('click', () => {
      Feed.showAddTaskModal();
    });

    document.getElementById('quick-list-btn').addEventListener('click', () => {
      Feed.showQuickListModal();
    });

    // Tab switching
    document.querySelectorAll('.feed-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Feed.type = tab.dataset.type;
        Feed.load();
      });
    });

    // Filters
    document.getElementById('feed-status-filter').addEventListener('change', (e) => {
      Feed.statusFilter = e.target.value;
      Feed.load();
    });

    document.getElementById('feed-assignee-filter').addEventListener('change', (e) => {
      Feed.assigneeFilter = e.target.value;
      Feed.load();
    });
  },

  async load() {
    const list = document.getElementById('feed-list');
    list.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    // Show/hide filters and quick list button based on tab
    document.getElementById('feed-filters').style.display = Feed.type === 'do' ? 'flex' : 'none';
    document.getElementById('quick-list-btn').hidden = Feed.type !== 'get';

    Feed.populateAssigneeFilter();

    let query = sb.from('tasks')
      .select('*, assigned_user:users!tasks_assigned_to_fkey(name)')
      .eq('type', Feed.type)
      .order('created_at', { ascending: false });

    // For "do" tab, hide done items. For "get" tab, show all (so you can see checked-off items)
    if (Feed.type === 'do') {
      query = query.neq('status', 'Done');
    }

    if (Feed.statusFilter && Feed.type === 'do') {
      query = query.eq('status', Feed.statusFilter);
    }

    if (Feed.assigneeFilter === 'unassigned') {
      query = query.is('assigned_to', null);
    } else if (Feed.assigneeFilter) {
      query = query.eq('assigned_to', Feed.assigneeFilter);
    }

    const { data: tasks, error } = await query;

    if (error) {
      list.innerHTML = '<div class="empty-state"><p>Failed to load tasks</p></div>';
      return;
    }

    if (!tasks || tasks.length === 0) {
      const label = Feed.type === 'do' ? 'to-do' : 'shopping';
      list.innerHTML = `<div class="empty-state"><p>No ${label} items yet</p></div>`;
      return;
    }

    if (Feed.type === 'get') {
      Feed.renderChecklist(list, tasks);
    } else {
      list.innerHTML = tasks.map(t => Feed.renderCard(t)).join('');
      list.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
          Router.navigate('task-detail', card.dataset.id);
        });
      });
    }
  },

  // ---- "Need to Get" checklist rendering ----

  renderChecklist(list, tasks) {
    const pending = tasks.filter(t => t.status !== 'Done');
    const done = tasks.filter(t => t.status === 'Done');

    let html = '';

    if (pending.length > 0) {
      html += pending.map(t => Feed.renderCheckItem(t, false)).join('');
    }

    if (done.length > 0) {
      html += `<div class="checklist-done-header">${done.length} acquired</div>`;
      html += done.map(t => Feed.renderCheckItem(t, true)).join('');
    }

    list.innerHTML = html;

    // Checkbox handlers
    list.querySelectorAll('.check-item').forEach(row => {
      const cb = row.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', () => {
        Feed.toggleGetItem(row.dataset.id, cb.checked);
      });
      // Long-press / click on text goes to detail
      row.querySelector('.check-label').addEventListener('click', () => {
        Router.navigate('task-detail', row.dataset.id);
      });
    });
  },

  renderCheckItem(task, isDone) {
    return `
      <div class="check-item ${isDone ? 'checked' : ''}" data-id="${task.id}">
        <label class="check-box">
          <input type="checkbox" ${isDone ? 'checked' : ''}>
          <span class="check-mark"></span>
        </label>
        <span class="check-label">${escapeHtml(task.title)}</span>
        ${task.cost != null ? `<span class="check-cost">${formatCurrency(task.cost)}</span>` : ''}
      </div>
    `;
  },

  async toggleGetItem(id, acquired) {
    const status = acquired ? 'Done' : 'Open';
    await sb.from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    Feed.load();
  },

  // ---- "Need to Do" card rendering ----

  renderCard(task) {
    const assignee = task.assigned_user?.name || 'Unassigned';
    const statusClass = task.status.toLowerCase().replace(/\s/g, '-');
    const badges = [];

    if (task.priority === 'HAVE') badges.push('<span class="badge badge-urgent">Urgent</span>');
    if (task.is_blocked_by_purchase) badges.push('<span class="badge badge-blocked">Needs Supply</span>');
    badges.push(`<span class="badge badge-${statusClass}">${escapeHtml(task.status)}</span>`);

    const costHtml = task.cost != null
      ? `<span class="text-sm text-muted">${formatCurrency(task.cost)}</span>`
      : '';

    return `
      <div class="card" data-id="${task.id}">
        <div class="card-header">
          <div class="card-title">${escapeHtml(task.title)}</div>
          ${costHtml}
        </div>
        <div class="card-meta">${badges.join('')}</div>
        ${task.description ? `<div class="card-body">${escapeHtml(task.description).slice(0, 100)}</div>` : ''}
        <div class="card-body text-sm" style="margin-top:4px">
          ${escapeHtml(assignee)}${task.due_date ? ' &middot; Due ' + formatDate(task.due_date) : ''}
        </div>
        ${task.photo_url ? `<img class="card-photo" src="${escapeHtml(task.photo_url)}" alt="" loading="lazy">` : ''}
      </div>
    `;
  },

  // ---- Modals ----

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
      priority: 'HAVE',
      status: 'Open',
      is_blocked_by_purchase: true,
      created_by: App.profile?.id || null,
    }));

    const { error } = await sb.from('tasks').insert(rows);
    hideModal();
    if (error) { toast('Failed to add items'); return; }
    toast(`${lines.length} item${lines.length > 1 ? 's' : ''} added`);
    Feed.type = 'get';
    document.querySelectorAll('.feed-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === 'get');
    });
    Feed.load();
  },

  showAddTaskModal() {
    const userOpts = App.allUsers.map(u =>
      `<option value="${u.id}">${escapeHtml(u.name)}</option>`
    ).join('');

    const isGet = Feed.type === 'get';
    Feed._modalType = Feed.type;
    Feed._modalPriority = 'HAVE';

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
        <div class="priority-toggle" style="margin:0">
          <button type="button" class="priority-btn active" data-modal-priority="HAVE" onclick="Feed.toggleModalPriority(this)">
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
  },

  toggleModalPriority(btn) {
    Feed._modalPriority = btn.dataset.modalPriority;
    btn.closest('.priority-toggle').querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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
      is_blocked_by_purchase: Feed._modalType === 'get',
      created_by: App.profile?.id || null,
      assigned_to: document.getElementById('modal-task-assignee').value || null,
    };

    const { error } = await sb.from('tasks').insert(task);
    hideModal();
    if (error) { toast('Failed to create: ' + error.message); return; }
    toast('Item created');
    // Switch to the tab matching what was just created
    Feed.type = Feed._modalType;
    document.querySelectorAll('.feed-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === Feed.type);
    });
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
