import {Matrix4, Vector3} from "three";


export class DirectionalLight {

    public position: Vector3;

    public lookAt: Vector3;

    public color: Vector3;

    public intensity: number;

    public shadow: boolean;

    public constructor(pos: Vector3, lookAt: Vector3, color: Vector3, intensity: number, shadow: boolean) {

        this.position = pos;

        this.lookAt = lookAt;

        this.color = color;

        this.intensity = intensity;

        this.shadow = shadow;
    }

    public updatePosAndDir(position: Vector3, lookAt: Vector3): void {

            this.position = position;

            this.lookAt = lookAt;
    }

    public updateColorAndIntensity(color: Vector3, intensity: number): void {

            this.color = color.normalize();

            this.intensity = intensity;
    }

    public LightSpaceMatrix(): Matrix4 {
        let modelMatrix = new Matrix4().identity();
        let viewMatrix = new Matrix4().lookAt(this.position, this.lookAt, new Vector3(0, 1, 0));
        let projectionMatrix = new Matrix4().makeOrthographic(-10, 10, -10, 10, 0.1, 100);

        return new Matrix4().multiplyMatrices(new Matrix4().multiplyMatrices(projectionMatrix, viewMatrix), modelMatrix);
    }
}