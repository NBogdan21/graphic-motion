// Shared GLSL: uniforms, the EXA palette, noise, SDF helpers, glyph atlas access.
import glyphs from '../data/glyphs.json';

const f = (x: number) => x.toFixed(6);

export const COMMON = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;   // scene-local time (seconds, may be remapped: freeze / slow-mo)
uniform float uG;      // global film time (seconds)
uniform float uDur;    // cue duration
uniform float uBeat;   // beats since the drop (global grid)
uniform vec4  uAudio;  // sub, kick, hat, snare  (0..1)
uniform float uVox;
uniform vec4  uP;      // per-cue parameters
uniform vec4  uQ;
uniform vec4  uR;
uniform vec4  uS;
uniform float uK[16];
uniform sampler2D uGlyph;

#define PI 3.14159265
#define TAU 6.2831853

// ---- palette (linear light). Paper, ink, crimson + derived tones only.
const vec3 PAPER   = vec3(0.991);
const vec3 INK     = vec3(0.0052, 0.0044, 0.0044);
const vec3 CRIMSON = vec3(0.552, 0.0128, 0.0122);
const vec3 OXBLOOD = vec3(0.042, 0.0019, 0.0019);
const vec3 HOT     = vec3(1.0, 0.065, 0.042);
vec3 heat(float e) {             // red at full energy desaturates toward white-hot
  e = max(e, 0.0);
  return CRIMSON * e * 1.6 + HOT * e * e * 0.9 + vec3(1.0, 0.75, 0.7) * pow(e, 4.0) * 0.6;
}

// ---- hashing / noise
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; mat2 r = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p; a *= 0.5; } return s; }
float fbm3(vec2 p) { float s = 0.0, a = 0.5; mat2 r = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = r * p; a *= 0.5; } return s; }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sat(float x) { return clamp(x, 0.0, 1.0); }
float ease(float x) { x = sat(x); return x * x * (3.0 - 2.0 * x); }
float easeOut(float x) { x = sat(x); return 1.0 - pow(1.0 - x, 3.0); }
float easeIn(float x) { x = sat(x); return x * x * x; }
float easeIO(float x) { x = sat(x); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }

// ---- SDF helpers
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdBox2(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
float extrude(float d2, float z, float h) { vec2 w = vec2(d2, abs(z) - h); return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)); }

// ---- the EXA letterforms (signed distance in cap-height units, <0 inside)
// channels: x = E, y = X stroke "/", z = X stroke "\\", w = A
const vec2 GLYPH_UV = vec2(${f(glyphs.U)}, ${f(glyphs.V)});
const float GLYPH_RANGE = ${f(glyphs.RANGE)};
vec4 glyph4(vec2 p) {
  vec2 t = vec2((p.x + GLYPH_UV.x) / (2.0 * GLYPH_UV.x), (GLYPH_UV.y - p.y) / (2.0 * GLYPH_UV.y));
  float outside = sdBox2(p, GLYPH_UV);
  vec4 e = texture(uGlyph, clamp(t, 0.0, 1.0)) * 2.0 - 1.0;
  vec4 d = sign(e) * e * e * GLYPH_RANGE;
  return outside > 0.0 ? vec4(outside + GLYPH_RANGE) : d;
}
float glyphAll(vec2 p) { vec4 d = glyph4(p); return min(min(d.x, d.y), min(d.z, d.w)); }

// key points of the lockup (cap-height units, centre of lockup = origin)
const vec2 X_CORE = vec2(-0.1009, 0.0023);     // where the two X strokes cross
const vec2 DIR_XA = vec2(-0.6961, -0.7179);    // "/" stroke direction (top-right -> bottom-left)
const vec2 DIR_XB = vec2(0.6789, -0.7342);     // "\\" stroke direction (top-left -> bottom-right)

// soft min for organic joins
float smin(float a, float b, float k) { float h = sat(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1.0 - h); }

// camera ray for a look-at camera
vec3 camRay(vec2 uv, vec3 ro, vec3 ta, float roll, float fov) {
  vec3 w = normalize(ta - ro);
  vec3 up = vec3(sin(roll), cos(roll), 0.0);
  vec3 u = normalize(cross(w, up));
  vec3 v = cross(u, w);
  return normalize(uv.x * u + uv.y * v + fov * w);
}
vec2 screenUV() { return (gl_FragCoord.xy - 0.5 * uRes) / uRes.y; }
`;
