 -  Nothing on the page is disabled while a like, share, reply, edit or
    deletion is being sent. A second action asked for while one is still on
    its way used to be refused ("진행 중인 요청이 끝나면…") or, for a moment,
    greyed out every button on the page; now it waits its turn behind the one
    before it and goes out in order, and only the control that was pressed
    shows that it is waiting. The connect form still waits for its connection.
 -  When a write went through but the timeline could not be read again, one
    message says so ("좋아요는 남겼지만 타임라인을 다시 불러오지 못했어요…")
    instead of a confirmation and a warning stacked on top of each other.
 -  A write that was accepted no longer loses its re-read when the next write
    fails: the timeline is read again anyway, with the failure shown over it.
 -  The refresh button clears a note reported deleted from the "gone" list only
    when the server was actually asked again, not when the request was folded
    into a read already on its way.
 -  A content warning that was opened stays open through a re-read of the
    timeline - after an edit, the new words show right away instead of the
    card closing again. Disconnecting closes all of them.
 -  Searching by author now matches the name shown on the card and the
    `@user@host` handle (for a search that includes "@"), not the raw address:
    "localhost" no longer matches everyone on the server.
