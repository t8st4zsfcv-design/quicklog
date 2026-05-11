const { useState, useEffect, useRef } = React;

// ====== Subtypes from QuickLog data model ======
const TURBO = [
  // food
  { sub: 'carbs',  cat: 'food', label: 'Carbs',  carbsByMass: { S: 15, M: 30, L: 60 } },
  { sub: 'kuluri', cat: 'food', label: 'Kuluri', carbsByMass: { S: 15, M: 30, L: 60 } },
  { sub: 'junk',   cat: 'food', label: 'Junk',   carbsByMass: { S: 15, M: 30, L: 60 } },
  // drink
  { sub: 'coffee',  cat: 'drink', label: 'Coffee' },
  { sub: 'beer',    cat: 'drink', label: 'Beer', carbsByMass: { S: 7, M: 13, L: 20 } },
  { sub: 'wine',    cat: 'drink', label: 'Wine' },
  { sub: 'spirits', cat: 'drink', label: 'Spirits' },
  // mood
  { sub: 'adrenaline', cat: 'mood', label: 'Adrenalin' },
  { sub: 'sick',       cat: 'mood', label: 'Sick' },
  // activity (timer)
  { sub: 'exercise', cat: 'activity', label: 'Exercise', timer: true },
  { sub: 'nap',      cat: 'activity', label: 'Nap',      timer: true },
  { sub: 'party',    cat: 'activity', label: 'Party',    timer: true },
  { sub: 'travel',   cat: 'activity', label: 'Travel',   timer: true },
  { sub: 'cannula',  cat: 'activity', label: 'Cannula' },
  { sub: 'meds',     cat: 'activity', label: 'Meds' },
];

const SIZES = ['S', 'M', 'L'];
const SIZE_LABELS = { S: 'malé · ~15g', M: 'stredné · ~30g', L: 'veľké · ~60g+' };
const MOOD_SIZE_LABELS = { S: 'nízka intenzita', M: 'stredná intenzita', L: 'vysoká intenzita' };
const CAT_LABEL = { food: 'jedlo', drink: 'pitie', activity: 'aktivita', mood: 'nálada' };
const APP_VERSION = 'V2.3';
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
const INTENSITY_BY_SIZE = { S: 'low', M: 'med', L: 'high' };
const SIZE_BY_INTENSITY = { low: 'S', med: 'M', high: 'L' };

