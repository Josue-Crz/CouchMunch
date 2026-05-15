import {
  buildRecommendationForRestaurant
} from "./recommendationEngine.js";
import {
  createOpenAIClient,
  extractResponseText,
  getAiRecommendationMode,
  getOpenAIModel,
  shouldUseOpenAIRecommendations
} from "./openAiClient.js";

const MODE_CONFIG = [
  { type: "Best Match", key: "best" },
  { type: "Cheapest", key: "cheap" },
  { type: "Munch Mode", key: "munch" }
];

const AI_RECOMMENDATION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["best", "cheap", "munch"]
          },
          type: {
            type: "string",
            enum: ["Best Match", "Cheapest", "Munch Mode"]
          },
          restaurantId: { type: "string" },
          matchScore: {
            type: "number",
            minimum: 0,
            maximum: 100
          },
          matchReason: { type: "string" },
          combo: {
            type: "array",
            items: { type: "string" }
          },
          addOns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                reason: { type: "string" }
              },
              required: ["name", "reason"],
              additionalProperties: false
            }
          }
        },
        required: [
          "mode",
          "type",
          "restaurantId",
          "matchScore",
          "matchReason",
          "combo",
          "addOns"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "recommendations"],
  additionalProperties: false
};

export async function rankRecommendationsWithAI({
  budget,
  craving,
  fallbackRecommendations,
  interpretation,
  location,
  mode,
  restaurants
}) {
  const fallback = buildLocalRankingResult({
    fallbackReason:
      getAiRecommendationMode() === "local"
        ? null
        : "OpenAI recommendation ranking is not configured.",
    recommendations: fallbackRecommendations
  });

  if (!shouldUseOpenAIRecommendations() || !restaurants.length) {
    return fallback;
  }

  try {
    const activeModes = getActiveModes(mode);
    const aiRanking = await requestOpenAIRanking({
      activeModes,
      budget,
      craving,
      interpretation,
      location,
      restaurants
    });
    const recommendations = mergeAiRanking({
      activeModes,
      aiRanking,
      budget,
      fallbackRecommendations,
      interpretation,
      location,
      restaurants
    });

    if (!recommendations.length) {
      return fallback;
    }

    return {
      recommendations,
      ranking: {
        source: "openai",
        model: getOpenAIModel(),
        aiPowered: true,
        fallbackUsed: false,
        fallbackReason: null,
        summary: aiRanking.summary
      }
    };
  } catch (error) {
    console.warn("OpenAI recommendation ranking failed, using local ranking:", error.message);

    return buildLocalRankingResult({
      fallbackReason: error.message,
      recommendations: fallbackRecommendations
    });
  }
}

async function requestOpenAIRanking({
  activeModes,
  budget,
  craving,
  interpretation,
  location,
  restaurants
}) {
  const client = createOpenAIClient();
  const candidates = restaurants.slice(0, 10).map(toRestaurantCandidate);
  const response = await client.responses.create({
    model: getOpenAIModel(),
    instructions:
      "You are CouchMunch's restaurant recommendation agent. Given a user's craving interpretation and nearby Yelp-style restaurant candidates, choose the best restaurant for each requested mode. Use only restaurantId values from the provided candidates. Prefer restaurants whose cuisine, categories, rating, distance, price, and generated menu items best satisfy the craving. Keep reasons short and user-facing. Do not mention hidden scoring or unavailable credentials.",
    input: JSON.stringify({
      craving,
      location,
      budget,
      interpretation,
      requestedModes: activeModes,
      candidates
    }),
    max_output_tokens: 900,
    temperature: 0.25,
    text: {
      format: {
        type: "json_schema",
        name: "couchmunch_ai_recommendations",
        description: "AI-ranked restaurant and combo suggestions from Yelp-style candidate data.",
        schema: AI_RECOMMENDATION_SCHEMA,
        strict: false
      }
    }
  });

  return JSON.parse(extractResponseText(response));
}

