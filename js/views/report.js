// Report View — two modes: 'issue' (damage/repair) and 'invoice' (payment/reimbursement)
const Report = {
  issuePicker: null,
  invoicePicker: null,
  priority: 'HAVE',
  mode: 'issue',

  reset(mode) {
    Report.setMode(mode === 'issue' ? 'issue' : 'invoice');

    if (Report.issuePicker) Report.issuePicker.clear();
    if (Report.invoicePicker) Report.invoicePicker.clear();

    Report.priority = 'HAVE';
    document.getElementById('report-form')?.reset();
    document.getElementById('invoice-form')?.reset();

    document.querySelectorAll('#view-report .priority-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.priority === 'HAVE');
    });

    Report._loadVendors();

    if (Report._prefill && Report._prefill.items && Report._prefill.items.length) {
      const titleEl = document.getElementById('invoice-title');
      if (titleEl) titleEl.value = Report._prefill.items.join(', ');
    }
    Report._prefill = null;
  },

  async _loadVendors() {
    const select = document.getElementById('invoice-vendor-select');
    if (!select) return;
    const { data: vendors } = await sb.from('vendors').select('id, name').order('name');
    const current = select.value;
    select.innerHTML = '<option value="">— No vendor (or enter name below) —</option>' +
      (vendors || []).map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
    if (current) select.value = current;
  },

  setMode(mode) {
    Report.mode = mode;

    document.querySelectorAll('#report-tabs .feed-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.reportMode === mode);
    });

    const issueForm = document.getElementById('report-form');
    const invoiceForm = document.getElementById('invoice-form');
    if (issueForm) issueForm.hidden = mode !== 'issue';
    if (invoiceForm) invoiceForm.hidden = mode !== 'invoice';
  },

  init() {
    Report.issuePicker = PhotoPicker.mount('report-photo-picker', { label: 'Issue photo' });
    Report.invoicePicker = PhotoPicker.mount('invoice-photo-picker', { label: 'Invoice / receipt' });

    document.querySelectorAll('#report-tabs .feed-tab').forEach(tab => {
      tab.addEventListener('click', () => Report.setMode(tab.dataset.reportMode));
    });

    document.querySelectorAll('#view-report .priority-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#view-report .priority-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Report.priority = btn.dataset.priority;
      });
    });

    document.getElementById('report-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const photoUrl = Report.issuePicker ? await Report.issuePicker.resolve() : null;
        const note = document.getElementById('report-note').value.trim();

        const { error } = await sb.from('tasks').insert({
          title: note || 'Reported Issue',
          description: note || null,
          photo_url: photoUrl,
          priority: Report.priority,
          status: 'Open',
          type: 'do',
          created_by: App.profile?.id || null,
        });

        if (error) throw error;

        toast('Issue reported');
        Report.reset('issue');
        Router.navigate('feed');
      } catch (err) {
        toast('Failed to submit: ' + (err.message || 'Unknown error'));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Issue';
      }
    });

    document.getElementById('invoice-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const receiptUrl = Report.invoicePicker ? await Report.invoicePicker.resolve() : null;
        const title = document.getElementById('invoice-title').value.trim();
        const amount = Number(document.getElementById('invoice-amount').value);
        const submitter = document.getElementById('invoice-submitter').value.trim();
        const vendorSelect = document.getElementById('invoice-vendor-select');
        const vendorId = vendorSelect ? (vendorSelect.value || null) : null;
        const vendorName = vendorId && vendorSelect ? vendorSelect.options[vendorSelect.selectedIndex].textContent : '';

        if (!title) throw new Error('Enter what this is for');
        if (!amount || amount <= 0) throw new Error('Enter a valid amount');

        const submittedBy = vendorName || submitter || App.profile?.name || 'crew member';

        const { error } = await sb.from('tasks').insert({
          title: `Reimbursement: ${title}`,
          description: `Submitted by ${submittedBy}`,
          receipt_image_url: receiptUrl,
          cost: amount,
          priority: 'HAVE',
          status: 'Open',
          type: 'reimbursement',
          vendor_id: vendorId,
          created_by: App.profile?.id || null,
        });

        if (error) throw error;

        toast('Payment request submitted');
        Report.reset('invoice');
        Router.navigate('feed');
      } catch (err) {
        toast(err.message || 'Failed to submit');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
      }
    });
  },
};

// ── Create Invoice ──────────────────────────────────────────────────────────

Report._invoiceItems = [];

