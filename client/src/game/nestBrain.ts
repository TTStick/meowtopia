// Autonomous behaviour of a cat inside its nest: a small utility AI that picks
// activities based on needs, time of day, personality and available furniture.
import type { CatActor, AnimName } from './actor';
import type { EmoteKind } from '../art/fx';
import type { SpeechCtx } from '../../../shared/speech';
import type { CatRecord } from '../../../shared/types';
import type { SpotKind } from '../../../shared/items';
import { Rng } from '../../../shared/rng';

export interface SpotInst {
  kind: SpotKind | 'sun' | 'front' | 'floor';
  x: number;
  y: number;
  z: number;
  uid: string;
  item: string;
  sortY: number;
  face?: 1 | -1;
}

export interface NestHost {
  W: number;
  H: number;
  spots: SpotInst[];
  sunSpot(): SpotInst | null;
  floorPath(x0: number, y0: number, x1: number, y1: number): [number, number][];
  openFloorNear(x: number, y: number): [number, number];
  randomFloor(rng: Rng): [number, number];
  hour(): number;
  night(): number;
  weather(): string;
  season(): number;
  say(ctx: SpeechCtx, info?: Record<string, string>): void;
  onCatEvent(kind: 'eat' | 'drink' | 'play' | 'groom'): void;
  toyPos(): { x: number; y: number; z: number } | null;
}

type Task =
  | { k: 'goto'; x: number; y: number; z: number; run?: boolean; spot?: SpotInst | null; sneak?: boolean }
  | { k: 'anim'; anim: AnimName; dur: number; emote?: EmoteKind; emoteEvery?: number; say?: SpeechCtx; face?: 1 | -1; lookCam?: boolean }
  | { k: 'call'; fn: () => void };

type Step = { k: 'jump'; x: number; y: number; z: number } | { k: 'path'; pts: [number, number][]; run?: boolean } | { k: 'wait' };

export class NestBrain {
  cat: CatActor;
  host: NestHost;
  rec: CatRecord;
  tasks: Task[] = [];
  private cur: Task | null = null;
  private steps: Step[] = [];
  private t = 0;
  private emoteT = 0;
  activity = '';
  private last: string[] = [];
  spot: SpotInst | null = null;
  mode: 'auto' | 'chase' = 'auto';
  private rng = new Rng(Date.now() & 0xffffff);
  private nextSay = 12;
  private chaseCool = 0;
  sleeping = false;

  constructor(cat: CatActor, rec: CatRecord, host: NestHost) {
    this.cat = cat;
    this.rec = rec;
    this.host = host;
  }

  get stats() {
    return this.rec.stats;
  }

  /** Replace whatever the cat is doing. */
  interrupt(tasks: Task[], activity = 'owner') {
    this.tasks = tasks;
    this.cur = null;
    this.steps = [];
    this.activity = activity;
    this.sleeping = false;
    this.cat.stop();
  }

  reset() {
    this.interrupt([], '');
  }

  // ---------------- activities ----------------
  private spotsOf(...kinds: string[]) {
    return this.host.spots.filter((s) => kinds.includes(s.kind));
  }

