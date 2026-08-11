import type { Response } from "express";
import type { ApiSuccessBody, PaginationMeta } from "../types/index.js";

/**
 * Every successful response in this API is
 * { success: true, data, meta? } — see 00-overview-and-api-contract.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: PaginationMeta,
): Response {
  const body: ApiSuccessBody<T> = meta
    ? { success: true, data, meta }
    : { success: true, data };

  return res.status(statusCode).json(body);
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
