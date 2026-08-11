/**
 * Shared response-shape types — the backend half of the API contract in
 * 00-overview-and-api-contract. The client repo hand-writes a matching copy in
 * its own src/types/index.ts: two repos means no shared package, and copying
 * ~40 lines beats publishing one at this scope.
 *
 * Phase 2 adds the authenticated-request typing in src/types/express.d.ts
 * (declaration merging), not here.
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  message: string;
}

export type ApiResponse<T> = ApiSuccessBody<T> | ApiErrorBody;
