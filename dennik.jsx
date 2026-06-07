const { useState, useEffect, useRef } = React;

// ====== Subtypes from QuickLog data model ======
const TURBO = [
  // food
  { sub: 'carbs',  cat: 'food', label: 'Carbs',  carbsByMass: { S: 15, M: 30, L: 60 } },
  { sub: 'junk',   cat: 'food', label: 'Junk',   carbsByMass: { S: 15, M: 30, L: 60 } },
  // drink
  { sub: 'beer',    cat: 'drink', label: 'Beer', carbsByMass: { S: 12, M: 20, L: 28 } },
  { sub: 'spirits', cat: 'drink', label: 'Spirits' },
  // mood
  { sub: 'adrenaline', cat: 'mood', label: 'Adrenalin' },
  { sub: 'sick',       cat: 'mood', label: 'Sick', toggle: true },
  // activity
  { sub: 'cannula',  cat: 'activity', label: 'Cannula' },
  { sub: 'meds',     cat: 'activity', label: 'Meds' },
];

const SIZES = ['S', 'M', 'L'];
const ADRENALINE_LEVELS = ['M', 'L'];
const CAT_LABEL = { food: 'jedlo', drink: 'pitie', activity: 'aktivita', mood: 'nálada', review: 'review' };
const APP_VERSION = 'V3.25';
const AI_IMAGE_TARGET_BYTES = 4_200_000;
const AI_IMAGE_STEPS = [
  { maxSide: 1600, quality: 0.82 },
  { maxSide: 1400, quality: 0.78 },
  { maxSide: 1200, quality: 0.74 },
  { maxSide: 1024, quality: 0.7 }
];
const STORAGE_KEY = 'fasttrack-diary-events-v2';
const LEGACY_STORAGE_KEYS = ['fasttrack-diary-events-v1'];
const LEGACY_EXTRA_SIZE = ['X', 'L'].join('');
const INTENSITY_BY_SIZE = { M: 'med', L: 'high' };
const SIZE_BY_INTENSITY = { med: 'M', high: 'L' };

function carbsForSize(cat, sub, size) {
  if (!size || (cat !== 'food' && sub !== 'beer')) return undefined;
  const item = TURBO.find(t => t.sub === sub);
  return item?.carbsByMass?.[size];
}

function normalizedCarbsValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount);
}

function loadLocalEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean)
      || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(migrateEvent) : [];
  } catch {
    return [];
  }
}

function formatLocalDateKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function localDateFromKey(dateKey) {
  const [yyyy, mm, dd] = String(dateKey || formatLocalDateKey()).split('-').map(Number);
  return new Date(yyyy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
}

function addDaysToDateKey(dateKey, deltaDays) {
  const date = localDateFromKey(dateKey);
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDateKey(date);
}

function formatRecordsDateLabel(dateKey) {
  const date = localDateFromKey(dateKey);
  return new Intl.DateTimeFormat('sk-SK', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function formatLocalTimestamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${h}:${m}:${s}`;
}

function timestampFromDateKeyAndHour(dateKey, hour) {
  const date = localDateFromKey(dateKey);
  const totalMinutes = Math.min(1439, Math.max(0, Math.round((Number(hour) || 0) * 60)));
  date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return date.getTime();
}

function currentClock() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  return {
    timestamp: now.getTime(),
    timestampLocal: formatLocalTimestamp(now),
    dateKey: formatLocalDateKey(now),
    time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    hour: h + (m / 60)
  };
}

function clockFromDateKeyAndTime(dateKey, timeValue) {
  const [hh, mm] = String(timeValue || '').split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return currentClock();
  const hour = Math.max(0, Math.min(23.99, hh + (mm / 60)));
  const timestamp = timestampFromDateKeyAndHour(dateKey || formatLocalDateKey(), hour);
  const date = new Date(timestamp);
  return {
    timestamp,
    timestampLocal: formatLocalTimestamp(date),
    dateKey: formatLocalDateKey(date),
    time: formatHour(hour),
    hour
  };
}

function currentHour() {
  const now = new Date();
  return now.getHours() + (now.getMinutes() / 60) + (now.getSeconds() / 3600);
}

function formatHour(hour) {
  const normalized = Math.max(0, Math.min(23.99, Number(hour) || 0));
  const totalMinutes = Math.min(1439, Math.max(0, Math.round(normalized * 60)));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function hourFromTimeValue(timeValue) {
  const match = String(timeValue || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Math.max(0, Math.min(23, Number(match[1])));
  const m = Math.max(0, Math.min(59, Number(match[2])));
  return h + (m / 60);
}

function eventSortValue(event) {
  if (Number.isFinite(event?.timestamp)) return event.timestamp;
  if (Number.isFinite(event?.createdAt)) return event.createdAt;
  if (Number.isFinite(event?.hour)) return timestampFromDateKeyAndHour(event?.dateKey, event.hour);
  const [h = 0, m = 0] = String(event?.time || '').split(':').map(Number);
  return timestampFromDateKeyAndHour(event?.dateKey, (Number.isFinite(h) ? h : 0) + ((Number.isFinite(m) ? m : 0) / 60));
}

function eventDateParts(event, hourOverride = eventSortValue(event)) {
  const date = Number(hourOverride) > 100000000000 ? new Date(hourOverride) : new Date(timestampFromDateKeyAndHour(event?.dateKey, hourOverride));
  return { iso: formatLocalTimestamp(date), day: formatLocalDateKey(date) };
}

function migrateEvent(event) {
  const sourceDate = Number.isFinite(event?.timestamp) ? new Date(event.timestamp)
    : Number.isFinite(event?.createdAt) ? new Date(event.createdAt)
    : new Date();
  const dateKey = event?.dateKey || formatLocalDateKey(sourceDate);
  const [h = sourceDate.getHours(), m = sourceDate.getMinutes()] = String(event?.time || '').split(':').map(Number);
  const hour = Number.isFinite(event?.hour) ? event.hour : (Number.isFinite(h) ? h : 0) + ((Number.isFinite(m) ? m : 0) / 60);
  const timestamp = Number.isFinite(event?.timestamp) ? event.timestamp : timestampFromDateKeyAndHour(dateKey, hour);
  const timestampDate = new Date(timestamp);
  let cat = event?.cat;
  let sub = event?.sub === 'protein_shake' ? 'protein' : event?.sub;
  let label = event?.sub === 'protein_shake' ? 'Protein' : event?.label;
  let size = event?.size === LEGACY_EXTRA_SIZE ? 'L' : event?.size;
  let intensity = event?.intensity;
  let note = event?.note;

  const addLegacyNote = (legacyName) => {
    if (!legacyName) return;
    const text = String(note || '');
    if (text.toLowerCase().includes(legacyName.toLowerCase())) return;
    note = text ? `${text} · legacy:${legacyName}` : `legacy:${legacyName}`;
  };

  if (cat === 'food' && ['bread', 'rice', 'pasta', 'potato', 'sweets', 'snack', 'fruit', 'photo', 'kuluri'].includes(sub)) {
    addLegacyNote(sub);
    sub = 'carbs';
    label = label || 'Carbs';
  }

  if (cat === 'drink') {
    if (['poldeci', 'wine'].includes(sub)) {
      addLegacyNote(sub);
      sub = 'spirits';
      label = 'Spirits';
      size = size || 'M';
    }
    if (['juice', 'soda'].includes(sub)) {
      addLegacyNote(sub);
      cat = 'food';
      sub = 'junk';
      label = 'Junk';
      size = size || 'M';
    }
  }

  if (cat === 'activity') {
    if (sub === 'walk') {
      sub = 'exercise';
      label = 'Exercise';
      intensity = intensity || 'low';
    }
    if (sub === 'sex') {
      sub = 'exercise';
      label = 'Exercise';
      intensity = intensity || 'med';
    }
    if (sub === 'drugs') {
      sub = 'meds';
      label = 'Meds';
    }
  }

  if (cat === 'mood' && ['stress', 'nervousness', 'frustration'].includes(sub)) {
    sub = 'adrenaline';
    label = 'Adrenalin';
    intensity = intensity || INTENSITY_BY_SIZE[size] || 'med';
    size = size || SIZE_BY_INTENSITY[intensity];
  }
  if (cat === 'mood' && sub === 'adrenaline') {
    intensity = intensity === 'high' || size === 'L' ? 'high' : 'med';
    size = SIZE_BY_INTENSITY[intensity];
  }
  if (cat === 'mood' && sub === 'sick') {
    label = 'Sick';
    size = undefined;
    intensity = undefined;
  }
  const canonicalCarbs = carbsForSize(cat, sub, size);

  return {
    ...event,
    cat,
    sub,
    label,
    size,
    intensity,
    note,
    mealStartTime: event?.mealStartTime,
    mealStartTimestamp: event?.mealStartTimestamp,
    mealStartHour: event?.mealStartHour,
    carbs: cat === 'mood' ? undefined : canonicalCarbs ?? event?.carbs,
    timestamp,
    timestampLocal: event?.timestampLocal || formatLocalTimestamp(timestampDate),
    dateKey: event?.dateKey || formatLocalDateKey(timestampDate)
  };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function eventsToCsv(events) {
  const header = ['timestamp', 'dateKey', 'time', 'start_time', 'meal_start_time', 'meal_start_timestamp', 'end_time', 'start_timestamp', 'end_timestamp', 'category', 'subtype', 'label', 'size', 'intensity', 'duration_min', 'carbs_g', 'confidence', 'note', 'activityDetail', 'source'];
  const rows = events
    .slice()
    .sort((a, b) => eventSortValue(b) - eventSortValue(a))
    .map((event) => {
      const startTimestamp = eventSortValue(event);
      const startDate = new Date(startTimestamp);
      const startHour = startDate.getHours() + (startDate.getMinutes() / 60);
      const duration = event.running && event.sub === 'sick'
        ? Math.max(0, Math.round((Date.now() - startTimestamp) / 60000))
        : event.duration;
      const durationHours = duration ? duration / 60 : 0;
      const endTimestamp = (['activity', 'sleep'].includes(event.cat) || event.sub === 'sick') && duration ? startTimestamp + (durationHours * 60 * 60 * 1000) : '';
      const date = eventDateParts(event, startTimestamp);
      const endDate = endTimestamp === '' ? null : eventDateParts(event, endTimestamp);
      return [
        date.iso,
        date.day,
        event.time,
        formatHour(startHour),
        event.mealStartTime || '',
        event.mealStartTimestamp ? formatLocalTimestamp(new Date(event.mealStartTimestamp)) : '',
        endTimestamp === '' ? '' : formatHour(new Date(endTimestamp).getHours() + (new Date(endTimestamp).getMinutes() / 60)),
        date.iso,
        endDate?.iso || '',
        event.cat,
        event.sub,
        event.label,
        event.size,
        event.intensity,
        duration,
        event.carbs,
        event.confidence,
        event.note,
        event.activityDetail,
        event.source || 'manual'
      ];
    });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

async function downloadEventsCsv(events) {
  const csv = eventsToCsv(events);
  const day = new Date().toISOString().slice(0, 10);
  const filename = `fasttrack-zaznamy-${day}.csv`;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });

  if (navigator.canShare && navigator.share && window.File) {
    const file = new File([blob], filename, { type: 'text/csv' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'share';
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    setTimeout(() => {
      window.open(dataUrl, '_blank', 'noopener');
    }, 80);
    return 'open';
  }

  return 'download';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Nepodarilo sa načítať fotku.'));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return fileToDataUrl(blob);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Fotku sa nepodarilo pripraviť pre AI.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Fotku sa nepodarilo skomprimovať.'));
    }, 'image/jpeg', quality);
  });
}

async function imageToAiDataUrl(file) {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Fotka nemá čitateľné rozmery.');

  let fallbackDataUrl = null;
  for (const step of AI_IMAGE_STEPS) {
    const scale = Math.min(1, step.maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, step.quality);
    const dataUrl = await blobToDataUrl(blob);
    fallbackDataUrl = dataUrl;
    if (dataUrl.length < AI_IMAGE_TARGET_BYTES) return dataUrl;
  }
  return fallbackDataUrl;
}

function labelFromAiResult(result) {
  const direct = String(result?.food_name || '').trim();
  if (direct) return direct.slice(0, 40);

  const note = String(result?.short_note || '').trim();
  const match = note.match(/(?:looks like|appears to be|seems to be|is)\s+(?:a |an |some )?([^.;,]+)/i);
  if (!match) return 'AI foto';
  return match[1]
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
    .slice(0, 40);
}

const Icon = {
  Cam: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/></svg>,
  Refresh: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 5v6h-6"/></svg>,
  Undo: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>,
  Home: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 10v9h11v-9"/></svg>,
  List: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>,
  Gym: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 9v6M20 9v6M8 7v10M16 7v10M8 12h8"/></svg>,
  Work: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8"/><path d="M5 8h14v10H5z"/></svg>,
  Cannula: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="7" y="7" width="10" height="10" rx="3"/><circle cx="12" cy="12" r="2.2"/></svg>,
  Meds: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="9" width="14" height="6" rx="3"/><path d="M12 9v6"/></svg>,
  Thermo: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 14.5V5.8a2 2 0 1 1 4 0v8.7a4 4 0 1 1-4 0Z"/><path d="M12 7v7"/></svg>,
  Junk: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><path d="M10 10h.01M14 10h.01M10 14c1.2.8 2.8.8 4 0"/></svg>,
  Beer: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 6h9v13H7z"/><path d="M16 9h2a3 3 0 0 1 0 6h-2"/><path d="M9 6V4m4 2V4"/></svg>,
  Hash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 4 7 20M17 4l-2 16M4 9h18M3 15h18"/></svg>,
  Bolt: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2 5 14h7l-1 8 8-13h-7z"/></svg>,
};

function quickIconFor(item) {
  if (item?.sub === 'junk') return <Icon.Junk/>;
  if (item?.sub === 'beer') return <Icon.Beer/>;
  if (item?.sub === 'carbs') return <Icon.Hash/>;
  if (item?.sub === 'adrenaline') return <Icon.Bolt/>;
  return null;
}

function quickSubtitleFor(item) {
  if (item?.sub === 'carbs') return 'manual';
  if (item?.sub === 'adrenaline') return 'med';
  return item?.cat || '';
}

function recordIconFor(event) {
  if (event?.source === 'ai_camera') return <Icon.Cam/>;
  if (event?.sub === 'junk') return <Icon.Junk/>;
  if (event?.sub === 'beer') return <Icon.Beer/>;
  if (event?.sub === 'carbs') return <Icon.Hash/>;
  if (event?.sub === 'adrenaline') return <Icon.Bolt/>;
  if (event?.sub === 'gym') return <Icon.Gym/>;
  if (event?.sub === 'hard_work') return <Icon.Work/>;
  if (event?.sub === 'cannula') return <Icon.Cannula/>;
  if (event?.sub === 'meds') return <Icon.Meds/>;
  if (event?.sub === 'sick') return <Icon.Thermo/>;
  return null;
}

function formatRecordsSubtitle(dateKey, count) {
  const date = localDateFromKey(dateKey);
  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  }).format(date);
  return `${label} · ${count} ${count === 1 ? 'event' : 'events'}`;
}

function dateKeyOffsetFromToday(dateKey) {
  const today = localDateFromKey(formatLocalDateKey());
  const selected = localDateFromKey(dateKey);
  return Math.round((selected.getTime() - today.getTime()) / 86400000);
}

function Header({ selectedDateKey, setSelectedDateKey, onUndo, canUndo }) {
  const dayOffset = dateKeyOffsetFromToday(selectedDateKey);
  const labels = { 0: 'Today', '-1': 'Yesterday', '-2': '2 days ago' };
  const dayLabel = labels[dayOffset] || (dayOffset < 0 ? `${Math.abs(dayOffset)} days ago` : 'Selected day');
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(localDateFromKey(selectedDateKey));
  return (
    <div className="head">
      <div className="head-title">
        <span>Good evening</span>
        <strong>{dayLabel} · {monthDay}</strong>
      </div>
      <div className="head-actions">
        <button className="arr" onClick={() => setSelectedDateKey(addDaysToDateKey(selectedDateKey, -1))}>‹</button>
        <button className="arr" onClick={() => setSelectedDateKey(addDaysToDateKey(selectedDateKey, 1))} disabled={dayOffset >= 0}>›</button>
        <button className="icon-btn" disabled={!canUndo} onClick={onUndo} style={{opacity: canUndo ? 1 : 0.4}}><Icon.Undo/></button>
      </div>
    </div>
  );
}

function QuickCard({ item, onTap, sizes = SIZES }) {
  return (
    <button className={`tcard quick-card steps-${sizes.length} full-width cat-${item.cat}`} onClick={() => onTap?.(item, sizes)}>
      <div className="tcard-body">
        <div className="tcard-meta">
          <span className={`cat-dot dot-${item.cat}`}>{quickIconFor(item)}</span>
        </div>
        <div className="name">{item.label}</div>
        <div className="sub">{quickSubtitleFor(item)}</div>
      </div>
    </button>
  );
}

function ContextToggle({ item, runningEvent, onStart, onStop, icon }) {
  const isRunning = runningEvent && runningEvent.sub === item.sub;
  return (
    <button
      className={`context-toggle ${isRunning ? 'running' : ''}`}
      onClick={() => isRunning ? onStop(runningEvent.id) : onStart(item)}
    >
      <span className="context-icon">{icon}</span>
      <span className="context-toggle-label">{item.label}</span>
      <span className="ios-switch" aria-hidden="true"><i/></span>
    </button>
  );
}

function ContextAction({ item, runningEvent, onStart, onStop, onLog, icon }) {
  const isRunning = runningEvent && runningEvent.sub === item.sub;
  return (
    <button
      className={`context-action cat-${item.cat} sub-${item.sub} ${isRunning ? 'running' : ''}`}
      onClick={() => {
        if (isRunning) return onStop(runningEvent.id);
        if (item.timer) return onStart(item);
        return onLog({ sub: item.sub, label: item.label, cat: item.cat });
      }}
    >
      <span className="context-action-icon">{icon}</span>
      <span className="context-action-name">{item.label}</span>
    </button>
  );
}

function MoodCard({ item, onTap }) {
  return <QuickCard item={item} onTap={onTap} sizes={ADRENALINE_LEVELS} />;
}

function QuickLogSheet({ item, sizes, selectedDateKey, onClose, onLog }) {
  const initial = sizes.includes('M') ? 'M' : sizes[0];
  const [selectedSize, setSelectedSize] = useState(initial);
  const [timeValue, setTimeValue] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  useEffect(() => setSelectedSize(initial), [item?.sub, initial]);
  useEffect(() => {
    const now = new Date();
    setTimeValue(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  }, [item?.sub]);
  if (!item) return null;

  const isAdrenaline = item.sub === 'adrenaline';
  const description = item.sub === 'beer'
    ? 'only drink counted as carbs'
    : item.cat === 'food'
      ? 'manual carbs quick log'
      : item.cat === 'mood'
        ? 'stress spike · no carbs'
        : quickSubtitleFor(item);
  const sizeText = (size) => {
    if (isAdrenaline) return size === 'L' ? 'strong / acute' : 'noticeable';
    const carbs = carbsForSize(item.cat, item.sub, size);
    if (Number.isFinite(carbs)) return `~${carbs}g`;
    if (item.cat === 'mood') return size === 'L' ? 'high' : 'med';
    return size;
  };

  return (
    <div className="quick-sheet-backdrop" onClick={onClose}>
      <div className={`quick-sheet ${isAdrenaline ? 'adrenaline-sheet' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className={`sheet-icon dot-${item.cat}`}>{quickIconFor(item)}</div>
          <div>
            <div className="sheet-title">{item.label}</div>
            <div className="sheet-desc">{description}</div>
          </div>
        </div>
        <div className={`sheet-size-row sizes-${sizes.length}`}>
          {sizes.map((size) => (
            <button
              key={size}
              className={`sheet-size ${selectedSize === size ? 'selected' : ''}`}
              onClick={() => setSelectedSize(size)}
            >
              <b>{isAdrenaline ? (size === 'L' ? 'High' : 'Medium') : size}</b>
              <span>{sizeText(size)}</span>
            </button>
          ))}
        </div>
        {!isAdrenaline && (
          <label className="sheet-time native-sheet-time">
            <span>Time</span>
            <b>now · {timeValue}</b>
            <input type="time" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} />
          </label>
        )}
        <button
          className="sheet-log"
          onClick={() => {
            onLog({
              ...item,
              size: selectedSize,
              ...(isAdrenaline ? {} : clockFromDateKeyAndTime(selectedDateKey, timeValue))
            });
            onClose();
          }}
        >
          Log {item.label}
        </button>
      </div>
    </div>
  );
}

function LiveTimer({ startTimestamp }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const totalSec = Math.max(0, Math.floor((Date.now() - (startTimestamp || Date.now())) / 1000));
  const h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60), s = totalSec%60;
  if (h > 0) return <span>{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
  return <span>{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
}

function DailyReview({ event, onSave }) {
  const [draft, setDraft] = useState(event?.note || '');
  useEffect(() => setDraft(event?.note || ''), [event?.id, event?.note]);
  const saved = event?.note || '';
  const changed = draft.trim() !== saved.trim();

  return (
    <div className="day-review-panel">
      <div className="day-review-head">
        <div>
          <div className="day-review-title">Day note</div>
        </div>
        <button className="day-review-save" disabled={!changed} onClick={() => onSave(draft)}>
          ✎ Edit
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows="3"
      />
    </div>
  );
}

function RecordsChart({ events }) {
  const W = 320;
  const H = 70;
  const baseY = 52;
  const topY = 10;
  const maxCarbs = Math.max(60, ...events.map((e) => Number(e.carbs) || 0));
  const carbsTotal = events.reduce((sum, e) => sum + (Number(e.carbs) || 0), 0);
  const xFor = (hour) => Math.max(0, Math.min(W, ((Number(hour) || 0) / 24) * W));
  const colorFor = (event) => {
    if (event.cat === 'food') return 'var(--red)';
    if (event.sub === 'beer' || event.cat === 'drink') return 'var(--drink)';
    if (event.cat === 'activity') return 'var(--green)';
    if (event.cat === 'mood') return 'var(--red)';
    return 'var(--muted)';
  };

  return (
    <div className="rec-chart-card">
      <div className="rec-chart-head">
        <span>Carbs across the day</span>
        <b>{carbsTotal}<small>g</small></b>
      </div>
      <div className="rec-chart-graph">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="rgba(15, 59, 53, 0.12)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {events.map((event) => {
            const x = xFor(event.hour);
            const carbs = Number(event.carbs) || 0;
            if (carbs <= 0) {
              return <circle key={event.id} cx={x} cy={baseY} r="3.7" fill={colorFor(event)} />;
            }
            const height = Math.max(12, Math.min(baseY - topY, (carbs / maxCarbs) * (baseY - topY)));
            return <rect key={event.id} x={x - 4} y={baseY - height} width="8" height={height} rx="4" fill={colorFor(event)} />;
          })}
        </svg>
        <div className="rec-chart-axis"><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
      </div>
    </div>
  );
}

