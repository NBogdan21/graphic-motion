// Fullscreen vertex shader, the transition compositor and the post pass.

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Transitions are part of the brand language, not generic wipes:
//  1 crossfade (only for dissolves inside a world)
//  2 X-wipe     : two blades at the X's angles sweep across and cross; red spark at their crossing
//  3 split      : the frame shears apart along a diagonal hairline (used when a silence ends)
//  4 core       : B opens from the hot point outward, rimmed in red
//  5 hairline   : B is revealed behind a single hairline sweeping along the "\\" diagonal
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uA, uB;
uniform int uType;
uniform float uProg;
uniform vec4 uTP;
uniform vec2 uRes;
const vec3 CRIMSON = vec3(0.552, 0.0128, 0.0122);
float sat(float x) { return clamp(x, 0.0, 1.0); }

void main() {
  vec2 st = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float px = 1.0 / uRes.y;
  vec3 a = texture(uA, st).rgb;
  vec3 col = a;
  float t = uProg;
  if (uType == 1) {
    col = mix(a, texture(uB, st).rgb, smoothstep(0.0, 1.0, t));
  } else if (uType == 2) {
    // blades: normals of the X diagonals. Each blade sweeps from left to right.
    vec2 n1 = normalize(vec2(0.7179, -0.6961));
    vec2 n2 = normalize(vec2(0.7342, 0.6789));
    float span = 1.25;
    float s1 = dot(p, n1) - mix(-span, span, t);
    float s2 = dot(p, n2) - mix(-span, span, smoothstep(0.0, 1.0, t * 1.1 - 0.05));
    float m = max(step(s1, 0.0), step(s2, 0.0));
    vec3 b = texture(uB, st).rgb;
    col = mix(a, b, m);
    float l1 = exp(-abs(s1) / (1.2 * px)), l2 = exp(-abs(s2) / (1.2 * px));
    vec3 lineCol = uTP.x > 0.5 ? vec3(0.004) : vec3(0.99);
    col = mix(col, lineCol, max(l1, l2) * 0.9 * (1.0 - t * t));
    // where the blades cross, light is born
    vec2 c1 = n1 * mix(-span, span, t);
    float d = length(vec2(s1, s2));
    col += CRIMSON * (exp(-d / (6.0 * px)) * 3.0 + exp(-d / (40.0 * px)) * 0.6) * sin(3.14159 * sat(t));
    col += CRIMSON * (l1 * l2) * 4.0;
  } else if (uType == 3) {
    // the frame splits along the diagonal: each side shears along the line, then settles
    vec2 dir = normalize(vec2(0.6789, -0.7342));
    vec2 n = vec2(-dir.y, dir.x);
    float side = sign(dot(p, n) + 1e-5);
    float k = 1.0 - smoothstep(0.0, 1.0, t);
    float shift = k * k * 0.22 * uTP.y;
    vec2 off = dir * side * shift;
    vec2 sst = st + vec2(off.x * uRes.y / uRes.x, off.y);
    vec3 b = texture(uB, sst).rgb;
    col = b;
    float gap = abs(dot(p, n));
    float w = px * (1.0 + 30.0 * k * k);
    col = mix(col, CRIMSON * 2.5, exp(-gap / w) * k);
    col += CRIMSON * exp(-gap / (30.0 * px)) * k * 0.8;
  } else if (uType == 4) {
    vec2 c = uTP.xy;
    float r = length(p - c);
    float R = pow(t, 2.2) * 1.4;
    float m = smoothstep(R + 2.0 * px, R - 2.0 * px, r);
    vec3 b = texture(uB, st).rgb;
    col = mix(a, b, m);
    col += CRIMSON * exp(-abs(r - R) / (3.0 * px + 0.02 * (1.0 - t))) * 2.5 * (1.0 - t);
  } else if (uType == 5) {
    vec2 n = normalize(vec2(0.7342, 0.6789));
    float s = dot(p, n) - mix(-1.2, 1.2, t);
    vec3 b = texture(uB, st).rgb;
    col = mix(a, b, step(s, 0.0));
    vec3 lineCol = uTP.x > 0.5 ? vec3(0.004) : vec3(0.99);
    col = mix(col, lineCol, exp(-abs(s) / (1.1 * px)));
  }
  else if (uType == 6) {
    // a silence: the frame holds still while one red hairline is drawn across it
    vec2 dir = normalize(vec2(0.6789, -0.7342));
    vec2 n = vec2(-dir.y, dir.x);
    float along = dot(p, dir);
    float head = mix(-1.15, 1.15, 1.0 - pow(1.0 - t, 2.2));
    float drawn = step(along, head);
    float d = abs(dot(p, n));
    col = a * (1.0 - 0.06 * t);
    col = mix(col, CRIMSON * 2.2, exp(-d / (0.9 * px)) * drawn);
    col += CRIMSON * exp(-d / (14.0 * px)) * drawn * 0.35;
    col += CRIMSON * 3.0 * exp(-length(vec2(along - head, d)) / (5.0 * px)) * step(t, 0.99);
  }
  fragColor = vec4(col, 1.0);
}
`;

export const POST = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uC;
uniform vec2 uRes;
uniform float uFrame;
uniform vec4 uPost;   // exposure, grain, vignette, bloom
uniform vec2 uFade;   // amount, colour (0 = ink, 1 = paper)
uniform vec3 uHot;    // a lone hot point: screen position (x, y), amount

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 st = gl_FragCoord.xy / uRes;
  vec3 c = textureLod(uC, st, 0.0).rgb;
  // bloom from the mip pyramid: only energy above paper white blooms
  vec3 bl = vec3(0.0);
  float wsum = 0.0;
  for (int i = 2; i <= 7; i++) {
    float w = 1.0 / float(i);
    bl += max(textureLod(uC, st, float(i)).rgb - 0.92, 0.0) * w;
    wsum += w;
  }
  c += bl / wsum * uPost.w * 2.2;
  c *= uPost.x;
  // highlight overflow bleeds into the other channels (red -> white-hot), then clips
  float over = max(max(c.r, max(c.g, c.b)) - 1.0, 0.0);
  c += min(over, 1.5) * vec3(0.12, 0.3, 0.27);
  vec2 q = st - 0.5;
  c *= 1.0 - uPost.z * dot(q, q) * 1.6;
  c = mix(c, vec3(uFade.y), uFade.x);
  vec2 hp = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - uHot.xy;
  float hr = length(hp);
  c += vec3(0.552, 0.0128, 0.0122) * uHot.z * (exp(-hr / 0.004) * 2.2 + exp(-hr / 0.03) * 0.5 + exp(-hr / 0.12) * 0.08);
  vec3 s = toSRGB(c);
  float g = hash12(gl_FragCoord.xy + fract(uFrame * 0.618) * 1000.0) - 0.5;
  float g2 = hash12(gl_FragCoord.xy * 1.7 + fract(uFrame * 0.317) * 913.0) - 0.5;
  s += (g + g2) * uPost.y * (0.35 + 0.65 * (1.0 - abs(s.g - 0.5) * 2.0));
  fragColor = vec4(s, 1.0);
}
`;
