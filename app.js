'use strict';

/* ═══════════════════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════════════════ */
const DB_KEY      = 'wodlog.workouts.v1';
const MEASURE_KEY = 'wodlog.measurements.v1';

const Store = {
  getWorkouts()       { try { return JSON.parse(localStorage.getItem(DB_KEY))      || []; } catch { return []; } },
  saveWorkouts(l)     { localStorage.setItem(DB_KEY,      JSON.stringify(l)); },
  getMeasurements()   { try { return JSON.parse(localStorage.getItem(MEASURE_KEY)) || []; } catch { return []; } },
  saveMeasurements(l) { localStorage.setItem(MEASURE_KEY, JSON.stringify(l)); }
};

function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function todayISO() { return new Date().toISOString().slice(0,10); }
function fmtDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ── Fuzzy name matching: quita tildes, espacios extra, mayúsculas ── */
function normName(str) {
  return (str || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const state = { currentId: null, draft: null };

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════ */
const views   = document.querySelectorAll('[data-view]');
const tabBtns = document.querySelectorAll('.tab-btn');

function showView(id) {
  views.forEach(v => { v.hidden = (v.id !== id); });
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'view-list')         renderWorkoutList();
  if (id === 'view-measurements') renderMeasurements();
  if (id === 'view-charts')       renderCharts();
}

tabBtns.forEach(b => b.addEventListener('click', () => showView(b.dataset.tab)));

document.getElementById('todayLabel').textContent =
  new Date().toLocaleDateString('es-ES', {weekday:'short', day:'2-digit', month:'short'});

/* ── Toast helper ── */
function toast(msg) {
  let el = document.getElementById('__toast');
  if (!el) { el = document.createElement('div'); el.id = '__toast'; document.body.appendChild(el); }
  el.textContent = msg; el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2400);
}

/* ═══════════════════════════════════════════════════════════
   WORKOUT LIST
═══════════════════════════════════════════════════════════ */
function renderWorkoutList() {
  const list  = Store.getWorkouts().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const cont  = document.getElementById('workoutList');
  const empty = document.getElementById('emptyWorkouts');
  const stats = document.getElementById('listStats');
  cont.innerHTML = '';

  if (!list.length) {
    empty.hidden = false; cont.hidden = true; stats.innerHTML = ''; return;
  }
  empty.hidden = true; cont.hidden = false;
  const kcal = list.reduce((s,w) => s + (Number(w.calories)||0), 0);
  stats.innerHTML = `<span><b>${list.length}</b> WODs</span><span style="margin-left:auto"><b>${kcal}</b> kcal totales</span>`;

  list.forEach(w => {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const thumb = w.photo
      ? `<img class="workout-thumb" src="${w.photo}" alt="">`
      : `<div class="workout-thumb">🏋️</div>`;
    const n = (w.exercises||[]).length;
    card.innerHTML = `${thumb}
      <div class="workout-info">
        <div class="workout-name">${escHtml(w.name||'WOD sin nombre')}</div>
        <div class="workout-meta">
          <span>${fmtDate(w.date)}</span>
          <span>${n} ejercicio${n===1?'':'s'}</span>
          ${w.totalTime ? `<span>⏱ ${escHtml(w.totalTime)}</span>` : ''}
          ${w.calories  ? `<span class="stat-accent">🔥 ${w.calories} kcal</span>` : ''}
          ${w.hrMax     ? `<span class="stat-good">♥ ${w.hrMax}</span>` : ''}
        </div>
      </div>`;
    card.addEventListener('click', () => openWorkout(w.id));
    cont.appendChild(card);
  });
}

document.getElementById('btnNewWorkout').addEventListener('click',      () => openWorkout(null));
document.getElementById('btnNewWorkoutEmpty').addEventListener('click', () => openWorkout(null));

/* ═══════════════════════════════════════════════════════════
   WORKOUT DETAIL
═══════════════════════════════════════════════════════════ */
function blankWorkout() {
  return {id:uid(), name:'', date:todayISO(), photo:null, ocrText:'',
          exercises:[], totalTime:'', calories:'', hrMax:'', hrMin:'', hrAvg:'', notes:''};
}
function blankEx(name='') {
  return {id:uid(), name, time:'', sets:[{weight:'',reps:'',time:''}]};
}

