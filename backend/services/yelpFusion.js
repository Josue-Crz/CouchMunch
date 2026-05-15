import { readFileSync } from "node:fs";

const mockRestaurants = JSON.parse(
  readFileSync(new URL("../data/mockMenus.json", import.meta.url), "utf8")
);

const YELP_BASE_URL = "https://api.yelp.com/v3";
const DEFAULT_SEARCH_RADIUS_METERS = 8000;
const DEFAULT_LIMIT = 12;
const METERS_PER_MILE = 1609.344;

const CATEGORY_ALIASES = {
  asian: ["asianfusion", "chinese", "japanese", "korean", "ramen", "sushi", "thai", "vietnamese"],
  cafe: ["cafes", "coffee", "coffeeroasteries"],
  dessert: ["bakeries", "desserts", "icecream"],
  fast_food: ["burgers", "chicken_wings", "fastfood", "hotdogs"],
  healthy: ["healthmarkets", "salad", "vegan", "vegetarian"],
  mexican: ["mexican", "tacos"],
  pizza: ["pizza"],
  sandwiches: ["delis", "sandwiches"]
};

export function getRestaurantSourceStatus() {
  const requestedSource = getRequestedRestaurantSource();
  const yelpConfigured = hasYelpCredentials();

  return {
    requestedSource,
    activeSource: requestedSource !== "mock" && yelpConfigured ? "yelp_fusion" : "mock_restaurants",
    fallbackSource: "mock_restaurants",
    yelp: {
      credentialsConfigured: yelpConfigured,
      credentialEnv: "YELP_API_KEY",
      businessSearchEndpoint: `${YELP_BASE_URL}/businesses/search`,
      radiusMeters: getSearchRadiusMeters()
    }
  };
}

export async function findNearbyRestaurants({ interpretation, location, openNow = false }) {
  if (shouldUseYelp()) {
    try {
      const yelpItems = await searchYelpBusinesses({ interpretation, location, openNow });

      if (yelpItems.length) {
        return {
          source: {
            type: "yelp_fusion",
            live: true,
            fallbackUsed: false,
            fallbackReason: null
          },
          items: yelpItems
        };
      }
    } catch (error) {
      console.warn("Yelp restaurant search failed, using mock fallback:", error.message);

      return {
        source: {
          type: "mock_restaurants",
          live: false,
          fallbackUsed: true,
          fallbackReason: error.message
        },
        items: getMockRestaurants({ interpretation, location })
      };
    }
  }

  return {
    source: {
      type: "mock_restaurants",
      live: false,
      fallbackUsed: getRequestedRestaurantSource() !== "mock",
      fallbackReason:
        getRequestedRestaurantSource() === "mock"
          ? null
          : "Yelp API credentials are not configured."
    },
    items: getMockRestaurants({ interpretation, location })
  };
}

export function summarizeRestaurant(restaurant) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    categories: restaurant.categories,
    imageUrl: restaurant.imageUrl,
    rating: restaurant.rating,
    reviewCount: restaurant.reviewCount,
    price: restaurant.price,
    address: restaurant.address,
    distanceMiles: restaurant.distanceMiles,
    source: restaurant.source,
    sourceLabel: restaurant.sourceLabel,
    businessUrl: restaurant.businessUrl,
    isClosed: restaurant.isClosed,
    actionOptions: restaurant.actionOptions || []
  };
}

async function searchYelpBusinesses({ interpretation, location, openNow }) {
  const params = new URLSearchParams({
    term: buildYelpSearchTerm(interpretation),
    categories: "restaurants,food",
    limit: String(DEFAULT_LIMIT),
    radius: String(getSearchRadiusMeters()),
    sort_by: "best_match"
  });

  if (openNow === true) {
    params.set("open_now", "true");
  }

  if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
    params.set("latitude", String(location.latitude));
    params.set("longitude", String(location.longitude));
  } else if (location?.label) {
    params.set("location", location.label);
  } else {
    throw new Error("Yelp search requires a location label or latitude/longitude.");
  }

  const response = await fetch(`${YELP_BASE_URL}/businesses/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${process.env.YELP_API_KEY}`,
      Accept: "application/json"
    }
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.description || `Yelp API returned ${response.status}.`);
  }

  return (payload.businesses || []).map((business) =>
    mapYelpBusinessToRestaurant({ business, interpretation })
  );
}

