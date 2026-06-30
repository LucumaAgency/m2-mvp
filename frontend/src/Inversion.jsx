import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { calcular } from "./lib/api.js";
import InfoTip from "./InfoTip.jsx";

// % estándar en Perú para gastos notariales + registrales sobre el precio de compra.
const NOTARIALES_PCT = 0.015;

// Pre-llenado con el caso real del Excel para que funcione de inmediato.
const DEFAULTS = {
  tipoCompra: "financiado",
  tcCompra: 3.962, tcActual: 3.4,
  fechaCompra: "2021-06-01", fechaEvaluacion: "2026-04-01",
  fechaEntrega: "2023-06-01", inicioAlquiler: "2023-07-01",
  area: 46.62, precioCompra: 267000,
  cuotaHipoteca: 1690, saldoCapital: 204652, gastosNotariales: 3000,
  alquilerBrutoMensual: 1890, mesesSinAlquilar: 1,
  precioMercadoCompraUsdM2: 1769, alquilerPromedioMercadoUsd: 504,
  precioVentaOptimista: 320000, precioVentaConservador: 300000,
  horizonteProyeccion: 10,
};

const FIELDS = [
  { k: "precioCompra", l: "Precio de compra (S/.)", t: "number" },
  { k: "area", l: "Área (m²)", t: "number" },
  { k: "fechaCompra", l: "Fecha de compra", t: "date" },
  { k: "fechaEvaluacion", l: "Fecha de evaluación", t: "date" },
  { k: "fechaEntrega", l: "Fecha de entrega", t: "date" },
  { k: "inicioAlquiler", l: "Inicio de alquiler", t: "date" },
  { k: "cuotaHipoteca", l: "Cuota hipoteca mensual (S/.)", t: "number" },
  { k: "saldoCapital", l: "Saldo de capital hoy (S/.)", t: "number" },
  { k: "gastosNotariales", l: "Gastos notariales (S/.)", t: "number",
    tip: "Lo estándar en Perú es ~1.5% del precio de compra (gastos notariales + registrales). Lo pre-llenamos por ti; si conoces el monto real, reemplázalo." },
  { k: "alquilerBrutoMensual", l: "Alquiler bruto mensual (S/.)", t: "number" },
  { k: "precioVentaConservador", l: "Precio venta conservador (S/.)", t: "number" },
  { k: "precioVentaOptimista", l: "Precio venta optimista (S/.)", t: "number" },
  { k: "horizonteProyeccion", l: "Años a proyectar", t: "number" },
];

const VERDICT_UI = {
  PERDIDA_REAL:  { color: "#C0392B", txt: "Pérdida real: pierde poder adquisitivo en todos los escenarios." },
  BAJO_INFLACION:{ color: "#C0392B", txt: "Por debajo de la inflación: el dinero rinde menos que mantenerlo." },
  BAJO_DEPOSITO: { color: "#B8860B", txt: "Rinde, pero menos que un depósito a plazo sin riesgo." },
  RENTABLE:      { color: "#0B6E4F", txt: "Rentable: supera inflación y depósito a plazo." },
};

