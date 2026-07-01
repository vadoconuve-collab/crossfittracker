'use strict';

/* =========================================================
   STORAGE
   ========================================================= */
const DB_KEY       = 'wodlog.workouts.v1';
const MEASURE_KEY  = 'wodlog.measurements.v1';
const SETTINGS_KEY = 'wodlog.settings.v1';

const Store = {
  getWorkouts()         { try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; } catch { return []; } },
  saveWorkouts(list)    { localStorage.setItem(DB_KEY, JSON.stringify(list)); },
  getMeasurements()     { try { return JSON.parse(localStorage.getItem(MEASURE_KEY)) || []; } catch { return []; } },
  saveMeasurements(l)   { localStorage.setItem(MEASURE_KEY, JSON.stringify(l)); },
  getSettings()         { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } },
  saveSettings(obj)     { localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj)); }
};

function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

/* ---- Normalización de nombres de ejercicio (fuzzy matching) ---- */
function normalizeName(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar tildes/acentos
    .replace(/[^a-z0-9\s]/g, '')      // solo letras, números, espacios
    .replace(/\s+/g, ' ');
}

/* =========================================================
   APP STATE
   ========================================================= */
const state = {
  currentWorkoutId: null,
  draft: null,
  charts: {}
};

/* =========================================================
   TAB NAVIGATION
   ========================================================= */
const views   = document.querySelectorAll('[data-view]');
const tabBtns = document.querySelectorAll('.tab-btn');

function showView(id) {
  views.forEach(v => v.hidden = (v.id !== id));
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'view-list')         renderWorkoutList();
  if (id === 'view-measurements') renderMeasurements();
  if (id === 'view-charts')       { /* small delay so DOM is laid out before Chart.js measures canvas */ setTimeout(renderCharts, 80); }
}

tabBtns.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.tab)));

document.getElementById('todayLabel').textContent =
  new Date().toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'short' });

/* =========================================================
   SETTINGS / API KEY MODAL
   ========================================================= */
const settingsModal  = document.getElementById('settingsModal');
const inputApiKey    = document.getElementById('inputApiKey');

document.getElementById('btnOpenSettings').addEventListener('click', () => {
  const s = Store.getSettings();
  inputApiKey.value = s.openaiKey ? '••••••••' + s.openaiKey.slice(-4) : '';
  settingsModal.hidden = false;
});
document.getElementById('btnCloseSettings').addEventListener('click', () => { settingsModal.hidden = true; });
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) settingsModal.hidden = true; });

document.getElementById('btnSaveApiKey').addEventListener('click', () => {
  const val = inputApiKey.value.trim();
  if (!val || val.startsWith('••')) { settingsModal.hidden = true; return; }
  const s = Store.getSettings();
  s.openaiKey = val;
  Store.saveSettings(s);
  settingsModal.hidden = true;
  showToast('Clave de API guardada ✓');
});

document.getElementById('btnDeleteApiKey').addEventListener('click', () => {
  if (!confirm('¿Eliminar la clave de API guardada?')) return;
  const s = Store.getSettings();
  delete s.openaiKey;
  Store.saveSettings(s);
  inputApiKey.value = '';
  settingsModal.hidden = true;
  showToast('Clave eliminada');
});

