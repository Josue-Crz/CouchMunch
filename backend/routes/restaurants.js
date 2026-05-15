import { Router } from "express";
import { interpretCraving } from "../services/cravingInterpreter.js";
import {
  findNearbyRestaurants,
  getRestaurantSourceStatus,
  summarizeRestaurant
} from "../services/yelpFusion.js";
import { normalizeLocation } from "../services/recommendationEngine.js";

const router = Router();

router.get("/status", (_request, response) => {
  response.json(getRestaurantSourceStatus());
});

router.post("/nearby", async (request, response, next) => {
  try {
    const craving = String(request.body?.craving || "").trim();
    const interpretation = craving ? await interpretCraving(craving) : null;
    const location = normalizeLocation(request.body?.location);
    const restaurants = await findNearbyRestaurants({
      interpretation,
      location,
      openNow: request.body?.openNow
    });

    response.json({
      query: craving || null,
      interpretation,
      location,
      source: restaurants.source,
      restaurants: restaurants.items.map(summarizeRestaurant),
      count: restaurants.items.length
    });
  } catch (error) {
    next(error);
  }
});

export default router;
