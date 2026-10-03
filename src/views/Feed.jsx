import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import {
  Button, ButtonRound, Card, Checkbox, InputSelect, InputText, InputTextarea,
  Pill, Segment, SegmentedControl, Spinner,
} from '@tomcoggia/ui';
import { ChevronDown, GitCommitHorizontal, List, Pencil, Plus } from 'lucide-react';
import { sb, SUPABASE_URL } from '../lib/supabase.js';
import { formatCurrency, formatDate, isPdfUrl } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { useApp } from '../app/AppContext.jsx';
import { toast } from '../components/Toast.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { PhotoPicker } from '../components/PhotoPicker.jsx';
import { PdfThumbnail } from '../components/PdfThumbnail.jsx';
import './Feed.css';

// Legacy shipped the status/assignee filter bar and both FABs with `hidden`
// and never un-hid them (the per-section ADD buttons replaced them). They are
// ported and wired, but stay off to match. Flip these to bring them back.
const SHOW_FILTERS = false;
const SHOW_FABS = false;

const STATUS_OPTIONS = ['Open', 'In-progress', 'On hold', 'Done'];

function isSimpleItem(task) {
  return !task.description && !task.due_date && task.cost == null;
}

function readCollapsed() {
  try { return JSON.parse(localStorage.getItem('feed_collapsed') || '{}') || {}; } catch { return {}; }
}

