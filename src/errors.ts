import type { ApiErrorCode } from './schemas/common';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function upstreamStatusError(status: number, resource: 'work' | 'circle' | 'page'): ApiError {
  if (status === 429) {
    return new ApiError(429, 'RATE_LIMITED', 'DLsite temporarily rate limited the request.');
  }
  if (status === 404) {
    return resource === 'work'
      ? new ApiError(404, 'WORK_NOT_FOUND', 'The requested work was not found.')
      : resource === 'circle'
        ? new ApiError(404, 'CIRCLE_NOT_FOUND', 'The requested circle was not found.')
        : new ApiError(502, 'DLSITE_UPSTREAM_ERROR', 'DLsite returned an unexpected page.');
  }
  if (status === 403 || status === 408 || status >= 500) {
    return new ApiError(503, 'DLSITE_UNAVAILABLE', 'DLsite is temporarily unavailable.');
  }
  return new ApiError(502, 'DLSITE_UPSTREAM_ERROR', 'DLsite returned an unexpected response.');
}
