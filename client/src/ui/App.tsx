import { useEffect, useRef } from 'preact/hooks';
import { ui } from '../game/state';
import { useStore } from '../game/store';
import { game } from '../game/game';
import { audio } from '../game/audio';
import { Welcome, Adopt } from './Onboarding';
import { TopBar, Hint, Toasts, NestBar, WorldBar, VisitBar, BuildTray, ConnBadge, WishPill, GoodnightOverlay } from './Hud';
import { Panels } from './Panels';
import { DialogHost } from './Dialog';

export function App() {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useStore(ui, (s) => s.phase);
  const scene = useStore(ui, (s) => s.scene);
  const build = useStore(ui, (s) => s.build);
  const visiting = useStore(ui, (s) => s.visiting);
  const me = useStore(ui, (s) => s.me);
  useEffect(() => {
    void game.boot(ref.current!);
    // Audio may only start inside a user activation. On touch screens that is the
    // end of a tap (pointerup / touchend), not pointerdown.
    const kinds = ['pointerup', 'touchend', 'keydown'] as const;
    const unlock = () => {
      audio.unlock();
      for (const k of kinds) window.removeEventListener(k, unlock);
    };
    for (const k of kinds) window.addEventListener(k, unlock, { passive: true });
  }, []);
  useEffect(() => {
    if (!me) return;
    audio.sound = me.user.settings.sound;
    audio.music = me.user.settings.music;
  }, [me?.user.settings.sound, me?.user.settings.music]);
  return (
    <>
      <canvas ref={ref} class="game" />
      {phase === 'loading' && (
        <div class="onboard">
          <p class="muted">猫猫正在伸懒腰…</p>
        </div>
      )}
      {phase === 'welcome' && <Welcome />}
      {phase === 'adopt' && <Adopt />}
      {phase === 'game' && (
        <>
          <TopBar />
          {!build && <WishPill />}
          <Hint />
          <GoodnightOverlay />
          {build ? <BuildTray /> : visiting ? <VisitBar /> : scene === 'world' ? <WorldBar /> : <NestBar />}
          <ConnBadge />
          <Panels />
        </>
      )}
      <Toasts />
      <DialogHost />
    </>
  );
}