function showToast(msg) {
  let t = document.getElementById('__toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '__toast';
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#232323;border:1px solid #3A3A3A;color:#F1EFE7;font-family:Oswald,sans-serif;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.04em;padding:10px 18px;border-radius:8px;z-index:200;transition:opacity 0.3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t.__timer);
  t.__timer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

/* =========================================================
   WORKOUT LIST
   ========================================================= */
function renderWorkoutList() {
  const list      = Store.getWorkouts().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const container = document.getElementById('workoutList');
  const empty     = document.getElementById('emptyWorkouts');
  const stats     = document.getElementById('listStats');
  container.innerHTML = '';

  if (list.length === 0) {
    empty.hidden = false; container.hidden = true; stats.innerHTML = ''; return;
  }
  empty.hidden = true; container.hidden = false;
  const totalCal = list.reduce((s,w) => s + (Number(w.calories)||0), 0);
  stats.innerHTML = `<span><b>${list.length}</b> WODs registrados</span><span style="margin-left:auto"><b>${totalCal}</b> kcal totales</span>`;

  list.forEach(w => {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const thumb = w.photo
      ? `<img class="workout-thumb" src="${w.photo}" alt="">`
      : `<div class="workout-thumb">🏋️</div>`;
    const exCount = (w.exercises||[]).length;
    card.innerHTML = `
      ${thumb}
      <div class="workout-info">
        <div class="workout-name">${escapeHtml(w.name||'WOD sin nombre')}</div>
        <div class="workout-meta">
          <span>${fmtDate(w.date)}</span>
          <span>${exCount} ejercicio${exCount===1?'':'s'}</span>
          ${w.totalTime ? `<span>⏱ ${escapeHtml(w.totalTime)}</span>` : ''}
          ${w.calories  ? `<span class="stat-accent">🔥 ${w.calories} kcal</span>` : ''}
          ${w.hrMax     ? `<span class="stat-good">♥ ${w.hrMax}</span>` : ''}
        </div>
      </div>`;
    card.addEventListener('click', () => openWorkout(w.id));
    container.appendChild(card);
  });
}

document.getElementById('btnNewWorkout').addEventListener('click',      () => openWorkout(null));
document.getElementById('btnNewWorkoutEmpty').addEventListener('click', () => openWorkout(null));

/* =========================================================
   WORKOUT DETAIL / EDIT
   ========================================================= */
function blankWorkout() {
  return { id:uid(), name:'', date:todayISO(), photo:null, ocrText:'',
    exercises:[], totalTime:'', calories:'', hrMax:'', hrMin:'', hrAvg:'', notes:'' };
}
function blankExercise(name='') {
  return { id:uid(), name, time:'', sets:[{weight:'',reps:'',time:''}] };
}

function openWorkout(id) {
  if (id) {
    const w = Store.getWorkouts().find(x => x.id === id);
    state.draft = JSON.parse(JSON.stringify(w));
    state.currentWorkoutId = id;
  } else {
    state.draft = blankWorkout();
    state.currentWorkoutId = null;
  }
  fillDetailForm(state.draft);
  // Reset AI panel
  document.getElementById('aiResult').hidden = true;
  document.getElementById('aiStatus').hidden = true;
  document.getElementById('aiNoKey').hidden = !!Store.getSettings().openaiKey;
  showView('view-detail');
  document.getElementById('btnDeleteWorkout').hidden = !state.currentWorkoutId;
}

function fillDetailForm(w) {
  document.getElementById('workoutName').value  = w.name      || '';
  document.getElementById('workoutDate').value  = w.date      || todayISO();
  document.getElementById('totalTime').value    = w.totalTime || '';
  document.getElementById('calories').value     = w.calories  || '';
  document.getElementById('hrMax').value        = w.hrMax     || '';
  document.getElementById('hrMin').value        = w.hrMin     || '';
  document.getElementById('hrAvg').value        = w.hrAvg     || '';
  document.getElementById('workoutNotes').value = w.notes     || '';

  const img         = document.getElementById('workoutPhotoPreview');
  const placeholder = document.getElementById('photoPlaceholder');
  const ocrBtn      = document.getElementById('btnRunOCR');
  if (w.photo) {
    img.src = w.photo; img.hidden = false; placeholder.hidden = true; ocrBtn.disabled = false;
  } else {
    img.hidden = true; placeholder.hidden = false; ocrBtn.disabled = true;
  }
  const ocrDetails = document.getElementById('ocrDetails');
  if (w.ocrText) { ocrDetails.hidden = false; document.getElementById('ocrTextArea').value = w.ocrText; }
  else           { ocrDetails.hidden = true;  document.getElementById('ocrTextArea').value = ''; }
  document.getElementById('ocrStatus').textContent = '';
  renderExerciseList();
}

document.getElementById('btnBackToList').addEventListener('click', () => showView('view-list'));

/* ---- photo upload ---- */
document.getElementById('photoDrop').addEventListener('click', () => document.getElementById('photoInput').click());
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
});

