// ---------------------------------------------------------------------------
// Quick Log - timestamped life-event logger for CGM analysis
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dialog-events-v2";
const ACTIVE_DURATIONS_KEY = "active_durations";
const LEGACY_STORAGE_KEY = "dialog-events-v1";
const PENDING_SYNC_KEY = "dialog-events-pending-sync";
const DELETED_EVENTS_KEY = "dialog-events-deleted-ids";
const LAST_REMOVED_EVENT_KEY = "dialog-last-removed-event";
const SCHEMA_VERSION = 3;
const CAN_USE_SERVER_DB = location.protocol === "http:" || location.protocol === "https:";
const SERVER_RETRY_MS = 8000;
const API_TIMEOUT_MS = 12000;
const AI_TIMEOUT_MS = 45000;
const APP_VERSION = "72";

// Flipped to true after we detect the deploy has no /api/* functions yet
// (Cloudflare Pages without Functions, or pure-static host). When true:
// - we stop trying to sync to a server (no retry spam)
// - Camera AI button shows a friendly "not deployed yet" message
// - everything else (localStorage, CSV export, offline) keeps working
let serverFeaturesUnavailable = false;

const DURATION_TYPES = new Set(["exercise", "activity", "nap"]);
const TIMER_TYPES = new Set(["exercise", "activity", "nap", "party"]);
const STATE_TYPES = new Set(["stress", "frustration", "nervousness"]);
const MOOD_LEVELS = ["S", "M", "L"];
const PORTION_LEVELS = ["S", "M", "L", "XL"];
const LEVEL_LABELS = {
  S: "Small",
  M: "Medium",
  L: "High",
  XL: "XL"
};

const EVENT_CATEGORIES = {
  protein: "drink",
  carbs: "food",
  junk_food: "food",
  beer: "drink",
  wine: "drink",
  coffee: "drink",
  exercise: "activity",
  activity: "activity",
  nap: "activity",
  party: "activity",
  stress: "mood",
  frustration: "mood",
  nervousness: "mood",
  anxiety: "mood",
  well_being: "mood",
  sleep: "activity",
  note: "note"
};

const LABELS = {
  exercise: "Exercise",
  activity: "Activity",
  nap: "Nap",
  party: "Party",
  beer: "Beer",
  wine: "Wine",
  coffee: "Coffee",
  protein: "Protein",
  carbs: "Carbs",
  junk_food: "Junk food",
  stress: "Stress",
  frustration: "Frustration",
  nervousness: "Nervousness",
  anxiety: "Nervousness",
  well_being: "Well-being",
  note: "Note",
  sleep: "Sleep",
  food: "Food"
};

const statusText = document.querySelector("#statusText");
const networkStatus = document.querySelector("#networkStatus");
const dbStatus = document.querySelector("#dbStatus");
const logPanel = document.querySelector("#logPanel");
const logBody = document.querySelector("#logBody");
const noteDialog = document.querySelector("#noteDialog");
const noteText = document.querySelector("#noteText");
const tableBtn = document.querySelector("#tableBtn");
const noteBtn = document.querySelector("#noteBtn");
const categoryTitle = document.querySelector("#categoryTitle");
const appShell = document.querySelector(".app-shell");
const choiceDialog = document.querySelector("#choiceDialog");
const choiceTitle = document.querySelector("#choiceTitle");
const choiceActions = document.querySelector("#choiceActions");
const aiPhotoInput = document.querySelector("#aiPhotoInput");
const statToday = document.querySelector("#statToday");
const statTotal = document.querySelector("#statTotal");
const statCarbs = document.querySelector("#statCarbs");
const statActive = document.querySelector("#statActive");

const CATEGORY_LABELS = {
  main: "Overall",
  food: "Jedlo",
  drink: "Drinky",
  activity: "Aktivity",
  mood: "Nálada"
};

const CHOICES = {
  carbs: {
    title: "Carbs",
    items: ["Rice", "Potatoes", "Pasta"]
  },
  junk_food: {
    title: "Junk food size",
    items: PORTION_LEVELS
  }
};

let durationTickInterval = 0;
let serverSyncReady = false;
let serverSyncTimer = 0;
let serverRetryInterval = 0;
let statusTypingTimer = 0;

function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  markServerSyncPending();
  scheduleServerSave(events);
}

function readActiveDurations() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_DURATIONS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeActiveDurations(activeDurations) {
  localStorage.setItem(ACTIVE_DURATIONS_KEY, JSON.stringify(activeDurations));
}

function writeLocalEventsOnly(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function readDeletedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELETED_EVENTS_KEY)) || []);
  } catch {
    return new Set();
  }
}

function writeDeletedIds(deletedIds) {
  localStorage.setItem(DELETED_EVENTS_KEY, JSON.stringify([...deletedIds]));
}

function markEventsDeleted(ids) {
  const deletedIds = readDeletedIds();
  for (const id of ids) {
    if (id) deletedIds.add(id);
  }
  writeDeletedIds(deletedIds);
}

