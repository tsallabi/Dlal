# يبني شعار الهدهد (متحرك وثابت) — شغّله: python3 build.py
feather = "M0,2 C-3,-12 -8,-30 -6.5,-42 C-5.5,-50 5.5,-50 6.5,-42 C8,-30 3,-12 0,2 Z"
closed = [78, 84, 90, 96, 102, 108, 114]
opened = [-58, -37, -16, 5, 26, 47, 68]
scale  = [0.8, 0.92, 1.0, 1.04, 1.0, 0.92, 0.82]
BX, BY = 86, 70
def feathers():
    return "\n".join(
      f'<g class="f" style="--c:{c}deg;--o:{o}deg" transform="translate({BX} {BY}) rotate({o})"><use href="#feather" transform="scale({s})"/></g>'
      for c, o, s in zip(closed, opened, scale))
bars = "\n".join(f'<rect x="{x}" y="80" width="5.5" height="70" transform="rotate(18 {x} 115)"/>' for x in range(120, 176, 11))
STYLE = f"""
<style>
  .f,.head,.tail,.body{{transform-box:view-box}}
  .f{{transform-origin:0 0;transform:translate({BX}px,{BY}px) rotate(var(--o));animation:fan 4.2s ease-in-out infinite}}
  .head{{transform-origin:96px 104px;animation:peck 4.2s ease-in-out infinite}}
  .tail{{transform-origin:152px 120px;animation:flick 4.2s ease-in-out infinite}}
  .body{{transform-origin:125px 150px;animation:breathe 4.2s ease-in-out infinite}}
  @keyframes fan{{0%,30%{{transform:translate({BX}px,{BY}px) rotate(var(--c))}}40%,72%{{transform:translate({BX}px,{BY}px) rotate(var(--o))}}82%,100%{{transform:translate({BX}px,{BY}px) rotate(var(--c))}}}}
  @keyframes peck{{0%,4%{{transform:rotate(0)}}10%{{transform:rotate(-16deg)}}14%{{transform:rotate(-9deg)}}18%{{transform:rotate(-16deg)}}24%,100%{{transform:rotate(0)}}}}
  @keyframes flick{{0%,44%{{transform:rotate(0)}}50%{{transform:rotate(-9deg)}}58%,100%{{transform:rotate(0)}}}}
  @keyframes breathe{{0%,100%{{transform:scale(1)}}50%{{transform:scale(1.015)}}}}
  @media (prefers-reduced-motion:reduce){{.f,.head,.tail,.body{{animation:none}}}}
</style>"""
def svg(anim=True, size='', bust=False):
    out = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200" {size} role="img" aria-label="هدهد HUDHUDE">{STYLE if anim else ''}
<defs>
  <path id="fshape" d="{feather}"/>
  <clipPath id="fclip"><use href="#fshape"/></clipPath>
  <g id="feather"><g clip-path="url(#fclip)">
    <rect x="-9" y="-52" width="18" height="56" fill="#E8903F"/>
    <rect x="-9" y="-40" width="18" height="2.6" fill="#fff"/>
    <rect x="-9" y="-52" width="18" height="12" fill="#1C1A19"/>
  </g></g>
  <clipPath id="wclip"><path d="M110,104 C128,94 158,100 172,118 C162,131 140,139 117,135 C108,125 106,113 110,104 Z"/></clipPath>
</defs>
<g stroke="#6B5A50" stroke-width="3.2" stroke-linecap="round" fill="none">
  <path d="M122,146 L118,178 M118,178 L109,180 M118,178 L124,181"/>
  <path d="M136,146 L139,178 M139,178 L131,180 M139,178 L146,180"/>
</g>
<g class="tail">
  <path d="M146,110 L220,134 Q229,142 221,150 L144,130 Z" fill="#1C1A19"/>
  <path d="M186,124 L194,127 L192,143 L184,140 Z" fill="#fff"/>
</g>
<g class="body">
  <path d="M86,112 C86,90 110,84 133,90 C160,97 172,112 166,128 C160,147 131,157 107,151 C90,146 84,131 86,112 Z" fill="#D9823F"/>
  <path d="M92,126 C98,146 122,152 140,148 C124,146 104,140 92,126 Z" fill="#F4C898"/>
  <path d="M110,104 C128,94 158,100 172,118 C162,131 140,139 117,135 C108,125 106,113 110,104 Z" fill="#1C1A19"/>
  <g clip-path="url(#wclip)" fill="#fff">{bars}</g>
