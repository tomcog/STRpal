import { useCallback, useEffect, useState } from 'react';
import {
  Button, ButtonRound, Checkbox, InputSelect, InputText, InputTextarea, Segment, SegmentedControl, Spinner,
} from '@tomcoggia/ui';
import { ArrowLeft, Link as LinkIcon, Plus, X } from 'lucide-react';
import { sb } from '../lib/supabase.js';
import { formatCurrency, formatDate, isPdfUrl } from '../lib/format.js';
import { back } from '../lib/router.js';
import { useApp } from '../app/AppContext.jsx';
import { toast } from '../components/Toast.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { openImageViewer } from '../components/ImageViewer.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { OptionsList } from '../components/OptionsList.jsx';
import { PdfThumbnail } from '../components/PdfThumbnail.jsx';
import './TaskDetail.css';

const STATUS_TONE = {
  Open: 'info',
  'In-progress': 'warning',
  'On hold': 'td-tone-hold',
  Done: 'success',
};

const nowIso = () => new Date().toISOString();

// Legacy App.isCrewOnly() — no crew-only restriction exists yet.
const isCrewOnly = () => false;

function Photo({ url, alt, pdfLabel }) {
  if (isPdfUrl(url)) {
    return <div className="td-pdf"><PdfThumbnail url={url} label={pdfLabel} /></div>;
  }
  return (
    <img
      className="td-photo"
      src={url}
      alt={alt}
      role="button"
      tabIndex={0}
      onClick={() => openImageViewer(url)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openImageViewer(url); } }}
    />
  );
}

function Section({ title, children }) {
  return (
    <section className="td-section">
      <div className="section-header"><div className="section-title">{title}</div></div>
      {children}
    </section>
  );
}

