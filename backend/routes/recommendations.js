import { Router } from "express";
import {
  rankRecommendationsWithAI
} from "../services/aiRecommendationRanker.js";
import { interpretCraving } from "../services/cravingInterpreter.js";
import {
  findNearbyRestaurants,
  summarizeRestaurant
} from "../services/yelpFusion.js";
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
    const nearbyRestaurants = await findNearbyRestaurants({
      interpretation,
      location,
      openNow: request.body?.openNow
    });
    const localRecommendations = buildRecommendations({
      budget: request.body?.budget,
      interpretation,
      location,
      mode: request.body?.mode,
      restaurants: nearbyRestaurants.items
    });
    const rankedRecommendations = await rankRecommendationsWithAI({
      budget: request.body?.budget,
      craving,
      fallbackRecommendations: localRecommendations,
      interpretation,
      location,
      mode: request.body?.mode,
      restaurants: nearbyRestaurants.items
    });

    response.json({
      query: craving,
      interpretation,
      location,
      source: nearbyRestaurants.source,
      ranking: rankedRecommendations.ranking,
      nearbyRestaurants: nearbyRestaurants.items.map(summarizeRestaurant),
      recommendations: rankedRecommendations.recommendations
    });
  } catch (error) {
    next(error);
  }
});

export default router;
