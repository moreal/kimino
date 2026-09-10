import { describe, expect, it, vi } from 'vitest';
import type { Preferences } from './ports';
import { savePreviewLinks, saveLinks, toggleLink } from './saved-links';
import type { SessionStore, StoredSession } from './session-restore';

const preferences = (writable = true): Preferences => ({
  read: () => '',
  write: () => writable,
  readSaved: () => [],
  writeSaved: vi.fn(() => writable),
  readDensity: () => 'comfortable',
  writeDensity: () => writable,
  readRevealWarned: () => false,
  writeRevealWarned: () => writable,
});

describe('saved links', () => {
  it('toggles an id in and out of the list', () => {
    expect(toggleLink([], 'a')).toEqual({ next: ['a'], adding: true });
    expect(toggleLink(['a', 'b'], 'a')).toEqual({ next: ['b'], adding: false });
  });

  it('persists through the port only for a real actor and picks the matching notice', () => {
    const port = preferences();
    expect(saveLinks(port, { actor: 'me', demo: false }, ['a'], true)).toEqual({
      saved: ['a'],
      saveNotice: '글 링크를 이 브라우저에 저장했어요. 본문은 보관하지 않아요.',
    });
    expect(port.writeSaved).toHaveBeenCalledWith('me', ['a']);
    expect(saveLinks(port, { actor: 'me', demo: false }, [], false).saveNotice).toBe(
      '저장을 해제했어요.',
    );
    const demo = preferences();
    expect(saveLinks(demo, { actor: 'me', demo: true }, ['a'], true).saveNotice).toMatch(
      /이 탭을 닫으면 초기화돼요/,
    );
    expect(demo.writeSaved).not.toHaveBeenCalled();
    expect(
      saveLinks(preferences(false), { actor: 'me', demo: false }, ['a'], true).saveNotice,
    ).toContain('브라우저 저장소를 사용할 수 없어');
    expect(
      saveLinks(preferences(), { actor: undefined, demo: false }, ['a'], true).saveNotice,
    ).toContain('브라우저 저장소를 사용할 수 없어');
  });
});

describe('preview saves in the tab record', () => {
  const store = (initial?: StoredSession) => {
    let record = initial;
    const fake: SessionStore & { record: () => StoredSession | undefined } = {
      record: () => record,
      read: () => record,
      write(next) {
        record = next;
        return true;
      },
      clear: () => {
        record = undefined;
      },
    };
    return fake;
  };
  it('adds and removes the saved list beside the preview marker', () => {
    const tab = store({ actorUrl: 'demo', token: '', view: 'all' });
    expect(savePreviewLinks(tab, ['a', 'b'])).toBe(true);
    expect(tab.record()).toEqual({ actorUrl: 'demo', token: '', view: 'all', saved: ['a', 'b'] });
    expect(savePreviewLinks(tab, [])).toBe(true);
    expect(tab.record()).toEqual({ actorUrl: 'demo', token: '', view: 'all' });
  });
  it('writes nothing when the tab is not remembered', () => {
    const tab = store();
    expect(savePreviewLinks(tab, ['a'])).toBe(false);
    expect(tab.record()).toBeUndefined();
  });
});
