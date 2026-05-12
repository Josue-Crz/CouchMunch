import OpenAI from "openai";

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

export async function interpretCraving(rawCraving) {
  const fallback = interpretLocally(rawCraving);

  if (!shouldUseOpenAI()) {
    return fallback;
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You interpret food cravings for a restaurant recommendation app. Return compact JSON with items, category, priority, mood, budget, maxBudget, and dietary. Items should be simple food nouns."
        },
        {
          role: "user",
          content: rawCraving
        }
      ]
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
    return sanitizeInterpretation({
      ...fallback,
      ...parsed,
      rawCraving,
      aiPowered: true
    });
  } catch (error) {
    console.warn("OpenAI interpretation failed, using local fallback:", error.message);
    return fallback;
  }
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
    aiPowered: false
  });
}

function shouldUseOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && !key.includes("your_openai_api_key"));
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
    aiPowered: Boolean(interpretation.aiPowered)
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
