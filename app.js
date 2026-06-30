'use strict';

/* =========================================================
   STORAGE
   ========================================================= */
const DB_KEY = 'wodlog.workouts.v1';
const MEASURE_KEY = 'wodlog.measurements.v1';

const Store = {
  getWorkouts() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; }
    catch { return []; }
  },
  saveWorkouts(list) { localStorage.setItem(DB_KEY, JSON.stringify(list)); },

  getMeasurements() {
    try { return JSON.parse(localStorage.getItem(MEASURE_KEY)) || []; }
    catch { return []; }
  },
  saveMeasurements(list) { localStorage.setItem(MEASURE_KEY, JSON.stringify(list)); }
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* =========================================================
   APP STATE
   ========================================================= */
const state = {
  currentWorkoutId: null, // null => creating new
  draft: null,            // working copy of the workout being edited
  charts: {}               // Chart.js instances
};

/* =========================================================
   TAB NAVIGATION
   ========================================================= */
const views = document.querySelectorAll('[data-view]');
const tabBtns = document.querySelectorAll('.tab-btn');

function showView(id) {
  views.forEach(v => v.hidden = (v.id !== id));
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'view-list') renderWorkoutList();
  if (id === 'view-measurements') renderMeasurements();
  if (id === 'view-charts') renderCharts();
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.tab));
});

document.getElementById('todayLabel').textContent =
  new Date().toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });

/* =========================================================
   WORKOUT LIST
   ========================================================= */
