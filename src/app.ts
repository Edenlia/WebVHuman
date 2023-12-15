import {TypedArray} from "three";
import {Model, ModelVBType} from "./model";
import {
    createBindGroupDescriptor,
    create3DRenderPipeline,
} from './utils';

export class App {

    public canvas: HTMLCanvasElement;

    public adapter: GPUAdapter;

    public device: GPUDevice;

    public context: GPUCanvasContext;

    public format: GPUTextureFormat = 'rgba8unorm';

    public uniformGroupLayout: GPUBindGroupLayout;

    public renderPipeline: GPURenderPipeline;

    public devicePixelWidth: number;

    public devicePixelHeight: number;

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

    public InitPipeline (vxCode: string, fxCode: string) {

        this.uniformGroupLayout = this.device.createBindGroupLayout({

            entries: [

                {

                    binding: 0,

                    visibility: GPUShaderStage.VERTEX,

                    buffer: {

                        type: 'uniform',

                    }

                }

            ]

        });

        let layout: GPUPipelineLayout = this.device.createPipelineLayout({

            bindGroupLayouts: [this.uniformGroupLayout]

        });

        let vxModule: GPUShaderModule = this.device.createShaderModule({

            code: vxCode

        });

        let fxModule: GPUShaderModule = this.device.createShaderModule({

            code: fxCode

        });

        this.renderPipeline = this.device.createRenderPipeline({

            layout: layout,

            vertex: {

                buffers: [

                    {

                        // arrayStride: 4 * 8,
                        arrayStride: 4 * 3,

                        attributes: [

                            // position

                            {

                                shaderLocation: 0,

                                offset: 0,

                                format: 'float32x3'

                            },

                            // // normal
                            //
                            // {
                            //
                            //     shaderLocation: 1,
                            //
                            //     offset: 4 * 3,
                            //
                            //     format: 'float32x3'
                            //
                            // },

                            // // uv
                            //
                            // {
                            //
                            //     shaderLocation: 2,
                            //
                            //     offset: 4 * 6,
                            //
                            //     format: 'float32x2'
                            //
                            // }

                        ]

                    }

                ],

                module: vxModule,

                entryPoint: 'main',


            },

            fragment: {

                module: fxModule,

                entryPoint: 'main',

                targets: [

                    {
                        format: this.format,

                    }

                ]

            },

            primitive: {

                topology: 'triangle-list',

            }

        });

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

            model.InitModel(ModelVBType.P, mxArray, vxArray, idxArray, nmArray, uvArray);

            model.InitGPUBuffer(this.device);

            this.models.push(model);
    }

    public SetRenderBuffer(passEncoder: GPURenderPassEncoder, vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, uniformBindGroup: GPUBindGroup) {

        passEncoder.setVertexBuffer(0, vertexBuffer);

        passEncoder.setIndexBuffer(indexBuffer, "uint32");

        passEncoder.setBindGroup(0, uniformBindGroup);
    }

    public Draw(clearColor: GPUColorDict) {

        const commandEncoder = this.device.createCommandEncoder();
        let renderPassDescriptor: GPURenderPassDescriptor = {

            colorAttachments: [{

                view: this.context.getCurrentTexture().createView(),

                loadOp: 'clear',

                storeOp: 'store',

                clearValue: clearColor

            }]

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