# Changelog

Version 0.1.0
-------------

To be released.

 -  A responsive reading interface provides consistent typography, spacing,
    labeled actions, touch targets, keyboard navigation, and focus handling.
    Contextual author and account sheets, inline writing feedback, and Korean
    interface copy keep account controls separate from reading and composing.
 -  Connect an ActivityPub C2S account to read its inbox and outbox, publish
    posts, and reply to conversations. A labeled read-only preview is available
    before connecting. Mastodon REST-only accounts are not supported.
 -  Remote post content is sanitized, images load only on explicit request,
    and bearer tokens are sent only to the configured account origin.
 -  Continue large timeline, follow-list, and request-history reads on demand.
    Canceling preserves existing posts and drafts; incomplete reads are labeled
    separately from completed reads and server errors.
 -  Edit the text and content warning of your own posts while preserving their
    audience, or delete a post after confirmation. Deletion cannot recall copies
    already received by other servers.
 -  Follow accounts and withdraw follows through C2S from people management
    or author profiles. Search and filter followed people, pending requests,
    and operations needing attention; refresh the timeline for delivered posts.
 -  Confirmed writes remain recorded if a subsequent read fails. Failed posts
    retain their drafts, and uncertain write requests are not retried
    automatically.
 -  Hide an author's loaded posts across reading views and restore them from
    the hidden-author manager. Hidden-author IDs are stored per account in this
    browser; this does not block server delivery or sync to other devices.
 -  Choose a compact desktop reading density and whether content warnings open
    automatically. Both preferences are remembered in this browser.
 -  Like and share posts, inspect reactions, and withdraw your own reactions
    when their original activities are available. Per-action progress and
    confirmations keep other posts and composers usable.
 -  Look up a known account by @name@server or enter its exact Actor URL.
    Browser lookup sends no credentials, requires an explicit action, and shows
    the returned address for review before a separate Follow.
 -  Read conversations with their loaded ancestors and nested replies, using
    a side panel on wide screens or a single-column view on phones. Unfinished
    post and reply drafts stay in the current session while navigating.
 -  Browse received replies and mentions, your own posts, and saved links.
    Search loaded posts by content or author, and save post links in this
    browser, including links whose posts are not in the current timeline.
 -  Run the included local ONI setup with Docker Compose. A separate,
    reproducible two-account experimental fixture supports C2S follow delivery
    and private-media workflows. Its server patches and compatibility evidence
    are documented; support for unpatched ONI or other servers is not implied.
 -  With explicit ONI mode, attach up to four PNG, JPEG, or WebP images of
    up to 5 MiB each, with local previews and alternative text. Images are
    uploaded only when posting, and drafts stay in memory.
 -  Servers advertising the experimental private-media capability also support
    followers-only and direct image posts and replies. Images and posts use the
    same recipients; confirmed uploads can be reused only for that audience.
    Uploads may remain within their original scope after a post is canceled or
    fails, and removing a draft attachment does not delete its server copy.
 -  In ONI mode, received private raster images load through the account server
    with bounded reads and no bearer sent to the image origin. Readers can hide
    images or retry failed reads while retaining their descriptions.
 -  Write posts with a content warning and choose public, unlisted,
    followers-only, or direct visibility. Replies are limited to the original
    post's audience scope and show their conversation recipients before sending.
 -  Content warnings, non-public audience labels, attachment descriptions, and
    explicit image loading controls accompany received posts.
