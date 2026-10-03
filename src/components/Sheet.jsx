import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ButtonRound } from '@tomcoggia/ui';
import { X } from 'lucide-react';
import './Sheet.css';

/**
 * Form sheet for the app's longer edit/create forms. The library Modal is a
 * 350px interrupt (confirmations, see ConfirmDialog); these forms need the
 * whole phone screen, so they get this app-level sheet, built on the library's
 * surface, radius, shadow and motion tokens.
 *
 *   <Sheet open title="Add Vendor" onClose={close} actions={<Button…/>}>…</Sheet>
 *
 * Full screen on phones, a centred panel at >= 48rem.
 */
export function Sheet({ open, title, onClose, actions, children, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-header">
          <h2 className="sheet-title">{title}</h2>
          <ButtonRound variant="tertiary" size="md" icon={<X />} aria-label="Close" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
        {actions && <div className="sheet-footer">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
