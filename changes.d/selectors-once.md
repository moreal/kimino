 -  Internal: the feed state now carries every note by id and every note's
    loaded reply count, computed once per change instead of once per card,
    so a long outbox no longer re-walks the whole list for each card it
    draws. The list scope behind a search is counted in the same pass as the
    search. The skip link's target is named symbolically by the selectors.
    Note copy moved out of `note-body.ts` into `copy-content.ts`; no words
    on screen changed.
