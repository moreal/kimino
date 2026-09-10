 -  Internal only; nothing visible changed. The write ordering and the reads
    that follow writes moved out of the session into their own module
    (`application/write-queue.ts`), the collection walker out of the HTTP
    client (`activitypub/collection-reader.ts`), draft ceilings and the
    plain-text escaping into `domain/note-content.ts`, and the session now
    takes its clock from the composition root so every timestamp in tests is
    fixed. The real-server suite shares its helpers from `tests/helpers/c2s.ts`
    and asserts only what the server stored.