function mapYelpBusinessToRestaurant({ business, interpretation }) {
  const yelpCategories = business.categories || [];
  const categories = normalizeYelpCategories(yelpCategories);
  const cuisine = yelpCategories[0]?.title || titleCase(interpretation?.category || "restaurant");
  const distanceMiles = Number(((business.distance || 0) / METERS_PER_MILE).toFixed(1));
  const menu = buildSyntheticMenu({ business, cuisine, interpretation });
  const address = [business.location?.address1, business.location?.city, business.location?.state]
    .filter(Boolean)
    .join(", ");

  return {
    id: business.id,
    name: business.name,
    cuisine,
    categories,
    rating: business.rating || 0,
    reviewCount: business.review_count || 0,
    price: business.price || null,
    address,
    phone: business.display_phone || null,
    baseDistanceMiles: distanceMiles,
    distanceMiles,
    deliveryEtaMinutes: estimateReadyMinutes(distanceMiles),
    latitude: business.coordinates?.latitude || null,
    longitude: business.coordinates?.longitude || null,
    imageUrl: business.image_url || fallbackImageForCategory(interpretation?.category),
    businessUrl: business.url,
    isClosed: business.is_closed,
    source: "yelp_fusion",
    sourceLabel: "Yelp",
    transactions: business.transactions || [],
    actionOptions: [
      {
        key: "yelp",
        name: "Yelp",
        actionLabel: "View on Yelp",
        orderUrl: business.url,
        estimatedEtaMinutes: estimateReadyMinutes(distanceMiles),
        deliveryFee: 0,
        credentialsConfigured: true
      }
    ],
    menu
  };
}

function getMockRestaurants({ interpretation, location }) {
  return mockRestaurants
    .map((restaurant) => ({
      ...restaurant,
      distanceMiles: Number(restaurant.baseDistanceMiles.toFixed(1)),
      reviewCount: restaurant.reviewCount || Math.round(restaurant.rating * 100),
      price: restaurant.price || "$$",
      address: restaurant.address || location?.label || "Demo delivery zone",
      businessUrl: restaurant.businessUrl || null,
      isClosed: false,
      source: "mock_restaurants",
      sourceLabel: "Demo",
      actionOptions: [
        {
          key: "mock",
          name: "Demo source",
          actionLabel: "Mock checkout",
          orderUrl: null,
          estimatedEtaMinutes: restaurant.deliveryEtaMinutes,
          deliveryFee: 0,
          credentialsConfigured: false
        }
      ],
      menu:
        Array.isArray(restaurant.menu) && restaurant.menu.length
          ? restaurant.menu
          : buildSyntheticMenu({ business: restaurant, cuisine: restaurant.cuisine, interpretation })
    }))
    .sort((a, b) => scoreMockRestaurant(b, interpretation) - scoreMockRestaurant(a, interpretation));
}

function buildSyntheticMenu({ business, cuisine, interpretation }) {
  const items = [];
  const desiredItems = interpretation?.items?.length ? interpretation.items : ["signature meal"];
  const category = interpretation?.category || "comfort_food";
  const mood = interpretation?.mood || [];
  const usedRoles = new Set();

  for (const desiredItem of desiredItems.slice(0, 3)) {
    const role = inferMenuRole(desiredItem);
    usedRoles.add(role);
    items.push({
      id: `${business.id}-${slugify(desiredItem)}-${role}`,
      name: buildMenuItemName({ cuisine, desiredItem, role }),
      price: estimateItemPrice({ priceTier: business.price, role }),
      role,
      tags: [...new Set([desiredItem, category, role, "savory", ...mood])]
    });
  }

  if (!usedRoles.has("entree")) {
    items.unshift({
      id: `${business.id}-signature-plate`,
      name: `${cuisine} Favorite Plate`,
      price: estimateItemPrice({ priceTier: business.price, role: "entree" }),
      role: "entree",
      tags: [...new Set([category, "savory", "comfort", ...mood])]
    });
  }

  const staples = [
    {
      role: "side",
      name: category === "fast_food" ? "Crispy Fries" : "House Side",
      tags: ["side", "crispy", "comfort"]
    },
    {
      role: "drink",
      name: mood.includes("sweet") ? "Sweet Iced Drink" : "Iced Drink",
      tags: ["drink", "fresh", "sweet"]
    },
    {
      role: "dessert",
      name: "Sweet Bite",
      tags: ["dessert", "sweet"]
    }
  ];

  for (const staple of staples) {
    if (!usedRoles.has(staple.role)) {
      items.push({
        id: `${business.id}-${slugify(staple.name)}`,
        name: staple.name,
        price: estimateItemPrice({ priceTier: business.price, role: staple.role }),
        role: staple.role,
        tags: [...new Set([category, ...staple.tags, ...mood])]
      });
    }
  }

  return items;
}

