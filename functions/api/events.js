export async function onRequestGet() {
  return json(200, {
    events: [],
    storage: "localStorage"
  });
}

export async function onRequestPut({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const events = Array.isArray(body) ? body : body.events;
  if (!Array.isArray(events)) {
    return json(400, { error: "Expected events array" });
  }

  return json(200, {
    ok: true,
    count: events.length,
    storage: "localStorage"
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: baseHeaders() });
}

export async function onRequest() {
  return json(405, { error: "Method not allowed" });
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
