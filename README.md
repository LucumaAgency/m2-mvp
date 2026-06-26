# Valuador PE (m2peru)

Web con dos herramientas sobre la misma base de propiedades scrapeadas (MongoDB Atlas):

1. **Valuador** — wizard de 3 pasos (ubicación → características → precio) que compara el precio contra los percentiles de comparables del distrito y devuelve un veredicto: **bajo mercado / dentro del rango / sobre mercado**.
2. **Calculadora de inversión** — modelo retrospectivo (port del Excel `docs/caso-surquillo-modelo-inversion.xlsx`) que evalúa una inversión ya hecha: hipoteca, alquiler, plusvalía real ajustada por inflación y costo de oportunidad.

- **Frontend**: React 18 + Vite (CSS propio, sin framework de estilos)
- **Backend**: Node 20+ + Express + driver oficial de MongoDB
- **Base de datos**: MongoDB Atlas (misma data que `scanner-inmobiliario-m2`)
- **Deploy**: GitHub Actions (build) → Webhook → Plesk Git pull → `deploy.sh` → Phusion Passenger

> Hermano de [`scanner-inmobiliario-m2`](../scanner-inmobiliario-m2): misma arquitectura de deploy y mismas piezas de backend (`db.js`, `valuator.js`). Ver ese README para el detalle fino de la config de Plesk.

---

## Estructura

```
m2peru/
├── backend/
│   ├── server.js            Express · /api/health · /api/distritos · /api/valuar · /api/calcular
│   ├── db.js                Cliente Mongo singleton (reutilizado del scanner)
│   ├── valuator.js          Comparables + percentiles (reutilizado del scanner)
│   ├── calculator.js        Modelo de inversión Caso Surquillo (port del Excel)
│   └── calculator.test.js   Tests que congelan equivalencia con el Excel
├── frontend/
│   ├── src/
│   │   ├── App.jsx          Valuador (wizard 3 pasos) + pantalla de resultado
│   │   ├── Inversion.jsx    Calculadora de inversión
│   │   ├── lib/api.js       Cliente del backend
│   │   ├── styles.css       Estilos (extraídos del HTML original)
│   │   └── main.jsx         Router: / (valuador) · /inversion
│   ├── dist/                Generado por GitHub Actions, committeado al repo
│   ├── index.html
│   └── vite.config.js
├── docs/
│   ├── caso-surquillo-modelo-inversion.xlsx   Excel fuente del modelo
│   └── evaluador-formulario.html              Mockup HTML original (referencia)
├── .github/workflows/build.yml
├── app.cjs                  Bootstrap CJS → ESM para Passenger
├── deploy.sh                Lo ejecuta Plesk tras cada git pull
└── .env.example
```

---

## Desarrollo local

```bash
cp .env.example .env        # editar MONGO_URI
npm run install:all
npm run dev:backend         # API en :3000
npm run dev:frontend        # UI en :5173 (proxy /api → :3000)
```

Producción local:

```bash
npm run build && npm start  # backend sirve API + frontend/dist en :3000
```

Tests del modelo de inversión:

```bash
npm test                    # node --test backend/*.test.js
```

---

## Endpoints

| Método | Path             | Descripción |
|--------|------------------|-------------|
| GET    | `/api/health`    | Sanity + estado Mongo |
| GET    | `/api/distritos` | Catálogo de distritos con stats (alimenta el selector) |
| POST   | `/api/valuar`    | `{district, propertyType, operation, area, bedrooms, priceUsd}` → veredicto + percentiles |
| POST   | `/api/calcular`  | Modelo de inversión Surquillo → escenarios + costo de oportunidad |

`/api/calcular` (campos mínimos): `precioCompra`, `area`, `fechaCompra`, `fechaEvaluacion`, `alquilerBrutoMensual`, `precioVentaOptimista`, `precioVentaConservador`. Si `tipoCompra=financiado` además: `fechaEntrega`, `cuotaHipoteca`, `saldoCapital`. El resto usa los supuestos por defecto del Excel (cap rate, IR, opex, comisión, etc.).

---

## Variables de entorno

| Nombre | Valor |
|---|---|
| `MONGO_URI` | connection string de Atlas |
| `MONGO_DB`  | `scanner_inmobiliario` (misma base que el scanner) |
| `PORT`      | `3000` |
| `NODE_ENV`  | `production` |

El backend no muere si Mongo no conecta: `/api/calcular` funciona igual (no usa la base); solo `/api/distritos` y `/api/valuar` requieren Atlas.

---

## Notas del modelo de inversión

El port en `calculator.js` reproduce los números del Excel (verificado en `calculator.test.js`: capital propio S/.72,183 nominal / S/.87,437 real, utilidad financiado optimista S/.3,160, etc.), con dos limpiezas respecto al original:

- Se eliminaron las celdas de scratch (`G229`/`G230`) y la métrica "por día" con 5 años hardcodeados; todo periodo se deriva de las fechas.
- Pendiente de decidir: el costo de oportunidad compara la utilidad (real) contra el rendimiento alternativo en términos nominales — fiel al Excel, pero conviene unificar a futuro.
```
