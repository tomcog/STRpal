// Inventory & Visual Standards View
const Inventory = {
  category: 'Supply',

  init() {
    document.querySelectorAll('.inv-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Inventory.category = tab.dataset.cat;
        Inventory.load();
      });
    });

    document.getElementById('add-inventory-btn').addEventListener('click', () => {
      Inventory.showAddModal();
    });
  },

  async load() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    const { data, error } = await sb.from('inventory_standards')
      .select('*')
      .eq('category', Inventory.category)
      .order('item_name');

    if (error || !data || data.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>No ${Inventory.category === 'Supply' ? 'supplies' : 'standards'} yet</p></div>`;
      return;
    }

    list.innerHTML = data.map(item => Inventory.renderItem(item)).join('');

    // Click handlers
    list.querySelectorAll('.inv-card').forEach(card => {
      card.addEventListener('click', () => {
        Inventory.showDetailModal(data.find(i => i.id === card.dataset.id));
      });
    });
  },

  renderItem(item) {
    const statusClass = item.status.toLowerCase();
    const photoHtml = item.ideal_photo_url
      ? `<img class="inv-photo" src="${escapeHtml(item.ideal_photo_url)}" alt="" loading="lazy">`
      : `<div class="inv-photo" style="display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:20px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>`;

    const actionHtml = item.category === 'Supply' && item.quick_order_url
      ? `<div class="inv-action">
          <a href="${escapeHtml(item.quick_order_url)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">Reorder</a>
        </div>`
      : '';

    return `
      <div class="inv-card" data-id="${item.id}">
        ${photoHtml}
        <div class="inv-info">
          <div class="inv-name">${escapeHtml(item.item_name)}</div>
          <div class="inv-status ${statusClass}">${item.status}</div>
        </div>
        ${actionHtml}
      </div>
    `;
  },

  showDetailModal(item) {
    if (!item) return;
    const isAdmin = App.isAdmin();

    let html = `<h3 class="modal-title">${escapeHtml(item.item_name)}</h3>`;

    if (item.ideal_photo_url) {
      html += `<img src="${escapeHtml(item.ideal_photo_url)}" alt="Ideal state" style="width:100%;border-radius:var(--radius-sm);margin-bottom:12px">`;
    }

    if (item.description) {
      html += `<p style="font-size:14px;color:var(--text-muted);margin-bottom:12px">${escapeHtml(item.description)}</p>`;
    }

    html += `<div class="detail-field">
      <span class="detail-field-label">Status</span>
      <span class="detail-field-value inv-status ${item.status.toLowerCase()}">${item.status}</span>
    </div>`;

    if (item.quick_order_url) {
      html += `<div style="margin-top:12px">
        <a href="${escapeHtml(item.quick_order_url)}" target="_blank" rel="noopener" class="btn btn-primary btn-block">Reorder Now</a>
      </div>`;
    }

    if (isAdmin || App.can('can_manage_finances')) {
      html += `
        <div style="margin-top:16px">
          <div class="detail-section-title">Update Status</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm ${item.status === 'Stocked' ? 'btn-primary' : 'btn-secondary'}" onclick="Inventory.setStatus('${item.id}','Stocked')">Stocked</button>
            <button class="btn btn-sm ${item.status === 'Low' ? 'btn-primary' : 'btn-secondary'}" onclick="Inventory.setStatus('${item.id}','Low')">Low</button>
            <button class="btn btn-sm ${item.status === 'Empty' ? 'btn-primary' : 'btn-secondary'}" onclick="Inventory.setStatus('${item.id}','Empty')">Empty</button>
          </div>
        </div>
      `;
    }

    html += `<div class="modal-actions"><button class="btn btn-ghost btn-block" onclick="hideModal()">Close</button></div>`;

    showModal(html);
  },

  async setStatus(id, status) {
    const { error } = await sb.from('inventory_standards')
      .update({ status })
      .eq('id', id);
    hideModal();
    if (error) { toast('Failed to update'); return; }
    toast(`Status: ${status}`);
    Inventory.load();
  },

  showAddModal() {
    showModal(`
      <h3 class="modal-title">Add ${Inventory.category === 'Supply' ? 'Supply' : 'Standard'}</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="modal-inv-name" placeholder="e.g. Paper Towels">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="modal-inv-desc" rows="2" placeholder="Notes or instructions"></textarea>
      </div>
      ${Inventory.category === 'Supply' ? `
      <div class="form-group">
        <label>Quick Order URL</label>
        <input type="url" id="modal-inv-url" placeholder="https://amazon.com/...">
      </div>` : ''}
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Inventory.doAdd()">Add</button>
      </div>
    `);
  },

  async doAdd() {
    const name = document.getElementById('modal-inv-name').value.trim();
    if (!name) { toast('Enter a name'); return; }

    const item = {
      item_name: name,
      category: Inventory.category,
      description: document.getElementById('modal-inv-desc').value.trim() || null,
      status: 'Stocked',
    };

    const urlEl = document.getElementById('modal-inv-url');
    if (urlEl) item.quick_order_url = urlEl.value.trim() || null;

    const { error } = await sb.from('inventory_standards').insert(item);
    hideModal();
    if (error) { toast('Failed to add'); return; }
    toast('Item added');
    Inventory.load();
  },
};

document.addEventListener('DOMContentLoaded', () => Inventory.init());