function sizeHintFor(item, size) {
  return item?.cat === 'mood' ? MOOD_SIZE_LABELS[size] : SIZE_LABELS[size];
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
    if (!legacyName || note) return;
    note = `legacy:${legacyName}`;
  };

  if (cat === 'food' && ['bread', 'rice', 'pasta', 'potato', 'sweets', 'snack', 'fruit', 'photo'].includes(sub)) {
    addLegacyNote(sub);
    sub = 'carbs';
    label = label || 'Carbs';
  }

  if (cat === 'drink') {
    if (sub === 'poldeci') {
      sub = 'spirits';
      label = 'Spirits';
      size = size || 'M';
    }
    if (['juice', 'soda'].includes(sub)) {
      addLegacyNote(sub);
      cat = 'food';
      sub = 'carbs';
      label = 'Carbs';
      size = size || 'M';
    }
    if (sub === 'protein') {
      addLegacyNote(sub);
      cat = 'food';
      sub = 'carbs';
      label = 'Carbs';
      size = size || 'S';
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

  return {
    ...event,
    cat,
    sub,
    label,
    size,
    intensity,
    note,
    carbs: cat === 'mood' ? undefined : event?.carbs,
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
  const header = ['timestamp', 'dateKey', 'time', 'start_time', 'end_time', 'start_timestamp', 'end_timestamp', 'category', 'subtype', 'label', 'size', 'intensity', 'duration_min', 'carbs_g', 'confidence', 'note', 'source'];
  const rows = events
    .slice()
    .sort((a, b) => eventSortValue(b) - eventSortValue(a))
    .map((event) => {
      const startTimestamp = eventSortValue(event);
      const startDate = new Date(startTimestamp);
      const startHour = startDate.getHours() + (startDate.getMinutes() / 60);
      const durationHours = event.duration ? event.duration / 60 : 0;
      const endTimestamp = ['activity', 'sleep'].includes(event.cat) && event.duration ? startTimestamp + (durationHours * 60 * 60 * 1000) : '';
      const date = eventDateParts(event, startTimestamp);
      const endDate = endTimestamp === '' ? null : eventDateParts(event, endTimestamp);
      return [
        date.iso,
        date.day,
        event.time,
        formatHour(startHour),
        endTimestamp === '' ? '' : formatHour(new Date(endTimestamp).getHours() + (new Date(endTimestamp).getMinutes() / 60)),
        date.iso,
        endDate?.iso || '',
        event.cat,
        event.sub,
        event.label,
        event.size,
        event.intensity,
        event.duration,
        event.carbs,
        event.confidence,
        event.note,
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
};

function dateKeyOffsetFromToday(dateKey) {
  const today = localDateFromKey(formatLocalDateKey());
  const selected = localDateFromKey(dateKey);
  return Math.round((selected.getTime() - today.getTime()) / 86400000);
}

function Header({ selectedDateKey, setSelectedDateKey, onUndo, canUndo }) {
  const dayOffset = dateKeyOffsetFromToday(selectedDateKey);
  const labels = { 0: 'DNES', '-1': 'VČERA', '-2': 'PREDVČER.' };
  const lbl = labels[dayOffset] || (dayOffset < 0 ? `−${Math.abs(dayOffset)} DNÍ` : selectedDateKey);
  return (
    <div className="head">
      <div className="day-switcher">
        <button className="arr" onClick={() => setSelectedDateKey(addDaysToDateKey(selectedDateKey, -1))}>‹</button>
        <span className="lbl"><b>{lbl}</b></span>
        <button className="arr" onClick={() => setSelectedDateKey(addDaysToDateKey(selectedDateKey, 1))} disabled={dayOffset >= 0}>›</button>
      </div>
      <div className="top-icons">
        <button className="icon-btn" disabled={!canUndo} onClick={onUndo} style={{opacity: canUndo ? 1 : 0.4}}><Icon.Undo/></button>
      </div>
    </div>
  );
}

function Timeline({ events }) {
  const project = (h) => Math.max(0, Math.min(100, ((h - 6) / 18) * 100));
  const heightFor = (e) => {
    if (['activity', 'sleep'].includes(e.cat)) return 18;
    const map = { S: 18, M: 30, L: 44 };
    return map[e.size] || 24;
  };
  return (
    <div className="timeline">
      <div className="timeline-grid"/>
      <div className="timeline-events">
        {events.map((e) => (
          <div key={e.id} className={`ev ${e.cat}`} style={{ left: `${project(e.hour)}%`, height: `${heightFor(e)}px` }} title={`${e.time} · ${e.label}`}/>
        ))}
      </div>
      <div className="timeline-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
    </div>
  );
}

// ====== Step drag card (S/M/L) ======
function DragCard({ item, onLog, direction = 'horizontal' }) {
  const [dragging, setDragging] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);
  const startPoint = useRef(null);
  const startX = useRef(null);
  const startY = useRef(null);
  const dragActive = useRef(false);
  const pctRef = useRef(0);
  const sizeIdxRef = useRef(0);
  const pointerIdRef = useRef(null);
  const touchDragRef = useRef(false);
  const spanRef = useRef(200);
  const ref = useRef(null);
  const minCommitPct = 0.16;
  const isVertical = direction === 'vertical';

  const computeIdx = (p) => {
    if (p < 1 / 3) return 0;
    if (p < 2 / 3) return 1;
    return 2;
  };

  const resetDrag = () => {
    startPoint.current = null;
    startX.current = null;
    startY.current = null;
    dragActive.current = false;
    touchDragRef.current = false;
    pointerIdRef.current = null;
    pctRef.current = 0;
    sizeIdxRef.current = 0;
    setDragging(false);
    setSizeIdx(0);
  };

  const updateDrag = (event) => {
    if (startPoint.current == null) return;
    const delta = isVertical ? startPoint.current - event.clientY : event.clientX - startPoint.current;
    const p = Math.min(1, Math.max(0, delta / spanRef.current));
    const idx = computeIdx(p);
    pctRef.current = p;
    sizeIdxRef.current = idx;
    setSizeIdx((currentIdx) => currentIdx === idx ? currentIdx : idx);
  };

  const beginVerticalTouch = (touch) => {
    touchDragRef.current = true;
    startPoint.current = touch.clientY;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    spanRef.current = ref.current?.offsetHeight || 160;
    pctRef.current = 0;
    sizeIdxRef.current = 0;
    dragActive.current = false;
    setSizeIdx(0);
  };

  const moveVerticalTouch = (touch, originalEvent) => {
    if (!touchDragRef.current) return;
    if (!dragActive.current) {
      const dx = Math.abs(touch.clientX - startX.current);
      const dy = startY.current - touch.clientY;
      if (dx > 6 && dx > Math.abs(dy)) return;
      if (dy < 8) return;
      dragActive.current = true;
      setDragging(true);
    }
    originalEvent.preventDefault();
    updateDrag(touch);
  };

  const endVerticalTouch = (touch, originalEvent) => {
    if (!touchDragRef.current) return;
    if (!dragActive.current || !touch) {
      resetDrag();
      return;
    }
    originalEvent.preventDefault();
    updateDrag(touch);
    if (pctRef.current >= minCommitPct) {
      onLog({ ...item, size: SIZES[sizeIdxRef.current] });
    }
    resetDrag();
  };

  useEffect(() => {
    if (!isVertical || !ref.current) return undefined;
    const node = ref.current;
    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      beginVerticalTouch(event.touches[0]);
    };
    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) return;
      moveVerticalTouch(event.touches[0], event);
    };
    const handleTouchEnd = (event) => {
      endVerticalTouch(event.changedTouches[0], event);
    };
    const handleTouchCancel = () => {
      if (touchDragRef.current) resetDrag();
    };
    node.addEventListener('touchstart', handleTouchStart, { passive: true });
    node.addEventListener('touchmove', handleTouchMove, { passive: false });
    node.addEventListener('touchend', handleTouchEnd, { passive: false });
    node.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      node.removeEventListener('touchstart', handleTouchStart);
      node.removeEventListener('touchmove', handleTouchMove);
      node.removeEventListener('touchend', handleTouchEnd);
      node.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [isVertical, item, onLog]);

  const onPointerDown = (e) => {
    if (isVertical && touchDragRef.current) return;
    if (e.button !== undefined && e.button !== 0) return;
    startPoint.current = isVertical ? e.clientY : e.clientX;
    startX.current = e.clientX;
    startY.current = e.clientY;
    pointerIdRef.current = e.pointerId;
    spanRef.current = isVertical ? (ref.current?.offsetHeight || 160) : (ref.current?.offsetWidth || 200);
    pctRef.current = 0;
    sizeIdxRef.current = 0;
    if (!isVertical) {
      e.preventDefault();
      dragActive.current = true;
      ref.current?.setPointerCapture?.(e.pointerId);
      setDragging(true);
    }
    setSizeIdx(0);
  };
  const onPointerMove = (e) => {
    if (isVertical && touchDragRef.current) return;
    if (pointerIdRef.current !== e.pointerId) return;
    if (isVertical && !dragActive.current) {
      const dx = Math.abs(e.clientX - startX.current);
      const dy = startY.current - e.clientY;
      if (dx > 6 && dx > Math.abs(dy)) return;
      if (dy < 8) return;
      dragActive.current = true;
      ref.current?.setPointerCapture?.(e.pointerId);
      setDragging(true);
    }
    e.preventDefault();
    updateDrag(e);
  };
  const onPointerUp = (e) => {
    if (isVertical && touchDragRef.current) return;
    if (pointerIdRef.current !== e.pointerId) return;
    if (!dragActive.current) {
      resetDrag();
      return;
    }
    e.preventDefault();
    updateDrag(e);
    ref.current?.releasePointerCapture?.(e.pointerId);
    if (pctRef.current >= minCommitPct) {
      onLog({ ...item, size: SIZES[sizeIdxRef.current] });
    }
    resetDrag();
  };
  const onPointerCancel = (e) => {
    if (pointerIdRef.current !== e.pointerId) return;
    resetDrag();
  };
  const fillPct = dragging ? ((sizeIdx + 1) / SIZES.length) * 100 : 0;
  const currentSize = dragging ? SIZES[sizeIdx] : null;

  return (
    <div
      ref={ref}
      className={`tcard drag ${isVertical ? 'vertical' : 'horizontal'} ${dragging ? 'dragging' : ''} cat-${item.cat}`}
      data-size={currentSize || ''}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ '--fill': `${fillPct}%` }}
    >
      <div className="tcard-fill" />
      <div className="tcard-ticks"><i/></div>
      <div className="tcard-body">
        <div className="tcard-meta">
          <span className={`cat-dot dot-${item.cat}`} />
          <span className="sub">{item.cat}</span>
        </div>
        <div className="name">{item.label}</div>
      </div>
      <div className="tcard-right">
        {dragging ? (
          <div className="size-pop">
            <div className="size-big">{currentSize}</div>
            <div className="size-hint">{sizeHintFor(item, currentSize)}</div>
          </div>
        ) : (
          <div className="size-ladder">
            {SIZES.map((s) => <span key={s}>{s}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function TimerCard({ item, runningEvent, onStart, onStop, onLog }) {
  const isRunning = runningEvent && runningEvent.sub === item.sub;
  return (
    <button
      className={`tcard timer-card cat-${item.cat} ${isRunning ? 'running' : ''}`}
      onClick={() => {
        if (isRunning) return onStop(runningEvent.id);
        if (item.timer) return onStart(item);
        return onLog({ sub: item.sub, label: item.label, cat: item.cat });
      }}
    >
      <div className="tcard-body">
        <div className="tcard-meta">
          <span className={`cat-dot dot-${item.cat}`} />
          <span className="sub">{item.cat}</span>
        </div>
        <div className="name">{item.label}</div>
      </div>
      <div className="tcard-right">
        {isRunning ? (
          <div className="timer-pop">
            <span className="rec-dot" />
            <span className="timer-val"><LiveTimer key={runningEvent.id} startTimestamp={runningEvent.timestamp}/></span>
          </div>
        ) : (
          <div className="play-btn">{item.timer ? '▶' : '+'}</div>
        )}
      </div>
    </button>
  );
}

function MoodCard({ item, onLog }) {
  return <DragCard item={item} onLog={onLog} />;
}

function LiveTimer({ startTimestamp }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const totalSec = Math.max(0, Math.floor((Date.now() - (startTimestamp || Date.now())) / 1000));
  const h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60), s = totalSec%60;
  if (h > 0) return <span>{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
  return <span>{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
}

function Home({ events, runningEvent, onLogSize, onStartTimer, onStopTimer, onRefresh }) {
  const featuredFood = ['carbs', 'kuluri', 'junk'];
  const featuredDrink = ['coffee', 'beer', 'wine', 'spirits'];
  const featuredMood = ['adrenaline', 'sick'];

  const foodItems = featuredFood.map((s) => TURBO.find(t => t.sub === s));
  const drinkItems = featuredDrink.map((s) => TURBO.find(t => t.sub === s));
  const moodItems = featuredMood.map((s) => TURBO.find(t => t.sub === s));
  const activityItems = TURBO.filter(t => t.cat === 'activity');

  const carbs = events
    .filter(e => e.cat === 'food' || (e.cat === 'drink' && e.sub === 'beer'))
    .reduce((s, e) => s + (e.carbs || 0), 0);
  const activeToday = events.some(e => e.running) ? 1 : 0;

  return (
    <div className="scroll">
      <Timeline events={events}/>

      <div className="stats">
        <div className="stat-big">{carbs}<span className="unit">g</span></div>
        <div className="stat-mini"><b>{events.length}</b>EVENTOV</div>
        <div className="stat-mini"><b>{activeToday}</b>AKTÍV.</div>
      </div>

      <div className="section-title">
        <h3>Jedlo</h3>
        <small>POTIAHNI VPRAVO PRE S · M · L</small>
      </div>
      <div className="turbo-grid">
        {foodItems.map((item) => <DragCard key={item.sub} item={item} onLog={onLogSize}/>)}
      </div>

      <div className="section-title" style={{marginTop: 18}}>
        <h3>Pitie</h3>
        <small>POTIAHNI HORE PRE S · M · L</small>
      </div>
      <div className="turbo-grid drink-vertical">
        {drinkItems.map((item) => <DragCard key={item.sub} item={item} onLog={onLogSize} direction="vertical"/>)}
      </div>

      <div className="section-title" style={{marginTop: 18}}>
        <h3>Nálada</h3>
        <small>POTIAHNI PRE INTENZITU</small>
      </div>
      <div className="turbo-grid">
        {moodItems.map((item) => <MoodCard key={item.sub} item={item} onLog={onLogSize}/>)}
      </div>

      <div className="section-title" style={{marginTop: 18}}>
        <h3>Timer</h3>
        <small>ŤUKNI · ZAPNI / VYPNI</small>
      </div>
      <div className="turbo-grid timers">
        {activityItems.map((item) => (
          <TimerCard key={item.sub} item={item} runningEvent={runningEvent} onStart={onStartTimer} onStop={onStopTimer} onLog={onLogSize}/>
        ))}
      </div>

      <button className="content-version" onClick={onRefresh} aria-label={`Obnoviť appku, verzia ${APP_VERSION}`}>
        <Icon.Refresh/>
        <span>{APP_VERSION}</span>
      </button>
      <div style={{height: 24}}/>
    </div>
  );
}

// ====== Records ======
function Records({ events, onAdjustTime, onAdjustDuration, onDelete, onExportCsv }) {
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const visible = filter === 'all' ? events : events.filter(e => e.cat === filter);
  const sorted = [...visible].sort((a, b) => eventSortValue(b) - eventSortValue(a) || (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div className="scroll">
      <div className="rec-head">
        <h2>Záznamy</h2>
        <div className="rec-tools"><button className="rec-pill" onClick={onExportCsv}>CSV ↓</button></div>
      </div>
      <div className="rec-filter">
        {['all','food','drink','activity','mood'].map((f) => (
          <button key={f} className={`fchip filter-${f} ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `Všetko · ${events.length}` : `${CAT_LABEL[f]} · ${events.filter(e=>e.cat===f).length}`}
          </button>
        ))}
      </div>
      <div className="rec-rail">
        {sorted.length === 0 && <div className="rec-empty">Žiadne záznamy</div>}
        {sorted.map((e) => {
          const timeStep = ['activity', 'sleep'].includes(e.cat) ? 5 : 10;
          const durationValue = Math.max(5, e.duration || 5);
          return (
          <React.Fragment key={e.id}>
            <button className={`rec-row is-button ${e.cat}`} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
              <span className="rec-time">{e.time}</span>
              <span className={`cat-dot rec-row-dot dot-${e.cat}`} />
              <div>
                <div className="rec-name">{e.label}{e.running && ' · beží'}</div>
                <div className="rec-meta">{e.cat}/{e.sub}{e.carbs ? ` · ${e.carbs}g` : ''}{e.duration ? ` · ${e.duration}m` : ''}{e.note ? ` · ${e.note}` : ''}</div>
              </div>
              {e.size && <span className="rec-size">{e.size}</span>}
              {e.running && <span className="rec-size run">RUN</span>}
            </button>
            {openId === e.id && (
              <div className={`rec-detail detail-${e.cat}`}>
                <div className="row">
                  <span className="lbl">Detail</span>
                  <span className="val">{e.label}{e.size ? ` · ${e.size}` : ''}{e.carbs ? ` · ${e.carbs}g` : ''}</span>
                </div>
                <div>
                  <div className="lbl" style={{marginBottom: 8}}>Posuň čas záznamu</div>
                  <div className="time-adjust">
                    <button className="tbtn" onClick={() => onAdjustTime(e.id, -timeStep)}>−{timeStep} min</button>
                    <div className="now-time">{e.time}</div>
                    <button className="tbtn" onClick={() => onAdjustTime(e.id, +timeStep)}>+{timeStep} min</button>
                  </div>
                </div>
                {['activity', 'sleep'].includes(e.cat) && !e.running && (
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
  const [selectedDateKey, setSelectedDateKey] = useState(formatLocalDateKey);
  const cameraInputRef = useRef(null);

  const runningEvent = events.find(e => e.running && e.cat !== 'sleep');
  const selectedEvents = events.filter(e => e.dateKey === selectedDateKey && e.cat !== 'sleep');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {}
  }, [events]);

  const showToast = (msg, duration = 2600) => {
    setToast(msg);
    setTimeout(() => setToast(t => t === msg ? null : t), duration);
  };

  const addEvent = (data) => {
    const id = Math.max(...events.map(e=>e.id), 0) + 1;
    let carbs = data.carbs;
    if ((data.cat === 'food' || data.sub === 'beer') && data.size && !carbs) {
      const item = TURBO.find(t => t.sub === data.sub);
      carbs = item?.carbsByMass?.[data.size];
    }
    if (data.cat === 'mood') carbs = undefined;
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
  const onAdjustTime = (id, deltaMin) => {
    setEvents(es => es.map(e => {
      if (e.id !== id) return e;
      const newHour = Math.max(0, Math.min(23.99, e.hour + deltaMin / 60));
      const timestamp = timestampFromDateKeyAndHour(e.dateKey, newHour);
      return { ...e, hour: newHour, time: formatHour(newHour), timestamp, timestampLocal: formatLocalTimestamp(new Date(timestamp)) };
    }));
  };
  const onAdjustDuration = (id, deltaMin) => {
    setEvents(es => es.map(e => {
      if (e.id !== id || !['activity', 'sleep'].includes(e.cat)) return e;
      const current = Math.max(5, e.duration || 5);
      return { ...e, duration: Math.max(5, current + deltaMin) };
    }));
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
      const grams = Math.max(0, Math.round(Number(result.grams) || 0));
      const label = labelFromAiResult(result);
      addEvent({
        sub: 'carbs',
        label,
        cat: 'food',
        carbs: grams,
        confidence: result.confidence,
        note: result.short_note,
        source: 'camera-ai'
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
      <Header selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onUndo={undo} canUndo={history.length>0}/>

      <div className={`view-main view-${view}`}>
        {view === 'home' && (
          <Home
            events={selectedEvents}
            runningEvent={runningEvent}
            onLogSize={onLogSize}
            onStartTimer={onStartTimer}
            onStopTimer={onStopTimer}
            onRefresh={refreshApp}
          />
        )}
        {view === 'records' && <Records events={selectedEvents} onAdjustTime={onAdjustTime} onAdjustDuration={onAdjustDuration} onDelete={onDelete} onExportCsv={exportCsv}/>}
      </div>

      <div className="bottom-bar simple">
        <button className="fab-cam" onClick={openCamera} disabled={cameraBusy} aria-label="Otvoriť kameru"><Icon.Cam/></button>
        <input
          ref={cameraInputRef}
          className="camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onCameraFile}
        />
        <div className="nav-pill">
          <button className={view==='home'?'on':''} onClick={() => setView('home')}>Hlavná</button>
          <button className={view==='records'?'on':''} onClick={() => setView('records')}>Záznamy</button>
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
