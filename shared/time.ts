import { hashf } from './rng';

/** The shared world runs on UTC+8. */
export const WORLD_TZ = 8;

export interface Clock {
  hour: number; // 0..24 float
  day: number; // integer day index
  month: number; // 0..11
  season: number; // 0 spring,1 summer,2 autumn,3 winter
  weekday: number;
}

export function clockAt(ms: number, tzHours = WORLD_TZ): Clock {
  const local = ms + tzHours * 3600_000;
  const d = new Date(local);
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const month = d.getUTCMonth();
  const season = month >= 2 && month <= 4 ? 0 : month >= 5 && month <= 7 ? 1 : month >= 8 && month <= 10 ? 2 : 3;
  return { hour, day: Math.floor(local / 86400_000), month, season, weekday: d.getUTCDay() };
}

/** Local clock using the browser's/user's timezone offset (minutes, as Date#getTimezoneOffset). */
export function localClock(ms: number, tzOffsetMin: number): Clock {
  return clockAt(ms, -tzOffsetMin / 60);
}

export type Phase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'late';

export function phaseOf(hour: number): Phase {
  if (hour < 5) return 'late';
  if (hour < 7) return 'dawn';
  if (hour < 11) return 'morning';
  if (hour < 14.5) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 21.5) return 'evening';
  return 'night';
}

export const PHASE_NAME: Record<Phase, string> = {
  dawn: '清晨', morning: '上午', noon: '中午', afternoon: '下午', evening: '傍晚', night: '夜晚', late: '深夜',
};

/** 0 = full night, 1 = full day. */
export function daylight(hour: number): number {
  const ramp = (a: number, b: number, h: number) => Math.min(1, Math.max(0, (h - a) / (b - a)));
  if (hour < 12) return ramp(5, 7.2, hour);
  return 1 - ramp(17.6, 19.8, hour);
}

/** Warm sunset tint amount 0..1 */
export function sunset(hour: number): number {
  const a = Math.max(0, 1 - Math.abs(hour - 18.3) / 1.6);
  const b = Math.max(0, 1 - Math.abs(hour - 6.1) / 1.2) * 0.6;
  return Math.max(a, b);
}

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow';
export interface Weather {
  kind: WeatherKind;
  rain: number;
  snow: number;
  cloud: number;
  wind: number;
}

export const WEATHER_NAME: Record<WeatherKind, string> = { clear: '晴', cloudy: '多云', rain: '小雨', snow: '下雪' };

/** Deterministic weather by 3-hour block, same for everyone. */
export function weatherAt(ms: number, override?: WeatherKind | null): Weather {
  const c = clockAt(ms);
  const block = Math.floor(c.hour / 3);
  const r = hashf(c.day, block, 4242);
  const r2 = hashf(c.day, block, 777);
  let kind: WeatherKind = 'clear';
  const rainP = [0.2, 0.24, 0.13, 0.06][c.season];
  const snowP = c.season === 3 ? 0.22 : 0;
  if (r < snowP) kind = 'snow';
  else if (r < snowP + rainP) kind = 'rain';
  else if (r < snowP + rainP + 0.25) kind = 'cloudy';
  if (override) kind = override;
  return {
    kind,
    rain: kind === 'rain' ? 0.5 + r2 * 0.5 : 0,
    snow: kind === 'snow' ? 0.5 + r2 * 0.5 : 0,
    cloud: kind === 'clear' ? 0.1 : kind === 'cloudy' ? 0.6 : 0.85,
    wind: 0.3 + hashf(c.day, block, 99) * 0.7,
  };
}

function hex(r: number, g: number, b: number) {
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}
function lerpC(a: number[], b: number[], t: number) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

export function skyColor(hour: number, w: Weather): string {
  const day = [168, 214, 240];
  const night = [52, 62, 104];
  const dusk = [246, 178, 140];
  let c = lerpC(night, day, daylight(hour));
  c = lerpC(c, dusk, sunset(hour) * 0.7);
  if (w.kind !== 'clear') c = lerpC(c, [170, 178, 190], w.cloud * 0.55 * Math.max(0.3, daylight(hour)));
  return hex(c[0], c[1], c[2]);
}

export const SEASON_NAME = ['春天', '夏天', '秋天', '冬天'];
