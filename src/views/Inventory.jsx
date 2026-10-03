import { useEffect, useState } from 'react';
import { Button, ButtonRound, Card, Checkbox, InputSelect, InputText, InputTextarea } from '@tomcoggia/ui';
import { Pencil, ShoppingCart, SoapDispenserDroplet, Trash2, X } from 'lucide-react';
import { sb } from '../lib/supabase.js';
import { navigate } from '../lib/router.js';
import { toast } from '../components/Toast.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { StockStatus, OPTIONS as STOCK_OPTIONS } from '../components/StockStatus.jsx';
import './Inventory.css';

// Same handoff key the Payments view reads (and clears) on mount
const PREFILL_KEY = 'strpal-payment-prefill';

// Legacy used the UTC date for "today" — kept as-is
const isoToday = () => new Date().toLocaleDateString('en-CA'); // local date, not UTC

function parseLinks(item) {
  if (Array.isArray(item.purchase_links)) return item.purchase_links;
  if (item.quick_order_url) return [{ label: 'Buy', url: item.quick_order_url }];
  return [];
}

const blankLink = () => ({ label: '', url: '' });

export default function Inventory() {
  const [items, setItems] = useState(null); // null = loading
  const [selected, setSelected] = useState(() => new Set());
  // Form sheet: { id|null, title, name, description, status, lastStocked, links }
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await sb.from('inventory_standards')
      .select('*')
      .order('item_name');

    if (error || !data || data.length === 0) {
      setItems([]);
      setSelected(new Set());
      return;
    }

    setItems(data);
    // Drop selections for items that no longer exist.
    const ids = new Set(data.map(i => i.id));
    setSelected(prev => new Set([...prev].filter(id => ids.has(id))));
  }

  useEffect(() => { load(); }, []);

  function toggleSelect(id, checked) {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function submitSelectedForReimbursement() {
    const names = (items || [])
      .filter(i => selected.has(i.id))
      .map(i => i.item_name);
    if (names.length === 0) { toast('Select at least one item'); return; }
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ items: names }));
    setSelected(new Set());
    navigate('report', 'reimbursement');
  }

  async function quickSetStatus(id, status) {
    const updates = { status };
    if (status === 'Stocked') {
      updates.last_stocked_at = isoToday();
    }
    const { error } = await sb.from('inventory_standards').update(updates).eq('id', id);
    if (error) {
      console.error('Inventory update failed:', error);
      toast('Failed: ' + error.message);
      return;
    }
    load();
  }

  function showDetail(item) {
    if (!item) return;
    const links = parseLinks(item);
    setForm({
      id: item.id,
      title: 'Edit Item',
      name: item.item_name || '',
      description: item.description || '',
      status: item.status || 'Stocked',
      lastStocked: item.last_stocked_at || '',
      links: links.length > 0 ? links.map(l => ({ label: l.label || '', url: l.url || '' })) : [blankLink()],
    });
  }

  function showAdd() {
    setForm({
      id: null,
      title: 'Add Item',
      name: '',
      description: '',
      status: 'Stocked',
      lastStocked: '',
      links: [blankLink()],
    });
  }

  const closeForm = () => setForm(null);
  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  function setLink(i, field, value) {
    setForm(f => ({ ...f, links: f.links.map((l, j) => (j === i ? { ...l, [field]: value } : l)) }));
  }
  function addLinkRow() {
    setForm(f => ({ ...f, links: [...f.links, blankLink()] }));
  }
  function removeLinkRow(i) {
    setForm(f => {
      const links = f.links.filter((_, j) => j !== i);
      return { ...f, links: links.length ? links : [blankLink()] };
    });
  }
  function setStockedToday() {
    setForm(f => ({ ...f, lastStocked: isoToday(), status: 'Stocked' }));
  }

  function collectFormData() {
    const name = form.name.trim();
    if (!name) { toast('Enter a name'); return null; }

    const links = form.links
      .map(l => ({ label: (l.label || '').trim(), url: (l.url || '').trim() }))
      .filter(l => l.url);

    return {
      item_name: name,
      category: 'Supply',
      description: form.description.trim() || null,
      status: form.status,
      last_stocked_at: form.lastStocked || null,
      purchase_links: links,
    };
  }

  async function doSave() {
    const data = collectFormData();
    if (!data) return;
    setSaving(true);
    const isEdit = !!form.id;
    const { error } = isEdit
      ? await sb.from('inventory_standards').update(data).eq('id', form.id)
      : await sb.from('inventory_standards').insert(data);
    setSaving(false);
    closeForm();
    if (error) {
      console.error(isEdit ? 'Inventory save failed:' : 'Inventory add failed:', error);
      toast('Failed: ' + error.message);
      return;
    }
    toast(isEdit ? 'Item updated' : 'Item added');
    load();
  }

  async function confirmDelete() {
    const { id, name } = form;
    const ok = await confirmDialog({
      title: 'Delete Item?',
      body: `This will permanently remove "${name}". This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const { error } = await sb.from('inventory_standards').delete().eq('id', id);
    closeForm();
    if (error) { toast('Failed to delete'); return; }
    toast('Item deleted');
    load();
  }

  const count = selected.size;

  return (
    <div className={`page inv-page${count > 0 ? ' inv-has-bar' : ''}`}>
      <div className="inv-column">
        <Button
          variant="primary"
          size="lg"
          className="btn-block inv-add-btn"
          icon={<SoapDispenserDroplet />}
          onClick={showAdd}
          aria-label="Add item"
        >
          ADD ITEM
        </Button>

        {items === null ? (
          <div className="empty-state">Loading…</div>
        ) : items.length === 0 ? (
          <div className="empty-state"><p>No inventory items yet</p></div>
        ) : (
          <div className="card-list">
            {items.map(item => (
              <InventoryCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onSelect={(checked) => toggleSelect(item.id, checked)}
                onOpen={() => showDetail(item)}
                onStatus={(status) => quickSetStatus(item.id, status)}
              />
            ))}
          </div>
        )}
      </div>

      {count > 0 && (
        <div className="action-bar">
          <div className="inv-column">
            <Button variant="primary" size="lg" className="btn-block" onClick={submitSelectedForReimbursement}>
              Submit {count} for Reimbursement
            </Button>
          </div>
        </div>
      )}

      <Sheet
        open={!!form}
        title={form?.title}
        onClose={closeForm}
        actions={form && (
          <>
            {form.id && (
              <ButtonRound
                variant="tertiary"
                tone="danger"
                icon={<Trash2 />}
                aria-label="Delete"
                onClick={confirmDelete}
              />
            )}
            <Button variant="primary" size="lg" type="submit" form="inv-form" loading={saving} disabled={saving}>
              Save
            </Button>
          </>
        )}
      >
        {form && (
          <form id="inv-form" className="form" onSubmit={(e) => { e.preventDefault(); doSave(); }}>
            <InputText
              label="Name"
              placeholder="e.g. Paper Towels"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            <InputTextarea
              label="Description"
              rows={2}
              placeholder="Notes, brand, size..."
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
            <InputSelect
              label="Status"
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
            >
              {STOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </InputSelect>
            <div className="inv-last-stocked-row">
              <div className="grow">
                <InputText
                  type="date"
                  label="Last stocked"
                  value={form.lastStocked}
                  onChange={(e) => setField('lastStocked', e.target.value)}
                />
              </div>
              <Button variant="secondary" size="lg" onClick={setStockedToday}>Stocked today</Button>
            </div>
            <div className="stack-sm">
              <div className="field-label">Where to buy</div>
              {form.links.map((l, i) => (
                <div key={i} className="inv-link-group">
                  <div className="inv-link-row">
                    <div className="grow">
                      <InputText
                        type="url"
                        size="md"
                        placeholder="https://..."
                        aria-label="Link URL"
                        value={l.url}
                        onChange={(e) => setLink(i, 'url', e.target.value)}
                      />
                    </div>
                    <ButtonRound variant="tertiary" size="md" icon={<X />} aria-label="Remove" onClick={() => removeLinkRow(i)} />
                  </div>
                  <InputText
                    size="md"
                    placeholder="Label (optional)"
                    aria-label="Link label"
                    value={l.label}
                    onChange={(e) => setLink(i, 'label', e.target.value)}
                  />
                </div>
              ))}
              <div>
                <Button variant="tertiary" size="sm" onClick={addLinkRow}>+ Add another link</Button>
              </div>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}

function InventoryCard({ item, selected, onSelect, onOpen, onStatus }) {
  const buyLink = parseLinks(item).find(l => l.url);
  const stop = (e) => e.stopPropagation();

  return (
    <Card
      variant="float1"
      className={`inv-card card-clickable${selected ? ' inv-card-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
    >
      <div className="card-body inv-card-body">
        <div className="inv-card-header">
          <span className="inv-select" onClick={stop} onKeyDown={stop}>
            <Checkbox
              size="md"
              label="Select for reimbursement"
              hideLabel
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
            />
          </span>
          <div className="inv-name">{item.item_name}</div>
          <div className="inv-card-actions">
            {buyLink && (
              <ButtonRound
                asChild
                variant="secondary"
                size="md"
                icon={<ShoppingCart />}
                aria-label="Open purchase link"
              >
                <a href={buyLink.url} target="_blank" rel="noopener" onClick={stop} onKeyDown={stop} />
              </ButtonRound>
            )}
            <span className="inv-edit-hint" aria-hidden="true"><Pencil size={18} /></span>
          </div>
        </div>
        <StockStatus size="md" className="inv-status" value={item.status} onChange={onStatus} />
      </div>
    </Card>
  );
}
