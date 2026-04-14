// Reimbursement View
const Reimburse = {
  picker: null,

  reset() {
    if (Reimburse.picker) Reimburse.picker.clear();
    const form = document.getElementById('reimburse-form');
    if (form) form.reset();
  },

  init() {
    Reimburse.picker = PhotoPicker.mount('receipt-photo-picker', { label: 'Receipt photo' });

    document.getElementById('reimburse-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const receiptUrl = Reimburse.picker ? await Reimburse.picker.resolve() : null;

        const title = document.getElementById('reimburse-title').value.trim();
        const cost = Number(document.getElementById('reimburse-cost').value);

        if (!title) throw new Error('Enter what was purchased');
        if (!cost || cost <= 0) throw new Error('Enter a valid amount');

        const { error } = await sb.from('tasks').insert({
          title: `Reimbursement: ${title}`,
          description: `Expense submitted by ${App.profile?.name || 'crew member'}`,
          receipt_image_url: receiptUrl,
          cost: cost,
          priority: 'HAVE',
          status: 'To Pay',
          type: 'reimbursement',
          created_by: App.profile?.id || null,
        });

        if (error) throw error;

        toast('Expense submitted for approval');
        Reimburse.reset();
        Router.navigate('feed');
      } catch (err) {
        toast(err.message || 'Failed to submit');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for Reimbursement';
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Reimburse.init());
