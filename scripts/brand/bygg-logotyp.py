#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bygger AI-kartans logotyp och alla bilder som hör till den.

Allt kommer ur EN bild, scripts/brand/logotyp.png: en hand i pixelstil som håller en röd kartnål,
1024 x 1024 pixlar på genomskinlig botten. Byt bilden, kör skriptet, så skrivs alla filer om.
Inget annat läses in.

    python scripts/brand/bygg-logotyp.py
    python scripts/brand/bygg-logotyp.py --typsnitt MAPP     # var TTF-filerna till OG-bilderna ligger
    python scripts/brand/bygg-logotyp.py --ut MAPP           # skriv någon annanstans än public/

Skrivs till public/: logo.png, icon.png, favicon.ico, favicon-96x96.png, apple-touch-icon.png,
web-app-manifest-192x192.png, web-app-manifest-512x512.png, site.webmanifest, og-image.jpg och
og-image-en.jpg.

Krav: Python 3.10+ och Pillow. Typsnitten (Bricolage Grotesque och JetBrains Mono, båda OFL)
hämtas vid behov till en tillfällig mapp utanför repot och checkas aldrig in.

Utsnitt: armen fortsätter ut genom bildens nederkant. Motivet ställs därför alltid mot nederkanten,
så att armen kommer in nerifrån i stället för att sluta i tomma luften. Ikonerna visar en kvadrat
med motivets hela bredd, räknat från fingertopparna. Underarmen nedanför ryms inte och behövs inte.

Skalning: illustrationen har inget jämnt rutnät, så den krymps med ytmedelvärde, aldrig med närmaste
granne. Färgerna multipliceras med alfakanalen före krympningen, annars drar de genomskinliga
pixlarna in mörka kanter. Små ogenomskinliga ikoner skärps lätt efteråt.

OG-bilderna (1200 x 630) ligger på kritvit botten #fbfaf7: handen till vänster mot nederkanten, rubriken i
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

KALLA = Path(__file__).resolve().parent / "logotyp.png"
ALFA_GRANS = 128       # täckning under den här räknas inte till motivet när dess ruta mäts
HAND_ANDEL = 0.71      # så stor del av ikonutsnittets höjd är hand och nål; resten är handled och underarm
SAKER_RADIE = 0.40     # maskbara ikoner: det viktiga ska ligga inom den här andelen av sidan från mitten
OG_MOTIVBREDD = 440    # handens bredd i OG-bilderna (px)

KRITVIT = "#fbfaf7"
MOSS = "#2d492d"
BLACK = "#0f0e0b"      # rubrikens bläck, samma som --ink på sajten
DAMPAD = "#5b5549"     # mono-raderna i OG-bilderna
OG_HOGERMARGINAL = 60  # inget i OG-bilderna får komma närmare högerkanten än så här (px)

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


# ---------------------------------------------------------------- motiv

def hex_rgb(hexfarg):
    return tuple(int(hexfarg[i:i + 2], 16) for i in (1, 3, 5))


def motivets_ruta(bild):
    """Omslutande rektangel (x0, y0, x1, y1) för det som är tydligt ogenomskinligt."""
    return bild.getchannel("A").point(lambda a: 255 if a >= ALFA_GRANS else 0).getbbox()


def las_motiv():
    """Källbilden som RGBA. Avbryter om den inte ser ut som utsnitten förutsätter."""
    if not KALLA.exists():
        raise SystemExit(f"Källbilden saknas: {KALLA}")
    bild = Image.open(KALLA).convert("RGBA")
    if bild.width != bild.height:
        raise SystemExit(f"Källbilden ska vara kvadratisk, inte {bild.width} x {bild.height}.")
    ruta = motivets_ruta(bild)
    if ruta is None:
        raise SystemExit("Källbilden är helt genomskinlig.")
    if ruta[3] < bild.height:
        print("  VARNING: motivet når inte bildens nederkant. Utsnitten ställer det ändå mot nederkanten.")
    return bild


def krymp(bild, storlek):
    """Krymper med ytmedelvärde. Räknar med förmultiplicerad alfa så att kanterna inte mörknar."""
    return bild.convert("RGBa").resize(storlek, Image.BOX).convert("RGBA")


def ikonutsnitt(motiv):
    """Kvadraten som ikonerna visar: motivets hela bredd, räknat från dess överkant."""
    x0, y0, x1, _ = motivets_ruta(motiv)
    return motiv.crop((x0, y0, x1, y0 + (x1 - x0)))


def hela_motivet(motiv):
    """Motivet från fingertopparna ner till bildens nederkant, där armen går ut."""
    x0, y0, x1, _ = motivets_ruta(motiv)
    return motiv.crop((x0, y0, x1, motiv.height))


def duk(storlek, bakgrund=None):
    return Image.new("RGBA", (storlek, storlek), hex_rgb(bakgrund) + (255,) if bakgrund else (0, 0, 0, 0))


def skarpa(bild):
    """Lätt skärpning efter krympning, så att konturerna inte flyter ihop på de minsta storlekarna."""
    return bild.filter(ImageFilter.UnsharpMask(radius=0.7, percent=70, threshold=0))


