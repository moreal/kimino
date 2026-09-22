import type { ImageDraft, ImageMediaType, UploadedImage } from '../domain/images';
import type { Addressing } from '../domain/note-content';
/** Fulfilment means Image Create was confirmed, even when readback is unresolved. */
export interface ImageUploadReceipt {
  location?: string;
  image?: UploadedImage;
}
export interface ImageGateway {
  upload(image: ImageDraft, audience: Addressing): Promise<ImageUploadReceipt>;
  /** Read-only recovery of a confirmed upload; never resends Create. */
  resolve(
    location: string,
    mediaType: ImageMediaType,
    audience: Addressing,
  ): Promise<UploadedImage>;
}
export interface ImageUploadState {
  phase: 'uploading' | 'ready' | 'unresolved' | 'uncertain';
  location?: string;
  image?: UploadedImage;
}
