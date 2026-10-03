import { useEffect, useId, useState } from 'react';
import { Button, ButtonRound, InputSelect, InputText, InputTextarea } from '@tomcoggia/ui';
import { Plus, X } from 'lucide-react';
import { sb } from '../lib/supabase.js';
import { toast } from './Toast.jsx';
import { confirmDialog } from './ConfirmDialog.jsx';
import { Sheet } from './Sheet.jsx';
import './VendorForm.css';

// Payment method types a vendor can be paid through. `placeholder` hints the
// handle field for that type.
export const PAYMENT_TYPE_OPTIONS = [
  { value: 'venmo',  label: 'Venmo',      placeholder: '@username' },
  { value: 'zelle',  label: 'Zelle',      placeholder: 'email or phone' },
  { value: 'paypal', label: 'PayPal',     placeholder: 'email' },
  { value: 'bank',   label: 'Bank / ACH', placeholder: 'e.g. Chase ****1234' },
  { value: 'check',  label: 'Check',      placeholder: 'Mail address (optional)' },
  { value: 'cash',   label: 'Cash',       placeholder: 'Notes (optional)' },
  { value: 'other',  label: 'Other',      placeholder: 'Details' },
];

// "Venmo: Main", "Venmo @bob", or just "Check"
export function paymentMethodLabel(m) {
  if (!m) return '';
  const type = PAYMENT_TYPE_OPTIONS.find(t => t.value === m.type);
  const typeLabel = type ? type.label : (m.type || '');
  if (m.label) return `${typeLabel}: ${m.label}`;
  if (m.handle) return `${typeLabel} ${m.handle}`;
  return typeLabel;
}

// Stable identity for a payment method (they have no id of their own)
export function paymentMethodKey(m) {
  if (!m) return '';
  return `${m.type || ''}|${m.handle || ''}|${m.label || ''}`;
}

// Trim, and drop rows with no handle (check and cash need none)
function collectPaymentMethods(methods) {
  return methods
    .map(m => ({
      type: (m.type || '').trim(),
      handle: (m.handle || '').trim(),
      label: (m.label || '').trim(),
    }))
    .filter(m => m.type && (m.handle || m.type === 'check' || m.type === 'cash'));
}

function fieldsFrom(v) {
  return {
    name: v?.name || '',
    contact_name: v?.contact_name || '',
    trade: v?.trade || '',
    phone_number: v?.phone_number || '',
    notes: v?.notes || '',
  };
}

/**
 * Add / edit a vendor.
 *
 *   <VendorSheet open vendor={v|null} onClose onSaved={row => …} onDelete={v => …} />
 *
 * With no `vendor` it inserts a row; with one it updates it. On success it calls
 * `onSaved(row)` with the saved row (`.select('*').single()`); the caller closes
 * the sheet and shows the success toast. Failures toast here and close the sheet.
 * Passing `onDelete` (edit mode only) adds a Delete button: the sheet confirms,
 * deletes the row, then calls `onDelete(vendor)`.
 */