Report.showCreateInvoiceModal = function() {
  Report._invoiceItems = [];
  const name = escapeHtml(App.profile?.name || '');
  showModal(`
    <h3 class="modal-title">Create Invoice</h3>
    <div class="form-group">
      <label>Title</label>
      <input type="text" id="ci-title" placeholder="What was purchased?">
    </div>
    <div class="form-group">
      <label>Purchased by</label>
      <input type="text" id="ci-purchased-by" placeholder="Name" value="${name}">
    </div>
    <div class="form-group">
      <label>Amount to reimburse ($)</label>
      <input type="number" id="ci-amount" placeholder="0.00" step="0.01" min="0">
    </div>
    <div class="form-group">
      <label>Source</label>
      <input type="text" id="ci-source" placeholder="Store or vendor name">
    </div>
    <div class="form-group">
      <label>Items</label>
      <div id="ci-items-list"></div>
      <button type="button" class="btn btn-sm btn-secondary" style="margin-top:10px" onclick="Report.showAddItemModal()">+ Add item</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Report.submitCreateInvoice()">Submit</button>
    </div>
  `);
  Report._renderInvoiceItems();
};

Report._renderInvoiceItems = function() {
  const list = document.getElementById('ci-items-list');
  if (!list) return;
  if (Report._invoiceItems.length === 0) {
    list.innerHTML = '<p class="invoice-empty-items">No items added yet.</p>';
    return;
  }
  const total = Report._invoiceItems.reduce((s, it) => s + it.cost, 0);
  list.innerHTML = `
    <div class="invoice-items-list">
      ${Report._invoiceItems.map((it, i) => `
        <div class="invoice-item-row">
          <span class="invoice-item-name">${escapeHtml(it.name)}</span>
          <span class="invoice-item-cost">${formatCurrency(it.cost)}</span>
          <button class="invoice-item-delete" onclick="Report.removeInvoiceItem(${i})" aria-label="Remove">&times;</button>
        </div>
      `).join('')}
      <div class="invoice-items-total">
        <span>Total</span>
        <span>${formatCurrency(total)}</span>
      </div>
    </div>
  `;
  // Auto-populate amount field from items total
  const amountEl = document.getElementById('ci-amount');
  if (amountEl && !amountEl.dataset.edited) amountEl.value = total.toFixed(2);
};

Report.removeInvoiceItem = function(index) {
  Report._invoiceItems.splice(index, 1);
  Report._renderInvoiceItems();
};

Report.showAddItemModal = function() {
  const overlay = document.getElementById('item-entry-overlay');
  if (!overlay) return;
  document.getElementById('item-entry-name').value = '';
  document.getElementById('item-entry-cost').value = '';
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('item-entry-name')?.focus(), 80);
};

Report.hideAddItemModal = function() {
  document.getElementById('item-entry-overlay')?.classList.remove('open');
};

Report.confirmAddItem = function() {
  const name = document.getElementById('item-entry-name').value.trim();
  const cost = parseFloat(document.getElementById('item-entry-cost').value) || 0;
  if (!name) { toast('Enter an item name'); return; }
  Report._invoiceItems.push({ name, cost });
  Report.hideAddItemModal();
  Report._renderInvoiceItems();
};

Report.submitCreateInvoice = async function() {
  const title    = document.getElementById('ci-title').value.trim();
  const by       = document.getElementById('ci-purchased-by').value.trim();
  const amount   = parseFloat(document.getElementById('ci-amount').value) || 0;
  const source   = document.getElementById('ci-source').value.trim();

  if (!title)          { toast('Enter a title'); return; }
  if (amount <= 0)     { toast('Enter a valid amount'); return; }

  const lines = [];
  if (by)     lines.push(`Purchased by: ${by}`);
  if (source) lines.push(`Source: ${source}`);
  if (Report._invoiceItems.length) {
    const itemsStr = Report._invoiceItems.map(it => `${it.name} (${formatCurrency(it.cost)})`).join(', ');
    lines.push(`Items: ${itemsStr}`);
  }

  const { error } = await sb.from('tasks').insert({
    title: `Invoice: ${title}`,
    description: lines.join('\n') || null,
    cost: amount,
    priority: 'HAVE',
    status: 'Open',
    type: 'reimbursement',
    created_by: App.profile?.id || null,
  });

  if (error) { toast('Failed to submit: ' + error.message); return; }
  hideModal();
  Report._invoiceItems = [];
  toast('Invoice submitted');
  Router.navigate('feed');
};

// Wire up item-entry backdrop dismiss and amount-edited tracking
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('item-entry-overlay')?.addEventListener('click', function(e) {
    if (e.target === this) Report.hideAddItemModal();
  });
  // Track if user manually edits the amount field
  document.addEventListener('input', e => {
    if (e.target?.id === 'ci-amount') e.target.dataset.edited = '1';
  });
});

document.addEventListener('DOMContentLoaded', () => Report.init());
