(async()=>{
  const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js/+esm');
  const {OrbitControls}=await import('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js/+esm');
  const {TransformControls}=await import('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/TransformControls.js/+esm');

  const PARTS={
    cmu:{label:'Cinder block',dims:[16,8,8],color:0x9b9b9b},
    firebrick:{label:'Firebrick',dims:[9,4.5,2.5],color:0xe0ad3d},
    lid:{label:'Lid',dims:[25.5,19.5,5.5],color:0x34383d}
  };

  const canvas=document.getElementById('view');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.outputColorSpace=THREE.SRGBColorSpace;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xdfe3e8);
  const camera=new THREE.PerspectiveCamera(45,2,0.1,2000);
  camera.position.set(70,-90,65);

  const orbit=new OrbitControls(camera,canvas);
  orbit.target.set(0,0,12);
  orbit.enableDamping=true;
  orbit.touches.ONE=THREE.TOUCH.ROTATE;
  orbit.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;

  scene.add(new THREE.HemisphereLight(0xffffff,0xb7bcc3,3));
  const sun=new THREE.DirectionalLight(0xffffff,3);
  sun.position.set(50,-40,90);
  sun.castShadow=true;
  scene.add(sun);

  const grid=new THREE.GridHelper(160,320,0x6f7882,0xaeb5bd);
  grid.rotation.x=Math.PI/2;
  grid.position.z=0.002;
  scene.add(grid);
  scene.add(new THREE.AxesHelper(12));

  const workspace=new THREE.Group();
  workspace.name='Workspace';
  scene.add(workspace);

  const transform=new TransformControls(camera,renderer.domElement);
  transform.setMode('translate');
  transform.setTranslationSnap(0.5);
  transform.setRotationSnap(THREE.MathUtils.degToRad(15));
  scene.add(transform.getHelper());
  transform.addEventListener('dragging-changed',e=>orbit.enabled=!e.value);

  let serial=1;
  let selected=null;
  let selectionOutline=null;

  function edgeify(mesh,color=0x33363a){
    const edges=new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry,25),
      new THREE.LineBasicMaterial({color})
    );
    mesh.add(edges);
    return mesh;
  }

  function box(w,d,h,material,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,d,h),material);
    mesh.position.set(x,y,z);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    return edgeify(mesh);
  }

  function makeCmu(){
    const g=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({color:PARTS.cmu.color,roughness:.88});
    const L=16,D=8,H=8,s=1.25,web=1.25;
    g.add(box(L,s,H,mat,0,-(D-s)/2,0));
    g.add(box(L,s,H,mat,0,(D-s)/2,0));
    g.add(box(s,D-2*s,H,mat,-(L-s)/2,0,0));
    g.add(box(s,D-2*s,H,mat,(L-s)/2,0,0));
    g.add(box(web,D-2*s,H,mat,0,0,0));
    return finishPart(g,'cmu');
  }

  function makeFirebrick(){
    const g=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({color:PARTS.firebrick.color,roughness:.8});
    g.add(box(9,4.5,2.5,mat));
    return finishPart(g,'firebrick');
  }

  function makeLid(){
    const g=new THREE.Group();
    const hood=new THREE.MeshStandardMaterial({color:PARTS.lid.color,roughness:.38,metalness:.22});
    const metal=new THREE.MeshStandardMaterial({color:0xa8afb6,roughness:.24,metalness:.75});
    g.add(box(25.5,19.5,5.5,hood,0,0,2.75));
    g.add(box(10,.65,.65,metal,0,-11,6.25));
    g.add(box(.65,.65,2.2,metal,-4.5,-11,5.25));
    g.add(box(.65,.65,2.2,metal,4.5,-11,5.25));
    const hingeGeo=new THREE.CylinderGeometry(.35,.35,18,24);
    hingeGeo.rotateZ(Math.PI/2);
    const hinge=edgeify(new THREE.Mesh(hingeGeo,metal));
    hinge.position.set(0,9.75,.4);
    g.add(hinge);
    return finishPart(g,'lid');
  }

  function finishPart(group,type){
    const def=PARTS[type];
    group.userData={isPart:true,type,id:serial++,dims:def.dims.slice()};
    group.name=`${def.label} ${group.userData.id}`;
    group.traverse(o=>o.userData.root=group);
    return group;
  }

  function createPart(type){
    if(type==='cmu')return makeCmu();
    if(type==='firebrick')return makeFirebrick();
    return makeLid();
  }

  function addPart(type){
    const o=createPart(type);
    const [w,d,h]=PARTS[type].dims;
    const n=workspace.children.length;
    o.position.set((n%5)*12-24,Math.floor(n/5)*12,h/2);
    workspace.add(o);
    select(o);
  }

  function destroyOutline(){
    if(!selectionOutline)return;
    if(selectionOutline.parent)selectionOutline.parent.remove(selectionOutline);
    selectionOutline.geometry?.dispose?.();
    selectionOutline.material?.dispose?.();
    selectionOutline=null;
  }

  function select(o){
    selected=o||null;
    transform.detach();
    destroyOutline();
    const info=document.getElementById('selectionInfo');
    if(!selected){
      info.textContent='Nothing selected.';
      return;
    }
    transform.attach(selected);
    const [w,d,h]=selected.userData.dims;
    const geo=new THREE.EdgesGeometry(new THREE.BoxGeometry(w,d,h));
    const mat=new THREE.LineBasicMaterial({color:0x005ee8,depthTest:false});
    selectionOutline=new THREE.LineSegments(geo,mat);
    selectionOutline.renderOrder=999;
    selected.add(selectionOutline);
    const p=selected.position;
    info.textContent=`${selected.name} · ${w} × ${d} × ${h} in · X ${p.x.toFixed(1)} Y ${p.y.toFixed(1)} Z ${p.z.toFixed(1)}`;
  }

  function duplicate(){
    if(!selected)return;
    const source=selected;
    const copy=createPart(source.userData.type);
    copy.position.copy(source.position).add(new THREE.Vector3(.5,.5,.5));
    copy.quaternion.copy(source.quaternion);
    workspace.add(copy);
    select(copy);
  }

  function removeSelected(){
    if(!selected)return;
    const doomed=selected;
    select(null);
    workspace.remove(doomed);
  }

  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  canvas.addEventListener('pointerdown',e=>{
    if(transform.dragging)return;
    const r=canvas.getBoundingClientRect();
    pointer.x=((e.clientX-r.left)/r.width)*2-1;
    pointer.y=-((e.clientY-r.top)/r.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(workspace.children,true);
    if(hits.length)select(hits[0].object.userData.root);
  });

  function setMode(mode){
    transform.setMode(mode);
    document.getElementById('moveMode').classList.toggle('active',mode==='translate');
    document.getElementById('rotateMode').classList.toggle('active',mode==='rotate');
  }

  function setView(kind){
    const t=orbit.target.clone();
    camera.up.set(0,0,1);
    if(kind==='top')camera.position.copy(t.clone().add(new THREE.Vector3(0,0,100)));
    if(kind==='front')camera.position.copy(t.clone().add(new THREE.Vector3(0,-100,0)));
    if(kind==='iso')camera.position.copy(t.clone().add(new THREE.Vector3(65,-65,55)));
    orbit.update();
  }

  function frameAll(){
    if(!workspace.children.length)return;
    destroyOutline();
    const bounds=new THREE.Box3().setFromObject(workspace);
    const center=bounds.getCenter(new THREE.Vector3());
    const distance=Math.max(35,bounds.getSize(new THREE.Vector3()).length()*1.2);
    orbit.target.copy(center);
    camera.position.copy(center.clone().add(new THREE.Vector3(distance,-distance,distance*.75)));
    orbit.update();
    if(selected)select(selected);
  }

  document.getElementById('addCmu').addEventListener('click',()=>addPart('cmu'));
  document.getElementById('addFirebrick').addEventListener('click',()=>addPart('firebrick'));
  document.getElementById('addLid').addEventListener('click',()=>addPart('lid'));
  document.getElementById('moveMode').addEventListener('click',()=>setMode('translate'));
  document.getElementById('rotateMode').addEventListener('click',()=>setMode('rotate'));
  document.getElementById('duplicate').addEventListener('click',duplicate);
  document.getElementById('deletePart').addEventListener('click',removeSelected);
  document.getElementById('topView').addEventListener('click',()=>setView('top'));
  document.getElementById('frontView').addEventListener('click',()=>setView('front'));
  document.getElementById('isoView').addEventListener('click',()=>setView('iso'));
  document.getElementById('frameAll').addEventListener('click',frameAll);
  document.getElementById('settingsButton').addEventListener('click',()=>document.getElementById('settingsPanel').classList.toggle('hidden'));
  document.getElementById('closeSettings').addEventListener('click',()=>document.getElementById('settingsPanel').classList.add('hidden'));
  document.getElementById('translationSnap').addEventListener('change',e=>transform.setTranslationSnap(e.target.checked?.5:null));
  document.getElementById('rotationSnap').addEventListener('change',e=>transform.setRotationSnap(THREE.MathUtils.degToRad(Number(e.target.value)||15)));

  transform.addEventListener('objectChange',()=>{
    if(!selected)return;
    const p=selected.position;
    document.getElementById('selectionInfo').textContent=`${selected.name} · X ${p.x.toFixed(1)} Y ${p.y.toFixed(1)} Z ${p.z.toFixed(1)}`;
  });

  addPart('cmu');
  addPart('firebrick');
  addPart('lid');
  select(null);

  function resize(){
    const r=canvas.getBoundingClientRect();
    const w=Math.max(1,Math.floor(r.width));
    const h=Math.max(1,Math.floor(r.height));
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  }
  function loop(){resize();orbit.update();renderer.render(scene,camera);requestAnimationFrame(loop)}
  loop();
})();
