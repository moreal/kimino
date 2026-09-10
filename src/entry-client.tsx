import './logging';
import { Errored } from 'solid-js';
import { render } from '@solidjs/web';
import App, { RenderFailure } from './app';
import { createSession, browserPreferences, browserSessionStore } from './bootstrap';
import './app.css';

render(
  () => (
    <Errored fallback={(error) => RenderFailure(error)}>
      <App
        session={createSession()}
        preferences={browserPreferences}
        sessionStore={browserSessionStore}
      />
    </Errored>
  ),
  document.getElementById('app')!,
);
