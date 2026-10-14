import { useMemo, useState } from 'preact/hooks';
import { game } from '../game/game';
import { toast } from '../game/state';
import { LiveCat } from './LiveCat';
import { randomGenes, randomPersonality, coatName, traitWords, CAT_NAMES } from '../../../shared/genes';
import { audio } from '../game/audio';
import { hash3 } from '../../../shared/rng';

export function Welcome() {
  const [mode, setMode] = useState<'start' | 'name' | 'code'>('start');
  const [nick, setNick] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const heroGenes = useMemo(() => randomGenes((Date.now() / 86400000) | 0), []);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="onboard">
      <div style={{ width: 'min(280px, 80vw)' }}>
        <LiveCat genes={heroGenes} height={190} cycle={['sit', 'groom', 'loaf', 'sit_happy', 'knead']} age={0.6} />
      </div>
      <h1>猫窝</h1>
      <p class="sub">
        一只只属于你的小猫，一个只属于它的小窝。
        <br />
        窝外面，是一整个热闹又温柔的猫猫小镇。
      </p>
      {mode === 'start' && (
        <div class="actions">
          <button class="btn primary" onClick={() => (audio.unlock(), setMode('name'))}>
            开始养猫
          </button>
          <button class="btn" onClick={() => setMode('code')}>
            我有找回码
          </button>
        </div>
      )}
      {mode === 'name' && (
        <div class="actions">
          <input class="field" maxLength={12} placeholder="猫猫要怎么称呼你？（可不填）" value={nick} onInput={(e) => setNick((e.target as HTMLInputElement).value)} />
          <button class="btn primary" disabled={busy} onClick={() => run(() => game.register(nick.trim() || '铲屎官'))}>
            去领养一只小猫
          </button>
          <button class="btn ghost" onClick={() => setMode('start')}>
            返回
          </button>
        </div>
      )}
      {mode === 'code' && (
        <div class="actions">
          <input class="field" placeholder="XXXX-XXXX-XXXX" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
          <button class="btn primary" disabled={busy || code.length < 8} onClick={() => run(() => game.login(code))}>
            回到我的猫窝
          </button>
          <button class="btn ghost" onClick={() => setMode('start')}>
            返回
          </button>
        </div>
      )}
    </div>
  );
}

export function Adopt() {
  const [batch, setBatch] = useState(() => Math.floor(Math.random() * 1e6));
  const seeds = useMemo(() => Array.from({ length: 4 }, (_, i) => (hash3(batch, i, 77) % 2147483646) + 1), [batch]);
  const [sel, setSel] = useState(0);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const suggest = useMemo(() => {
    const arr = [...CAT_NAMES].sort(() => Math.random() - 0.5);
    return arr.slice(0, 6);
  }, [batch]);
  const genes = seeds.map((s) => randomGenes(s));
  const pers = seeds.map((s) => randomPersonality(s));
  const go = async () => {
    setBusy(true);
    try {
      await game.adopt(name.trim() || suggest[0], seeds[sel]);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="onboard">
      <h1 style={{ fontSize: '26px', letterSpacing: '1px' }}>谁会是你的猫猫？</h1>
      <p class="sub">它们都还是小奶猫，会在接下来的日子里慢慢长大。</p>
      <div class="kittens">
        {genes.map((g, i) => (
          <div key={seeds[i]} class={`card kitten ${sel === i ? 'sel' : ''}`} onClick={() => setSel(i)}>
            <LiveCat genes={g} height={120} age={0.3} cycle={i % 2 ? ['sit', 'loaf', 'groom'] : ['sit_happy', 'sit', 'knead']} />
            <div class="k-name">{coatName(g)}</div>
            <div class="k-traits">
              {traitWords(pers[i]).slice(0, 2).join(' · ')}
              <br />
              {pers[i].quirk}
            </div>
          </div>
        ))}
      </div>
      <button class="btn ghost small" style={{ marginTop: '8px' }} onClick={() => setBatch((b) => b + 1)}>
        再看看别的小猫
      </button>
      <div class="actions" style={{ marginTop: '6px' }}>
        <input class="field" maxLength={8} placeholder={`给它起个名字，比如「${suggest[0]}」`} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <div class="names">
          {suggest.map((n) => (
            <button key={n} onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
        <button class="btn primary" disabled={busy} onClick={go}>
          带它回家
        </button>
      </div>
    </div>
  );
}
