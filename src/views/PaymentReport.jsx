import { useMemo, useState } from 'react';
import { Button, Segment, SegmentedControl } from '@tomcoggia/ui';
import { Download } from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/format.js';
import { descriptionLine, payeeName, paymentKind, serviceDate } from '../lib/payments.js';
import { paymentMethodLabel } from '../components/VendorForm.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { toast } from '../components/Toast.jsx';

/**
 * Every invoice and reimbursement SUBMITTED in a period - paid or not - with
 * totals, downloadable as CSV. Periods are calendar years in local time:
 *   Last year     Jan 1 - Dec 31 of the previous year
 *   Year to date  Jan 1 this year - today
 *
 * `payments` is Admin's already-loaded list (all type 'reimbursement' rows with
 * creator / recipient / vendor joined), so the report adds no query.
 */
export function PaymentReportSheet({ open, payments, onClose }) {
  const [period, setPeriod] = useState('ytd');

  const now = new Date();
  const year = period === 'last' ? now.getFullYear() - 1 : now.getFullYear();
  const start = new Date(year, 0, 1);
  const end = period === 'last' ? new Date(year + 1, 0, 1) : now;
  const periodLabel = period === 'last' ? `${year}` : `${year} year to date`;

  const rows = useMemo(() => (payments || [])
    .filter(r => {
      const t = new Date(r.created_at);
      return t >= start && t <= end;
    })
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
  [payments, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = (list) => list.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
  const paid = rows.filter(r => r.status === 'Done');
  const invoices = rows.filter(r => paymentKind(r) === 'Invoice');

  const download = () => {
    if (rows.length === 0) { toast('Nothing to export for this period'); return; }
    const csv = toCsv(rows);
    const name = period === 'last' ? `strpal-payments-${year}.csv` : `strpal-payments-${year}-ytd.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Sheet
      open={open}
      wide
      title="Payment Report"
      onClose={onClose}
      actions={<>
        <Button variant="tertiary" size="lg" onClick={onClose}>Close</Button>
        <Button variant="primary" size="lg" icon={<Download />} onClick={download} disabled={rows.length === 0}>
          Download CSV
        </Button>
      </>}
    >
      <SegmentedControl aria-label="Report period" size="lg">
        <Segment selected={period === 'last'} onClick={() => setPeriod('last')}>Last year</Segment>
        <Segment selected={period === 'ytd'} onClick={() => setPeriod('ytd')}>Year to date</Segment>
      </SegmentedControl>

      <div className="text-sm text-muted">
        Everything submitted {formatRange(start, end)} · {periodLabel}
      </div>

      <div className="admin-report-totals">
        <Total label="Total submitted" value={formatCurrency(sum(rows))} note={`${rows.length} payment${rows.length === 1 ? '' : 's'}`} />
        <Total label="Paid" value={formatCurrency(sum(paid))} note={`${paid.length}`} />
        <Total label="To pay" value={formatCurrency(sum(rows) - sum(paid))} note={`${rows.length - paid.length}`} />
        <Total label="Invoices" value={formatCurrency(sum(invoices))} note={`${invoices.length}`} />
        <Total label="Reimbursements" value={formatCurrency(sum(rows) - sum(invoices))} note={`${rows.length - invoices.length}`} />
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">No invoices or reimbursements submitted in this period</div>
      ) : (
        <div className="admin-report-list" role="table" aria-label={`Payments, ${periodLabel}`}>
          <div className="admin-report-row admin-report-head" role="row">
            <span role="columnheader">Submitted</span>
            <span role="columnheader">Paid to</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="admin-report-amount">Amount</span>
          </div>
          {rows.map(r => (
            <div key={r.id} className="admin-report-row" role="row">
              <span role="cell">{formatDate(localDate(r.created_at))}</span>
              <span role="cell" className="admin-report-payee">
                <span className="text-strong">{payeeName(r) || '—'}</span>
                <span className="text-xs text-muted">{stripPrefix(r.title)}</span>
              </span>
              <span role="cell">{paymentKind(r)}</span>
              <span role="cell">
                <span className={`status-badge ${r.status === 'Done' ? 'success' : 'info'}`}>
                  {r.status === 'Done' ? 'Paid' : 'To pay'}
                </span>
              </span>
              <span role="cell" className="admin-report-amount">{formatCurrency(r.cost)}</span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function Total({ label, value, note }) {
  return (
    <div className="admin-report-total">
      <span className="text-xs text-muted">{label}</span>
      <span className="admin-report-total-value">{value}</span>
      <span className="text-xs text-faint">{note}</span>
    </div>
  );
}

// YYYY-MM-DD of a timestamp in local time
function localDate(ts) {
  return ts ? new Date(ts).toLocaleDateString('en-CA') : '';
}

function formatRange(start, end) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function stripPrefix(title) {
  return (title || '').replace(/^(Invoice|Reimbursement):\s*/i, '');
}

const CSV_COLUMNS = [
  ['Submitted', r => localDate(r.created_at)],
  ['Type', r => paymentKind(r)],
  ['Paid to', r => payeeName(r) || ''],
  ['Vendor / seller', r => r.vendor?.name || descriptionLine(r.description, 'Purchased at') || ''],
  ['For', r => stripPrefix(r.title)],
  ['Date billed / purchased', r => serviceDate(r) || ''],
  ['Amount', r => (r.cost == null ? '' : Number(r.cost).toFixed(2))],
  ['Status', r => (r.status === 'Done' ? 'Paid' : 'To pay')],
  ['Date paid', r => (r.status === 'Done' ? localDate(r.updated_at) : '')],
  ['Paid via', r => (r.payment_method ? paymentMethodLabel(r.payment_method) : '')],
  ['Submitted by', r => r.creator?.name || ''],
  ['Description', r => r.description || ''],
  ['Receipt', r => r.receipt_image_url || ''],
];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(',')];
  rows.forEach(r => lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(',')));
  // BOM so Excel opens it as UTF-8
  return '﻿' + lines.join('\r\n') + '\r\n';
}
