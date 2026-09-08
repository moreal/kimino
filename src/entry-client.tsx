import './logging';
import { Errored } from 'solid-js';
import { render } from '@solidjs/web';
import App from './app';
import { createSession, browserPreferences } from './bootstrap';
import './app.css';

/** A render halt shows a plain-language message instead of a blank page. */
function RenderFailure(error: () => unknown) {
  const message = () => {
    const value = error();
    return value instanceof Error ? value.message : String(value);
  };
  return (
    <div role="alert" class="app-error">
      <p>화면을 그리는 중 문제가 생겼어요. 새로고침해 주세요.</p>
      <details>
        <summary>자세한 내용</summary>
        <pre>{message()}</pre>
      </details>
    </div>
  );
}

render(
  () => (
    <Errored fallback={(error) => RenderFailure(error)}>
      <App session={createSession()} preferences={browserPreferences} />
    </Errored>
  ),
  document.getElementById('app')!,
);
