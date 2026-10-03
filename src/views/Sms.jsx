import { useEffect, useState } from 'react';
import { Button, InputSelect } from '@tomcoggia/ui';
import { sb } from '../lib/supabase.js';
import { useApp } from '../app/AppContext.jsx';
import { toast } from '../components/Toast.jsx';
import './Sms.css';

// Builds today's schedule text — same queries and wording as legacy SMS.load()
async function buildScheduleText() {
  const today = new Date().toLocaleDateString('en-CA');
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');

  // Get today's rentals (checkouts and checkins)
  const { data: rentals } = await sb.from('rentals')
    .select('*')
    .or(`end_date.eq.${today},start_date.eq.${today},end_date.eq.${tomorrow},start_date.eq.${tomorrow}`)
    .eq('hidden', false)
    .order('start_date');

  // Get open urgent tasks
  const { data: tasks } = await sb.from('tasks')
    .select('*, assigned_user:users!tasks_assigned_to_fkey(name)')
    .eq('priority', 'HAVE')
    .neq('status', 'Done')
    .order('created_at', { ascending: false });

  const lines = [];
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

  return lines.join('\n');
}

export default function Sms() {
  const { users } = useApp();
  const [text, setText] = useState(null); // null = loading
  const [phone, setPhone] = useState('');

  useEffect(() => {
    let alive = true;
    buildScheduleText().then(t => { if (alive) setText(t); });
    return () => { alive = false; };
  }, []);

  function send() {
    if (!phone) {
      toast('Select a recipient');
      return;
    }
    // Use sms: URI to open native messaging app
    const body = encodeURIComponent(text || '');
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const separator = isIOS ? '&' : '?';
    window.open(`sms:${phone}${separator}body=${body}`, '_self');
  }

  return (
    <div className="page">
      <h2 className="view-heading">Today's Schedule</h2>
      <div className="sms-preview-box">{text ?? 'Loading schedule...'}</div>
      <div className="sms-recipient">
        <InputSelect label="Send to:" value={phone} onChange={(e) => setPhone(e.target.value)}>
          <option value="">Select crew member</option>
          {users.filter(u => u.phone_number).map(u => (
            <option key={u.id} value={u.phone_number}>{u.name}</option>
          ))}
        </InputSelect>
      </div>
      <Button variant="primary" size="lg" className="btn-block" onClick={send}>Open in Messages</Button>
    </div>
  );
}
