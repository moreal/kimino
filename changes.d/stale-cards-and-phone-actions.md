 -  Editing a post that no longer exists on the server no longer brings it
    back. Before an edit is sent the client asks the server whether it still
    holds the post; when it does not - because another tab or another client
    deleted it - the edit is refused with the reason and the stale card leaves
    the list, so a deleted post can never be republished from an old screen.
    Deleting a post that is already gone says so plainly instead of reporting a
    fresh deletion.
 -  The edit form reopens with the post's current text every time. After a
    saved edit it used to come back empty with the save button disabled until
    the page was reloaded.
 -  When a post is written but the timeline cannot be re-read afterwards, the
    message now names what was written - a post, a reply, an edit, a deletion,
    a like, a share, or taking one of those back - instead of always saying it
    was published. A like or share the server accepted also shows its new
    state on its own button even when that re-read fails.
 -  On a phone the 수정 and 삭제 controls no longer sit off the edge of the
    action row: the row wraps, so every control keeps its word, its 44px target
    and a place on screen.
 -  Your own posts carry a "내 글" label, so they can be told apart on a server
    where every post shares one address.
 -  The composer no longer promises a "수정됨" marker. It now says the marker
    only appears when the server records an edit time, which servers such as
    ONI do not; posts from servers that do record one are still marked.
 -  The foot of the list says how many activities the client actually read from
    the server, and - when the server declares more than it handed over - that
    older posts could not be reached.
