// II — Pressure / Ignition. The X's two strokes as polished black monoliths in
// white fog. They close in with mass; at the drop they pass through each other
// and their shared volume, the literal crossing, ignites.
// uP: x cam-phase (0..1 over the act), y stroke-B depth offset, z ignition (0..1), w glint
// uQ: x fov punch, y glint position
export const pressure = {
  name: 'pressure',
  frag: /* glsl */ `
float dA, dB;
const float DEPTH = 0.075;
float mapP(vec3 p) {
  vec4 g = glyph4(p.xy);
  vec4 gb = glyph4(p.xy - vec2(uP.y * 0.35, 0.0));
  dA = extrude(g.y, p.z, DEPTH) - 0.002;
  dB = extrude(gb.z, p.z - uP.y, DEPTH) - 0.002;
  return min(dA, dB);
}
vec3 normalP(vec3 p) {
  vec2 e = vec2(0.0035, 0.0);
  return normalize(vec3(mapP(p + e.xyy) - mapP(p - e.xyy), mapP(p + e.yxy) - mapP(p - e.yxy), mapP(p + e.yyx) - mapP(p - e.yyx)));
}
vec3 env(vec3 r) {
  float sky = 0.55 + 0.45 * smoothstep(-0.4, 0.8, r.y);
  float box = smoothstep(0.75, 0.98, dot(r, normalize(vec3(-0.4, 0.7, 0.6))));   // a soft studio light
  return PAPER * (sky + box * 1.8);
}

void main() {
  vec2 uv = screenUV();
  float ph = uP.x;
  // camera: from the razor tip of the top flag, pulling back into a three-quarter view
  vec3 tip = vec3(0.554, 0.502, 0.0);
  vec3 ta = mix(tip + vec3(-0.02, -0.01, 0.0), vec3(X_CORE, 0.0), easeIO(sat(ph * 1.25)));
  float orbit = mix(0.15, 0.95, easeIO(ph));
  float dist = mix(0.3, 2.35, easeIO(sat(ph * 1.1)));
  vec3 ro = ta + dist * normalize(vec3(sin(orbit) * 0.9, 0.25 + 0.2 * (1.0 - ph), cos(orbit)));
  vec3 rd = camRay(uv, ro, ta, 0.08 * sin(ph * 3.0), 1.7 + uQ.x);

  float t = 0.0;
  float glow = 0.0;
  float m = 1e9;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    float d = mapP(p);
    float I = max(dA, dB);
    glow += max(exp(-max(I, 0.0) * 45.0) - 0.004, 0.0) * min(d, 0.05) * 8.0;
    if (d < 0.0007 || t > 9.0) { m = d; break; }
    t += d * 0.9;
  }
  vec3 bg = PAPER * (0.9 + 0.1 * smoothstep(-0.6, 0.6, rd.y));
  vec3 col = bg;
  if (t < 9.0) {
    vec3 p = ro + rd * t;
    vec3 n = normalP(p);
    float I = max(dA, dB);
    vec3 r = reflect(rd, n);
    float fr = 0.04 + 0.96 * pow(1.0 - sat(dot(n, -rd)), 5.0);
    float spec = pow(sat(dot(r, normalize(vec3(-0.4, 0.7, 0.6)))), 60.0);
    col = INK + env(r) * fr * 0.45 + vec3(2.2) * spec * (0.3 + 0.7 * fr);
    // edges catch a hairline of light; hats send a glint travelling along them
    float edge = 1.0 - smoothstep(0.0, 0.25, abs(n.z));
    float along = dot(p.xy - X_CORE, -DIR_XA);
    float glint = exp(-pow((along - uQ.y) / 0.05, 2.0)) * uP.w;
    col += vec3(1.0) * edge * glint * 2.5;
    // inside the other stroke: the crossing burns
    float burn = smoothstep(0.004, -0.002, I) * uP.z;
    col = mix(col, heat(1.2), burn);
    // red light spills onto the faces near the core
    float dc = length(p.xy - X_CORE);
    col += CRIMSON * uP.z * 0.6 / (1.0 + dc * dc * 220.0) * (0.4 + 0.6 * sat(n.z * sign(p.z) + 0.5));
    float fog = 1.0 - exp(-max(t - 3.0, 0.0) * 0.08);
    col = mix(col, bg, fog);
  }
  col += heat(0.9) * glow * uP.z;
  fragColor = vec4(col, 1.0);
}
`,
};
