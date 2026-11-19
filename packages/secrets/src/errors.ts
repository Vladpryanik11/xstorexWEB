export class SecretFormatError extends Error {
  constructor() {
    super('Неверный формат зашифрованных данных');
    this.name = 'SecretFormatError';
  }
}

export class SecretKeyMissingError extends Error {
  constructor(variable: string) {
    super(`Отсутствует или некорректен ключ ${variable}`);
    this.name = 'SecretKeyMissingError';
  }
}

export class SecretTamperedError extends Error {
  constructor() {
    super('Не удалось проверить зашифрованные данные');
    this.name = 'SecretTamperedError';
  }
}