function unmarkEventsDeleted(ids) {
  const deletedIds = readDeletedIds();
  for (const id of ids) {
    if (id) deletedIds.delete(id);
  }
  writeDeletedIds(deletedIds);
}

function rememberRemovedEvent(event) {
  if (!event?.id) return;
  sessionStorage.setItem(LAST_REMOVED_EVENT_KEY, JSON.stringify(event));
}

function readLastRemovedEvent() {
  try {
    return JSON.parse(sessionStorage.getItem(LAST_REMOVED_EVENT_KEY)) || null;
  } catch {
    return null;
  }
}

function clearLastRemovedEvent() {
  sessionStorage.removeItem(LAST_REMOVED_EVENT_KEY);
}

function markServerSyncPending() {
  localStorage.setItem(PENDING_SYNC_KEY, "1");
}

function clearServerSyncPending() {
  localStorage.removeItem(PENDING_SYNC_KEY);
}

function hasServerSyncPending() {
  return localStorage.getItem(PENDING_SYNC_KEY) === "1";
}

function mergeEventLists(eventLists, { applyDeletedIds = true } = {}) {
  const byId = new Map();
  const deletedIds = applyDeletedIds ? readDeletedIds() : new Set();
  for (const events of eventLists) {
    for (const event of events || []) {
      if (!event?.id) continue;
      if (deletedIds.has(event.id)) continue;
      byId.set(event.id, { ...byId.get(event.id), ...event });
    }
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.timestamp || b.timestamp_start || 0) - new Date(a.timestamp || a.timestamp_start || 0));
}

function mergeEvents(...eventLists) {
  return mergeEventLists(eventLists);
}

function scheduleServerSave(events = readEvents()) {
  if (!CAN_USE_SERVER_DB) return;
  if (serverFeaturesUnavailable) return;
  startServerRetry();
  window.clearTimeout(serverSyncTimer);
  serverSyncTimer = window.setTimeout(() => {
    saveEventsToServer(events).catch(() => {
      serverSyncReady = false;
      markServerSyncPending();
      setStatus("Saved locally. Server DB sync failed.");
    });
  }, 150);
}

async function saveEventsToServer(events = readEvents()) {
  if (!CAN_USE_SERVER_DB) return;
  updateDbStatus("Syncing");
  const response = await fetchWithTimeout("/api/events", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events })
  }, API_TIMEOUT_MS);
  if (!response.ok) throw new Error("Failed to save events DB");
  serverSyncReady = true;
  updateDbStatus("DB ready");
  clearServerSyncPending();
  stopServerRetry();
}

function startServerRetry() {
  if (!CAN_USE_SERVER_DB || serverRetryInterval) return;
  if (serverFeaturesUnavailable) return;
  serverRetryInterval = window.setInterval(() => {
    if (!hasServerSyncPending()) {
      stopServerRetry();
      return;
    }
    hydrateEventsFromServer({ quiet: true }).catch(() => {});
  }, SERVER_RETRY_MS);
}

function stopServerRetry() {
  window.clearInterval(serverRetryInterval);
  serverRetryInterval = 0;
}

async function hydrateEventsFromServer({ quiet = false } = {}) {
  if (!CAN_USE_SERVER_DB) {
    setStatus("Using file mode. Open over HTTP(S) for sync.");
    return;
  }
  if (serverFeaturesUnavailable) {
    updateDbStatus("iPhone only");
    return;
  }

  try {
    const response = await fetchWithTimeout("/api/events", {}, API_TIMEOUT_MS);
    if (response.status === 404 || response.status === 405) {
      // Static host without server functions yet (Phase 1 of the Cloudflare deploy).
      // Switch to iPhone-only mode permanently for this session — no retries, no spam.
      serverFeaturesUnavailable = true;
      stopServerRetry();
      clearServerSyncPending();
      updateDbStatus("iPhone only");
      if (!quiet) setStatus("iPhone-only mode. All events stay on this phone. CSV export works.");
      return;
    }
    if (!response.ok) throw new Error("Failed to load events DB");
    const payload = await response.json();
    const serverEvents = Array.isArray(payload.events) ? payload.events : [];
    const localEvents = readEvents();
    const hadPendingSync = hasServerSyncPending();
    const merged = mergeEventLists([serverEvents, localEvents], { applyDeletedIds: hadPendingSync });
    writeLocalEventsOnly(merged);
    serverSyncReady = true;
    updateDbStatus("DB ready");
    renderLog();
    if (hadPendingSync) await saveEventsToServer(merged);
    if (!quiet) setStatus("DB ready.");
  } catch {
    serverSyncReady = false;
    updateDbStatus("Local cache");
    if (readEvents().length || hasServerSyncPending()) {
      markServerSyncPending();
      startServerRetry();
    }
    if (!quiet) setStatus("Using local cache. Server unavailable.");
  }
}

async function refreshApp() {
  setStatus("Refreshing app...");
  try {
    const registrations = navigator.serviceWorker?.getRegistrations
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
  } catch {
    // Refresh should still work if service worker update is unavailable.
  }
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.searchParams.set("v", APP_VERSION);
  window.location.replace(url.toString());
}

