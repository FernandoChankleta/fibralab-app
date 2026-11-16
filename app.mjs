import { LENGTH_KM, END_S, DT_S, Z, T, CHANNELS, SCENARIOS, baseline, trainPosition, evaluate, sample, detectionsAt, isCandidate, otdrTrace, otdrEvidence } from './model.mjs';

const $ = (id) => document.getElementById(id);
const keys = Object.keys(CHANNELS);
const state = { scenario: 'excavation', time: 180, z: 4.5, speed: 120, playing: false, heatChannel: 'vib', tab: 'map' };
let heatCache = null;
let firstDetectionCache = null;
let lastFrame = 0;
const fmt = (x, digits = 2) => Number(x).toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const clampUI = (x, min, max) => Math.max(min, Math.min(max, x));
const nearestZ = (x) => Z[clampUI(Math.round(x / 0.05), 0, Z.length - 1)];
const nearestT = (x) => T[clampUI(Math.round(x / DT_S), 0, T.length - 1)];
const scenario = () => SCENARIOS[state.scenario];
const eventPosition = () => state.scenario === 'train' ? trainPosition(state.time, state.speed) : scenario().center;
const currentDetections = () => detectionsAt(state.time, state.scenario, state.speed);
const mainDetection = (items) => items.find((item) => item.kind === 'alert') || items[0] || null;

const physicalText = {
  normal: 'La fibra permanece en su referencia. Las pequeñas oscilaciones simulan ruido y cambios ambientales normales.',
  train: 'La carga móvil excita la vía y genera una respuesta DAS que avanza con el tren; la deformación es transitoria.',
  excavation: 'La obra introduce vibración repetida y esfuerzo local en el terreno que rodea el cable.',
  slope: 'La ladera transmite deformación lenta a una sección relativamente amplia de la fibra.',
  mechanical: 'Una sección del cable se deforma progresivamente; en el modelo también aumenta su pérdida óptica.',
  thermal: 'La fuente de calor eleva la temperatura medida cerca del túnel. Parte de la respuesta de deformación puede ser aparente.',
  loss: 'Una curvatura o defecto provoca mayor pérdida de luz en una posición localizada.',
  cut: 'La fibra se rompe antes del splitter. El retorno Rayleigh desaparece detrás del corte y el evento puede producir un pico reflectivo.',
  seismic: 'Una perturbación vibratoria se propaga por varios kilómetros. Su extensión espacial la distingue de una fuente puntual.',
};

function setup() {
  $('scenarioChoices').innerHTML = Object.entries(SCENARIOS).map(([id, item]) => `<button class="scenario-choice ${id === state.scenario ? 'active' : ''}" data-scenario="${id}" type="button" aria-pressed="${id === state.scenario}"><b aria-hidden="true">${item.icon}</b><span>${item.label}</span></button>`).join('');
  document.querySelectorAll('.scenario-choice').forEach((button) => button.addEventListener('click', () => selectScenario(button.dataset.scenario)));
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  $('time').addEventListener('input', (event) => { state.time = Number(event.target.value); render(); });
  $('trainSpeed').addEventListener('input', (event) => { state.speed = Number(event.target.value); heatCache = null; firstDetectionCache = null; render(); });
  $('heatChannel').addEventListener('change', (event) => { state.heatChannel = event.target.value; heatCache = null; render(); });
  $('play').addEventListener('click', togglePlay);
  $('goDetection').addEventListener('click', () => selectTab('detection'));
  $('fiberMap').addEventListener('click', (event) => {
    const svg = event.currentTarget, point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
    const compact = svg.dataset.compact === 'true';
    state.z = nearestZ((transformed.x - (compact ? 42 : 70)) / (compact ? 456 : 860) * LENGTH_KM);
    render();
  });
  $('heatmap').addEventListener('click', (event) => {
    const canvas = event.currentTarget, box = canvas._box, rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return;
    state.time = nearestT((x - box.x) / box.w * END_S);
    state.z = nearestZ((1 - (y - box.y) / box.h) * LENGTH_KM);
    $('time').value = state.time; render();
  });
  $('scoreProfile').addEventListener('click', (event) => {
    const canvas = event.currentTarget, box = canvas._box, rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left;
    if (x < box.x || x > box.x + box.w) return;
    state.z = nearestZ((x - box.x) / box.w * LENGTH_KM); render();
  });
  window.addEventListener('resize', render);
  render();
}