/* ---- OCR ---- */
document.getElementById('btnRunOCR').addEventListener('click', async () => {
  if (!state.draft.photo) return;
  const status = document.getElementById('ocrStatus');
  const btn    = document.getElementById('btnRunOCR');
  btn.disabled = true; status.textContent = 'Leyendo la imagen... 0%';
  try {
    const result = await Tesseract.recognize(state.draft.photo, 'spa+eng', {
      logger: m => {
        if (m.status === 'recognizing text')
          status.textContent = `Leyendo la imagen... ${Math.round(m.progress*100)}%`;
        else status.textContent = m.status;
      }
    });
    const text = result.data.text.trim();
    state.draft.ocrText = text;
    document.getElementById('ocrDetails').hidden = false;
    document.getElementById('ocrTextArea').value = text;
    status.textContent = text ? 'Listo. Revisa el texto y conviértelo en ejercicios.' : 'No se detectó texto, prueba con otra foto más clara.';
  } catch(err) {
    console.error(err);
    status.textContent = 'No se pudo leer la imagen. Inténtalo de nuevo.';
  } finally { btn.disabled = false; }
});

/* ---- OCR → ejercicios ---- */
document.getElementById('btnStructure').addEventListener('click', () => {
  const text = document.getElementById('ocrTextArea').value;
  state.draft.ocrText = text;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  if (!confirm(`Se añadirán ${lines.length} ejercicio(s) a partir del texto. ¿Continuar?`)) return;
  lines.forEach(line => state.draft.exercises.push(blankExercise(line)));
  renderExerciseList();
});