function makeId() {
  if (window.crypto?.randomUUID) return `evt_${window.crypto.randomUUID()}`;
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  const date = new Date();
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${hours}:${minutes}`;
}

function localTime(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function localDate(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(iso));
}

function toastTime(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function elapsedSeconds(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

function durationBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const seconds = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function formatClock(totalSeconds) {
  const value = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function minutesBetween(startIso, endIso) {
  const seconds = durationBetween(startIso, endIso);
  if (seconds == null) return null;
  return Math.max(1, Math.round(seconds / 60));
}

function makeEvent({
  event_type,
  action = "instant",
  intensity = null,
  note = null,
  timestamp = null,
  duration_min = null,
  timestamp_start = null,
  timestamp_end = null,
  carbs_grams = null,
  ai_estimate = null
}) {
  return {
    id: makeId(),
    schema_version: SCHEMA_VERSION,
    timestamp: timestamp || timestamp_start || nowIso(),
    timestamp_start: timestamp_start || timestamp || nowIso(),
    timestamp_end: timestamp_end || null,
    event_type,
    action,
    intensity: intensity ?? null,
    duration_min: duration_min ?? null,
    note: note || null,
    carbs_grams: carbs_grams ?? null,
    photo_url: null,
    ai_estimate: ai_estimate ?? null
  };
}

function addEvent(payload) {
  const event = makeEvent(payload);
  const events = readEvents();
  events.unshift(event);
  writeEvents(events);
  renderLog();
  setStatus(eventAddedMessage(event));
  flashLatestRow();
  return event;
}

function eventAddedMessage(event) {
  const details = [];
  let name = displayLabel(event);

  if (event.event_type === "carbs" && event.note && event.note !== "AI estimate") {
    name = event.note;
  }

  if (["carbs", "junk_food"].includes(event.event_type) && event.intensity) {
    details.push(`veľkosť ${event.intensity}`);
  } else if ((STATE_TYPES.has(event.event_type) || event.event_type === "anxiety") && event.intensity) {
    details.push(`intenzita ${event.intensity}`);
  }

  if (event.carbs_grams != null) {
    details.push(`${event.carbs_grams} g sacharidov`);
  }

  if (event.duration_min != null && event.duration_min !== "") {
    details.push(formatDurationMinutes(event.duration_min));
  }

  if (event.note && event.event_type !== "carbs" && event.note !== "AI estimate") {
    details.push(event.note);
  }

  return details.length
    ? `Pridané do tabuľky: ${name}, ${details.join(", ")}.`
    : `Pridané do tabuľky: ${name}.`;
}

function updateEvent(id, patch) {
  const events = readEvents();
  const index = events.findIndex((event) => event.id === id);
  if (index === -1) return null;
  events[index] = { ...events[index], ...patch };
  writeEvents(events);
  renderLog();
  return events[index];
}

function deleteEvent(id) {
  const events = readEvents();
  const removed = events.find((event) => event.id === id);
  if (removed) rememberRemovedEvent(removed);
  markEventsDeleted([id]);
  writeEvents(events.filter((event) => event.id !== id));
  if (removed) cleanupActiveForDeletedEvent(removed);
  renderLog();
  return removed;
}

function recoverLastRemovedEvent() {
  const event = readLastRemovedEvent();
  if (!event?.id) {
    setStatus("Nothing to recover.");
    return null;
  }

  const events = readEvents();
  if (events.some((item) => item.id === event.id)) {
    clearLastRemovedEvent();
    setStatus("Already recovered.");
    return event;
  }

  unmarkEventsDeleted([event.id]);
  const recovered = mergeEventLists([events, [event]], { applyDeletedIds: false });
  writeEvents(recovered);
  clearLastRemovedEvent();
  renderLog();
  renderTimerButtons();
  flashLatestRow();
  setStatus(`Recovered: ${displayLabel(event)}`);
  return event;
}

function cleanupActiveForDeletedEvent(event) {
  if (event.action !== "start") return;
  const activeDurations = readActiveDurations();
  if (activeDurations[event.event_type]?.event_id === event.id) {
    delete activeDurations[event.event_type];
    writeActiveDurations(activeDurations);
    renderTimerButtons();
  }
}

function setStatus(message) {
  window.clearInterval(statusTypingTimer);
  statusText.textContent = message;
  updateNetworkStatus();
}

function typeStatus(message) {
  window.clearInterval(statusTypingTimer);
  const text = String(message || "");
  let index = 0;
  statusText.textContent = "";
  updateNetworkStatus();
  statusTypingTimer = window.setInterval(() => {
    index += 1;
    statusText.textContent = text.slice(0, index);
    if (index >= text.length) {
      window.clearInterval(statusTypingTimer);
      statusTypingTimer = 0;
    }
  }, 18);
}

function updateNetworkStatus() {
  if (!networkStatus) return;
  const online = navigator.onLine !== false;
  networkStatus.textContent = online ? "Online režim" : "Offline režim";
  networkStatus.classList.toggle("is-warning", !online);
}

function updateDbStatus(label) {
  if (!dbStatus) return;
  dbStatus.textContent = label;
  dbStatus.classList.toggle("is-warning", label !== "DB ready");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainLabel(eventType) {
  return (LABELS[eventType] || eventType).replace(/^[^\w]+ /, "");
}

function displayLabel(event) {
  const label = LABELS[event.event_type] || event.event_type;
  if (event.action === "start") return `${label} start`;
  if (event.action === "stop") return `${label} stop`;
  return label;
}

function displayIntensity(event) {
  if (!STATE_TYPES.has(event.event_type) && event.event_type !== "anxiety") return "";
  return normalizeMoodLevel(event.intensity);
}

function normalizeMoodLevel(value) {
  if (MOOD_LEVELS.includes(value)) return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return MOOD_LEVELS[Math.min(2, Math.max(0, Math.round(numeric) - 1))] || "";
}

function labelLevel(value) {
  return LEVEL_LABELS[value] || value || "";
}

function displayNote(event) {
  const parts = [];
  const intensity = displayIntensity(event);
  if (intensity) parts.push(intensity);
  if (event.event_type === "junk_food" && event.intensity) parts.push(`size ${event.intensity}`);
  if (event.event_type === "carbs" && event.intensity) parts.push(`size ${event.intensity}`);
  if (event.carbs_grams != null) parts.push(`${event.carbs_grams}g carbs`);
  if (event.note) parts.push(event.note);
  if (event.ai_estimate?.short_note) parts.push(event.ai_estimate.short_note);
  return parts.join(" ");
}

function displayDuration(event) {
  if (event.duration_min != null && event.duration_min !== "") {
    return formatDurationMinutes(event.duration_min);
  }
  if (event.timestamp_end) {
    return formatDurationMinutes(minutesBetween(event.timestamp_start || event.timestamp, event.timestamp_end));
  }
  return "";
}

function renderLog() {
  logBody.innerHTML = "";
  const activeDurations = readActiveDurations();
  updateMainStats();

  for (const event of readEvents()) {
    const active = activeDurations[event.event_type]?.event_id === event.id;
    const timestamp = event.timestamp || event.timestamp_start;
    const row = document.createElement("tr");
    if (active) row.classList.add("active-timer-row");
    row.innerHTML = `
      <td class="log-time">${escapeHtml(localTime(timestamp))}</td>
      <td>${escapeHtml(displayLabel(event))}${active ? " <small>(running)</small>" : ""}</td>
      <td>${escapeHtml(displayNote(event))}</td>
      <td><button class="delete-row" data-delete-id="${escapeHtml(event.id)}" type="button" aria-label="Delete entry">×</button></td>
      <td>${escapeHtml(displayDuration(event))}</td>
    `;
    logBody.append(row);
  }
}

function updateMainStats() {
  const events = readEvents();
  const today = exportDate({ timestamp: nowIso() });
  const todayEvents = events.filter((event) => exportDate(event) === today);
  const carbsToday = todayEvents.reduce((total, event) => {
    const grams = Number(event.carbs_grams);
    return Number.isFinite(grams) ? total + grams : total;
  }, 0);
  const activeCount = Object.keys(readActiveDurations()).length;

  if (statToday) statToday.textContent = String(todayEvents.length);
  if (statTotal) statTotal.textContent = String(events.length);
  if (statCarbs) statCarbs.textContent = `${Math.round(carbsToday)}g`;
  if (statActive) statActive.textContent = String(activeCount);
}

function renderTimerButtons() {
  const activeDurations = readActiveDurations();
  document.querySelectorAll("[data-timer-type]").forEach((button) => {
    const timerType = button.dataset.timerType;
    const active = activeDurations[timerType] || null;
    const strong = button.querySelector("strong");
    const timer = button.querySelector("small");

    button.classList.toggle("is-active", Boolean(active));
    if (strong) strong.textContent = active ? "⏸ STOP" : "▶ START";
    if (timer) timer.textContent = active ? formatClock(elapsedSeconds(active.started_at)) : "";
  });
  updateMainStats();
}

function flashLatestRow() {
  const firstRow = logBody.querySelector("tr");
  if (!firstRow) return;
  firstRow.classList.add("saved-row");
  window.setTimeout(() => firstRow.classList.remove("saved-row"), 900);
}

function startTimer(timerType) {
  const event = addEvent({ event_type: timerType, action: "start" });
  const activeDurations = readActiveDurations();
  activeDurations[timerType] = {
    event_id: event.id,
    event_type: timerType,
    started_at: event.timestamp
  };
  writeActiveDurations(activeDurations);
  renderTimerButtons();
  renderLog();
  return event;
}

function stopTimer(timerType) {
  const activeDurations = readActiveDurations();
  const active = activeDurations[timerType];
  if (!active) return null;

  const stoppedAt = nowIso();
  const durationMin = minutesBetween(active.started_at, stoppedAt);
  const stopEvent = addEvent({
    event_type: timerType,
    action: "stop",
    timestamp: stoppedAt,
    timestamp_start: active.started_at,
    timestamp_end: stoppedAt,
    duration_min: durationMin
  });

  delete activeDurations[timerType];
  writeActiveDurations(activeDurations);
  setStatus(`⏸ ${plainLabel(timerType)} • ${formatDurationMinutes(durationMin) || "0 min"}`);
  renderTimerButtons();
  renderLog();
  return stopEvent;
}

function getExclusiveActiveTimer(exceptType = "") {
  const activeDurations = readActiveDurations();
  return Object.values(activeDurations).find((item) => DURATION_TYPES.has(item.event_type) && item.event_type !== exceptType) || null;
}

function toggleTimer(timerType) {
  const activeDurations = readActiveDurations();
  if (activeDurations[timerType]) {
    stopTimer(timerType);
    return;
  }

  if (DURATION_TYPES.has(timerType)) {
    const other = getExclusiveActiveTimer(timerType);
    if (other) {
      const ok = confirm(`End ${plainLabel(other.event_type)} and start ${plainLabel(timerType)}?`);
      if (!ok) return;
      stopTimer(other.event_type);
    }
  }

  startTimer(timerType);
}

function exportCsv() {
  const header = [
    "id",
    "date",
    "time",
    "timestamp",
    "timezone_offset",
    "timestamp_start",
    "timestamp_end",
    "category",
    "event_type",
    "subtype",
    "action",
    "intensity",
    "size",
    "carbs_grams",
    "duration_min",
    "note",
    "ai_estimate"
  ];
  const rows = readEvents().slice().reverse().map((event) => [
    event.id,
    exportDate(event),
    exportTime(event),
    eventTimestamp(event),
    timezoneOffset(eventTimestamp(event)),
    event.timestamp_start || "",
    event.timestamp_end || "",
    exportCategory(event),
    exportEventType(event),
    exportSubtype(event),
    event.action || "",
    exportIntensity(event),
    exportSize(event),
    event.carbs_grams ?? "",
    event.duration_min ?? "",
    exportNote(event),
    event.ai_estimate ? JSON.stringify(event.ai_estimate) : ""
  ].map(csvCell).join(","));

  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `quick-log-${date}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`CSV exported: ${rows.length} entries`);
}

