import { createContext, useContext } from 'solid-js';
import type { ReadImage } from '../../application/image-reader';

export interface ImageReadContextValue {
  enabled(): boolean;
  identity(): unknown;
  load(noteId: string, url: string, signal: AbortSignal): Promise<ReadImage>;
}
export const ImageReadContext = createContext<ImageReadContextValue>();
export const useImageRead = () => useContext(ImageReadContext);
/** Object URLs belong to the browser bridge, never the session or persistence. */
export function createImageObjectUrl(image: ReadImage) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(image.bytes)], { type: image.mediaType }),
  );
  return { url, release: () => URL.revokeObjectURL(url) };
}
