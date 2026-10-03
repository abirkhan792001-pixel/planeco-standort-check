// hourCycle 'h23' (not hour12: false): some ICU builds render midnight as "24" with hour12: false, which would also
// break hydration when server and browser disagree.
const fmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function formatBerlin(iso: string | null): string {
  if (!iso) return '';
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}
