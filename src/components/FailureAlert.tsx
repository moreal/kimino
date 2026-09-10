import { For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { failureDetailSummary } from '../presentation/copy-failures';

/**
 * A failure said in the page: a heading, one or more plain sentences, and - when the
 * gateway left a technical reason - that reason behind a disclosure, so the sentence stays
 * plain and the detail is one press away. The page header, the connect form and every
 * composer draw their failure with this one shape.
 */
export default function FailureAlert(props: {
  heading: string;
  /** The plain sentences, one paragraph each. */
  lines: readonly string[];
  detail?: string;
  /** Extra classes on the alert (a composer's sits in flow under its buttons). */
  class?: string;
  /** A focus target for the owner that scrolls the alert into view. */
  ref?: (el: HTMLElement) => void;
  /** A control at the corner of the alert: the header's dismiss button. */
  action?: () => JSX.Element;
}) {
  return (
    <div
      role="alert"
      class={props.class ? `page-error ${props.class}` : 'page-error'}
      tabindex={props.ref ? -1 : undefined}
      ref={(el) => props.ref?.(el)}
    >
      <strong>{props.heading}</strong>
      <For each={props.lines}>{(line) => <p>{line}</p>}</For>
      <Show when={props.detail}>
        <details class="error-detail">
          <summary>{failureDetailSummary}</summary>
          <pre>{props.detail}</pre>
        </details>
      </Show>
      {props.action?.()}
    </div>
  );
}
