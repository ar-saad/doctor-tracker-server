import { connectDB, disconnectDB } from "../config/db.js";
import { Doctor } from "../models/Doctor.js";
import { GENDERS, Patient } from "../models/Patient.js";

/**
 * Standalone script: `npm run seed:demo` (add `-- --force` to wipe and reseed).
 *
 * The dashboard and its charts are unreadable against an empty database, so
 * this fills it with 12 doctors and 40 patients whose createdAt values are
 * spread across the last 30 days — the registrations-over-time chart needs real
 * variation, not 52 documents stamped with the same instant.
 *
 * Randomness is seeded (mulberry32) rather than Math.random: two runs produce
 * the same database, so a screenshot or a bug report stays reproducible.
 */

const DAYS_OF_HISTORY = 30;
const PATIENT_COUNT = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260811);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

const HOSPITALS = [
  "St. Mary's General Hospital",
  "Riverside Medical Center",
  "Northgate Health Institute",
  "Lakeview Community Hospital",
  "Cedar Park Medical Center",
] as const;

/** Conditions are keyed by specialization so a cardiologist never treats acne. */
const CONDITIONS: Record<string, readonly string[]> = {
  Cardiology: ["Hypertension", "Arrhythmia", "Heart Failure", "Angina"],
  Dermatology: ["Eczema", "Psoriasis", "Acne", "Dermatitis"],
  Neurology: ["Migraine", "Epilepsy", "Neuropathy", "Vertigo"],
  Orthopedics: ["Fracture", "Arthritis", "Back Pain", "Torn Ligament"],
  Pediatrics: ["Asthma", "Bronchitis", "Ear Infection", "Allergy"],
};

interface DoctorSeed {
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
}

const DOCTORS: readonly DoctorSeed[] = [
  { name: "Dr. Amara Osei", specialization: "Cardiology", hospital: HOSPITALS[0], phone: "+1 202 555 0114", email: "amara.osei@doctortracker.com" },
  { name: "Dr. Ravi Menon", specialization: "Cardiology", hospital: HOSPITALS[1], phone: "+1 202 555 0127", email: "ravi.menon@doctortracker.com" },
  { name: "Dr. Elena Petrova", specialization: "Cardiology", hospital: HOSPITALS[2], phone: "+1 202 555 0132", email: "elena.petrova@doctortracker.com" },
  { name: "Dr. Yusuf Karim", specialization: "Dermatology", hospital: HOSPITALS[0], phone: "+1 202 555 0148", email: "yusuf.karim@doctortracker.com" },
  { name: "Dr. Clara Nwosu", specialization: "Dermatology", hospital: HOSPITALS[3], phone: "+1 202 555 0153", email: "clara.nwosu@doctortracker.com" },
  { name: "Dr. Tomas Lindqvist", specialization: "Neurology", hospital: HOSPITALS[1], phone: "+1 202 555 0169", email: "tomas.lindqvist@doctortracker.com" },
  { name: "Dr. Priya Raghunathan", specialization: "Neurology", hospital: HOSPITALS[4], phone: "+1 202 555 0175", email: "priya.raghunathan@doctortracker.com" },
  { name: "Dr. Marcus Feld", specialization: "Orthopedics", hospital: HOSPITALS[2], phone: "+1 202 555 0181", email: "marcus.feld@doctortracker.com" },
  { name: "Dr. Sofia Marchetti", specialization: "Orthopedics", hospital: HOSPITALS[3], phone: "+1 202 555 0196", email: "sofia.marchetti@doctortracker.com" },
  { name: "Dr. Hana Sato", specialization: "Pediatrics", hospital: HOSPITALS[0], phone: "+1 202 555 0203", email: "hana.sato@doctortracker.com" },
  { name: "Dr. Daniel Boakye", specialization: "Pediatrics", hospital: HOSPITALS[4], phone: "+1 202 555 0217", email: "daniel.boakye@doctortracker.com" },
  { name: "Dr. Leila Haddad", specialization: "Pediatrics", hospital: HOSPITALS[1], phone: "+1 202 555 0224", email: "leila.haddad@doctortracker.com" },
];