def ikon(utsnitt, storlek, marginal=0, bakgrund=None):
    """Ikonutsnittet på en kvadratisk duk: `marginal` px luft åt sidorna, dubbelt så mycket upptill och
    ingen nedtill. Ogenomskinliga ikoner under 100 px skärps lätt. Genomskinliga skärps inte, eftersom
    skärpning i färgkanalerna ger mörka kanter mot de genomskinliga pixlarna."""
    sida = storlek - 2 * marginal
    ut = duk(storlek, bakgrund)
    ut.alpha_composite(krymp(utsnitt, (sida, sida)), (marginal, storlek - sida))
    return skarpa(ut) if bakgrund and storlek < 100 else ut


def maskbar_ikon(motiv, storlek, bakgrund):
    """Ikon som tål att maskas till cirkel eller rundad kvadrat. Handen och nålen hålls inom den säkra
    cirkeln. Armen går ut till nederkanten och får skäras av masken, precis som den gör i källbilden."""
    hel = hela_motivet(motiv)
    viktigt_hojd = round(HAND_ANDEL * hel.width)
    radie = SAKER_RADIE * storlek
    for bredd in range(storlek, storlek // 3, -2):
        skala = bredd / hel.width
        hojd = round(hel.height * skala)
        ox, oy = (storlek - bredd) // 2, storlek - hojd
        # Kontrollera på en nedskalad täckningskarta: varje täckt pixel i den viktiga delen ska ligga i cirkeln.
        karta = hel.getchannel("A").resize((bredd, hojd), Image.BOX)
        px = karta.load()
        ryms = all(
            math.dist((ox + x + 0.5, oy + y + 0.5), (storlek / 2, storlek / 2)) <= radie
            for y in range(min(hojd, round(viktigt_hojd * skala)))
            for x in range(bredd)
            if px[x, y] >= ALFA_GRANS
        )
        if ryms:
            ut = duk(storlek, bakgrund)
            ut.alpha_composite(krymp(hel, (bredd, hojd)), (ox, oy))
            return ut
    raise SystemExit("Motivet ryms inte i den säkra cirkeln ens vid en tredjedels storlek.")


# ---------------------------------------------------------------- filer

def skriv_png(bild, namn, ut):
    sokvag = ut / namn
    if bild.getchannel("A").getextrema() == (255, 255):
        bild = bild.convert("RGB")
    bild.save(sokvag, optimize=True)
    return sokvag


def skriv_ico(utsnitt, ut):
    ramar = {storlek: ikon(utsnitt, storlek, marginal, KRITVIT) for storlek, marginal in ((16, 0), (32, 1), (48, 2))}
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
    utsnitt = ikonutsnitt(motiv)
    filer = []
    # Genomskinliga: logo.png för allmänt bruk, icon.png för sidhuvudet (visas i ungefär 34 px).
    filer.append(skriv_png(ikon(utsnitt, 512), "logo.png", ut))
    filer.append(skriv_png(ikon(utsnitt, 128), "icon.png", ut))
    # Ogenomskinliga på kritvit botten, med lite luft runt motivet.
    filer.append(skriv_png(ikon(utsnitt, 96, 6, KRITVIT), "favicon-96x96.png", ut))
    filer.append(skriv_png(ikon(utsnitt, 180, 14, KRITVIT), "apple-touch-icon.png", ut))
    # PWA-ikonerna används både omaskade och maskade. 192 px krymps från 512-versionen, så att de får
    # samma proportioner.
    stor = maskbar_ikon(motiv, 512, KRITVIT)
    filer.append(skriv_png(stor, "web-app-manifest-512x512.png", ut))
    filer.append(skriv_png(skarpa(stor.resize((192, 192), Image.BOX)), "web-app-manifest-192x192.png", ut))
    filer.append(skriv_ico(utsnitt, ut))
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
    """1200 x 630 på kritvit botten: handen till vänster mot nederkanten, rubrik och mono-rader till höger."""
    B, H = 1200, 630
    rand, glapp = 60, 48
    ut = Image.new("RGBA", (B, H), hex_rgb(KRITVIT) + (255,))

    # Handen, vänsterkant `rand` från bildkanten. Armen går ut genom nederkanten.
    hel = hela_motivet(motiv)
    mw = OG_MOTIVBREDD
    mh = round(hel.height * mw / hel.width)
    ut.alpha_composite(krymp(hel, (mw, mh)), (rand, H - mh))

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


# ---------------------------------------------------------------- huvudprogram

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Bygger AI-kartans varumärkesbilder ur scripts/brand/logotyp.png.")
    ap.add_argument("--typsnitt", type=Path, default=Path(tempfile.gettempdir()) / "ai-kartan-typsnitt",
                    help="mapp med BricolageGrotesque.ttf och JetBrainsMono-Regular.ttf (hämtas hit om de saknas)")
    ap.add_argument("--ut", type=Path, default=PUBLIC, help="målmapp (standard: public/)")
    args = ap.parse_args()

    args.ut.mkdir(parents=True, exist_ok=True)
    motiv = las_motiv()
    filer = skriv_ikoner(motiv, args.ut)
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
