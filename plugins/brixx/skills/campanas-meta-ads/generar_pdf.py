# brixx · PDF editable de campaña Meta Ads (3 páginas, A4 horizontal)
# Uso: python generar_pdf.py <carpeta>   (la carpeta tiene datos.json + img/<key>.jpg)
import json, pathlib, base64, html, re, sys
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (DictionaryObject, NameObject, TextStringObject, ArrayObject,
                           FloatObject, NumberObject, BooleanObject, StreamObject)

HERE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
D = json.loads((HERE / "datos.json").read_text(encoding="utf-8"))
OUT = HERE / D.get("archivo", "Campana-Meta-Ads.pdf")
esc = html.escape
P = D["productos"]
assert 3 <= len(P) <= 6, "entre 3 y 6 productos"

def img(key):
    f = HERE / "img" / f"{key}.jpg"
    return "data:image/jpeg;base64," + base64.b64encode(f.read_bytes()).decode() if f.exists() else ""

def fld(name, value):
    # el campo editable del PDF se dibuja encima de este marcador invisible; mismo nombre = mismo valor en todo el PDF
    return f'<span class="f" data-f="{name}" data-v="{esc(value)}">{esc(value)}</span>'

def tpl(text, p=None):
    t = esc(text).replace("\n", "<br>")
    if p:
        t = t.replace("{promo}", fld(f"promo_{p['key']}", p["promo"])).replace("{venta}", fld(f"venta_{p['key']}", p["venta"]))
    for k, v in D.get("campos", {}).items():
        t = t.replace("{" + k + "}", fld(k, v))
    return t

