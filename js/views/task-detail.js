// Task Detail View
const TaskDetail = {
  task: null,
  links: [],
  optionsList: null,

  async load(taskId) {
    const container = document.getElementById('task-detail-content');
    container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    const { data: task, error } = await sb.from('tasks')
      .select('*, assigned_user:users!tasks_assigned_to_fkey(name), rental:rentals!tasks_rental_id_fkey(guest_name, start_date, end_date)')
      .eq('id', taskId)
      .single();

    if (error || !task) {
      container.innerHTML = '<div class="empty-state"><p>Task not found</p></div>';
      return;
    }

    TaskDetail.task = task;

    const { data: links } = await sb.from('task_links').select('*').eq('task_id', taskId).order('created_at', { ascending: true });
    TaskDetail.links = links || [];
    TaskDetail.render();
  },

  render() {
    const t = TaskDetail.task;
    const container = document.getElementById('task-detail-content');
    const isFinance = App.can('can_manage_finances');
    const canAssign = App.can('can_assign_tasks');
    const statusClass = t.status.toLowerCase().replace(/\s/g, '-');

    let badges = `<span class="badge badge-${statusClass}">${escapeHtml(t.status)}</span>`;
    if (t.priority === 'HAVE') badges += '<span class="badge badge-urgent">Urgent</span>';
    if (t.priority === 'WANT') badges += '<span class="badge badge-backlog">Backlog</span>';
    if (t.is_blocked_by_purchase && t.type !== 'get') badges += '<span class="badge badge-blocked">Needs Supply</span>';
    if (t.service_type === 'provider' && t.type === 'do') badges += '<span class="badge badge-provider">Provider</span>';
    if (t.service_type === 'self' && t.type === 'do') badges += '<span class="badge badge-self">Self-service</span>';
    if (t.type === 'reimbursement') badges += '<span class="badge badge-reimbursement">Reimbursement</span>';

    let html = `
      <button class="detail-back" onclick="Router.back()">&larr; Back</button>
      <h2 class="detail-title">${escapeHtml(t.title)}</h2>
      <div class="detail-badges">${badges}</div>
    `;

    if (t.photo_url) {
      html += `<img class="detail-photo" src="${escapeHtml(t.photo_url)}" alt="Task photo">`;
    }

    if (t.description) {
      html += `<div class="detail-section">
        <div class="detail-section-title">Description</div>
        <p style="font-size:14px;line-height:1.5;color:var(--text-muted)">${escapeHtml(t.description)}</p>
      </div>`;
    }

    // Fields
    html += '<div class="detail-section">';
    html += '<div class="detail-section-title">Details</div>';

    html += `<div class="detail-field">
      <span class="detail-field-label">Assigned To</span>
      <span class="detail-field-value">${escapeHtml(t.assigned_user?.name || 'Unassigned')}</span>
    </div>`;

    if (t.due_date) {
      html += `<div class="detail-field">
        <span class="detail-field-label">Due Date</span>
        <span class="detail-field-value">${formatDate(t.due_date)}</span>
      </div>`;
    }

    if (isFinance && t.cost != null) {
      html += `<div class="detail-field">
        <span class="detail-field-label">Cost</span>
        <span class="detail-field-value">${formatCurrency(t.cost)}</span>
      </div>`;
    }

    if (t.rental) {
      const guestDisplay = App.isCrewOnly() ? 'Guest Stay' : escapeHtml(t.rental.guest_name || 'Guest');
      html += `<div class="detail-field">
        <span class="detail-field-label">Linked Stay</span>
        <span class="detail-field-value">${guestDisplay} (${formatDate(t.rental.start_date)} - ${formatDate(t.rental.end_date)})</span>
      </div>`;
    }

    html += '</div>';

    // Links section
    html += '<div class="detail-section">';
    html += '<div class="detail-section-title">Links</div>';
    if (TaskDetail.links.length > 0) {
      TaskDetail.links.forEach(link => {
        html += `
          <div class="task-link-row">
            <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener" class="task-link">
              <i data-lucide="link" class="icon-16"></i>
              <span class="task-link-title">${escapeHtml(link.title)}</span>
            </a>
            <button class="task-link-delete" onclick="TaskDetail.removeLink('${link.id}')" aria-label="Remove">&times;</button>
          </div>
        `;
      });
    } else {
      html += '<p class="text-sm text-muted">No links yet</p>';
    }
    html += `<button class="btn btn-sm btn-secondary" style="margin-top:10px" onclick="TaskDetail.showAddLinkModal()">+ Add Link</button>`;
    html += '</div>';

    // Receipt image (for reimbursements)
    if (t.receipt_image_url && isFinance) {
      html += `<div class="detail-section">
        <div class="detail-section-title">Receipt</div>
        <img class="detail-photo" src="${escapeHtml(t.receipt_image_url)}" alt="Receipt">
      </div>`;
    }

    // Options (both do and get tasks) — rendered by shared OptionsList component
    if (t.type !== 'reimbursement') {
      html += '<div class="detail-section" id="task-detail-options"></div>';
    }

    // Actions
    html += '<div class="detail-actions">';

    if (canAssign) {
      html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.showAssignModal()">Assign</button>`;
    }

    if (t.is_blocked_by_purchase && (canAssign || isFinance)) {
      html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.markSupplied()">Mark Supplies Secured</button>`;
    }

    if (t.type === 'reimbursement' && isFinance && t.status !== 'Done') {
      html += `<button class="btn btn-primary btn-block" onclick="TaskDetail.approveReimbursement()">Approve & Mark Paid</button>`;
    }

    // Status transitions
    const hasPurchaseFlow = t.type === 'get' || t.type === 'reimbursement';
    if (t.status === 'Open') {
      if (hasPurchaseFlow) {
        html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.setStatus('Researching')">Move to Researching</button>`;
      }
      html += `<button class="btn btn-primary btn-block" onclick="TaskDetail.setStatus('Done')">Mark Done</button>`;
    } else if (t.status === 'Researching' && hasPurchaseFlow) {
      html += `<button class="btn btn-primary btn-block" onclick="TaskDetail.setStatus('Done')">Mark Done</button>`;
    } else if (t.status === 'To Pay' && isFinance && hasPurchaseFlow) {
      html += `<button class="btn btn-primary btn-block" onclick="TaskDetail.setStatus('Done')">Mark Paid & Done</button>`;
    }

    // Edit button for admins
    if (App.isAdmin()) {
      html += `<button class="btn btn-ghost btn-block" onclick="TaskDetail.showEditModal()">Edit Task</button>`;
    }

    // Delete button (reimbursements are archived for tax records and cannot be deleted)
    if (t.type !== 'reimbursement') {
      html += `<button class="btn btn-danger btn-block" onclick="TaskDetail.confirmDelete()">Delete Task</button>`;
    }

    html += '</div>';

    container.innerHTML = html;

    const optsEl = document.getElementById('task-detail-options');
    if (optsEl) {
      TaskDetail.optionsList = OptionsList.mount(optsEl, { taskId: t.id });
    }
  },

  showAddLinkModal() {
    showModal(`
      <h3 class="modal-title">Add Link</h3>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="modal-link-title" placeholder="e.g. Amazon listing">
      </div>
      <div class="form-group">
        <label>URL</label>
        <input type="url" id="modal-link-url" placeholder="https://...">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="TaskDetail.doAddLink()">Add</button>
      </div>
    `);
    setTimeout(() => document.getElementById('modal-link-title')?.focus(), 100);
  },

  async doAddLink() {
    const title = document.getElementById('modal-link-title').value.trim();
    const url = document.getElementById('modal-link-url').value.trim();
    if (!title) { toast('Enter a title'); return; }
    if (!url) { toast('Enter a URL'); return; }

    const { error } = await sb.from('task_links').insert({
      task_id: TaskDetail.task.id,
      title,
      url,
    });
    hideModal();
    if (error) { toast('Failed to add link'); return; }
    toast('Link added');
    TaskDetail.load(TaskDetail.task.id);
  },

  async removeLink(id) {
    const { error } = await sb.from('task_links').delete().eq('id', id);
    if (error) { toast('Failed to remove'); return; }
    TaskDetail.load(TaskDetail.task.id);
  },

  confirmDelete() {
    showModal(`
      <h3 class="modal-title">Delete Task?</h3>
      <p style="font-size:14px;color:var(--text-muted);line-height:1.5">
        This will permanently remove "${escapeHtml(TaskDetail.task.title)}". This cannot be undone.
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-danger" onclick="TaskDetail.doDelete()">Delete</button>
      </div>
    `);
  },

  async doDelete() {
    if (TaskDetail.task.type === 'reimbursement') {
      hideModal();
      toast('Reimbursements are kept for tax records');
      return;
    }
    const id = TaskDetail.task.id;
    const { error } = await sb.from('tasks').delete().eq('id', id);
    hideModal();
    if (error) { toast('Failed to delete'); return; }
    toast('Task deleted');
    Router.back();
  },

  async setStatus(status) {
    const { error } = await sb.from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', TaskDetail.task.id);
    if (error) { toast('Failed to update'); return; }
    toast(`Marked as ${status}`);
    TaskDetail.task.status = status;
    TaskDetail.render();
  },

  async markSupplied() {
    const { error } = await sb.from('tasks')
      .update({ is_blocked_by_purchase: false, updated_at: new Date().toISOString() })
      .eq('id', TaskDetail.task.id);
    if (error) { toast('Failed to update'); return; }
    toast('Supplies secured — task is now actionable');
    TaskDetail.task.is_blocked_by_purchase = false;
    TaskDetail.render();
  },

  async approveReimbursement() {
    const { error } = await sb.from('tasks')
      .update({ status: 'Done', updated_at: new Date().toISOString() })
      .eq('id', TaskDetail.task.id);
    if (error) { toast('Failed to approve'); return; }
    toast('Reimbursement approved');
    TaskDetail.task.status = 'Done';
    TaskDetail.render();
  },

  showAssignModal() {
    let options = App.allUsers.map(u =>
      `<option value="${u.id}" ${TaskDetail.task.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`
    ).join('');

    showModal(`
      <h3 class="modal-title">Assign Task</h3>
      <select id="modal-assignee">
        <option value="">Unassigned</option>
        ${options}
      </select>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="TaskDetail.doAssign()">Save</button>
      </div>
    `);
  },

  async doAssign() {
    const val = document.getElementById('modal-assignee').value;
    const assigned_to = val || null;
    const { error } = await sb.from('tasks')
      .update({ assigned_to, updated_at: new Date().toISOString() })
      .eq('id', TaskDetail.task.id);
    hideModal();
    if (error) { toast('Failed to assign'); return; }
    toast('Task assigned');
    TaskDetail.load(TaskDetail.task.id);
  },

  showEditModal() {
    const t = TaskDetail.task;
    const userOpts = App.allUsers.map(u =>
      `<option value="${u.id}" ${t.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`
    ).join('');

    showModal(`
      <h3 class="modal-title">Edit Task</h3>
      ${t.type === 'reimbursement' ? '' : `
      <div class="form-group">
        <label>Type</label>
        <div class="priority-toggle" style="margin:0">
          <button type="button" class="priority-btn ${t.type === 'do' ? 'active' : ''}" data-edit-type="do" onclick="TaskDetail.toggleEditType(this)">
            Need to Do
          </button>
          <button type="button" class="priority-btn ${t.type === 'get' ? 'active' : ''}" data-edit-type="get" onclick="TaskDetail.toggleEditType(this)">
            Need to Get
          </button>
        </div>
      </div>`}
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="modal-edit-title" value="${escapeHtml(t.title)}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="modal-edit-desc" rows="3">${escapeHtml(t.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <select id="modal-edit-priority">
          <option value="HAVE" ${t.priority === 'HAVE' ? 'selected' : ''}>Urgent</option>
          <option value="NORMAL" ${t.priority === 'NORMAL' ? 'selected' : ''}>Normal</option>
          <option value="WANT" ${t.priority === 'WANT' ? 'selected' : ''}>Backlog</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="modal-edit-status">
          <option value="Open" ${t.status === 'Open' ? 'selected' : ''}>Open</option>
          ${t.type === 'get' || t.type === 'reimbursement' ? `
          <option value="Researching" ${t.status === 'Researching' ? 'selected' : ''}>Researching</option>
          <option value="To Pay" ${t.status === 'To Pay' ? 'selected' : ''}>To Pay</option>` : ''}
          <option value="Done" ${t.status === 'Done' ? 'selected' : ''}>Done</option>
        </select>
      </div>
      <div class="form-group">
        <label>Assigned To</label>
        <select id="modal-edit-assignee">
          <option value="">Unassigned</option>
          ${userOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Due Date</label>
        <input type="date" id="modal-edit-due" value="${t.due_date || ''}">
      </div>
      <div class="form-group">
        <label>Cost</label>
        <input type="number" id="modal-edit-cost" value="${t.cost ?? ''}" step="0.01">
      </div>
      <div class="form-group" id="modal-edit-service-group" style="display:${t.type === 'get' || t.type === 'reimbursement' ? 'none' : 'block'}">
        <label>Service</label>
        <div class="priority-toggle" style="margin:0">
          <button type="button" class="priority-btn ${(t.service_type || 'self') === 'self' ? 'active' : ''}" data-edit-service="self" onclick="TaskDetail.toggleEditService(this)">
            Self-service
          </button>
          <button type="button" class="priority-btn ${t.service_type === 'provider' ? 'active' : ''}" data-edit-service="provider" onclick="TaskDetail.toggleEditService(this)">
            Service Provider
          </button>
        </div>
      </div>
      <div class="form-group" id="modal-edit-blocked-group" style="display:${t.type === 'get' || t.type === 'reimbursement' ? 'none' : 'flex'};align-items:center;gap:10px">
        <label class="toggle" style="margin:0">
          <input type="checkbox" id="modal-edit-blocked" ${t.is_blocked_by_purchase ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span style="font-size:14px">Blocked by purchase</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="TaskDetail.doEdit()">Save</button>
      </div>
    `);
    TaskDetail._editType = t.type;
    TaskDetail._editService = t.service_type || 'self';
  },

  toggleEditType(btn) {
    TaskDetail._editType = btn.dataset.editType;
    btn.closest('.priority-toggle').querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const blockedGroup = document.getElementById('modal-edit-blocked-group');
    if (blockedGroup) blockedGroup.style.display = TaskDetail._editType === 'get' ? 'none' : 'flex';
    const serviceGroup = document.getElementById('modal-edit-service-group');
    if (serviceGroup) serviceGroup.style.display = TaskDetail._editType === 'get' ? 'none' : 'block';
  },

  toggleEditService(btn) {
    TaskDetail._editService = btn.dataset.editService;
    btn.closest('.priority-toggle').querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  },

  async doEdit() {
    const blockedEl = document.getElementById('modal-edit-blocked');
    const newType = TaskDetail._editType || TaskDetail.task.type;
    const updates = {
      title: document.getElementById('modal-edit-title').value.trim(),
      description: document.getElementById('modal-edit-desc').value.trim() || null,
      priority: document.getElementById('modal-edit-priority').value,
      status: document.getElementById('modal-edit-status').value,
      assigned_to: document.getElementById('modal-edit-assignee').value || null,
      due_date: document.getElementById('modal-edit-due').value || null,
      cost: document.getElementById('modal-edit-cost').value ? Number(document.getElementById('modal-edit-cost').value) : null,
      type: newType,
      is_blocked_by_purchase: newType === 'get' ? true : (blockedEl ? blockedEl.checked : TaskDetail.task.is_blocked_by_purchase),
      service_type: newType === 'do' ? (TaskDetail._editService || 'self') : 'self',
      updated_at: new Date().toISOString(),
    };

    if (!updates.title) { toast('Title is required'); return; }

    const { error } = await sb.from('tasks')
      .update(updates)
      .eq('id', TaskDetail.task.id);

    hideModal();
    if (error) { toast('Failed to save'); return; }
    toast('Task updated');
    TaskDetail.load(TaskDetail.task.id);
  },
};
