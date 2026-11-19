import { describe, expect, it, vi } from 'vitest';
import { type ClaimTx, claimProvisional } from './claim-provisional.js';

type Target = { role: string; isProvisional: boolean; blockedAt: Date | null } | null;

function fakeTx(opts: {
  target?: Target;
  sources?: { id: string }[];
  subscriptions?: { id: string; userId?: string }[];
  rights?: { id: string; subscriptionId: string; startsAt: Date; expiresAt: Date }[];
}) {
  const calls: string[] = [];
  const locks: string[] = [];
  const updateMany = (name: string) =>
    vi.fn(async (_args: unknown) => {
      calls.push(name);
      return { count: name === 'subscription.updateMany' ? (opts.subscriptions ?? []).length : 1 };
    });
  const tx = {
    $executeRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push('lock');
      locks.push(String(values[0]));
      return 1;
    }),
    user: {
      findUnique: vi.fn(async () => {
        calls.push('user.findUnique');
        return opts.target === undefined
          ? { role: 'user', isProvisional: false, blockedAt: null }
          : opts.target;
      }),
      findMany: vi.fn(async (_args: unknown) => {
        calls.push('user.findMany');
        return opts.sources ?? [];
      }),
      updateMany: updateMany('user.updateMany'),
    },
    subscription: {
      findMany: vi.fn(async (_args: unknown) => {
        calls.push('subscription.findMany');
        return opts.subscriptions ?? [];
      }),
      updateMany: vi.fn(async (_args: unknown) => {
        calls.push('subscription.updateMany');
        return {
          count: (opts.subscriptions ?? []).filter((s) => s.userId !== 'v1').length,
        };
      }),
    },
    order: { updateMany: updateMany('order.updateMany') },
    device: { updateMany: updateMany('device.updateMany') },
    session: { deleteMany: updateMany('session.deleteMany') },
    entitlement: {
      findMany: vi.fn(async (_args: unknown) => {
        calls.push('entitlement.findMany');
        return [...(opts.rights ?? [])].sort(
          (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
        );
      }),
      update: vi.fn(async (_args: unknown) => {
        calls.push('entitlement.update');
        return {};
      }),
    },
  };
  return { tx, calls, locks };
}

