import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, emailSchema } from '@xstore/shared';
import { Redis } from 'ioredis';
import { DomainError } from '../common/domain-error.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { REDIS } from '../infra/redis.provider.js';
import { NotifyService } from '../notifications/notify.service.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';

// Compare-and-set after Node's timing-safe comparison: concurrent verification
// cannot consume a successful code twice or lose increments of wrong attempts.
const VERIFY = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
if raw ~= ARGV[1] then return 2 end
if ARGV[2] == '1' then redis.call('DEL', KEYS[1]); return 1 end
local data = cjson.decode(raw)
data.attempts = data.attempts + 1
if data.attempts >= 5 then redis.call('DEL', KEYS[1])
else redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL') end
return 0`;

@Injectable()
export class EmailCodeService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly notify: NotifyService,
    private readonly limiter: RateLimiter,
  ) {}

  private digest(email: string): string {
    return createHash('sha256').update(email).digest('hex');
  }
  private key(email: string): string {
    return `auth:code:${this.digest(email)}`;
  }
  private mac(email: string, code: string): Buffer {
    return createHmac('sha256', this.config.authSecret).update(`${email}:${code}`).digest();
  }

  async request(email: string): Promise<void> {
    email = emailSchema.parse(email);
    const limit = await this.limiter.consume(`email-request:email:${this.digest(email)}`, 3, 900);
    if (!limit.allowed) throw new EmailRequestLimit(limit.retryAfterSec);
    await this.issue(email);
  }

  async issue(email: string): Promise<void> {
    email = emailSchema.parse(email);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.set(
      this.key(email),
      JSON.stringify({ mac: this.mac(email, code).toString('hex'), attempts: 0 }),
      'EX',
      600,
    );
    await this.notify.send({ template: 'email-code', to: email, vars: { code } });
  }

  async verify(email: string, code: string): Promise<boolean> {
    email = emailSchema.parse(email);
    if (!/^\d{6}$/.test(code)) return false;
    const expected = this.mac(email, code);
    for (let attempt = 0; attempt < 10; attempt++) {
      const raw = await this.redis.get(this.key(email));
      if (!raw) return false;
      const data: { mac?: unknown; attempts?: unknown } = JSON.parse(raw);
      if (
        typeof data.mac !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.mac) ||
        !Number.isInteger(data.attempts) ||
        Number(data.attempts) < 0 ||
        Number(data.attempts) >= 5
      )
        return false;
      const matches = timingSafeEqual(expected, Buffer.from(data.mac, 'hex'));
      const result = Number(
        await this.redis.eval(VERIFY, 1, this.key(email), raw, matches ? '1' : '0'),
      );
      if (result !== 2) return result === 1;
    }
    return false;
  }
}

export class EmailRequestLimit extends DomainError {
  constructor(readonly retryAfterSec: number) {
    super(ErrorCode.RATE_LIMITED, 429);
  }
}
