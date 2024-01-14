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

@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var specularTexture: texture_2d<f32>;

@group(1) @binding(0)
var<uniform> cameraUniforms: CameraUniforms;

@group(1) @binding(1)
var<uniform> mainLightUniforms: MainLightUniforms;

@group(2) @binding(0) var shadowMap: texture_depth_2d;
@group(2) @binding(1) var shadowSampler: sampler_comparison;

var<private> shadowDepthTextureSize: f32 = 1024.0;

var<private> kDielectricSpec: vec4<f32> = vec4<f32>(0.04, 0.04, 0.04, 0.96);
var<private> SubsurfaceColor: vec3<f32> = vec3<f32>(0.7, 0.1, 0.1);
var<private> SubsurfaceRadius: vec3<f32> = vec3<f32>(1.0, 0.2, 0.1);

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

///////////////////////////////
//// Unity URP style BRDF /////
///////////////////////////////
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

    var brdf = vec3<f32>(0.0, 0.0, 0.0);
    brdf += brdfDiffuse;
    brdf += brdfSpecular * BRDFSpecularTerm(N, L, V, roughness);

    return brdf;
}

///////////////////////////////
////// Nvidia Skin style //////
///////////////////////////////

// Based on Nvidia https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin
// "When computing a Fresnel term for a rough surface like skin, all terms should be measured from the half-angle vector, H, and not from N"
// For human skin, F0=0.028 (IOR=1.4)
fn FresnelReflectance(
    V: vec3<f32>,
    H: vec3<f32>,
    F0: f32,
) -> f32 {
    var base = 1.0 - saturate(dot(V, H));
    var exponential = pow(base, 5.0);
    return exponential + F0 * (1.0 - exponential);
}

// Based on Nvidia https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin
// Compare to normal Beckmann, there is no factor of 1/pi, keep in mind
fn Beckmann(
    NdotH: f32,
    roughness: f32,
) -> f32 {
    var theta = acos(NdotH);
    var tanTheta = tan(theta);
    var val = 1.0 / (roughness * roughness * pow(cos(theta), 4.0)) * exp(-tanTheta * tanTheta / (roughness * roughness));
    return val;
}

fn KSSkinSpecular(
    N: vec3<f32>,
    V: vec3<f32>,
    L: vec3<f32>,
    m: f32, // roughness
    rho_s: f32, // Specular brightness (map)
) -> f32 {
    var result = 0.0;
    var NdotL = saturate(dot(N, L));
    var h = L + V; // Unnormalized half-way vector
    var H = normalize(h);
    var NdotH = saturate(dot(N, H));
    var PH = pow(Beckmann(NdotH, m), 0.5); // can change power for visual effect, Nvidia uses 10, but not good for me
    var F = FresnelReflectance(V, H, 0.028);
    var frSpec = max(PH * F / (dot(h, h)), 0.0);
    result = frSpec * NdotL * rho_s; // BRDF * dot(N, L) * rho_s

    return result;
}

fn visibility(
    shadowPos: vec3<f32>,
) -> f32 {
    // PCF for 3x3
    var v = 0.0;
    let oneOverShadowDepthTextureSize = 1.0 / shadowDepthTextureSize;
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
    var albedo = textureSample(albedoTexture, textureSampler, uv).rgb;
    albedo = mon2lin(albedo);
    var lightDir = mainLightUniforms.uLightDirection; // normlaized in software stage
    var cameraPos = cameraUniforms.uCameraPosition;
    var viewDir = normalize(cameraPos - worldPos.xyz);
    var N = normalize(worldNormal);
    var radiance = mainLightUniforms.uLightColor;
    var shadowIntensity = 0.8;
    var lightShadow = visibility(shadowPos) * shadowIntensity + (1.0 - shadowIntensity);

//    Unity style
//    var brdf = BRDF(albedo, 0.0, 0.4, N, lightDir, viewDir);
//    var color = brdf * radiance * dot(N, viewDir);

    var rho_s = textureSample(specularTexture, textureSampler, uv).r;
    // rho_s *= 0.4;
    // var rho_s = 0.9;
    var m = 0.3;
    var specular = radiance * KSSkinSpecular(N, viewDir, lightDir, m, rho_s);
    var diffuse = radiance * albedo * max(dot(N, lightDir), 0.0) / 3.1415926;

    var color = specular + diffuse;
    color *= lightShadow;
    color = lin2mon(color);

    return vec4<f32>(color, 1.0);
}