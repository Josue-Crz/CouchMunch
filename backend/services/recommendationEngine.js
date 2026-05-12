import { readFileSync } from "node:fs";

const restaurants = JSON.parse(
  readFileSync(new URL("../data/mockMenus.json", import.meta.url), "utf8")
);

const MODE_CONFIG = [
  {
    type: "Best Match",
    key: "best",
    description: "Closest craving fit with a balanced combo."
  },
  {
    type: "Cheapest",
    key: "cheap",
    description: "Lowest total that still matches the craving."
  },
  {
    type: "Munch Mode",
    key: "munch",
    description: "The boldest comfort order with add-on energy."
  }
];

export function normalizeLocation(location) {
  if (!location) {
    return {
      label: "Demo delivery zone",
      latitude: null,
      longitude: null
    };
  }

  if (typeof location === "string") {
    return {
      label: location.trim() || "Demo delivery zone",
      latitude: null,
      longitude: null
    };
  }

  return {
    label: String(location.label || "Current location"),
    latitude: toNullableNumber(location.latitude),
    longitude: toNullableNumber(location.longitude)
  };
}

export function buildRecommendations({ budget, interpretation, location, mode }) {
  const selectedMode = String(mode || "all").toLowerCase();
  const activeModes =
    selectedMode === "all"
      ? MODE_CONFIG
      : MODE_CONFIG.filter((config) => config.key === selectedMode);

  const candidates = restaurants.map((restaurant) =>
    buildRestaurantCandidate({
      budget,
      interpretation,
      location,
      restaurant
    })
  );

  return activeModes.map((config) => {
    const candidate = pickCandidate(config.key, candidates, interpretation);
    return formatRecommendation(config, candidate, interpretation);
  });
}

function buildRestaurantCandidate({ budget, interpretation, location, restaurant }) {
  const menu = applyDietaryFilter(restaurant.menu, interpretation.dietary);
  const distanceMiles = getDistanceMiles(location, restaurant);
  const combo = selectCombo(menu, interpretation, "best");
  const cheapCombo = selectCombo(menu, interpretation, "cheap");
  const munchCombo = selectCombo(menu, interpretation, "munch");
  const categoryMatch = restaurant.categories.includes(interpretation.category) ? 8 : 0;
  const itemMatch = combo.reduce(
    (sum, item) => sum + scoreMenuItem(item, interpretation),
    0
  );
  const distanceScore = Math.max(0, 8 - distanceMiles);
  const ratingScore = restaurant.rating;
  const budgetLimit = getBudgetLimit(budget, interpretation);
  const pricePenalty =
    budgetLimit && comboTotal(combo) > budgetLimit ? (comboTotal(combo) - budgetLimit) * 1.5 : 0;
  const score = itemMatch + categoryMatch + distanceScore + ratingScore - pricePenalty;

  return {
    restaurant,
    combo,
    cheapCombo,
    munchCombo,
    distanceMiles,
    score,
    cheapCoverage: comboCoverage(cheapCombo, interpretation),
    cheapScore: scoreMenuCombo(cheapCombo, interpretation) - comboTotal(cheapCombo),
    munchScore: scoreMenuCombo(munchCombo, interpretation) + scoreMunchFactor(munchCombo)
  };
}

function pickCandidate(mode, candidates, interpretation) {
  if (mode === "cheap") {
    return [...candidates].sort((a, b) => {
      const coverageDifference = b.cheapCoverage - a.cheapCoverage;
      const priceDifference = comboTotal(a.cheapCombo) - comboTotal(b.cheapCombo);
      return coverageDifference || priceDifference || b.cheapScore - a.cheapScore;
    })[0];
  }

  if (mode === "munch") {
    return [...candidates].sort((a, b) => b.munchScore - a.munchScore)[0];
  }

  if (interpretation.priority === "cheapest") {
    return pickCandidate("cheap", candidates, interpretation);
  }

  if (interpretation.priority === "munch_mode") {
    return pickCandidate("munch", candidates, interpretation);
  }

  return [...candidates].sort((a, b) => b.score - a.score)[0];
}

