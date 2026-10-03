// SMS Compose View — native handoff
const SMS = {
  scheduleText: '',

  async load() {
    const preview = document.getElementById('sms-preview');
    const recipientSelect = document.getElementById('sms-to');
    preview.textContent = 'Loading schedule...';

    // Build today's schedule text
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Get today's rentals (checkouts and checkins)
    const { data: rentals } = await sb.from('rentals')
      .select('*')
      .or(`end_date.eq.${today},start_date.eq.${today},end_date.eq.${tomorrow},start_date.eq.${tomorrow}`)
      .eq('hidden', false)
      .order('start_date');

    // Get open tasks assigned for today or unassigned urgent
    const { data: tasks } = await sb.from('tasks')
      .select('*, assigned_user:users!tasks_assigned_to_fkey(name)')
      .eq('priority', 'HAVE')
      .neq('status', 'Done')
      .order('created_at', { ascending: false });

    // Build message
    let lines = [];
    const todayFormatted = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    lines.push(`📋 STRpal Schedule — ${todayFormatted}`);
    lines.push('');

    // Turnovers
    const checkouts = (rentals || []).filter(r => r.end_date === today);
    const checkins = (rentals || []).filter(r => r.start_date === today);

    if (checkouts.length > 0 || checkins.length > 0) {
      lines.push('🏠 TURNOVERS');
      checkouts.forEach(r => {
        lines.push(`  ▸ OUT: ${r.guest_name || 'Guest'} (checkout today)`);
      });
      checkins.forEach(r => {
        lines.push(`  ▸ IN: ${r.guest_name || 'Guest'} (check-in today)`);
      });
      if (checkouts.length > 0 && checkins.length > 0) {
        lines.push(`  ⏱ Turnover window: 11:00 AM → 4:00 PM`);
      }
      lines.push('');
    }

    // Tomorrow preview
    const tomorrowCheckouts = (rentals || []).filter(r => r.end_date === tomorrow);
    const tomorrowCheckins = (rentals || []).filter(r => r.start_date === tomorrow);
    if (tomorrowCheckouts.length > 0 || tomorrowCheckins.length > 0) {
      lines.push('📅 TOMORROW');
      tomorrowCheckouts.forEach(r => {
        lines.push(`  ▸ OUT: ${r.guest_name || 'Guest'}`);
      });
      tomorrowCheckins.forEach(r => {
        lines.push(`  ▸ IN: ${r.guest_name || 'Guest'}`);
      });
      lines.push('');
    }

    // Tasks
    const urgentTasks = (tasks || []).filter(t => t.type !== 'reimbursement').slice(0, 10);
    if (urgentTasks.length > 0) {
      lines.push('✅ TASKS');
      urgentTasks.forEach(t => {
        const assignee = t.assigned_user?.name || 'Unassigned';
        const blocked = t.is_blocked_by_purchase ? ' ⚠️ needs supplies' : '';
        lines.push(`  ▸ ${t.title} (${assignee})${blocked}`);
      });
      lines.push('');
    }

    if (lines.length <= 2) {
      lines.push('No turnovers or urgent tasks today. 🎉');
    }

    SMS.scheduleText = lines.join('\n');
    preview.textContent = SMS.scheduleText;

    // Populate recipients
    recipientSelect.innerHTML = '<option value="">Select crew member</option>';
    App.allUsers.forEach(u => {
      if (u.phone_number) {
        recipientSelect.innerHTML += `<option value="${escapeHtml(u.phone_number)}">${escapeHtml(u.name)}</option>`;
      }
    });
  },

  init() {
    document.getElementById('sms-send-btn').addEventListener('click', () => {
      const phone = document.getElementById('sms-to').value;
      if (!phone) {
        toast('Select a recipient');
        return;
      }

      // Use sms: URI to open native messaging app
      const body = encodeURIComponent(SMS.scheduleText);
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const separator = isIOS ? '&' : '?';
      const smsUrl = `sms:${phone}${separator}body=${body}`;

      window.open(smsUrl, '_self');
    });
  },
};

document.addEventListener('DOMContentLoaded', () => SMS.init());
