import { describe, expect, it } from 'vitest';
import { actorSheetIsSelf, avatarInitial, connectionDotClass, connectionLit } from './view-flags';

const alice = { id: 'https://social.example/users/alice' };

describe('the connection dot', () => {
  it('is lit for a loaded real account only', () => {
    expect(connectionLit({ actor: alice, demo: false })).toBe(true);
    // The preview's sample account is not a connection.
    expect(connectionLit({ actor: alice, demo: true })).toBe(false);
    // Landing, or a remembered tab whose actor has not arrived yet.
    expect(connectionLit({ actor: undefined, demo: false })).toBe(false);
  });
  it('names the same two classes the stylesheet draws', () => {
    expect(connectionDotClass({ actor: alice, demo: false })).toBe('connection-dot');
    expect(connectionDotClass({ demo: false })).toBe('connection-dot connection-dot--pending');
  });
});

describe('the author sheet', () => {
  it('is about me only when it is open on the connected account', () => {
    expect(actorSheetIsSelf({ actor: alice, actorSheet: { id: alice.id } })).toBe(true);
    expect(
      actorSheetIsSelf({ actor: alice, actorSheet: { id: 'https://social.example/users/bob' } }),
    ).toBe(false);
    expect(actorSheetIsSelf({ actor: alice })).toBe(false);
    expect(actorSheetIsSelf({ actorSheet: { id: alice.id } })).toBe(false);
  });
});

describe('the avatar initial', () => {
  it('is the first character of the name, upper-cased, and whole even past the BMP', () => {
    expect(avatarInitial('alice')).toBe('A');
    expect(avatarInitial('오니')).toBe('오');
    expect(avatarInitial('  bob')).toBe('B');
    expect(avatarInitial('𝔄lice')).toBe('𝔄');
    expect(avatarInitial('')).toBe('');
  });
});
