// Calendar View — list of upcoming stays + month grid
const Calendar = {
  currentDate: new Date(),
  rentals: [],
  allRentals: [],
  selectedDate: null,
  tab: 'list',

  STATUS_COLORS: {
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
  },

  init() {
    document.getElementById('cal-prev').addEventListener('click', () => {
      Calendar.currentDate.setMonth(Calendar.currentDate.getMonth() - 1);
      Calendar.renderGrid();
      Calendar.hideDetail();
    });

    document.getElementById('cal-next').addEventListener('click', () => {
      Calendar.currentDate.setMonth(Calendar.currentDate.getMonth() + 1);
      Calendar.renderGrid();
      Calendar.hideDetail();
    });

    document.querySelectorAll('#calendar-tabs .feed-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#calendar-tabs .feed-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Calendar.tab = btn.dataset.calTab;
        Calendar.showActiveTab();
      });
    });
  },

  async load() {
    // Pull the last month for grid context and every upcoming stay —
    // no upper bound so the list isn't truncated.
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];

    const { data, error } = await sb.from('rentals')
      .select('*')
      .gte('end_date', start)
      .eq('hidden', false)
      .order('start_date');

    if (error) {
      console.error('Failed to load rentals:', error);
    }

    Calendar.allRentals = data || [];
    Calendar.rentals = Calendar.allRentals;
    Calendar.updateLabel();
    Calendar.renderList();
    Calendar.renderGrid();
    Calendar.showActiveTab();
    Calendar.hideDetail();
  },

  showActiveTab() {
    const listPanel = document.getElementById('calendar-list-panel');
    const gridPanel = document.getElementById('calendar-grid-panel');
    listPanel.hidden = Calendar.tab !== 'list';
    gridPanel.hidden = Calendar.tab !== 'calendar';
  },

  // ---- List view ----

  getStatus(rental, allRentals) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const stayType = rental.stay_type || 'guest';

    if (stayType === 'service') {
      const serviceDay = new Date((rental.service_date || rental.start_date) + 'T12:00:00');
      serviceDay.setHours(0, 0, 0, 0);
      if (serviceDay < today) return { code: 'past', label: 'Completed', color: Calendar.STATUS_COLORS.past };
      if (serviceDay.getTime() === today.getTime()) return { code: 'service-today', label: 'Today', color: Calendar.STATUS_COLORS.service };
      if (serviceDay.getTime() === tomorrow.getTime()) return { code: 'service-tomorrow', label: 'Tomorrow', color: Calendar.STATUS_COLORS.service };
      return { code: 'service-upcoming', label: 'Scheduled', color: Calendar.STATUS_COLORS.service };
    }

    const startDate = new Date(rental.start_date + 'T12:00:00');
    const endDate = new Date(rental.end_date + 'T12:00:00');
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const isCheckInDay = startDate.getTime() === today.getTime();
    const isTomorrow = startDate.getTime() === tomorrow.getTime();
    const isCurrent = today >= startDate && today <= endDate;
    const isCheckOutDay = endDate.getTime() === today.getTime();
    const isPast = today > endDate;

    // Same-day turnover detection
    if (!isPast && allRentals) {
      const hasSameDayCheckout = allRentals.some(o => {
        if (o.id === rental.id) return false;
        const oEnd = new Date(o.end_date + 'T12:00:00'); oEnd.setHours(0, 0, 0, 0);
        return oEnd.getTime() === startDate.getTime();
      });
      if (hasSameDayCheckout && today.getTime() <= startDate.getTime()) {
        return { code: 'turnover-sameday', label: 'Quick turnover', color: Calendar.STATUS_COLORS['turnover-sameday'] };
      }
    }

    if (stayType === 'owner') {
      if (isPast) return { code: 'past', label: 'Complete', color: Calendar.STATUS_COLORS.past };
      if (isCheckOutDay) return { code: 'owner-leave', label: 'Leave today', color: Calendar.STATUS_COLORS.owner };
      if (isCheckInDay) return { code: 'owner-arrive', label: 'Arrive today', color: Calendar.STATUS_COLORS.owner };
      if (isCurrent) return { code: 'owner-current', label: 'Owner stay', color: Calendar.STATUS_COLORS.owner };
      if (isTomorrow) return { code: 'owner-tomorrow', label: 'Tomorrow', color: Calendar.STATUS_COLORS.owner };
      return { code: 'owner-upcoming', label: 'Owner', color: Calendar.STATUS_COLORS.owner };
    }

    if (stayType === 'unresolved') {
      if (isPast) return { code: 'past', label: 'Completed', color: Calendar.STATUS_COLORS.past };
      return { code: 'unresolved', label: 'Needs attention', color: Calendar.STATUS_COLORS.unresolved };
    }

    // Guest
    if (isPast) return { code: 'past', label: 'Completed', color: Calendar.STATUS_COLORS.past };
    if (isCheckOutDay) return { code: 'guest-leave', label: 'Check-out today', color: Calendar.STATUS_COLORS['guest-leave'] };
    if (isCheckInDay) return { code: 'guest-arrive', label: 'Check-in today', color: Calendar.STATUS_COLORS['guest-arrive'] };
    if (isCurrent) return { code: 'guest-current', label: 'Current stay', color: Calendar.STATUS_COLORS['guest-current'] };
    if (isTomorrow) return { code: 'guest-tomorrow', label: 'Tomorrow', color: Calendar.STATUS_COLORS['guest-tomorrow'] };
    return { code: 'guest-upcoming', label: 'Upcoming', color: Calendar.STATUS_COLORS['guest-upcoming'] };
  },

  renderList() {
    const panel = document.getElementById('calendar-list-panel');
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const upcoming = Calendar.allRentals.filter(r => {
      const end = new Date(r.end_date + 'T12:00:00'); end.setHours(0, 0, 0, 0);
      return end >= today;
    }).sort((a, b) => a.start_date.localeCompare(b.start_date));

    const current = upcoming.filter(r => {
      const start = new Date(r.start_date + 'T12:00:00'); start.setHours(0, 0, 0, 0);
      const end = new Date(r.end_date + 'T12:00:00'); end.setHours(0, 0, 0, 0);
      return today >= start && today <= end;
    });

    const future = upcoming.filter(r => {
      const start = new Date(r.start_date + 'T12:00:00'); start.setHours(0, 0, 0, 0);
      return start > today;
    });

    let html = '';

    if (current.length === 0 && future.length === 0) {
      html = '<div class="empty-state"><p>No upcoming stays</p></div>';
    } else {
      if (current.length > 0) {
        html += '<div class="stays-section-header">CURRENT GUEST</div>';
        html += current.map(r => Calendar.renderStayCard(r, false)).join('');
      }
      if (future.length > 0) {
        html += '<div class="stays-section-header">UPCOMING</div>';
        const nextId = future[0].id;
        html += future.map(r => Calendar.renderStayCard(r, r.id === nextId)).join('');
      }
    }

    panel.innerHTML = html;

    panel.querySelectorAll('.stay-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) return;
        const r = Calendar.allRentals.find(x => x.id === card.dataset.id);
        if (r) Calendar.showStayDetail(r);
      });
    });
  },

  renderStayCard(rental, isNext) {
    const status = Calendar.getStatus(rental, Calendar.allRentals);
    const stayType = rental.stay_type || 'guest';
    const isCrewOnly = App.isCrewOnly();
    const guestName = isCrewOnly ? 'Guest' : (rental.guest_name || 'Guest');

    const nameLabel = stayType === 'owner'
      ? `${guestName} blocked`
      : stayType === 'unresolved'
        ? 'Not available'
        : guestName;

    // "Begins in N days" override for the very next upcoming stay
    let statusText = status.label;
    if (isNext && status.code.includes('upcoming')) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const start = new Date(rental.start_date + 'T12:00:00'); start.setHours(0, 0, 0, 0);
      const days = Math.ceil((start - today) / 86400000);
      statusText = stayType === 'service'
        ? `Scheduled in ${days} ${days === 1 ? 'day' : 'days'}`
        : `Begins in ${days} ${days === 1 ? 'day' : 'days'}`;
    }

    // Date display
    let dateHtml = '';
    if (stayType === 'service' && (rental.service_date || rental.service_time)) {
      const datePart = rental.service_date ? Calendar.fmtDate(rental.service_date) : '';
      const timePart = rental.service_time ? ` at ${rental.service_time}` : '';
      dateHtml = `<span class="stay-date-main">${escapeHtml(datePart)}</span><span class="stay-date-sep">${escapeHtml(timePart)}</span>`;
    } else {
      dateHtml = `
        <span class="stay-date-main">${Calendar.fmtDate(rental.start_date)}</span>
        <span class="stay-date-sep"> – </span>
        <span class="stay-date-main">${Calendar.fmtDate(rental.end_date)}</span>
      `;
    }

    // Nights
    let nightsHtml = '';
    if (stayType !== 'service') {
      const start = new Date(rental.start_date + 'T12:00:00'); start.setHours(0, 0, 0, 0);
      const end = new Date(rental.end_date + 'T12:00:00'); end.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const totalNights = Math.ceil((end - start) / 86400000);
      const nightsLeft = Math.max(0, Math.ceil((end - today) / 86400000));
      const inProgress = today >= start && today <= end;
      const label = inProgress
        ? `${nightsLeft} ${nightsLeft === 1 ? 'night' : 'nights'} left`
        : `${totalNights} ${totalNights === 1 ? 'night' : 'nights'}`;
      nightsHtml = `<span class="stay-nights">${label}</span>`;
    }

    // Phone
    let phoneHtml = '';
    if (!isCrewOnly && rental.phone_number) {
      const formatted = formatPhone(rental.phone_number) || rental.phone_number;
      const telHref = 'tel:' + rental.phone_number.replace(/[^\d+]/g, '');
      phoneHtml = `
        <a href="${escapeHtml(telHref)}" class="stay-phone" onclick="event.stopPropagation()">
          <span class="stay-phone-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </span>
          <span class="stay-phone-num">${escapeHtml(formatted)}</span>
        </a>
      `;
    } else if (!isCrewOnly && stayType === 'guest') {
      phoneHtml = `
        <div class="stay-phone stay-phone-missing">
          <span class="stay-phone-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </span>
          <span class="stay-phone-num">MISSING</span>
        </div>
      `;
    }

    return `
      <div class="stay-card" data-id="${rental.id}">
        <div class="stay-trim" style="background:${status.color}">
          <span class="stay-trim-name">${escapeHtml(nameLabel)}</span>
          <span class="stay-trim-status">${escapeHtml(statusText.toUpperCase())}</span>
        </div>
        <div class="stay-body">
          <div class="stay-dates">${dateHtml}</div>
          ${phoneHtml}
          <div class="stay-footer">
            ${nightsHtml}
          </div>
          ${rental.notes ? `<div class="stay-notes">${escapeHtml(rental.notes)}</div>` : ''}
        </div>
      </div>
    `;
  },

  fmtDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    const thisYear = new Date().getFullYear();
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (d.getFullYear() !== thisYear) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  },

  showStayDetail(r) {
    const isCrewOnly = App.isCrewOnly();
    const status = Calendar.getStatus(r, Calendar.allRentals);
    const guestName = isCrewOnly ? 'Guest' : (r.guest_name || 'Guest');
    const phoneHtml = !isCrewOnly && r.phone_number
      ? `<a class="btn btn-primary btn-block" href="tel:${escapeHtml(r.phone_number.replace(/[^\d+]/g, ''))}">Call ${escapeHtml(formatPhone(r.phone_number) || r.phone_number)}</a>`
      : '';

    showModal(`
      <h3 class="modal-title">${escapeHtml(guestName)}</h3>
      <div class="detail-field">
        <span class="detail-field-label">Status</span>
        <span class="detail-field-value" style="color:${status.color};font-weight:700">${escapeHtml(status.label)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-field-label">Dates</span>
        <span class="detail-field-value">${Calendar.fmtDate(r.start_date)} – ${Calendar.fmtDate(r.end_date)}</span>
      </div>
      ${r.pool_heat ? `<div class="detail-field"><span class="detail-field-label">Pool heat</span><span class="detail-field-value">${escapeHtml(r.pool_heat)}</span></div>` : ''}
      ${r.notes ? `<div style="margin-top:12px;font-size:14px;color:var(--text-muted);line-height:1.5;white-space:pre-wrap">${escapeHtml(r.notes)}</div>` : ''}
      ${phoneHtml ? `<div style="margin-top:12px">${phoneHtml}</div>` : ''}
      <div class="modal-actions">
        <button class="btn btn-ghost btn-block" onclick="hideModal()">Close</button>
      </div>
    `);
  },

  // ---- Month grid ----

  updateLabel() {
    const d = Calendar.currentDate;
    document.getElementById('cal-month-label').textContent =
      d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  },

  firstName(rental) {
    const type = rental.stay_type || 'guest';
    if (type === 'owner') return 'Owner';
    if (type === 'unresolved') return 'N/A';
    if (type === 'service') return 'Service';
    const full = (rental.guest_name || '').trim();
    return full.split(' ')[0] || 'Guest';
  },

  renderGrid() {
    Calendar.updateLabel();
    const grid = document.getElementById('calendar-grid');
    const year = Calendar.currentDate.getFullYear();
    const month = Calendar.currentDate.getMonth();

    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let html = '';
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dayLabels.forEach(d => { html += `<div class="cal-day-label">${d}</div>`; });

    for (let i = 0; i < firstDay; i++) {
      html += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday =
        today.getFullYear() === year &&
        today.getMonth() === month &&
        today.getDate() === d;

      // Decide which rental (if any) to display in this cell.
      // Priority: check-in (stayType present and start_date === day)
      //   > in-range (start < day < end)
      //   > check-out-only (end_date === day and no other booking takes the slot)
      const checkIn = Calendar.allRentals.find(r => r.start_date === dateStr);
      const inRange = Calendar.allRentals.find(r =>
        r.start_date < dateStr && dateStr < r.end_date
      );
      const checkOut = Calendar.allRentals.find(r => r.end_date === dateStr);

      let chip = '';
      const display = checkIn || inRange;
      if (display) {
        const status = Calendar.getStatus(display, Calendar.allRentals);
        let color = status.color;
        if (status.code === 'guest-arrive') color = Calendar.STATUS_COLORS['guest-current'];
        const isArrive = !!checkIn;
        const variant = isArrive ? 'checkin' : 'solid';
        const bg = variant === 'checkin'
          ? `linear-gradient(135deg, transparent 0%, transparent 50%, ${color} 50%, ${color} 100%)`
          : color;
        const name = Calendar.firstName(display);
        chip = `<div class="cal-day-chip ${variant}" style="background:${bg}"><span>${escapeHtml(name)}</span></div>`;
      } else if (checkOut) {
        const status = Calendar.getStatus(checkOut, Calendar.allRentals);
        const color = status.color;
        const name = Calendar.firstName(checkOut);
        chip = `<div class="cal-day-chip checkout" style="background:linear-gradient(135deg, ${color} 0%, ${color} 50%, transparent 50%, transparent 100%)"><span>${escapeHtml(name)}</span></div>`;
      }

      const classes = ['cal-day'];
      if (isToday) classes.push('today');

      html += `
        <div class="${classes.join(' ')}" data-date="${dateStr}">
          <span class="cal-day-num">${d}</span>
          ${chip}
        </div>
      `;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day:not(.empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        Calendar.selectedDate = cell.dataset.date;
        Calendar.showDetail(cell.dataset.date);
      });
    });
  },

  showDetail(dateStr) {
    const detail = document.getElementById('calendar-day-detail');
    const label = document.getElementById('cal-day-label');
    const eventsEl = document.getElementById('cal-day-events');
    const turnoverBanner = document.getElementById('turnover-banner');

    const d = new Date(dateStr + 'T12:00:00');
    label.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const checkouts = Calendar.allRentals.filter(r => r.end_date === dateStr);
    const checkins = Calendar.allRentals.filter(r => r.start_date === dateStr);
    const ongoing = Calendar.allRentals.filter(r => dateStr > r.start_date && dateStr < r.end_date);

    let eventsHtml = '';

    if (checkouts.length === 0 && checkins.length === 0 && ongoing.length === 0) {
      eventsHtml = '<div class="empty-state"><p>No stays on this date</p></div>';
      turnoverBanner.hidden = true;
    } else {
      checkouts.forEach(r => {
        const name = App.isCrewOnly() ? 'Guest' : (r.guest_name || 'Guest');
        eventsHtml += `
          <div class="cal-event">
            <div class="cal-event-type checkout">Checkout</div>
            <strong>${escapeHtml(name)}</strong>
            <div class="text-sm text-muted">${formatDate(r.start_date)} - ${formatDate(r.end_date)}</div>
          </div>
        `;
      });

      checkins.forEach(r => {
        const name = App.isCrewOnly() ? 'Guest' : (r.guest_name || 'Guest');
        eventsHtml += `
          <div class="cal-event">
            <div class="cal-event-type checkin">Check-in</div>
            <strong>${escapeHtml(name)}</strong>
            <div class="text-sm text-muted">${formatDate(r.start_date)} - ${formatDate(r.end_date)}</div>
          </div>
        `;
      });

      ongoing.forEach(r => {
        const name = App.isCrewOnly() ? 'Guest' : (r.guest_name || 'Guest');
        eventsHtml += `
          <div class="cal-event">
            <div class="cal-event-type" style="color:var(--accent)">In-Stay</div>
            <strong>${escapeHtml(name)}</strong>
            <div class="text-sm text-muted">${formatDate(r.start_date)} - ${formatDate(r.end_date)}</div>
          </div>
        `;
      });

      if (checkouts.length > 0 && checkins.length > 0) {
        const turnoverHtml = Calendar.calcTurnover(checkouts[0], checkins[0]);
        turnoverBanner.innerHTML = turnoverHtml;
        turnoverBanner.hidden = false;
      } else {
        turnoverBanner.hidden = true;
      }
    }

    // Next stay (first future check-in after this date, excluding same-day check-ins already listed above)
    const nextStay = Calendar.allRentals
      .filter(r => r.start_date > dateStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

    if (nextStay) {
      const nextName = App.isCrewOnly() ? 'Guest' : (nextStay.guest_name || 'Guest');
      eventsHtml += `
        <div class="cal-event cal-event-next">
          <div class="cal-event-type" style="color:var(--text-muted)">Next stay</div>
          <strong>${escapeHtml(nextName)}</strong>
          <div class="text-sm text-muted">Starts ${formatDate(nextStay.start_date)}</div>
        </div>
      `;
    }

    eventsEl.innerHTML = eventsHtml;
    detail.hidden = false;
  },

  calcTurnover(checkout, checkin) {
    const outTime = '11:00 AM';
    const inTime = '4:00 PM';
    const hours = 5;

    return `
      <h4>Turnover Window</h4>
      <p style="font-size:14px;margin-bottom:4px">
        <strong>${hours} hours</strong> &mdash; ${outTime} to ${inTime}
      </p>
      <p class="text-sm text-muted">
        ${App.isCrewOnly() ? 'Guest' : escapeHtml(checkout.guest_name || 'Guest')} out &rarr;
        ${App.isCrewOnly() ? 'Guest' : escapeHtml(checkin.guest_name || 'Guest')} in
      </p>
    `;
  },

  hideDetail() {
    const detail = document.getElementById('calendar-day-detail');
    const banner = document.getElementById('turnover-banner');
    if (detail) detail.hidden = true;
    if (banner) banner.hidden = true;
  },
};

document.addEventListener('DOMContentLoaded', () => Calendar.init());