function selectScenario(id) {
  if (!SCENARIOS[id]) return;
  state.scenario = id; state.time = SCENARIOS[id].demoTime;
  state.z = SCENARIOS[id].center ?? (id === 'train' ? trainPosition(state.time, state.speed) : 4);
  state.heatChannel = SCENARIOS[id].focus;
  $('time').value = state.time; $('heatChannel').value = state.heatChannel;
  heatCache = null; firstDetectionCache = null;
  document.querySelectorAll('.scenario-choice').forEach((button) => { const selected = button.dataset.scenario === id; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected); });
  render();
}

function selectTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((button) => { const selected = button.dataset.tab === tab; button.classList.toggle('active', selected); button.setAttribute('aria-selected', selected); });
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.hidden = panel.id !== tab);
  render();
}

function togglePlay() {
  state.playing = !state.playing;
  $('play').innerHTML = state.playing ? '❚❚ <span>Pausar</span>' : '▶ <span>Reproducir</span>';
  $('play').setAttribute('aria-label', state.playing ? 'Pausar simulación' : 'Reproducir simulación');
  if (state.playing) { lastFrame = 0; requestAnimationFrame(playFrame); }
}

function playFrame(now) {
  if (!state.playing) return;
  if (!lastFrame || now - lastFrame >= 110) {
    state.time = state.time >= END_S ? 0 : state.time + DT_S;
    $('time').value = state.time; lastFrame = now; render();
  }
  requestAnimationFrame(playFrame);
}

function routePoint(z, compact = false) {
  const x = (compact ? 42 : 70) + z / LENGTH_KM * (compact ? 456 : 860);
  const y = (compact ? 130 : 168) + (compact ? 10 : 15) * Math.sin(z * 1.22) - (compact ? 3 : 5) * Math.cos(z * 2.7);
  return { x, y };
}

function routePath(start = 0, end = LENGTH_KM, offset = 0, compact = false) {
  const points = [];
  for (let z = start; z <= end + 0.001; z += 0.05) { const p = routePoint(z, compact); points.push(`${points.length ? 'L' : 'M'}${p.x.toFixed(1)} ${(p.y + offset).toFixed(1)}`); }
  if (points.length < 2) { const p = routePoint(end, compact); points.push(`L${p.x.toFixed(1)} ${(p.y + offset).toFixed(1)}`); }
  return points.join(' ');
}