/* ---- exercises editor ---- */
function renderExerciseList() {
  const container = document.getElementById('exerciseList');
  container.innerHTML = '';
  if (state.draft.exercises.length === 0) {
    container.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;">Aún no hay ejercicios. Añádelos manualmente o léelos desde la foto.</p>`;
    return;
  }
  state.draft.exercises.forEach((ex, exIdx) => {
    const item = document.createElement('div');
    item.className = 'exercise-item';
    item.innerHTML = `
      <div class="exercise-item-top">
        <input type="text" value="${escapeHtml(ex.name)}" placeholder="Nombre del ejercicio" data-role="ex-name">
        <button class="icon-btn danger" data-role="del-ex" title="Eliminar ejercicio">✕</button>
      </div>
      <div class="set-row-labels">
        <span>#</span><span>Peso (kg)</span><span>Reps</span><span>Tiempo</span><span></span>
      </div>
      <div data-role="sets"></div>
      <div class="exercise-actions">
        <button class="add-set-btn" data-role="add-set">+ serie</button>
        <div class="exercise-time">
          <span>Tiempo ejercicio</span>
          <input type="text" value="${escapeHtml(ex.time||'')}" placeholder="mm:ss" data-role="ex-time">
        </div>
      </div>`;

    const setsContainer = item.querySelector('[data-role="sets"]');
    ex.sets.forEach((set, setIdx) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <span class="set-index">${setIdx+1}</span>
        <input type="number" step="0.5" value="${set.weight}" data-role="set-weight">
        <input type="number" value="${set.reps}" data-role="set-reps">
        <input type="text" value="${set.time}" placeholder="mm:ss" data-role="set-time">
        <button class="icon-btn danger" data-role="del-set" title="Quitar serie">✕</button>`;
      row.querySelector('[data-role="set-weight"]').addEventListener('input', e => { set.weight = e.target.value; });
      row.querySelector('[data-role="set-reps"]').addEventListener('input',  e => { set.reps   = e.target.value; });
      row.querySelector('[data-role="set-time"]').addEventListener('input',  e => { set.time   = e.target.value; });
      row.querySelector('[data-role="del-set"]').addEventListener('click', () => {
        ex.sets.splice(setIdx, 1);
        if (!ex.sets.length) ex.sets.push({weight:'',reps:'',time:''});
        renderExerciseList();
      });
      setsContainer.appendChild(row);
    });

    item.querySelector('[data-role="ex-name"]').addEventListener('input', e => { ex.name = e.target.value; });
    item.querySelector('[data-role="ex-time"]').addEventListener('input', e => { ex.time = e.target.value; });
    item.querySelector('[data-role="del-ex"]').addEventListener('click', () => {
      state.draft.exercises.splice(exIdx, 1); renderExerciseList();
    });
    item.querySelector('[data-role="add-set"]').addEventListener('click', () => {
      ex.sets.push({weight:'',reps:'',time:''}); renderExerciseList();
    });
    container.appendChild(item);
  });
}

document.getElementById('btnAddExercise').addEventListener('click', () => {
  state.draft.exercises.push(blankExercise('')); renderExerciseList();
});

/* ---- save / delete workout ---- */
document.getElementById('btnSaveWorkout').addEventListener('click', () => {
  const w     = state.draft;
  w.name      = document.getElementById('workoutName').value.trim() || 'WOD sin nombre';
  w.date      = document.getElementById('workoutDate').value || todayISO();
  w.totalTime = document.getElementById('totalTime').value.trim();
  w.calories  = document.getElementById('calories').value;
  w.hrMax     = document.getElementById('hrMax').value;
  w.hrMin     = document.getElementById('hrMin').value;
  w.hrAvg     = document.getElementById('hrAvg').value;
  w.notes     = document.getElementById('workoutNotes').value;
  w.ocrText   = document.getElementById('ocrTextArea').value;

  const list  = Store.getWorkouts();
  const idx   = list.findIndex(x => x.id === w.id);
  if (idx >= 0) list[idx] = w; else list.push(w);
  Store.saveWorkouts(list);
  state.currentWorkoutId = w.id;
  showToast('WOD guardado ✓');
  showView('view-list');
});

document.getElementById('btnDeleteWorkout').addEventListener('click', () => {
  if (!state.currentWorkoutId) return;
  if (!confirm('¿Eliminar este entrenamiento? Esta acción no se puede deshacer.')) return;
  Store.saveWorkouts(Store.getWorkouts().filter(x => x.id !== state.currentWorkoutId));
  showView('view-list');
});

/* =========================================================
   IA — ANÁLISIS CON OPENAI
   ========================================================= */
document.getElementById('btnAnalyzeAI').addEventListener('click', analyzeWorkoutWithAI);

async function analyzeWorkoutWithAI() {
  const apiKey = Store.getSettings().openaiKey;
  if (!apiKey) {
    document.getElementById('aiNoKey').hidden = false;
    return;
  }

  // Recoger datos del draft actual
  const w = state.draft;
  w.name      = document.getElementById('workoutName').value.trim() || 'WOD sin nombre';
  w.date      = document.getElementById('workoutDate').value || todayISO();
  w.totalTime = document.getElementById('totalTime').value.trim();
  w.calories  = document.getElementById('calories').value;
  w.hrMax     = document.getElementById('hrMax').value;
  w.hrMin     = document.getElementById('hrMin').value;
  w.hrAvg     = document.getElementById('hrAvg').value;
  w.notes     = document.getElementById('workoutNotes').value;

  // Últimos 10 WODs para contexto de progreso
  const history = Store.getWorkouts()
    .sort((a,b) => (b.date||'').localeCompare(a.date||''))
    .slice(0, 10)
    .map(h => {
      const exSummary = (h.exercises||[]).map(ex => {
        const sets = ex.sets.filter(s => s.weight || s.reps);
        const setStr = sets.map(s => `${s.reps||'?'}r${s.weight?'@'+s.weight+'kg':''}`).join(', ');
        return `  - ${ex.name}${setStr?' ('+setStr+')':''}`;
      }).join('\n');
      return `${h.date} — ${h.name}\n${exSummary}${h.totalTime?' | Tiempo: '+h.totalTime:''}${h.calories?' | Kcal: '+h.calories:''}`;
    }).join('\n\n');

  // Última medida corporal
  const lastMeasure = Store.getMeasurements().sort((a,b) => b.date.localeCompare(a.date))[0];
  const measureStr = lastMeasure
    ? `Peso: ${lastMeasure.weight||'?'} kg, % grasa: ${lastMeasure.bodyFat||'?'}, Cintura: ${lastMeasure.waist||'?'} cm`
    : 'Sin datos de medidas registrados.';

  // WOD actual
  const currentExSummary = (w.exercises||[]).map(ex => {
    const sets = ex.sets.filter(s => s.weight || s.reps);
    const setStr = sets.map(s => `${s.reps||'?'}r${s.weight?'@'+s.weight+'kg':''}`).join(', ');
    return `  - ${ex.name}${setStr?' ('+setStr+')':''}${ex.time?' ['+ex.time+']':''}`;
  }).join('\n');

  const prompt = `Eres un entrenador de CrossFit experto y nutricionista deportivo. Analiza este entrenamiento y da consejos personalizados en español.

ENTRENAMIENTO DE HOY (${w.date}): ${w.name}
${currentExSummary || 'Sin ejercicios registrados.'}
Tiempo total: ${w.totalTime||'no registrado'}
Calorías: ${w.calories||'no registrado'} kcal
Pulsaciones: máx ${w.hrMax||'?'} / mín ${w.hrMin||'?'} / media ${w.hrAvg||'?'} ppm
Notas: ${w.notes||'ninguna'}

ÚLTIMOS ENTRENAMIENTOS (histórico):
${history||'Sin histórico previo.'}

ESTADO FÍSICO ACTUAL:
${measureStr}

Por favor responde con estas secciones exactas (usa ### para los títulos):
### Valoración del entrenamiento de hoy
### Estado físico y progreso
### Preparación para el próximo entrenamiento
### Nutrición recomendada
### Ejercicios accesorios beneficiosos

Sé concreto, usa datos del histórico cuando los haya, y da consejos accionables. Máximo 400 palabras en total.`;

  const statusEl = document.getElementById('aiStatus');
  const resultEl = document.getElementById('aiResult');
  const noKeyEl  = document.getElementById('aiNoKey');
  const btn       = document.getElementById('btnAnalyzeAI');

  noKeyEl.hidden  = true;
  resultEl.hidden = true;
  statusEl.hidden = false;
  statusEl.textContent = '🤖 Analizando tu entrenamiento...';
  btn.disabled = true;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 700,
        messages: [{ role:'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error ${res.status}`);
    }

    const data    = await res.json();
    const text    = data.choices?.[0]?.message?.content || '';

    // Renderizar secciones con formato
    const formatted = text
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\n{2,}/g, '\n\n');

    resultEl.innerHTML = formatted;
    resultEl.hidden = false;
    statusEl.hidden = true;
  } catch(err) {
    statusEl.textContent = `❌ ${err.message}`;
    console.error('OpenAI error:', err);
  } finally {
    btn.disabled = false;
  }
}

