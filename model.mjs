// Datos sintéticos para explorar sensado distribuido. No modela un interrogador real.
export const LENGTH_KM = 8;
export const SPLITTER_KM = LENGTH_KM;
export const DZ_KM = 0.05;
export const END_S = 320;
export const DT_S = 2;
export const Z = Array.from({ length: Math.round(LENGTH_KM / DZ_KM) + 1 }, (_, i) => +(i * DZ_KM).toFixed(2));
export const T = Array.from({ length: END_S / DT_S + 1 }, (_, i) => i * DT_S);

export const CHANNELS = {
  alpha: { label: 'Atenuación', short: 'OTDR', unit: 'dB/km', scale: 0.25, weight: 0.23, color: '#4cb9ed' },
  temp: { label: 'Temperatura', short: 'DTS', unit: '°C', scale: 20, weight: 0.22, color: '#f7a45c' },
  strain: { label: 'Deformación', short: 'DSS', unit: 'µε', scale: 100, weight: 0.30, color: '#ac9afa' },
  vib: { label: 'Vibración', short: 'DAS', unit: 'u. a.', scale: 0.9, weight: 0.25, color: '#54d8bd' },
};

export const SCENARIOS = {
  normal: { label: 'Referencia sana', icon: '○', center: null, start: null, focus: 'vib', demoTime: 30, kind: 'baseline',
    summary: 'Solo variación ambiental y ruido instrumental sintético.', expected: 'Ningún detector debe activarse.' },
  train: { label: 'Tren', icon: '▣', center: null, start: 20, focus: 'vib', demoTime: 110, kind: 'moving',
    summary: 'Una fuente móvil produce una banda diagonal de vibración y deformación transitoria.', expected: 'Patrón móvil coherente; evento operativo, no falla.' },
  excavation: { label: 'Excavación', icon: '⌁', center: 4.5, start: 120, focus: 'vib', demoTime: 180, kind: 'local',
    summary: 'Una obra cercana agita el terreno y somete el cable a deformación localizada.', expected: 'Vibración y deformación sostenidas cerca del km 4,50.' },
  slope: { label: 'Ladera', icon: '◢', center: 3.2, start: 85, focus: 'strain', demoTime: 240, kind: 'gradual',
    summary: 'El terreno se desplaza lentamente y deforma una sección amplia de la fibra.', expected: 'Deformación creciente en una zona más ancha que una falla puntual.' },
  mechanical: { label: 'Degradación', icon: '✧', center: 5.8, start: 70, focus: 'strain', demoTime: 240, kind: 'gradual',
    summary: 'Una zona del cable acumula deformación y pérdida óptica de manera gradual.', expected: 'Deformación y atenuación aumentan juntas en el km 5,80.' },
  thermal: { label: 'Foco térmico', icon: '♨', center: 6.1, start: 105, focus: 'temp', demoTime: 180, kind: 'local',
    summary: 'Una fuente de calor cerca del túnel eleva la temperatura local de la fibra.', expected: 'Temperatura anómala sostenida cerca del km 6,10.' },
  loss: { label: 'Pérdida óptica', icon: '◇', center: 7.0, start: 95, focus: 'alpha', demoTime: 180, kind: 'local',
    summary: 'Una curvatura o daño del cable incrementa la pérdida de luz en un tramo corto.', expected: 'Atenuación localizada cerca del km 7,00.' },
  cut: { label: 'Corte de fibra', icon: '✕', center: 6.6, start: 130, focus: 'alpha', demoTime: 170, kind: 'local',
    summary: 'La fibra de alimentación se interrumpe antes del splitter.', expected: 'La traza OTDR termina cerca del km 6,60; no hay retorno desde el tramo posterior.' },
  seismic: { label: 'Vibración extensa', icon: '◉', center: 4.0, start: 130, focus: 'vib', demoTime: 156, kind: 'transient',
    summary: 'Un pulso de vibración atraviesa buena parte del trazado durante varios segundos.', expected: 'DAS elevado en muchos segmentos al mismo tiempo.' },
};

