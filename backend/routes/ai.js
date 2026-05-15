import { Router } from "express";
import {
  getAiProviderStatus,
  interpretCraving
} from "../services/cravingInterpreter.js";

const router = Router();

router.get("/status", (_request, response) => {
  response.json(getAiProviderStatus());
});

router.post("/interpret", async (request, response, next) => {
  try {
    const craving = String(request.body?.craving || "").trim();

    if (!craving) {
      response.status(400).json({
        error: "A craving is required for AI interpretation."
      });
      return;
    }

    const interpretation = await interpretCraving(craving);

    response.json({
      query: craving,
      interpretation,
      ai: {
        provider: interpretation.source,
        model: interpretation.model,
        poweredByAi: interpretation.aiPowered,
        fallbackUsed: interpretation.fallbackUsed,
        fallbackReason: interpretation.fallbackReason
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
