@group(1) @binding(0) var textureSampler: sampler;
@group(1) @binding(1) var albedoTexture: texture_2d<f32>;

@fragment
fn fragmentMain(
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>
) -> @location(0) vec4<f32> {
    var color = textureSample(albedoTexture, textureSampler, uv).rgb;

    return vec4<f32>(color, 1.0);
}