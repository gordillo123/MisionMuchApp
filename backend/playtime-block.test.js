const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DIAS_BLOQUEO_POR_DEFECTO,
  buildMensajeBloqueo,
  calcularFechaDesbloqueo,
  formatFechaMX
} = require('./playtime-block');

const FECHA_FINALIZACION = new Date('2026-06-22T12:00:00-06:00');

test('el periodo predeterminado es de 7 días exactos', () => {
  const fecha = calcularFechaDesbloqueo(FECHA_FINALIZACION, {});
  assert.equal(DIAS_BLOQUEO_POR_DEFECTO, 7);
  assert.equal(fecha.getTime() - FECHA_FINALIZACION.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(formatFechaMX(fecha), 'lunes 29 de junio de 2026');
});

test('calcula y formatea los ejemplos de 15 y 30 días', () => {
  const quinceDias = calcularFechaDesbloqueo(FECHA_FINALIZACION, { cantidad: 15 });
  const treintaDias = calcularFechaDesbloqueo(FECHA_FINALIZACION, { cantidad: 30 });

  assert.equal(formatFechaMX(quinceDias), 'martes 7 de julio de 2026');
  assert.equal(formatFechaMX(treintaDias), 'miércoles 22 de julio de 2026');
});

test('el mensaje siempre contiene la fecha completa', () => {
  const fecha = calcularFechaDesbloqueo(FECHA_FINALIZACION, { cantidad: 7 });
  const mensaje = buildMensajeBloqueo(fecha);

  assert.match(mensaje, /lunes 29 de junio de 2026/);
  assert.doesNotMatch(mensaje, /dentro de una semana/i);
});
