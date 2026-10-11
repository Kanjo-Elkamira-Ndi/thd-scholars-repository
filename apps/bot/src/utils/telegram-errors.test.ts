import { describe, expect, it } from 'vitest';
import { isJoinRequestGone, isMessageGone } from './telegram-errors';

describe('isJoinRequestGone', () => {
  it('matches HIDE_REQUESTER_MISSING', () => {
    expect(isJoinRequestGone(new Error('400: Bad Request: HIDE_REQUESTER_MISSING'))).toBe(true);
  });

  it('matches USER_ALREADY_PARTICIPANT', () => {
    expect(isJoinRequestGone({ description: 'Bad Request: USER_ALREADY_PARTICIPANT' })).toBe(true);
  });

  it('matches a "no join request" description', () => {
    expect(isJoinRequestGone({ response: { description: 'Bad Request: no join request' } })).toBe(
      true,
    );
  });

  it('matches case-insensitively', () => {
    expect(isJoinRequestGone({ description: 'hide_requester_missing' })).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isJoinRequestGone(new Error('429 Too Many Requests'))).toBe(false);
    expect(isJoinRequestGone(new Error('chat not found'))).toBe(false);
    expect(isJoinRequestGone(undefined)).toBe(false);
    expect(isJoinRequestGone('')).toBe(false);
  });
});

describe('isMessageGone', () => {
  it('matches "message to delete not found"', () => {
    expect(isMessageGone(new Error('400: Bad Request: message to delete not found'))).toBe(true);
  });

  it('matches a bare "message not found" description', () => {
    expect(isMessageGone({ response: { description: 'Bad Request: message not found' } })).toBe(
      true,
    );
  });

  it('matches case-insensitively', () => {
    expect(isMessageGone({ description: 'MESSAGE NOT FOUND' })).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isMessageGone(new Error('429 Too Many Requests'))).toBe(false);
    expect(isMessageGone(null)).toBe(false);
  });
});
