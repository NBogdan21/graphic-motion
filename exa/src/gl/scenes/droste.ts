// VII — Impossible architecture. The lockup as a paper-cut relief: white on
// white, legible only through the shadows its edges cast under a raking light.
// Inside the A's counter, standing on its crossbar, is another EXA, and inside
// that one another. The camera falls through them endlessly.
// uP: x zoom phase (levels, continuous), y tilt, z light angle, w ink (0 paper, 1 ink)
export const droste = {
  name: 'droste',
  frag: /* glsl */ `
const vec2 DC = vec2(0.697, -0.121);  // where the child stands: on the A's crossbar
const float DR = 0.11;                // child scale
const float RELIEF = 0.022;

float relief(vec2 p) { return glyphAll(p); }

vec3 shadeLevel(vec2 p, float px, float ink, vec2 l2, float level) {
  vec4 g = glyph4(p);
  float d = min(min(g.x, g.y), min(g.z, g.w));
  // cast shadow: march toward the light across the relief
  float sh = 1.0;
  float slen = RELIEF / 0.2;
  for (int i = 1; i <= 14; i++) {
    float s = slen * float(i) / 14.0;
    float h = relief(p + l2 * s);
    sh = min(sh, sat(h / (0.004 + s * 0.08) + 0.5));
  }
  sh = mix(sh, 1.0, step(d, 0.0) * 0.85);
  // bevel at the cut edge
  vec2 e = vec2(0.0015, 0.0);
  vec2 grad = normalize(vec2(relief(p + e) - relief(p - e), relief(p + e.yx) - relief(p - e.yx)) + 1e-6);
  float edge = exp(-abs(d) / (px * 1.5 + 0.0015));
  float facing = dot(-grad, l2);
  float fib = vnoise(p * 900.0 / (1.0 + level)) * 0.5 + vnoise(rot(0.6) * p * vec2(140.0, 1600.0)) * 0.5;
  vec3 paperC = PAPER * (0.955 + 0.03 * fib);
  vec3 inkC = INK * (1.0 + 2.5 * fib) + vec3(0.012);
  vec3 base = mix(paperC, inkC, ink);
  vec3 col = base * mix(1.0, mix(0.58, 0.25, ink), 1.0 - sh);
  // inside the relief: a touch brighter (paper) or catches the light rim (ink)
  float inside = smoothstep(px, -px, d);
  col = mix(col, base * mix(1.012, 1.6, ink), inside * 0.6);
  col += mix(vec3(0.05), vec3(0.7), ink) * edge * sat(facing) * (1.0 - step(0.0, d) * 0.5);
  col *= 1.0 - mix(0.12, 0.0, ink) * edge * sat(-facing);
  // the crossing of the X burns at every level
  float core = max(g.y, g.z);
  col = mix(col, heat(1.0), smoothstep(px, -px, core));
  col += CRIMSON * 0.5 * exp(-max(core, 0.0) / 0.02);
  return col;
}

void main() {
  vec2 uv = screenUV();
  float ink = uP.w;
  // a tilted ray onto the paper plane gives the relief an architectural perspective
  float tilt = uP.y;
  vec3 ro = vec3(0.0, -tilt * 1.2, 1.0);
  vec3 rd = camRay(uv, ro, vec3(0.0), 0.0, 1.6);
  float tt = -ro.z / rd.z;
  vec2 sp = (ro + rd * tt).xy;

  // continuous zoom toward the fixed point of the recursion
  vec2 F = DC / (1.0 - DR);
  float lv = uP.x;
  float fl = floor(lv);
  float fr = lv - fl;
  float scale = pow(DR, fr) * 1.45;
  vec2 p = F + sp * scale;
  float px = scale / uRes.y * 1.6;
  vec2 l2 = normalize(vec2(cos(uP.z), sin(uP.z)));
  float level = 0.0;
  // descend while the point lies inside the child's frame
  for (int i = 0; i < 4; i++) {
    vec2 c = (p - DC) / DR;
    if (abs(c.x) < 1.65 && c.y > -0.5 && c.y < 0.62) { p = c; px /= DR; level += 1.0; }
    else break;
  }
  vec3 col = shadeLevel(p, px, ink, l2, level);
  // the deeper the level, the further away: a breath of atmosphere
  col = mix(col, mix(PAPER, INK, ink), sat(level * 0.0));
  fragColor = vec4(col, 1.0);
}
`,
};
