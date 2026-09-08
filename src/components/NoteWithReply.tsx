import { Show } from 'solid-js';
import type { TimelineNote } from '../domain/social';
import type { FeedState, FeedViewModel } from '../presentation/feed-view-model';
import NoteCard from './NoteCard';
import Composer from './Composer';

/** A note card with its inline reply composer, wired to the feed view model. */
export default function NoteWithReply(props: {
  note: TimelineNote;
  state: FeedState;
  vm: FeedViewModel;
  onThread: (note: TimelineNote) => void;
  focused?: boolean;
}) {
  // Derive from props.state (reactive) rather than through vm helpers that read a plain snapshot.
  const parent = () => props.state.all.find((item) => item.id === props.note.inReplyTo);
  const replies = () => props.state.all.filter((note) => note.inReplyTo === props.note.id).length;
  const draft = () => props.state.drafts[props.note.id] || '';
  return (
    <div class="post-with-reply">
      <NoteCard
        note={props.note}
        actor={props.state.actor?.id}
        focused={props.focused}
        onReply={props.vm.chooseReply}
        onThread={props.onThread}
        onOpenParent={() => {
          const target = parent();
          if (target) props.onThread(target);
        }}
        parentLoaded={!!parent()}
        onReact={(note, kind) => void props.vm.react(note, kind)}
        onSave={props.vm.toggleSave}
        saved={props.state.saved.includes(props.note.id)}
        replies={replies()}
        disabled={props.state.busy}
        pending={props.state.pending?.id === props.note.id ? props.state.pending.kind : undefined}
        feedback={props.state.actionError[props.note.id]}
        hasDraft={props.state.reply?.id !== props.note.id && draft().trim().length > 0}
      />
      <Show when={props.state.reply?.id === props.note.id}>
        <div class="inline-reply">
          <Composer
            replyTo={props.note}
            draft={draft()}
            onDraft={(value) => props.vm.setDraft(props.note.id, value)}
            disabled={props.state.busy}
            onSubmit={props.vm.publish}
            onCancel={props.vm.cancelReply}
          />
        </div>
      </Show>
    </div>
  );
}
