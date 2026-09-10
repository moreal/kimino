# Next round — handoff

State as of 2026-09-10, after Round 18 (see `iteration-log.md` for every
round's findings and decisions). Sixteen independent surrogate reviews so far.
Since Round 15 every reviewer answers "yes" to Kimino as a secondary client
for an oni account and "not yet" to primary use; the primary-use "no" rests on
the server model (a one-person go-ap server has no follow timeline), not on the
client. No reviewer since Round 13 has found the client misreporting server
state. These are agent surrogates, not real users; do not read them as
conversion evidence.

## How a round runs

1. Baseline: `npm run check`, then `npx playwright test` (ui + product + writes
   are mocked; `tests/c2s.spec.ts` needs the Docker fixture: `npm run c2s:up`,
   `npm run c2s:seed`, `npm run c2s:smoke`). Run only one Playwright run at a
   time and do not edit `src/` while one is running: they share the Vite dev
   server on 5173 and HMR drops the memory-only token.
2. Spawn one fresh surrogate reviewer (new persona each time; do not let it
   read `iteration-log.md` until the end) that drives the real fixture at
   1440x900 and 390x844, takes screenshots, verifies the previous round's
   claims with measurements, and reports a candid verdict plus ranked
   frictions. In parallel, spawn a read-only code review of the previous
   round's diff.
3. Split the fixes into agents with disjoint file ownership (application/
   adapter/domain; presentation; components/CSS/tests). Test-first. Each adds
   a `changes.d/` fragment.
4. Integrate: `npm run format`, `npm run check`, full Playwright run, then
   `npx sacho sync --force && npx sacho fmt && npx sacho check` (the
   materialized `CHANGES.md` region is generated from the fragments).
5. Append the round to `iteration-log.md`: what the reviewer said (including
   the "no"), what changed, what was deliberately not done, test counts.

## Open items carried into the next round

From the Round 18 code review (small, not yet fixed):

- `src/components/Composer.tsx` ~294: the new footer `scrollIntoView` on mount
  can push the textarea's caret off-screen on a phone when the reply form is
  taller than the viewport. Scroll the form (or textarea) with
  `block: 'nearest'` instead of the footer.
- `src/application/social-session.ts` ~157: `connect()` calls `queue.reset()`
  without clearing `owed`, so a reconnect can start one unnecessary recent
  read after its first failed POST. Pass `{ owed: true }` to the reset.
- `src/presentation/time.ts` ~13: `Date.now()` default param is dead (every
  caller passes `now`); make it required and extend the architecture test's
  clock rule to presentation files outside `presentation/solid`.
- `src/presentation/design-tokens.ts` ~53 re-exports `NOTE_LIMITS` from the
  domain, which the "domain as types only" view rule cannot see. Either move
  the constant to `presentation/note-body.ts` or make the boundary test name
  the exception explicitly.
- Test gaps: `descendantCounts` with duplicate ids; `tests/c2s.spec.ts` first
  test should assert the stored reply's `inReplyTo` through `findInOutbox`;
  `parentAdjacent` past depth 4.
- Leftovers: `descendantCount` and the `parentOf` re-export in
  `feed-selectors.ts` are test-only; `tests/helpers/c2s.ts postToOutbox` is
  unused.

Product decisions still open (recorded, not built):

- **Outbox ceiling.** The client refuses a timeline it cannot read completely
  (`maxPages` 100 × 20 rows). An account with more than about 2,000 outbox
  activities cannot connect at all. Options: a bounded read with an honest
  "older posts not loaded" state, or server-side pagination. This is the one
  product limit that would stop a long-lived account outright.
- **Follow timeline.** ONI accepts `Follow` but never answers `Accept` and
  `following` stays empty, so it is not built. This is what every surrogate
  names as the reason primary use is "not yet".
- Media upload and alt text, mute/block, visibility change on edit: honest
  capability gaps stated in the UI, not faked.

Fixture hygiene: every review and every c2s run leaves rows in the ONI outbox
and nothing shrinks it (a Delete keeps the Create as a Tombstone and adds a
row). When all real-server tests fail at connect, run `npm run c2s:smoke`
first; reset with `docker compose down -v && npm run c2s:up && npm run
c2s:seed`.

## Prompt to start the next session

```
docs/product/next-round.md 와 docs/product/iteration-log.md 의 마지막 라운드를 읽고
같은 방식으로 다음 라운드를 진행하세요. 먼저 next-round.md 의 "Open items" 를
test-first 로 처리하고, 그 다음 새로운 페르소나의 Mastodon 사용자 surrogate
subagent 를 띄워 실제 ONI 픽스처에서 이전 라운드 주장을 측정으로 검증하고
Mastodon 에서 넘어올 마음이 드는지 솔직하게 묻고, 그 결과로 다음 작업을 정하세요.
subagent 는 파일 소유권을 겹치지 않게 나누고, 통합 후 npm run check 와
npx playwright test 전체를 한 번에 하나만 실행하세요. 결과와 "아니오"를 포함한
판정을 iteration-log.md 에 기록하고, next-round.md 를 갱신하세요. 대리
리뷰어를 "예"라고 말할 때까지 몰아붙이지 마세요.
```