/* =========================================================
   MEASUREMENTS
   ========================================================= */
document.getElementById('measureDate').value = todayISO();

document.getElementById('btnSaveMeasurement').addEventListener('click', () => {
  const entry = {
    id: uid(),
    date:    document.getElementById('measureDate').value || todayISO(),
    weight:  document.getElementById('measureWeight').value,
    bodyFat: document.getElementById('measureBodyFat').value,
    chest:   document.getElementById('measureChest').value,
    waist:   document.getElementById('measureWaist').value,
    hips:    document.getElementById('measureHips').value,
    arm:     document.getElementById('measureArm').value,
    thigh:   document.getElementById('measureThigh').value,
    calf:    document.getElementById('measureCalf').value
  };
  const hasAny = ['weight','bodyFat','chest','waist','hips','arm','thigh','calf']
    .some(k => entry[k] !== '' && entry[k] != null);
  if (!hasAny) { alert('Introduce al menos un dato antes de guardar.'); return; }

  const list = Store.getMeasurements(); list.push(entry); Store.saveMeasurements(list);
  ['measureWeight','measureBodyFat','measureChest','measureWaist','measureHips','measureArm','measureThigh','measureCalf']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('measureDate').value = todayISO();
  showToast('Registro guardado ✓');
  renderMeasurements();
});