const FIRST_NAMES = [
  "Aisha", "Ben", "Carmen", "Devon", "Elif", "Farid", "Grace", "Hugo",
  "Ines", "Jonas", "Kiara", "Liam", "Maya", "Noah", "Olu", "Pia",
  "Quentin", "Rosa", "Samir", "Tara", "Umar", "Vera", "Wesley", "Zara",
] as const;

const LAST_NAMES = [
  "Adeyemi", "Brennan", "Castillo", "Duarte", "Eriksen", "Farrow",
  "Gallagher", "Haruna", "Ibrahim", "Jansen", "Kowalski", "Larsen",
  "Moreau", "Novak", "Okafor", "Rossi", "Sandoval", "Tanaka",
] as const;

function daysAgo(days: number, hour: number, minute: number): Date {
  const date = new Date(Date.now() - days * MS_PER_DAY);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

async function seedDemo(): Promise<void> {
  const force = process.argv.includes("--force");

  await connectDB();

  try {
    const existing = await Doctor.estimatedDocumentCount();

    // Never silently double the dataset: a second run without --force is a
    // no-op, and with --force it replaces rather than appends.
    if (existing > 0 && !force) {
      console.log(
        `Database already has ${existing} doctors — skipping.\n` +
          "Re-run with `npm run seed:demo -- --force` to wipe and reseed.",
      );
      return;
    }

    if (force) {
      const [doctors, patients] = await Promise.all([
        Doctor.deleteMany({}),
        Patient.deleteMany({}),
      ]);
      console.log(
        `Cleared ${doctors.deletedCount} doctors and ${patients.deletedCount} patients`,
      );
    }

    // Doctors are registered oldest-first across the window, roughly two days
    // apart, so the registrations chart has a spread rather than a single spike.
    const doctorDocs = DOCTORS.map((doctor, index) => {
      const createdAt = daysAgo(
        DAYS_OF_HISTORY - index * 2,
        randomInt(8, 17),
        randomInt(0, 59),
      );
      return { ...doctor, createdAt, updatedAt: createdAt };
    });

    // timestamps: false is required — with timestamps on, Mongoose overwrites
    // the createdAt we just computed with Date.now() and the whole spread
    // collapses onto today.
    const insertedDoctors = await Doctor.insertMany(doctorDocs, {
      timestamps: false,
    });

    const patientDocs = Array.from({ length: PATIENT_COUNT }, () => {
      const doctor = pick(insertedDoctors);
      const conditions = CONDITIONS[doctor.specialization] ?? ["General Checkup"];

      // A patient cannot predate the doctor they are filed under, so the
      // registration date is drawn from the window between that doctor's
      // createdAt and now.
      const doctorAgeDays = Math.max(
        0,
        Math.floor((Date.now() - doctor.createdAt.getTime()) / MS_PER_DAY),
      );
      const createdAt = daysAgo(
        randomInt(0, doctorAgeDays),
        randomInt(8, 18),
        randomInt(0, 59),
      );

      return {
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        age:
          doctor.specialization === "Pediatrics"
            ? randomInt(1, 16)
            : randomInt(18, 87),
        gender: pick(GENDERS),
        phone: `+1 202 555 ${String(randomInt(1000, 9999))}`,
        condition: pick(conditions),
        doctor: doctor._id,
        createdAt,
        updatedAt: createdAt,
      };
    });

    const insertedPatients = await Patient.insertMany(patientDocs, {
      timestamps: false,
    });

    console.log(
      `Seeded ${insertedDoctors.length} doctors and ${insertedPatients.length} patients ` +
        `across the last ${DAYS_OF_HISTORY} days`,
    );
  } finally {
    await disconnectDB();
  }
}

seedDemo().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Demo seed failed: ${message}`);
  process.exitCode = 1;
});