export function VendorSheet({ open, vendor = null, onClose, onSaved, onDelete }) {
  const formId = useId();
  const [fields, setFields] = useState(() => fieldsFrom(vendor));
  const [methods, setMethods] = useState([]);
  const [saving, setSaving] = useState(false);

  // Reset whenever the sheet opens (or is pointed at another vendor)
  useEffect(() => {
    if (!open) return;
    setFields(fieldsFrom(vendor));
    setMethods(Array.isArray(vendor?.payment_methods) ? vendor.payment_methods.map(m => ({ ...m })) : []);
    setSaving(false);
  }, [open, vendor]);

  const set = (key) => (e) => setFields(f => ({ ...f, [key]: e.target.value }));
  const setMethod = (i, key, value) => setMethods(ms => ms.map((m, j) => (j === i ? { ...m, [key]: value } : m)));
  const addMethod = () => setMethods(ms => [...ms, { type: 'venmo', handle: '', label: '' }]);
  const removeMethod = (i) => setMethods(ms => ms.filter((_, j) => j !== i));

  const save = async (e) => {
    e.preventDefault();
    const name = fields.name.trim();
    if (!name) { toast('Name is required'); return; }
    const row = {
      name,
      contact_name: fields.contact_name.trim() || null,
      trade: fields.trade.trim() || null,
      phone_number: fields.phone_number.trim() || null,
      notes: fields.notes.trim() || null,
      payment_methods: collectPaymentMethods(methods),
    };
    setSaving(true);
    const query = vendor
      ? sb.from('vendors').update(row).eq('id', vendor.id)
      : sb.from('vendors').insert(row);
    const { data, error } = await query.select('*').single();
    setSaving(false);
    if (error) {
      toast(vendor ? 'Failed to save' : 'Failed to add vendor');
      onClose?.();
      return;
    }
    onSaved?.(data);
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this vendor?', confirmLabel: 'Delete', danger: true }))) return;
    setSaving(true);
    const { error } = await sb.from('vendors').delete().eq('id', vendor.id);
    setSaving(false);
    if (error) { toast('Failed to delete'); onClose?.(); return; }
    onDelete?.(vendor);
  };

  return (
    <Sheet
      open={open}
      title={vendor ? 'Edit Vendor' : 'Add Vendor'}
      onClose={onClose}
      actions={<>
        {vendor && onDelete && (
          <Button variant="tertiary" tone="danger" size="lg" onClick={remove} disabled={saving}>Delete</Button>
        )}
        <Button variant="primary" size="lg" type="submit" form={formId} loading={saving} disabled={saving}>Save</Button>
      </>}
    >
      <form id={formId} className="form" onSubmit={save}>
        <InputText label="Name" placeholder="Vendor / company name" value={fields.name} onChange={set('name')} />
        <InputText
          label={<>Contact name <span className="text-faint">(optional)</span></>}
          placeholder="Person to reach out to"
          value={fields.contact_name}
          onChange={set('contact_name')}
        />
        <InputText label="Trade" placeholder="e.g. Plumber, Electrician" value={fields.trade} onChange={set('trade')} />
        <InputText label="Phone" type="tel" placeholder="+1 (555) 123-4567" value={fields.phone_number} onChange={set('phone_number')} />

        <div>
          <div className="field-label">Payment Methods</div>
          {methods.length === 0 ? (
            <div className="text-sm text-muted">No payment methods yet.</div>
          ) : (
            <div className="vf-methods">
              {methods.map((m, i) => {
                const type = PAYMENT_TYPE_OPTIONS.find(t => t.value === m.type) || PAYMENT_TYPE_OPTIONS[0];
                return (
                  <div className="vf-method-row" key={i}>
                    <InputSelect
                      className="vf-method-type"
                      size="md"
                      aria-label="Payment type"
                      value={m.type}
                      onChange={(e) => setMethod(i, 'type', e.target.value)}
                    >
                      {PAYMENT_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </InputSelect>
                    <InputText
                      className="vf-method-handle"
                      size="md"
                      aria-label="Handle"
                      placeholder={type.placeholder}
                      value={m.handle || ''}
                      onChange={(e) => setMethod(i, 'handle', e.target.value)}
                    />
                    <ButtonRound
                      className="vf-method-remove"
                      variant="tertiary"
                      size="sm"
                      icon={<X />}
                      aria-label="Remove"
                      onClick={() => removeMethod(i)}
                    />
                    <InputText
                      className="vf-method-label"
                      size="md"
                      aria-label="Label"
                      placeholder="Label (optional)"
                      value={m.label || ''}
                      onChange={(e) => setMethod(i, 'label', e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="vf-add-method">
            <Button variant="tertiary" size="sm" icon={<Plus />} onClick={addMethod}>Add payment method</Button>
          </div>
        </div>

        <InputTextarea label="Notes" rows={2} placeholder="Optional" value={fields.notes} onChange={set('notes')} />
      </form>
    </Sheet>
  );
}
