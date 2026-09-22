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
