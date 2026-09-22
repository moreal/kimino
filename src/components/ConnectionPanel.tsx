import { createSignal, For, Show, untrack } from 'solid-js';
import { connectionCopy as text, copy, DEV_SERVER_URL } from '../presentation/copy';
import FailureAlert from './FailureAlert';
import { mediaCopy } from '../presentation/copy-media';
import Icon from './Icons';

/**
 * Landing: a read-only preview first, then a clearly separated connection form.
 * The compatibility note lives in the landing aside (App renders it).
 */
export default function ConnectionPanel(props: {
  initialUrl: string;
  busy: boolean;
  error: string;
  errorDetail?: string;
  /** `remember` opts this tab into sessionStorage persistence; the default is memory only. */
  onConnect: (url: string, token: string, remember: boolean, mediaMode?: 'oni') => void;
  onExplore: () => void;
}) {
  const [url, setUrl] = createSignal(untrack(() => props.initialUrl));
  const [token, setToken] = createSignal('');
  const [remember, setRemember] = createSignal(false);
  const [mediaEnabled, setMediaEnabled] = createSignal(false);
  return (
    <section class="connection-panel">
      <h1>{text.tagline}</h1>
      <p class="welcome-description">{text.taglineHelp}</p>
      <div class="welcome-preview">
        <button
          type="button"
          class="primary-button explore-button"
          onClick={props.onExplore}
          disabled={props.busy}
        >
          {copy.exploreLabel} <Icon name="arrow-right" />
        </button>
        <p class="field-help">{text.previewHelp}</p>
      </div>
      <form
        class="connection-form"
        aria-labelledby="connection-heading"
        onSubmit={(event) => {
          event.preventDefault();
          props.onConnect(
            url().trim(),
            token().trim(),
            remember(),
            mediaEnabled() ? 'oni' : undefined,
          );
        }}
      >
        <h2 id="connection-heading" class="connection-heading">
          {text.accountHeading}
        </h2>
        <label>
          <span id="actor-url-label">{text.actorUrlLabel}</span>
          <input
            type="url"
            aria-labelledby="actor-url-label"
            aria-describedby="actor-url-help"
            required
            value={url()}
            onInput={(event) => setUrl(event.currentTarget.value)}
            placeholder={text.actorUrlPlaceholder}
            disabled={props.busy}
            autocomplete="url"
          />
          {/* Under the field, not between label and field: the answer comes after the ask. */}
          <span id="actor-url-help" class="field-help field-help--inline">
            {text.actorUrlHelp}
          </span>
        </label>
        <label>
          {text.tokenLabel}
          <input
            type="password"
            value={token()}
            onInput={(event) => setToken(event.currentTarget.value)}
            placeholder={text.tokenPlaceholder}
            disabled={props.busy}
            autocomplete="off"
          />
        </label>
        <div class="remember-field">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={remember()}
              onChange={(event) => setRemember(event.currentTarget.checked)}
              disabled={props.busy}
            />
            <span>{text.remember}</span>
          </label>
          <p class="field-help">{remember() ? text.rememberHelp : text.tokenMemory}</p>
        </div>
        <details class="connection-capabilities">
          <summary>{mediaCopy.connectionOptions}</summary>
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={mediaEnabled()}
              disabled={props.busy}
              onChange={(event) => setMediaEnabled(event.currentTarget.checked)}
            />
            <span>{mediaCopy.enable}</span>
          </label>
          <p class="field-help">{mediaCopy.enableHelp}</p>
        </details>
        <Show when={props.error}>
          <FailureAlert
            heading={text.connectFailed}
            lines={[props.error, text.connectFailedHelp]}
            detail={props.errorDetail}
          />
        </Show>
        <div class="connection-actions">
          <button class="primary-button" disabled={props.busy} type="submit">
            {props.busy ? text.connecting : text.connect} <Icon name="arrow-right" />
          </button>
        </div>
      </form>
      <details class="setup-help preview-privacy">
        <summary>{text.previewPrivacy}</summary>
        <p>{text.exploreHelp}</p>
      </details>
      <details class="setup-help">
        <summary>{text.developerSummary}</summary>
        <ol>
          <For each={text.developerSteps}>
            {(step) => (
              <li>
                <For each={step}>
                  {(part) =>
                    typeof part === 'string' ? (
                      part
                    ) : 'code' in part ? (
                      <code>{part.code}</code>
                    ) : (
                      <a href={DEV_SERVER_URL} target="_blank" rel="noopener noreferrer">
                        {part.link}
                        <Icon name="external" class="icon--sm icon--trail" />
                      </a>
                    )
                  }
                </For>
              </li>
            )}
          </For>
        </ol>
      </details>
    </section>
  );
}
