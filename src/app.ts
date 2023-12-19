import {TypedArray} from "three";
import {Model, ModelVBType} from "./model";
import {
    createBindGroupLayout,
    create3DRenderPipeline, createTextureFromImage, createBindGroup,
} from './utils';

export class App {

    public canvas: HTMLCanvasElement;

    public adapter: GPUAdapter;

    public device: GPUDevice;

    public context: GPUCanvasContext;

    public format: GPUTextureFormat = 'rgba8unorm';

    public uniformGroupLayout: GPUBindGroupLayout;

    public sampler: GPUSampler;

    public surfaceGroupLayout: GPUBindGroupLayout;

    public surfaceGroup: GPUBindGroup;

    public renderPipeline: GPURenderPipeline;

    public devicePixelWidth: number;

    public devicePixelHeight: number;

    public depthTexture: GPUTexture;

    public albedoTexture: GPUTexture;

    public specularTexture: GPUTexture;

    public displacementTexture: GPUTexture;

    private models: Model[] = [];

    public CreateCanvas (rootElement: HTMLElement) {

        let width = rootElement.clientWidth;

        let height = rootElement.clientHeight;

        this.devicePixelWidth = Math.floor(width * window.devicePixelRatio);

        this.devicePixelHeight = Math.floor(height * window.devicePixelRatio);

        this.canvas = document.createElement('canvas');

        this.canvas.width = this.devicePixelWidth;

        this.canvas.height = this.devicePixelHeight;

        this.canvas.style.width = '100%';

        this.canvas.style.height = '100%';

        rootElement.appendChild(this.canvas);

    }

    public async InitWebGPU() {

        this.adapter = await navigator.gpu.requestAdapter({

            powerPreference: 'high-performance'

        });

        this.device = await this.adapter.requestDevice();

        this.context = <unknown>this.canvas.getContext('webgpu') as GPUCanvasContext;

        //this.format = navigator.gpu.getPreferredCanvasFormat();
        this.format = 'rgba8unorm';

        this.context.configure({

            device: this.device,

            format: this.format,

            usage: GPUTextureUsage.RENDER_ATTACHMENT

        });

    }

    public async LoadAlbedoTexture () {
        const response = await fetch('./models/Emily/Emily_diffuse_8k.png');
        const imageBitmap = await createImageBitmap(await response.blob());

        // Test exr
        // console.log("start load exr")
        // // let texture = await loadImage( "./models/Emily/Emily_diffuse.png");
        // let texture = await loadEXR( "./models/Emily/Emily_diffuse_map.exr");
        // console.log("finish load exr")
        // console.log(texture);
        // const blob = new Blob([texture.image.data], {type: 'image/png'});
        // const imageBitmap = await createImageBitmap(blob);

        this.albedoTexture = createTextureFromImage(this.device, imageBitmap, true);
    }

    public InitPipeline (vxCode: string, fxCode: string) {
        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        this.uniformGroupLayout = createBindGroupLayout(
            [0],
            [GPUShaderStage.VERTEX],
            ['buffer'],
            [{type: 'uniform' }],
            'app',
            this.device);

        this.surfaceGroupLayout = createBindGroupLayout(
            [0, 1],
            [GPUShaderStage.FRAGMENT],
            ['sampler', 'texture'],
            [
                {type: 'filtering'},
                {sampleType: 'float'}
            ],
            'app',
            this.device);

        this.surfaceGroup = createBindGroup(
            [
                this.sampler,
                this.albedoTexture.createView()
            ],
            this.surfaceGroupLayout,
            'app',
            this.device
        )

        this.renderPipeline = create3DRenderPipeline(
            this.device,
            'app',
            [this.uniformGroupLayout, this.surfaceGroupLayout],
            vxCode,
            // position, normal, uv
            ['float32x3', 'float32x3', 'float32x2'],
            fxCode,
            this.format,
            true,
            'triangle-list'
        );

        this.depthTexture = this.device.createTexture({
            size: { width: this.devicePixelWidth, height: this.devicePixelHeight, depthOrArrayLayers: 1 },
            format: 'depth24plus', // depth format
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        })
    }

    private _CreateGPUBuffer (typedArray: TypedArray, usage: GPUBufferUsageFlags) {

        let gpuBuffer = this.device.createBuffer({

            size: typedArray.byteLength,

            usage: usage | GPUBufferUsage.COPY_DST,

            mappedAtCreation: true

        });

        let constructor = typedArray.constructor as new (buffer: ArrayBuffer) => TypedArray;

        let view = new constructor(gpuBuffer.getMappedRange());

        view.set(typedArray, 0);

        gpuBuffer.unmap();

        return gpuBuffer;

    }

    public UploadModel (vxArray: Float32Array, idxArray: Uint32Array, nmArray: Float32Array, uvArray: Float32Array, mxArray: Float32Array) {

            let model = new Model();

            model.InitModel(ModelVBType.PNU, mxArray, vxArray, idxArray, nmArray, uvArray);

            model.InitGPUBuffer(this.device, this);

            this.models.push(model);
    }

    public SetRenderBuffer(passEncoder: GPURenderPassEncoder, vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, uniformBindGroup: GPUBindGroup) {

        passEncoder.setVertexBuffer(0, vertexBuffer);

        passEncoder.setIndexBuffer(indexBuffer, "uint32");

        passEncoder.setBindGroup(0, uniformBindGroup);

        passEncoder.setBindGroup(1, this.surfaceGroup);
    }

    public Draw(clearColor: GPUColorDict) {

        const commandEncoder = this.device.createCommandEncoder();
        let renderPassDescriptor: GPURenderPassDescriptor = {

            colorAttachments: [{

                view: this.context.getCurrentTexture().createView(),

                loadOp: 'clear',

                storeOp: 'store',

                clearValue: clearColor

            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),

                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },

        }
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.renderPipeline);
        passEncoder.setViewport(0, 0, this.devicePixelWidth, this.devicePixelHeight, 0, 1);


        for (let i = 0; i < this.models.length; i++) {

            this.SetRenderBuffer(passEncoder, this.models[i].vertexBuffer, this.models[i].indexBuffer, this.models[i].uniformBindGroup);

            passEncoder.drawIndexed(this.models[i].indexCount, 1, 0, 0, 0);

        }

        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);



    }

    public UpdateModelUniformBuffer (modelIndex: number, mxArray: Float32Array) {

          this.models[modelIndex].UpdateUniformBuffer(this.device, mxArray);
    }

    public RunRenderLoop( fn: Function ) {

        fn();

        requestAnimationFrame( () => this.RunRenderLoop( fn ) );

    }

}