function backupJson() {
  const payload = {
    app: "Quick Log / DiaTrack",
    schema_version: SCHEMA_VERSION,
    exported_at: nowIso(),
    events: readEvents(),
    active_durations: readActiveDurations(),
    deleted_event_ids: [...readDeletedIds()]
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `quick-log-backup-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`Backup JSON exported: ${payload.events.length} entries.`);
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function eventTimestamp(event) {
  return event.timestamp || event.timestamp_start || "";
}

function exportDate(event) {
  return eventTimestamp(event).slice(0, 10).replaceAll("-", "/");
}

function exportTime(event) {
  return eventTimestamp(event).slice(11, 19);
}

function timezoneOffset(timestamp) {
  const match = String(timestamp || "").match(/([+-]\d{2}:\d{2})$/);
  return match ? match[1] : "";
}

function exportCategory(event) {
  return EVENT_CATEGORIES[event.event_type] || "other";
}

function exportEventType(event) {
  if (["carbs", "junk_food"].includes(event.event_type)) return "carbs_not_in_pump";
  return event.event_type;
}

function exportSubtype(event) {
  if (event.event_type === "protein") return "shake";
  if (event.event_type === "carbs") return event.note || "";
  if (event.event_type === "junk_food") return "junk_food";
  return "";
}

function exportIntensity(event) {
  if (!STATE_TYPES.has(event.event_type) && event.event_type !== "anxiety") return "";
  return labelLevel(normalizeMoodLevel(event.intensity));
}

function exportSize(event) {
  if (!["carbs", "junk_food"].includes(event.event_type)) return "";
  return labelLevel(event.intensity);
}

function exportNote(event) {
  if (event.event_type === "carbs" && event.note) return "";
  if (event.event_type === "junk_food") return "";
  return event.note || "";
}

function migrateLegacyEvents() {
  if (localStorage.getItem(STORAGE_KEY)) return;

  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)) || [];
  } catch {
    legacy = [];
  }

  if (legacy.length === 0) {
    writeEvents([]);
    return;
  }

  const typeMap = {
    "Pivo": "beer",
    "Víno": "wine",
    "Káva": "coffee",
    "Protein": "protein",
    "Sacharidy": "carbs",
    "Junk food": "junk_food",
    "Stres": "stress",
    "Frustrácia": "frustration",
    "Nervozita": "nervousness",
    "Poznámka": "note",
    "Spánok": "sleep"
  };

  const migrated = legacy.map((old) => makeEvent({
    event_type: typeMap[old.event_type] || old.event_type || "note",
    action: "instant",
    timestamp: old.timestamp || old.timestamp_start || nowIso(),
    timestamp_start: old.timestamp_start || old.timestamp || nowIso(),
    timestamp_end: old.timestamp_end || null,
    intensity: old.intensity || null,
    note: old.note || null
  }));

  migrated.sort((a, b) => new Date(b.timestamp || b.timestamp_start) - new Date(a.timestamp || a.timestamp_start));
  writeEvents(migrated);
}

function setupTimerButtons() {
  document.querySelectorAll("[data-timer-type]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleTimer(button.dataset.timerType);
    });
  });

  renderTimerButtons();
  window.clearInterval(durationTickInterval);
  durationTickInterval = window.setInterval(() => {
    renderTimerButtons();
    renderLog();
  }, 1000);
}

function setupCategoryRail() {
  document.querySelectorAll("[data-category-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.categoryTarget;
      document.querySelectorAll("[data-category-target]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      document.querySelectorAll("[data-category-panel]").forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.categoryPanel === target);
      });
      document.querySelector(".phone-panel")?.setAttribute("data-active-category", target);
      if (categoryTitle) categoryTitle.textContent = CATEGORY_LABELS[target] || "Quick Log";
    });
  });
}

function setupInstantButtons() {
  document.querySelectorAll("[data-instant-type]").forEach((button) => {
    button.addEventListener("click", () => {
      addEvent({ event_type: button.dataset.instantType, action: "instant" });
    });
  });

  document.querySelectorAll("[data-intensity-type]").forEach((button) => {
    setupIntensitySlider(button);
  });

  document.querySelectorAll("[data-size-type]").forEach((button) => {
    setupSizeSlider(button);
  });

  document.querySelectorAll("[data-carb-portion-subtype]").forEach((button) => {
    setupCarbPortionSlider(button);
  });

  document.querySelectorAll("[data-inline-choice]").forEach((button) => {
    setupInlineChoiceToggle(button);
  });

  document.querySelectorAll("[data-carb-subtype]").forEach((button) => {
    setupChoiceSlider(button, {
      levels: MOOD_LEVELS,
      onCommit: (level) => {
        addEvent({ event_type: "carbs", action: "instant", note: button.dataset.carbSubtype, intensity: level });
      }
    });
  });

  document.querySelectorAll("[data-ai-carbs]").forEach((button) => {
    button.addEventListener("click", () => {
      aiPhotoInput?.click();
    });
  });

  document.querySelectorAll("[data-choice-type]").forEach((button) => {
    button.addEventListener("click", () => {
      openChoiceDialog(button.dataset.choiceType);
    });
  });
}

async function handleAiPhoto(file) {
  if (!file) return;
  if (!CAN_USE_SERVER_DB) {
    setStatus("AI needs the HTTP app URL, not file mode.");
    return;
  }
  if (serverFeaturesUnavailable) {
    setStatus("AI carbs estimation will be enabled in the next deploy. Photo not saved.");
    if (aiPhotoInput) aiPhotoInput.value = "";
    return;
  }
  if (navigator.onLine === false) {
    setStatus("AI needs internet. Photo was not saved.");
    if (aiPhotoInput) aiPhotoInput.value = "";
    return;
  }

  try {
    setStatus("Preparing photo...");
    const image = await resizeImageForAi(file);
    setStatus("Sending photo for AI estimate...");
    const response = await fetchWithTimeout("/api/estimate-carbs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image })
    }, AI_TIMEOUT_MS);
    setStatus("Waiting for AI estimate...");
    const estimate = await safeJson(response);
    if (!response.ok) {
      setStatus(aiErrorMessage(response.status, estimate));
      return;
    }

    addEvent({
      event_type: "carbs",
      action: "instant",
      note: "AI estimate",
      carbs_grams: estimate.grams,
      ai_estimate: estimate
    });
    typeStatus(aiSuccessMessage(estimate));
  } catch (error) {
    setStatus(aiRequestErrorMessage(error));
  } finally {
    if (aiPhotoInput) aiPhotoInput.value = "";
  }
}

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => window.clearTimeout(timeout));
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function aiSuccessMessage(estimate) {
  const note = String(estimate?.short_note || "I can see food in the photo.").replace(/\s+/g, " ").trim();
  return `${note} I estimate ${estimate.grams} g of carbohydrates.`;
}

function aiErrorMessage(status, estimate) {
  if (status === 404 || status === 405) return "AI carbs estimation not deployed yet.";
  if (status === 503) return "AI unavailable. OPENAI_API_KEY is not set on the server.";
  if (status === 504) return "AI timed out. Check internet or OpenAI status.";
  if (estimate?.code === "insufficient_quota") return "AI quota/billing problem. Check OpenAI billing.";
  if (estimate?.code === "network_unavailable") return "AI service is unreachable. Try again in a moment.";
  if (estimate?.error) return `AI failed: ${estimate.error}`;
  return "AI estimate failed.";
}

function aiRequestErrorMessage(error) {
  if (error?.name === "AbortError") return "AI timed out. Check internet, then try again.";
  if (navigator.onLine === false) return "Offline. AI needs internet.";
  return "AI service is unreachable. Try again in a moment.";
}

function resizeImageForAi(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1024;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    image.src = url;
  });
}

function setupInlineChoiceToggle(button) {
  button.addEventListener("click", () => {
    const target = document.querySelector(`#${button.dataset.inlineChoice}InlineChoices`);
    if (!target) return;
    target.hidden = !target.hidden;
    button.setAttribute("aria-expanded", String(!target.hidden));
  });
}

