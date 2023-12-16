type BindGroupBindingLayout =
  | GPUBufferBindingLayout
  | GPUTextureBindingLayout
  | GPUSamplerBindingLayout
  | GPUStorageTextureBindingLayout
  | GPUExternalTextureBindingLayout;

export type BindGroupsObjectsAndLayout = {
  bindGroups: GPUBindGroup[];
  bindGroupLayout: GPUBindGroupLayout;
};

type ResourceTypeName =
  | 'buffer'
  | 'texture'
  | 'sampler'
  | 'externalTexture'
  | 'storageTexture';

export const createBindGroupLayout = (
  bindings: number[],
  visibilities: number[],
  resourceTypes: ResourceTypeName[],
  resourceLayouts: BindGroupBindingLayout[],
  label: string,
  device: GPUDevice
) : GPUBindGroupLayout => {
  // Create layout of each entry within a bindGroup
  const layoutEntries: GPUBindGroupLayoutEntry[] = [];
  for (let i = 0; i < bindings.length; i++) {
    layoutEntries.push({
      binding: bindings[i],
      visibility: visibilities[i % visibilities.length],
      [resourceTypes[i]]: resourceLayouts[i],
    });
  }

  // Apply entry layouts to bindGroupLayout
  return device.createBindGroupLayout({
    label: `${label}.bindGroupLayout`,
    entries: layoutEntries,
  });
}

export const createBindGroup = (
  resource: GPUBindingResource[],
  bindGroupLayout: GPUBindGroupLayout,
  label: string,
  device: GPUDevice
) : GPUBindGroup => {

  // Create bindGroups that conform to the layout
  const bindGroups: GPUBindGroup[] = [];
  const groupEntries: GPUBindGroupEntry[] = [];
  for (let j = 0; j < resource.length; j++) {
    groupEntries.push({
      binding: j,
      resource: resource[j],
    });
  }

  return device.createBindGroup({
    label: `${label}.bindGroup`,
    layout: bindGroupLayout,
    entries: groupEntries,
  });
}

export type ShaderKeyInterface<T extends string[]> = {
  [K in T[number]]: number;
};

interface AttribAcc {
  attributes: GPUVertexAttribute[];
  arrayStride: number;
}

/**
 * @param {GPUVertexFormat} vf - A valid GPUVertexFormat, representing a per-vertex value that can be passed to the vertex shader.
 * @returns {number} The number of bytes present in the value to be passed.
 */
export const convertVertexFormatToBytes = (vf: GPUVertexFormat): number => {
  const splitFormat = vf.split('x');
  const bytesPerElement = parseInt(splitFormat[0].replace(/[^0-9]/g, '')) / 8;

  const bytesPerVec =
    bytesPerElement *
    (splitFormat[1] !== undefined ? parseInt(splitFormat[1]) : 1);

  return bytesPerVec;
};

/** Creates a GPUVertexBuffer Layout that maps to an interleaved vertex buffer.
 * @param {GPUVertexFormat[]} vertexFormats - An array of valid GPUVertexFormats.
 * @returns {GPUVertexBufferLayout} A GPUVertexBufferLayout representing an interleaved vertex buffer.
 */
export const createVBuffer = (
  vertexFormats: GPUVertexFormat[]
): GPUVertexBufferLayout => {
  const initialValue: AttribAcc = { attributes: [], arrayStride: 0 };

  const vertexBuffer = vertexFormats.reduce(
    (acc: AttribAcc, curr: GPUVertexFormat, idx: number) => {
      const newAttribute: GPUVertexAttribute = {
        shaderLocation: idx,
        offset: acc.arrayStride,
        format: curr,
      };
      const nextOffset: number =
        acc.arrayStride + convertVertexFormatToBytes(curr);

      const retVal: AttribAcc = {
        attributes: [...acc.attributes, newAttribute],
        arrayStride: nextOffset,
      };
      return retVal;
    },
    initialValue
  );

  const layout: GPUVertexBufferLayout = {
    arrayStride: vertexBuffer.arrayStride,
    attributes: vertexBuffer.attributes,
  };

  return layout;
};

export const create3DRenderPipeline = (
  device: GPUDevice,
  label: string,
  bgLayouts: GPUBindGroupLayout[],
  vertexShader: string,
  vBufferFormats: GPUVertexFormat[],
  fragmentShader: string,
  presentationFormat: GPUTextureFormat,
  depthTest = false,
  topology: GPUPrimitiveTopology = 'triangle-list',
  cullMode: GPUCullMode = 'back'
) => {
  const pipelineDescriptor: GPURenderPipelineDescriptor = {
    label: `${label}.pipeline`,
    layout: device.createPipelineLayout({
      label: `${label}.pipelineLayout`,
      bindGroupLayouts: bgLayouts,
    }),
    vertex: {
      module: device.createShaderModule({
        label: `${label}.vertexShader`,
        code: vertexShader,
      }),
      entryPoint: 'vertexMain',
      buffers:
        vBufferFormats.length !== 0 ? [createVBuffer(vBufferFormats)] : [],
    },
    fragment: {
      module: device.createShaderModule({
        label: `${label}.fragmentShader`,
        code: fragmentShader,
      }),
      entryPoint: 'fragmentMain',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: topology,
      cullMode: cullMode,
    },
  };
  if (depthTest) {
    pipelineDescriptor.depthStencil = {
      depthCompare: 'less',
      depthWriteEnabled: true,
      format: 'depth24plus',
    };
  }
  return device.createRenderPipeline(pipelineDescriptor);
};

export const createTextureFromImage = (
  device: GPUDevice,
  bitmap: ImageBitmap,
  flipY = false
) => {
  const texture: GPUTexture = device.createTexture({
    size: [bitmap.width, bitmap.height, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: bitmap, flipY: flipY },
    { texture: texture },
    [bitmap.width, bitmap.height]
  );
  return texture;
};