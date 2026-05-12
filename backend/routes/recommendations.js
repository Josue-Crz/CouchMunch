import { Router } from "express";
import { interpretCraving } from "../services/cravingInterpreter.js";
import {
  buildRecommendations,
  normalizeLocation
} from "../services/recommendationEngine.js";

const router = Router();

router.post("/", async (request, response, next) => {
  try {
    const craving = String(request.body?.craving || "").trim();

    if (!craving) {
      response.status(400).json({
        error: "Tell CouchMunch what you are craving first."
      });
      return;
    }

    const interpretation = await interpretCraving(craving);
    const location = normalizeLocation(request.body?.location);
    const recommendations = buildRecommendations({
      budget: request.body?.budget,
      interpretation,
      location,
      mode: request.body?.mode
    });

    response.json({
      query: craving,
      interpretation,
      location,
      recommendations
    });
  } catch (error) {
    next(error);
  }
});

export default router;
