// StockStatus — reusable stock-level marker for an inventory item.
// Three states: Stocked | Low | Restock (stored in DB as "Empty").
//
// Usage:
//   container.innerHTML = StockStatus.render({ id, status });
//   StockStatus.bind(container, (itemId, newStatus) => { ... });
//
// DB values remain 'Stocked' | 'Low' | 'Empty' for backwards compatibility;
// the Restock label is presentation-only.

(function () {
  const OPTIONS = [
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
