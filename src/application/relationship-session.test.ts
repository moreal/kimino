import { describe, expect, it, vi } from 'vitest';
import { createRelationshipSession } from './relationship-session';
import { GatewayRejected, GatewayUnreachable, SessionError } from './gateway-errors';
import type { RelationshipEvidence, RelationshipGateway } from './relationship-types';
import { deferred } from './session-doubles.test-support';

const self = 'https://home.example/me';
const target = 'https://other.example/actor';
const other = 'https://third.example/actor';
const request = { id: 'https://home.example/follow/1', target, rejected: false };
const empty = (): RelationshipEvidence => ({ following: [], requests: [] });
async function setup(evidence = empty()) {
  let live = true;
  const gateway: RelationshipGateway = {
    load: vi.fn().mockResolvedValue(evidence),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
  };
  const update = vi.fn();
  const controller = createRelationshipSession(gateway, self, { current: () => live, update });
  await controller.refresh();
  return {
    gateway,
    controller,
    update,
    end: () => {
      live = false;
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('relationship write lifecycle', () => {
  it('rejects invalid/self targets, unavailable ports and unread relationship state', async () => {
    const { gateway } = await setup();
    const controller = createRelationshipSession(gateway, self, {
      current: () => true,
      update: vi.fn(),
    });
    await expect(controller.follow(target)).rejects.toMatchObject({
      failure: { kind: 'relationship-state' },
    });
    await controller.refresh();
    await expect(controller.follow(self)).rejects.toMatchObject({
      failure: { kind: 'relationship-target' },
    });
    await expect(controller.follow('javascript:bad')).rejects.toMatchObject({
      failure: { kind: 'relationship-target' },
    });
    const unavailable = createRelationshipSession(undefined, self, {
      current: () => true,
      update: vi.fn(),
    });
    await expect(unavailable.follow(target)).rejects.toMatchObject({
      failure: { kind: 'relationship-unsupported' },
    });
    expect(gateway.follow).not.toHaveBeenCalled();
  });
  it('retains confirmed Follow without Location when readback fails, preventing duplicate sends', async () => {
    const { controller, gateway } = await setup();
    vi.mocked(gateway.load).mockRejectedValue(new GatewayUnreachable());
    await controller.follow(target);
    await flush();
    expect(controller.getSnapshot().confirmed[target]).toBe('follow');
    expect(controller.getSnapshot().phase).toBe('error');
    await expect(controller.follow(target)).rejects.toBeInstanceOf(SessionError);
    expect(gateway.follow).toHaveBeenCalledTimes(1);
  });
  it('keeps pending per target and serializes different-target POSTs', async () => {
    const { controller, gateway } = await setup();
    const posted = deferred<void>();
    vi.mocked(gateway.follow).mockReturnValueOnce(posted.promise);
    const first = controller.follow(target);
    const second = controller.follow(other);
    await flush();
    expect(controller.getSnapshot().pending).toEqual({ [target]: 'follow', [other]: 'follow' });
    await expect(controller.follow(target)).rejects.toMatchObject({ failure: { kind: 'busy' } });
    expect(gateway.follow).toHaveBeenCalledTimes(1);
    posted.resolve();
    await Promise.all([first, second]);
    expect(gateway.follow).toHaveBeenCalledTimes(2);
  });
  it('drops graph reads begun before a newer confirmed write', async () => {
    const { controller, gateway } = await setup();
    const stale = deferred<RelationshipEvidence>();
    const fresh = deferred<RelationshipEvidence>();
    vi.mocked(gateway.load).mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    const reading = controller.refresh();
    await controller.follow(target);
    stale.resolve({ following: [other], requests: [] });
    await reading;
    expect(controller.getSnapshot().following).not.toContain(other);
    expect(controller.getSnapshot().confirmed[target]).toBe('follow');
    fresh.resolve({ following: [target], requests: [request] });
    await flush();
    expect(controller.getSnapshot().following).toEqual([target]);
    expect(controller.getSnapshot().confirmed[target]).toBeUndefined();
  });
  it.each([new GatewayUnreachable(), new GatewayRejected(503), new GatewayRejected(408)])(
    'quarantines unknown Follow despite a negative refresh',
    async (error) => {
      const { controller, gateway } = await setup();
      vi.mocked(gateway.follow).mockRejectedValue(error);
      await expect(controller.follow(target)).rejects.toMatchObject({
        failure: { kind: 'relationship-uncertain' },
      });
      await controller.refresh();
      expect(controller.getSnapshot().uncertain[target]).toBe('follow');
      await expect(controller.follow(target)).rejects.toMatchObject({
        failure: { kind: 'relationship-uncertain' },
      });
      expect(gateway.follow).toHaveBeenCalledTimes(1);
      vi.mocked(gateway.load).mockResolvedValue({ following: [], requests: [request] });
      await controller.refresh();
      expect(controller.getSnapshot().uncertain[target]).toBeUndefined();
    },
  );
  it('permits deliberate retry after definite refusal and after a matched Reject', async () => {
    const { controller, gateway } = await setup({
      following: [],
      requests: [{ ...request, rejected: true }],
    });
    vi.mocked(gateway.follow).mockRejectedValueOnce(new GatewayRejected(403));
    await expect(controller.follow(target)).rejects.toMatchObject({
      failure: { kind: 'http', status: 403 },
    });
    expect(controller.getSnapshot().uncertain[target]).toBeUndefined();
    await controller.follow(target);
    expect(gateway.follow).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().confirmed[target]).toBe('follow');
  });
  it('does not use an old rejected Follow to resolve uncertainty from its retry', async () => {
    const { controller, gateway } = await setup({
      following: [],
      requests: [{ ...request, rejected: true }],
    });
    vi.mocked(gateway.follow).mockRejectedValueOnce(new GatewayUnreachable());
    await expect(controller.follow(target)).rejects.toBeInstanceOf(SessionError);
    await controller.refresh();
    expect(controller.getSnapshot().uncertain[target]).toBe('follow');
  });
  it('requires exactly one original Follow for Undo and preserves evidence on read failure', async () => {
    const { controller, gateway } = await setup({ following: [target], requests: [] });
    await expect(controller.unfollow(target)).rejects.toMatchObject({
      failure: { kind: 'relationship-state' },
    });
    vi.mocked(gateway.load).mockResolvedValue({
      following: [target],
      requests: [request, { ...request, id: 'https://home.example/follow/2' }],
    });
    await controller.refresh();
    await expect(controller.unfollow(target)).rejects.toMatchObject({
      failure: { kind: 'relationship-state' },
    });
    vi.mocked(gateway.load).mockResolvedValue({ following: [target], requests: [request] });
    await controller.refresh();
    vi.mocked(gateway.load).mockRejectedValue(new GatewayUnreachable());
    await controller.unfollow(target);
    await flush();
    expect(gateway.unfollow).toHaveBeenCalledWith(request);
    expect(controller.getSnapshot().confirmed[target]).toBe('unfollow');
    expect(controller.getSnapshot().requests).toEqual([request]);
    expect(controller.getSnapshot().following).toEqual([target]);
  });
  it('withdraws the unique active retry while ignoring an older rejected request', async () => {
    const active = { ...request, id: 'https://home.example/follow/retry' };
    const { controller, gateway } = await setup({
      following: [target],
      requests: [{ ...request, rejected: true }, active],
    });
    await controller.unfollow(target);
    expect(gateway.unfollow).toHaveBeenCalledExactlyOnceWith(active);
  });
  it('clears unknown Undo only when neither membership nor active request remains', async () => {
    const { controller, gateway } = await setup({ following: [target], requests: [request] });
    vi.mocked(gateway.unfollow).mockRejectedValueOnce(new GatewayUnreachable());
    await expect(controller.unfollow(target)).rejects.toBeInstanceOf(SessionError);
    vi.mocked(gateway.load).mockResolvedValue({ following: [], requests: [request] });
    await controller.refresh();
    expect(controller.getSnapshot().uncertain[target]).toBe('unfollow');
    vi.mocked(gateway.load).mockResolvedValue(empty());
    await controller.refresh();
    expect(controller.getSnapshot().uncertain[target]).toBeUndefined();
  });
  it('withholds Follow for either membership or a surviving pending request', async () => {
    const { controller, gateway } = await setup({ following: [target], requests: [] });
    await expect(controller.follow(target)).rejects.toMatchObject({
      failure: { kind: 'relationship-state' },
    });
    vi.mocked(gateway.load).mockResolvedValue({ following: [], requests: [request] });
    await controller.refresh();
    await expect(controller.follow(target)).rejects.toMatchObject({
      failure: { kind: 'relationship-state' },
    });
    expect(gateway.follow).not.toHaveBeenCalled();
  });
  it('invalidates a graph read started during an ultimately uncertain write', async () => {
    const { controller, gateway } = await setup({ following: [target], requests: [request] });
    const posted = deferred<void>();
    const reading = deferred<RelationshipEvidence>();
    vi.mocked(gateway.unfollow).mockReturnValueOnce(posted.promise);
    vi.mocked(gateway.load).mockReturnValueOnce(reading.promise);
    const writing = controller.unfollow(target);
    await flush();
    const refresh = controller.refresh();
    posted.reject(new GatewayUnreachable());
    await expect(writing).rejects.toBeInstanceOf(SessionError);
    reading.resolve(empty());
    await refresh;
    expect(controller.getSnapshot().uncertain[target]).toBe('unfollow');
    expect(controller.getSnapshot().following).toEqual([target]);
    expect(controller.getSnapshot().phase).toBe('ready');
  });
  it('lands acceptance before background reconciliation settles', async () => {
    const { controller, gateway, update } = await setup();
    const read = deferred<RelationshipEvidence>();
    vi.mocked(gateway.load).mockReturnValueOnce(read.promise);
    await controller.follow(target);
    expect(controller.getSnapshot().confirmed[target]).toBe('follow');
    expect(controller.getSnapshot().pending[target]).toBeUndefined();
    expect(update.mock.calls.some(([state]) => state.confirmed[target] === 'follow')).toBe(true);
    read.resolve(empty());
    await flush();
    expect(controller.getSnapshot().confirmed[target]).toBe('follow');
  });
  it('ignores graph read results from an ended account', async () => {
    const { controller, gateway, update, end } = await setup();
    const read = deferred<RelationshipEvidence>();
    vi.mocked(gateway.load).mockReturnValueOnce(read.promise);
    const refreshing = controller.refresh();
    end();
    update.mockClear();
    read.resolve({ following: [target], requests: [request] });
    await refreshing;
    expect(update).not.toHaveBeenCalled();
    expect(controller.getSnapshot().following).toEqual([]);
  });
  it('never lands old-session writes, reads or queued POSTs', async () => {
    const { controller, gateway, update, end } = await setup();
    const posted = deferred<void>();
    vi.mocked(gateway.follow).mockReturnValueOnce(posted.promise);
    const first = controller.follow(target);
    const second = controller.follow(other);
    await flush();
    end();
    update.mockClear();
    posted.resolve();
    await expect(first).rejects.toMatchObject({ failure: { kind: 'not-connected' } });
    await expect(second).rejects.toMatchObject({ failure: { kind: 'not-connected' } });
    expect(update).not.toHaveBeenCalled();
    expect(gateway.follow).toHaveBeenCalledTimes(1);
    expect(gateway.load).toHaveBeenCalledTimes(1);
  });
});
