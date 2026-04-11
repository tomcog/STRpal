// Inventory — running list of items that need regular restocking
const Inventory = {
  init() {
    document.getElementById('add-inventory-btn').addEventListener('click', () => {
      Inventory.showAddModal();
    });
  },

  async load() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    const { data, error } = await sb.from('inventory_standards')
      .select('*')
      .order('item_name');

    if (error || !data || data.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No inventory items yet</p></div>';
      return;
    }

    list.innerHTML = data.map(item => Inventory.renderItem(item)).join('');

    list.querySelectorAll('.inv-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.inv-status-toggle')) return;
        Inventory.showDetailModal(data.find(i => i.id === card.dataset.id));
      });
    });

    list.querySelectorAll('.inv-status-toggle button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Inventory.quickSetStatus(btn.dataset.id, btn.dataset.status);
      });
    });
  },

  parseLinks(item) {
    if (Array.isArray(item.purchase_links)) return item.purchase_links;
    if (item.quick_order_url) return [{ label: 'Buy', url: item.quick_order_url }];
    return [];
  },

  renderItem(item) {
    const status = item.status || 'Stocked';
    const opts = ['Stocked', 'Low', 'Empty'];
    const buttons = opts.map(o =>
      `<button class="inv-status-btn ${o.toLowerCase()} ${status === o ? 'active' : ''}" data-id="${item.id}" data-status="${o}">${o}</button>`
    ).join('');

    return `
      <div class="inv-card" data-id="${item.id}">
        <div class="inv-name">${escapeHtml(item.item_name)}</div>
        <div class="inv-status-toggle">${buttons}</div>
      </div>
    `;
  },

  async quickSetStatus(id, status) {
    const updates = { status };
    if (status === 'Stocked') {
      updates.last_stocked_at = new Date().toISOString().slice(0, 10);
    }
    const { error } = await sb.from('inventory_standards').update(updates).eq('id', id);
    if (error) {
      console.error('Inventory update failed:', error);
      toast('Failed: ' + error.message);
      return;
    }
    Inventory.load();
  },

  showDetailModal(item) {
    if (!item) return;
    Inventory._editId = item.id;
    const links = Inventory.parseLinks(item);
    Inventory._editLinks = links.length > 0 ? links.map(l => ({ ...l })) : [{ label: '', url: '' }];
    Inventory._renderForm({
      title: 'Edit Item',
      item,
      onSave: 'Inventory.doSave()',
      showDelete: true,
    });
  },

  showAddModal() {
    Inventory._editId = null;
    Inventory._editLinks = [{ label: '', url: '' }];
    Inventory._renderForm({
      title: 'Add Item',
      item: { status: 'Stocked' },
      onSave: 'Inventory.doAdd()',
      showDelete: false,
    });
  },

  _renderForm({ title, item, onSave, showDelete }) {
    const deleteBtn = showDelete
      ? `<button class="icon-btn inv-delete-btn" aria-label="Delete" onclick="Inventory.confirmDelete('${item.id}','${escapeHtml(item.item_name || '').replace(/'/g, "\\'")}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
        </button>`
      : '';

    showModal(`
      <h3 class="modal-title">${title}</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="modal-inv-name" placeholder="e.g. Paper Towels" value="${escapeHtml(item.item_name || '')}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="modal-inv-desc" rows="2" placeholder="Notes, brand, size...">${escapeHtml(item.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="modal-inv-status">
          <option value="Stocked" ${item.status === 'Stocked' ? 'selected' : ''}>Stocked</option>
          <option value="Low" ${item.status === 'Low' ? 'selected' : ''}>Low</option>
          <option value="Empty" ${item.status === 'Empty' ? 'selected' : ''}>Empty</option>
        </select>
      </div>
      <div class="form-group">
        <label>Last stocked</label>
        <div class="last-stocked-row">
          <input type="date" id="modal-inv-last-stocked" class="date-icon-left" value="${item.last_stocked_at || ''}">
          <button type="button" class="btn btn-sm btn-secondary" onclick="Inventory.setStockedToday()">Stocked today</button>
        </div>
      </div>
      <div class="form-group">
        <label>Where to buy</label>
        <div id="modal-inv-links"></div>
        <button type="button" class="btn btn-sm btn-ghost" onclick="Inventory.addLinkRow()" style="margin-top:6px">+ Add another link</button>
      </div>
      <div class="modal-actions">
        ${deleteBtn}
        <button class="btn btn-primary" onclick="${onSave}">Save</button>
      </div>
    `);
    Inventory.renderLinkRows();
  },

  renderLinkRows() {
    const container = document.getElementById('modal-inv-links');
    if (!container) return;
    container.innerHTML = Inventory._editLinks.map((l, i) => `
      <div class="inv-link-row">
        <input type="text" placeholder="Label" value="${escapeHtml(l.label || '')}" data-link-i="${i}" data-link-field="label">
        <input type="url" placeholder="https://..." value="${escapeHtml(l.url || '')}" data-link-i="${i}" data-link-field="url">
        <button type="button" class="icon-btn" aria-label="Remove" onclick="Inventory.removeLinkRow(${i})">&times;</button>
      </div>
    `).join('');
    container.querySelectorAll('input[data-link-i]').forEach(input => {
      input.addEventListener('input', (e) => {
        const i = Number(e.target.dataset.linkI);
        const field = e.target.dataset.linkField;
        Inventory._editLinks[i][field] = e.target.value;
      });
    });
  },

  setStockedToday() {
    const today = new Date().toISOString().slice(0, 10);
    const dateEl = document.getElementById('modal-inv-last-stocked');
    const statusEl = document.getElementById('modal-inv-status');
    if (dateEl) dateEl.value = today;
    if (statusEl) statusEl.value = 'Stocked';
  },

  addLinkRow() {
    Inventory._editLinks.push({ label: '', url: '' });
    Inventory.renderLinkRows();
  },

  removeLinkRow(i) {
    Inventory._editLinks.splice(i, 1);
    if (Inventory._editLinks.length === 0) Inventory._editLinks.push({ label: '', url: '' });
    Inventory.renderLinkRows();
  },

  _collectFormData() {
    const name = document.getElementById('modal-inv-name').value.trim();
    if (!name) { toast('Enter a name'); return null; }

    const links = Inventory._editLinks
      .map(l => ({ label: (l.label || '').trim(), url: (l.url || '').trim() }))
      .filter(l => l.url);

    return {
      item_name: name,
      description: document.getElementById('modal-inv-desc').value.trim() || null,
      status: document.getElementById('modal-inv-status').value,
      last_stocked_at: document.getElementById('modal-inv-last-stocked').value || null,
      purchase_links: links,
    };
  },

  async doAdd() {
    const data = Inventory._collectFormData();
    if (!data) return;
    const { error } = await sb.from('inventory_standards').insert(data);
    hideModal();
    if (error) { toast('Failed to add'); return; }
    toast('Item added');
    Inventory.load();
  },

  async doSave() {
    const data = Inventory._collectFormData();
    if (!data) return;
    const { error } = await sb.from('inventory_standards').update(data).eq('id', Inventory._editId);
    hideModal();
    if (error) { toast('Failed to save'); return; }
    toast('Item updated');
    Inventory.load();
  },

  confirmDelete(id, name) {
    showModal(`
      <h3 class="modal-title">Delete Item?</h3>
      <p style="font-size:14px;color:var(--text-muted);line-height:1.5">
        This will permanently remove "${escapeHtml(name)}". This cannot be undone.
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-danger" onclick="Inventory.doDelete('${id}')">Delete</button>
      </div>
    `);
  },

  async doDelete(id) {
    const { error } = await sb.from('inventory_standards').delete().eq('id', id);
    hideModal();
    if (error) { toast('Failed to delete'); return; }
    toast('Item deleted');
    Inventory.load();
  },
};

document.addEventListener('DOMContentLoaded', () => Inventory.init());
