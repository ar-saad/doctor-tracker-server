import type { Request, Response } from "express";
import type { Types } from "mongoose";
import { Doctor } from "../models/Doctor.js";
import { Patient } from "../models/Patient.js";
import { sendSuccess } from "../utils/response.js";

/**
 * The dashboard is one request, not four. Every figure on it comes from this
 * endpoint, and each pipeline below does its counting inside MongoDB rather
 * than shipping raw documents to the client to be reduced there — the payload
 * stays the size of the chart, not the size of the collection.
 */

/** Window for the registrations line chart, in days, inclusive of today. */
const TREND_DAYS = 14;

/** Enough bars to be interesting, few enough that the labels stay readable. */
const TOP_DOCTORS_LIMIT = 10;

/** A donut past ~8 slices is a legend, not a chart. */
const TOP_CONDITIONS_LIMIT = 8;

interface PatientsPerDoctor {
  doctorId: Types.ObjectId;
  doctorName: string;
  count: number;
}

interface RegistrationsByDate {
  date: string;
  doctors: number;
  patients: number;
}

interface PatientsByCondition {
  condition: string;
  count: number;
}

/** Shape of the per-day $group output, before the two collections are merged. */
interface DailyCount {
  _id: string;
  count: number;
}

/**
 * $dateToString below buckets in UTC, so the window and the labels have to be
 * UTC too — deriving either from local time would shift the boundary and drop
 * or duplicate a day for anyone not on UTC.
 */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfTrendWindow(): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (TREND_DAYS - 1));
  return start;
}

/** Per-day counts for one collection, from `since` onwards. */
function dailyRegistrations(
  model: typeof Doctor | typeof Patient,
  since: Date,
): Promise<DailyCount[]> {
  return model.aggregate<DailyCount>([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

/**
 * Mongo only returns days that actually have registrations. A line chart drawn
 * from that would silently close the gaps and misread a quiet Tuesday as a
 * straight line between its neighbours, so every day in the window is emitted,
 * zero-filled, in order.
 */
function mergeRegistrations(
  start: Date,
  doctorCounts: DailyCount[],
  patientCounts: DailyCount[],
): RegistrationsByDate[] {
  const byDate = (rows: DailyCount[]): Map<string, number> =>
    new Map(rows.map((row) => [row._id, row.count]));

  const doctors = byDate(doctorCounts);
  const patients = byDate(patientCounts);

  return Array.from({ length: TREND_DAYS }, (_unused, offset) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + offset);
    const date = toDateKey(day);

    return {
      date,
      doctors: doctors.get(date) ?? 0,
      patients: patients.get(date) ?? 0,
    };
  });
}

/**
 * GET /analytics/summary — every dashboard figure in one response.
 *
 * The six queries are independent, so Promise.all issues them concurrently and
 * the endpoint costs one round trip instead of six. The fields they match,
 * group and sort on (createdAt, doctor, condition) are the exact fields indexed
 * on the models in Phase 1.
 */
export async function getSummary(_req: Request, res: Response): Promise<void> {
  const trendStart = startOfTrendWindow();

  const [
    totalDoctors,
    totalPatients,
    patientsPerDoctor,
    doctorRegistrations,
    patientRegistrations,
    patientsByCondition,
  ] = await Promise.all([
    Doctor.countDocuments(),
    Patient.countDocuments(),

    // Counted from the patient side, so doctors with no patients drop out
    // rather than padding the chart with a row of zero-height bars.
    Patient.aggregate<PatientsPerDoctor>([
      { $group: { _id: "$doctor", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "doctors",
          localField: "_id",
          foreignField: "_id",
          as: "doctor",
        },
      },
      // $unwind, not $unwind with preserveNullAndEmptyArrays: a patient whose
      // doctor no longer exists has no name to label a bar with, and deleteDoctor
      // cascades precisely so that case does not arise.
      { $unwind: "$doctor" },
      {
        $project: {
          doctorId: "$_id",
          doctorName: "$doctor.name",
          count: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
      { $limit: TOP_DOCTORS_LIMIT },
    ]),

    dailyRegistrations(Doctor, trendStart),
    dailyRegistrations(Patient, trendStart),

    Patient.aggregate<PatientsByCondition>([
      { $group: { _id: "$condition", count: { $sum: 1 } } },
      { $project: { condition: "$_id", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: TOP_CONDITIONS_LIMIT },
    ]),
  ]);

  sendSuccess(res, {
    totalDoctors,
    totalPatients,
    patientsPerDoctor,
    registrationsByDate: mergeRegistrations(
      trendStart,
      doctorRegistrations,
      patientRegistrations,
    ),
    patientsByCondition,
  });
}
