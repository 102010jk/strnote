/** Oběžná doba ve dnech, čitelně. */
export function formatPeriod(days) {
  const abs = Math.abs(days);
  const number = (value, digits = 1) => value.toLocaleString('cs-CZ', { maximumFractionDigits: digits });

  if (!Number.isFinite(abs)) return 'stojí';
  if (abs < 1) return `${number(abs * 24)} h`;
  if (abs < 365.25) return `${number(abs)} dní`;
  return `${number(abs / 365.25)} let`;
}

export function formatSpeed(kmPerSecond) {
  return `${kmPerSecond.toLocaleString('cs-CZ', { maximumFractionDigits: kmPerSecond < 10 ? 2 : 1 })} km/s`;
}

export function formatNumber(value, digits = 2) {
  return value.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
