 -  A new post, reply or edit now appears within a moment of being accepted.
    The read that follows a write used to walk the whole outbox and inbox
    again - dozens of requests and a few seconds on a long feed - before the
    card could show. It now asks each collection for its first page only and
    lays that over what is already loaded, so nothing already on screen is
    lost and the server's later edits and deletions still win. On the tested
    server that is three requests instead of forty-odd, and the card is on
    screen in about a quarter of a second instead of three.
 -  Such a partial read does not claim to have reached more of the server's
    collections than the last full read did; the timeline keeps reporting
    that reach. Connecting and pressing 새로고침 still read everything. If the
    partial read fails, one full read is tried before the failure is reported.
 -  Each note's 수정/삭제 and 좋아요/공유 controls now wait only on their own
    request: confirming a deletion on a second note no longer re-enables the
    first one's button, and a failed reaction clears only its own pending
    state. A 새로고침 that did not actually land (a write's own read replaced
    it) no longer wipes the inline messages a write had just put beside a note.
 -  A write that was still waiting its turn when the connection was closed or
    replaced is now reported as not sent, so its composer keeps the draft
    instead of clearing as if it had been posted.
