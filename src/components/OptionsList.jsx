import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, InputText, InputTextarea } from '@tomcoggia/ui';
import { FileText, Plus } from 'lucide-react';
import { sb, SUPABASE_URL } from '../lib/supabase.js';
import { formatCurrency, isPdfUrl } from '../lib/format.js';
import { toast } from './Toast.jsx';
import { openImageViewer } from './ImageViewer.jsx';
import { Sheet } from './Sheet.jsx';
import { PhotoPicker } from './PhotoPicker.jsx';
import './OptionsList.css';

/**
 * Reusable "Options" section bound to a task (shortlist_options rows).
 *
 *   <OptionsList taskId={id} title="Options" onChange={(items) => …} />
 *
 * List (cheapest first), select a winner, add/edit in a sheet (with URL Fetch
 * through the fetch-product edge function), remove.
 */

const EMPTY_FORM = { url: '', name: '', source: '', price: '', notes: '' };

export function OptionsList({ taskId, title = 'Options', onChange }) {
  const [items, setItems] = useState(null); // null = loading
  const [editing, setEditing] = useState(null); // null | { id: null | optId, photoUrl }
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null);
  const pickerRef = useRef(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const refresh = useCallback(async () => {
    const { data, error } = await sb.from('shortlist_options')
      .select('*')
      .eq('task_id', taskId)
      .order('price', { ascending: true });
    const list = error ? [] : (data || []);
    setItems(list);
    onChangeRef.current?.(list);
  }, [taskId]);

  useEffect(() => { refresh(); }, [refresh]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFetchStatus(null);
    setEditing({ id: null, photoUrl: null });
  };

  const openEdit = (opt) => {
    setForm({
      url: opt.url_or_phone || '',
      name: opt.option_name || '',
      source: opt.source || '',
      price: opt.price ?? '',
      notes: opt.notes || '',
    });
    setFetchStatus(null);
    setEditing({ id: opt.id, photoUrl: opt.photo_url || null });
  };

  const close = () => { if (!saving) setEditing(null); };

  const fetchDetails = async () => {
    const url = form.url.trim();
    if (!url) { toast('Enter a URL first'); return; }

    setFetchStatus('Fetching product details...');
    setFetching(true);
    try {
      const resp = await fetch(SUPABASE_URL + '/functions/v1/fetch-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      if (data.error) { setFetchStatus('Could not fetch: ' + data.error); return; }

      setForm(f => ({
        ...f,
        name: data.title && !f.name ? data.title : f.name,
        price: data.price && !f.price ? String(data.price) : f.price,
        source: data.source && !f.source ? data.source : f.source,
        notes: data.description && !f.notes ? data.description : f.notes,
      }));
      if (data.image && pickerRef.current) {
        const v = pickerRef.current.getValue();
        if (!v.file && !v.url) pickerRef.current.setUrl(data.image);
      }

      setFetchStatus('Details fetched — review and edit as needed.');
    } catch (err) {
      setFetchStatus('Fetch failed: ' + err.message);
    } finally {
      setFetching(false);
    }
  };

  const collect = () => {
    const name = form.name.trim();
    if (!name) { toast('Enter a title'); return null; }
    const price = String(form.price).trim();
    return {
      option_name: name,
      url_or_phone: form.url.trim() || null,
      source: form.source.trim() || null,
      price: price ? Number(price) : null,
      notes: form.notes.trim() || null,
    };
  };

  const save = async (e) => {
    e.preventDefault();
    const base = collect();
    if (!base) return;

    setSaving(true);
    let photoUrl = null;
    if (pickerRef.current) {
      try { photoUrl = await pickerRef.current.resolve(); }
      catch { toast('Failed to upload photo'); setSaving(false); return; }
    }

    if (editing.id == null) {
      const { error } = await sb.from('shortlist_options').insert({
        task_id: taskId,
        ...base,
        photo_url: photoUrl,
      });
      setSaving(false);
      setEditing(null);
      if (error) { toast('Failed to add option'); return; }
      toast('Option added');
    } else {
      const { error } = await sb.from('shortlist_options')
        .update({ ...base, photo_url: photoUrl })
        .eq('id', editing.id);
      setSaving(false);
      setEditing(null);
      if (error) { toast('Failed to save: ' + error.message); return; }
      toast('Option updated');
    }
    refresh();
  };

  const selectOption = async (optId) => {
    await sb.from('shortlist_options').update({ is_selected: false }).eq('task_id', taskId);
    await sb.from('shortlist_options').update({ is_selected: true }).eq('id', optId);
    toast('Option selected');
    refresh();
  };

  const removeOption = async (optId) => {
    const { error } = await sb.from('shortlist_options').delete().eq('id', optId);
    if (error) { toast('Failed to remove'); return; }
    toast('Option removed');
    refresh();
  };

  const isNew = editing?.id == null;

  return (
    <div className="ol-section">
      <div className="section-header"><div className="section-title">{title}</div></div>

      {items === null ? (
        <p className="empty-state-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty-state-sm">No options yet</p>
      ) : (
        <div className="ol-list">
          {items.map(opt => (
            <div key={opt.id} className={`ol-item${opt.is_selected ? ' ol-selected' : ''}`}>
              {opt.photo_url && (isPdfUrl(opt.photo_url) ? (
                <a className="pdf-chip ol-pdf" href={opt.photo_url} target="_blank" rel="noopener noreferrer">
                  <FileText aria-hidden="true" /><span>PDF</span>
                </a>
              ) : (
                <img
                  className="ol-photo"
                  src={opt.photo_url}
                  alt=""
                  loading="lazy"
                  role="button"
                  tabIndex={0}
                  aria-label={`View photo of ${opt.option_name}`}
                  onClick={() => openImageViewer(opt.photo_url)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openImageViewer(opt.photo_url); } }}
                />
              ))}
              <div className="ol-content">
                <div className="row-between ol-head">
                  <span className="ol-name">{opt.option_name}</span>
                  <span className="ol-price">{opt.price != null ? formatCurrency(opt.price) : ''}</span>
                </div>
                {opt.source && <div className="ol-source">{opt.source}</div>}
                {opt.url_or_phone && (
                  <div className="ol-link">
                    <a href={opt.url_or_phone} target="_blank" rel="noopener noreferrer">Visit link</a>
                  </div>
                )}
                {opt.notes && <div className="ol-notes pre-wrap">{opt.notes}</div>}
                <div className="row ol-actions">
                  {!opt.is_selected
                    ? <Button variant="secondary" size="sm" onClick={() => selectOption(opt.id)}>Select Winner</Button>
                    : <span className="status-badge success">Selected</span>}
                  <Button variant="tertiary" size="sm" onClick={() => openEdit(opt)}>Edit</Button>
                  <Button variant="tertiary" size="sm" onClick={() => removeOption(opt.id)}>Remove</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <Button variant="secondary" size="sm" icon={<Plus />} onClick={openAdd}>Add Option</Button>
      </div>

      <Sheet
        open={!!editing}
        title={isNew ? 'Add Option' : 'Edit Option'}
        onClose={close}
        actions={<>
          <Button variant="tertiary" size="lg" onClick={close} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="ol-option-form" loading={saving} disabled={saving}>
            {isNew ? 'Add' : 'Save'}
          </Button>
        </>}
      >
        {editing && (
          <form id="ol-option-form" className="form" onSubmit={save}>
            <div className="stack-sm">
              <div className="ol-url-row">
                <InputText
                  className="grow"
                  label="URL"
                  type="url"
                  placeholder="https://..."
                  value={form.url}
                  onChange={set('url')}
                />
                <Button variant="secondary" size="md" onClick={fetchDetails} disabled={fetching} loading={fetching}>
                  Fetch
                </Button>
              </div>
              {fetchStatus && <div className="text-sm text-muted">{fetchStatus}</div>}
            </div>
            <InputText label="Title" placeholder="e.g. Dyson V15" value={form.name} onChange={set('name')} />
            <InputText label="Source" placeholder="e.g. Amazon, Home Depot" value={form.source} onChange={set('source')} />
            <InputText label="Cost" type="number" placeholder="0.00" step="0.01" value={form.price} onChange={set('price')} />
            <div>
              <div className="field-label">Photo</div>
              <PhotoPicker ref={pickerRef} label="Option photo" initialUrl={editing.photoUrl} />
            </div>
            <InputTextarea label="Notes" rows={2} placeholder="Any details..." value={form.notes} onChange={set('notes')} />
          </form>
        )}
      </Sheet>
    </div>
  );
}

export default OptionsList;
