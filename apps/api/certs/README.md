# Сертификаты проверки ответа iPhone

Это публичные сертификаты центров сертификации. Закрытых ключей здесь нет.

- `AppleIPhoneDeviceCA.pem`: сертификат Apple iPhone Device CA из [документации Apple по Profile Service](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/iPhoneOTAConfiguration/profile-service/profile-service.html). SHA-256: `76:F2:7D:00:E1:33:3B:C8:8D:E0:E2:91:6C:38:C9:A7:F2:B7:57:74:C2:5A:79:4C:09:2A:80:E3:C4:C6:6C:CE`.
- `AppleIncRootCertificate.pem`: [Apple Root CA](https://www.apple.com/appleca/AppleIncRootCertificate.cer), как предусмотрено планом. SHA-256: `B0:B1:73:0E:CB:C7:FF:45:05:14:2C:49:F1:29:5E:6E:DA:6B:CA:ED:7E:2C:68:C5:BE:91:B5:A1:10:01:F0:24`.

По умолчанию `ENROLL_TRUST_ANCHORS_PATH` указывает на **Device CA**: подпись CMS и подпись конечного сертификата проверяются криптографически, сертификат устройства должен быть выпущен непосредственно закреплённым центром и не может быть CA. Сертификаты, вложенные в ответ устройства, сами по себе доверия не получают. Общее доверие всем сертификатам Apple Root CA не используется для входа.

Apple предписывает игнорировать даты действия встроенных device identity при этом протоколе. Это исключение применяется только при `purpose: 'apple-device'` и явно закреплённом центре устройств; обычный `verifyCms` продолжает проверять даты, цепочку и ограничения сертификатов.

Новая иерархия устройств должна быть проверена по официальному источнику и реальному ответу перед добавлением. Неизвестный центр отклоняется. Финальная проверка M2 на настоящем iPhone обязательна.
