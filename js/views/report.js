// Report View — two modes: 'issue' (damage/repair) and 'invoice' (payment/reimbursement)
const Report = {
  issuePicker: null,
  invoicePicker: null,
  priority: 'HAVE',
  mode: 'issue',

  reset(mode) {
    Report.setMode(mode === 'invoice' ? 'invoice' : 'issue');

    if (Report.issuePicker) Report.issuePicker.clear();
    if (Report.invoicePicker) Report.invoicePicker.clear();

    Report.priority = 'HAVE';
    document.getElementById('report-form')?.reset();
    document.getElementById('invoice-form')?.reset();

    document.querySelectorAll('#view-report .priority-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.priority === 'HAVE');
    });

    Report._loadVendors();
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
          status: 'To Pay',
          type: 'reimbursement',
          vendor_id: vendorId,
          created_by: App.profile?.id || null,
        });

        if (error) throw error;

        toast('Invoice submitted for payment');
        Report.reset('invoice');
        Router.navigate('feed');
      } catch (err) {
        toast(err.message || 'Failed to submit');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Invoice';
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Report.init());