function formatRecommendation(config, candidate, interpretation) {
  const combo =
    config.key === "cheap"
      ? candidate.cheapCombo
      : config.key === "munch"
        ? candidate.munchCombo
        : candidate.combo;
  const estimatedPrice = Number(comboTotal(combo).toFixed(2));
  const eta = candidate.restaurant.deliveryEtaMinutes + Math.round(candidate.distanceMiles * 2);
  const matchedItems = findMatchedItems(combo, interpretation);

  return {
    type: config.type,
    mode: config.key,
    description: config.description,
    restaurantId: candidate.restaurant.id,
    restaurant: candidate.restaurant.name,
    cuisine: candidate.restaurant.cuisine,
    imageUrl: candidate.restaurant.imageUrl,
    rating: candidate.restaurant.rating,
    distanceMiles: Number(candidate.distanceMiles.toFixed(1)),
    deliveryEtaMinutes: eta,
    combo: combo.map((item) => item.name),
    items: combo.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      role: item.role,
      tags: item.tags
    })),
    estimatedPrice,
    matchScore: Math.max(62, Math.min(98, Math.round(candidate.score * 3))),
    matchReason: buildMatchReason(candidate.restaurant, matchedItems, interpretation),
    addOns: recommendAddOns(candidate.restaurant.menu, combo, interpretation, config.key),
    mockCheckout: {
      endpoint: "/api/checkout",
      method: "POST"
    }
  };
}

function selectCombo(menu, interpretation, mode) {
  const eligibleMenu = menu.length ? menu : restaurants.flatMap((restaurant) => restaurant.menu);
  const maxItems = mode === "munch" ? 4 : 3;
  const sorted = [...eligibleMenu].sort((a, b) => {
    if (mode === "cheap") {
      return a.price - b.price || scoreMenuItem(b, interpretation) - scoreMenuItem(a, interpretation);
    }

    if (mode === "munch") {
      return (
        scoreMenuItem(b, interpretation) +
        scoreMunchFactor([b]) -
        (scoreMenuItem(a, interpretation) + scoreMunchFactor([a]))
      );
    }

    return scoreMenuItem(b, interpretation) - scoreMenuItem(a, interpretation);
  });
  const selected = [];

  for (const desiredItem of interpretation.items) {
    if (selected.length >= maxItems) {
      break;
    }

    const match = sorted.find(
      (item) =>
        !selected.includes(item) &&
        itemMatchesTerm(item, desiredItem) &&
        (mode !== "cheap" || item.price <= 12)
    );

    if (match) {
      selected.push(match);
    }
  }

  for (const role of getRoleOrder(mode)) {
    if (selected.length >= maxItems) {
      break;
    }

    const match = sorted.find(
      (item) => !selected.includes(item) && item.role === role && isReasonableForMode(item, mode)
    );

    if (match) {
      selected.push(match);
    }

    if (selected.length >= maxItems) {
      break;
    }
  }

  for (const item of sorted) {
    if (selected.length >= maxItems) {
      break;
    }

    if (!selected.includes(item) && isReasonableForMode(item, mode)) {
      selected.push(item);
    }
  }

  return selected;
}

function comboCoverage(combo, interpretation) {
  return interpretation.items.filter((desiredItem) =>
    combo.some((item) => itemMatchesTerm(item, desiredItem))
  ).length;
}

function getRoleOrder(mode) {
  if (mode === "cheap") {
    return ["entree", "side", "drink"];
  }

  if (mode === "munch") {
    return ["entree", "side", "dessert", "drink"];
  }

  return ["entree", "side", "drink"];
}

function isReasonableForMode(item, mode) {
  if (mode === "cheap") {
    return item.price <= 10.5 || item.role === "drink";
  }

  return true;
}

function scoreMenuCombo(combo, interpretation) {
  return combo.reduce((sum, item) => sum + scoreMenuItem(item, interpretation), 0);
}

