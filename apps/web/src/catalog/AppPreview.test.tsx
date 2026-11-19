import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AccessResponse } from '@xstore/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getAccess: vi.fn<() => Promise<AccessResponse>>() }));
vi.mock('../checkout/browser-api', () => ({ browserApi: () => api }));
// Records the access every render saw, to catch a frame with a previous answer.
const seen = vi.hoisted(() => ({ kinds: [] as string[] }));
vi.mock('../app-page/install-button-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app-page/install-button-state')>();
  return {
    installButtonState: (ctx: Parameters<typeof actual.installButtonState>[0]) => {
      seen.kinds.push(ctx.access.kind);
      return actual.installButtonState(ctx);
    },
  };
});

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

const ACTIVE: AccessResponse = {
  state: {
    kind: 'active',
    until: new Date('2026-12-18T10:00:00Z'),
    subscriptionId: 'sub_1',
    device: { model: 'iPhone 15 Pro', family: 'iphone', ready: true, needsHelp: false },
  },
};

type Bound = Extract<AccessResponse['state'], { kind: 'active' }>['device'];
const subscriber = (device: Bound): AccessResponse => ({
  state: {
    kind: 'active',
    until: new Date('2026-12-18T10:00:00Z'),
    subscriptionId: 'sub_1',
    device,
  },
});
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/604.1';

function deferred() {
  let resolve: (value: AccessResponse) => void = () => {};
  const promise = new Promise<AccessResponse>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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
    const steps = await within(dialog).findByRole('list', { name: 'Как установить' });
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

  it('while access is loading: the body holds its place blank, no steps, no links', () => {
    api.getAccess.mockReturnValue(new Promise(() => {}));
    const dialog = openOnIphone();
    // The guest body only holds its place: hidden from assistive tech, drawn blank.
    expect(within(dialog).queryByRole('list', { name: 'Как установить' })).toBeNull();
    expect(dialog.querySelector('[data-placeholder]')).toHaveAttribute('aria-hidden', 'true');
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(dialog.querySelector('[aria-busy]:not([aria-live])')).toBeNull();
    expect(dialog.querySelector('[aria-live="polite"]')).toHaveAttribute('aria-busy', 'true');
  });

  it('on a computer the note waits for the answer too', () => {
    api.getAccess.mockReturnValue(new Promise(() => {}));
    ua(WINDOWS);
    render(<IconGrid apps={[app]} label="Раздел" />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    const note = screen.getByText(/Установить можно с iPhone или iPad/);
    expect(note).toHaveAttribute('aria-hidden', 'true');
    expect(note).toHaveAttribute('data-placeholder');
  });

  it('the actions are announced politely when the answer arrives', async () => {
    const dialog = openOnIphone();
    const link = await within(dialog).findByRole('link', { name: 'Установить' });
    const live = link.closest('[aria-live]');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('aria-busy', 'false');
  });

  it('when the answer arrives, focus moves from «Закрыть» to the main action', async () => {
    const answer = deferred();
    api.getAccess.mockReturnValue(answer.promise);
    const dialog = openOnIphone();
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    answer.resolve({ state: { kind: 'none' } });
    const link = await within(dialog).findByRole('link', { name: 'Установить' });
    // Focus moves in an effect after the link is in the DOM.
    await waitFor(() => expect(link).toHaveFocus());
  });

  it('does not take focus back once the visitor moved it', async () => {
    const answer = deferred();
    api.getAccess.mockReturnValue(answer.promise);
    const dialog = openOnIphone();
    const close = within(dialog).getByRole('button', { name: 'Закрыть' });
    fireEvent.keyDown(document, { key: 'Tab' });
    answer.resolve({ state: { kind: 'none' } });
    await within(dialog).findByRole('link', { name: 'Установить' });
    await new Promise((r) => setTimeout(r, 50));
    expect(close).toHaveFocus();
  });

  it('a reopened window never shows the previous answer', async () => {
    reduced.value = true;
    api.getAccess.mockResolvedValue(ACTIVE);
    ua(IPHONE);
    render(<IconGrid apps={[app]} label="Раздел" />);
    const trigger = screen.getByRole('button', { name: /Тестовое приложение 1/ });
    fireEvent.click(trigger);
    await screen.findByText('Скоро можно будет установить');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    api.getAccess.mockReturnValue(new Promise(() => {}));
    seen.kinds = [];
    fireEvent.click(trigger);
    expect(seen.kinds).not.toContain('active');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Доступ активен');
  });

  it('closing keeps the answer while the window animates away: no flash of the blank body', async () => {
    api.getAccess.mockResolvedValue(ACTIVE);
    render(<AppCardRow app={app} />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    await screen.findByText('Скоро можно будет установить');
    seen.kinds = [];
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(seen.kinds).not.toContain('none');
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
    expect(within(dialog).queryByRole('list', { name: 'Как установить' })).toBeNull();
    expect(dialog).toHaveTextContent('Оплата ещё не завершена.');
  });

  it('a subscriber sees an inactive «Скоро можно будет установить»', async () => {
    api.getAccess.mockResolvedValue(ACTIVE);
    const dialog = openOnIphone();
    expect(
      await within(dialog).findByRole('button', { name: 'Скоро можно будет установить' }),
    ).toBeDisabled();
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(dialog.querySelector('[aria-disabled]')).toBeNull();
    expect(within(dialog).queryByText(/Регистрация не нужна/)).toBeNull();
    expect(dialog).toHaveTextContent('Доступ активен до 18 декабря 2026');
  });

  it('a subscriber without a device: «Подключить iPhone» to the connect step', async () => {
    api.getAccess.mockResolvedValue(subscriber(null));
    const dialog = openOnIphone();
    expect(await within(dialog).findByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
      'href',
      '/get/iphone',
    );
    expect(dialog).toHaveTextContent('Доступ активен до 18 декабря 2026');
    expect(within(dialog).queryByRole('link', { name: 'Войти' })).toBeNull();
  });

  it('on an iPad the subscriber connects «iPad»', async () => {
    api.getAccess.mockResolvedValue(subscriber(null));
    ua(IPAD);
    render(<IconGrid apps={[app]} label="Раздел" />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('link', { name: 'Подключить iPad' })).toHaveAttribute(
      'href',
      '/get/iphone',
    );
  });

  it('while the iPhone is prepared the button is inactive', async () => {
    api.getAccess.mockResolvedValue(
      subscriber({ model: 'iPhone 15 Pro', family: 'iphone', ready: false, needsHelp: false }),
    );
    const dialog = openOnIphone();
    expect(
      await within(dialog).findByRole('button', { name: 'Готовим ваш iPhone, обычно до 24 часов' }),
    ).toBeDisabled();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it('on a computer: installs from iPhone or iPad, «Оформить доступ» here', async () => {
    ua(WINDOWS);
    render(<IconGrid apps={[app]} label="Раздел" />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText(/Установить можно с iPhone или iPad/);
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
