'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import styles from './Velaris.module.css';

export type VelarisProps = {
  /** Base colour under the noise. */
  bg?: string;
  /** Four colours blended by the noise layers. */
  colors?: [string, string, string, string];
  speed?: number;
  grain?: number;
  className?: string;
  children?: ReactNode;
};

const VERTEX = `attribute vec2 position;varying vec2 vUv;
void main(){vUv=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}`;

// Shader of 21st.dev «Velaris»; the dark vignette is replaced by a fade to white at the bottom.
const FRAGMENT = `precision highp float;varying vec2 vUv;
uniform vec2 u_resolution;uniform float u_time;uniform float u_grain;uniform vec3 u_colors[4];uniform vec3 u_bg;
vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.0);
vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;
vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;
m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
return 130.0*dot(m,g);}
void main(){vec2 uv=vUv;float ratio=u_resolution.x/u_resolution.y;vec2 p=uv-0.5;p.x*=ratio;float t=u_time*0.1;
float n1=snoise(p*0.4+vec2(t*0.2,-t*0.3));float n2=snoise(p*0.55+vec2(-t*0.15,t*0.25)+n1*0.25);
float n3=snoise(p*0.75+vec2(t*0.1,-t*0.2)+n2*0.2);vec3 col=u_bg;
col=mix(col,u_colors[0],smoothstep(-0.2,0.5,n1)*0.85);col=mix(col,u_colors[1],smoothstep(-0.1,0.6,n2)*0.7);
col=mix(col,u_colors[2],smoothstep(-0.3,0.4,n3)*0.6);col=mix(col,u_colors[3],smoothstep(0.0,0.7,n1*n2)*0.5);
col=mix(vec3(1.0),col,smoothstep(0.0,0.75,uv.y));
float grain=fract(sin(dot(uv,vec2(12.9898,78.233)))*43758.5453+u_time);col+=(grain-0.5)*u_grain*0.1;
gl_FragColor=vec4(col,1.0);}`;

const LIGHT: [string, string, string, string] = ['#CFE2FF', '#A9CBFF', '#E3EEFF', '#7FAEFF'];

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/**
 * Living gradient background, adapted from 21st.dev «Velaris» (owner's pick 2026-11-22) to CSS
 * Modules and the light Xstore palette: blue at the top, white at the bottom. Draws one still
 * frame under reduced motion; without WebGL the CSS gradient of the root stays.
 */
export function Velaris({
  bg = '#EEF5FF',
  colors = LIGHT,
  speed = 1.2,
  grain = 0.12,
  className,
  children,
}: VelarisProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // A string key, so an inline colors array does not restart WebGL on every render.
  const palette = colors.join(',');

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl') ?? null;
    if (!root || !canvas || !gl) return;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error('shader');
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API call, not a React hook
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const at = (n: string) => gl.getUniformLocation(program, n);
    gl.uniform3f(at('u_bg'), ...rgb(bg));
    gl.uniform3fv(at('u_colors'), new Float32Array(palette.split(',').flatMap(rgb)));
    gl.uniform1f(at('u_grain'), grain);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = root.clientWidth * dpr;
      canvas.height = root.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const draw = (t: number) => {
      gl.uniform2f(at('u_resolution'), canvas.width, canvas.height);
      gl.uniform1f(at('u_time'), t * 0.001 * speed + 20);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [bg, palette, speed, grain]);

  return (
    <div ref={rootRef} className={className ? `${styles.root} ${className}` : styles.root}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" tabIndex={-1} />
      {children ? <div className={styles.content}>{children}</div> : null}
    </div>
  );
}
