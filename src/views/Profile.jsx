import { useState } from 'react';
import { Button, Checkbox, InputSelect, InputText, InputTextarea } from '@tomcoggia/ui';
import { sb } from '../lib/supabase.js';
import { formatPhone } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { useApp } from '../app/AppContext.jsx';
import { toast } from '../components/Toast.jsx';
import { Sheet } from '../components/Sheet.jsx';
import './Profile.css';

const EMPTY_TASK = {
  title: '',
  description: '',
  priority: 'HAVE',
  assigned_to: '',
  due_date: '',
  is_blocked_by_purchase: false,
};

export default function Profile() {
  const { profile, users, usersLoaded } = useApp();
  const [task, setTask] = useState(null); // null = sheet closed
  const [saving, setSaving] = useState(false);

  if (!usersLoaded) {
    return <div className="page"><div className="empty-state">Loading…</div></div>;
  }
  if (!profile || !profile.id) {
    return <div className="page"><div className="empty-state"><p>No profile loaded</p></div></div>;
  }

  const setField = (field, value) => setTask(t => ({ ...t, [field]: value }));

  async function doCreateTask() {
    const title = task.title.trim();
    if (!title) { toast('Enter a title'); return; }

    const row = {
      title,
      description: task.description.trim() || null,
      priority: task.priority,
      status: 'Open',
      type: 'task',
      due_date: task.due_date || null,
      is_blocked_by_purchase: task.is_blocked_by_purchase,
      created_by: profile?.id || null,
      assigned_to: task.assigned_to || null,
    };

    setSaving(true);
    const { error } = await sb.from('tasks').insert(row);
    setSaving(false);
    setTask(null);
    if (error) { toast('Failed to create task'); return; }
    toast('Task created');
    navigate('feed');
  }

  return (
    <div className="page">
      <div className="profile-name">{profile.name}</div>
      <div className="profile-phone">{formatPhone(profile.phone_number)}</div>

      <div className="stack profile-links">
        <Button variant="secondary" size="lg" className="btn-block" onClick={() => navigate('report', 'invoice')}>
          Submit Invoice
        </Button>
        <Button variant="secondary" size="lg" className="btn-block" onClick={() => navigate('sms')}>
          Compose Schedule SMS
        </Button>
        <Button variant="secondary" size="lg" className="btn-block" onClick={() => setTask({ ...EMPTY_TASK })}>
          + Create Task
        </Button>
      </div>

      <Sheet
        open={!!task}
        title="New Task"
        onClose={() => setTask(null)}
        actions={
          <>
            <Button variant="tertiary" size="lg" onClick={() => setTask(null)}>Cancel</Button>
            <Button variant="primary" size="lg" type="submit" form="profile-task-form" loading={saving} disabled={saving}>
              Create
            </Button>
          </>
        }
      >
        {task && (
          <form id="profile-task-form" className="form" onSubmit={(e) => { e.preventDefault(); doCreateTask(); }}>
            <InputText
              label="Title"
              placeholder="What needs to be done?"
              value={task.title}
              onChange={(e) => setField('title', e.target.value)}
            />
            <InputTextarea
              label="Description"
              rows={2}
              placeholder="Details (optional)"
              value={task.description}
              onChange={(e) => setField('description', e.target.value)}
            />
            <InputSelect label="Priority" value={task.priority} onChange={(e) => setField('priority', e.target.value)}>
              <option value="HAVE">Must Do (urgent)</option>
              <option value="WANT">Wish List</option>
            </InputSelect>
            <InputSelect label="Assign To" value={task.assigned_to} onChange={(e) => setField('assigned_to', e.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </InputSelect>
            <InputText
              type="date"
              label="Due Date"
              value={task.due_date}
              onChange={(e) => setField('due_date', e.target.value)}
            />
            <Checkbox
              label="Needs supplies first"
              checked={task.is_blocked_by_purchase}
              onChange={(e) => setField('is_blocked_by_purchase', e.target.checked)}
            />
          </form>
        )}
      </Sheet>
    </div>
  );
}
