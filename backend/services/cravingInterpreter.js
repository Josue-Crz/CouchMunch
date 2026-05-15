import {
  createOpenAIClient,
  extractResponseText,
  getAiRecommendationMode,
  getOpenAIModel,
  getRequestedAiProvider,
  hasOpenAICredentials,
  shouldUseOpenAI
} from "./openAiClient.js";

const FOOD_PATTERNS = [
  {
    item: "burger",
    category: "fast_food",
    terms: ["burger", "cheeseburger", "double", "hamburger", "smashburger"]
  },
  {
    item: "fries",
    category: "fast_food",
    terms: ["fries", "fry", "loaded fries", "waffle fries"]
  },
  {
    item: "shake",
    category: "dessert",
    terms: ["shake", "milkshake", "malt"]
  },
  {
    item: "pizza",
    category: "pizza",
    terms: ["pizza", "slice", "pepperoni", "margherita"]
  },
  {
    item: "tacos",
    category: "mexican",
    terms: ["taco", "tacos", "burrito", "quesadilla", "nachos"]
  },
  {
    item: "wings",
    category: "fast_food",
    terms: ["wings", "boneless", "buffalo", "hot chicken"]
  },
  {
    item: "ramen",
    category: "asian",
    terms: ["ramen", "noodles", "pho", "udon", "yakisoba"]
  },
  {
    item: "sushi",
    category: "asian",
    terms: ["sushi", "roll", "sashimi", "poke"]
  },
  {
    item: "salad",
    category: "healthy",
    terms: ["salad", "greens", "caesar", "bowl"]
  },
  {
    item: "sandwich",
    category: "sandwiches",
    terms: ["sandwich", "sub", "club", "cheesesteak", "deli"]
  },
  {
    item: "dessert",
    category: "dessert",
    terms: ["dessert", "sweet", "cookie", "brownie", "churro", "ice cream"]
  },
  {
    item: "coffee",
    category: "cafe",
    terms: ["coffee", "latte", "cold brew", "espresso"]
  }
];

const MOODS = [
  { mood: "spicy", terms: ["spicy", "hot", "buffalo", "jalapeno", "fire"] },
  { mood: "healthy", terms: ["healthy", "fresh", "light", "clean", "protein"] },
  { mood: "sweet", terms: ["sweet", "dessert", "sugar", "chocolate"] },
  { mood: "comfort", terms: ["comfort", "cozy", "greasy", "filling", "hungry"] },
  { mood: "late_night", terms: ["late", "midnight", "night"] },
  { mood: "crispy", terms: ["crispy", "crunchy", "fried"] }
];

const INTERPRETATION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "string" }
    },
    category: { type: "string" },
    priority: {
      type: "string",
      enum: ["combo_match", "cheapest", "munch_mode"]
    },
    mood: {
      type: "array",
      items: { type: "string" }
    },
    budget: {
      type: "string",
      enum: ["low", "standard", "high"]
    },
    maxBudget: {
      anyOf: [{ type: "number" }, { type: "null" }]
    },
    dietary: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["items", "category", "priority", "mood", "budget", "maxBudget", "dietary"],
  additionalProperties: false
};

export async function interpretCraving(rawCraving) {
  const fallback = interpretLocally(rawCraving);

  if (!shouldUseOpenAI()) {
    return sanitizeInterpretation({
      ...fallback,
      fallbackUsed: getRequestedAiProvider() !== "local",
      fallbackReason:
        getRequestedAiProvider() === "local"
          ? null
          : "OpenAI credentials are not configured."
    });
  }

  try {
    const parsed = await interpretWithOpenAI(rawCraving);
    return sanitizeInterpretation({
      ...fallback,
      ...parsed,
      rawCraving,
      source: "openai",
      model: getOpenAIModel(),
      aiPowered: true
    });
  } catch (error) {
    console.warn("OpenAI interpretation failed, using local fallback:", error.message);
    return sanitizeInterpretation({
      ...fallback,
      fallbackUsed: true,
      fallbackReason: error.message
    });
  }
}

export function getAiProviderStatus() {
  const requestedProvider = getRequestedAiProvider();
  const openaiConfigured = hasOpenAICredentials();
  const activeProvider =
    requestedProvider !== "local" && openaiConfigured ? "openai" : "local_heuristic";

  return {
    requestedProvider,
    activeProvider,
    fallbackProvider: "local_heuristic",
    openai: {
      credentialsConfigured: openaiConfigured,
      credentialEnv: "OPENAI_API_KEY",
      model: getOpenAIModel(),
      endpointFamily: "responses"
    },
    recommendations: {
      requestedMode: getAiRecommendationMode(),
      activeProvider:
        requestedProvider !== "local" &&
        getAiRecommendationMode() !== "local" &&
        openaiConfigured
          ? "openai"
          : "local_engine"
    }
  };
}

