struct Uniforms {
    @size(64) uPMatrix: mat4x4<f32>,
    @size(64) uVMatrix: mat4x4<f32>,
    @size(64) uMMatrix: mat4x4<f32>,
};

struct Attributes {
     @location(0) aVertexPosition: vec3<f32>,
     @location(1) aVertexNormal: vec3<f32>,
     @location(2) aVertexUv: vec2<f32>
};

struct Varyings {
    @builtin(position) pos: vec4<f32>,
    @location(0) worldPos: vec4<f32>,
    @location(1) worldNormal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

@group(0) @binding(0) 
var<uniform> uniforms: Uniforms;

@vertex
fn vertexMain (
   attrib : Attributes
) -> Varyings {

    var varyings: Varyings;

    varyings.worldPos = uniforms.uMMatrix * vec4<f32>(attrib.aVertexPosition, 1.0);
    varyings.worldPos = varyings.worldPos / varyings.worldPos.w;
    varyings.pos = uniforms.uPMatrix * uniforms.uVMatrix * varyings.worldPos;
    varyings.worldNormal = (uniforms.uMMatrix * vec4<f32>(attrib.aVertexNormal, 1.0)).rgb;
    varyings.uv = attrib.aVertexUv;

    return varyings;
}