// Same order as the tasks query: sort_order asc, then created_at desc
function sortTasks(list) {
  return [...list].sort((a, b) => {
    const sa = a.sort_order ?? Infinity;
    const sbo = b.sort_order ?? Infinity;
    if (sa !== sbo) return sa < sbo ? -1 : 1;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

const STATUS_TONE = { 'In-progress': 'warning', 'On hold': 'muted', Done: 'success' };

// ---------------------------------------------------------------------------

export default function Feed() {
  const { users } = useApp();
  const [tasks, setTasks] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [latestSteps, setLatestSteps] = useState({});
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  const [addType, setAddType] = useState(null);      // 'do' | 'get' | null
  const [quickOpen, setQuickOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [reimbOpen, setReimbOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('tasks')
      .select('*, assigned_user:users!tasks_assigned_to_fkey(name)')
      .neq('type', 'reimbursement')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) { setLoadError(true); setTasks([]); return; }
    setLoadError(false);

    const list = data || [];
    const ids = list.map(t => t.id);
    const latest = {};
    if (ids.length > 0) {
      const { data: steps } = await sb.from('task_steps')
        .select('task_id, text, created_at')
        .in('task_id', ids)
        .order('created_at', { ascending: false });
      if (steps) {
        for (const s of steps) {
          if (!latest[s.task_id]) latest[s.task_id] = s;
        }
      }
    }
    setLatestSteps(latest);
    setTasks(list);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSection = (key) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('feed_collapsed', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(t => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (assigneeFilter === 'unassigned' && t.assigned_to) return false;
      if (assigneeFilter && assigneeFilter !== 'unassigned' && t.assigned_to !== assigneeFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, assigneeFilter]);

  const doCards = filtered.filter(t => t.type === 'do' && t.status !== 'Done');
  const getCards = filtered.filter(t => t.type === 'get' && !isSimpleItem(t) && t.status !== 'Done');
  const simpleGetItems = filtered.filter(t => t.type === 'get' && isSimpleItem(t) && !t.reimbursement_id);
  const acquiredItems = simpleGetItems.filter(t => t.status === 'Done');

  // ---- Drag-to-reorder ----
  const doBodyRef = useRef(null);
  const getBodyRef = useRef(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const loaded = tasks !== null && !loadError;

  const persistOrder = useCallback(async (ids) => {
    const results = await Promise.all(ids.map((id, i) =>
      sb.from('tasks').update({ sort_order: i + 1 }).eq('id', id)
    ));
    if (results.find(r => r.error)) {
      toast('Failed to save new order');
      load();
    }
  }, [load]);

  useEffect(() => {
    if (!loaded) return undefined;
    const sortables = [doBodyRef.current, getBodyRef.current].filter(Boolean).map(body =>
      Sortable.create(body, {
        animation: 150,
        draggable: '.feed-card',
        ghostClass: 'feed-card-drag-ghost',
        chosenClass: 'feed-card-drag-chosen',
        delay: 180,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onEnd: (evt) => {
          const { item, from, oldIndex } = evt;
          const ids = Array.from(from.querySelectorAll('.feed-card')).map(c => c.dataset.id);
          // Put the node back where React rendered it; React re-renders the new order from state.
          from.removeChild(item);
          from.insertBefore(item, from.children[oldIndex] || null);
          if (ids.length === 0) return;

          const pos = new Map(ids.map((id, i) => [id, i + 1]));
          setTasks(prev => (prev ? sortTasks(prev.map(t => (pos.has(t.id) ? { ...t, sort_order: pos.get(t.id) } : t))) : prev));
          persistOrder(ids);
        },
      })
    );
    return () => sortables.forEach(s => { try { s.destroy(); } catch { /* ignore */ } });
  }, [loaded, persistOrder]);

  // ---- Shopping list checkbox ----
  const toggleCheckItem = async (id, nextChecked) => {
    const status = nextChecked ? 'Done' : 'Open';
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status } : t)));
    const { error } = await sb.from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, status: nextChecked ? 'Open' : 'Done' } : t)));
      toast('Failed to update');
    }
  };

  const openAdd = (type) => {
    if (type === 'shopping') setQuickOpen(true);
    else setAddType(type === 'get' ? 'get' : 'do');
  };

  const openReimbursement = () => {
    if (acquiredItems.length === 0) { toast('No acquired items'); return; }
    setReimbOpen(true);
  };

  // ---- Render ----
  let content;
  if (tasks === null) {
    content = <div className="feed-loading"><Spinner size={24} label="Loading" /></div>;
  } else if (loadError) {
    content = <div className="empty-state"><p>Failed to load tasks</p></div>;
  } else {
    const renderCards = (list) => list.map(t => (
      <TaskCard key={t.id} task={t} latestStep={latestSteps[t.id]} />
    ));
    content = (
      <>
        <FeedSection sectionKey="do" label="Need to Do" collapsed={!!collapsed.do} onToggle={toggleSection} onAdd={openAdd} bodyRef={doBodyRef}>
          {doCards.length > 0 ? renderCards(doCards) : <div className="empty-state-sm">Nothing to do right now.</div>}
        </FeedSection>
        <FeedSection sectionKey="get" label="Need to Get" collapsed={!!collapsed.get} onToggle={toggleSection} onAdd={openAdd} bodyRef={getBodyRef}>
          {getCards.length > 0 ? renderCards(getCards) : <div className="empty-state-sm">Nothing to get right now.</div>}
        </FeedSection>
        <FeedSection sectionKey="shopping" label="Shopping List" collapsed={!!collapsed.shopping} onToggle={toggleSection} onAdd={openAdd}>
          {simpleGetItems.length > 0 ? (
            <>
              <div className="feed-checklist">
                {simpleGetItems.map(t => (
                  <CheckItem
                    key={t.id}
                    task={t}
                    checked={t.status === 'Done'}
                    onToggle={toggleCheckItem}
                    onEdit={() => setEditId(t.id)}
                  />
                ))}
              </div>
              {acquiredItems.length > 0 && (
                <Button variant="primary" size="lg" className="btn-block feed-reimb-btn" onClick={openReimbursement}>
                  Submit for Reimbursement
                </Button>
              )}
            </>
          ) : (
            <div className="empty-state-sm">Shopping list is empty.</div>
          )}
        </FeedSection>
      </>
    );
  }

  return (
    <div className="page">
      {SHOW_FILTERS && (
        <div className="feed-filters">
          <InputSelect size="md" aria-label="Status filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </InputSelect>
          <InputSelect size="md" aria-label="Assignee filter" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
            <option value="">Everyone</option>
            <option value="unassigned">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </InputSelect>
        </div>
      )}

      <div className="feed-list">{content}</div>

      {SHOW_FABS && (
        <div className="fab-stack">
          <ButtonRound variant="secondary" size="lg" icon={<List />} aria-label="Quick list" onClick={() => setQuickOpen(true)} />
          <ButtonRound variant="primary" size="xl" icon={<Plus />} aria-label="Add task" onClick={() => setAddType('do')} />
        </div>
      )}

      {addType && (
        <AddTaskSheet initialType={addType} users={users} onClose={() => setAddType(null)} onSaved={load} />
      )}
      {quickOpen && <QuickListSheet onClose={() => setQuickOpen(false)} onSaved={load} />}
      {editId && <EditItemSheet id={editId} onClose={() => setEditId(null)} onSaved={load} />}
      {reimbOpen && (
        <ReimbursementSheet items={acquiredItems} users={users} onClose={() => setReimbOpen(false)} onSaved={load} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FeedSection({ sectionKey, label, collapsed, onToggle, onAdd, bodyRef, children }) {
  return (
    <section className={`feed-section${collapsed ? ' feed-section-collapsed' : ''}`} data-section={sectionKey}>
      <div className="feed-section-header">
        <button
          type="button"
          className="feed-section-toggle"
          aria-expanded={!collapsed}
          onClick={() => onToggle(sectionKey)}
        >
          <ChevronDown className="feed-section-chevron" aria-hidden="true" />
          <span>{label.toUpperCase()}</span>
        </button>
        <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); onAdd(sectionKey); }}>
          Add
        </Button>
      </div>
      <div className="feed-section-body" ref={bodyRef}>{children}</div>
    </section>
  );
}