function interpretLocally(rawCraving) {
  const text = String(rawCraving || "").toLowerCase();
  const matchedPatterns = FOOD_PATTERNS.filter((pattern) =>
    pattern.terms.some((term) => text.includes(term))
  );
  const moods = MOODS.filter((mood) =>
    mood.terms.some((term) => text.includes(term))
  ).map((mood) => mood.mood);

  const categoryCounts = matchedPatterns.reduce((counts, pattern) => {
    counts[pattern.category] = (counts[pattern.category] || 0) + 1;
    return counts;
  }, {});
  const category =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    inferCategoryFromMood(moods);

  return sanitizeInterpretation({
    items: matchedPatterns.map((pattern) => pattern.item),
    category,
    priority: inferPriority(text),
    mood: moods,
    budget: inferBudget(text),
    maxBudget: inferMaxBudget(text),
    dietary: inferDietary(text),
    rawCraving,
    source: "local_heuristic",
    model: "local-rules",
    aiPowered: false,
    fallbackUsed: false,
    fallbackReason: null
  });
}

async function interpretWithOpenAI(rawCraving) {
  const client = createOpenAIClient();
  const response = await client.responses.create({
    model: getOpenAIModel(),
    instructions:
      "You interpret food cravings for a restaurant recommendation app. Return structured food intent only. Items should be simple food nouns. Category should be a concise cuisine or meal category. Priority must reflect whether the user wants best combo match, cheapest option, or a bigger indulgent order.",
    input: `Craving: ${rawCraving}`,
    max_output_tokens: 400,
    temperature: 0.2,
    text: {
      format: {
        type: "json_schema",
        name: "food_craving_interpretation",
        description: "Structured food craving intent for CouchMunch recommendations.",
        schema: INTERPRETATION_SCHEMA,
        strict: false
      }
    }
  });

  return JSON.parse(extractResponseText(response));
}

function sanitizeInterpretation(interpretation) {
  const items = Array.isArray(interpretation.items)
    ? interpretation.items.map((item) => String(item).toLowerCase()).filter(Boolean)
    : [];
  const mood = Array.isArray(interpretation.mood)
    ? interpretation.mood.map((item) => String(item).toLowerCase()).filter(Boolean)
    : [];
  const dietary = Array.isArray(interpretation.dietary)
    ? interpretation.dietary.map((item) => String(item).toLowerCase()).filter(Boolean)
    : [];

  return {
    items: [...new Set(items.length ? items : ["savory combo"])],
    category: String(interpretation.category || "comfort_food").toLowerCase(),
    priority: String(interpretation.priority || "combo_match").toLowerCase(),
    mood: [...new Set(mood)],
    budget: interpretation.budget || "standard",
    maxBudget: interpretation.maxBudget || null,
    dietary: [...new Set(dietary)],
    rawCraving: interpretation.rawCraving,
    source: interpretation.source || "local_heuristic",
    model: interpretation.model || "local-rules",
    aiPowered: Boolean(interpretation.aiPowered),
    fallbackUsed: Boolean(interpretation.fallbackUsed),
    fallbackReason: interpretation.fallbackReason || null
  };
}

function inferPriority(text) {
  if (text.includes("cheap") || text.includes("budget")) {
    return "cheapest";
  }

  if (text.includes("munch") || text.includes("loaded") || text.includes("feast")) {
    return "munch_mode";
  }

  return "combo_match";
}

function inferBudget(text) {
  if (text.includes("cheap") || text.includes("budget") || text.includes("under")) {
    return "low";
  }

  if (text.includes("splurge") || text.includes("treat")) {
    return "high";
  }

  return "standard";
}

function inferMaxBudget(text) {
  const match = text.match(/(?:under|below|less than|around)?\s*\$?(\d{1,3})/);
  return match ? Number(match[1]) : null;
}

function inferDietary(text) {
  const dietary = [];

  if (text.includes("vegan")) {
    dietary.push("vegan");
  }

  if (text.includes("vegetarian") || text.includes("veggie")) {
    dietary.push("vegetarian");
  }

  if (text.includes("gluten free") || text.includes("gluten-free")) {
    dietary.push("gluten_free");
  }

  return dietary;
}

function inferCategoryFromMood(moods) {
  if (moods.includes("healthy")) {
    return "healthy";
  }

  if (moods.includes("sweet")) {
    return "dessert";
  }

  return "comfort_food";
}
