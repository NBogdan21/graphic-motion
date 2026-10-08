// VI — Velocity (chronophotography). The X moving faster than an image can hold.
// It leaves its own exposures behind: lacquered sheets with crimson rims, and
// a red trajectory traced by the hot point of each exposure. On the 808 the
// echoes snap back into one solid; then they release again.
// uP: x spread, y helix twist, z camera orbit, w camera distance
// uQ: x glass (breakdown), y motion phase, z camera height, w ink (1) / paper (0)
export const velocity = {
  name: 'velocity',
  frag: /* glsl */ `
const int N = 14;

void main() {
  vec2 uv = screenUV();
  float spread = uP.x;
  vec3 ta = vec3(0.35 * spread * 6.0, 0.0, -0.4 * spread * 6.0);
  vec3 ro = ta + uP.w * vec3(sin(uP.z), uQ.z, cos(uP.z));
  vec3 rd = camRay(uv, ro, ta, 0.0, 1.55);
  float paper = 1.0 - uQ.w;
  vec3 bg = mix(INK + vec3(0.01) * exp(-dot(uv, uv) * 2.0), PAPER * (0.95 + 0.05 * uv.y), paper);

  // gather hits on every exposure plane, then composite back to front
  float hitT[N];
  vec4 hitC[N];
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float age = fi / float(N - 1);
    // exposure frame: translated along the motion, fanned, twisting into a helix
    vec3 o = vec3(fi * 0.35 * spread, 0.02 * sin(fi * 1.3 + uQ.y), -fi * 0.4 * spread);
    float a = fi * uP.y * spread + 0.06 * fi * spread;
    vec3 U = vec3(cos(a), sin(a), 0.0);
    vec3 V = vec3(-sin(a), cos(a), 0.0);
    vec3 Nn = vec3(0.0, 0.0, 1.0);
    float den = dot(rd, Nn);
    float t = abs(den) > 1e-4 ? dot(o - ro, Nn) / den : -1.0;
    hitT[i] = t;
    hitC[i] = vec4(0.0);
    if (t <= 0.0) continue;
    vec3 h = ro + rd * t - o;
    vec2 q = vec2(dot(h, U), dot(h, V)) + X_CORE;
    vec4 g = glyph4(q);
    float d = min(g.y, g.z);
    float px = t / (uRes.y * 1.55) * 1.3;
    float blur = px + age * age * 0.012 * spread;
    float body = smoothstep(blur, -blur, d);
    // the leading edge (facing the direction of travel) carries the light
    vec2 e = vec2(0.004, 0.0);
    vec4 gx = glyph4(q + e), gy = glyph4(q + e.yx);
    vec2 grad = vec2(min(gx.y, gx.z) - d, min(gy.y, gy.z) - d);
    float lead = smoothstep(-0.2, 0.8, dot(normalize(grad + 1e-6), normalize(vec2(1.0, 0.25))));
    float rim = exp(-abs(d) / (px * 1.1 + 0.002 * age)) * lead;
    float core = smoothstep(0.004, -0.004, max(g.y, g.z));
    // lacquer: a soft reflection band slides across the newest sheets
    float band = exp(-pow(dot(q - X_CORE, vec2(0.6, 0.8)) - 0.35 * sin(uP.z * 1.7 + fi * 0.15 + uQ.y * 0.2), 2.0) / 0.012);
    float fresh = pow(0.62, fi);
    vec3 lacquer = INK + vec3(mix(0.16, 0.5, paper)) * band * fresh + vec3(0.012);
    vec3 bodyCol = mix(lacquer, mix(OXBLOOD * 1.2, INK, paper * 0.6), sat(age * 1.6));
    // the newest exposure is solid lacquer; the rest is a continuous translucent sweep
    float alpha = body * (i == 0 ? 0.97 : mix(0.2, 0.06, age)) * mix(1.0, 0.2, uQ.x);
    vec3 c = bodyCol * alpha;
    float on = smoothstep(0.0, 0.06, spread);
    // strobe: only every third exposure is caught by the flash
    float strobe = (i % 3 == 0) ? 1.0 : 0.12;
    float rimA = rim * strobe * pow(0.86, fi) * on;
    vec3 rimCol = mix(CRIMSON * 1.8, vec3(0.9, 0.5, 0.45), uQ.x * 0.7);
    c += rimCol * rimA;
    // the hot point of every exposure: crimson, never white
    float rc = length(q - X_CORE);
    c += CRIMSON * (exp(-rc / 0.01) * 2.2 + exp(-rc / 0.05) * 0.35) * mix(1.0, 0.35, age) * on;
    c += CRIMSON * 0.6 * core * (i == 0 ? 1.0 : 0.0);
    alpha = mix(alpha, body * 0.08 + rimA * 0.4, uQ.x);
    hitC[i] = vec4(c, sat(alpha + rimA * 0.5));
  }
  // painter's order: farthest first
  vec3 col = bg;
  for (int k = 0; k < N; k++) {
    int best = -1;
    float bt = -1.0;
    for (int i = 0; i < N; i++) {
      if (hitT[i] > bt) { bt = hitT[i]; best = i; }
    }
    if (best < 0 || bt <= 0.0) break;
    vec4 c = hitC[best];
    col = col * (1.0 - c.a) + c.rgb;
    hitT[best] = -2.0;
  }
  // the trajectory of the hot point through all exposures
  fragColor = vec4(col, 1.0);
}
`,
};
