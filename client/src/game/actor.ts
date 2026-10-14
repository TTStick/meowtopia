import { defaultPose, drawCat, catHeight, type CatPose, type View, type Eyes, type Mouth } from '../art/cat';
import { Pen } from '../engine/pen';
import type { CatGenes } from '../../../shared/types';
import { hashf } from '../../../shared/rng';
import { drawEmote, type EmoteKind } from '../art/fx';

export type AnimName =
  | 'sit' | 'sit_happy' | 'loaf' | 'groom' | 'knead' | 'beg' | 'eat' | 'drink' | 'yawn' | 'meow' | 'sleep' | 'nap'
  | 'belly' | 'stand' | 'walk' | 'run' | 'sneak' | 'stretch' | 'scratch' | 'window' | 'hide' | 'pounce' | 'jump'
  | 'look_up' | 'purr' | 'bat' | 'chew' | 'watch' | 'sunbathe' | 'slowblink' | 'shy' | 'think' | 'sniff';

interface AnimCtx {
  t: number; // time in anim
  T: number; // global time
  a: CatActor;
}

interface AnimDef {
  view: View;
  apply(p: CatPose, c: AnimCtx): void;
}

const ANIMS: Record<AnimName, AnimDef> = {
  sit: {
    view: 'front',
    apply(p, c) {
      p.tailUp = 0;
      p.tailSwish = 0.4;
      p.lookX = Math.sin(c.T * 0.37 + c.a.seed) * 0.8;
      p.headTilt = Math.sin(c.T * 0.23 + c.a.seed) * 0.08;
    },
  },
  sit_happy: {
    view: 'front',
    apply(p, c) {
      p.tailUp = 1;
      p.tailCurl = 0.8;
      p.tailSwish = 0.6;
      p.eyes = 'happy';
      p.mouth = 'open';
      p.blush = 0.8;
      p.headTilt = Math.sin(c.T * 2.2) * 0.12;
    },
  },
  look_up: {
    view: 'front',
    apply(p) {
      p.lookY = -1;
      p.headTilt = -0.12;
      p.eyes = 'wide';
      p.tailUp = 1;
      p.tailCurl = 0.5;
    },
  },
  think: {
    view: 'front',
    apply(p, c) {
      p.lookY = -0.8;
      p.lookX = 0.8;
      p.headTilt = 0.25;
      p.mouth = 'flat';
      p.tailSwish = 0.8 + Math.sin(c.T) * 0.2;
    },
  },
  loaf: {
    view: 'front',
    apply(p, c) {
      p.sitH = 0;
      p.eyes = c.a.energy < 40 ? 'sleepy' : 'open';
      p.tailSwish = 0.2;
      p.lookX = Math.sin(c.T * 0.2 + c.a.seed) * 0.5;
    },
  },
  groom: {
    view: 'front',
    apply(p, c) {
      const lick = Math.sin(c.t * 7);
      p.groom = 0.88 + lick * 0.12;
      p.eyes = 'closed';
      p.mouth = 'tongue';
      p.headTilt = 0.22 + lick * 0.06;
      p.headDY = 0.1;
    },
  },
  knead: {
    view: 'front',
    apply(p, c) {
      p.sitH = 0.65;
      const k = Math.sin(c.t * 6.5);
      p.pawL = Math.max(0, k);
      p.pawR = Math.max(0, -k);
      p.eyes = 'closed';
      p.blush = 1;
      p.mouth = 'w';
      p.tailUp = 1;
      p.tailCurl = 0.9;
    },
  },
  purr: {
    view: 'front',
    apply(p, c) {
      p.eyes = 'closed';
      p.blush = 1;
      p.headTilt = 0.18 + Math.sin(c.t * 2) * 0.08;
      p.tailUp = 1;
      p.tailCurl = 1;
      p.ear = -0.2;
      p.mouth = 'w';
    },
  },
  slowblink: {
    view: 'front',
    apply(p, c) {
      const ph = c.t % 3.2;
      p.eyes = ph < 1.2 ? 'open' : ph < 2.2 ? 'closed' : 'half';
      p.blush = 0.6;
    },
  },
  beg: {
    view: 'front',
    apply(p, c) {
      p.beg = 1;
      p.eyes = 'wide';
      p.lookY = -1;
      p.mouth = Math.sin(c.t * 3) > 0.6 ? 'open' : 'w';
      p.tailUp = 1;
      p.pawL = Math.max(0, Math.sin(c.t * 5)) * 0.5;
    },
  },
  eat: {
    view: 'front',
    apply(p) {
      p.sitH = 0.55;
      p.headDown = 0.55;
      p.eyes = 'closed';
      p.mouth = 'chew';
      p.tailUp = 1;
      p.tailCurl = 0.5;
    },
  },
  drink: {
    view: 'front',
    apply(p, c) {
      p.sitH = 0.55;
      p.headDown = 0.6;
      p.eyes = 'half';
      p.mouth = Math.sin(c.t * 12) > 0 ? 'tongue' : 'w';
    },
  },
  chew: {
    view: 'front',
    apply(p, c) {
      p.sitH = 0.6;
      p.headDown = 0.35;
      p.headTilt = 0.3 + Math.sin(c.t * 5) * 0.1;
      p.eyes = 'squint';
      p.mouth = 'chew';
    },
  },
  yawn: {
    view: 'front',
    apply(p, c) {
      const y = Math.min(1, c.t / 0.5) * (c.t < 1.6 ? 1 : 0);
      p.mouth = y > 0.3 ? 'yawn' : 'w';
      p.eyes = y > 0.3 ? 'closed' : 'sleepy';
      p.headTilt = -0.15 * y;
      p.ear = -0.3 * y;
    },
  },
  meow: {
    view: 'front',
    apply(p, c) {
      p.mouth = c.t % 1.4 < 0.5 ? 'open' : 'w';
      p.headTilt = -0.1;
      p.lookY = -0.4;
      p.tailUp = 1;
    },
  },
  shy: {
    view: 'front',
    apply(p) {
      p.ear = -0.6;
      p.blush = 1;
      p.eyes = 'open';
      p.lookX = 0.9;
      p.lookY = 0.5;
      p.headTilt = 0.15;
      p.sitH = 0.7;
    },
  },
  sleep: {
    view: 'curl',
    apply(p, c) {
      p.eyes = 'closed';
      p.mouth = 'w';
      p.breathe = Math.sin(c.T * 1.6);
      p.tailSwish = 0.2;
      p.coverEyes = c.a.quirkCover ? 1 : 0;
    },
  },
  nap: {
    view: 'lie',
    apply(p, c) {
      p.eyes = 'closed';
      p.breathe = Math.sin(c.T * 1.6);
      p.tailSwish = 0.3;
    },
  },
  sunbathe: {
    view: 'belly',
    apply(p, c) {
      p.eyes = 'closed';
      p.mouth = 'w';
      p.wiggle = 0.15;
      p.breathe = Math.sin(c.T * 1.6);
      p.blush = 0.6;
    },
  },
  belly: {
    view: 'belly',
    apply(p) {
      p.wiggle = 1;
      p.eyes = 'happy';
      p.mouth = 'open';
      p.blush = 1;
    },
  },
  stand: {
    view: 'side',
    apply(p, c) {
      p.tailUp = 0.75;
      p.tailCurl = 0.5;
      p.lookX = 0.5;
      p.headTilt = Math.sin(c.T * 0.4) * 0.05;
    },
  },
  walk: {
    view: 'side',
    apply(p, c) {
      p.gait = 1;
      p.tailUp = 0.9;
      p.tailCurl = 0.7;
      p.phase = c.a.phase;
      p.lookX = 0.6;
    },
  },
  run: {
    view: 'side',
    apply(p, c) {
      p.gait = 2;
      p.tailUp = 0.35;
      p.tailCurl = 0.2;
      p.ear = -0.4;
      p.eyes = 'wide';
      p.phase = c.a.phase;
    },
  },
  sneak: {
    view: 'side',
    apply(p, c) {
      p.gait = 1;
      p.crouch = 0.7;
      p.tailUp = 0;
      p.tailSwish = 0.6;
      p.eyes = 'wide';
      p.phase = c.a.phase;
      p.headDY = 0.25;
    },
  },
  pounce: {
    view: 'side',
    apply(p, c) {
      p.crouch = 1;
      p.wiggle = 1;
      p.eyes = 'wide';
      p.tailUp = 0;
      p.tailSwish = 1.2;
      p.headDY = 0.3;
      p.lookX = 1;
      void c;
    },
  },
  jump: {
    view: 'side',
    apply(p, c) {
      p.air = c.a.airH;
      p.tailUp = 0.5;
      p.ear = -0.2;
      p.eyes = 'wide';
      p.crouch = c.a.airH > 0.1 ? 0 : 0.5;
    },
  },
  sniff: {
    view: 'side',
    apply(p, c) {
      p.headDY = 0.6;
      p.headTilt = 0.35 + Math.sin(c.t * 7) * 0.05;
      p.lookY = 1;
      p.crouch = 0.25;
      p.tailUp = 0.8;
      p.tailCurl = 0.6;
      p.mouth = Math.sin(c.t * 9) > 0.3 ? 'o' : 'w';
    },
  },
  stretch: {
    view: 'side',
    apply(p, c) {
      const s = Math.min(1, c.t / 0.6);
      p.reach = s;
      p.tilt = -0.32 * s;
      p.eyes = 'closed';
      p.mouth = s > 0.8 ? 'open' : 'w';
      p.tailUp = 1;
      p.tailCurl = 0.3;
    },
  },
  scratch: {
    view: 'side',
    apply(p, c) {
      p.standUp = 1;
      p.pawLift = 1;
      p.eyes = 'happy';
      p.tailUp = 0.7;
      void c;
    },
  },
  bat: {
    view: 'front',
    apply(p, c) {
      const k = Math.sin(c.t * 9);
      p.pawR = Math.max(0, k) * 1.2;
      p.eyes = 'wide';
      p.lookY = 0.6;
      p.ear = 0.6;
      p.tailUp = 0;
      p.tailSwish = 1;
      p.sitH = 0.8;
    },
  },
  watch: {
    view: 'front',
    apply(p, c) {
      p.eyes = 'wide';
      p.lookX = Math.sin(c.T * 0.9) * 1;
      p.lookY = -0.2;
      p.ear = 0.7;
      p.tailSwish = 0.9;
      p.mouth = Math.sin(c.T * 3) > 0.95 ? 'o' : 'w';
    },
  },
  window: {
    view: 'back',
    apply(p, c) {
      p.tailSwish = 0.6 + Math.sin(c.T * 0.3) * 0.3;
      p.headTilt = Math.sin(c.T * 0.5) * 0.12;
      p.earL = Math.sin(c.T * 3.1) > 0.97 ? 1 : 0;
    },
  },
  hide: {
    view: 'front',
    apply(p, c) {
      p.sitH = 0.55;
      p.eyes = 'wide';
      p.lookX = Math.sin(c.T * 0.6) * 1;
      p.ear = 0.3;
    },
  },
};