  private choose(T: number) {
    const s = this.stats;
    const p = this.rec.personality;
    const h = this.host.hour();
    const night = h >= 22.5 || h < 6;
    const noon = h >= 11.5 && h < 15;
    const evening = h >= 18 && h < 21.5;
    const dawn = h >= 5 && h < 7;
    const rain = this.host.weather() === 'rain' || this.host.weather() === 'snow';
    const winter = this.host.season() === 3;
    const sun = this.host.sunSpot();
    const opts: [string, number][] = [];
    const add = (name: string, w: number) => w > 0 && opts.push([name, w * (this.last.includes(name) ? 0.25 : 1)]);

    add('sleep', (100 - s.energy) / 40 + (night ? 3 : 0) + (noon ? 1 + p.lazy : 0) + p.lazy * 0.5 + (rain ? 0.6 : 0));
    if (sun) add('sun', 1.2 + p.lazy + (noon ? 1 : 0));
    if (this.spotsOf('eat').length) add('eat', Math.max(0, (85 - s.hunger) / 18) + p.foodie * 0.5);
    if (this.spotsOf('drink').length) add('drink', 0.35);
    add('groom', (100 - s.clean) / 40 + 0.4);
    if (this.spotsOf('play').length) add('play', (p.playful * 1.4 + (evening ? 1 : 0)) * (s.energy / 80));
    add('zoomies', ((evening || dawn) ? 1.2 : 0.15) * p.playful * (s.energy > 50 ? 1 : 0.2));
    if (this.spotsOf('perch').length) add('perch', 0.6 + p.curious * 0.6 + p.brave * 0.4);
    if (this.spotsOf('watch').length) add('watch', (night ? 0.4 : 1.1) * (0.5 + p.curious) + (rain ? 0.6 : 0));
    if (this.spotsOf('scratch').length) add('scratch', 0.45);
    if (this.spotsOf('hide').length) add('hide', 0.3 + (1 - p.brave) * 0.6);
    if (this.spotsOf('grass').length) add('grass', 0.25);
    if (this.spotsOf('warm').length) add('warm', (winter || night ? 1.6 : 0.2));
    add('wander', 0.9);
    add('owner', (100 - s.social) / 50 + p.social * 0.6 + Math.min(1, s.bond / 120));
    add('think', 0.25);
    if (night) for (const o of opts) if (o[0] !== 'sleep' && o[0] !== 'warm' && o[0] !== 'watch') o[1] *= 0.3;
    const pick = this.rng.weighted(opts);
    this.start(pick, T);
  }

