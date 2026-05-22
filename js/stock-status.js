// StockStatus — reusable stock-level marker for an inventory item.
// Four states: Check | Stocked | Low | Restock (stored in DB as "Empty").
//
// Usage:
//   container.innerHTML = StockStatus.render({ id, status });
//   StockStatus.bind(container, (itemId, newStatus) => { ... });
//
// DB values are 'Check' | 'Stocked' | 'Low' | 'Empty';
// the Restock label is presentation-only.

(function () {
  const OPTIONS = [
    { value: 'Check',   label: 'Check',   cls: 'check' },
    { value: 'Stocked', label: 'Stocked', cls: 'stocked' },
    { value: 'Low',     label: 'Low',     cls: 'low' },
    { value: 'Empty',   label: 'Restock', cls: 'empty' },
  ];

  const StockStatus = {
    render(item) {
      const status = (item && item.status) || 'Stocked';
      const id = item && item.id != null ? item.id : '';
      const buttons = OPTIONS.map(o =>
        `<button type="button" class="inv-status-btn ${o.cls} ${status === o.value ? 'active' : ''}" data-id="${escapeHtml(String(id))}" data-status="${o.value}">${o.label}</button>`
      ).join('');
      return `<div class="inv-status-toggle" data-stock-status>${buttons}</div>`;
    },

    bind(container, onChange) {
      container.querySelectorAll('[data-stock-status] button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onChange(btn.dataset.id, btn.dataset.status, btn);
        });
      });
    },

    labelFor(value) {
      const o = OPTIONS.find(x => x.value === value);
      return o ? o.label : value;
    },

    options() {
      return OPTIONS.slice();
    },
  };

  window.StockStatus = StockStatus;
})();
