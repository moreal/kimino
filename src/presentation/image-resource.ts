import type { ReadImage } from '../application/image-reader';

export type ImageResourceState = {
  phase: 'hidden' | 'loading' | 'ready' | 'failed';
  url?: string;
};

/** The owner releases this local resource; a remote URL is never used as a fallback. */
export interface ImageResource {
  url: string;
  release(): void;
}

export interface ImageResourcePort {
  createResource(image: ReadImage): ImageResource;
}

export interface ImageResourceOptions extends ImageResourcePort {
  load(signal: AbortSignal): Promise<ReadImage>;
  update(state: ImageResourceState): void;
}

/** An explicit read and its local resource, independent of rendering and browser APIs. */
export function createImageResource({ load, createResource, update }: ImageResourceOptions) {
  let phase: ImageResourceState['phase'] = 'hidden';
  let generation = 0;
  let disposed = false;
  let cancellation: AbortController | undefined;
  let resource: ImageResource | undefined;

  function publish(next: ImageResourceState) {
    phase = next.phase;
    update(next);
  }

  function cancel() {
    generation++;
    const pending = cancellation;
    cancellation = undefined;
    pending?.abort();
  }

  function release() {
    const previous = resource;
    resource = undefined;
    previous?.release();
  }

  return {
    async show(): Promise<void> {
      if (disposed || phase === 'loading' || phase === 'ready') return;
      const current = ++generation;
      const controller = new AbortController();
      cancellation = controller;
      const active = () => !disposed && generation === current;
      publish({ phase: 'loading' });
      if (!active()) return;
      try {
        const image = await load(controller.signal);
        if (!active()) return;
        const allocated = createResource(image);
        // A resource port can synchronously cause the owner to close the view.
        if (!active()) {
          allocated.release();
          return;
        }
        resource = allocated;
        publish({ phase: 'ready', url: allocated.url });
      } catch {
        if (active()) {
          release();
          publish({ phase: 'failed' });
        }
      } finally {
        if (active()) cancellation = undefined;
      }
    },
    hide() {
      if (disposed) return;
      cancel();
      release();
      if (phase !== 'hidden') publish({ phase: 'hidden' });
    },
    /** A decode error belongs only to the currently displayed local URL. */
    failed(url?: string) {
      if (disposed || phase !== 'ready' || !resource) return;
      if (url !== undefined && resource.url !== url) return;
      cancel();
      release();
      publish({ phase: 'failed' });
    },
    /** Teardown releases memory without calling a view that is itself being disposed. */
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      release();
    },
  };
}
