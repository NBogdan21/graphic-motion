// A small WebGL2 engine: scene shaders -> float targets -> brand transitions -> post.
import {COMMON} from './common';
import {COMPOSITE, POST, VERT} from './passes';

export type SceneShader = {name: string; frag: string};

export type SceneDraw = {
  scene: string;
  time: number;
  dur: number;
  p?: number[];
  q?: number[];
  r?: number[];
  s?: number[];
  k?: number[]; // up to 16 extra floats (uK)
};

export type FrameState = {
  g: number; // global seconds
  frame: number;
  beat: number;
  audio: [number, number, number, number];
  vox: number;
  a: SceneDraw;
  b?: SceneDraw;
  transition?: {type: number; progress: number; params?: number[]};
  post: {exposure: number; grain: number; vignette: number; bloom: number; fade: number; fadeColor: number; hot?: [number, number, number]};
};

type Target = {fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number};

export class Engine {
  gl: WebGL2RenderingContext;
  progs = new Map<string, {p: WebGLProgram; u: Map<string, WebGLUniformLocation | null>}>();
  tA: Target;
  tB: Target;
  tC: Target;
  glyph: WebGLTexture | null = null;
  w: number;
  h: number;

  constructor(canvas: HTMLCanvasElement, scenes: SceneShader[], internalScale = 1) {
    const gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    gl.getExtension('OES_texture_float_linear');
    this.w = Math.round(canvas.width * internalScale);
    this.h = Math.round(canvas.height * internalScale);
    this.tA = this.target(this.w, this.h, false);
    this.tB = this.target(this.w, this.h, false);
    this.tC = this.target(this.w, this.h, true);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    for (const s of scenes) this.program(s.name, COMMON + s.frag);
    this.program('__composite', COMPOSITE);
    this.program('__post', POST);
  }

  private target(w: number, h: number, mips: boolean): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return {fb, tex, w, h};
  }

  private program(name: string, frag: string) {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
        const m = /0:(\d+)/.exec(log || '');
        const at = m ? lines.slice(Math.max(0, +m[1] - 4), +m[1] + 2).join('\n') : '';
        throw new Error(`[${name}] ${log}\n${at}`);
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[${name}] ${gl.getProgramInfoLog(p)}`);
    this.progs.set(name, {p, u: new Map()});
  }

  setGlyphs(img: ImageBitmap | HTMLImageElement) {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.glyph = tex;
  }

  private use(name: string) {
    const pr = this.progs.get(name);
    if (!pr) throw new Error(`unknown scene ${name}`);
    this.gl.useProgram(pr.p);
    const gl = this.gl;
    return (u: string) => {
      if (!pr.u.has(u)) pr.u.set(u, gl.getUniformLocation(pr.p, u));
      return pr.u.get(u)!;
    };
  }

  private drawScene(t: Target, d: SceneDraw, s: FrameState) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.w, t.h);
    const U = this.use(d.scene);
    gl.uniform2f(U('uRes'), t.w, t.h);
    gl.uniform1f(U('uTime'), d.time);
    gl.uniform1f(U('uG'), s.g);
    gl.uniform1f(U('uDur'), d.dur);
    gl.uniform1f(U('uBeat'), s.beat);
    gl.uniform4f(U('uAudio'), ...s.audio);
    gl.uniform1f(U('uVox'), s.vox);
    const p = [...(d.p ?? []), 0, 0, 0, 0];
    const q = [...(d.q ?? []), 0, 0, 0, 0];
    gl.uniform4f(U('uP'), p[0], p[1], p[2], p[3]);
    gl.uniform4f(U('uQ'), q[0], q[1], q[2], q[3]);
    const r = [...(d.r ?? []), 0, 0, 0, 0];
    const s4 = [...(d.s ?? []), 0, 0, 0, 0];
    gl.uniform4f(U('uR'), r[0], r[1], r[2], r[3]);
    gl.uniform4f(U('uS'), s4[0], s4[1], s4[2], s4[3]);
    const k = new Float32Array(16);
    (d.k ?? []).forEach((v, i) => (k[i] = v));
    gl.uniform1fv(U('uK[0]'), k);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.glyph);
    gl.uniform1i(U('uGlyph'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(s: FrameState) {
    const gl = this.gl;
    this.drawScene(this.tA, s.a, s);
    if (s.b) this.drawScene(this.tB, s.b, s);

    // composite (transitions) -> tC, then mip pyramid for bloom
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tC.fb);
    gl.viewport(0, 0, this.w, this.h);
    let U = this.use('__composite');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tA.tex);
    gl.uniform1i(U('uA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, s.b ? this.tB.tex : this.tA.tex);
    gl.uniform1i(U('uB'), 1);
    const tr = s.transition ?? {type: 0, progress: 0};
    const tp = [...(tr.params ?? []), 0, 0, 0, 0];
    gl.uniform1i(U('uType'), s.transition ? tr.type : 0);
    gl.uniform1f(U('uProg'), tr.progress);
    gl.uniform4f(U('uTP'), tp[0], tp[1], tp[2], tp[3]);
    gl.uniform2f(U('uRes'), this.w, this.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.tC.tex);
    gl.generateMipmap(gl.TEXTURE_2D);

    // post -> canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    U = this.use('__post');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tC.tex);
    gl.uniform1i(U('uC'), 0);
    gl.uniform2f(U('uRes'), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(U('uFrame'), s.frame);
    const P = s.post;
    gl.uniform4f(U('uPost'), P.exposure, P.grain, P.vignette, P.bloom);
    gl.uniform2f(U('uFade'), P.fade, P.fadeColor);
    gl.uniform3f(U('uHot'), ...(P.hot ?? [0, 0, 0]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
  }
}
