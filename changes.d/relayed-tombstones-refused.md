 -  A Delete that carries a tombstone, the way Mastodon sends one, is now
    refused like a bare one when it comes from someone who is not the note's
    author: a relayed Delete over your note no longer takes it off the
    timeline, and it counts among the activities refused for safety. The
    server's own tombstones, and your own deletions read back after the fact,
    still take a note out.
 -  Pressing Escape on 삭제 while its confirmation is open now closes the
    confirmation and keeps you on 삭제, instead of moving to the list with the
    question still open.
 -  A remembered tab no longer withholds a ten-letter username such as
    `alexanders` as if it were a Misskey account id; only ids that mix digits
    and letters are left unnamed until the profile loads.
