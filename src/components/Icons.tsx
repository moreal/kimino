/**
 * The one line icon set (24 viewBox, currentColor). Two rendering sizes only: the 20px
 * default for action rows and navigation, and `icon--sm` (16px) for meta lines and badges;
 * the stroke is widened at 16px in CSS so both read at the same weight. Icons are
 * decorative: every button that shows one alone carries hidden or aria-label text.
 */
export type IconName =
  | 'home'
  | 'reply'
  | 'person'
  | 'bookmark'
  | 'search'
  | 'refresh'
  | 'heart'
  | 'repeat'
  | 'chat-stack'
  | 'corner-down-right'
  | 'external'
  | 'close'
  | 'plus'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'log-out'
  | 'globe'
  | 'sparkle'
  | 'warning'
  | 'rows'
  | 'more'
  | 'filter'
  | 'moon'
  | 'lock'
  | 'envelope'
  | 'question'
  | 'pencil'
  | 'trash'
  | 'image'
  | 'video'
  | 'audio'
  | 'document';

const paths: Record<IconName, string> = {
  home: 'M4 11 12 4l8 7M6 10v10h5v-5h2v5h5V10',
  reply: 'M8 9h8M8 13h5M5 19l1-4a8 8 0 1 1 3 3z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  bookmark: 'M6 4h12v16l-6-4-6 4z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  refresh: 'M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  repeat: 'M17 3l3 3-3 3M20 6H9a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h11a4 4 0 0 0 4-4v-1',
  /* Two stacked bubbles: a conversation, told apart from the single bubble of a reply. */
  'chat-stack':
    'M3 9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8l-5 3zM8 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2',
  'corner-down-right': 'M5 5v6a3 3 0 0 0 3 3h11M15 10l4 4-4 4',
  external: 'M7 17 17 7M9 7h8v8',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  'log-out': 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  sparkle: 'M12 3v18M3 12h18M6 6l12 12M18 6 6 18',
  warning: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',
  rows: 'M4 7h16M4 12h16M4 17h16',
  /* Three dots: the folded 관리 disclosure on a narrow card. */
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  envelope: 'M4 6h16v12H4zM4 7l8 6 8-6',
  question:
    'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  pencil: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z',
  trash: 'M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  video: 'M4 6h12v12H4zM16 10l4-2v8l-4-2',
  audio:
    'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  document: 'M7 3h7l5 5v13H7zM14 3v5h5M9.5 13h5M9.5 17h5',
};

export default function Icon(props: { name: IconName; filled?: boolean; class?: string }) {
  return (
    <svg
      class={props.class ? `icon ${props.class}` : 'icon'}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={props.filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[props.name]} />
    </svg>
  );
}
