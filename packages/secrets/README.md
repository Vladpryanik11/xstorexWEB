# @xstore/secrets

Серверная библиотека шифрования секретов (файлы поставщика сертификатов, ключи Apple). Node.js 24+, ESM. Пакет не подключает API, воркер или базу данных.

`loadKeyring(process.env)` вызывается при старте доверенного процесса. Нужны `MASTER_KEY_CURRENT` (положительная целая версия) и `MASTER_KEY_V<n>` (ровно 32 байта, канонический base64). Все переданные старые ключи тоже проверяются; отсутствующий текущий ключ останавливает запуск. Реальные ключи генерируются и передаются вне git.

```ts
import { loadKeyring } from '@xstore/secrets';
import { encryptSecret } from '@xstore/secrets/encrypt';
// Только apps/api/src/apple и apps/worker:
import { decryptSecret, reencrypt } from '@xstore/secrets/decrypt';
```

Формат: `v<version>.<iv base64url>.<tag base64url>.<ciphertext base64url>`. AES-256-GCM; новый случайный IV 12 байт на каждую запись, тег 16 байт. Расшифровка возвращает Buffer; владелец очищает его после использования. `reencrypt` очищает свой временный открытый буфер. Ошибки формата, отсутствующего ключа и нарушения целостности различаются по классу, без исходных значений и причин от криптографической библиотеки.

Корневой экспорт не предоставляет расшифровку; browser-экспорты отключены. Это не заменяет правило контроля импортов.

## Проверка

После установки зависимостей из корня: `pnpm --filter @xstore/secrets test`, `pnpm --filter @xstore/secrets typecheck`, `pnpm --filter @xstore/secrets build`.

## Где используется

- Шифрование (`@xstore/secrets/encrypt`) — где угодно на сервере.
- Расшифровка (`@xstore/secrets/decrypt`) — только `apps/api/src/apple/**` и `apps/worker/src/**`; правило Biome `noRestrictedImports` в `biome.json`.
- Переменные `MASTER_KEY_CURRENT` и `MASTER_KEY_V<n>` — в `.env.example`. CLI ротации — до запуска (Н6).
