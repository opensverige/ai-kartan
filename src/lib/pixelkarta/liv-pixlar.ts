/**
 * Träd som vajar och vatten som rör sig i en pixelstad: en genomskinlig WebGL-duk som flyttar
 * kartbildens egna punkter. Den är en del av lagret i liv.ts och ligger under duken med bilarna.
 * Varje gång bildvisaren har ritat kopieras dess bild till en textur, och ett program på
 * grafikkortet ritar sedan bara de punkter det ändrar:
 *
 * - Träd. En punkt som är grön och har grönt lövverk bredvid sig tar färgen av en punkt en eller
 *   två bildpunkter mot vinden. Hur långt beror på en vindby (de går över kartan från nordväst,
 *   400 m isär) och på ett fladder som byts åtta gånger i sekunden. En punkt som inte själv är
 *   grön målas aldrig över, så en krona glider inte ut över en vägg eller en gata. Gräsmattor
 *   lämnas, eftersom de är släta: lövverk skiljs från gräs på att det är skrovligt.
 * - Vatten. Kartbildens öppna vatten har en enda fyllnadsfärg och känns igen på den. En dyning av
 *   lite ljusare och mörkare band rör sig över det sex gånger i sekunden i fält om 3 x 2
 *   bildpunkter, och då och då syns en ljus vågkam i en halv sekund.
 *
 * Träd och vatten hittas på färgen i den ritade kartbilden, inte med masker, så det fungerar för
 * varje stad. Priset: allt annat i precis de färgerna rör sig också. Båda tonas bort när kartan
 * är så långt utzoomad att en bildpunkt är mycket mindre än en skärmpunkt. Där skulle de bara flimra.
 */
import type { Del, Verktyg, Vy } from './liv';

const HORN = '#version 300 es\nin vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

const PUNKT = `#version 300 es
precision highp float;
uniform sampler2D uKarta;   // kartbilden som den står på skärmen just nu
uniform vec2 uStorlek;      // dukens storlek i enhetens punkter
uniform vec2 uNolla;        // var bildpunkt (0, 0) ligger, enhetens punkter från övre vänstra hörnet
uniform float uSkala;       // enhetens punkter per bildpunkt
uniform float uTid;
uniform vec2 uVind;         // medvind, ett enhetssteg i bildpunkter
uniform float uTrad;        // 0..1, hur mycket av varje verkan vid den här zoomen
uniform float uVatten;
out vec4 farg;

// ett hack som håller sig jämnt också för koordinater i tiotusental (ett byggt på sinus gör inte det)
float hack(vec2 v) { vec3 q = fract(vec3(v.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float brus(vec2 v) {
  vec2 i = floor(v), f = fract(v);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hack(i), hack(i + vec2(1.0, 0.0)), f.x), mix(hack(i + vec2(0.0, 1.0)), hack(i + vec2(1.0, 1.0)), f.x), f.y);
}
// kartbildens färg ett antal bildpunkter bort från den här punkten (x åt höger, y nedåt)
vec3 kartaVid(vec2 steg) { return texture(uKarta, (gl_FragCoord.xy + vec2(steg.x, -steg.y) * uSkala) / uStorlek).rgb; }
bool gron(vec3 c) { return c.g > 0.26 && c.g > c.r * 1.22 && c.g > c.b * 1.3; }
float ljus(vec3 c) { return dot(c, vec3(0.3, 0.6, 0.1)); }

void main() {
  vec3 har = texture(uKarta, gl_FragCoord.xy / uStorlek).rgb;
  vec2 m = (vec2(gl_FragCoord.x, uStorlek.y - gl_FragCoord.y) - uNolla) / uSkala;   // den här punkten i bildpunkter
  farg = vec4(0.0);

  if (uTrad > 0.0 && gron(har)) {
    float by = 0.5 + 0.5 * sin(dot(m, uVind) * (6.2832 / 1600.0) - uTid * 1.1);
    float slag = floor(uTid * 8.0);
    float fladder = brus(m / 9.0 + slag * vec2(0.37, 0.23));
    float flytt = floor(by * 1.5 + fladder * 1.3);                 // 0, 1 eller 2 bildpunkter
    if (flytt > 0.0) {
      vec2 fran = -uVind * flytt;                                    // punkten mot vinden
      vec3 dar = kartaVid(fran);
      // lövverk är skrovligt: ljuset ändras inom tre bildpunkter. Gräs är slätt och står kvar.
      float skrovligt = max(abs(ljus(dar) - ljus(kartaVid(fran + vec2(3.0, 0.0)))), abs(ljus(dar) - ljus(kartaVid(fran + vec2(0.0, 3.0)))));
      if (gron(dar) && skrovligt > 0.05) farg = vec4(mix(har, dar, uTrad), 1.0);
    }
    return;
  }

  // det öppna vattnets fyllnadsfärg, med det fina grus som sammanfogningen ger den
  bool vatten = har.r < 0.07 && har.g > 0.25 && har.g < 0.38 && har.b > 0.37 && har.b < 0.50 && har.b - har.g > 0.08;
  if (uVatten > 0.0 && vatten) {
    vec2 falt = floor(m / vec2(3.0, 2.0));
    float tick = floor(uTid * 6.0) / 6.0;
    float dyning = sin(falt.y * 0.5 + sin(falt.x * 0.09 + tick * 0.6) * 1.7 + brus(falt * 0.05) * 5.0 - tick * 2.0);
    // banden syns i fält som driver, inte som linjer från strand till strand
    float var = brus(falt * vec2(0.035, 0.06) + vec2(tick * 0.05, -tick * 0.03));
    float ton = var > 0.42 ? (dyning > 0.78 ? 0.04 * smoothstep(0.42, 0.6, var) : (dyning < -0.85 ? -0.018 : 0.0)) : 0.0;
    // en vågkam: ett kort ljust streck på toppen av en dyning, i en halv sekund
    vec2 streck = floor(m / vec2(7.0, 2.0));
    float kam = (dyning > 0.5 && var > 0.42 && hack(streck + floor(uTid * 2.0) * 17.0) > 0.994) ? clamp((uSkala - 0.3) / 0.4, 0.0, 1.0) : 0.0;
    if (ton != 0.0 || kam > 0.0) {
      vec3 flyttad = har + ton * vec3(0.5, 1.0, 1.1) + kam * vec3(0.36, 0.42, 0.42);
      farg = vec4(mix(har, flyttad, uVatten), 1.0);
    }
  }
}`;

