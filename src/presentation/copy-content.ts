import type { AttachmentKind, Visibility } from '../domain/social';

/**
 * Every word a reader sees about a note's audience, attachments and content warning, in one
 * place like `copy-failures.ts`; `note-body.ts` holds the rules and carries no Korean itself.
 */
export interface VisibilityCopy {
  label: string;
  description: string;
}
export const visibilityCopy: Record<Visibility, VisibilityCopy> = {
  public: { label: '공개', description: '누구나 볼 수 있어요' },
  unlisted: {
    label: '조용히 공개',
    description: '누구나 볼 수 있지만 공개 타임라인에는 오르지 않아요',
  },
  followers: { label: '팔로워만', description: '나를 팔로우하는 사람만 볼 수 있어요' },
  direct: { label: '다이렉트', description: '답글 상대에게만 보내요' },
  unknown: {
    label: '제한된 공개',
    description: '공개 글이 아니에요. 정확한 범위는 서버만 알아요',
  },
};
/** Full accessible text for the indicator on a note: "팔로워만 공개". */
export const visibilityIndicator: Record<Visibility, string> = {
  public: '공개',
  unlisted: '조용히 공개 · 미등록',
  followers: '팔로워만 공개',
  direct: '다이렉트',
  unknown: '제한된 공개',
};
/** The one short word on a card's badge beside the icon. */
export const visibilityBadge: Record<Visibility, string> = {
  public: '공개',
  unlisted: '조용히',
  followers: '팔로워만',
  direct: '다이렉트',
  unknown: '제한됨',
};
/** The picker's label for the unlisted choice, which spells out what it means. */
export const unlistedOptionLabel = '조용히 공개(미등록)';
/** Why a reply's wider visibility choices are disabled. */
export const replyLimitHint = {
  direct: '원글이 다이렉트라서 답글도 다이렉트로만 보내요.',
  unknown:
    '원글의 공개 범위를 알 수 없어서 답글은 원글 작성자와 언급된 사람에게만 다이렉트로 보내요.',
  narrower: (parentLabel: string) => `원글이 ${parentLabel} 글이라서 그보다 넓게 공개할 수 없어요.`,
};
/** What sharing a non-public note will actually do; empty for a public note. */
export const shareScopeCopy: Record<Visibility, string> = {
  public: '',
  unlisted: '조용히 공개된 글이라 공유해도 공개 타임라인에는 오르지 않아요.',
  followers: '팔로워만 공개 글이라 팔로워에게만 공유돼요.',
  direct: '다이렉트 글이라 공유해도 이 대화에 있는 사람에게만 전해져요.',
  unknown: '공개 범위를 알 수 없는 글이라 작성자에게만 공유돼요.',
};
export const attachmentKindCopy: Record<AttachmentKind, string> = {
  image: '이미지',
  video: '동영상',
  audio: '오디오',
  document: '파일',
};
export const attachmentCopy = {
  /** "이미지 2개" */
  count: (kind: string, count: number) => `${kind} ${count}개`,
  noAlt: '대체 텍스트 없음',
  loadImage: '이미지 불러오기',
  /** "동영상 열기" */
  open: (kind: string) => `${kind} 열기`,
};
/** The content warning line: the author's summary itself, prefixed so it reads as a warning. */
export const contentWarningPrefix = (summary: string) => `주의: ${summary}`;
