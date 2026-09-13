export type FaceResult={faceScore:number;box:number[];embedding?:number[];real?:number;live?:number;rotation?:{angle?:{yaw:number}}};
type HumanInstance={load:()=>Promise<void>;detect:(v:HTMLVideoElement)=>Promise<{face:FaceResult[]}>};
type HumanLibrary={Human:new(config:Record<string,unknown>)=>HumanInstance};
let loading:Promise<HumanInstance>|undefined;
export async function faceEngine(){
 if(!loading)loading=(async()=>{
  let lib=(window as unknown as {Human?:HumanLibrary}).Human;
  if(!lib){await new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src="/vendor/human/human.js";script.onload=()=>resolve();script.onerror=()=>{script.remove();reject(new Error("Face engine could not load"));};document.head.append(script);});lib=(window as unknown as {Human:HumanLibrary}).Human;}
  const engine=new lib!.Human({backend:"webgl",async:true,warmup:"none",debug:false,cacheSensitivity:0,skipAllowed:false,modelBasePath:"/vendor/human/",filter:{enabled:true,equalization:true},face:{enabled:true,detector:{rotation:true,return:false,maxDetected:2,minConfidence:0.7,minSize:120},mesh:{enabled:true},iris:{enabled:false},emotion:{enabled:false},description:{enabled:false},gear:{enabled:false},mobilefacenet:{enabled:true,modelPath:"/vendor/human/mobileface.json",skipFrames:0,skipTime:0},antispoof:{enabled:true,skipFrames:0,skipTime:0},liveness:{enabled:true,skipFrames:0,skipTime:0}},body:{enabled:false},hand:{enabled:false},gesture:{enabled:false},object:{enabled:false},segmentation:{enabled:false}});
  await engine.load();return engine;
 })().catch(e=>{loading=undefined;throw e;});
 return loading;
}
export async function captureFace(video:HTMLVideoElement){
 if(video.readyState<2||video.videoWidth<160)throw new Error("CAMERA_NOT_READY");
 const result=await(await faceEngine()).detect(video);
 if(result.face.length!==1)throw new Error("ONE_FACE_REQUIRED");
 const face=result.face[0];
 if(face.faceScore<0.7||Math.min(face.box[2],face.box[3])<100||!face.embedding||face.embedding.length!==256||face.embedding.some(v=>!Number.isFinite(v)))throw new Error("FACE_QUALITY");
 if((face.real??0)<0.7||(face.live??0)<0.7)throw new Error("LIVE_FACE_REQUIRED");
 return face.embedding;
}