function scoreMenuItem(item, interpretation) {
  const itemText = `${item.name} ${item.tags.join(" ")}`.toLowerCase();
  let score = 1;

  for (const desiredItem of interpretation.items) {
    if (itemMatchesTerm(item, desiredItem)) {
      score += 10;
    } else if (desiredItem.split(" ").some((part) => itemText.includes(part))) {
      score += 4;
    }
  }

  if (item.tags.includes(interpretation.category)) {
    score += 4;
  }

  for (const mood of interpretation.mood) {
    if (item.tags.includes(mood)) {
      score += 5;
    }
  }

  for (const dietary of interpretation.dietary) {
    if (item.tags.includes(dietary)) {
      score += 6;
    }
  }

  if (item.role === "entree") {
    score += 2;
  }

  return score;
}

function scoreMunchFactor(combo) {
  const munchTags = ["crispy", "spicy", "loaded", "cheesy", "sweet", "comfort", "shareable"];
  return combo.reduce(
    (sum, item) => sum + item.tags.filter((tag) => munchTags.includes(tag)).length * 3,
    0
  );
}

function itemMatchesTerm(item, term) {
  const normalizedTerm = String(term || "").toLowerCase();
  const text = `${item.name} ${item.tags.join(" ")}`.toLowerCase();
  return text.includes(normalizedTerm) || normalizedTerm.split(" ").some((part) => text.includes(part));
}

function applyDietaryFilter(menu, dietary) {
  if (!dietary?.length) {
    return menu;
  }

  const filtered = menu.filter((item) =>
    dietary.every((restriction) => item.tags.includes(restriction))
  );

  return filtered.length >= 3 ? filtered : menu;
}

function getDistanceMiles(location, restaurant) {
  if (
    Number.isFinite(location?.latitude) &&
    Number.isFinite(location?.longitude) &&
    Number.isFinite(restaurant.latitude) &&
    Number.isFinite(restaurant.longitude)
  ) {
    const calculatedDistance = haversineMiles(
      location.latitude,
      location.longitude,
      restaurant.latitude,
      restaurant.longitude
    );

    if (calculatedDistance <= 50) {
      return calculatedDistance;
    }
  }

  return restaurant.baseDistanceMiles;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const radiusMiles = 3958.8;
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function comboTotal(combo) {
  return combo.reduce((sum, item) => sum + Number(item.price || 0), 0);
}

function findMatchedItems(combo, interpretation) {
  return combo
    .filter((item) => interpretation.items.some((desiredItem) => itemMatchesTerm(item, desiredItem)))
    .map((item) => item.name);
}

function buildMatchReason(restaurant, matchedItems, interpretation) {
  if (matchedItems.length) {
    return `${restaurant.name} hits ${matchedItems.slice(0, 2).join(" and ")} for your ${interpretation.category.replace("_", " ")} craving.`;
  }

  if (interpretation.mood.length) {
    return `${restaurant.name} lines up with the ${interpretation.mood[0].replace("_", " ")} mood.`;
  }

  return `${restaurant.name} is a reliable nearby combo pick.`;
}

function recommendAddOns(menu, combo, interpretation, mode) {
  const selectedIds = new Set(combo.map((item) => item.id));
  const addOns = menu
    .filter((item) => !selectedIds.has(item.id))
    .filter((item) => ["side", "drink", "dessert", "addon"].includes(item.role))
    .map((item) => ({
      ...item,
      addOnScore:
        scoreMenuItem(item, interpretation) +
        (mode === "munch" ? scoreMunchFactor([item]) : 0) -
        item.price * 0.25
    }))
    .sort((a, b) => b.addOnScore - a.addOnScore)
    .slice(0, 3);

  return addOns.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    role: item.role,
    reason: buildAddOnReason(item)
  }));
}

function buildAddOnReason(item) {
  if (item.tags.includes("spicy")) {
    return "adds heat";
  }

  if (item.tags.includes("sweet")) {
    return "sweet finish";
  }

  if (item.tags.includes("crispy")) {
    return "extra crunch";
  }

  if (item.tags.includes("healthy")) {
    return "lighter balance";
  }

  return "rounds out the order";
}

function getBudgetLimit(budget, interpretation) {
  if (interpretation.maxBudget) {
    return interpretation.maxBudget;
  }

  if (budget === "low" || interpretation.budget === "low") {
    return 14;
  }

  if (budget === "high" || interpretation.budget === "high") {
    return 28;
  }

  return 20;
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