function renderWorkoutList() {
  const list = Store.getWorkouts().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const container = document.getElementById('workoutList');
  const empty = document.getElementById('emptyWorkouts');
  const stats = document.getElementById('listStats');

  container.innerHTML = '';

  if (list.length === 0) {
    empty.hidden = false;
    container.hidden = true;
    stats.innerHTML = '';
    return;
  }
  empty.hidden = true;
  container.hidden = false;

  const totalCalories = list.reduce((s, w) => s + (Number(w.calories) || 0), 0);
  stats.innerHTML = `
    <span><b>${list.length}</b> WODs registrados</span>
    <span style="margin-left:auto"><b>${totalCalories}</b> kcal totales</span>
  `;

  list.forEach(w => {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const thumb = w.photo
      ? `<img class="workout-thumb" src="${w.photo}" alt="">`
      : `<div class="workout-thumb">🏋️</div>`;
    const exCount = (w.exercises || []).length;
    card.innerHTML = `
      ${thumb}
      <div class="workout-info">
        <div class="workout-name">${escapeHtml(w.name || 'WOD sin nombre')}</div>
        <div class="workout-meta">
          <span>${fmtDate(w.date)}</span>
          <span>${exCount} ejercicio${exCount === 1 ? '' : 's'}</span>
          ${w.totalTime ? `<span>⏱ ${escapeHtml(w.totalTime)}</span>` : ''}
          ${w.calories ? `<span class="stat-accent">🔥 ${w.calories} kcal</span>` : ''}
          ${w.hrMax ? `<span class="stat-good">♥ ${w.hrMax}</span>` : ''}
        </div>
      </div>
    `;
    card.addEventListener('click', () => openWorkout(w.id));
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

document.getElementById('btnNewWorkout').addEventListener('click', () => openWorkout(null));
document.getElementById('btnNewWorkoutEmpty').addEventListener('click', () => openWorkout(null));

/* =========================================================
   WORKOUT DETAIL / EDIT
   ========================================================= */
function blankWorkout() {
  return {
    id: uid(),
    name: '',
    date: todayISO(),
    photo: null,
    ocrText: '',
    exercises: [],
    totalTime: '',
    calories: '',
    hrMax: '',
    hrMin: '',
    hrAvg: '',
    notes: ''
  };
}

function blankExercise(name = '') {
  return {
    id: uid(),
    name,
    time: '',
    sets: [{ weight: '', reps: '', time: '' }]
  };
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
  showView('view-detail');
  document.getElementById('btnDeleteWorkout').hidden = !state.currentWorkoutId;
}

function fillDetailForm(w) {
  document.getElementById('workoutName').value = w.name || '';
  document.getElementById('workoutDate').value = w.date || todayISO();
  document.getElementById('totalTime').value = w.totalTime || '';
  document.getElementById('calories').value = w.calories || '';
  document.getElementById('hrMax').value = w.hrMax || '';
  document.getElementById('hrMin').value = w.hrMin || '';
  document.getElementById('hrAvg').value = w.hrAvg || '';
  document.getElementById('workoutNotes').value = w.notes || '';

  const img = document.getElementById('workoutPhotoPreview');
  const placeholder = document.getElementById('photoPlaceholder');
  const ocrBtn = document.getElementById('btnRunOCR');
  if (w.photo) {
    img.src = w.photo;
    img.hidden = false;
    placeholder.hidden = true;
    ocrBtn.disabled = false;
  } else {
    img.hidden = true;
    placeholder.hidden = false;
    ocrBtn.disabled = true;
  }

  const ocrDetails = document.getElementById('ocrDetails');
  const ocrTextArea = document.getElementById('ocrTextArea');
  if (w.ocrText) {
    ocrDetails.hidden = false;
    ocrTextArea.value = w.ocrText;
  } else {
    ocrDetails.hidden = true;
    ocrTextArea.value = '';
  }
  document.getElementById('ocrStatus').textContent = '';

  renderExerciseList();
}

document.getElementById('btnBackToList').addEventListener('click', () => showView('view-list'));

/* ---- photo upload ---- */
document.getElementById('photoDrop').addEventListener('click', () => {
  document.getElementById('photoInput').click();
});

document.getElementById('photoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.draft.photo = reader.result;
    const img = document.getElementById('workoutPhotoPreview');
    img.src = reader.result;
    img.hidden = false;
    document.getElementById('photoPlaceholder').hidden = true;
    document.getElementById('btnRunOCR').disabled = false;
  };
  reader.readAsDataURL(file);
});

/* ---- OCR with Tesseract.js ---- */
document.getElementById('btnRunOCR').addEventListener('click', async () => {
  if (!state.draft.photo) return;
  const status = document.getElementById('ocrStatus');
  const btn = document.getElementById('btnRunOCR');
  btn.disabled = true;
  status.textContent = 'Leyendo la imagen... 0%';

  try {
    const result = await Tesseract.recognize(state.draft.photo, 'spa+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          status.textContent = `Leyendo la imagen... ${Math.round(m.progress * 100)}%`;
        } else {
          status.textContent = m.status;
        }
      }
    });
    const text = result.data.text.trim();
    state.draft.ocrText = text;
    document.getElementById('ocrDetails').hidden = false;
    document.getElementById('ocrTextArea').value = text;
    status.textContent = text ? 'Listo. Revisa el texto y conviértelo en ejercicios.' : 'No se detectó texto, prueba con otra foto más clara.';
  } catch (err) {
    console.error(err);
    status.textContent = 'No se pudo leer la imagen. Inténtalo de nuevo.';
  } finally {
    btn.disabled = false;
  }
});

/* ---- turn OCR text lines into exercise entries ---- */
document.getElementById('btnStructure').addEventListener('click', () => {
  const text = document.getElementById('ocrTextArea').value;
  state.draft.ocrText = text;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return;

  if (!confirm(`Se añadirán ${lines.length} ejercicio(s) a partir del texto. ¿Continuar?`)) return;

  lines.forEach(line => {
    state.draft.exercises.push(blankExercise(line));
  });
  renderExerciseList();
});

