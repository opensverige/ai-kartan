#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bygger referensgeodata för AI-kartan: Sveriges 290 kommuner och 21 län.

Källor (hämtas till en cache-mapp utanför projektet):
  - SCB, "Län och kommuner i kodnummerordning": koder och officiella namn.
  - geoBoundaries gbOpen, Sverige: ADM2 (kommuner, CC0) och ADM1 (län, CC BY 3.0).

Skriver, relativt projektroten:
  data/geo/kommuner.json          data/geo/lan.json
  public/geo/kommuner.geojson     public/geo/lan.geojson

Användning:  python scripts/geo/bygg-geodata.py [--cache MAPP] [--ny-nedladdning] [--wikidata]
Endast Pythons standardbibliotek behövs. Beskrivning och licenser: data/geo/README.md
"""
import argparse
import json
import math
import re
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from html import unescape
from pathlib import Path

ROT = Path(__file__).resolve().parents[2]
UA = "Mozilla/5.0 (compatible; ai-kartan-geodata/1.0; +https://github.com/opensverige/ai-kartan)"

SCB_URL = ("https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/"
           "lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/")
GB_API = "https://www.geoboundaries.org/api/current/gbOpen/SWE/{niva}/"
# Byggen som README beskriver (hämtade 2026-10-04). Avvikelse ger bara en varning.
GB_FORVANTAT = {"ADM2": "SWE-ADM2-70781695", "ADM1": "SWE-ADM1-68755315"}

# Manuell namnmatchning, SCB-kod -> namn i geoBoundaries.
GB_ALIAS = {"1480": "Gothenburg"}  # SCB: Göteborg
# Håbo (0305) och Habo (0643) blir båda "habo" när å -> a. Håbo får i stället "haabo".
SLUGG_UNDANTAG = {"0305": "haabo"}

BBOX = (55.0, 69.1, 10.9, 24.2)  # lat_min, lat_max, lng_min, lng_max (Sverige)
MAX_BYTES = {"kommuner": 1_500_000, "lan": 600_000}


# ---------------------------------------------------------------------------
# Hämtning och SCB-lista
# ---------------------------------------------------------------------------
def hamta(url, fil, ny=False):
  """Hämtar url till fil i cachen (återanvänds om den finns). Returnerar bytes."""
  if fil.exists() and not ny:
    print(f"  cache: {fil.name}")
    return fil.read_bytes()
  for forsok in (1, 2, 3):
    try:
      begaran = urllib.request.Request(url, headers={"User-Agent": UA})
      with urllib.request.urlopen(begaran, timeout=120) as svar:
        data = svar.read()
      break
    except OSError as fel:
      if forsok == 3:
        raise SystemExit(f"Kunde inte hämta {url}: {fel}")
      time.sleep(3 * forsok)
  fil.write_bytes(data)
  print(f"  hämtade {url.split('?')[0]} ({len(data)} byte)")
  return data


def rensa(text):
  return " ".join(unescape(text).split())  # tar också bort hårda mellanslag


def las_scb(html_text):
  """Returnerar (län, kommuner): län = [(kod, namn)], kommuner = [(kod, namn, länkod)]."""
  lan, kommuner = [], []
  sektion = re.compile(r'<h2><a id="[^"]*"></a>(\d{2}) ([^<]+)</h2>\s*<p>(.*?)</p>', re.S)
  for lkod, lnamn, kropp in sektion.findall(html_text):
    lan.append((lkod, rensa(lnamn)))
    for kod, namn in re.findall(r"(\d{4})\s+([^<\n]+)", kropp):
      kommuner.append((kod, rensa(namn), lkod))
  if len(lan) != 21 or len(kommuner) != 290 or any(not k.startswith(l) for k, _, l in kommuner):
    raise SystemExit(f"SCB-sidan gav {len(lan)} län och {len(kommuner)} kommuner (väntade 21 och 290). "
                     "Kontrollera sidans struktur, eller läs SCB:s Excel-fil i stället.")
  return lan, kommuner


def slugga(text):
  """ASCII-slug: gemener, å/ä -> a, ö -> o, é -> e (via NFKD), övriga tecken -> '-'."""
  s = unicodedata.normalize("NFKD", text.lower())
  s = "".join(c for c in s if not unicodedata.combining(c))
  return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ---------------------------------------------------------------------------
# geoBoundaries och namnmatchning
# ---------------------------------------------------------------------------
def las_gb(niva, cache, ny):
  """Hämtar metadata och förenklad GeoJSON för Sverige. Returnerar features."""
  meta = json.loads(hamta(GB_API.format(niva=niva), cache / f"geoBoundaries-SWE-{niva}-api.json", ny))
  gj = json.loads(hamta(meta["simplifiedGeometryGeoJSON"], cache / f"geoBoundaries-SWE-{niva}_simplified.geojson", ny))
  print(f"  {niva}: {meta['boundaryID']} | {meta['boundaryLicense']} | avser {meta['boundaryYearRepresented']} "
        f"| byggd {meta['buildDate']} | {len(gj['features'])} enheter")
  if meta["boundaryID"] != GB_FORVANTAT[niva]:
    print(f"  VARNING: annat bygge än väntat ({GB_FORVANTAT[niva]}). Kontrollera källa och licens, uppdatera README.")
  return gj["features"]


def nyckel(text, utan_diakriter=False):
  """Jämförelsenyckel: gemener, utan mellanslag och bindestreck (valfritt även utan diakriter)."""
  s = unicodedata.normalize("NFKD" if utan_diakriter else "NFC", text).casefold()
  if utan_diakriter:
    s = "".join(c for c in s if not unicodedata.combining(c))
  return re.sub(r"[\s\-]+", "", s)


def para_ihop(poster, features, alias):
  """Kopplar SCB-poster [(id, namn)] till geoBoundaries-features via namn, i tre steg:
  exakt namn, namn utan diakriter (bara om entydigt, så att Håbo/Habo aldrig blandas) och manuell alias.
  Returnerar ({id: feature}, anmärkningar om icke-exakta träffar)."""
  kvar = {f["properties"]["shapeName"]: f for f in features}
  funna, anm = {}, []
  for steg in ("exakt", "diakriter", "alias"):
    for pid, namn in poster:
      if pid in funna:
        continue
      if steg == "alias":
        kand = [alias[pid]] if alias.get(pid) in kvar else []
      else:
        d = steg == "diakriter"
        kand = [g for g in kvar if nyckel(g, d) == nyckel(namn, d)]
        if d and sum(nyckel(n, True) == nyckel(namn, True) for _, n in poster) != 1:
          kand = []  # tvetydigt på SCB-sidan
      if len(kand) == 1:
        funna[pid] = kvar.pop(kand[0])
        if steg != "exakt":
          anm.append(f"{pid} {namn} <- {funna[pid]['properties']['shapeName']} ({steg})")
  if len(funna) != len(poster) or kvar:
    saknas = [f"{p} {n}" for p, n in poster if p not in funna]
    raise SystemExit(f"Namnmatchningen gick inte ihop. SCB utan polygon: {saknas}. "
                     f"Polygoner utan SCB-post: {sorted(kvar)}. Lägg till i GB_ALIAS.")
  return funna, anm


# ---------------------------------------------------------------------------
# Geometri. Koordinater är (lng, lat) i grader. Beräkningar sker i meter i en
# ytriktig projektion (Lambert azimutal, centrerad på Sverige), så att
# tyngdpunkten blir rätt även för långa och smala kommuner i norr.
# ---------------------------------------------------------------------------
R = 6371007.2                       # jordens autaliska radie, meter
P0, L0 = math.radians(63.0), 16.0   # projektionscentrum (lat, lng)
S0, C0 = math.sin(P0), math.cos(P0)


def proj(lng, lat):
  """Grader -> meter."""
  p, dl = math.radians(lat), math.radians(lng - L0)
  k = math.sqrt(2 / (1 + S0 * math.sin(p) + C0 * math.cos(p) * math.cos(dl)))
  return (R * k * math.cos(p) * math.sin(dl),
          R * k * (C0 * math.sin(p) - S0 * math.cos(p) * math.cos(dl)))


def invproj(x, y):
  """Meter -> (lng, lat) i grader."""
  rho = math.hypot(x, y)
  if rho == 0:
    return L0, math.degrees(P0)
  c = 2 * math.asin(rho / (2 * R))
  lat = math.degrees(math.asin(math.cos(c) * S0 + y * math.sin(c) * C0 / rho))
  lng = L0 + math.degrees(math.atan2(x * math.sin(c), rho * C0 * math.cos(c) - y * S0 * math.sin(c)))
  return lng, lat


def delar(geom):
  """GeoJSON-geometri -> lista av polygoner (polygon = [yttre ring, hål, ...])."""
  return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def ring_yta_tp(ring):
  """Absolut yta och tyngdpunkt för en sluten ring (shoelace-formeln)."""
  a = cx = cy = 0.0
  for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
    k = x0 * y1 - x1 * y0
    a += k
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  if a == 0:
    return 0.0, ring[0][0], ring[0][1]
  return abs(a) / 2, cx / (3 * a), cy / (3 * a)


def poly_yta_tp(poly):
  """Yta och tyngdpunkt för polygon = yttre ring minus hål."""
  yta = sx = sy = 0.0
  for i, ring in enumerate(poly):
    a, x, y = ring_yta_tp(ring)
    t = 1 if i == 0 else -1
    yta += t * a
    sx += t * a * x
    sy += t * a * y
  return yta, sx / yta, sy / yta


def i_ring(x, y, ring):
  inne = False
  for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
    if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
      inne = not inne
  return inne


def i_poly(x, y, poly):
  return i_ring(x, y, poly[0]) and not any(i_ring(x, y, h) for h in poly[1:])


def inrepunkt(poly, y):
  """Mitten av det längsta inre intervallet längs linjen genom y (ligger alltid inuti polygonen)."""
  xs = []
  for ring in poly:
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
      if (y0 > y) != (y1 > y):
        xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
  xs.sort()
  a, b = max(zip(xs[0::2], xs[1::2]), key=lambda p: p[1] - p[0])
  return (a + b) / 2, y


def representativ_punkt(geom):
  """Tyngdpunkten för geometrins största del (störst yta). Hamnar den utanför delen
  (konkava former) används i stället en inre punkt längs samma breddgrad.
  Returnerar (lat, lng, metod), lat/lng avrundade till 4 decimaler."""
  delar_m = [[[proj(c[0], c[1]) for c in ring] for ring in poly] for poly in delar(geom)]
  storst = max(delar_m, key=lambda p: poly_yta_tp(p)[0])
  _, x, y = poly_yta_tp(storst)
  metod = "tyngdpunkt"
  if not i_poly(x, y, storst):
    x, y = inrepunkt(storst, y)
    metod = "inre punkt"
  lng, lat = invproj(x, y)
  return round(lat, 4), round(lng, 4), metod


def i_delar(lng, lat, delar_ll):
  return any(i_poly(lng, lat, poly) for poly in delar_ll)


# ---------------------------------------------------------------------------
# Förenkling och skrivning av GeoJSON. Hörnen hanteras som heltal i enheten 1e-4 grader
# (= avrundning till 4 decimaler), så att alla geometritester blir exakta.
# ---------------------------------------------------------------------------
ENHET = 10_000


def kors(a, b, c):
  """Korsprodukten (b-a) x (c-a), exakt (heltal)."""
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def orient(a, b, c):
  """Tecken på korsprodukten: 1 moturs, -1 medurs, 0 på rät linje."""
  v = kors(a, b, c)
  return (v > 0) - (v < 0)


def pa_stracka(a, b, c):
  """Ligger c, som redan ligger på linjen a-b, inom sträckan a-b?"""
  return min(a[0], b[0]) <= c[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= c[1] <= max(a[1], b[1])


def skar(p1, p2, p3, p4):
  """Skär eller berör sträckan p1-p2 sträckan p3-p4?"""
  o1, o2, o3, o4 = orient(p1, p2, p3), orient(p1, p2, p4), orient(p3, p4, p1), orient(p3, p4, p2)
  if o1 != o2 and o3 != o4:
    return True
  return ((o1 == 0 and pa_stracka(p1, p2, p3)) or (o2 == 0 and pa_stracka(p1, p2, p4))
          or (o3 == 0 and pa_stracka(p3, p4, p1)) or (o4 == 0 and pa_stracka(p3, p4, p2)))


def stada_heltal(pts):
  """Öppen lista av heltalshörn -> sluten ring utan upprepade hörn och utan hörn som ligger exakt på en
  rät linje mellan grannarna (även nålspetsar). Tom lista om färre än 3 hörn återstår."""
  pts = [p for k, p in enumerate(pts) if k == 0 or p != pts[k - 1]]
  andrad = True
  while andrad and len(pts) >= 3:
    andrad, i = False, 0
    while i < len(pts) and len(pts) >= 3:
      if orient(pts[i - 1], pts[i], pts[(i + 1) % len(pts)]) == 0:
        del pts[i]
        andrad, i = True, max(i - 1, 0)
      else:
        i += 1
  return pts + [pts[0]] if len(pts) >= 3 else []


def stada_ring(ring):
  """Ring av (lng, lat) -> sluten ring av heltal i enheten 1e-4 grader, städad enligt stada_heltal."""
  oppen = ring[:-1] if ring[0] == ring[-1] else ring
  return stada_heltal([(round(c[0] * ENHET), round(c[1] * ENHET)) for c in oppen])


def orientera(ring, moturs):
  """RFC 7946: yttre ringar moturs, hål medurs."""
  a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:]))
  return ring if (a > 0) == moturs else ring[::-1]


def forbered(geom):
  """Geometri -> lista av polygoner med städade, reparerade och orienterade heltalsringar."""
  polygoner = [[stada_ring(r) for r in poly] for poly in delar(geom)]
  platta = [r for p in polygoner for r in p]
  reparera(platta)
  it = iter(platta)
  ut = []
  for poly in ([next(it) for _ in p] for p in polygoner):
    if poly[0]:  # yttre ringen försvann om den var mindre än rutnätet: hela delen utgår
      ut.append([orientera(r, k == 0) for k, r in enumerate(poly) if r])
  return ut


class Segmentnat:
  """Rutnät över sträckorna i en lista ringar (heltalskoordinater). Används för att hitta sträckor
  som en ny genväg skulle korsa."""
  CELL = 64

  def __init__(self, ringar):
    self.ringar, self.celler = ringar, {}
    for r, ring in enumerate(ringar):
      for s in range(len(ring) - 1):
        for c in self.celler_for(ring[s], ring[s + 1]):
          self.celler.setdefault(c, []).append((r, s))

  def celler_for(self, a, b):
    x0, x1 = sorted((a[0] // self.CELL, b[0] // self.CELL))
    y0, y1 = sorted((a[1] // self.CELL, b[1] // self.CELL))
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

  def kandidater(self, a, b):
    ut = set()
    for c in self.celler_for(a, b):
      ut.update(self.celler.get(c, ()))
    return ut

  def genvag_korsar(self, r, i, j):
    """Skär genvägen från hörn i till hörn j i ring r någon sträcka utanför sin egen kedja? Kedjans
    sträckor och de två grannsträckorna (som delar ändpunkt med genvägen) räknas inte."""
    ring = self.ringar[r]
    n = len(ring) - 1
    a, b = ring[i], ring[j]
    for r2, s in self.kandidater(a, b):
      if r2 == r and (i <= s < j or s == (i - 1) % n or s == j % n):
        continue
      if skar(a, b, self.ringar[r2][s], self.ringar[r2][s + 1]):
        return True
    return False


def konflikter(ringar):
  """Genererar (r, s, r2, s2) för sträckpar i ringlistan som korsar eller berör varandra utan att vara
  grannar i samma ring. Tomma ringar hoppas över."""
  nat = Segmentnat(ringar)
  for r, ring in enumerate(ringar):
    n = len(ring) - 1
    for s in range(n):
      for r2, s2 in sorted(nat.kandidater(ring[s], ring[s + 1])):
        if (r2, s2) <= (r, s) or (r2 == r and (s2 - s) % n in (1, n - 1)):
          continue
        if skar(ring[s], ring[s + 1], ringar[r2][s2], ringar[r2][s2 + 1]):
          yield r, s, r2, s2


def korsningar(ringar):
  return sum(1 for _ in konflikter(ringar))


def reparera(ringar):
  """Avrundningen kan få smala spetsar och trånga vikar att korsa eller nudda sig själva. Tar bort ett hörn
  i taget, det med minst triangelarea av konfliktens fyra ändpunkter, tills inga konflikter återstår.
  Ändrar listan på plats; ringar som försvinner blir tomma."""
  for _ in range(1000):
    k = next(konflikter(ringar), None)
    if k is None:
      return
    r, s, r2, s2 = k
    kand = []
    for rr, i in ((r, s), (r, s + 1), (r2, s2), (r2, s2 + 1)):
      ring, n = ringar[rr], len(ringar[rr]) - 1
      i %= n
      kand.append((abs(kors(ring[(i - 1) % n], ring[i], ring[(i + 1) % n])), rr, i))
    _, rr, i = min(kand)
    oppen = ringar[rr][:-1]
    del oppen[i]
    ringar[rr] = stada_heltal(oppen)
  raise SystemExit("Reparationen av ringar konvergerade inte")


def punkt_till_stracka(p, a, b):
  dx, dy = b[0] - a[0], b[1] - a[1]
  l2 = dx * dx + dy * dy
  t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) if l2 else 0.0
  return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def forenkla_ring(k, ring, tol, nat):
  """Douglas-Peucker (tol i meter, avstånd till sträckan) på ring nr k i nätet nat. En genväg godtas bara
  om den inte skär någon annan sträcka i samma feature, så ringarna förblir enkla och delarna överlappar
  inte. Ringen delas vid hörnet längst från start."""
  n = len(ring) - 1  # sista hörnet == första
  if tol <= 0 or n < 5:
    return ring
  m = [proj(x / ENHET, y / ENHET) for x, y in ring]
  s = max(range(1, n), key=lambda i: (m[i][0] - m[0][0]) ** 2 + (m[i][1] - m[0][1]) ** 2)
  behall = [False] * (n + 1)
  behall[0] = behall[s] = behall[n] = True
  stack = [(0, s), (s, n)]
  while stack:
    i, j = stack.pop()
    if j - i < 2:
      continue
    dmax, q = max((punkt_till_stracka(m[v], m[i], m[j]), v) for v in range(i + 1, j))
    if dmax > tol or nat.genvag_korsar(k, i, j):
      behall[q] = True
      stack += [(i, q), (q, j)]
  ut = [p for p, b in zip(ring, behall) if b]
  return ut if len(ut) >= 4 else ring


def forenkla_feature(polygoner, tol, nat):
  """Förenklar alla ringar i en feature (nat = Segmentnat över featurens ringar i samma ordning)."""
  enkla = (forenkla_ring(k, r, tol, nat) for k, r in enumerate(r for p in polygoner for r in p))
  return [[next(enkla) for _ in p] for p in polygoner]


def tal(v):
  """Heltal i 1e-4 grader -> decimaltal med högst 4 decimaler och utan onödiga nollor."""
  s = f"{abs(v) // ENHET}.{abs(v) % ENHET:04d}".rstrip("0").rstrip(".")
  return "-" + s if v < 0 else s


def ring_text(ring):
  return "[" + ",".join(f"[{tal(x)},{tal(y)}]" for x, y in ring) + "]"


def geom_text(polygoner):
  if len(polygoner) == 1:
    return '{"type":"Polygon","coordinates":[' + ",".join(ring_text(r) for r in polygoner[0]) + "]}"
  delar_t = ("[" + ",".join(ring_text(r) for r in p) + "]" for p in polygoner)
  return '{"type":"MultiPolygon","coordinates":[' + ",".join(delar_t) + "]}"


def geojson_text(poster):
  """FeatureCollection med en feature per rad (kompakt men diffvänligt)."""
  rader = ['{"type":"Feature","properties":' + json.dumps(egenskaper, ensure_ascii=False, separators=(",", ":"))
           + ',"geometry":' + geom_text(polygoner) + "}" for egenskaper, polygoner in poster]
  return '{\n  "type": "FeatureCollection",\n  "features": [\n    ' + ",\n    ".join(rader) + "\n  ]\n}\n"


def bygg_geojson(namn, kalla, max_bytes):
  """Bygger GeoJSON-texten med minsta förenklingstolerans (hela meter) som ger filen under max_bytes.
  Tolerans 0 betyder bara avrundning och städning."""
  lager = [(egenskaper, forbered(geom)) for egenskaper, geom in kalla]
  nat = []

  def bygg(tol):
    if tol > 0 and not nat:  # rutnäten byggs först när förenkling behövs
      nat.extend(Segmentnat([r for p in polygoner for r in p]) for _, polygoner in lager)
    poster = [(egenskaper, forenkla_feature(polygoner, tol, nat[f] if nat else None))
              for f, (egenskaper, polygoner) in enumerate(lager)]
    return poster, geojson_text(poster)

  def ryms(tol):
    return len(bygg(tol)[1].encode("utf-8")) < max_bytes

  lag, hog = -1, 0  # lag ryms inte, hog ryms (eftersöks)
  while not ryms(hog):
    lag, hog = hog, max(1, hog * 2)
    if hog > 4096:
      raise SystemExit(f"{namn}: kommer inte under {max_bytes} byte ens med mycket stor tolerans")
  while hog - lag > 1:  # bisektion: minsta hela tolerans som ryms
    mitt = (lag + hog) // 2
    lag, hog = (mitt, hog) if not ryms(mitt) else (lag, mitt)
  poster, text = bygg(hog)
  hornpunkter = sum(len(r) for _, ps in poster for p in ps for r in p)
  print(f"  {namn}: tolerans {hog} m, {hornpunkter} punkter, {len(text.encode('utf-8'))} byte")
  return text


def skriv(sokvag, text):
  sokvag.parent.mkdir(parents=True, exist_ok=True)
  with open(sokvag, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)


def json_text(obj):
  return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


# ---------------------------------------------------------------------------
# Kontroller
# ---------------------------------------------------------------------------
def haversine_km(lat1, lng1, lat2, lng2):
  p1, p2 = math.radians(lat1), math.radians(lat2)
  a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
  return 12742 * math.asin(math.sqrt(a))


def kontrollera(kommuner, lan, kom_fil, lan_fil, lan_geom):
  """Läser tillbaka de skrivna filerna och kontrollerar dem. Avslutar med fel om något är fel."""
  fel = []

  def kolla(ok, text):
    print(("  OK    " if ok else "  FEL   ") + text)
    if not ok:
      fel.append(text)

  kolla(len(kommuner) == 290 and len(lan) == 21, f"{len(kommuner)} kommuner och {len(lan)} län")
  kolla(len({k["kod"] for k in kommuner}) == 290 and len({l["kod"] for l in lan}) == 21,
        "unika koder (kommuner och län)")
  kolla(len({p["slug"] for p in kommuner + lan}) == 311,
        "unika slugar, även mellan kommuner och län (en gemensam namnrymd för platser)")
  lan_koder = {l["kod"] for l in lan}
  kolla(all(k["lan_kod"] in lan_koder and k["kod"][:2] == k["lan_kod"] for k in kommuner),
        "alla kommuners lan_kod finns i lan.json och stämmer med de två första siffrorna")
  la0, la1, lo0, lo1 = BBOX
  kolla(all(la0 <= p["lat"] <= la1 and lo0 <= p["lng"] <= lo1 for p in kommuner + lan),
        f"alla punkter inom Sveriges ruta (lat {la0}-{la1}, lng {lo0}-{lo1})")

  kom_gj, lan_gj = json.loads(kom_fil.read_text("utf-8")), json.loads(lan_fil.read_text("utf-8"))
  for namn, gj, n, nycklar in (("kommuner.geojson", kom_gj, 290, {"kod", "namn", "lan_kod"}),
                               ("lan.geojson", lan_gj, 21, {"kod", "namn"})):
    kolla(gj["type"] == "FeatureCollection" and len(gj["features"]) == n
          and all(set(f["properties"]) == nycklar for f in gj["features"]),
          f"{namn} läses som GeoJSON: {len(gj['features'])} features med rätt egenskaper")
    ringar = [r for f in gj["features"] for p in delar(f["geometry"]) for r in p]
    kolla(all(len(r) >= 4 and r[0] == r[-1] for r in ringar), f"{namn}: alla {len(ringar)} ringar är slutna")
    kolla(all(la0 <= y <= la1 and lo0 <= x <= lo1 for r in ringar for x, y in r),
          f"{namn}: alla hörnpunkter inom Sveriges ruta")
    antal = sum(korsningar([[(round(x * ENHET), round(y * ENHET)) for x, y in ring]
                            for p in delar(f["geometry"]) for ring in p]) for f in gj["features"])
    kolla(antal == 0, f"{namn}: inga ringar korsar sig själva eller varandra inom en feature (exakt heltalstest)")
  for fil, grans in ((kom_fil, MAX_BYTES["kommuner"]), (lan_fil, MAX_BYTES["lan"])):
    kolla(fil.stat().st_size < grans, f"{fil.name}: {fil.stat().st_size} byte (gräns {grans})")

  kgeom = {f["properties"]["kod"]: delar(f["geometry"]) for f in kom_gj["features"]}
  ute = [k["namn"] for k in kommuner if not i_delar(k["lng"], k["lat"], kgeom[k["kod"]])]
  kolla(not ute, "varje kommunpunkt ligger inuti sin egen polygon i den skrivna filen" + (f" (utanför: {ute})" if ute else ""))
  lgeom = {f["properties"]["kod"]: delar(f["geometry"]) for f in lan_gj["features"]}
  ute = [p["namn"] for p in lan if not i_delar(p["lng"], p["lat"], lgeom[p["kod"]])]
  kolla(not ute, "varje länspunkt ligger inuti sin egen polygon i den skrivna filen" + (f" (utanför: {ute})" if ute else ""))

  # Kommunpunkt mot länspolygon. Källorna är olika (kommuner 2017, län 2009), därför bara information.
  fel_lan = [f"{k['namn']} ({k['lan_namn']})" for k in kommuner if not i_delar(k["lng"], k["lat"], lan_geom[k["lan_kod"]])]
  print(f"  INFO  kommunpunkter utanför sitt läns ADM1-polygon: {len(fel_lan)}" + (f" {fel_lan}" if fel_lan else ""))
  if fel:
    raise SystemExit(f"{len(fel)} kontroll(er) misslyckades")


def kontrollera_wikidata(kommuner, cache, ny):
  """Valfri extra kontroll: finns alla SCB-koder som kommunkod (P525) i Wikidata, och hur långt
  ligger våra punkter från Wikidatas koordinater (P625)? Stora kommuner kan avvika flera mil."""
  fraga = "SELECT ?kod ?coord WHERE { ?k wdt:P31 wd:Q127448; wdt:P525 ?kod. OPTIONAL { ?k wdt:P625 ?coord } }"
  url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": fraga, "format": "json"})
  rader = json.loads(hamta(url, cache / "wikidata-kommuner.json", ny))["results"]["bindings"]
  koord = {}
  for r in rader:
    lista = koord.setdefault(r["kod"]["value"], [])
    m = re.match(r"Point\((\S+) (\S+)\)", r.get("coord", {}).get("value", ""))
    if m:
      lista.append((float(m.group(2)), float(m.group(1))))
  saknas = [k["kod"] for k in kommuner if k["kod"] not in koord]
  print(f"  Wikidata: {len(koord)} kommunkoder (inkl. f.d. kommuner); saknas från SCB-listan: {saknas or 'inga'}")
  avst = sorted(((min(haversine_km(k["lat"], k["lng"], *c) for c in koord[k["kod"]]), k["namn"])
                 for k in kommuner if koord.get(k["kod"])), reverse=True)
  print("  Största avstånd till Wikidatas punkt (km): " + ", ".join(f"{n} {d:.0f}" for d, n in avst[:8]))
  if saknas:
    raise SystemExit("Koder saknas i Wikidata")


# ---------------------------------------------------------------------------
def main():
  sys.stdout.reconfigure(encoding="utf-8", errors="replace")
  ap = argparse.ArgumentParser(description="Bygger kommun- och länsdata för AI-kartan.")
  ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "ai-kartan-geo",
                  help="mapp för nedladdade källfiler, utanför projektet (standard: %(default)s)")
  ap.add_argument("--ny-nedladdning", action="store_true", help="hämta källfilerna på nytt även om de finns i cachen")
  ap.add_argument("--wikidata", action="store_true", help="kontrollera koder och punkter mot Wikidata (valfritt)")
  args = ap.parse_args()
  cache, ny = args.cache, args.ny_nedladdning
  cache.mkdir(parents=True, exist_ok=True)
  print(f"Cache: {cache}")

  print("Hämtar källor")
  lan_scb, kom_scb = las_scb(hamta(SCB_URL, cache / "scb-kodnummer.html", ny).decode("utf-8"))
  lan_namn = dict(lan_scb)
  gb2, gb1 = las_gb("ADM2", cache, ny), las_gb("ADM1", cache, ny)

  print("Matchar namn")
  f2, anm2 = para_ihop([(k, n) for k, n, _ in kom_scb], gb2, GB_ALIAS)
  f1, anm1 = para_ihop(lan_scb, gb1, {})
  print(f"  {len(f2)} kommuner och {len(f1)} län matchade; icke-exakta träffar: {anm2 + anm1 or 'inga'}")

  slugg = {kod: SLUGG_UNDANTAG.get(kod, slugga(namn)) for kod, namn, _ in kom_scb}
  krockar = [s for s, n in Counter(slugg.values()).items() if n > 1]
  if krockar:
    raise SystemExit(f"Slugkrock: {krockar}. Lägg till de berörda koderna i SLUGG_UNDANTAG.")

  print("Beräknar punkter")
  kommuner, lan, reserv = [], [], []
  for kod, namn, lkod in sorted(kom_scb):
    lat, lng, metod = representativ_punkt(f2[kod]["geometry"])
    if metod != "tyngdpunkt":
      reserv.append(f"{kod} {namn}")
    kommuner.append({"kod": kod, "namn": namn, "slug": slugg[kod], "lan_kod": lkod,
                     "lan_namn": lan_namn[lkod], "lat": lat, "lng": lng})
  for kod, namn in sorted(lan_scb):
    lat, lng, metod = representativ_punkt(f1[kod]["geometry"])
    if metod != "tyngdpunkt":
      reserv.append(f"{kod} {namn}")
    lan.append({"kod": kod, "namn": namn, "slug": slugga(namn), "lat": lat, "lng": lng})
  print(f"  punkter där inre punkt används i stället för tyngdpunkten: {reserv or 'inga'}")

  print("Skriver filer")
  kom_gj = bygg_geojson("kommuner.geojson",
                        [({"kod": k["kod"], "namn": k["namn"], "lan_kod": k["lan_kod"]}, f2[k["kod"]]["geometry"])
                         for k in kommuner], MAX_BYTES["kommuner"])
  lan_gj = bygg_geojson("lan.geojson",
                        [({"kod": l["kod"], "namn": l["namn"]}, f1[l["kod"]]["geometry"]) for l in lan],
                        MAX_BYTES["lan"])
  kom_fil, lan_fil = ROT / "public/geo/kommuner.geojson", ROT / "public/geo/lan.geojson"
  skriv(ROT / "data/geo/kommuner.json", json_text(kommuner))
  skriv(ROT / "data/geo/lan.json", json_text(lan))
  skriv(kom_fil, kom_gj)
  skriv(lan_fil, lan_gj)

  print("Kontroller")
  kontrollera(kommuner, lan, kom_fil, lan_fil, {k: delar(f["geometry"]) for k, f in f1.items()})
  if args.wikidata:
    kontrollera_wikidata(kommuner, cache, ny)
  print("Klart.")


if __name__ == "__main__":
  main()
