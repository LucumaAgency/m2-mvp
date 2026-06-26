import re, json

# ── 1) CSS de la landing, scopeado a %root% (clases globales + tags→clases) ──
html = open("/home/claude-user/m2peru/landing/index.html", encoding="utf-8").read()
css = re.search(r"<style>(.*?)</style>", html, re.DOTALL).group(1)

def strip_comments(s): return re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
def prefix_selectors(prelude, scope):
    out=[]
    for sel in prelude.split(","):
        s=sel.strip()
        if not s: continue
        if s=="*": out.append(f"{scope} *")
        elif s in ("html","body",":root"): out.append(scope)
        else: out.append(f"{scope} {s}")
    return ", ".join(out)
def scope(css, scope_sel):
    css=css.strip(); res=[]; i=0; n=len(css)
    while i<n:
        if css[i].isspace(): i+=1; continue
        j=css.find("{", i)
        if j==-1: break
        prelude=css[i:j].strip(); depth=0; k=j
        while k<n:
            if css[k]=="{": depth+=1
            elif css[k]=="}":
                depth-=1
                if depth==0: break
            k+=1
        inner=css[j+1:k]
        if prelude.startswith("@"):
            at=prelude.split(None,1)[0].lower()
            if at in ("@media","@supports"): res.append(prelude+"{"+scope(inner,scope_sel)+"}")
            else: res.append(prelude+"{"+inner+"}")
        else: res.append(prefix_selectors(prelude,scope_sel)+"{"+inner+"}")
        i=k+1
    return "".join(res)

master = scope(strip_comments(css), "%root%")
# tags estructurales → clases (Bricks no siempre respeta el tag custom)
master = master.replace("%root% section", "%root% .sec")
master = master.replace("%root% nav", "%root% .navbar")
master = master.replace("%root% footer", "%root% .ftr")
# clases auxiliares (sustituyen los inline-styles de la landing)
master += (
  "%root% .lead-lg{font-size:18px;max-width:640px}"
  "%root% .vp-3{grid-template-columns:repeat(3,1fr)}"
  "@media(max-width:860px){%root% .vp-3{grid-template-columns:1fr}}"
  "%root% .stat-dark{background:#0a3a2c}"
  "%root% .stat-dark .n{color:#fff}%root% .stat-dark .l{color:#A9CFC2}"
  "%root% .mk-30{left:30%}"
  "%root% .center-head{margin-left:auto;margin-right:auto}"
)

# ── 2) Constructor de árbol Bricks ──
elements=[]; by_id={}; gc={}; n=[0]
def cls(*names):
    ids=[]
    for nm in names:
        if nm not in gc: gc[nm]=f"mcl{len(gc):03d}"
        ids.append(gc[nm])
    return ids
def E(name, parent, classes=None, settings=None, tag=None, custom=None, text=None, htag=None, link=None):
    n[0]+=1; eid=f"me{n[0]:03d}"
    s={}
    if classes: s["_cssGlobalClasses"]=cls(*classes)
    if tag: s["tag"]=tag
    if custom: s["_cssCustom"]=custom
    if text is not None: s["text"]=text
    if htag: s["tag"]=htag
    if link is not None: s["link"]={"type":"external","url":link}
    if settings: s.update(settings)
    e={"id":eid,"name":name,"parent":parent if parent else 0,"children":[],"settings":s}
    elements.append(e); by_id[eid]=e
    if parent and parent in by_id: by_id[parent]["children"].append(eid)
    return eid
def H(parent,text,htag,classes=None,custom=None): return E("heading",parent,classes,{"text":text,"tag":htag},custom=custom)
def T(parent,text,classes=None,custom=None,tag="p"): return E("text-basic",parent,classes,{"text":text,"tag":tag},custom=custom)
def DIV(parent,classes=None,tag=None,custom=None): return E("div",parent,classes,tag=tag,custom=custom)
def BTN(parent,text,link,classes): return E("button",parent,classes,{"text":text,"link":{"type":"external","url":link}})

# raíz: lleva TODO el CSS maestro y las variables
root = E("section","0",classes=["m2"],custom=master, tag="section")

GREEN="var(--green)"