function openWorkout(id) {
  if (id) {
    const w = Store.getWorkouts().find(x => x.id === id);
    if (!w) return;
    state.draft = JSON.parse(JSON.stringify(w));
    state.currentId = id;
  } else {
    state.draft = blankWorkout();
    state.currentId = null;
  }
  fillForm();
  showView('view-detail');
  document.getElementById('btnDeleteWorkout').hidden = !state.currentId;
  document.getElementById('aiToast').hidden = true;
}

function fillForm() {
  const w = state.draft;
  document.getElementById('workoutName').value  = w.name      || '';
  document.getElementById('workoutDate').value  = w.date      || todayISO();
  document.getElementById('totalTime').value    = w.totalTime || '';
  document.getElementById('calories').value     = w.calories  || '';
  document.getElementById('hrMax').value        = w.hrMax     || '';
  document.getElementById('hrMin').value        = w.hrMin     || '';
  document.getElementById('hrAvg').value        = w.hrAvg     || '';
  document.getElementById('workoutNotes').value = w.notes     || '';

  const img = document.getElementById('workoutPhotoPreview');
  if (w.photo) {
    img.src = w.photo; img.hidden = false;
    document.getElementById('photoPlaceholder').hidden = true;
    document.getElementById('btnRunOCR').disabled = false;
  } else {
    img.hidden = true;
    document.getElementById('photoPlaceholder').hidden = false;
    document.getElementById('btnRunOCR').disabled = true;
  }
  if (w.ocrText) {
    document.getElementById('ocrDetails').hidden = false;
    document.getElementById('ocrTextArea').value = w.ocrText;
  } else {
    document.getElementById('ocrDetails').hidden = true;
    document.getElementById('ocrTextArea').value = '';
  }
  document.getElementById('ocrStatus').textContent = '';
  renderExList();
}

document.getElementById('btnBackToList').addEventListener('click', () => showView('view-list'));

/* ── Photo ── */
document.getElementById('photoDrop').addEventListener('click', () =>
  document.getElementById('photoInput').click());

document.getElementById('photoInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.draft.photo = reader.result;
    const img = document.getElementById('workoutPhotoPreview');
    img.src = reader.result; img.hidden = false;
    document.getElementById('photoPlaceholder').hidden = true;
    document.getElementById('btnRunOCR').disabled = false;
  };
  reader.readAsDataURL(file);
  e.target.value = ''; // reset so same file can be selected again
});

/* ── OCR ── */
document.getElementById('btnRunOCR').addEventListener('click', async () => {
  if (!state.draft.photo) return;
  const statusEl = document.getElementById('ocrStatus');
  const btn      = document.getElementById('btnRunOCR');
  btn.disabled = true; statusEl.textContent = 'Leyendo imagen… 0%';
  try {
    const result = await Tesseract.recognize(state.draft.photo, 'spa+eng', {
      logger: m => {
        if (m.status === 'recognizing text')
          statusEl.textContent = `Leyendo imagen… ${Math.round(m.progress*100)}%`;
        else statusEl.textContent = m.status;
      }
    });
    const text = result.data.text.trim();
    state.draft.ocrText = text;
    document.getElementById('ocrDetails').hidden = false;
    document.getElementById('ocrTextArea').value = text;
    statusEl.textContent = text
      ? '✓ Texto leído. Revísalo y conviértelo en ejercicios.'
      : 'No se detectó texto claro. Prueba con otra foto.';
  } catch(err) {
    statusEl.textContent = 'Error al leer la imagen.';
    console.error(err);
  } finally { btn.disabled = false; }
});

document.getElementById('btnStructure').addEventListener('click', () => {
  const text  = document.getElementById('ocrTextArea').value;
  state.draft.ocrText = text;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  if (!confirm(`Añadir ${lines.length} ejercicio(s) desde el texto leído?`)) return;
  lines.forEach(l => state.draft.exercises.push(blankEx(l)));
  renderExList();
});

