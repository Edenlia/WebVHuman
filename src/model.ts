import {TypedArray} from "three";

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

    public vertexCount: number;

    public indexCount: number;

    public vbType: ModelVBType;

    public matrixArray: Float32Array;

    private _CreateGPUBuffer (device: GPUDevice, typedArray: TypedArray, usage: GPUBufferUsageFlags) {

        let gpuBuffer = device.createBuffer({

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

    private _UpdateGPUBuffer (device: GPUDevice, typedArray: TypedArray, gpuBuffer: GPUBuffer) {
        device.queue.writeBuffer(
            gpuBuffer,
            0,
            typedArray.buffer,
            typedArray.byteOffset,
            typedArray.byteLength );
    }

    public InitGPUBuffer (device: GPUDevice) {

        let vxArray = this.GetVertexInput();

        this.vertexBuffer = this._CreateGPUBuffer(device, vxArray, GPUBufferUsage.VERTEX);

        this.indexBuffer = this._CreateGPUBuffer(device, this.indexArray, GPUBufferUsage.INDEX);

        this.uniformBuffer = this._CreateGPUBuffer(device, this.matrixArray, GPUBufferUsage.UNIFORM);

        this.uniformBindGroup = device.createBindGroup({

            layout: device.createBindGroupLayout({

                entries: [{

                    binding: 0,

                    visibility: GPUShaderStage.VERTEX,

                    buffer: {

                        type: 'uniform',

                    }

                }]

            }),

            entries: [{

                binding: 0,

                resource: {

                    buffer: this.uniformBuffer

                }

            }]

        });
    }

    public UpdateUniformBuffer (device: GPUDevice, mxArray: Float32Array) {
        // console.log("update uniform buffer");
        this._UpdateGPUBuffer(device, mxArray, this.uniformBuffer);
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
                    result[6 * i] = this.vertexArray[i];
                    result[6 * i + 1] = this.vertexArray[i + 1];
                    result[6 * i + 2] = this.vertexArray[i + 2];
                    result[6 * i + 3] = this.vertexArray[i];
                    result[6 * i + 4] = this.vertexArray[i + 1];
                    result[6 * i + 5] = this.vertexArray[i + 2];
                }

                break;
            case ModelVBType.PNU:
                result = new Float32Array(this.vertexArray.length + this.normalArray.length + this.uvArray.length);

                for (let i = 0; i < this.vertexArray.length / 3; i++) {
                    result[8 * i] = this.vertexArray[i];
                    result[8 * i + 1] = this.vertexArray[i + 1];
                    result[8 * i + 2] = this.vertexArray[i + 2];
                    result[8 * i + 3] = this.normalArray[i];
                    result[8 * i + 4] = this.normalArray[i + 1];
                    result[8 * i + 5] = this.normalArray[i + 2];
                    result[8 * i + 6] = this.uvArray[i];
                    result[8 * i + 7] = this.uvArray[i + 1];
                }

                break;
            default:
                break;
        }

        return result;
    }
}