function mergeAiRanking({
  activeModes,
  aiRanking,
  budget,
  fallbackRecommendations,
  interpretation,
  location,
  restaurants
}) {
  const aiRecommendations = Array.isArray(aiRanking.recommendations)
    ? aiRanking.recommendations
    : [];

  return activeModes.map((modeConfig) => {
    const aiRecommendation = aiRecommendations.find(
      (recommendation) => recommendation.mode === modeConfig.key
    );
    const restaurant = restaurants.find(
      (candidate) => candidate.id === aiRecommendation?.restaurantId
    );
    const fallback = fallbackRecommendations.find(
      (recommendation) => recommendation.mode === modeConfig.key
    );

    if (!restaurant || !aiRecommendation) {
      return markLocalRecommendation(fallback);
    }

    const baseRecommendation = buildRecommendationForRestaurant({
      budget,
      interpretation,
      location,
      mode: modeConfig.key,
      restaurant
    });
    const selectedItems = pickAiComboItems({
      aiCombo: aiRecommendation.combo,
      fallbackItems: baseRecommendation.items,
      menu: restaurant.menu || []
    });
    const estimatedPrice = selectedItems.reduce(
      (sum, item) => sum + Number(item.price || 0),
      0
    );

    return {
      ...baseRecommendation,
      type: modeConfig.type,
      mode: modeConfig.key,
      combo: selectedItems.map((item) => item.name),
      items: selectedItems,
      estimatedPrice: Number(estimatedPrice.toFixed(2)),
      matchScore: clampScore(aiRecommendation.matchScore),
      matchReason: aiRecommendation.matchReason || baseRecommendation.matchReason,
      addOns: mergeAiAddOns({
        aiAddOns: aiRecommendation.addOns,
        baseAddOns: baseRecommendation.addOns,
        menu: restaurant.menu || [],
        selectedItems
      }),
      aiRanked: true,
      rankingSource: "openai"
    };
  });
}

function buildLocalRankingResult({ fallbackReason, recommendations }) {
  return {
    recommendations: recommendations.map(markLocalRecommendation),
    ranking: {
      source: "local_engine",
      model: "local-rules",
      aiPowered: false,
      fallbackUsed: Boolean(fallbackReason),
      fallbackReason,
      summary: null
    }
  };
}

function markLocalRecommendation(recommendation) {
  if (!recommendation) {
    return recommendation;
  }

  return {
    ...recommendation,
    aiRanked: false,
    rankingSource: "local_engine"
  };
}

function getActiveModes(mode) {
  const selectedMode = String(mode || "all").toLowerCase();
  return selectedMode === "all"
    ? MODE_CONFIG
    : MODE_CONFIG.filter((modeConfig) => modeConfig.key === selectedMode);
}

function toRestaurantCandidate(restaurant) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    categories: restaurant.categories || [],
    rating: restaurant.rating || 0,
    reviewCount: restaurant.reviewCount || 0,
    price: restaurant.price || null,
    distanceMiles: restaurant.distanceMiles,
    address: restaurant.address || null,
    isClosed: Boolean(restaurant.isClosed),
    sourceLabel: restaurant.sourceLabel,
    menu: (restaurant.menu || []).slice(0, 8).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      role: item.role,
      tags: item.tags || []
    }))
  };
}

function pickAiComboItems({ aiCombo, fallbackItems, menu }) {
  if (!Array.isArray(aiCombo) || !aiCombo.length) {
    return fallbackItems;
  }

  const selected = [];

  for (const name of aiCombo) {
    const match = findMenuItem(menu, name);

    if (match && !selected.some((item) => item.id === match.id)) {
      selected.push(toRecommendationItem(match));
    }
  }

  for (const fallbackItem of fallbackItems) {
    if (selected.length >= fallbackItems.length) {
      break;
    }

    if (!selected.some((item) => item.id === fallbackItem.id)) {
      selected.push(fallbackItem);
    }
  }

  return selected.length ? selected.slice(0, 4) : fallbackItems;
}

function mergeAiAddOns({ aiAddOns, baseAddOns, menu, selectedItems }) {
  if (!Array.isArray(aiAddOns) || !aiAddOns.length) {
    return baseAddOns;
  }

  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const mergedAddOns = [];

  for (const addOn of aiAddOns) {
    const match = findMenuItem(menu, addOn.name);

    if (match && !selectedIds.has(match.id)) {
      mergedAddOns.push({
        id: match.id,
        name: match.name,
        price: match.price,
        role: match.role,
        reason: addOn.reason || "AI-recommended add-on"
      });
    }
  }

  for (const baseAddOn of baseAddOns) {
    if (mergedAddOns.length >= 3) {
      break;
    }

    if (!mergedAddOns.some((item) => item.id === baseAddOn.id)) {
      mergedAddOns.push(baseAddOn);
    }
  }

  return mergedAddOns.slice(0, 3);
}

function findMenuItem(menu, targetName) {
  const normalizedTarget = normalizeName(targetName);

  return menu.find((item) => {
    const normalizedName = normalizeName(item.name);
    return (
      normalizedName === normalizedTarget ||
      normalizedName.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedName)
    );
  });
}

function toRecommendationItem(item) {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    role: item.role,
    tags: item.tags || []
  };
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clampScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 82;
  }

  return Math.max(62, Math.min(98, Math.round(score)));
}
