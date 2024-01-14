struct MainLightUniforms {
    @size(16) uLightDirection: vec3<f32>,
    @size(16) uLightColor: vec3<f32>,
    @size(64) uLightVPMatrix: mat4x4<f32>,
};

@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var specularTexture: texture_2d<f32>;

@group(1) @binding(1)
var<uniform> mainLightUniforms: MainLightUniforms;

@group(2) @binding(0) var shadowMap: texture_depth_2d;
@group(2) @binding(1) var shadowSampler: sampler_comparison;

const textureSize: f32 = 1024.0;


fn mon2lin(
    x: vec3<f32>,
) -> vec3<f32> {
    return pow(x, vec3<f32>(2.2, 2.2, 2.2));
}

fn lin2mon(
    x: vec3<f32>,
) -> vec3<f32> {
    return pow(x, vec3<f32>(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
}

fn visibility(
    shadowPos: vec3<f32>,
) -> f32 {
    // PCF for 3x3
    var v = 0.0;
    let oneOverShadowDepthTextureSize = 1.0 / textureSize;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
          let offset = vec2<f32>(vec2(x, y)) * oneOverShadowDepthTextureSize;

          v += textureSampleCompare(
            shadowMap, shadowSampler,
            shadowPos.xy + offset, shadowPos.z - 0.007
          );
        }
      }
    v /= 9.0;

    return v;
}

@fragment
fn fragmentMain(
    @location(0) worldPos: vec4<f32>,
    @location(1) worldNormal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) shadowPos: vec3<f32>,
) -> @location(0) vec4<f32> {
    var lightDir = mainLightUniforms.uLightDirection; // normlaized in software stage
    var N = normalize(worldNormal);
    var shadowIntensity = 0.8;
    var lightShadow = visibility(shadowPos) * shadowIntensity + (1.0 - shadowIntensity);

    var albedo = textureSample(albedoTexture, textureSampler, uv).rgb;
    albedo = mon2lin(albedo);

    var irradiance = albedo * lightShadow * max(dot(N, lightDir), 0.0) * mainLightUniforms.uLightColor;
    irradiance = lin2mon(irradiance);

    return vec4<f32>(irradiance, 1.0);
}