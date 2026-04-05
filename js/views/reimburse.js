// Reimbursement View
const Reimburse = {
  photoFile: null,

  reset() {
    Reimburse.photoFile = null;
    const form = document.getElementById('reimburse-form');
    if (form) form.reset();
    const preview = document.getElementById('receipt-photo-preview');
    if (preview) { preview.hidden = true; preview.src = ''; }
    const label = document.querySelector('#view-reimburse .photo-capture-label');
    if (label) label.classList.remove('has-photo');
  },

  init() {
    document.getElementById('receipt-photo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      Reimburse.photoFile = file;
      const preview = document.getElementById('receipt-photo-preview');
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
      document.querySelector('#view-reimburse .photo-capture-label').classList.add('has-photo');
    });

    document.getElementById('reimburse-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        let receiptUrl = null;
        if (Reimburse.photoFile) {
          receiptUrl = await uploadPhoto('photos', Reimburse.photoFile);
        }

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