const soles = (n) => "S/. " + (n ?? 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
const pct = (n) => (n == null ? "—" : (n * 100).toFixed(1) + "%");

// Meses → "3 años y 10 meses" (omite la parte que sea 0).
function aniosMeses(meses) {
  const m = Math.round(meses || 0);
  const a = Math.floor(m / 12);
  const r = m % 12;
  const pa = a ? `${a} ${a === 1 ? "año" : "años"}` : "";
  const pm = r ? `${r} ${r === 1 ? "mes" : "meses"}` : "";
  return [pa, pm].filter(Boolean).join(" y ") || "0 meses";
}

// Mezcla los datos que llegan del valuador (precio de compra y m²) sobre el
// caso de ejemplo. Deriva los precios de venta del precio de compra para que
// el escenario sea coherente; el usuario los puede ajustar.
function buildInitial(state) {
  const f = { ...DEFAULTS };
  if (state?.area) f.area = state.area;
  if (state?.precioCompra) {
    f.precioCompra = state.precioCompra;
    f.precioVentaConservador = Math.round(state.precioCompra);
    f.precioVentaOptimista = Math.round(state.precioCompra * 1.1);
  }
  // Gastos notariales = 1.5% del precio de compra (estándar).
  f.gastosNotariales = Math.round(Number(f.precioCompra || 0) * NOTARIALES_PCT);
  return f;
}

export default function Inversion() {
  const { state } = useLocation();
  const [form, setForm] = useState(() => buildInitial(state));
  const fromValuador = Boolean(state && (state.precioCompra || state.area));
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errs, setErrs] = useState(null);
  const [notarialesTouched, setNotarialesTouched] = useState(false);

  const set = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    // Si cambia el precio de compra y no editaste los notariales, recalcula 1.5%.
    if (k === "precioCompra" && !notarialesTouched) {
      next.gastosNotariales = Math.round(Number(v || 0) * NOTARIALES_PCT);
    }
    return next;
  });

  async function run() {
    setErrs(null); setLoading(true);
    try {
      const payload = { ...form };
      for (const f of FIELDS) if (f.t === "number") payload[f.k] = Number(payload[f.k]);
      const r = await calcular(payload);
      if (r.errors) { setErrs(r.errors); setRes(null); }
      else setRes(r);
    } catch { setErrs(["No se pudo conectar con el servidor."]); }
    finally { setLoading(false); }
  }

  return (
    <>
      <nav>
        <span className="logo">m2<span>peru</span>.com</span>
        <Link to="/" className="nav-link">← Volver al valuador</Link>
      </nav>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="panel-body">
          <p className="panel-eyebrow">Calculadora de inversión</p>
          <h1 className="panel-title">¿Realmente conviene esta propiedad?</h1>
          <p className="panel-sub">Modelo que evalúa una inversión ya hecha: hipoteca, alquiler, plusvalía real y costo de oportunidad.{fromValuador ? "" : " Pre-llenado con un caso de ejemplo."}</p>

          {fromValuador && (
            <div className="market-ref" style={{ marginBottom: 16 }}>
              <span className="market-ref-label">Tomamos el precio y los m² del valuador. Los demás campos son de ejemplo, ajústalos a tu caso.</span>
            </div>
          )}

          <div className="field">
            <label className="field-label">Tipo de compra</label>
            <div className="chips">
              {["financiado", "contado"].map((t) => (
                <span key={t} className={`chip ${form.tipoCompra === t ? "on" : ""}`} onClick={() => set("tipoCompra", t)} style={{ textTransform: "capitalize" }}>{t}</span>
              ))}
            </div>
          </div>

          <div className="row-2">
            {FIELDS.map((f) => (
              <div className="field" key={f.k}>
                <label className="field-label">
                  {f.l}{f.tip && <InfoTip>{f.tip}</InfoTip>}
                </label>
                <input
                  type={f.t}
                  value={form[f.k]}
                  onChange={(e) => {
                    if (f.k === "gastosNotariales") setNotarialesTouched(true);
                    set(f.k, e.target.value);
                  }}
                />
              </div>
            ))}
          </div>

          {errs && <div className="market-ref" style={{ background: "#FBEAE8", marginTop: 8 }}>
            <span className="market-ref-label" style={{ color: "var(--danger)" }}>{errs.join(" · ")}</span>
          </div>}

          <div className="cta-area">
            <button className="btn-eval" onClick={run} disabled={loading}>{loading ? "Calculando…" : "Calcular inversión"}</button>
          </div>
        </div>
      </div>

      {res && <Resultado res={res} />}
    </>
  );
}

function Resultado({ res }) {
  const ui = VERDICT_UI[res.verdict] || {};
  const fo = res.escenarios.financiado.optimista;
  const fc = res.escenarios.financiado.conservador;
  const co = res.escenarios.contado.optimista;
  const cc = res.escenarios.contado.conservador;

  return (
    <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
      <div className="panel-body">
        <div style={{ padding: "12px 14px", borderRadius: 10, background: ui.color, color: "#fff", marginBottom: 16, fontSize: 14, fontWeight: 500 }}>
          {ui.txt}
        </div>

        <AlertaDescarte d={res.descarteRapido} />

        <p className="panel-eyebrow">Resumen del periodo</p>
        <div className="row-3" style={{ marginBottom: 16 }}>
          <Stat l="Periodo evaluado" v={aniosMeses(res.tiempos.mesesTotales)} />
          <Stat
            l="Rentab. anual por alquiler"
            v={pct(res.ratios.netCapRate)}
            tip="Lo que te deja el alquiler cada año, ya descontados impuestos y gastos, comparado con el precio de compra (alquiler neto anual ÷ precio de compra). No incluye la subida de precio del inmueble."
          />
          <Stat
            l="Ganancia anual (conservador)"
            v={pct(res.escenarios?.[res.modo]?.conservador?.anualizadaPct)}
            tip="Rentabilidad total por año (alquiler + venta), ya ajustada por inflación, en el escenario conservador (el precio de venta más bajo). Es la mirada prudente del retorno."
          />
        </div>

        <p className="panel-eyebrow">Utilidad neta total (venta + alquiler)</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, margin: "8px 0 16px" }}>
          <thead><tr style={{ textAlign: "right", color: "var(--ink-60)" }}>
            <th style={{ textAlign: "left", fontWeight: 500, padding: "6px 0" }}>Escenario</th><th>Total</th><th>Anual</th>
          </tr></thead>
          <tbody>
            <Row l="Financiado · optimista" e={fo} />
            <Row l="Financiado · conservador" e={fc} />
            <Row l="Contado · optimista" e={co} />
            <Row l="Contado · conservador" e={cc} />
          </tbody>
        </table>

        {res.alquiler.autosuficiente === false && (
          <p className="field-hint" style={{ color: "var(--danger)" }}>
            ⚠ El alquiler no cubre la cuota: déficit de {soles(Math.abs(res.alquiler.flujoNetoMensual))} al mes.
          </p>
        )}

        <p className="panel-eyebrow" style={{ marginTop: 12 }}>Costo de oportunidad (capital propio)</p>
        <div className="market-ref">
          <span className="market-ref-label">Si ese capital iba a un depósito a plazo</span>
          <span className="market-ref-value">{soles(res.costoOportunidad.financiadoOptimista.altDeposito)}</span>
        </div>
        <p className="field-hint" style={{ marginTop: 6 }}>
          Capital propio invertido (real): {soles(res.capital.real)} · perdido solo por inflación: {soles(res.capital.perdidaPorInflacion)}.
        </p>

        {res.proyeccion && <Proyeccion p={res.proyeccion} />}
      </div>
    </div>
  );
}

