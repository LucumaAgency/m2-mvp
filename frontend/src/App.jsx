import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getDistritos, valuar, TC_REF, DISTRITOS_FALLBACK, TIPO_MAP, slugify,
} from "./lib/api.js";

const STEPS = ["Ubicación", "Características", "Precio"];

const VERDICT_UI = {
  BAJO_MERCADO:  { letra: "A", color: "#0B6E4F", titulo: "Bajo el mercado", sub: "El precio está por debajo de comparables del distrito. Buena oportunidad de compra." },
  DENTRO_RANGO:  { letra: "B", color: "#B8860B", titulo: "Dentro del rango", sub: "El precio es coherente con el mercado de la zona." },
  SOBRE_MERCADO: { letra: "D", color: "#C0392B", titulo: "Sobre el mercado", sub: "El precio supera a comparables del distrito. Margen para negociar." },
};

export default function Valuador() {
  const [step, setStep] = useState(1);
  const [distritos, setDistritos] = useState(DISTRITOS_FALLBACK.map((n) => ({ name: n, slug: slugify(n) })));
  const [form, setForm] = useState({
    distrito: "", tipo: "Departamento", areaTotal: "", areaConst: "",
    dorm: "3", moneda: "S/ soles", precio: "620000", intent: "comprar",
  });
  const [urlBadge, setUrlBadge] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDistritos()
      .then((d) => { if (d?.districts?.length) setDistritos(d.districts); })
      .catch(() => { /* se queda con el fallback */ });
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function evaluar() {
    setError(null);
    const area = Number(form.areaConst || form.areaTotal);
    const distritoObj = distritos.find((d) => (d.slug || slugify(d.name)) === form.distrito)
      || distritos.find((d) => d.name === form.distrito);
    if (!distritoObj) { setError("Selecciona un distrito."); setStep(1); return; }
    if (!area || area < 10) { setError("Ingresa el área (m²)."); setStep(2); return; }

    const precioNum = Number(form.precio);
    const priceUsd = form.moneda.startsWith("USD") ? precioNum : precioNum / TC_REF;
    const bedrooms = form.dorm === "5 o más" ? 5 : Number(form.dorm);

    setLoading(true);
    try {
      const r = await valuar({
        district: distritoObj.slug || slugify(distritoObj.name),
        propertyType: TIPO_MAP[form.tipo] || "departamento",
        operation: "venta",
        area,
        bedrooms,
        priceUsd,
      });
      setResult(r);
    } catch (e) {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  if (result) return <Resultado result={result} form={form} onReset={() => setResult(null)} />;

  return (
    <>
      <nav>
        <span className="logo">valua<span>dor</span>.pe</span>
        <Link to="/inversion" className="nav-link">Calculadora de inversión →</Link>
      </nav>

      <div className="card">
        {/* Progress */}
        <div className="progress-header">
          <div className="step-track">
            {STEPS.map((name, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "active" : "pending";
              return (
                <React.Fragment key={name}>
                  <div className="step-item" onClick={() => setStep(n)} role="button">
                    <div className={`step-num ${state}`}>{n < step ? "✓" : n}</div>
                    <span className={`step-name ${state}`}>{name}</span>
                  </div>
                  {n < STEPS.length && <div className={`step-connector ${n < step ? "done" : ""}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="panel-body">
          {error && <div className="market-ref" style={{ background: "#FBEAE8", marginBottom: 16 }}>
            <span className="market-ref-label" style={{ color: "var(--danger)" }}>{error}</span>
          </div>}

          {/* PASO 1 */}
          <div className={`panel ${step === 1 ? "active" : ""}`}>
            <p className="panel-eyebrow">Paso 1 de 3</p>
            <h1 className="panel-title">¿Cuál es la propiedad?</h1>
            <p className="panel-sub">Pega el link del portal y llenamos los datos automáticamente, o ingrésalos tú.</p>

            <div className="field">
              <label className="field-label">Link de la propiedad</label>
              <span className="field-hint">Copia la URL de Urbania, Nexo o cualquier portal inmobiliario</span>
              <div className="url-wrap">
                <input type="url" placeholder="https://urbania.pe/inmueble/..." autoComplete="off"
                  onChange={(e) => { const v = e.target.value; setUrlBadge(v.length > 12 && (v.startsWith("http") || v.includes("urbania") || v.includes("nexo"))); }} />
                <div className={`url-detected ${urlBadge ? "show" : ""}`}>
                  <svg viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Autodetectado
                </div>
              </div>
            </div>

            <div className="or-divider">
              <div className="or-divider-line" /><span className="or-divider-text">o ingresa manualmente</span><div className="or-divider-line" />
            </div>

            <div className="field">
              <label className="field-label">Distrito</label>
              <select value={form.distrito} onChange={(e) => set("distrito", e.target.value)}>
                <option value="">Selecciona distrito</option>
                {distritos.map((d) => {
                  const slug = d.slug || slugify(d.name);
                  return <option key={slug} value={slug}>{d.name}</option>;
                })}
              </select>
            </div>

            <div className="field">
              <label className="field-label">Tipo de propiedad</label>
              <div className="chips">
                {Object.keys(TIPO_MAP).map((t) => (
                  <span key={t} className={`chip ${form.tipo === t ? "on" : ""}`} onClick={() => set("tipo", t)}>{t}</span>
                ))}
              </div>
            </div>

            <div className="btn-row">
              <span />
              <button className="btn-next" onClick={() => setStep(2)}>Continuar
                <svg viewBox="0 0 15 15" fill="none"><path d="M5.5 3.5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>

          {/* PASO 2 */}
          <div className={`panel ${step === 2 ? "active" : ""}`}>
            <p className="panel-eyebrow">Paso 2 de 3</p>
            <h1 className="panel-title">Características del inmueble</h1>
            <p className="panel-sub">Mientras más datos ingreses, más preciso será el score.</p>

            <div className="row-2">
              <div className="field">
                <label className="field-label">Área total (m²)</label>
                <input type="number" placeholder="ej: 90" value={form.areaTotal} onChange={(e) => set("areaTotal", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Área construida (m²)</label>
                <input type="number" placeholder="ej: 80" value={form.areaConst} onChange={(e) => set("areaConst", e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Dormitorios</label>
              <div className="chips">
                {["1", "2", "3", "4", "5 o más"].map((d) => (
                  <span key={d} className={`chip ${form.dorm === d ? "on" : ""}`} onClick={() => set("dorm", d)}>{d}</span>
                ))}
              </div>
            </div>

            <div className="btn-row">
              <button className="btn-back" onClick={() => setStep(1)}>
                <svg viewBox="0 0 15 15" fill="none"><path d="M9.5 3.5l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Atrás
              </button>
              <button className="btn-next" onClick={() => setStep(3)}>Continuar
                <svg viewBox="0 0 15 15" fill="none"><path d="M5.5 3.5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>

          {/* PASO 3 */}
          <div className={`panel ${step === 3 ? "active" : ""}`}>
            <p className="panel-eyebrow">Paso 3 de 3</p>
            <h1 className="panel-title">¿Cuánto piden por la propiedad?</h1>
            <p className="panel-sub">Comparamos este precio con el mercado y calculamos el score al instante.</p>

            <div className="field">
              <label className="field-label">Precio de venta</label>
              <div className="price-wrap">
                <select value={form.moneda} onChange={(e) => set("moneda", e.target.value)}>
                  <option>S/ soles</option><option>USD dólares</option>
                </select>
                <input type="number" placeholder="ej: 650000" value={form.precio} onChange={(e) => set("precio", e.target.value)} />
              </div>
            </div>

            <div className="section-sep" />

            <div className="field">
              <label className="field-label">¿Para qué evaluás?</label>
              <div className="intent-group">
                {[
                  { id: "comprar", icon: "🏠", t: "Quiero comprar esta propiedad", d: "Evalúo si el precio es justo antes de negociar" },
                  { id: "vender", icon: "💰", t: "Quiero vender una propiedad mía", d: "Busco el precio ideal para publicar" },
                  { id: "invertir", icon: "📊", t: "Solo quiero conocer el valor de mercado", d: "Referencia o inversión a futuro" },
                ].map((opt) => (
                  <div key={opt.id} className={`intent-option ${form.intent === opt.id ? "on" : ""}`} onClick={() => set("intent", opt.id)} role="radio" aria-checked={form.intent === opt.id}>
                    <div className="intent-icon">{opt.icon}</div>
                    <div className="intent-text"><div className="intent-title">{opt.t}</div><div className="intent-desc">{opt.d}</div></div>
                    <div className="intent-radio" />
                  </div>
                ))}
              </div>
            </div>

            <div className="cta-area">
              <button className="btn-eval" onClick={evaluar} disabled={loading}>
                <svg viewBox="0 0 20 20" fill="none"><path d="M6.5 10.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.8" /></svg>
                {loading ? "Evaluando…" : "Evaluar propiedad gratis"}
              </button>
              <div className="trust-bar">
                <div className="trust-item">Comparables reales del distrito</div>
                <div className="trust-item">Datos seguros y privados</div>
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn-back" onClick={() => setStep(2)}>
                <svg viewBox="0 0 15 15" fill="none"><path d="M9.5 3.5l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Atrás
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-60)" }}>Sin tarjeta de crédito</span>
            </div>
          </div>
        </div>
      </div>

      <p className="bottom-note">Los resultados son estimaciones basadas en data de mercado público.</p>
    </>
  );
}

function Resultado({ result, form, onReset }) {
  if (!result.ok) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="panel-body">
          <h1 className="panel-title">No pudimos evaluar</h1>
          <p className="panel-sub">{result.message || "Faltan comparables en esta zona. Prueba otro distrito o tipo."}</p>
          <button className="btn-next" onClick={onReset}>← Volver</button>
        </div>
      </div>
    );
  }

  const ui = result.has_price ? VERDICT_UI[result.verdict] : null;
  const m = result.market;

  return (
    <>
      <nav>
        <span className="logo">valua<span>dor</span>.pe</span>
        <a className="nav-link" onClick={onReset} style={{ cursor: "pointer" }}>← Nueva evaluación</a>
      </nav>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="panel-body">
          {ui && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: ui.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 600 }}>{ui.letra}</div>
              <div>
                <h1 className="panel-title" style={{ marginBottom: 2 }}>{ui.titulo}</h1>
                <p className="panel-sub" style={{ marginBottom: 0 }}>{ui.sub}</p>
              </div>
            </div>
          )}

          <p className="panel-eyebrow">Mercado en {result.district} · {result.property_type}</p>
          <div className="market-ref" style={{ marginTop: 6 }}>
            <span className="market-ref-label">Rango de precio por m² (USD)</span>
            <span className="market-ref-value">${m.p25} – ${m.p75}</span>
          </div>

          <div className="row-3" style={{ marginTop: 14 }}>
            <Stat label="P25 (USD/m²)" value={`$${m.p25}`} />
            <Stat label="Mediana" value={`$${m.p50}`} />
            <Stat label="P75" value={`$${m.p75}`} />
          </div>

          {result.has_price && (
            <div className="market-ref" style={{ marginTop: 14 }}>
              <span className="market-ref-label">Tu precio: ${result.input.price_usd_per_m2}/m²</span>
              <span className="market-ref-value">{result.diff_pct > 0 ? "+" : ""}{result.diff_pct}% vs mediana</span>
            </div>
          )}

          <p className="field-hint" style={{ marginTop: 14 }}>
            Basado en {result.n_comps} comparables ({result.strategy === "similares" ? "similares en área y dormitorios" : "del distrito completo"}).
          </p>

          <div className="section-sep" />
          <Link to="/inversion" className="btn-next" style={{ justifyContent: "center", width: "100%" }}>
            ¿Conviene como inversión? Calcúlalo →
          </Link>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--ink-60)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
