import type {
  Attachment,
  AttachmentKind,
  ComposeVisibility,
  TimelineNote,
  Visibility,
} from '../domain/social';
import { clampVisibility, isWiderThan, replyLimit } from '../domain/note-content';
import {
  attachmentCopy,
  attachmentKindCopy,
  contentWarningPrefix,
  replyLimitHint,
  shareScopeCopy,
  unlistedOptionLabel,
  visibilityBadge,
  visibilityCopy,
  visibilityIndicator,
} from './copy-content';

type VisibilityIcon = 'globe' | 'moon' | 'lock' | 'envelope' | 'question';
interface VisibilityInfo {
  label: string;
  description: string;
  icon: VisibilityIcon;
}
const ICON: Record<Visibility, VisibilityIcon> = {
  public: 'globe',
  unlisted: 'moon',
  followers: 'lock',
  direct: 'envelope',
  unknown: 'question',
};
const VISIBILITY: Record<Visibility, VisibilityInfo> = Object.fromEntries(
  (Object.keys(ICON) as Visibility[]).map((visibility) => [
    visibility,
    { ...visibilityCopy[visibility], icon: ICON[visibility] },
  ]),
) as Record<Visibility, VisibilityInfo>;
export const visibilityInfo = (visibility: Visibility): VisibilityInfo => VISIBILITY[visibility];
/** Full accessible text for the indicator on a note: "팔로워만 공개". */
export const visibilityText = (visibility: Visibility): string => visibilityIndicator[visibility];
/**
 * The badge on a card: one short word beside the icon, plus the full sentence for readers.
 * The word is the highest-stakes thing on a note, so it is never left to a glyph alone.
 */
export const visibilityWord = (visibility: Visibility): string => visibilityBadge[visibility];
/** Composer choices in widest-to-narrowest order, with the picker's short labels. */
export const visibilityOptions: { value: ComposeVisibility; label: string; description: string }[] =
  [
    { value: 'public', ...visibilityCopy.public },
    {
      value: 'unlisted',
      label: unlistedOptionLabel,
      description: visibilityCopy.unlisted.description,
    },
    { value: 'followers', ...visibilityCopy.followers },
    { value: 'direct', ...visibilityCopy.direct },
  ];

interface ReplyVisibility {
  /** What a reply starts with: the parent's visibility (direct when it is unclear). */
  initial: ComposeVisibility;
  /** Options wider than the parent cannot be picked. */
  disabled: ComposeVisibility[];
  /** Explains the disabled options; empty when nothing is disabled. */
  hint: string;
}
export function replyVisibility(parent?: TimelineNote): ReplyVisibility {
  if (!parent) return { initial: 'public', disabled: [], hint: '' };
  const limit = replyLimit(parent.visibility);
  const disabled = visibilityOptions
    .map((option) => option.value)
    .filter((value) => isWiderThan(value, limit));
  const hint =
    disabled.length === 0
      ? ''
      : parent.visibility === 'direct'
        ? replyLimitHint.direct
        : parent.visibility === 'unknown'
          ? replyLimitHint.unknown
          : replyLimitHint.narrower(visibilityCopy[parent.visibility].label);
  return { initial: limit, disabled, hint };
}
/**
 * The visibility a composer actually sends: `requested` (a persisted or stale choice) narrowed
 * by the same domain rule the session applies, so the picker and the outgoing note agree.
 */
export function effectiveReplyVisibility(
  requested: ComposeVisibility,
  parent?: TimelineNote,
): ComposeVisibility {
  return clampVisibility(requested, parent?.visibility);
}

/**
 * What sharing this note will actually do, said on the card before the control is used.
 * Empty for a public note, where the share reaches the same people the note already did.
 */
export const shareScope = (visibility: Visibility): string => shareScopeCopy[visibility];

/**
 * The warning a reply starts with: the parent's own, carried forward unchanged so a warned
 * conversation stays warned. No prefix is added, and the writer can edit or remove it.
 */
export function replyWarning(parent?: Pick<TimelineNote, 'summary'>): string {
  return parent?.summary?.trim() ?? '';
}

export const attachmentKindLabel = (kind: AttachmentKind): string => attachmentKindCopy[kind];
/** "이미지 2개 · 동영상 1개" in a fixed kind order; empty when there is nothing. */
export function attachmentSummary(attachments: Attachment[]): string {
  const order: AttachmentKind[] = ['image', 'video', 'audio', 'document'];
  return order
    .map((kind) => [kind, attachments.filter((a) => a.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => attachmentCopy.count(attachmentKindCopy[kind], count))
    .join(' · ');
}
/** The alt text shown for an attachment, or the explicit "none" marker. */
export function attachmentAlt(attachment: Attachment): string {
  return attachment.alt || attachmentCopy.noAlt;
}
/** Button/link label for opening one attachment: "이미지 불러오기" or "동영상 열기". */
export function attachmentAction(kind: AttachmentKind): string {
  return kind === 'image'
    ? attachmentCopy.loadImage
    : attachmentCopy.open(attachmentKindCopy[kind]);
}

/** The content warning line: the author's summary itself, prefixed so it reads as a warning. */
export function contentWarningLabel(summary: string): string {
  return contentWarningPrefix(summary.trim());
}
export const hasContentWarning = (note: Pick<TimelineNote, 'summary'>): boolean =>
  !!note.summary && note.summary.trim().length > 0;
