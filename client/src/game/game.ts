import { Viewport } from '../engine/view';
import { Input } from '../engine/input';
import { NestScene, type NestEnv } from './nest';
import { WorldScene } from './world';
import { api, getToken, setToken, WorldSocket, ApiError } from './net';
import { ui, toast, activeCat, patchCat } from './state';
import { audio } from './audio';
import type { MeResponse, NestLayout, CatRecord } from '../../../shared/types';
import type { SpeechCtx } from '../../../shared/speech';
import { fallbackLine } from '../../../shared/speech';
import { ITEM_MAP } from '../../../shared/items';
import { clockAt, phaseOf } from '../../../shared/time';
import type { ServerMsg } from '../../../shared/protocol';

export interface Scene {
  update(dt: number, T: number): void;
  draw(v: Viewport, T: number): void;
  fit(v: Viewport): void;
  makeInput(v: Viewport): import('../engine/input').InputHandler;
}

class Game {
  view!: Viewport;
  input!: Input;
  nest: NestScene | null = null;
  world: WorldScene | null = null;
  ws = new WorldSocket();
  private scene: Scene | null = null;
  private last = 0;
  private T = 0;
  private savedLayout: NestLayout | null = null;
  private running = false;

  // ---------- boot ----------
  async boot(canvas: HTMLCanvasElement) {
    this.view = new Viewport(canvas);
    this.input = new Input(canvas);
    const ro = new ResizeObserver(() => {
      this.view.resize();
      this.scene?.fit(this.view);
    });
    ro.observe(canvas);
    this.ws.onState = (c) => ui.set({ connected: c });
    this.ws.on((m) => this.onServer(m));
    api('GET', '/api/status').then((s) => ui.set({ llm: !!s.llm })).catch(() => {});
    if (!getToken()) {
      ui.set({ phase: 'welcome' });
    } else {
      try {
        const me = await api<MeResponse>('GET', '/api/me');
        this.setMe(me);
        await this.enterGame();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          ui.set({ phase: 'welcome' });
        } else {
          ui.set({ phase: 'welcome' });
          toast((e as Error).message);
        }
      }
    }
    if (!this.running) {
      this.running = true;
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  private setMe(me: MeResponse) {
    ui.set({ me });
  }

  async refreshMe() {
    const me = await api<MeResponse>('GET', '/api/me');
    this.setMe(me);
    const c = activeCat();
    if (c && this.nest && this.nest.rec.id === c.id && !ui.state.visiting) this.nest.setRecord(c);
    return me;
  }

  async register(nickname: string) {
    const r = await api<{ token: string; me: MeResponse }>('POST', '/api/register', { nickname, tzOffset: new Date().getTimezoneOffset() });
    setToken(r.token);
    this.setMe(r.me);
    ui.set({ phase: 'adopt' });
  }

  async login(code: string) {
    const r = await api<{ token: string; me: MeResponse }>('POST', '/api/login', { code });
    setToken(r.token);
    this.setMe(r.me);
    await this.enterGame();
  }

  async adopt(name: string, seed: number) {
    const me = await api<MeResponse>('POST', '/api/adopt', { name, seed });
    this.setMe(me);
    await this.enterGame();
    setTimeout(() => toast(`欢迎回家，${name}！`, '🏠', 4000), 600);
  }

  private async enterGame() {
    const me = ui.state.me!;
    if (!me.cats.length) {
      ui.set({ phase: 'adopt' });
      return;
    }
    ui.set({ phase: 'game' });
    if (!this.world) this.world = new WorldScene(this);
    this.ws.connect();
    await this.openNest();
    this.loadUnread();
    api('POST', '/api/daily')
      .then((r) => {
        if (r.got > 0) {
          toast(`今日份的小鱼干到啦 +${r.got}`, '🐟', 4000);
          ui.set((s) => ({ me: s.me ? { ...s.me, user: { ...s.me.user, fish: r.fish } } : s.me }));
        }
      })
      .catch(() => {});
  }

  async loadUnread() {
    try {
      const evs = await api<any[]>('GET', '/api/events');
      ui.set({ unread: evs.filter((e) => !e.seen).length });
    } catch {
      /* ignore */
    }
  }

  // ---------- scenes ----------
  private nestEnv(): NestEnv {
    return {
      say: (cat, ctx, info) => this.fetchLine(cat, ctx, info),
      onPet: () => {
        const c = activeCat();
        audio.purr();
        if (c && !ui.state.visiting) this.act(c.id, 'pet');
      },
      onPlay: () => {
        const c = activeCat();
        audio.blip(880);
        if (c && !ui.state.visiting) this.act(c.id, 'play');
      },
      onLayoutChange: () => ui.set({}),
      onBuildSelect: () => ui.set({}),
    };
  }

  async openNest(catId?: string) {
    const cat = catId ? ui.state.me!.cats.find((c) => c.id === catId) : activeCat();
    if (!cat) return;
    const r = await api<{ layout: NestLayout; cat: CatRecord }>('GET', `/api/nest/${cat.id}`);
    patchCat(cat.id, r.cat);
    this.nest = new NestScene(r.cat, r.layout, this.nestEnv());
    ui.set({ nest: r.layout, visiting: null, scene: 'nest', catOut: r.cat.location === 'world', build: false, play: false });
    this.setScene(this.nest);
    if (r.cat.location === 'world') ui.set({ hint: `${r.cat.name}正在外面探险，可以去小镇看看它` });
    else {
      ui.set({ hint: null });
      setTimeout(() => this.nest?.say('greet'), 1400);
    }
  }

  async visit(catId: string) {
    const r = await api<{ layout: NestLayout; cat: CatRecord; mine: boolean; ownerName: string }>('GET', `/api/nest/${catId}`);
    if (r.mine) return this.openNest(catId);
    const scene = new NestScene(r.cat, r.layout, { say: (cat, ctx, info) => Promise.resolve(fallbackLine(ctx, { name: cat.name, p: cat.personality, ...info })), onPet: () => audio.purr(), onPlay: () => {} }, true);
    this.nest = scene;
    ui.set({ visiting: { catId, cat: r.cat, layout: r.layout, ownerName: r.ownerName }, scene: 'nest', panel: null, build: false, play: false });
    this.setScene(scene);
    if (r.cat.location === 'world') ui.set({ hint: `${r.cat.name}出门了，不过可以在门口留张纸条` });
    else ui.set({ hint: null });
  }

  async openWorld(focus?: string) {
    if (!this.world) this.world = new WorldScene(this);
    ui.set({ scene: 'world', panel: null, build: false, play: false, visiting: null, hint: null });
    this.nest?.setPlay(false);
    this.setScene(this.world);
    this.world.enter(focus);
  }

  private setScene(s: Scene) {
    this.scene = s;
    s.fit(this.view);
    this.input.handler = s.makeInput(this.view);
  }

  // ---------- loop ----------
  private frame(ts: number) {
    const dt = Math.min(0.05, (ts - this.last) / 1000 || 0.016);
    this.last = ts;
    this.T += dt;
    if (this.scene) {
      try {
        this.scene.update(dt, this.T);
        this.scene.draw(this.view, this.T);
      } catch (e) {
        console.error(e);
      }
    } else {
      const ctx = this.view.ctx;
      this.view.screen();
      ctx.fillStyle = '#f6eedf';
      ctx.fillRect(0, 0, this.view.w, this.view.h);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- speech ----------
  private lineCache = new Map<string, number>();
  async fetchLine(cat: CatRecord, ctx: SpeechCtx, info?: Record<string, string>): Promise<string> {
    const local = () => {
      const h = new Date().getHours();
      return fallbackLine(ctx, { name: cat.name, p: cat.personality, phase: phaseOf(h), ...info });
    };
    if (ui.state.visiting) return local();
    const key = ctx + JSON.stringify(info ?? {});
    const now = Date.now();
    if ((this.lineCache.get(key) ?? 0) > now) return local();
    this.lineCache.set(key, now + 4000);
    try {
      const q = new URLSearchParams({ ctx, ...(info ?? {}) });
      const r = await api<{ text: string }>('GET', `/api/cat/${cat.id}/line?${q}`);
      return r.text;
    } catch {
      return local();
    }
  }

  // ---------- actions ----------
  private actCool = new Map<string, number>();
  async act(catId: string, kind: string, item?: string) {
    const now = Date.now();
    if (kind !== 'feed' && (this.actCool.get(kind) ?? 0) > now) return;
    this.actCool.set(kind, now + 2500);
    try {
      const r = await api<{ stats: CatRecord['stats']; inventory: Record<string, number> }>('POST', `/api/cat/${catId}/act`, { kind, item });
      patchCat(catId, { stats: r.stats });
      ui.set((s) => ({ me: s.me ? { ...s.me, inventory: r.inventory } : s.me }));
      if (this.nest && this.nest.rec.id === catId) this.nest.rec.stats = r.stats;
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async feed(item: string) {
    const c = activeCat();
    if (!c || !this.nest) return;
    const def = ITEM_MAP[item];
    ui.set({ panel: null });
    this.nest.setPlay(false);
    ui.set({ play: false });
    this.nest.feed(item, def.name);
    audio.blip(660);
    await this.act(c.id, 'feed', item);
  }

  togglePlay() {
    if (!this.nest || ui.state.scene !== 'nest') return;
    const on = !ui.state.play;
    this.nest.setPlay(on);
    ui.set({ play: on, build: false });
    if (on) toast('移动鼠标或手指，逗逗它吧', '🪶', 2500);
  }

  callCat() {
    this.nest?.callCat();
    audio.blip(520);
  }

  // build mode
  startBuild() {
    if (!this.nest || ui.state.visiting) return;
    this.savedLayout = structuredClone(this.nest.layout);
    this.nest.setPlay(false);
    this.nest.setBuild(true);
    ui.set({ build: true, play: false, panel: null });
  }

  async finishBuild(save: boolean) {
    if (!this.nest) return;
    const c = activeCat();
    if (save && c) {
      try {
        await api('PUT', `/api/nest/${c.id}`, { layout: this.nest.layout });
        ui.set({ nest: structuredClone(this.nest.layout) });
        toast('新家布置好啦', '🏡');
        setTimeout(() => this.nest?.say('decor'), 800);
      } catch (e) {
        toast((e as Error).message);
        return;
      }
    } else if (this.savedLayout) this.nest.setLayout(this.savedLayout);
    this.nest.setBuild(false);
    ui.set({ build: false });
  }

  async buy(item: string, qty = 1) {
    try {
      const r = await api<{ fish: number; inventory: Record<string, number> }>('POST', '/api/shop/buy', { item, qty });
      ui.set((s) => ({ me: s.me ? { ...s.me, user: { ...s.me.user, fish: r.fish }, inventory: r.inventory } : s.me }));
      audio.coin();
      toast(`买到了「${ITEM_MAP[item].name}」`, '🛍️');
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    }
  }

  async sell(item: string, qty = 1) {
    try {
      const r = await api<{ got: number; fish: number; inventory: Record<string, number> }>('POST', '/api/shop/sell', { item, qty });
      ui.set((s) => ({ me: s.me ? { ...s.me, user: { ...s.me.user, fish: r.fish }, inventory: r.inventory } : s.me }));
      audio.coin();
      toast(`换到了 ${r.got} 条小鱼干`, '🐟');
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async setOutfit(outfit: string[]) {
    const c = activeCat();
    if (!c) return;
    try {
      const r = await api<CatRecord>('POST', `/api/cat/${c.id}/outfit`, { outfit });
      patchCat(c.id, { outfit: r.outfit });
      if (this.nest && this.nest.rec.id === c.id) {
        this.nest.cat.outfit = r.outfit;
        this.nest.rec.outfit = r.outfit;
      }
      this.world?.refreshOutfit(c.id, r.outfit);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  // ---------- world ----------
  goOut() {
    const c = activeCat();
    if (!c) return;
    this.ws.send({ t: 'enter', catId: c.id });
    patchCat(c.id, { location: 'world' });
    ui.set({ catOut: true });
    this.openWorld(c.id);
    audio.blip(740);
  }

  callHome() {
    const c = activeCat();
    if (!c) return;
    this.ws.send({ t: 'leave', catId: c.id });
    toast(`${c.name}听到你在叫它，往家走了`, '🏠');
  }

  async command(text: string) {
    const c = activeCat();
    if (!c) return;
    const where = ui.state.scene === 'world' && ui.state.catOut ? 'world' : 'nest';
    ui.set({ busy: true });
    try {
      const r = await api<{ action: string; place: string | null; reply: string }>('POST', `/api/cat/${c.id}/command`, { text, where });
      if (where === 'world') this.world?.command(r.action, r.place, r.reply);
      else {
        this.nest?.cat.say(r.reply, this.T);
        if (r.action === 'explore' || r.action === 'goto') this.goOut();
        else if (r.action === 'follow') this.goOut();
        else this.nest?.command(r.action);
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      ui.set({ busy: false });
    }
  }

  private onServer(m: ServerMsg) {
    this.world?.onServer(m);
    if (m.t === 'welcome' || m.t === 'online') ui.set({ online: m.t === 'welcome' ? m.online : m.n });
    if (m.t === 'event') {
      const icon = m.kind === 'find' ? '✨' : m.kind === 'friend' ? '💛' : m.kind === 'home' ? '🏠' : m.kind === 'gift' ? '🎁' : m.kind === 'discover' ? '🗺️' : '🐾';
      toast(m.text, icon, 4200);
      if (m.kind === 'find' || m.kind === 'gift') audio.sparkle();
      if (m.kind === 'home' || m.kind === 'discover' || m.kind === 'find' || m.kind === 'gift') this.refreshMe().catch(() => {});
      if (m.kind === 'home' && m.catId) {
        patchCat(m.catId, { location: 'nest' });
        const c = activeCat();
        if (c?.id === m.catId) {
          ui.set({ catOut: false, controlling: false });
          if (ui.state.scene === 'nest' && !ui.state.visiting) this.openNest();
        }
      }
    }
    if (m.t === 'spawn' && m.e.kind === 'cat') {
      const c = activeCat();
      if (c && m.e.id === c.id) ui.set({ catOut: true });
    }
  }

  get time() {
    return this.T;
  }

  hourNow() {
    return clockAt(Date.now(), -new Date().getTimezoneOffset() / 60).hour;
  }
}

export const game = new Game();
(window as any).__game = game;