function drawMap(detections) {
  const item = scenario(), markerZ = eventPosition(), detection = mainDetection(detections);
  const compact = $('fiberMap').getBoundingClientRect().width < 500;
  $('fiberMap').setAttribute('viewBox', compact ? '0 0 540 270' : '0 0 1000 330');
  $('fiberMap').dataset.compact = String(compact);
  const sites = compact ? [0, 2, 4, 6, 8].map((z) => ({ z, label: z === 8 ? 'Splitter' : `${z} km` })) : [{ z: 0, label: 'OLT' }, { z: 2, label: 'Puente' }, { z: 3.2, label: 'Ladera' }, { z: 4.5, label: 'Obra' }, { z: 6.1, label: 'Túnel' }, { z: 8, label: 'Splitter' }];
  const siteMarks = sites.map(({ z, label }) => { const p = routePoint(z, compact); return compact
    ? `<line x1="${p.x}" y1="${p.y + 6}" x2="${p.x}" y2="${p.y + 26}" stroke="#617e95"/><circle cx="${p.x}" cy="${p.y}" r="3" fill="#c2e6ed"/><text x="${p.x}" y="${p.y + 50}" text-anchor="middle" fill="#a6c1cd" font-size="19">${label}</text>`
    : `<line x1="${p.x}" y1="${p.y + 7}" x2="${p.x}" y2="${p.y + 30}" stroke="#617e95"/><circle cx="${p.x}" cy="${p.y}" r="3" fill="#c2e6ed"/><text x="${p.x}" y="${p.y + 48}" text-anchor="middle" fill="#9bb6c8" font-size="15">${label}</text><text x="${p.x}" y="${p.y + 65}" text-anchor="middle" fill="#6d8ba4" font-size="12">${fmt(z, z === 3.2 || z === 4.5 || z === 6.1 ? 1 : 0)} km</text>`; }).join('');
  const detectionPath = detection ? `<path d="${routePath(detection.start, detection.end, 0, compact)}" stroke="${detection.kind === 'operational' ? '#65d9d7' : '#f9b278'}" stroke-width="${compact ? 11 : 15}" stroke-linecap="round" fill="none" opacity=".42"/>` : '';
  const cutPath = state.scenario === 'cut' && state.time >= 134
    ? `<path d="${routePath(6.65,LENGTH_KM,0,compact)}" stroke="#102438" stroke-width="9" fill="none"/><path d="${routePath(6.65,LENGTH_KM,0,compact)}" stroke="#7893a5" stroke-width="4" stroke-dasharray="8 6" fill="none"/>` : '';
  const p = markerZ === null ? null : routePoint(markerZ, compact);
  const active = item.start !== null && state.time >= item.start && (item.kind !== 'transient' || state.time <= 190) && p;
  const sourceMark = p ? `<circle cx="${p.x}" cy="${p.y}" r="${active ? 27 : 21}" fill="${active ? '#f3a96d' : '#5a7a8c'}" opacity=".13"/><circle cx="${p.x}" cy="${p.y}" r="${compact ? 9 : 12}" fill="${active ? '#f3ae75' : '#8ba8b5'}" stroke="#f2f7f7" stroke-width="2"/><text x="${p.x}" y="${p.y - (compact ? 32 : 39)}" text-anchor="middle" fill="#eaf8fb" font-size="${compact ? 22 : 17}" font-weight="700">${item.label}</text>` : '';
  const selected = routePoint(state.z, compact);
  const ground = compact ? 'M0 210 Q100 180 180 222 T360 205 T540 218 L540 270 L0 270Z' : 'M0 230 Q150 170 280 245 T560 225 T1000 235 L1000 330 L0 330Z';
  $('fiberMap').innerHTML = `<defs><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#193b4e"/><stop offset="1" stop-color="#112a3b"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="4"/></filter></defs><rect x="1" y="1" width="${compact ? 538 : 998}" height="${compact ? 268 : 328}" rx="13" fill="#102438" stroke="#2f5164"/><path d="${ground}" fill="url(#land)" opacity=".8"/><path d="${routePath(0,LENGTH_KM,compact ? -31 : -42,compact)}" stroke="#758ca0" stroke-width="4" stroke-dasharray="11 8" fill="none" opacity=".8"/><path d="${routePath(0,LENGTH_KM,0,compact)}" stroke="#3ae1da" stroke-width="14" fill="none" opacity=".22" filter="url(#glow)"/><path d="${routePath(0,LENGTH_KM,0,compact)}" stroke="#5be0d8" stroke-width="5" fill="none"/>${cutPath}${detectionPath}${siteMarks}${sourceMark}<circle cx="${selected.x}" cy="${selected.y}" r="5" fill="#0e2333" stroke="#f5fbfd" stroke-width="2"/><text x="${compact ? 42 : 70}" y="35" fill="#94b6c5" font-size="${compact ? 18 : 13}" font-weight="700" letter-spacing="2">CORREDOR DE 8 KM</text><text x="${compact ? 498 : 930}" y="35" fill="#88aabe" font-size="${compact ? 17 : 12}" text-anchor="end">t = ${state.time} s</text>`;
  $('mapTime').textContent = `t = ${state.time} s`;
}

