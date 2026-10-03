export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Handle 10-digit or 11-digit (with leading 1)
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export function formatCurrency(val) {
  if (val == null) return '—';
  return '$' + Number(val).toFixed(2);
}

export function isPdfUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.pdf(\?.*)?$/i.test(url.trim());
}

// Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
export function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
