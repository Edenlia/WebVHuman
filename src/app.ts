import {Model, ModelVBType} from "./model";
import {
    createBindGroupLayout,
    create3DRenderPipeline, createTextureFromImage, createBindGroup, createGPUBuffer, updateGPUBuffer,
} from './utils';
import {Camera, Vector3, DirectionalLight, OrthographicCamera, PerspectiveCamera, WebGPUCoordinateSystem} from "three";
// import {DirectionalLight} from "./light";

export class App {

    public canvas: HTMLCanvasElement;

    public adapter: GPUAdapter;

    public device: GPUDevice;

    public context: GPUCanvasContext;

    public format: GPUTextureFormat = 'rgba8unorm';

    public modelUniformGroupLayout: GPUBindGroupLayout;

    public globalUniformGroupLayout: GPUBindGroupLayout;

    public shadowGroupLayout: GPUBindGroupLayout;

    public globalUniformGroup: GPUBindGroup;

    public shadowGroup: GPUBindGroup;

    public lightBuffer: GPUBuffer;

    public cameraBuffer: GPUBuffer;

    public textureSampler: GPUSampler;

    public depthSampler: GPUSampler;

    public shadowPipeline: GPURenderPipeline;

    public irradiancePipeline: GPURenderPipeline;

    public renderPipeline: GPURenderPipeline;

    public devicePixelWidth: number;

    public devicePixelHeight: number;

    public shadowDepthTexture: GPUTexture;

    public irradianceDepthTexture: GPUTexture;

    public depthTexture: GPUTexture;

    public albedoTexture: GPUTexture;

    public specularTexture: GPUTexture;

    public displacementTexture: GPUTexture;

    public scatteringTexture: GPUTexture;

    public irradianceTexture: GPUTexture;

    private models: Model[] = []; // TODO: need to change to 1 model

    private camera: Camera;

    private mainLight: DirectionalLight;

    private cameraTimer: number = 0;

    private lightTimer: number = 0;

    private rotationSpeed: number = 0.001;

    private shadowMapSize: number = 1024;

    private intermediaTextureSize: number = 1024; // depend on the albedo texture size

    public CreateCanvas (rootElement: HTMLElement) {

        let width = rootElement.clientWidth;

        let height = rootElement.clientHeight;

        this.devicePixelWidth = Math.floor(width * window.devicePixelRatio);

        this.devicePixelHeight = Math.floor(height * window.devicePixelRatio);

        // TODO: For test now, set to intermediaTextureSize for output to screen

        this.devicePixelWidth = this.intermediaTextureSize;

        this.devicePixelHeight = this.intermediaTextureSize;

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
        let cameraBufferView = new Float32Array( pMatrix.toArray().concat(vMatrix.toArray()).concat(this.camera.position.toArray()).concat([0.0]) );
        updateGPUBuffer(this.device, cameraBufferView, this.cameraBuffer);
    }

    public UpdateLight (position: Vector3, target: Vector3) {
        this.mainLight.position.copy(position);
        this.mainLight.lookAt(target);

        this.mainLight.updateMatrixWorld(true);

        // this.mainLight.intensity = 1.2;
        // this.mainLight.color.setRGB(1, 1, 1);

        let lightDir = this.mainLight.position.clone().sub(this.mainLight.target.position).normalize();
        let lightColor = new Vector3(this.mainLight.color.r, this.mainLight.color.g, this.mainLight.color.b);
        lightColor.multiplyScalar(this.mainLight.intensity);
        let shadowCamera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
        shadowCamera.coordinateSystem = WebGPUCoordinateSystem;
        shadowCamera.updateProjectionMatrix();
        shadowCamera.position.copy(this.mainLight.position);
        shadowCamera.lookAt(this.mainLight.target.position);
        shadowCamera.updateMatrixWorld(true);
        let lightVPMatrix = shadowCamera.projectionMatrix.clone().multiply(shadowCamera.matrixWorldInverse);

        // each slot should be padded to a multiple of 16 bytes
        let lightBufferView = new Float32Array( lightDir.toArray().concat([0.0] /*padding*/).concat(lightColor.toArray()).concat([0.0]/*padding*/).concat(lightVPMatrix.toArray()) );
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
        let distanceToCenter = 30;
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
        let response = await fetch('./models/Emily/Emily_diffuse_1k.png');
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
        // response = await fetch('./models/Emily/Emily_scattering_8k.png');
        // imageBitmap = await createImageBitmap(await response.blob());
        // this.scatteringTexture = createTextureFromImage(this.device, imageBitmap, true);

        this.textureSampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
    }