# ── NAV ──
nav=DIV(root,["navbar"],tag="nav"); navw=DIV(nav,["wrap"])
H(navw,'m2<span class="pe">peru</span>.com',"div",["wordmark"])
nl=DIV(navw,["nav-links"])
T(nl,"Cómo funciona",["hide-sm"],tag="a"); # nota: enlaces simples como texto
E("text-basic",nl,["hide-sm"],{"text":"Herramientas","tag":"a"})
E("text-basic",nl,["hide-sm"],{"text":"Por qué confiar","tag":"a"})
BTN(nl,"Evaluar gratis","/",["btn","btn-green"])

# ── HERO ──
hero=DIV(root,["hero"],tag="header"); hw=DIV(hero,["wrap"])
hl=DIV(hw)  # col izquierda
T(hl,'<span class="d"></span>Gratis · sin tarjeta · resultado al instante',["badge-pill"],tag="span")
H(hl,"¿Estás pagando lo justo<br>por esa propiedad?","h1")
T(hl,"m2peru te dice en segundos si el precio está bajo, dentro o sobre el mercado de su distrito. Y si la evalúas como inversión, te dice si de verdad va a tener retorno, una vez descontadas hipoteca, alquiler e inflación.",["sub"])
cr=DIV(hl,["cta-row"])
BTN(cr,"Evaluar mi propiedad","/",["btn","btn-green","btn-lg"])
BTN(cr,"Ver cómo funciona","#como",["btn","btn-ghost","btn-lg"])
tr=DIV(hl,["trust"])
T(tr,'<b style="color:var(--green)">✓</b> Comparables reales del distrito',tag="span")
T(tr,'<b style="color:var(--green)">✓</b> Inflación oficial BCRP',tag="span")
T(tr,'<b style="color:var(--green)">✓</b> Sin jerga',tag="span")
# mock card
mock=DIV(hw,["mock"]); top=DIV(mock,["top"])
H(top,'m2<span class="pe">peru</span>.com',"div",["wm"]); T(top,"Resultado",["step"],tag="span")
sr=DIV(mock,["score-row"])
T(sr,"A",["scorebadge"],custom="%root%{background:var(--green)}")
sb=DIV(sr); H(sb,"Bajo el mercado","div"); T(sb,"El precio está por debajo de comparables del distrito.")
pbar=DIV(mock,["pbar"]); T(pbar,"Tu precio",["mk","mk-30","tnum"])
px=DIV(mock,["pbar-x","tnum"]); T(px,"$2,400",tag="span"); T(px,"Mediana $2,640",tag="span"); T(px,"$2,900",tag="span")
ma=DIV(mock,["mini-alert"])
T(ma,"En resumen · como inversión",["t"])
T(ma,'<b>✓</b> ¿Le gana a la inflación? 6.1% vs 4.1%',["l"])
T(ma,'<b>✓</b> ¿Rinde más que el banco? 7.4% vs 4.5%',["l"])

# ── PROBLEMA ──
band1=DIV(root,["sec","band"],tag="section"); b1=DIV(band1,["wrap"])
T(b1,"El problema",["eyebrow"])
H(b1,"El mercado inmobiliario<br>está lleno de humo","h2")
T(b1,"«Esta zona se está revalorizando», «es una gran inversión», «el precio es de oportunidad». Frases que venden, pero que nadie respalda con números. Así se compra caro y se invierte en lo que no rinde.",["lead-lg"])
pain=DIV(b1,["pain"])
for q,h,p in [("🤷","No sabes si el precio es justo","Te dan un número y no tienes con qué compararlo. El que vende decide la conversación."),
              ("📈","«Plusvalía» que engaña","El precio sube, pero si no le gana a la inflación, en realidad estás perdiendo poder adquisitivo."),
              ("🏦","Retorno que no existe","Con hipoteca, comisiones e impuestos, muchas «inversiones» rinden menos que el banco.")]:
    c=DIV(pain,["p"]); T(c,q,["q"]); H(c,h,"h3"); T(c,p)

# ── VALUE PROPS ──
vp=DIV(root,["sec"],tag="section"); vw=DIV(vp,["wrap"])
sh=DIV(vw,["section-head"]); T(sh,"Lo que resuelve",["eyebrow"]); H(sh,"Dos preguntas, respondidas con datos","h2")
T(sh,"No es un portal de avisos. Es un evaluador que te pone del lado del que decide, no del que vende.")
vpg=DIV(vw,["vp"])
def vcard(parent,icon,title,desc,bullets):
    c=DIV(parent,["vcard"]); ic=DIV(c,["vicon"]); T(ic,icon,custom="%root%{font-size:24px}")
    H(c,title,"h3"); T(c,desc)
    ul=DIV(c,custom="%root%{margin-top:18px}")
    for b in bullets: T(ul,f'<b style="color:var(--green)">✓</b>&nbsp; {b}',custom="%root%{font-size:14px;margin-bottom:9px}")
