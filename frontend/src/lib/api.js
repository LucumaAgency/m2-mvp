// Cliente del backend. En dev, Vite proxea /api → localhost:3000.

export async function getDistritos() {
  const r = await fetch("/api/distritos");
  if (!r.ok) throw new Error("No se pudo cargar distritos");
  return r.json();
}

export async function lookupUrl(url) {
  const r = await fetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return r.json();
}

export async function valuar(payload) {
  const r = await fetch("/api/valuar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function calcular(payload) {
  const r = await fetch("/api/calcular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

// TC referencial para convertir soles → USD cuando el valuador necesita USD.
// El catálogo de comparables está en USD/m². Ajustable.
export const TC_REF = 3.7;

// Distritos de respaldo si el backend (Mongo) no responde, para que el form
// siga siendo navegable.
export const DISTRITOS_FALLBACK = [
  "Miraflores", "San Isidro", "Barranco", "Surco", "La Molina",
  "San Borja", "Jesús María", "Lince", "Magdalena", "Pueblo Libre",
];

export const TIPO_MAP = {
  "Departamento": "departamento",
  "Casa": "casa",
  "Oficina": "oficina",
  "Local comercial": "local",
  "Terreno": "terreno",
};

// property_type del backend → etiqueta del chip
export const TIPO_REVERSE = Object.fromEntries(
  Object.entries(TIPO_MAP).map(([label, value]) => [value, label])
);

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