/* ── Exercises editor ── */
function renderExList() {
  const cont = document.getElementById('exerciseList');
  cont.innerHTML = '';
  if (!state.draft.exercises.length) {
    cont.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Aún no hay ejercicios. Añádelos aquí o léelos desde la foto.</p>`;
    return;
  }
  state.draft.exercises.forEach((ex, ei) => {
    const item = document.createElement('div');
    item.className = 'exercise-item';
    item.innerHTML = `
      <div class="exercise-item-top">
        <input type="text" value="${escHtml(ex.name)}" placeholder="Nombre del ejercicio" data-r="name">
        <button class="icon-btn danger" data-r="del">✕</button>
      </div>
      <div class="set-row-labels"><span>#</span><span>Peso(kg)</span><span>Reps</span><span>Tiempo</span><span></span></div>
      <div data-r="sets"></div>
      <div class="exercise-actions">
        <button class="add-set-btn" data-r="addset">+ serie</button>
        <div class="exercise-time">
          <span>Tiempo ejercicio</span>
          <input type="text" value="${escHtml(ex.time||'')}" placeholder="mm:ss" data-r="time">
        </div>
      </div>`;
    const setsDiv = item.querySelector('[data-r="sets"]');
    ex.sets.forEach((set, si) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <span class="set-index">${si+1}</span>
        <input type="number" step="0.5" value="${escHtml(set.weight)}" placeholder="0" data-r="w">
        <input type="number" value="${escHtml(set.reps)}" placeholder="0" data-r="r">
        <input type="text" value="${escHtml(set.time)}" placeholder="mm:ss" data-r="t">
        <button class="icon-btn danger" data-r="delset">✕</button>`;
      row.querySelector('[data-r="w"]').oninput   = e => { set.weight = e.target.value; };
      row.querySelector('[data-r="r"]').oninput   = e => { set.reps   = e.target.value; };
      row.querySelector('[data-r="t"]').oninput   = e => { set.time   = e.target.value; };
      row.querySelector('[data-r="delset"]').onclick = () => {
        ex.sets.splice(si,1);
        if (!ex.sets.length) ex.sets.push({weight:'',reps:'',time:''});
        renderExList();
      };
      setsDiv.appendChild(row);
    });
    item.querySelector('[data-r="name"]').oninput  = e => { ex.name = e.target.value; };
    item.querySelector('[data-r="time"]').oninput  = e => { ex.time = e.target.value; };
    item.querySelector('[data-r="del"]').onclick   = () => { state.draft.exercises.splice(ei,1); renderExList(); };
    item.querySelector('[data-r="addset"]').onclick = () => { ex.sets.push({weight:'',reps:'',time:''}); renderExList(); };
    cont.appendChild(item);
  });
}

document.getElementById('btnAddExercise').addEventListener('click', () => {
  state.draft.exercises.push(blankEx()); renderExList();
});

/* ── Save / Delete ── */
function readForm() {
  const w      = state.draft;
  w.name       = document.getElementById('workoutName').value.trim() || 'WOD sin nombre';
  w.date       = document.getElementById('workoutDate').value || todayISO();
  w.totalTime  = document.getElementById('totalTime').value.trim();
  w.calories   = document.getElementById('calories').value;
  w.hrMax      = document.getElementById('hrMax').value;
  w.hrMin      = document.getElementById('hrMin').value;
  w.hrAvg      = document.getElementById('hrAvg').value;
  w.notes      = document.getElementById('workoutNotes').value;
  w.ocrText    = document.getElementById('ocrTextArea').value;
  return w;
}

document.getElementById('btnSaveWorkout').addEventListener('click', () => {
  const w    = readForm();
  const list = Store.getWorkouts();
  const idx  = list.findIndex(x => x.id === w.id);
  if (idx >= 0) list[idx] = w; else list.push(w);
  Store.saveWorkouts(list);
  state.currentId = w.id;
  toast('WOD guardado ✓');
  showView('view-list');
});

