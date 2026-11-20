# План: статусы ожидания iPhone в «Мой доступ»

Спецификация: `docs/superpowers/specs/2026-11-19-certificate-supplier-design.md` §4.1 (решения владельца 20.11). Исполнитель Claude. TDD.

1. `packages/shared`: `AccessDevice.waitingSince?: Date` (только пока устройство не готово); `accessState` принимает `waitingSince` у устройства; схема JSON. Чистая функция `waitPhase(since, now)` → `{ readyBy, phase: 'preparing' | 'almost' | 'late', hoursLeft, progress }` (20 ч и 24 ч). Модульные тесты.
2. `apps/api`: `CheckoutService.access` берёт у устройства сертификаты и момент привязки подписки и считает `since` той же функцией, что админка (`waitingState`), без проверки живой подписки. Интеграционный тест `/access`: новое устройство → `waitingSince` = момент привязки; после загрузки файлов поля нет.
3. `packages/mail`: шаблон `device_preparing` («{iPhone} подключён, готовим его»); `DeviceWaitingNotifier.deviceBound` отправляет его покупателю всегда, письмо владельцу — как раньше, если задан `ADMIN_NOTIFY_EMAIL`. Тесты шаблона и интеграционный.
4. `apps/web`: в `AccessCard` блок шагов и состояния из `waitPhase` (время в поясе браузера, `formatRuDateTime`); в мастере строка «Будет готов до …». Тесты компонентов. Скриншоты 390 и 1280.
5. Проверки: lint, typecheck, unit; integration и e2e в CI. PR.
