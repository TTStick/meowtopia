import type { Viewport } from '../engine/view';
import type { InputHandler } from '../engine/input';
import { Pen, rgba, mix } from '../engine/pen';
import { CatActor, type AnimName } from './actor';
import { drawProp, BOUNDS, type PropCtx } from '../art/props';
import { drawNpc } from '../art/npc';
import { drawBubble, drawNameTag, drawEmote, measureBubble, type EmoteKind } from '../art/fx';
import { getWorld, getRooms, roomAt, roomById, planRoute, TILE, WW, WH, Ter, POIS, POI_MAP, BUILDINGS, walkableAt, zoneAt, ZONE_NAME, type Prop, type PropKind, type Room } from '../../../shared/world';
import { roomOpen } from '../../../shared/rooms';
import { CELL, WALL_H, drawWallpaper, drawFloor, drawFurniture, drawWallItem, wallpaperBase, HAS_FRONT, type DrawCtx, type SkyInfo } from '../art/furniture';
import { drawShopPiece, drawShopWall, drawPlaque, isShopPiece } from '../art/interior';
import { hashf, noise2 } from '../../../shared/rng';
import { daylight, sunset, skyColor } from '../../../shared/time';
import * as clock from './clock';
import type { EntState, ServerMsg } from '../../../shared/protocol';
import { NPC_MAP } from '../../../shared/npcs';
import { ui, activeCat, toast } from './state';
import { audio } from './audio';
import type { Scene } from './game';

interface GameLike {
  ws: { send(m: any): void };
  time: number;
  visit(catId: string): Promise<void>;
}

const CHUNK = 16; // tiles per chunk
const INK_TEXT = '#4a3a34';
const CPX = CHUNK * TILE;
const CAT_SPEED = 46;

interface WEnt {
  st: EntState;
  actor: CatActor | null;
  x: number;
  y: number;
  dir: 1 | -1;
  anim: string;
  // npc movement
  path: [number, number][];
  speed: number;
  phase: number;
  moving: boolean;
  tx: number; // smoothing target for pos updates
  ty: number;
  smooth: boolean;
  bubble: { text: string; start: number; until: number } | null;
  emotes: { kind: EmoteKind; t: number; dur: number; seed: number }[];
  blinkAt: number;
  mine: boolean;
}

// tall things fade when my cat walks behind them; leafy things sway in the wind
const FADE = new Set<PropKind>(['tree', 'sakura', 'pine', 'bigtree', 'house', 'shop', 'windmill', 'lighthouse', 'fruittree', 'bamboo', 'palm', 'gazebo', 'tent']);
const SWAY = new Set<PropKind>(['tree', 'sakura', 'pine', 'bigtree', 'reed', 'crop', 'flower', 'bush', 'fruittree', 'bamboo', 'palm']);

const ANIM_MAP: Record<string, AnimName> = {
  sit: 'sit', sit_happy: 'sit_happy', watch: 'watch', window: 'window', groom: 'groom', sniff: 'sniff' as AnimName, think: 'think', beg: 'beg',
  nap: 'nap', sleep: 'sleep', loaf: 'loaf', pounce: 'pounce', bat: 'bat', run: 'run', belly: 'belly', roll: 'belly', scratch: 'scratch',
  stand: 'stand', walk: 'walk', meow: 'meow', stretch: 'stretch', yawn: 'yawn', purr: 'purr',
};

interface Critter {
  k: 'butterfly' | 'petal' | 'leaf' | 'firefly' | 'splash' | 'bird';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  c: string;
  z: number;
}

export class WorldScene implements Scene {
  private g: GameLike;
  private w = getWorld();
  ents = new Map<string, WEnt>();
  private offset = 0; // server time - local time
  private camX = 60 * TILE;
  private camY = 47 * TILE;
  private zoom = 1.15;
  private targetZoom = 1.15;
  follow: string | null = null;
  private T = 0;
  private chunks = new Map<string, { c: HTMLCanvasElement; used: number }>();
  private chunkScale = 0;
  private sprites = new Map<string, { c: HTMLCanvasElement; ox: number; oy: number; s: number }>();
  private spriteScale = 0;
  private controlling = false;
  private joy: { ox: number; oy: number; x: number; y: number } | null = null;
  private lastSend = 0;
  private critters: Critter[] = [];
  private light: HTMLCanvasElement | null = null;
  private pen: Pen | null = null;
  private v: Viewport | null = null;
  private dragPan = false;
  private lastPoi = '';
  private hoverId: string | null = null;
  private welcomed = false;
  private sentView: [number, number] = [-1e9, -1e9];
  private sentViewAt = -100;
  private townZoom = 1.15; // remembered while looking into a room
  private fade = 0; // a soft blink when the camera goes through a door
  private lastDoor = 0;

  constructor(g: GameLike) {
    this.g = g;
  }

  enter(focus?: string) {
    this.welcomed = this.ents.size > 0;
    this.g.ws.send({ t: 'watch' });
    const c = activeCat();
    this.follow = focus ?? (c && this.ents.has(c.id) ? c.id : null);
    if (this.follow && this.ents.has(this.follow)) {
      const e = this.ents.get(this.follow)!;
      this.moveCamera(e.x, e.y);
    } else if (!this.follow) {
      this.camX = 60 * TILE;
      this.camY = 47 * TILE;
    }
  }

  get myCatId() {
    return activeCat()?.id ?? null;
  }

  now() {
    return Date.now() + this.offset;
  }