const gauss = (x, sigma) => Math.exp(-0.5 * (x / sigma) ** 2);
const ramp = (t, start, duration) => Math.max(0, Math.min(1, (t - start) / duration));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const noise = (z, t, k) => {
  const v = Math.sin(z * 127.1 + t * 17.73 + k * 41.71) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

export function baseline(z) {
  return {
    alpha: 0.20 + 0.012 * Math.sin(z * 1.3),
    temp: 18 + 1.4 * Math.sin(z * 0.8),
    strain: 20 + 5 * Math.sin(z * 1.1),
    vib: 0.045,
  };
}

export function trainPosition(t, speedKmh = 120) {
  const position = ((t - 20) * speedKmh) / 3600;
  return position >= 0 && position <= LENGTH_KM ? position : null;
}

export function sample(z, t, scenario = 'normal', speedKmh = 120) {
  const ref = baseline(z);
  const train = scenario === 'train' ? trainPosition(t, speedKmh) : null;
  const g = train === null ? 0 : gauss(z - train, 0.105);
  const axle = train === null ? 0 : 0.70 + 0.30 * Math.sin((z - train) * 125) ** 2;
  const value = {
    alpha: ref.alpha + 0.002 * noise(z, t, 1) + 0.004 * g,
    temp: ref.temp + 0.22 * Math.sin(t / 62) + 0.08 * noise(z, t, 2) + 0.18 * g,
    strain: ref.strain + 1.3 * noise(z, t, 3) + 24 * g,
    vib: Math.max(0, ref.vib + 0.018 * noise(z, t, 4) + 0.78 * g * axle),
  };

  if (scenario === 'excavation') {
    const p = ramp(t, 120, 30) * gauss(z - 4.5, 0.15);
    value.vib += p * (0.50 + 0.12 * Math.sin(t * 0.38) ** 2);
    value.strain += 48 * p;
    value.alpha += 0.055 * p;
  } else if (scenario === 'slope') {
    const p = ramp(t, 85, 150) * gauss(z - 3.2, 0.36);
    value.strain += 148 * p;
    value.vib += 0.065 * p;
    value.alpha += 0.035 * p;
  } else if (scenario === 'mechanical') {
    const p = ramp(t, 70, 210) * gauss(z - 5.8, 0.19);
    value.strain += 126 * p;
    value.alpha += 0.15 * p;
    value.vib += 0.055 * p;
  } else if (scenario === 'thermal') {
    const p = ramp(t, 105, 45) * gauss(z - 6.1, 0.18);
    value.temp += 18 * p;
    value.strain += 7 * p; // Acoplamiento aparente, simplificado.
  } else if (scenario === 'loss') {
    const p = ramp(t, 95, 55) * gauss(z - 7.0, 0.12);
    value.alpha += 0.24 * p;
  } else if (scenario === 'cut') {
    const p = ramp(t, 130, 4) * gauss(z - 6.6, 0.06);
    value.alpha += 0.7 * p;
    value.strain += 38 * p;
  } else if (scenario === 'seismic') {
    const p = gauss(t - (144 + 1.2 * z), 17) * (0.74 + 0.26 * Math.sin(z * 9) ** 2);
    value.vib += 0.78 * p;
    value.strain += 8 * p;
  }
  return value;
}

// Traza OTDR ilustrativa: el retorno Rayleigh decae por la pérdida de ida y
// vuelta. Una pérdida localizada crea un escalón; un corte deja sólo piso de
// ruido después del punto de interrupción. No representa pulsos ni zona muerta.
export function otdrTrace(t, scenario = 'normal') {
  const active = (start, duration) => ramp(t, start, duration);
  const step = (z, center, width = 0.045) => 0.5 * (1 + Math.tanh((z - center) / width));
  return Z.map((z) => {
    const reference = -2 * (0.20 * z + 0.012 * (1 - Math.cos(1.3 * z)) / 1.3)
      - 0.28 * step(z, 2.2);
    let measured = reference + 0.025 * noise(z, t, 9);
    if (scenario === 'loss') measured -= 2 * 1.35 * active(95, 55) * step(z, 7);
    if (scenario === 'mechanical') measured -= 2 * 0.85 * active(70, 210) * step(z, 5.8);
    if (scenario === 'excavation') measured -= 2 * 0.18 * active(120, 30) * step(z, 4.5);
    if (scenario === 'cut' && t >= 130) {
      const progress = active(130, 4);
      const cutoff = 6.6;
      measured = measured * (1 - progress * step(z, cutoff, 0.018))
        + (-26 + 0.12 * noise(z, t, 10)) * progress * step(z, cutoff, 0.018);
      measured += 5.5 * progress * gauss(z - cutoff, 0.025);
    }
    return { z, reference, measured };
  });
}

export function otdrEvidence(t, scenario = 'normal') {
  const trace = otdrTrace(t, scenario);
  const cutoff = trace.findIndex((point, i) => i > 4 && i < trace.length - 4 &&
    point.measured - point.reference < -10 &&
    trace.slice(i, i + 4).every((next) => next.measured - next.reference < -10));
  if (cutoff >= 0) return { kind: 'cut', z: trace[cutoff].z, lossDb: null };
  const losses = trace.map((point) => Math.max(0, (point.reference - point.measured) / 2));
  const lossDb = Math.max(...losses);
  const centerIndex = losses.findIndex((loss) => loss >= lossDb / 2);
  return { kind: lossDb >= 0.35 ? 'loss' : 'normal',
    z: trace[centerIndex].z, lossDb };
}

export function isObservable(z, t, scenario = 'normal') {
  return !(scenario === 'cut' && t >= 134 && z > 6.65);
}

export function evaluate(z, t, scenario = 'normal', speedKmh = 120) {
  const value = sample(z, t, scenario, speedKmh);
  const ref = baseline(z);
  const norm = {};
  let score = 0;
  for (const [key, config] of Object.entries(CHANNELS)) {
    norm[key] = clamp(Math.abs(value[key] - ref[key]) / config.scale, 0, 1);
    score += config.weight * norm[key];
  }
  const observable = isObservable(z, t, scenario);
  if (!observable) {
    for (const key of Object.keys(norm)) norm[key] = 0;
    score = 0;
  }
  const train = scenario === 'train' ? trainPosition(t, speedKmh) : null;
  const trainZone = train !== null && Math.abs(z - train) <= 0.22;
  return { value, ref, norm, score, trainZone, observable };
}

export function alertType(norm, width = 0) {
  if (norm.temp >= 0.58) return 'Foco térmico';
  if (norm.alpha >= 0.60 && norm.strain < 0.32) return 'Pérdida óptica';
  if (norm.strain >= 0.42 && norm.vib >= 0.32) return 'Actividad cercana';
  if (norm.strain >= 0.42 && norm.alpha >= 0.30) return 'Degradación mecánica';
  if (norm.strain >= 0.42) return 'Movimiento del terreno';
  if (norm.vib >= 0.58 && width >= 0.5) return 'Vibración extensa';
  if (norm.vib >= 0.58) return 'Vibración localizada';
  return 'Desviación multivariable';
}

export function isCandidate(result, sensitivity = 1) {
  const component = Math.max(...Object.values(result.norm));
  return !result.trainZone && (result.score >= 0.30 / sensitivity || component >= 0.60 / sensitivity);
}

// Un mismo segmento debe cumplir la regla durante seis muestras (12 s).
export function alertsAt(t, scenario = 'normal', speedKmh = 120, sensitivity = 1) {
  const time = clamp(Math.round(t / DT_S) * DT_S, 0, END_S);
  const events = [];
  for (const z of Z) {
    const current = evaluate(z, time, scenario, speedKmh);
    if (!isCandidate(current, sensitivity)) continue;
    let persistent = true;
    for (let back = DT_S; back < 12; back += DT_S) {
      if (time - back < 0 || !isCandidate(evaluate(z, time - back, scenario, speedKmh), sensitivity)) {
        persistent = false;
        break;
      }
    }
    if (persistent) events.push({ z, ...current });
  }
  const widespreadVibration = events.filter((event) => event.norm.vib >= 0.58 && event.norm.vib > event.norm.strain && event.norm.vib > event.norm.temp);
  if (widespreadVibration.length >= 25 && widespreadVibration.at(-1).z - widespreadVibration[0].z >= 2) {
    const peak = widespreadVibration.reduce((best, event) => event.norm.vib > best.norm.vib ? event : best);
    return [{ kind: 'alert', start: widespreadVibration[0].z, end: widespreadVibration.at(-1).z, z: peak.z,
      type: 'Vibración extensa', score: peak.score, norm: peak.norm,
      severity: peak.norm.vib >= 0.9 ? 'Crítica' : 'Significativa' }];
  }
  const groups = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (last && event.z - last.end <= DZ_KM + 0.001) {
      last.end = event.z;
      if (Math.max(event.score, ...Object.values(event.norm)) > Math.max(last.peak.score, ...Object.values(last.peak.norm))) last.peak = event;
    } else groups.push({ start: event.z, end: event.z, peak: event });
  }
  return groups.map((group) => ({
    kind: 'alert', start: group.start, end: group.end, z: group.peak.z,
    type: alertType(group.peak.norm, group.end - group.start),
    score: group.peak.score, norm: group.peak.norm,
    severity: group.peak.score >= 0.5 || Math.max(...Object.values(group.peak.norm)) >= 0.9 ? 'Crítica' : 'Significativa',
  }));
}