export default function TaskDetail({ taskId }) {
  const { users, can, isAdmin } = useApp();
  const [task, setTask] = useState(undefined); // undefined = loading, null = not found
  const [links, setLinks] = useState([]);
  const [steps, setSteps] = useState([]);
  const [stepText, setStepText] = useState('');
  const [busy, setBusy] = useState(false);

  // Sheets
  const [linkForm, setLinkForm] = useState(null);   // { title, url } while open
  const [assignee, setAssignee] = useState(null);   // string while open
  const [edit, setEdit] = useState(null);           // edit form state while open
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('tasks')
      .select('*, assigned_user:users!tasks_assigned_to_fkey(name), rental:rentals!tasks_rental_id_fkey(guest_name, start_date, end_date)')
      .eq('id', taskId)
      .single();

    if (error || !data) { setTask(null); return; }

    const [{ data: l }, { data: s }] = await Promise.all([
      sb.from('task_links').select('*').eq('task_id', taskId).order('created_at', { ascending: true }),
      sb.from('task_steps').select('*').eq('task_id', taskId).order('created_at', { ascending: true }),
    ]);
    setLinks(l || []);
    setSteps(s || []);
    setTask(data);
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  if (task === undefined) {
    return <div className="page"><div className="empty-state"><Spinner size={24} label="Loading" /></div></div>;
  }
  if (task === null) {
    return <div className="page"><div className="empty-state"><p>Task not found</p></div></div>;
  }

  const t = task;
  const isFinance = can('can_manage_finances');
  const canAssign = can('can_assign_tasks');

  // ---- Links ----
  const doAddLink = async (e) => {
    e.preventDefault();
    const title = linkForm.title.trim();
    const url = linkForm.url.trim();
    if (!title) { toast('Enter a title'); return; }
    if (!url) { toast('Enter a URL'); return; }
    setSaving(true);
    const { error } = await sb.from('task_links').insert({ task_id: t.id, title, url });
    setSaving(false);
    setLinkForm(null);
    if (error) { toast('Failed to add link'); return; }
    toast('Link added');
    load();
  };

  const removeLink = async (id) => {
    const { error } = await sb.from('task_links').delete().eq('id', id);
    if (error) { toast('Failed to remove'); return; }
    load();
  };

  // ---- Steps ----
  const doAddStep = async () => {
    const text = stepText.trim();
    if (!text) { toast('Enter a step'); return; }
    setBusy(true);
    const { error } = await sb.from('task_steps').insert({ task_id: t.id, text });
    setBusy(false);
    if (error) { toast('Failed to add step'); return; }
    setStepText('');
    load();
  };

  // ---- Status / actions ----
  const patchTask = async (updates, okMsg, failMsg) => {
    setBusy(true);
    const { error } = await sb.from('tasks')
      .update({ ...updates, updated_at: nowIso() })
      .eq('id', t.id);
    setBusy(false);
    if (error) { toast(failMsg); return; }
    toast(okMsg);
    setTask(prev => ({ ...prev, ...updates }));
  };

  const setStatus = (status) => patchTask({ status }, `Marked as ${status}`, 'Failed to update');
  const markSupplied = () => patchTask({ is_blocked_by_purchase: false }, 'Supplies secured — task is now actionable', 'Failed to update');
  const approveReimbursement = () => patchTask({ status: 'Done' }, 'Reimbursement approved', 'Failed to approve');

  const confirmDelete = async () => {
    const ok = await confirmDialog({
      title: 'Delete Task?',
      body: `This will permanently remove "${t.title}". This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const { error } = await sb.from('tasks').delete().eq('id', t.id);
    if (error) { toast('Failed to delete'); return; }
    toast('Task deleted');
    back();
  };

  // ---- Assign ----
  const doAssign = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await sb.from('tasks')
      .update({ assigned_to: assignee || null, updated_at: nowIso() })
      .eq('id', t.id);
    setSaving(false);
    setAssignee(null);
    if (error) { toast('Failed to assign'); return; }
    toast('Task assigned');
    load();
  };

  // ---- Edit ----
  const openEdit = () => setEdit({
    type: t.type,
    title: t.title || '',
    description: t.description || '',
    priority: t.priority,
    status: t.status,
    assigned_to: t.assigned_to || '',
    due_date: t.due_date || '',
    cost: t.cost ?? '',
    service_type: t.service_type || 'self',
    is_blocked_by_purchase: !!t.is_blocked_by_purchase,
  });
  const setE = (key) => (e) => setEdit(f => ({ ...f, [key]: e.target.value }));

  const doEdit = async (e) => {
    e.preventDefault();
    const newType = edit.type || t.type;
    const cost = String(edit.cost).trim();
    const updates = {
      title: edit.title.trim(),
      description: edit.description.trim() || null,
      priority: edit.priority,
      status: edit.status,
      assigned_to: edit.assigned_to || null,
      due_date: edit.due_date || null,
      cost: cost ? Number(cost) : null,
      type: newType,
      is_blocked_by_purchase: newType === 'get' ? true : edit.is_blocked_by_purchase,
      service_type: newType === 'do' ? (edit.service_type || 'self') : 'self',
      updated_at: nowIso(),
    };

    if (!updates.title) { toast('Title is required'); return; }

    setSaving(true);
    const { error } = await sb.from('tasks').update(updates).eq('id', t.id);
    setSaving(false);
    setEdit(null);
    if (error) { toast('Failed to save'); return; }
    toast('Task updated');
    load();
  };

  const closeSheet = (setter) => () => { if (!saving) setter(null); };
  const showDoFields = edit && edit.type !== 'get' && edit.type !== 'reimbursement';

  // ---- Badges ----
  const badges = [
    <span key="status" className={`status-badge ${STATUS_TONE[t.status] || 'muted'}`}>{t.status}</span>,
  ];
  if (t.priority === 'HAVE') badges.push(<span key="urgent" className="status-badge urgent">Urgent</span>);
  if (t.priority === 'WANT') badges.push(<span key="backlog" className="status-badge td-tone-backlog">Backlog</span>);
  if (t.is_blocked_by_purchase && t.type !== 'get') badges.push(<span key="blocked" className="status-badge urgent">Needs Supply</span>);
  if (t.service_type === 'provider' && t.type === 'do') badges.push(<span key="provider" className="status-badge td-tone-provider">Provider</span>);
  if (t.service_type === 'self' && t.type === 'do') badges.push(<span key="self" className="status-badge success">Self-service</span>);
  if (t.type === 'reimbursement') badges.push(<span key="reimb" className="status-badge td-tone-hold">Reimbursement</span>);

  return (
    <div className="page td-page">
      <div>
        <Button variant="tertiary" size="sm" icon={<ArrowLeft />} onClick={() => back()}>Back</Button>
      </div>

      <div className="stack-sm">
        <h2 className="td-title">{t.title}</h2>
        <div className="row td-badges">{badges}</div>
      </div>

      {t.photo_url && <Photo url={t.photo_url} alt="Task photo" pdfLabel="View PDF" />}

      {t.description && (
        <Section title="Description">
          <p className="text-sm text-muted pre-wrap">{t.description}</p>
        </Section>
      )}

      <Section title="Details">
        <div>
          <div className="detail-field">
            <span className="detail-field-label">Assigned To</span>
            <span className="detail-field-value">{t.assigned_user?.name || 'Unassigned'}</span>
          </div>
          {t.due_date && (
            <div className="detail-field">
              <span className="detail-field-label">Due Date</span>
              <span className="detail-field-value">{formatDate(t.due_date)}</span>
            </div>
          )}
          {isFinance && t.cost != null && (
            <div className="detail-field">
              <span className="detail-field-label">Cost</span>
              <span className="detail-field-value">{formatCurrency(t.cost)}</span>
            </div>
          )}
          {t.rental && (
            <div className="detail-field">
              <span className="detail-field-label">Linked Stay</span>
              <span className="detail-field-value">
                {isCrewOnly() ? 'Guest Stay' : (t.rental.guest_name || 'Guest')}
                {' '}({formatDate(t.rental.start_date)} - {formatDate(t.rental.end_date)})
              </span>
            </div>
          )}
        </div>
      </Section>

      <Section title="Links">
        {links.length > 0 ? (
          <div className="stack-sm">
            {links.map(link => (
              <div key={link.id} className="td-link-row">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="td-link">
                  <LinkIcon aria-hidden="true" />
                  <span className="td-link-title">{link.title}</span>
                </a>
                <ButtonRound variant="tertiary" size="sm" icon={<X />} aria-label="Remove" onClick={() => removeLink(link.id)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state-sm">No links yet</p>
        )}
        <div>
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setLinkForm({ title: '', url: '' })}>Add Link</Button>
        </div>
      </Section>

      <Section title="Steps">
        {steps.length > 0 ? (
          <ol className="td-steps">
            {steps.map(step => (
              <li key={step.id} className="td-step">
                <div className="td-step-text">{step.text}</div>
                <div className="td-step-date">{formatDate(step.created_at.slice(0, 10))}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state-sm">No steps yet</p>
        )}
        <div className="td-step-add">
          <InputTextarea
            aria-label="Add a step"
            rows={2}
            placeholder="Add a step..."
            value={stepText}
            onChange={(e) => setStepText(e.target.value)}
          />
          <div>
            <Button variant="secondary" size="sm" onClick={doAddStep} disabled={busy}>Add</Button>
          </div>
        </div>
      </Section>

      {t.receipt_image_url && isFinance && (
        <Section title="Receipt">
          <Photo url={t.receipt_image_url} alt="Receipt" pdfLabel="View Receipt PDF" />
        </Section>
      )}

      {t.type !== 'reimbursement' && (
        <section className="td-section">
          <OptionsList taskId={t.id} />
        </section>
      )}

      <div className="td-actions">
        {canAssign && (
          <Button variant="secondary" size="lg" className="btn-block" onClick={() => setAssignee(t.assigned_to || '')}>Assign</Button>
        )}
        {t.is_blocked_by_purchase && (canAssign || isFinance) && (
          <Button variant="secondary" size="lg" className="btn-block" onClick={markSupplied} disabled={busy}>Mark Supplies Secured</Button>
        )}
        {t.type === 'reimbursement' && isFinance && t.status !== 'Done' && (
          <Button variant="primary" size="lg" className="btn-block" onClick={approveReimbursement} disabled={busy}>Approve &amp; Mark Paid</Button>
        )}

        {t.status === 'Open' && <>
          <Button variant="secondary" size="lg" className="btn-block" onClick={() => setStatus('In-progress')} disabled={busy}>Start — Mark In-progress</Button>
          <Button variant="primary" size="lg" className="btn-block" onClick={() => setStatus('Done')} disabled={busy}>Mark Done</Button>
        </>}
        {t.status === 'In-progress' && <>
          <Button variant="secondary" size="lg" className="btn-block" onClick={() => setStatus('On hold')} disabled={busy}>Put On Hold</Button>
          <Button variant="primary" size="lg" className="btn-block" onClick={() => setStatus('Done')} disabled={busy}>Mark Done</Button>
        </>}
        {t.status === 'On hold' && <>
          <Button variant="secondary" size="lg" className="btn-block" onClick={() => setStatus('In-progress')} disabled={busy}>Resume — Mark In-progress</Button>
          <Button variant="primary" size="lg" className="btn-block" onClick={() => setStatus('Done')} disabled={busy}>Mark Done</Button>
        </>}

        {isAdmin() && (
          <Button variant="ghost" size="lg" className="btn-block" onClick={openEdit}>Edit Task</Button>
        )}

        <Button variant="secondary" tone="danger" size="lg" className="btn-block" onClick={confirmDelete}>Delete Task</Button>
      </div>

      {/* Add Link */}
      <Sheet
        open={!!linkForm}
        title="Add Link"
        onClose={closeSheet(setLinkForm)}
        actions={<>
          <Button variant="tertiary" size="lg" onClick={closeSheet(setLinkForm)} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="td-link-form" loading={saving} disabled={saving}>Add</Button>
        </>}
      >
        {linkForm && (
          <form id="td-link-form" className="form" onSubmit={doAddLink}>
            <InputText
              label="Title"
              placeholder="e.g. Amazon listing"
              autoFocus
              value={linkForm.title}
              onChange={(e) => setLinkForm(f => ({ ...f, title: e.target.value }))}
            />
            <InputText
              label="URL"
              type="url"
              placeholder="https://..."
              value={linkForm.url}
              onChange={(e) => setLinkForm(f => ({ ...f, url: e.target.value }))}
            />
          </form>
        )}
      </Sheet>

      {/* Assign */}
      <Sheet
        open={assignee !== null}
        title="Assign Task"
        onClose={closeSheet(setAssignee)}
        actions={<>
          <Button variant="tertiary" size="lg" onClick={closeSheet(setAssignee)} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="td-assign-form" loading={saving} disabled={saving}>Save</Button>
        </>}
      >
        {assignee !== null && (
          <form id="td-assign-form" className="form" onSubmit={doAssign}>
            <InputSelect label="Assigned To" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </InputSelect>
          </form>
        )}
      </Sheet>

      {/* Edit */}
      <Sheet
        open={!!edit}
        title="Edit Task"
        onClose={closeSheet(setEdit)}
        actions={<>
          <Button variant="tertiary" size="lg" onClick={closeSheet(setEdit)} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="td-edit-form" loading={saving} disabled={saving}>Save</Button>
        </>}
      >
        {edit && (
          <form id="td-edit-form" className="form" onSubmit={doEdit}>
            {t.type !== 'reimbursement' && (
              <div>
                <div className="field-label">Type</div>
                <SegmentedControl aria-label="Type" size="md" className="td-segmented">
                  <Segment selected={edit.type === 'do'} onClick={() => setEdit(f => ({ ...f, type: 'do' }))}>Need to Do</Segment>
                  <Segment selected={edit.type === 'get'} onClick={() => setEdit(f => ({ ...f, type: 'get' }))}>Need to Get</Segment>
                </SegmentedControl>
              </div>
            )}
            <InputText label="Title" value={edit.title} onChange={setE('title')} />
            <InputTextarea label="Description" rows={3} value={edit.description} onChange={setE('description')} />
            <div className="form-row">
              <InputSelect label="Priority" value={edit.priority} onChange={setE('priority')}>
                <option value="HAVE">Urgent</option>
                <option value="NORMAL">Normal</option>
                <option value="WANT">Backlog</option>
              </InputSelect>
              <InputSelect label="Status" value={edit.status} onChange={setE('status')}>
                <option value="Open">Open</option>
                <option value="In-progress">In-progress</option>
                <option value="On hold">On hold</option>
                <option value="Done">Done</option>
              </InputSelect>
            </div>
            <InputSelect label="Assigned To" value={edit.assigned_to} onChange={setE('assigned_to')}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </InputSelect>
            <div className="form-row">
              <InputText label="Due Date" type="date" value={edit.due_date} onChange={setE('due_date')} />
              <InputText label="Cost" type="number" step="0.01" value={edit.cost} onChange={setE('cost')} />
            </div>
            {showDoFields && <>
              <div>
                <div className="field-label">Service</div>
                <SegmentedControl aria-label="Service" size="md" className="td-segmented">
                  <Segment selected={edit.service_type === 'self'} onClick={() => setEdit(f => ({ ...f, service_type: 'self' }))}>Self-service</Segment>
                  <Segment selected={edit.service_type === 'provider'} onClick={() => setEdit(f => ({ ...f, service_type: 'provider' }))}>Service Provider</Segment>
                </SegmentedControl>
              </div>
              <Checkbox
                label="Blocked by purchase"
                checked={edit.is_blocked_by_purchase}
                onChange={(e) => setEdit(f => ({ ...f, is_blocked_by_purchase: e.target.checked }))}
              />
            </>}
          </form>
        )}
      </Sheet>
    </div>
  );
}
