// V — Letter landscape (ink world). The lockup carved into a vast black plain
// under a single raking light. Hairlines become razor walls; stems become
// plateaus. Red burns only where the letters touch each other.
// uP: x travel (0..1 along the lockup), y altitude, z plan view (0..1), w light angle
export const terrain = {
  name: 'terrain',
  frag: /* glsl */ `
const float S = 4.0;        // cap height in world units
const float HGT = 0.34;
vec4 gT;
// letters only; the floor is intersected analytically
float mapL(vec3 p) {
  gT = glyph4(p.xz / S) * S;
  float d2 = min(min(gT.x, gT.y), min(gT.z, gT.w));
  return max(d2, max(p.y - HGT, -p.y - 0.05));
}
float mapT(vec3 p) { return min(mapL(p), p.y); }
vec3 normalT(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(mapT(p + e.xyy) - mapT(p - e.xyy), mapT(p + e.yxy) - mapT(p - e.yxy), mapT(p + e.yyx) - mapT(p - e.yyx)));
}
float shadowT(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.01;
  for (int i = 0; i < 40; i++) {
    float h = mapL(ro + rd * t);
    res = min(res, 12.0 * h / t);
    t += clamp(h, 0.01, 0.15);
    if (res < 0.001 || t > 6.0) break;
  }
  return sat(res);
}
float touch(vec4 g) {
  float gx = min(g.y, g.z);
  float ex = max(g.x, gx);            // E meets X
  float xa = max(g.w, gx);            // X meets A
  float xx = max(g.y, g.z);           // the X's own crossing
  return min(min(ex, xa), xx);
}

void main() {
  vec2 uv = screenUV();
  float tr = uP.x;
  float plan = easeIO(uP.z);
  // skim along the front of the lockup, looking across it into the backlight
  vec3 ro = vec3(mix(-8.2, 2.6, tr), uP.y, -4.4 + 0.5 * sin(tr * 3.0));
  vec3 ta = ro + vec3(1.0, -0.34, 1.05);
  // then rise into a plan view: the letters as the plan of a city
  vec3 roP = vec3(0.4 + tr * 0.6, 9.5, -3.2);
  vec3 taP = vec3(0.2, 0.0, -0.2);
  ro = mix(ro, roP, plan);
  ta = mix(ta, taP, plan);
  vec3 rd = camRay(uv, ro, ta, mix(-0.05, -0.35, plan), mix(1.35, 1.9, plan));
  vec3 L = normalize(vec3(cos(uP.w) * 0.5, 0.22, 1.0));

  float tg = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float tEnd = min(tg, 40.0);
  float t = 0.02;
  float glow = 0.0;
  bool hit = false;
  for (int i = 0; i < 140; i++) {
    vec3 p = ro + rd * t;
    float d = mapL(p);
    float tc = touch(gT);
    glow += max(exp(-max(tc, 0.0) * 14.0) - 0.01, 0.0) * smoothstep(HGT + 0.5, 0.0, p.y) * min(d, 0.1) * 0.5;
    if (d < 0.0008 * t) { hit = true; break; }
    t += d * 0.9;
    if (t > tEnd) break;
  }
  if (!hit && tg < 40.0) { t = tg; hit = true; }
  vec3 sky = INK + vec3(0.07, 0.065, 0.065) * exp(-max(rd.y, 0.0) * 9.0) * smoothstep(-0.2, 0.1, rd.y);
  vec3 col = sky;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalT(p);
    float sh = shadowT(p + n * 0.004, L);
    float dif = sat(dot(n, L));
    vec3 r = reflect(rd, n);
    float spec = pow(sat(dot(r, L)), 80.0);
    float fr = 0.04 + 0.96 * pow(1.0 - sat(dot(n, -rd)), 5.0);
    bool ground = p.y < 0.001;
    col = INK * (ground ? 0.5 : 1.0);
    col += vec3(0.5) * dif * sh * (ground ? 0.02 : 0.05);
    col += vec3(1.0) * spec * sh * (ground ? 0.12 : 0.35);
    col += sky * fr * (ground ? 0.8 : 0.25);
    // the light catches the top edges of every wall: hairlines of white
    float topEdge = smoothstep(HGT - 0.02, HGT - 0.003, p.y) * (1.0 - abs(n.y));
    col += vec3(0.85) * topEdge * (0.25 + 0.75 * sat(dot(n, L) + 0.4));
    float lip = smoothstep(0.9, 1.0, n.y) * step(HGT - 0.002, p.y) * exp(-abs(min(min(gT.x, gT.y), min(gT.z, gT.w))) / 0.015);
    col += vec3(0.5) * lip;
    float tc = touch(gT);
    float burn = smoothstep(0.03, -0.01, tc);
    col = mix(col, heat(1.0), burn * step(HGT - 0.01, p.y));
    col += CRIMSON * 0.9 * max(exp(-max(tc, 0.0) * 14.0) - 0.004, 0.0) * (ground ? 1.0 : 0.25);
    col = mix(col, sky, 1.0 - exp(-max(t - 2.0, 0.0) * 0.045));
  }
  col += heat(0.8) * glow;
  fragColor = vec4(col, 1.0);
}
`,
};
