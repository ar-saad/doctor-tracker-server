import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { User } from "../models/User.js";

/**
 * Standalone script: `npm run seed:admin`.
 *
 * Credentials come from the validated env object, never from process.env or a
 * hardcoded literal. Idempotent — re-running it is a no-op, not a duplicate.
 *
 * Being its own process, it owns its DB lifecycle: connect at the start and
 * disconnect in a finally, otherwise the open socket keeps the script alive
 * after the work is done.
 */
async function seedAdmin(): Promise<void> {
  await connectDB();

  try {
    const email = env.ADMIN_EMAIL.toLowerCase();
    const existing = await User.findOne({ email });

    if (existing) {
      console.log(`Admin already exists -> ${email} (nothing to do)`);
      return;
    }

    const password = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
    await User.create({ name: env.ADMIN_NAME, email, password });

    console.log(`Admin created -> ${email}`);
  } finally {
    await disconnectDB();
  }
}

seedAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Admin seed failed: ${message}`);
  process.exitCode = 1;
});
