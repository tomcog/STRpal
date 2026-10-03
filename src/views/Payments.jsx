import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, InputSelect, InputText, InputTextarea, Segment, SegmentedControl, Tab, Tabs } from '@tomcoggia/ui';
import { sb } from '../lib/supabase.js';
import { todayStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { useApp } from '../app/AppContext.jsx';
import { toast } from '../components/Toast.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { PhotoPicker } from '../components/PhotoPicker.jsx';
import { VendorSheet } from '../components/VendorForm.jsx';

// Payments, two tabs:
//   Invoices       (#report, #report/invoice)  - a vendor's request for payment
//   Reimbursement  (#report/reimbursement)     - paying back a crew member's purchase
// #report/issue is the older damage/repair report, which has no nav entry any more.
const NEW = '__new__';
const PREFILL_KEY = 'strpal-payment-prefill';

export default function Payments({ mode }) {
  if (mode === 'issue') return <div className="page"><IssueForm /></div>;
  const tab = mode === 'reimbursement' ? 'reimbursement' : 'invoice';
  return (
    <div className="page">
      <Tabs aria-label="Payment type">
        <Tab active={tab === 'invoice'} onClick={() => navigate('report', 'invoice')}>Invoices</Tab>
        <Tab active={tab === 'reimbursement'} onClick={() => navigate('report', 'reimbursement')}>Reimburse</Tab>
      </Tabs>
      {tab === 'invoice' ? <InvoiceForm /> : <ReimbursementForm />}
    </div>
  );
}

function InvoiceForm() {
  const { profile, users, setUsers, usersLoaded } = useApp();
  const picker = useRef(null);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(() => ({
    vendorId: '',
    dateBilled: todayStr(),
    services: '',
    amount: '',
    submitterId: '',
  }));
  const [saving, setSaving] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [addingSubmitter, setAddingSubmitter] = useState(false);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const loadVendors = async () => {
    const { data } = await sb.from('vendors').select('id, name').order('name');
    setVendors(data || []);
  };
  useEffect(() => { loadVendors(); }, []);

  // Submitter defaults to the active profile once users have loaded
  useEffect(() => {
    if (usersLoaded) setForm(f => (f.submitterId ? f : { ...f, submitterId: profile?.id || users[0]?.id || '' }));
  }, [usersLoaded, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedUsers = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // "+ Add new…" opens the add flow; the select keeps its current choice until one is saved
  const onVendorChange = (e) => {
    if (e.target.value === NEW) { setAddingVendor(true); return; }
    set('vendorId')(e);
  };
  const onSubmitterChange = (e) => {
    if (e.target.value === NEW) { setAddingSubmitter(true); return; }
    set('submitterId')(e);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const receiptUrl = picker.current ? await picker.current.resolve() : null;
      const services = form.services.trim();
      const amount = Number(form.amount);

      if (!form.vendorId) throw new Error('Select a vendor');
      if (!form.dateBilled) throw new Error('Choose the date billed');
      if (!services) throw new Error('Enter a description of services');
      if (!amount || amount <= 0) throw new Error('Enter a valid amount');
      if (!form.submitterId) throw new Error('Select who is submitting');

      const lines = [`Date billed: ${form.dateBilled}`, services];
      if (!receiptUrl) lines.push('No invoice provided');

      const { error } = await sb.from('tasks').insert({
        title: `Invoice: ${services.split('\n')[0]}`,
        description: lines.join('\n'),
        receipt_image_url: receiptUrl,
        cost: amount,
        priority: 'HAVE',
        status: 'Open',
        type: 'reimbursement',
        vendor_id: form.vendorId,
        created_by: form.submitterId,
      });
      if (error) throw error;

      toast('Invoice submitted for payment');
      navigate('feed');
    } catch (err) {
      toast(err.message || 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form className="form" onSubmit={submit} noValidate>
        <div>
          <div className="field-label">Invoice <span className="text-faint">(skip if none provided)</span></div>
          <PhotoPicker ref={picker} label="Invoice" showUrl={false} />
        </div>

        <div className="form-row">
          <InputSelect label="Vendor" value={form.vendorId} onChange={onVendorChange} required>
            <option value="">— Select vendor —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            <option value={NEW}>+ Add new vendor…</option>
          </InputSelect>
          <InputText label="Date billed" type="date" value={form.dateBilled} onChange={set('dateBilled')} required />
        </div>

        <InputTextarea label="Description of services" rows={3} placeholder="What work was done?"
          value={form.services} onChange={set('services')} required />

        <div className="form-row">
          <InputText label="Invoice amount ($)" type="number" inputMode="decimal" step="0.01" min="0"
            placeholder="0.00" value={form.amount} onChange={set('amount')} required />
          <InputSelect label="Submitted by" value={form.submitterId} onChange={onSubmitterChange} required>
            <option value="">— Select submitter —</option>
            {sortedUsers.map(u => <option key={u.id} value={u.id}>{u.name || 'Unnamed'}</option>)}
            <option value={NEW}>+ Add new submitter…</option>
          </InputSelect>
        </div>

        <Button type="submit" variant="primary" size="xl" className="btn-block" loading={saving} disabled={saving}>
          Submit Invoice for Payment
        </Button>
      </form>

      <VendorSheet
        open={addingVendor}
        onClose={() => setAddingVendor(false)}
        onSaved={async (row) => {
          setAddingVendor(false);
          toast('Vendor added');
          await loadVendors();
          setForm(f => ({ ...f, vendorId: row.id }));
        }}
      />

      <AddSubmitterSheet
        open={addingSubmitter}
        onClose={() => setAddingSubmitter(false)}
        onSaved={(row) => {
          setAddingSubmitter(false);
          setUsers(prev => [...prev, row]);
          setForm(f => ({ ...f, submitterId: row.id }));
          toast('Submitter added');
        }}
      />
    </>
  );
}

function ReimbursementForm() {
  const { profile, users, setUsers, usersLoaded } = useApp();
  const picker = useRef(null);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(() => ({
    vendorId: '',
    datePurchased: todayStr(),
    description: readPrefill(),
    amount: '',
    submitterId: '',
    recipientDiffers: false,
    recipientId: '',
  }));
  const [saving, setSaving] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  // 'submitter' | 'recipient' while the add-person sheet is open
  const [addingPerson, setAddingPerson] = useState(null);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const loadVendors = async () => {
    const { data } = await sb.from('vendors').select('id, name').order('name');
    setVendors(data || []);
  };
  useEffect(() => { loadVendors(); }, []);
  // The prefill is read once into state above; clear it so it doesn't come back
  useEffect(() => { try { sessionStorage.removeItem(PREFILL_KEY); } catch { /* storage blocked */ } }, []);

  // Submitter defaults to the active profile once users have loaded
  useEffect(() => {
    if (usersLoaded) setForm(f => (f.submitterId ? f : { ...f, submitterId: profile?.id || users[0]?.id || '' }));
  }, [usersLoaded, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedUsers = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const userName = (id) => users.find(u => u.id === id)?.name || '';

  // "+ Add new…" opens the add flow; the select keeps its current choice until one is saved
  const onVendorChange = (e) => {
    if (e.target.value === NEW) { setAddingVendor(true); return; }
    set('vendorId')(e);
  };
  const onPersonChange = (key, role) => (e) => {
    if (e.target.value === NEW) { setAddingPerson(role); return; }
    set(key)(e);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const description = form.description.trim();
      const amount = Number(form.amount);
      const recipientId = form.recipientDiffers ? form.recipientId : form.submitterId;

      if (!form.vendorId) throw new Error('Select a vendor or seller');
      if (!form.datePurchased) throw new Error('Choose the date of service or purchase');
      if (!description) throw new Error('Enter a description of goods or service');
      if (!amount || amount <= 0) throw new Error('Enter a valid amount');
      if (!form.submitterId) throw new Error('Select who is submitting');
      if (form.recipientDiffers && !form.recipientId) throw new Error('Select who should be reimbursed');

      const receiptUrl = picker.current ? await picker.current.resolve() : null;
      const vendorName = vendors.find(v => v.id === form.vendorId)?.name || '';

      // "Purchased at:" is the line Admin reads to show the seller
      const lines = [
        `Date of service or purchase: ${form.datePurchased}`,
        vendorName ? `Purchased at: ${vendorName}` : null,
        description,
        form.recipientDiffers ? `Reimburse to: ${userName(recipientId)}` : null,
        receiptUrl ? null : 'No invoice or receipt provided',
      ].filter(Boolean);

      const { error } = await sb.from('tasks').insert({
        title: `Reimbursement: ${description.split('\n')[0]}`,
        description: lines.join('\n'),
        receipt_image_url: receiptUrl,
        cost: amount,
        priority: 'HAVE',
        status: 'Open',
        type: 'reimbursement',
        vendor_id: form.vendorId,
        created_by: form.submitterId,
        // The person being paid back
        assigned_to: recipientId,
      });
      if (error) throw error;

      toast('Reimbursement request submitted');
      navigate('feed');
    } catch (err) {
      toast(err.message || 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  const personOptions = (placeholder, addLabel) => (
    <>
      <option value="">{placeholder}</option>
      {sortedUsers.map(u => <option key={u.id} value={u.id}>{u.name || 'Unnamed'}</option>)}
      <option value={NEW}>{addLabel}</option>
    </>
  );

  return (
    <>
      <form className="form" onSubmit={submit} noValidate>
        <div>
          <div className="field-label">Invoice or receipt <span className="text-faint">(skip if none)</span></div>
          <PhotoPicker ref={picker} label="Invoice or receipt" showUrl={false} />
        </div>

        <div className="form-row">
          <InputSelect label="Vendor or seller" value={form.vendorId} onChange={onVendorChange} required>
            <option value="">— Select vendor or seller —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            <option value={NEW}>+ Add new vendor or seller…</option>
          </InputSelect>
          <InputText label="Date of service or purchase" type="date" value={form.datePurchased}
            onChange={set('datePurchased')} required />
        </div>

        <InputTextarea label="Description of goods or service" rows={3} placeholder="What was bought, or what work was done?"
          value={form.description} onChange={set('description')} required />

        <div className="form-row">
          <InputText label="Amount ($)" type="number" inputMode="decimal" step="0.01" min="0"
            placeholder="0.00" value={form.amount} onChange={set('amount')} required />
          <InputSelect label="Submitted by" value={form.submitterId} onChange={onPersonChange('submitterId', 'submitter')} required>
            {personOptions('— Select submitter —', '+ Add new submitter…')}
          </InputSelect>
        </div>

        <Checkbox
          label="Reimburse someone other than the submitter"
          checked={form.recipientDiffers}
          onChange={(e) => setForm(f => ({ ...f, recipientDiffers: e.target.checked }))}
        />

        {form.recipientDiffers && (
          <InputSelect label="Reimburse to" value={form.recipientId} onChange={onPersonChange('recipientId', 'recipient')} required>
            {personOptions('— Select recipient —', '+ Add new recipient…')}
          </InputSelect>
        )}

        <Button type="submit" variant="primary" size="xl" className="btn-block" loading={saving} disabled={saving}>
          Submit for Reimburse
        </Button>
      </form>

      <VendorSheet
        open={addingVendor}
        onClose={() => setAddingVendor(false)}
        onSaved={async (row) => {
          setAddingVendor(false);
          toast('Vendor added');
          await loadVendors();
          setForm(f => ({ ...f, vendorId: row.id }));
        }}
      />

      <AddSubmitterSheet
        open={!!addingPerson}
        title={addingPerson === 'recipient' ? 'Add Recipient' : 'Add Submitter'}
        onClose={() => setAddingPerson(null)}
        onSaved={(row) => {
          const key = addingPerson === 'recipient' ? 'recipientId' : 'submitterId';
          setAddingPerson(null);
          setUsers(prev => [...prev, row]);
          setForm(f => ({ ...f, [key]: row.id }));
          toast(key === 'recipientId' ? 'Recipient added' : 'Submitter added');
        }}
      />
    </>
  );
}

// Inventory's "Submit N for Reimbursement" hands its item names over here
function readPrefill() {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    const items = raw ? JSON.parse(raw).items : null;
    return Array.isArray(items) && items.length ? items.join(', ') : '';
  } catch {
    return '';
  }
}

function AddSubmitterSheet({ open, onClose, onSaved, title = 'Add Submitter' }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(''); setPhone(''); } }, [open]);

  const save = async () => {
    if (!name.trim()) { toast('Name is required'); return; }
    setSaving(true);
    const { data, error } = await sb.from('users')
      .insert({ name: name.trim(), phone_number: phone.trim() || null })
      .select('*')
      .single();
    setSaving(false);
    if (error) { toast('Failed to add submitter'); return; }
    onSaved(data);
  };

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      actions={<>
        <Button variant="tertiary" size="lg" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="lg" onClick={save} loading={saving} disabled={saving}>Add</Button>
      </>}
    >
      <div className="form">
        <InputText label="Name" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <InputText label="Phone number (optional)" type="tel" placeholder="+1 (555) 123-4567"
          value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
    </Sheet>
  );
}

function IssueForm() {
  const { profile } = useApp();
  const picker = useRef(null);
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('HAVE');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const photoUrl = picker.current ? await picker.current.resolve() : null;
      const text = note.trim();
      const { error } = await sb.from('tasks').insert({
        title: text || 'Reported Issue',
        description: text || null,
        photo_url: photoUrl,
        priority,
        status: 'Open',
        type: 'do',
        created_by: profile?.id || null,
      });
      if (error) throw error;
      toast('Issue reported');
      navigate('feed');
    } catch (err) {
      toast('Failed to submit: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <PhotoPicker ref={picker} label="Issue photo" />
      <InputTextarea label="What's the problem? (optional)" rows={3} value={note} onChange={e => setNote(e.target.value)} />
      <SegmentedControl aria-label="Priority" size="lg">
        <Segment selected={priority === 'HAVE'} onClick={() => setPriority('HAVE')}>Urgent Fix</Segment>
        <Segment selected={priority === 'WANT'} onClick={() => setPriority('WANT')}>For Later</Segment>
      </SegmentedControl>
      <Button type="submit" variant="primary" size="xl" className="btn-block" loading={saving} disabled={saving}>
        Submit Issue
      </Button>
    </form>
  );
}