document.getElementById('btnDeleteWorkout').addEventListener('click', () => {
  if (!state.currentId) return;
  if (!confirm('¿Eliminar este WOD? No se puede deshacer.')) return;
  Store.saveWorkouts(Store.getWorkouts().filter(x => x.id !== state.currentId));
  showView('view-list');
});

/* ═══════════════════════════════════════════════════════════
   CHATGPT INTEGRATION  (sin API Key: copia prompt + abre web)
═══════════════════════════════════════════════════════════ */
document.getElementById('btnAskChatGPT').addEventListener('click', async () => {
  const w = readForm();

  /* ── Historial reciente ── */
  const history = Store.getWorkouts()
    .filter(x => x.id !== w.id)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''))
    .slice(0, 8)
    .map(h => {
      const exs = (h.exercises||[]).map(ex => {
        const sets = ex.sets.filter(s => s.weight||s.reps)
          .map(s => `${s.reps||'?'}rep${s.weight?' @'+s.weight+'kg':''}`)
          .join(', ');
        return `  • ${ex.name}${sets?' ('+sets+')':''}`;
      }).join('\n');
      return `${h.date}  ${h.name}\n${exs||'  (sin detalle)'}${h.totalTime?' | '+h.totalTime:''}${h.calories?' | '+h.calories+' kcal':''}`;
    }).join('\n\n') || '(sin historial previo)';

  /* ── WOD actual ── */
  const exsNow = (w.exercises||[]).map(ex => {
    const sets = ex.sets.filter(s => s.weight||s.reps)
      .map(s => `${s.reps||'?'}rep${s.weight?' @'+s.weight+'kg':''}`)
      .join(', ');
    return `  • ${ex.name}${sets?' ('+sets+')':''}${ex.time?' ['+ex.time+']':''}`;
  }).join('\n') || '  (sin ejercicios)';

  /* ── Última medida ── */
  const lastM = Store.getMeasurements().sort((a,b) => b.date.localeCompare(a.date))[0];
  const medidas = lastM
    ? `Peso ${lastM.weight||'?'}kg, grasa ${lastM.bodyFat||'?'}%, cintura ${lastM.waist||'?'}cm, cadera ${lastM.hips||'?'}cm`
    : 'Sin datos registrados.';

  const prompt = `Eres mi entrenador personal de CrossFit y nutricionista deportivo. Aquí tienes mis datos:

━━ ENTRENAMIENTO DE HOY (${w.date}) ━━
WOD: ${w.name}
${exsNow}
Tiempo total: ${w.totalTime||'no registrado'}
Calorías: ${w.calories||'no registrado'} kcal
Frecuencia cardíaca: máx ${w.hrMax||'?'} / mín ${w.hrMin||'?'} / media ${w.hrAvg||'?'} ppm
Notas: ${w.notes||'ninguna'}

━━ ÚLTIMOS ENTRENAMIENTOS ━━
${history}

━━ MEDIDAS CORPORALES ━━
${medidas}

Por favor dame:
1. Valoración del entrenamiento de hoy
2. Cómo veo mi progreso físico
3. Consejos para prepararme para el próximo entrenamiento
4. Nutrición recomendada (preentrenamiento y recuperación)
5. Ejercicios accesorios que me beneficiarían

Responde en español, sé concreto y usa mis datos reales.`;

  const toastEl = document.getElementById('aiToast');

  /* Intentar Web Share API (móvil nativo) */
  if (navigator.share) {
    try {
      await navigator.share({ title: `Análisis WOD — ${w.name}`, text: prompt });
      return;
    } catch(e) { /* usuario canceló o no compatible */ }
  }

  /* Fallback: copiar al portapapeles y abrir ChatGPT */
  try {
    await navigator.clipboard.writeText(prompt);
    window.open('https://chat.openai.com/', '_blank');
    toastEl.textContent = '✓ Prompt copiado al portapapeles.\nPégalo en ChatGPT (Ctrl+V / ⌘V) y pulsa enviar.';
    toastEl.hidden = false;
  } catch(err) {
    /* Si el clipboard falla (HTTP sin HTTPS), mostramos el texto para que copie manualmente */
    toastEl.textContent = 'No se pudo copiar automáticamente.\nCopia este texto manualmente:\n\n' + prompt;
    toastEl.hidden = false;
  }
});

