import { useEffect, useState } from 'react';
import './Toast.css';

// toast('Saved') from anywhere; <Toaster /> is mounted once in the shell.
let push = null;
export function toast(msg, duration = 2500) {
  if (push) push(msg, duration);
}

export function Toaster() {
  const [state, setState] = useState({ msg: '', shown: false, id: 0 });

  useEffect(() => {
    push = (msg, duration) => {
      const id = Date.now() + Math.random();
      setState({ msg, shown: true, id });
      setTimeout(() => setState(s => (s.id === id ? { ...s, shown: false } : s)), duration);
    };
    return () => { push = null; };
  }, []);

  return (
    <div className={`toast${state.shown ? ' show' : ''}`} role="status" aria-live="polite">
      {state.msg}
    </div>
  );
}
