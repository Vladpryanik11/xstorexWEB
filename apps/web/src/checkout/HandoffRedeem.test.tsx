import { act, render, screen } from '@testing-library/react';
import { ApiClientError } from '@xstore/shared';
import { expect, it, vi } from 'vitest';
import { HandoffRedeem, tokenFromHash } from './HandoffRedeem';

const TOKEN = 'T'.repeat(43);
const settle = () => act(async () => {});

it('signs in by the link, then opens the step without the token', async () => {
  const redeem = vi.fn(async () => undefined);
  const navigate = vi.fn();
  render(<HandoffRedeem token={TOKEN} redeem={redeem} navigate={navigate} />);
  expect(screen.getByText('Входим…')).toBeVisible();
  await settle();
  expect(redeem).toHaveBeenCalledWith({ token: TOKEN });
  expect(navigate).toHaveBeenCalledWith('/get/iphone');
});

it('an old or used link leads to sign-in with a note', async () => {
  const redeem = vi.fn(async () => {
    throw new ApiClientError(400, 'HANDOFF_INVALID', 'x');
  });
  const navigate = vi.fn();
  render(<HandoffRedeem token={TOKEN} redeem={redeem} navigate={navigate} />);
  await settle();
  expect(navigate).toHaveBeenCalledWith('/signin?next=/get/iphone&handoff=expired');
});

it('any other failure opens the step, which asks to sign in when needed', async () => {
  const redeem = vi.fn(async () => {
    throw new TypeError('offline');
  });
  const navigate = vi.fn();
  render(<HandoffRedeem token={TOKEN} redeem={redeem} navigate={navigate} />);
  await settle();
  expect(navigate).toHaveBeenCalledWith('/get/iphone');
});

it('reads the token from the fragment, never from the query', async () => {
  window.history.replaceState(null, '', `/get/iphone/continue#h=${TOKEN}`);
  const redeem = vi.fn(async () => undefined);
  const navigate = vi.fn();
  render(<HandoffRedeem redeem={redeem} navigate={navigate} />);
  await settle();
  expect(redeem).toHaveBeenCalledWith({ token: TOKEN });
  expect(tokenFromHash(`#h=${TOKEN}`)).toBe(TOKEN);
  expect(tokenFromHash('#h=short')).toBeNull();
  expect(tokenFromHash('')).toBeNull();
});

it('without a token opens the step', async () => {
  window.history.replaceState(null, '', '/get/iphone/continue');
  const redeem = vi.fn(async () => undefined);
  const navigate = vi.fn();
  render(<HandoffRedeem redeem={redeem} navigate={navigate} />);
  await settle();
  expect(redeem).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith('/get/iphone');
});