/* ---- exercises editor ---- */
function renderExerciseList() {
  const container = document.getElementById('exerciseList');
  container.innerHTML = '';

  if (state.draft.exercises.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); font-size:0.85rem;">Aún no hay ejercicios. Añádelos manualmente o léelos desde la foto.</p>`;
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
          <input type="text" value="${escapeHtml(ex.time || '')}" placeholder="mm:ss" data-role="ex-time">
        </div>
      </div>
    `;

    const setsContainer = item.querySelector('[data-role="sets"]');
    ex.sets.forEach((set, setIdx) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <span class="set-index">${setIdx + 1}</span>
        <input type="number" step="0.5" value="${set.weight}" data-role="set-weight">
        <input type="number" value="${set.reps}" data-role="set-reps">
        <input type="text" value="${set.time}" placeholder="mm:ss" data-role="set-time">
        <button class="icon-btn danger" data-role="del-set" title="Quitar serie">✕</button>
      `;
      row.querySelector('[data-role="set-weight"]').addEventListener('input', (e) => {
        set.weight = e.target.value;
      });
      row.querySelector('[data-role="set-reps"]').addEventListener('input', (e) => {
        set.reps = e.target.value;
      });
      row.querySelector('[data-role="set-time"]').addEventListener('input', (e) => {
        set.time = e.target.value;
      });
      row.querySelector('[data-role="del-set"]').addEventListener('click', () => {
        ex.sets.splice(setIdx, 1);
        if (ex.sets.length === 0) ex.sets.push({ weight: '', reps: '', time: '' });
        renderExerciseList();
      });
      setsContainer.appendChild(row);
    });

    item.querySelector('[data-role="ex-name"]').addEventListener('input', (e) => { ex.name = e.target.value; });
    item.querySelector('[data-role="ex-time"]').addEventListener('input', (e) => { ex.time = e.target.value; });
    item.querySelector('[data-role="del-ex"]').addEventListener('click', () => {
      state.draft.exercises.splice(exIdx, 1);
      renderExerciseList();
    });
    item.querySelector('[data-role="add-set"]').addEventListener('click', () => {
      ex.sets.push({ weight: '', reps: '', time: '' });
      renderExerciseList();
    });

    container.appendChild(item);
  });
}

document.getElementById('btnAddExercise').addEventListener('click', () => {
  state.draft.exercises.push(blankExercise(''));
  renderExerciseList();
});

/* ---- save / delete workout ---- */
document.getElementById('btnSaveWorkout').addEventListener('click', () => {
  const w = state.draft;
  w.name = document.getElementById('workoutName').value.trim() || 'WOD sin nombre';
  w.date = document.getElementById('workoutDate').value || todayISO();
  w.totalTime = document.getElementById('totalTime').value.trim();
  w.calories = document.getElementById('calories').value;
  w.hrMax = document.getElementById('hrMax').value;
  w.hrMin = document.getElementById('hrMin').value;
  w.hrAvg = document.getElementById('hrAvg').value;
  w.notes = document.getElementById('workoutNotes').value;
  w.ocrText = document.getElementById('ocrTextArea').value;

  const list = Store.getWorkouts();
  const idx = list.findIndex(x => x.id === w.id);
  if (idx >= 0) list[idx] = w; else list.push(w);
  Store.saveWorkouts(list);

  state.currentWorkoutId = w.id;
  showView('view-list');
});

document.getElementById('btnDeleteWorkout').addEventListener('click', () => {
  if (!state.currentWorkoutId) return;
  if (!confirm('¿Eliminar este entrenamiento? Esta acción no se puede deshacer.')) return;
  const list = Store.getWorkouts().filter(x => x.id !== state.currentWorkoutId);
  Store.saveWorkouts(list);
  showView('view-list');
});

/* =========================================================
   MEASUREMENTS
   ========================================================= */
document.getElementById('measureDate').value = todayISO();

