import { useEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, InputSelect, InputText, InputTextarea, Spinner } from '@tomcoggia/ui';
import { ChevronDown, FileBarChart, FileText, Plus } from 'lucide-react';
import { sb } from '../lib/supabase.js';
import { formatDate, formatPhone, formatCurrency, isPdfUrl, todayStr } from '../lib/format.js';
import { payeeName } from '../lib/payments.js';
import { useApp } from '../app/AppContext.jsx';
import { toast } from '../components/Toast.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { openImageViewer } from '../components/ImageViewer.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { PhotoPicker } from '../components/PhotoPicker.jsx';
import { VendorSheet, paymentMethodKey, paymentMethodLabel } from '../components/VendorForm.jsx';
import { PaymentReportSheet } from './PaymentReport.jsx';
import './Admin.css';

// Admin: payments to make, vendors, and team management.

const COLLAPSE_KEY = 'admin_collapsed';
const DEFAULT_COLLAPSED = { vendors: true, team: true, completed: true };

function readCollapsed() {
  try {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    return stored ? JSON.parse(stored) : { ...DEFAULT_COLLAPSED };
  } catch { return { ...DEFAULT_COLLAPSED }; }
}

const PERMISSIONS = [
  { key: 'is_admin', label: 'Administrator', chip: 'Admin' },
  { key: 'can_view_calendar', label: 'View Calendar', chip: 'Calendar' },
  { key: 'can_manage_finances', label: 'Manage Finances', chip: 'Finances' },
  { key: 'can_assign_tasks', label: 'Assign Tasks', chip: 'Assign' },
  { key: 'can_view_inventory', label: 'View Inventory', chip: 'Inventory' },
];

// "Items: a, b, c" line in a reimbursement description -> ['a', 'b', 'c']
function parseReimbItems(description) {
  if (!description) return [];
  const match = description.match(/Items:\s*(.+)/);
  if (!match) return [];
  return match[1].split(',').map(s => s.trim()).filter(Boolean);
}

const dateOnly = (ts) => (ts ? ts.split('T')[0] : null);

function exportReimbursements(paid) {
  const lines = ['PAYMENT REPORT', ''];
  let total = 0;

  const sorted = [...paid].sort((a, b) =>
    (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || ''),
  );

  sorted.forEach(r => {
    const paidDate = r.updated_at ? r.updated_at.split('T')[0] : 'Unknown';
    const submittedDate = r.created_at ? r.created_at.split('T')[0] : 'Unknown';
    const who = r.creator?.name || 'Unknown';
    const items = parseReimbItems(r.description);
    const amount = Number(r.cost) || 0;
    total += amount;

    lines.push(`Date paid: ${paidDate}`);
    lines.push(`Paid to: ${payeeName(r) || 'Unknown'}`);
    if (r.recipient?.name && r.vendor?.name) lines.push(`Purchased from: ${r.vendor.name}`);
    lines.push(`Submitted: ${submittedDate} by ${who}`);
    lines.push(`Amount: $${amount.toFixed(2)}`);
    if (items.length > 0) {
      lines.push('Items:');
      items.forEach(i => lines.push(`  - ${i}`));
    }
    lines.push('');
  });

  lines.push('---');
  lines.push(`Total: $${total.toFixed(2)} (${sorted.length} payment${sorted.length !== 1 ? 's' : ''})`);

  const text = lines.join('\n');
  if (navigator.share) {
    navigator.share({ title: 'Payment Report', text }).catch(() => downloadReport(text));
  } else {
    downloadReport(text);
  }
}

function downloadReport(text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'payment-report.txt';
  a.click();
  URL.revokeObjectURL(url);
}

const activate = (fn) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
});

