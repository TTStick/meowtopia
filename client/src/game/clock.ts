// Client clock. Supports ?hour=21&weather=rain&season=3 for previewing moods.
import { clockAt, weatherAt, type WeatherKind, type Clock, type Weather } from '../../../shared/time';

const params = new URLSearchParams(location.search);
let offset = 0;
const h = params.get('hour');
if (h !== null && h !== '') {
  const d = new Date();
  offset = (Number(h) - (d.getHours() + d.getMinutes() / 60)) * 3600_000;
}
const wOverride = (params.get('weather') as WeatherKind | null) || null;
const sOverride = params.get('season');

export function now(): number {
  return Date.now() + offset;
}

/** Hour in the viewer's own timezone (used inside the nest). */
export function localHour(): number {
  const d = new Date(now());
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Shared world clock (UTC+8). */
export function worldClock(): Clock {
  const c = clockAt(now());
  if (sOverride !== null) c.season = Number(sOverride);
  return c;
}

export function season(): number {
  return worldClock().season;
}

export function weather(): Weather {
  return weatherAt(now(), wOverride);
}
