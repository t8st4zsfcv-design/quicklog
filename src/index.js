import {
  onRequest as onEstimateRequest,
  onRequestOptions as onEstimateOptions,
  onRequestPost as onEstimatePost
} from "../functions/api/estimate-carbs.js";
import {
  onRequest as onEventsRequest,
  onRequestGet as onEventsGet,
  onRequestOptions as onEventsOptions,
  onRequestPut as onEventsPut
} from "../functions/api/events.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/estimate-carbs") {
      if (request.method === "POST") return onEstimatePost({ request, env, ctx });
      if (request.method === "OPTIONS") return onEstimateOptions({ request, env, ctx });
      return onEstimateRequest({ request, env, ctx });
    }

    if (url.pathname === "/api/events") {
      if (request.method === "GET") return onEventsGet({ request, env, ctx });
      if (request.method === "PUT") return onEventsPut({ request, env, ctx });
      if (request.method === "OPTIONS") return onEventsOptions({ request, env, ctx });
      return onEventsRequest({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  }
};
