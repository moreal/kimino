import type { Addressing } from './note-content';
/** Raster types supported by the explicit ONI image authoring path. */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp';
/** A selected local image. Contents live only in the current session's memory. */
export interface ImageDraft {
  id: string;
  dataUrl: string;
  mediaType: ImageMediaType;
  bytes: number;
  alt: string;
}
export interface UploadedImage {
  id: string;
  url: string;
  mediaType: ImageMediaType;
}
export interface ImageAttachment extends UploadedImage {
  /** Exact audience of the confirmed upload, checked against the final Note. */
  audience: Addressing;
  alt: string;
}
export type ImageProblem = 'type' | 'size' | 'data' | 'count' | 'alt';
export const IMAGE_LIMITS = { count: 4, bytes: 5 * 1024 * 1024, alt: 1500 } as const;

/** Shared raster header policy for local uploads and explicitly loaded remote bytes. */
export function matchesImageHeader(
  bytes: readonly number[] | Uint8Array,
  mediaType: ImageMediaType,
): boolean {
  const starts = (signature: readonly number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  return mediaType === 'image/png'
    ? starts([137, 80, 78, 71, 13, 10, 26, 10])
    : mediaType === 'image/jpeg'
      ? starts([255, 216, 255])
      : starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8);
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Pure validation: no browser decoding, network access, or retained image bytes. */
export function validateImage(image: ImageDraft): ImageProblem | undefined {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType)) return 'type';
  if (!Number.isInteger(image.bytes) || image.bytes <= 0 || image.bytes > IMAGE_LIMITS.bytes)
    return 'size';
  if (image.alt.length > IMAGE_LIMITS.alt) return 'alt';
  const prefix = `data:${image.mediaType};base64,`;
  if (!image.dataUrl.startsWith(prefix)) return 'data';
  const encoded = image.dataUrl.slice(prefix.length);
  if (
    encoded.length > Math.ceil(IMAGE_LIMITS.bytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    return 'data';
  const raw = encoded.replace(/=+$/, '');
  const remainder = raw.length % 4;
  if (
    remainder === 1 ||
    (encoded.includes('=') &&
      (encoded.length % 4 !== 0 || encoded.length - raw.length !== (4 - remainder) % 4))
  )
    return 'data';
  if (Math.floor((raw.length * 3) / 4) !== image.bytes) return 'data';
  const last = BASE64.indexOf(raw.at(-1)!);
  if ((remainder === 2 && (last & 15) !== 0) || (remainder === 3 && (last & 3) !== 0))
    return 'data';
  // Decode only the header needed for MIME sniffing, avoiding a second full image buffer.
  const header: number[] = [];
  let bits = 0,
    count = 0;
  for (const char of raw.slice(0, 16)) {
    bits = (bits << 6) | BASE64.indexOf(char);
    count += 6;
    if (count >= 8) {
      count -= 8;
      header.push((bits >> count) & 255);
    }
  }
  if (!matchesImageHeader(header, image.mediaType)) return 'data';
  return undefined;
}
export function validateImages(images: readonly ImageDraft[]): ImageProblem | undefined {
  if (images.length > IMAGE_LIMITS.count) return 'count';
  for (const image of images) {
    const problem = validateImage(image);
    if (problem) return problem;
  }
  return undefined;
}
