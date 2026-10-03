import { useSyncExternalStore } from 'react';

// Hash routing, same URLs as before: #view or #view/param (e.g. #task-detail/<id>).
const history = [];
let current = parse();
let goingBack = false;

function parse() {
  const hash = location.hash.slice(1) || 'feed';
  const [view, ...params] = hash.split('/');
  return { view, param: params.join('/') };
}

const listeners = new Set();
window.addEventListener('hashchange', () => {
  const next = parse();
  // Old links: #reimburse goes to the Reimbursement tab
  if (next.view === 'reimburse') { navigate('report', 'reimbursement'); return; }
  if (next.view !== current.view && !goingBack) {
    history.push(current.param ? `${current.view}/${current.param}` : current.view);
    if (history.length > 20) history.shift();
  }
  goingBack = false;
  current = next;
  listeners.forEach(fn => fn());
});

export function navigate(view, param) {
  location.hash = param ? `${view}/${param}` : view;
}

export function back() {
  // Don't record the page we're leaving, or Back would bounce between two pages
  const target = history.length ? history.pop() : 'feed';
  if (target === (location.hash.slice(1) || 'feed')) return;
  goingBack = true;
  location.hash = target;
}

export function useRoute() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => current,
  );
}

export const TITLES = {
  feed: 'Tasks',
  report: 'Payments',
  calendar: 'Stayzzz',
  inventory: 'Inventory',
  admin: 'Admin',
  profile: 'Profile',
  'task-detail': 'Task',
  sms: 'Schedule',
};
