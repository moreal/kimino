import { createSignal, For, Show, untrack } from 'solid-js';
import { connectionCopy as text, copy, DEV_SERVER_URL } from '../presentation/copy';
import FailureAlert from './FailureAlert';
import Icon from './Icons';

/**
 * Landing: one line of promise, then the connect form and the preview button as the
 * visual centre. The compatibility note lives in the landing aside (App renders it).
 */
export default function ConnectionPanel(props: {
  initialUrl: string;
  busy: boolean;
  error: string;
  errorDetail?: string;
  /** `remember` opts this tab into sessionStorage persistence; the default is memory only. */
  onConnect: (url: string, token: string, remember: boolean) => void;
  onExplore: () => void;
}) {
  const [url, setUrl] = createSignal(untrack(() => props.initialUrl));
  const [token, setToken] = createSignal('');
  const [remember, setRemember] = createSignal(false);
  return (
    <section class="connection-panel">
      <h1>{text.tagline}</h1>
      <p class="welcome-description">{text.taglineHelp}</p>
      <form
        class="connection-form"
        aria-labelledby="connection-heading"
        onSubmit={(event) => {
          event.preventDefault();
          props.onConnect(url().trim(), token().trim(), remember());
        }}
      >
        <h2 id="connection-heading" class="connection-heading">
          {text.accountHeading}
        </h2>
        <label>
          {text.actorUrlLabel}
          <input
            type="url"
            required
            value={url()}
            onInput={(event) => setUrl(event.currentTarget.value)}
            placeholder={text.actorUrlPlaceholder}
            disabled={props.busy}
            autocomplete="url"
          />
          {/* Under the field, not between label and field: the answer comes after the ask. */}
          <span class="field-help field-help--inline">{text.actorUrlHelp}</span>
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
          <button
            type="button"
            class="secondary-button explore-button"
            onClick={props.onExplore}
            disabled={props.busy}
          >
            {copy.exploreLabel} <Icon name="arrow-right" />
          </button>
        </div>
        <p class="field-help">{text.exploreHelp}</p>
      </form>
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
