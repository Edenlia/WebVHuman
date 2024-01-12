import { App } from './app';
// Using vite import syntax
// https://vitejs.dev/guide/assets.html#explicit-url-imports
// @ts-ignore
import vxCode from './shader/vertex.wgsl?raw';
// @ts-ignore
import fxCode from './shader/fragment.wgsl?raw';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

import { PerspectiveCamera, Matrix4, Vector3 } from 'three';
import {DirectionalLight} from "./light";


const modelVertices = [] as Float32Array[];
const modelIndices = [] as Uint32Array[];
const modelNormals = [] as Float32Array[];
const modelUvs = [] as Float32Array[];

let loadModel = async () => {

        let loader = new OBJLoader();

        let object = await loader.loadAsync( "./models/Emily/Emily_2_1.obj")

        for (let i = 0; i < object.children.length; i++) {

            let child = object.children[i];
            // @ts-ignore
            modelVertices.push( child.geometry.attributes.position.array as Float32Array );
            modelIndices.push( Uint32Array.from({length: modelVertices[i].length / 3}, (_, index) => { return index;}))
            // @ts-ignore
            modelNormals.push( child.geometry.attributes.normal.array as Float32Array );
            // @ts-ignore
            modelUvs.push( child.geometry.attributes.uv.array as Float32Array );
        }

        console.log(object);
}

let main = async () => {

    await loadModel();

    let camera = new PerspectiveCamera( 90, document.body.clientWidth / document.body.clientHeight, 0.1, 100 );

    camera.position.set( 0, 0, 30 );

    camera.updateMatrixWorld( true);
    let backgroundColor = { r: 0, g: 0, b: 0, a: 1.0 };

    let mainLight = new DirectionalLight(new Vector3(0, 1, 1), new Vector3(0, 0, 0), new Vector3(1, 1, 1), 1.2, false);

    let app = new App(camera, mainLight);

    app.CreateCanvas( document.body );

    await app.InitWebGPU();

    await app.LoadTextures();

    app.InitBuffers();

    app.InitPipeline( vxCode, fxCode );

    let lastTime = 0, rotationSpeed = 0.001;
    let modelMMatrix = new Matrix4()

    for (let i = 0; i < modelVertices.length; i++) {

        // console.log("modelVertices ", i, ": ", modelVertices[i]);
        // console.log("modelIndices ", i, ": ", modelIndices[i]);

        let modelUniformBufferView = new Float32Array( modelMMatrix.toArray() );

        app.UploadModel( modelVertices[i], modelIndices[i], modelNormals[i], modelUvs[i], modelUniformBufferView );
    }

    app.RunRenderLoop(() => {

        let timeNow = performance.now();
        let elapsed = 0;
        if ( lastTime != 0 ) {

            elapsed = timeNow - lastTime;
        }
        lastTime = timeNow;

        modelMMatrix = new Matrix4().multiplyMatrices(new Matrix4().makeRotationY(rotationSpeed * elapsed), modelMMatrix);

        let modelUniformBufferView = new Float32Array( modelMMatrix.toArray() );

        // app.RotateCamera(elapsed);

        // app.RotateLight(elapsed);

        // for (let i = 0; i < modelVertices.length; i++) {
        //     app.UpdateModelUniformBuffer(i,  modelUniformBufferView);
        // }

        app.Draw(backgroundColor);
    })
}

window.addEventListener( 'DOMContentLoaded', main );