export default function Admin() {
  const { profile, setUsers, updateProfile } = useApp();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [reimbs, setReimbs] = useState(null);
  const [vendors, setVendors] = useState(null);
  const [vendorsError, setVendorsError] = useState(false);
  const [team, setTeam] = useState(null);
  const [teamError, setTeamError] = useState(false);

  const [editingReimb, setEditingReimb] = useState(null);
  const [vendorSheet, setVendorSheet] = useState(null); // { vendor: row|null }
  const [userSheet, setUserSheet] = useState(null); // { user: row|null }
  const [reportOpen, setReportOpen] = useState(false);

  const toggle = (key) => setCollapsed(c => {
    const next = { ...c, [key]: !c[key] };
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const loadReimbursements = async () => {
    const { data } = await sb.from('tasks')
      .select('*, creator:users!tasks_created_by_fkey(name), recipient:users!tasks_assigned_to_fkey(name), vendor:vendors!tasks_vendor_id_fkey(name, payment_methods)')
      .eq('type', 'reimbursement')
      .order('created_at', { ascending: false });
    setReimbs(data || []);
  };

  const loadVendors = async () => {
    const { data, error } = await sb.from('vendors').select('*').order('name');
    if (error) { setVendorsError(true); return; }
    setVendorsError(false);
    setVendors(data || []);
  };

  const loadUsers = async () => {
    const { data, error } = await sb.from('users').select('*').order('name');
    if (error) { setTeamError(true); return; }
    setTeamError(false);
    setTeam(data || []);
    setUsers(data || []);
  };

  useEffect(() => {
    loadReimbursements();
    loadVendors();
    loadUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = (reimbs || []).filter(r => r.status !== 'Done');
  const paid = (reimbs || []).filter(r => r.status === 'Done');

  return (
    <div className="page page-wide admin-page">
      <div className="row-end">
        <Button variant="secondary" size="md" icon={<FileBarChart />} onClick={() => setReportOpen(true)} disabled={!reimbs}>
          Payment report
        </Button>
      </div>

      {reimbs && reimbs.length > 0 && (<>
        <AdminSection id="reimbursements" title="PENDING PAYMENTS" collapsed={!!collapsed.reimbursements} onToggle={toggle}>
          {pending.length > 0
            ? pending.map(r => <PendingCard key={r.id} r={r} onOpen={() => setEditingReimb(r)} />)
            : <div className="empty-state-sm">No pending payments</div>}
        </AdminSection>

        <AdminSection
          id="completed"
          title="COMPLETED"
          collapsed={!!collapsed.completed}
          onToggle={toggle}
          action={paid.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => exportReimbursements(paid)}>Export</Button>
          )}
        >
          {paid.length > 0
            ? paid.map(r => <PaidChip key={r.id} r={r} onOpen={() => setEditingReimb(r)} />)
            : <div className="empty-state-sm">No completed payments</div>}
        </AdminSection>
      </>)}

      <AdminSection id="vendors" title="VENDORS" collapsed={!!collapsed.vendors} onToggle={toggle}>
        {vendorsError ? (
          <div className="empty-state-sm">Failed to load vendors</div>
        ) : vendors && (<>
          {vendors.length === 0 ? (
            <div className="empty-state-sm">No vendors yet</div>
          ) : (
            <div className="card-list">
              {vendors.map(v => <VendorCard key={v.id} v={v} onOpen={() => setVendorSheet({ vendor: v })} />)}
            </div>
          )}
          <Button variant="secondary" size="lg" className="btn-block" icon={<Plus />} onClick={() => setVendorSheet({ vendor: null })}>
            Add Vendor
          </Button>
        </>)}
      </AdminSection>

      <AdminSection id="team" title="TEAM MANAGEMENT" collapsed={!!collapsed.team} onToggle={toggle}>
        {teamError ? (
          <div className="empty-state">Failed to load users</div>
        ) : !team ? (
          <div className="admin-loading"><Spinner size={24} label="Loading" /></div>
        ) : (<>
          {team.length === 0 ? (
            <div className="empty-state-sm">No team members yet</div>
          ) : (
            <div className="card-list">
              {team.map(u => <UserCard key={u.id} u={u} onOpen={() => setUserSheet({ user: u })} />)}
            </div>
          )}
          <Button variant="secondary" size="lg" className="btn-block" icon={<Plus />} onClick={() => setUserSheet({ user: null })}>
            Add Team Member
          </Button>
        </>)}
      </AdminSection>

      {editingReimb && editingReimb.status === 'Done' && (
        <PaidReimbSheet r={editingReimb} onClose={() => setEditingReimb(null)} />
      )}
      {editingReimb && editingReimb.status !== 'Done' && (
        <EditableReimbSheet
          r={editingReimb}
          vendors={vendors || []}
          onClose={() => setEditingReimb(null)}
          onDone={() => { setEditingReimb(null); loadReimbursements(); }}
        />
      )}

      <PaymentReportSheet open={reportOpen} payments={reimbs} onClose={() => setReportOpen(false)} />

      <VendorSheet
        open={!!vendorSheet}
        vendor={vendorSheet?.vendor || null}
        onClose={() => setVendorSheet(null)}
        onSaved={() => {
          toast(vendorSheet?.vendor ? 'Vendor updated' : 'Vendor added');
          setVendorSheet(null);
          loadVendors();
        }}
        onDelete={() => {
          toast('Vendor deleted');
          setVendorSheet(null);
          loadVendors();
        }}
      />

      {userSheet && (
        <UserSheet
          user={userSheet.user}
          onClose={() => setUserSheet(null)}
          onSaved={(userId, updates) => {
            if (userId && userId === profile?.id) updateProfile(updates);
            setUserSheet(null);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

// ---- Layout pieces ----

function AdminSection({ id, title, collapsed, onToggle, action, children }) {
  const bodyId = `admin-section-${id}`;
  return (
    <section className={`admin-section${collapsed ? ' is-collapsed' : ''}`}>
      <div className="section-header">
        <button
          type="button"
          className="admin-section-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => onToggle(id)}
        >
          <ChevronDown className="admin-section-chevron" size={16} aria-hidden="true" />
          <span>{title}</span>
        </button>
        {action}
      </div>
      {!collapsed && <div className="admin-section-body" id={bodyId}>{children}</div>}
    </section>
  );
}

function PendingCard({ r, onOpen }) {
  const overdue = r.due_date && r.due_date < todayStr();
  const submitter = r.creator?.name || 'Unknown';
  return (
    <Card variant="flat" className="card-clickable" {...activate(onOpen)}>
      <div className="card-body">
        <div className="row-between">
          <div className="card-title">{payeeName(r) || 'Payment'}</div>
          <span className="admin-amount">{formatCurrency(r.cost)}</span>
        </div>
        <div className="card-meta">
          <span className="status-badge info">To Pay</span>
          {r.due_date && (
            <span className={`status-badge ${overdue ? 'urgent' : 'warning'}`}>Due {formatDate(r.due_date)}</span>
          )}
        </div>
        {r.recipient?.name && r.vendor?.name && (
          <div className="text-sm text-muted">Bought from {r.vendor.name}</div>
        )}
        <div className="text-sm text-muted">{submitter} · Submitted {formatDate(dateOnly(r.created_at))}</div>
        {r.receipt_image_url && <div className="text-sm text-muted">Receipt attached</div>}
      </div>
    </Card>
  );
}

function PaidChip({ r, onOpen }) {
  const paidDate = r.updated_at ? formatDate(dateOnly(r.updated_at)) : '';
  const paidTo = payeeName(r) || 'Payment';
  return (
    <button type="button" className="admin-chip-row" onClick={onOpen}>
      <span className="admin-chip-row-label">{paidDate ? `${paidDate} — ` : ''}{paidTo}</span>
      <span className="admin-chip-row-amount">{formatCurrency(r.cost)}</span>
    </button>
  );
}

function VendorCard({ v, onOpen }) {
  const meta = [v.trade, v.contact_name, formatPhone(v.phone_number)].filter(Boolean).join(' · ');
  const methods = Array.isArray(v.payment_methods) ? v.payment_methods : [];
  return (
    <Card variant="flat" className="card-clickable" {...activate(onOpen)}>
      <div className="card-body">
        <div className="card-title">{v.name}</div>
        {meta && <div className="text-sm text-muted">{meta}</div>}
        {methods.length > 0 && (
          <div className="admin-chips">
            {methods.map((m, i) => <span key={i} className="admin-chip is-on">{paymentMethodLabel(m)}</span>)}
          </div>
        )}
        {v.notes && <div className="text-sm text-muted">{v.notes}</div>}
      </div>
    </Card>
  );
}

function UserCard({ u, onOpen }) {
  const perms = PERMISSIONS.filter(p => u[p.key]);
  return (
    <Card variant="flat" className="card-clickable" {...activate(onOpen)}>
      <div className="card-body">
        <div className="card-title">{u.name}</div>
        <div className="text-sm text-muted">{formatPhone(u.phone_number) || 'No phone'}</div>
        <div className="admin-chips">
          {perms.length > 0
            ? perms.map(p => <span key={p.key} className="admin-chip is-on">{p.chip}</span>)
            : <span className="text-sm text-muted">Crew (basic access)</span>}
        </div>
      </div>
    </Card>
  );
}

// ---- Reimbursement sheets ----

function PaidReimbSheet({ r, onClose }) {
  const who = r.creator?.name || 'Unknown';
  const items = parseReimbItems(r.description);
  const purchasedAt = r.description?.match(/Purchased at:\s*(.+)/)?.[1]?.trim();

  return (
    <Sheet
      open
      title="Payment"
      onClose={onClose}
      actions={<Button variant="tertiary" size="lg" className="btn-block" onClick={onClose}>Close</Button>}
    >
      <div className="stack">
        <div>
          <Field label="For">{r.title || ''}</Field>
          <Field label="Amount"><span className="text-strong">{formatCurrency(r.cost)}</span></Field>
        </div>

        {items.length > 0 && (
          <div>
            <div className="section-title admin-subtitle">Items</div>
            <ul className="admin-items">
              {items.map((i, n) => <li key={n}>{i}</li>)}
            </ul>
          </div>
        )}

        <div>
          {r.recipient?.name && <Field label="Reimbursed to">{r.recipient.name}</Field>}
          {purchasedAt && <Field label="Purchased at">{purchasedAt}</Field>}
          {r.vendor?.name && !(purchasedAt && r.recipient?.name) && (
            <Field label={r.recipient?.name ? 'Vendor or seller' : 'Vendor'}>{r.vendor.name}</Field>
          )}
          <Field label="Submitted by">{who}</Field>
          <Field label="Submitted">{formatDate(dateOnly(r.created_at))}</Field>
          {r.due_date && <Field label="Was due">{formatDate(r.due_date)}</Field>}
          {r.payment_method && <Field label="Paid via">{paymentMethodLabel(r.payment_method)}</Field>}
          {r.updated_at && (
            <Field label="Reimbursed"><span className="text-success">{formatDate(dateOnly(r.updated_at))}</span></Field>
          )}
        </div>

        {r.receipt_image_url && (isPdfUrl(r.receipt_image_url) ? (
          <div>
            <a className="pdf-chip" href={r.receipt_image_url} target="_blank" rel="noopener noreferrer">
              <FileText aria-hidden="true" />
              <span>View Receipt PDF</span>
            </a>
          </div>
        ) : (
          <img
            className="admin-receipt"
            src={r.receipt_image_url}
            alt="Receipt"
            onClick={() => openImageViewer(r.receipt_image_url)}
          />
        ))}
      </div>
    </Sheet>
  );
}

function EditableReimbSheet({ r, vendors, onClose, onDone }) {
  const who = r.creator?.name || 'Unknown';
  const pickerRef = useRef(null);
  const [form, setForm] = useState({
    title: r.title || '',
    cost: r.cost ?? '',
    description: r.description || '',
    vendorId: r.vendor_id || '',
    due: r.due_date || '',
    paymentKey: r.payment_method ? paymentMethodKey(r.payment_method) : '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  // The vendor drives which payment methods are offered - unless this pays a
  // person back, when the vendor is just where it was bought
  const recipientName = r.recipient?.name || null;
  const vendor = vendors.find(v => v.id === form.vendorId)
    || (form.vendorId && form.vendorId === r.vendor_id ? r.vendor : null);
  const methods = !recipientName && Array.isArray(vendor?.payment_methods) ? vendor.payment_methods : [];

  const onVendorChange = (e) => setForm(f => ({ ...f, vendorId: e.target.value, paymentKey: '' }));

  const collectEdits = async () => {
    const title = form.title.trim();
    const desc = form.description.trim();
    if (!title) { toast('Title is required'); return null; }
    const cost = form.cost === '' ? null : Number(form.cost);
    if (cost == null || isNaN(cost) || cost <= 0) { toast('Enter a valid amount'); return null; }

    let receiptUrl = r.receipt_image_url || null;
    if (pickerRef.current) {
      try {
        receiptUrl = await pickerRef.current.resolve();
      } catch {
        toast('Failed to upload receipt');
        return null;
      }
    }

    const updates = {
      title,
      description: desc || null,
      cost,
      vendor_id: form.vendorId || null,
      receipt_image_url: receiptUrl,
      due_date: form.due || null,
    };
    // Only touch payment_method when the "Pay with" select is showing
    if (methods.length > 0) {
      updates.payment_method = (form.paymentKey && methods.find(m => paymentMethodKey(m) === form.paymentKey)) || null;
    }
    return updates;
  };

  const run = async (build, failMsg, okMsg) => {
    setBusy(true);
    const updates = await collectEdits();
    if (!updates) { setBusy(false); return; }
    build(updates);
    const { error } = await sb.from('tasks').update(updates).eq('id', r.id);
    setBusy(false);
    if (error) { toast(failMsg); onClose(); return; }
    toast(okMsg);
    onDone();
  };

  const save = () => run(() => {}, 'Failed to save', 'Saved');
  const markPaid = () => run((u) => {
    u.status = 'Done';
    u.updated_at = new Date().toISOString();
  }, 'Failed to update', 'Marked as paid');

  const remove = async () => {
    if (!(await confirmDialog({
      title: 'Delete this payment?',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    }))) return;
    setBusy(true);
    const { error } = await sb.from('tasks').delete().eq('id', r.id);
    setBusy(false);
    if (error) { toast('Failed to delete'); onClose(); return; }
    toast('Payment deleted');
    onDone();
  };

  return (
    <Sheet
      open
      title="Payment"
      onClose={onClose}
      actions={<>
        <Button variant="tertiary" tone="danger" size="lg" onClick={remove} disabled={busy}>Delete</Button>
        <Button variant="secondary" size="lg" onClick={save} disabled={busy}>Save</Button>
        <Button variant="primary" size="lg" onClick={markPaid} disabled={busy} loading={busy}>Mark as Paid</Button>
      </>}
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <InputText label="For" value={form.title} onChange={set('title')} />
        <InputText label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={form.cost} onChange={set('cost')} />
        <InputTextarea label="Description / Items" rows={3} placeholder="Items: a, b, c" value={form.description} onChange={set('description')} />
        <InputSelect label={recipientName ? 'Vendor or seller' : 'Vendor'} value={form.vendorId} onChange={onVendorChange}>
          <option value="">— No vendor —</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </InputSelect>
        <PhotoPicker ref={pickerRef} label="Receipt" acceptPdf initialUrl={r.receipt_image_url || null} />

        <div>
          {recipientName && <Field label="Reimburse to">{recipientName}</Field>}
          <Field label="Submitted by">{who}</Field>
          <Field label="Submitted">{formatDate(dateOnly(r.created_at))}</Field>
        </div>

        <InputText label="Pay by" type="date" value={form.due} onChange={set('due')} />

        {methods.length > 0 ? (
          <InputSelect label="Pay with" value={form.paymentKey} onChange={set('paymentKey')}>
            <option value="">— Choose method —</option>
            {methods.map(m => {
              const key = paymentMethodKey(m);
              return <option key={key} value={key}>{paymentMethodLabel(m)}</option>;
            })}
          </InputSelect>
        ) : !recipientName && vendor?.name ? (
          <div className="text-sm text-muted">
            No payment methods on file for {vendor.name}. Add one in the vendor settings.
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}

function Field({ label, children }) {
  return (
    <div className="detail-field">
      <span className="detail-field-label">{label}</span>
      <span className="detail-field-value">{children}</span>
    </div>
  );
}

// ---- Team ----

function UserSheet({ user, onClose, onSaved }) {
  const isNew = !user;
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [perms, setPerms] = useState(() =>
    Object.fromEntries(PERMISSIONS.map(p => [p.key, !!user?.[p.key]])),
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast('Name is required'); return; }
    const row = { name: trimmed, phone_number: phone.trim() || null, ...perms };

    setSaving(true);
    const { error } = isNew
      ? await sb.from('users').insert(row)
      : await sb.from('users').update(row).eq('id', user.id);
    setSaving(false);
    if (error) {
      toast(isNew ? 'Failed to add user' : 'Failed to save');
      onClose();
      return;
    }
    toast(isNew ? 'Team member added' : 'User updated');
    onSaved(user?.id || null, row);
  };

  return (
    <Sheet
      open
      title={isNew ? 'Add Team Member' : `Edit ${user.name}`}
      onClose={onClose}
      actions={<>
        <Button variant="tertiary" size="lg" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" type="submit" form="admin-user-form" loading={saving} disabled={saving}>
          {isNew ? 'Add' : 'Save'}
        </Button>
      </>}
    >
      <form id="admin-user-form" className="form" onSubmit={submit}>
        <InputText label="Name" placeholder={isNew ? 'Full name' : undefined} value={name} onChange={(e) => setName(e.target.value)} />
        <InputText
          label="Phone Number"
          type="tel"
          placeholder={isNew ? '+1 (555) 123-4567' : undefined}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div>
          <div className="section-title admin-subtitle">Permissions</div>
          <div className="admin-perms">
            {PERMISSIONS.map(p => (
              <div className="admin-perm-row" key={p.key}>
                <Checkbox
                  label={p.label}
                  checked={perms[p.key]}
                  onChange={(e) => setPerms(s => ({ ...s, [p.key]: e.target.checked }))}
                />
              </div>
            ))}
          </div>
        </div>
      </form>
    </Sheet>
  );
}