vcard(vpg,"🔎","¿Compras a buen precio?","Comparamos el precio contra los percentiles de propiedades reales del mismo distrito, área y dormitorios. Te decimos en una palabra: bajo, dentro o sobre el mercado.",
      ["Rango de precio por m² de la zona","Cuánto estás por encima o debajo de la mediana","Munición real para negociar"])
vcard(vpg,"🧮","¿Va a tener retorno?","La calculadora toma el caso completo —hipoteca, alquiler, plusvalía e inflación— y te dice sin maquillaje si la inversión vale la pena frente a alternativas seguras.",
      ["¿La ganancia le gana a la inflación?","¿Rinde más que un depósito a plazo?","Cuánto te cuesta el alquiler que no cubre la cuota"])

# ── COMO FUNCIONA ──
como=DIV(root,["sec"],tag="section",custom="%root%{background:var(--bg)}"); cw=DIV(como,["wrap"])
sh2=DIV(cw,["section-head"]); T(sh2,"Cómo funciona",["eyebrow"]); H(sh2,"Tres pasos, treinta segundos","h2")
T(sh2,"Sin registro para empezar. Llenas lo básico y al instante tienes el veredicto.")
steps=DIV(cw,["steps"])
for nn,h,p in [("1","Ubicación","Eliges el distrito y el tipo de propiedad. Solo lo esencial."),
               ("2","Características","Área, dormitorios y poco más. Mientras más datos, más preciso el resultado."),
               ("3","Precio y veredicto","Pones el precio y al instante ves si es justo, y si conviene como inversión.")]:
    st=DIV(steps,["step"]); T(st,nn,["n"]); H(st,h,"h3"); T(st,p)
cc=DIV(cw,custom="%root%{text-align:center;margin-top:44px}")
BTN(cc,"Probar ahora, gratis","/",["btn","btn-green","btn-lg"])

# ── HONESTIDAD ──
hon=DIV(root,["sec","band"],tag="section"); hnw=DIV(hon,["wrap"])
T(hnw,"Por qué somos distintos",["eyebrow"])
H(hnw,'Te decimos la verdad,<br><span class="hl">aunque no sea la que querías oír.</span>',"div",["quote"])
T(hnw,"Una propiedad puede subir de precio y aun así hacerte perder plata. Si la apreciación no le gana a la inflación, y el alquiler no cubre la cuota, esa «gran inversión» rinde menos que dejar el dinero en el banco. La mayoría de herramientas te muestran solo lo bonito. Nosotros te mostramos el número real.",["lead-lg"])
hs=DIV(hnw,["stats"])
for nm,l in [("21.2%","Inflación acumulada que erosiona tu capital"),("4.5%","Lo que rinde el banco, sin riesgo"),
             ("S/&$","Cálculos en soles y dólares"),("BCRP","Inflación oficial 2010–2026")]:
    s=DIV(hs,["stat","stat-dark"]); T(s,nm,["n"]); T(s,l,["l"])

# ── CONFIANZA ──
conf=DIV(root,["sec"],tag="section"); cfw=DIV(conf,["wrap"])
sh3=DIV(cfw,["section-head"]); T(sh3,"Por qué confiar",["eyebrow"]); H(sh3,"Datos reales, lenguaje claro","h2")
T(sh3,"Nada de cifras infladas ni promesas. Todo lo que decimos se apoya en datos que puedes verificar.")
cfg=DIV(cfw,["vp","vp-3"])
for icon,h,p in [("📊","Comparables reales","Percentiles de propiedades publicadas en el mismo distrito, no un promedio inventado."),
                 ("⏱️","Inflación oficial","Usamos la inflación del BCRP año por año para mostrar tu ganancia real, no la nominal."),
                 ("💬","Sin jerga","Nada de «cap rate» ni «plusvalía anualizada». Preguntas que cualquiera entiende.")]:
    c=DIV(cfg,["vcard"]); ic=DIV(c,["vicon"]); T(ic,icon,custom="%root%{font-size:24px}")
    H(c,h,"h3",custom="%root%{font-size:19px}"); T(c,p)

