export function formatNumber(n) {
  if (n === undefined || n === null) return '0';
  return Math.round(n).toLocaleString();
}

export function formatCountdown(endsAt) {
  if (!endsAt) return null;
  const diff = new Date(endsAt) - Date.now();
  if (diff <= 0) return 'Done';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatEta(timestamp) {
  if (!timestamp) return '—';
  const diff = new Date(timestamp) - Date.now();
  if (diff <= 0) return 'Arrived';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `ETA ${h}h ${m}m`;
  if (m > 0) return `ETA ${m}m ${s}s`;
  return `ETA ${s}s`;
}

// Returns first initial + last initial from username
// e.g. "john_doe" → "JD", "Alice" → "AL", "CamelCase" → "CC"
export function getInitials(username) {
  if (!username) return '??';
  // Try splitting on space or underscore
  const parts = username.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // Try camelCase split
  const camel = username.replace(/([A-Z])/g, ' $1').trim().split(/\s+/);
  if (camel.length >= 2) {
    return (camel[0][0] + camel[camel.length - 1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export function formatRate(rate) {
  return `${rate >= 1 ? rate.toFixed(1) : rate.toFixed(2)}/min`;
}