const NAMN = ['uKarta', 'uStorlek', 'uNolla', 'uSkala', 'uTid', 'uVind', 'uTrad', 'uVatten'] as const;

export function pixeldel(v: Verktyg): Del {
  const duk = v.dukUnder();
  let gl: WebGL2RenderingContext | null = null;
  let redo = false;
  let harBild = false;
  let textur: WebGLTexture | null = null;
  let kopior = 0;
  let ritningar = 0;
  const platser: Partial<Record<(typeof NAMN)[number], WebGLUniformLocation | null>> = {};

  /** Programmet, bufferten och texturen. De görs om efter en förlorad ritkontext. */
  function bygg() {
    redo = false;
    harBild = false;
    gl ??= duk.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return;
    const g = gl;
    const kompilera = (sort: number, text: string): WebGLShader => {
      const s = g.createShader(sort);
      if (!s) throw new Error('inget program');
      g.shaderSource(s, text);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'kompilering');
      return s;
    };
    try {
      const program = g.createProgram();
      if (!program) throw new Error('inget program');
      g.attachShader(program, kompilera(g.VERTEX_SHADER, HORN));
      g.attachShader(program, kompilera(g.FRAGMENT_SHADER, PUNKT));
      g.linkProgram(program);
      if (!g.getProgramParameter(program, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(program) ?? 'länkning');
      g.useProgram(program);
      // en triangel som täcker rutan
      g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      const var_ = g.getAttribLocation(program, 'p');
      g.enableVertexAttribArray(var_);
      g.vertexAttribPointer(var_, 2, g.FLOAT, false, 0, 0);
      for (const namn of NAMN) platser[namn] = g.getUniformLocation(program, namn);
      textur = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, textur);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true); // så att en punkt läser kartbildens punkt under sig
      g.uniform1i(platser.uKarta ?? null, 0);
      redo = true;
    } catch {
      redo = false; // inga punkter som rör sig på den här datorn; resten går vidare
    }
  }
  bygg();
  duk.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    redo = false;
  });
  duk.addEventListener('webglcontextrestored', bygg);

  function torka() {
    if (!gl || !redo) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  return {
    oppna() {
      harBild = false;
      torka();
    },
    rensa() {
      harBild = false;
      torka();
    },
    steg() {},
    rita(vy: Vy, franKartan: boolean) {
      if (!gl || !redo) return;
      const g = gl;
      // punkter som rör sig är det första som får gå när datorn inte håller takten
      if (v.niva() < 3) {
        if (harBild) {
          torka();
          harBild = false;
        }
        return;
      }
      const stad = v.stad();
      const kalla = (v.visare.drawer as unknown as { canvas?: HTMLCanvasElement }).canvas;
      if (!stad || !kalla || !kalla.width || !kalla.height) return;
      if (duk.width !== kalla.width || duk.height !== kalla.height) {
        duk.width = kalla.width;
        duk.height = kalla.height;
        harBild = false;
      }
      const tathet = kalla.width / (v.ruta().bredd || kalla.width); // enhetens punkter per skärmpunkt
      const skala = vy.skala * tathet;
      // inget att se när en bildpunkt är långt mindre än en skärmpunkt
      const trad = Math.max(0, Math.min(1, (skala - 0.45) / 0.3));
      const vatten = Math.max(0, Math.min(1, (skala - 0.1) / 0.15));
      if (trad <= 0 && vatten <= 0) {
        torka();
        harBild = false;
        return;
      }
      // kartbilden ändras bara när bildvisaren ritar; däremellan behålls kopian
      if (franKartan || !harBild) {
        g.bindTexture(g.TEXTURE_2D, textur);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, kalla);
        harBild = true;
        kopior += 1;
      }
      // medvind: vinden kommer från nordväst, så den blåser mot sydost
      const a = (stad.riktning * Math.PI) / 180;
      const ost = 0.7071;
      const nord = -0.7071;
      const vx = ost * Math.cos(a) - nord * Math.sin(a);
      const vy_ = -(ost * Math.sin(a) + nord * Math.cos(a)) / Math.SQRT2;
      const vl = Math.hypot(vx, vy_) || 1;
      g.viewport(0, 0, duk.width, duk.height);
      torka();
      g.uniform2f(platser.uStorlek ?? null, duk.width, duk.height);
      g.uniform2f(platser.uNolla ?? null, vy.ox * tathet, vy.oy * tathet);
      g.uniform1f(platser.uSkala ?? null, skala);
      g.uniform1f(platser.uTid ?? null, v.klocka());
      g.uniform2f(platser.uVind ?? null, vx / vl, vy_ / vl);
      g.uniform1f(platser.uTrad ?? null, trad);
      g.uniform1f(platser.uVatten ?? null, vatten);
      g.drawArrays(g.TRIANGLES, 0, 3);
      ritningar += 1;
    },
    tillstand: () => ({ punkter: redo, punktkopior: kopior, punktritningar: ritningar }),
  };
}