document.getElementById('btnSaveMeasurement').addEventListener('click', () => {
  const entry = {
    id: uid(),
    date: document.getElementById('measureDate').value || todayISO(),
    weight: document.getElementById('measureWeight').value,
    bodyFat: document.getElementById('measureBodyFat').value,
    chest: document.getElementById('measureChest').value,
    waist: document.getElementById('measureWaist').value,
    hips: document.getElementById('measureHips').value,
    arm: document.getElementById('measureArm').value,
    thigh: document.getElementById('measureThigh').value,
    calf: document.getElementById('measureCalf').value
  };

  const hasAnyValue = ['weight', 'bodyFat', 'chest', 'waist', 'hips', 'arm', 'thigh', 'calf']
    .some(k => entry[k] !== '' && entry[k] !== null);
  if (!hasAnyValue) {
    alert('Introduce al menos un dato antes de guardar.');
    return;
  }

  const list = Store.getMeasurements();
  list.push(entry);
  Store.saveMeasurements(list);

  ['measureWeight', 'measureBodyFat', 'measureChest', 'measureWaist', 'measureHips', 'measureArm', 'measureThigh', 'measureCalf']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('measureDate').value = todayISO();

  renderMeasurements();
});

function renderMeasurements() {
  const list = Store.getMeasurements().sort((a, b) => b.date.localeCompare(a.date));
  const container = document.getElementById('measurementList');
  const empty = document.getElementById('emptyMeasurements');
  container.innerHTML = '';

  if (list.length === 0) {
    empty.hidden = false;
    container.hidden = true;
    return;
  }
  empty.hidden = true;
  container.hidden = false;

  list.forEach(m => {
    const row = document.createElement('div');
    row.className = 'measurement-row';
    const stats = [];
    if (m.weight) stats.push(`<b>${m.weight}</b> kg`);
    if (m.bodyFat) stats.push(`${m.bodyFat}% grasa`);
    if (m.chest) stats.push(`pecho ${m.chest}`);
    if (m.waist) stats.push(`cintura ${m.waist}`);
    if (m.hips) stats.push(`cadera ${m.hips}`);
    if (m.arm) stats.push(`brazo ${m.arm}`);
    if (m.thigh) stats.push(`muslo ${m.thigh}`);
    if (m.calf) stats.push(`gemelo ${m.calf}`);

    row.innerHTML = `
      <div class="m-date">${fmtDate(m.date)}</div>
      <div class="m-stats">${stats.join(' &nbsp;·&nbsp; ') || '<span style="color:var(--muted)">sin datos</span>'}</div>
      <button class="icon-btn danger" title="Eliminar">✕</button>
    `;
    row.querySelector('.icon-btn').addEventListener('click', () => {
      if (!confirm('¿Eliminar este registro?')) return;
      Store.saveMeasurements(Store.getMeasurements().filter(x => x.id !== m.id));
      renderMeasurements();
    });
    container.appendChild(row);
  });
}

/* =========================================================
   CHARTS
   ========================================================= */
