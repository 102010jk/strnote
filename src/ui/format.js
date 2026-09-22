/** Oběžná doba ve dnech, čitelně. */
export function formatPeriod(days) {
  const abs = Math.abs(days);
  const number = (value, digits = 1) => value.toLocaleString('cs-CZ', { maximumFractionDigits: digits });

  if (!Number.isFinite(abs)) return 'stojí';
  if (abs < 1) return `${number(abs * 24)} h`;
  if (abs < 365.25) return `${number(abs)} ${plural(abs, ['den', 'dny', 'dní', 'dne'])}`;
  const years = abs / 365.25;
  return `${number(years)} ${plural(years, ['rok', 'roky', 'let', 'roku'])}`;
}

/** Tvar podle čísla, jak se zobrazí (na 1 desetinné místo): 1 rok, 3 roky, 5 let, 1,5 roku. */
function plural(value, [one, few, many, fraction]) {
  const shown = Math.round(value * 10) / 10;
  if (!Number.isInteger(shown)) return fraction;
  if (shown === 1) return one;
  if (shown >= 2 && shown <= 4) return few;
  return many;
}

export function formatSpeed(kmPerSecond) {
  return `${kmPerSecond.toLocaleString('cs-CZ', { maximumFractionDigits: kmPerSecond < 10 ? 2 : 1 })} km/s`;
}

export function formatNumber(value, digits = 2) {
  return value.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