function TaskCard({ task, latestStep }) {
  const assignee = task.assigned_user?.name || 'Unassigned';
  const badges = [];
  if (task.priority === 'HAVE') badges.push(['urgent', 'Urgent', 'status-badge urgent']);
  if (task.priority === 'WANT') badges.push(['backlog', 'Backlog', 'status-badge warning']);
  if (task.is_blocked_by_purchase && task.type !== 'get') badges.push(['blocked', 'Needs Supply', 'status-badge urgent']);
  if (task.service_type === 'provider' && task.type === 'do') badges.push(['provider', 'Provider', 'status-badge feed-badge-provider']);
  if (task.service_type === 'self' && task.type === 'do') badges.push(['self', 'Self-service', 'status-badge success']);
  if (task.status && task.status !== 'Open') {
    badges.push(['status', task.status, `status-badge ${STATUS_TONE[task.status] || 'info'}`]);
  }

  const open = () => navigate('task-detail', task.id);

  return (
    <Card
      variant="flat"
      className="feed-card card-clickable"
      data-id={task.id}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      }}
    >
      <div className="card-body">
        <div className="feed-card-header">
          <div className="card-title">{task.title}</div>
          {task.cost != null && <span className="text-sm text-muted feed-card-cost">{formatCurrency(task.cost)}</span>}
        </div>
        {badges.length > 0 && (
          <div className="card-meta">
            {badges.map(([k, text, cls]) => <span key={k} className={cls}>{text}</span>)}
          </div>
        )}
        {task.description && <div className="text-sm text-muted feed-card-desc">{task.description.slice(0, 100)}</div>}
        {latestStep && (
          <div className="feed-card-step">
            <GitCommitHorizontal aria-hidden="true" />
            <span>{latestStep.text}</span>
          </div>
        )}
        <div className="text-sm text-muted">
          {assignee}{task.due_date ? ` · Due ${formatDate(task.due_date)}` : ''}
        </div>
        {task.photo_url && (isPdfUrl(task.photo_url) ? (
          <PdfThumbnail
            url={task.photo_url}
            label="PDF attached"
            className="feed-card-pdf"
            // Opens the PDF, not the task
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img className="feed-card-photo" src={task.photo_url} alt="" loading="lazy" />
        ))}
      </div>
    </Card>
  );
}

