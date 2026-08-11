import type { Request, Response } from "express";
import type { QueryFilter } from "mongoose";
import { Doctor } from "../models/Doctor.js";
import { Patient, type IPatient } from "../models/Patient.js";
import { ApiError } from "../utils/ApiError.js";
import { buildPaginationMeta, sendSuccess } from "../utils/response.js";
import {
  buildDateRange,
  buildSearchFilter,
  parsePagination,
  queryString,
} from "../utils/query.js";
import type { UpdatePatientInput } from "../schemas/patientSchema.js";

/** Express 5 widens `:id` to string | string[]; every route here is a plain :id. */
type IdRequest = Request<{ id: string }>;

const SEARCH_FIELDS = ["name", "phone"] as const;

/**
 * The patients table shows a doctor column, so the doctor is populated on every
 * read instead of the client issuing one lookup per row. Only the two fields the
 * UI renders are selected — pulling the whole doctor document would multiply the
 * payload of a 50-row page for nothing.
 */
const DOCTOR_FIELDS = "name specialization";

/**
 * Same incremental build as the doctors list: an absent param adds no key, so
 * `{}` means unfiltered and every combination of search + condition + doctor +
 * date range composes as an AND for free.
 */
function buildPatientFilter(
  query: Record<string, unknown>,
): QueryFilter<IPatient> {
  const filter: QueryFilter<IPatient> = {};

  const search = queryString(query.search);
  if (search) {
    filter.$or = buildSearchFilter(search, SEARCH_FIELDS);
  }

  const condition = queryString(query.condition);
  if (condition) {
    filter.condition = condition;
  }

  // A malformed id throws a CastError, which errorHandler renders as a 400 —
  // the right answer for a bad query param, and cheaper than a pre-flight check.
  const doctorId = queryString(query.doctorId);
  if (doctorId) {
    filter.doctor = doctorId;
  }

  const createdAt = buildDateRange(
    queryString(query.startDate),
    queryString(query.endDate),
  );
  if (createdAt) {
    filter.createdAt = createdAt;
  }

  return filter;
}

/**
 * GET /patients — search, filters, pagination.
 *
 * Promise.all runs the page query and the count concurrently rather than
 * serially; .lean() skips document hydration we would only serialise to JSON.
 * doctor, condition and createdAt are all indexed on the model, so the filter
 * and the sort are index-backed.
 */
export async function getPatients(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = buildPatientFilter(req.query);

  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Patient.countDocuments(filter),
  ]);

  sendSuccess(res, patients, 200, buildPaginationMeta(page, limit, total));
}

export async function getPatientById(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const patient = await Patient.findById(req.params.id)
    .populate("doctor", DOCTOR_FIELDS)
    .lean();

  if (!patient) {
    throw ApiError.notFound("Patient not found");
  }

  sendSuccess(res, patient);
}

/**
 * PUT /patients/:id — partial update, including reassignment to another doctor.
 *
 * A `doctor` in the body is checked before the write: Mongoose casts the id but
 * does not verify the referenced document exists, so without this a typo'd id
 * would store a dangling reference that populate resolves to null and the
 * analytics counts would never see.
 */
export async function updatePatient(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const updates = req.body as UpdatePatientInput;

  if (updates.doctor) {
    const exists = await Doctor.exists({ _id: updates.doctor });
    if (!exists) {
      throw ApiError.notFound("Doctor not found");
    }
  }

  const patient = await Patient.findByIdAndUpdate(req.params.id, updates, {
    // new: return the updated document. runValidators: findByIdAndUpdate skips
    // schema validators by default, so age/gender bounds would go unchecked.
    new: true,
    runValidators: true,
  })
    .populate("doctor", DOCTOR_FIELDS)
    .lean();

  if (!patient) {
    throw ApiError.notFound("Patient not found");
  }

  sendSuccess(res, patient);
}

export async function deletePatient(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const patient = await Patient.findByIdAndDelete(req.params.id).lean();

  if (!patient) {
    throw ApiError.notFound("Patient not found");
  }

  sendSuccess(res, { _id: patient._id });
}

/**
 * GET /patients/meta/filters — distinct conditions for the frontend dropdown.
 * Mirrors /doctors/meta/filters: deriving options from a paginated list would
 * only ever surface the current page's values.
 */
export async function getPatientFilterOptions(
  _req: Request,
  res: Response,
): Promise<void> {
  const conditions = await Patient.distinct("condition");

  sendSuccess(res, { conditions: conditions.sort() });
}
