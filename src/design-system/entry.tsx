import { createSignal, For, untrack } from 'solid-js';
import { render } from '@solidjs/web';
import type { Actor, TimelineNote } from '../domain/social';
import { Button, TextInput, TextArea, Icon, type ButtonVariant } from '../components/ui';
import NoteCard from '../components/NoteCard';
import Composer from '../components/Composer';
import { designSystemCopy as text } from '../presentation/copy-design-system';
import '../app.css';
import './gallery.css';
import lightPalette from '../styles/palette-light.css?inline';
import darkPalette from '../styles/palette-dark.css?inline';

const actor: Actor = {
  id: 'https://example.invalid/people/mina',
  name: 'Mina',
  preferredUsername: 'mina',
  inbox: 'https://example.invalid/inbox',
  outbox: 'https://example.invalid/outbox',
};
const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'icon'];

function CardSpecimen(props: { state: 'rest' | 'selected' | 'pending' | 'warning' }) {
  const [liked, setLiked] = createSignal(untrack(() => props.state === 'selected'));
  const [saved, setSaved] = createSignal(untrack(() => props.state === 'selected'));
  const [shared, setShared] = createSignal(false);
  const [revealed, setRevealed] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const note = (): TimelineNote => ({
    id: `https://example.invalid/notes/${props.state}`,
    author: 'https://example.invalid/people/sol',
    content: `<p>${text.samplePost}</p>`,
    inReplyTo: 'https://example.invalid/notes/parent',
    summary: props.state === 'warning' ? text.sampleWarning : undefined,
    visibility: 'public',
    attachments: [],
    announcedBy: shared() ? [actor.id] : [],
    likedBy: liked() ? [actor.id] : [],
    reactions: [],
    mentions: [],
  });
  return (
    <section
      class="gallery-specimen gallery-card"
      data-specimen={props.state}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) {
          event.preventDefault();
          setStatus(text.localAction);
        }
      }}
    >
      <h3>{text[props.state]}</h3>
      <NoteCard
        note={note()}
        actor={actor.id}
        self={actor}
        parent={{ author: actor.id, content: text.sampleParent }}
        saved={saved()}
        disabled={props.state === 'pending'}
        pending={props.state === 'pending' ? 'like' : undefined}
        revealed={revealed()}
        onToggleReveal={() => setRevealed((value) => !value)}
        onReact={(_, kind) =>
          kind === 'like' ? setLiked((value) => !value) : setShared((value) => !value)
        }
        onSave={() => setSaved((value) => !value)}
        onReply={() => setStatus(text.localAction)}
        onThread={() => setStatus(text.localAction)}
        onOpenParent={() => setStatus(text.localAction)}
        onAuthor={() => setStatus(text.localAction)}
      />
      <p class="gallery-status" role="status">
        {status()}
      </p>
    </section>
  );
}