CSS = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --ink:#0A0A0B; --paper:#F4F4F1; --line:#DEDED8; --muted:#66666C; --nova:#2B59FF; --ok:#15803D; }
body { font-family: Inter, 'Segoe UI', 'Noto Color Emoji', 'Segoe UI Emoji', sans-serif; color: var(--ink); font-size: 7.5pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 297mm; height: 210mm; position: relative; overflow: hidden; background: var(--paper); padding: 8mm 10mm 0; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.D { font-family: 'Inter Display', Inter, 'Segoe UI', sans-serif; letter-spacing: -0.03em; }
.logo { display: inline-flex; align-items: center; gap: .32em; font-family: 'Inter Display', Inter, 'Segoe UI'; font-weight: 700; letter-spacing: -0.035em; line-height: 1; }
.logo svg { height: .95em; width: auto; }
.eyebrow { font-size: 6.5pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--nova); }
.foot { position: absolute; left: 10mm; right: 10mm; bottom: 4.5mm; display: flex; justify-content: space-between; font-size: 6.5pt; color: var(--muted); }
.f { display: inline-block; color: transparent !important; white-space: nowrap; }
.hero { background: var(--ink); color: #fff; border-radius: 4mm; padding: 6mm 7mm; }
.hero .top { display: flex; justify-content: space-between; align-items: baseline; font-size: 7pt; color: rgba(255,255,255,.65); }
.hero h1 { font-size: 22pt; line-height: 1.05; margin: 3mm 0 4.5mm; font-weight: 700; }
.hero h1 span { color: #8FA8FF; }
.kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2.5mm; }
.kpi { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); border-radius: 2.5mm; padding: 2.6mm 3mm; }
.kpi small { display:block; font-size: 5.8pt; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.6); font-weight: 600; margin-bottom: 1mm; }
.kpi b { font-size: 11pt; font-weight: 700; letter-spacing: -.02em; line-height: 1.15; display: block; }
.kpi em { font-style: normal; display:block; font-size: 6.4pt; color: rgba(255,255,255,.7); margin-top: .6mm; }
.grid1 { display: grid; grid-template-columns: 1.62fr 1fr; gap: 4.5mm; margin-top: 4.5mm; }
h2 { font-size: 11.5pt; letter-spacing: -.02em; margin: 1mm 0 2mm; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 2.5mm; overflow: hidden; }
th { font-size: 5.8pt; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); text-align: left; padding: 1.8mm 2mm; background: #FAFAF7; font-weight: 600; white-space: nowrap; }
td { padding: 1.3mm 2mm; border-top: 1px solid var(--line); vertical-align: middle; font-size: 7.4pt; }
td.r, th.r { text-align: right; }
.prod { display: flex; align-items: center; gap: 2.2mm; min-width: 50mm; }
.prod img { width: 9mm; height: 9mm; object-fit: contain; background: #fff; border: 1px solid var(--line); border-radius: 1.5mm; }
.prod b { display:block; font-weight: 600; }
.prod small { color: var(--muted); font-size: 6.2pt; white-space: nowrap; }
.edit { background: #EEF2FF; border: 1px dashed #9DB0FF; border-radius: 1.2mm; padding: .5mm 1.4mm; font-weight: 700; }
.note { font-size: 6.4pt; color: var(--muted); margin-top: 1.6mm; }
.cut td { font-size: 6.6pt; padding: 1.2mm 2mm; }
.ok { color: var(--ok); font-weight: 600; } .bad { color: #B42318; font-weight: 600; }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; margin-top: 3.5mm; }
.step { background: #fff; border: 1px solid var(--line); border-radius: 2.5mm; padding: 2.5mm 3mm; }
.step b { display: block; font-size: 8.5pt; margin-bottom: .6mm; }
.step b i { font-style: normal; color: var(--nova); margin-right: 1.2mm; }
.step span { font-size: 6.6pt; color: #3A3A40; }
.ph { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2.4mm; }
.ph h2 { margin: 0; font-size: 11.5pt; }
.ph .sub { font-size: 6.6pt; color: var(--muted); margin-top: .6mm; } .ph .sub b { color: var(--ink); }
.legend { display: flex; gap: 4mm; font-size: 6.6pt; color: var(--muted); align-items: center; }
.chip { display:inline-block; padding: .4mm 1.6mm; border-radius: 1mm; font-size: 5.8pt; font-weight: 700; color: #fff; letter-spacing: .06em; }
.chip.v { background: #E0362C; } .chip.i { background: var(--nova); }
.row { display: grid; grid-template-columns: 31mm 1fr 1fr 1fr; gap: 2.4mm; background: #fff; border: 1px solid var(--line); border-radius: 3mm; padding: 2.2mm; margin-bottom: 2.2mm; height: 55mm; }
.info { display: flex; flex-direction: column; gap: 1.4mm; border-right: 1px solid var(--line); padding-right: 2.4mm; }
.info .pic { width: 100%; height: 19mm; object-fit: contain; background: #fff; }
.info h3 { font-size: 9pt; line-height: 1.12; letter-spacing: -.02em; }
.info small { color: var(--muted); font-size: 6pt; }
.info .pr { display: flex; justify-content: space-between; align-items: center; font-size: 6.6pt; }
.info .pr.st { flex-direction: column; align-items: flex-start; gap: .5mm; }
.info .pr .edit { font-size: 8pt; }
.ang { display: grid; grid-template-columns: 28mm 1fr; gap: 2.4mm; min-width: 0; }
.mock { position: relative; width: 28mm; height: 49.8mm; border-radius: 2.6mm; overflow: hidden; background: var(--bg); }
.mock .ov { position: absolute; left: 2mm; right: 2mm; top: 3.2mm; text-align: center; color: #fff; font-weight: 800; font-size: 7.6pt; line-height: 1.12; letter-spacing: -.02em; text-shadow: 0 .3mm 1mm rgba(0,0,0,.35); }
.mock .card { position: absolute; left: 2.4mm; right: 2.4mm; top: 15mm; height: 25mm; background: #fff; border-radius: 2mm; display: flex; align-items: center; justify-content: center; gap: .6mm; padding: 1mm; }
.mock .card img { max-width: 100%; max-height: 100%; object-fit: contain; }
.mock .card.two img { max-width: 49%; }
.mock .play { position: absolute; left: 50%; top: 27.5mm; width: 8mm; height: 8mm; margin: -4mm 0 0 -4mm; border-radius: 50%; background: rgba(0,0,0,.55); border: .5mm solid #fff; }
.mock .play::after { content: ""; position: absolute; left: 3mm; top: 2mm; border-left: 2.6mm solid #fff; border-top: 1.6mm solid transparent; border-bottom: 1.6mm solid transparent; }
.mock .cta { position: absolute; left: 2.5mm; right: 2.5mm; bottom: 6.6mm; height: 4.4mm; border-radius: 1mm; background: rgba(255,255,255,.95); color: var(--ink); font-size: 5.6pt; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.mock .fmt { position: absolute; left: 0; right: 0; bottom: 1.6mm; text-align: center; font-size: 5.2pt; color: rgba(255,255,255,.85); letter-spacing: .08em; font-weight: 600; }
.copy { display: flex; flex-direction: column; gap: 1mm; min-width: 0; }
.copy .an { display: flex; justify-content: space-between; align-items: center; }
.copy .an b { font-size: 7pt; }
.copy .pt { font-size: 6.2pt; line-height: 1.3; color: #1F1F23; }
.copy .lbl { font-size: 5.4pt; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
.copy .tt { font-size: 7pt; font-weight: 700; line-height: 1.15; }
.copy .br { font-size: 5.9pt; color: var(--muted); font-style: italic; line-height: 1.25; margin-top: auto; border-top: 1px dashed var(--line); padding-top: 1mm; }
.next { display: grid; grid-template-columns: 1.4fr 1fr; gap: 4mm; }
.next.three { grid-template-columns: 1fr 1fr 1.15fr; }
.box.aud { border-color: #9DB0FF; background: #F5F7FF; }
.box { background: #fff; border: 1px solid var(--line); border-radius: 3mm; padding: 3mm 4mm; }
.box ul { padding-left: 3.6mm; font-size: 6.8pt; display: grid; gap: .8mm; }
.box h3 { font-size: 9pt; margin-bottom: 1.6mm; }
.noimg { display: flex; align-items: center; justify-content: center; text-align: center; background: #EEF0F6; color: #3A3A40; font-size: 6pt; font-weight: 700; border-radius: 1.5mm; padding: 1mm; width: 100%; height: 100%; overflow: hidden; }
.prod .noimg { width: 9mm; height: 9mm; flex: none; font-size: 0; }
.info .noimg.pic { height: 19mm; font-size: 7pt; }
"""

def logo(pt, dark):
    top = "#FFFFFF" if dark else "#0A0A0B"
    mark = (f'<svg viewBox="0 0 40 40"><rect x="22" y="0" width="18" height="18" rx="4.5" fill="{top}"/>'
            '<rect x="0" y="22" width="18" height="18" rx="4.5" fill="#2D61FE"/><rect x="22" y="22" width="18" height="18" rx="4.5" fill="#C4CFFE"/></svg>')
    return f'<span class="logo" style="font-size:{pt}pt;color:{top}">{mark}brixx</span>'

NPAGES = 1 + (len(P) + 2) // 3
def foot(n):
    return (f'<div class="foot"><span>{logo(9, False)} &nbsp;·&nbsp; Propuesta para {esc(D["cliente"])} · {esc(D["fecha"])}</span>'
            f'<span>{esc(D.get("contacto", ""))} &nbsp;·&nbsp; {n} / {NPAGES}</span></div>')

def page1():
    rows = "".join(f"""<tr><td><div class="prod">{pic_html(p)}<div><b>{esc(p['nombre'])}</b><small>{esc(p.get('codigo', ''))}</small></div></div></td>
      <td class="r">{esc(p['costo'])}</td><td class="r"><span class="edit">{fld('venta_'+p['key'], p['venta'])}</span></td>
      <td><small style="color:var(--muted)">{esc(p['promo_label'])}</small> <span class="edit">{fld('promo_'+p['key'], p['promo'])}</span></td>
      <td class="r">{esc(p['cpa'])}</td><td class="r">{esc(p['max_evento'])}</td><td class="r">{esc(p['cpc'])}</td><td class="r">{esc(p['cpm'])}</td></tr>""" for p in P)
    kpis = "".join(f'<div class="kpi"><small>{esc(k["label"])}</small><b class="D">{tpl(k["valor"])}</b><em>{tpl(k["nota"])}</em></div>' for k in D["kpis"][:6])
    cuts = "".join(f'<tr><td>{esc(a)}</td><td class="ok">{esc(b)}</td><td class="bad">{esc(c)}</td></tr>' for a, b, c in D["cortes"])
    steps = "".join(f'<div class="step"><b class="D"><i>{i+1:02d}</i>{esc(t)}</b><span>{esc(x)}</span></div>' for i, (t, x) in enumerate(D["pasos"][:4]))
    return f"""<section class="page"><div class="hero"><div class="top">{logo(17, True)}<span>Propuesta para {esc(D['cliente'])} · {esc(D['fecha'])}</span></div>
    <h1 class="D">{esc(D['titulo'])} <span>· {esc(D['subtitulo'])}</span></h1><div class="kpis">{kpis}</div></div>
  <div class="grid1"><div><div class="eyebrow">Productos y precios</div><h2 class="D">{esc(D['productos_titulo'])}</h2>
      <table><tr><th>Producto</th><th class="r">Costo</th><th class="r">Precio</th><th>{esc(D['columna_promo'])}</th><th class="r">CPA equil.</th><th class="r">{esc(D['columna_evento'])}</th><th class="r">CPC máx.</th><th class="r">CPM máx.</th></tr>{rows}</table>
      <p class="note">{esc(D['nota_productos'])}</p></div>
    <div><div class="eyebrow">Cómo se decide</div><h2 class="D">Cortes a las 48–72 h</h2><table class="cut"><tr><th>Métrica</th><th>Seguir</th><th>Cortar</th></tr>{cuts}</table>
      <p class="note">{esc(D['nota_cortes'])}</p></div></div>
  <div class="steps">{steps}</div>{foot(1)}</section>"""

def pic_html(p, cls=""):
    src = img(p["key"])
    if src: return f'<img class="{cls}" src="{src}">'
    return f'<div class="noimg {cls}">{esc(p["nombre"])}</div>'

def mock(p, a):
    pic = pic_html(p)
    card = f'<div class="card{" two" if a.get("pack") else ""}">{pic}{pic if a.get("pack") else ""}</div>'
    vid = a["tipo"] == "video"
    return (f'<div class="mock" style="--bg:{a["bg"]}"><div class="ov D">{tpl(a["overlay"], p)}</div>{card}{"<div class=play></div>" if vid else ""}'
            f'<div class="cta">{esc(D.get("cta", "Comprar ›"))}</div><div class="fmt">{"VIDEO 9:16 · 4:5" if vid else "IMAGEN 1:1 · 9:16"}</div></div>')

def row(p):
    angs = "".join(f"""<div class="ang">{mock(p, a)}<div class="copy">
        <div class="an"><b class="D">Ángulo {i+1} · {esc(a['nombre'])}</b><span class="chip {'v' if a['tipo']=='video' else 'i'}">{'VIDEO' if a['tipo']=='video' else 'IMAGEN'}</span></div>
        <div class="lbl">Texto principal</div><div class="pt">{tpl(a['texto'], p)}</div>
        <div class="lbl">Título</div><div class="tt D">{tpl(a['titulo'], p)}</div>
        <div class="br">{esc(a['brief'])}</div></div></div>""" for i, a in enumerate(p["angulos"][:3]))
    return f"""<div class="row"><div class="info">{pic_html(p, "pic")}<h3 class="D">{esc(p['nombre'])}</h3><small>{esc(p.get('codigo', ''))}</small>
      <div class="pr"><span>Precio</span><span class="edit">{fld('venta_'+p['key'], p['venta'])}</span></div>
      <div class="pr st"><span>Promo · {esc(p['promo_label'])}</span><span class="edit" style="font-size:6.6pt">{fld('promo_'+p['key'], p['promo'])}</span></div>
      <small>CPA equilibrio {esc(p['cpa'])}</small></div>{angs}</div>"""

def creative_page(n, prods, extra=""):
    return f"""<section class="page"><div class="ph"><div><div class="eyebrow">Creativos por ángulo de venta</div><h2 class="D">1 anuncio por producto con sus 3 ángulos (formato flexible)</h2>
      <div class="sub">Descripción en todos los anuncios: <b>{esc(D['descripcion'])}</b></div></div>
      <div class="legend"><span><span class="chip v">VIDEO</span> {esc(D.get('leyenda_video', 'video editado'))}</span><span><span class="chip i">IMAGEN</span> {esc(D.get('leyenda_imagen', 'pieza fija'))}</span></div></div>
      {''.join(row(p) for p in prods)}{extra}{foot(n)}</section>"""

ul = lambda xs: "".join(f"<li>{esc(x)}</li>" for x in xs)
AUD = D.get("auditoria")  # opcional: hallazgos de la página de ventas / embudo
NEXT = (f"""<div class="next{' three' if AUD else ''}"><div class="box"><h3 class="D">Antes de lanzar</h3><ul>{ul(D['antes_de_lanzar'][:5])}</ul></div>
  <div class="box"><h3 class="D">Reglas de la promo</h3><ul>{ul(D['reglas'][:5])}</ul></div>"""
  + (f"""<div class="box aud"><h3 class="D">{esc(AUD.get('titulo', 'Página de ventas'))}</h3><ul>{ul(AUD['items'][:6])}</ul></div>""" if AUD else "") + "</div>")
chunks = [P[i:i + 3] for i in range(0, len(P), 3)]
pages = "".join(creative_page(i + 2, ch, NEXT if i == len(chunks) - 1 and len(ch) <= 2 else "") for i, ch in enumerate(chunks))
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800&display=swap">'
HTML = f'<!doctype html><html lang="es"><head><meta charset="utf-8">{FONTS}<style>{CSS}</style></head><body>{page1()}{pages}</body></html>'
(HERE / "campana.html").write_text(HTML, encoding="utf-8")

PX = 0.75
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={"width": 1123, "height": 794})
    pg.goto((HERE / "campana.html").as_uri())
    try: pg.wait_for_load_state("networkidle", timeout=8000)
    except Exception: pass
    pg.emulate_media(media="print")
    over = pg.evaluate("() => [...document.querySelectorAll('.row,.page')].filter(e => e.scrollHeight > e.clientHeight + 2).length")
    fields = pg.evaluate("""() => [...document.querySelectorAll('.f')].map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e), pages = [...document.querySelectorAll('.page')];
      const pi = pages.findIndex(p => p.contains(e)), pr = pages[pi].getBoundingClientRect();
      return { name: e.dataset.f, value: e.dataset.v, page: pi, x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height,
               size: parseFloat(s.fontSize), bold: parseInt(s.fontWeight) >= 600, color: getComputedStyle(e.parentElement).color }; })""")
    pg.pdf(path=str(OUT), width="297mm", height="210mm", print_background=True, margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
    b.close()

r = PdfReader(str(OUT)); w = PdfWriter(); w.append(r)
def font(base):
    return w._add_object(DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
                                           NameObject("/BaseFont"): NameObject(base), NameObject("/Encoding"): NameObject("/WinAnsiEncoding")}))
fonts = DictionaryObject({NameObject("/Helv"): font("/Helvetica"), NameObject("/HeBo"): font("/Helvetica-Bold")})
rgb = lambda c: " ".join(f"{float(v)/255:.3f}" for v in re.findall(r"[\d.]+", c)[:3])
pstr = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
parents = {}
for f in fields:
    page = w.pages[f["page"]]; H = float(page.mediabox.height)
    size = round(f["size"] * PX, 2); fn = "/HeBo" if f["bold"] else "/Helv"; col = rgb(f["color"])
    x0 = f["x"] * PX - 1.5; y1 = H - f["y"] * PX; wd = max(f["w"] * PX, 10) + 6; ht = f["h"] * PX
    if f["name"] not in parents:
        par = DictionaryObject({NameObject("/FT"): NameObject("/Tx"), NameObject("/T"): TextStringObject(f["name"]),
                                NameObject("/V"): TextStringObject(f["value"]), NameObject("/Kids"): ArrayObject(),
                                NameObject("/DA"): TextStringObject(f"/Helv {size} Tf 0 g")})
        parents[f["name"]] = (w._add_object(par), par)
    pref, par = parents[f["name"]]
    ap = StreamObject()
    ap._data = f"/Tx BMC q BT {fn} {size} Tf {col} rg 1.5 {(ht - size * 0.72) / 2:.2f} Td ({pstr(f['value'])}) Tj ET Q EMC".encode("cp1252", "replace")
    ap.update({NameObject("/Type"): NameObject("/XObject"), NameObject("/Subtype"): NameObject("/Form"),
               NameObject("/BBox"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(wd), FloatObject(ht)]),
               NameObject("/Resources"): DictionaryObject({NameObject("/Font"): fonts})})
    wid = DictionaryObject({NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/Rect"): ArrayObject([FloatObject(v) for v in (x0, y1 - ht, x0 + wd, y1)]), NameObject("/Parent"): pref,
        NameObject("/F"): NumberObject(4), NameObject("/DA"): TextStringObject(f"{fn} {size} Tf {col} rg"),
        NameObject("/P"): page.indirect_reference, NameObject("/MK"): DictionaryObject(),
        NameObject("/AP"): DictionaryObject({NameObject("/N"): w._add_object(ap)})})
    wref = w._add_object(wid); par["/Kids"].append(wref)
    if "/Annots" not in page: page[NameObject("/Annots")] = ArrayObject()
    page["/Annots"].append(wref)
w._root_object[NameObject("/AcroForm")] = DictionaryObject({NameObject("/Fields"): ArrayObject([v[0] for v in parents.values()]),
    NameObject("/DR"): DictionaryObject({NameObject("/Font"): fonts}), NameObject("/DA"): TextStringObject("/Helv 8 Tf 0 g"),
    NameObject("/NeedAppearances"): BooleanObject(False)})
w.add_metadata({"/Title": f"{D['titulo']} · {D['cliente']}", "/Author": "brixx"})
with open(OUT, "wb") as fh: w.write(fh)
print(f"OK {OUT} · {len(r.pages)} páginas · {len(parents)} campos editables" + (f" · ATENCIÓN: {over} bloque(s) con texto desbordado, acortá copies" if over else ""))
