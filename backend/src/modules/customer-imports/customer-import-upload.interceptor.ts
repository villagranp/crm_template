import { BadRequestException, type CallHandler, type ExecutionContext, HttpException, HttpStatus, Injectable, type NestInterceptor } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';

import { VALIDATION_FAILED } from '@/common/filters/validation-exception.factory';

import { fileTooLargeError, IMPORT_FILE_FIELD, importsDisabledError } from './customer-import-errors';
import { CustomerImportsService } from './customer-imports.service';

/**
 * Límites de `multipart` de la subida de una carga (06 F.1 §3, H.2): un único
 * campo `file`, sin campos de texto, en memoria (nunca disco temporal) y cortado
 * en el tamaño **efectivo** de `crm.importaciones.max_mb` (≤ 10 MB, igual que
 * `client_max_body_size` de NGINX).
 */
export const IMPORT_UPLOAD_LIMITS = {
  files: 1,
  fields: 0,
  parts: 2,
  fieldNameSize: 50,
  headerPairs: 50,
} as const;

/** Archivo que deja multer en `@UploadedFile()` (forma mínima; no se depende de `@types/multer`). */
export interface UploadedImportMulterFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/** Errores de multer → contrato: `413 FILE_TOO_LARGE`; archivo de más, campo extra o `multipart` mal formado → `400`. */
export function translateImportUploadError(error: unknown, maxBytes: number): unknown {
  if (error instanceof HttpException && error.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE) return fileTooLargeError(maxBytes);
  if (error instanceof BadRequestException) return importUploadValidationError(error.message);
  return error;
}

export function importUploadValidationError(issue: string): BadRequestException {
  return new BadRequestException({ code: VALIDATION_FAILED, message: 'Request validation failed', details: [{ field: IMPORT_FILE_FIELD, issue }] });
}

/**
 * Corre **después** de los guards globales (autenticación y permisos): nunca se
 * lee el cuerpo de quien no puede subir. Comprueba la habilitación (RN-06.1)
 * antes de leer el archivo y lee los parámetros en cada petición (DC-3).
 */
@Injectable()
export class CustomerImportUploadInterceptor implements NestInterceptor {
  private readonly multerBySize = new Map<number, NestInterceptor>();

  constructor(private readonly imports: CustomerImportsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const limits = await this.imports.limits();
    if (!limits.enabled) throw importsDisabledError();
    try {
      return await this.multerFor(limits.maxBytes).intercept(context, next);
    } catch (error) {
      throw translateImportUploadError(error, limits.maxBytes);
    }
  }

  private multerFor(fileSize: number): NestInterceptor {
    let interceptor = this.multerBySize.get(fileSize);
    if (!interceptor) {
      // `defParamCharset: 'utf8'`: nombres con tildes sin mojibake (como los adjuntos).
      const MulterFileInterceptor = FileInterceptor(IMPORT_FILE_FIELD, { limits: { ...IMPORT_UPLOAD_LIMITS, fileSize }, defParamCharset: 'utf8' });
      interceptor = new MulterFileInterceptor();
      this.multerBySize.set(fileSize, interceptor);
    }
    return interceptor;
  }
}
