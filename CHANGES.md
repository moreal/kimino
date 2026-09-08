# Changelog

Version 0.1.0
-------------

To be released.

 -  Find replies and mentions addressed to you under "나에게 온 답글", read
    relative times, open a reply's original conversation in place, and use one
    clearly labeled preview mode with a single exit control.
 -  Like and share results now appear right under the post you tapped, the
    tapped button shows it is working, and page-level alerts stay at the top of
    the screen with a close button. Switching lists closes the inline reply but
    keeps the draft and marks the post with "초안 있음". Preview mode explains
    per action what needs an account; the header drops the update stamp, the
    preview line is thinner, and a render failure shows a readable message
    instead of a blank page.
 -  Follow conversations inside Kimino, read the original while replying, and
    keep unfinished drafts when moving between views within the same tab.
 -  Explore a clearly labeled example timeline before connecting an account.
    Connection guidance now explains which accounts are supported.
 -  Search loaded posts and save their links in this browser. Saved links remain
    accessible even when their posts are absent from the current timeline.
 -  Read and use timeline actions more comfortably with larger type, clearer
    contrast, and improved mobile spacing.
 -  Like and share posts with your connected account and see who reacted to each
    post. Servers that refuse to withdraw a reaction are reported plainly
    instead of failing silently.
 -  Read your ActivityPub timeline, publish public posts, and reply to
    conversations by connecting a C2S-compatible account. Kimino keeps your
    access token only in the current tab and filters unsafe content before
    displaying posts.
 -  Run the included local ONI instance with Docker Compose to try the client
    without a hosted account.
 -  Replies in a conversation now read oldest-first, relative timestamps keep
    ticking while the page stays open, and a rejected post can no longer show an
    error after you have already switched accounts or left the session.
