// IV — Ink genesis. Ink blooming in water, slowly organising itself into the E:
// stem, bracketed serifs, blade-thin arms. Where the edge of one plume runs
// through another, a crimson filament appears.
// uP: x form (0 chaos .. 1 letter), y zoom, z/w centre
// uQ: x pulse (808 pressure), y red amount
export const ink = {
  name: 'ink',
  frag: /* glsl */ `
float field(vec2 p, float tau, float form, out float aux) {
  vec2 q = p * 1.7;
  vec2 w1 = vec2(fbm3(q + vec2(0.0, tau * 0.06)), fbm3(q + vec2(5.2, 1.3) - tau * 0.05));
  vec2 w2 = vec2(fbm(q + 3.5 * w1 + vec2(1.7, 9.2) + tau * 0.08), fbm(q + 3.5 * w1 + vec2(8.3, 2.8)));
  float turb = fbm(q + 3.8 * w2 - tau * 0.03);
  aux = fbm3(q * 1.3 + 2.5 * w1.yx + vec2(3.1, 7.7) + tau * 0.05);
  float settle = 1.0 - 0.97 * form;
  vec2 wp = p + (w2 - 0.5) * 0.32 * settle;
  vec4 g = glyph4(wp);
  float shape = 0.56 - g.x * (3.0 + 16.0 * form);
  return mix(turb, shape + (turb - 0.5) * 0.25 * settle, form);
}

void main() {
  vec2 uv = screenUV();
  float form = uP.x;
  vec2 p = uv * uP.y + uP.zw;
  float tau = uTime + uQ.x * 0.35;
  float aux, aux2;
  float F = field(p, tau, form, aux);
  vec2 L = normalize(vec2(-0.6, 0.8));
  float F2 = field(p + L * 0.012 * uP.y, tau, form, aux2);

  float dens = smoothstep(0.47, 0.66, F);
  float wisp = smoothstep(0.38, 0.55, F) * 0.35;
  float a = sat(dens + wisp * (1.0 - dens));
  // self-shadowing inside the cloud gives it volume
  float shade = sat(0.5 + (F - F2) * 9.0);
  vec3 inkCol = mix(INK, vec3(0.09, 0.085, 0.083), shade * (1.0 - dens * 0.7));
  vec3 col = mix(PAPER * (0.97 + 0.03 * uv.y), inkCol, pow(a, 0.85));
  // light scattering at the cloud edge
  col += vec3(0.05) * smoothstep(0.42, 0.5, F) * smoothstep(0.6, 0.5, F) * (1.0 - shade);
  // crimson filaments where the boundary of one plume threads through the other
  float px = uP.y / uRes.y;
  float iso = exp(-abs(aux - 0.52) / (px * 1.2 + 0.0006));
  float inside = smoothstep(0.4, 0.5, F) * smoothstep(0.72, 0.58, F);
  col = mix(col, heat(0.95), sat(iso * inside * uQ.y));
  fragColor = vec4(col, 1.0);
}
`,
};
