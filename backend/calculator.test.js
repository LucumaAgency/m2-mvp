// Verifica que el port de calculator.js reproduce los números del Excel Surquillo.
// Correr: node --test backend/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularInversion,
  inflacionAcumulada,
  monthsBetween,
  annuityRate,
} from "./calculator.js";

// Caso real del Excel docs/caso-surquillo-modelo-inversion.xlsx
const SURQUILLO = {
  tipoCompra: "financiado",
  tcCompra: 3.962,
  tcActual: 3.4,
  fechaCompra: "2021-06-01",
  fechaEvaluacion: "2026-04-01",
  fechaEntrega: "2023-06-01",
  inicioAlquiler: "2023-07-01",
  area: 46.62,
  precioCompra: 267000,
  enganchePct: 0.1,
  periodoCreditoAnios: 20,
  cuotaHipoteca: 1690,
  saldoCapital: 204652,
  gastosNotariales: 3000,
  alquilerBrutoMensual: 1890,
  mesesSinAlquilar: 1,
  precioMercadoCompraUsdM2: 1769,
  alquilerPromedioMercadoUsd: 504,
  precioVentaOptimista: 320000,
  precioVentaConservador: 300000,
};

const approx = (a, b, tol = 1) => Math.abs(a - b) <= tol;

test("monthsBetween reproduce DATEDIF M", () => {
  assert.equal(monthsBetween("2021-06-01", "2026-04-01"), 58); // C18
  assert.equal(monthsBetween("2023-07-01", "2026-04-01"), 33); // C34
  assert.equal(monthsBetween("2021-06-01", "2023-06-01"), 24); // base C97
});

test("inflación acumulada del periodo ≈ 21.2%", () => {
  const inf = inflacionAcumulada("2021-06-01", "2026-04-01");
  assert.ok(approx(inf, 0.2120, 0.001), `inf=${inf}`); // C35
});

test("TEA implícita de la cuota ≈ 5.93%", () => {
  const r = annuityRate(20 * 12, -1690, 240300);
  const tea = Math.pow(1 + r, 12) - 1;
  assert.ok(approx(tea, 0.0593, 0.001), `tea=${tea}`); // C87
});

test("cálculo completo cuadra con el Excel", () => {
  const r = calcularInversion(SURQUILLO);

  // Hipoteca
  assert.ok(approx(r.hipoteca.interesesYotros, 62372), `interes=${r.hipoteca.interesesYotros}`); // C29
  assert.ok(approx(r.hipoteca.hipotecaInicial, 240300));                                          // C25

  // Inflación / patrimonio
  assert.ok(approx(r.inflacion.vpnMinimo, 323607, 2), `vpn=${r.inflacion.vpnMinimo}`);            // C74

  // Capital propio
  assert.ok(approx(r.capital.nominal, 72183, 2), `cap=${r.capital.nominal}`);                     // C101
  assert.ok(approx(r.capital.real, 87437, 2), `capReal=${r.capital.real}`);                       // C102

  // Ratios
  assert.ok(approx(r.ratios.capRate, 0.0849, 0.001), `cap=${r.ratios.capRate}`);                  // C169
  assert.ok(approx(r.ratios.per, 11.77, 0.05), `per=${r.ratios.per}`);                            // C171

  // Escenario estrella: financiado optimista, utilidad total ≈ 3,160
  assert.ok(approx(r.escenarios.financiado.optimista.utilidadTotal, 3160, 2),
    `finOpt=${r.escenarios.financiado.optimista.utilidadTotal}`);                                 // C229

  // Financiado conservador ≈ -14,840
  assert.ok(approx(r.escenarios.financiado.conservador.utilidadTotal, -14840, 2),
    `finCons=${r.escenarios.financiado.conservador.utilidadTotal}`);                              // F229

  // Contado optimista ≈ 23,777
  assert.ok(approx(r.escenarios.contado.optimista.utilidadTotal, 23777, 2),
    `contOpt=${r.escenarios.contado.optimista.utilidadTotal}`);                                   // C242
});

test("flujo de alquiler no es autosuficiente (déficit mensual)", () => {
  const r = calcularInversion(SURQUILLO);
  assert.equal(r.alquiler.autosuficiente, false);
  assert.ok(approx(r.alquiler.flujoNetoMensual, -127.6, 0.5));                                    // C111
});