function CheckItem({ task, checked, onToggle, onEdit }) {
  return (
    <div className={`feed-check-item${checked ? ' feed-check-item-checked' : ''}`}>
      <div className="feed-check-label">
        <Checkbox label={task.title} checked={checked} onChange={(e) => onToggle(task.id, e.target.checked)} />
      </div>
      <ButtonRound
        variant="tertiary"
        size="sm"
        icon={<Pencil />}
        aria-label="Edit item"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task-create sheet

function AddTaskSheet({ initialType, users, onClose, onSaved }) {
  const { profile } = useApp();
  const [type, setType] = useState(initialType === 'get' ? 'get' : 'do');
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', due_date: '', cost: '', blocked: false, url: '',
  });
  const [priority, setPriority] = useState('NORMAL');
  const [service, setService] = useState('self');
  const [fetchStatus, setFetchStatus] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;

  const isGet = type === 'get';
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const togglePriority = (p) => setPriority(cur => (cur === p ? 'NORMAL' : p));

  const fetchTaskUrl = async () => {
    const url = form.url.trim();
    if (!url) { toast('Enter a URL first'); return; }
    setFetchStatus('Fetching...');
    setFetching(true);
    try {
      const resp = await fetch(SUPABASE_URL + '/functions/v1/fetch-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      if (data.error) {
        setFetchStatus('Could not fetch: ' + data.error);
        return;
      }
      const cur = formRef.current;
      const next = { ...cur };
      if (data.title && !next.title) next.title = data.title;
      if (data.price && !next.cost) next.cost = String(data.price);
      if (data.description && !next.description) next.description = data.description;
      if (data.source && !next.description) next.description = `Source: ${data.source}`;
      setForm(f => ({ ...f, title: next.title, cost: next.cost, description: next.description }));
      if (data.image && pickerRef.current) pickerRef.current.setUrl(data.image);
      setFetchStatus('Details fetched — review and edit.');
    } catch (err) {
      setFetchStatus('Fetch failed: ' + err.message);
    } finally {
      setFetching(false);
    }
  };

  const submit = async (e) => {
    e?.preventDefault();
    const title = form.title.trim();
    if (!title) { toast('Enter a title'); return; }
    setSaving(true);

    let photoUrl = null;
    if (pickerRef.current) {
      try { photoUrl = await pickerRef.current.resolve(); } catch {
        setSaving(false);
        toast('Failed to upload photo');
        return;
      }
    }

    const task = {
      title,
      description: form.description.trim() || null,
      photo_url: photoUrl,
      priority,
      status: 'Open',
      type,
      due_date: form.due_date || null,
      cost: form.cost ? Number(form.cost) : null,
      is_blocked_by_purchase: type === 'get' || form.blocked,
      service_type: type === 'do' ? (service || 'self') : 'self',
      created_by: profile?.id || null,
      assigned_to: form.assigned_to || null,
    };

    const { error } = await sb.from('tasks').insert(task);
    setSaving(false);
    onClose();
    if (error) { toast('Failed to create: ' + error.message); return; }
    toast('Item created');
    onSaved();
  };

  // The media block sits at the top for "Need to Get" and at the bottom for
  // "Need to Do". It's moved with CSS `order` so the PhotoPicker keeps its state.
  const mediaOrder = isGet ? 1 : 20;

  return (
    <Sheet
      open
      title="New Item"
      onClose={onClose}
      actions={(
        <>
          <Button variant="tertiary" size="lg" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="feed-add-task-form" loading={saving} disabled={saving}>Create</Button>
        </>
      )}
    >
      <form id="feed-add-task-form" className="form" onSubmit={submit}>
        <div style={{ order: 0 }}>
          <div className="field-label">Type</div>
          <SegmentedControl aria-label="Type" size="md" className="feed-segmented">
            <Segment selected={!isGet} onClick={() => setType('do')}>Need to Do</Segment>
            <Segment selected={isGet} onClick={() => setType('get')}>Need to Get</Segment>
          </SegmentedControl>
        </div>

        <div className="stack feed-field" style={{ order: mediaOrder }}>
          <div>
            <div className="feed-url-row">
              <InputText
                className="grow"
                type="url"
                label="URL"
                placeholder="https://..."
                value={form.url}
                onChange={set('url')}
              />
              <Button variant="secondary" size="md" onClick={fetchTaskUrl} loading={fetching} disabled={fetching}>Fetch</Button>
            </div>
            {fetchStatus && <div className="text-sm text-muted feed-fetch-status">{fetchStatus}</div>}
          </div>
          <div>
            <div className="field-label">Photo or PDF</div>
            <PhotoPicker ref={pickerRef} label="Task photo or PDF" acceptPdf />
          </div>
        </div>

        <div className="feed-field" style={{ order: 2 }}>
          <InputText
            label="Title"
            placeholder={isGet ? 'What needs to be bought?' : 'What needs to be done?'}
            value={form.title}
            onChange={set('title')}
          />
        </div>
        <div className="feed-field" style={{ order: 3 }}>
          <InputTextarea
            label="Description / Notes"
            rows={2}
            placeholder="Details, links, options (optional)"
            value={form.description}
            onChange={set('description')}
          />
        </div>
        <div style={{ order: 4 }}>
          <div className="field-label">Priority</div>
          <div className="row">
            <Pill selected={priority === 'HAVE'} onClick={() => togglePriority('HAVE')}>
              <span className="feed-priority-dot feed-priority-dot-urgent" aria-hidden="true" /> Urgent
            </Pill>
            <Pill selected={priority === 'WANT'} onClick={() => togglePriority('WANT')}>
              <span className="feed-priority-dot feed-priority-dot-later" aria-hidden="true" /> Backlog
            </Pill>
          </div>
        </div>
        <div className="feed-field" style={{ order: 5 }}>
          <InputSelect label="Assign To" value={form.assigned_to} onChange={set('assigned_to')}>
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </InputSelect>
        </div>
        <div className="feed-field" style={{ order: 6 }}>
          <InputText type="date" label="Due Date" value={form.due_date} onChange={set('due_date')} />
        </div>
        <div className="feed-field" style={{ order: 7 }}>
          <InputText
            type="number"
            step="0.01"
            label="Estimated Cost"
            placeholder="0.00"
            value={form.cost}
            onChange={set('cost')}
          />
        </div>
        {!isGet && (
          <div style={{ order: 8 }}>
            <div className="field-label">Service</div>
            <SegmentedControl aria-label="Service" size="md" className="feed-segmented">
              <Segment selected={service === 'self'} onClick={() => setService('self')}>Self-service</Segment>
              <Segment selected={service === 'provider'} onClick={() => setService('provider')}>Service Provider</Segment>
            </SegmentedControl>
          </div>
        )}
        {!isGet && (
          <div style={{ order: 9 }}>
            <Checkbox
              label="Blocked by purchase"
              checked={form.blocked}
              onChange={(e) => setForm(f => ({ ...f, blocked: e.target.checked }))}
            />
          </div>
        )}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Quick shopping list

function QuickListSheet({ onClose, onSaved }) {
  const { profile } = useApp();
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const taRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => taRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) { toast('Enter at least one item'); return; }

    const rows = lines.map(title => ({
      title,
      type: 'get',
      priority: 'NORMAL',
      status: 'Open',
      is_blocked_by_purchase: true,
      created_by: profile?.id || null,
    }));

    setSaving(true);
    const { error } = await sb.from('tasks').insert(rows);
    setSaving(false);
    onClose();
    if (error) { toast('Failed to add items'); return; }
    toast(`${lines.length} item${lines.length > 1 ? 's' : ''} added`);
    onSaved();
  };

  return (
    <Sheet
      open
      title="Quick Shopping List"
      onClose={onClose}
      actions={(
        <>
          <Button variant="tertiary" size="lg" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="feed-quick-list-form" loading={saving} disabled={saving}>Add All</Button>
        </>
      )}
    >
      <form id="feed-quick-list-form" className="form" onSubmit={submit}>
        <InputTextarea
          ref={taRef}
          label="One item per line"
          rows={8}
          placeholder={'Paper towels\nTrash bags\nDish soap\nLight bulbs'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Edit a shopping-list item

function EditItemSheet({ id, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: task } = await sb.from('tasks').select('*').eq('id', id).single();
      if (cancelled) return;
      if (!task) { toast('Item not found'); onClose(); return; }
      setForm({
        title: task.title || '',
        description: task.description || '',
        due_date: task.due_date || '',
        cost: task.cost ?? '',
      });
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return null;

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e?.preventDefault();
    const updates = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      cost: form.cost !== '' && form.cost != null ? Number(form.cost) : null,
      updated_at: new Date().toISOString(),
    };
    if (!updates.title) { toast('Title is required'); return; }

    setSaving(true);
    const { error } = await sb.from('tasks').update(updates).eq('id', id);
    setSaving(false);
    onClose();
    if (error) { toast('Failed to save'); return; }
    toast('Item updated');
    onSaved();
  };

  const remove = async () => {
    const title = form.title.trim();
    const ok = await confirmDialog({
      title: 'Delete Item?',
      body: `This will permanently remove "${title}". This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const { error } = await sb.from('tasks').delete().eq('id', id);
    onClose();
    if (error) { toast('Failed to delete'); return; }
    toast('Item deleted');
    onSaved();
  };

  return (
    <Sheet
      open
      title="Edit Item"
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" tone="danger" size="lg" onClick={remove}>Delete</Button>
          <Button variant="primary" size="lg" type="submit" form="feed-edit-item-form" loading={saving} disabled={saving}>Save</Button>
        </>
      )}
    >
      <form id="feed-edit-item-form" className="form" onSubmit={save}>
        <InputText label="Title" value={form.title} onChange={set('title')} />
        <InputTextarea
          label="Notes / Links"
          rows={3}
          placeholder="Notes, product URLs, options..."
          value={form.description}
          onChange={set('description')}
        />
        <InputText type="date" label="Due Date" value={form.due_date} onChange={set('due_date')} />
        <InputText type="number" step="0.01" label="Estimated Cost" placeholder="0.00" value={form.cost} onChange={set('cost')} />
        <p className="text-sm text-muted">
          Adding any of the above will move this item out of the simple checklist.
        </p>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Reimbursement from acquired shopping-list items

function ReimbursementSheet({ items, users, onClose, onSaved }) {
  const { profile } = useApp();
  // Snapshot the acquired items when the sheet opens, like legacy reading the DOM
  const [rows] = useState(() => items.map(t => ({ id: t.id, title: t.title })));
  const [mode, setMode] = useState('total'); // 'total' | 'per-item'
  const [selected, setSelected] = useState(() => Object.fromEntries(items.map(t => [t.id, true])));
  const [itemCosts, setItemCosts] = useState({});
  const [where, setWhere] = useState('');
  const [who, setWho] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);

  const perItem = mode === 'per-item';

  const sum = rows.reduce((acc, r) => {
    if (!selected[r.id]) return acc;
    const v = Number(itemCosts[r.id] ?? '');
    return Number.isNaN(v) ? acc : acc + v;
  }, 0);

  const submit = async () => {
    const chosen = rows.filter(r => selected[r.id]);
    const ids = chosen.map(r => r.id);
    if (ids.length === 0) { toast('Select at least one item'); return; }

    const whereTrim = where.trim();

    let cost;
    if (perItem) {
      let total = 0;
      let anyEntered = false;
      chosen.forEach(r => {
        const raw = itemCosts[r.id];
        if (raw != null && raw !== '') {
          const v = Number(raw);
          if (!Number.isNaN(v)) { total += v; anyEntered = true; }
        }
      });
      if (!anyEntered || total <= 0) { toast('Enter a cost for at least one item'); return; }
      cost = total;
    } else {
      cost = totalCost;
      if (!cost || Number(cost) <= 0) { toast('Enter the total cost'); return; }
    }

    setSaving(true);
    let receiptUrl = null;
    if (pickerRef.current) {
      try {
        receiptUrl = await pickerRef.current.resolve();
      } catch {
        setSaving(false);
        toast('Failed to upload receipt');
        return;
      }
    }

    const names = chosen.map(r => (r.title || '').trim()).filter(n => n);
    const title = 'Reimbursement: ' + (names.length <= 3
      ? names.join(', ')
      : names.slice(0, 3).join(', ') + ` +${names.length - 3} more`);
    const description = [
      whereTrim ? `Purchased at: ${whereTrim}` : null,
      `Items: ${names.join(', ')}`,
    ].filter(Boolean).join('\n');

    const { data: inserted, error } = await sb.from('tasks').insert({
      title,
      description,
      receipt_image_url: receiptUrl,
      cost: Number(cost),
      priority: 'HAVE',
      status: 'Open',
      type: 'reimbursement',
      created_by: who || profile?.id || null,
      assigned_to: who || null,
    }).select().single();

    if (error) { setSaving(false); toast('Failed to submit: ' + error.message); return; }

    const { error: linkError } = await sb.from('tasks')
      .update({ reimbursement_id: inserted.id, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (linkError) {
      console.error('Failed to link items to reimbursement:', linkError);
      toast('Reimbursement saved, but items not archived');
    }

    setSaving(false);
    onClose();
    toast('Reimbursement submitted');
    onSaved();
  };

  return (
    <Sheet
      open
      title="Submit for Reimbursement"
      onClose={onClose}
      actions={(
        <>
          <Button variant="tertiary" size="lg" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="lg" onClick={submit} loading={saving} disabled={saving}>Submit</Button>
        </>
      )}
    >
      <div className="form">
        <div>
          <div className="field-label">Cost entry</div>
          <SegmentedControl aria-label="Cost entry" size="md" className="feed-segmented">
            <Segment selected={!perItem} onClick={() => setMode('total')}>One total</Segment>
            <Segment selected={perItem} onClick={() => setMode('per-item')}>Per item</Segment>
          </SegmentedControl>
        </div>

        <div>
          <div className="field-label">Select items</div>
          <div className="feed-reimb-items">
            {rows.map(r => (
              <div key={r.id} className="feed-reimb-row">
                <div className="grow">
                  <Checkbox
                    label={r.title}
                    checked={!!selected[r.id]}
                    onChange={(e) => setSelected(s => ({ ...s, [r.id]: e.target.checked }))}
                  />
                </div>
                {perItem && (
                  <InputText
                    className="feed-reimb-cost"
                    size="md"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    aria-label={`Cost for ${r.title}`}
                    value={itemCosts[r.id] ?? ''}
                    onChange={(e) => setItemCosts(c => ({ ...c, [r.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <InputText label="Where purchased" placeholder="e.g. Home Depot, Amazon" value={where} onChange={(e) => setWhere(e.target.value)} />
        <InputSelect label="Purchased by" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Select person</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </InputSelect>

        {perItem ? (
          <div>
            <div className="field-label">Total</div>
            <div className="feed-reimb-sum">{formatCurrency(sum)}</div>
          </div>
        ) : (
          <InputText
            type="number"
            step="0.01"
            label="Total cost"
            placeholder="0.00"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
          />
        )}

        <div>
          <div className="field-label">Receipt photo</div>
          <PhotoPicker ref={pickerRef} label="Receipt photo" />
        </div>
      </div>
    </Sheet>
  );
}