function openChoiceDialog(choiceType) {
  const config = CHOICES[choiceType];
  if (!config) return;

  choiceTitle.textContent = config.title;
  choiceActions.innerHTML = "";

  for (const item of config.items) {
    const button = document.createElement("button");
    button.className = choiceType === "carbs" ? "secondary dialog-secondary choice-slider" : "secondary dialog-secondary";
    button.type = "button";
    button.innerHTML = choiceType === "carbs"
      ? `<span>${escapeHtml(item)}</span><small>slide S / M / L</small>`
      : escapeHtml(item);
    if (choiceType === "carbs") {
      setupChoiceSlider(button, {
        levels: MOOD_LEVELS,
        onCommit: (level) => {
          addEvent({ event_type: "carbs", action: "instant", note: item, intensity: level });
          choiceDialog.close();
        }
      });
    }
    choiceActions.append(button);
  }
  choiceDialog.showModal();
}

function setupChoiceSlider(button, { levels, onCommit }) {
  const hint = button.querySelector("small")?.textContent || "slide";
  let activePointerId = null;
  let currentLevel = levels[0];

  const setLevelFromPointer = (event) => {
    const rect = button.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.min(levels.length - 1, Math.floor(ratio * levels.length));
    currentLevel = levels[index];
    button.style.setProperty("--fill-percent", `${Math.max(8, Math.round((index + 1) / levels.length * 100))}%`);
    const helper = button.querySelector("small");
    if (helper) helper.textContent = currentLevel;
  };

  const reset = () => {
    activePointerId = null;
    button.classList.remove("is-sliding");
    button.style.setProperty("--fill-percent", "0%");
    const helper = button.querySelector("small");
    if (helper) helper.textContent = hint;
  };

  button.addEventListener("pointerdown", (event) => {
    activePointerId = event.pointerId;
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("is-sliding");
    setLevelFromPointer(event);
  });

  button.addEventListener("pointermove", (event) => {
    if (activePointerId !== event.pointerId) return;
    setLevelFromPointer(event);
  });

  button.addEventListener("pointerup", (event) => {
    if (activePointerId !== event.pointerId) return;
    onCommit(currentLevel);
    if (navigator.vibrate) navigator.vibrate(25);
    reset();
  });

  button.addEventListener("pointercancel", reset);
  button.addEventListener("lostpointercapture", reset);
}

