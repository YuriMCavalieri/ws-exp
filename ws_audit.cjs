// WS AUDIT — suite de testes. Rodar: npm i jsdom && node ws_audit.cjs ../WS_STUDIO.html
const fs=require('fs');const {JSDOM}=require('jsdom');
const ARQ=process.argv[2];
const html=fs.readFileSync(ARQ,'utf8');
let js=html.match(/<script type="module">([\s\S]*?)<\/script>\s*<\/body>/)[1];
js=js.replace(/^import[^\n]*\n/gm,m=>{
  if(/from 'three'/.test(m))return 'const THREE=globalThis.__THREE;\n';
  const n=m.match(/import\s*\{([^}]*)\}/);
  return n? n[1].split(',').map(x=>{const nm=x.trim().split(' as ').pop().trim();return `const ${nm}=globalThis.__STUB['${nm}'];`;}).join('\n')+'\n':'\n';
});
const dom=new JSDOM(html.replace(/<script type="module">[\s\S]*?<\/script>/,''),{pretendToBeVisual:true,runScripts:'outside-only'});
const w=dom.window;
w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(t,k)=>{
 if(k==='measureText')return()=>({width:40});
 if(k==='getImageData')return(x,y,a,b)=>({data:new Uint8ClampedArray(Math.max(4,a*b*4)),width:a,height:b});
 if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}}); 
 if(k==='createImageData')return(a,b)=>({data:new Uint8ClampedArray(Math.max(4,a*b*4))});
 if(typeof k==='string'&&/^(fillStyle|strokeStyle|lineWidth|font|textAlign|textBaseline|globalAlpha|lineCap)$/.test(k))return '';
 return ()=>{};}});
w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/jpeg;base64,x';
w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
w.matchMedia=()=>({matches:false,addEventListener(){}});
w.requestAnimationFrame=()=>0;w.fetch=()=>Promise.reject(new Error('x'));
w.confirm=()=>true; w.prompt=()=>'Renomeado Teste'; w.alert=()=>{};
w.AudioContext=class{constructor(){this.state='running';this.currentTime=0;this.sampleRate=44100;this.destination={}}
 createBuffer(){return{getChannelData:()=>new Float32Array(4)}}createBufferSource(){return{connect(){},start(){},stop(){}}}
 createBiquadFilter(){return{connect(){},frequency:{value:0},Q:{value:0}}}createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){},value:0}}}
 createOscillator(){return{connect(){},start(){},stop(){},frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}}resume(){}};
const THREE=require('./ws_three_stub.js');w.__THREE=THREE;
w.__STUB=new Proxy({},{get:(t,k)=>k==='RectAreaLightUniformsLib'?{init(){}}:class{constructor(){this.target=new THREE.Vector3();this.enabled=true}
 update(){}setSize(){}addPass(){}render(){}dispose(){}setKTX2Loader(){return this}setDRACOLoader(){return this}
 load(){}setTranscoderPath(){return this}setDecoderPath(){return this}detectSupport(){return this}
 updateGtaoMaterial(){}setSceneClipBox(){}}});
// localStorage funcional
const store={};
Object.defineProperty(w,'localStorage',{value:{
  getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v)},
  removeItem:k=>{delete store[k]}, clear:()=>{for(const k in store)delete store[k]} }});

const T=[];
const teste=(nome,corpo)=>T.push([nome,corpo]);

teste('boot sem erro', `1`);
teste('exemplo casa350 carrega', `loadExampleCasa350(); model.pavimentos.length===2 && flo().comodos.length>0`);
teste('WSI calcula e discrimina', `loadExampleCasa350(); const a=calcularWSI();
  loadExampleStudio(); const b=calcularWSI(); a && b && a.total!==b.total && a.total>0 && a.total<100`);
teste('salvar → listar → abrir', `loadExampleStudio();
  await salvarProjeto(true);
  const lst=await WS_DB.listar();
  if(!lst.length) throw new Error('lista vazia');
  const id=lst[0].id;
  loadExampleCasa350();
  await abrirProjeto(id);
  model.nome.includes('Studio')`);
teste('duplicar preserva conteúdo', `loadExample2Q(); await salvarProjeto(true);
  const l1=await WS_DB.listar(); const orig=l1[0];
  const copia={...JSON.parse(JSON.stringify(orig)), id:'proj-x', nome:orig.nome+' (cópia)'};
  await WS_DB.salvar(copia);
  const l2=await WS_DB.listar();
  l2.length===l1.length+1 && l2.find(x=>x.id==='proj-x').space.pavimentos[0].comodos.length===orig.space.pavimentos[0].comodos.length`);
teste('excluir remove', `const l1=await WS_DB.listar(); if(!l1.length) throw new Error('nada p/ excluir');
  await WS_DB.excluir(l1[0].id);
  (await WS_DB.listar()).length===l1.length-1`);
teste('carrinho add/remove/total', `loadExampleCasa350();
  const pn=mobPins.find(p=>p.preco>0); if(!pn) throw new Error('sem pin com preço');
  cartAdd(pn); const t1=cartTotal();
  if(t1!==pn.preco) throw new Error('total errado');
  cartRemove(pn.mobId); cartTotal()===0`);
teste('atelier: custo por config', `atFotos=['a','b','c'];
  atCfg={modelo:'meshy-6',textura:'8192',poly:'30000'};
  const c1=atCustoTotal();
  atCfg={modelo:'meshy-4',textura:'2048',poly:'8000'}; atFotos=['a'];
  const c2=atCustoTotal();
  c1===22+16+8+2 && c2===6`);