function graphicSymbol(id) {
  switch (id) {
    case 'train': return '<line x1="195" y1="68" x2="487" y2="68" stroke="#809caf" stroke-width="4"/><rect x="265" y="27" width="150" height="39" rx="8" fill="#7ecfdf"/><rect x="283" y="36" width="31" height="16" rx="2" fill="#174258"/><rect x="322" y="36" width="31" height="16" rx="2" fill="#174258"/><rect x="361" y="36" width="31" height="16" rx="2" fill="#174258"/><circle cx="295" cy="70" r="7" fill="#b7d1db"/><circle cx="385" cy="70" r="7" fill="#b7d1db"/><path d="M310 80q30 15 0 30M370 80q-30 15 0 30" fill="none" stroke="#6fd3d1" stroke-width="3"/>';
    case 'excavation': return '<path d="M250 79 L410 79 L390 104 L275 104Z" fill="#7a5442"/><rect x="277" y="32" width="77" height="38" rx="7" fill="#e9b66c"/><circle cx="291" cy="76" r="11" fill="#364f60"/><circle cx="344" cy="76" r="11" fill="#364f60"/><path d="M352 40 L410 56 L429 86" fill="none" stroke="#e9b66c" stroke-width="8" stroke-linecap="round"/><path d="M420 83 L441 99 L423 99" fill="#dfaf72"/><path d="M310 99q30 23 0 39M370 99q-30 23 0 39" stroke="#f0b77c" stroke-width="3" fill="none"/>';
    case 'slope': return '<path d="M160 89 L275 18 L382 89Z" fill="#3d705f"/><path d="M296 89 L420 37 L515 89Z" fill="#326652"/><path d="M322 35l30 18-12 13" fill="none" stroke="#f5ba81" stroke-width="6"/><path d="M275 107l40 18m-25-5l40 18" stroke="#e2bb88" stroke-width="4"/>';
    case 'mechanical': return '<path d="M307 45l31 25-22 10 30 27" stroke="#f7a77f" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M376 45l-20 20 24 12-25 27" stroke="#d68180" stroke-width="5" fill="none"/><circle cx="340" cy="125" r="27" fill="#b64e6a" opacity=".17"/>';
    case 'thermal': return '<path d="M337 24c-14 26-39 29-39 60 0 21 17 34 41 34s42-15 42-38c0-23-19-36-24-50 1 18-13 24-20 32-7-11-4-23 0-38Z" fill="#f59c5c"/><path d="M342 66c-6 12-19 18-19 30 0 11 8 17 18 17 11 0 19-8 19-18 0-12-11-18-18-29Z" fill="#ffe2a4"/><path d="M250 78q-14-15 0-30M430 78q14-15 0-30" fill="none" stroke="#f6b46b" stroke-width="3"/>';
    case 'loss': return '<path d="M250 98 C300 98 310 83 340 70 C375 55 393 72 367 91 C341 109 347 95 415 95" fill="none" stroke="#7fddda" stroke-width="8"/><path d="M330 45l20 25 19-25" fill="none" stroke="#f3a477" stroke-width="5"/><circle cx="352" cy="84" r="32" fill="#ef9c71" opacity=".15"/>';
    case 'cut': return '<path d="M277 64l49 43m0-43l-49 43M353 64l49 43m0-43l-49 43" stroke="#f3a477" stroke-width="7" stroke-linecap="round"/><path d="M338 115v35" stroke="#f3a477" stroke-width="4" stroke-dasharray="6 5"/>';
    case 'seismic': return '<path d="M160 79q35-40 70 0t70 0t70 0t70 0t70 0" fill="none" stroke="#f1ae78" stroke-width="5"/><circle cx="340" cy="100" r="28" fill="none" stroke="#f1ae78" stroke-width="3" opacity=".8"/><circle cx="340" cy="100" r="48" fill="none" stroke="#f1ae78" stroke-width="2" opacity=".4"/>';
    default: return '<path d="M250 86 Q340 65 430 86" fill="none" stroke="#75d9ba" stroke-width="5"/><circle cx="340" cy="80" r="14" fill="#4aca9c"/>';
  }
}

function drawGraphic() {
  const item = scenario(), active = item.start === null || state.time >= item.start;
  $('eventGraphic').innerHTML = `<defs><linearGradient id="soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#244657"/><stop offset="1" stop-color="#183447"/></linearGradient></defs><rect x="0" y="92" width="680" height="108" rx="10" fill="url(#soil)"/><path d="M0 92h680" stroke="#658575" stroke-width="3"/><path d="M28 149 H308 Q340 151 372 149 H652" fill="none" stroke="#55ded6" stroke-width="7"/><circle cx="340" cy="149" r="14" fill="#49d8cf" opacity=".27"/><text x="28" y="184" fill="#8fb2bc" font-size="13">FIBRA ÓPTICA BAJO EL TERRENO</text><g opacity="${active ? 1 : .36}">${graphicSymbol(state.scenario)}</g><path d="M340 113v21" stroke="${active ? '#f4ae79' : '#68889d'}" stroke-width="2" stroke-dasharray="5 4"/>`;
  $('physicalExplanation').textContent = physicalText[state.scenario];
  $('cutawayLocation').textContent = item.center === null ? (state.scenario === 'train' ? `Km ${fmt(eventPosition() ?? 0)}` : 'Fibra sana') : `Km ${fmt(item.center)}`;
}

