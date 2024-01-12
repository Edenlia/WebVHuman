import {Model, ModelVBType} from "./model";
import {
    createBindGroupLayout,
    create3DRenderPipeline, createTextureFromImage, createBindGroup, createGPUBuffer, updateGPUBuffer,
} from './utils';
import {Camera, Vector3} from "three";
import {DirectionalLight} from "./light";

export class App {

    public canvas: HTMLCanvasElement;

    public adapter: GPUAdapter;

    public device: GPUDevice;

    public context: GPUCanvasContext;

    public format: GPUTextureFormat = 'rgba8unorm';

    public modelUniformGroupLayout: GPUBindGroupLayout;

    public globalUniformGroupLayout: GPUBindGroupLayout;

    public globalUniformGroup: GPUBindGroup;

    public lightBuffer: GPUBuffer;

    public cameraBuffer: GPUBuffer;

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

    public scatteringTexture: GPUTexture;

    private models: Model[] = [];

    private camera: Camera;

    private mainLight: DirectionalLight;

    private cameraTimer: number = 0;

    private lightTimer: number = 0;

    private rotationSpeed: number = 0.001;

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

    public constructor(camera: Camera, mainLight: DirectionalLight) {
        this.camera = camera;
        this.mainLight = mainLight;
    }

    public UpdateCamera (position: Vector3, target: Vector3) {
        this.camera.position.copy(position);
        this.camera.lookAt(target);

        this.camera.updateMatrixWorld( true);

        let pMatrix = this.camera.projectionMatrix;
        let vMatrix = this.camera.matrixWorldInverse;
        let cameraBufferView = new Float32Array( pMatrix.toArray().concat(vMatrix.toArray()) );
        updateGPUBuffer(this.device, cameraBufferView, this.cameraBuffer);
    }

    public UpdateLight (position: Vector3, target: Vector3) {
        this.mainLight.updatePosAndDir(position, target);

        let lightDir = this.mainLight.position.clone().sub(this.mainLight.lookAt).normalize();
        let lightColor = this.mainLight.color.clone().multiplyScalar(this.mainLight.intensity);
        // each slot should be padded to a multiple of 16 bytes
        let lightBufferView = new Float32Array( lightDir.toArray().concat([0.0] /*padding*/).concat(lightColor.toArray()).concat([0.0]/*padding*/) );
        updateGPUBuffer(this.device, lightBufferView, this.lightBuffer);
    }

    public RotateCamera (elapsed: number) {
        let distanceToCenter = 30;
        this.cameraTimer += elapsed;
        let position = new Vector3(
            Math.sin(this.cameraTimer * this.rotationSpeed) * distanceToCenter,
            0,
            Math.cos(this.cameraTimer * this.rotationSpeed) * distanceToCenter);
        let target = new Vector3(0, 0, 0);

        this.UpdateCamera(position, target);
    }

    public RotateLight (elapsed: number) {
        let distanceToCenter = 1;
        this.lightTimer += elapsed;
        let position = new Vector3(
            Math.sin(this.lightTimer * this.rotationSpeed) * distanceToCenter,
            0,
            Math.cos(this.lightTimer * this.rotationSpeed) * distanceToCenter);
        let target = new Vector3(0, 0, 0);

        this.UpdateLight(position, target);
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

    public async LoadTextures () {
        // albedo
        let response = await fetch('./models/Emily/Emily_diffuse_8k.png');
        let imageBitmap = await createImageBitmap(await response.blob());
        this.albedoTexture = createTextureFromImage(this.device, imageBitmap, true);

        // specular
        response = await fetch('./models/Emily/Emily_specular_8k.png');
        imageBitmap = await createImageBitmap(await response.blob());
        this.specularTexture = createTextureFromImage(this.device, imageBitmap, true);

        // displacement
        // response = await fetch('./models/Emily/Emily_displacement.png');
        // imageBitmap = await createImageBitmap(await response.blob());
        // this.displacementTexture = createTextureFromImage(this.device, imageBitmap, true);

        // scattering
        response = await fetch('./models/Emily/Emily_scattering_8k.png');
        imageBitmap = await createImageBitmap(await response.blob());
        this.scatteringTexture = createTextureFromImage(this.device, imageBitmap, true);

        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
    }

    public InitBuffers () {
        // 1. Init group layout
        // model's model matrix
        this.modelUniformGroupLayout = createBindGroupLayout(
            [0],
            [GPUShaderStage.VERTEX],
            ['buffer'],
            [{type: 'uniform' }],
            'app',
            this.device);

        // textures
        this.surfaceGroupLayout = createBindGroupLayout(
            [0, 1, 2, 3],
            [GPUShaderStage.FRAGMENT, GPUShaderStage.FRAGMENT, GPUShaderStage.FRAGMENT, GPUShaderStage.FRAGMENT],
            ['sampler', 'texture', 'texture', 'texture'],
            [
                {type: 'filtering'},
                {sampleType: 'float'},
                {sampleType: 'float'},
                {sampleType: 'float'}
            ],
            'app',
            this.device);

        // Lights, camera view matrix, projection matrix
        this.globalUniformGroupLayout = createBindGroupLayout(
            [
                0,
                1,
            ],
            [
                GPUShaderStage.VERTEX,
                GPUShaderStage.FRAGMENT,
            ],
            [
                'buffer',
                'buffer'
            ],
            [
                {type: 'uniform' },
                {type: 'uniform' },
            ],
            'app',
            this.device);

        // 2. Init global groups
        // surface group
        this.surfaceGroup = createBindGroup(
            [
                this.sampler,
                this.albedoTexture.createView(),
                this.specularTexture.createView(),
                this.scatteringTexture.createView()
            ],
            this.surfaceGroupLayout,
            'app',
            this.device
        )

        // light and camera group
        let pMatrix = this.camera.projectionMatrix;
        let vMatrix = this.camera.matrixWorldInverse;
        let cameraBufferView = new Float32Array( pMatrix.toArray().concat(vMatrix.toArray()) );
        this.cameraBuffer = createGPUBuffer(this.device, cameraBufferView, GPUBufferUsage.UNIFORM);

        // from surface to light source
        let lightDir = this.mainLight.position.clone().sub(this.mainLight.lookAt).normalize();
        let lightColor = this.mainLight.color.clone().multiplyScalar(this.mainLight.intensity);
        // each slot should be padded to a multiple of 16 bytes
        let lightBufferView = new Float32Array( lightDir.toArray().concat([0.0] /*padding*/).concat(lightColor.toArray()).concat([0.0]/*padding*/) );
        console.log("lightBufferView: ", lightBufferView);
        this.lightBuffer = createGPUBuffer(this.device, lightBufferView, GPUBufferUsage.UNIFORM);

        this.globalUniformGroup = createBindGroup(
            [
                {buffer: this.cameraBuffer},
                {buffer: this.lightBuffer}
            ],
            this.globalUniformGroupLayout,
            'app',
            this.device
        )

    }

    public InitPipeline (vxCode: string, fxCode: string) {

        this.renderPipeline = create3DRenderPipeline(
            this.device,
            'app',
            [
                this.modelUniformGroupLayout,
                this.surfaceGroupLayout,
                this.globalUniformGroupLayout,
            ],
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

        passEncoder.setBindGroup(2, this.globalUniformGroup);
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