function setupIntensitySlider(button) {
  const eventType = button.dataset.intensityType;
  setupInlineSlider(button, {
    levels: MOOD_LEVELS,
    onCommit: (level) => addEvent({ event_type: eventType, action: "instant", intensity: level })
  });
}

function setupSizeSlider(button) {
  const eventType = button.dataset.sizeType;
  setupInlineSlider(button, {
    levels: PORTION_LEVELS,
    onCommit: (level) => addEvent({ event_type: eventType, action: "instant", intensity: level })
  });
}

function setupCarbPortionSlider(button) {
  const subtype = button.dataset.carbPortionSubtype;
  setupInlineSlider(button, {
    levels: PORTION_LEVELS,
    onCommit: (level) => addEvent({ event_type: "carbs", action: "instant", note: subtype, intensity: level })
  });
}

function setupInlineSlider(button, { levels, onCommit }) {
  const hint = button.querySelector("small")?.textContent || "hold and slide";
  let activePointerId = null;
  let currentLevel = levels[0];

  const setLevelFromPointer = (event) => {
    const rect = button.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.min(levels.length - 1, Math.floor(ratio * levels.length));
    currentLevel = levels[index];
    button.style.setProperty("--fill-percent", `${Math.max(8, Math.round((index + 1) / levels.length * 100))}%`);
    const helper = button.querySelector("small");
    if (helper) helper.textContent = currentLevel;
  };

  const resetSlider = () => {
    activePointerId = null;
    button.classList.remove("is-sliding");
    button.style.setProperty("--fill-percent", "0%");
    const helper = button.querySelector("small");
    if (helper) helper.textContent = hint;
  };

  button.addEventListener("pointerdown", (event) => {
    activePointerId = event.pointerId;
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("is-sliding");
    setLevelFromPointer(event);
  });

  button.addEventListener("pointermove", (event) => {
    if (activePointerId !== event.pointerId) return;
    setLevelFromPointer(event);
  });

  button.addEventListener("pointerup", (event) => {
    if (activePointerId !== event.pointerId) return;
    onCommit(currentLevel);
    if (navigator.vibrate) navigator.vibrate(25);
    resetSlider();
  });

  button.addEventListener("pointercancel", resetSlider);
  button.addEventListener("lostpointercapture", resetSlider);
}