function renderEvent(detections) {
  const item = scenario(), detection = mainDetection(detections);
  const started = item.start !== null && state.time >= item.start;
  const ended = (item.kind === 'transient' && state.time > 190) || (item.kind === 'moving' && eventPosition() === null && state.time > 20);
  $('eventTitle').textContent = item.label;
  $('eventIcon').textContent = item.icon;
  $('eventDescription').textContent = item.summary;
  $('eventExpected').textContent = item.expected;
  $('eventStart').textContent = item.start === null ? '—' : `${item.start} s`;
  $('eventPosition').textContent = eventPosition() === null ? (item.kind === 'moving' ? 'En movimiento' : 'Toda la línea') : `Km ${fmt(eventPosition())}`;
  $('eventKind').textContent = ({ baseline: 'Referencia', moving: 'Móvil', local: 'Local', gradual: 'Gradual', transient: 'Extenso' })[item.kind];
  $('eventState').textContent = item.start === null ? 'Sin perturbación' : ended ? 'Evento finalizado' : started ? 'Fenómeno activo' : `Comienza a los ${item.start} s`;
  $('eventState').style.background = started && !ended ? '#245b4f' : '#263d50';
  $('eventState').style.color = started && !ended ? '#a8f4ce' : '#9cb1c3';

  let title, detail;
  if (detection) {
    title = detection.type;
    detail = detection.kind === 'operational'
      ? `Patrón móvil detectado cerca del km ${fmt(detection.z)}. Velocidad inferida: ${Math.round(detection.speed)} km/h. Se clasifica como tránsito.`
      : detection.type === 'Corte de fibra'
        ? `El retorno OTDR termina cerca del km ${fmt(detection.z)}, antes del splitter. La zona posterior queda sin observación.`
        : `Alerta ${detection.severity.toLowerCase()} entre los km ${fmt(detection.start)} y ${fmt(detection.end)}. La señal superó el umbral durante al menos 12 s.`;
  } else if (item.kind === 'baseline') { title = 'Sin evento'; detail = 'Las cuatro señales permanecen próximas a sus referencias.'; }
  else if (ended) { title = 'Evento terminado'; detail = 'La perturbación ya pasó. Avanza o retrocede en el tiempo para revisar su detección.'; }
  else if (!started) { title = 'Aún no inicia'; detail = `El fenómeno comienza a los ${item.start} s. Recorre la línea de tiempo para verlo aparecer.`; }
  else { title = 'Señal en observación'; detail = 'El fenómeno ya afecta a la fibra, pero la condición de detección aún no se cumple de forma suficiente.'; }
  $('detectionHeadline').textContent = title;
  $('detectionDetail').textContent = detail;
  $('detectionLamp').className = `lamp${detection ? (detection.kind === 'operational' ? ' info' : ' on') : ''}`;
  const z = detection?.z ?? eventPosition() ?? state.z;
  const point = evaluate(z, state.time, state.scenario, state.speed);
  $('miniSignals').innerHTML = keys.map((key) => `<div class="mini-signal"><strong style="color:${CHANNELS[key].color}">${CHANNELS[key].short}</strong><span>d = ${fmt(point.norm[key])}</span><i><em style="width:${Math.round(point.norm[key] * 100)}%;background:${CHANNELS[key].color}"></em></i></div>`).join('');
}

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function line(ctx, points, color, width = 2, dash = []) {
  ctx.save(); ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
  points.forEach((point, i) => i ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1])); ctx.stroke(); ctx.restore();
}

function axes(ctx, box, xMax, yMax, xUnit, yUnit, xTicks = 4, yTicks = 2) {
  ctx.save(); ctx.font = '10px Segoe UI, Arial'; ctx.fillStyle = '#8ca8ba'; ctx.strokeStyle = '#304b5e'; ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i++) { const y = box.y + box.h - i / yTicks * box.h; ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(fmt(i / yTicks * yMax, yMax <= 1 ? 1 : 0), box.x - 5, y + 3); }
  for (let i = 0; i <= xTicks; i++) { const x = box.x + i / xTicks * box.w; ctx.textAlign = i === 0 ? 'left' : i === xTicks ? 'right' : 'center'; ctx.fillText(fmt(i / xTicks * xMax, xMax < 10 ? 1 : 0), x, box.y + box.h + 14); }
  ctx.textAlign = 'right'; ctx.fillText(xUnit, box.x + box.w, box.y + box.h + 27);
  if (yUnit) { ctx.save(); ctx.translate(10, box.y + box.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(yUnit, 0, 0); ctx.restore(); }
  ctx.restore();
}

function heatColor(v) {
  const p = clampUI(v, 0, 1), colors = [[18, 42, 67], [24, 82, 112], [32, 160, 169], [248, 172, 100]];
  const scaled = p * 3, i = Math.min(2, Math.floor(scaled)), f = scaled - i;
  return colors[i].map((c, n) => Math.round(c + (colors[i + 1][n] - c) * f));
}

function getHeatImage() {
  const cacheKey = `${state.scenario}:${state.speed}:${state.heatChannel}`;
  if (heatCache?.key === cacheKey) return heatCache.canvas;
  const canvas = document.createElement('canvas'); canvas.width = T.length; canvas.height = Z.length;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(canvas.width, canvas.height);
  T.forEach((t, ti) => Z.forEach((z, zi) => {
    const result = evaluate(z, t, state.scenario, state.speed);
    const value = state.heatChannel === 'score' ? result.score / 0.5 : result.norm[state.heatChannel];
    const color = result.observable ? heatColor(value) : [29, 36, 47], offset = ((Z.length - 1 - zi) * T.length + ti) * 4;
    image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = 255;
  }));
  ctx.putImageData(image, 0, 0); heatCache = { key: cacheKey, canvas }; return canvas;
}