const NUM_KEYS: (keyof CatPose)[] = [
  'lookX', 'lookY', 'ear', 'blush', 'headTilt', 'headDX', 'headDY', 'turn', 'tailUp', 'tailCurl', 'tailSwish',
  'gait', 'crouch', 'tilt', 'reach', 'air', 'standUp', 'pawLift', 'sitH', 'pawL', 'pawR', 'groom', 'beg', 'headDown', 'wiggle', 'coverEyes',
];

interface Emote {
  kind: EmoteKind;
  t: number;
  dur: number;
  seed: number;
}

export interface Bubble {
  text: string;
  until: number;
  start: number;
}

export class CatActor {
  id: string;
  name: string;
  genes: CatGenes;
  age = 1;
  outfit: string[] = [];
  seed: number;
  x = 0;
  y = 0;
  z = 0;
  dir: 1 | -1 = 1;
  scale = 1;
  energy = 80;
  quirkCover = false;

  pose: CatPose = defaultPose();
  private target: CatPose = defaultPose();
  anim: AnimName = 'sit';
  animT = 0;
  private view: View = 'front';
  private trans = 0; // transition timer
  private pendingView: View | null = null;

  phase = 0;
  airH = 0;
  path: [number, number][] = [];
  speed = 40;
  running = false;
  moving = false;
  private blinkAt = 0;
  private blinkUntil = 0;
  private twitchAt = 0;
  private twitchSide = 0;
  private twitchUntil = 0;

