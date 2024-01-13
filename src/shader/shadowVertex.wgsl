struct ModelUniforms {
    @size(64) uMMatrix: mat4x4<f32>,
};

struct MainLightUniforms {
    @size(16) uLightDirection: vec3<f32>,
    @size(16) uLightColor: vec3<f32>,
    @size(64) uLightVPMatrix: mat4x4<f32>,
};

struct Attributes {
     @location(0) aVertexPosition: vec3<f32>,
     @location(1) aVertexNormal: vec3<f32>,
     @location(2) aVertexUv: vec2<f32>
};

struct Varyings {
    @builtin(position) pos: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> modelUniforms: ModelUniforms;

@group(1) @binding(1)
var<uniform> mainLightUniforms: MainLightUniforms;

@vertex
fn vertexMain (
   attrib : Attributes
) -> Varyings {

    var varyings: Varyings;

    var worldPos = modelUniforms.uMMatrix * vec4<f32>(attrib.aVertexPosition, 1.0);
    worldPos = worldPos / worldPos.w;
    varyings.pos = mainLightUniforms.uLightVPMatrix * worldPos;

    return varyings;
}