// Detecta una cresta DAS intensa que se desplaza de forma coherente durante 8 s.
export function movingEventAt(t, scenario = 'normal', speedKmh = 120) {
  if (t < 36) return null;
  const peakAt = (time) => {
    let peak = { z: 0, vib: 0, mean: 0 };
    for (const z of Z) {
      const vib = sample(z, time, scenario, speedKmh).vib;
      peak.mean += vib / Z.length;
      if (vib > peak.vib) { peak.z = z; peak.vib = vib; }
    }
    return peak;
  };
  const now = peakAt(t), prior = peakAt(t - 8), older = peakAt(t - 16);
  const estimatedSpeed = (now.z - prior.z) / 8 * 3600;
  const previousSpeed = (prior.z - older.z) / 8 * 3600;
  if (now.vib < 0.42 || prior.vib < 0.42 || older.vib < 0.42 ||
      now.vib < now.mean * 3 || prior.vib < prior.mean * 3 || older.vib < older.mean * 3 ||
      estimatedSpeed < 55 || estimatedSpeed > 190 || Math.abs(estimatedSpeed - previousSpeed) > 50) return null;
  return { kind: 'operational', type: 'Tren en movimiento', severity: 'Informativa', z: now.z,
    start: Math.max(0, now.z - 0.15), end: Math.min(LENGTH_KM, now.z + 0.15), speed: estimatedSpeed,
    score: evaluate(now.z, t, scenario, speedKmh).score };
}

export function detectionsAt(t, scenario = 'normal', speedKmh = 120, sensitivity = 1) {
  const optical = otdrEvidence(t, scenario);
  if (optical.kind === 'cut') return [{ kind: 'alert', type: 'Corte de fibra', severity: 'Crítica',
    z: optical.z, start: optical.z, end: optical.z, score: 1, norm: { alpha: 1, temp: 0, strain: 0, vib: 0 } }];
  const moving = movingEventAt(t, scenario, speedKmh);
  return [...(moving ? [moving] : []), ...alertsAt(t, scenario, speedKmh, sensitivity)];
}

export function sensitivityCurve(channel, sensitivity = 1) {
  const config = CHANNELS[channel];
  return Array.from({ length: 51 }, (_, i) => {
    const fraction = i / 50;
    return { x: fraction * config.scale, d: fraction * config.weight, threshold: 0.60 / sensitivity * config.scale };
  });
}