function drawHeat() {
  const canvas = $('heatmap'), { ctx, w, h } = canvasContext(canvas), box = { x: 38, y: 7, w: w - 52, h: h - 45 };
  ctx.drawImage(getHeatImage(), box.x, box.y, box.w, box.h);
  axes(ctx, box, END_S, LENGTH_KM, 's', 'km', 4, 4);
  const x = box.x + state.time / END_S * box.w, y = box.y + box.h * (1 - state.z / LENGTH_KM);
  line(ctx, [[x, box.y], [x, box.y + box.h]], '#f0f8f9', 1.5, [5, 4]);
  ctx.strokeStyle = '#effafa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
  canvas._box = box;
  $('heatTitle').textContent = state.heatChannel === 'score' ? 'Índice D(z,t)' : `${CHANNELS[state.heatChannel].label} · ${CHANNELS[state.heatChannel].short}`;
}

function drawProfile() {
  const canvas = $('scoreProfile'), { ctx, w, h } = canvasContext(canvas), box = { x: 36, y: 7, w: w - 49, h: h - 39 };
  axes(ctx, box, LENGTH_KM, 1, 'km', 'D', 4, 2);
  const results = Z.map((z) => evaluate(z, state.time, state.scenario, state.speed));
  const values = results.map((result) => result.score);
  const pts = values.map((v, i) => [box.x + i / (Z.length - 1) * box.w, box.y + box.h * (1 - v)]);
  const visibleCount = results.findIndex((result) => !result.observable);
  if (visibleCount >= 0) {
    const x = pts[visibleCount][0];
    ctx.fillStyle = '#29303a99'; ctx.fillRect(x, box.y, box.x + box.w - x, box.h);
    ctx.fillStyle = '#a3b4bf'; ctx.font = '10px Segoe UI, Arial'; ctx.fillText('Sin retorno', x + 6, box.y + 14);
  }
  line(ctx, visibleCount >= 0 ? pts.slice(0, visibleCount) : pts, '#62ddd5', 2.5);
  const ix = clampUI(Math.round(state.z / 0.05), 0, Z.length - 1), p = pts[ix];
  if (results[ix].observable) {
    line(ctx, [[p[0], box.y], [p[0], box.y + box.h]], '#bfd4dc', 1, [4, 4]);
    ctx.fillStyle = '#f1fbfb'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill();
  }
  $('maxScore').textContent = fmt(Math.max(...values)); canvas._box = box;
}

function drawOtdr() {
  const canvas = $('otdrTrace'), { ctx, w, h } = canvasContext(canvas);
  const box = { x: 42, y: 12, w: w - 57, h: h - 45 };
  const trace = otdrTrace(state.time, state.scenario);
  const yMin = -27, yMax = 7;
  const map = (point, key) => [box.x + point.z / LENGTH_KM * box.w,
    box.y + (yMax - point[key]) / (yMax - yMin) * box.h];
  ctx.save(); ctx.font = '10px Segoe UI, Arial'; ctx.fillStyle = '#8ca8ba'; ctx.strokeStyle = '#304b5e';
  for (let i = 0; i <= 4; i++) {
    const y = box.y + i / 4 * box.h;
    line(ctx, [[box.x, y], [box.x + box.w, y]], '#304b5e', 1);
    ctx.textAlign = 'right'; ctx.fillText(fmt(yMax - i / 4 * (yMax - yMin), 0), box.x - 6, y + 3);
    const x = box.x + i / 4 * box.w;
    ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
    ctx.fillText(`${i * 2} km`, x, box.y + box.h + 14);
  }
  line(ctx, trace.map((point) => map(point, 'reference')), '#80a8c0', 2, [5, 4]);
  line(ctx, trace.map((point) => map(point, 'measured')), '#69dfd8', 2.5);
  const finding = otdrEvidence(state.time, state.scenario);
  if (finding.kind !== 'normal') {
    const x = box.x + finding.z / LENGTH_KM * box.w;
    line(ctx, [[x, box.y], [x, box.y + box.h]], '#f6b277', 1.5, [4, 4]);
  }
  ctx.fillStyle = '#80a8c0'; ctx.fillRect(box.x + 2, box.y + 5, 14, 2);
  ctx.fillStyle = '#a9c0ce'; ctx.textAlign = 'left'; ctx.fillText('Referencia', box.x + 21, box.y + 9);
  ctx.fillStyle = '#69dfd8'; ctx.fillRect(box.x + 108, box.y + 5, 14, 2);
  ctx.fillStyle = '#bdece9'; ctx.fillText('Medición', box.x + 127, box.y + 9);
  ctx.restore();
  $('otdrFinding').textContent = finding.kind === 'cut' ? `Fin de traza ≈ km ${fmt(finding.z)}`
    : finding.kind === 'loss' ? `Pérdida ≈ ${fmt(finding.lossDb)} dB` : 'Sin cambio óptico';
}