</g>
<g class="head">
  {feathers()}
  <path d="M74,96 C80,112 96,116 106,108 L100,90 C92,94 82,95 74,96 Z" fill="#E39752"/>
  <circle cx="80" cy="86" r="21" fill="#EDA566"/>
  <path d="M62,88 C47,90 31,99 14,117 C31,106 47,98 63,94 Z" fill="#2E2522"/>
  <circle cx="71" cy="82" r="3.4" fill="#1C1A19"/>
  <circle cx="70" cy="81" r="1.1" fill="#fff"/>
</g>
</svg>'''
    if bust:   # الأيقونة: بلا جسم ولا ذيل ولا ساقين — تفاصيلها ضجيج في ٣٢ بكسل
        import re
        out = re.sub(r'<g stroke="#6B5A50".*?</g>\n', '', out, flags=re.S)
        out = re.sub(r'<g class="tail">.*?</g>\n', '', out, flags=re.S)
        out = re.sub(r'<g class="body">.*?\n</g>\n', '', out, flags=re.S)
    return out
open('hudhud-logo.svg','w').write(svg(True))
open('hudhud-logo-static.svg','w').write(svg(False))

# ---------- أيقونة صغيرة (تبويب المتصفح والجوال): الرأس والعُرف والمنقار فقط، العُرف مفتوح ----------
def icon(bg='#FFF3E6'):
    s = svg(False, bust=True).replace('viewBox="0 0 240 200"', 'viewBox="2 8 128 128"')
    return s.replace('<defs>', f'<rect x="2" y="8" width="128" height="128" rx="28" fill="{bg}"/><defs>', 1)
open('hudhud-icon.svg', 'w').write(icon())

ANIM = svg(True)
STATIC = svg(False)
def lockup(kind='ar', dark=False, h=76):
    ink = '#FFFFFF' if dark else '#1C1A19'
    if kind == 'ar':
        text = f'<span class="t"><b style="color:{ink}">هدهد <em>الصين</em></b><i style="color:{ink}">HUDHUDE</i></span>'
    else:
        text = f'<span class="t"><b class="lat" style="color:{ink}">HUDHUDE</b><i class="ar" style="color:{ink}">هدهد <em>الصين</em></i></span>'
    return f'<div class="lockup" style="--h:{h}px">{ANIM}{text}</div>'

html = f'''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>شعار هدهد</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap">
<style>
:root{{--ink:#1C1A19;--cin:#D9823F;--cream:#FFF3E6;--bg:#FAF7F3;--card:#fff;--line:#EDE6DE;--mut:#6f655d}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#161413;--card:#201d1b;--line:#332e2a;--ink:#F3EEE9;--mut:#b3a79c}}}}
:root[data-theme="dark"]{{--bg:#161413;--card:#201d1b;--line:#332e2a;--ink:#F3EEE9;--mut:#b3a79c}}
*{{box-sizing:border-box}}
body{{margin:0;font-family:Cairo,Tahoma,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}}
.wrap{{max-width:980px;margin:0 auto;padding:24px 16px 60px}}
h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:16px;margin:0 0 12px;color:var(--mut);font-weight:700}}
.lead{{color:var(--mut);margin:0 0 20px;font-size:14px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin:0 0 16px}}
.hero{{display:flex;justify-content:center;align-items:center;background:#fff;border-radius:16px;padding:10px}}
.hero svg{{width:min(460px,100%);height:auto}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}}
.lockup{{display:flex;align-items:center;gap:8px;direction:rtl}}
.lockup svg{{height:var(--h);width:auto;flex:none;margin-inline-end:-6px}}
.lockup .t{{display:flex;flex-direction:column;align-items:center;line-height:1;gap:6px}}
.lockup b{{font-weight:900;font-size:calc(var(--h) * .42);letter-spacing:.5px}}
.lockup b em,.lockup i em{{font-style:normal;color:#D9823F}}
.lockup i{{font-style:normal;font-weight:700;font-size:calc(var(--h) * .15);letter-spacing:.55em;text-indent:.55em;opacity:.75}}
.lockup b.lat{{letter-spacing:.12em;font-size:calc(var(--h) * .38)}}
.lockup i.ar{{letter-spacing:.5px;text-indent:0;font-size:calc(var(--h) * .2);opacity:1}}
.pane{{border-radius:12px;padding:22px 16px;display:flex;justify-content:center;align-items:center;min-height:130px}}
.light{{background:#fff;border:1px solid #EDE6DE}} .dark{{background:#1C1A19}}
.dark .tail path[fill="#1C1A19"],.dark .body path[fill="#1C1A19"]{{stroke:#FFF3E6;stroke-width:2.5;stroke-linejoin:round}}
.dark .legs,.dark g[stroke="#6B5A50"]{{stroke:#CDBFB3}}
.icons{{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap}}
.icons figure{{margin:0;text-align:center;font-size:12px;color:var(--mut)}}
.icons svg{{display:block;margin:0 auto 6px}}
.tab{{display:inline-flex;align-items:center;gap:8px;background:#EDE6DE;color:#1C1A19;border-radius:10px 10px 0 0;padding:8px 14px;font-size:13px}}
.tab svg{{width:16px;height:16px}}
.sw{{display:flex;gap:10px;flex-wrap:wrap}} .sw span{{display:flex;align-items:center;gap:6px;font-size:13px}}
.sw i{{width:22px;height:22px;border-radius:6px;border:1px solid var(--line);display:inline-block}}
.note{{font-size:13px;color:var(--mut);margin:10px 0 0}}
</style></head><body><div class="wrap">
<h1>شعار هدهد — HUDHUDE</h1>
<p class="lead">الهدهد يطأطئ رأسه ليلتقط من الأرض والعُرف مطويّ، ثم يرفع عُرفه مروحةً، ويهزّ ذيله. الدورة ٤ ثوانٍ وتتكرر. من يطلب في جهازه تقليل الحركة يرى الشعار ثابتًا والعُرف مفتوحًا.</p>

<div class="card"><h2>الشعار متحركًا</h2><div class="hero">{ANIM}</div></div>

<div class="card"><h2>الخيار ١ — العربية أولًا (كترتيب الشعار الحالي: الاسم كبيرًا وتحته اللاتيني)</h2>
<div class="grid"><div class="pane light">{lockup('ar')}</div><div class="pane dark">{lockup('ar', True)}</div></div></div>

<div class="card"><h2>الخيار ٢ — HUDHUDE أولًا وتحته «هدهد»</h2>
<div class="grid"><div class="pane light">{lockup('lat')}</div><div class="pane dark">{lockup('lat', True)}</div></div></div>

<div class="card"><h2>الأيقونة الصغيرة — تبويب المتصفح وشاشة الجوال</h2>
<div class="icons">
<figure>{icon().replace('<svg ', '<svg width="120" height="120" ')}<figcaption>أيقونة الجوال ١٢٠</figcaption></figure>
<figure>{icon().replace('<svg ', '<svg width="64" height="64" ')}<figcaption>٦٤</figcaption></figure>
<figure>{icon().replace('<svg ', '<svg width="32" height="32" ')}<figcaption>٣٢</figcaption></figure>
<figure>{icon().replace('<svg ', '<svg width="16" height="16" ')}<figcaption>١٦</figcaption></figure>
<figure><span class="tab">{icon()} هدهد | HUDHUDE</span><figcaption>في تبويب كروم</figcaption></figure>
</div></div>

<div class="card"><h2>الألوان</h2><div class="sw">
<span><i style="background:#D9823F"></i>قرفة #D9823F</span><span><i style="background:#EDA566"></i>رأس #EDA566</span>
<span><i style="background:#1C1A19"></i>أسود #1C1A19</span><span><i style="background:#fff"></i>أبيض</span><span><i style="background:#FFF3E6"></i>كريمي #FFF3E6</span></div>
<p class="note">لون الموقع الحالي وردي غامق (#b5124f). مع الهدهد يمكن أن يبقى، أو يصير لون القرفة لونَ الأزرار — القرار لك.</p></div>
</div></body></html>'''
open('preview.html', 'w').write(html)
