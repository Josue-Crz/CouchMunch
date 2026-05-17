import {
  rankRecommendationsWithAI
} from "./services/aiRecommendationRanker.js";
import {
  getAiProviderStatus,
  interpretCraving
} from "./services/cravingInterpreter.js";
import {
  buildRecommendations,
  normalizeLocation
} from "./services/recommendationEngine.js";
import {
  findNearbyRestaurants,
  getRestaurantSourceStatus,
  summarizeRestaurant
} from "./services/yelpFusion.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400"
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      return await handleRequest(request);
    } catch (error) {
      console.error(error);
      return jsonResponse(
        {
          error: error.message || "Something went wrong"
        },
        { status: error.status || 500 }
      );
    }
  }
};

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/api/health") {
    return jsonResponse({
      ok: true,
      service: "CouchMunch API",
      timestamp: new Date().toISOString()
    });
  }

  if (request.method === "GET" && path === "/api/ai/status") {
    return jsonResponse(getAiProviderStatus());
  }

  if (request.method === "POST" && path === "/api/ai/interpret") {
    const body = await readJsonBody(request);
    const craving = String(body?.craving || "").trim();

    if (!craving) {
      return jsonResponse(
        {
          error: "A craving is required for AI interpretation."
        },
        { status: 400 }
      );
    }

    const interpretation = await interpretCraving(craving);

    return jsonResponse({
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
  }

  if (request.method === "GET" && path === "/api/restaurants/status") {
    return jsonResponse(getRestaurantSourceStatus());
  }

  if (request.method === "POST" && path === "/api/restaurants/nearby") {
    const body = await readJsonBody(request);
    const craving = String(body?.craving || "").trim();
    const interpretation = craving ? await interpretCraving(craving) : null;
    const location = normalizeLocation(body?.location);
    const restaurants = await findNearbyRestaurants({
      interpretation,
      location,
      openNow: body?.openNow
    });

    return jsonResponse({
      query: craving || null,
      interpretation,
      location,
      source: restaurants.source,
      restaurants: restaurants.items.map(summarizeRestaurant),
      count: restaurants.items.length
    });
  }

  if (request.method === "POST" && path === "/api/recommendations") {
    const body = await readJsonBody(request);
    const craving = String(body?.craving || "").trim();

    if (!craving) {
      return jsonResponse(
        {
          error: "Tell CouchMunch what you are craving first."
        },
        { status: 400 }
      );
    }

    const interpretation = await interpretCraving(craving);
    const location = normalizeLocation(body?.location);
    const nearbyRestaurants = await findNearbyRestaurants({
      interpretation,
      location,
      openNow: body?.openNow
    });
    const localRecommendations = buildRecommendations({
      budget: body?.budget,
      interpretation,
      location,
      mode: body?.mode,
      restaurants: nearbyRestaurants.items
    });
    const rankedRecommendations = await rankRecommendationsWithAI({
      budget: body?.budget,
      craving,
      fallbackRecommendations: localRecommendations,
      interpretation,
      location,
      mode: body?.mode,
      restaurants: nearbyRestaurants.items
    });

    return jsonResponse({
      query: craving,
      interpretation,
      location,
      source: nearbyRestaurants.source,
      ranking: rankedRecommendations.ranking,
      nearbyRestaurants: nearbyRestaurants.items.map(summarizeRestaurant),
      recommendations: rankedRecommendations.recommendations
    });
  }

  if (request.method === "POST" && path === "/api/checkout") {
    const body = await readJsonBody(request);
    const recommendation = body?.recommendation;

    if (!recommendation?.restaurant || !Array.isArray(recommendation?.items)) {
      return jsonResponse(
        {
          error: "A recommendation with restaurant and items is required."
        },
        { status: 400 }
      );
    }

    const selectedAddOns = Array.isArray(body?.selectedAddOns) ? body.selectedAddOns : [];
    const selectedAction =
      body?.selectedAction ||
      body?.selectedProvider ||
      recommendation.primaryAction ||
      recommendation.primaryDeliveryProvider ||
      recommendation.actionOptions?.[0] ||
      recommendation.deliveryOptions?.[0] ||
      null;

    const subtotal = [...recommendation.items, ...selectedAddOns].reduce(
      (sum, item) => sum + Number(item.price || 0),
      0
    );
    const deliveryFee = Number(selectedAction?.deliveryFee || 0);
    const serviceFee = Number((subtotal * 0.08).toFixed(2));
    const total = Number((subtotal + deliveryFee + serviceFee).toFixed(2));
    const checkoutId = crypto.randomUUID();

    return jsonResponse(
      {
        checkoutId,
        status: "mock_checkout_created",
        restaurant: recommendation.restaurant,
        selectedAction,
        selectedProvider: selectedAction,
        items: recommendation.items,
        selectedAddOns,
        subtotal: Number(subtotal.toFixed(2)),
        deliveryFee,
        serviceFee,
        total,
        estimatedArrivalMinutes: recommendation.deliveryEtaMinutes || 25,
        checkoutUrl: `https://checkout.couchmunch.demo/orders/${checkoutId}`
      },
      { status: 201 }
    );
  }

  return jsonResponse(
    {
      error: "Not found",
      path: url.pathname
    },
    { status: 404 }
  );
}

async function readJsonBody(request) {
  if (!request.body) {
    return {};
  }

  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  return request.json();
}

function jsonResponse(payload, options = {}) {
  return new Response(JSON.stringify(payload), {
    status: options.status || 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...options.headers
    }
  });
}
