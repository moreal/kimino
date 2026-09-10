import { describe, expect, it } from 'vitest';
import { actorName, nameFromIri } from './actor-name';

const oni = { id: 'https://localhost:8443/', preferredUsername: 'Oni' };
describe('how an author is named on screen', () => {
  it('calls the connected account by its username, never by its host alone', () => {
    expect(actorName(oni.id, oni)).toEqual({
      primary: 'Oni',
      secondary: '@Oni@localhost:8443',
    });
  });
  it('prefers a display name and keeps the handle beside it', () => {
    expect(actorName(oni.id, { ...oni, name: '오니' })).toEqual({
      primary: '오니',
      secondary: '@Oni@localhost:8443',
    });
  });
  it('names anyone else by the IRI, user first, and the handle as the second line', () => {
    expect(actorName('https://social.example/users/alice')).toEqual({
      primary: 'alice',
      secondary: '@alice@social.example',
    });
    // Another root-path actor is not the connected one: the host is all that is known.
    expect(actorName('https://other.example/')).toEqual({ primary: 'other.example' });
    expect(actorName('https://other.example/', oni)).toEqual({ primary: 'other.example' });
  });
  it('shows a value that is not a URL as it is', () => {
    expect(actorName('not a url')).toEqual({ primary: 'not a url' });
  });
});

describe('Takahe-style paths that carry the address in the segment', () => {
  it('drops the leading @ of `/@alice` instead of naming the person `@alice`', () => {
    expect(actorName('https://takahe.example/@alice')).toEqual({
      primary: 'alice',
      secondary: '@alice@takahe.example',
    });
    expect(actorName('https://takahe.example/@alice/')).toEqual({
      primary: 'alice',
      secondary: '@alice@takahe.example',
    });
  });
  it('never doubles the address when the segment is already `@user@host`', () => {
    // A remote account mirrored under a local path: the address in the segment is the
    // account's own, so it is the one shown, and it is shown once.
    expect(actorName('https://takahe.example/@alice@remote.example/')).toEqual({
      primary: 'alice',
      secondary: '@alice@remote.example',
    });
    expect(actorName('https://takahe.example/@alice@remote.example').secondary).not.toContain('@@');
  });
});

describe('what a remembered tab can call its account before the actor arrives', () => {
  it('reads a username out of the IRI path, Takahe style included', () => {
    expect(nameFromIri('https://social.example/users/alice')).toBe('alice');
    expect(nameFromIri('https://takahe.example/@alice/')).toBe('alice');
    // Mastodon lets a username open with a digit; only an all-digit segment is an id.
    expect(nameFromIri('https://mastodon.example/users/2ndlaw')).toBe('2ndlaw');
    expect(nameFromIri('https://mastodon.example/@2ndlaw')).toBe('2ndlaw');
    expect(nameFromIri('https://mastodon.example/users/3')).toBeUndefined();
  });
  it('refuses to pass a host off as a name', () => {
    expect(nameFromIri('https://localhost:8443/')).toBeUndefined();
    expect(nameFromIri('not a url')).toBeUndefined();
  });
  it('refuses to pass an opaque account id off as a name', () => {
    expect(nameFromIri('https://misskey.example/users/9k2jd8a1xq')).toBeUndefined();
    expect(nameFromIri('https://misskey.example/users/a1b2c3d4e5')).toBeUndefined();
    // The ten-character rule is Misskey's `/users/` shape: elsewhere it is a username.
    expect(nameFromIri('https://takahe.example/@a1b2c3d4e5')).toBe('a1b2c3d4e5');
    expect(nameFromIri('https://misskey.example/users/A1b2c3d4e5')).toBe('A1b2c3d4e5');
    expect(nameFromIri('https://misskey.example/users/alice12345x')).toBe('alice12345x');
    expect(nameFromIri('https://social.example/users/123')).toBeUndefined();
    expect(nameFromIri(`https://social.example/users/${'a'.repeat(31)}`)).toBeUndefined();
    expect(nameFromIri('https://social.example/users/al%20ice')).toBeUndefined();
    expect(nameFromIri('https://social.example/users/alice_2.b-c')).toBe('alice_2.b-c');
    expect(nameFromIri('https://misskey.example/users/9k2jd8a1xq@remote.host')).toBeUndefined();
    // An aid mixes digits and letters: ten plain letters are a username, ten digits an
    // all-digit id. A ten-letter name that carries a digit (`alexander1`) has an aid's shape
    // and stays unnamed until the profile arrives: by shape alone nothing tells them apart.
    expect(nameFromIri('https://social.example/users/alexanders')).toBe('alexanders');
    expect(nameFromIri('https://social.example/users/alexander1')).toBeUndefined();
    expect(nameFromIri('https://social.example/users/1234567890')).toBeUndefined();
    expect(nameFromIri('https://misskey.example/users/9k2jd8a1xq/')).toBeUndefined();
  });
});
