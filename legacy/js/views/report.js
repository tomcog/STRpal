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
    Report._loadSubmitters();
    const dateEl = document.getElementById('invoice-service-date');
    if (dateEl) dateEl.value = new Date().toLocaleDateString('en-CA');

    if (Report._prefill && Report._prefill.items && Report._prefill.items.length) {
      const titleEl = document.getElementById('invoice-title');
      if (titleEl) titleEl.value = Report._prefill.items.join(', ');
    }
    Report._prefill = null;
  },

  async _loadVendors(selectId) {
    const select = document.getElementById('invoice-vendor-select');
    if (!select) return;
    const { data: vendors } = await sb.from('vendors').select('id, name').order('name');
    const current = selectId || select.value;
    select.innerHTML = '<option value="">— Select vendor —</option>' +
      (vendors || []).map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('') +
      '<option value="__new__">+ Add new vendor…</option>';
    if (current) select.value = current;
  },

  async _loadSubmitters(selectId) {
    const select = document.getElementById('invoice-submitter-select');
    if (!select) return;
    if (!App.allUsers?.length) {
      const { data } = await sb.from('users').select('*');
      App.allUsers = data || [];
    }
    const users = [...(App.allUsers || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    select.innerHTML = '<option value="">— Select submitter —</option>' +
      users.map(u => `<option value="${u.id}">${escapeHtml(u.name || 'Unnamed')}</option>`).join('') +
      '<option value="__new__">+ Add new submitter…</option>';
    select.value = selectId || App.profile?.id || App.allUsers[0]?.id || '';
  },

  // ── Add new vendor (from the payment form) ──
  showAddVendorModal() {
    Admin._editPaymentMethods = [];
    showModal(Admin._renderVendorForm({ title: 'Add Vendor', onSave: 'Report.doAddVendor()' }));
    Admin._renderPaymentMethodRows();
  },

  async doAddVendor() {
    const name = document.getElementById('modal-vendor-name').value.trim();
    if (!name) { toast('Name is required'); return; }
    const { data, error } = await sb.from('vendors').insert({
      name,
      contact_name: document.getElementById('modal-vendor-contact').value.trim() || null,
      trade: document.getElementById('modal-vendor-trade').value.trim() || null,
      phone_number: document.getElementById('modal-vendor-phone').value.trim() || null,
      notes: document.getElementById('modal-vendor-notes').value.trim() || null,
      payment_methods: Admin._collectPaymentMethods(),
    }).select('id').single();
    if (error) { toast('Failed to add vendor'); return; }
    hideModal();
    toast('Vendor added');
    await Report._loadVendors(data.id);
  },

  // ── Add new submitter (from the payment form) ──
  showAddSubmitterModal() {
    showModal(`
      <h3 class="modal-title">Add Submitter</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="modal-submitter-name" placeholder="Full name">
      </div>
      <div class="form-group">
        <label>Phone Number <span class="text-muted" style="font-weight:400">(optional)</span></label>
        <input type="tel" id="modal-submitter-phone" placeholder="+1 (555) 123-4567">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Report.doAddSubmitter()">Add</button>
      </div>
    `);
  },

  async doAddSubmitter() {
    const name = document.getElementById('modal-submitter-name').value.trim();
    const phone = document.getElementById('modal-submitter-phone').value.trim();
    if (!name) { toast('Name is required'); return; }
    const { data, error } = await sb.from('users').insert({
      name,
      phone_number: phone || null,
    }).select('*').single();
    if (error) { toast('Failed to add submitter'); return; }
    App.allUsers = [...(App.allUsers || []), data];
    hideModal();
    toast('Submitter added');
    await Report._loadSubmitters(data.id);
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
    Report.invoicePicker = PhotoPicker.mount('invoice-photo-picker', { label: 'Invoice', showUrl: false });

    // "+ Add new…" options open the matching add flow; the select keeps its previous choice until one is saved
    [['invoice-vendor-select', Report.showAddVendorModal],
     ['invoice-submitter-select', Report.showAddSubmitterModal]].forEach(([id, showAdd]) => {
      const select = document.getElementById(id);
      let prev = '';
      select.addEventListener('focus', () => { prev = select.value; });
      select.addEventListener('change', () => {
        if (select.value !== '__new__') { prev = select.value; return; }
        select.value = prev;
        showAdd();
      });
    });

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
        const vendorId = document.getElementById('invoice-vendor-select').value || null;
        const serviceDate = document.getElementById('invoice-service-date').value;
        const services = document.getElementById('invoice-title').value.trim();
        const amount = Number(document.getElementById('invoice-amount').value);
        const submitterId = document.getElementById('invoice-submitter-select').value || null;

        if (!vendorId) throw new Error('Select a vendor');
        if (!serviceDate) throw new Error('Choose the date billed');
        if (!services) throw new Error('Enter a description of services');
        if (!amount || amount <= 0) throw new Error('Enter a valid amount');
        if (!submitterId) throw new Error('Select who is submitting');

        const lines = [`Date billed: ${serviceDate}`, services];
        if (!receiptUrl) lines.push('No invoice provided');

        const { error } = await sb.from('tasks').insert({
          title: `Invoice: ${services.split('\n')[0]}`,
          description: lines.join('\n'),
          receipt_image_url: receiptUrl,
          cost: amount,
          priority: 'HAVE',
          status: 'Open',
          type: 'reimbursement',
          vendor_id: vendorId,
          created_by: submitterId,
        });

        if (error) throw error;

        toast('Invoice submitted for payment');
        Report.reset('invoice');
        Router.navigate('feed');
      } catch (err) {
        toast(err.message || 'Failed to submit');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Invoice for Payment';
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Report.init());
