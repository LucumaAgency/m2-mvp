// Calculadora de inversión inmobiliaria — modelo retrospectivo "Caso Surquillo".
// Porta la lógica del Excel docs/caso-surquillo-modelo-inversion.xlsx, que evalúa
// una inversión YA ocurrida (compra en preventa → fecha de evaluación) comparando
// la utilidad real (ajustada por inflación) contra el costo de oportunidad.
//
// A diferencia del Excel se omiten las celdas de scratch (G229/G230) y la métrica
// "por día" con 5 años hardcodeados; todo periodo se calcula desde las fechas.
//
// Todas las cifras monetarias están en Soles (S/.) salvo donde el nombre indique USD.

// Inflación anual Perú — BCRP / INEI. 2026 es proyección IPE.
const INFLACION_BCRP = {
  2010: 0.0229, 2011: 0.0474, 2012: 0.0265, 2013: 0.028, 2014: 0.033,
  2015: 0.044, 2016: 0.032, 2017: 0.014, 2018: 0.022, 2019: 0.019,
  2020: 0.02, 2021: 0.064, 2022: 0.085, 2023: 0.032, 2024: 0.02,
  2025: 0.0151, 2026: 0.041,
};

// Supuestos por defecto (editables vía input). Reflejan los del Excel.
const DEFAULTS = {
  costoOportunidad: 0.08,   // C5  — tasa neta mínima esperada por el inversionista
  depositoPlazo: 0.045,     // C6  — depósito a plazo con FSD
  capRateMercado: 0.055,    // F5  — cap rate bruto promedio Lima
  perMercado: 17.5,         // F6  — PER promedio Lima
  enganchePct: 0.1,         // C23
  periodoCreditoAnios: 20,  // C26
  irAlquilerPct: 0.05,      // 5% sobre alquiler bruto
  irVentaPct: 0.05,         // 5% sobre ganancia de capital
  opexPorM2: 5,             // S/.5 / m² / mes (mantenimiento + gestión + predial)
  comisionVentaPct: 0.05,   // 5% del precio de venta
  horizonteProyeccion: 10,  // años a proyectar hacia el futuro desde la evaluación
  // comisión de alquiler: 1 mes de renta bruta, una sola vez
};

// ── Helpers de fecha ──────────────────────────────────────────────
function parseDate(s) {
  if (s instanceof Date) return { y: s.getFullYear(), m: s.getMonth() + 1, d: s.getDate() };
  const [y, m, d] = String(s).split("-").map(Number);
  return { y, m: m || 1, d: d || 1 };
}

// Equivalente a DATEDIF(a, b, "M"): meses completos entre dos fechas.
function monthsBetween(a, b) {
  const A = parseDate(a);
  const B = parseDate(b);
  let months = (B.y - A.y) * 12 + (B.m - A.m);
  if (B.d < A.d) months -= 1;
  return months;
}

// ── Helpers financieros ───────────────────────────────────────────

// Inflación acumulada compuesta entre dos fechas, pro-rateando la fracción
// de cada año calendario contra la tabla BCRP (Excel C35).
function inflacionAcumulada(fechaCompra, fechaEval) {
  const C = parseDate(fechaCompra);
  const E = parseDate(fechaEval);
  let lnSum = 0;
  for (const [yStr, inf] of Object.entries(INFLACION_BCRP)) {
    const Y = Number(yStr);
    const upper = Math.min(1, (E.y - Y) + E.m / 12);
    const lower = Math.max(0, (C.y - Y) + C.m / 12);
    const w = Math.max(0, upper - lower);
    if (w > 0) lnSum += Math.log(1 + inf) * w;
  }
  return Math.exp(lnSum) - 1;
}

// Tasa periódica de una anualidad (equivalente a Excel RATE): resuelve r en
//   pv*(1+r)^n + pmt*((1+r)^n - 1)/r = 0
// por bisección. pmt va negativo (pago saliente), como en Excel.
function annuityRate(nper, pmt, pv) {
  const f = (r) => {
    if (Math.abs(r) < 1e-12) return pv + pmt * nper;
    const g = Math.pow(1 + r, nper);
    return pv * g + pmt * (g - 1) / r;
  };
  let lo = 1e-9, hi = 1; // tasa mensual entre ~0% y 100%
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-7) return mid;
    if ((flo < 0) === (fmid < 0)) { lo = mid; flo = fmid; }
    else { hi = mid; }
  }
  return (lo + hi) / 2;
}

