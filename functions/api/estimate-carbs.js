const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 45000;
const MAX_BODY_BYTES = 5_000_000;

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return json(503, { error: "OPENAI_API_KEY is not set" });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: "Request body too large" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const image = String(body.image || "");
  if (!image.startsWith("data:image/")) {
    return json(400, { error: "Missing image data URL" });
  }

  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let aiResponse;

  try {
    aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Estimate visible carbohydrates in this food or drink.",
                  "Return only JSON matching the schema.",
                  "Return total carbohydrate grams only; do not use carbohydrate exchange units.",
                  "short_note must be one natural English sentence in first person, naming the likely food, e.g. \"It looks like rice pudding.\"",
                  "If unsure, use confidence low and a conservative middle estimate.",
                  "Do not give medical advice."
                ].join("\n")
              },
              {
                type: "input_image",
                image_url: image
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "carb_estimate",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                grams: {
                  type: "number",
                  minimum: 0,
                  description: "Estimated carbohydrate grams."
                },
                confidence: {
                  type: "string",
                  enum: ["low", "medium", "high"]
                },
                short_note: {
                  type: "string",
                  description: "One short first-person English sentence naming the likely visible food."
                }
              },
              required: ["grams", "confidence", "short_note"]
            }
          }
        }
      })
    });
  } catch (error) {
    return json(504, {
      error: "OpenAI request timed out or network is unavailable.",
      code: error?.name === "AbortError" ? "openai_timeout" : "openai_network_error"
    });
  } finally {
    clearTimeout(timeout);
  }

  let result;
  try {
    result = await aiResponse.json();
  } catch {
    return json(502, {
      error: "OpenAI returned an unreadable response",
      code: "openai_bad_json"
    });
  }

  if (!aiResponse.ok) {
    return json(aiResponse.status, publicOpenAiError(result));
  }

  let parsed;
  try {
    parsed = parseResponseJson(result);
  } catch {
    return json(502, {
      error: "AI returned an unreadable estimate",
      code: "parse_failed"
    });
  }

  const grams = Math.max(0, Math.round(Number(parsed.grams)));
  return json(200, {
    grams: Number.isFinite(grams) ? grams : 0,
    confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "low",
    short_note: String(parsed.short_note || "").slice(0, 120),
    model
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: baseHeaders() });
}

export async function onRequest() {
  return json(405, { error: "Method not allowed" });
}

function parseResponseJson(result) {
  if (typeof result.output_text === "string") {
    return JSON.parse(result.output_text);
  }

  const text = result.output
    ?.flatMap((item) => item.content || [])
    ?.find((content) => content.type === "output_text")
    ?.text;

  if (!text) {
    throw new Error("OpenAI response did not include output text");
  }

  return JSON.parse(text);
}

function publicOpenAiError(result) {
  const error = result?.error || {};
  const code = String(error.code || error.type || "openai_error");
  const message = String(error.message || "OpenAI estimate failed");
  if (code === "insufficient_quota") {
    return {
      error: "OpenAI quota or billing is not active for this API key/project.",
      code
    };
  }
  return {
    error: message.slice(0, 240),
    code
  };
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: baseHeaders()
  });
}

function baseHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };
}
