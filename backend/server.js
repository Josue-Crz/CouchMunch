import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import aiRouter from "./routes/ai.js";
import checkoutRouter from "./routes/checkout.js";
import recommendationsRouter from "./routes/recommendations.js";
import restaurantsRouter from "./routes/restaurants.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "CouchMunch API",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/ai", aiRouter);
app.use("/api/restaurants", restaurantsRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/checkout", checkoutRouter);

app.use((request, response) => {
  response.status(404).json({
    error: "Not found",
    path: request.originalUrl
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status || 500).json({
    error: error.message || "Something went wrong"
  });
});

app.listen(port, () => {
  console.log(`CouchMunch API listening at http://localhost:${port}`);
});