function renderMeasurements() {
  const list      = Store.getMeasurements().sort((a,b) => b.date.localeCompare(a.date));
  const container = document.getElementById('measurementList');
  const empty     = document.getElementById('emptyMeasurements');
  container.innerHTML = '';
  if (!list.length) { empty.hidden = false; container.hidden = true; return; }
  empty.hidden = true; container.hidden = false;
  list.forEach(m => {
    const row = document.createElement('div');
    row.className = 'measurement-row';
    const stats = [];
    if (m.weight)  stats.push(`<b>${m.weight}</b> kg`);
    if (m.bodyFat) stats.push(`${m.bodyFat}% grasa`);
    if (m.chest)   stats.push(`pecho ${m.chest}`);
    if (m.waist)   stats.push(`cintura ${m.waist}`);
    if (m.hips)    stats.push(`cadera ${m.hips}`);
    if (m.arm)     stats.push(`brazo ${m.arm}`);
    if (m.thigh)   stats.push(`muslo ${m.thigh}`);
    if (m.calf)    stats.push(`gemelo ${m.calf}`);
    row.innerHTML = `
      <div class="m-date">${fmtDate(m.date)}</div>
      <div class="m-stats">${stats.join(' &nbsp;·&nbsp; ')||'<span style="color:var(--muted)">sin datos</span>'}</div>
      <button class="icon-btn danger" title="Eliminar">✕</button>`;
    row.querySelector('.icon-btn').addEventListener('click', () => {
      if (!confirm('¿Eliminar este registro?')) return;
      Store.saveMeasurements(Store.getMeasurements().filter(x => x.id !== m.id));
      renderMeasurements();
    });
    container.appendChild(row);
  });
}

/* =========================================================
   CHARTS  — fix: ocultar el wrap, NO el canvas
   ========================================================= */
const CHART_COLORS = ['#E63946','#5FB87A','#F1C453','#6C9BCF','#C77DFF','#FF9F1C'];

function setChartVisible(wrapId, emptyId, visible) {
  document.getElementById(wrapId).classList.toggle('hidden-chart', !visible);
  document.getElementById(emptyId).classList.toggle('hidden-chart', visible);
}

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

function chartBaseOptions(extraScales) {
  const tickStyle = { color:'#9A9A92', font:{ family:'JetBrains Mono', size:10 } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { mode:'index', intersect:false },
    plugins: {
      legend:  { labels: { color:'#F1EFE7', font:{ family:'Oswald' } } },
      tooltip: { titleFont:{ family:'JetBrains Mono' }, bodyFont:{ family:'JetBrains Mono' } }
    },
    scales: extraScales || {
      x: { ticks: tickStyle, grid:{ color:'#3A3A3A' } },
      y: { ticks: tickStyle, grid:{ color:'#3A3A3A' } }
    }
  };
}

