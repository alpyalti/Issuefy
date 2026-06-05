"use client";

import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

/* Vanilla port of the React Bits GradientBlinds component (via ogl).
   Interactive WebGL gradient with vertical "blinds" and a cursor spotlight.
   Faithful to design-reference/gradient-blinds.js. */

const MAX_COLORS = 8;
const hexToRGB = (hex: string): [number, number, number] => {
  const c = hex.replace("#", "").padEnd(6, "0");
  return [
    parseInt(c.slice(0, 2), 16) / 255,
    parseInt(c.slice(2, 4), 16) / 255,
    parseInt(c.slice(4, 6), 16) / 255,
  ];
};
const prepStops = (stops?: string[]) => {
  const base = (stops && stops.length ? stops : ["#FF9FFC", "#5227FF"]).slice(0, MAX_COLORS);
  if (base.length === 1) base.push(base[0]);
  while (base.length < MAX_COLORS) base.push(base[base.length - 1]);
  const arr: [number, number, number][] = [];
  for (let i = 0; i < MAX_COLORS; i++) arr.push(hexToRGB(base[i]));
  const count = Math.max(2, Math.min(MAX_COLORS, stops?.length ?? 2));
  return { arr, count };
};

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif
uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform float uAngle, uNoise, uBlindCount, uSpotlightRadius, uSpotlightSoftness, uSpotlightOpacity, uMirror, uDistort, uShineFlip, uStripeAmp;
uniform vec3 uColor0,uColor1,uColor2,uColor3,uColor4,uColor5,uColor6,uColor7;
uniform int uColorCount;
varying vec2 vUv;
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
vec2 rotate2D(vec2 p, float a){ float c=cos(a); float s=sin(a); return mat2(c,-s,s,c)*p; }
vec3 getGradientColor(float t){
  float tt = clamp(t,0.0,1.0);
  int count = uColorCount; if(count<2) count=2;
  float scaled = tt*float(count-1);
  float seg = floor(scaled); float f = fract(scaled);
  if(seg<1.0) return mix(uColor0,uColor1,f);
  if(seg<2.0 && count>2) return mix(uColor1,uColor2,f);
  if(seg<3.0 && count>3) return mix(uColor2,uColor3,f);
  if(seg<4.0 && count>4) return mix(uColor3,uColor4,f);
  if(seg<5.0 && count>5) return mix(uColor4,uColor5,f);
  if(seg<6.0 && count>6) return mix(uColor5,uColor6,f);
  if(seg<7.0 && count>7) return mix(uColor6,uColor7,f);
  if(count>7) return uColor7; if(count>6) return uColor6; if(count>5) return uColor5;
  if(count>4) return uColor4; if(count>3) return uColor3; if(count>2) return uColor2;
  return uColor1;
}
void main(){
  vec2 uv0 = vUv;
  float aspect = iResolution.x / iResolution.y;
  vec2 p = uv0*2.0-1.0; p.x*=aspect;
  vec2 pr = rotate2D(p, uAngle); pr.x/=aspect;
  vec2 uv = pr*0.5+0.5;
  vec2 uvMod = uv;
  if(uDistort>0.0){ float a=uvMod.y*6.0; float b=uvMod.x*6.0; float w=0.01*uDistort; uvMod.x+=sin(a)*w; uvMod.y+=cos(b)*w; }
  float t = uvMod.x;
  if(uMirror>0.5){ t = 1.0 - abs(1.0 - 2.0*fract(t)); }
  vec3 base = getGradientColor(t);
  vec2 offset = vec2(iMouse.x/iResolution.x, iMouse.y/iResolution.y);
  float d = length(uv0-offset);
  float r = max(uSpotlightRadius,1e-4);
  float dn = d/r;
  float prox = clamp(1.0 - pow(dn,uSpotlightSoftness), 0.0, 1.0);
  float stripe = fract(uvMod.x*max(uBlindCount,1.0));
  if(uShineFlip>0.5) stripe = 1.0-stripe;
  float amt = clamp(prox * (stripe * uStripeAmp + uSpotlightOpacity), 0.0, 1.0);
  vec3 col = mix(vec3(1.0), base, amt);
  col += (rand(gl_FragCoord.xy + iTime) - 0.5)*uNoise;
  gl_FragColor = vec4(col,1.0);
}
`;

type Opts = {
  dpr?: number;
  gradientColors?: string[];
  angle?: number;
  noise?: number;
  blindCount?: number;
  blindMinWidth?: number;
  mouseDampening?: number;
  mirrorGradient?: boolean;
  spotlightRadius?: number;
  spotlightSoftness?: number;
  spotlightOpacity?: number;
  distortAmount?: number;
  shineDirection?: "left" | "right";
  stripeAmp?: number;
  paused?: boolean;
};

function initGradientBlinds(container: HTMLElement, opts: Opts = {}) {
  const mq = (q: string) => typeof window !== "undefined" && window.matchMedia && window.matchMedia(q).matches;
  const o = {
    dpr: Math.min(opts.dpr ?? (window.devicePixelRatio || 1), mq("(max-width: 768px)") ? 1.5 : 2),
    gradientColors: opts.gradientColors,
    angle: opts.angle ?? 0,
    noise: opts.noise ?? 0.3,
    blindCount: opts.blindCount ?? 16,
    blindMinWidth: opts.blindMinWidth ?? 60,
    mouseDampening: opts.mouseDampening ?? 0.15,
    mirrorGradient: opts.mirrorGradient ?? false,
    spotlightRadius: opts.spotlightRadius ?? 0.5,
    spotlightSoftness: opts.spotlightSoftness ?? 1,
    spotlightOpacity: opts.spotlightOpacity ?? 1,
    distortAmount: opts.distortAmount ?? 0,
    shineDirection: opts.shineDirection ?? "left",
    stripeAmp: opts.stripeAmp ?? 1,
    paused: opts.paused ?? false,
  };

  const renderer = new Renderer({ dpr: o.dpr, alpha: true, antialias: true, preserveDrawingBuffer: true });
  const gl = renderer.gl;
  const canvas = gl.canvas as HTMLCanvasElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

  const { arr: colorArr, count: colorCount } = prepStops(o.gradientColors);
  const uniforms = {
    iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
    iMouse: { value: [0, 0] },
    iTime: { value: 0 },
    uAngle: { value: (o.angle * Math.PI) / 180 },
    uNoise: { value: o.noise },
    uBlindCount: { value: Math.max(1, o.blindCount) },
    uSpotlightRadius: { value: o.spotlightRadius },
    uSpotlightSoftness: { value: o.spotlightSoftness },
    uSpotlightOpacity: { value: o.spotlightOpacity },
    uMirror: { value: o.mirrorGradient ? 1 : 0 },
    uDistort: { value: o.distortAmount },
    uShineFlip: { value: o.shineDirection === "right" ? 1 : 0 },
    uStripeAmp: { value: o.stripeAmp ?? 1 },
    uColor0: { value: colorArr[0] }, uColor1: { value: colorArr[1] },
    uColor2: { value: colorArr[2] }, uColor3: { value: colorArr[3] },
    uColor4: { value: colorArr[4] }, uColor5: { value: colorArr[5] },
    uColor6: { value: colorArr[6] }, uColor7: { value: colorArr[7] },
    uColorCount: { value: colorCount },
  };

  const program = new Program(gl, { vertex, fragment, uniforms });
  const geometry = new Triangle(gl);
  const mesh = new Mesh(gl, { geometry, program });

  const mouseTarget = [0, 0];
  let lastTime = 0;
  let firstResize = true;

  const resize = () => {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    renderer.setSize(rect.width, rect.height);
    uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
    if (o.blindMinWidth > 0) {
      const maxByMinWidth = Math.max(1, Math.floor(rect.width / o.blindMinWidth));
      const effective = o.blindCount ? Math.min(o.blindCount, maxByMinWidth) : maxByMinWidth;
      uniforms.uBlindCount.value = Math.max(1, effective);
    }
    if (firstResize) {
      firstResize = false;
      const cx = gl.drawingBufferWidth / 2, cy = gl.drawingBufferHeight / 2;
      uniforms.iMouse.value = [cx, cy];
      mouseTarget[0] = cx; mouseTarget[1] = cy;
    }
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const onPointerMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scale = renderer.dpr || 1;
    mouseTarget[0] = (e.clientX - rect.left) * scale;
    mouseTarget[1] = (rect.height - (e.clientY - rect.top)) * scale;
    if (o.mouseDampening <= 0) uniforms.iMouse.value = [mouseTarget[0], mouseTarget[1]];
  };
  const listenEl = container.parentElement || container;
  const finePointer = !window.matchMedia || window.matchMedia("(pointer: fine)").matches;
  if (finePointer) listenEl.addEventListener("pointermove", onPointerMove);

  let raf = 0, running = false, onScreen = true;
  const loop = (time: number) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    uniforms.iTime.value = time * 0.001;
    if (o.mouseDampening > 0) {
      if (!lastTime) lastTime = time;
      const dt = (time - lastTime) / 1000; lastTime = time;
      const tau = Math.max(1e-4, o.mouseDampening);
      let factor = 1 - Math.exp(-dt / tau); if (factor > 1) factor = 1;
      const cur = uniforms.iMouse.value;
      cur[0] += (mouseTarget[0] - cur[0]) * factor;
      cur[1] += (mouseTarget[1] - cur[1]) * factor;
    } else { lastTime = time; }
    if (!o.paused) { try { renderer.render({ scene: mesh }); } catch { /* noop */ } }
  };
  const start = () => { if (!running) { running = true; lastTime = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };

  const io = new IntersectionObserver((ents) => {
    onScreen = ents[0].isIntersecting;
    if (onScreen && document.visibilityState !== "hidden") start(); else stop();
  }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { if (document.visibilityState === "hidden") stop(); else if (onScreen) start(); };
  document.addEventListener("visibilitychange", onVis);
  start();

  return () => {
    stop();
    io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    if (finePointer) listenEl.removeEventListener("pointermove", onPointerMove);
    ro.disconnect();
    if (canvas.parentElement === container) container.removeChild(canvas);
  };
}

export default function GradientBlinds() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cleanup = initGradientBlinds(el, {
      gradientColors: ["#C7D8FF", "#A9C4FF", "#8AB0FF", "#6B98FF"],
      angle: 18,
      noise: 0.0,
      blindCount: 20,
      blindMinWidth: 60,
      spotlightRadius: 0.52,
      spotlightSoftness: 1.15,
      spotlightOpacity: 0.45,
      stripeAmp: 0.65,
      mouseDampening: 0.12,
      shineDirection: "left",
    });
    return cleanup;
  }, []);
  return <div className="hero-canvas" id="hero-blinds" ref={ref} />;
}
