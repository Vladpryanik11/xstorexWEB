import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  reduced.value = false;
  vi.restoreAllMocks();
});

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

  it('on iPhone: three short steps, «Установить» to payment and «Войти» for those who paid', () => {
    ua(IPHONE);
    render(<IconGrid apps={[app]} label="Раздел" />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    const dialog = screen.getByRole('dialog');
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
    expect(within(dialog).queryByText(/только на iPhone/)).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Установить' })).toHaveAttribute(
      'href',
      '/pricing?app=testovoe-prilozhenie-1',
    );
    expect(within(dialog).getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/signin?next=%2Fapp%2Ftestovoe-prilozhenie-1',
    );
  });

  it('on a computer: says the app installs on iPhone or iPad', () => {
    ua(WINDOWS);
    render(<IconGrid apps={[app]} label="Раздел" />);
    fireEvent.click(screen.getByRole('button', { name: /Тестовое приложение 1/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Установить можно только на iPhone или iPad: откройте этот сайт на телефоне. Оплатить можно и здесь.',
    );
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
