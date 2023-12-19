@group(1) @binding(0) var textureSampler: sampler;
@group(1) @binding(1) var albedoTexture: texture_2d<f32>;

var<private> kDielectricSpec: vec4<f32> = vec4<f32>(0.04, 0.04, 0.04, 0.96);
var<private> cameraPos: vec3<f32> = vec3<f32>(0.0, 0.0, 50.0);


fn OneMinusReflectivityMetallic(
metallic: f32
) -> f32
{
    // We'll need oneMinusReflectivity, so
    //   1-reflectivity = 1-lerp(dielectricSpec, 1, metallic) = lerp(1-dielectricSpec, 0, metallic)
    // store (1-dielectricSpec) in kDielectricSpec.a, then
    //   1-reflectivity = lerp(alpha, 0, metallic) = alpha + metallic*(0 - alpha) =
    //                  = alpha - metallic * alpha
    var oneMinusDielectricSpec = kDielectricSpec.a;
    return oneMinusDielectricSpec - metallic * oneMinusDielectricSpec;
}

fn BRDFSpecularTerm(
    N: vec3<f32>,
    L: vec3<f32>,
    V: vec3<f32>,
    roughness: f32,
) -> f32 {
    var H = normalize(L + V);

    var NdotH = saturate(dot(N, H));
    var NdotL = saturate(dot(N, L));
    var LdotH = saturate(dot(L, H));

    var roughness2 = roughness * roughness;
    var roughness2MinusOne = roughness2 - 1.0;
    var normalizationTerm = roughness * 4.0 + 2.0;


    // GGX Distribution multiplied by combined approximation of Visibility and Fresnel
    // BRDFspec = (D * V * F) / 4.0
    // D = roughness^2 / ( NoH^2 * (roughness^2 - 1) + 1 )^2
    // V * F = 1.0 / ( LoH^2 * (roughness + 0.5) )
    // See "Optimizing PBR for Mobile" from Siggraph 2015 moving mobile graphics course
    // https://community.arm.com/events/1155

    // Final BRDFspec = roughness^2 / ( NoH^2 * (roughness^2 - 1) + 1 )^2 * (LoH^2 * (roughness + 0.5) * 4.0)
    // We further optimize a few light invariant terms
    // normalizationTerm = (roughness + 0.5) * 4.0 rewritten as roughness * 4.0 + 2.0 to a fit a MAD.
    var d = NdotH * NdotH * roughness2MinusOne + 1.00001f;

    var LdotH2 = LdotH * LdotH;

    var specularTerm = roughness2 / ((d * d) * max(0.1, LdotH2 * normalizationTerm));

    return specularTerm;
}

fn BRDF(
    albedo: vec3<f32>,
    metallic: f32,
    roughness: f32,
    N: vec3<f32>,
    L: vec3<f32>,
    V: vec3<f32>,
) -> vec3<f32> {
    var oneMinusReflectivity = OneMinusReflectivityMetallic(metallic);
    var brdfDiffuse = oneMinusReflectivity * albedo;
    var brdfSpecular = mix(kDielectricSpec.rgb, albedo, metallic);

    var brdf = brdfDiffuse + brdfSpecular * BRDFSpecularTerm(N, L, V, roughness);

    return brdf;
}




@fragment
fn fragmentMain(
    @location(0) worldPos: vec4<f32>,
    @location(1) worldNormal: vec3<f32>,
    @location(2) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
    var albedo = textureSample(albedoTexture, textureSampler, uv).rgb;
    var lightDir = normalize(vec3<f32>(0.0, 1.0, 1.0));
    var viewDir = normalize(cameraPos - worldPos.xyz);
    var N = normalize(worldNormal);
    var brdf = BRDF(albedo, 0.0, 0.4, N, lightDir, viewDir);
    var radiance = vec3<f32>(1.5, 1.5, 1.5);
    var color = brdf * radiance * dot(N, viewDir);

    return vec4<f32>(color, 1.0);
}