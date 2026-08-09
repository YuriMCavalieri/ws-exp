const V3=class{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}
 set(x,y,z){this.x=x;this.y=y;this.z=z;return this}copy(v){return this.set(v.x,v.y,v.z)}
 clone(){return new V3(this.x,this.y,this.z)}add(){return this}addScaledVector(){return this}
 sub(){return this}lerp(){return this}lerpVectors(){return this}normalize(){return this}
 length(){return 1}distanceTo(){return 1}setScalar(){return this}setY(y){this.y=y;return this}
 multiplyScalar(){return this}crossVectors(){return this}project(){return this}applyAxisAngle(){return this}
 getSize(v){return v||new V3(1,1,1)}getPoint(){return new V3()}};
const Obj=class{constructor(){this.children=[];this.position=new V3();this.rotation={x:0,y:0,z:0,set(){},copy(){}};
 this.scale=new V3(1,1,1);this.userData={};this.material=null;this.geometry=null;this.visible=true;this.parent=null}
 add(...o){for(const c of o){if(c){this.children.push(c);c.parent=this}}return this}
 remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1);return this}
 clear(){this.children=[];return this}traverse(f){f(this);for(const c of this.children)c.traverse&&c.traverse(f)}
 lookAt(){}updateMatrixWorld(){}clone(){const o=new Obj();o.children=this.children.slice();return o}
 setPointerCapture(){}getWorldDirection(v){return v||new V3()}};
const Mat=class{constructor(p={}){Object.assign(this,p);this.userData=this.userData||{};
 this.color={setHex(){},copy(){},set(){},setStyle(){},getStyle:()=>'#fff',offsetHSL(){},setHSL(){},clone(){return this}};
 this.emissiveIntensity=0;this.opacity=1}
 clone(){const m=new Mat(this);m.userData={};return m}dispose(){}};
const Geo=class{constructor(){this.attributes={position:{count:0,getX:()=>0,getY:()=>0,getZ:()=>0,setXYZ(){},setZ(){},array:new Float32Array(12)},uv:{array:new Float32Array(8)}};this.index={array:[0,1,2]}}
 rotateX(){return this}rotateY(){return this}translate(){return this}computeVertexNormals(){}dispose(){}
 clone(){return new Geo()}setAttribute(){}setIndex(){}};
const T={
 Vector2:class{constructor(x=0,y=0){this.x=x;this.y=y}set(){return this}},
 Vector3:V3, Object3D:Obj, Group:Obj,
 Mesh:class extends Obj{constructor(g,m){super();this.geometry=g||new Geo();this.material=m||new Mat();this.isMesh=true}},
 InstancedMesh:class extends Obj{constructor(g,m,n){super();this.geometry=g;this.material=m;this.count=n}
   setMatrixAt(){}setColorAt(){}},
 Sprite:class extends Obj{constructor(m){super();this.material=m||new Mat()}},
 Points:class extends Obj{},
 BoxGeometry:Geo,PlaneGeometry:Geo,CircleGeometry:Geo,SphereGeometry:Geo,CylinderGeometry:Geo,
 ConeGeometry:Geo,RingGeometry:Geo,ShapeGeometry:Geo,ExtrudeGeometry:Geo,IcosahedronGeometry:Geo,
 TubeGeometry:Geo,BufferGeometry:Geo,OctahedronGeometry:Geo,
 MeshBasicMaterial:Mat,MeshStandardMaterial:Mat,MeshPhysicalMaterial:Mat,MeshLambertMaterial:Mat,
 SpriteMaterial:Mat,ShaderMaterial:Mat,
 Shape:class{constructor(){}absarc(){}moveTo(){}lineTo(){}},
 Color:class{constructor(){}setHex(){return this}copy(){return this}set(){return this}
   getStyle(){return '#fff'}lerp(){return this}multiplyScalar(){return this}clone(){return this}
   offsetHSL(){return this}setHSL(){return this}},
 Box3:class{constructor(a,b){this.min=a||new V3();this.max=b||new V3()}
   setFromObject(){return this}getSize(v){return v||new V3(1,1,1)}intersectsBox(){return false}},
 Matrix4:class{compose(){return this}},Quaternion:class{setFromAxisAngle(){return this}setFromEuler(){return this}},
 Euler:class{constructor(){}},Spherical:class{},
 Scene:class extends Obj{constructor(){super();this.background=null;this.fog=null;this.environment=null}},
 PerspectiveCamera:class extends Obj{constructor(){super();this.fov=50;this.aspect=1}updateProjectionMatrix(){}},
 OrthographicCamera:class extends Obj{updateProjectionMatrix(){}},
 DirectionalLight:class extends Obj{constructor(){super();this.shadow={mapSize:{set(){}},camera:{updateProjectionMatrix(){}}};this.target=new Obj();this.color={setHex(){},copy(){}};this.intensity=1}},
 HemisphereLight:class extends Obj{constructor(){super();this.color={setHex(){},copy(){}};this.groundColor={setHex(){}};this.intensity=1}},
 PointLight:class extends Obj{constructor(){super();this.intensity=0}},
 SpotLight:class extends Obj{constructor(){super();this.intensity=0;this.target=new Obj()}},
 RectAreaLight:class extends Obj{},AmbientLight:class extends Obj{},
 WebGLRenderer:class{constructor(){this.shadowMap={enabled:false,type:0,autoUpdate:false,needsUpdate:false};
   this.capabilities={getMaxAnisotropy:()=>8};this.domElement={addEventListener(){},getBoundingClientRect:()=>({width:800,height:600,left:0,top:0})};
   this.xr={enabled:false}}
   setPixelRatio(){}setSize(){}render(){}setClearColor(){}dispose(){}},
 WebGLRenderTarget:class{constructor(){this.texture={}}dispose(){}setSize(){}},
 PMREMGenerator:class{constructor(){}fromScene(){return{texture:{}}}fromEquirectangular(){return{texture:{},dispose(){}}}},
 CanvasTexture:class{constructor(img){this.image=img;this.repeat={set(){}};this.offset={x:0,y:0};this.wrapS=0;this.wrapT=0}
   dispose(){}clone(){return new T.CanvasTexture(this.image)}},
 Data3DTexture:class{constructor(){this.needsUpdate=false}},
 BufferAttribute:class{constructor(){}},InstancedBufferAttribute:class{constructor(){}},
 Raycaster:class{constructor(){this.far=0}setFromCamera(){}set(){}intersectObject(){return[]}intersectObjects(){return[]}},
 CatmullRomCurve3:class{constructor(){}getPoint(){return new V3()}},
 Fog:class{constructor(c){this.color={copy(){}}}},
 MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),smoothstep:()=>0.5,degToRad:d=>d*Math.PI/180},
 SRGBColorSpace:'srgb',LinearFilter:1,ClampToEdgeWrapping:2,RepeatWrapping:3,DoubleSide:2,BackSide:1,
 FrontSide:0,ACESFilmicToneMapping:4,PCFSoftShadowMap:2,EquirectangularReflectionMapping:303,
 RGBAFormat:1023,UnsignedByteType:1009,HalfFloatType:1016,AdditiveBlending:2,
};
module.exports=T; module.exports.default=T;
Object.keys(T).forEach(k=>{module.exports[k]=T[k]});
