import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

    float t = u_time * 0.24;
    float bend = sin(p.y * 4.2 + t) * 0.045 + sin(p.x * 3.1 - t * 0.7) * 0.025;
    vec2 warped = p;
    warped.x += bend + sin(p.y * 8.0 - t * 1.3) * 0.012;
    warped.y += sin(p.x * 6.0 + t * 0.9) * 0.025;

    vec2 cells = floor((warped + vec2(2.5)) * 6.0);
    float tile = mod(cells.x + cells.y, 2.0);
    vec3 ink = vec3(0.018, 0.11, 0.075);
    vec3 slate = vec3(0.035, 0.25, 0.18);
    vec3 color = mix(ink, slate, tile);

    float gold = 0.5 + 0.5 * sin((warped.x + warped.y) * 3.4 - t * 1.2);
    float teal = 0.5 + 0.5 * sin((warped.x - warped.y) * 4.0 + t);
    color += vec3(0.15, 0.08, 0.015) * pow(gold, 5.0);
    color += vec3(0.01, 0.08, 0.07) * pow(teal, 6.0);

    float vignette = smoothstep(0.93, 0.2, length((uv - 0.5) * vec2(0.82, 1.0)));
    color *= 0.55 + 0.45 * vignette;
    color += (hash(gl_FragCoord.xy + floor(u_time * 8.0)) - 0.5) * 0.009;
    gl_FragColor = vec4(color, 1.0);
}`;

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const value = gl.createShader(type);
    if (!value) return null;
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (gl.getShaderParameter(value, gl.COMPILE_STATUS)) return value;
    gl.deleteShader(value);
    return null;
}

export default function MenuShaderBackground() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas?.getContext("webgl", {
            alpha: false,
            antialias: false,
            depth: false,
            powerPreference: "low-power",
        });
        if (!canvas || !gl) return;

        const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        const program = gl.createProgram();
        if (!vertex || !fragment || !program) return;
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl["useProgram"](program);
        const position = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const resolution = gl.getUniformLocation(program, "u_resolution");
        const time = gl.getUniformLocation(program, "u_time");
        const reducedMotion = storeReducedMotion();
        let frame = 0;

        const render = (now: number) => {
            const scale = Math.min(window.devicePixelRatio || 1, 1.5);
            const width = Math.max(1, Math.round(canvas.clientWidth * scale));
            const height = Math.max(1, Math.round(canvas.clientHeight * scale));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                gl.viewport(0, 0, width, height);
            }
            gl.uniform2f(resolution, width, height);
            gl.uniform1f(time, reducedMotion ? 0 : now / 1_000);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            if (!reducedMotion) frame = requestAnimationFrame(render);
        };
        frame = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(frame);
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
        };
    }, []);

    return (
        // Biome treats canvas as potentially interactive. This backdrop never is.
        // biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative canvas has pointer-events:none and no tab stop
        <canvas ref={canvasRef} className="menu-shader" aria-hidden="true" />
    );
}

function storeReducedMotion(): boolean {
    return document.documentElement.dataset.reducedMotion === "true";
}
