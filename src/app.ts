import express from "express";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Render terminates TLS at its proxy; needed for Secure cookies + correct IPs.
app.set("trust proxy", 1);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", routes);

// 404 then the central error handler — both must stay last, in this order.
app.use(notFound);
app.use(errorHandler);

export default app;
