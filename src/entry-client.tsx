import './logging';
import { Errored } from 'solid-js';
import { render } from '@solidjs/web';
import App, { RenderFailure } from './app';
import {
  createSession,
  browserPreferences,
  browserSessionStore,
  browserAccountDiscovery,
} from './bootstrap';
import './app.css';

render(
  () => (
    <Errored fallback={(error) => RenderFailure(error)}>
      <App
        session={createSession()}
        preferences={browserPreferences}
        sessionStore={browserSessionStore}
        accountDiscovery={browserAccountDiscovery}
      />
    </Errored>
  ),
  document.getElementById('app')!,
);
