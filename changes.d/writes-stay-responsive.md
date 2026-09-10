 -  The page no longer freezes after a like, share, reply, edit or deletion. A
    write used to disable every control on the page until the timeline had
    been read again, which took a couple of seconds on a long feed. Now only
    the control that was pressed waits, and only for the server's answer; the
    re-read that follows runs quietly in the background - the refresh button
    spins while it does - and every other card and the composer stay usable.
    A like or share shows on its own button the moment the server accepts it,
    and a second reaction can be sent while the last re-read is still on its
    way; the older re-read is then dropped and one newer read follows.
 -  Confirmations arrive when what they confirm is on screen. A like, share or
    deletion is confirmed as soon as the server accepts it, since the button
    or the list already shows it. A new post or an edit is confirmed only once
    the re-read has put the new words on screen; if that re-read fails, the
    message that the write went through but the timeline could not be reloaded
    is the only one shown.
