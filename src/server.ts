import { env } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/db.js";
import app from "./app.js";

async function bootstrap(): Promise<void> {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(
      `Server listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`,
    );
  });

  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => {
      void disconnectDB().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
    server.close(() => process.exit(1));
  });
}

void bootstrap();
