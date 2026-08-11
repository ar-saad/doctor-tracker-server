import type { Request, Response } from "express";
import type { QueryFilter } from "mongoose";
import { Doctor, type IDoctor } from "../models/Doctor.js";
import { Patient, type IPatient } from "../models/Patient.js";
import { ApiError } from "../utils/ApiError.js";
import { buildPaginationMeta, sendSuccess } from "../utils/response.js";
import {
  buildDateRange,
  buildSearchFilter,
  parsePagination,
  queryString,
} from "../utils/query.js";
import type {
  CreateDoctorInput,
  UpdateDoctorInput,
} from "../schemas/doctorSchema.js";
import type { CreatePatientInput } from "../schemas/patientSchema.js";

/**
 * Express 5 types req.params values as `string | string[]` because of wildcard
 * routes. Every route here uses a plain `:id`, so the handlers declare the
 * narrower shape instead of casting at each use site.
 */
type IdRequest = Request<{ id: string }>;

/** Nested patient routes carry the doctor id as `id` and the patient as `patientId`. */
type DoctorPatientRequest = Request<{ id: string; patientId: string }>;

const SEARCH_FIELDS = ["name", "specialization", "hospital"] as const;

/**
 * Filters are built incrementally: an absent query param adds no key, so an
 * unfiltered request ends up with `{}` and every combination of search +
 * specialization + hospital + date range composes as an AND for free.
 */
function buildDoctorFilter(
  query: Record<string, unknown>,
): QueryFilter<IDoctor> {
  const filter: QueryFilter<IDoctor> = {};

  const search = queryString(query.search);
  if (search) {
    filter.$or = buildSearchFilter(search, SEARCH_FIELDS);
  }

  const specialization = queryString(query.specialization);
  if (specialization) {
    filter.specialization = specialization;
  }

  const hospital = queryString(query.hospital);
  if (hospital) {
    filter.hospital = hospital;
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
 * GET /doctors — search, filters, pagination.
 *
 * Two deliberate optimisations:
 *  - Promise.all: the page query and the count are independent, so they run
 *    concurrently instead of serially doubling the round trip.
 *  - .lean(): skips hydrating Mongoose documents we only serialise to JSON,
 *    which is the bulk of the per-document cost on a list endpoint.
 * The sort and filter fields (createdAt, specialization, hospital) are indexed
 * on the model, so the sort is index-backed rather than an in-memory sort.
 */
export async function getDoctors(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = buildDoctorFilter(req.query);

  const [doctors, total] = await Promise.all([
    Doctor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Doctor.countDocuments(filter),
  ]);

  sendSuccess(res, doctors, 200, buildPaginationMeta(page, limit, total));
}

export async function getDoctorById(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const doctor = await Doctor.findById(req.params.id).lean();

  if (!doctor) {
    throw ApiError.notFound("Doctor not found");
  }

  sendSuccess(res, doctor);
}

export async function createDoctor(req: Request, res: Response): Promise<void> {
  // A duplicate email throws Mongo's 11000, which errorHandler renders as a
  // clean 409 — no pre-flight findOne, and no race between the check and write.
  const doctor = await Doctor.create(req.body as CreateDoctorInput);

  sendSuccess(res, doctor, 201);
}

export async function updateDoctor(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const doctor = await Doctor.findByIdAndUpdate(
    req.params.id,
    req.body as UpdateDoctorInput,
    // new: return the updated document, not the pre-update one.
    // runValidators: findByIdAndUpdate skips schema validators by default.
    { new: true, runValidators: true },
  ).lean();

  if (!doctor) {
    throw ApiError.notFound("Doctor not found");
  }

  sendSuccess(res, doctor);
}

/**
 * DELETE /doctors/:id — cascades to that doctor's patients.
 *
 * Patients are meaningless without their doctor: orphans would still be counted
 * by /analytics/summary and would fail to populate, so the delete has to take
 * them with it. The doctor goes first, so a null return doubles as the 404
 * check and no second lookup is needed. The two deletes are not wrapped in a
 * transaction: the failure mode (patients outliving their doctor) is
 * recoverable, and a session is the fix if this ever grows past one cascade.
 */
export async function deleteDoctor(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const doctor = await Doctor.findByIdAndDelete(req.params.id).lean();

  if (!doctor) {
    throw ApiError.notFound("Doctor not found");
  }

  const { deletedCount } = await Patient.deleteMany({ doctor: doctor._id });

  sendSuccess(res, { _id: doctor._id, deletedPatients: deletedCount });
}

/** GET /doctors/:id/patients — paginated, same meta shape as every list. */
export async function getDoctorPatients(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const doctorId = req.params.id;

  // Without this an unknown id would return an empty page — indistinguishable
  // from a real doctor who has no patients yet.
  const exists = await Doctor.exists({ _id: doctorId });
  if (!exists) {
    throw ApiError.notFound("Doctor not found");
  }

  const { page, limit, skip } = parsePagination(req.query);
  const filter: QueryFilter<IPatient> = { doctor: doctorId };

  const [patients, total] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Patient.countDocuments(filter),
  ]);

  sendSuccess(res, patients, 200, buildPaginationMeta(page, limit, total));
}

/** POST /doctors/:id/patients — the only way a patient is created. */
export async function addPatientToDoctor(
  req: IdRequest,
  res: Response,
): Promise<void> {
  const doctorId = req.params.id;

  const exists = await Doctor.exists({ _id: doctorId });
  if (!exists) {
    throw ApiError.notFound("Doctor not found");
  }

  const patient = await Patient.create({
    ...(req.body as CreatePatientInput),
    doctor: doctorId,
  });

  sendSuccess(res, patient, 201);
}

/**
 * DELETE /doctors/:id/patients/:patientId — removes a patient from this
 * doctor's list.
 *
 * `doctor` is a required field on Patient, so there is no "unassign" state to
 * move the patient into: removing it from the list *is* deleting the document,
 * the same way deleteDoctor cascades.
 *
 * The delete is scoped by `doctor` rather than by `_id` alone, so a patient id
 * belonging to another doctor cannot be deleted through this doctor's URL. The
 * doctor is checked first only to keep the two 404s distinguishable — a scoped
 * miss alone could not tell "no such doctor" from "not your patient".
 */
export async function removePatientFromDoctor(
  req: DoctorPatientRequest,
  res: Response,
): Promise<void> {
  const { id: doctorId, patientId } = req.params;

  const exists = await Doctor.exists({ _id: doctorId });
  if (!exists) {
    throw ApiError.notFound("Doctor not found");
  }

  const patient = await Patient.findOneAndDelete({
    _id: patientId,
    doctor: doctorId,
  }).lean();

  if (!patient) {
    throw ApiError.notFound("Patient not found for this doctor");
  }

  sendSuccess(res, { _id: patient._id });
}

/**
 * GET /doctors/meta/filters — distinct values for the frontend's filter
 * dropdowns. One request beats the client deriving options from a paginated
 * list, which would only ever see the current page's values.
 */
export async function getDoctorFilterOptions(
  _req: Request,
  res: Response,
): Promise<void> {
  const [specializations, hospitals] = await Promise.all([
    Doctor.distinct("specialization"),
    Doctor.distinct("hospital"),
  ]);

  sendSuccess(res, {
    specializations: specializations.sort(),
    hospitals: hospitals.sort(),
  });
}