function attachNoteToLastEvent(note) {
  const events = readEvents();
  const [latest] = events;
  if (!latest) {
    setStatus("No event to attach note to.");
    return;
  }

  updateEvent(latest.id, {
    note: latest.note ? `${latest.note} ${note}` : note
  });
  setStatus(`Note added to ${plainLabel(latest.event_type)}`);
  flashLatestRow();
}

document.querySelector("#saveNote").addEventListener("click", () => {
  const note = noteText.value.trim();
  if (!note) return;
  attachNoteToLastEvent(note);
});

noteBtn?.addEventListener("click", () => {
  noteText.value = "";
  noteDialog.showModal();
});

aiPhotoInput?.addEventListener("change", () => {
  handleAiPhoto(aiPhotoInput.files?.[0]);
});

tableBtn?.addEventListener("click", () => {
  const collapsed = logPanel.classList.toggle("table-collapsed");
  appShell.classList.toggle("table-hidden", collapsed);
  const tableLabel = tableBtn.querySelector(".sr-only");
  const label = collapsed ? "Show table" : "Hide table";
  if (tableLabel) tableLabel.textContent = label;
  tableBtn.setAttribute("aria-label", label);
  tableBtn.title = label;
  renderLog();
});

document.querySelector("#exportBtn")?.addEventListener("click", exportCsv);
document.querySelector("#backupBtn")?.addEventListener("click", backupJson);

