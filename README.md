# Doctor Tracker — API

REST API for the Doctor Tracker admin panel: a single seeded administrator manages
doctors and their patients, and a dashboard reads aggregated statistics off the
same data. Node.js + Express 5 + Mongoose on MongoDB Atlas, written in TypeScript
end to end (ESM/NodeNext, no `.js` source files). Authentication is a JWT
delivered in an httpOnly cookie; every write route validates its body with Zod.

The client for this API lives in a separate repo:
**[doctor-tracker-client](https://github.com/ar-saad/doctor-tracker-client)** —
that repo's README is the primary one, and covers the system architecture and the
technical decisions in full.

---

## Setup

**Prerequisites:** Node.js 20+, and a MongoDB connection string (a free Atlas M0
cluster is what this was built against; a local `mongod` works too).

```bash
git clone https://github.com/ar-saad/doctor-tracker-server.git
cd doctor-tracker-server
npm install
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET
```

### Environment

All eight variables below are validated by Zod at boot in
[src/config/env.ts](src/config/env.ts). A missing or malformed one exits the
process with a readable list rather than failing later on a confusing `undefined`
— so a host must have all of them set, not just the first five.

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | no | Defaults to `5000`. Render injects its own. |
| `NODE_ENV` | no | Defaults to `development`. **`production` is what flips the auth cookie to `Secure`.** |
| `MONGODB_URI` | **yes** | Atlas connection string, including the database name. |
| `JWT_SECRET` | **yes** | Minimum 16 characters. Use a different value in production than in development. |
| `JWT_EXPIRES_IN` | no | Defaults to `7d`. |
| `ADMIN_NAME` | no | Defaults to `Admin`. Read by `seed:admin`. |
| `ADMIN_EMAIL` | no | Defaults to `admin@doctortracker.com`. Read by `seed:admin`. |
| `ADMIN_PASSWORD` | no | Defaults to `Admin@123`, minimum 6 characters. Read by `seed:admin`. |

The full template is in [.env.example](.env.example).

### Seed and run

```bash
npm run seed:admin        # creates the single admin login — idempotent, safe to re-run
npm run seed:demo         # optional: 12 doctors + 40 patients spread over 30 days
npm run dev               # http://localhost:5000/api
```

`seed:demo` exists because the dashboard charts are unreadable against an empty
database. Its randomness is seeded, so two runs produce the same data. Pass
`-- --force` to wipe and reseed.

Confirm it is up:

```bash
curl http://localhost:5000/api/health
# {"success":true,"data":"ok"}
```

### Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | `tsx watch` against `src/server.ts` |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/server.js` (production entry) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed:admin` | Creates the admin user from the `ADMIN_*` env vars |
| `npm run seed:demo` | Fills the database with demo doctors and patients |

---

## Architecture

```
src/
  config/       env.ts (Zod-validated env), db.ts (connect/disconnect)
  models/       Mongoose schemas + indexes — User, Doctor, Patient
  schemas/      Zod schemas; request types are derived from them via z.infer
  middleware/   auth (JWT cookie gate), validate(schema), notFound, errorHandler
  controllers/  request handling and the aggregation pipelines
  routes/       thin route tables, mounted under /api
  utils/        response envelope, ApiError, shared query builder, seed scripts
```

Two structural choices are worth pointing out:

**The auth gate is applied at mount time, not per route.** In
[src/routes/index.ts](src/routes/index.ts), `/doctors`, `/patients` and
`/analytics` are all mounted *behind* the `auth` middleware. An individual route
therefore cannot forget to protect itself — adding an unauthenticated endpoint by
accident would take deliberate effort.

**Zod is the single source of truth for both validation and types.** The
`validate(schema)` factory parses `req.body` at the HTTP boundary, and the
handler's input type is `z.infer<typeof createDoctorSchema>`. There is no
hand-written interface that can drift out of sync with the rules actually being
enforced.

Errors are never thrown at the client raw: `ApiError` plus a central
`errorHandler` map Mongoose validation errors, cast errors, duplicate-key
conflicts and JWT failures onto the response envelope below with a sensible
status code.

---

## API reference

Base URL: `http://localhost:5000/api` (production: `https://<render-app>.onrender.com/api`).

Every route except `/health`, `/auth/login` and `/auth/logout` requires the
httpOnly `token` cookie.

### Response envelope

```jsonc
// success
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 10, "total": 57, "totalPages": 6 } }

// error
{ "success": false, "message": "human readable error" }
```

`meta` is present on list responses only.

### Auth

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/login` | Body `{ email, password }`. Sets the httpOnly cookie; returns the user. 401 on bad credentials. |
| `POST` | `/auth/logout` | Clears the cookie. Public by design — logging out with an expired token should still work. |
| `GET` | `/auth/me` | Restores the session user on refresh. 401 without a valid cookie. |

The token travels in the cookie only — never in the response body.

### Doctors

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/doctors` | Query: `page`, `limit`, `search` (name/specialization/hospital), `specialization`, `hospital`, `startDate`, `endDate` |
| `GET` | `/doctors/meta/filters` | Distinct specializations and hospitals, for populating the filter dropdowns |
| `GET` | `/doctors/:id` | |
| `POST` | `/doctors` | Body `{ name, specialization, hospital, phone, email }` — all required, email unique |
| `PUT` | `/doctors/:id` | |
| `DELETE` | `/doctors/:id` | Cascades: deletes that doctor's patients too |
| `GET` | `/doctors/:id/patients` | Paginated, same `meta` shape |
| `POST` | `/doctors/:id/patients` | Creates a patient under this doctor |
| `DELETE` | `/doctors/:id/patients/:patientId` | 404s if the patient is not this doctor's |

### Patients

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/patients` | Query: `page`, `limit`, `search` (name/phone), `condition`, `doctorId`, `startDate`, `endDate` |
| `GET` | `/patients/meta/filters` | Distinct conditions |
| `GET` | `/patients/:id` | |
| `PUT` | `/patients/:id` | |
| `DELETE` | `/patients/:id` | |

There is deliberately **no** `POST /patients`. A patient cannot exist without a
doctor — `doctor` is a required ref — so creation lives at
`POST /doctors/:id/patients`, where the doctor comes from the URL and cannot be
omitted or forged in the body.

### Analytics

`GET /analytics/summary` returns every dashboard figure in one response:

```jsonc
{
  "totalDoctors": 12,
  "totalPatients": 40,
  "patientsPerDoctor":   [ { "doctorId": "…", "doctorName": "…", "count": 7 } ],
  "registrationsByDate": [ { "date": "2026-08-11", "doctors": 1, "patients": 3 } ],
  "patientsByCondition": [ { "condition": "Asthma", "count": 6 } ]
}
```

Six independent queries run concurrently under one `Promise.all`, so the endpoint
costs one round trip rather than six. The counting happens inside MongoDB, so the
payload is the size of the chart rather than the size of the collection.
`registrationsByDate` is zero-filled across the whole 14-day window — Mongo only
returns days that have data, and a line chart drawn from that would silently
close the gaps and misread a quiet day as a straight line between its neighbours.

### Health

`GET /health` → `{ "success": true, "data": "ok" }`. Also useful for warming the
Render free-tier instance before a demo.

---

## Data models

| Model | Fields |
| --- | --- |
| `User` | `name`, `email` (unique), `password` (bcrypt, `select: false`), timestamps |
| `Doctor` | `name`, `specialization`, `hospital`, `phone`, `email` (unique), timestamps |
| `Patient` | `name`, `age`, `gender`, `phone`, `condition`, `doctor` (ref `Doctor`), timestamps |

Indexes are placed on exactly the fields the queries filter, sort and group on:
`specialization`, `hospital` and `createdAt` on doctors; `doctor`, `condition` and
`createdAt` on patients. Search uses a case-insensitive regex rather than a `$text`
index on purpose — the UI needs partial matches as the user types, and `$text`
matches whole stemmed words only.

---

## Deployment (Render)

- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- **Env vars:** all eight from the table above. `NODE_ENV=production` is not
  optional — it is what makes the auth cookie `Secure`, and login fails silently
  over HTTPS without it. Use a fresh `JWT_SECRET`, not the development one.
- **Atlas:** allow `0.0.0.0/0` under Network Access; Render's egress IPs are dynamic.
- **Seeding:** run `npm run seed:admin` once against the production URI (easiest
  from your machine with the Atlas URI in `.env`).
- No CORS or `CLIENT_URL` configuration is needed. The browser never calls this
  service directly — the Next.js client proxies `/api/*` to it, which is what
  keeps the auth cookie first-party. That decision is written up in full in the
  client README.

`app.set("trust proxy", 1)` is already set, which Render's TLS-terminating proxy
requires for `Secure` cookies to be emitted correctly.

> On the free tier the instance sleeps after inactivity; the first request after
> an idle period can take ~50 seconds.
