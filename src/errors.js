/**
 * Typed-ish errors. Every failure path in this PoC raises an AppError with a
 * stable `code`, so the log, the HTTP API and the exit status all agree.
 */

export const ErrorCode = {
  TOOLCHAIN: 'TOOLCHAIN',
  NO_DEVICE: 'NO_DEVICE',
  MULTIPLE_DEVICES: 'MULTIPLE_DEVICES',
  DEVICE_UNAUTHORIZED: 'DEVICE_UNAUTHORIZED',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  NOT_USB: 'NOT_USB',
  ADB_FAILED: 'ADB_FAILED',
  SCREEN_OFF: 'SCREEN_OFF',
  SESSION_START: 'SESSION_START',
  SESSION_LOST: 'SESSION_LOST',
  PROTOCOL: 'PROTOCOL',
  POINTER_LIMIT: 'POINTER_LIMIT',
  POINTER_STATE: 'POINTER_STATE',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL: 'INTERNAL',
};

export class AppError extends Error {
  /**
   * @param {string} code one of ErrorCode
   * @param {string} message human readable, single line
   * @param {{hint?: string, cause?: unknown, details?: Record<string, unknown>}} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.hint = extra.hint ?? null;
    this.details = extra.details ?? null;
    if (extra.cause !== undefined) {
      this.cause = extra.cause;
    }
  }

  /** @returns {{code: string, message: string, hint: string | null, details: Record<string, unknown> | null}} */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      details: this.details,
    };
  }
}

/**
 * Wrap a non-AppError into an AppError so callers only handle one shape.
 * @param {unknown} error
 * @param {string} [fallbackCode]
 * @returns {AppError}
 */
export function asAppError(error, fallbackCode = ErrorCode.INTERNAL) {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(fallbackCode, error.message, { cause: error });
  }
  return new AppError(fallbackCode, String(error));
}
