import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

/** Claves que nunca se escriben en un log, en cualquier nivel de anidamiento. */
const REDACTED_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'cookie',
  'secret',
  'clientsecret',
  'apikey',
  'privatekey',
  'ssn',
  'creditcard',
]);

/**
 * Logger estructurado JSON (ADR-016). Una linea por evento, con correlationId.
 * No se usa console.log en el resto de la aplicacion.
 */
@Injectable()
export class AppLogger {
  constructor(private readonly config: AppConfigService) {}

  fatal(event: string, context: Record<string, unknown> = {}): void {
    this.write('fatal', event, context);
  }

  error(event: string, context: Record<string, unknown> = {}): void {
    this.write('error', event, context);
  }

  warn(event: string, context: Record<string, unknown> = {}): void {
    this.write('warn', event, context);
  }

  info(event: string, context: Record<string, unknown> = {}): void {
    this.write('info', event, context);
  }

  debug(event: string, context: Record<string, unknown> = {}): void {
    this.write('debug', event, context);
  }

  private write(level: LogLevel, event: string, context: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.get('LOG_LEVEL')]) {
      return;
    }

    const entry = {
      level,
      time: new Date().toISOString(),
      app: this.config.get('APP_NAME'),
      event,
      ...(this.redact(context) as Record<string, unknown>),
    };

    const serialized = this.config.get('LOG_PRETTY')
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    process.stdout.write(`${serialized}\n`);
  }

  private redact(value: unknown, depth = 0): unknown {
    if (depth > 6 || value === null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item, depth + 1));
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : this.redact(entryValue, depth + 1),
      ]),
    );
  }
}