/* ---- exercise select: agrupa por nombre normalizado ---- */
function populateExerciseSelect() {
  const select   = document.getElementById('exerciseSelect');
  const workouts = Store.getWorkouts();
  const map      = {};  // normalizedName → display label

  workouts.forEach(w => (w.exercises||[]).forEach(ex => {
    if (!ex.name || !ex.name.trim()) return;
    const norm = normalizeName(ex.name);
    // Usa la versión más larga como etiqueta visible (suele ser la más completa)
    if (!map[norm] || ex.name.trim().length > map[norm].length) map[norm] = ex.name.trim();
  }));

  const prev   = select.value;
  const sorted = Object.keys(map).sort((a,b) => map[a].localeCompare(map[b]));
  select.innerHTML = sorted.length
    ? sorted.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(map[n])}</option>`).join('')
    : '<option value="">— Sin ejercicios registrados —</option>';
  if (map[prev]) select.value = prev;
  return sorted;
}

function maxWeightInSets(sets)  {
  let max = null;
  (sets||[]).forEach(s => { const w = parseFloat(s.weight); if (!isNaN(w) && (max===null||w>max)) max=w; });
  return max;
}
function totalRepsInSets(sets) {
  return (sets||[]).reduce((s,r) => { const v=parseInt(r.reps,10); return s+(isNaN(v)?0:v); }, 0);
}

function renderExerciseChart() {
  destroyChart('exercise');
  const select       = document.getElementById('exerciseSelect');
  const exerciseNorm = select.value;

  if (!exerciseNorm) { setChartVisible('exerciseChartWrap','exerciseChartEmpty',false); return; }

  const workouts = Store.getWorkouts()
    .filter(w => (w.exercises||[]).some(ex => normalizeName(ex.name) === exerciseNorm))
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!workouts.length) { setChartVisible('exerciseChartWrap','exerciseChartEmpty',false); return; }

  const labels=[], maxWeights=[], totalReps=[];
  workouts.forEach(w => {
    const ex = w.exercises.find(e => normalizeName(e.name) === exerciseNorm);
    labels.push(fmtDate(w.date));
    maxWeights.push(maxWeightInSets(ex.sets));
    totalReps.push(totalRepsInSets(ex.sets));
  });

  setChartVisible('exerciseChartWrap','exerciseChartEmpty',true);
  const tickStyle = { color:'#9A9A92', font:{ family:'JetBrains Mono', size:10 } };
  state.charts.exercise = new Chart(document.getElementById('exerciseChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Peso máx. (kg)', data:maxWeights, borderColor:CHART_COLORS[0], backgroundColor:CHART_COLORS[0], tension:0.3, spanGaps:true, yAxisID:'y'  },
        { label:'Reps totales',   data:totalReps,  borderColor:CHART_COLORS[3], backgroundColor:CHART_COLORS[3], tension:0.3, spanGaps:true, yAxisID:'y1' }
      ]
    },
    options: chartBaseOptions({
      x:  { ticks:tickStyle, grid:{ color:'#3A3A3A' } },
      y:  { position:'left',  ticks:tickStyle, grid:{ color:'#3A3A3A' } },
      y1: { position:'right', ticks:tickStyle, grid:{ display:false } }
    })
  });
}

document.getElementById('exerciseSelect').addEventListener('change', renderExerciseChart);

function renderWeightChart() {
  destroyChart('weight');
  const data = Store.getMeasurements()
    .filter(m => m.weight !== '' && m.weight != null)
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!data.length) { setChartVisible('weightChartWrap','weightChartEmpty',false); return; }
  setChartVisible('weightChartWrap','weightChartEmpty',true);
  state.charts.weight = new Chart(document.getElementById('weightChart'), {
    type: 'line',
    data: {
      labels: data.map(m => fmtDate(m.date)),
      datasets: [{ label:'Peso (kg)', data:data.map(m => parseFloat(m.weight)), borderColor:CHART_COLORS[0], backgroundColor:CHART_COLORS[0], tension:0.3, fill:false }]
    },
    options: chartBaseOptions()
  });
}

function renderMeasuresChart() {
  destroyChart('measures');
  const all    = Store.getMeasurements().sort((a,b) => a.date.localeCompare(b.date));
  const fields = [['chest','Pecho'],['waist','Cintura'],['hips','Cadera'],['arm','Brazo'],['thigh','Muslo'],['calf','Pantorrilla']];
  const active = fields.filter(([k]) => all.some(m => m[k] !== '' && m[k] != null));

  if (!active.length) { setChartVisible('measuresChartWrap','measuresChartEmpty',false); return; }
  setChartVisible('measuresChartWrap','measuresChartEmpty',true);
  state.charts.measures = new Chart(document.getElementById('measuresChart'), {
    type: 'line',
    data: {
      labels: all.map(m => fmtDate(m.date)),
      datasets: active.map(([k,label],i) => ({
        label, spanGaps:true, fill:false, tension:0.3,
        borderColor:CHART_COLORS[i%CHART_COLORS.length], backgroundColor:CHART_COLORS[i%CHART_COLORS.length],
        data: all.map(m => (m[k]!==''&&m[k]!=null) ? parseFloat(m[k]) : null)
      }))
    },
    options: chartBaseOptions()
  });
}

function renderCharts() {
  populateExerciseSelect();
  renderExerciseChart();
  renderWeightChart();
  renderMeasuresChart();
}

/* =========================================================
   INIT
   ========================================================= */
renderWorkoutList();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW failed', e))
  );
}
