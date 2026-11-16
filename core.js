export const WEEKLY_MINUTES = 600;
const DAY = 86400000;
export function dateNumber(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('Choose a valid date.');
  const ms = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) throw Error('Choose a valid date.');
  return ms;
}
export function addDays(day, count) { return new Date(dateNumber(day) + count * DAY).toISOString().slice(0, 10); }
export function today(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Ljubljana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function monday(day) { return addDays(day, -((new Date(dateNumber(day)).getUTCDay() + 6) % 7)); }
export function nextCredit(profile, asOf = today()) {
  const skipped = new Set(profile.skipped_credit_weeks || []);
  let day = addDays(monday(asOf), 7);
  while (skipped.has(day)) day = addDays(day, 7);
  return day;
}
export function formatMinutes(value, signed = false) {
  const n = Math.abs(value), sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return `${sign}${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ''}`;
}
export function duration(start, end, nextDay = false) {
  const parse = value => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Enter both start and end times.');
    return Number(value.slice(0,2)) * 60 + Number(value.slice(3));
  };
  const n = parse(end) - parse(start) + (nextDay ? 1440 : 0);
  if (n <= 0 || n > 1440) throw Error('Duration must be between 1 minute and 24 hours. For overnight outings, select “Ends next day”.');
  return n;
}
export function validateProfile(profile, asOf = today()) {
  dateNumber(profile.start_week);
  if (monday(profile.start_week) !== profile.start_week) throw Error('The starting week must begin on a Monday.');
  if (profile.start_week < '1900-01-01') throw Error('Choose a starting week in 1900 or later.');
  if (profile.start_week > asOf) throw Error('The starting week cannot be in the future.');
  if (!Number.isSafeInteger(profile.opening_minutes) || Math.abs(profile.opening_minutes) > 6000000) throw Error('Enter a valid opening balance.');
  if (!Array.isArray(profile.skipped_credit_weeks || [])) throw Error('Invalid credit adjustment.');
  for (const day of profile.skipped_credit_weeks || []) {
    dateNumber(day);
    if (day < profile.start_week || monday(day) !== day) throw Error('Invalid credit adjustment.');
  }
}
export function validateEntry(entry, profile, asOf = today()) {
  dateNumber(entry.spent_on);
  if (entry.spent_on < profile.start_week) throw Error('Spending cannot be before your starting week.');
  if (entry.spent_on > asOf || (entry.next_day && addDays(entry.spent_on,1) > asOf)) throw Error('You can only log completed days and outings, not future dates.');
  if (!Number.isSafeInteger(entry.minutes) || entry.minutes < 1 || entry.minutes > 1440) throw Error('Enter between 1 minute and 24 hours.');
  if (typeof entry.note !== 'string' || entry.note.length > 500) throw Error('Keep the note under 500 characters.');
  if (entry.start_time || entry.end_time) {
    if (duration(entry.start_time?.slice(0,5), entry.end_time?.slice(0,5), entry.next_day) !== entry.minutes) throw Error('The duration does not match the selected times.');
  } else if (entry.next_day) throw Error('Choose start and end times for overnight spending.');
}
export function ledger(profile, entries, asOf = today()) {
  validateProfile(profile, asOf);
  const rows = [];
  const skipped = new Set(profile.skipped_credit_weeks || []);
  if (profile.opening_minutes) rows.push({id:'opening',day:profile.start_week,kind:'opening',minutes:profile.opening_minutes,note:'Opening balance',order:'0'});
  for (let day = profile.start_week; day <= asOf; day = addDays(day,7)) {
    rows.push(skipped.has(day)
      ? {id:`skipped-${day}`,day,kind:'adjustment',minutes:0,note:'Weekly credit skipped for schedule adjustment',order:'1'}
      : {id:`credit-${day}`,day,kind:'credit',minutes:WEEKLY_MINUTES,note:'Weekly allowance',order:'1'});
  }
  for (const entry of entries) {
    if (entry.deleted_at || entry.spent_on > asOf) continue;
    validateEntry(entry, profile, asOf);
    rows.push({...entry,day:entry.spent_on,kind:'spend',minutes:-entry.minutes,order:`2${entry.start_time || '23:59'}${entry.created_at || ''}${entry.id}`});
  }
  rows.sort((a,b)=>a.day.localeCompare(b.day)||a.order.localeCompare(b.order));
  let balance = 0;
  return rows.map(row=>({...row,balance:balance += row.minutes}));
}