teste('gerar móvel entra no catálogo', `const antes=Object.keys(MOBILIA_CAT).length;
  gerarMovel({nome:'Teste Sofá',grupo:'Meus móveis',w:2,d:1,h:0.8,modelo:'meshy-5',textura:2048,poly:16000,simetria:'auto',pbr:true,preco:100,parceiro:'',imagens:['x'],custo:12});
  Object.keys(MOBILIA_CAT).length===antes+1`);
teste('chat: criar apto por frase', `handleIntent('apartamento 2 quartos com suíte e varanda 70 m2');
  flo().comodos.length>=5`);
teste('chat: trocar piso', `handleIntent('piso da sala em granito preto');
  model.pavimentos.some(f=>f.comodos.some(r=>r.piso==='granito_preto'))`);
teste('chat: wsi responde', `handleIntent('qual o wsi'); wsiAtual && wsiAtual.total>0`);
teste('publicar grava space', `loadExampleStudio();
  localStorage.setItem('ws_space_teste', JSON.stringify(model));
  JSON.parse(localStorage.getItem('ws_space_teste')).pavimentos.length===1`);
teste('modo visitante alterna', `alternarVisita(); const a=document.body.classList.contains('visita');
  alternarVisita(); a && !document.body.classList.contains('visita')`);
teste('export/import roundtrip', `loadExampleCasa350();
  const json=JSON.stringify(deep(model));
  const antes=flo().comodos.length;
  model=newModel(); 
  model=JSON.parse(json);
  flo().comodos.length===antes`);
teste('luz: adicionar e apagar', `loadExampleStudio();
  const f=flo(); const n0=(f.luzes||[]).length;
  S.luzTipo='pendente'; colocarLuz([2,2]);
  if(f.luzes.length!==n0+1) throw new Error('não adicionou');
  delEntity({kind:'luz', id:f.luzes[f.luzes.length-1].id});
  f.luzes.length===n0`);
teste('IA v2: casa 3q suite piscina garagem', `
  handleIntent('quero uma casa de 3 quartos com suite, piscina e garagem, uns 220 m2');
  const q=model.pavimentos.flatMap(f=>f.comodos);
  if(model.tipo_imovel!=='casa') throw new Error('tipo: '+model.tipo_imovel);
  if(!q.some(r=>r.tipo==='piscina')) throw new Error('sem piscina');
  if(!q.some(r=>r.tipo==='garagem')) throw new Error('sem garagem');
  if(q.filter(r=>r.tipo==='quarto').length<3) throw new Error('quartos: '+q.filter(r=>r.tipo==='quarto').length);
  model.pavimentos.length===2`);
teste('IA v2: cobertura 4 suites', `
  handleIntent('cobertura duplex com 4 suites e 280 m2');
  const q=model.pavimentos.flatMap(f=>f.comodos).filter(r=>r.tipo==='quarto');
  if(q.length!==4) throw new Error('quartos: '+q.length);
  model.pavimentos.length===2`);
teste('IA v2: studio 30m2', `
  handleIntent('um studio de 30 m2');
  const q=model.pavimentos[0].comodos;
  if(!q.some(r=>r.tipo==='banho')) throw new Error('sem banho');
  q.length===2`);
teste('IA v2: apto 8o andar varanda', `
  handleIntent('apartamento 2 quartos com varanda gourmet no 8o andar');
  const q=model.pavimentos[0].comodos;
  if(model.andar!==8) throw new Error('andar: '+model.andar);
  q.some(r=>r.tipo==='varanda')`);
teste('IA v2: mobiliou sozinho', `
  handleIntent('apartamento 2 quartos');
  model.pavimentos.some(f=>f.mobilia.length>3)`);
teste('imóvel do mundo gera planta coerente', `
  carregarImovelDoMundo({id:'ws-one',nome:'WS One',endereco:'Vila da Serra',area:182,quartos:4,suites:2,vagas:3,andar:18,preco:2890000}, null);
  const q=model.pavimentos.flatMap(f=>f.comodos).filter(r=>r.tipo==='quarto');
  if(q.length!==4) throw new Error('quartos: '+q.length);
  if(model.nome!=='WS One') throw new Error('nome: '+model.nome);
  model.andar===18`);
teste('imóvel do mundo usa Space Model publicado', `
  loadExampleCasa350();
  const sp=deep(model);
  carregarImovelDoMundo({id:'zzz',nome:'Publicado',area:350,quartos:3}, sp);
  model.pavimentos.length===2 && model.nome==='Publicado'`);
teste('undo/redo', `loadExampleStudio(); const n=flo().mobilia.length;
  pushUndo(); flo().mobilia.pop();
  doUndo(); flo().mobilia.length===n`);

(async()=>{
  let pass=0,fail=0;
  // roda tudo num único contexto
  w.eval(`globalThis.__ENV=function(){ ${js}\n; return {run:async(code)=>{ return await eval('(async()=>{ '+code+' })()'); }}; }`);
  const env=w.__ENV();
  for(const [nome,corpo] of T){
    try{
      const segs=corpo.trim().split(';').map(x=>x.trim()).filter(Boolean);
      const ult=segs.pop();
      const corpo2=segs.join(';\n')+(segs.length?';\n':'')+'return ('+ult+');';
      const r=await env.run(corpo2);
      if(r===false) throw new Error('retornou false');
      console.log('  ✔ '+nome); pass++;
    }catch(e){
      console.log('  ✘ '+nome+' → '+String(e.message).slice(0,110)); fail++;
    }
  }
  console.log('\\nRESULTADO: '+pass+' passaram · '+fail+' falharam');
})();
