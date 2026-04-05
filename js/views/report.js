// Report Issue View — quick intake
const Report = {
  photoFile: null,
  priority: 'HAVE',

  reset() {
    Report.photoFile = null;
    Report.priority = 'HAVE';
    const form = document.getElementById('report-form');
    if (form) form.reset();
    const preview = document.getElementById('report-photo-preview');
    if (preview) { preview.hidden = true; preview.src = ''; }
    const label = document.querySelector('#view-report .photo-capture-label');
    if (label) label.classList.remove('has-photo');

    // Reset priority buttons
    document.querySelectorAll('#view-report .priority-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.priority === 'HAVE');
    });
  },

  init() {
    // Photo capture
    document.getElementById('report-photo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      Report.photoFile = file;
      const preview = document.getElementById('report-photo-preview');
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
      document.querySelector('#view-report .photo-capture-label').classList.add('has-photo');
    });

    // Priority toggle
    document.querySelectorAll('#view-report .priority-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#view-report .priority-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Report.priority = btn.dataset.priority;
      });
    });

    // Submit
    document.getElementById('report-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        let photoUrl = null;
        if (Report.photoFile) {
          photoUrl = await uploadPhoto('photos', Report.photoFile);
        }

        const note = document.getElementById('report-note').value.trim();

        const { error } = await sb.from('tasks').insert({
          title: note || 'Reported Issue',
          description: note || null,
          photo_url: photoUrl,
          priority: Report.priority,
          status: 'Open',
          type: 'task',
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
