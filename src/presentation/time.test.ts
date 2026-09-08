import { describe, expect, it } from 'vitest';
import { absoluteTime, relativeTime } from './time';

const now = new Date(2026, 8, 8, 12, 0, 0); // local noon, 2026-09-08
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const minute = 60_000,
  hour = 60 * minute,
  day = 24 * hour;

describe('relativeTime', () => {
  it('formats recent moments in Korean', () => {
    expect(relativeTime(ago(5_000), now)).toBe('방금 전');
    expect(relativeTime(ago(minute), now)).toBe('1분 전');
    expect(relativeTime(ago(59 * minute), now)).toBe('59분 전');
    expect(relativeTime(ago(hour), now)).toBe('1시간 전');
    expect(relativeTime(ago(23 * hour), now)).toBe('23시간 전');
  });
  it('switches to days after a full day', () => {
    expect(relativeTime(ago(day), now)).toBe('어제');
    expect(relativeTime(ago(47 * hour), now)).toBe('어제');
    expect(relativeTime(ago(2 * day), now)).toBe('2일 전');
    expect(relativeTime(ago(6 * day), now)).toBe('6일 전');
  });
  it('falls back to a calendar date beyond a week and adds the year for older posts', () => {
    expect(relativeTime(ago(7 * day), now)).toBe('9월 1일');
    expect(relativeTime(new Date(2026, 0, 3, 12).toISOString(), now)).toBe('1월 3일');
    expect(relativeTime(new Date(2025, 11, 31, 12).toISOString(), now)).toBe('2025년 12월 31일');
  });
  it('treats future or invalid timestamps safely', () => {
    expect(relativeTime(new Date(now.getTime() + hour).toISOString(), now)).toBe('방금 전');
    expect(relativeTime(undefined, now)).toBe('시간 정보 없음');
    expect(relativeTime('not a date', now)).toBe('시간 정보 없음');
  });
  it('accepts a numeric clock', () => {
    expect(relativeTime(ago(3 * minute), now.getTime())).toBe('3분 전');
  });
});

describe('absoluteTime', () => {
  it('renders a full date for titles', () => {
    expect(absoluteTime(now.toISOString())).toMatch(/2026년 9월 8일/);
    expect(absoluteTime('')).toBe('시간 정보 없음');
  });
});
