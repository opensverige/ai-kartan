#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bygger AI-kartans logotyp och alla bilder som hör till den.

Allt kommer ur ETT pixelraster, RASTER nedan: 48 x 48 celler, ett tecken per cell.
En hand i samma stil som systersajternas (apelsinfärgad, mörk kontur) håller en kartnål
i mossgrönt. Ändra rastret, kör skriptet, så skrivs alla filer om. Inget annat läses in.

    python scripts/brand/bygg-logotyp.py
    python scripts/brand/bygg-logotyp.py --typsnitt MAPP     # var TTF-filerna till OG-bilderna ligger
    python scripts/brand/bygg-logotyp.py --ut MAPP           # skriv någon annanstans än public/
    python scripts/brand/bygg-logotyp.py --forstora ut.png   # bara en förstorad kontrollbild med rutnät

Skrivs till public/: logo.svg, logo.png, icon.png, favicon.ico, favicon-96x96.png,
apple-touch-icon.png, web-app-manifest-192x192.png, web-app-manifest-512x512.png,
site.webmanifest, og-image.jpg och og-image-en.jpg.

Krav: Python 3.10+ och Pillow. Typsnitten (Bricolage Grotesque och JetBrains Mono, båda OFL)
hämtas vid behov till en tillfällig mapp utanför repot och checkas aldrig in.

Skalning: cellerna förstoras med närmaste granne och ett HELT antal pixlar per cell, så att
varje cell blir exakt lika stor. Bilder som inte går jämnt upp i 48 centreras med marginal
(logo.png 5 px, favicon-96x96 2 px, apple-touch-icon 3 px, PWA-512 7 px, OG-bilderna 10 px per cell).
Ikoner där en cell skulle bli mindre än ~1,5 px (icon.png, favicon.ico 16/32 och PWA-192) krymps
i stället med ytmedelvärde från en jämn förstoring, annars försvinner konturerna. De ogenomskinliga
av dem skärps lätt efteråt.