document.querySelector("#refreshBtn").addEventListener("click", refreshApp);

document.querySelector("#undoBtn").addEventListener("click", () => {
  const events = readEvents();
  const [removed] = events;
  if (!removed) {
    setStatus("Nothing to undo.");
    return;
  }

  deleteEvent(removed.id);
  setStatus(`Undo: ${displayLabel(removed)}`);
  renderTimerButtons();
});

document.querySelector("#recoverBtn")?.addEventListener("click", () => {
  recoverLastRemovedEvent();
});

logBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;
  const removed = deleteEvent(button.dataset.deleteId);
  setStatus(removed ? `Deleted: ${displayLabel(removed)}` : "Entry deleted.");
  renderTimerButtons();
});

document.querySelector("#clearBtn").addEventListener("click", () => {
  if (!confirm("Clear all local entries?")) return;
  markEventsDeleted(readEvents().map((event) => event.id));
  writeEvents([]);
  writeActiveDurations({});
  renderLog();
  renderTimerButtons();
  setStatus("Entries cleared.");
});

async function syncImportedEvents() {
  try {
    const response = await fetchWithTimeout("/api/imported-events", {}, API_TIMEOUT_MS);
    if (!response.ok) return;
    const importedEvents = await response.json();
    if (!Array.isArray(importedEvents) || importedEvents.length === 0) return;

    const events = readEvents();
    const existingIds = new Set(events.map((event) => event.id));
    const deletedIds = readDeletedIds();
    let added = 0;

    for (const incoming of importedEvents) {
      if (!incoming.id || existingIds.has(incoming.id)) continue;
      if (deletedIds.has(incoming.id)) continue;
      events.push({
        id: incoming.id,
        schema_version: SCHEMA_VERSION,
        timestamp: incoming.timestamp_start || incoming.timestamp,
        timestamp_start: incoming.timestamp_start || incoming.timestamp,
        timestamp_end: incoming.timestamp_end || null,
        event_type: incoming.event_type === "Spánok" ? "sleep" : (incoming.event_type || "note"),
        action: incoming.timestamp_end ? "stop" : "instant",
        intensity: incoming.intensity || null,
        duration_min: incoming.timestamp_end ? minutesBetween(incoming.timestamp_start, incoming.timestamp_end) : null,
        note: incoming.note || incoming.source || null,
        photo_url: null,
        ai_estimate: null
      });
      added++;
    }

    if (added > 0) {
      events.sort((a, b) => new Date(b.timestamp || b.timestamp_start) - new Date(a.timestamp || a.timestamp_start));
      writeEvents(events);
      renderLog();
    }
  } catch {
    // Static/offline mode has no import API.
  }
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
    updateDbStatus("No offline shell");
    setStatus(`Offline install failed: ${error.message || "service worker error"}`);
  });
} else if (!window.isSecureContext) {
  updateDbStatus("No offline shell");
  setStatus("Offline install blocked: open over HTTPS on iPhone. LAN http:// cannot install the app shell.");
} else {
  updateDbStatus("No offline shell");
  setStatus("Offline install blocked: this browser has no Service Worker support.");
}

window.addEventListener("online", () => {
  updateNetworkStatus();
  if (serverFeaturesUnavailable) {
    setStatus("Back online.");
  } else {
    setStatus("Back online. Syncing...");
    hydrateEventsFromServer({ quiet: true }).then(() => setStatus("DB ready.")).catch(() => {});
  }
});
window.addEventListener("offline", () => {
  updateNetworkStatus();
  if (serverFeaturesUnavailable) {
    setStatus("Offline. Events still save on this phone.");
  } else {
    updateDbStatus("Local cache");
    setStatus("Offline. AI needs internet.");
  }
});
window.addEventListener("focus", () => hydrateEventsFromServer({ quiet: true }));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) hydrateEventsFromServer({ quiet: true });
});

migrateLegacyEvents();
setupCategoryRail();
setupTimerButtons();
setupInstantButtons();
updateNetworkStatus();
updateDbStatus(serverSyncReady ? "DB ready" : "Checking DB");
renderLog();
syncImportedEvents();
hydrateEventsFromServer();
if (hasServerSyncPending()) startServerRetry();
