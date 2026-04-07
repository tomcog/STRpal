// Task Detail View
const TaskDetail = {
  task: null,
  shortlistOptions: [],

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

    // Load shortlist options
    const { data: options } = await sb.from('shortlist_options')
      .select('*')
      .eq('task_id', taskId)
      .order('price', { ascending: true });

    TaskDetail.shortlistOptions = options || [];
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
    if (t.is_blocked_by_purchase) badges += '<span class="badge badge-blocked">Needs Supply</span>';
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

    // Receipt image (for reimbursements)
    if (t.receipt_image_url && isFinance) {
      html += `<div class="detail-section">
        <div class="detail-section-title">Receipt</div>
        <img class="detail-photo" src="${escapeHtml(t.receipt_image_url)}" alt="Receipt">
      </div>`;
    }

    // Shortlist options
    if (TaskDetail.shortlistOptions.length > 0 && isFinance) {
      html += '<div class="detail-section">';
      html += '<div class="detail-section-title">Product Options</div>';
      TaskDetail.shortlistOptions.forEach(opt => {
        const selectedClass = opt.is_selected ? 'selected' : '';
        html += `
          <div class="shortlist-item ${selectedClass}" data-opt-id="${opt.id}">
            <div class="flex-between">
              <span class="shortlist-name">${escapeHtml(opt.option_name)}</span>
              <span class="shortlist-price">${opt.price != null ? formatCurrency(opt.price) : ''}</span>
            </div>
            ${opt.url_or_phone ? `<div class="shortlist-link"><a href="${escapeHtml(opt.url_or_phone)}" target="_blank" rel="noopener">View Product</a></div>` : ''}
            <div class="shortlist-actions">
              ${!opt.is_selected ? `<button class="btn btn-sm btn-secondary" onclick="TaskDetail.selectOption('${opt.id}')">Select Winner</button>` : '<span class="badge badge-done">Selected</span>'}
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Actions
    html += '<div class="detail-actions">';

    if (canAssign) {
      html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.showAssignModal()">Assign</button>`;
    }

    if (isFinance && t.status === 'Researching') {
      html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.showAddOptionModal()">+ Add Product Option</button>`;
    }

    if (t.is_blocked_by_purchase && (canAssign || isFinance)) {
      html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.markSupplied()">Mark Supplies Secured</button>`;
    }

    if (t.type === 'reimbursement' && isFinance && t.status !== 'Done') {
      html += `<button class="btn btn-primary btn-block" onclick="TaskDetail.approveReimbursement()">Approve & Mark Paid</button>`;
    }

    // Status transitions
    if (t.status === 'Open') {
      html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.setStatus('Researching')">Move to Researching</button>`;
      html += `<button class="btn btn-primary btn-block" onclick="TaskDetail.setStatus('Done')">Mark Done</button>`;
    } else if (t.status === 'Researching') {
      html += `<button class="btn btn-secondary btn-block" onclick="TaskDetail.setStatus('To Pay')">Ready to Pay</button>`;
    } else if (t.status === 'To Pay' && isFinance) {
      html += `<button class="btn btn-primary btn-block" onclick="TaskDetail.setStatus('Done')">Mark Paid & Done</button>`;
    }

    // Edit button for admins
    if (App.isAdmin()) {
      html += `<button class="btn btn-ghost btn-block" onclick="TaskDetail.showEditModal()">Edit Task</button>`;
    }

    // Delete button
    html += `<button class="btn btn-danger btn-block" onclick="TaskDetail.confirmDelete()">Delete Task</button>`;

    html += '</div>';

    container.innerHTML = html;
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

  async selectOption(optId) {
    // Deselect all, select this one
    await sb.from('shortlist_options')
      .update({ is_selected: false })
      .eq('task_id', TaskDetail.task.id);

    await sb.from('shortlist_options')
      .update({ is_selected: true })
      .eq('id', optId);

    toast('Option selected');
    TaskDetail.load(TaskDetail.task.id);
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

  showAddOptionModal() {
    showModal(`
      <h3 class="modal-title">Add Product Option</h3>
      <div class="form-group">
        <label>Product Name</label>
        <input type="text" id="modal-opt-name" placeholder="e.g. Dyson V15">
      </div>
      <div class="form-group">
        <label>Price</label>
        <input type="number" id="modal-opt-price" placeholder="0.00" step="0.01">
      </div>
      <div class="form-group">
        <label>URL or Contact</label>
        <input type="url" id="modal-opt-url" placeholder="https://...">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="TaskDetail.doAddOption()">Add</button>
      </div>
    `);
  },

  async doAddOption() {
    const name = document.getElementById('modal-opt-name').value.trim();
    const price = document.getElementById('modal-opt-price').value;
    const url = document.getElementById('modal-opt-url').value.trim();
    if (!name) { toast('Enter a product name'); return; }

    const { error } = await sb.from('shortlist_options').insert({
      task_id: TaskDetail.task.id,
      option_name: name,
      price: price ? Number(price) : null,
      url_or_phone: url || null,
    });
    hideModal();
    if (error) { toast('Failed to add option'); return; }
    toast('Option added');
    TaskDetail.load(TaskDetail.task.id);
  },

  showEditModal() {
    const t = TaskDetail.task;
    const userOpts = App.allUsers.map(u =>
      `<option value="${u.id}" ${t.assigned_to === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`
    ).join('');

    showModal(`
      <h3 class="modal-title">Edit Task</h3>
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
          <option value="Researching" ${t.status === 'Researching' ? 'selected' : ''}>Researching</option>
          <option value="To Pay" ${t.status === 'To Pay' ? 'selected' : ''}>To Pay</option>
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
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
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
  },

  async doEdit() {
    const updates = {
      title: document.getElementById('modal-edit-title').value.trim(),
      description: document.getElementById('modal-edit-desc').value.trim() || null,
      priority: document.getElementById('modal-edit-priority').value,
      status: document.getElementById('modal-edit-status').value,
      assigned_to: document.getElementById('modal-edit-assignee').value || null,
      due_date: document.getElementById('modal-edit-due').value || null,
      cost: document.getElementById('modal-edit-cost').value ? Number(document.getElementById('modal-edit-cost').value) : null,
      is_blocked_by_purchase: document.getElementById('modal-edit-blocked').checked,
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
