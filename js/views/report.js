// Report Issue View — quick intake
const Report = {
  picker: null,
  priority: 'HAVE',

  reset() {
    if (Report.picker) Report.picker.clear();
    Report.priority = 'HAVE';
    const form = document.getElementById('report-form');
    if (form) form.reset();

    document.querySelectorAll('#view-report .priority-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.priority === 'HAVE');
    });
  },

  init() {
    Report.picker = PhotoPicker.mount('report-photo-picker', { label: 'Issue photo' });

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
        const photoUrl = Report.picker ? await Report.picker.resolve() : null;
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
        Report.reset();
        Router.navigate('feed');
      } catch (err) {
        toast('Failed to submit: ' + (err.message || 'Unknown error'));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Issue';
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Report.init());
