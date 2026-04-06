// Profile View
const Profile = {
  load() {
    const container = document.getElementById('profile-content');
    const p = App.profile;

    if (!p) {
      container.innerHTML = '<div class="empty-state"><p>No profile loaded</p></div>';
      return;
    }

    let html = `
      <div class="profile-name">${escapeHtml(p.name)}</div>
      <div class="profile-phone">${formatPhone(p.phone_number)}</div>
    `;

    // Quick links
    html += `
      <div style="margin-top:24px;display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-secondary btn-block" onclick="Router.navigate('reimburse')">Submit Expense</button>
        <button class="btn btn-secondary btn-block" onclick="Router.navigate('sms')">Compose Schedule SMS</button>
        <button class="btn btn-secondary btn-block" onclick="Profile.showAddTaskModal()">+ Create Task</button>
      </div>
    `;

    container.innerHTML = html;
  },

  showAddTaskModal() {
    const userOpts = App.allUsers.map(u =>
      `<option value="${u.id}">${escapeHtml(u.name)}</option>`
    ).join('');

    showModal(`
      <h3 class="modal-title">New Task</h3>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="modal-task-title" placeholder="What needs to be done?">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="modal-task-desc" rows="2" placeholder="Details (optional)"></textarea>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <select id="modal-task-priority">
          <option value="HAVE">Must Do (urgent)</option>
          <option value="WANT">Wish List</option>
        </select>
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
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <label class="toggle" style="margin:0">
          <input type="checkbox" id="modal-task-blocked">
          <span class="toggle-slider"></span>
        </label>
        <span style="font-size:14px">Needs supplies first</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Profile.doCreateTask()">Create</button>
      </div>
    `);
  },

  async doCreateTask() {
    const title = document.getElementById('modal-task-title').value.trim();
    if (!title) { toast('Enter a title'); return; }

    const task = {
      title,
      description: document.getElementById('modal-task-desc').value.trim() || null,
      priority: document.getElementById('modal-task-priority').value,
      status: 'Open',
      type: 'task',
      due_date: document.getElementById('modal-task-due').value || null,
      is_blocked_by_purchase: document.getElementById('modal-task-blocked').checked,
      created_by: App.profile?.id || null,
    };

    const assigneeEl = document.getElementById('modal-task-assignee');
    if (assigneeEl) task.assigned_to = assigneeEl.value || null;

    const { error } = await sb.from('tasks').insert(task);
    hideModal();
    if (error) { toast('Failed to create task'); return; }
    toast('Task created');
    Router.navigate('feed');
  },
};
