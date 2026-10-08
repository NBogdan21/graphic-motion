// IX — The Mark. The logo redrawn procedurally, exactly as designed:
// E and A in ink, the X's right half solid, its left half still in motion
// as fanned ribbons with crimson rims, a hot seam through the crossing.
// uP: x zoom, y/z centre offset, w motion (0 = solid X, 1 = logo state)
// uQ: x hot-point breath, y recede (letters dissolve, core remains), z core-only fade, w ribbon drift
export const mark = {
  name: 'mark',
  frag: /* glsl */ `
// The trailing half of an X stroke, fanned into exposures (chronophotography).
// Works in the stroke's frame: s = distance from the core along the trail, n = across it.
// Ribbons are layered back to front: dark at the core, burning crimson, fading to paper.
vec3 fan(vec3 col, vec2 p, vec2 dir, vec2 perp, float hw, float L, float spread, float px, float fade, float drift) {
  vec2 rc = p - X_CORE;
  float s = dot(rc, dir);
  float n = dot(rc, perp);
  float t = s / L;
  if (t < -0.2 || t > 1.4) return col;
  float tt = sat(t);
  float ends = 1.0 - smoothstep(0.47, 0.6, abs(p.y));   // stops at cap line and baseline
  float base = smoothstep(-0.06, 0.0, s) * ends * fade;
  float blur = px + 0.0015 + 0.022 * tt * tt;
  // bodies, back to front
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float c = (fi - 1.5) / 1.5 * hw * 0.42 + spread * (0.06 * (fi - 0.8) * pow(tt, 1.2) + 0.035 * tt * tt + 0.09 * tt * (1.0 - tt) * spread + 0.004 * drift * sin(uTime * 0.9 + fi * 1.7) * tt);
    float w = hw * (0.6 - 0.03 * fi) * (1.0 - 0.3 * tt);
    float dn = n - c;
    float body = smoothstep(w + blur, w - blur, abs(dn));
    vec3 bc = mix(INK, OXBLOOD * 3.5, smoothstep(0.18, 0.5, tt));
    bc = mix(bc, CRIMSON * (0.8 + 0.08 * fi), smoothstep(0.45, 0.78, tt));
    bc = mix(bc, mix(CRIMSON, PAPER, 0.7), smoothstep(0.8, 1.08, tt));
    // the sheet is lit across its width: darker on the inner edge
    bc *= 0.75 + 0.5 * sat(dn / w * 0.5 + 0.5);
    float a = body * (0.97 - 0.05 * fi) * (1.0 - smoothstep(0.82, 1.15, tt) * 0.95) * base;
    col = mix(col, bc, a);
  }
  // rims on top: each exposure's leading edge catches the light
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float c = (fi - 1.5) / 1.5 * hw * 0.42 + spread * (0.06 * (fi - 0.8) * pow(tt, 1.2) + 0.035 * tt * tt + 0.09 * tt * (1.0 - tt) * spread + 0.004 * drift * sin(uTime * 0.9 + fi * 1.7) * tt);
    float w = hw * (0.6 - 0.03 * fi) * (1.0 - 0.3 * tt);
    float re = abs(n - c - w * 0.9);
    float rim = exp(-re / (px * 0.8 + 0.004 * tt * tt)) * smoothstep(0.02, 0.12, s) * (1.0 - smoothstep(0.6, 1.0, tt)) * base;
    vec3 rcol = mix(CRIMSON * 1.9, vec3(1.0, 0.55, 0.5), smoothstep(0.45, 0.85, tt) * 0.7);
    col = mix(col, rcol, sat(rim * (0.75 + 0.25 * hash11(fi * 3.7))));
  }
  return col;
}

void main() {
  vec2 uv = screenUV();
  float zoom = uP.x;
  vec2 p = uv * zoom + uP.yz;
  float px = zoom / uRes.y;
  float motion = uP.w;
  float recede = uQ.y;

  vec4 g = glyph4(p);
  vec3 col = PAPER;
  // the faint shadow of ink on paper (printed, not floating)
  float all = min(min(g.x, g.w), min(g.y, g.z));
  col *= 1.0 - 0.025 * exp(-max(all, 0.0) / 0.01) * (1.0 - recede);

  // ---- E and A
  float ea = smoothstep(px, -px, min(g.x, g.w)) * (1.0 - recede);
  col = mix(col, INK, ea);

  // ---- X: solid halves
  vec2 rc = p - X_CORE;
  float sA = dot(rc, -DIR_XA);   // toward the top-right flag
  float sB = dot(rc, DIR_XB);    // toward the bottom-right flag
  float keepA = mix(1.0, smoothstep(-0.1, 0.06, sA), motion);
  float keepB = mix(1.0, smoothstep(-0.1, 0.06, sB), motion);
  float xa = smoothstep(px, -px, g.y) * keepA;
  float xb = smoothstep(px, -px, g.z) * keepB;
  // sheen along the strokes: lacquer, not flat print
  float sheenA = exp(-pow((dot(rc, vec2(-DIR_XA.y, DIR_XA.x)) + 0.03) / 0.05, 2.0)) * smoothstep(0.1, 0.45, sA);
  float sheenB = exp(-pow((dot(rc, vec2(-DIR_XB.y, DIR_XB.x)) - 0.02) / 0.05, 2.0)) * smoothstep(0.1, 0.45, sB);
  vec3 inkA = INK + vec3(0.035) * sheenA;
  vec3 inkB = INK + vec3(0.03) * sheenB;
  float xr = 1.0 - recede;
  col = mix(col, inkA, xa * xr);
  col = mix(col, inkB, xb * xr);

  // ---- X: the half still in motion. Two fans of exposures.
  float fadeR = motion * xr;
  if (fadeR > 0.001) {
    col = fan(col, p, -DIR_XB, vec2(0.7342, 0.6789), 0.092, 0.68, motion, px, fadeR, uQ.w);
    col = fan(col, p, DIR_XA, vec2(0.7179, -0.6961), 0.089, 0.70, motion, px, fadeR, uQ.w);
  }
  float dCore = length(rc);

  // ---- hot seam: a filament of light through the crossing, riding the "\\" stroke
  vec2 nB = vec2(-DIR_XB.y, DIR_XB.x);
  float seamOff = dot(rc, nB) - 0.04;
  float seamAlong = dot(rc, DIR_XB);
  float seamLen = exp(-pow(max(seamAlong, 0.0) / 0.2, 2.0)) * exp(-pow(min(seamAlong, 0.0) / 0.12, 2.0));
  float seam = exp(-abs(seamOff) / (px * 1.4)) * seamLen;
  float breath = 1.0 + uQ.x;
  col = mix(col, CRIMSON * 1.7 * breath, sat(seam * motion * xr));
  // the core glow
  float glow = exp(-dCore / 0.05) * 0.25 + exp(-dCore / 0.2) * 0.08;
  col += CRIMSON * glow * (0.45 + 0.55 * motion) * (0.6 + 0.8 * uQ.x) * (1.0 - uQ.z) * xr;
  // when everything else has receded, the crossing remains as a single point of light
  col = mix(col, CRIMSON * 1.8, exp(-dCore / 0.006) * recede * (1.0 - uQ.z));
  col += CRIMSON * 0.25 * exp(-dCore / 0.04) * recede * (1.0 - uQ.z);
  col = mix(col, PAPER, uQ.z * (1.0 - exp(-dCore / 0.01)));

  fragColor = vec4(col, 1.0);
}
`,
};
