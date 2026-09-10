import { contentCopy } from '../presentation/copy';
import { contentWarningLabel } from '../presentation/note-body';
import Icon from './Icons';

/**
 * The bar a content warning puts in front of a note's words: the warning itself, and one
 * control that opens or closes what is behind it. The same gate stands on the card and on
 * the parent quoted in a reply composer, so neither walks past a warning the reader has not
 * opened. The body it guards is the caller's: it draws it only while `expanded` is on.
 */
export default function WarningGate(props: {
  summary: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div class="content-warning">
      <p class="content-warning-label">
        <Icon name="warning" class="icon--sm" />
        {contentWarningLabel(props.summary)}
      </p>
      <button
        type="button"
        class="content-warning-toggle"
        aria-expanded={props.expanded ? 'true' : 'false'}
        onClick={() => props.onToggle()}
      >
        {props.expanded ? contentCopy.hideContent : contentCopy.showContent}
      </button>
    </div>
  );
}