  private start(name: string, T: number) {
    const r = this.rng;
    const s = this.stats;
    this.activity = name;
    this.last.push(name);
    if (this.last.length > 2) this.last.shift();
    const one = <S>(arr: S[]) => (arr.length ? r.pick(arr) : null);
    const go = (sp: SpotInst, run = false): Task => ({ k: 'goto', x: sp.x, y: sp.y, z: sp.z, spot: sp, run });
    const tasks: Task[] = [];
    switch (name) {
      case 'sleep': {
        const soft = one(this.spotsOf('sleep', 'warm')) ?? one(this.spotsOf('hide'));
        if (soft) tasks.push(go(soft));
        else {
          const [x, y] = this.host.randomFloor(r);
          tasks.push({ k: 'goto', x, y, z: 0 });
        }
        if (soft?.kind === 'sleep' && r.chance(0.5)) tasks.push({ k: 'anim', anim: 'knead', dur: r.range(3, 6), emote: 'heart', emoteEvery: 2.5 });
        tasks.push({ k: 'anim', anim: 'yawn', dur: 1.6 });
        tasks.push({ k: 'call', fn: () => this.host.say('sleepy') });
        tasks.push({ k: 'anim', anim: soft?.kind === 'hide' ? 'hide' : r.chance(0.7) ? 'sleep' : 'nap', dur: r.range(45, 120), emote: 'zzz', emoteEvery: 4 });
        tasks.push({ k: 'anim', anim: 'yawn', dur: 1.5 });
        tasks.push({ k: 'anim', anim: 'stretch', dur: 2 });
        break;
      }
      case 'sun': {
        const sp = this.host.sunSpot()!;
        tasks.push(go(sp));
        tasks.push({ k: 'call', fn: () => this.host.say('sun') });
        tasks.push({ k: 'anim', anim: r.chance(0.5) ? 'sunbathe' : 'nap', dur: r.range(25, 70), emote: 'zzz', emoteEvery: 6 });
        tasks.push({ k: 'anim', anim: 'stretch', dur: 1.8 });
        break;
      }
      case 'eat': {
        const sp = one(this.spotsOf('eat'))!;
        tasks.push(go(sp, s.hunger < 50));
        tasks.push({ k: 'anim', anim: 'eat', dur: r.range(5, 9), emote: 'heart', emoteEvery: 3 });
        tasks.push({ k: 'call', fn: () => this.host.onCatEvent('eat') });
        tasks.push({ k: 'anim', anim: 'groom', dur: 3 });
        break;
      }
      case 'drink': {
        tasks.push(go(one(this.spotsOf('drink'))!));
        tasks.push({ k: 'anim', anim: 'drink', dur: r.range(3, 5) });
        tasks.push({ k: 'call', fn: () => this.host.onCatEvent('drink') });
        break;
      }
      case 'groom':
        tasks.push({ k: 'anim', anim: 'groom', dur: r.range(5, 9) });
        tasks.push({ k: 'call', fn: () => this.host.onCatEvent('groom') });
        if (r.chance(0.4)) tasks.push({ k: 'anim', anim: 'sit', dur: 3 });
        break;
      case 'play': {
        const toy = one(this.spotsOf('play'))!;
        const side = r.chance(0.5) ? 1 : -1;
        tasks.push({ k: 'goto', x: toy.x + side * 50, y: toy.y + 6, z: 0, sneak: true });
        tasks.push({ k: 'anim', anim: 'pounce', dur: r.range(1.2, 2.2), face: side > 0 ? -1 : 1 });
        tasks.push({ k: 'goto', x: toy.x + side * 10, y: toy.y + 4, z: 0, run: true });
        tasks.push({ k: 'anim', anim: 'bat', dur: r.range(2, 4) });
        tasks.push({ k: 'call', fn: () => this.host.onCatEvent('play') });
        if (r.chance(0.5)) tasks.push({ k: 'anim', anim: 'belly', dur: r.range(3, 6), emote: 'heart', emoteEvery: 2 });
        break;
      }
      case 'zoomies': {
        tasks.push({ k: 'call', fn: () => this.cat.emote('exclaim') });
        for (let i = 0; i < r.int(3, 5); i++) {
          const [x, y] = this.host.randomFloor(r);
          tasks.push({ k: 'goto', x, y, z: 0, run: true });
        }
        tasks.push({ k: 'anim', anim: 'sit', dur: 2, emote: 'sweat' });
        break;
      }
      case 'perch': {
        const sp = one(this.spotsOf('perch'))!;
        tasks.push(go(sp));
        tasks.push({ k: 'anim', anim: r.chance(0.5) ? 'loaf' : 'sit', dur: r.range(12, 30) });
        if (r.chance(0.35)) tasks.push({ k: 'anim', anim: 'sleep', dur: r.range(20, 50), emote: 'zzz', emoteEvery: 5 });
        break;
      }
      case 'watch': {
        const sp = one(this.spotsOf('watch'))!;
        tasks.push(go(sp));
        const isWindow = sp.item === 'window';
        tasks.push({ k: 'anim', anim: isWindow ? 'window' : 'watch', dur: r.range(15, 40), say: isWindow ? 'window' : undefined });
        break;
      }
      case 'scratch': {
        const sp = one(this.spotsOf('scratch'))!;
        tasks.push(go(sp));
        tasks.push({ k: 'anim', anim: 'scratch', dur: r.range(2.5, 4), face: sp.face ?? 1 });
        tasks.push({ k: 'anim', anim: 'stand', dur: 1 });
        break;
      }
      case 'hide': {
        const sp = one(this.spotsOf('hide'))!;
        tasks.push(go(sp));
        tasks.push({ k: 'call', fn: () => this.host.say('box') });
        tasks.push({ k: 'anim', anim: 'hide', dur: r.range(10, 25) });
        break;
      }
      case 'grass':
        tasks.push(go(one(this.spotsOf('grass'))!));
        tasks.push({ k: 'anim', anim: 'chew', dur: r.range(3, 5) });
        break;
      case 'warm': {
        const sp = one(this.spotsOf('warm'))!;
        tasks.push(go(sp));
        tasks.push({ k: 'anim', anim: r.chance(0.6) ? 'loaf' : 'sleep', dur: r.range(30, 80), emote: 'zzz', emoteEvery: 6 });
        break;
      }
      case 'owner': {
        tasks.push({ k: 'goto', x: this.host.W / 2 + r.range(-40, 40), y: this.host.H - 26, z: 0 });
        tasks.push({ k: 'anim', anim: 'meow', dur: 1.6, lookCam: true });
        tasks.push({ k: 'call', fn: () => this.host.say(s.social < 40 ? 'lonely' : 'greet') });
        tasks.push({ k: 'anim', anim: r.chance(0.5) ? 'sit_happy' : 'slowblink', dur: r.range(6, 10), lookCam: true });
        break;
      }
      case 'think':
        tasks.push({ k: 'anim', anim: 'think', dur: r.range(3, 5), emote: 'question' });
        break;
      default: {
        const [x, y] = this.host.randomFloor(r);
        tasks.push({ k: 'goto', x, y, z: 0 });
        tasks.push({ k: 'anim', anim: r.pick(['sit', 'loaf', 'stand', 'sit'] as AnimName[]), dur: r.range(5, 14) });
      }
    }
    this.tasks = tasks;
    void T;
  }

