import { IMAGE_LIMITS, validateImage, validateImages } from '../domain/images';
import type { ImageDraft, ImageMediaType, ImageProblem } from '../domain/images';
import type { ComposeVisibility } from '../domain/social';

export const imageLimits = IMAGE_LIMITS;
export const imageAccept = 'image/png,image/jpeg,image/webp';

export function imageMediaType(value: string): ImageMediaType | undefined {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
    ? value
    : undefined;
}

export function imageAudienceAllowed(visibility: ComposeVisibility, privateMedia = false): boolean {
  return visibility === 'public' || visibility === 'unlisted' || privateMedia;
}

/** Reject oversized or unsupported files before reading their contents into memory. */
export function imageFileProblem(file: { type: string; size: number }): ImageProblem | undefined {
  if (!imageMediaType(file.type)) return 'type';
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > IMAGE_LIMITS.bytes)
    return 'size';
  return undefined;
}

export function imageDraftProblem(image: ImageDraft): ImageProblem | undefined {
  return validateImage(image);
}

export function imageSelectionProblem(images: readonly ImageDraft[]): ImageProblem | undefined {
  return validateImages(images);
}

/** Never let even a malformed restored draft turn a preview into a remote request. */
export function localImagePreview(image: ImageDraft): string | undefined {
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl)
    ? image.dataUrl
    : undefined;
}
