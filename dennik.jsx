const { useState, useEffect, useRef } = React;

// ====== Subtypes from QuickLog data model ======
const TURBO = [
  // food
  { sub: 'kuluri', cat: 'food', label: 'Kuluri', carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'bread',  cat: 'food', label: 'Bread',  carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'rice',   cat: 'food', label: 'Rice',   carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'pasta',  cat: 'food', label: 'Pasta',  carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'potato', cat: 'food', label: 'Potato', carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'sweets', cat: 'food', label: 'Sweets', carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'snack',  cat: 'food', label: 'Snack',  carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'fruit',  cat: 'food', label: 'Fruit',  carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  { sub: 'junk',   cat: 'food', label: 'Junk',   carbsByMass: { S: 15, M: 30, L: 60, XL: 90 } },
  // drink
  { sub: 'coffee',  cat: 'drink', label: 'Coffee' },
  { sub: 'beer',    cat: 'drink', label: 'Beer' },
  { sub: 'wine',    cat: 'drink', label: 'Wine' },
  { sub: 'spirits', cat: 'drink', label: 'Spirits' },
  { sub: 'soda',    cat: 'drink', label: 'Soda' },
  { sub: 'juice',   cat: 'drink', label: 'Juice' },
  { sub: 'protein', cat: 'drink', label: 'Protein' },
  // mood
  { sub: 'stress',      cat: 'mood', label: 'Stress' },
  { sub: 'frustration', cat: 'mood', label: 'Frustr.' },
  { sub: 'nervousness', cat: 'mood', label: 'Nervous' },
  { sub: 'happy',       cat: 'mood', label: 'Happy' },
  { sub: 'sick',        cat: 'mood', label: 'Sick' },
  // activity (timer)
  { sub: 'exercise', cat: 'activity', label: 'Exercise', timer: true },
  { sub: 'walk',     cat: 'activity', label: 'Walk',     timer: true },
  { sub: 'nap',      cat: 'activity', label: 'Nap',      timer: true },
  { sub: 'party',    cat: 'activity', label: 'Party',    timer: true },
  { sub: 'sex',      cat: 'activity', label: 'Sex',      timer: true },
  { sub: 'travel',   cat: 'activity', label: 'Travel',   timer: true },
];

const SIZES = ['S', 'M', 'L', 'XL'];
const SIZE_LABELS = { S: 'malé · ~15g', M: 'stredné · ~30g', L: 'veľká · ~60g', XL: 'hostina · ~90g+' };
const CAT_LABEL = { food: 'jedlo', drink: 'pitie', activity: 'aktivita', mood: 'nálada' };
const STORAGE_KEY = 'fasttrack-diary-events-v1';

function loadLocalEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const Icon = {
  Cam: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/></svg>,
  Undo: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>,
};

function StatusBar() { return (
  <div className="status-bar">
    <span>9:41</span><div className="dots"><span/><span/><span/></div><div className="battery"/>
  </div>
);}

function Header({ dayOffset, setDayOffset, onUndo, canUndo }) {
  const labels = { 0: 'DNES', '-1': 'VČERA', '-2': 'PREDVČER.' };
  const lbl = labels[dayOffset] || `−${Math.abs(dayOffset)} DNÍ`;
  return (
    <div className="head">
      <div className="day-switcher">
        <button className="arr" onClick={() => setDayOffset(dayOffset - 1)}>‹</button>
        <span className="lbl"><b>{lbl}</b></span>
        <button className="arr" onClick={() => setDayOffset(Math.min(0, dayOffset + 1))} disabled={dayOffset >= 0}>›</button>
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
    if (e.cat === 'activity') return 18;
    const map = { S: 18, M: 30, L: 44, XL: 56 };
    return map[e.size] || 24;
  };
  return (
    <div className="timeline">
      <div className="timeline-grid"/>
      <div className="timeline-events">
        {events.map((e) => (
          <div key={e.id} className={`ev ${e.cat}`} style={{ left: `${project(e.hour)}%`, height: `${heightFor(e)}px` }} title={`${e.time} · ${e.label}`}/>
        ))}
        <div className="now" style={{ left: `${project(21.9)}%` }}/>
      </div>
      <div className="timeline-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
    </div>
  );
}

// ====== Horizontal drag card (L→R for S/M/L/XL) ======
function DragCard({ item, onLog }) {
  const [dragging, setDragging] = useState(false);
  const [pct, setPct] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(0);
  const startX = useRef(null);
  const widthRef = useRef(200);
  const ref = useRef(null);

  const computeIdx = (p) => {
    if (p < 0.25) return 0;
    if (p < 0.5)  return 1;
    if (p < 0.75) return 2;
    return 3;
  };

  const onDown = (e) => {
    e.preventDefault();
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    startX.current = x;
    widthRef.current = ref.current?.offsetWidth || 200;
    setDragging(true);
    setPct(0.05);
    setSizeIdx(0);
  };
  const onMove = (e) => {
    if (startX.current == null) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const dx = x - startX.current;
    const w = widthRef.current;
    const p = Math.min(1, Math.max(0, dx / w));
    setPct(p);
    setSizeIdx(computeIdx(p));
  };
  const onUp = () => {
    if (startX.current == null) return;
    if (pct > 0.04) {
      onLog({ ...item, size: SIZES[sizeIdx] });
    }
    startX.current = null;
    setDragging(false);
    setPct(0);
    setSizeIdx(0);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => onMove(e);
    const up = () => onUp();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [dragging, pct, sizeIdx]);

  const fillPct = dragging ? pct * 100 : 0;
  const currentSize = dragging ? SIZES[sizeIdx] : null;

  return (
    <div
      ref={ref}
      className={`tcard drag ${dragging ? 'dragging' : ''} cat-${item.cat}`}
      data-size={currentSize || ''}
      onMouseDown={onDown}
      onTouchStart={onDown}
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
            <div className="size-hint">{SIZE_LABELS[currentSize]}</div>
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

function TimerCard({ item, runningEvent, onStart, onStop }) {
  const isRunning = runningEvent && runningEvent.sub === item.sub;
  return (
    <button
      className={`tcard timer-card cat-${item.cat} ${isRunning ? 'running' : ''}`}
      onClick={() => isRunning ? onStop(runningEvent.id) : onStart(item)}
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
            <span className="timer-val"><LiveTimer startHour={runningEvent.hour}/></span>
          </div>
        ) : (
          <div className="play-btn">▶</div>
        )}
      </div>
    </button>
  );
}

// Mood card — same as DragCard but smaller, single-tap (no size needed but keeps S/M/L/XL feel)
function MoodCard({ item, onLog }) {
  return <DragCard item={item} onLog={onLog} />;
}

function LiveTimer({ startHour }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const totalSec = Math.floor(((21 + 53/60) - startHour) * 3600) + tick;
  const h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60), s = totalSec%60;
  if (h > 0) return <span>{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
  return <span>{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
}

function Home({ events, runningEvent, onLogSize, onStartTimer, onStopTimer }) {
  const featuredFood = ['kuluri', 'bread', 'sweets', 'fruit'];
  const featuredDrink = ['coffee', 'beer', 'wine'];
  const featuredMood = ['stress', 'happy', 'nervousness'];

  const foodItems = featuredFood.map((s) => TURBO.find(t => t.sub === s));
  const drinkItems = featuredDrink.map((s) => TURBO.find(t => t.sub === s));
  const moodItems = featuredMood.map((s) => TURBO.find(t => t.sub === s));
  const timerItems = TURBO.filter(t => t.timer);

  const carbs = events.filter(e => e.cat === 'food').reduce((s, e) => s + (e.carbs || 0), 0);

  return (
    <div className="scroll">
      <Timeline events={events}/>

      <div className="stats">
        <div className="stat-big">{carbs}<span className="unit">g</span></div>
        <div className="stat-mini"><b>{events.length}</b>EVENTOV</div>
        <div className="stat-mini"><b>{runningEvent ? 1 : 0}</b>AKTÍV.</div>
      </div>

      <div className="section-title">
        <h3>Jedlo</h3>
        <small>POTIAHNI VPRAVO PRE S · M · L · XL</small>
      </div>
      <div className="turbo-grid">
        {foodItems.map((item) => <DragCard key={item.sub} item={item} onLog={onLogSize}/>)}
      </div>

      <div className="section-title" style={{marginTop: 18}}>
        <h3>Pitie</h3>
        <small>POTIAHNI VPRAVO</small>
      </div>
      <div className="turbo-grid three">
        {drinkItems.map((item) => <DragCard key={item.sub} item={item} onLog={onLogSize}/>)}
      </div>

      <div className="section-title" style={{marginTop: 18}}>
        <h3>Nálada</h3>
        <small>POTIAHNI PRE INTENZITU</small>
      </div>
      <div className="turbo-grid three">
        {moodItems.map((item) => <MoodCard key={item.sub} item={item} onLog={onLogSize}/>)}
      </div>

      <div className="section-title" style={{marginTop: 18}}>
        <h3>Timer</h3>
        <small>ŤUKNI · ZAPNI / VYPNI</small>
      </div>
      <div className="turbo-grid timers">
        {timerItems.map((item) => (
          <TimerCard key={item.sub} item={item} runningEvent={runningEvent} onStart={onStartTimer} onStop={onStopTimer}/>
        ))}
      </div>
      <div style={{height: 24}}/>
    </div>
  );
}

// ====== Records ======
function fmtTime(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function Records({ events, onAdjustTime, onDelete }) {
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const visible = filter === 'all' ? events : events.filter(e => e.cat === filter);
  const sorted = [...visible].sort((a, b) => b.hour - a.hour);

  return (
    <div className="scroll">
      <div className="rec-head">
        <h2>Záznamy</h2>
        <div className="rec-tools"><button className="rec-pill">CSV ↓</button></div>
      </div>
      <div className="rec-filter">
        {['all','food','drink','activity','mood'].map((f) => (
          <button key={f} className={`fchip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `Všetko · ${events.length}` : `${CAT_LABEL[f]} · ${events.filter(e=>e.cat===f).length}`}
          </button>
        ))}
      </div>
      <div className="rec-rail">
        {sorted.length === 0 && <div className="rec-empty">Žiadne záznamy</div>}
        {sorted.map((e) => (
          <React.Fragment key={e.id}>
            <button className={`rec-row is-button ${e.cat}`} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
              <span className="rec-time">{e.time}</span>
              <span className={`cat-dot rec-row-dot dot-${e.cat}`} />
              <div>
                <div className="rec-name">{e.label}{e.running && ' · beží'}</div>
                <div className="rec-meta">{e.cat}/{e.sub}{e.carbs ? ` · ${e.carbs}g` : ''}{e.duration ? ` · ${e.duration}m` : ''}</div>
              </div>
              {e.size && <span className="rec-size">{e.size}</span>}
              {e.running && <span className="rec-size run">RUN</span>}
            </button>
            {openId === e.id && (
              <div className="rec-detail">
                <div className="row">
                  <span className="lbl">Detail</span>
                  <span className="val">{e.label}{e.size ? ` · ${e.size}` : ''}{e.carbs ? ` · ${e.carbs}g` : ''}</span>
                </div>
                <div>
                  <div className="lbl" style={{marginBottom: 8}}>Posuň čas záznamu</div>
                  <div className="time-adjust">
                    <button className="tbtn" onClick={() => onAdjustTime(e.id, -10)}>−10 min</button>
                    <div className="now-time">{e.time}</div>
                    <button className="tbtn" onClick={() => onAdjustTime(e.id, +10)}>+10 min</button>
                  </div>
                </div>
                <div className="actions">
                  <button className="btn btn-ghost" onClick={() => setOpenId(null)}>Zavrieť</button>
                  <button className="btn btn-danger" onClick={() => { onDelete(e.id); setOpenId(null); }}>Zmazať</button>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div style={{height: 24}}/>
    </div>
  );
}

// ====== Camera AI ======
function CameraOverlay({ step, setStep, onConfirm, onClose }) {
  const [estimate, setEstimate] = useState(58);
  useEffect(() => {
    if (step === 'analyzing') { const t = setTimeout(() => setStep('confirm'), 1600); return () => clearTimeout(t); }
  }, [step]);
  return (
    <div className="cam-overlay">
      <div className="cam-top">
        <button className="icon-btn" onClick={onClose}>×</button>
        <div className="cam-step"><b>{step === 'capture' ? '01' : step === 'analyzing' ? '02' : '03'}</b> {step === 'capture' ? 'NASNÍMAJ' : step === 'analyzing' ? 'AI ANALYZUJE' : 'POTVRĎ'}</div>
        <span style={{width: 34}}/>
      </div>
      <div className="cam-viewport">
        {step === 'capture' && (<>
          <div className="cam-corners"><i/><i/></div>
          <div className="cam-placeholder">NAMIER NA JEDLO<br/><span style={{opacity:0.5}}>AI odhadne sacharidy</span></div>
        </>)}
        {step === 'analyzing' && (<>
          <div className="cam-photo"><span>FOTO · KULURI 60g</span></div>
          <div className="cam-analyzing"><span className="pulse-dot"/><div className="lines"><b>Rozpoznávam jedlo…</b><small>~1.6s</small></div></div>
        </>)}
        {step === 'confirm' && (<>
          <div className="cam-photo"><span>FOTO · KULURI</span></div>
          <div className="cam-confirm">
            <div className="est"><b>~{estimate}g</b><small>SACHARIDY · ODHAD</small></div>
            <div className="guess">Kuluri · porcia L<small>~280 kcal · vysoký GI</small></div>
            <div className="adjust-row">
              <button onClick={() => setEstimate(Math.max(0, estimate-10))}>−10g</button>
              <button className="on">{estimate}g</button>
              <button onClick={() => setEstimate(estimate+10)}>+10g</button>
            </div>
            <div className="cam-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setStep('capture')}>Znova</button>
              <button className="btn btn-primary" onClick={() => onConfirm({ sub: 'kuluri', label: 'Kuluri', size: 'L', carbs: estimate, cat: 'food' })}>Pridať záznam</button>
            </div>
          </div>
        </>)}
      </div>
      {step === 'capture' && (
        <div className="cam-shutter-row">
          <span style={{width: 40}}/>
          <button className="shutter" onClick={() => setStep('analyzing')}/>
          <span style={{width: 40}}/>
        </div>
      )}
      {step !== 'capture' && <div style={{height: 28}}/>}
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
  const [cameraStep, setCameraStep] = useState(null);
  const [toast, setToast] = useState(null);
  const [dayOffset, setDayOffset] = useState(0);

  const runningEvent = events.find(e => e.running);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {}
  }, [events]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(t => t === msg ? null : t), 2600); };

  const addEvent = (data) => {
    const id = Math.max(...events.map(e=>e.id), 0) + 1;
    let carbs = data.carbs;
    if (data.cat === 'food' && data.size && !carbs) {
      const item = TURBO.find(t => t.sub === data.sub);
      carbs = item?.carbsByMass?.[data.size];
    }
    const evt = { id, time: '21:53', hour: 21.88, ...data, carbs };
    setHistory(h => [...h, { kind: 'add', id }]);
    setEvents(es => [...es, evt]);
    showToast(<>Pridané <b>{evt.label}{evt.size ? ' '+evt.size : ''}</b></>);
  };

  const onLogSize = (data) => {
    addEvent({ sub: data.sub, label: data.label, cat: data.cat, size: data.size });
  };
  const onStartTimer = (item) => {
    if (runningEvent) return;
    const id = Math.max(...events.map(e=>e.id), 0) + 1;
    const evt = { id, time: '21:53', hour: 21.88, sub: item.sub, label: item.label, cat: item.cat, running: true };
    setHistory(h => [...h, { kind: 'add', id }]);
    setEvents(es => [...es, evt]);
    showToast(<><b>{item.label}</b> štart</>);
  };
  const onStopTimer = (id) => {
    setEvents(es => es.map(e => e.id === id ? { ...e, running: false, ended: true, duration: 60 } : e));
    showToast(<>Timer zastavený</>);
  };
  const onAdjustTime = (id, deltaMin) => {
    setEvents(es => es.map(e => {
      if (e.id !== id) return e;
      const newHour = Math.max(0, Math.min(23.99, e.hour + deltaMin / 60));
      const h = Math.floor(newHour);
      const m = Math.round((newHour - h) * 60);
      return { ...e, hour: newHour, time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
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

  return (
    <Phone>
      <Header dayOffset={dayOffset} setDayOffset={setDayOffset} onUndo={undo} canUndo={history.length>0}/>

      {view === 'home' && (
        <Home
          events={events}
          runningEvent={runningEvent}
          onLogSize={onLogSize}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
        />
      )}
      {view === 'records' && <Records events={events} onAdjustTime={onAdjustTime} onDelete={onDelete}/>}

      <div className="bottom-bar simple">
        <button className="fab-cam" onClick={() => setCameraStep('capture')}><Icon.Cam/></button>
        <div className="nav-pill">
          <button className={view==='home'?'on':''} onClick={() => setView('home')}>Hlavná</button>
          <button className={view==='records'?'on':''} onClick={() => setView('records')}>Záznamy</button>
        </div>
        <span style={{width: 38}}/>
      </div>

      {cameraStep && <CameraOverlay step={cameraStep} setStep={setCameraStep} onConfirm={(d) => { addEvent(d); setCameraStep(null); }} onClose={() => setCameraStep(null)}/>}

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