function drawTrend() {
  const { ctx, w, h } = canvasContext($('trend')), box = { x: 34, y: 7, w: w - 47, h: h - 39 };
  axes(ctx, box, END_S, 1, 's', 'D', 4, 2);
  const results = T.map((t) => evaluate(state.z, t, state.scenario, state.speed));
  const values = results.map((result) => result.score);
  const pts = values.map((v, i) => [box.x + i / (T.length - 1) * box.w, box.y + box.h * (1 - v)]);
  const visibleCount = results.findIndex((result) => !result.observable);
  if (visibleCount >= 0) {
    const x = pts[visibleCount][0];
    ctx.fillStyle = '#29303a99'; ctx.fillRect(x, box.y, box.x + box.w - x, box.h);
  }
  line(ctx, visibleCount >= 0 ? pts.slice(0, visibleCount) : pts, '#b4a6f5', 2);
  const ix = clampUI(Math.round(state.time / DT_S), 0, T.length - 1), p = pts[ix];
  if (results[ix].observable) {
    line(ctx, [[p[0], box.y], [p[0], box.y + box.h]], '#bfd4dc', 1, [4, 4]);
    ctx.fillStyle = '#e1d8ff'; ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2); ctx.fill();
  }
  const past = Math.max(0, ix - 15), slope = (values[ix] - values[past]) / Math.max(2, T[ix] - T[past]) * 60;
  $('trendTitle').textContent = `Km ${fmt(state.z)} · D(z,t)`;
  $('trendSlope').textContent = results[ix].observable ? `${slope >= 0 ? '+' : ''}${fmt(slope)} /min` : 'Sin datos';
}

function renderChannelCards() {
  const point = evaluate(state.z, state.time, state.scenario, state.speed);
  $('selectedLocation').textContent = `Km ${fmt(state.z)}`;
  if (!point.observable) {
    $('channelGrid').innerHTML = '<div class="unobservable">Sin retorno observable tras el corte. Las mediciones distribuidas de esta zona no se interpretan.</div>';
    return;
  }
  $('channelGrid').innerHTML = keys.map((key) => {
    const config = CHANNELS[key], digits = key === 'alpha' || key === 'vib' ? 3 : 1;
    return `<article class="card channel-card"><div class="channel-name"><span><i style="background:${config.color}"></i>${config.label}</span><span>${config.short}</span></div><strong>${fmt(point.value[key], digits)} <small>${config.unit}</small></strong><div class="ref">Referencia ${fmt(point.ref[key], digits)} · d = ${fmt(point.norm[key])}</div><div class="channel-bar"><span style="width:${Math.round(point.norm[key] * 100)}%;background:${config.color}"></span></div></article>`;
  }).join('');
}

function firstDetection() {
  const key = `${state.scenario}:${state.speed}`;
  if (firstDetectionCache?.key === key) return firstDetectionCache.result;
  const first = T.find((t) => detectionsAt(t, state.scenario, state.speed).length > 0) ?? null;
  firstDetectionCache = { key, result: first }; return first;
}

