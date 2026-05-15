import OpenAI from "openai";

export function createOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function shouldUseOpenAI() {
  const requestedProvider = getRequestedAiProvider();
  return requestedProvider !== "local" && hasOpenAICredentials();
}

export function shouldUseOpenAIRecommendations() {
  const requestedProvider = getRequestedAiProvider();
  const requestedMode = getAiRecommendationMode();

  return (
    requestedProvider !== "local" &&
    requestedMode !== "local" &&
    hasOpenAICredentials()
  );
}

export function hasOpenAICredentials() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && !key.includes("your_openai_api_key"));
}

export function getRequestedAiProvider() {
  return String(process.env.AI_PROVIDER || "auto").toLowerCase();
}

export function getAiRecommendationMode() {
  return String(process.env.AI_RECOMMENDATION_MODE || "auto").toLowerCase();
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export function extractResponseText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  const outputText = response.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("");

  if (!outputText) {
    throw new Error("OpenAI returned no response text.");
  }

  return outputText;
}