const CHART_COLORS = ['#E63946', '#5FB87A', '#F1C453', '#6C9BCF', '#C77DFF', '#FF9F1C'];

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#F1EFE7', font: { family: 'Oswald' } } },
      tooltip: { titleFont: { family: 'JetBrains Mono' }, bodyFont: { family: 'JetBrains Mono' } }
    },
    scales: {
      x: { ticks: { color: '#9A9A92', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#3A3A3A' } },
      y: { ticks: { color: '#9A9A92', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#3A3A3A' } }
    }
  };
}

function populateExerciseSelect() {
  const select = document.getElementById('exerciseSelect');
  const workouts = Store.getWorkouts();
  const names = new Set();
  workouts.forEach(w => (w.exercises || []).forEach(ex => {
    if (ex.name && ex.name.trim()) names.add(ex.name.trim());
  }));
  const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
  const prev = select.value;
  select.innerHTML = sorted.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (sorted.includes(prev)) select.value = prev;
  return sorted;
}

function maxWeightInSets(sets) {
  let max = null;
  (sets || []).forEach(s => {
    const w = parseFloat(s.weight);
    if (!isNaN(w) && (max === null || w > max)) max = w;
  });
  return max;
}
function totalRepsInSets(sets) {
  return (sets || []).reduce((sum, s) => {
    const r = parseInt(s.reps, 10);
    return sum + (isNaN(r) ? 0 : r);
  }, 0);
}

function renderExerciseChart() {
  const select = document.getElementById('exerciseSelect');
  const exerciseName = select.value;
  const canvas = document.getElementById('exerciseChart');
  const emptyMsg = document.getElementById('exerciseChartEmpty');
  destroyChart('exercise');

  if (!exerciseName) {
    canvas.hidden = true;
    emptyMsg.hidden = false;
    return;
  }

  const workouts = Store.getWorkouts()
    .filter(w => (w.exercises || []).some(ex => ex.name.trim() === exerciseName))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (workouts.length === 0) {
    canvas.hidden = true;
    emptyMsg.hidden = false;
    return;
  }

  const labels = [];
  const maxWeights = [];
  const totalReps = [];

  workouts.forEach(w => {
    const ex = w.exercises.find(e => e.name.trim() === exerciseName);
    labels.push(fmtDate(w.date));
    maxWeights.push(maxWeightInSets(ex.sets));
    totalReps.push(totalRepsInSets(ex.sets));
  });

  canvas.hidden = false;
  emptyMsg.hidden = true;

  state.charts.exercise = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Peso máx. (kg)',
          data: maxWeights,
          borderColor: CHART_COLORS[0],
          backgroundColor: CHART_COLORS[0],
          tension: 0.25,
          spanGaps: true,
          yAxisID: 'y'
        },
        {
          label: 'Reps totales',
          data: totalReps,
          borderColor: CHART_COLORS[3],
          backgroundColor: CHART_COLORS[3],
          tension: 0.25,
          spanGaps: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      ...chartBaseOptions(),
      scales: {
        x: chartBaseOptions().scales.x,
        y: { position: 'left', ticks: { color: '#9A9A92', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#3A3A3A' } },
        y1: { position: 'right', ticks: { color: '#9A9A92', font: { family: 'JetBrains Mono', size: 10 } }, grid: { display: false } }
      }
    }
  });
}

document.getElementById('exerciseSelect').addEventListener('change', renderExerciseChart);

function renderWeightChart() {
  const canvas = document.getElementById('weightChart');
  const emptyMsg = document.getElementById('weightChartEmpty');
  destroyChart('weight');

  const data = Store.getMeasurements()
    .filter(m => m.weight !== '' && m.weight !== null && m.weight !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (data.length === 0) {
    canvas.hidden = true;
    emptyMsg.hidden = false;
    return;
  }
  canvas.hidden = false;
  emptyMsg.hidden = true;

  state.charts.weight = new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map(m => fmtDate(m.date)),
      datasets: [{
        label: 'Peso (kg)',
        data: data.map(m => parseFloat(m.weight)),
        borderColor: CHART_COLORS[0],
        backgroundColor: CHART_COLORS[0],
        tension: 0.25,
        fill: false
      }]
    },
    options: chartBaseOptions()
  });
}

function renderMeasuresChart() {
  const canvas = document.getElementById('measuresChart');
  const emptyMsg = document.getElementById('measuresChartEmpty');
  destroyChart('measures');

  const all = Store.getMeasurements().sort((a, b) => a.date.localeCompare(b.date));
  const fields = [
    ['chest', 'Pecho'], ['waist', 'Cintura'], ['hips', 'Cadera'],
    ['arm', 'Brazo'], ['thigh', 'Muslo'], ['calf', 'Pantorrilla']
  ];
  const activeFields = fields.filter(([key]) => all.some(m => m[key] !== '' && m[key] !== null && m[key] !== undefined));

  if (activeFields.length === 0) {
    canvas.hidden = true;
    emptyMsg.hidden = false;
    return;
  }
  canvas.hidden = false;
  emptyMsg.hidden = true;

  const labels = all.map(m => fmtDate(m.date));
  const datasets = activeFields.map(([key, label], i) => ({
    label,
    data: all.map(m => (m[key] !== '' && m[key] !== null && m[key] !== undefined) ? parseFloat(m[key]) : null),
    borderColor: CHART_COLORS[i % CHART_COLORS.length],
    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
    tension: 0.25,
    spanGaps: true,
    fill: false
  }));

  state.charts.measures = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  });
}