/* ═══════════════════════════════════════════════════════════
   MEASUREMENTS
═══════════════════════════════════════════════════════════ */
document.getElementById('measureDate').value = todayISO();

document.getElementById('btnSaveMeasurement').addEventListener('click', () => {
  const entry = {
    id:      uid(),
    date:    document.getElementById('measureDate').value    || todayISO(),
    weight:  document.getElementById('measureWeight').value,
    bodyFat: document.getElementById('measureBodyFat').value,
    chest:   document.getElementById('measureChest').value,
    waist:   document.getElementById('measureWaist').value,
    hips:    document.getElementById('measureHips').value,
    arm:     document.getElementById('measureArm').value,
    thigh:   document.getElementById('measureThigh').value,
    calf:    document.getElementById('measureCalf').value
  };
  const hasData = ['weight','bodyFat','chest','waist','hips','arm','thigh','calf']
    .some(k => entry[k] !== '' && entry[k] != null);
  if (!hasData) { alert('Introduce al menos un dato antes de guardar.'); return; }
  const list = Store.getMeasurements(); list.push(entry); Store.saveMeasurements(list);
  ['measureWeight','measureBodyFat','measureChest','measureWaist','measureHips','measureArm','measureThigh','measureCalf']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('measureDate').value = todayISO();
  toast('Registro guardado ✓');
  renderMeasurements();
});

function renderMeasurements() {
  const list  = Store.getMeasurements().sort((a,b) => b.date.localeCompare(a.date));
  const cont  = document.getElementById('measurementList');
  const empty = document.getElementById('emptyMeasurements');
  cont.innerHTML = '';
  if (!list.length) { empty.hidden=false; cont.hidden=true; return; }
  empty.hidden=true; cont.hidden=false;
  list.forEach(m => {
    const row = document.createElement('div');
    row.className = 'measurement-row';
    const st = [];
    if (m.weight)  st.push(`<b>${m.weight}</b>kg`);
    if (m.bodyFat) st.push(`${m.bodyFat}% grasa`);
    if (m.chest)   st.push(`pecho ${m.chest}`);
    if (m.waist)   st.push(`cintura ${m.waist}`);
    if (m.hips)    st.push(`cadera ${m.hips}`);
    if (m.arm)     st.push(`brazo ${m.arm}`);
    if (m.thigh)   st.push(`muslo ${m.thigh}`);
    if (m.calf)    st.push(`gemelo ${m.calf}`);
    row.innerHTML = `
      <div class="m-date">${fmtDate(m.date)}</div>
      <div class="m-stats">${st.join(' · ')||'<span style="opacity:.5">sin datos</span>'}</div>
      <button class="icon-btn danger">✕</button>`;
    row.querySelector('.icon-btn').onclick = () => {
      if (!confirm('¿Eliminar este registro?')) return;
      Store.saveMeasurements(Store.getMeasurements().filter(x => x.id !== m.id));
      renderMeasurements();
    };
    cont.appendChild(row);
  });
}

/* ═══════════════════════════════════════════════════════════
   CHARTS — 100% SVG, sin dependencias externas
═══════════════════════════════════════════════════════════ */
const COLORS = ['#E63946','#5FB87A','#F1C453','#6C9BCF','#C77DFF','#FF9F1C'];

