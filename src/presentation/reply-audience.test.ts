import { expect, it } from 'vitest';
import { replyAudience, composerAudienceDescription } from './reply-audience';

const self = 'https://home.test/alice';
const bob = 'https://people.test/bob';
const carol = 'https://people.test/carol';
const parent = { author: bob, mentions: [self, carol, bob, carol] };

it('shows the other two participants of a three-person reply, excluding self and duplicates', () => {
  expect(replyAudience(parent, self)).toEqual({
    available: true,
    recipients: [
      { id: bob, label: 'bob' },
      { id: carol, label: 'carol' },
    ],
  });
});

it('canonicalizes participant identities through the same rule as outgoing addressing', () => {
  expect(
    replyAudience(
      { author: 'https://PEOPLE.test/bob', mentions: [bob, 'https://HOME.test/alice', carol] },
      self,
    ).recipients.map((recipient) => recipient.id),
  ).toEqual([bob, carol]);
});

it('names both followers and explicit reply recipients for a followers reply', () => {
  expect(composerAudienceDescription('followers', replyAudience(parent, self))).toBe(
    '내 팔로워와 표시된 답글 수신자에게 보내요',
  );
});

it('names the displayed recipient set instead of implying a one-person direct reply', () => {
  expect(composerAudienceDescription('direct', replyAudience(parent, self))).toBe(
    '표시된 답글 수신자에게만 보내요',
  );
});

it('does not narrow public and unlisted replies to the explicit participant list', () => {
  const audience = replyAudience(parent, self);
  expect(composerAudienceDescription('public', audience)).toBe('누구나 볼 수 있어요');
  expect(composerAudienceDescription('unlisted', audience)).toBe(
    '누구나 볼 수 있지만 공개 타임라인에는 오르지 않아요',
  );
});

it('keeps self-replies without other participants honest about an empty recipient set', () => {
  const audience = replyAudience({ author: self, mentions: [self] }, self);
  expect(audience).toEqual({ available: true, recipients: [] });
  expect(composerAudienceDescription('direct', audience)).toBe('나를 제외한 답글 수신자가 없어요');
  expect(composerAudienceDescription('followers', audience)).toBe(
    '나를 팔로우하는 사람에게 보내요',
  );
});

it('does not crash or present a guessed list when addressing cannot resolve participants', () => {
  for (const audience of [
    replyAudience(parent),
    replyAudience({ ...parent, mentions: ['javascript:bad'] }, self),
  ]) {
    expect(audience).toEqual({ available: false, recipients: [] });
    expect(composerAudienceDescription('direct', audience)).toBe('답글 수신자를 확인할 수 없어요');
  }
});

it('retains existing descriptions outside reply composition', () => {
  expect(composerAudienceDescription('followers')).toBe('나를 팔로우하는 사람만 볼 수 있어요');
});
