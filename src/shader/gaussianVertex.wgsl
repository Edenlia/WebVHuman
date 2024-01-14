struct ModelUniforms {
    @size(64) uMMatrix: mat4x4<f32>,
};

struct CameraUniforms {
    @size(64) uPMatrix: mat4x4<f32>,
    @size(64) uVMatrix: mat4x4<f32>,
    @size(16) uCameraPosition: vec3<f32>,
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
    @location(0) worldPos: vec4<f32>,
    @location(1) worldNormal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> modelUniforms: ModelUniforms;

@group(1) @binding(0)
var<uniform> cameraUniforms: CameraUniforms;

@group(1) @binding(1)
var<uniform> mainLightUniforms: MainLightUniforms;

@vertex
fn vertexMain (
   attrib : Attributes
) -> Varyings {

    var varyings: Varyings;

    varyings.worldPos = modelUniforms.uMMatrix * vec4<f32>(attrib.aVertexPosition, 1.0);
    varyings.worldPos = varyings.worldPos / varyings.worldPos.w;

    varyings.worldNormal = (modelUniforms.uMMatrix * vec4<f32>(attrib.aVertexNormal, 1.0)).rgb;

    varyings.uv = attrib.aVertexUv;

    varyings.pos = cameraUniforms.uPMatrix * cameraUniforms.uVMatrix * varyings.worldPos;
    varyings.pos = varyings.pos / varyings.pos.w;
    varyings.pos.x = attrib.aVertexUv.x * 2 - 1; // Output to texture coords
    varyings.pos.y = 1 - attrib.aVertexUv.y * 2;

    return varyings;
}