OG-bilderna (1200 x 630) ligger på kritvit botten #fbfaf7, så att den mossgröna nålen syns: rubriken i
bläck #0f0e0b med ordet AI i mossgrönt, två mono-rader under (28 px, #5b5549), 60 px marginal till höger.
"""

import argparse
import json
import math
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROT = Path(__file__).resolve().parents[2]
PUBLIC = ROT / "public"

RAD = 48          # celler per sida
MARGINAL = 2      # tomma celler som alltid ska finnas runt motivet

KRITVIT = "#fbfaf7"
MOSS = "#2d492d"
BLACK = "#0f0e0b"      # rubrikens bläck, samma som --ink på sajten
DAMPAD = "#5b5549"     # mono-raderna i OG-bilderna
OG_HOGERMARGINAL = 60  # inget i OG-bilderna får komma närmare högerkanten än så här (px)

# Förklaring till rastret: ett tecken per cell.
FARGER = {
    ".": None,         # genomskinligt
    "K": "#8c2f12",    # handens kontur
    "L": "#fd9f3d",    # hand, ljus
    "M": "#f27f2b",    # hand, mellan
    "S": "#de5c1e",    # hand, skugga
    "G": "#2d492d",    # nål, mossgrön
    "H": "#4f7a4f",    # nål, högdager
    "W": "#fbfaf7",    # nål, den lilla cirkeln i huvudet
}

# 48 rader (numrerade till höger) med 48 tecken. Kolumnnumren står över första raden.
RASTER = [
    #000000000011111111112222222222333333333344444444
    #012345678901234567890123456789012345678901234567
    "................................................",  # 00
    "................................................",  # 01
    "................................................",  # 02
    ".................................GGGGG..........",  # 03
    "...............................GGGGGGGGG........",  # 04
    "......................KK.....GGGHHHHGGGGGG......",  # 05
    ".....................KMLK...GGHHHHGGGGGGGGG.....",  # 06
    "....................KMLLK...GHHHGGGGGGGGGGG.....",  # 07
    "...............KK...KMLLK..GHHHGGGGGGGGGGGGG....",  # 08
    "..............KSSK..KMLLK..GHHGGGGWWWGGGGGGG....",  # 09
    ".............KSSMK.KMLLK..GGHHGGGWWWWWGGGGGGG...",  # 10
    ".............KSSMK.KMLLK..GGHGGGWWWWWWWGGGGGG...",  # 11
    ".............KSSMK.KMLLK..GGHGGGWWWWWWWGGGGGG...",  # 12
    "............KSSMK.KMLLK...GGGGGGWWWWWWWGGGGGG...",  # 13
    "..........KKKSSMK.KMLLK...GGGGGGGWWWWWGGGGGGG...",  # 14
    ".........KSMKSSMK.KMLLK...GGGGGGGGWWWGGGGGGG....",  # 15
    "........KSSMKSSSMKMLLK....GGGGGGGGGGGGGGGGGG....",  # 16
    "........KSSMKSSSMKMLLK....GGGGGGGGGGGGGGGGG.....",  # 17
    "........KSSMKSSSMKMLLK....GGGGGGGGGGGGGGGGG.....",  # 18
    "........KSSMKSSSMKMLLKKK....GGGGGGGGGGGGGG......",  # 19
    "........KSSMKSLLLLLLLLLLKKKKKGGGGGGGGGGGG.......",  # 20
    ".......KKSSMKLLLLLLLLLLLLLLLKGGGGGGGGGG.........",  # 21
    "......KSSMMMMMMLLLLLLMMMLLLLLKGGGGGGGG..........",  # 22
    "......KSSMMMMMLLLLLLKKKKMMMMKGGGGGGGG...........",  # 23
    "......KSSMMMMLLLKKKK....KKKKKGGGGGGG............",  # 24
    ".....KSSMMMMMLLLLK........GGGGGGGGG.............",  # 25
    ".....KSSMMMMMLLLLK........KKKGGGGG..............",  # 26
    ".....KSSMMMMMLLLLK......KKLLKGGG................",  # 27
    ".....KSSMMMMMLLLLK....KKLLLLKGG.................",  # 28
    ".....KSSMMMMMLLLLLK.KKLLLLLLKG..................",  # 29
    ".....KSSMMMMMMLLLLKKLLLLLLLMK...................",  # 30
    ".....KSSMMMMMMMLLLLLLLLLLMMK....................",  # 31
    "......KSSMMMLLLLLLLLLLLLMKK.....................",  # 32
    "......KSSMMLLLLLLLLLLLLMK.......................",  # 33
    ".......KSMLLLLLLLLLLLMMK........................",  # 34
    ".......KSMLLLLLLLLLLMKK.........................",  # 35
    ".......KSMMLLLLLLLMMK...........................",  # 36
    "......KSMMMLLLLLMMKK............................",  # 37
    "......KSMMMMMMMMMK..............................",  # 38
    "......KSMMMMMMMMK...............................",  # 39
    "......KSSMLLLMMMK...............................",  # 40
    ".....KSSMLLLMMMMK...............................",  # 41
    ".....KSSMLLLMMMK................................",  # 42
    "....KSSMLLLMMMMK................................",  # 43
    "....KKKKKLLMMMMK................................",  # 44
    ".........KKKKKKK................................",  # 45
    "................................................",  # 46
    "................................................",  # 47
]

# Rubriker och rad under dem i OG-bilderna.
OG_SV = ("Alla som bygger", "AI i Sverige.")
OG_EN = ("Everyone building", "AI in Sweden.")
# Mono-raden är 935 px lång i 28 px och ryms inte bredvid logotypen, så den bryts vid punkten (som tas bort).
OG_RAD = ("karta.opensverige.se", "källa och datum på varje uppgift")

TYPSNITT = {
    "BricolageGrotesque.ttf":
        "https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf",
    "JetBrainsMono-Regular.ttf":
        "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf",
}


# ---------------------------------------------------------------- raster

def hex_rgb(hexfarg):
    return tuple(int(hexfarg[i:i + 2], 16) for i in (1, 3, 5))


def kontrollera_raster():
    if len(RASTER) != RAD:
        raise SystemExit(f"Rastret har {len(RASTER)} rader, ska vara {RAD}.")
    for y, rad in enumerate(RASTER):
        if len(rad) != RAD:
            raise SystemExit(f"Rad {y} har {len(rad)} tecken, ska vara {RAD}.")
        for x, tecken in enumerate(rad):
            if tecken not in FARGER:
                raise SystemExit(f"Okänt tecken {tecken!r} på rad {y}, kolumn {x}.")
            if tecken != "." and not (MARGINAL <= x < RAD - MARGINAL and MARGINAL <= y < RAD - MARGINAL):
                raise SystemExit(f"Cell ({x},{y}) ligger närmare kanten än {MARGINAL} celler.")


def raster_bild():
    """Rastret som en RGBA-bild på 48 x 48 pixlar, en pixel per cell."""
    bild = Image.new("RGBA", (RAD, RAD), (0, 0, 0, 0))
    for y, rad in enumerate(RASTER):
        for x, tecken in enumerate(rad):
            farg = FARGER[tecken]
            if farg:
                bild.putpixel((x, y), hex_rgb(farg) + (255,))
    return bild


def motivets_ruta(bild):
    """Omslutande rektangel (x0, y0, x1, y1) i celler för det som inte är genomskinligt."""
    return bild.getchannel("A").getbbox()


def heltalsskala(bild, steg):
    """Förstora med närmaste granne, exakt `steg` pixlar per cell."""
    return bild.resize((bild.width * steg, bild.height * steg), Image.NEAREST)


def duk(storlek, bakgrund=None):
    return Image.new("RGBA", (storlek, storlek), hex_rgb(bakgrund) + (255,) if bakgrund else (0, 0, 0, 0))


def placera_rutnat(motiv, storlek, steg, bakgrund=None):
    """Hela 48-rutnätet, centrerat på en duk. Samma bildutsnitt som logo.svg."""
    ut = duk(storlek, bakgrund)
    skalad = heltalsskala(motiv, steg)
    ut.alpha_composite(skalad, ((storlek - skalad.width) // 2, (storlek - skalad.height) // 2))
    return ut


def placera_motiv(motiv, storlek, steg, bakgrund=None, mitt=None):
    """Bara motivet (beskuret), centrerat på `mitt` i celler (annars rutans mitt)."""
    x0, y0, x1, y1 = motivets_ruta(motiv)
    mx, my = mitt if mitt else ((x0 + x1) / 2, (y0 + y1) / 2)
    skalad = heltalsskala(motiv, steg).crop((x0 * steg, y0 * steg, x1 * steg, y1 * steg))
    ut = duk(storlek, bakgrund)
    ox = round(storlek / 2 - (mx - x0) * steg)
    oy = round(storlek / 2 - (my - y0) * steg)
    ut.alpha_composite(skalad, (ox, oy))
    return ut


def skarpa(bild):
    """Lätt skärpning efter krympning, så att konturerna inte flyter ihop på de minsta storlekarna."""
    return bild.filter(ImageFilter.UnsharpMask(radius=0.7, percent=70, threshold=0))


def liten_ikon(motiv, storlek, marginal_px, bakgrund=None):
    """För ikoner där cellerna blir mindre än ~2 px: krymp med ytmedelvärde från en jämn förstoring.
    Med bakgrund (ogenomskinlig ikon) skärps resultatet lätt. Genomskinliga ikoner skärps inte,
    eftersom skärpning i färgkanalerna ger mörka kanter mot de genomskinliga pixlarna."""
    x0, y0, x1, y1 = motivets_ruta(motiv)
    w, h = x1 - x0, y1 - y0
    mal = storlek - 2 * marginal_px
    skala = mal / max(w, h)
    nw, nh = max(1, round(w * skala)), max(1, round(h * skala))
    stor = heltalsskala(motiv, 12).crop((x0 * 12, y0 * 12, x1 * 12, y1 * 12))
    if bakgrund:
        kuliss = Image.new("RGBA", stor.size, hex_rgb(bakgrund) + (255,))
        kuliss.alpha_composite(stor)
        stor = kuliss
    liten = stor.resize((nw, nh), Image.BOX)
    ut = duk(storlek, bakgrund)
    ut.alpha_composite(liten, ((storlek - nw) // 2, (storlek - nh) // 2))
    return skarpa(ut) if bakgrund else ut


def omslutande_cirkel(punkter):
    """Minsta cirkel som rymmer alla punkter (Welzl, iterativ). Returnerar (x, y, radie)."""
    pkt = sorted(set(punkter))

    def inom(c, p):
        return math.dist(c[:2], p) <= c[2] + 1e-9

    def tva(a, b):
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, math.dist(a, b) / 2)

    def tre(a, b, c):
        d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
        if abs(d) < 1e-12:
            return None
        ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1])
              + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d
        uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0])
              + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d
        return (ux, uy, math.dist((ux, uy), a))

    c = None
    for i, p in enumerate(pkt):
        if c is None or not inom(c, p):
            c = (p[0], p[1], 0.0)
            for j in range(i):
                q = pkt[j]
                if not inom(c, q):
                    c = tva(p, q)
                    for k in range(j):
                        r = pkt[k]
                        if not inom(c, r):
                            c = tre(p, q, r) or c
    return c


def motivets_cirkel(motiv):
    """Minsta cirkel (i celler) kring alla färgade celler. Används för att hålla ikoner inom 'safe zone'."""
    punkter = []
    for y in range(RAD):
        for x in range(RAD):
            if motiv.getpixel((x, y))[3]:
                punkter += [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
    return omslutande_cirkel(punkter)


# ---------------------------------------------------------------- filer

def skriv_png(bild, namn, ut):
    sokvag = ut / namn
    if bild.getchannel("A").getextrema() == (255, 255):
        bild = bild.convert("RGB")
    bild.save(sokvag, optimize=True)
    return sokvag


def skriv_svg(ut):
    grupper = {}
    for y, rad in enumerate(RASTER):
        x = 0
        while x < RAD:
            tecken = rad[x]
            if tecken == ".":
                x += 1
                continue
            start = x
            while x < RAD and rad[x] == tecken:
                x += 1
            grupper.setdefault(tecken, []).append((start, y, x - start))
    delar = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="256" height="256" '
        'shape-rendering="crispEdges">',
        "<title>AI-kartan</title>",
    ]
    for tecken, rektanglar in grupper.items():
        delar.append(f'<g fill="{FARGER[tecken]}">')
        delar += [f'<rect x="{x}" y="{y}" width="{w}" height="1"/>' for x, y, w in rektanglar]
        delar.append("</g>")
    delar.append("</svg>")
    sokvag = ut / "logo.svg"
    sokvag.write_text("\n".join(delar) + "\n", encoding="utf-8", newline="\n")
    return sokvag, sum(len(v) for v in grupper.values())


def skriv_ico(motiv, ut):
    ramar = {}
    for s in (16, 32):
        ramar[s] = liten_ikon(motiv, s, 1 if s == 32 else 0, KRITVIT)
    ramar[48] = placera_rutnat(motiv, 48, 1, KRITVIT)
    sokvag = ut / "favicon.ico"
    ramar[48].save(
        sokvag, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[ramar[16], ramar[32]], bitmap_format="bmp",
    )
    return sokvag


def skriv_manifest(ut):
    ikoner = []
    for storlek in (192, 512):
        for syfte in ("any", "maskable"):
            ikoner.append({
                "src": f"web-app-manifest-{storlek}x{storlek}.png",
                "sizes": f"{storlek}x{storlek}",
                "type": "image/png",
                "purpose": syfte,
            })
    manifest = {
        "name": "OpenSverige AI-kartan",
        "short_name": "AI-kartan",
        "description": "Sveriges öppna karta över dem som bygger AI, med källa och datum på varje uppgift.",
        "lang": "sv-SE",
        # Relativa sökvägar: sajten kan byggas under en BASE_PATH (se astro.config.mjs).
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "theme_color": MOSS,
        "background_color": KRITVIT,
        "icons": ikoner,
    }
    sokvag = ut / "site.webmanifest"
    sokvag.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return sokvag


def skriv_ikoner(motiv, ut):
    filer = []
    # logo.png: samma utsnitt som logo.svg, 5 px per cell (240 px) mitt på 256.
    filer.append(skriv_png(placera_rutnat(motiv, 256, 5), "logo.png", ut))
    filer.append(skriv_png(liten_ikon(motiv, 64, 1), "icon.png", ut))
    # favicon-96x96: exakt 2 px per cell.
    filer.append(skriv_png(placera_rutnat(motiv, 96, 2, KRITVIT), "favicon-96x96.png", ut))
    # apple-touch-icon: 3 px per cell, motivet mitt i rutan med luft runt om.
    filer.append(skriv_png(placera_motiv(motiv, 180, 3, KRITVIT), "apple-touch-icon.png", ut))
    # PWA-ikoner: störst möjliga jämna steg där hela motivet ryms i 'safe zone' (cirkel, 40 % av sidan),
    # centrerat på motivets omslutande cirkel. 512 px blir exakta celler (7 px). 192 px skulle bara
    # rymma 2 px per cell (motivet knappt hälften så stort i ramen), så den krymps i stället från
    # 512-versionen och får samma proportioner.
    cx, cy, r = motivets_cirkel(motiv)
    steg = max(1, int(0.40 * 512 / r))
    stor = placera_motiv(motiv, 512, steg, KRITVIT, mitt=(cx, cy))
    filer.append(skriv_png(stor, "web-app-manifest-512x512.png", ut))
    filer.append(skriv_png(skarpa(stor.resize((192, 192), Image.BOX)), "web-app-manifest-192x192.png", ut))
    return filer


# ---------------------------------------------------------------- OG-bilder

def hamta_typsnitt(mapp):
    mapp.mkdir(parents=True, exist_ok=True)
    for namn, url in TYPSNITT.items():
        fil = mapp / namn
        if fil.exists() and fil.stat().st_size > 50_000:
            continue
        print(f"  hämtar {namn} ...")
        begaran = urllib.request.Request(url, headers={"User-Agent": "ai-kartan-brand/1.0"})
        try:
            with urllib.request.urlopen(begaran, timeout=60) as svar:
                data = svar.read()
        except OSError as fel:
            raise SystemExit(f"Kunde inte hämta {namn} ({fel}). Ladda ner filen från\n  {url}\n"
                             f"och peka ut mappen med --typsnitt MAPP.")
        if data[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO", b"ttcf"):
            raise SystemExit(f"{namn} ser inte ut som en TrueType-fil. Avbryter.")
        fil.write_bytes(data)
    return mapp


def rubrikfont(mapp, storlek):
    """Bricolage Grotesque Bold med optisk storlek = typstorleken. Reservfont om variabelfonten inte går att ställa in."""
    try:
        font = ImageFont.truetype(str(mapp / "BricolageGrotesque.ttf"), storlek)
        axlar = {a["name"].decode() if isinstance(a["name"], bytes) else a["name"]: a
                 for a in font.get_variation_axes()}
        varden = []
        for namn, a in axlar.items():
            if namn.lower().startswith("optical"):
                varden.append(min(max(storlek, a["minimum"]), a["maximum"]))
            elif namn.lower().startswith("weight"):
                varden.append(700)
            else:
                varden.append(a["default"])
        font.set_variation_by_axes(varden)
        return font, True
    except Exception as fel:
        print(f"  VARNING: Bricolage Grotesque gick inte att ställa in ({fel}); använder Arial Bold.")
        return ImageFont.truetype("arialbd.ttf", storlek), False


def rita_rubrikrad(d, x, y, rad, font):
    """En rubrikrad i bläck, men ordet AI i mossgrönt. Delarna placeras efter radens verkliga breddsteg."""
    delar = re.split(r"(\bAI\b)", rad)
    gjort = ""
    for bit in delar:
        if bit:
            d.text((x + font.getlength(gjort), y), bit, font=font, fill=MOSS if bit == "AI" else BLACK, anchor="ls")
            gjort += bit


def og_bild(rader, font_rubrik, font_rad, motiv):
    """1200 x 630 på kritvit botten: logotypen till vänster (10 px per cell), rubrik och mono-rader till höger."""
    B, H = 1200, 630
    steg, rand, glapp = 10, 60, 48
    ut = Image.new("RGBA", (B, H), hex_rgb(KRITVIT) + (255,))

    # Logotypen, vänsterkant `rand` från bildkanten, vertikalt centrerad.
    x0, y0, x1, y1 = motivets_ruta(motiv)
    mw, mh = (x1 - x0) * steg, (y1 - y0) * steg
    ut.alpha_composite(heltalsskala(motiv, steg), (rand - x0 * steg, (H - mh) // 2 - y0 * steg))

    # Texten: rubrik och två mono-rader under den, centrerade som ett block efter bläckets ytterkanter.
    text_x = rand + mw + glapp
    d = ImageDraw.Draw(ut)
    radavstand = round(font_rubrik.size * 1.06)
    monoavstand = 40
    ytor, toppar, bottnar = [], [], []
    for i, rad in enumerate(rader):
        bb = font_rubrik.getbbox(rad, anchor="ls")
        ytor.append(i * radavstand)
        toppar.append(i * radavstand + bb[1])
        bottnar.append(i * radavstand + bb[3])
    mono_start = (len(rader) - 1) * radavstand + round(font_rubrik.size * 0.86)
    monoytor = []
    for i, rad in enumerate(OG_RAD):
        bb = font_rad.getbbox(rad, anchor="ls")
        monoytor.append(mono_start + i * monoavstand)
        toppar.append(monoytor[-1] + bb[1])
        bottnar.append(monoytor[-1] + bb[3])
    start = round((H - (max(bottnar) - min(toppar))) / 2 - min(toppar))

    for rad, y in zip(rader, ytor):
        rita_rubrikrad(d, text_x, start + y, rad, font_rubrik)
    for rad, y in zip(OG_RAD, monoytor):
        d.text((text_x, start + y), rad, font=font_rad, fill=DAMPAD, anchor="ls")
    return ut.convert("RGB"), text_x


def skriv_og(motiv, typsnittsmapp, ut):
    font_rad = ImageFont.truetype(str(typsnittsmapp / "JetBrainsMono-Regular.ttf"), 28)
    hogergrans = 1200 - OG_HOGERMARGINAL
    filer = []
    for rader, namn in ((OG_SV, "og-image.jpg"), (OG_EN, "og-image-en.jpg")):
        # Största rubrikstorlek (högst 84 px) där bredaste raden ryms inom högermarginalen.
        storlek = 84
        while True:
            font, variabel = rubrikfont(typsnittsmapp, storlek)
            bild, text_x = og_bild(rader, font, font_rad, motiv)
            breddast = max(max(font.getlength(r) for r in rader), max(font_rad.getlength(r) for r in OG_RAD))
            if text_x + breddast <= hogergrans or storlek <= 40:
                break
            storlek -= 2
        sokvag = ut / namn
        bild.save(sokvag, format="JPEG", quality=88, subsampling=0, optimize=True)
        filer.append(sokvag)
        print(f"  {namn}: rubrik {storlek} px, texten slutar {text_x + breddast:.0f} px från vänster (gräns {hogergrans})"
              + ("" if variabel else " (reservfont)"))
    return filer


# ---------------------------------------------------------------- kontrollbild

def forstorad_kontrollbild(sokvag, steg=16):
    sida = RAD * steg
    pad = 24
    bild = Image.new("RGB", (sida + pad, sida + pad), (232, 228, 218))
    d = ImageDraw.Draw(bild)
    for y, rad in enumerate(RASTER):
        for x, tecken in enumerate(rad):
            if FARGER[tecken]:
                d.rectangle([pad + x * steg, pad + y * steg, pad + (x + 1) * steg - 1, pad + (y + 1) * steg - 1],
                            fill=FARGER[tecken])
    for i in range(RAD + 1):
        farg = (170, 170, 190) if i % 4 == 0 else (214, 210, 200)
        d.line([(pad + i * steg, pad), (pad + i * steg, pad + sida)], fill=farg)
        d.line([(pad, pad + i * steg), (pad + sida, pad + i * steg)], fill=farg)
        if i % 4 == 0 and i < RAD:
            d.text((pad + i * steg + 2, 6), str(i), fill=(60, 60, 60))
            d.text((2, pad + i * steg + 2), str(i), fill=(60, 60, 60))
    d.rectangle([pad + MARGINAL * steg, pad + MARGINAL * steg, pad + (RAD - MARGINAL) * steg, pad + (RAD - MARGINAL) * steg],
                outline=(255, 0, 80))
    bild.save(sokvag)
    return sokvag


# ---------------------------------------------------------------- huvudprogram

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Bygger AI-kartans logotyp och varumärkesbilder ur rastret i skriptet.")
    ap.add_argument("--typsnitt", type=Path, default=Path(tempfile.gettempdir()) / "ai-kartan-typsnitt",
                    help="mapp med BricolageGrotesque.ttf och JetBrainsMono-Regular.ttf (hämtas hit om de saknas)")
    ap.add_argument("--ut", type=Path, default=PUBLIC, help="målmapp (standard: public/)")
    ap.add_argument("--forstora", type=Path, metavar="FIL.png", help="skriv bara en förstorad kontrollbild och avsluta")
    args = ap.parse_args()

    kontrollera_raster()
    if args.forstora:
        print(forstorad_kontrollbild(args.forstora))
        return

    args.ut.mkdir(parents=True, exist_ok=True)
    motiv = raster_bild()
    filer = []

    sokvag, antal = skriv_svg(args.ut)
    print(f"  logo.svg: {antal} rektanglar")
    filer.append(sokvag)
    filer += skriv_ikoner(motiv, args.ut)
    filer.append(skriv_ico(motiv, args.ut))
    filer.append(skriv_manifest(args.ut))
    print("  typsnitt:", hamta_typsnitt(args.typsnitt))
    filer += skriv_og(motiv, args.typsnitt, args.ut)

    print()
    for f in sorted(filer, key=lambda p: p.name):
        if f.suffix in (".png", ".jpg", ".ico"):
            with Image.open(f) as im:
                mal = f"{im.width}x{im.height}"
        else:
            mal = "-"
        print(f"{f.name:34s} {mal:>9s} {f.stat().st_size:>8d} byte")


if __name__ == "__main__":
    main()
