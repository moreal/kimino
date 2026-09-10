 -  The quick read after editing or deleting a note now reads that note back
    from the server itself instead of looking for it on the first outbox page.
    A note whose original post has fallen past the first page, on a server that
    lists no new row for the edit, still shows its new words - and "글을
    수정했습니다" appears only once they are on screen. A note the server
    answers with 404, 410 or a Tombstone leaves the list. On the tested server
    an edit costs three requests after the POST: the note, the inbox, the
    outbox.
 -  A full 새로고침 now also forgets the reactions this session withdrew and the
    notes it read back, since what it lists is the server's word again; a
    withdrawal confirmed after the connection was replaced no longer touches the
    new session.
