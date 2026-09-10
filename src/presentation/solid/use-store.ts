import { createSignal, onSettled } from 'solid-js';

interface Store<T> {
  getSnapshot(): T;
  subscribe(listener: (value: T) => void): () => void;
}
/** The only bridge from framework-independent state into Solid reactivity. */
export function useStore<T extends object>(store: Store<T>, dispose?: () => void) {
  const [state, setState] = createSignal<T>(store.getSnapshot() as Exclude<T, Function>);
  onSettled(() => {
    const unsubscribe = store.subscribe((value) => setState(() => value));
    return () => {
      unsubscribe();
      dispose?.();
    };
  });
  return state;
}
