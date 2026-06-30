import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  getDistritos, valuar, TC_REF, DISTRITOS_FALLBACK, TIPO_MAP, slugify,
} from "./lib/api.js";

const STEPS = ["Ubicación", "Características", "Precio"];

const VERDICT_UI = {
  BAJO_MERCADO:  { letra: "A", color: "#0B6E4F", bg: "#E8F5F0", titulo: "Está barato", tag: "Bajo el mercado", sub: "Pagarías menos que propiedades parecidas en la zona. Buena señal para comprar." },
  DENTRO_RANGO:  { letra: "B", color: "#B8860B", bg: "#FBF3E0", titulo: "Precio normal", tag: "Dentro del rango", sub: "El precio va en línea con lo que se paga en la zona." },
  SOBRE_MERCADO: { letra: "C", color: "#C0392B", bg: "#FBEAE8", titulo: "Está caro", tag: "Sobre el mercado", sub: "Estás pagando más que propiedades parecidas. Hay margen para negociar." },
};

export default function Valuador() {
  const [step, setStep] = useState(1);
  const [distritos, setDistritos] = useState(DISTRITOS_FALLBACK.map((n) => ({ name: n, slug: slugify(n) })));
  const [form, setForm] = useState({
    distrito: "", tipo: "Departamento", areaTotal: "", areaConst: "",
    dorm: "3", moneda: "S/ soles", precio: "", intent: "comprar",
  });
  const [precioTouched, setPrecioTouched] = useState(false);
  const [estimate, setEstimate] = useState(null);   // {p50, area, distrito, nComps}
  const [estimating, setEstimating] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDistritos()
      .then((d) => { if (d?.districts?.length) setDistritos(d.districts); })
      .catch(() => { /* se queda con el fallback */ });
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function selectedDistrict() {
    return distritos.find((d) => (d.slug || slugify(d.name)) === form.distrito)
      || distritos.find((d) => d.name === form.distrito) || null;
  }

  // Estimado de mercado calculado en MongoDB: mediana USD/m² de PROPIEDADES
  // PARECIDAS (mismo distrito, tipo, área ±25%, dorms ±1) vía /api/valuar sin precio.
  async function fetchEstimate() {
    const d = selectedDistrict();
    const area = Number(form.areaTotal || form.areaConst);
    if (!d || !area || area < 10) { setEstimate(null); return null; }
    setEstimating(true);
    try {
      const r = await valuar({
        district: d.slug || slugify(d.name),
        propertyType: TIPO_MAP[form.tipo] || "departamento",
        operation: "venta",
        area,
        bedrooms: form.dorm === "5 o más" ? 5 : Number(form.dorm),
      });
      if (r?.ok && r.market?.p50) {
        const est = { p50: r.market.p50, area, distrito: r.district, nComps: r.n_comps };
        setEstimate(est);
        return est;
      }
      setEstimate(null); return null;
    } catch { setEstimate(null); return null; }
    finally { setEstimating(false); }
  }

  // Valor estimado en la moneda elegida = mediana $/m² × área.
  const estValue = (est, moneda = form.moneda) =>
    est ? Math.round(est.p50 * est.area * (moneda.startsWith("USD") ? 1 : TC_REF)) : null;

  // El input siempre arranca con el estimado de mercado (referencia). El usuario
  // lo puede reemplazar (sobre todo en "comprar", con lo que realmente le piden).
  const precioPara = (intent, est) => (est ? String(estValue(est)) : "");

  // Al llegar al paso 3: calcula el estimado y pre-llena el precio (si no fue editado).
  useEffect(() => {
    if (step !== 3) return;
    (async () => {
      const est = await fetchEstimate();
      if (!precioTouched) setForm((f) => ({ ...f, precio: precioPara(f.intent, est) }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function chooseIntent(id) {
    setForm((f) => ({ ...f, intent: id, precio: precioTouched ? f.precio : precioPara(id, estimate) }));
  }

  async function evaluar() {
    setError(null);
    // Valuación sobre ÁREA TOTAL (misma base que los comparables de la zona).
    const area = Number(form.areaTotal || form.areaConst);
    const distritoObj = distritos.find((d) => (d.slug || slugify(d.name)) === form.distrito)
      || distritos.find((d) => d.name === form.distrito);
    if (!distritoObj) { setError("Selecciona un distrito."); setStep(1); return; }
    if (!form.areaTotal || Number(form.areaTotal) < 10) { setError("Ingresa el área total (mínimo 10 m²)."); setStep(2); return; }

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

  const monedaSym = form.moneda.startsWith("USD") ? "$" : "S/ ";
  const INTENT_META = {
    comprar:  { precioLabel: "¿Cuánto te piden?",            hint: "Referencia de mercado" },
    vender:   { precioLabel: "¿A cuánto quieres vender?",    hint: "Precio sugerido" },
    invertir: { precioLabel: "Valor de mercado estimado",    hint: "Valor estimado" },
  };
  const im = INTENT_META[form.intent] || INTENT_META.comprar;

  return (
    <>
      <nav>
        <span className="logo">m2<span>peru</span>.com</span>
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
            <p className="panel-sub">Ingresa los datos de la propiedad que quieres evaluar.</p>

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
                <label className="field-label">
                  Área total (m²) <span style={{ color: "var(--danger)" }}>*</span>
                  <InfoTip>
                    Es el área que figura en el aviso o la partida (incluye todo). La usamos para
                    comparar contra propiedades similares, que están medidas con el mismo criterio.
                  </InfoTip>
                </label>
                <input type="number" placeholder="ej: 90" min="10" value={form.areaTotal} onChange={(e) => set("areaTotal", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">
                  Área construida (m²) <span className="optional">(opcional)</span>
                  <InfoTip>
                    Es el área techada. Es opcional y no cambia la valuación; se usa solo como dato
                    extra para la calculadora de inversión.
                  </InfoTip>
                </label>
                <input type="number" placeholder="ej: 80" min="10" value={form.areaConst} onChange={(e) => set("areaConst", e.target.value)} />
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
            <h1 className="panel-title">Un último paso</h1>
            <p className="panel-sub">Dinos para qué evalúas y revisa el precio. Calculamos el resultado al instante.</p>

            <div className="field">
              <label className="field-label">¿Para qué evaluás?</label>
              <div className="intent-group">
                {[
                  { id: "comprar", icon: "🏠", t: "Quiero comprar esta propiedad", d: "Evalúo si el precio que me piden es justo" },
                  { id: "vender", icon: "💰", t: "Quiero vender una propiedad mía", d: "Busco el precio ideal para publicar" },
                  { id: "invertir", icon: "📊", t: "Solo quiero conocer el valor de mercado", d: "Referencia o inversión a futuro" },
                ].map((opt) => (
                  <div key={opt.id} className={`intent-option ${form.intent === opt.id ? "on" : ""}`} onClick={() => chooseIntent(opt.id)} role="radio" aria-checked={form.intent === opt.id}>
                    <div className="intent-icon">{opt.icon}</div>
                    <div className="intent-text"><div className="intent-title">{opt.t}</div><div className="intent-desc">{opt.d}</div></div>
                    <div className="intent-radio" />
                  </div>
                ))}
              </div>
            </div>

            <div className="section-sep" />

            <div className="field">
              <label className="field-label">{im.precioLabel}</label>
              <div className="price-wrap">
                <select value={form.moneda} onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, moneda: v }));
                  if (!precioTouched && estimate)
                    setForm((f) => ({ ...f, moneda: v, precio: String(estValue(estimate, v)) }));
                }}>
                  <option>S/ soles</option><option>USD dólares</option>
                </select>
                <input type="number" placeholder="ej: 650000" value={form.precio}
                  onChange={(e) => { setPrecioTouched(true); set("precio", e.target.value); }} />
              </div>
              {estimating && <span className="field-hint" style={{ marginTop: 6 }}>Calculando estimado de mercado…</span>}
              {!estimating && estimate && (
                <span className="field-hint" style={{ marginTop: 6, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  {im.hint}: {monedaSym}{estValue(estimate).toLocaleString("es-PE")} · {estimate.area} m² × ${estimate.p50}/m²
                  <InfoTip>
                    Calculado con {estimate.nComps} propiedades parecidas a la tuya (mismo distrito, tipo,
                    área y dormitorios) de nuestra base.{" "}
                    {form.intent === "comprar" ? "Compáralo con lo que te piden." : "Es un punto de partida; ajústalo si lo necesitas."}
                  </InfoTip>
                </span>
              )}
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

  // Datos que se llevan a la calculadora de inversión (precio en S/.).
  const precioSoles = form.moneda.startsWith("USD") ? Number(form.precio) * TC_REF : Number(form.precio);
  const areaInput = Number(form.areaConst || form.areaTotal) || null;
  const invState = {
    precioCompra: Math.round(precioSoles) || undefined,
    area: areaInput || undefined,
  };

  // Posición del precio del usuario en la barra barato→caro y texto coloquial.
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const upm = result.has_price ? result.input.price_usd_per_m2 : null;
  const span = (m.p75 - m.p25) || 1;
  const pos = upm != null ? clamp((upm - m.p25) / span, 0, 1) * 100 : null;
  const aDiff = result.diff_pct != null ? Math.abs(result.diff_pct) : null;
  const diffText = !result.has_price ? null
    : aDiff < 2 ? "prácticamente en lo normal"
    : result.diff_pct < 0 ? `${aDiff}% más barato que lo normal`
    : `${result.diff_pct}% más caro que lo normal`;
  const tipoLabel = result.property_type
    ? result.property_type.charAt(0).toUpperCase() + result.property_type.slice(1)
    : "propiedad";

  return (
    <>
      <nav>
        <span className="logo">m2<span>peru</span>.com</span>
        <a className="nav-link" onClick={onReset} style={{ cursor: "pointer" }}>← Nueva evaluación</a>
      </nav>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="panel-body">
          {ui && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: ui.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 600 }}>{ui.letra}</div>
              <div>
                <h1 className="panel-title" style={{ marginBottom: 2, display: "flex", alignItems: "center" }}>
                  {ui.titulo}
                  <InfoTip>
                    En jerga inmobiliaria esto es «{ui.tag}». Comparamos tu precio por m² contra
                    el de propiedades parecidas: si cae en el 25% más económico decimos que está
                    barato (verde), si está en el 25% más caro está caro (rojo), y en el medio es
                    precio normal (ámbar).
                  </InfoTip>
                </h1>
                <p className="panel-sub" style={{ marginBottom: 0 }}>{ui.sub}</p>
              </div>
            </div>
          )}

          <p className="panel-eyebrow" style={{ display: "flex", alignItems: "center" }}>
            Precios en {result.district} · {tipoLabel}
            <InfoTip>
              Miramos propiedades parecidas a la tuya (mismo distrito, tipo, área y dormitorios)
              que están a la venta, y comparamos su precio por metro cuadrado. Así sabemos cuánto
              se paga normalmente en la zona.
            </InfoTip>
          </p>

          {/* Barra: barato → caro, con tu precio marcado */}
          <div className="vbar">
            {result.has_price && (
              <>
                <span className="vlabel" style={{ left: `${pos}%`, color: ui.color }}>Tú · ${upm}/m²</span>
                <span className="vmk" style={{ left: `${pos}%`, background: ui.color }} />
              </>
            )}
          </div>
          <div className="vbar-x">
            <span>Barato<br /><b>${m.p25}/m²</b></span>
            <span style={{ textAlign: "center" }}>Lo normal<br /><b>${m.p50}/m²</b></span>
            <span style={{ textAlign: "right" }}>Caro<br /><b>${m.p75}/m²</b></span>
          </div>
          <p className="field-hint" style={{ marginTop: 8, display: "flex", alignItems: "center" }}>
            «Lo normal» es el precio del medio
            <InfoTip>
              Es la mediana: si ordenas todas las propiedades parecidas por precio, es la del medio.
              La mitad cuesta más y la mitad menos. «Barato» y «Caro» marcan el 25% más económico y
              el 25% más caro de la zona.
            </InfoTip>
          </p>

          {result.has_price && ui && (
            <div style={{ marginTop: 14, background: ui.bg, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: ui.color, display: "flex", alignItems: "center" }}>
                Tu precio: ${upm}/m²
                <InfoTip>
                  Es el precio total dividido entre los metros cuadrados. Sirve para comparar
                  propiedades de distinto tamaño en igualdad de condiciones.
                </InfoTip>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: ui.color, textAlign: "right" }}>{diffText}</span>
            </div>
          )}

          <p className="field-hint" style={{ marginTop: 14, display: "flex", alignItems: "center" }}>
            Calculado con {result.n_comps} propiedades parecidas
            <InfoTip>
              Mientras más propiedades parecidas haya, más confiable es el resultado.{" "}
              {result.strategy === "similares"
                ? "Usamos las más parecidas en área y dormitorios."
                : "No había suficientes muy parecidas, así que usamos todo el distrito como referencia."}
            </InfoTip>
          </p>

          <div className="section-sep" />
          <Link to="/inversion" state={invState} className="btn-next" style={{ justifyContent: "center", width: "100%" }}>
            ¿Conviene como inversión? Calcúlalo →
          </Link>
        </div>
      </div>
    </>
  );
}

// Tooltip que se renderiza en un portal con posición fija, para escapar del
// overflow:hidden del card y de cualquier contenedor.
function InfoTip({ children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, place: "top" });
  const ref = useRef(null);

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const arriba = r.top > 170; // ¿hay espacio arriba?
    setPos({
      left: r.left + r.width / 2,
      top: arriba ? r.top - 8 : r.bottom + 8,
      place: arriba ? "top" : "bottom",
    });
  };
  const show = () => { place(); setOpen(true); };
  const hide = () => setOpen(false);

  return (
    <span
      ref={ref}
      className="itip"
      tabIndex={0}
      role="button"
      aria-label="Más información"
      onClick={(e) => { e.stopPropagation(); open ? hide() : show(); }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onBlur={hide}
    >
      <span className="itip-icon">i</span>
      {open && createPortal(
        <span
          className="itip-portal"
          style={{
            top: pos.top,
            left: pos.left,
            transform: pos.place === "top" ? "translate(-50%,-100%)" : "translate(-50%,0)",
          }}
        >
          {children}
        </span>,
        document.body
      )}
    </span>
  );
}