function renderDetection(detections) {
  const item = scenario(), current = mainDetection(detections), first = firstDetection();
  const started = item.start !== null && state.time >= item.start;
  const past = first !== null && state.time > first;
  $('decisionTitle').textContent = current ? current.type : item.kind === 'baseline' ? 'Referencia normal' : past ? 'Evento ya finalizado' : started ? 'Aún en observación' : 'Antes del inicio';
  $('decisionText').textContent = current ? (current.kind === 'operational'
    ? `La cresta de vibración se desplazó de forma coherente hasta el km ${fmt(current.z)}. El sistema la informa como tránsito móvil.`
    : current.type === 'Corte de fibra' ? `La traza de retrodispersión cae al piso de ruido cerca del km ${fmt(current.z)}. Se informa una interrupción en la fibra de alimentación.`
    : `Se encontró una desviación persistente entre los km ${fmt(current.start)} y ${fmt(current.end)}. Tipo sugerido: ${current.type.toLowerCase()}.`)
    : item.kind === 'baseline' ? 'No hay perturbaciones programadas y el detector permanece sin activarse.'
      : started ? 'El fenómeno puede estar comenzando, decayendo o por debajo de la regla de detección en este instante.'
        : `El fenómeno se programa desde t = ${item.start} s.`;
  const position = current?.z ?? eventPosition() ?? state.z;
  const point = evaluate(position, state.time, state.scenario, state.speed);
  const maxNorm = Math.max(...Object.values(point.norm));
  const candidate = isCandidate(point);
  const movement = current?.kind === 'operational';
  $('evidenceSteps').innerHTML = [
    ['1 · CAMBIO', `${fmt(maxNorm)} / 1`, `Canal dominante: ${CHANNELS[keys.reduce((a, b) => point.norm[a] > point.norm[b] ? a : b)].label}.`],
    ['2 · CONDICIÓN', movement ? '16 s de movimiento' : current?.type === 'Corte de fibra' ? 'Fin de traza' : current ? '≥ 12 s' : candidate ? 'En formación' : 'Sin umbral', movement ? 'Cresta DAS coherente.' : current?.type === 'Corte de fibra' ? 'Retorno posterior bajo el piso observable.' : 'Mismo segmento en seis muestras.'],
    ['3 · SALIDA', current ? current.severity : 'Sin reporte', current ? `Km ${fmt(current.z)} · ${current.type}.` : 'No se emite alerta en este instante.'],
  ].map(([label, value, detail]) => `<div class="evidence-step"><b>${label}</b><strong>${value}</strong><span>${detail}</span></div>`).join('');
  $('firstDetection').textContent = `Primera detección: ${first === null ? '—' : `${first} s`}`;
  const startPct = item.start === null ? 0 : item.start / END_S * 100;
  const finish = item.kind === 'moving' ? Math.min(END_S, 20 + LENGTH_KM / state.speed * 3600) : item.kind === 'transient' ? 190 : END_S;
  const finishPct = finish / END_S * 100, nowPct = state.time / END_S * 100;
  $('eventTimeline').innerHTML = `<div class="timeline-track"></div>${item.start !== null ? `<div class="timeline-active" style="left:${startPct}%;width:${finishPct - startPct}%"></div><div class="timeline-marker" style="left:${startPct}%"></div><span class="timeline-label" style="left:${startPct}%">Inicio ${item.start} s</span>` : ''}${first !== null ? `<div class="timeline-marker" style="left:${first / END_S * 100}%;background:#69ded5"></div><span class="timeline-label" style="left:${first / END_S * 100}%">Detectado ${first} s</span>` : ''}<div class="timeline-now" style="left:${nowPct}%"></div><span class="timeline-label" style="left:${nowPct}%">Ahora ${state.time} s</span>`;
  const contribution = evaluate(state.z, state.time, state.scenario, state.speed);
  $('contributionTitle').textContent = `Aportes en km ${fmt(state.z)}`;
  $('contributionBars').innerHTML = contribution.observable
    ? keys.map((key) => { const c = CHANNELS[key], weighted = contribution.norm[key] * c.weight; return `<div class="contribution-row"><div class="contribution-head"><span>${c.label}</span><strong>${fmt(weighted)} = ${fmt(contribution.norm[key])} × ${fmt(c.weight)}</strong></div><div class="contribution-track"><div class="contribution-fill" style="width:${Math.round(contribution.norm[key] * 100)}%;background:${c.color}"></div></div></div>`; }).join('')
    : '<div class="unobservable">Sin retorno observable en esta posición.</div>';
  $('pointScore').textContent = contribution.observable ? fmt(contribution.score) : '—';
  $('ruleText').textContent = 'Regla fija: D ≥ 0,30 o algún dᵢ ≥ 0,60 durante 12 s. El corte se reconoce por fin abrupto de la traza OTDR; el tren por desplazamiento coherente de DAS.';
}

function render() {
  $('timeValue').textContent = `${state.time} s`;
  $('trainSpeedValue').textContent = `${state.speed} km/h`;
  $('speedWrap').hidden = state.scenario !== 'train';
  const detections = currentDetections();
  if (state.tab === 'map') { drawMap(detections); drawGraphic(); renderEvent(detections); }
  if (state.tab === 'signals') { drawHeat(); drawProfile(); drawTrend(); drawOtdr(); renderChannelCards(); }
  if (state.tab === 'detection') renderDetection(detections);
}

setup();
