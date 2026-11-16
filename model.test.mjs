import test from 'node:test';
import assert from 'node:assert/strict';
import { T, CHANNELS, SCENARIOS, Z, baseline, sample, trainPosition, evaluate, alertsAt, detectionsAt, movingEventAt, otdrTrace, otdrEvidence, isObservable } from './model.mjs';

test('la referencia y el modelo son deterministas en la malla', () => {
  assert.equal(Z[0], 0);
  assert.equal(Z.at(-1), 8);
  assert.deepEqual(sample(4.5, 180, 'excavation'), sample(4.5, 180, 'excavation'));
  assert.equal(Object.values(CHANNELS).reduce((sum, channel) => sum + channel.weight, 0), 1);
  assert.ok(baseline(4.5).alpha > 0);
});

test('el tren se desplaza a la velocidad configurada', () => {
  assert.equal(trainPosition(20, 120), 0);
  assert.ok(Math.abs(trainPosition(50, 120) - 1) < 1e-9);
  assert.equal(trainPosition(0, 120), null);
});

test('un tren sano no produce alertas persistentes', () => {
  for (const speed of [80, 120, 160]) for (const t of T) {
    assert.deepEqual(alertsAt(t, 'train', speed), []);
  }
  assert.equal(detectionsAt(110, 'train')[0]?.type, 'Tren en movimiento');
});

test('los fenómenos fijos y extensos se detectan en sus escenarios', () => {
  for (const [scenario, time, center, type] of [
    ['excavation', 180, 4.5, 'Actividad cercana'],
    ['mechanical', 240, 5.8, 'Degradación mecánica'],
    ['slope', 240, 3.2, 'Movimiento del terreno'],
    ['thermal', 180, 6.1, 'Foco térmico'],
    ['loss', 180, 7.0, 'Pérdida óptica'],
  ]) {
    const alerts = alertsAt(time, scenario);
    assert.ok(alerts.some((alert) => Math.abs(alert.z - center) < 0.4 && alert.type === type), scenario);
    assert.deepEqual(alertsAt(0, scenario), []);
  }
  const seismic = alertsAt(156, 'seismic');
  assert.equal(seismic.length, 1);
  assert.equal(seismic[0].type, 'Vibración extensa');
  assert.ok(seismic[0].end - seismic[0].start > 5);
});

test('la vibración extensa no se confunde con un tren móvil', () => {
  for (const t of T) assert.equal(movingEventAt(t, 'seismic'), null);
  assert.deepEqual(detectionsAt(30, 'normal'), []);
  assert.equal(Object.keys(SCENARIOS).length, 9);
});

test('la traza OTDR separa pérdida localizada, corte y tránsito', () => {
  assert.equal(otdrTrace(180, 'normal').length, Z.length);
  assert.equal(otdrEvidence(180, 'train').kind, 'normal');
  const bend = otdrEvidence(180, 'loss');
  assert.equal(bend.kind, 'loss');
  assert.ok(Math.abs(bend.z - 7) <= 0.1);
  assert.ok(bend.lossDb > 1);
  const cut = otdrEvidence(170, 'cut');
  assert.equal(cut.kind, 'cut');
  assert.ok(Math.abs(cut.z - 6.6) <= 0.1);
  assert.equal(detectionsAt(170, 'cut')[0].type, 'Corte de fibra');
  assert.equal(isObservable(7, 170, 'cut'), false);
  assert.equal(isObservable(6, 170, 'cut'), true);
  assert.equal(otdrEvidence(120, 'cut').kind, 'normal');
});

test('la degradación mecánica crece en el tiempo', () => {
  const early = evaluate(5.8, 110, 'mechanical').score;
  const late = evaluate(5.8, 270, 'mechanical').score;
  assert.ok(late > early + 0.15);
});
