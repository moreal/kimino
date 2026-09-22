import type { ImageMediaType } from '../domain/images';

/** Encoded raster bytes; adapters never return a remote URL as a loaded resource. */
export interface ReadImage {
  bytes: Uint8Array;
  mediaType: ImageMediaType;
}
export interface ImageReadTarget {
  url: string;
  mediaType?: string;
}
export interface ImageReadGateway {
  load(target: ImageReadTarget, signal: AbortSignal): Promise<ReadImage>;
}