function Home({ events, selectedDateKey, runningEvent, runningSickEvent, onLogSize, onStartTimer, onStopTimer, onStartSick, onStopSick, onRefresh, onOpenCamera, cameraBusy, aiResult, onDismissAiResult }) {
  const [quickSheet, setQuickSheet] = useState(null);
  const featuredDrink = ['beer'];

  const drinkItems = featuredDrink.map((s) => TURBO.find(t => t.sub === s));
  const carbsItem = TURBO.find(t => t.sub === 'carbs');
  const junkItem = TURBO.find(t => t.sub === 'junk');
  const adrenalineItem = TURBO.find(t => t.sub === 'adrenaline');
  const contextToggles = [
    { sub: 'gym', cat: 'activity', label: 'Gym', timer: true, icon: <Icon.Gym/> },
    { sub: 'hard_work', cat: 'activity', label: 'Hard work', timer: true, icon: <Icon.Work/> }
  ];
  const contextActions = [
    { ...TURBO.find(t => t.sub === 'cannula'), icon: <Icon.Cannula/> },
    { ...TURBO.find(t => t.sub === 'meds'), icon: <Icon.Meds/> },
    { sub: 'sick', cat: 'mood', label: 'Sick', timer: true, icon: <Icon.Thermo/> }
  ];
  const logEvents = events.filter(e => e.cat !== 'review');

  const carbs = logEvents
    .filter(e => e.cat === 'food' || (e.cat === 'drink' && e.sub === 'beer'))
    .reduce((s, e) => s + (e.carbs || 0), 0);
  const activeToday = logEvents.some(e => e.running) ? 1 : 0;
  const activeLabel = runningSickEvent ? 'Sick' : runningEvent?.label || 'Resting';
  const activeHint = runningSickEvent ? 'On now' : runningEvent ? 'On now' : 'No active state';
  const ringPct = Math.min(100, Math.round((carbs / 180) * 100));
  const openQuickSheet = (item, sizes = SIZES) => setQuickSheet({ item, sizes });

  return (
    <div className="scroll">
      <div className="stats">
        <div className="carb-ring" style={{ '--pct': `${ringPct}%` }}>
          <div className="carb-ring-inner">
            <b>{carbs}<span>g</span></b>
            <small>CARBS</small>
          </div>
        </div>
        <div className="summary-active">
          <div className="summary-kicker"><span className={`summary-dot ${activeToday ? 'on' : ''}`}></span> Active</div>
          <div className="summary-title">{activeLabel}</div>
          <div className={`summary-pill ${activeToday ? 'on' : ''}`}>
            {runningSickEvent ? <LiveTimer startTimestamp={runningSickEvent.timestamp}/> : activeHint}
          </div>
        </div>
      </div>

      {aiResult && (
        <div className="ai-result-hero-card">
          <div className="ai-hero-food">{aiResult.label}</div>
          <div className="ai-hero-carbs">
            <span className="ai-hero-number">{aiResult.grams}</span>
            <span className="ai-hero-unit">G</span>
          </div>
          <div className="ai-hero-conf">
            Confidence: <span className={`ai-hero-badge conf-${aiResult.confidence}`}>{aiResult.confidence}</span>
          </div>
          <button className="ai-hero-dismiss" onClick={onDismissAiResult}>✕</button>
        </div>
      )}

      <div className="section-title home-section-title">
        <h3>Quick log</h3>
      </div>
      <div className="turbo-stack home-quick-stack">
        <div className="quick-log-grid">
          <QuickCard key={junkItem.sub} item={junkItem} onTap={openQuickSheet}/>
          {drinkItems.map((item) => <QuickCard key={item.sub} item={item} onTap={openQuickSheet}/>)}
          <QuickCard key={carbsItem.sub} item={carbsItem} onTap={openQuickSheet}/>
          <MoodCard item={adrenalineItem} onTap={openQuickSheet}/>
        </div>
      </div>

      <div className="home-priority camera-after-quick">
        <button className="camera-banner camera-banner-main" onClick={onOpenCamera} disabled={cameraBusy}>
            <div className="camera-banner-icon"><Icon.Cam/></div>
            <div className="camera-banner-text">
              <div className="camera-banner-title">Camera</div>
              <div className="camera-banner-hint"><span className="cam-ai-pill">AI</span> odfotiť jedlo · odhad sacharidov</div>
            </div>
            <div className="camera-banner-go">›</div>
        </button>
      </div>

      <div className="section-title home-section-title" style={{marginTop: 18}}>
        <h3>Context</h3>
      </div>
      <div className="context-panel">
        <div className="context-toggle-row">
          {contextToggles.map((item) => (
            <ContextToggle key={item.sub} item={item} runningEvent={runningEvent} onStart={onStartTimer} onStop={onStopTimer} icon={item.icon}/>
          ))}
        </div>
        <div className="context-action-row">
          {contextActions.map((item) => (
            <ContextAction
              key={item.sub}
              item={item}
              runningEvent={item.sub === 'sick' ? runningSickEvent : runningEvent}
              onStart={item.sub === 'sick' ? onStartSick : onStartTimer}
              onStop={item.sub === 'sick' ? onStopSick : onStopTimer}
              onLog={onLogSize}
              icon={item.icon}
            />
          ))}
        </div>
      </div>

      <button className="content-version" onClick={onRefresh} aria-label={`Obnoviť appku, verzia ${APP_VERSION}`}>
        <Icon.Refresh/>
        <span>{APP_VERSION}</span>
      </button>
      <div style={{height: 24}}/>
      {quickSheet && (
        <QuickLogSheet
          item={quickSheet.item}
          sizes={quickSheet.sizes}
          selectedDateKey={selectedDateKey}
          onClose={() => setQuickSheet(null)}
          onLog={onLogSize}
        />
      )}
    </div>
  );
}

