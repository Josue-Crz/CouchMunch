"use client";

import {
  BadgeDollarSign,
  Check,
  ChefHat,
  ExternalLink,
  Flame,
  Github,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
const DEFAULT_CRAVING = "burger fries and a chocolate shake";
const COPYRIGHT_YEAR = "2026";
const GITHUB_REPOSITORY_URL =
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY_URL || "https://github.com/Josue-Crz/CouchMunch";

const sampleCravings = [
  "spicy ramen and crispy dumplings",
  "cheap tacos under $15",
  "healthy protein bowl and smoothie",
  "pizza wings and something sweet"
];

const modeFilters = [
  { key: "all", label: "All", icon: SlidersHorizontal },
  { key: "best", label: "Best Match", icon: Sparkles },
  { key: "cheap", label: "Cheapest", icon: BadgeDollarSign },
  { key: "munch", label: "Munch Mode", icon: Flame }
];

const budgetOptions = [
  { key: "standard", label: "Standard" },
  { key: "low", label: "Budget" },
  { key: "high", label: "Splurge" }
];

export default function Home() {
  const [craving, setCraving] = useState(DEFAULT_CRAVING);
  const [locationInput, setLocationInput] = useState("Los Angeles, CA");
  const [location, setLocation] = useState({ label: "Los Angeles, CA" });
  const [budget, setBudget] = useState("standard");
  const [mode, setMode] = useState("all");
  const [openNow, setOpenNow] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState({});
  const [checkout, setCheckout] = useState(null);
  const [checkingOutId, setCheckingOutId] = useState("");

  useEffect(() => {
    submitCraving(DEFAULT_CRAVING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recommendations = result?.recommendations || [];
  const activeAddOns = useMemo(
    () =>
      Object.values(selectedAddOns)
        .flatMap((items) => items)
        .filter(Boolean),
    [selectedAddOns]
  );

  async function submitCraving(nextCraving = craving) {
    const cleanedCraving = nextCraving.trim();
    const requestLocation = normalizeRequestLocation(locationInput, location);

    if (!cleanedCraving) {
      setError("Add a craving first.");
      return;
    }

    if (!requestLocation.label && !requestLocation.latitude) {
      setError("Add a delivery location first.");
      return;
    }

    setLoading(true);
    setError("");
    setCheckout(null);

    try {
      const response = await fetch(`${API_BASE}/api/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          craving: cleanedCraving,
          location: requestLocation,
          budget,
          mode,
          openNow
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not build recommendations.");
      }

      setCraving(cleanedCraving);
      setLocation(requestLocation);
      setResult(payload);
      setSelectedAddOns({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      setError("Browser location is not available.");
      return;
    }

    setGeoLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          label: "Current location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setLocationInput("Current location");
        setGeoLoading(false);
      },
      () => {
        setError("Location permission was not granted.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  function toggleAddOn(recommendation, addOn) {
    setSelectedAddOns((current) => {
      const currentItems = current[recommendation.restaurantId] || [];
      const exists = currentItems.some((item) => item.id === addOn.id);
      const nextItems = exists
        ? currentItems.filter((item) => item.id !== addOn.id)
        : [...currentItems, addOn];

      return {
        ...current,
        [recommendation.restaurantId]: nextItems
      };
    });
  }

  async function createCheckout(recommendation) {
    setCheckingOutId(recommendation.restaurantId);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation,
          selectedAction: recommendation.primaryAction,
          selectedAddOns: selectedAddOns[recommendation.restaurantId] || []
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Checkout failed.");
      }

      setCheckout(payload);
    } catch (checkoutError) {
      setError(checkoutError.message);
    } finally {
      setCheckingOutId("");
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-md bg-[#ff5a3c] text-white shadow-panel">
              <ChefHat className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-stone-950 sm:text-3xl">CouchMunch</h1>
              <p className="max-w-2xl text-sm text-stone-600">
                Cravings turned into nearby meal combos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <span className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 shadow-sm">
              <MapPin className="h-4 w-4 text-teal-700" aria-hidden="true" />
              {location.label}
            </span>
            {activeAddOns.length > 0 && (
              <span className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {activeAddOns.length} add-on{activeAddOns.length === 1 ? "" : "s"} selected
              </span>
            )}
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(19rem,23rem)_1fr]">
          <aside className="h-fit rounded-md border border-stone-200 bg-white p-4 shadow-panel">
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                submitCraving();
              }}
            >
              <label className="block">
                <span className="text-sm font-semibold text-stone-800">Craving</span>
                <textarea
                  className="mt-2 min-h-28 w-full resize-none rounded-md border border-stone-300 bg-stone-50 px-3 py-3 text-base text-stone-950 outline-none ring-[#ff5a3c]/25 transition focus:border-[#ff5a3c] focus:ring-4"
                  value={craving}
                  onChange={(event) => setCraving(event.target.value)}
                  placeholder="burger fries and a shake"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-stone-800">Delivery location</span>
                <input
                  className="mt-2 min-h-11 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-base text-stone-950 outline-none ring-[#ff5a3c]/25 transition focus:border-[#ff5a3c] focus:ring-4"
                  value={locationInput}
                  onChange={(event) => {
                    setLocationInput(event.target.value);
                    setLocation({ label: event.target.value });
                  }}
                  placeholder="City, ZIP, or address"
                />
              </label>

              <div>
                <span className="text-sm font-semibold text-stone-800">Quick picks</span>
                <div className="mt-2 grid gap-2">
                  {sampleCravings.map((sample) => (
                    <button
                      className="flex min-h-10 items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-700 transition hover:border-[#ff5a3c] hover:bg-orange-50"
                      key={sample}
                      type="button"
                      onClick={() => submitCraving(sample)}
                    >
                      <span>{sample}</span>
                      <Search className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-sm font-semibold text-stone-800">Nearby source</span>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <div className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-teal-700 bg-teal-700 px-3 text-sm font-semibold text-white">
                    <Store className="h-4 w-4" aria-hidden="true" />
                    Yelp Fusion
                  </div>
                  <button
                    className={`inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-sm font-semibold transition ${
                      openNow
                        ? "border-[#ff5a3c] bg-[#ff5a3c] text-white"
                        : "border-stone-200 bg-white text-stone-700 hover:border-[#ff5a3c]"
                    }`}
                    type="button"
                    onClick={() => setOpenNow((current) => !current)}
                  >
                    Open now
                  </button>
                </div>
              </div>

              <div>
                <span className="text-sm font-semibold text-stone-800">Budget</span>
                <div className="mt-2 grid grid-cols-3 rounded-md border border-stone-200 bg-stone-100 p-1">
                  {budgetOptions.map((option) => (
                    <button
                      className={`min-h-10 rounded px-2 text-sm font-semibold transition ${
                        budget === option.key
                          ? "bg-white text-stone-950 shadow-sm"
                          : "text-stone-600 hover:text-stone-950"
                      }`}
                      key={option.key}
                      type="button"
                      onClick={() => setBudget(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-sm font-semibold text-stone-800">Mode</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {modeFilters.map((filter) => {
                    const Icon = filter.icon;
                    const active = mode === filter.key;

                    return (
                      <button
                        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                          active
                            ? "border-teal-700 bg-teal-700 text-white"
                            : "border-stone-200 bg-white text-stone-700 hover:border-teal-700"
                        }`}
                        key={filter.key}
                        type="button"
                        onClick={() => setMode(filter.key)}
                        title={filter.label}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-2">
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#ff5a3c] px-4 font-bold text-white transition hover:bg-[#e9462b] disabled:cursor-not-allowed disabled:bg-stone-300"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  )}
                  Find combos
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-4 font-semibold text-stone-800 transition hover:border-teal-700 disabled:cursor-not-allowed disabled:text-stone-400"
                  type="button"
                  onClick={useBrowserLocation}
                  disabled={geoLoading}
                >
                  {geoLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                  )}
                  Use location
                </button>
              </div>
            </form>

            {result?.interpretation && (
              <div className="mt-5 border-t border-stone-200 pt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <Sparkles className="h-4 w-4 text-[#ff5a3c]" aria-hidden="true" />
                  Interpreted craving
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.interpretation.items.map((item) => (
                    <span
                      className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700"
                      key={item}
                    >
                      {item}
                    </span>
                  ))}
                  <span className="rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                    {result.interpretation.category.replace("_", " ")}
                  </span>
                </div>
              </div>
            )}
          </aside>

          <section className="min-w-0">
            {error && (
              <div className="mb-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {checkout && (
              <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 p-4 text-teal-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-bold">
                      <Check className="h-5 w-5" aria-hidden="true" />
                      Mock checkout ready
                    </div>
                    <p className="mt-1 text-sm">
                      {checkout.restaurant}
                      {checkout.selectedAction?.name ? ` via ${checkout.selectedAction.name}` : ""}{" "}
                      total: {formatPrice(checkout.total)}. ETA:{" "}
                      {checkout.estimatedArrivalMinutes} min.
                    </p>
                  </div>
                  <span className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-teal-800">
                    {checkout.checkoutId.slice(0, 8)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-3">
              {loading && recommendations.length === 0
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div
                      className="h-[34rem] animate-pulse rounded-md border border-stone-200 bg-white shadow-panel"
                      key={index}
                    />
                  ))
                : recommendations.map((recommendation) => (
                    <RecommendationCard
                      checkingOut={checkingOutId === recommendation.restaurantId}
                      key={`${recommendation.type}-${recommendation.restaurantId}`}
                      onCheckout={() => createCheckout(recommendation)}
                      onToggleAddOn={(addOn) => toggleAddOn(recommendation, addOn)}
                      recommendation={recommendation}
                      selectedAddOns={selectedAddOns[recommendation.restaurantId] || []}
                    />
                  ))}
            </div>
            {!loading && result && recommendations.length === 0 && (
              <div className="rounded-md border border-stone-200 bg-white p-6 text-stone-700 shadow-panel">
                <div className="flex items-center gap-2 font-bold text-stone-950">
                  <Store className="h-5 w-5 text-teal-700" aria-hidden="true" />
                  No nearby restaurants found
                </div>
                <p className="mt-2 text-sm">
                  Try a nearby city, ZIP code, broader craving, or turn off Open now.
                </p>
              </div>
            )}
          </section>
        </section>

        <footer className="flex flex-col gap-3 border-t border-stone-200 pt-5 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-stone-700">
            &copy; {COPYRIGHT_YEAR} Josue Cruz. Open source under the MIT License.
          </p>
          <a
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-4 font-bold text-stone-900 shadow-sm transition hover:border-stone-950 hover:bg-stone-950 hover:text-white"
            href={GITHUB_REPOSITORY_URL}
            rel="noreferrer"
            target="_blank"
            title="View CouchMunch on GitHub"
            aria-label="View CouchMunch on GitHub"
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            GitHub repository
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}

function RecommendationCard({
  checkingOut,
  onCheckout,
  onToggleAddOn,
  recommendation,
  selectedAddOns
}) {
  const selectedIds = new Set(selectedAddOns.map((item) => item.id));
  const addOnTotal = selectedAddOns.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const displayTotal = recommendation.estimatedPrice + addOnTotal;
  const typeStyles = {
    "Best Match": "bg-teal-700 text-white",
    Cheapest: "bg-amber-500 text-stone-950",
    "Munch Mode": "bg-[#ff5a3c] text-white"
  };

  return (
    <article className="flex min-h-[34rem] flex-col overflow-hidden rounded-md border border-stone-200 bg-white shadow-panel">
      <div className="relative h-44 overflow-hidden food-photo">
        <img
          alt={`${recommendation.restaurant} food`}
          className="h-full w-full object-cover"
          src={recommendation.imageUrl}
        />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span
            className={`rounded-md px-3 py-1 text-xs font-black ${typeStyles[recommendation.type] || "bg-stone-950 text-white"}`}
          >
            {recommendation.type}
          </span>
          {recommendation.aiRanked && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-black text-teal-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI ranked
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-stone-950">{recommendation.restaurant}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-600">
              <span>{recommendation.cuisine}</span>
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                {recommendation.rating}
              </span>
              {recommendation.reviewCount && <span>{recommendation.reviewCount} reviews</span>}
              {recommendation.price && <span>{recommendation.price}</span>}
              <span>{recommendation.distanceMiles} mi</span>
              <span>{recommendation.deliveryEtaMinutes} min</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(recommendation.actionOptions || []).map((action) => (
                <span
                  className="inline-flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-[0.7rem] font-bold text-teal-800"
                  key={action.key}
                >
                  <Store className="h-3 w-3" aria-hidden="true" />
                  {action.name}
                </span>
              ))}
              {recommendation.isClosed && (
                <span className="rounded bg-stone-100 px-2 py-1 text-[0.7rem] font-bold text-stone-600">
                  Closed
                </span>
              )}
            </div>
          </div>
          <div className="rounded-md bg-stone-100 px-2.5 py-2 text-right">
            <div className="text-lg font-black text-stone-950">{formatPrice(displayTotal)}</div>
            <div className="text-[0.68rem] font-bold uppercase text-stone-500">est.</div>
          </div>
        </div>

        <p className="mt-3 min-h-12 text-sm leading-6 text-stone-600">
          {recommendation.matchReason}
        </p>
        {recommendation.address && (
          <div className="mt-1 text-xs font-semibold text-stone-500">
            {recommendation.address}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {recommendation.items.map((item) => (
            <div
              className="flex min-h-11 items-center justify-between rounded-md bg-stone-50 px-3 py-2"
              key={item.id}
            >
              <span className="text-sm font-semibold text-stone-800">{item.name}</span>
              <span className="text-sm font-bold text-stone-600">{formatPrice(item.price)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-bold text-stone-800">Add-ons</div>
          <div className="grid gap-2">
            {recommendation.addOns.map((addOn) => {
              const active = selectedIds.has(addOn.id);

              return (
                <button
                  className={`flex min-h-12 items-center justify-between rounded-md border px-3 py-2 text-left transition ${
                    active
                      ? "border-teal-700 bg-teal-50 text-teal-950"
                      : "border-stone-200 bg-white text-stone-700 hover:border-teal-700"
                  }`}
                  key={addOn.id}
                  type="button"
                  onClick={() => onToggleAddOn(addOn)}
                  title={`Add ${addOn.name}`}
                >
                  <span>
                    <span className="block text-sm font-bold">{addOn.name}</span>
                    <span className="block text-xs text-stone-500">
                      {addOn.reason} · {formatPrice(addOn.price)}
                    </span>
                  </span>
                  {active ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-auto grid gap-2 pt-4">
          {recommendation.businessUrl && (
            <a
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-4 font-bold text-stone-900 transition hover:border-teal-700"
              href={recommendation.businessUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View on Yelp
            </a>
          )}
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-stone-950 px-4 font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            type="button"
            onClick={onCheckout}
            disabled={checkingOut}
          >
            {checkingOut ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            )}
            Mock checkout
          </button>
        </div>
      </div>
    </article>
  );
}

function normalizeRequestLocation(locationInput, location) {
  const label = locationInput.trim();

  if (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.label === locationInput
  ) {
    return location;
  }

  return {
    label
  };
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}
