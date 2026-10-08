// The EXA lockup as a physical sculpture: four lacquered parts (E, the two X
// strokes, A), each with its own transform, so the letters can assemble, stand
// as monoliths, or settle into print. Where the X strokes interpenetrate, the
// crossing ignites. Fast-moving X strokes trail their exposures.
// uK: 0-2 E offset, 3-5 A offset, 6-8 "/" offset, 9-11 "\\" offset,
//     12 depth, 13 trail, 14 ignition, 15 glint
// uP: x yaw, y pitch, z distance, w ortho (0 perspective .. 1 near-orthographic)
// uQ: xyz target, w ink world
// uR: x roll, y exposure-trail direction scale, z floor (paper shadow), w hot breath
export const sculpture = {
  name: 'sculpture',
  frag: /* glsl */ `
vec3 OE, OA, OXA, OXB;
float DEP;
float sE, sA, sXA, sXB;

float mapS(vec3 p) {
  sE = extrude(glyph4(p.xy - OE.xy).x, p.z - OE.z, DEP) - 0.002;
  sA = extrude(glyph4(p.xy - OA.xy).w, p.z - OA.z, DEP) - 0.002;
  sXA = extrude(glyph4(p.xy - OXA.xy).y, p.z - OXA.z, DEP) - 0.002;
  sXB = extrude(glyph4(p.xy - OXB.xy).z, p.z - OXB.z, DEP) - 0.002;
  return min(min(sE, sA), min(sXA, sXB));
}
vec3 normalS(vec3 p) {
  vec2 e = vec2(0.003, 0.0);
  return normalize(vec3(mapS(p + e.xyy) - mapS(p - e.xyy), mapS(p + e.yxy) - mapS(p - e.yxy), mapS(p + e.yyx) - mapS(p - e.yyx)));
}
// exposures left behind by the X strokes (their offsets were larger a moment ago)
float trailGlow(vec3 p) {
  float g = 0.0;
  for (int k = 1; k <= 4; k++) {
    float fk = float(k);
    vec3 oa = OXA * (1.0 + fk * 0.22 * uR.y);
    vec3 ob = OXB * (1.0 + fk * 0.22 * uR.y);
    float da = extrude(glyph4(p.xy - oa.xy).y, p.z - oa.z, DEP);
    float db = extrude(glyph4(p.xy - ob.xy).z, p.z - ob.z, DEP);
    g += (exp(-abs(da) * 90.0) + exp(-abs(db) * 90.0)) * (1.0 - fk / 5.0);
  }
  return g;
}

void main() {
  vec2 uv = screenUV();
  OE = vec3(uK[0], uK[1], uK[2]);
  OA = vec3(uK[3], uK[4], uK[5]);
  OXA = vec3(uK[6], uK[7], uK[8]);
  OXB = vec3(uK[9], uK[10], uK[11]);
  DEP = uK[12];
  float trail = uK[13];
  float ignite = uK[14];
  float ink = uQ.w;

  float ortho = uP.w;
  float fov = mix(1.7, 14.0, ortho * ortho);
  float dist = uP.z * fov / 1.7;
  vec3 ta = uQ.xyz;
  vec3 dir = vec3(sin(uP.x) * cos(uP.y), sin(uP.y), cos(uP.x) * cos(uP.y));
  vec3 ro = ta + dir * dist;
  vec3 rd = camRay(uv, ro, ta, uR.x, fov);

  vec3 bg = mix(PAPER * (0.93 + 0.07 * smoothstep(-0.5, 0.5, uv.y)), INK + OXBLOOD * 0.25 * exp(-dot(uv, uv) * 3.0), ink);
  bg = mix(bg, PAPER, uP.w * (1.0 - ink));
  float t = max(dist - 6.0, 0.0);
  float tmax = dist + 8.0;
  float glow = 0.0, tg = 0.0;
  bool hit = false;
  for (int i = 0; i < 130; i++) {
    vec3 p = ro + rd * t;
    float d = mapS(p);
    float I = max(sXA, sXB);
    glow += max(exp(-max(I, 0.0) * 50.0) - 0.003, 0.0) * min(d, 0.04) * 8.0;
    if (trail > 0.01 && (i & 1) == 0) tg += trailGlow(p) * min(d, 0.05) * 2.0;
    if (d < 0.0005 * (1.0 + t * 0.2)) { hit = true; break; }
    if (t > tmax) break;
    t += d * 0.9;
  }
  vec3 col = bg;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalS(p);
    float I = max(sXA, sXB);
    vec3 r = reflect(rd, n);
    float fr = 0.04 + 0.96 * pow(1.0 - sat(dot(n, -rd)), 5.0);
    vec3 envP = PAPER * (0.5 + 0.5 * smoothstep(-0.4, 0.8, r.y)) + vec3(1.6) * smoothstep(0.8, 0.97, dot(r, normalize(vec3(-0.5, 0.6, 0.7))));
    vec3 envI = vec3(0.015) + vec3(1.6) * smoothstep(0.95, 0.995, dot(r, normalize(vec3(0.7, 0.35, 0.5)))) + CRIMSON * 0.04;
    vec3 envc = mix(envP, envI, ink);
    // print-flat faces as the camera becomes orthographic: the sculpture turns back into ink on paper
    float flat_ = smoothstep(0.6, 1.0, ortho) * step(0.9, abs(n.z));
    col = INK + envc * fr * (1.0 - flat_);
    float edge = 1.0 - smoothstep(0.0, 0.3, abs(n.z));
    col += mix(vec3(0.0), vec3(0.8), ink) * edge * pow(sat(dot(n, normalize(vec3(0.7, 0.35, 0.5)))), 2.0);
    col += vec3(1.0) * edge * uK[15];
    col = mix(col, CRIMSON * (1.5 + uR.w) + HOT * 0.15, smoothstep(0.004, -0.002, I) * ignite);
    float dc = length(p.xy - (X_CORE + 0.5 * (OXA.xy + OXB.xy)));
    col += CRIMSON * ignite * 0.5 / (1.0 + dc * dc * 150.0);
    col = mix(col, bg, 1.0 - exp(-max(t - dist - 1.8, 0.0) * 0.2));
  }
  col += (CRIMSON * 1.1 + HOT * 0.1) * (1.0 + uR.w) * glow * ignite;
  col += heat(0.9) * tg * trail * 0.25;
  fragColor = vec4(col, 1.0);
}
`,
};