  // ---------------- execution ----------------
  private planGoto(t: Extract<Task, { k: 'goto' }>): Step[] {
    const c = this.cat;
    const steps: Step[] = [];
    let fx = c.x, fy = c.y;
    const sameSpot = this.spot && t.spot && this.spot.uid === t.spot.uid && this.spot.kind === t.spot.kind && Math.abs(this.spot.z - t.z) < 1;
    if (sameSpot) return steps;
    if (c.z > 1) {
      // jump down to the floor
      const base = this.spot?.sortY ?? c.y;
      const [dx, dy] = this.host.openFloorNear(c.x + c.dir * 18, Math.max(base + 14, 22));
      steps.push({ k: 'jump', x: dx, y: dy, z: 0 });
      fx = dx;
      fy = dy;
    }
    let tx = t.x, ty = t.y;
    if (t.z > 1) {
      const base = t.spot?.sortY ?? t.y;
      const [ax, ay] = this.host.openFloorNear(t.x, Math.max(base + 12, 20));
      tx = ax;
      ty = ay;
    }
    const pts = this.host.floorPath(fx, fy, tx, ty);
    if (t.z <= 1 && (Math.abs(pts.at(-1)?.[0] ?? fx - t.x) > 2 || Math.abs((pts.at(-1)?.[1] ?? fy) - t.y) > 2)) pts.push([t.x, t.y]);
    if (pts.length) steps.push({ k: 'path', pts, run: t.run });
    if (t.z > 1) steps.push({ k: 'jump', x: t.x, y: t.y, z: t.z });
    return steps;
  }

