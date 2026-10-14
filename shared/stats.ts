import type { CatStats, Personality, CatLocation } from './types';
import { clockAt } from './time';
import { clamp } from './rng';

export function freshStats(): CatStats {
  return { hunger: 80, energy: 80, mood: 75, clean: 85, social: 60, bond: 10 };
}

/**
 * Advance stats over elapsed real time. Deliberately gentle: the cat is never
 * neglected into a bad state. Hunger is floored because the bowl auto-refills;
 * the cat just becomes a bit clingy / sleepy when stats are low.
 */
export function advanceStats(s: CatStats, p: Personality, fromMs: number, toMs: number, loc: CatLocation): CatStats {
  const out = { ...s };
  let t = fromMs;
  const end = Math.min(toMs, fromMs + 7 * 86400_000);
  const step = 15 * 60_000;
  while (t < end) {
    const dt = Math.min(step, end - t) / 3600_000;
    const h = clockAt(t).hour;
    const night = h < 6 || h >= 22.5;
    const noon = h >= 11.5 && h < 15;
    // energy: sleeps at night & noon naps, out exploring is tiring
    const resting = night || (noon && p.lazy > 0.4);
    out.energy += (resting ? 9 + p.lazy * 4 : loc === 'world' ? -7 : -3.5) * dt;
    out.hunger -= (4.5 + p.foodie * 2) * dt;
    if (out.hunger < 45) out.hunger += 30; // auto-feeder snack
    out.clean -= 2.5 * dt;
    if (out.clean < 55 && !night) out.clean += 20; // self grooming
    out.social -= (loc === 'world' ? -3 : 3 + p.social * 2) * dt;
    // mood drifts toward a baseline that depends on comfort
    const base = 55 + (out.hunger > 50 ? 8 : 0) + (out.energy > 40 ? 6 : 0) + (out.social > 40 ? 6 : 0) + Math.min(10, out.bond / 10);
    out.mood += (base - out.mood) * 0.08 * dt * 4;
    out.energy = clamp(out.energy, 5, 100);
    out.hunger = clamp(out.hunger, 30, 100);
    out.clean = clamp(out.clean, 40, 100);
    out.social = clamp(out.social, 10, 100);
    out.mood = clamp(out.mood, 25, 100);
    t += step;
  }
  return out;
}

export function applyDelta(s: CatStats, d: Partial<CatStats>): CatStats {
  const o = { ...s };
  for (const k of Object.keys(d) as (keyof CatStats)[]) {
    o[k] = clamp(o[k] + (d[k] ?? 0), 0, k === 'bond' ? 1000 : 100);
  }
  return o;
}

/** 0 kitten .. 1 adult, grows over ~2 weeks. */
export function ageOf(born: number, now = Date.now()): number {
  const days = (now - born) / 86400_000;
  return clamp(0.3 + days * 0.05, 0.3, 1);
}

export function bondLevel(bond: number): { level: number; name: string; next: number } {
  const lv = [0, 20, 60, 130, 240, 400, 650, 1000];
  const names = ['初次见面', '有点熟悉', '愿意靠近', '信任你', '喜欢你', '离不开你', '心灵相通', '命中注定'];
  let i = 0;
  while (i < lv.length - 1 && bond >= lv[i + 1]) i++;
  return { level: i + 1, name: names[i], next: lv[Math.min(lv.length - 1, i + 1)] };
}

export function moodWord(s: CatStats): string {
  if (s.energy < 25) return '困困的';
  if (s.hunger < 40) return '有点饿';
  if (s.social < 25) return '想要陪伴';
  if (s.mood > 85) return '超开心';
  if (s.mood > 65) return '心情不错';
  if (s.mood > 45) return '平平静静';
  return '有点闷闷的';
}