/*
  drawChart({ containerId, labels, left: [{label, data, color}], right?: [{label, data, color}] })
  - left  → Y axis izquierdo
  - right → Y axis derecho (opcional, para escala distinta)
*/
function drawChart({ containerId, labels, left=[], right=[] }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const W  = Math.max(container.offsetWidth || 320, 280);
  const H  = 190;
  const PL = right.length ? 42 : 42;   // padding left
  const PR = right.length ? 42 : 12;   // padding right
  const PT = 12;
  const PB = 44;                        // room for X labels + legend
  const CW = W - PL - PR;
  const CH = H - PT - PB;
  const n  = labels.length;

  if (n === 0) { container.innerHTML = `<p class="chart-empty">Sin datos suficientes todavía.</p>`; return; }

  /* scale helpers */
  function scaleY(datasets, h, padT) {
    const vals = datasets.flatMap(d => d.data.filter(v => v!=null && !isNaN(v)));
    if (!vals.length) return () => padT + h/2;
    const mn = Math.min(...vals); const mx = Math.max(...vals);
    const rng = mx - mn || 1;
    return v => padT + h - ((v - mn) / rng) * h;
  }
  function scaleX(i) { return PL + (n===1 ? CW/2 : (i/(n-1))*CW); }

  const yL  = scaleY(left,  CH, PT);
  const yR  = scaleY(right, CH, PT);

  /* grid lines & Y axis labels */
  function yAxisLabels(datasets, scaleF, anchor, color) {
    const vals = datasets.flatMap(d => d.data.filter(v => v!=null && !isNaN(v)));
    if (!vals.length) return '';
    const mn = Math.min(...vals); const mx = Math.max(...vals);
    const rng = mx - mn || 1;
    let s = '';
    for (let i=0; i<=4; i++) {
      const val = mn + (rng/4)*i;
      const y   = scaleF(val);
      s += `<text x="${anchor}" y="${y+4}" text-anchor="${anchor===PL-4?'end':'start'}"
             fill="${color}" font-size="9" font-family="JetBrains Mono,monospace">${val.toFixed(val<10?1:0)}</text>`;
    }
    return s;
  }

  /* grid horizontal lines */
  let gridSvg = '';
  for (let i=0; i<=4; i++) {
    const y = PT + (CH/4)*i;
    gridSvg += `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#3A3A3A" stroke-width="1"/>`;
  }

  /* X axis labels (max 7) */
  let xLabels = '';
  const step = Math.max(1, Math.floor(n/7));
  for (let i=0; i<n; i+=step) {
    xLabels += `<text x="${scaleX(i)}" y="${H-PB+16}" text-anchor="middle"
                  fill="#9A9A92" font-size="9" font-family="JetBrains Mono,monospace">${labels[i]}</text>`;
  }

  /* draw a dataset as path + dots */
  function datasetSvg(ds, scaleFn) {
    const pts = ds.data.map((v,i) => ({x:scaleX(i), y:(v!=null&&!isNaN(v))?scaleFn(v):null}));
    let path='', circle='';
    let drawing=false;
    pts.forEach(p => {
      if (p.y!=null) {
        path += drawing ? ` L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        drawing=true;
        circle += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"
                    fill="${ds.color}" stroke="#1A1A1A" stroke-width="1.5"/>`;
      } else { drawing=false; }
    });
    return `<path d="${path}" fill="none" stroke="${ds.color}" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
            ${circle}`;
  }

  let datasetsSvg = '';
  left.forEach(ds  => { datasetsSvg += datasetSvg(ds, yL); });
  right.forEach(ds => { datasetsSvg += datasetSvg(ds, yR); });

  /* legend */
  const allDs = [...left, ...right];
  let legendX = PL; let legendSvg = '';
  allDs.forEach(ds => {
    legendSvg += `<circle cx="${legendX+4}" cy="${H-6}" r="4" fill="${ds.color}"/>
      <text x="${legendX+12}" y="${H-2}" fill="#F1EFE7" font-size="9" font-family="Oswald,sans-serif">${escHtml(ds.label)}</text>`;
    legendX += Math.max(ds.label.length*6 + 20, 80);
  });

  const leftAxisLabels  = yAxisLabels(left,  yL, PL-4, '#9A9A92');
  const rightAxisLabels = right.length ? yAxisLabels(right, yR, W-PR+4, COLORS[3]) : '';

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
      ${gridSvg}
      ${leftAxisLabels}
      ${rightAxisLabels}
      ${datasetsSvg}
      ${xLabels}
      ${legendSvg}
    </svg>`;
}

/* ── Fuzzy exercise select ── */
function populateExerciseSelect() {
  const select   = document.getElementById('exerciseSelect');
  const workouts = Store.getWorkouts();
  const map = {}; // normalizedName → displayLabel

  workouts.forEach(w => (w.exercises||[]).forEach(ex => {
    if (!ex.name||!ex.name.trim()) return;
    const norm = normName(ex.name);
    if (!map[norm] || ex.name.trim().length > map[norm].length) map[norm] = ex.name.trim();
  }));

  const prev   = select.value;
  const sorted = Object.keys(map).sort((a,b) => map[a].localeCompare(map[b],'es'));

  if (!sorted.length) {
    select.innerHTML = '<option value="">— Sin ejercicios registrados —</option>'; return;
  }
  select.innerHTML = sorted.map(n => `<option value="${escHtml(n)}">${escHtml(map[n])}</option>`).join('');
  if (map[prev]) select.value = prev;
  return sorted;
}

function maxWeightInSets(sets) {
  let mx=null;
  (sets||[]).forEach(s => { const v=parseFloat(s.weight); if(!isNaN(v)&&(mx===null||v>mx)) mx=v; });
  return mx;
}
function totalRepsInSets(sets) {
  return (sets||[]).reduce((sum,s) => { const v=parseInt(s.reps,10); return sum+(isNaN(v)?0:v); }, 0);
}

function renderCharts() {
  populateExerciseSelect();
  renderExerciseChart();
  renderWeightChart();
  renderMeasuresChart();
}

function renderExerciseChart() {
  const norm = document.getElementById('exerciseSelect').value;
  const area = document.getElementById('exerciseChartArea');
  if (!norm) { area.innerHTML = '<p class="chart-empty">Elige un ejercicio para ver su evolución.</p>'; return; }

  const workouts = Store.getWorkouts()
    .filter(w => (w.exercises||[]).some(ex => normName(ex.name) === norm))
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!workouts.length) { area.innerHTML = '<p class="chart-empty">No hay datos para este ejercicio todavía.</p>'; return; }

  const labels=[], weights=[], reps=[];
  workouts.forEach(w => {
    const ex = w.exercises.find(e => normName(e.name) === norm);
    labels.push(fmtDate(w.date));
    weights.push(maxWeightInSets(ex.sets));
    reps.push(totalRepsInSets(ex.sets));
  });

  drawChart({
    containerId: 'exerciseChartArea',
    labels,
    left:  [{label:'Peso máx. (kg)', data:weights, color:COLORS[0]}],
    right: [{label:'Reps totales',   data:reps,    color:COLORS[3]}]
  });
}

document.getElementById('exerciseSelect').addEventListener('change', renderExerciseChart);

function renderWeightChart() {
  const data = Store.getMeasurements()
    .filter(m => m.weight!==''&&m.weight!=null)
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!data.length) {
    document.getElementById('weightChartArea').innerHTML = '<p class="chart-empty">Añade registros en la pestaña Medidas para ver tu evolución.</p>'; return;
  }
  drawChart({
    containerId: 'weightChartArea',
    labels: data.map(m => fmtDate(m.date)),
    left:   [{label:'Peso (kg)', data:data.map(m => parseFloat(m.weight)), color:COLORS[0]}]
  });
}

function renderMeasuresChart() {
  const all    = Store.getMeasurements().sort((a,b) => a.date.localeCompare(b.date));
  const fields = [['chest','Pecho'],['waist','Cintura'],['hips','Cadera'],['arm','Brazo'],['thigh','Muslo'],['calf','Gemelo']];
  const active = fields.filter(([k]) => all.some(m => m[k]!==''&&m[k]!=null));

  if (!active.length) {
    document.getElementById('measuresChartArea').innerHTML = '<p class="chart-empty">Añade registros en la pestaña Medidas para ver tu evolución.</p>'; return;
  }
  drawChart({
    containerId: 'measuresChartArea',
    labels: all.map(m => fmtDate(m.date)),
    left:   active.map(([k,label],i) => ({
      label, color:COLORS[i%COLORS.length],
      data: all.map(m => (m[k]!==''&&m[k]!=null)?parseFloat(m[k]):null)
    }))
  });
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
renderWorkoutList();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e))
  );
}
