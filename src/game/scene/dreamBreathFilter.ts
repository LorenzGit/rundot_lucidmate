import { Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";

const glVertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const glFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uStrength;

void main(void) {
    vec2 p = vTextureCoord - 0.5;
    float ribbon = sin(p.y * 15.0 + uTime * 0.72) * cos(p.x * 11.0 - uTime * 0.48);
    float breath = (0.5 + 0.5 * sin(uTime * 0.36)) * uStrength;
    vec4 center = texture(uTexture, clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw));
    vec3 tint = vec3(0.026, -0.004, 0.034) * (0.35 + breath) * ribbon * center.a;
    finalColor = vec4(center.rgb + tint, center.a);
}`;

const gpuSource = `
struct GlobalFilterUniforms {
    uInputSize: vec4<f32>,
    uInputPixel: vec4<f32>,
    uInputClamp: vec4<f32>,
    uOutputFrame: vec4<f32>,
    uGlobalFrame: vec4<f32>,
    uOutputTexture: vec4<f32>,
};

struct DreamUniforms {
    uTime: f32,
    uStrength: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> dreamUniforms: DreamUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
    return VSOutput(
        filterVertexPosition(aPosition),
        aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw)
    );
}

@fragment
fn mainFragment(@location(0) uvInput: vec2<f32>) -> @location(0) vec4<f32> {
    let p = uvInput - vec2(0.5);
    let ribbon = sin(p.y * 15.0 + dreamUniforms.uTime * 0.72) *
        cos(p.x * 11.0 - dreamUniforms.uTime * 0.48);
    let breath = (0.5 + 0.5 * sin(dreamUniforms.uTime * 0.36)) * dreamUniforms.uStrength;
    let center = textureSample(uTexture, uSampler, clamp(uvInput, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
    let tint = vec3(0.026, -0.004, 0.034) * (0.35 + breath) * ribbon * center.a;
    return vec4(center.rgb + tint, center.a);
}`;

export class DreamBreathFilter extends Filter {
    private readonly dreamUniforms: UniformGroup;

    constructor() {
        const dreamUniforms = new UniformGroup({
            uTime: { value: 0, type: "f32" },
            uStrength: { value: 1, type: "f32" },
        });
        super({
            gpuProgram: GpuProgram.from({
                vertex: { source: gpuSource, entryPoint: "mainVertex" },
                fragment: { source: gpuSource, entryPoint: "mainFragment" },
            }),
            glProgram: GlProgram.from({ vertex: glVertex, fragment: glFragment, name: "lucid-dream-breath" }),
            resources: { dreamUniforms },
            resolution: 1,
            antialias: "inherit",
        });
        this.dreamUniforms = dreamUniforms;
    }

    set time(value: number) {
        this.dreamUniforms.uniforms.uTime = value;
        this.dreamUniforms.update();
    }

    set strength(value: number) {
        this.dreamUniforms.uniforms.uStrength = value;
        this.dreamUniforms.update();
    }
}