// ====== Records ======
function TimeAdjuster({ event, step, onAdjustTime, onSetTime }) {
  return (
    <div>
      <div className="lbl" style={{marginBottom: 8}}>Posuň čas záznamu</div>
      <div className="time-adjust">
        <button className="tbtn" onClick={() => onAdjustTime(event.id, -step)}>−{step} min</button>
        <label className="now-time native-time-trigger" aria-label={`Upraviť čas ${event.time}`}>
          <span>{event.time}</span>
          <input type="time" value={event.time || '00:00'} onChange={(e) => onSetTime(event.id, e.target.value)} />
        </label>
        <button className="tbtn" onClick={() => onAdjustTime(event.id, +step)}>+{step} min</button>
      </div>
    </div>
  );
}

function MealStartAdjuster({ event, onAdjustMealStartTime, onSetMealStartTime }) {
  const mealTime = event.mealStartTime || event.time || '00:00';
  const status = event.mealStartTime ? 'nastavené' : 'default = čas fotky';
  return (
    <div>
      <div className="lbl" style={{marginBottom: 8}}>Začal som jesť · {status}</div>
      <div className="time-adjust meal-start-adjust">
        <button className="tbtn" onClick={() => onAdjustMealStartTime(event.id, -5)}>−5 min</button>
        <label className="now-time native-time-trigger" aria-label={`Upraviť začiatok jedla ${mealTime}`}>
          <span>{mealTime}</span>
          <input type="time" value={mealTime} onChange={(e) => onSetMealStartTime(event.id, e.target.value)} />
        </label>
        <button className="tbtn" onClick={() => onAdjustMealStartTime(event.id, +5)}>+5 min</button>
      </div>
    </div>
  );
}

