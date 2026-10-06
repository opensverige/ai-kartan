// Läser ytorna i ett lager ur en vektorbricka (Mapbox Vector Tile). Bara det som behövs för att
// avgöra om en punkt ligger i vatten: lagrets namn, dess ytor och brickans upplösning. Skriven
// här i stället för att dra in ett paket, eftersom den bara används när land.json byggs om.

/** Läser ett varint på plats `p.i` och flyttar fram platsen. */
function varint(buf, p) {
  let tal = 0;
  let steg = 1;
  let b;
  do {
    b = buf[p.i++];
    tal += (b & 0x7f) * steg;
    steg *= 128;
  } while (b >= 0x80);
  return tal;
}

/** Går igenom fälten i ett protobuf-meddelande. `ta(nr, varde, start, slut)` får tal eller byteintervall. */
function falt(buf, start, slut, ta) {
  const p = { i: start };
  while (p.i < slut) {
    const nyckel = varint(buf, p);
    const nr = Math.floor(nyckel / 8);
    const typ = nyckel & 7;
    if (typ === 0) ta(nr, varint(buf, p));
    else if (typ === 2) {
      const langd = varint(buf, p);
      ta(nr, null, p.i, p.i + langd);
      p.i += langd;
    } else if (typ === 5) p.i += 4;
    else if (typ === 1) p.i += 8;
    else throw new Error(`Okänd fälttyp ${typ} i brickan`);
  }
}

const zigzag = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);

/** Geometrins kommandon till ringar av [x, y] i brickans enheter. */
function ringar(buf, start, slut) {
  const p = { i: start };
  const ut = [];
  let ring = null;
  let x = 0;
  let y = 0;
  while (p.i < slut) {
    const kommando = varint(buf, p);
    const sort = kommando & 7;
    const antal = Math.floor(kommando / 8);
    if (sort === 7) continue; // ClosePath: ringen är redan sluten i hur den används här
    for (let n = 0; n < antal; n++) {
      x += zigzag(varint(buf, p));
      y += zigzag(varint(buf, p));
      if (sort === 1) ut.push((ring = []));
      ring.push([x, y]);
    }
  }
  return ut;
}

/** Ytorna i lagret `namn`: en lista med ytor, där varje yta är en lista med ringar. */
export function lasLager(buf, namn) {
  const resultat = { extent: 4096, ytor: [] };
  falt(buf, 0, buf.length, (nr, _varde, start, slut) => {
    if (nr !== 3) return;
    let lagernamn = '';
    let extent = 4096;
    const ytor = [];
    falt(buf, start, slut, (f, varde, s, e) => {
      if (f === 1) lagernamn = Buffer.from(buf.subarray(s, e)).toString('utf8');
      else if (f === 5) extent = varde;
      else if (f === 2) {
        let typ = 0;
        let geometri = null;
        falt(buf, s, e, (g, v, gs, ge) => {
          if (g === 3) typ = v;
          else if (g === 4) geometri = [gs, ge];
        });
        if (typ === 3 && geometri) ytor.push(ringar(buf, geometri[0], geometri[1]));
      }
    });
    if (lagernamn === namn) {
      resultat.extent = extent;
      resultat.ytor.push(...ytor);
    }
  });
  return resultat;
}

/** Sant om punkten ligger i ringen, räknat med en stråle åt höger. */
function iRing(ring, px, py) {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}

/**
 * Sant om punkten ligger i någon av ytorna. Inom en yta räknas ringarna ihop med jämn-udda-regeln,
 * så att ett hål i ytan, till exempel en ö i en sjö, inte räknas som en del av den.
 */
export function iYta(ytor, px, py) {
  return ytor.some((yta) => yta.reduce((inne, ring) => (iRing(ring, px, py) ? !inne : inne), false));
}

/** Vilken bricka en koordinat ligger i på en zoomnivå, och var i brickan. */
export function brickpunkt(lat, lng, zoom, extent) {
  const n = 2 ** zoom;
  const fx = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: Math.floor((fx - x) * extent), py: Math.floor((fy - y) * extent) };
}
