import { useEffect, useState } from 'react';
import { Button, Modal } from '@tomcoggia/ui';
import { AlertTriangle, Info } from 'lucide-react';

// const ok = await confirmDialog({ title, body, confirmLabel, danger })
// Replaces window.confirm() with the library Modal. <ConfirmHost /> is mounted once.
let open = null;
export function confirmDialog(opts) {
  return new Promise((resolve) => {
    if (!open) { resolve(window.confirm(opts.title)); return; }
    open({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    open = setReq;
    return () => { open = null; };
  }, []);

  const answer = (ok) => {
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <Modal
      open={!!req}
      onClose={() => answer(false)}
      icon={req?.danger ? <AlertTriangle /> : <Info />}
      iconColor={req?.danger ? 'danger' : 'default'}
      title={req?.title ?? ''}
      actions={<>
        <Button variant="tertiary" size="lg" onClick={() => answer(false)}>{req?.cancelLabel || 'Cancel'}</Button>
        <Button variant="primary" tone={req?.danger ? 'danger' : 'default'} size="lg" onClick={() => answer(true)}>
          {req?.confirmLabel || 'OK'}
        </Button>
      </>}
    >
      {req?.body}
    </Modal>
  );
}