function Workbench() {
  const [theme, setTheme] = createSignal('system');
  const [draft, setDraft] = createSignal('');
  const [failedDraft, setFailedDraft] = createSignal(text.sampleValue);
  const [failed, setFailed] = createSignal(true);
  const [notice, setNotice] = createSignal('');
  return (
    <main class="gallery">
      <style>{theme() === 'system' ? '' : theme() === 'dark' ? darkPalette : lightPalette}</style>
      <header class="gallery-heading">
        <p class="gallery-kicker">KIMINO / DESIGN SYSTEM</p>
        <h1>{text.title}</h1>
        <p>{text.introduction}</p>
        <p>{text.scope}</p>
        <div class="gallery-theme">
          <label for="gallery-theme">{text.themeLabel}</label>
          <select
            id="gallery-theme"
            value={theme()}
            onChange={(event) => setTheme(event.currentTarget.value)}
          >
            <option value="system">{text.systemTheme}</option>
            <option value="light">{text.lightTheme}</option>
            <option value="dark">{text.darkTheme}</option>
          </select>
        </div>
        <nav aria-label="Components">
          <For each={['foundations', 'buttons', 'fields', 'actions', 'composer'] as const}>
            {(section) => <a href={`#${section}`}>{text[section]}</a>}
          </For>
        </nav>
      </header>
      <section id="foundations" class="gallery-section">
        <h2>{text.foundations}</h2>
        <div class="gallery-tokens">
          <For
            each={['surface', 'surface-2', 'ink', 'ink-muted', 'accent', 'danger', 'line'] as const}
          >
            {(token) => (
              <div>
                <span class="gallery-swatch" style={{ background: `var(--${token})` }} />
                <code>--{token}</code>
              </div>
            )}
          </For>
        </div>
      </section>
      <section id="buttons" class="gallery-section">
        <h2>{text.buttons}</h2>
        <div class="gallery-grid">
          <For each={variants}>
            {(variant) => (
              <section class="gallery-specimen" data-variant={variant}>
                <h3>{variant}</h3>
                <div class="gallery-control-row">
                  <span>{text.enabled}</span>
                  <Button
                    variant={variant}
                    aria-label={variant === 'icon' ? text.iconAction : undefined}
                    onClick={() => setNotice(text.localAction)}
                  >
                    <Icon name={variant === 'icon' ? 'plus' : 'arrow-right'} />
                    {variant !== 'icon' ? text.action : undefined}
                  </Button>
                </div>
                <div class="gallery-control-row">
                  <span>{text.disabled}</span>
                  <Button
                    variant={variant}
                    disabled
                    aria-label={variant === 'icon' ? text.iconAction : undefined}
                  >
                    <Icon name={variant === 'icon' ? 'plus' : 'arrow-right'} />
                    {variant !== 'icon' ? text.action : undefined}
                  </Button>
                </div>
              </section>
            )}
          </For>
          <section class="gallery-specimen">
            <h3>{text.busy}</h3>
            <Button variant="primary" aria-busy="true" disabled>
              <Icon name="refresh" class="icon--spin" />
              {text.busyAction}
            </Button>
          </section>
        </div>
        <p role="status" class="gallery-status">
          {notice()}
        </p>
      </section>
      <section id="fields" class="gallery-section">
        <h2>{text.fields}</h2>
        <div class="gallery-grid">
          <label class="gallery-field">
            {text.normalField}
            <TextInput placeholder={text.placeholder} />
          </label>
          <label class="gallery-field">
            {text.filledField}
            <TextInput value={text.sampleValue} />
          </label>
          <label class="gallery-field">
            {text.disabledField}
            <TextInput disabled value={text.sampleValue} />
          </label>
          <div class="gallery-field">
            <label for="invalid-example">{text.invalidField}</label>
            <TextInput
              id="invalid-example"
              aria-invalid="true"
              aria-describedby="field-error"
              value={text.sampleValue}
            />
            <span id="field-error" class="gallery-error">
              {text.invalidHelp}
            </span>
          </div>
          <label class="gallery-field">
            {text.textarea}
            <TextArea rows={3} placeholder={text.placeholder} />
          </label>
        </div>
      </section>
      <section id="actions" class="gallery-section">
        <h2>{text.actions}</h2>
        <div class="gallery-grid gallery-posts">
          <For each={['rest', 'selected', 'pending', 'warning'] as const}>
            {(state) => <CardSpecimen state={state} />}
          </For>
        </div>
      </section>
      <section id="composer" class="gallery-section">
        <h2>{text.composer}</h2>
        <p>{text.draft}</p>
        <div class="gallery-grid gallery-posts">
          <section class="gallery-specimen gallery-composer">
            <h3>{text.idleComposer}</h3>
            <Composer
              self={actor}
              draft={draft()}
              onDraft={setDraft}
              onSubmit={async () => {
                setNotice(text.localAction);
              }}
            />
          </section>
          <section class="gallery-specimen gallery-composer">
            <h3>{text.failureComposer}</h3>
            <Composer
              self={actor}
              draft={failedDraft()}
              onDraft={setFailedDraft}
              error={failed() ? { text: text.failureText, detail: '' } : undefined}
              autoFocusError={false}
              onSubmit={async () => {
                setFailed(true);
                throw new Error('gallery-only failure');
              }}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

render(() => <Workbench />, document.getElementById('design-system')!);
