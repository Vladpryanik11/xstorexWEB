import { describe, expect, it, vi } from 'vitest';
import { type ClaimTx, claimProvisional } from './claim-provisional.js';

type Target = { role: string; isProvisional: boolean; blockedAt: Date | null } | null;

function fakeTx(opts: {
  target?: Target;
  sources?: { id: string }[];
  subscriptions?: { id: string }[];
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
      updateMany: updateMany('subscription.updateMany'),
    },
    order: { updateMany: updateMany('order.updateMany') },
    device: { updateMany: updateMany('device.updateMany') },
    session: { deleteMany: updateMany('session.deleteMany') },
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
      subscriptions: [{ id: 's1' }, { id: 's2' }],
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
