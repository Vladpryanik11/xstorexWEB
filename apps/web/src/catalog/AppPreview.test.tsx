import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AccessResponse } from '@xstore/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getAccess: vi.fn<() => Promise<AccessResponse>>() }));
vi.mock('../checkout/browser-api', () => ({ browserApi: () => api }));

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => reduced.value,
}));

import { AppCardRow } from './AppCardRow';
import { AppPreview } from './AppPreview';
import { IconGrid } from './IconGrid';

const app = {
  slug: 'testovoe-prilozhenie-1',
  name: 'Тестовое приложение 1',
  subtitle: 'Подзаголовок приложения 1',
  iconUrl: '/icons/1.png',
};

const ua = (value: string) => vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(value);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0';

beforeEach(() => {
  api.getAccess.mockResolvedValue({ state: { kind: 'none' } });
});

afterEach(() => {
  reduced.value = false;
  vi.restoreAllMocks();
  api.getAccess.mockReset();
});

const openOnIphone = () => {
  ua(IPHONE);
  render(<IconGrid apps={[app]} label="Раздел" />);
  fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
  return screen.getByRole('dialog');
};

describe('install sheet', () => {
  it('a whole row opens the sheet: no link to a details page', () => {
    render(<AppCardRow app={app} />);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    const dialog = screen.getByRole('dialog', { name: 'Тестовое приложение 1' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Подзаголовок приложения 1');
    expect(within(dialog).queryByRole('link', { name: 'Подробнее' })).toBeNull();
    expect(dialog).toHaveAttribute('data-morph', 'true');
  });

  it('on iPhone: three short steps, «Установить» to the wizard and «Войти» for those who paid', async () => {
    const dialog = openOnIphone();
    const steps = within(dialog).getByRole('list', { name: 'Как установить' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Нажмите «Установить» и оплатите доступ. Регистрация не нужна.',
      'Подтвердите установку в окне на экране.',
      'Значок появится на экране «Домой».',
    ]);
    expect(within(dialog).queryByText(/с iPhone или iPad/)).toBeNull();
    expect(await within(dialog).findByRole('link', { name: 'Установить' })).toHaveAttribute(
      'href',
      '/get?app=testovoe-prilozhenie-1',
    );
    expect(within(dialog).getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/signin?next=%2F%3Fapp%3Dtestovoe-prilozhenie-1',
    );
    expect(api.getAccess).toHaveBeenCalledTimes(1);
  });

  it('asks for access only after the window opens', () => {
    ua(IPHONE);
    render(<IconGrid apps={[app]} label="Раздел" />);
    expect(api.getAccess).not.toHaveBeenCalled();
  });

  it('while access is loading the button is a neutral placeholder without a link', () => {
    api.getAccess.mockReturnValue(new Promise(() => {}));
    const dialog = openOnIphone();
    expect(within(dialog).queryByRole('link', { name: 'Установить' })).toBeNull();
    expect(within(dialog).queryByRole('link', { name: 'Войти' })).toBeNull();
    expect(within(dialog).getByText('Установить')).toHaveAttribute('aria-busy', 'true');
  });

  it('if access cannot be checked, behaves as for a guest', async () => {
    api.getAccess.mockRejectedValue(new Error('offline'));
    const dialog = openOnIphone();
    expect(await within(dialog).findByRole('link', { name: 'Установить' })).toHaveAttribute(
      'href',
      '/get?app=testovoe-prilozhenie-1',
    );
  });

  it('an unpaid order: «Продолжить оплату» to that order', async () => {
    api.getAccess.mockResolvedValue({ state: { kind: 'payment_pending', orderId: 'ord_7' } });
    const dialog = openOnIphone();
    expect(await within(dialog).findByRole('link', { name: 'Продолжить оплату' })).toHaveAttribute(
      'href',
      '/get/ord_7',
    );
    expect(within(dialog).queryByRole('link', { name: 'Войти' })).toBeNull();
  });

  it('a subscriber sees an inactive «Скоро можно будет установить»', async () => {
    api.getAccess.mockResolvedValue({
      state: {
        kind: 'active',
        until: new Date('2026-12-18T10:00:00Z'),
        subscriptionId: 'sub_1',
        deviceReady: false,
      },
    });
    const dialog = openOnIphone();
    expect(await within(dialog).findByText('Скоро можно будет установить')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(within(dialog).queryByText(/Регистрация не нужна/)).toBeNull();
    expect(dialog).toHaveTextContent('Доступ активен до 18 декабря 2026');
  });

  it('on a computer: installs from iPhone or iPad, «Оформить доступ» here', async () => {
    ua(WINDOWS);
    render(<IconGrid apps={[app]} label="Раздел" />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Установить можно с iPhone или iPad');
    expect(within(dialog).queryByRole('list', { name: 'Как установить' })).toBeNull();
    expect(await within(dialog).findByRole('link', { name: 'Оформить доступ' })).toHaveAttribute(
      'href',
      '/get?app=testovoe-prilozhenie-1',
    );
    expect(within(dialog).getByRole('link', { name: 'Войти' })).toBeInTheDocument();
  });

  it('opens by itself for a shared link and has no trigger then', () => {
    render(<AppPreview {...app} variant="none" initialOpen />);
    expect(screen.queryByRole('button', { name: /Тестовое приложение 1/ })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Тестовое приложение 1' })).toBeInTheDocument();
  });

  it('Escape closes the sheet and returns focus to the icon', async () => {
    reduced.value = true;
    render(<IconGrid apps={[app]} label="Раздел" />);
    const trigger = screen.getByRole('button', { name: /Тестовое приложение 1/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('Escape removes the morphing sheet even if the exit animation never settles', async () => {
    render(<AppCardRow app={app} />);
    const trigger = screen.getByRole('button', { name: /Тестовое приложение 1/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-morph', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('does not morph under reduced motion', () => {
    reduced.value = true;
    render(<AppCardRow app={app} />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-morph', 'false');
  });
});