  // ---------------- network ----------------
  onServer(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        this.offset = m.now - Date.now();
        this.ents.clear();
        for (const e of m.ents) this.addEnt(e);
        this.welcomed = true;
        break;
      case 'spawn':
        this.addEnt(m.e);
        if (m.e.id === this.myCatId) {
          this.follow = m.e.id;
          ui.set({ catOut: true });
        }
        break;
      case 'despawn': {
        const e = this.ents.get(m.id);
        if (e) {
          this.addCritter('splash', e.x, e.y, '#ffffff');
          this.ents.delete(m.id);
        }
        if (m.id === this.myCatId) {
          this.controlling = false;
          ui.set({ controlling: false, catOut: false });
        }
        if (this.follow === m.id) this.follow = null;
        break;
      }
      case 'move': {
        const e = this.ents.get(m.id);
        if (!e || (e.mine && this.controlling)) break;
        const elapsed = Math.max(0, (this.now() - m.t0) / 1000);
        let [x, y] = [m.x, m.y];
        const path = m.path.slice();
        let d = elapsed * m.speed;
        while (path.length && d > 0) {
          const [px, py] = path[0];
          const seg = Math.hypot(px - x, py - y);
          if (d >= seg) {
            d -= seg;
            [x, y] = path.shift()!;
          } else {
            x += ((px - x) / seg) * d;
            y += ((py - y) / seg) * d;
            d = 0;
          }
        }
        if (Math.hypot(e.x - x, e.y - y) > 60) {
          e.x = x;
          e.y = y;
        }
        e.path = path;
        e.speed = m.speed;
        e.moving = path.length > 0;
        e.anim = m.run ? 'run' : 'walk';
        e.smooth = false;
        if (e.actor) {
          e.actor.x = e.x;
          e.actor.y = e.y;
          e.actor.speed = m.speed / (m.run ? 2.6 : 1) / e.actor.scale;
          e.actor.setPath(path, !!m.run);
        }
        break;
      }
      case 'act': {
        const e = this.ents.get(m.id);
        if (!e || (e.mine && this.controlling && m.anim === 'stand')) break;
        e.anim = m.anim;
        if (m.dir) e.dir = m.dir;
        e.path = [];
        e.moving = false;
        if (Math.hypot(e.x - m.x, e.y - m.y) > 3) {
          if (Math.hypot(e.x - m.x, e.y - m.y) > 80) {
            e.x = m.x;
            e.y = m.y;
          } else e.path = [[m.x, m.y]];
          e.moving = e.path.length > 0;
        }
        if (e.actor) {
          if (e.path.length) e.actor.setPath(e.path, false);
          else e.actor.stop();
          if (m.dir) e.actor.dir = m.dir;
          e.actor.play((ANIM_MAP[m.anim] ?? 'sit') as AnimName);
          e.actor.extra.anim = m.anim;
        }
        break;
      }
      case 'pos': {
        const e = this.ents.get(m.id);
        if (!e || (e.mine && this.controlling)) break;
        e.tx = m.x;
        e.ty = m.y;
        e.smooth = true;
        e.dir = m.dir;
        e.anim = m.anim;
        break;
      }
      case 'say': {
        const e = this.ents.get(m.id);
        if (!e) break;
        const T = this.T;
        const dur = Math.min(8, 2.8 + m.text.length * 0.17);
        if (e.actor) e.actor.say(m.text, T, dur);
        else e.bubble = { text: m.text, start: T, until: T + dur };
        if (e.mine) audio.meow(1.1);
        break;
      }
      case 'door': {
        const e = this.ents.get(m.id);
        if (!e) break;
        e.x = e.tx = m.x;
        e.y = e.ty = m.y;
        e.path = [];
        e.moving = false;
        e.smooth = false;
        if (e.actor) {
          e.actor.x = m.x;
          e.actor.y = m.y;
          e.actor.stop();
        }
        if (this.follow === m.id) this.moveCamera(m.x, m.y);
        if (e.mine) audio.blip(m.room ? 520 : 440, 0.05);
        break;
      }
      case 'emote': {
        const e = this.ents.get(m.id);
        if (!e) break;
        if (e.actor) e.actor.emote(m.kind as EmoteKind);
        else e.emotes.push({ kind: m.kind as EmoteKind, t: 0, dur: 1.6, seed: Math.random() * 100 });
        break;
      }
    }
  }

  private addEnt(st: EntState) {
    const mine = st.id === this.myCatId || st.ownerId === ui.state.me?.user.id;
    let actor: CatActor | null = null;
    if (st.kind === 'cat') {
      actor = new CatActor(st.id, st.name, st.genes);
      actor.age = st.age;
      actor.outfit = st.outfit;
      actor.scale = 0.95;
      actor.x = st.x;
      actor.y = st.y;
      actor.dir = st.dir;
      actor.play((ANIM_MAP[st.anim] ?? 'stand') as AnimName);
      actor.extra.anim = st.anim;
    }
    const e: WEnt = {
      st, actor, x: st.x, y: st.y, dir: st.dir, anim: st.anim, path: st.path ?? [], speed: st.speed ?? 40, phase: 0,
      moving: !!st.path?.length, tx: st.x, ty: st.y, smooth: false, bubble: null, emotes: [], blinkAt: Math.random() * 4, mine,
    };
    if (actor && st.path?.length) {
      actor.speed = (st.speed ?? CAT_SPEED) / (st.run ? 2.6 : 1) / actor.scale;
      actor.setPath(st.path, !!st.run);
    }
    this.ents.set(st.id, e);
  }

  refreshOutfit(id: string, outfit: string[]) {
    const e = this.ents.get(id);
    if (e?.actor) e.actor.outfit = outfit;
  }

  // ---------------- control ----------------
  setControl(on: boolean) {
    const id = this.myCatId;
    if (!id || !this.ents.has(id)) return;
    this.controlling = on;
    this.follow = id;
    this.g.ws.send({ t: 'control', catId: id, on });
    ui.set({ controlling: on });
    const e = this.ents.get(id)!;
    if (on) {
      e.path = [];
      e.actor?.stop();
      e.actor?.play('stand');
    }
  }

  emote(kind: 'meow' | 'roll' | 'sit' | 'stretch' | 'groom' | 'sleep') {
    const id = this.myCatId;
    if (!id) return;
    const anim = kind === 'roll' ? 'belly' : kind === 'sleep' ? 'nap' : kind;
    this.g.ws.send({ t: 'act', catId: id, anim });
    if (kind === 'meow') audio.meow();
    const e = this.ents.get(id);
    if (e?.actor && this.controlling) {
      e.actor.play((ANIM_MAP[anim] ?? 'sit') as AnimName);
      e.anim = anim;
    }
  }

  interact(target: string) {
    const id = this.myCatId;
    if (!id || !this.ents.has(id)) {
      toast('先带猫猫出门吧', '🐾');
      return;
    }
    if (this.controlling) this.setControl(false);
    this.g.ws.send({ t: 'interact', catId: id, target });
  }

  /** Do something with a resident: their little thing, a walk together, or goodbye. */
  npcAct(target: string, act: 'special' | 'walk' | 'bye') {
    const id = this.myCatId;
    if (!id || !this.ents.has(id)) {
      toast('先带猫猫出门吧', '🐾');
      return;
    }
    if (act !== 'bye' && this.controlling) this.setControl(false);
    this.g.ws.send({ t: 'npcAct', catId: id, npc: target, act });
    if (act !== 'bye') this.follow = id;
  }

  goToPoi(poiId: string) {
    const id = this.myCatId;
    const poi = POI_MAP[poiId];
    if (!poi) return;
    if (!id || !this.ents.has(id)) {
      this.follow = null;
      this.moveCamera(poi.x * TILE, poi.y * TILE);
      return;
    }
    if (this.controlling) this.setControl(false);
    this.g.ws.send({ t: 'goto', catId: id, x: poi.x * TILE, y: poi.y * TILE });
    this.follow = id;
  }

  command(action: string, place: string | null, reply: string) {
    const id = this.myCatId;
    const e = id ? this.ents.get(id) : undefined;
    if (e?.actor) e.actor.say(reply, this.T);
    else toast(reply, '🐱');
    if (!id) return;
    switch (action) {
      case 'goto':
        if (place) this.goToPoi(place);
        break;
      case 'home':
        this.g.ws.send({ t: 'leave', catId: id });
        break;
      case 'explore':
        if (this.controlling) this.setControl(false);
        this.g.ws.send({ t: 'explore', catId: id });
        break;
      case 'follow': {
        let best: WEnt | null = null, bd = 1e9;
        for (const o of this.ents.values()) {
          if (o.st.id === id || !e) continue;
          const d = Math.hypot(o.x - e.x, o.y - e.y);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) this.interact(best.st.id);
        break;
      }
      case 'sleep':
        this.emote('sleep');
        break;
      case 'play':
        this.g.ws.send({ t: 'act', catId: id, anim: 'pounce' });
        break;
      case 'eat':
        this.goToPoi('bakery');
        break;
      case 'sit':
      case 'stop':
        this.emote('sit');
        break;
      case 'meow':
      case 'groom':
      case 'roll':
      case 'stretch':
        this.emote(action as any);
        break;
    }
  }

  // ---------------- camera ----------------
  fit(v: Viewport) {
    v.zoom = this.zoom;
    v.camX = this.camX;
    v.camY = this.camY;
  }

  private clampCam(v: Viewport) {
    const halfW = v.w / 2 / this.zoom, halfH = (v.h - v.insetTop - v.insetBottom) / 2 / this.zoom;
    const maxX = WW * TILE, maxY = WH * TILE;
    this.camX = Math.max(halfW, Math.min(maxX - halfW, this.camX));
    this.camY = Math.max(halfH - v.insetTop / this.zoom, Math.min(maxY - halfH + v.insetBottom / this.zoom, this.camY));
  }

  // ---------------- update ----------------
  update(dt: number, T: number) {
    this.T = T;
    const myId = this.myCatId;
    for (const e of this.ents.values()) {
      e.mine = e.st.id === myId;
      if (e.mine && this.controlling) {
        this.updateControlled(e, dt);
        continue;
      }
      if (e.actor) {
        if (e.smooth) {
          const k = 1 - Math.exp(-dt * 10);
          const dx = e.tx - e.actor.x, dy = e.ty - e.actor.y;
          e.actor.x += dx * k;
          e.actor.y += dy * k;
          const sp = Math.hypot(dx, dy);
          if (sp > 2) {
            e.actor.phase += sp * k * 0.2;
            e.actor.play(e.anim === 'run' ? 'run' : 'walk');
          } else e.actor.play((ANIM_MAP[e.anim] ?? 'stand') as AnimName);
          e.actor.dir = e.dir;
        }
        e.actor.update(dt, T);
        e.x = e.actor.x;
        e.y = e.actor.y;
        if (!e.actor.moving && !e.smooth && e.actor.anim === 'stand' && e.anim !== 'walk' && e.anim !== 'run' && e.anim !== 'stand') {
          e.actor.play((ANIM_MAP[e.anim] ?? 'stand') as AnimName);
        }
      } else {
        // npc
        if (e.path.length) {
          const [px, py] = e.path[0];
          const dx = px - e.x, dy = py - e.y;
          const d = Math.hypot(dx, dy);
          const step = e.speed * dt;
          if (Math.abs(dx) > 0.5) e.dir = dx > 0 ? 1 : -1;
          if (d <= step) {
            e.x = px;
            e.y = py;
            e.path.shift();
          } else {
            e.x += (dx / d) * step;
            e.y += (dy / d) * step;
          }
          e.phase += step * 0.18;
          e.moving = true;
        } else e.moving = false;
        for (const em of e.emotes) em.t += dt;
        e.emotes = e.emotes.filter((em) => em.t < em.dur);
        if (e.bubble && T > e.bubble.until) e.bubble = null;
      }
    }
    // camera: follow along the street; through a door it jumps to the other side
    const v = this.v;
    if (this.follow) {
      const f = this.ents.get(this.follow);
      if (f) {
        if (roomAt(f.x, f.y) !== roomAt(this.camX, this.camY)) this.moveCamera(f.x, f.y);
        else {
          const k = 1 - Math.exp(-dt * 4);
          this.camX += (f.x - this.camX) * k;
          this.camY += (f.y - 20 - this.camY) * k;
        }
      }
    }
    const room = roomAt(this.camX, this.camY);
    if (room && v) this.fitRoom(v, room);
    else this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-dt * 8));
    if (v && !room) this.clampCam(v);
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 2.6);
    if ((room?.id ?? null) !== ui.state.room) ui.set({ room: room?.id ?? null, worldShop: null });
    // tell the server where we're looking (for area-of-interest filtering)
    if (Math.hypot(this.camX - this.sentView[0], this.camY - this.sentView[1]) > 240 || T - this.sentViewAt > 5) {
      this.sentView = [this.camX, this.camY];
      this.sentViewAt = T;
      this.g.ws.send({ t: 'view', x: Math.round(this.camX), y: Math.round(this.camY) });
    }
    this.updateCritters(dt);
    // where is my cat
    const me = myId ? this.ents.get(myId) : undefined;
    const myRoom = me ? roomAt(me.x, me.y)?.id ?? null : null;
    if (myRoom !== ui.state.myRoom) ui.set({ myRoom });
    if (me) {
      const poi = POIS.find((p) => Math.hypot(p.x * TILE - me.x, p.y * TILE - me.y) < p.r * TILE);
      const label = roomAt(me.x, me.y)?.name ?? poi?.name ?? ZONE_NAME[zoneAt(this.w, me.x, me.y)];
      if (label !== this.lastPoi) {
        this.lastPoi = label;
        ui.set({ hint: label });
      }
    }
  }

  private updateControlled(e: WEnt, dt: number) {
    const a = e.actor!;
    const [kx, ky] = (window as any).__game?.input?.axis?.() ?? [0, 0];
    let vx = kx, vy = ky;
    let run = false;
    if (this.joy) {
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        vx = dx / d;
        vy = dy / d;
        run = d > 60;
      }
    }
    const keys: Set<string> = (window as any).__game?.input?.keys ?? new Set();
    if (keys.has('shift')) run = true;
    const len = Math.hypot(vx, vy);
    if (len > 0.1) {
      a.stop();
      vx /= len;
      vy /= len;
      const sp = CAT_SPEED * (run ? 2.3 : 1);
      const nx = a.x + vx * sp * dt, ny = a.y + vy * sp * dt * 0.85;
      if (walkableAt(this.w, nx, a.y)) a.x = nx;
      if (walkableAt(this.w, a.x, ny)) a.y = ny;
      // walking into a doorway takes the cat through it
      const inside = roomAt(a.x, a.y);
      const atDoor = inside ? vy > 0.4 && Math.hypot(a.x - inside.door[0], a.y - inside.door[1]) < 34 : vy < -0.4 && getRooms().some((r) => Math.hypot(a.x - r.outside[0], a.y - r.outside[1]) < 30);
      if (atDoor && performance.now() - this.lastDoor > 1200) {
        this.lastDoor = performance.now();
        this.g.ws.send({ t: 'door', catId: e.st.id });
      }
      if (Math.abs(vx) > 0.2) a.dir = vx > 0 ? 1 : -1;
      a.phase += (sp * dt) / (run ? 30 : 15) * Math.PI / a.scale;
      a.play(run ? 'run' : 'walk');
      e.anim = run ? 'run' : 'walk';
    } else if (!a.moving) {
      if (e.anim === 'walk' || e.anim === 'run') {
        e.anim = 'stand';
        a.play('stand');
      }
    } else e.anim = a.running ? 'run' : 'walk';
    a.update(dt, this.T);
    e.x = a.x;
    e.y = a.y;
    e.dir = a.dir;
    const now = performance.now();
    if (now - this.lastSend > 100) {
      this.lastSend = now;
      this.g.ws.send({ t: 'pos', catId: e.st.id, x: Math.round(a.x), y: Math.round(a.y), dir: a.dir, anim: e.anim });
    }
  }

  // ---------------- critters ----------------
  private addCritter(k: Critter['k'], x: number, y: number, c: string) {
    this.critters.push({ k, x, y, vx: 0, vy: 0, t: 0, life: k === 'splash' ? 1 : 12, c, z: 0 });
  }

  private updateCritters(dt: number) {
    const v = this.v;
    if (!v) return;
    const ck = clock.worldClock();
    const day = daylight(ck.hour);
    const wthr = clock.weather();
    const [x0, y0, x1, y1] = v.bounds(40);
    const want = (k: Critter['k']) => this.critters.filter((c) => c.k === k).length;
    const rnd = () => [x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0)] as const;
    if (day > 0.5 && wthr.kind === 'clear' && ck.season < 3 && want('butterfly') < 8) {
      const [x, y] = rnd();
      const t = this.w.ter[Math.floor(y / TILE) * WW + Math.floor(x / TILE)];
      if (t === Ter.Grass || t === Ter.Field || t === Ter.Hill) this.critters.push({ k: 'butterfly', x, y, vx: 0, vy: 0, t: Math.random() * 10, life: 20 + Math.random() * 20, c: ['#ffd45e', '#f49ab0', '#a8d0f0', '#ffffff'][Math.floor(Math.random() * 4)], z: 20 });
    }
    if (ck.season === 0 && want('petal') < 18) {
      const [x, y] = rnd();
      if (x > 13 * TILE && x < 46 * TILE && y < 32 * TILE) this.critters.push({ k: 'petal', x, y: y - 100, vx: 10, vy: 14, t: Math.random() * 6, life: 9, c: '#f8c6d4', z: 0 });
    }
    if (ck.season === 2 && want('leaf') < 12) {
      const [x, y] = rnd();
      this.critters.push({ k: 'leaf', x, y: y - 100, vx: 12, vy: 16, t: Math.random() * 6, life: 9, c: ['#f6b85c', '#ef8c5a', '#f2cf62'][Math.floor(Math.random() * 3)], z: 0 });
    }
    if (day < 0.4 && wthr.kind !== 'rain' && want('firefly') < (ck.season === 1 ? 26 : 10)) {
      const [x, y] = rnd();
      this.critters.push({ k: 'firefly', x, y, vx: 0, vy: 0, t: Math.random() * 10, life: 14 + Math.random() * 10, c: '#fff3a0', z: 10 + Math.random() * 30 });
    }
    if (Math.random() < dt * 0.6) {
      const [x, y] = rnd();
      const t = this.w.ter[Math.floor(y / TILE) * WW + Math.floor(x / TILE)];
      if (t === Ter.Water || t === Ter.Deep) this.addCritter('splash', x, y, '#ffffff');
    }
    for (const c of this.critters) {
      c.t += dt;
      switch (c.k) {
        case 'butterfly':
          c.x += Math.sin(c.t * 0.7) * 22 * dt + Math.cos(c.t * 1.9) * 10 * dt;
          c.y += Math.cos(c.t * 0.9) * 14 * dt;
          c.z = 18 + Math.sin(c.t * 2.3) * 8;
          break;
        case 'petal':
        case 'leaf':
          c.x += (c.vx + Math.sin(c.t * 2) * 14) * dt;
          c.y += c.vy * dt;
          break;
        case 'firefly':
          c.x += Math.sin(c.t * 0.8 + c.life) * 8 * dt;
          c.y += Math.cos(c.t * 0.6) * 6 * dt;
          break;
      }
    }
    this.critters = this.critters.filter((c) => c.t < c.life && c.x > x0 - 200 && c.x < x1 + 200 && c.y > y0 - 300 && c.y < y1 + 200);
  }

  // ---------------- drawing helpers ----------------
  private bucket(v: Viewport) {
    const s = v.zoom * v.dpr;
    const steps = [0.75, 1, 1.5, 2, 2.5, 3, 4];
    let best = steps[0];
    for (const st of steps) if (Math.abs(st - s) < Math.abs(best - s)) best = st;
    return best;
  }

  private terAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) return Ter.Deep;
    return this.w.ter[ty * WW + tx];
  }

  private getChunk(cx: number, cy: number, scale: number, season: number): HTMLCanvasElement {
    const key = `${cx},${cy}`;
    const hit = this.chunks.get(key);
    if (hit) {
      hit.used = this.T;
      return hit.c;
    }
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(CPX * scale);
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.translate(-cx * CPX, -cy * CPX);
    this.paintGround(ctx, cx, cy, season);
    this.chunks.set(key, { c, used: this.T });
    if (this.chunks.size > 40) {
      const old = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, 10);
      for (const [k] of old) this.chunks.delete(k);
    }
    return c;
  }

  private paintGround(ctx: CanvasRenderingContext2D, cx: number, cy: number, season: number) {
    const pen = new Pen(ctx).begin(cx * 31 + cy * 7, 0.5, 1.6);
    const tx0 = cx * CHUNK - 1, ty0 = cy * CHUNK - 1, tx1 = tx0 + CHUNK + 2, ty1 = ty0 + CHUNK + 2;
    const grass = ['#cfe6ae', '#cfe6ae', '#d9e6b2', '#e4ebde'][season];
    const forest = ['#b9d99a', '#b2d394', '#cdd59a', '#d6e0d2'][season];
    const hill = ['#d5ebb4', '#d2e8ae', '#e2e2ac', '#eef1ea'][season];
    const field = ['#dde8b0', '#e6e3a8', '#eadbb0', '#ecebe4'][season];
    const bamboo = ['#b4d79c', '#a9d293', '#c6d59c', '#d8e2d2'][season];
    const orchard = ['#d6ebb0', '#cbe6a6', '#dfe2a6', '#e8ede2'][season];
    // base
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        const t = this.terAt(tx, ty);
        const n = noise2(tx * 0.18, ty * 0.18, 5) - 0.5;
        const base = t === Ter.Forest ? forest : t === Ter.Hill ? hill : t === Ter.Field ? field : t === Ter.Bamboo ? bamboo : t === Ter.Orchard ? orchard : grass;
        ctx.fillStyle = mix(base, n > 0 ? '#ffffff' : '#7a9a5a', Math.abs(n) * 0.18);
        ctx.fillRect(tx * TILE - 0.5, ty * TILE - 0.5, TILE + 1, TILE + 1);
      }
    const layer = (types: number[], fill: string, outline: boolean, r = 0.72) => {
      const tiles: [number, number, number][] = [];
      for (let ty = ty0; ty < ty1; ty++)
        for (let tx = tx0; tx < tx1; tx++) if (types.includes(this.terAt(tx, ty))) tiles.push([tx, ty, (r + (hashf(tx, ty, 41) - 0.5) * 0.12) * TILE]);
      if (!tiles.length) return;
      if (outline) {
        ctx.fillStyle = '#4a3a34';
        ctx.beginPath();
        for (const [tx, ty, rr] of tiles) {
          ctx.moveTo((tx + 0.5) * TILE + rr + 1.8, (ty + 0.5) * TILE);
          ctx.arc((tx + 0.5) * TILE, (ty + 0.5) * TILE, rr + 1.8, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (const [tx, ty, rr] of tiles) {
        ctx.moveTo((tx + 0.5) * TILE + rr, (ty + 0.5) * TILE);
        ctx.arc((tx + 0.5) * TILE, (ty + 0.5) * TILE, rr, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    // grass tufts before overlays
    ctx.strokeStyle = 'rgba(90,120,60,0.45)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        const t = this.terAt(tx, ty);
        if (t !== Ter.Grass && t !== Ter.Forest && t !== Ter.Hill && t !== Ter.Bamboo && t !== Ter.Orchard) continue;
        for (let k = 0; k < 2; k++) {
          if (hashf(tx, ty, 50 + k) > 0.45) continue;
          const x = (tx + hashf(tx, ty, 60 + k)) * TILE, y = (ty + hashf(tx, ty, 70 + k)) * TILE;
          ctx.beginPath();
          ctx.moveTo(x - 3, y - 4);
          ctx.lineTo(x, y);
          ctx.lineTo(x + 1, y - 5);
          ctx.moveTo(x, y);
          ctx.lineTo(x + 4, y - 3);
          ctx.stroke();
        }
        if (season < 3 && hashf(tx, ty, 80) < 0.06) {
          ctx.fillStyle = ['#ffffff', '#ffe08a', '#f8c6d4'][Math.floor(hashf(tx, ty, 81) * 3)];
          ctx.beginPath();
          ctx.arc((tx + hashf(tx, ty, 82)) * TILE, (ty + hashf(tx, ty, 83)) * TILE, 1.8, 0, 7);
          ctx.fill();
        }
      }
    layer([Ter.Sand], '#f4e4bf', true);
    layer([Ter.Path, Ter.Plaza], '#ecdcc0', true, 0.7);
    layer([Ter.Plaza], '#efe4d2', false, 0.74);
    // path pebbles & plaza tiles
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        const t = this.terAt(tx, ty);
        if (t === Ter.Path && hashf(tx, ty, 90) < 0.5) {
          pen.ellipse((tx + 0.2 + hashf(tx, ty, 91) * 0.6) * TILE, (ty + 0.2 + hashf(tx, ty, 92) * 0.6) * TILE, 3 + hashf(tx, ty, 93) * 2, 2.2, null, 1, 'rgba(150,120,90,0.45)');
        } else if (t === Ter.Plaza) {
          ctx.strokeStyle = 'rgba(160,130,100,0.28)';
          ctx.lineWidth = 1;
          ctx.strokeRect(tx * TILE + 2, ty * TILE + 2, TILE / 2 - 2, TILE / 2 - 2);
          ctx.strokeRect(tx * TILE + TILE / 2 + 1, ty * TILE + TILE / 2 + 1, TILE / 2 - 3, TILE / 2 - 3);
        } else if (t === Ter.Sand && hashf(tx, ty, 94) < 0.5) {
          ctx.fillStyle = 'rgba(190,150,100,0.4)';
          ctx.fillRect((tx + hashf(tx, ty, 95)) * TILE, (ty + hashf(tx, ty, 96)) * TILE, 1.6, 1.6);
        }
      }
    layer([Ter.Water, Ter.Deep, Ter.Wood, Ter.Stone], '#a9d6ec', true, 0.74);
    layer([Ter.Deep], '#93c6e3', false, 0.7);
    // stepping stones
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        if (this.terAt(tx, ty) !== Ter.Stone) continue;
        const sx = (tx + 0.5 + (hashf(tx, ty, 110) - 0.5) * 0.25) * TILE, sy = (ty + 0.5) * TILE;
        pen.ellipse(sx, sy + 2, 12, 7, 'rgba(74,58,52,0.18)', 0, null);
        pen.ellipse(sx, sy, 12, 8, ['#d6d0c6', '#c9c6c0'][(tx + ty) % 2], 1.4);
        pen.line([sx - 6, sy - 2, sx - 1, sy - 4], 1, 'rgba(255,255,255,0.7)');
      }
    // shore highlights
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        const t = this.terAt(tx, ty);
        if (t !== Ter.Water) continue;
        if (hashf(tx, ty, 100) < 0.3) {
          const x = (tx + 0.3) * TILE, y = (ty + 0.5) * TILE;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 5, y - 3, x + 10, y);
          ctx.stroke();
        }
      }
    // bridges and pier (wood planks)
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        if (this.terAt(tx, ty) !== Ter.Wood) continue;
        const x = tx * TILE, y = ty * TILE;
        ctx.fillStyle = '#dcb58a';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(120,80,50,0.5)';
        ctx.lineWidth = 1.2;
        const vertical = this.terAt(tx, ty - 1) === Ter.Wood && this.terAt(tx, ty + 1) === Ter.Wood && !(this.terAt(tx - 1, ty) === Ter.Wood && this.terAt(tx + 1, ty) === Ter.Wood);
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          if (vertical) {
            ctx.moveTo(x, y + i * 8);
            ctx.lineTo(x + TILE, y + i * 8);
          } else {
            ctx.moveTo(x + i * 8, y);
            ctx.lineTo(x + i * 8, y + TILE);
          }
          ctx.stroke();
        }
        // railings on edges facing water
        ctx.strokeStyle = '#4a3a34';
        ctx.lineWidth = 1.8;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const n = this.terAt(tx + dx, ty + dy);
          if (n !== Ter.Water && n !== Ter.Deep) continue;
          ctx.beginPath();
          if (dy === -1) {
            ctx.moveTo(x, y + 1);
            ctx.lineTo(x + TILE, y + 1);
          } else if (dy === 1) {
            ctx.moveTo(x, y + TILE - 1);
            ctx.lineTo(x + TILE, y + TILE - 1);
          } else if (dx === -1) {
            ctx.moveTo(x + 1, y);
            ctx.lineTo(x + 1, y + TILE);
          } else {
            ctx.moveTo(x + TILE - 1, y);
            ctx.lineTo(x + TILE - 1, y + TILE);
          }
          ctx.stroke();
        }
      }
  }

  private getSprite(p: Prop, scale: number, pc: PropCtx): { c: HTMLCanvasElement; ox: number; oy: number; s: number } {
    const key = `${p.k}|${p.v}|${pc.season}|${pc.night > 0.4 ? 1 : 0}|${p.label ?? ''}|${p.k === 'house' || p.k === 'shop' ? p.s : ''}`;
    let sp = this.sprites.get(key);
    if (sp) return sp;
    const b = BOUNDS[p.k] ?? [-40, -80, 40, 10];
    const pad = 6;
    const sMul = p.k === 'house' || p.k === 'shop' ? 1 : 1; // buildings scale via width in tiles below
    const bw = (b[2] - b[0] + pad * 2) * sMul, bh = (b[3] - b[1] + pad * 2) * sMul;
    const c = document.createElement('canvas');
    c.width = Math.ceil(bw * scale);
    c.height = Math.ceil(bh * scale);
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.translate(-b[0] + pad, -b[1] + pad);
    const pen = new Pen(ctx).begin(p.k.length * 7 + p.v * 13, 0.45, 1.7);
    drawProp(pen, p.k, p.v, { ...pc, label: p.label });
    sp = { c, ox: b[0] - pad, oy: b[1] - pad, s: scale };
    this.sprites.set(key, sp);
    return sp;
  }

  // ---------------- draw ----------------
  draw(v: Viewport, T: number) {
    this.v = v;
    if (!this.pen) this.pen = v.pen;
    v.zoom = this.zoom;
    v.camX = this.camX;
    v.camY = this.camY;
    const room = roomAt(this.camX, this.camY);
    if (room) this.drawRoom(v, room, T);
    else this.drawTown(v, T);
    this.drawOverlays(v, T);
    if (this.fade > 0) {
      v.screen();
      v.ctx.fillStyle = rgba('#f6eedf', Math.min(1, this.fade));
      v.ctx.fillRect(0, 0, v.w, v.h);
    }
  }

  private drawTown(v: Viewport, T: number) {
    const ctx = v.ctx;
    const ck = clock.worldClock();
    const day = daylight(ck.hour);
    const night = 1 - day;
    const wthr = clock.weather();
    const season = ck.season;
    const scale = this.bucket(v);
    if (scale !== this.chunkScale) {
      this.chunks.clear();
      this.chunkScale = scale;
    }
    if (scale !== this.spriteScale) {
      this.sprites.clear();
      this.spriteScale = scale;
    }
    v.screen();
    ctx.fillStyle = '#8fc3e3';
    ctx.fillRect(0, 0, v.w, v.h);
    v.world();
    const [bx0, by0, bx1, by1] = v.bounds(10);
    // ground chunks
    const cx0 = Math.max(0, Math.floor(bx0 / CPX)), cy0 = Math.max(0, Math.floor(by0 / CPX));
    const cx1 = Math.min(Math.ceil(WW / CHUNK) - 1, Math.floor(bx1 / CPX)), cy1 = Math.min(Math.ceil(WH / CHUNK) - 1, Math.floor(by1 / CPX));
    let built = 0;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`;
        if (!this.chunks.has(key) && built >= 2) {
          ctx.fillStyle = ['#cfe6ae', '#cfe6ae', '#d9e6b2', '#e4ebde'][season];
          ctx.fillRect(cx * CPX, cy * CPX, CPX, CPX);
          continue;
        }
        if (!this.chunks.has(key)) built++;
        const c = this.getChunk(cx, cy, scale, season);
        ctx.drawImage(c, cx * CPX, cy * CPX, CPX, CPX);
      }
    // animated water glints
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    const tx0 = Math.max(0, Math.floor(bx0 / TILE)), ty0 = Math.max(0, Math.floor(by0 / TILE));
    const tx1 = Math.min(WW - 1, Math.floor(bx1 / TILE)), ty1 = Math.min(WH - 1, Math.floor(by1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.w.ter[ty * WW + tx];
        if (t !== Ter.Water && t !== Ter.Deep) continue;
        const h = hashf(tx, ty, 200);
        if (h > 0.35) continue;
        const ph = (T * 0.35 + h * 10) % 1;
        const a = Math.sin(ph * Math.PI);
        ctx.globalAlpha = a * 0.8;
        const x = (tx + hashf(tx, ty, 201)) * TILE + ph * 8, y = (ty + hashf(tx, ty, 202)) * TILE;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.quadraticCurveTo(x - 3, y - 2.5, x, y);
        ctx.quadraticCurveTo(x + 3, y + 2.5, x + 6, y);
        ctx.stroke();
      }
    ctx.globalAlpha = 1;
    // cloud shadows
    if (day > 0.3) {
      ctx.fillStyle = `rgba(60,80,90,${0.05 + wthr.cloud * 0.05})`;
      for (let i = 0; i < 6; i++) {
        const x = ((T * 8 + i * 900) % (WW * TILE + 800)) - 400, y = (hashf(i, 3) * WH) * TILE;
        if (x < bx0 - 300 || x > bx1 + 300 || y < by0 - 200 || y > by1 + 200) continue;
        ctx.beginPath();
        ctx.ellipse(x, y, 220, 90, 0, 0, 7);
        ctx.ellipse(x + 120, y + 30, 140, 70, 0, 0, 7);
        ctx.fill();
      }
    }
    // critter shadows / splashes on ground
    for (const c of this.critters) {
      if (c.k === 'splash') {
        const k = c.t / c.life;
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 4 + k * 14, 2 + k * 6, 0, 0, 7);
        ctx.stroke();
      }
    }

    // depth sorted props & entities
    const pc: PropCtx = { season, night, t: T };
    const items: { y: number; f: () => void }[] = [];
    // things that may hide my cat get faded
    const focus = this.follow ? this.ents.get(this.follow) : this.myCatId ? this.ents.get(this.myCatId) : undefined;
    const wind = 0.6 + wthr.wind;
    for (const p of this.w.props) {
      if (p.season !== undefined && p.season !== season) continue;
      const b = BOUNDS[p.k] ?? [-40, -80, 40, 10];
      const pw = p.k === 'house' || p.k === 'shop' ? p.s * 5 * TILE / (p.k === 'shop' ? 230 : 136) : p.s;
      if (p.x + b[2] * pw < bx0 || p.x + b[0] * pw > bx1 || p.y + b[1] * pw > by1 || p.y + b[3] * pw < by0) continue;
      const flat = p.k === 'lily' || p.k === 'picnic' || p.k === 'sandbox' || p.k === 'hotspring';
      items.push({
        y: flat ? p.y - 200 : p.y,
        f: () => {
          const sp = this.getSprite(p, scale, pc);
          ctx.save();
          if (focus && focus.y < p.y - 4 && FADE.has(p.k)) {
            const fx = focus.x, fy = focus.y - 16;
            if (fx > p.x + b[0] * pw && fx < p.x + b[2] * pw && fy > p.y + b[1] * pw) ctx.globalAlpha = 0.42;
          }
          ctx.translate(p.x, p.y);
          if (p.k === 'boat') ctx.translate(0, Math.sin(T * 1.4 + p.id) * 2);
          if (p.k === 'lily') ctx.translate(Math.sin(T * 0.5 + p.id) * 1.5, 0);
          const sway = SWAY.has(p.k);
          if (sway) {
            const sk = Math.sin(T * 1.3 + p.x * 0.013) * 0.025 * wind * (p.k === 'bush' ? 0.4 : 1);
            ctx.transform(1, 0, sk, 1, 0, 0);
          }
          ctx.scale(pw, pw);
          ctx.drawImage(sp.c, sp.ox, sp.oy, sp.c.width / sp.s, sp.c.height / sp.s);
          ctx.restore();
          this.drawPropLive(p, pw, T, night);
        },
      });
    }
    const boil = Math.floor(T * 7) % 3;
    const lw = 1.7;
    for (const e of this.ents.values()) {
      if (e.x < bx0 - 60 || e.x > bx1 + 60 || e.y < by0 - 20 || e.y > by1 + 120) continue;
      items.push({ y: e.y, f: () => this.drawEnt(e, v, T, boil, lw) });
    }
    // butterflies are drawn in the sorted list too
    for (const c of this.critters) {
      if (c.k !== 'butterfly' && c.k !== 'petal' && c.k !== 'leaf') continue;
      items.push({ y: c.y + (c.k === 'butterfly' ? 0 : 400), f: () => this.drawCritter(ctx, c, T) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.f();

    // weather
    this.drawWeather(v, T, wthr.rain, wthr.snow);
    // lighting
    this.drawLighting(v, night, sunset(ck.hour), T);
    // fireflies glow above the darkness
    v.world();
    for (const c of this.critters) if (c.k === 'firefly') this.drawCritter(ctx, c, T);
  }

  /** Bubbles, name tags and emotes on top of whatever is being drawn. */
  private drawOverlays(v: Viewport, T: number) {
    const ctx = v.ctx;
    const [bx0, by0, bx1, by1] = v.bounds(10);
    const boil = Math.floor(T * 7) % 3;
    const lw = 1.7;
    v.world();
    // emotes
    for (const e of this.ents.values()) {
      if (e.x < bx0 - 60 || e.x > bx1 + 60 || e.y < by0 - 20 || e.y > by1 + 120) continue;
      v.pen.begin(boil * 5 + 1, 0.4, lw);
      if (e.actor) e.actor.drawEmotes(v.pen, T);
      else for (const em of e.emotes) drawEmote(v.pen, em.kind, e.x + 8, e.y - 62, em.t / em.dur, em.seed, 1, T);
    }
    // labels & bubbles in screen space
    v.screen();
    const showNames = this.zoom > 0.7;
    const placed: [number, number, number, number][] = [];
    const bubbles: { e: WEnt; sx: number; sy: number }[] = [];
    for (const e of this.ents.values()) {
      const top = e.actor ? e.actor.headTop() : e.y - 66;
      const [sx, sy] = v.toScreen(e.x, top);
      if (sx < -100 || sx > v.w + 100 || sy < -60 || sy > v.h + 100) continue;
      const bub = e.actor?.bubble ?? e.bubble;
      if (bub) bubbles.push({ e, sx, sy });
      else if (showNames && (e.mine || this.hoverId === e.st.id || this.zoom > 1.05)) {
        const [nx, ny] = v.toScreen(e.x, e.y + 6);
        drawNameTag(ctx, nx, ny + 10, e.mine ? `${e.st.name} ★` : e.st.kind === 'npc' ? `${e.st.name}·${e.st.owner}` : e.st.name, e.mine ? '#c0846a' : '#4a3a34', e.mine ? 0.95 : 0.75);
      }
    }
    // stack bubbles bottom-up so close neighbours don't overlap
    bubbles.sort((a, b) => b.sy - a.sy);
    for (const { e, sx, sy } of bubbles) {
      const bub = (e.actor?.bubble ?? e.bubble)!;
      const name = e.st.kind === 'npc' ? e.st.name : e.mine ? undefined : e.st.name;
      const m = measureBubble(ctx, bub.text, name);
      let lift = 0;
      for (let k = 0; k < 6; k++) {
        const x0 = sx - m.w / 2, y1 = sy - 2 - lift, y0 = y1 - m.h;
        const hit = placed.find((r) => x0 < r[2] && x0 + m.w > r[0] && y0 < r[3] && y1 > r[1]);
        if (!hit) break;
        lift += y1 - hit[1] + 4;
      }
      placed.push([sx - m.w / 2, sy - 2 - lift - m.h, sx + m.w / 2, sy - 2 - lift]);
      const a = Math.min(1, (T - bub.start) * 5, (bub.until - T) * 2);
      drawBubble(ctx, sx, sy - 2, bub.text, Math.max(0, a), name, e.st.kind === 'npc' ? 'npc' : 'cat', lift);
    }
    // joystick
    if (this.joy) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.fillStyle = 'rgba(74,58,52,0.15)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.joy.ox, this.joy.oy, 56, 0, 7);
      ctx.fill();
      ctx.stroke();
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy;
      const d = Math.min(56, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      ctx.fillStyle = 'rgba(255,253,246,0.95)';
      ctx.beginPath();
      ctx.arc(this.joy.ox + Math.cos(a) * d, this.joy.oy + Math.sin(a) * d, 24, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#4a3a34';
      ctx.stroke();
    }
    if (!this.welcomed) {
      ctx.fillStyle = 'rgba(74,58,52,0.6)';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('正在连接小镇…', v.w / 2, v.midY);
    }
    }

  private drawEnt(e: WEnt, v: Viewport, T: number, boil: number, lw: number) {
    const ctx = v.ctx;
    const pen = v.pen;
    pen.begin(boil * 19 + (e.st.genes.seed % 97), 0.5, lw);
    if (e.mine) {
      ctx.strokeStyle = 'rgba(255,214,102,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -T * 10;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 2, 26, 8, 0, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.actor) e.actor.draw(pen);
    else {
      const npc = NPC_MAP[e.st.id];
      if (npc) {
        ctx.save();
        ctx.translate(e.x, e.y);
        if (T > e.blinkAt + 0.14) e.blinkAt = T + 2 + Math.random() * 4;
        drawNpc(pen, npc.genes, npc.outfit, { anim: e.anim, t: T + e.st.genes.seed, phase: e.phase, moving: e.moving, dir: e.dir, blink: T > e.blinkAt, talking: !!e.bubble && T - e.bubble.start < Math.min(3, e.bubble.until - e.bubble.start) });
        ctx.restore();
      }
    }
  }

  // ---------------- rooms ----------------
  /** Point the camera somewhere; through a door, the view blinks to the other side. */
  private moveCamera(x: number, y: number) {
    const before = roomAt(this.camX, this.camY), after = roomAt(x, y);
    if (before !== after) {
      this.fade = 0.9;
      if (!before) this.townZoom = this.targetZoom;
      else if (!after) this.zoom = this.targetZoom = this.townZoom;
    }
    this.camX = x;
    this.camY = y - 20;
  }

  /** A room fills the screen like the nest does. */
  private fitRoom(v: Viewport, r: Room) {
    const wallH = (WALL_H * TILE) / CELL;
    const w = r.w * TILE + 36, h = r.h * TILE + wallH + 70;
    const availH = v.h - v.insetTop - v.insetBottom;
    this.zoom = Math.max(0.5, Math.min(1.8, Math.min(v.w / w, availH / h)));
    this.camX = r.ox + (r.w * TILE) / 2;
    this.camY = r.oy + (r.h * TILE - wallH) / 2 + 6;
  }

  /** The shop whose front was tapped in town. */
  private shopAt(x: number, y: number): Room | null {
    const tx = x / TILE, ty = y / TILE;
    for (const r of getRooms()) {
      const b = r.building;
      if (tx >= b.x && tx <= b.x + b.w && ty >= b.y - 3 && ty <= b.y + b.h + 0.4) return r;
    }
    return null;
  }

  /** Who is inside each shop right now (cats only, townsfolk aside). */
  shopVisitors(id: string): { cats: number; keeper: boolean } {
    const r = roomById(id);
    let cats = 0, keeper = false;
    for (const e of this.ents.values()) {
      if (roomAt(e.x, e.y) !== r) continue;
      if (e.st.kind === 'cat') cats++;
      else if (r?.keeper === e.st.id) keeper = true;
    }
    return { cats, keeper };
  }

  /** Look inside without going in. */
  peek(id: string) {
    const r = roomById(id);
    if (!r) return;
    this.follow = null;
    ui.set({ worldShop: null, worldTarget: null });
    this.moveCamera(r.ox + (r.w * TILE) / 2, r.oy + (r.h * TILE) / 2);
  }

  /** Take my cat into a shop. */
  goInto(id: string) {
    const r = roomById(id);
    const me = this.myCatId;
    ui.set({ worldShop: null });
    if (!r) return;
    if (!me || !this.ents.has(me)) return this.peek(id);
    if (this.controlling) this.setControl(false);
    this.g.ws.send({ t: 'goto', catId: me, x: r.door[0], y: r.door[1], room: r.id });
    this.follow = me;
  }

  /** Back out to the street: my cat walks out, or the camera just leaves. */
  leaveRoom() {
    const r = roomAt(this.camX, this.camY);
    if (!r) return;
    const me = this.myCatId ? this.ents.get(this.myCatId) : undefined;
    if (me && roomAt(me.x, me.y) === r) {
      if (this.controlling) this.setControl(false);
      this.g.ws.send({ t: 'goto', catId: me.st.id, x: r.outside[0], y: r.outside[1] + TILE * 0.8 });
      this.follow = me.st.id;
      return;
    }
    this.follow = me && !roomAt(me.x, me.y) ? me.st.id : null;
    this.moveCamera(r.outside[0], r.outside[1]);
  }

  private drawRoomItem(it: Room['items'][number], d: DrawCtx, layer: 'back' | 'front') {
    const x = it.x * CELL, y = it.y * CELL;
    if (isShopPiece(it.k)) {
      if (layer === 'back') drawShopPiece(it.k, d, x, y, it.w, it.h, it.v ?? 0);
    } else drawFurniture(it.k, { ...d, flip: !!it.flip }, x, y, it.w, it.h, layer);
  }

  private drawRoom(v: Viewport, r: Room, T: number) {
    const ctx = v.ctx;
    const pen = v.pen;
    const ck = clock.worldClock();
    const night = 1 - daylight(ck.hour);
    const wthr = clock.weather();
    const sky: SkyInfo = { sky: skyColor(ck.hour, wthr), sun: daylight(ck.hour), rain: wthr.rain, snow: wthr.snow, hour: ck.hour };
    const open = roomOpen(r, ck.hour);
    const boil = Math.floor(T * 7) % 3;
    const k = TILE / CELL, W = r.w * CELL, H = r.h * CELL;
    const plw = 2 / (k * Math.max(0.6, v.zoom));
    // backdrop, like the nest's
    v.screen();
    const bg = ctx.createLinearGradient(0, 0, 0, v.h);
    bg.addColorStop(0, mix('#f3e7d3', '#2e3150', night * 0.85));
    bg.addColorStop(1, mix('#e9dcc4', '#3c3a55', night * 0.85));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, v.w, v.h);
    v.world();
    const d: DrawCtx = { pen, t: T, night: open ? night * 0.6 : night, flip: false };
    const inRoom = (f: () => void) => {
      ctx.save();
      ctx.translate(r.ox, r.oy);
      ctx.scale(k, k);
      pen.begin(boil * 31 + 5, 0.45, plw);
      f();
      ctx.restore();
    };
    inRoom(() => {
      ctx.fillStyle = 'rgba(74,58,52,0.12)';
      ctx.beginPath();
      ctx.ellipse(W / 2, H + 26, W * 0.56, 18, 0, 0, 7);
      ctx.fill();
      drawWallpaper(r.wallpaper, pen, 0, -WALL_H, W, WALL_H);
      const ws = ctx.createLinearGradient(0, -WALL_H, 0, 0);
      ws.addColorStop(0, 'rgba(74,58,52,0.14)');
      ws.addColorStop(0.25, 'rgba(74,58,52,0)');
      ws.addColorStop(1, 'rgba(74,58,52,0.06)');
      ctx.fillStyle = ws;
      ctx.fillRect(0, -WALL_H, W, WALL_H);
      ctx.fillStyle = mix(wallpaperBase(r.wallpaper), '#b98d61', 0.55);
      ctx.fillRect(0, -9, W, 9);
      pen.line([0, -9, W, -9], plw * 0.8);
      drawFloor(r.floor, pen, 0, 0, W, H);
      const fs = ctx.createLinearGradient(0, 0, 0, H);
      fs.addColorStop(0, 'rgba(74,58,52,0.12)');
      fs.addColorStop(0.18, 'rgba(74,58,52,0)');
      ctx.fillStyle = fs;
      ctx.fillRect(0, 0, W, H);
      pen.line([0, -WALL_H, W, -WALL_H], plw);
      pen.line([0, -WALL_H, 0, H], plw);
      pen.line([W, -WALL_H, W, H], plw);
      for (const wi of r.wall) if (!drawShopWall(wi.k, d, wi.x * CELL, wi.w, wi.v ?? 0)) drawWallItem(wi.k, d, wi.x * CELL, wi.w, sky);
      drawPlaque(pen, W / 2, r.name);
      for (const it of r.items) if (it.walk) this.drawRoomItem(it, d, 'back');
      // the front edge, open where the door is
      const dx0 = (r.w / 2 - 1) * CELL, dx1 = (r.w / 2 + 1) * CELL;
      pen.line([0, H, dx0, H], plw * 1.3);
      pen.line([dx1, H, W, H], plw * 1.3);
    });
    const items: { y: number; f: () => void }[] = [];
    for (const it of r.items) {
      if (it.walk) continue;
      const bottom = r.oy + (it.y + it.h) * TILE;
      items.push({ y: bottom - 0.5, f: () => inRoom(() => this.drawRoomItem(it, d, 'back')) });
      if (HAS_FRONT.has(it.k)) items.push({ y: bottom + 0.6, f: () => inRoom(() => this.drawRoomItem(it, d, 'front')) });
    }
    const [bx0, by0, bx1, by1] = v.bounds(40);
    for (const e of this.ents.values()) {
      if (e.x < bx0 || e.x > bx1 || e.y < by0 || e.y > by1 + 100) continue;
      items.push({ y: e.y, f: () => this.drawEnt(e, v, T, boil, 1.7) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.f();
    // evenings: a little dimmer, with the lamps on; after hours it's dark inside
    const dim = open ? night * 0.22 : 0.18 + night * 0.4;
    if (dim > 0.02) {
      const wallH = (WALL_H * TILE) / CELL;
      ctx.fillStyle = `rgba(18,26,78,${dim})`;
      ctx.fillRect(r.ox, r.oy - wallH, r.w * TILE, r.h * TILE + wallH);
      if (open) {
        ctx.globalCompositeOperation = 'lighter';
        const cx = r.ox + (r.w * TILE) / 2, cy = r.oy + r.h * TILE * 0.35;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.w * TILE * 0.55);
        g.addColorStop(0, `rgba(255,190,110,${0.22 * night})`);
        g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(r.ox, r.oy - wallH, r.w * TILE, r.h * TILE + wallH);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (!open) {
      const cx = r.ox + (r.w * TILE) / 2, cy = r.oy + r.h * TILE - 40;
      pen.begin(7, 0.4, 1.6);
      pen.poly([cx - 56, cy - 16, cx + 56, cy - 16, cx + 56, cy + 14, cx - 56, cy + 14], '#fff8e8', 1.6);
      ctx.fillStyle = INK_TEXT;
      ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('打烊啦，明天见', cx, cy - 1);
    }
  }

  private drawPropLive(p: Prop, s: number, T: number, night: number) {
    const ctx = this.v!.ctx;
    const pen = this.v!.pen;
    switch (p.k) {
      case 'windmill': {
        ctx.save();
        ctx.translate(p.x, p.y - 128);
        ctx.rotate(T * 0.6);
        pen.begin(77, 0.3, 1.7);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          pen.shape([0, -4, 70, -10, 72, 10, 0, 4], '#fffaf0');
          pen.line([10, 0, 70, 0], 1, 'rgba(74,58,52,0.4)');
        }
        pen.ellipse(0, 0, 6, 6, '#d98f6a');
        ctx.restore();
        break;
      }
      case 'fountain': {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + T * 0.3;
          const k = (T * 1.2 + i * 0.3) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 66);
          ctx.quadraticCurveTo(p.x + Math.cos(a) * 16, p.y - 78, p.x + Math.cos(a) * 20, p.y - 42 + k * 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - 9, 12 + k * 34, 4 + k * 10, 0, 0, 7);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'hotspring': {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 9; i++) {
          const k = (T * 0.18 + i / 9) % 1;
          const sx = p.x - 80 + ((i * 37) % 160) + Math.sin(k * 5 + i) * 10, sy = p.y - 70 - k * 90;
          ctx.globalAlpha = Math.sin(k * Math.PI) * 0.75;
          ctx.beginPath();
          ctx.ellipse(sx, sy, 10 + k * 18, 6 + k * 10, 0, 0, 7);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'campfire': {
        const hour = clock.worldClock().hour;
        if (hour > 7 && hour < 17.5) break; // lit from dusk to morning
        for (let i = 0; i < 3; i++) {
          const fl = Math.sin(T * 9 + i * 2) * 3, h = 22 + Math.sin(T * 6 + i) * 5;
          const x = p.x + (i - 1) * 7;
          pen.begin(9 + i, 0.3, 1.4);
          pen.shape([x - 7, p.y - 8, x + fl, p.y - 8 - h, x + 7, p.y - 8], ['#f39a45', '#ffd45e', '#f08a5d'][i]);
        }
        ctx.fillStyle = 'rgba(255,240,170,0.7)';
        for (let i = 0; i < 4; i++) {
          const k = (T * 0.6 + i / 4) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.beginPath();
          ctx.arc(p.x + Math.sin(k * 7 + i) * 8, p.y - 30 - k * 50, 1.6, 0, 7);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'kite': {
        const kx = p.x + Math.sin(T * 0.7) * 20, ky = p.y - 200 + Math.cos(T * 0.9) * 12;
        pen.begin(5, 0.4, 1.5);
        pen.line([p.x + 10, p.y - 10, (p.x + kx) / 2 + 20, (p.y + ky) / 2, kx, ky + 14], 0.8, 'rgba(74,58,52,0.6)');
        pen.shape([kx, ky - 16, kx + 12, ky, kx, ky + 14, kx - 12, ky], '#f49ab0');
        pen.line([kx, ky + 14, kx - 6 + Math.sin(T * 3) * 4, ky + 30, kx + 2, ky + 42], 1.2, '#ffd45e');
        break;
      }
      case 'lighthouse':
        if (night > 0.4) {
          const a = T * 0.8;
          const g = ctx.createRadialGradient(p.x, p.y - 166, 4, p.x, p.y - 166, 260);
          g.addColorStop(0, 'rgba(255,240,170,0.35)');
          g.addColorStop(1, 'rgba(255,240,170,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 166);
          ctx.arc(p.x, p.y - 166, 260, a - 0.2, a + 0.2);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'house':
        // chimney smoke
        if (Math.floor(p.v) % 2 === 0) {
          const cx = p.x + (136 / 2 - 34) * s, cy = p.y - 130 * s;
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          for (let i = 0; i < 3; i++) {
            const k = (T * 0.25 + i / 3) % 1;
            ctx.globalAlpha = (1 - k) * 0.7;
            ctx.beginPath();
            ctx.arc(cx + Math.sin(k * 4 + p.id) * 6 + k * 10, cy - k * 50, 4 + k * 8, 0, 7);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        break;
    }
  }

  private drawCritter(ctx: CanvasRenderingContext2D, c: Critter, T: number) {
    switch (c.k) {
      case 'butterfly': {
        const flap = Math.abs(Math.sin(c.t * 14));
        ctx.fillStyle = 'rgba(74,58,52,0.1)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 4, 1.5, 0, 0, 7);
        ctx.fill();
        ctx.fillStyle = c.c;
        ctx.strokeStyle = '#4a3a34';
        ctx.lineWidth = 0.9;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(c.x + s * 3 * flap, c.y - c.z, 3.4 * flap + 0.6, 4, s * 0.3, 0, 7);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case 'petal':
      case 'leaf': {
        ctx.fillStyle = c.c;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.t * 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, c.k === 'leaf' ? 4 : 3, 2, 0, 0, 7);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'firefly': {
        const a = 0.4 + Math.sin(c.t * 3 + c.life) * 0.4;
        const g = ctx.createRadialGradient(c.x, c.y - c.z, 0, c.x, c.y - c.z, 9);
        g.addColorStop(0, `rgba(255,245,160,${a})`);
        g.addColorStop(1, 'rgba(255,245,160,0)');
        ctx.fillStyle = g;
        ctx.fillRect(c.x - 9, c.y - c.z - 9, 18, 18);
        break;
      }
    }
    void T;
  }

  private drawWeather(v: Viewport, T: number, rain: number, snow: number) {
    if (!rain && !snow) return;
    const ctx = v.ctx;
    v.screen();
    if (rain) {
      ctx.fillStyle = 'rgba(70,90,120,0.12)';
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      const n = Math.floor(90 * rain);
      for (let i = 0; i < n; i++) {
        const x = (hashf(i, 1) * v.w + T * 60) % v.w, y = (hashf(i, 2) * v.h + T * (480 + hashf(i, 3) * 200)) % v.h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 11);
        ctx.stroke();
      }
    }
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const n = Math.floor(80 * snow);
      for (let i = 0; i < n; i++) {
        const x = (hashf(i, 1) * v.w + Math.sin(T + i) * 12 + T * 10) % v.w, y = (hashf(i, 2) * v.h + T * (30 + hashf(i, 3) * 30)) % v.h;
        ctx.beginPath();
        ctx.arc(x, y, 1.4 + hashf(i, 4) * 1.6, 0, 7);
        ctx.fill();
      }
    }
  }

  private drawLighting(v: Viewport, night: number, dusk: number, T: number) {
    if (night < 0.05 && dusk < 0.05) return;
    const ctx = v.ctx;
    if (!this.light) this.light = document.createElement('canvas');
    const L = this.light;
    if (L.width !== v.canvas.width || L.height !== v.canvas.height) {
      L.width = v.canvas.width;
      L.height = v.canvas.height;
    }
    const lc = L.getContext('2d')!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, L.width, L.height);
    lc.fillStyle = night > 0.05 ? `rgba(18,26,78,${0.62 * night})` : `rgba(255,140,70,${0.14 * dusk})`;
    lc.fillRect(0, 0, L.width, L.height);
    if (night > 0.05) {
      const z = v.zoom * v.dpr;
      lc.setTransform(z, 0, 0, z, v.dpr * (v.w / 2 - v.camX * v.zoom), v.dpr * (v.midY - v.camY * v.zoom));
      lc.globalCompositeOperation = 'destination-out';
      const [bx0, by0, bx1, by1] = v.bounds(200);
      const lights: [number, number, number, number][] = [];
      for (const p of this.w.props) {
        if (p.x < bx0 || p.x > bx1 || p.y < by0 || p.y > by1) continue;
        if (p.season !== undefined && p.season !== clock.season()) continue;
        if (p.k === 'lamp') lights.push([p.x, p.y - 66, 120, 1]);
        else if (p.k === 'lanterns') for (let i = 0; i < 7; i++) lights.push([p.x - 90 + i * 30, p.y - 72, 46, 0.8]);
        else if (p.k === 'lighthouse') lights.push([p.x, p.y - 166, 160, 1]);
        else if (p.k === 'campfire') lights.push([p.x, p.y - 16, 170, 1]);
        else if (p.k === 'stonelamp') lights.push([p.x, p.y - 26, 70, 0.8]);
        else if (p.k === 'gazebo') lights.push([p.x, p.y - 52, 80, 0.8]);
        else if (p.k === 'house' || p.k === 'shop') {
          const s = p.s * 5 * TILE / (p.k === 'shop' ? 230 : 136);
          const off = p.k === 'shop' ? 70 : 42;
          lights.push([p.x - off * s, p.y - 50 * s, 70, 0.8], [p.x + off * s, p.y - 50 * s, 70, 0.8], [p.x, p.y - 20 * s, 60, 0.6]);
        } else if (p.k === 'fountain') lights.push([p.x, p.y - 20, 80, 0.4]);
      }
      for (const e of this.ents.values()) lights.push([e.x, e.y - 20, e.mine ? 80 : 34, e.mine ? 0.7 : 0.35]);
      for (const c of this.critters) if (c.k === 'firefly') lights.push([c.x, c.y - c.z, 22, 0.5]);
      for (const [x, y, r, a] of lights) {
        const g = lc.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = g;
        lc.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(L, 0, 0);
      v.world();
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, r, a] of lights) {
        if (a < 0.75) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.7);
        g.addColorStop(0, `rgba(255,190,110,${0.16 * night})`);
        g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(L, 0, 0);
    }
    void T;
  }

  // ---------------- input ----------------
  private pick(x: number, y: number): WEnt | null {
    let best: WEnt | null = null, bd = 1e9;
    for (const e of this.ents.values()) {
      const top = e.actor ? e.actor.headTop() : e.y - 64;
      if (x < e.x - 26 || x > e.x + 26 || y < top - 6 || y > e.y + 8) continue;
      const d = Math.abs(e.x - x) + Math.abs(e.y - y) + (e.mine ? 60 : 0);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  makeInput(v: Viewport): InputHandler {
    return {
      onTap: (p) => {
        audio.unlock();
        const [x, y] = v.toWorld(p.x, p.y);
        const hit = this.pick(x, y);
        if (hit) {
          if (hit.mine) {
            hit.actor?.emote('heart');
            this.follow = hit.st.id;
            ui.set({ worldTarget: null });
            return;
          }
          const npc = NPC_MAP[hit.st.id];
          ui.set({ worldTarget: { id: hit.st.id, name: hit.st.name, kind: hit.st.kind, owner: hit.st.owner, shop: npc?.shop } });
          return;
        }
        ui.set({ worldTarget: null });
        const room = roomAt(this.camX, this.camY);
        // in town, a shop's front opens its card; in a shop, the doormat leads back out
        if (!room) {
          const shop = this.shopAt(x, y);
          if (shop) {
            ui.set({ worldShop: shop.id });
            return;
          }
        } else if (Math.abs(x - room.door[0]) < TILE * 1.3 && y > room.door[1] - TILE * 0.7) {
          this.leaveRoom();
          return;
        }
        if (ui.state.worldShop) ui.set({ worldShop: null });
        const id = this.myCatId;
        if (id && this.ents.has(id)) {
          if (!walkableAt(this.w, x, y)) return;
          const e = this.ents.get(id)!;
          const legs = this.controlling && e.actor ? planRoute(this.w, e.x, e.y, x, y) : null;
          if (legs && legs.length === 1 && e.actor) {
            const pts = legs[0].pts;
            e.actor.speed = CAT_SPEED / e.actor.scale;
            e.actor.setPath(pts, Math.hypot(x - e.x, y - e.y) > 400);
          } else {
            if (this.controlling) this.setControl(false);
            this.g.ws.send({ t: 'goto', catId: id, x, y, run: Math.hypot(x - e.x, y - e.y) > 500 });
          }
          this.follow = id;
          this.addCritter('splash', x, y, '#ffffff');
        }
      },
      onHover: (p) => {
        const [x, y] = v.toWorld(p.x, p.y);
        const hit = this.pick(x, y);
        this.hoverId = hit?.st.id ?? null;
        v.canvas.style.cursor = hit ? 'pointer' : 'default';
      },
      onDragStart: (p) => {
        audio.unlock();
        if (this.controlling) {
          this.joy = { ox: p.x, oy: p.y, x: p.x, y: p.y };
          return true;
        }
        this.dragPan = true;
        this.follow = null;
        return true;
      },
      onDrag: (p, dx, dy) => {
        if (this.joy) {
          this.joy.x = p.x;
          this.joy.y = p.y;
        } else if (this.dragPan) {
          this.camX -= dx / this.zoom;
          this.camY -= dy / this.zoom;
        }
      },
      onDragEnd: () => {
        this.joy = null;
        this.dragPan = false;
      },
      onPinch: (s) => {
        this.targetZoom = Math.max(0.5, Math.min(2.2, this.targetZoom * s));
        this.zoom = this.targetZoom;
      },
      onWheel: (d) => {
        this.targetZoom = Math.max(0.5, Math.min(2.2, this.targetZoom * Math.exp(-d * 0.0015)));
      },
    };
  }

  zoomBy(f: number) {
    this.targetZoom = Math.max(0.5, Math.min(2.2, this.targetZoom * f));
  }

  focusMine() {
    const id = this.myCatId;
    if (id && this.ents.has(id)) this.follow = id;
  }

  catPositions(): { id: string; x: number; y: number; mine: boolean; npc: boolean }[] {
    return [...this.ents.values()].map((e) => {
      // the map shows anyone inside a shop at its door
      const r = roomAt(e.x, e.y);
      const [x, y] = r ? r.outside : [e.x, e.y];
      return { id: e.st.id, x: x / TILE, y: y / TILE - (r ? 0.6 : 0), mine: e.mine, npc: e.st.kind === 'npc' };
    });
  }

  visitTarget(id: string) {
    void this.g.visit(id);
  }
}

export { BUILDINGS };
export type { PropKind };
