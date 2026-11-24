import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HowSheet } from './HowSheet';

// Owner 2026-11-24 09:12: «Как это работает?» under the button opens a window over the page, so
// nobody leaves the first screen.
it('opens a window over the page instead of leaving it', () => {
  render(<HowSheet />);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  expect(screen.getByRole('dialog', { name: 'Как это работает' })).toBeVisible();
});

// Owner 2026-11-24 11:38–11:56: the window explains the service in plain words, what it works by
// and why it is safe; the step-by-step instruction lives on the connect page.
it('says what the service is, what it works by and why it is safe', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent(
    'Удалённые из App Store и платные приложения — в одной подписке.',
  );
  expect(dialog).toHaveTextContent(
    'Ставятся прямо из Safari: без компьютера, без джейлбрейка и без входа в ваш Apple ID.',
  );
  const list = (name: string) =>
    within(within(dialog).getByRole('list', { name }))
      .getAllByRole('listitem')
      .map((li) => li.textContent?.replace(/^\d/, ''));
  expect(list('Как это устроено')).toEqual([
    'Официальный сертификат AppleПриложения подписаны сертификатом разработчика Apple. С ним Apple сама разрешает ставить приложения не через App Store.',
    'Ваш iPhone в списке разрешённыхПрофиль сообщает нам только номер iPhone. По нему мы добавляем ваш iPhone в список устройств.',
    'Приложения именно для васКаждое приложение подписываем под ваш iPhone, и оно ставится с сайта в один тап.',
  ]);
  expect(list('Почему это безопасно')).toEqual([
    'Доступа к iPhone у нас нет: фото, сообщения, пароли и Apple ID мы не видим.',
    'Профиль и режим разработчика — обычные настройки Apple. Удалить или выключить их можно в любой момент.',
    'Только официальные файлы приложений, без сторонних программ и взломанных версий.',
    'Гарантия на весь срок подписки.',
  ]);
  expect(within(dialog).queryByRole('button', { name: 'Дальше' })).toBeNull();
  expect(within(dialog).getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
    'href',
    '/get',
  );
});

it('closes with the cross', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
