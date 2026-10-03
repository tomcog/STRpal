import { useEffect, useState } from 'react';
import { Button, ButtonRound, Card, Spinner, Tab, Tabs } from '@tomcoggia/ui';
import { ArrowLeft, ArrowRight, Phone } from 'lucide-react';
import { sb } from '../lib/supabase.js';
import { formatCurrency, formatDate, formatPhone, todayStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { Sheet } from '../components/Sheet.jsx';
import './Calendar.css';

// Stay-type colours are data colours (also used by the legend swatches).
const STATUS_COLORS = {
  'guest-current':    '#1DD1A1',
  'guest-arrive':     '#F5D347',
  'guest-tomorrow':   '#DFB315',
  'guest-upcoming':   '#1D4E5C',
  'guest-leave':      '#EE5A7B',
  'owner':            '#F49867',
  'service':          '#E8C948',
  'turnover-sameday': '#EE5A7B',
  'unresolved':       '#999999',
  'past':             '#AEAEB2',
};

const LEGEND = [
  ['Upcoming', '#1D4E5C'],
  ['Current', '#1DD1A1'],
  ['Owner', '#F49867'],
  ['Service', '#E8C948'],
  ['Quick turnover', '#EE5A7B'],
  ['Past', '#AEAEB2'],
];

const DUE_KIND = {
  reimbursement: { label: 'Reimbursement', dot: 'cal-due-kind-reimbursement' },
  project:       { label: 'Project',       dot: 'cal-due-kind-project' },
  purchase:      { label: 'Purchase',      dot: 'cal-due-kind-purchase' },
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// No crew-only restriction for now (legacy App.isCrewOnly() always false).
const isCrewOnly = () => false;

function dayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function dueKindFor(task) {
  if (task.type === 'reimbursement') return 'reimbursement';
  if (task.type === 'get') return 'purchase';
  return 'project';
}

function getStatus(rental, allRentals) {
  const today = startOfToday();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const stayType = rental.stay_type || 'guest';

  if (stayType === 'service') {
    const serviceDay = dayOf(rental.service_date || rental.start_date);
    if (serviceDay < today) return { code: 'past', label: 'Completed', color: STATUS_COLORS.past };
    if (serviceDay.getTime() === today.getTime()) return { code: 'service-today', label: 'Today', color: STATUS_COLORS.service };
    if (serviceDay.getTime() === tomorrow.getTime()) return { code: 'service-tomorrow', label: 'Tomorrow', color: STATUS_COLORS.service };
    return { code: 'service-upcoming', label: 'Scheduled', color: STATUS_COLORS.service };
  }

  const startDate = dayOf(rental.start_date);
  const endDate = dayOf(rental.end_date);

  const isCheckInDay = startDate.getTime() === today.getTime();
  const isTomorrow = startDate.getTime() === tomorrow.getTime();
  const isCurrent = today >= startDate && today <= endDate;
  const isCheckOutDay = endDate.getTime() === today.getTime();
  const isPast = today > endDate;

  // Same-day turnover detection
  if (!isPast && allRentals) {
    const hasSameDayCheckout = allRentals.some(o => {
      if (o.id === rental.id) return false;
      return dayOf(o.end_date).getTime() === startDate.getTime();
    });
    if (hasSameDayCheckout && today.getTime() <= startDate.getTime()) {
      return { code: 'turnover-sameday', label: 'Quick turnover', color: STATUS_COLORS['turnover-sameday'] };
    }
  }

  if (stayType === 'owner') {
    if (isPast) return { code: 'past', label: 'Complete', color: STATUS_COLORS.past };
    if (isCheckOutDay) return { code: 'owner-leave', label: 'Leave today', color: STATUS_COLORS.owner };
    if (isCheckInDay) return { code: 'owner-arrive', label: 'Arrive today', color: STATUS_COLORS.owner };
    if (isCurrent) return { code: 'owner-current', label: 'Owner stay', color: STATUS_COLORS.owner };
    if (isTomorrow) return { code: 'owner-tomorrow', label: 'Tomorrow', color: STATUS_COLORS.owner };
    return { code: 'owner-upcoming', label: 'Owner', color: STATUS_COLORS.owner };
  }

  if (stayType === 'unresolved') {
    if (isPast) return { code: 'past', label: 'Completed', color: STATUS_COLORS.past };
    return { code: 'unresolved', label: 'Needs attention', color: STATUS_COLORS.unresolved };
  }

  // Guest
  if (isPast) return { code: 'past', label: 'Completed', color: STATUS_COLORS.past };
  if (isCheckOutDay) return { code: 'guest-leave', label: 'Check-out today', color: STATUS_COLORS['guest-leave'] };
  if (isCheckInDay) return { code: 'guest-arrive', label: 'Check-in today', color: STATUS_COLORS['guest-arrive'] };
  if (isCurrent) return { code: 'guest-current', label: 'Current stay', color: STATUS_COLORS['guest-current'] };
  if (isTomorrow) return { code: 'guest-tomorrow', label: 'Tomorrow', color: STATUS_COLORS['guest-tomorrow'] };
  return { code: 'guest-upcoming', label: 'Upcoming', color: STATUS_COLORS['guest-upcoming'] };
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

function firstName(rental) {
  const type = rental.stay_type || 'guest';
  if (type === 'owner') return 'Owner';
  if (type === 'unresolved') return 'N/A';
  if (type === 'service') return 'Service';
  const full = (rental.guest_name || '').trim();
  return full.split(' ')[0] || 'Guest';
}

const guestNameOf = (r) => (isCrewOnly() ? 'Guest' : (r.guest_name || 'Guest'));
const telHref = (num) => 'tel:' + num.replace(/[^\d+]/g, '');

function activate(handler) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
  };
}

// ---- Stays list ----

function StayCard({ rental, isNext, allRentals, onOpen }) {
  const status = getStatus(rental, allRentals);
  const stayType = rental.stay_type || 'guest';
  const crewOnly = isCrewOnly();
  const guestName = guestNameOf(rental);

  const nameLabel = stayType === 'owner'
    ? `${guestName} blocked`
    : stayType === 'unresolved'
      ? 'Not available'
      : guestName;

  // "Begins in N days" override for the very next upcoming stay
  let statusText = status.label;
  if (isNext && status.code.includes('upcoming')) {
    const days = Math.ceil((dayOf(rental.start_date) - startOfToday()) / 86400000);
    statusText = stayType === 'service'
      ? `Scheduled in ${days} ${days === 1 ? 'day' : 'days'}`
      : `Begins in ${days} ${days === 1 ? 'day' : 'days'}`;
  }

  let dates;
  if (stayType === 'service' && (rental.service_date || rental.service_time)) {
    const datePart = rental.service_date ? fmtDate(rental.service_date) : '';
    const timePart = rental.service_time ? ` at ${rental.service_time}` : '';
    dates = <><span>{datePart}</span><span className="cal-stay-date-sep">{timePart}</span></>;
  } else {
    dates = (
      <>
        <span>{fmtDate(rental.start_date)}</span>
        <span className="cal-stay-date-sep"> – </span>
        <span>{fmtDate(rental.end_date)}</span>
      </>
    );
  }

  let nightsLabel = null;
  if (stayType !== 'service') {
    const start = dayOf(rental.start_date);
    const end = dayOf(rental.end_date);
    const today = startOfToday();
    const totalNights = Math.ceil((end - start) / 86400000);
    const nightsLeft = Math.max(0, Math.ceil((end - today) / 86400000));
    const inProgress = today >= start && today <= end;
    nightsLabel = inProgress
      ? `${nightsLeft} ${nightsLeft === 1 ? 'night' : 'nights'} left`
      : `${totalNights} ${totalNights === 1 ? 'night' : 'nights'}`;
  }

  let phone = null;
  if (!crewOnly && rental.phone_number) {
    phone = (
      <a href={telHref(rental.phone_number)} className="cal-stay-phone" onClick={e => e.stopPropagation()}>
        <span className="cal-stay-phone-icon"><Phone size={18} /></span>
        <span>{formatPhone(rental.phone_number) || rental.phone_number}</span>
      </a>
    );
  } else if (!crewOnly && stayType === 'guest') {
    phone = (
      <div className="cal-stay-phone cal-stay-phone-missing">
        <span className="cal-stay-phone-icon"><Phone size={18} /></span>
        <span>MISSING</span>
      </div>
    );
  }

  const open = () => onOpen(rental);

  return (
    <Card
      variant="float1"
      className="cal-stay-card card-clickable"
      role="button"
      tabIndex={0}
      onClick={(e) => { if (e.target.closest('a, button')) return; open(); }}
      onKeyDown={(e) => { if (e.target !== e.currentTarget) return; activate(open)(e); }}
    >
      <div className="cal-stay-trim" style={{ background: status.color }}>
        <span className="cal-stay-trim-name">{nameLabel}</span>
        <span className="cal-stay-trim-status">{statusText.toUpperCase()}</span>
      </div>
      <div className="card-body">
        <div className="cal-stay-dates">{dates}</div>
        {phone}
        <div className="cal-stay-footer">
          {nightsLabel && <span>{nightsLabel}</span>}
        </div>
        {rental.notes && <div className="cal-stay-notes">{rental.notes}</div>}
      </div>
    </Card>
  );
}

function StaysList({ rentals, onOpen }) {
  const today = startOfToday();
  const upcoming = rentals
    .filter(r => dayOf(r.end_date) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const current = upcoming.filter(r => today >= dayOf(r.start_date) && today <= dayOf(r.end_date));
  const future = upcoming.filter(r => dayOf(r.start_date) > today);

  if (current.length === 0 && future.length === 0) {
    return <div className="empty-state"><p>No upcoming stays</p></div>;
  }

  const nextId = future[0]?.id;
  return (
    <div>
      {current.length > 0 && (
        <>
          <div className="cal-section-header">CURRENT GUEST</div>
          <div className="cal-stay-list">
            {current.map(r => <StayCard key={r.id} rental={r} isNext={false} allRentals={rentals} onOpen={onOpen} />)}
          </div>
        </>
      )}
      {future.length > 0 && (
        <>
          <div className="cal-section-header">UPCOMING</div>
          <div className="cal-stay-list">
            {future.map(r => <StayCard key={r.id} rental={r} isNext={r.id === nextId} allRentals={rentals} onOpen={onOpen} />)}
          </div>
        </>
      )}
    </div>
  );
}

function StayDetailSheet({ rental, allRentals, onClose }) {
  if (!rental) return null;
  const status = getStatus(rental, allRentals);
  const showPhone = !isCrewOnly() && rental.phone_number;
  return (
    <Sheet
      open
      title={guestNameOf(rental)}
      onClose={onClose}
      actions={<Button variant="tertiary" size="lg" className="btn-block" onClick={onClose}>Close</Button>}
    >
      <div className="detail-field">
        <span className="detail-field-label">Status</span>
        <span className="detail-field-value" style={{ color: status.color, fontWeight: 700 }}>{status.label}</span>
      </div>
      <div className="detail-field">
        <span className="detail-field-label">Dates</span>
        <span className="detail-field-value">{fmtDate(rental.start_date)} – {fmtDate(rental.end_date)}</span>
      </div>
      {rental.pool_heat && (
        <div className="detail-field">
          <span className="detail-field-label">Pool heat</span>
          <span className="detail-field-value">{rental.pool_heat}</span>
        </div>
      )}
      {rental.notes && <div className="cal-detail-notes">{rental.notes}</div>}
      {showPhone && (
        <div className="cal-detail-call">
          <Button asChild variant="primary" size="lg" className="btn-block">
            <a href={telHref(rental.phone_number)}>Call {formatPhone(rental.phone_number) || rental.phone_number}</a>
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// ---- Due dates ----

function DueRow({ task, today }) {
  const kindMeta = DUE_KIND[dueKindFor(task)];
  const d = new Date(task.due_date + 'T12:00:00');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const isOverdue = task.due_date < today;

  const metaParts = [kindMeta.label];
  if (task.vendor?.name) metaParts.push(task.vendor.name);
  if (task.assigned_user?.name) metaParts.push(task.assigned_user.name);
  if (task.cost != null) metaParts.push(formatCurrency(task.cost));

  const open = () => { if (task.id) navigate('task-detail', task.id); };

  return (
    <div
      className={`cal-due-row${isOverdue ? ' cal-due-row-overdue' : ''}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={activate(open)}
    >
      <div className="cal-due-date-col">
        <div className="cal-due-date-month">{month}</div>
        <div className="cal-due-date-day">{d.getDate()}</div>
      </div>
      <div className="cal-due-body">
        <div className="cal-due-title">
          <span className={`cal-due-kind-dot ${kindMeta.dot}`} />{task.title}
        </div>
        <div className="cal-due-meta">{metaParts.join(' · ')}</div>
      </div>
    </div>
  );
}

function DuePanel({ tasks, error }) {
  if (error) return <div className="empty-state"><p>Failed to load due dates</p></div>;
  if (tasks === null) return <div className="cal-loading"><Spinner size={24} label="Loading" /></div>;
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <p>No items with due dates yet.</p>
        <p className="text-sm text-muted">Set a due date on a project, purchase, or reimbursement to see it here.</p>
      </div>
    );
  }

  const today = todayStr();
  const overdue = tasks.filter(t => t.due_date < today);
  const dueToday = tasks.filter(t => t.due_date === today);
  const upcoming = tasks.filter(t => t.due_date > today);

  const section = (label, list, extra = '') => list.length > 0 && (
    <>
      <div className={`cal-due-section-header${extra}`}>{label}</div>
      {list.map(t => <DueRow key={t.id} task={t} today={today} />)}
    </>
  );

  return (
    <div className="cal-due-feed">
      {section('Overdue', overdue, ' cal-due-section-overdue')}
      {section('Today', dueToday)}
      {section('Upcoming', upcoming)}
    </div>
  );
}

// ---- Month grid ----

function DayDetail({ dateStr, rentals }) {
  const d = new Date(dateStr + 'T12:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const checkouts = rentals.filter(r => r.end_date === dateStr);
  const checkins = rentals.filter(r => r.start_date === dateStr);
  const ongoing = rentals.filter(r => dateStr > r.start_date && dateStr < r.end_date);
  const empty = checkouts.length === 0 && checkins.length === 0 && ongoing.length === 0;

  // Next stay: first check-in after this date
  const nextStay = rentals
    .filter(r => r.start_date > dateStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  const event = (r, type, typeClass) => (
    <div className="cal-event" key={`${type}-${r.id}`}>
      <div className={`cal-event-type ${typeClass}`}>{type}</div>
      <strong>{guestNameOf(r)}</strong>
      <div className="text-sm text-muted">{formatDate(r.start_date)} - {formatDate(r.end_date)}</div>
    </div>
  );

  const showTurnover = !empty && checkouts.length > 0 && checkins.length > 0;

  return (
    <>
      <div className="cal-day-detail">
        <h3 className="cal-day-detail-title">{label}</h3>
        {empty ? (
          <div className="empty-state"><p>No stays on this date</p></div>
        ) : (
          <>
            {checkouts.map(r => event(r, 'Checkout', 'cal-event-checkout'))}
            {checkins.map(r => event(r, 'Check-in', 'cal-event-checkin'))}
            {ongoing.map(r => event(r, 'In-Stay', 'cal-event-instay'))}
          </>
        )}
        {nextStay && (
          <div className="cal-event cal-event-next">
            <div className="cal-event-type cal-event-muted">Next stay</div>
            <strong>{guestNameOf(nextStay)}</strong>
            <div className="text-sm text-muted">Starts {formatDate(nextStay.start_date)}</div>
          </div>
        )}
      </div>
      {showTurnover && <TurnoverBanner checkout={checkouts[0]} checkin={checkins[0]} />}
    </>
  );
}

function TurnoverBanner({ checkout, checkin }) {
  const outTime = '11:00 AM';
  const inTime = '4:00 PM';
  const hours = 5;
  return (
    <div className="cal-turnover">
      <h4 className="cal-turnover-title">Turnover Window</h4>
      <p className="cal-turnover-window">
        <strong>{hours} hours</strong> &mdash; {outTime} to {inTime}
      </p>
      <p className="text-sm text-muted">
        {guestNameOf(checkout)} out &rarr; {guestNameOf(checkin)} in
      </p>
    </div>
  );
}

function MonthGrid({ rentals }) {
  const [current, setCurrent] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(null);

  const { year, month } = current;
  const shift = (delta) => {
    const d = new Date(year, month + delta, 1);
    setCurrent({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(null);
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`e${i}`} className="cal-day cal-day-empty" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

    // Priority: check-in > in-range > check-out-only
    const checkIn = rentals.find(r => r.start_date === dateStr);
    const inRange = rentals.find(r => r.start_date < dateStr && dateStr < r.end_date);
    const checkOut = rentals.find(r => r.end_date === dateStr);

    let chip = null;
    const display = checkIn || inRange;
    if (display) {
      const status = getStatus(display, rentals);
      let color = status.color;
      if (status.code === 'guest-arrive') color = STATUS_COLORS['guest-current'];
      const bg = checkIn
        ? `linear-gradient(135deg, transparent 0%, transparent 50%, ${color} 50%, ${color} 100%)`
        : color;
      chip = <div className="cal-day-chip" style={{ background: bg }}><span>{firstName(display)}</span></div>;
    } else if (checkOut) {
      const color = getStatus(checkOut, rentals).color;
      chip = (
        <div className="cal-day-chip" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color} 50%, transparent 50%, transparent 100%)` }}>
          <span>{firstName(checkOut)}</span>
        </div>
      );
    }

    const select = () => setSelectedDate(dateStr);
    cells.push(
      <div
        key={dateStr}
        className={`cal-day${isToday ? ' cal-day-today' : ''}${selectedDate === dateStr ? ' cal-day-selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={dateStr}
        onClick={select}
        onKeyDown={activate(select)}
      >
        <span className="cal-day-num">{d}</span>
        {chip}
      </div>,
    );
  }

  return (
    <div>
      <div className="cal-month-header">
        <ButtonRound variant="tertiary" icon={<ArrowLeft />} aria-label="Previous month" onClick={() => shift(-1)} />
        <h2 className="cal-month-label">{monthLabel}</h2>
        <ButtonRound variant="tertiary" icon={<ArrowRight />} aria-label="Next month" onClick={() => shift(1)} />
      </div>
      <Card variant="flat" className="cal-grid-card">
        <div className="cal-grid">
          {DAY_LABELS.map(l => <div key={l} className="cal-day-label">{l}</div>)}
          {cells}
        </div>
      </Card>
      <div className="cal-legend">
        {LEGEND.map(([label, color]) => (
          <div key={label} className="cal-legend-item">
            <span className="cal-legend-swatch" style={{ background: color }} />{label}
          </div>
        ))}
      </div>
      {selectedDate && <DayDetail dateStr={selectedDate} rentals={rentals} />}
    </div>
  );
}

// ---- View ----

export default function Calendar() {
  const [tab, setTab] = useState('list');
  const [rentals, setRentals] = useState(null);
  const [dueTasks, setDueTasks] = useState(null);
  const [dueError, setDueError] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRentals() {
      // Pull the last month for grid context and every upcoming stay —
      // no upper bound so the list isn't truncated.
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const { data, error } = await sb.from('rentals')
        .select('*')
        .gte('end_date', start)
        .eq('hidden', false)
        .order('start_date');
      if (error) console.error('Failed to load rentals:', error);
      if (!cancelled) setRentals(data || []);
    }

    async function loadDue() {
      const { data, error } = await sb.from('tasks')
        .select('id, title, due_date, status, type, cost, updated_at, assigned_user:users!tasks_assigned_to_fkey(name), vendor:vendors!tasks_vendor_id_fkey(name)')
        .not('due_date', 'is', null)
        .neq('status', 'Done')
        .order('due_date', { ascending: true });
      if (cancelled) return;
      if (error) { setDueError(true); return; }
      setDueTasks(data || []);
    }

    loadRentals();
    loadDue();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page page-wide">
      <Tabs aria-label="Calendar views" className="cal-tabs">
        <Tab active={tab === 'list'} onClick={() => setTab('list')}>Stays</Tab>
        <Tab active={tab === 'calendar'} onClick={() => setTab('calendar')}>Month</Tab>
        <Tab active={tab === 'due'} onClick={() => setTab('due')}>Due Dates</Tab>
      </Tabs>

      {/* Panels stay mounted (hidden) like legacy, so the month and selected day survive tab switches. */}
      <div hidden={tab !== 'list'}>
        {rentals === null
          ? <div className="cal-loading"><Spinner size={24} label="Loading" /></div>
          : <StaysList rentals={rentals} onOpen={setDetail} />}
      </div>

      <div hidden={tab !== 'due'}>
        <DuePanel tasks={dueTasks} error={dueError} />
      </div>

      <div hidden={tab !== 'calendar'}>
        <MonthGrid rentals={rentals || []} />
      </div>

      <StayDetailSheet rental={detail} allRentals={rentals || []} onClose={() => setDetail(null)} />
    </div>
  );
}
