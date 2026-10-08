// I — Hairline. Extreme macro on paper under grazing light. An ink hairline
// wicks through the fibres; a second one approaches at the X's other angle.
// They never touch, so there is no red yet.
// uP: x pull-back (0..1), y head-1 progress, z head-2 progress, w focus
export const paper = {
  name: 'paper',
  frag: /* glsl */ `
float fibres(vec2 q) {
  float h = 0.0;
  h += vnoise(rot(0.35) * q * vec2(260.0, 1500.0)) * 0.4;
  h += vnoise(rot(-0.9) * q * vec2(240.0, 1400.0) + 13.1) * 0.4;
  h += vnoise(rot(1.9) * q * vec2(280.0, 1600.0) + 7.7) * 0.4;
  h += vnoise(q * 900.0) * 0.3;
  return h;
}

// ink density for a hairline along dir through origin, drawn up to head (s < head)
float hairline(vec2 q, vec2 dir, float head, float fib, float px, out float wet) {
  vec2 nrm = vec2(-dir.y, dir.x);
  float s = dot(q, dir);
  float n = dot(q, nrm);
  float a = s - head;                       // >0 ahead of the ink front
  // the pen's pressure: a slight swell where the ink is still arriving
  float w = 0.00065 * (1.0 + 0.6 * exp(-a * a / 0.000004) * step(a, 0.0015));
  // capillary feathering follows the fibres, at fibre scale, never as a wobble
  float feather = (vnoise(rot(0.35) * q * vec2(900.0, 9000.0)) - 0.5) * 0.00028 + (fib - 0.6) * 0.00018;
  float edge = abs(n) - w - feather;
  float front = a + (vnoise(q * 4000.0) - 0.5) * 0.0005;
  float aa = px * 0.7 + 0.00004;
  float core = smoothstep(aa, -aa, edge) * smoothstep(aa * 2.0, -aa * 2.0, front);
  // seepage into individual fibres beside the line
  float seep = exp(-max(abs(n) - w, 0.0) / 0.0007) * smoothstep(0.0005, -0.004, front) * pow(sat(fib - 0.55) * 2.2, 3.0);
  wet = exp(-max(a + 0.002, 0.0) * 500.0) * step(a, 0.0) * smoothstep(0.0, -0.0004, edge);
  return sat(core + seep * 0.35);
}

void main() {
  vec2 uv = screenUV();
  float pull = uP.x;
  float h = mix(0.018, 0.08, easeIO(pull));
  vec2 target = mix(DIR_XB * (uP.y - 0.004), vec2(0.0, -0.004), easeIO(pull));
  vec3 ta = vec3(target, 0.0);
  vec3 ro = ta + vec3(rot(-0.5 + 0.25 * pull) * vec2(0.0, -h * 1.1), h);
  vec3 rd = camRay(uv, ro, ta, 0.42 - 0.18 * pull, 1.6);
  float t = -ro.z / rd.z;
  vec2 q = ro.xy + rd.xy * t;

  // depth of field: fibre detail and ink edges soften away from focus
  float focus = length(ta - ro);
  float coc = abs(t - focus) / focus;
  float sharp = 1.0 / (1.0 + coc * 10.0);
  float px = t * 1.0 / (uRes.y * 1.6) * (1.0 + coc * 30.0);

  float e = 0.00012;
  float f0 = fibres(q);
  float fx = fibres(q + vec2(e, 0.0));
  float fy = fibres(q + vec2(0.0, e));
  vec3 n = normalize(vec3((f0 - fx), (f0 - fy), e * 420.0 / (0.2 + 0.8 * sharp)));
  vec3 L = normalize(vec3(-0.75, 0.55, 0.22));
  float lit = dot(n, L) - L.z;
  // grazing light falls off across the sheet
  float fall = 0.97 - 0.05 * smoothstep(-0.6, 0.9, uv.x - uv.y * 0.5);
  vec3 col = PAPER * (fall + 0.11 * lit * sharp);

  float wet1, wet2;
  float i1 = hairline(q, DIR_XB, uP.y, f0, px, wet1);
  float i2 = hairline(q, -DIR_XA, uP.z, f0 + 0.13, px, wet2);
  float ink = max(i1, i2);
  // defocus spreads the ink
  col = mix(col, INK * (1.0 + 3.0 * (1.0 - sharp)), ink * mix(0.55, 1.0, sharp));
  // the wet ink front catches the grazing light
  float spec = pow(sat(dot(reflect(rd, vec3(0, 0, 1)), L)), 24.0);
  col += vec3(0.35) * spec * max(wet1, wet2) * sharp;
  // pressure from the 808 drone just before the cut: the paper darkens a breath
  col *= 1.0 - 0.06 * uQ.x;
  fragColor = vec4(col, 1.0);
}
`,
};