function Proyeccion({ p }) {
  return (
    <>
      <div className="section-sep" style={{ height: 1, background: "var(--border)", margin: "22px 0" }} />
      <p className="panel-eyebrow">Proyección año a año (si mantienes la propiedad)</p>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Desde hoy, valor base {soles(p.base)} · plusvalía proyectada {pct(p.g)} al año · inflación {pct(p.pi)} al año.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "right", color: "var(--ink-60)" }}>
              <th style={{ textAlign: "left", fontWeight: 500, padding: "6px 0" }}>Año</th>
              <th>Valor inmueble</th>
              <th>Renta neta</th>
              <th>Rentab. total</th>
              <th>Inflación</th>
            </tr>
          </thead>
          <tbody>
            {p.filas.map((f) => {
              const gana = f.rentabilidadTotalPct >= f.inflacionAcumPct;
              return (
                <tr key={f.anio} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 0" }}>{f.anio}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{soles(f.valorInmueble)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{soles(f.rentaAnualNeta)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: gana ? "var(--green-text)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{pct(f.rentabilidadTotalPct)}</td>
                  <td style={{ textAlign: "right", color: "var(--ink-60)", fontVariantNumeric: "tabular-nums" }}>{pct(f.inflacionAcumPct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint" style={{ marginTop: 8 }}>
        Rentabilidad total = plusvalía acumulada + alquiler acumulado, sobre el valor base. En verde, los años en que le gana a la inflación.
      </p>
    </>
  );
}

const ALERTA = {
  rojo:     { bg: "#FBEAE8", border: "#C0392B", ink: "#8E2A20" },
  amarillo: { bg: "#FBF3E0", border: "#B8860B", ink: "#7A5A06" },
  verde:    { bg: "#E8F5F0", border: "#0B6E4F", ink: "#074535" },
};

function AlertaDescarte({ d }) {
  if (!d) return null;
  const c = ALERTA[d.nivel] || ALERTA.amarillo;
  const Item = ({ ok, q, detail }) => (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: ok ? "#0B6E4F" : "#C0392B", fontWeight: 700, lineHeight: 1.4 }}>{ok ? "✓" : "✗"}</span>
      <div>
        <div style={{ fontWeight: 600, color: "var(--ink)" }}>{q}</div>
        <div style={{ fontSize: 12, color: "var(--ink-60)" }}>{detail}</div>
      </div>
    </div>
  );
  return (
    <div style={{ background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.ink, marginBottom: 6 }}>En resumen</div>
      <div style={{ fontSize: 13, color: c.ink, lineHeight: 1.45, marginBottom: 12 }}>{d.mensaje}</div>
      <div style={{ fontSize: 13, display: "grid", gap: 10 }}>
        <Item ok={d.piso.superaInflacion}
          q="¿Le gana a la inflación?"
          detail={`sube ${pct(d.piso.plusvaliaAnualOptimista)} al año vs ${pct(d.piso.inflacionAnual)} de inflación`} />
        <Item ok={d.valla.superaDeposito}
          q="¿Rinde más que el banco?"
          detail={`${pct(d.valla.retornoTotalAnual)} al año vs ${pct(d.valla.depositoPlazo)} de un depósito a plazo`} />
      </div>
    </div>
  );
}

function Row({ l, e }) {
  const neg = e.utilidadTotal < 0;
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ padding: "8px 0" }}>{l}</td>
      <td style={{ textAlign: "right", fontWeight: 600, color: neg ? "var(--danger)" : "var(--green-text)", fontVariantNumeric: "tabular-nums" }}>{soles(e.utilidadTotal)}</td>
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(e.anualizadaPct)}</td>
    </tr>
  );
}

function Stat({ l, v, tip }) {
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--ink-60)", display: "flex", alignItems: "center" }}>
        {l}{tip && <InfoTip>{tip}</InfoTip>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
    </div>
  );
}