describe('claimProvisional', () => {
  it('locks the email before reading anything', async () => {
    const { tx, calls, locks } = fakeTx({});
    await claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru');
    expect(calls[0]).toBe('lock');
    expect(locks[0]).toBe('a@b.ru');
  });

  it('selects only open provisional buyers of this email, never the target', async () => {
    const { tx } = fakeTx({});
    await claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru');
    expect(tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isProvisional: true,
          checkoutEmail: 'a@b.ru',
          email: null,
          role: 'user',
          blockedAt: null,
          id: { not: 'v1' },
        },
      }),
    );
  });

  it('moves nothing when there is nothing to claim', async () => {
    const { tx, calls } = fakeTx({});
    expect(await claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru')).toEqual({ moved: 0 });
    expect(calls.filter((c) => c.endsWith('updateMany') || c.endsWith('deleteMany'))).toEqual([]);
  });

  it('takes checkout and subscription locks in id order, then moves and closes', async () => {
    const { tx, calls, locks } = fakeTx({
      sources: [{ id: 'p1' }, { id: 'p2' }],
      subscriptions: [
        { id: 's1', userId: 'p1' },
        { id: 's2', userId: 'p2' },
      ],
    });
    const result = await claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru');
    expect(result).toEqual({ moved: 2 });
    expect(locks).toEqual(['a@b.ru', 'checkout:p1', 'checkout:p2', 's1', 's2']);
    expect(calls.indexOf('subscription.updateMany')).toBeGreaterThan(calls.lastIndexOf('lock'));

    const sources = { userId: { in: ['p1', 'p2'] } };
    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: sources,
      data: { userId: 'v1' },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: sources, data: { userId: 'v1' } });
    expect(tx.device.updateMany).toHaveBeenCalledWith({ where: sources, data: { userId: 'v1' } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: sources });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] } },
      data: { blockedAt: expect.any(Date) },
    });
  });

  it("locks the buyer's own subscriptions together with the moved ones, in id order", async () => {
    const { tx, locks } = fakeTx({
      sources: [{ id: 'p1' }],
      subscriptions: [
        { id: 'a-own', userId: 'v1' },
        { id: 'b-moved', userId: 'p1' },
        { id: 'c-own', userId: 'v1' },
      ],
    });
    const result = await claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru');
    expect(result).toEqual({ moved: 1 });
    expect(tx.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['p1', 'v1'] } },
        orderBy: { id: 'asc' },
      }),
    );
    expect(locks).toEqual(['a@b.ru', 'checkout:p1', 'a-own', 'b-moved', 'c-own']);
    // The chain is read only after every subscription involved is locked.
    expect(tx.entitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          revokedAt: null,
          subscriptionId: { in: ['a-own', 'b-moved', 'c-own'] },
        },
      }),
    );
  });

  it('chains several future rights after the buyer chain, keeping their length', async () => {
    const day = 24 * 60 * 60 * 1000;
    const base = Date.now();
    const at = (days: number) => new Date(base + days * day);
    const { tx } = fakeTx({
      sources: [{ id: 'p1' }],
      subscriptions: [
        { id: 'own', userId: 'v1' },
        { id: 'moved', userId: 'p1' },
      ],
      rights: [
        // The buyer's own access, with its own future renewal: the chain ends at +60.
        { id: 'o1', subscriptionId: 'own', startsAt: at(-1), expiresAt: at(30) },
        { id: 'o2', subscriptionId: 'own', startsAt: at(30), expiresAt: at(60) },
        // The guest's running period stays; its two waiting rights go after +60, one by one.
        { id: 'm1', subscriptionId: 'moved', startsAt: at(-2), expiresAt: at(28) },
        { id: 'm2', subscriptionId: 'moved', startsAt: at(28), expiresAt: at(58) },
        { id: 'm3', subscriptionId: 'moved', startsAt: at(58), expiresAt: at(68) },
      ],
    });
    await claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru');
    const updates = tx.entitlement.update.mock.calls.map(([args]) => args);
    expect(updates).toHaveLength(2);
    const [first, second] = updates as {
      where: { id: string };
      data: { startsAt: Date; expiresAt: Date };
    }[];
    const span = (u: typeof first) =>
      (u?.data.expiresAt.getTime() ?? 0) - (u?.data.startsAt.getTime() ?? 0);
    expect(first?.where.id).toBe('m2');
    expect(first?.data.startsAt.getTime()).toBe(at(60).getTime());
    expect(span(first)).toBe(30 * day);
    expect(second?.where.id).toBe('m3');
    expect(second?.data.startsAt.getTime()).toBe(first?.data.expiresAt.getTime());
    expect(span(second)).toBe(10 * day);
  });

  it('a future right after a gap past the chain keeps its dates', async () => {
    const day = 24 * 60 * 60 * 1000;
    const base = Date.now();
    const at = (days: number) => new Date(base + days * day);
    const { tx } = fakeTx({
      sources: [{ id: 'p1' }],
      subscriptions: [
        { id: 'own', userId: 'v1' },
        { id: 'moved', userId: 'p1' },
      ],
      rights: [
        { id: 'o1', subscriptionId: 'own', startsAt: at(-1), expiresAt: at(10) },
        { id: 'm1', subscriptionId: 'moved', startsAt: at(20), expiresAt: at(50) },
      ],
    });
    await claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru');
    expect(tx.entitlement.update).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['staff', { role: 'admin', isProvisional: false, blockedAt: null }],
    ['provisional', { role: 'user', isProvisional: true, blockedAt: null }],
    ['blocked', { role: 'user', isProvisional: false, blockedAt: new Date() }],
  ])('refuses a %s target', async (_name, target) => {
    const { tx, calls } = fakeTx({ target, sources: [{ id: 'p1' }] });
    await expect(claimProvisional(tx as unknown as ClaimTx, 'v1', 'a@b.ru')).rejects.toThrow();
    expect(calls).not.toContain('subscription.updateMany');
  });
});
