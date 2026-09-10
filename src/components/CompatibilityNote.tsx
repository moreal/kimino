import { connectionCopy as text } from '../presentation/copy';
import Icon from './Icons';

/** Who can sign in: the honest C2S requirement, shown wherever the connect form is. */
export default function CompatibilityNote() {
  return (
    <div class="compatibility-note">
      <strong>{text.needsC2s}</strong>
      <p>{text.whatIsC2s}</p>
      <p>{text.mastodon}</p>
      <p>
        {text.whereLead}{' '}
        <a href={text.oniUrl} target="_blank" rel="noopener noreferrer">
          {text.oniLink}
          <Icon name="external" class="icon--sm icon--trail" />
        </a>
        {' · '}
        <a href={text.specUrl} target="_blank" rel="noopener noreferrer">
          {text.specLink}
          <Icon name="external" class="icon--sm icon--trail" />
        </a>
      </p>
    </div>
  );
}