// Valor futuro de una serie de pagos (Excel FV con pv=0, type=0).
function fv(rate, nper, pmt) {
  if (Math.abs(rate) < 1e-12) return -pmt * nper;
  return -pmt * (Math.pow(1 + rate, nper) - 1) / rate;
}

function round(n, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

// Inflación promedio BCRP de los últimos 10 años disponibles (para proyección futura).
function inflacionPromedioReciente() {
  const ys = Object.keys(INFLACION_BCRP).map(Number).sort((a, b) => b - a).slice(0, 10);
  return ys.reduce((s, y) => s + INFLACION_BCRP[y], 0) / ys.length;
}

// Tabla de proyección año a año HACIA EL FUTURO desde la fecha de evaluación.
// Mismo esquema que el scanner: valor del inmueble crece con `g`, la renta neta
// crece con la inflación `pi`, y se acumulan % de plusvalía, renta e inflación.
function proyeccionAnual({ base, g, pi, n, rentaNetaAnual }) {
  const N = Math.min(Math.max(Math.round(n || 10), 1), 30);
  const filas = [];
  let rentaAcum = 0;
  for (let a = 1; a <= N; a++) {
    const valor = base * Math.pow(1 + g, a);
    const renta = rentaNetaAnual * Math.pow(1 + pi, a - 1);
    rentaAcum += renta;
    const plusPct = Math.pow(1 + g, a) - 1;
    const rentaPct = base ? rentaAcum / base : 0;
    filas.push({
      anio: a,
      valorInmueble: round(valor),
      rentaAnualNeta: round(renta),
      rentaAcum: round(rentaAcum),
      plusvaliaAcumPct: round(plusPct, 4),
      rentaAcumPct: round(rentaPct, 4),
      rentabilidadTotalPct: round(plusPct + rentaPct, 4),
      inflacionAcumPct: round(Math.pow(1 + pi, a) - 1, 4),
    });
  }
  return filas;
}

// ── Cálculo principal ─────────────────────────────────────────────
export function calcularInversion(raw) {
  const o = { ...DEFAULTS, ...raw };
  const financiado = String(o.tipoCompra || "financiado").toLowerCase() === "financiado";

  // 1. Tiempos
  const mesesTotales = monthsBetween(o.fechaCompra, o.fechaEvaluacion);   // C18
  const periodoAnios = mesesTotales / 12;                                  // C19
  const mesesAlquilados = o.inicioAlquiler
    ? monthsBetween(o.inicioAlquiler, o.fechaEvaluacion)                   // C34
    : 0;

  // Inflación del periodo
  const infAcum = inflacionAcumulada(o.fechaCompra, o.fechaEvaluacion);    // C35
  const infAnualPeriodo = Math.pow(1 + infAcum, 1 / periodoAnios) - 1;     // C37

  // 2. Hipoteca (solo financiado)
  const precioCompra = Number(o.precioCompra);                             // C22
  const inicial = o.enganchePct * precioCompra;                            // C24
  const hipotecaInicial = (1 - o.enganchePct) * precioCompra;             // C25
  const cuota = financiado ? Number(o.cuotaHipoteca) : 0;                  // C27
  const saldoCapital = financiado ? Number(o.saldoCapital) : 0;            // C28
  const totalPagadoBanco = cuota * mesesTotales;                          // C86
  const interesesYotros = financiado                                       // C29
    ? mesesTotales * cuota + saldoCapital - hipotecaInicial
    : 0;
  const teaImplicita = financiado                                          // C87
    ? Math.pow(1 + annuityRate(o.periodoCreditoAnios * 12, -cuota, hipotecaInicial), 12) - 1
    : null;

  // 3. Precio de mercado al año de compra (BCRP)
  const precioM2Soles = o.precioMercadoCompraUsdM2 != null               // C41
    ? o.precioMercadoCompraUsdM2 * o.tcCompra : null;
  const precioMercadoTotal = precioM2Soles != null                        // C42
    ? precioM2Soles * o.area : null;
  const pcVsMercado = precioMercadoTotal != null                          // C43
    ? precioCompra - precioMercadoTotal : null;
  const pctVsMercado = precioMercadoTotal ? pcVsMercado / precioMercadoTotal : null; // C44

  // 4. Alquiler vs mercado
  const promedioMercadoSoles = o.alquilerPromedioMercadoUsd != null      // C50
    ? o.alquilerPromedioMercadoUsd * o.tcActual : null;
  const alquilerBruto = Number(o.alquilerBrutoMensual);                    // C31
  const alquilerSobreMercadoPct = promedioMercadoSoles                    // C52
    ? (alquilerBruto - promedioMercadoSoles) / promedioMercadoSoles : null;

  // 5. Plusvalía (3 escenarios)
  const ventaOptimista = Number(o.precioVentaOptimista);                   // C56
  const ventaConservador = Number(o.precioVentaConservador);              // C58
  const ventaPromedio = (ventaOptimista + ventaConservador) / 2;          // C57
  const plusvalia = (venta) => ({
    nominal: venta - precioCompra,
    total: (venta - precioCompra) / precioCompra,
    anualizada: Math.pow(venta / precioCompra, 1 / periodoAnios) - 1,
  });
  const plusvaliaConservador = plusvalia(ventaConservador);
  const plusvaliaPromedio = plusvalia(ventaPromedio);
  const plusvaliaOptimista = plusvalia(ventaOptimista);

  // 5b. Patrimonio real (poder adquisitivo)
  const vpnMinimo = precioCompra * (1 + infAcum);                          // C74
  const utilidadRealOptimista = ventaOptimista - vpnMinimo;               // C75
  const utilidadRealConservador = ventaConservador - vpnMinimo;           // C76

  // 7. Desembolsos propios ajustados por inflación (financiado)
  const opexMensual = o.opexPorM2 * o.area;                                // -C108
  const mesesSinAlquilar = Number(o.mesesSinAlquilar || 0);               // C33
  const inicialNotarialesNominal = inicial + Number(o.gastosNotariales || 0); // C95
  const inicialNotarialesReal = inicialNotarialesNominal * (1 + infAcum); // C96
  const cuotasSinInquilino = financiado                                    // C97
    ? monthsBetween(o.fechaCompra, o.fechaEntrega) + mesesSinAlquilar
    : 0;
  const montoCuotasSinInquilinoNominal = cuotasSinInquilino * cuota;       // C98
  const montoCuotasSinInquilinoReal = montoCuotasSinInquilinoNominal * (1 + infAcum); // C99
  const opexVacancia = opexMensual * mesesSinAlquilar;                     // C100 (costo)
  const capitalPropioNominal = inicialNotarialesNominal + montoCuotasSinInquilinoNominal + opexVacancia; // C101
  const capitalPropioReal = inicialNotarialesReal + montoCuotasSinInquilinoReal + opexVacancia;          // C102

  // 8. Ingresos por alquiler vs hipoteca (flujo mensual)
  const irMensual = o.irAlquilerPct * alquilerBruto;                       // C107
  const ingresoNetoMensualAntesHipoteca = alquilerBruto - irMensual - opexMensual; // C109
  const flujoNetoMensual = ingresoNetoMensualAntesHipoteca - cuota;        // C111
  const utilidadAlquilerAnualNominal = flujoNetoMensual * 12;             // C112

  // 9A. Utilidad acumulada neta por alquiler hasta evaluación (financiado)
  const ingresosAlquilerBruto = alquilerBruto * mesesAlquilados;          // C121
  const comisionAlquiler = -alquilerBruto;                                // C122 (1 mes, una vez)
  const irAlquilerTotal = -o.irAlquilerPct * ingresosAlquilerBruto;       // C123
  const opexTotal = -opexMensual * mesesAlquilados;                       // C124
  const cuotasDuranteAlquiler = -mesesAlquilados * cuota;                 // C125
  const utilidadAlquilerFinanciado =                                       // C126
    ingresosAlquilerBruto + comisionAlquiler + irAlquilerTotal + opexTotal + cuotasDuranteAlquiler;

  // 9B. Utilidad acumulada neta por alquiler (contado — sin cuotas)
  const utilidadAlquilerContado =                                          // C144
    ingresosAlquilerBruto + comisionAlquiler + irAlquilerTotal + opexTotal;

  // 10A. Utilidad neta por venta (financiado, ajustado por inflación)
  const ventaFinanciado = (venta) => {
    const comision = -o.comisionVentaPct * venta;
    const ir = -o.irVentaPct * (venta - precioCompra);
    return venta - saldoCapital - capitalPropioReal + comision + ir; // C135 / E135
  };
  // 10B. Utilidad neta por venta (contado)
  const ventaContado = (venta) => {
    const inversionTotalReal = -(precioCompra + Number(o.gastosNotariales || 0)) * (1 + infAcum); // C148
    const comision = -o.comisionVentaPct * venta;
    const ir = -o.irVentaPct * (venta - precioCompra);
    return venta + inversionTotalReal + comision + ir; // C152
  };

  // 14. Utilidad neta total por escenario = venta + alquiler
  const escenario = (venta, modo) => {
    const utilVenta = modo === "contado" ? ventaContado(venta) : ventaFinanciado(venta);
    const utilAlquiler = modo === "contado" ? utilidadAlquilerContado : utilidadAlquilerFinanciado;
    const capital = modo === "contado"
      ? (precioCompra + Number(o.gastosNotariales || 0)) * (1 + infAcum)
      : capitalPropioReal;
    const total = utilVenta + utilAlquiler;
    const sobreCapitalPct = total / capital;
    return {
      precioVenta: round(venta),
      utilidadVenta: round(utilVenta),
      utilidadAlquiler: round(utilAlquiler),
      utilidadTotal: round(total),
      sobreCapitalPct: round(sobreCapitalPct, 4),
      anualizadaPct: round(Math.pow(1 + sobreCapitalPct, 1 / periodoAnios) - 1, 4),
      utilidadAnual: round(total / periodoAnios),
    };
  };

  // 11-12. Ratios de rentabilidad aparente (sobre precio de compra)
  const ingresoBrutoAnual = alquilerBruto * 12;                            // C167
  const ingresoNetoAnual = ingresoBrutoAnual - irMensual * 12 - opexMensual * 12; // C168
  const capRate = ingresoBrutoAnual / precioCompra;                        // C169
  const netCapRate = ingresoNetoAnual / precioCompra;                      // C170
  const per = 1 / capRate;                                                 // C171
  const perNeto = 1 / netCapRate;                                          // C172

  // 16. Costo de oportunidad — ¿cuánto habría rendido ese capital en otra inversión?
  // Faithful al Excel: rendimiento nominal del capital propio a la tasa dada.
  const costoOportunidad = (capital, utilidad) => {
    const alt8 = capital * (Math.pow(1 + o.costoOportunidad, periodoAnios) - 1);
    const altDeposito = capital * (Math.pow(1 + o.depositoPlazo, periodoAnios) - 1);
    return {
      capital: round(capital),
      utilidadInversion: round(utilidad),
      altCostoOportunidad: round(alt8),
      altDeposito: round(altDeposito),
      diffVsCostoOportunidad: round(utilidad - alt8),
      diffVsDeposito: round(utilidad - altDeposito),
    };
  };

  const escenarios = {
    financiado: {
      optimista: escenario(ventaOptimista, "financiado"),
      conservador: escenario(ventaConservador, "financiado"),
    },
    contado: {
      optimista: escenario(ventaOptimista, "contado"),
      conservador: escenario(ventaConservador, "contado"),
    },
  };

  // Veredicto: ¿la mejor utilidad anual supera la inflación del periodo?
  const mejorAnual = Math.max(
    escenarios.financiado.optimista.anualizadaPct,
    escenarios.contado.optimista.anualizadaPct
  );
  let verdict;
  if (mejorAnual < 0) verdict = "PERDIDA_REAL";
  else if (mejorAnual < infAnualPeriodo) verdict = "BAJO_INFLACION";
  else if (mejorAnual < o.depositoPlazo) verdict = "BAJO_DEPOSITO";
  else verdict = "RENTABLE";

  // Alerta de "descarte rápido" reformulada (antes: plusvalía vs inflación a secas).
  // Dos chequeos, no uno:
  //  1. PISO (poder adquisitivo): ¿la plusvalía anual le gana a la inflación?
  //     Usa el mejor caso de plusvalía: si ni el optimista supera la inflación,
  //     la apreciación nominal está engañando.
  //  2. VALLA (decisión): ¿el retorno total real le gana a un depósito a plazo?
  //     Usa el retorno total anualizado del modelo (incluye alquiler y financiamiento),
  //     no la plusvalía sola.
  const plusvaliaSuperaInflacion = plusvaliaOptimista.anualizada >= infAnualPeriodo;
  const retornoSuperaDeposito = mejorAnual >= o.depositoPlazo;
  // Retorno bruto aproximado (apreciación + alquiler neto) para contexto rápido.
  const retornoTotalAprox = plusvaliaConservador.anualizada + netCapRate;

  let alertaNivel, alertaMensaje;
  if (!plusvaliaSuperaInflacion && !retornoSuperaDeposito) {
    alertaNivel = "rojo";
    alertaMensaje =
      "No le gana a la inflación ni al banco. Hay que pensarlo dos veces.";
  } else if (!plusvaliaSuperaInflacion) {
    alertaNivel = "amarillo";
    alertaMensaje =
      "La sola subida de precio no le gana a la inflación; lo que salva el caso es el alquiler. Revisa que el flujo aguante.";
  } else if (!retornoSuperaDeposito) {
    alertaNivel = "amarillo";
    alertaMensaje =
      "Le gana a la inflación, pero sumando el alquiler todavía rinde menos que dejar la plata en el banco.";
  } else {
    alertaNivel = "verde";
    alertaMensaje =
      "Le gana a la inflación y, con el alquiler, rinde más que un depósito a plazo.";
  }

  const descarteRapido = {
    nivel: alertaNivel,
    mensaje: alertaMensaje,
    piso: {
      plusvaliaAnualConservador: round(plusvaliaConservador.anualizada, 4),
      plusvaliaAnualOptimista: round(plusvaliaOptimista.anualizada, 4),
      inflacionAnual: round(infAnualPeriodo, 4),
      superaInflacion: plusvaliaSuperaInflacion,
    },
    valla: {
      retornoTotalAnual: round(mejorAnual, 4),
      retornoTotalAprox: round(retornoTotalAprox, 4),
      depositoPlazo: o.depositoPlazo,
      costoOportunidad: o.costoOportunidad,
      superaDeposito: retornoSuperaDeposito,
    },
  };

  // ── Proyección año a año hacia el futuro (desde la fecha de evaluación) ──
  // Base: valor de mercado estimado hoy (precio de venta promedio).
  // g por defecto: conservador = min(plusvalía histórica anualizada, inflación).
  // π por defecto: promedio BCRP de los últimos 10 años.
  const piProy = o.inflacionProyectada != null ? Number(o.inflacionProyectada) : inflacionPromedioReciente();
  const gProy = o.plusvaliaProyectada != null
    ? Number(o.plusvaliaProyectada)
    : Math.min(plusvaliaConservador.anualizada, piProy);
  const baseProy = ventaPromedio;
  const horizonte = Math.min(Math.max(Math.round(o.horizonteProyeccion || 10), 1), 30);
  const proyeccion = {
    base: round(baseProy),
    g: round(gProy, 4),
    pi: round(piProy, 4),
    horizonte,
    rentaNetaAnual: round(ingresoNetoAnual),
    filas: proyeccionAnual({ base: baseProy, g: gProy, pi: piProy, n: horizonte, rentaNetaAnual: ingresoNetoAnual }),
  };

  return {
    ok: true,
    modo: financiado ? "financiado" : "contado",
    tiempos: {
      mesesTotales,
      periodoAnios: round(periodoAnios, 3),
      mesesAlquilados,
    },
    inflacion: {
      acumulada: round(infAcum, 4),
      anualPeriodo: round(infAnualPeriodo, 4),
      vpnMinimo: round(vpnMinimo),
    },
    hipoteca: financiado ? {
      inicial: round(inicial),
      hipotecaInicial: round(hipotecaInicial),
      cuota: round(cuota),
      totalPagadoBanco: round(totalPagadoBanco),
      interesesYotros: round(interesesYotros),
      interesesVsTotalPct: round(interesesYotros / totalPagadoBanco, 4),
      teaImplicita: round(teaImplicita, 4),
      saldoCapital: round(saldoCapital),
    } : null,
    mercadoCompra: precioMercadoTotal != null ? {
      precioM2Soles: round(precioM2Soles),
      precioMercadoTotal: round(precioMercadoTotal),
      pcVsMercado: round(pcVsMercado),
      pctVsMercado: round(pctVsMercado, 4),
    } : null,
    alquiler: {
      brutoMensual: round(alquilerBruto),
      promedioMercadoSoles: round(promedioMercadoSoles),
      sobreMercadoPct: round(alquilerSobreMercadoPct, 4),
      ingresoNetoMensual: round(ingresoNetoMensualAntesHipoteca),
      flujoNetoMensual: round(flujoNetoMensual),
      utilidadAnualNominal: round(utilidadAlquilerAnualNominal),
      autosuficiente: flujoNetoMensual >= 0,
    },
    plusvalia: {
      conservador: { nominal: round(plusvaliaConservador.nominal), total: round(plusvaliaConservador.total, 4), anualizada: round(plusvaliaConservador.anualizada, 4) },
      promedio: { nominal: round(plusvaliaPromedio.nominal), total: round(plusvaliaPromedio.total, 4), anualizada: round(plusvaliaPromedio.anualizada, 4) },
      optimista: { nominal: round(plusvaliaOptimista.nominal), total: round(plusvaliaOptimista.total, 4), anualizada: round(plusvaliaOptimista.anualizada, 4) },
      patrimonioReal: {
        optimista: round(utilidadRealOptimista),
        conservador: round(utilidadRealConservador),
      },
    },
    capital: {
      nominal: round(capitalPropioNominal),
      real: round(capitalPropioReal),
      perdidaPorInflacion: round(capitalPropioReal - capitalPropioNominal),
    },
    ratios: {
      capRate: round(capRate, 4),
      netCapRate: round(netCapRate, 4),
      per: round(per, 2),
      perNeto: round(perNeto, 2),
      capRateMercado: o.capRateMercado,
      perMercado: o.perMercado,
      capRateVsMercadoPct: round((capRate - o.capRateMercado) / o.capRateMercado, 4),
    },
    escenarios,
    costoOportunidad: {
      financiadoOptimista: costoOportunidad(capitalPropioNominal, escenarios.financiado.optimista.utilidadTotal),
      financiadoConservador: costoOportunidad(capitalPropioNominal, escenarios.financiado.conservador.utilidadTotal),
      contadoOptimista: costoOportunidad((precioCompra + Number(o.gastosNotariales || 0)) * (1 + infAcum), escenarios.contado.optimista.utilidadTotal),
      contadoConservador: costoOportunidad((precioCompra + Number(o.gastosNotariales || 0)) * (1 + infAcum), escenarios.contado.conservador.utilidadTotal),
    },
    descarteRapido,
    proyeccion,
    verdict,
  };
}

// ── Validación de entrada ─────────────────────────────────────────
export function validateCalculatorInput(body) {
  const errs = [];
  const req = (k, label) => {
    if (body[k] == null || body[k] === "") errs.push(`${label} (${k}) requerido`);
  };
  req("fechaCompra", "Fecha de compra");
  req("fechaEvaluacion", "Fecha de evaluación");
  req("precioCompra", "Precio de compra");
  req("area", "Área");
  req("alquilerBrutoMensual", "Alquiler bruto mensual");
  req("precioVentaOptimista", "Precio de venta optimista");
  req("precioVentaConservador", "Precio de venta conservador");

  const pc = Number(body.precioCompra);
  if (body.precioCompra != null && (!Number.isFinite(pc) || pc <= 0))
    errs.push("precioCompra debe ser > 0");
  const a = Number(body.area);
  if (body.area != null && (!Number.isFinite(a) || a < 10 || a > 5000))
    errs.push("area fuera de rango (10-5000 m²)");

  const fin = String(body.tipoCompra || "financiado").toLowerCase() === "financiado";
  if (fin) {
    req("fechaEntrega", "Fecha de entrega");
    req("cuotaHipoteca", "Cuota de hipoteca");
    req("saldoCapital", "Saldo de capital");
  }

  // Coherencia de fechas
  if (body.fechaCompra && body.fechaEvaluacion) {
    if (monthsBetween(body.fechaCompra, body.fechaEvaluacion) <= 0)
      errs.push("La fecha de evaluación debe ser posterior a la de compra");
  }
  return errs;
}

export { INFLACION_BCRP, inflacionAcumulada, monthsBetween, annuityRate, fv };