function buildYelpSearchTerm(interpretation) {
  if (!interpretation) {
    return "restaurants";
  }

  const itemTerm = interpretation.items?.slice(0, 2).join(" ");
  const categoryTerm = interpretation.category?.replace("_", " ");
  return [itemTerm, categoryTerm, "restaurants"].filter(Boolean).join(" ");
}

function normalizeYelpCategories(categories) {
  const normalized = new Set();

  for (const category of categories) {
    const alias = String(category.alias || "").toLowerCase();
    const title = String(category.title || "").toLowerCase().replace(/\s+/g, "_");

    if (alias) {
      normalized.add(alias);
    }

    if (title) {
      normalized.add(title);
    }

    for (const [broadCategory, aliases] of Object.entries(CATEGORY_ALIASES)) {
      if (aliases.includes(alias)) {
        normalized.add(broadCategory);
      }
    }
  }

  normalized.add("restaurant");
  normalized.add("food");

  return [...normalized];
}

function inferMenuRole(item) {
  const normalized = String(item).toLowerCase();

  if (/(fries|chips|nachos|side|dumpling|gyoza|elote|soup)/.test(normalized)) {
    return "side";
  }

  if (/(shake|smoothie|coffee|tea|soda|drink|latte|cola|juice)/.test(normalized)) {
    return "drink";
  }

  if (/(dessert|cookie|brownie|churro|ice cream|mochi|cake|pie)/.test(normalized)) {
    return "dessert";
  }

  return "entree";
}

function buildMenuItemName({ cuisine, desiredItem, role }) {
  const itemName = titleCase(desiredItem);

  if (role === "entree") {
    return `${cuisine} ${itemName}`;
  }

  if (role === "drink" || role === "dessert") {
    return itemName;
  }

  return `${itemName} Side`;
}

function estimateItemPrice({ priceTier, role }) {
  const tier = Math.max(1, String(priceTier || "$$").length);
  const basePrices = {
    entree: 8.5,
    side: 3.5,
    drink: 2.75,
    dessert: 4
  };
  const roleBase = basePrices[role] || 6;

  return Number((roleBase + tier * 1.65).toFixed(2));
}

function estimateReadyMinutes(distanceMiles) {
  return 16 + Math.round(distanceMiles * 3);
}

function scoreMockRestaurant(restaurant, interpretation) {
  if (!interpretation) {
    return restaurant.rating;
  }

  const categoryScore = restaurant.categories?.includes(interpretation.category) ? 6 : 0;
  const menuText = restaurant.menu
    ?.map((item) => `${item.name} ${item.tags?.join(" ")}`)
    .join(" ")
    .toLowerCase();
  const itemScore = interpretation.items.filter((item) =>
    menuText?.includes(String(item).toLowerCase())
  ).length;

  return restaurant.rating + categoryScore + itemScore * 4;
}

function shouldUseYelp() {
  return getRequestedRestaurantSource() !== "mock" && hasYelpCredentials();
}

function hasYelpCredentials() {
  const key = process.env.YELP_API_KEY;
  return Boolean(key && !key.includes("your_yelp_fusion_api_key"));
}

function getRequestedRestaurantSource() {
  return String(process.env.RESTAURANT_DATA_SOURCE || "auto").toLowerCase();
}

function getSearchRadiusMeters() {
  const radius = Number(process.env.YELP_SEARCH_RADIUS_METERS);

  if (!Number.isFinite(radius)) {
    return DEFAULT_SEARCH_RADIUS_METERS;
  }

  return Math.max(100, Math.min(40000, Math.round(radius)));
}

function fallbackImageForCategory(category) {
  const images = {
    asian: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80",
    fast_food: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
    healthy: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
    mexican: "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=900&q=80",
    pizza: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80"
  };

  return images[category] || images.fast_food;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function titleCase(value) {
  return String(value)
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
