// OptionsList — reusable "Options" section bound to a task.
// Renders the shortlist of options under a task with the same UI and interactions
// everywhere (the pattern taken from Need-to-Get).
//
// Usage:
//   const list = OptionsList.mount(containerEl, { taskId, onChange });
//   list.refresh();  // re-fetch and re-render
//
// Required globals: sb, showModal, hideModal, escapeHtml, formatCurrency, toast, PhotoPicker, SUPABASE_URL

(function () {
  const registry = new Map(); // instanceId -> OptionsList

  let _nextId = 0;

  class OptionsList {
    constructor(root, opts) {
      this.root = root;
      this.taskId = opts.taskId;
      this.onChange = opts.onChange || null;
      this.title = opts.title || 'Options';
      this.items = [];
      this._id = `ol-${++_nextId}`;
      this._picker = null;
      this._editId = null;
      registry.set(this._id, this);
      this.refresh();
    }

    async refresh() {
      const { data, error } = await sb.from('shortlist_options')
        .select('*')
        .eq('task_id', this.taskId)
        .order('price', { ascending: true });
      if (error) { this.items = []; }
      else { this.items = data || []; }
      this.render();
      if (this.onChange) this.onChange(this.items);
    }

    render() {
      let html = `<div class="detail-section-title">${escapeHtml(this.title)}</div>`;
      if (this.items.length > 0) {
        this.items.forEach(opt => {
          const selectedClass = opt.is_selected ? 'selected' : '';
          html += `
            <div class="shortlist-item ${selectedClass}" data-opt-id="${opt.id}">
              ${opt.photo_url ? (isPdfUrl(opt.photo_url)
                ? `<a class="shortlist-pdf card-pdf" href="${escapeHtml(opt.photo_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i data-lucide="file-text" class="icon-18"></i><span>PDF</span></a>`
                : `<img class="shortlist-photo" src="${escapeHtml(opt.photo_url)}" alt="" loading="lazy">`) : ''}
              <div class="shortlist-content">
                <div class="flex-between">
                  <span class="shortlist-name">${escapeHtml(opt.option_name)}</span>
                  <span class="shortlist-price">${opt.price != null ? formatCurrency(opt.price) : ''}</span>
                </div>
                ${opt.source ? `<div class="shortlist-source">${escapeHtml(opt.source)}</div>` : ''}
                ${opt.url_or_phone ? `<div class="shortlist-link"><a href="${escapeHtml(opt.url_or_phone)}" target="_blank" rel="noopener">Visit link</a></div>` : ''}
                ${opt.notes ? `<div class="shortlist-notes">${escapeHtml(opt.notes)}</div>` : ''}
                <div class="shortlist-actions">
                  ${!opt.is_selected
                    ? `<button class="btn btn-sm btn-secondary" onclick="OptionsList._get('${this._id}').selectOption('${opt.id}')">Select Winner</button>`
                    : '<span class="badge badge-done">Selected</span>'}
                  <button class="btn btn-sm btn-ghost" onclick="OptionsList._get('${this._id}').showEditModal('${opt.id}')">Edit</button>
                  <button class="btn btn-sm btn-ghost" onclick="OptionsList._get('${this._id}').removeOption('${opt.id}')">Remove</button>
                </div>
              </div>
            </div>
          `;
        });
      } else {
        html += '<p class="text-sm text-muted">No options yet</p>';
      }
      html += `<button class="btn btn-sm btn-secondary" style="margin-top:10px" onclick="OptionsList._get('${this._id}').showAddModal()">+ Add Option</button>`;
      this.root.innerHTML = html;
    }

    _formHtml({ opt, saveLabel, saveAction, showFetch }) {
      const o = opt || {};
      return `
        <h3 class="modal-title">${opt ? 'Edit Option' : 'Add Option'}</h3>
        <div class="form-group">
          <label>URL</label>
          ${showFetch ? `
          <div style="display:flex;gap:8px">
            <input type="url" id="ol-modal-url" placeholder="https://..." style="flex:1" value="${escapeHtml(o.url_or_phone || '')}">
            <button type="button" class="btn btn-sm btn-secondary" id="ol-modal-fetch" style="white-space:nowrap">Fetch</button>
          </div>
          <div id="ol-modal-fetch-status" class="text-sm text-muted" style="margin-top:4px" hidden></div>
          ` : `<input type="url" id="ol-modal-url" placeholder="https://..." value="${escapeHtml(o.url_or_phone || '')}">`}
        </div>
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="ol-modal-name" placeholder="e.g. Dyson V15" value="${escapeHtml(o.option_name || '')}">
        </div>
        <div class="form-group">
          <label>Source</label>
          <input type="text" id="ol-modal-source" placeholder="e.g. Amazon, Home Depot" value="${escapeHtml(o.source || '')}">
        </div>
        <div class="form-group">
          <label>Cost</label>
          <input type="number" id="ol-modal-price" placeholder="0.00" step="0.01" value="${o.price ?? ''}">
        </div>
        <div class="form-group">
          <label>Photo</label>
          <div id="ol-modal-photo-picker"></div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="ol-modal-notes" rows="2" placeholder="Any details...">${escapeHtml(o.notes || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
          <button class="btn btn-primary" onclick="${saveAction}">${saveLabel}</button>
        </div>
      `;
    }

    showAddModal() {
      this._editId = null;
      showModal(this._formHtml({
        opt: null,
        saveLabel: 'Add',
        saveAction: `OptionsList._get('${this._id}').doAdd()`,
        showFetch: true,
      }));
      const fetchBtn = document.getElementById('ol-modal-fetch');
      if (fetchBtn) fetchBtn.addEventListener('click', () => this.fetchDetails());
      this._picker = PhotoPicker.mount('ol-modal-photo-picker', { label: 'Option photo' });
    }

    showEditModal(optId) {
      const opt = this.items.find(o => o.id === optId);
      if (!opt) return;
      this._editId = optId;
      showModal(this._formHtml({
        opt,
        saveLabel: 'Save',
        saveAction: `OptionsList._get('${this._id}').doSave()`,
        showFetch: true,
      }));
      const fetchBtn = document.getElementById('ol-modal-fetch');
      if (fetchBtn) fetchBtn.addEventListener('click', () => this.fetchDetails());
      this._picker = PhotoPicker.mount('ol-modal-photo-picker', {
        label: 'Option photo',
        initialUrl: opt.photo_url || null,
      });
    }

    async fetchDetails() {
      const url = document.getElementById('ol-modal-url').value.trim();
      if (!url) { toast('Enter a URL first'); return; }

      const statusEl = document.getElementById('ol-modal-fetch-status');
      const fetchBtn = document.getElementById('ol-modal-fetch');
      if (statusEl) { statusEl.textContent = 'Fetching product details...'; statusEl.hidden = false; }
      if (fetchBtn) fetchBtn.disabled = true;

      try {
        const resp = await fetch(SUPABASE_URL + '/functions/v1/fetch-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await resp.json();
        if (data.error) { if (statusEl) statusEl.textContent = 'Could not fetch: ' + data.error; return; }

        const nameEl = document.getElementById('ol-modal-name');
        const priceEl = document.getElementById('ol-modal-price');
        const sourceEl = document.getElementById('ol-modal-source');
        const notesEl = document.getElementById('ol-modal-notes');

        if (data.title && !nameEl.value) nameEl.value = data.title;
        if (data.price && !priceEl.value) priceEl.value = data.price;
        if (data.source && !sourceEl.value) sourceEl.value = data.source;
        if (data.description && !notesEl.value) notesEl.value = data.description;
        if (data.image && this._picker) {
          const v = this._picker.getValue();
          if (!v.file && !v.url) this._picker._setUrl(data.image);
        }

        if (statusEl) statusEl.textContent = 'Details fetched — review and edit as needed.';
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Fetch failed: ' + err.message;
      } finally {
        if (fetchBtn) fetchBtn.disabled = false;
      }
    }

    _collect() {
      const name = document.getElementById('ol-modal-name').value.trim();
      if (!name) { toast('Enter a title'); return null; }
      return {
        option_name: name,
        url_or_phone: document.getElementById('ol-modal-url').value.trim() || null,
        source: document.getElementById('ol-modal-source').value.trim() || null,
        price: document.getElementById('ol-modal-price').value ? Number(document.getElementById('ol-modal-price').value) : null,
        notes: document.getElementById('ol-modal-notes').value.trim() || null,
      };
    }

    async doAdd() {
      const base = this._collect();
      if (!base) return;

      let photoUrl = null;
      if (this._picker) {
        try { photoUrl = await this._picker.resolve(); }
        catch (e) { toast('Failed to upload photo'); return; }
      }

      const { error } = await sb.from('shortlist_options').insert({
        task_id: this.taskId,
        ...base,
        photo_url: photoUrl,
      });
      hideModal();
      if (error) { toast('Failed to add option'); return; }
      toast('Option added');
      this.refresh();
    }

    async doSave() {
      const base = this._collect();
      if (!base) return;

      let photoUrl = null;
      if (this._picker) {
        try { photoUrl = await this._picker.resolve(); }
        catch (e) { toast('Failed to upload photo'); return; }
      }

      const { error } = await sb.from('shortlist_options')
        .update({ ...base, photo_url: photoUrl })
        .eq('id', this._editId);
      hideModal();
      this._editId = null;
      if (error) { toast('Failed to save: ' + error.message); return; }
      toast('Option updated');
      this.refresh();
    }

    async selectOption(optId) {
      await sb.from('shortlist_options').update({ is_selected: false }).eq('task_id', this.taskId);
      await sb.from('shortlist_options').update({ is_selected: true }).eq('id', optId);
      toast('Option selected');
      this.refresh();
    }

    async removeOption(optId) {
      const { error } = await sb.from('shortlist_options').delete().eq('id', optId);
      if (error) { toast('Failed to remove'); return; }
      toast('Option removed');
      this.refresh();
    }

    destroy() {
      registry.delete(this._id);
    }

    static _get(id) {
      return registry.get(id);
    }

    static mount(elOrId, opts) {
      const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      if (!el) return null;
      return new OptionsList(el, opts);
    }
  }

  window.OptionsList = OptionsList;
})();