function ActivityDetailEditor({ event, onAdjustTime, onSetTime, onSave, onCancel, onDelete }) {
  const [draft, setDraft] = useState(event.activityDetail || '');
  const isMeds = event.sub === 'meds';
  const label = isMeds ? 'Medication / substance detail' : 'Cannula detail / site / note';
  const placeholder = isMeds ? 'liek, dávka, doplnok, typ medikamentu…' : 'miesto výmeny, leakage, bolesť, krv…';

  return (
    <div className={`rec-detail detail-activity detail-${event.sub}`}>
      <div className="row">
        <span className="lbl">Detail</span>
        <span className="val">{event.label} · {event.time}</span>
      </div>
      <TimeAdjuster event={event} step={10} onAdjustTime={onAdjustTime} onSetTime={onSetTime} />
      <label className="activity-detail-field">
        <span>{label}</span>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} rows="3" />
      </label>
      <div className="actions activity-detail-actions">
        <button className="btn btn-save" onClick={() => onSave(event.id, draft.trim())}>Save</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" onClick={() => onDelete(event.id)}>Zmazať</button>
      </div>
    </div>
  );
}

function Records({ events, selectedDateKey, setSelectedDateKey, reviewEvent, onSaveDayReview, onAdjustTime, onSetTime, onAdjustMealStartTime, onSetMealStartTime, onAdjustDuration, onActivityDetail, onDelete, onExportCsv }) {
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const recordEvents = events.filter(e => e.cat !== 'review');
  const filters = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'food', label: 'Food', match: (e) => e.cat === 'food' },
    { id: 'beer', label: 'Beer', match: (e) => e.sub === 'beer' },
    { id: 'junk', label: 'Junk', match: (e) => e.sub === 'junk' },
    { id: 'adrenaline', label: 'Adrenalin', match: (e) => e.sub === 'adrenaline' },
    { id: 'activity', label: 'Activity', match: (e) => e.cat === 'activity' },
    { id: 'sick', label: 'Sick', match: (e) => e.sub === 'sick' }
  ];
  const activeFilter = filters.find((f) => f.id === filter) || filters[0];
  const visible = recordEvents.filter(activeFilter.match);
  const sorted = [...visible].sort((a, b) => eventSortValue(b) - eventSortValue(a) || (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div className="scroll records-scroll">
      <div className="rec-head">
        <div className="rec-title-block">
          <h2>Records</h2>
          <div className="rec-date-label">{formatRecordsSubtitle(selectedDateKey, recordEvents.length)}</div>
        </div>
        <div className="rec-day-actions">
          <button className="arr" onClick={() => setSelectedDateKey(addDaysToDateKey(selectedDateKey, -1))}>‹</button>
          <button className="arr" onClick={() => setSelectedDateKey(addDaysToDateKey(selectedDateKey, 1))} disabled={dateKeyOffsetFromToday(selectedDateKey) >= 0}>›</button>
        </div>
      </div>

      <RecordsChart events={recordEvents} />

      <div className="rec-filter">
        {filters.map((f) => {
          const count = recordEvents.filter(f.match).length;
          return (
          <button key={f.id} className={`fchip filter-${f.id} ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}{f.id === 'all' ? '' : ` · ${count}`}
          </button>
          );
        })}
      </div>
      <div className="rec-group-label">Today</div>
      <div className="rec-list">
        {sorted.length === 0 && <div className="rec-empty">Žiadne záznamy</div>}
        {sorted.map((e) => {
          const timeStep = ['activity', 'sleep'].includes(e.cat) ? 5 : 10;
          const durationValue = Math.max(5, e.duration || 5);
          const hasDuration = ['activity', 'sleep'].includes(e.cat) || e.sub === 'sick';
          const isActivityDetail = ['cannula', 'meds'].includes(e.sub);
          return (
          <React.Fragment key={e.id}>
            <button className={`rec-row is-button ${e.cat}`} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
              <span className="rec-leading">
                <span className={`rec-badge dot-${e.cat}`}>{recordIconFor(e)}</span>
                <span className="rec-time">{e.time}</span>
              </span>
              <div className="rec-row-body">
                <div className="rec-name">{e.label}{e.running && ' · beží'}</div>
                <div className="rec-meta">{e.cat}/{e.sub}{e.carbs ? ` · ${e.carbs}g` : ''}{e.mealStartTime ? ` · jedlo ${e.mealStartTime}` : ''}{e.duration ? ` · ${e.duration}m` : ''}{e.note ? ` · ${e.note}` : ''}{e.activityDetail ? ` · ${e.activityDetail}` : ''}</div>
              </div>
              {e.carbs ? <span className="rec-carb">{e.carbs}g</span> : e.size && <span className="rec-size">{e.size}</span>}
              {e.running && <span className="rec-size run">RUN</span>}
              <span className="rec-chev">›</span>
            </button>
            {openId === e.id && isActivityDetail && (
              <ActivityDetailEditor
                event={e}
                onAdjustTime={onAdjustTime}
                onSetTime={onSetTime}
                onSave={(id, detail) => { onActivityDetail(id, detail); setOpenId(null); }}
                onCancel={() => setOpenId(null)}
                onDelete={(id) => { onDelete(id); setOpenId(null); }}
              />
            )}
            {openId === e.id && !isActivityDetail && (
              <div className={`rec-detail detail-${e.cat}`}>
                <div className="row">
                  <span className="lbl">Detail</span>
                  <span className="val">{e.label}{e.size ? ` · ${e.size}` : ''}{e.carbs ? ` · ${e.carbs}g` : ''}</span>
                </div>
                <TimeAdjuster event={e} step={timeStep} onAdjustTime={onAdjustTime} onSetTime={onSetTime} />
                {e.cat === 'food' && (
                  <MealStartAdjuster
                    event={e}
                    onAdjustMealStartTime={onAdjustMealStartTime}
                    onSetMealStartTime={onSetMealStartTime}
                  />
                )}
                {hasDuration && !e.running && (
                  <div>
                    <div className="lbl" style={{marginBottom: 8}}>Dĺžka záznamu</div>
                    <div className="time-adjust duration-adjust">
                      <button className="tbtn" onClick={() => onAdjustDuration(e.id, -10)}>−10 min</button>
                      <div className="now-time">{durationValue} min</div>
                      <button className="tbtn" onClick={() => onAdjustDuration(e.id, +10)}>+10 min</button>
                    </div>
                  </div>
                )}
                <div className="actions">
                  <button className="btn btn-ghost" onClick={() => setOpenId(null)}>Zavrieť</button>
                  <button className="btn btn-danger" onClick={() => { onDelete(e.id); setOpenId(null); }}>Zmazať</button>
                </div>
              </div>
            )}
          </React.Fragment>
          );
        })}
      </div>
      <div className="records-review-slot">
        <DailyReview event={reviewEvent} onSave={(note) => onSaveDayReview(selectedDateKey, note)} />
      </div>
      <button className="records-csv" onClick={onExportCsv}>⇧ Export CSV — all days</button>
      <div style={{height: 24}}/>
    </div>
  );
}

function Phone({ children }) {
  return (
    <div className="phone" data-screen-label="Denník">
      <div className="screen">{children}<div className="home-indicator"/></div>
    </div>
  );
}

function App() {
  const [view, setView] = useState('home');
  const [events, setEvents] = useState(loadLocalEvents);
  const [history, setHistory] = useState([]);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [selectedDateKey, setSelectedDateKey] = useState(formatLocalDateKey);
  const cameraInputRef = useRef(null);

  const runningEvent = events.find(e => e.running && e.cat === 'activity');
  const runningSickEvent = events.find(e => e.running && e.cat === 'mood' && e.sub === 'sick');
  const selectedEvents = events.filter(e => e.dateKey === selectedDateKey && e.cat !== 'sleep');
  const selectedReviewEvent = selectedEvents.find(e => e.cat === 'review' && e.sub === 'day');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {}
  }, [events]);

  useEffect(() => {
    if (!aiResult) return undefined;
    const timeout = setTimeout(() => setAiResult(null), 5000);
    return () => clearTimeout(timeout);
  }, [aiResult]);

  const showToast = (msg, duration = 2600) => {
    setToast(msg);
    setTimeout(() => setToast(t => t === msg ? null : t), duration);
  };

  const addEvent = (data) => {
    const id = Math.max(...events.map(e=>e.id), 0) + 1;
    let carbs = normalizedCarbsValue(data.carbs);
    const canonicalCarbs = carbsForSize(data.cat, data.sub, data.size);
    if (canonicalCarbs != null) carbs = canonicalCarbs;
    if (data.cat !== 'food' && data.sub !== 'beer') carbs = undefined;
    const evt = { id, ...currentClock(), createdAt: Date.now(), ...data, carbs };
    setHistory(h => [...h, { kind: 'add', id }]);
    setEvents(es => [...es, evt]);
    showToast(<>Pridané <b>{evt.label}{evt.size ? ' '+evt.size : ''}</b></>);
  };

  const onLogSize = (data) => {
    addEvent({
      sub: data.sub,
      label: data.label,
      cat: data.cat,
      size: data.size,
      timestamp: data.timestamp,
      timestampLocal: data.timestampLocal,
      dateKey: data.dateKey,
      time: data.time,
      hour: data.hour,
      intensity: data.cat === 'mood' ? INTENSITY_BY_SIZE[data.size] : undefined
    });
  };
  const onStartTimer = (item) => {
    if (runningEvent) return;
    const id = Math.max(...events.map(e=>e.id), 0) + 1;
    const evt = { id, ...currentClock(), createdAt: Date.now(), sub: item.sub, label: item.label, cat: item.cat, running: true };
    setHistory(h => [...h, { kind: 'add', id }]);
    setEvents(es => [...es, evt]);
    showToast(<><b>{item.label}</b> štart</>);
  };
  const onStopTimer = (id) => {
    setEvents(es => es.map(e => {
      if (e.id !== id) return e;
      const startTimestamp = Number.isFinite(e.timestamp) ? e.timestamp : timestampFromDateKeyAndHour(e.dateKey, e.hour);
      const duration = Math.max(5, Math.round((Date.now() - startTimestamp) / 60000));
      return { ...e, running: false, ended: true, duration };
    }));
    showToast(<>Timer zastavený</>);
  };
  const onStartSick = () => {
    const id = Math.max(...events.map(e=>e.id), 0) + 1;
    const evt = { id, ...currentClock(), createdAt: Date.now(), sub: 'sick', label: 'Sick', cat: 'mood', running: true };
    setHistory(h => [...h, { kind: 'add', id }]);
    setEvents(es => [...es, evt]);
    showToast(<><b>Sick</b> zapnuté</>);
  };
  const onStopSick = (id) => {
    setEvents(es => es.map(e => {
      if (e.id !== id) return e;
      const startTimestamp = Number.isFinite(e.timestamp) ? e.timestamp : timestampFromDateKeyAndHour(e.dateKey, e.hour);
      const duration = Math.max(5, Math.round((Date.now() - startTimestamp) / 60000));
      return { ...e, running: false, ended: true, duration };
    }));
    showToast(<>Sick vypnuté</>);
  };
  const onAdjustTime = (id, deltaMin) => {
    setEvents(es => es.map(e => {
      if (e.id !== id) return e;
      const newHour = Math.max(0, Math.min(23.99, e.hour + deltaMin / 60));
      const timestamp = timestampFromDateKeyAndHour(e.dateKey, newHour);
      return { ...e, hour: newHour, time: formatHour(newHour), timestamp, timestampLocal: formatLocalTimestamp(new Date(timestamp)) };
    }));
  };
  const onSetTime = (id, timeValue) => {
    const newHour = hourFromTimeValue(timeValue);
    if (newHour == null) return;
    setEvents(es => es.map(e => {
      if (e.id !== id) return e;
      const timestamp = timestampFromDateKeyAndHour(e.dateKey, newHour);
      return { ...e, hour: newHour, time: formatHour(newHour), timestamp, timestampLocal: formatLocalTimestamp(new Date(timestamp)) };
    }));
  };
  const setMealStartForEvent = (event, mealStartHour) => {
    const timestamp = timestampFromDateKeyAndHour(event.dateKey, mealStartHour);
    return {
      ...event,
      mealStartHour,
      mealStartTime: formatHour(mealStartHour),
      mealStartTimestamp: timestamp
    };
  };
  const onSetMealStartTime = (id, timeValue) => {
    const mealStartHour = hourFromTimeValue(timeValue);
    if (mealStartHour == null) return;
    setEvents(es => es.map(e => e.id === id && e.cat === 'food' ? setMealStartForEvent(e, mealStartHour) : e));
    showToast(<>Začiatok jedla uložený</>);
  };
  const onAdjustMealStartTime = (id, deltaMin) => {
    setEvents(es => es.map(e => {
      if (e.id !== id || e.cat !== 'food') return e;
      const baseHour = Number.isFinite(e.mealStartHour) ? e.mealStartHour : (Number.isFinite(e.hour) ? e.hour : hourFromTimeValue(e.time) || 0);
      const mealStartHour = Math.max(0, Math.min(23.99, baseHour + (deltaMin / 60)));
      return setMealStartForEvent(e, mealStartHour);
    }));
    showToast(<>Začiatok jedla posunutý</>);
  };
  const onAdjustDuration = (id, deltaMin) => {
    setEvents(es => es.map(e => {
      if (e.id !== id || (!['activity', 'sleep'].includes(e.cat) && e.sub !== 'sick')) return e;
      const current = Math.max(5, e.duration || 5);
      return { ...e, duration: Math.max(5, current + deltaMin) };
    }));
  };
  const onActivityDetail = (id, activityDetail) => {
    setEvents(es => es.map(e => {
      if (e.id !== id || !['cannula', 'meds'].includes(e.sub)) return e;
      return { ...e, activityDetail };
    }));
    showToast(<>Detail uložený</>);
  };
  const onSaveDayReview = (dateKey, note) => {
    const text = String(note || '').trim();
    const reviewTimestamp = timestampFromDateKeyAndHour(dateKey, 23 + (59 / 60));
    const reviewClock = {
      timestamp: reviewTimestamp,
      timestampLocal: formatLocalTimestamp(new Date(reviewTimestamp)),
      dateKey,
      time: '23:59',
      hour: 23 + (59 / 60)
    };

    setEvents(es => {
      const existing = es.find(e => e.dateKey === dateKey && e.cat === 'review' && e.sub === 'day');
      if (!text) return existing ? es.filter(e => e.id !== existing.id) : es;
      if (existing) {
        return es.map(e => e.id === existing.id ? { ...e, ...reviewClock, note: text, label: 'Review dňa', source: e.source || 'manual' } : e);
      }
      const id = Math.max(...es.map(e => e.id), 0) + 1;
      return [
        ...es,
        {
          id,
          ...reviewClock,
          createdAt: Date.now(),
          cat: 'review',
          sub: 'day',
          label: 'Review dňa',
          note: text,
          source: 'manual'
        }
      ];
    });
    showToast(text ? <>Review dňa uložené</> : <>Review dňa zmazané</>);
  };
  const onDelete = (id) => {
    const evt = events.find(e => e.id === id);
    if (!evt) return;
    setHistory(h => [...h, { kind: 'delete', evt }]);
    setEvents(es => es.filter(e => e.id !== id));
    showToast(<>Zmazané <b>{evt.label}</b></>);
  };
  const undo = () => {
    const last = history[history.length-1]; if (!last) return;
    setHistory(h => h.slice(0,-1));
    if (last.kind === 'add') setEvents(es => es.filter(e => e.id !== last.id));
    if (last.kind === 'delete') setEvents(es => [...es, last.evt]);
    setToast(null);
  };
  const exportCsv = async () => {
    try {
      const allEvents = loadLocalEvents();
      const mode = await downloadEventsCsv(allEvents);
      if (mode === 'share') {
        showToast(allEvents.length ? <>CSV pripravené na uloženie</> : <>CSV pripravené bez záznamov</>);
      } else if (mode === 'open') {
        showToast(<>CSV otvorené v novom okne</>);
      } else {
        showToast(allEvents.length ? <>CSV stiahnuté</> : <>CSV stiahnuté bez záznamov</>);
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      showToast(<>{error.message || 'CSV export zlyhal.'}</>);
    }
  };
  const openCamera = () => {
    if (cameraBusy) return;
    cameraInputRef.current?.click();
  };
  const refreshApp = () => {
    showToast(<>Obnovujem appku · {APP_VERSION}</>);
    setTimeout(() => window.location.reload(), 120);
  };
  const onCameraFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCameraBusy(true);
    showToast(<>Pripravujem fotku pre AI…</>);
    try {
      const image = await imageToAiDataUrl(file);
      showToast(<>AI analyzuje fotku…</>);
      const response = await fetch('/api/estimate-carbs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image })
      });
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      const result = isJson ? await response.json().catch(() => ({})) : {};
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('AI API nie je dostupné na tejto adrese. Použi Cloudflare deploy, nie lokálny statický server.');
        }
        throw new Error(result.error || `AI odhad zlyhal (${response.status}).`);
      }
      const grams = normalizedCarbsValue(result.grams);
      const label = labelFromAiResult(result);
      const confidence = result.confidence || 'medium';

      setAiResult({ label, grams, confidence, note: result.short_note });

      addEvent({
        sub: 'carbs',
        label,
        cat: 'food',
        carbs: grams,
        confidence,
        note: result.short_note,
        source: 'ai_camera'
      });
    } catch (error) {
      showToast(<>{error.message || 'Fotka sa nepodarila spracovať.'}</>, 7000);
    } finally {
      setCameraBusy(false);
      event.target.value = '';
    }
  };

  return (
    <Phone>
      {view === 'home' && (
        <Header selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onUndo={undo} canUndo={history.length>0}/>
      )}

      <div className={`view-main view-${view}`}>
        {view === 'home' && (
          <Home
            events={selectedEvents}
            selectedDateKey={selectedDateKey}
            runningEvent={runningEvent}
            runningSickEvent={runningSickEvent}
            onLogSize={onLogSize}
            onStartTimer={onStartTimer}
            onStopTimer={onStopTimer}
            onStartSick={onStartSick}
            onStopSick={onStopSick}
            onRefresh={refreshApp}
            onOpenCamera={openCamera}
            cameraBusy={cameraBusy}
            aiResult={aiResult}
            onDismissAiResult={() => setAiResult(null)}
          />
        )}
        {view === 'records' && <Records events={selectedEvents} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} reviewEvent={selectedReviewEvent} onSaveDayReview={onSaveDayReview} onAdjustTime={onAdjustTime} onSetTime={onSetTime} onAdjustMealStartTime={onAdjustMealStartTime} onSetMealStartTime={onSetMealStartTime} onAdjustDuration={onAdjustDuration} onActivityDetail={onActivityDetail} onDelete={onDelete} onExportCsv={exportCsv}/>}
      </div>

      <div className="bottom-bar simple">
        <input
          ref={cameraInputRef}
          className="camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onCameraFile}
        />
        <div className="nav-pill">
          <button className={view==='home'?'on':''} onClick={() => setView('home')}><Icon.Home/> Home</button>
          <button className={view==='records'?'on':''} onClick={() => setView('records')}><Icon.List/> Records</button>
        </div>
      </div>

      {toast && (
        <div className="toast">
          <span className="dot"/>
          <div className="msg">{toast}</div>
          {history.length > 0 && <button className="undo" onClick={undo}>Späť</button>}
        </div>
      )}
    </Phone>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
