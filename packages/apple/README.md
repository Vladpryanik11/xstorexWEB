# @xstore/apple

Самостоятельная серверная библиотека M3, задача 3. Node.js 24+, ESM. Включает ASC-клиент, ES256 JWT на 15 минут, RSA-2048/CSR/PKCS#12 и выбор аккаунта. Не импортирует Prisma, `shared`, `ios`, API или воркер.

```ts
import { createAscClient } from '@xstore/apple';

const client = createAscClient({ keyId, issuerId, privateKeyPem });
const devices = await client.listDevices();
```

Доверенный вызывающий код передаёт ключ в памяти и не журналирует аргументы. Клиент кэширует токен до 14 минут; автоматических повторов записи нет. Одна публичная операция ограничена 30 секундами, включая все страницы и чтение ответа. Пагинация ограничена исходным адресом и той же коллекцией; HTTP-перенаправления отключены. Ответы с ошибками и исключения транспорта не попадают в `AscError`: доступны только `kind`, `status`, `retryAfterSec` и безопасный русский текст. Сетевой сбой имеет `status: 0`, некорректный успешный ответ — `502`.

Методы:

- `listDevices()`, `findDeviceByUdid(udid)`, `registerDevice({ name, udid })`.
- `listCertificates()`, `createCertificate(csrPem)` — тип `DISTRIBUTION`.
- `findBundleId(identifier)`, `createWildcardBundleId(identifier = '*')`.
- `createAdHocProfile({ name, bundleIdAscId, certificateAscId, deviceAscIds })` — `IOS_APP_ADHOC`; возвращает id, Buffer профиля и Date окончания.
- `deleteProfile(id)`.

Ресурсы устройств, сертификатов и Bundle ID имеют форму Apple `{ type, id, attributes }`. `createWildcardBundleId('ru.xstorex.*')` — явный резервный вариант из плана. Автоматической подмены идентификатора нет: вызывающий модуль должен учесть обязательное изменение bundle id при подписи.

`pickAccount(accounts, want)` использует структурный `PickableAccount`, без зависимости от ещё не созданной модели БД. Нужны статус, тариф, срок членства, слоты iPhone/iPad, дата создания и сертификаты с `status`/`expiresAt`. Сначала отбираются действующие подходящие аккаунты, затем наиболее заполненный; при равенстве — самый старый. Входной массив не меняется. Просроченный сертификат не считается активным даже при старом статусе в БД.

## Проверка и тестовый сервер

После установки зависимостей: `pnpm --filter @xstore/apple test`, `pnpm --filter @xstore/apple typecheck`, `pnpm --filter @xstore/apple build`.

`pnpm --filter @xstore/apple fake-asc` запускает синтетический сервис на `127.0.0.1:3199`. Для тестов `startFakeAsc(0)` из `test/fake-asc.ts` выбирает свободный порт; доступны `seedDevices`, `failNext('auth' | 'rate_limited' | 'no_slots' | 'cert_limit')`, `close`. У `seedDevices` и `failNext` есть второй аргумент `{ keyId, issuerId }`, по умолчанию `TESTKEY`/`test-issuer`. Данные и ошибки изолированы по этим полям JWT. Сервис не проверяет подпись JWT и никогда не обращается в Apple. Временный локальный центр выдаёт сертификат для переданного CSR и CMS-профиль с выбранными UDID и сертификатом; они подходят для проверок разбора и PKCS#12, но не доверены устройствами Apple. Подпись JWT проверяется отдельно.

`baseUrl` разрешает только официальный HTTPS ASC и loopback-адрес для тестов. Переменные окружения пакет не читает; будущий воркер передаёт локальный `ASC_BASE_URL` только в тестовой среде.

## Подключение после M1/M2

- Обновить общий lockfile перед CI с `--frozen-lockfile`; здесь изменения ограничены новыми пакетами.
- Сопоставить `PickableAccount` с выборкой Prisma M3. В API/воркере добавить блокировку `withAccountLock`, очереди, аудит, шифрование ключей, уведомления и переходы статусов по `AscError.kind`.
- Сохранить разбор `.mobileprovision` в `packages/ios` (владелец этого пакета — M1/M2). В библиотеке Apple его нет, чтобы не пересекаться с работой над IPA.
- На тестовом Apple Developer аккаунте проверить реальные ответы 401/429/409, поддержку wildcard, сертификат `DISTRIBUTION` и создание Ad Hoc профиля. Синтетические тесты не подменяют этот этап M3.

Версии закреплены: `jose 6.2.15`, `node-forge 1.4.3`. Для forge взята поддерживаемая версия с исправлениями вместо `1.3.x` из первоначального плана.

Источники контрактов: [токены ASC](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests), [профили](https://developer.apple.com/documentation/appstoreconnectapi/profiles), [Bundle IDs](https://developer.apple.com/documentation/appstoreconnectapi/bundle-ids), [forge](https://github.com/digitalbazaar/forge).
