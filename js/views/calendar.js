// Calendar View — rental timeline
const Calendar = {
  currentDate: new Date(),
  rentals: [],
  selectedDate: null,

  async load() {
    const now = Calendar.currentDate;
    Calendar.updateLabel();

    // Fetch rentals for a wide window (3 months around current)
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0];

    const { data } = await sb.from('rentals')
      .select('*')
      .gte('end_date', start)
      .lte('start_date', end)
      .eq('hidden', false)
      .order('start_date');

    Calendar.rentals = data || [];
    Calendar.renderGrid();
    Calendar.hideDetail();
  },

  updateLabel() {
    const d = Calendar.currentDate;
    document.getElementById('cal-month-label').textContent =
      d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  },

  renderGrid() {
    const grid = document.getElementById('calendar-grid');
    const year = Calendar.currentDate.getFullYear();
    const month = Calendar.currentDate.getMonth();

    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Build rental lookup
    const dateMap = Calendar.buildDateMap(year, month, daysInMonth);

    let html = '';
    const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    dayLabels.forEach(d => { html += `<div class="cal-day-label">${d}</div>`; });

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="cal-day empty"></div>';
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = dateMap[dateStr] || {};
      const classes = ['cal-day'];

      if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d) {
        classes.push('today');
      }
      if (info.hasCheckout) classes.push('has-checkout');
      if (info.hasCheckin) classes.push('has-checkin');
      if (info.inStay) classes.push('stay-range');

      html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${d}</div>`;
    }

    grid.innerHTML = html;

    // Day click
    grid.querySelectorAll('.cal-day:not(.empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        Calendar.selectedDate = cell.dataset.date;
        Calendar.showDetail(cell.dataset.date);
      });
    });
  },

  buildDateMap(year, month, daysInMonth) {
    const map = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      map[dateStr] = { hasCheckin: false, hasCheckout: false, inStay: false, rentals: [] };
    }

    Calendar.rentals.forEach(r => {
      // Check if stay overlaps this month
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!map[dateStr]) continue;

        if (r.start_date === dateStr) {
          map[dateStr].hasCheckin = true;
          map[dateStr].rentals.push(r);
        }
        if (r.end_date === dateStr) {
          map[dateStr].hasCheckout = true;
          if (!map[dateStr].rentals.includes(r)) map[dateStr].rentals.push(r);
        }
        if (dateStr >= r.start_date && dateStr <= r.end_date) {
          map[dateStr].inStay = true;
          if (!map[dateStr].rentals.includes(r)) map[dateStr].rentals.push(r);
        }
      }
    });

    return map;
  },

  showDetail(dateStr) {
    const detail = document.getElementById('calendar-day-detail');
    const label = document.getElementById('cal-day-label');
    const eventsEl = document.getElementById('cal-day-events');
    const turnoverBanner = document.getElementById('turnover-banner');

    const d = new Date(dateStr + 'T12:00:00');
    label.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Find events for this date
    const checkouts = Calendar.rentals.filter(r => r.end_date === dateStr);
    const checkins = Calendar.rentals.filter(r => r.start_date === dateStr);
    const ongoing = Calendar.rentals.filter(r => dateStr > r.start_date && dateStr < r.end_date);

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

      // Turnover calculation: checkout and checkin on same day
      if (checkouts.length > 0 && checkins.length > 0) {
        const turnoverHtml = Calendar.calcTurnover(checkouts[0], checkins[0]);
        turnoverBanner.innerHTML = turnoverHtml;
        turnoverBanner.hidden = false;
      } else {
        turnoverBanner.hidden = true;
      }
    }

    eventsEl.innerHTML = eventsHtml;
    detail.hidden = false;
  },

  calcTurnover(checkout, checkin) {
    // Default times if not available
    const outTime = '11:00 AM';
    const inTime = '4:00 PM';
    const hours = 5; // default turnover window

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
    document.getElementById('calendar-day-detail').hidden = true;
    document.getElementById('turnover-banner').hidden = true;
  },

  init() {
    document.getElementById('cal-prev').addEventListener('click', () => {
      Calendar.currentDate.setMonth(Calendar.currentDate.getMonth() - 1);
      Calendar.load();
    });

    document.getElementById('cal-next').addEventListener('click', () => {
      Calendar.currentDate.setMonth(Calendar.currentDate.getMonth() + 1);
      Calendar.load();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Calendar.init());
