struct Uniforms {
    @size(64) uPMatrix: mat4x4<f32>,
    @size(64) uMVMatrix: mat4x4<f32>
};

struct Attributes {
     @location(0) aVertexPosition: vec3<f32>,
     @location(1) aVertexNormal: vec3<f32>,
     @location(2) aVertexUv: vec2<f32>
};

struct Varyings {
    @builtin(position) pos: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>
};

@group(0) @binding(0) 
var<uniform> uniforms: Uniforms;

@vertex
fn vertexMain (
   attrib : Attributes
) -> Varyings {

    var varyings: Varyings;

    varyings.pos = uniforms.uPMatrix * uniforms.uMVMatrix * vec4<f32>(attrib.aVertexPosition, 1.0);
    varyings.normal = attrib.aVertexNormal;
    varyings.uv = attrib.aVertexUv;

    return varyings;
}