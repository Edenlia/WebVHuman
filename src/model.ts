import {App} from "./app";
import {createBindGroup, createGPUBuffer, updateGPUBuffer} from "./utils";

export enum ModelVBType {
    P = 0,
    PN = 1,
    PNU = 2,
}

export class Model {

    public vertexArray: Float32Array;

    public indexArray: Uint32Array;

    public normalArray: Float32Array;

    public uvArray: Float32Array;

    public vertexBuffer: GPUBuffer;

    public indexBuffer: GPUBuffer;

    public uniformBuffer: GPUBuffer;

    public uniformBindGroup: GPUBindGroup;

    public albedoTexture: GPUTexture;

    public specularTexture: GPUTexture;

    public sampler: GPUSampler;

    public vertexCount: number;

    public indexCount: number;

    public vbType: ModelVBType;

    public matrixArray: Float32Array;

    public InitModel (type: ModelVBType, mxArray: Float32Array, vxArray: Float32Array, idxArray: Uint32Array, nmArray : Float32Array = new Float32Array(0), uvArray: Float32Array = new Float32Array(0)) {

            this.vbType = type;

            this.matrixArray = mxArray;

            this.vertexArray = vxArray;

            this.indexArray = idxArray;

            this.normalArray = nmArray;

            this.uvArray = uvArray;

            this.vertexCount = vxArray.length / 3;

            this.indexCount = idxArray.length;
    }

    public InitTextures (albedo: GPUTexture, specular: GPUTexture, sampler: GPUSampler) {
        this.albedoTexture = albedo;
        this.specularTexture = specular;
        this.sampler = sampler;
    }

    public InitGPUBuffer (device: GPUDevice, app: App) {

        let vxArray = this.GetVertexInput();

        this.vertexBuffer = createGPUBuffer(device, vxArray, GPUBufferUsage.VERTEX);

        this.indexBuffer = createGPUBuffer(device, this.indexArray, GPUBufferUsage.INDEX);

        this.uniformBuffer = createGPUBuffer(device, this.matrixArray, GPUBufferUsage.UNIFORM);

        this.uniformBindGroup = createBindGroup(
            [
                {buffer: this.uniformBuffer},
                this.sampler,
                this.albedoTexture.createView(),
                this.specularTexture.createView(),
            ],
            app.modelUniformGroupLayout,
            "model",
            device
        );
    }

    public UpdateUniformBuffer (device: GPUDevice, mxArray: Float32Array) {
        // console.log("update uniform buffer");
        updateGPUBuffer(device, mxArray, this.uniformBuffer);
    }

    private GetVertexInput(): any {
        let result;

        switch (this.vbType) {
            case ModelVBType.P:
                result = this.vertexArray;
                // console.log("vertexArray: ", this.vertexArray);
                break;
            case ModelVBType.PN:
                result = new Float32Array(this.vertexArray.length + this.normalArray.length);

                for (let i = 0; i < this.vertexArray.length / 3; i++) {
                    result[6 * i] = this.vertexArray[3 * i];
                    result[6 * i + 1] = this.vertexArray[3 * i + 1];
                    result[6 * i + 2] = this.vertexArray[3 * i + 2];
                    result[6 * i + 3] = this.normalArray[3 * i];
                    result[6 * i + 4] = this.normalArray[3 * i + 1];
                    result[6 * i + 5] = this.normalArray[3 * i + 2];
                }

                break;
            case ModelVBType.PNU:
                result = new Float32Array(this.vertexArray.length + this.normalArray.length + this.uvArray.length);

                for (let i = 0; i < this.vertexArray.length / 3; i++) {
                    result[8 * i] = this.vertexArray[3 * i];
                    result[8 * i + 1] = this.vertexArray[3 * i + 1];
                    result[8 * i + 2] = this.vertexArray[3 * i + 2];
                    result[8 * i + 3] = this.normalArray[3 * i];
                    result[8 * i + 4] = this.normalArray[3 * i + 1];
                    result[8 * i + 5] = this.normalArray[3 * i + 2];
                    result[8 * i + 6] = this.uvArray[2 * i];
                    result[8 * i + 7] = this.uvArray[2 * i + 1];
                }

                break;
            default:
                break;
        }

        return result;
    }
}