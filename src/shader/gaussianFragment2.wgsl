struct FragOutput {
    @location(0) irradiance1: vec4<f32>,
    @location(1) irradiance2: vec4<f32>,
    @location(2) irradiance3: vec4<f32>,
};

@group(2) @binding(0) var inputSampler: sampler;
@group(2) @binding(1) var inputTexture1: texture_2d<f32>;
@group(2) @binding(2) var inputTexture2: texture_2d<f32>;
@group(2) @binding(3) var inputTexture3: texture_2d<f32>;

const isU = false;
const isFirst = true;
const radius = 1.5;
const textureSize: f32 = 1024.0;

// Based on Donner and Jensen 2005
const kernel1: vec4<f32> = vec4<f32>(0.0064, 0.233, 0.455, 0.649); // [variance, r, g, b]
const kernel2: vec4<f32> = vec4<f32>(0.0484, 0.100, 0.336, 0.344);
const kernel3: vec4<f32> = vec4<f32>(0.187, 0.118, 0.198, 0.0);
const kernel4: vec4<f32> = vec4<f32>(0.567, 0.113, 0.007, 0.007);
const kernel5: vec4<f32> = vec4<f32>(1.99, 0.358, 0.004, 0.0);
const kernel6: vec4<f32> = vec4<f32>(7.41, 0.078, 0.0, 0.0);

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

// Output is linear
fn convolve(
    isU: bool,
    variance: f32,
    uv: vec2<f32>,
    sampleTexture: texture_2d<f32>,

) -> vec3<f32> {
    var gaussWidth = variance; // Should use standard deviation * stretch, here use variance instead
    var scaleConv = gaussWidth * radius / textureSize;

    // Gaussian curve – standard deviation of 1.0 (sample weight)
    var curve = array<f32, 7>(0.006, 0.061, 0.242, 0.383, 0.242, 0.061, 0.006);

    var sum = vec3<f32>(0.0, 0.0, 0.0);

    var step: vec2<f32> = vec2<f32>(0.0, 0.0);
    if (isU) {
        step.x = 1.0;
    } else {
        step.y = 1.0;
    }

    for (var i = 0; i < 7; i++) {

        var offset = ( f32(i) - 3.0) * scaleConv * step;
        var coord = uv + offset;

        var tap = textureSample(sampleTexture, inputSampler, coord).rgb;
        tap = mon2lin(tap);
        sum += tap * curve[i];
    }

    return sum;
}

@fragment
fn fragmentMain(
    @location(0) worldPos: vec4<f32>,
    @location(1) worldNormal: vec3<f32>,
    @location(2) uv: vec2<f32>,
) -> FragOutput {
    var output: FragOutput;

    var blurredIrradiance1: vec3<f32>;
    var blurredIrradiance2: vec3<f32>;
    var blurredIrradiance3: vec3<f32>;

    var usedKernel1: vec4<f32>;
    var usedKernel2: vec4<f32>;
    var usedKernel3: vec4<f32>;

    if (isFirst) { // for kernel 1,2,3
        usedKernel1 = kernel1;
        usedKernel2 = kernel2;
        usedKernel3 = kernel3;
    } else { // for kernel 4,5,6
        usedKernel1 = kernel4;
        usedKernel2 = kernel5;
        usedKernel3 = kernel6;
    }

    blurredIrradiance1 = convolve(isU, usedKernel1.x, uv, inputTexture1);
    blurredIrradiance2 = convolve(isU, usedKernel2.x, uv, inputTexture2);
    blurredIrradiance3 = convolve(isU, usedKernel3.x, uv, inputTexture3);

    blurredIrradiance1 = lin2mon(blurredIrradiance1);
    blurredIrradiance2 = lin2mon(blurredIrradiance2);
    blurredIrradiance3 = lin2mon(blurredIrradiance3);

    output.irradiance1 = vec4<f32>(blurredIrradiance1, 1.0);
    output.irradiance2 = vec4<f32>(blurredIrradiance2, 1.0);
    output.irradiance3 = vec4<f32>(blurredIrradiance3, 1.0);

    return output;
}
