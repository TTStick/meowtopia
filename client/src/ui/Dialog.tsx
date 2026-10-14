// Small in-game dialogs instead of the browser's confirm()/prompt(): they match the
// game's look, speak Chinese everywhere (the iOS app's native alerts don't), and
// can ask for a typed confirmation.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Store, useStore } from '../game/store';

interface Ask {
  text: string;
  ok?: string;
  cancel?: string;
  danger?: boolean;
  input?: { placeholder?: string; mustEqual?: string };
  resolve: (v: string | null) => void;
}

const dialogs = new Store<{ ask: Ask | null }>({ ask: null });

function open(a: Omit<Ask, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    dialogs.state.ask?.resolve(null); // only one at a time
    dialogs.set({ ask: { ...a, resolve } });
  });
}

/** Yes/no question. */
export async function confirmBox(text: string, opts: { ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
  return (await open({ text, ...opts })) !== null;
}

/** Free text (or a word the player must type to confirm); null if cancelled. */
export function promptBox(text: string, input: { placeholder?: string; mustEqual?: string } = {}, opts: { ok?: string; danger?: boolean } = {}): Promise<string | null> {
  return open({ text, input, ...opts });
}

export function DialogHost() {
  const ask = useStore(dialogs, (s) => s.ask);
  const [value, setValue] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue('');
    if (ask?.input) setTimeout(() => field.current?.focus(), 50);
  }, [ask]);
  if (!ask) return null;
  const close = (v: string | null) => {
    dialogs.set({ ask: null });
    ask.resolve(v);
  };
  const blocked = !!ask.input?.mustEqual && value.trim() !== ask.input.mustEqual;
  return (
    <div class="scrim dialog-scrim" onClick={(e) => e.target === e.currentTarget && close(null)}>
      <div class="dialog" role="alertdialog" aria-modal="true">
        <p>{ask.text}</p>
        {ask.input && (
          <input
            ref={field}
            class="field"
            placeholder={ask.input.placeholder ?? ''}
            value={value}
            maxLength={100}
            onInput={(e) => setValue((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && !blocked && close(value)}
          />
        )}
        <div class="dialog-actions">
          <button class="btn ghost" onClick={() => close(null)}>
            {ask.cancel ?? '取消'}
          </button>
          <button class={`btn ${ask.danger ? 'danger' : 'primary'}`} disabled={blocked} onClick={() => close(ask.input ? value : '')}>
            {ask.ok ?? '好的'}
          </button>
        </div>
      </div>
    </div>
  );
}
