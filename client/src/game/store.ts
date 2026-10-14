import { useEffect, useState } from 'preact/hooks';

type Listener = () => void;

export class Store<T extends object> {
  state: T;
  private ls = new Set<Listener>();
  constructor(init: T) {
    this.state = init;
  }
  set(patch: Partial<T> | ((s: T) => Partial<T>)) {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.ls.forEach((l) => l());
  }
  subscribe(l: Listener) {
    this.ls.add(l);
    return () => this.ls.delete(l);
  }
}

export function useStore<T extends object, R>(store: Store<T>, sel: (s: T) => R): R {
  const [v, setV] = useState(() => sel(store.state));
  useEffect(() => {
    const check = () => {
      const nv = sel(store.state);
      setV((ov) => (Object.is(ov, nv) ? ov : nv));
    };
    check();
    return store.subscribe(check);
  }, [store]);
  return v;
}