    public InitBuffers () {
        // 1. Init group layout
        // model's model matrix and texture
        this.modelUniformGroupLayout = createBindGroupLayout(
            [0, 1, 2, 3],
            [
                GPUShaderStage.VERTEX,
                GPUShaderStage.FRAGMENT,
                GPUShaderStage.FRAGMENT,
                GPUShaderStage.FRAGMENT,
            ],
            ['buffer', 'sampler', 'texture', 'texture'],
            [
                {type: 'uniform' },
                {type: 'filtering'},
                {sampleType: 'float'},
                {sampleType: 'float'},
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
                GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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

        // shadow map and sampler
        this.shadowGroupLayout = createBindGroupLayout(
            [0, 1],
            [
                GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
            ],
            [
                'texture',
                'sampler'
            ],
            [
                {sampleType: 'depth'},
                {type: 'comparison'},
            ],
            'app',
            this.device);

        // 2. Init global groups

        // light and camera group
        let pMatrix = this.camera.projectionMatrix;
        let vMatrix = this.camera.matrixWorldInverse;

        let cameraBufferView = new Float32Array( pMatrix.toArray().concat(vMatrix.toArray()).concat(this.camera.position.toArray()).concat([0.0]) );
        this.cameraBuffer = createGPUBuffer(this.device, cameraBufferView, GPUBufferUsage.UNIFORM);

        // from surface to light source
        let lightDir = this.mainLight.position.clone().sub(this.mainLight.target.position).normalize();
        let lightColor = new Vector3(this.mainLight.color.r, this.mainLight.color.g, this.mainLight.color.b);
        lightColor.multiplyScalar(this.mainLight.intensity);
        let shadowCamera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
        shadowCamera.coordinateSystem = WebGPUCoordinateSystem;
        shadowCamera.updateProjectionMatrix();
        shadowCamera.position.copy(this.mainLight.position);
        shadowCamera.lookAt(this.mainLight.target.position);
        shadowCamera.updateMatrixWorld(true);
        let lightVPMatrix = shadowCamera.projectionMatrix.clone().multiply(shadowCamera.matrixWorldInverse);

        // each slot should be padded to a multiple of 16 bytes
        let lightBufferView = new Float32Array(
            lightDir.toArray()
                .concat([0.0] /*padding*/)
                .concat(lightColor.toArray())
                .concat([0.0]/*padding*/)
                .concat(lightVPMatrix.toArray())
        );
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

        // shadow group
        this.depthSampler = this.device.createSampler({
            compare: 'less',
        })

        this.shadowDepthTexture = this.device.createTexture({
            size: { width: this.shadowMapSize, height: this.shadowMapSize, depthOrArrayLayers: 1 },
            format: 'depth32float', // depth format
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        })

        this.shadowGroup = createBindGroup(
            [
                this.shadowDepthTexture.createView(),
                this.depthSampler
            ],
            this.shadowGroupLayout,
            'app',
            this.device
        )

    }

    public InitShadowPipeline (vxCode: string) {

        this.shadowPipeline = create3DRenderPipeline(
            this.device,
            'app',
            [
                this.modelUniformGroupLayout,
                this.globalUniformGroupLayout,
            ],
            vxCode,
            // position, normal, uv
            ['float32x3', 'float32x3', 'float32x2'],
            null,
            null,
            null,
            true,
            'triangle-list',
            'back',
            'depth32float'
        );
    }

    public InitIrradiancePipeline (vxCode: string, fxCode: string) {

            this.irradiancePipeline = create3DRenderPipeline(
                this.device,
                'app',
                [
                    this.modelUniformGroupLayout,
                    this.globalUniformGroupLayout,
                    this.shadowGroupLayout,
                ],
                vxCode,
                // position, normal, uv
                ['float32x3', 'float32x3', 'float32x2'],
                fxCode,
                1,
                [this.format],
                true,
                'triangle-list',
                'none',
            );

            // color attachment of irradiance pass, also be the input texture in gaussian blur pass
            this.irradianceTexture = this.device.createTexture({
                size: { width: this.intermediaTextureSize, height: this.intermediaTextureSize, depthOrArrayLayers: 1 },
                format: this.format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })

            this.irradianceDepthTexture = this.device.createTexture({
                size: { width: this.intermediaTextureSize, height: this.intermediaTextureSize, depthOrArrayLayers: 1 },
                format: 'depth24plus', // depth format
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            })
    }

    public InitRenderPipeline (vxCode: string, fxCode: string) {

        this.renderPipeline = create3DRenderPipeline(
            this.device,
            'app',
            [
                this.modelUniformGroupLayout,
                this.globalUniformGroupLayout,
                this.shadowGroupLayout,
            ],
            vxCode,
            // position, normal, uv
            ['float32x3', 'float32x3', 'float32x2'],
            fxCode,
            1,
            [this.format],
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

            model.InitTextures(this.albedoTexture, this.specularTexture, this.textureSampler);

            model.InitGPUBuffer(this.device, this);

            this.models.push(model);
    }

    public Draw(clearColor: GPUColorDict) {

        let shadowPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [],

            depthStencilAttachment: {
                view: this.shadowDepthTexture.createView(),

                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        }

        let irradiancePassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.irradianceTexture.createView(),
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: clearColor
                }
            ],
            depthStencilAttachment: {
                view: this.irradianceDepthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            }
        }

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

        const commandEncoder = this.device.createCommandEncoder();

        const shadowPass = commandEncoder.beginRenderPass(shadowPassDescriptor);
        shadowPass.setPipeline(this.shadowPipeline);

        for (let i = 0; i < this.models.length; i++) {

            shadowPass.setVertexBuffer(0, this.models[i].vertexBuffer);
            shadowPass.setIndexBuffer(this.models[i].indexBuffer, "uint32");
            shadowPass.setBindGroup(0, this.models[i].uniformBindGroup);
            shadowPass.setBindGroup(1, this.globalUniformGroup);

            shadowPass.drawIndexed(this.models[i].indexCount, 1, 0, 0, 0);
        }

        shadowPass.end();

        const irradiancePass = commandEncoder.beginRenderPass(irradiancePassDescriptor);
        irradiancePass.setPipeline(this.irradiancePipeline);

        for (let i = 0; i < this.models.length; i++) {

            irradiancePass.setVertexBuffer(0, this.models[i].vertexBuffer);
            irradiancePass.setIndexBuffer(this.models[i].indexBuffer, "uint32");
            irradiancePass.setBindGroup(0, this.models[i].uniformBindGroup);
            irradiancePass.setBindGroup(1, this.globalUniformGroup);
            irradiancePass.setBindGroup(2, this.shadowGroup);

            irradiancePass.drawIndexed(this.models[i].indexCount, 1, 0, 0, 0);

        }

        irradiancePass.end();

        const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setViewport(0, 0, this.devicePixelWidth, this.devicePixelHeight, 0, 1);

        for (let i = 0; i < this.models.length; i++) {

            renderPass.setVertexBuffer(0, this.models[i].vertexBuffer);
            renderPass.setIndexBuffer(this.models[i].indexBuffer, "uint32");
            renderPass.setBindGroup(0, this.models[i].uniformBindGroup);
            renderPass.setBindGroup(1, this.globalUniformGroup);
            renderPass.setBindGroup(2, this.shadowGroup);

            renderPass.drawIndexed(this.models[i].indexCount, 1, 0, 0, 0);

        }

        renderPass.end();

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