# ── FAQ ──
faq=DIV(root,["sec"],tag="section",custom="%root%{background:var(--bg)}"); fw=DIV(faq,["wrap"])
sh4=DIV(fw,["section-head","center-head"],custom="%root%{text-align:center}")
T(sh4,"Preguntas frecuentes",["eyebrow"]); H(sh4,"Lo que todos preguntan","h2")
fq=DIV(fw,["faq"])
for q,a in [("¿De dónde sacan los precios de mercado?","De propiedades reales publicadas en los portales inmobiliarios del Perú. Calculamos los percentiles (P25, mediana, P75) por distrito, tipo y tamaño, para comparar tu caso con propiedades parecidas."),
            ("¿Es gratis?","Sí. Evaluar una propiedad y calcular su retorno como inversión es gratis y no necesitas tarjeta."),
            ("¿Qué necesito para la calculadora de inversión?","Lo básico de tu caso: precio de compra, área, alquiler estimado y, si es financiado, la cuota y el saldo de tu crédito. El resto lo asumimos con supuestos de mercado que puedes ajustar."),
            ("¿Por qué una propiedad que sube de precio puede ser mala inversión?","Porque «subir de precio» no es lo mismo que «ganar». Si la subida no le gana a la inflación, pierdes poder adquisitivo. Y si el alquiler no cubre la cuota, pones plata de tu bolsillo cada mes.")]:
    it=DIV(fq,custom="%root%{border-bottom:1px solid var(--border);padding:20px 0}")
    H(it,q,"div",custom="%root%{font-weight:600;font-size:17px}")
    T(it,a,custom="%root%{font-size:15px;color:var(--ink-60);margin-top:12px}")

# ── CTA FINAL ──
ctas=DIV(root,["sec"],tag="section"); ctw=DIV(ctas,["wrap"])
cf=DIV(ctw,["cta-final"]); inr=DIV(cf,["inner"])
H(inr,"Antes de firmar, evalúalo.","h2")
T(inr,"Treinta segundos pueden ahorrarte una mala compra o una inversión que no rinde.")
BTN(inr,"Evaluar mi propiedad gratis","/",["btn","btn-white","btn-lg"])

# ── FOOTER ──
ft=DIV(root,["ftr"],tag="footer"); fr=DIV(ft,["wrap"])
row=DIV(fr,["row"]); H(row,'m2<span class="pe">peru</span>.com',"div",["wordmark"])
lk=DIV(row,["links"])
for t in ["Cómo funciona","Herramientas","Por qué confiar","Evaluar gratis"]: T(lk,t,tag="a")
T(fr,"m2peru · El valor real de tu metro cuadrado. · Los resultados son estimaciones basadas en data de mercado público.",["copy"])

# CTAs → app en Plesk
APP="https://m2mvp.pruebalucuma.site"
for e in elements:
    lk=e["settings"].get("link")
    if isinstance(lk,dict) and lk.get("url")=="/": lk["url"]=APP

# ── 3) globalClasses + ensamblado (formato copiar/pegar de Bricks) ──
global_classes=[{"id":cid,"name":nm,"settings":{}} for nm,cid in gc.items()]
template={
  "content":elements,
  "source":"bricksCopiedElements",
  "sourceUrl":"https://m2peru.com",
  "version":"1.9.9",
  "globalClasses":global_classes,
  "globalElements":[],
}
out="/home/claude-user/m2peru/landing/m2peru-bricks-native.json"
json.dump(template, open(out,"w",encoding="utf-8"), ensure_ascii=False, indent=2)

# sanity
js=json.load(open(out,encoding="utf-8"))
els=js["content"]
ids=[e["id"] for e in els]
assert len(ids)==len(set(ids)),"ids duplicados"
# todos los parents existen
idset=set(ids)|{ "0",0}
bad=[e["id"] for e in els if e["parent"] not in idset]
print("elementos:",len(els),"| clases:",len(global_classes),"| parents huérfanos:",bad)
# children consistentes
for e in els:
    for ch in e["children"]:
        assert ch in idset, f"child {ch} inexistente"
print("OK · árbol consistente · root:",els[0]["id"], els[0]["name"])
