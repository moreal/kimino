 -  Keyboard shortcuts stay quiet while a sheet is open: with the author or
    account sheet up, `r` no longer opens a reply composer behind the backdrop
    and `?` no longer stacks the shortcut list on top of it. `?` still closes
    the shortcut list it opened.
 -  On a phone the 맨 위로 control sits above the tab bar instead of on the
    새 글 쓰기 tab, and the reminder that a connection ends on reload is one
    compact line under the composer, in the column's flow, rather than a strip
    fixed over whichever card was behind it. 자세히 opens the whole sentence;
    안내 닫기 still ends it for good.
 -  A confirmation toast is now a narrow pill at the bottom of the viewport,
    above the phone tab bar. It moves nothing - the composer and the first card
    stay exactly where they were, so a second tap at the top lands on the
    control it was aimed at - and taps pass through it; only its own close
    control takes the pointer. Still announced politely and still four seconds.
    A reply composer scrolled to the very bottom can be overlapped by it while
    it stands, but never blocked.
 -  One naming rule everywhere: the author sheet's heading is the name the card
    shows and the line under it is the same `@user@host` address, the desktop
    account line carries that address as a muted second line, and Takahe-style
    addresses (`/@alice`, `/@alice@remote.host/`) are read as a name and one
    address, never `@@alice@host`.
 -  A reply whose original is loaded says whom it answers in its cue -
    "Oni에게 · 원글 보기" - so a reply to a warned post is no longer three
    identical warning boxes; an original that is not loaded keeps "원글 보기"
    alone.
 -  When the shortcut list closes and the control that opened it has left the
    page, focus goes to the page heading rather than being lost.
