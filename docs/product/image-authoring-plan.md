# Image authoring — Round 23 implementation

Goal: remove the repeatedly observed media-authoring blocker without weakening
C2S, privacy, write-confirmation or architecture guarantees. Round 22 was real
progress but not completion of the active product goal. Runtime evidence is in
`c2s-capability-evidence.md`; do not repeat that research or assume universal
C2S upload support.

## Product contract

- Explicit connection option `ONI 이미지 게시 사용` gates the verified ONI
  Create/Image convention. Default off; optional remembered-tab settings retain
  the choice. Never infer upload support merely from an actor outbox.
- New posts/replies: select up to four PNG/JPEG/WebP raster images (5 MiB each),
  show local previews, edit alternative text, remove images, keep them in the
  memory-only draft when navigating or cancelling. No upload on selection.
- Initial supported audiences are public and unlisted. Refuse private media
  in the application as well as UI; never widen a reply to allow attachments.
  Private binary rendering and recipient interoperability remain unfinished.
- Posting serializes Image Create(s), then Note Create. Explain that an uploaded
  Image can remain public independently of a failed/cancelled Note. Already
  confirmed uploads are retained and reused on an explicit Note retry.
- Accepted upload with failed hydration stays unresolved, not failed: retry a
  GET to its Location, never its POST. Unknown network outcome is quarantined
  rather than automatically re-uploaded. Missing Location cannot be guessed.
- Note confirmation keeps existing success semantics even if reloading fails.
  Changing account clears image drafts/receipts; late old work cannot land.
- Existing remote images remain explicitly loaded only. Local preview images
  are selected by the user and require no remote fetch. Editing existing notes
  still edits text/CW only, preserving existing attachments server-side.

## Shared contracts

`domain/images.ts`: ImageMediaType, ImageDraft {id,dataUrl,mediaType,bytes,alt},
UploadedImage {id,url,mediaType}, ImageAttachment extends UploadedImage {alt}.
ImageProblem union + pure validateImage returning problem|undefined, IMAGE_LIMITS.
`NoteDraft.images?` are selected raw images; `attachments?` are resolved outgoing
attachments. The session removes images before calling publishNote.
`application/image-types.ts`: ImageGateway upload(image, visibility) ->
ImageUploadReceipt {location?,image?}; resolve(location, mediaType) -> UploadedImage.
ImageUploadState phase uploading|ready|unresolved|uncertain (location/image optional).
SocialSessionSnapshot mediaUploads optional Record, imageUploadEnabled optional.
Credentials mediaMode?: 'oni'; resolveImage(id): Promise<void>.

## Ownership / tasks

- [x] Adapter agent: domain/images.ts implementation/tests, activitypub/types.ts,
  client.ts attachment serialization and gated images port, new oni-images.ts
  + tests. Domain type names/shapes below are fixed. No other layers edited.
- [x] Application agent: new image-publisher.ts + tests, social-session.ts,
  gateway-errors.ts, session doubles/tests/demo. New failures media-unsupported,
  media-invalid {reason:ImageProblem}, media-scope, media-unresolved,
  media-uncertain. Receipt cache keyed by ID and source/audience, reset on session
  changes; sequence inside existing write queue; no copy/DOM/clock globals.
- [x] Picker agent: new ImagePicker.tsx, presentation/image-authoring.ts and
  copy-media.ts only. Local file reading, validated local preview, alt controls,
  status/readback recovery. No CSS/Composer edits; root owns integration.
- [x] Coordinator: shared type scaffolding; VM/state image drafts, connection
  opt-in/tab restore, Composer and picker wiring, CSS, failure copy, tests/docs.
- [x] Final full-browser verification: 166 passed, including 12 live ONI tests.
- [x] Independent code review + fresh user surrogate screenshots/flows; fix
  material findings and scoped re-review. Final check and full Playwright, real
  local ONI image roundtrip. Record candid migration verdict and limits.

Progress: implementation, independent code review, and user-perspective review
are complete. Review findings and two late boundary regressions were fixed and
re-reviewed. Complete check passes (461 unit tests); full browser verification
passes all 166 tests, including 12 live ONI tests. Real ONI validates all three image formats, alt text, exact
binary roundtrips, explicit image loads and attachment-only Notes.

Unresolved product limits: private images, arbitrary-server upload conventions,
existing Mastodon account compatibility and Follow delivery. See round 23 in the
iteration log. No commits or pushes performed.
