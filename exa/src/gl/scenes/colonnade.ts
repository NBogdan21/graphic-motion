// III — Colonnade of crossings. A nave of X portals receding into white. Each
// portal is two lacquered beams passing through each other; each crossing is
// the only light source. The camera threads the upper opening of every X,
// corkscrewing with the portals' twist. Hairline rods run the length of the
// nave; where they pierce a beam there is a spark.
// uP: x travel, y extra roll, z rise (0..1), w dive (0..1 into the next core)
// uQ: x fov punch (808 mass), y twist per portal, z ink world
export const colonnade = {
  name: 'colonnade',
  frag: /* glsl */ `
const float CZ = 2.3;      // portal spacing
const float CX = 1000.0;   // a single nave: negative space on every side
float cA, cB, cR;

float beam(vec3 p, float ang, float zoff) {
  p.xy = rot(ang) * p.xy;
  p.z -= zoff;
  return sdBox(p, vec3(0.085, 2.6, 0.045)) - 0.003;
}
float twistAt(float z) { return uQ.y * (z / CZ); }
float mapC(vec3 p) {
  float iz = floor(p.z / CZ + 0.5);
  float ix = floor(p.x / CX + 0.5);
  vec3 q = vec3(p.x - CX * ix, p.y, p.z - CZ * iz);
  q.xy = rot(-twistAt(CZ * iz) + ix * 0.6) * q.xy;
  cA = beam(q, 0.768, 0.02);
  cB = beam(q, -0.768, -0.02);
  // hairline rods along the nave
  vec2 rq = rot(-twistAt(p.z)) * vec2(p.x - CX * ix, p.y);
  cR = min(length(rq - vec2(1.15, 0.42)) - 0.004, length(rq - vec2(-0.62, -1.3)) - 0.004);
  return min(min(cA, cB), cR);
}
vec3 normalC(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(mapC(p + e.xyy) - mapC(p - e.xyy), mapC(p + e.yxy) - mapC(p - e.yxy), mapC(p + e.yyx) - mapC(p - e.yyx)));
}

void main() {
  vec2 uv = screenUV();
  float ink = uQ.z;
  vec3 fogCol = mix(PAPER, INK, ink);
  float z = -uP.x;
  float rise = easeIO(uP.z);
  float dive = uP.w;
  float tw = twistAt(z);
  vec2 lane = rot(tw) * vec2(0.0, mix(0.95, 2.6, rise));
  vec3 ro = vec3(lane.x, lane.y, z + rise * 1.5);
  vec3 ta = vec3(rot(twistAt(z - 2.0)) * vec2(0.0, mix(0.85, -0.6, rise)), z - 2.0);
  // the dive: fall into the core of the next portal
  float zc = CZ * floor(z / CZ - 0.25);
  vec3 core = vec3(0.0, 0.0, zc);
  float dv = easeIn(dive);
  ta = mix(ta, core, sat(dive * 2.0));
  ro = mix(ro, core + vec3(0.0, 0.0, 0.05), dv * 0.96);
  vec3 rd = camRay(uv, ro, ta, tw + uP.y, 1.3 + uQ.x);

  float t = 0.0;
  float glow = 0.0, spark = 0.0;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    float d = mapC(p);
    float I = max(cA, cB);
    glow += max(exp(-max(I, 0.0) * 22.0) - 0.01, 0.0) * min(d, 0.08) * 6.0 / (1.0 + t * 0.08);
    spark += exp(-max(max(cR, min(cA, cB)), 0.0) * 90.0) * min(d, 0.05) * 9.0;
    if (d < 0.0005 * (1.0 + t)) { hit = true; break; }
    if (t > 40.0) break;
    t += d * 0.85;
  }
  vec3 col = fogCol;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalC(p);
    float I = max(cA, cB);
    vec3 r = reflect(rd, n);
    float fr = 0.04 + 0.96 * pow(1.0 - sat(dot(n, -rd)), 5.0);
    vec3 key = normalize(vec3(-0.3, 0.8, 0.5));
    float spec = pow(sat(dot(r, key)), 50.0);
    vec3 envc = mix(PAPER * (0.12 + 0.3 * smoothstep(0.2, 1.0, r.y)), vec3(0.02), ink);
    bool rod = cR < min(cA, cB);
    vec3 base = rod ? mix(INK, vec3(0.6), ink) : INK;
    col = base + envc * fr + vec3(mix(1.6, 2.2, ink)) * spec * (0.25 + 0.75 * fr);
    // light from the crossing of this portal
    float iz = floor(p.z / CZ + 0.5);
    float ix = floor(p.x / CX + 0.5);
    vec3 q = vec3(p.x - CX * ix, p.y, p.z - CZ * iz);
    float dc = length(q);
    col += CRIMSON * 2.0 * sat(dot(n, -q / dc) * 0.8 + 0.2) / (1.0 + dc * dc * 45.0);
    col = mix(col, heat(1.15), smoothstep(0.003, -0.002, I));
    col = mix(col, fogCol, 1.0 - exp(-max(t - 1.5, 0.0) * mix(0.055, 0.05, ink)));
  }
  col += heat(0.85) * glow * 0.6;
  col += heat(1.0) * spark * 0.3;
  col = mix(col, heat(1.1), smoothstep(0.7, 1.0, dv));
  fragColor = vec4(col, 1.0);
}
`,
};