  // jump
  private jump: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; dur: number; arc: number } | null = null;

  emotes: Emote[] = [];
  bubble: Bubble | null = null;
  petting = 0; // >0 while being petted
  lookAt: { x: number; y: number } | null = null;
  extra: Record<string, any> = {};

  constructor(id: string, name: string, genes: CatGenes) {
    this.id = id;
    this.name = name;
    this.genes = genes;
    this.seed = genes.seed % 1000;
    this.blinkAt = 1 + hashf(this.seed) * 3;
  }

  play(anim: AnimName) {
    if (this.anim !== anim) {
      this.anim = anim;
      this.animT = 0;
    }
  }

  setPath(pts: [number, number][], run = false) {
    this.path = pts.slice();
    this.running = run;
    this.moving = this.path.length > 0;
  }

  stop() {
    this.path = [];
    this.moving = false;
  }

  jumpTo(x: number, y: number, z: number, dur = 0.5, arc?: number) {
    this.jump = { x0: this.x, y0: this.y, z0: this.z, x1: x, y1: y, z1: z, t: 0, dur, arc: arc ?? 18 + Math.abs(z - this.z) * 0.25 };
    if (Math.abs(x - this.x) > 1) this.dir = x > this.x ? 1 : -1;
    this.stop();
  }

  get jumping() {
    return !!this.jump;
  }

  emote(kind: EmoteKind, dur = 1.6) {
    this.emotes.push({ kind, t: 0, dur, seed: Math.random() * 1000 });
    if (this.emotes.length > 6) this.emotes.shift();
  }

  say(text: string, now: number, dur?: number) {
    const d = dur ?? Math.min(8, 2.6 + text.length * 0.16);
    this.bubble = { text, start: now, until: now + d };
  }

  get viewNow(): View {
    return this.view;
  }

  update(dt: number, T: number) {
    this.animT += dt;
    // movement
    if (this.jump) {
      const j = this.jump;
      j.t += dt;
      const k = Math.min(1, j.t / j.dur);
      const e = k * k * (3 - 2 * k);
      this.x = j.x0 + (j.x1 - j.x0) * e;
      this.y = j.y0 + (j.y1 - j.y0) * e;
      const arc = Math.sin(k * Math.PI) * j.arc;
      this.z = j.z0 + (j.z1 - j.z0) * e + arc;
      this.airH = Math.sin(k * Math.PI) * 0.8;
      this.play('jump');
      if (k >= 1) {
        this.jump = null;
        this.airH = 0;
        this.z = j.z1;
      }
    } else if (this.moving && this.path.length) {
      const [tx, ty] = this.path[0];
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const sp = this.speed * (this.running ? 2.6 : 1) * this.scale;
      const step = sp * dt;
      if (Math.abs(dx) > 0.5) this.dir = dx > 0 ? 1 : -1;
      if (d <= step) {
        this.x = tx;
        this.y = ty;
        this.path.shift();
        if (!this.path.length) this.moving = false;
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
      this.phase += (step / (this.running ? 30 : 15) / this.scale) * Math.PI;
      this.play(this.running ? 'run' : this.anim === 'sneak' ? 'sneak' : 'walk');
    } else if (this.anim === 'walk' || this.anim === 'run') {
      this.play('stand');
    }

    // build target pose
    const def = ANIMS[this.anim];
    const tg = this.target;
    const base = defaultPose();
    Object.assign(tg, base);
    tg.view = def.view;
    def.apply(tg, { t: this.animT, T, a: this });
    if (def.view === 'front' || def.view === 'back') tg.turn = this.dir * 0.12;
    else tg.turn = 0.45;

    // overlays
    if (this.petting > 0) {
      this.petting -= dt;
      if (tg.view === 'front' || tg.view === 'side') {
        tg.eyes = 'closed';
        tg.blush = 1;
        tg.headTilt += 0.15;
        tg.ear = -0.3;
        tg.tailUp = 1;
        tg.tailCurl = 1;
      } else if (tg.view === 'curl' || tg.view === 'lie') {
        tg.mouth = 'w';
        tg.blush = 1;
      }
    }
    if (this.lookAt && (tg.view === 'front' || tg.view === 'side')) {
      const dx = this.lookAt.x - this.x, dy = this.lookAt.y - (this.y - this.z - 30);
      const len = Math.hypot(dx, dy) || 1;
      tg.lookX = Math.max(-1, Math.min(1, (dx / len) * 1.4 * (tg.view === 'side' ? this.dir : 1)));
      tg.lookY = Math.max(-1, Math.min(1, (dy / len) * 1.2));
    }
    // blink
    if (T > this.blinkAt) {
      this.blinkUntil = T + 0.13;
      this.blinkAt = T + 2 + Math.random() * 4.5;
      if (Math.random() < 0.15) this.blinkAt = T + 0.25; // double blink
    }
    if (T < this.blinkUntil && (tg.eyes === 'open' || tg.eyes === 'wide' || tg.eyes === 'half')) tg.eyes = 'blink';
    // ear twitch
    if (T > this.twitchAt) {
      this.twitchSide = Math.random() < 0.5 ? -1 : 1;
      this.twitchUntil = T + 0.18;
      this.twitchAt = T + 3 + Math.random() * 8;
    }
    if (T < this.twitchUntil) {
      if (this.twitchSide < 0) tg.earL = 1;
      else tg.earR = 1;
    }
    if (tg.view !== 'curl' && tg.view !== 'lie' && tg.view !== 'belly') tg.breathe = Math.sin(T * 2.2 + this.seed);

    // view transition
    if (tg.view !== this.view && this.pendingView !== tg.view) {
      this.pendingView = tg.view;
      this.trans = 0.18;
    }
    if (this.pendingView) {
      this.trans -= dt;
      if (this.trans <= 0.09 && this.view !== this.pendingView) {
        this.view = this.pendingView;
        // snap view-specific params to avoid weird blends
        Object.assign(this.pose, tg);
      }
      if (this.trans <= 0) this.pendingView = null;
    }

    // lerp numeric params
    const k = 1 - Math.exp(-dt * 11);
    const p = this.pose as any, t = tg as any;
    for (const key of NUM_KEYS) p[key] += (t[key] - p[key]) * k;
    this.pose.view = this.view;
    if (this.view === tg.view) {
      this.pose.eyes = tg.eyes;
      this.pose.mouth = tg.mouth;
    }
    this.pose.earL = tg.earL;
    this.pose.earR = tg.earR;
    this.pose.breathe = tg.breathe;
    this.pose.phase = this.phase;
    this.pose.t = T + this.seed;

    // emotes
    for (const e of this.emotes) e.t += dt;
    this.emotes = this.emotes.filter((e) => e.t < e.dur);
    if (this.bubble && T > this.bubble.until) this.bubble = null;
  }

  /** squash factor during view transitions */
  private squash(): number {
    if (!this.pendingView) return 0;
    const k = this.trans / 0.18; // 1 -> 0
    return Math.sin(k * Math.PI);
  }

  draw(pen: Pen, alpha = 1) {
    const ctx = pen.ctx;
    ctx.save();
    ctx.translate(this.x, this.y - this.z);
    const s = this.scale;
    const sq = this.squash();
    const flip = this.view === 'front' || this.view === 'back' ? 1 : this.dir;
    ctx.scale(s * flip * (1 + sq * 0.08), s * (1 - sq * 0.12));
    if (this.z > 0.5) {
      // shadow on the surface below is drawn by drawCat at feet; add soft ground shadow
    }
    drawCat(pen, this.genes, this.pose, { age: this.age, outfit: this.outfit, alpha, shadow: this.z < 1 || !this.jump });
    ctx.restore();
  }

  drawShadowAtGround(ctx: CanvasRenderingContext2D) {
    if (this.z < 2) return;
    ctx.fillStyle = 'rgba(74,58,52,0.1)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 14 * this.scale, 4 * this.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEmotes(pen: Pen, T: number) {
    const h = this.headTop();
    for (const e of this.emotes) drawEmote(pen, e.kind, this.x + 6 * this.scale, h, e.t / e.dur, e.seed, this.scale, T);
  }

  /** y of the top of the head in scene units */
  headTop(): number {
    return this.y - this.z - catHeight(this.pose, this.age) * this.scale;
  }

  hit(x: number, y: number): boolean {
    const h = catHeight(this.pose, this.age) * this.scale;
    const w = (this.view === 'front' || this.view === 'back' ? 16 : 26) * this.scale;
    return x > this.x - w && x < this.x + w && y < this.y - this.z + 4 * this.scale && y > this.y - this.z - h;
  }
}

export type { Eyes, Mouth };