  update(dt: number, T: number) {
    const c = this.cat;
    this.t += dt;
    this.nextSay -= dt;
    if (this.mode === 'chase') {
      this.updateChase(dt, T);
      return;
    }
    if (!this.cur) {
      if (!this.tasks.length) this.choose(T);
      this.cur = this.tasks.shift() ?? null;
      this.t = 0;
      this.emoteT = 0;
      if (!this.cur) return;
      if (this.cur.k === 'goto') {
        this.steps = this.planGoto(this.cur);
        this.spot = null;
        this.sleeping = false;
        c.lookAt = null;
      } else if (this.cur.k === 'anim') {
        c.play(this.cur.anim);
        if (this.cur.face) c.dir = this.cur.face;
        if (this.cur.emote && !this.cur.emoteEvery) c.emote(this.cur.emote);
        this.sleeping = this.cur.anim === 'sleep' || this.cur.anim === 'nap' || this.cur.anim === 'sunbathe';
        if (this.cur.say && Math.random() < 0.5) this.host.say(this.cur.say);
      } else {
        this.cur.fn();
        this.cur = null;
        return;
      }
    }
    const cur = this.cur;
    if (cur.k === 'goto') {
      if (c.jumping || c.moving) return;
      const st = this.steps.shift();
      if (!st) {
        this.spot = cur.spot ?? null;
        if (cur.spot?.face) c.dir = cur.spot.face;
        this.cur = null;
        c.play(cur.sneak ? 'sneak' : 'stand');
        return;
      }
      if (st.k === 'jump') {
        c.jumpTo(st.x, st.y, st.z, 0.5);
        c.emote('puff', 0.6);
      } else if (st.k === 'path') {
        if (cur.sneak) c.play('sneak');
        c.setPath(st.pts, st.run);
      }
      return;
    }
    if (cur.k === 'anim') {
      if (cur.emoteEvery) {
        this.emoteT += dt;
        if (this.emoteT > cur.emoteEvery) {
          this.emoteT = 0;
          if (cur.emote) c.emote(cur.emote);
        }
      }
      if (this.t >= cur.dur) {
        this.cur = null;
        this.sleeping = false;
      }
    }
    // spontaneous speech while awake and idle
    if (this.nextSay <= 0) {
      this.nextSay = 40 + Math.random() * 60;
      if (!this.sleeping && cur.k === 'anim' && Math.random() < 0.6) {
        const h = this.host.hour();
        this.host.say(this.stats.hunger < 45 ? 'hungry' : h >= 21 || h < 5 ? 'night' : 'idle');
      }
    }
  }

  // ---------------- owner interactions ----------------
  startChase() {
    this.interrupt([], 'chase');
    this.mode = 'chase';
    this.chaseCool = 0;
  }
  stopChase() {
    this.mode = 'auto';
    this.cat.lookAt = null;
    this.interrupt([{ k: 'anim', anim: 'sit', dur: 3 }, { k: 'anim', anim: 'groom', dur: 4 }], 'after-play');
  }

  private chaseT = 0;
  private updateChase(dt: number, T: number) {
    const c = this.cat;
    const toy = this.host.toyPos();
    this.chaseCool -= dt;
    if (!toy) {
      if (!c.moving && !c.jumping) c.play('sit');
      return;
    }
    c.lookAt = { x: toy.x, y: toy.y - toy.z };
    if (c.jumping) return;
    if (c.z > 1) {
      const [dx, dy] = this.host.openFloorNear(c.x, c.y + 16);
      c.jumpTo(dx, dy, 0, 0.45);
      return;
    }
    const dx = toy.x - c.x, dy = toy.y - c.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 4) c.dir = dx > 0 ? 1 : -1;
    if (d > 70) {
      if (!c.moving || this.chaseT > 0.4) {
        this.chaseT = 0;
        const pts = this.host.floorPath(c.x, c.y, toy.x - Math.sign(dx) * 24, toy.y);
        c.setPath(pts, d > 140);
      }
      this.chaseT += dt;
      return;
    }
    c.stop();
    if (this.chaseCool > 0) {
      c.play(toy.z > 30 ? 'beg' : 'bat');
      return;
    }
    // crouch, wiggle, pounce
    this.chaseT += dt;
    if (this.chaseT < 0.7) {
      c.play('pounce');
      return;
    }
    this.chaseT = 0;
    this.chaseCool = 1.2 + Math.random();
    const jz = Math.min(70, toy.z * 0.9);
    c.jumpTo(toy.x - Math.sign(dx) * 6, toy.y, 0, 0.5, 14 + jz);
    setTimeout(() => {
      if (this.mode !== 'chase') return;
      const t2 = this.host.toyPos();
      if (t2 && Math.hypot(t2.x - c.x, t2.y - c.y) < 40) {
        c.emote('heart');
        this.host.onCatEvent('play');
      } else c.emote('question', 1);
    }, 450);
    void T;
  }
}
