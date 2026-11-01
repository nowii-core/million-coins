
'use strict';
(()=>{
/* =====================================================================
   MILLION COINS — a zero-dependency first-person WebGL2 game
   ===================================================================== */
const $=id=>document.getElementById(id);
const canvas=$('gl');
const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});
if(!gl){$('loading').textContent='This game needs WebGL2. Please use a recent Chrome, Edge, Firefox or Safari.';return;}
const touch=('ontouchstart' in window)||navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches;
if(touch)document.body.classList.add('touch');
const Q=new URLSearchParams(location.search);
const DEBUG=Q.has('debug');

/* ------------------------------ math ------------------------------ */
const TAU=Math.PI*2,clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const M={
  id(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);},
  persp(f,a,n,fa){const t=1/Math.tan(f/2),o=new Float32Array(16);o[0]=t/a;o[5]=t;o[10]=(fa+n)/(n-fa);o[11]=-1;o[14]=2*fa*n/(n-fa);return o;},
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
  basis(r,u,z,p,s=1){return new Float32Array([r[0]*s,r[1]*s,r[2]*s,0,u[0]*s,u[1]*s,u[2]*s,0,z[0]*s,z[1]*s,z[2]*s,0,p[0],p[1],p[2],1]);},
  view(r,u,f,p){const d=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    return new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-d(r,p),-d(u,p),d(f,p),1]);},
  rotX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);},
  rotY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);},
  rotZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);},
  trans(x,y,z){const m=M.id();m[12]=x;m[13]=y;m[14]=z;return m;},
  scale(s){const m=M.id();m[0]=m[5]=m[10]=s;return m;},
  pt(m,x,y,z){return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
};
const v3={
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]),
  norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];}
};
let _seed=1337;function rnd(){_seed^=_seed<<13;_seed^=_seed>>>17;_seed^=_seed<<5;return(_seed>>>0)/4294967296;}
function hash2(x,y){let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return lerp(lerp(hash2(xi,yi),hash2(xi+1,yi),u),lerp(hash2(xi,yi+1),hash2(xi+1,yi+1),u),v);}
function fmt(n){return Math.floor(n).toLocaleString('en-US');}

/* ------------------------------ GL helpers ------------------------------ */
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);console.error(log+'\n'+src.split('\n').map((l,i)=>(i+1)+': '+l).join('\n'));throw new Error('Shader error: '+log);}return s;}
function program(vs,fs){const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Link error: '+gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){const inf=gl.getActiveUniform(p,i);u[inf.name.replace(/\[0\]$/,'')]=gl.getUniformLocation(p,inf.name);}
  return{p,u};}
const extCBF=gl.getExtension('EXT_color_buffer_float');
const extAniso=gl.getExtension('EXT_texture_filter_anisotropic');

/* ------------------------------ procedural textures ------------------------------ */
function mkCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function speckle(ctx,w,h,n,a,dark=true){for(let i=0;i<n;i++){const v=dark?Math.random()*60:150+Math.random()*100;ctx.fillStyle=`rgba(${v},${v*.8},${v*.5},${a})`;ctx.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*3,1+Math.random()*3);}}
function texBrick(){const c=mkCanvas(512,512),x=c.getContext('2d');x.fillStyle='#8a6a40';x.fillRect(0,0,512,512);
  const bh=32,bw=96;for(let r=0;r<16;r++){const off=(r%2)*bw/2;for(let i=-1;i<7;i++){const bx=i*bw+off,by=r*bh;
    const j=Math.random()*26-13;x.fillStyle=`rgb(${214+j|0},${164+j|0},${102+j*.8|0})`;x.fillRect(bx+2,by+2,bw-4,bh-4);
    const g=x.createLinearGradient(0,by,0,by+bh);g.addColorStop(0,'rgba(255,240,200,.28)');g.addColorStop(.5,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(60,30,0,.28)');x.fillStyle=g;x.fillRect(bx+2,by+2,bw-4,bh-4);}}
  speckle(x,512,512,2600,.25);return c;}
function texFloor(){const c=mkCanvas(512,512),x=c.getContext('2d');
  for(let ty=0;ty<2;ty++)for(let tx=0;tx<2;tx++){const j=Math.random()*16-8;x.fillStyle=`rgb(${196+j|0},${164+j|0},${112+j|0})`;x.fillRect(tx*256,ty*256,256,256);
    const g=x.createRadialGradient(tx*256+128,ty*256+128,20,tx*256+128,ty*256+128,190);g.addColorStop(0,'rgba(255,235,190,.18)');g.addColorStop(1,'rgba(70,40,10,.25)');x.fillStyle=g;x.fillRect(tx*256,ty*256,256,256);
    x.fillStyle='rgba(80,52,22,.55)';for(const[ox,oy]of[[22,22],[234,22],[22,234],[234,234]]){x.beginPath();x.ellipse(tx*256+ox,ty*256+oy,9,6,0,0,TAU);x.fill();}
    x.fillStyle='rgba(255,230,180,.35)';for(const[ox,oy]of[[22,20],[234,20],[22,232],[234,232]]){x.beginPath();x.ellipse(tx*256+ox,ty*256+oy,6,3,0,0,TAU);x.fill();}}
  x.strokeStyle='rgba(70,42,16,.8)';x.lineWidth=5;x.strokeRect(2,2,252,252);x.strokeRect(256+2,2,252,252);x.strokeRect(2,258,252,252);x.strokeRect(258,258,252,252);
  speckle(x,512,512,3200,.22);return c;}
function texSteel(){const c=mkCanvas(512,512),x=c.getContext('2d');x.fillStyle='#2f3d66';x.fillRect(0,0,512,512);
  for(let i=0;i<512;i+=2){x.fillStyle=`rgba(${120+Math.random()*80|0},${140+Math.random()*80|0},${200},${.04+Math.random()*.08})`;x.fillRect(i,0,1,512);}
  x.fillStyle='rgba(20,28,50,.6)';for(let i=0;i<4;i++)x.fillRect(0,i*128+60,512,3);speckle(x,512,512,1500,.18);return c;}
function texConcrete(){const c=mkCanvas(512,512),x=c.getContext('2d');x.fillStyle='#8c7a66';x.fillRect(0,0,512,512);
  for(let i=0;i<6000;i++){const v=90+Math.random()*80;x.fillStyle=`rgba(${v},${v*.88},${v*.7},.35)`;x.fillRect(Math.random()*512,Math.random()*512,2+Math.random()*5,2+Math.random()*5);}
  x.strokeStyle='rgba(40,28,16,.5)';x.lineWidth=3;x.strokeRect(0,0,512,512);return c;}
function texWood(){const c=mkCanvas(512,512),x=c.getContext('2d');x.fillStyle='#7a4c25';x.fillRect(0,0,512,512);
  for(let i=0;i<512;i+=3){const w=Math.sin(i*.07)*10;x.fillStyle=`rgba(${50+Math.random()*60|0},${25+Math.random()*30|0},10,.35)`;x.fillRect(i+w,0,2,512);}
  speckle(x,512,512,800,.2);return c;}
function texPlain(){const c=mkCanvas(512,512),x=c.getContext('2d');x.fillStyle='#e6e0d2';x.fillRect(0,0,512,512);speckle(x,512,512,900,.1);return c;}
const texArr=gl.createTexture();
(function(){const layers=[texBrick(),texFloor(),texSteel(),texConcrete(),texWood(),texPlain()];
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,texArr);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,10,gl.RGBA8,512,512,layers.length);
  layers.forEach((c,i)=>gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,512,512,1,gl.RGBA,gl.UNSIGNED_BYTE,c));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  if(extAniso)gl.texParameterf(gl.TEXTURE_2D_ARRAY,extAniso.TEXTURE_MAX_ANISOTROPY_EXT,8);})();

/* coin face: albedo + normal map from an embossed height field */
const texCoinA=gl.createTexture(),texCoinN=gl.createTexture();
(function(){const S=256,hc=mkCanvas(S,S),h=hc.getContext('2d');
  h.fillStyle='#707070';h.fillRect(0,0,S,S);
  h.strokeStyle='#d8d8d8';h.lineWidth=S*.075;h.beginPath();h.arc(S/2,S/2,S*.455,0,TAU);h.stroke();
  h.lineWidth=S*.012;h.strokeStyle='#bcbcbc';h.beginPath();h.arc(S/2,S/2,S*.36,0,TAU);h.stroke();
  h.fillStyle='#c4c4c4';for(let i=0;i<28;i++){const a=i/28*TAU;h.beginPath();h.arc(S/2+Math.cos(a)*S*.405,S/2+Math.sin(a)*S*.405,S*.01,0,TAU);h.fill();}
  h.fillStyle='#f0f0f0';h.font=`900 ${S*.52}px "Arial Black",Impact,sans-serif`;h.textAlign='center';h.textBaseline='middle';h.fillText('$',S/2,S/2+S*.02);
  h.filter='blur(1.2px)';h.drawImage(hc,0,0);h.filter='none';
  const hd=h.getImageData(0,0,S,S).data,H=i=>hd[i*4];
  const ac=mkCanvas(S,S),a=ac.getContext('2d'),ai=a.createImageData(S,S),nc=mkCanvas(S,S),n=nc.getContext('2d'),ni=n.createImageData(S,S);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x,hv=H(i)/255;
    const xm=H(y*S+Math.max(0,x-1)),xp=H(y*S+Math.min(S-1,x+1)),ym=H(Math.max(0,y-1)*S+x),yp=H(Math.min(S-1,y+1)*S+x);
    let nx=-(xp-xm)/255*5.5,ny=-(yp-ym)/255*5.5,nz=1,l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    ni.data[i*4]=(nx*.5+.5)*255;ni.data[i*4+1]=(ny*.5+.5)*255;ni.data[i*4+2]=(nz*.5+.5)*255;ni.data[i*4+3]=255;
    const r=Math.hypot(x-S/2,y-S/2)/(S/2),edge=clamp((r-.92)*9,0,1),v=.62+hv*.62-edge*.35;
    ai.data[i*4]=clamp(255*v,0,255);ai.data[i*4+1]=clamp(196*v,0,255);ai.data[i*4+2]=clamp(72*v,0,255);ai.data[i*4+3]=255;}
  a.putImageData(ai,0,0);n.putImageData(ni,0,0);
  for(const[t,c]of[[texCoinA,ac],[texCoinN,nc]]){gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(extAniso)gl.texParameterf(gl.TEXTURE_2D,extAniso.TEXTURE_MAX_ANISOTROPY_EXT,8);}})();

/* ------------------------------ mesh builder ------------------------------ */
class MB{
  constructor(){this.v=[];this.ix=[];this.t=null;}
  xf(tx,ty,tz,yaw){this.t=tx===undefined?null:{tx,ty,tz,c:Math.cos(yaw||0),s:Math.sin(yaw||0)};}
  vert(p,n,u,v,col,mat){let x=p[0],y=p[1],z=p[2],nx=n[0],ny=n[1],nz=n[2];
    if(this.t){const{tx,ty,tz,c,s}=this.t;x=p[0]*c+p[2]*s+tx;z=-p[0]*s+p[2]*c+tz;y=p[1]+ty;nx=n[0]*c+n[2]*s;nz=-n[0]*s+n[2]*c;}
    this.v.push(x,y,z,nx,ny,nz,u,v,col[0],col[1],col[2],mat[0],mat[1],mat[2],mat[3]);return this.v.length/15-1;}
  quad(a,b,c,d){this.ix.push(a,b,c,a,c,d);}
  face(p0,p1,p2,p3,n,col,mat,us){const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]),l1=d(p0,p1)/us,l3=d(p0,p3)/us;
    this.quad(this.vert(p0,n,0,0,col,mat),this.vert(p1,n,l1,0,col,mat),this.vert(p2,n,l1,l3,col,mat),this.vert(p3,n,0,l3,col,mat));}
  box(cx,cy,cz,sx,sy,sz,col,mat,us=1){const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
    this.face([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],col,mat,us);
    this.face([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],col,mat,us);
    this.face([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],col,mat,us);
    this.face([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],col,mat,us);
    this.face([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],col,mat,us);
    this.face([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],col,mat,us);}
  cylAxis(p0,p1,r,seg,col,mat,caps=true,us=1){const ax=v3.norm(v3.sub(p1,p0)),t1=v3.norm(v3.cross(ax,Math.abs(ax[1])<.9?[0,1,0]:[1,0,0])),t2=v3.cross(ax,t1);
    const len=v3.len(v3.sub(p1,p0));let prev=null;
    for(let i=0;i<=seg;i++){const a=i/seg*TAU,c=Math.cos(a),s=Math.sin(a),n=[t1[0]*c+t2[0]*s,t1[1]*c+t2[1]*s,t1[2]*c+t2[2]*s];
      const q0=[p0[0]+n[0]*r,p0[1]+n[1]*r,p0[2]+n[2]*r],q1=[p1[0]+n[0]*r,p1[1]+n[1]*r,p1[2]+n[2]*r];
      const u=i/seg*TAU*r/us,a0=this.vert(q0,n,u,0,col,mat),a1=this.vert(q1,n,u,len/us,col,mat);
      if(prev)this.quad(prev[0],a0,a1,prev[1]);prev=[a0,a1];}
    if(caps)for(const[p,sg]of[[p0,-1],[p1,1]]){const nn=[ax[0]*sg,ax[1]*sg,ax[2]*sg],cI=this.vert(p,nn,.5,.5,col,mat);let pv=null;
      for(let i=0;i<=seg;i++){const a=i/seg*TAU,c=Math.cos(a),s=Math.sin(a),q=[p[0]+(t1[0]*c+t2[0]*s)*r,p[1]+(t1[1]*c+t2[1]*s)*r,p[2]+(t1[2]*c+t2[2]*s)*r];
        const vI=this.vert(q,nn,.5+c*.5,.5+s*.5,col,mat);if(pv!==null)this.ix.push(cI,pv,vI);pv=vI;}}}
  cylY(cx,y0,cz,r,h,seg,col,mat,caps=true,us=1){this.cylAxis([cx,y0,cz],[cx,y0+h,cz],r,seg,col,mat,caps,us);}
  build(){const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.v),gl.STATIC_DRAW);
    const eb=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(this.ix),gl.STATIC_DRAW);
    const S=60;[[0,3,0],[1,3,12],[2,2,24],[3,3,32],[4,4,44]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,S,o);});
    gl.bindVertexArray(null);return{vao,count:this.ix.length};}
}

/* ------------------------------ world constants ------------------------------ */
const HALL=34,HALLH=14,PIT=16,FLOOR=-6;
const HN=128,CS=(PIT*2)/HN,HOFF=-PIT;
const STICK={x:2.6,z:-1.7,yaw:.55,len:1.6,r:.075};
const MACHINE={x:-9.5,z:23,yaw:Math.PI/2};
const LIGHTS=[[8,11.6,8,7],[-8,11.6,8,7],[8,11.6,-8,7],[-8,11.6,-8,7],[-9,6.5,20,4.5],[11,6.5,26,4.5]];
const WALLAMPS=[];
const GOLD=[1,.78,.3];

/* matIds: [layer, metal, rough, emissive] */
const mBrick=[0,0,.85,0],mFloor=[1,.05,.5,0],mSteel=[2,.75,.38,0],mConc=[3,0,.9,0],mWood=[4,0,.7,0],mPlain=[5,0,.6,0],mPaint=[-1,.15,.35,0],mMetal=[-1,.85,.3,0],mGold=[-1,.95,.25,0],mEmis=[-1,0,1,7];

function buildHall(){
  const mb=new MB(),W=HALL;
  const up=(x0,z0,x1,z1,y,col,mat,us)=>mb.face([x0,y,z1],[x1,y,z1],[x1,y,z0],[x0,y,z0],[0,1,0],col,mat,us);
  const wc=[.62,.5,.4];
  // platform floor around the pit
  up(-W,-W,W,-PIT,0,wc,mFloor,4);up(-W,PIT,W,W,0,wc,mFloor,4);up(-W,-PIT,-PIT,PIT,0,wc,mFloor,4);up(PIT,-PIT,W,PIT,0,wc,mFloor,4);
  // pit floor + walls
  mb.face([-PIT,FLOOR,PIT],[PIT,FLOOR,PIT],[PIT,FLOOR,-PIT],[-PIT,FLOOR,-PIT],[0,1,0],[.6,.55,.5],mFloor,4);
  mb.face([-PIT,FLOOR,-PIT],[PIT,FLOOR,-PIT],[PIT,0,-PIT],[-PIT,0,-PIT],[0,0,1],[.8,.72,.62],mConc,3);
  mb.face([PIT,FLOOR,PIT],[-PIT,FLOOR,PIT],[-PIT,0,PIT],[PIT,0,PIT],[0,0,-1],[.8,.72,.62],mConc,3);
  mb.face([-PIT,FLOOR,PIT],[-PIT,FLOOR,-PIT],[-PIT,0,-PIT],[-PIT,0,PIT],[1,0,0],[.8,.72,.62],mConc,3);
  mb.face([PIT,FLOOR,-PIT],[PIT,FLOOR,PIT],[PIT,0,PIT],[PIT,0,-PIT],[-1,0,0],[.8,.72,.62],mConc,3);
  // hazard line around the pit
  const hz=[.95,.72,.08];up(-PIT-1.1,-PIT-1.1,PIT+1.1,-PIT-.6,.01,hz,mPaint,1);up(-PIT-1.1,PIT+.6,PIT+1.1,PIT+1.1,.01,hz,mPaint,1);up(-PIT-1.1,-PIT-.6,-PIT-.6,PIT+.6,.01,hz,mPaint,1);up(PIT+.6,-PIT-.6,PIT+1.1,PIT+.6,.01,hz,mPaint,1);
  // ceiling & walls
  mb.face([-W,HALLH,-W],[W,HALLH,-W],[W,HALLH,W],[-W,HALLH,W],[0,-1,0],[.28,.2,.14],mConc,4);
  const bc=[1,.97,.92];
  mb.face([-W,0,-W],[W,0,-W],[W,HALLH,-W],[-W,HALLH,-W],[0,0,1],bc,mBrick,2.4);
  mb.face([W,0,W],[-W,0,W],[-W,HALLH,W],[W,HALLH,W],[0,0,-1],bc,mBrick,2.4);
  mb.face([-W,0,W],[-W,0,-W],[-W,HALLH,-W],[-W,HALLH,W],[1,0,0],bc,mBrick,2.4);
  mb.face([W,0,-W],[W,0,W],[W,HALLH,W],[W,HALLH,-W],[-1,0,0],bc,mBrick,2.4);
  // dark band along the walls + steel columns + ceiling beams
  const band=[.32,.2,.12];
  mb.box(0,8.4,-W+.12,W*2,.8,.24,band,mConc,3);mb.box(0,8.4,W-.12,W*2,.8,.24,band,mConc,3);mb.box(-W+.12,8.4,0,.24,.8,W*2,band,mConc,3);mb.box(W-.12,8.4,0,.24,.8,W*2,band,mConc,3);
  const steel=[.8,.85,1];
  for(let i=-2;i<=2;i++){const p=i*15;
    mb.box(p,HALLH/2,-W+.55,1.0,HALLH,1.1,steel,mSteel,2);mb.box(p,HALLH/2,W-.55,1.0,HALLH,1.1,steel,mSteel,2);
    mb.box(-W+.55,HALLH/2,p,1.1,HALLH,1.0,steel,mSteel,2);mb.box(W-.55,HALLH/2,p,1.1,HALLH,1.0,steel,mSteel,2);}
  for(const p of[-17,0,17]){mb.box(0,HALLH-.45,p,W*2,.9,.7,steel,mSteel,2);mb.box(p,HALLH-.9,0,.7,.9,W*2,steel,mSteel,2);}
  // wall lamps (emissive)
  const lampCol=[1,.82,.5];
  for(const p of[-20,0,20]){
    for(const[x,z,rx,rz]of[[p,-W+.35,1.2,.25],[p,W-.35,1.2,.25],[-W+.35,p,.25,1.2],[W-.35,p,.25,1.2]]){
      mb.box(x,7.2,z,rx+.3,.55,rz+.3,[.2,.14,.1],mMetal,1);mb.box(x,7.2,z,rx,.32,rz,lampCol,mEmis,1);WALLAMPS.push([x,7.2,z]);}}
  // overhead hanging lamps
  for(const[x,y,z]of LIGHTS.slice(0,4)){mb.cylAxis([x,HALLH-.9,z],[x,y+.3,z],.05,6,[.15,.15,.18],mMetal,false);
    mb.cylY(x,y-.1,z,1.1,.4,18,[.25,.2,.16],mMetal,true);mb.cylY(x,y-.14,z,.95,.06,18,lampCol,mEmis,true);}
  // railing (gap on the south side)
  const rh=1.05,off=PIT-.35,rc=[.7,.72,.78];
  const post=(x,z)=>mb.cylY(x,0,z,.045,rh,6,rc,mMetal,true);
  const rails=(x0,z0,x1,z1)=>{for(const y of[rh,rh*.52])mb.cylAxis([x0,y,z0],[x1,y,z1],.03,6,rc,mMetal,true);};
  for(let i=-off;i<=off+.01;i+=2){post(i,-off);post(-off,i);post(off,i);if(Math.abs(i)>3.1)post(i,off);}
  rails(-off,0,-off,-off);rails(-off,-off,off,-off);rails(off,-off,off,off);rails(-off,off,-off,0);rails(-off,0,-off,off);
  rails(-off,off,-3,off);rails(3,off,off,off);
  // crates of coins near the east wall
  for(let i=0;i<5;i++){const z=-26+i*5.4,h=.9+Math.random()*.6;mb.box(W-2.6,h/2,z,2.6,h,2.6,[.8,.55,.32],mWood,1.2);mb.box(W-2.6,h+.08,z,2.2,.22,2.2,[1,.72,.22],mGold,1);}
  for(let i=0;i<4;i++){const z=-22+i*5.8;mb.box(-W+2.4,.5,z,2.4,1.0,2.4,[.8,.55,.32],mWood,1.2);mb.box(-W+2.4,1.05,z,2.0,.2,2.0,[1,.72,.22],mGold,1);}
  return mb.build();
}
function buildMachine(){
  const mb=new MB();mb.xf(MACHINE.x,0,MACHINE.z,MACHINE.yaw);
  const teal=[.12,.5,.56],coral=[.85,.38,.28],cream=[.9,.85,.72],dark=[.1,.1,.12];
  mb.box(0,.22,0,2.2,.44,1.6,[.08,.34,.4],mPaint,1);
  for(const[x,z]of[[-.9,-.6],[.9,-.6],[-.9,.6],[.9,.6]])mb.box(x,.05,z,.3,.12,.3,dark,mPaint,1);
  mb.box(0,1.15,0,1.95,1.4,1.4,teal,mPaint,1);
  mb.box(0,1.15,.72,1.55,1.05,.06,[.07,.28,.34],mPaint,1);
  mb.cylAxis([0,1.15,.76],[0,1.15,.82],.3,24,[.85,.2,.15],mPaint,true);mb.cylAxis([0,1.15,.82],[0,1.15,.85],.2,24,[1,.78,.3],mGold,true);
  mb.box(.62,1.28,.78,.3,.05,.05,[1,.78,.3],mGold,1);
  mb.box(0,2.0,0,2.05,.75,1.45,coral,mPaint,1);
  mb.box(0,2.0,.78,1.8,.14,.1,[.95,.8,.3],mGold,1);
  mb.box(0,2.92,-.05,2.25,1.05,1.0,cream,mPaint,1);
  mb.box(0,2.06,1.02,1.7,.07,.75,cream,mPaint,1);mb.box(0,2.25,1.4,1.7,.3,.06,cream,mPaint,1);
  for(const x of[-.85,.85])mb.box(x,2.2,1.02,.06,.25,.75,cream,mPaint,1);
  mb.cylAxis([0,3.55,0],[0,3.58,.06],.34,28,[1,.78,.3],mGold,true);
  mb.cylAxis([0,3.55,0],[0,3.58,.06],.34,28,[1,.78,.3],mGold,true);
  for(let i=0;i<7;i++)mb.cylAxis([-.82+i*.27,2.0+.0,.77],[-.82+i*.27,2.0,.84],.07,10,[.1,.45,.5],mPaint,true);
  mb.xf();return mb.build();
}
function buildStick(){
  const mb=new MB(),L=STICK.len,r=STICK.r;
  mb.cylAxis([-L/2,0,0],[L*.18,0,0],r,14,[.95,.95,.98],mWood,true,.6);
  mb.cylAxis([L*.18,0,0],[L/2,0,0],r*1.25,14,[.82,.1,.08],mPaint,true);
  mb.cylAxis([L/2,0,0],[L/2+.04,0,0],r*1.4,14,[1,.78,.3],mGold,true);
  mb.cylAxis([-L/2-.03,0,0],[-L/2,0,0],r*1.15,14,[1,.78,.3],mGold,true);
  for(let i=0;i<3;i++)mb.cylAxis([L*.18+.02+i*.08,0,0],[L*.18+.045+i*.08,0,0],r*1.34,14,[1,.78,.3],mGold,true);
  return mb.build();
}
function buildMagnet(){ // horseshoe: arc on top (y>0), legs down; local -Y is the "open" direction
  const mb=new MB(),R=.105,w=.058,d=.07,legL=.13,steps=18;const red=[.88,.06,.05],blue=[.05,.55,.9],tip=[.93,.9,.82],mat=[-1,.3,.38,0];
  const sec=(cx,cy,tx,ty)=>{const nx=-ty,ny=tx,o=[],p=[[ -w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
    return p.map(([a,b])=>[cx+nx*a,cy+ny*a,b]);};
  const ring=(pts,col)=>pts.map(p=>p);
  const path=[];
  for(let i=0;i<=steps;i++){const a=Math.PI*i/steps;path.push({x:Math.cos(a)*R,y:Math.sin(a)*R,tx:-Math.sin(a),ty:Math.cos(a),col:a>Math.PI/2+.0?red:blue});}
  // right leg (blue) goes from (R,0) down, left leg (red) from (-R,0) down
  const legR=[{x:R,y:0,tx:0,ty:-1},{x:R,y:-legL*.6,tx:0,ty:-1},{x:R,y:-legL,tx:0,ty:-1}],legLf=[{x:-R,y:0,tx:0,ty:-1},{x:-R,y:-legL*.6,tx:0,ty:-1},{x:-R,y:-legL,tx:0,ty:-1}];
  function sweep(pts,cols,tipFrom){
    for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];const A=sec(a.x,a.y,a.tx,a.ty),B=sec(b.x,b.y,b.tx,b.ty);const c=cols[i];
      for(let k=0;k<4;k++){const k2=(k+1)%4;const p0=A[k],p1=B[k],p2=B[k2],p3=A[k2];
        const n=v3.norm(v3.cross(v3.sub(p1,p0),v3.sub(p3,p0)));mb.quad(mb.vert(p0,n,0,0,c,mat),mb.vert(p1,n,1,0,c,mat),mb.vert(p2,n,1,1,c,mat),mb.vert(p3,n,0,1,c,mat));}}
    const E=pts[pts.length-1],S=sec(E.x,E.y,E.tx,E.ty);const c=cols[cols.length-1];const n=[E.tx,E.ty,0];
    mb.quad(mb.vert(S[0],n,0,0,c,mat),mb.vert(S[1],n,1,0,c,mat),mb.vert(S[2],n,1,1,c,mat),mb.vert(S[3],n,0,1,c,mat));}
  const half=Math.floor(steps/2);
  // blue half (angle 0..pi/2) then right leg
  const blueArc=path.slice(0,half+1),redArc=path.slice(half).reverse();
  const bpts=[...blueArc.map(p=>({x:p.x,y:p.y,tx:p.tx,ty:p.ty})),...legR.slice(1).map(p=>({...p}))];
  // arc tangent direction: continue towards the leg; for blueArc tangent is toward increasing angle, so reverse so that sweeping goes from top to the leg
  const bp=[...blueArc].reverse().map(p=>({x:p.x,y:p.y,tx:p.tx,ty:p.ty}));
  const bFull=[...bp,...legR.slice(1)],rFull=[...redArc.reverse().reverse(),...legLf.slice(1)];
  const bCols=bFull.slice(0,-1).map((p,i)=>i>=bFull.length-3?tip:blue),rCols=rFull.slice(0,-1).map((p,i)=>i>=rFull.length-3?tip:red);
  sweep(bFull,bCols);
  // red: sweep from top outward to left leg: path along increasing angle
  const rp=path.slice(half).map(p=>({x:p.x,y:p.y,tx:p.tx,ty:p.ty})),rFull2=[...rp,...legLf.slice(1)];
  const rCols2=rFull2.slice(0,-1).map((p,i)=>i>=rFull2.length-3?tip:red);
  sweep(rFull2,rCols2);
  return mb.build();
}

/* ------------------------------ coin mesh ------------------------------ */
const COIN_SEG=18,COIN_TH=.12;
const coinGeo=(()=>{const seg=COIN_SEG,th=COIN_TH,V=[],I=[];
  const push=(x,y,z,nx,ny,nz,u,v,part)=>{V.push(x,y,z,nx,ny,nz,u,v,part);return V.length/9-1;};
  const rings=[{r:.84,y:th,n:[0,1,0],part:0,top:true},{r:1,y:th*.55,n:[.62,.78,0],part:1},{r:1,y:-th*.55,n:[.62,-.78,0],part:1},{r:.84,y:-th,n:[0,-1,0],part:0,bot:true}];
  const topC=push(0,th,0,0,1,0,.5,.5,0),botC=push(0,-th,0,0,-1,0,.5,.5,0);
  const ids=rings.map(rg=>{const row=[];for(let i=0;i<=seg;i++){const a=i/seg*TAU,c=Math.cos(a),s=Math.sin(a);
    const n=rg.n[0]===0?rg.n:[c*rg.n[0],rg.n[1],s*rg.n[0]];
    let u=c*rg.r*.5+.5,v=s*rg.r*.5+.5;if(rg.bot)u=1-u;if(rg.part===1){u=i/seg;v=.5;}
    row.push(push(c*rg.r,rg.y,s*rg.r,n[0],n[1],n[2],u,v,rg.part));}return row;});
  for(let i=0;i<seg;i++){I.push(topC,ids[0][i],ids[0][i+1]);I.push(botC,ids[3][i+1],ids[3][i]);
    for(let k=0;k<3;k++){const a=ids[k][i],b=ids[k][i+1],c=ids[k+1][i+1],d=ids[k+1][i];I.push(a,d,c,a,c,b);}}
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.STATIC_DRAW);
  const eb=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(I),gl.STATIC_DRAW);
  [[0,3,0],[1,3,12],[2,2,24],[3,1,32]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,36,o);});
  gl.bindVertexArray(null);return{vao,vb,eb,count:I.length};})();

/* ------------------------------ shaders ------------------------------ */
const LIGHT_GLSL=`
precision highp float;
uniform vec3 uCam; uniform vec4 uLights[6]; uniform vec3 uFogCol; uniform float uFog; uniform vec4 uGlow; uniform float uTime;
vec3 envColor(vec3 d){
  float y=d.y;
  vec3 c=mix(vec3(.95,.60,.28),vec3(1.7,1.25,.8),smoothstep(.05,.9,y));
  c=mix(c,vec3(.16,.09,.04),smoothstep(.0,-.55,y));
  c*=.82+.18*sin(atan(d.x,d.z)*4.0+y*3.0);
  return c;
}
vec3 shade(vec3 P,vec3 N,vec3 V,vec3 alb,float metal,float rough,float ao){
  vec3 dif=mix(vec3(.17,.10,.05),vec3(.46,.33,.19),N.y*.5+.5);
  vec3 sp=vec3(0.);
  float shin=mix(8.,300.,pow(1.-rough,1.6));
  for(int i=0;i<6;i++){
    vec3 Lp=uLights[i].xyz-P; float d2=dot(Lp,Lp); vec3 L=Lp*inversesqrt(d2);
    float att=uLights[i].w/(1.+d2*.016);
    float nl=max(dot(N,L),0.);
    dif+=vec3(1.,.82,.58)*att*nl;
    vec3 H=normalize(L+V);
    sp+=vec3(1.,.9,.7)*att*pow(max(dot(N,H),0.),shin)*(shin*.012+.25);
  }
  if(uGlow.w>0.){vec3 Lp=uGlow.xyz-P;float d2=dot(Lp,Lp);vec3 L=Lp*inversesqrt(d2);float att=uGlow.w*(.7+.3*sin(uTime*5.))/(1.+d2*.35);dif+=vec3(1.,.8,.35)*att*max(dot(N,L),0.)*1.5+vec3(1.,.8,.35)*att*.4;}
  vec3 R=reflect(-V,N);
  float fr=pow(1.-max(dot(N,V),0.),5.);
  vec3 F0=mix(vec3(.05),alb,metal);
  vec3 env=envColor(R);
  return alb*(1.-metal)*dif*ao + sp*F0*ao + env*mix(F0,vec3(1.),fr*(1.-rough))*ao*(1.-rough*.55)*.85;
}
vec3 fogIt(vec3 c,vec3 P){float d=length(uCam-P);return mix(c,uFogCol,1.-exp(-d*uFog));}
`;
const litVS=`#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=3) in vec3 aCol; layout(location=4) in vec4 aMat;
uniform mat4 uVP,uModel;
out vec3 vWP,vN,vCol; out vec2 vUV; out vec4 vMat;
void main(){vec4 w=uModel*vec4(aPos,1.);vWP=w.xyz;vN=mat3(uModel)*aNor;vUV=aUV;vCol=aCol;vMat=aMat;gl_Position=uVP*w;}`;
const litFS=`#version 300 es
${LIGHT_GLSL}
in vec3 vWP,vN,vCol; in vec2 vUV; in vec4 vMat; out vec4 o;
uniform highp sampler2DArray uTex;
void main(){
  vec3 V=normalize(uCam-vWP); vec3 N=normalize(vN); if(dot(N,V)<0.) N=-N;
  vec3 tex=vMat.x<-.5?vec3(1.):texture(uTex,vec3(vUV,vMat.x)).rgb;
  vec3 alb=pow(tex,vec3(2.2))*vCol*vCol;
  vec3 c=shade(vWP,N,V,alb,vMat.y,vMat.z,1.)+vCol*vCol*vMat.w;
  o=vec4(fogIt(c,vWP),1.);
}`;
const coinVaryOut=`out vec3 vWP,vN,vT,vB,vTint; out vec2 vUV; out float vPart,vAO;`;
const coinShellVS=`#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aLP; layout(location=1) in vec3 aLN; layout(location=2) in vec2 aLUV; layout(location=3) in float aPart;
layout(location=4) in vec2 aXZ; layout(location=5) in vec4 aSeed;
uniform mat4 uVP; uniform highp sampler2D uHF; uniform vec4 uStick; uniform float uStickLen; uniform float uFloor,uHS,uN;
${coinVaryOut}
float hfAt(vec2 xz){vec2 g=(xz+uHS*.5)/uHS*uN-.5;vec2 f=fract(g);ivec2 i=ivec2(floor(g));int n=int(uN);
  ivec2 i0=clamp(i,ivec2(0),ivec2(n-1)),i1=clamp(i+1,ivec2(0),ivec2(n-1));
  float a=texelFetch(uHF,ivec2(i0.x,i0.y),0).r,b=texelFetch(uHF,ivec2(i1.x,i0.y),0).r,c=texelFetch(uHF,ivec2(i0.x,i1.y),0).r,d=texelFetch(uHF,ivec2(i1.x,i1.y),0).r;
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
vec3 perp(vec3 a){return normalize(abs(a.y)<.95?cross(a,vec3(0.,1.,0.)):cross(a,vec3(1.,0.,0.)));}
void main(){
  vec2 xz=aXZ; float Y=hfAt(xz);
  vec2 sp=xz-uStick.xy; float tp=clamp(dot(sp,uStick.zw),-uStickLen,uStickLen); float sd=length(sp-uStick.zw*tp);
  if(Y<uFloor+.13||(sd<.55&&Y<uFloor+1.2)){gl_Position=vec4(2.,2.,2.,1.);return;}
  float h=.3;
  float hx0=hfAt(xz-vec2(h,0.)),hx1=hfAt(xz+vec2(h,0.)),hz0=hfAt(xz-vec2(0.,h)),hz1=hfAt(xz+vec2(0.,h));
  vec3 n=normalize(vec3(hx0-hx1,2.*h,hz0-hz1));
  float lap=(hx0+hx1+hz0+hz1-4.*Y)/(h*h);
  float lvl=floor(aSeed.x*4.);
  vec3 t1=perp(n),t2=cross(n,t1);
  float ta=aSeed.y*aSeed.y*.95,ph=aSeed.z*6.2831853;
  vec3 a=normalize(n*cos(ta)+(t1*cos(ph)+t2*sin(ph))*sin(ta));
  vec3 r=perp(a); float yaw=fract(aSeed.z*37.1+aSeed.w*11.3)*6.2831853; r=r*cos(yaw)+cross(a,r)*sin(yaw); vec3 q=cross(a,r);
  vec3 c=vec3(xz.x,Y,xz.y)-n*(lvl*.05)+n*.035;
  c.y=max(c.y,uFloor+.05);
  vec3 wp=c+.15*(r*aLP.x+a*aLP.y+q*aLP.z);
  vWP=wp; vN=r*aLN.x+a*aLN.y+q*aLN.z; vT=r; vB=q; vUV=aLUV; vPart=aPart;
  vAO=clamp(1.-lvl*.13-clamp(lap*.1,0.,.3),.35,1.);
  vTint=vec3(1.,.9+.13*aSeed.w,.76+.34*aSeed.w);
  gl_Position=uVP*vec4(wp,1.);
}`;
const coinDynVS=`#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aLP; layout(location=1) in vec3 aLN; layout(location=2) in vec2 aLUV; layout(location=3) in float aPart;
layout(location=4) in vec4 aPS; layout(location=5) in vec4 aQ;
uniform mat4 uVP;
${coinVaryOut}
vec3 qrot(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void main(){
  vec3 r=qrot(aQ,vec3(1.,0.,0.)),a=qrot(aQ,vec3(0.,1.,0.)),q=qrot(aQ,vec3(0.,0.,1.));
  vec3 wp=aPS.xyz+aPS.w*(r*aLP.x+a*aLP.y+q*aLP.z);
  vWP=wp; vN=r*aLN.x+a*aLN.y+q*aLN.z; vT=r; vB=q; vUV=aLUV; vPart=aPart; vAO=1.; vTint=vec3(1.05,.95,.82);
  gl_Position=uVP*vec4(wp,1.);
}`;
const coinFS=`#version 300 es
${LIGHT_GLSL}
in vec3 vWP,vN,vT,vB,vTint; in vec2 vUV; in float vPart,vAO; out vec4 o;
uniform sampler2D uCA,uCN;
void main(){
  vec3 V=normalize(uCam-vWP); vec3 N=normalize(vN); vec3 alb; float rough=.28;
  if(vPart<.5){
    vec3 nm=texture(uCN,vUV).xyz*2.-1.;
    N=normalize(vT*nm.x+vB*nm.y+N*nm.z);
    alb=pow(texture(uCA,vUV).rgb,vec3(2.2));
  }else{
    float reed=.78+.22*step(.5,fract(vUV.x*80.));
    alb=pow(vec3(.95,.68,.2),vec3(2.2))*reed; rough=.42;
  }
  alb*=vTint;
  vec3 c=shade(vWP,N,V,alb,.93,rough,vAO);
  o=vec4(fogIt(c,vWP),1.);
}`;
const fxVS=`#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol;
uniform mat4 uVP; out vec2 vUV; out vec4 vCol;
void main(){vUV=aUV;vCol=aCol;gl_Position=uVP*vec4(aPos,1.);}`;
const fxFS=`#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol; uniform int uKind; out vec4 o;
void main(){
  float I;
  if(uKind==0){float v=vUV.y;I=exp(-v*v*5.)*.75+exp(-v*v*55.)*1.6;}
  else if(uKind==1){float r=length(vUV);I=r>1.?0.:exp(-r*r*3.2);}
  else {float u=vUV.x,v=vUV.y;I=exp(-u*u*3.5)*(1.-v)*(1.-v);}
  o=vec4(vCol.rgb*I*vCol.a,1.);
}`;
const fsVS=`#version 300 es
out vec2 vUV; void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const extractFS=`#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThr; out vec4 o;
void main(){vec3 c=(texture(uSrc,vUV+uTexel*vec2(-.5,-.5)).rgb+texture(uSrc,vUV+uTexel*vec2(.5,-.5)).rgb+texture(uSrc,vUV+uTexel*vec2(-.5,.5)).rgb+texture(uSrc,vUV+uTexel*vec2(.5,.5)).rgb)*.25;
  float l=max(max(c.r,c.g),c.b);float k=max(l-uThr,0.)/max(l,1e-4);o=vec4(c*k,1.);}`;
const blurFS=`#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uSrc; uniform vec2 uDir; out vec4 o;
void main(){vec3 c=texture(uSrc,vUV).rgb*.227;
  c+=(texture(uSrc,vUV+uDir*1.385).rgb+texture(uSrc,vUV-uDir*1.385).rgb)*.3162;
  c+=(texture(uSrc,vUV+uDir*3.231).rgb+texture(uSrc,vUV-uDir*3.231).rgb)*.0703;o=vec4(c,1.);}`;
const compFS=`#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uScene,uB1,uB2; uniform vec2 uTexel; uniform float uExp,uFlash; out vec4 o;
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
  vec3 c=texture(uScene,vUV).rgb;
  vec3 n=texture(uScene,vUV+vec2(0.,-uTexel.y)).rgb,s=texture(uScene,vUV+vec2(0.,uTexel.y)).rgb,e=texture(uScene,vUV+vec2(uTexel.x,0.)).rgb,w=texture(uScene,vUV+vec2(-uTexel.x,0.)).rgb;
  float lc=luma(min(c,vec3(3.))),ln=luma(min(n,vec3(3.))),ls=luma(min(s,vec3(3.))),le=luma(min(e,vec3(3.))),lw=luma(min(w,vec3(3.)));
  float rng=max(max(ln,ls),max(max(le,lw),lc))-min(min(ln,ls),min(min(le,lw),lc));
  c=mix(c,(c*2.+n+s+e+w)/6.,smoothstep(.08,.4,rng)*.75);
  vec3 b=texture(uB1,vUV).rgb*.55+texture(uB2,vUV).rgb*.8;
  c=c*uExp+b;
  c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
  c=pow(clamp(c,0.,1.),vec3(1./2.2));
  vec2 q=vUV-.5; c*=1.-dot(q,q)*.85;
  c=mix(c,vec3(1.,.95,.8),uFlash);
  c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
  o=vec4(c,1.);
}`;
const scrVS=`#version 300 es
layout(location=0) in vec3 aPos; layout(location=2) in vec2 aUV; uniform mat4 uVP; out vec2 vUV; void main(){vUV=aUV;gl_Position=uVP*vec4(aPos,1.);}`;
const scrFS=`#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uT; out vec4 o; void main(){o=vec4(pow(texture(uT,vUV).rgb,vec3(2.2))*2.2,1.);}`;

const P={
  lit:program(litVS,litFS),shell:program(coinShellVS,coinFS),dyn:program(coinDynVS,coinFS),fx:program(fxVS,fxFS),
  extract:program(fsVS,extractFS),blur:program(fsVS,blurFS),comp:program(fsVS,compFS),scr:program(scrVS,scrFS)
};

/* ------------------------------ static meshes ------------------------------ */
const hallMesh=buildHall(),machineMesh=buildMachine(),stickMesh=buildStick(),magnetMesh=buildMagnet();
// machine screen: canvas texture on a quad
const scrCanvas=mkCanvas(512,160),scrCtx=scrCanvas.getContext('2d'),scrTex=gl.createTexture();
let scrShown=-1;
function drawScreen(v){if(v===scrShown)return;scrShown=v;const c=scrCtx;c.fillStyle='#0b0f14';c.fillRect(0,0,512,160);
  c.fillStyle='#d8c28a';c.font='bold 26px "Arial Black",Arial,sans-serif';c.textAlign='center';c.fillText('TOTAL DEPOSITED',256,36);
  const s=String(Math.min(9999999,v)).padStart(7,'0');c.font='bold 92px "Courier New",monospace';
  for(let i=0;i<7;i++){c.fillStyle='#1a1d12';c.fillRect(10+i*70,52,62,96);c.fillStyle='#ffc93a';c.shadowColor='#ffb000';c.shadowBlur=14;c.fillText(s[i],41+i*70,134);c.shadowBlur=0;}
  gl.bindTexture(gl.TEXTURE_2D,scrTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,scrCanvas);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
const screenQuad=(()=>{const c=Math.cos(MACHINE.yaw),s=Math.sin(MACHINE.yaw);
  const tr=(x,y,z)=>[x*c+z*s+MACHINE.x,y,-x*s+z*c+MACHINE.z];
  const p=[tr(-.88,2.62,.46),tr(.88,2.62,.46),tr(.88,3.22,.46),tr(-.88,3.22,.46)],uv=[[0,1],[1,1],[1,0],[0,0]];
  const d=[];p.forEach((q,i)=>d.push(q[0],q[1],q[2],0,0,0,uv[i][0],uv[i][1]));
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(d),gl.STATIC_DRAW);
  const eb=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2,0,2,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,32,24);gl.bindVertexArray(null);return vao;})();

/* ------------------------------ coin pile height field ------------------------------ */
const hf=new Float32Array(HN*HN),dlt=new Float32Array(HN*HN);
let V0=0,coinBulk=1,hfDirty=0;
const hfTex=gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D,hfTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,HN,HN,0,gl.RED,gl.FLOAT,null);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
function cellX(i){return HOFF+(i+.5)*CS;}
function initPile(){
  _seed=2026;
  for(let j=0;j<HN;j++)for(let i=0;i<HN;i++){const x=cellX(i),z=cellX(j),r=Math.hypot(x,z*.9);
    let m=3.9*Math.pow(Math.max(0,1-r/15.2),1.1);m+=(vnoise(x*.35,z*.35)-.5)*.9*Math.min(1,m)+(vnoise(x*.9+9,z*.9)-.5)*.25*Math.min(1,m);
    hf[j*HN+i]=Math.max(0,m);}
  V0=0;for(let k=0;k<hf.length;k++)V0+=(hf[k]-FLOOR)*CS*CS;
  coinBulk=V0/1000000;hfDirty=1;
}
function sampleH(x,z){const gx=(x-HOFF)/CS-.5,gz=(z-HOFF)/CS-.5;let i0=Math.floor(gx),j0=Math.floor(gz);const fx=gx-i0,fz=gz-j0;
  const g=(i,j)=>hf[clamp(j,0,HN-1)*HN+clamp(i,0,HN-1)];
  return lerp(lerp(g(i0,j0),g(i0+1,j0),fx),lerp(g(i0,j0+1),g(i0+1,j0+1),fx),fz);}
function pileVolume(){let v=0;for(let k=0;k<hf.length;k++)v+=(hf[k]-FLOOR)*CS*CS;return v;}
function erode(iter){
  const md=Math.tan(.66)*CS,md2=md*1.4142;
  for(let it=0;it<iter;it++){dlt.fill(0);
    for(let j=1;j<HN-1;j++)for(let i=1;i<HN-1;i++){const k=j*HN+i,y=hf[k];
      let nb;
      nb=k-1;let d=y-hf[nb]-md;if(d>0){d*=.1;dlt[k]-=d;dlt[nb]+=d;}
      nb=k+1;d=y-hf[nb]-md;if(d>0){d*=.1;dlt[k]-=d;dlt[nb]+=d;}
      nb=k-HN;d=y-hf[nb]-md;if(d>0){d*=.1;dlt[k]-=d;dlt[nb]+=d;}
      nb=k+HN;d=y-hf[nb]-md;if(d>0){d*=.1;dlt[k]-=d;dlt[nb]+=d;}
      nb=k-HN-1;d=y-hf[nb]-md2;if(d>0){d*=.07;dlt[k]-=d;dlt[nb]+=d;}
      nb=k-HN+1;d=y-hf[nb]-md2;if(d>0){d*=.07;dlt[k]-=d;dlt[nb]+=d;}
      nb=k+HN-1;d=y-hf[nb]-md2;if(d>0){d*=.07;dlt[k]-=d;dlt[nb]+=d;}
      nb=k+HN+1;d=y-hf[nb]-md2;if(d>0){d*=.07;dlt[k]-=d;dlt[nb]+=d;}}
    for(let k=0;k<hf.length;k++)hf[k]=Math.max(FLOOR,hf[k]+dlt[k]);}
}
/* remove volume (m^3) around (px,pz): returns the volume actually removed */
function pullPile(px,pz,radius,vol){
  const i0=Math.floor((px-radius-HOFF)/CS),i1=Math.ceil((px+radius-HOFF)/CS),j0=Math.floor((pz-radius-HOFF)/CS),j1=Math.ceil((pz+radius-HOFF)/CS);
  let W=0;const cells=[];
  for(let j=Math.max(1,j0);j<=Math.min(HN-2,j1);j++)for(let i=Math.max(1,i0);i<=Math.min(HN-2,i1);i++){
    const d=Math.hypot(cellX(i)-px,cellX(j)-pz)/radius;if(d>1)continue;const k=j*HN+i;if(hf[k]<=FLOOR+.001)continue;
    const w=Math.exp(-d*d*2.4);cells.push(k,w);W+=w;}
  if(!W)return 0;let removed=0;
  for(let c=0;c<cells.length;c+=2){const k=cells[c],dv=vol*cells[c+1]/W,dy=Math.min(dv/(CS*CS),.5,hf[k]-FLOOR);hf[k]-=dy;removed+=dy*CS*CS;}
  hfDirty=240;return removed;
}
function rayPile(o,d,maxT){const step=.12;let prevT=0;
  for(let t=.4;t<maxT;t+=step){const x=o[0]+d[0]*t,y=o[1]+d[1]*t,z=o[2]+d[2]*t;
    if(Math.abs(x)<PIT-.1&&Math.abs(z)<PIT-.1){if(y<sampleH(x,z)){let a=prevT||t-step,b=t;
        for(let i=0;i<7;i++){const m=(a+b)/2,mx=o[0]+d[0]*m,my=o[1]+d[1]*m,mz=o[2]+d[2]*m;if(my<sampleH(mx,mz))b=m;else a=m;}return b;}}
    else if(y<0)return -1;
    prevT=t;}
  return -1;}

/* shell instances */
const SHELL_MAX=40000;let shellN=SHELL_MAX,shellQ=1;
const shellVAO=gl.createVertexArray(),shellVB=gl.createBuffer();
(function(){const d=new Float32Array(SHELL_MAX*6);_seed=777;
  for(let i=0;i<SHELL_MAX;i++){d[i*6]=(rnd()*2-1)*(PIT-.2);d[i*6+1]=(rnd()*2-1)*(PIT-.2);d[i*6+2]=rnd();d[i*6+3]=rnd();d[i*6+4]=rnd();d[i*6+5]=rnd();}
  gl.bindVertexArray(shellVAO);gl.bindBuffer(gl.ARRAY_BUFFER,coinGeo.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,coinGeo.eb);
  [[0,3,0],[1,3,12],[2,2,24],[3,1,32]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,36,o);});
  gl.bindBuffer(gl.ARRAY_BUFFER,shellVB);gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,2,gl.FLOAT,false,24,0);gl.vertexAttribDivisor(4,1);
  gl.enableVertexAttribArray(5);gl.vertexAttribPointer(5,4,gl.FLOAT,false,24,8);gl.vertexAttribDivisor(5,1);gl.bindVertexArray(null);})();

/* dynamic coins (flying to the magnet / victory fountain) */
const DMAX=3600;
const dPos=new Float32Array(DMAX*3),dVel=new Float32Array(DMAX*3),dQ=new Float32Array(DMAX*4),dW=new Float32Array(DMAX*3),dAge=new Float32Array(DMAX),dDur=new Float32Array(DMAX),dMode=new Uint8Array(DMAX),dS=new Float32Array(DMAX*3),dC=new Float32Array(DMAX*3);
let dN=0;const dInst=new Float32Array(DMAX*8);
const dynVAO=gl.createVertexArray(),dynVB=gl.createBuffer();
(function(){gl.bindVertexArray(dynVAO);gl.bindBuffer(gl.ARRAY_BUFFER,coinGeo.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,coinGeo.eb);
  [[0,3,0],[1,3,12],[2,2,24],[3,1,32]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,36,o);});
  gl.bindBuffer(gl.ARRAY_BUFFER,dynVB);gl.bufferData(gl.ARRAY_BUFFER,dInst.byteLength,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,4,gl.FLOAT,false,32,0);gl.vertexAttribDivisor(4,1);
  gl.enableVertexAttribArray(5);gl.vertexAttribPointer(5,4,gl.FLOAT,false,32,16);gl.vertexAttribDivisor(5,1);gl.bindVertexArray(null);})();
function randQ(o){let x=rnd()*2-1,y=rnd()*2-1,z=rnd()*2-1,w=rnd()*2-1;const l=Math.hypot(x,y,z,w)||1;dQ[o]=x/l;dQ[o+1]=y/l;dQ[o+2]=z/l;dQ[o+3]=w/l;}
function spawnCollect(sx,sy,sz){if(dN>=DMAX)return;const i=dN++;dMode[i]=0;dAge[i]=0;dDur[i]=.5+rnd()*.45;
  dS[i*3]=sx;dS[i*3+1]=sy;dS[i*3+2]=sz;dC[i*3]=sx+(rnd()-.5)*2.5;dC[i*3+1]=sy+1.6+rnd()*2.2;dC[i*3+2]=sz+(rnd()-.5)*2.5;
  dPos[i*3]=sx;dPos[i*3+1]=sy;dPos[i*3+2]=sz;randQ(i*4);dW[i*3]=(rnd()-.5)*30;dW[i*3+1]=(rnd()-.5)*30;dW[i*3+2]=(rnd()-.5)*30;}
function spawnFountain(x,y,z,sp){if(dN>=DMAX)return;const i=dN++;dMode[i]=1;dAge[i]=0;dDur[i]=5+rnd()*2.5;
  const a=rnd()*TAU,u=rnd(),h=sp*(.6+.7*rnd());dPos[i*3]=x;dPos[i*3+1]=y;dPos[i*3+2]=z;
  dVel[i*3]=Math.cos(a)*u*sp*.55;dVel[i*3+1]=h;dVel[i*3+2]=Math.sin(a)*u*sp*.55;randQ(i*4);
  dW[i*3]=(rnd()-.5)*24;dW[i*3+1]=(rnd()-.5)*24;dW[i*3+2]=(rnd()-.5)*24;}
function removeD(i){const l=--dN;if(i===l)return;for(let k=0;k<3;k++){dPos[i*3+k]=dPos[l*3+k];dVel[i*3+k]=dVel[l*3+k];dW[i*3+k]=dW[l*3+k];dS[i*3+k]=dS[l*3+k];dC[i*3+k]=dC[l*3+k];}
  for(let k=0;k<4;k++)dQ[i*4+k]=dQ[l*4+k];dAge[i]=dAge[l];dDur[i]=dDur[l];dMode[i]=dMode[l];}
let arrivedThisFrame=0;
function updateDyn(dt){
  for(let i=dN-1;i>=0;i--){
    dAge[i]+=dt;const o=i*3;
    if(dMode[i]===0){const t=dAge[i]/dDur[i];
      if(t>=1){arrivedThisFrame++;removeD(i);continue;}
      const e=t*t*(3-2*t),m=1-e,tip=G.tip;
      dPos[o]=m*m*dS[o]+2*m*e*dC[o]+e*e*tip[0];dPos[o+1]=m*m*dS[o+1]+2*m*e*dC[o+1]+e*e*tip[1];dPos[o+2]=m*m*dS[o+2]+2*m*e*dC[o+2]+e*e*tip[2];
    }else{
      dVel[o+1]-=9.8*dt;dPos[o]+=dVel[o]*dt;dPos[o+1]+=dVel[o+1]*dt;dPos[o+2]+=dVel[o+2]*dt;
      const x=dPos[o],z=dPos[o+2];let gy=(Math.abs(x)<PIT&&Math.abs(z)<PIT)?sampleH(x,z):0;if(Math.abs(x)>=PIT||Math.abs(z)>=PIT)gy=0;
      if(dPos[o+1]<gy+.05){dPos[o+1]=gy+.05;if(dVel[o+1]<0){dVel[o+1]*=-.34;dVel[o]*=.7;dVel[o+2]*=.7;dW[o]*=.6;dW[o+1]*=.6;dW[o+2]*=.6;
          if(Math.abs(dVel[o+1])>1.2&&G.state==='win'&&rnd()<.06)AU.ping(.35);}}
      if(dAge[i]>dDur[i]){removeD(i);continue;}
    }
    // integrate rotation
    const q=i*4,wx=dW[o],wy=dW[o+1],wz=dW[o+2],h=.5*dt;let qx=dQ[q],qy=dQ[q+1],qz=dQ[q+2],qw=dQ[q+3];
    const nx=qx+h*(wx*qw+wy*qz-wz*qy),ny=qy+h*(wy*qw+wz*qx-wx*qz),nz=qz+h*(wz*qw+wx*qy-wy*qx),nw=qw+h*(-wx*qx-wy*qy-wz*qz);
    const l=Math.hypot(nx,ny,nz,nw)||1;dQ[q]=nx/l;dQ[q+1]=ny/l;dQ[q+2]=nz/l;dQ[q+3]=nw/l;
  }
}
function uploadDyn(){let sc;for(let i=0;i<dN;i++){const t=dAge[i]/dDur[i];
    sc=dMode[i]===0?.15*(1-.55*t*t*t):.15*clamp((dDur[i]-dAge[i])*3,0,1);
    dInst.set([dPos[i*3],dPos[i*3+1],dPos[i*3+2],sc,dQ[i*4],dQ[i*4+1],dQ[i*4+2],dQ[i*4+3]],i*8);}
  gl.bindBuffer(gl.ARRAY_BUFFER,dynVB);gl.bufferSubData(gl.ARRAY_BUFFER,0,dInst,0,dN*8);}

/* ------------------------------ fx (additive) geometry ------------------------------ */
const FXMAX=9000,fxData=new Float32Array(FXMAX*9),fxVAO=gl.createVertexArray(),fxVB=gl.createBuffer();
gl.bindVertexArray(fxVAO);gl.bindBuffer(gl.ARRAY_BUFFER,fxVB);gl.bufferData(gl.ARRAY_BUFFER,fxData.byteLength,gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,36,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,36,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,36,20);gl.bindVertexArray(null);
let fxN=0;
function fxV(p,u,v,c){const o=fxN*9;fxData[o]=p[0];fxData[o+1]=p[1];fxData[o+2]=p[2];fxData[o+3]=u;fxData[o+4]=v;fxData[o+5]=c[0];fxData[o+6]=c[1];fxData[o+7]=c[2];fxData[o+8]=c[3];fxN++;}
function fxQuad(p0,p1,p2,p3,uv,c){fxV(p0,uv[0],uv[1],c);fxV(p1,uv[2],uv[3],c);fxV(p2,uv[4],uv[5],c);fxV(p0,uv[0],uv[1],c);fxV(p2,uv[4],uv[5],c);fxV(p3,uv[6],uv[7],c);}
function sprite(p,size,c,cam){const r=v3.mul(cam.r,size),u=v3.mul(cam.u,size);
  fxQuad(v3.sub(v3.sub(p,r),u),v3.sub(v3.add(p,r),u),v3.add(v3.add(p,r),u),v3.add(v3.sub(p,r),u),[-1,-1,1,-1,1,1,-1,1],c);}

/* ------------------------------ render targets ------------------------------ */
let RW=0,RH=0,sceneFBO,sceneTex,depthRB,bl=[];
function mkTex(w,h,fmt){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  if(fmt==='f')gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function mkFBO(tex){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);return f;}
let hdr=!!extCBF;
function makeTargets(w,h){
  RW=w;RH=h;const fm=hdr?'f':'b';
  sceneTex=mkTex(w,h,fm);sceneFBO=mkFBO(sceneTex);depthRB=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depthRB);
  gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthRB);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE&&hdr){hdr=false;makeTargets(w,h);return;}
  bl=[];for(const dv of[2,4]){const bw=Math.max(8,w/dv|0),bh=Math.max(8,h/dv|0),ta=mkTex(bw,bh,fm),tb=mkTex(bw,bh,fm);bl.push({w:bw,h:bh,ta,tb,fa:mkFBO(ta),fb:mkFBO(tb)});}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}
function resize(){const dpr=Math.min(window.devicePixelRatio||1,touch?1.5:1.75)*G.scale;const w=Math.max(320,Math.floor(innerWidth*dpr)),h=Math.max(200,Math.floor(innerHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;makeTargets(w,h);}}

/* ------------------------------ audio ------------------------------ */
const AU={ctx:null,master:null,hum:null,humG:null,lastPing:0,
  init(){if(this.ctx)return;try{const C=window.AudioContext||window.webkitAudioContext;this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=.5;this.master.connect(this.ctx.destination);
    const o=this.ctx.createOscillator(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();o.type='sawtooth';o.frequency.value=58;f.type='lowpass';f.frequency.value=380;g.gain.value=0;o.connect(f);f.connect(g);g.connect(this.master);o.start();
    const o2=this.ctx.createOscillator(),g2=this.ctx.createGain();o2.type='sine';o2.frequency.value=116;g2.gain.value=.35;o2.connect(g2);g2.connect(g);o2.start();this.hum=o;this.humG=g;}catch(e){}},
  setHum(v){if(this.humG)this.humG.gain.setTargetAtTime(v*.22,this.ctx.currentTime,.06);if(this.hum)this.hum.frequency.setTargetAtTime(56+v*30,this.ctx.currentTime,.1);},
  ping(v=1){if(!this.ctx)return;const t=this.ctx.currentTime;if(t-this.lastPing<.025)return;this.lastPing=t;
    const f0=1500+Math.random()*1900;for(const[m,a,d]of[[1,.5,.28],[2.76,.28,.16],[5.4,.16,.09]]){const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.value=f0*m;
      g.gain.setValueAtTime(a*v*.35,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+d+.02);}},
  note(f,t0,d,v=.3,type='triangle'){if(!this.ctx)return;const t=this.ctx.currentTime+t0,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=f;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+d+.05);},
  cash(){for(let i=0;i<9;i++)setTimeout(()=>this.ping(1),i*45);this.note(1318,.0,.35,.25);this.note(1760,.12,.5,.25);},
  buy(){this.note(660,0,.2,.25);this.note(990,.09,.3,.25);},
  win(){[523,659,784,1047,1319,1568].forEach((f,i)=>this.note(f,i*.13,.9,.28));for(let i=0;i<24;i++)setTimeout(()=>this.ping(.8),i*90);}
};

/* ------------------------------ game state ------------------------------ */
const UP={
  power:{name:'Magnet power',desc:'Pulls more coins every second',vals:[3.2,5.2,8.2,12.5,19,30],cost:[400,1400,4200,12000,34000],lvl:0,fmt:v=>v.toFixed(1)+' m³/s'},
  radius:{name:'Magnet reach',desc:'Wider pull area',vals:[1.5,1.9,2.3,2.8,3.3,4],cost:[300,1100,3500,10000,28000],lvl:0,fmt:v=>v.toFixed(1)+' m'},
  battery:{name:'Battery',desc:'Longer pulling before it needs a rest',vals:[7,5.4,4.2,3.2,2.4,1.8],cost:[300,1000,3200,9500,28000],lvl:0,fmt:v=>(100/v).toFixed(0)+' s'},
  bag:{name:'Bag size',desc:'Carry more coins per trip',vals:[25000,50000,100000,200000,400000,800000],cost:[350,1200,3800,11000,31000],lvl:0,fmt:v=>fmt(v)}
};
const G={state:'menu',scale:1,x:0,y:1.7,z:26,yaw:0,pitch:-.08,eye:0,vy:0,
  money:0,bag:0,battery:100,overheat:false,deposited:0,moved:0,pulling:false,time:0,tStart:0,
  tip:[0,0,0],aim:null,aimD:0,keys:{},joy:[0,0],lookDX:0,lookDY:0,act:false,
  shake:0,flash:0,winT:0,exposed:false,toastT:0,bob:0,fps:60,fpsT:0,fpsN:0,pull:0,stickY:0,upgOpen:false};
function camBasis(){const sy=Math.sin(G.yaw),cy=Math.cos(G.yaw),sp=Math.sin(G.pitch),cp=Math.cos(G.pitch);
  const f=[sy*cp,sp,-cy*cp],r=[cy,0,sy];return{f,r,u:v3.cross(r,f)};}
function groundAt(x,z){return(Math.abs(x)<PIT&&Math.abs(z)<PIT)?Math.max(sampleH(x,z)-.1,FLOOR):0;}
function railBlocked(x,z){const m=Math.max(Math.abs(x),Math.abs(z));if(m<PIT-.75||m>PIT-.0)return false;
  if(z>0&&Math.abs(z)>=Math.abs(x)&&Math.abs(x)<3.2)return false;return true;}
function machineBlocked(x,z){return Math.hypot(x-MACHINE.x,z-MACHINE.z)<1.9;}
function toast(t,ms=1800){const e=$('toast');e.textContent=t;e.classList.add('on');G.toastT=ms/1000;}
function stickWorld(){return[STICK.x,FLOOR+STICK.r,STICK.z];}
function stickDirXZ(){return[Math.cos(STICK.yaw),-Math.sin(STICK.yaw)];}

/* ------------------------------ update ------------------------------ */
function updatePlayer(dt){
  const{f,r}=camBasis();let mx=0,mz=0;const k=G.keys;
  if(k.KeyW||k.ArrowUp)mz+=1;if(k.KeyS||k.ArrowDown)mz-=1;if(k.KeyD||k.ArrowRight)mx+=1;if(k.KeyA||k.ArrowLeft)mx-=1;
  mx+=G.joy[0];mz+=-G.joy[1];const l=Math.hypot(mx,mz);if(l>1){mx/=l;mz/=l;}
  const inPit=Math.abs(G.x)<PIT&&Math.abs(G.z)<PIT;
  const sp=(k.ShiftLeft||k.ShiftRight||Math.hypot(G.joy[0],G.joy[1])>.92?7.4:4.6)*(inPit?.62:1);
  const ff=[Math.sin(G.yaw),-Math.cos(G.yaw)],rr=[Math.cos(G.yaw),Math.sin(G.yaw)];
  const vx=(ff[0]*mz+rr[0]*mx)*sp*dt,vz=(ff[1]*mz+rr[1]*mx)*sp*dt;
  let nx=G.x+vx;if(!railBlocked(nx,G.z)&&!machineBlocked(nx,G.z)&&Math.abs(nx)<HALL-1.2)G.x=nx;
  let nz=G.z+vz;if(!railBlocked(G.x,nz)&&!machineBlocked(G.x,nz)&&Math.abs(nz)<HALL-1.2)G.z=nz;
  const g=groundAt(G.x,G.z);const target=g;
  if(target>G.eye)G.eye=Math.min(target,G.eye+14*dt+(target-G.eye)*8*dt);else{G.vy-=22*dt;G.eye=Math.max(target,G.eye+G.vy*dt);if(G.eye<=target)G.vy=0;}
  if(G.eye>=target)G.vy=Math.min(G.vy,0);
  if(l>.1)G.bob+=dt*sp*1.9;
}
function updateMagnet(dt){
  const{f,r,u}=camBasis();const cam=[G.x,G.eye+1.68,G.z];
  const hit=rayPile(cam,f,26);G.aim=null;
  if(hit>0){G.aim=[cam[0]+f[0]*hit,cam[1]+f[1]*hit,cam[2]+f[2]*hit];G.aimD=hit;}
  const up=UP;const rate=up.power.vals[up.power.lvl],rad=up.radius.vals[up.radius.lvl],drain=up.battery.vals[up.battery.lvl],cap=up.bag.vals[up.bag.lvl];
  const wantPull=G.pulling&&G.state==='play';
  let active=false;
  if(wantPull&&G.aim&&!G.overheat&&G.battery>0&&G.bag<cap){
    active=true;G.battery=Math.max(0,G.battery-drain*dt);
    const falloff=Math.pow(clamp(1-G.aimD/30,.15,1),.7);
    const want=rate*dt*falloff;const room=(cap-G.bag)*coinBulk;
    const got=pullPile(G.aim[0],G.aim[2],rad,Math.min(want,room));
    const coins=got/coinBulk;G.bag+=coins;G.moved+=coins;
    const n=Math.min(7,Math.round(coins/ (rate*dt/coinBulk)*(3+rate*.35)*(dt*60)*.6+Math.random()));
    for(let i=0;i<n;i++){const a=Math.random()*TAU,d=Math.sqrt(Math.random())*rad;const x=G.aim[0]+Math.cos(a)*d,z=G.aim[2]+Math.sin(a)*d;spawnCollect(x,Math.max(sampleH(x,z),FLOOR)+.1,z);}
    if(G.battery<=0){G.overheat=true;toast('BATTERY EMPTY — resting…');}
  }else{
    G.battery=Math.min(100,G.battery+(G.overheat?9:14)*dt);if(G.overheat&&G.battery>=30)G.overheat=false;
    if(wantPull&&G.bag>=cap&&G.aim&&Math.random()<dt*2)toast('BAG FULL — go to the deposit machine!');
  }
  G.pull+=((active?1:0)-G.pull)*Math.min(1,dt*9);AU.setHum(G.pull);
  G.active=active;
}
function updateStick(){
  const sx=STICK.x,sz=STICK.z,d=stickDirXZ();let mx=-1e9;
  for(const[a,b]of[[0,0],[.5,0],[-.5,0],[0,.4],[0,-.4]])mx=Math.max(mx,sampleH(sx+d[0]*a*1.4-d[1]*b*.7*0+(-d[1])*b,sz+d[1]*a*1.4+d[0]*b)-FLOOR);
  G.stickY=sampleH(sx,sz)-FLOOR;G.exposed=mx<.62;
}
function deposit(){
  if(G.bag<1){toast('Your bag is empty');return;}
  const c=Math.floor(G.bag);G.deposited+=c;G.money+=Math.floor(c*.04);G.bag=0;AU.cash();G.flash=.15;toast('+'+fmt(c*.04)+'$',1400);
  for(let i=0;i<40;i++)setTimeout(()=>{},0);
}
function doAction(){
  if(G.state!=='play')return;
  const near=Math.hypot(G.x-MACHINE.x,G.z-MACHINE.z)<4.2;
  if(near){deposit();return;}
  if(G.exposed&&Math.hypot(G.x-STICK.x,G.z-STICK.z)<5.5)startWin();
}
function buy(k){const u=UP[k];if(u.lvl>=u.vals.length-1)return;const c=u.cost[u.lvl];if(G.money<c)return;G.money-=c;u.lvl++;AU.buy();renderUpg();}
function renderUpg(){$('upgMoney').textContent=fmt(G.money)+'$';const rows=$('urows');rows.innerHTML='';
  for(const k in UP){const u=UP[k],max=u.lvl>=u.vals.length-1;const el=document.createElement('div');el.className='urow';
    el.innerHTML=`<div class="t"><span class="stroke">${u.name}</span> <small>${u.desc} · now ${u.fmt(u.vals[u.lvl])}${max?'':' → '+u.fmt(u.vals[u.lvl+1])}</small><div class="pips">${u.vals.map((_,i)=>`<i class="${i<=u.lvl?'f':''}"></i>`).join('')}</div></div>`;
    const b=document.createElement('button');b.className='ubtn stroke';b.textContent=max?'MAX':fmt(u.cost[u.lvl])+'$';b.disabled=max||G.money<u.cost[u.lvl];b.onclick=()=>buy(k);el.appendChild(b);rows.appendChild(el);}}
function openUpg(v){G.upgOpen=v;$('upgScreen').classList.toggle('on',v);if(v){renderUpg();if(document.pointerLockElement)document.exitPointerLock();G.prevState=G.state;G.state='upg';}else if(G.state==='upg'){G.state='play';lockPointer();}}

/* ------------------------------ victory ------------------------------ */
function startWin(){
  G.state='win';G.winT=0;G.flash=1;AU.win();AU.setHum(0);document.exitPointerLock&&document.pointerLockElement&&document.exitPointerLock();
  G.winFrom=[G.x,G.eye+1.68,G.z,G.yaw,G.pitch];$('hud').classList.remove('on');G.pulling=false;
  const t=Math.floor((performance.now()-G.tStart)/1000);G.timeTxt=Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s';
}
function updateWin(dt){
  G.winT+=dt;const t=G.winT,sp=stickWorld();
  if(t<3.2&&dN<DMAX-120)for(let i=0;i<46;i++)spawnFountain(sp[0],sp[1]+1.2+Math.min(t,2)*1.2,sp[2],9+Math.random()*6);
  if(t>.2&&t<4&&Math.random()<dt*8)AU.ping(.5);
  if(t>3.2&&!G.winShown){G.winShown=true;
    $('winStats').innerHTML=`Time <b style="color:#ffd24a">${G.timeTxt}</b> · Coins moved <b style="color:#ffd24a">${fmt(G.moved)}</b> · Deposited <b style="color:#ffd24a">${fmt(G.deposited)}</b><br>Cash earned <b style="color:#ffd24a">${fmt(G.money)}$</b>`;
    $('win').classList.add('on');}
}
function winCamera(){
  const t=G.winT,sp=stickWorld(),rise=Math.min(1,t/2.4),e=rise*rise*(3-2*rise);
  const cy=sp[1]+.2+e*2.4,ang=-.9+t*.35,R=lerp(Math.hypot(G.winFrom[0]-sp[0],G.winFrom[2]-sp[2]),6.2,clamp(t/2.2,0,1));
  const tgt=[sp[0],sp[1]+.4+e*2.2,sp[2]];
  const from=[G.winFrom[0],G.winFrom[1],G.winFrom[2]],to=[sp[0]+Math.sin(ang)*R,sp[1]+3.1+e*1.2,sp[2]+Math.cos(ang)*R],k=clamp(t/2.2,0,1),ks=k*k*(3-2*k);
  const pos=[lerp(from[0],to[0],ks),lerp(from[1],to[1],ks),lerp(from[2],to[2],ks)];
  const f=v3.norm(v3.sub(tgt,pos));return{pos,f,stickY:sp[1]+e*2.4,spin:t*2.2,e};
}

/* ------------------------------ render ------------------------------ */
const camV=new Float32Array(16);
function setLights(p){gl.uniform4fv(p.u.uLights,LIGHT_ARR);}
const LIGHT_ARR=new Float32Array(LIGHTS.flat());
const FOGCOL=[.17,.095,.045];
function commonUniforms(p,cam,time,glow){gl.uniform3fv(p.u.uCam,cam);gl.uniform4fv(p.u.uLights,LIGHT_ARR);gl.uniform3fv(p.u.uFogCol,FOGCOL);gl.uniform1f(p.u.uFog,.011);gl.uniform4fv(p.u.uGlow,glow);gl.uniform1f(p.u.uTime,time);}
function magnetModel(cb,t){
  const bobx=Math.sin(G.bob)*.012,boby=Math.abs(Math.cos(G.bob))*.012;
  const pull=G.pull,jx=pull*(Math.random()-.5)*.006,jy=pull*(Math.random()-.5)*.006;
  const camM=M.basis(cb.r,cb.u,[-cb.f[0],-cb.f[1],-cb.f[2]],G.cam);
  let m=M.mul(camM,M.trans(.30+bobx+jx,-.26+boby+jy,-.8+pull*.05));
  m=M.mul(m,M.rotY(-.3));m=M.mul(m,M.rotX(.82-pull*.06));m=M.mul(m,M.rotZ(.22));m=M.mul(m,M.scale(1.5));return m;
}
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-(G.last||now))/1000||.016);G.last=now;G.time+=dt;
  // adaptive quality
  G.fpsT+=dt;G.fpsN++;if(G.fpsT>2.5){G.fps=G.fpsN/G.fpsT;G.fpsT=0;G.fpsN=0;
    if(!DEBUG&&G.state==='play'){if(G.fps<30&&shellQ>.45){shellQ=Math.max(.45,shellQ-.2);shellN=Math.floor(SHELL_MAX*shellQ);}else if(G.fps<24&&G.scale>.6){G.scale=Math.max(.6,G.scale-.15);}}}
  resize();
  const playing=G.state==='play',win=G.state==='win';
  if(playing){G.yaw+=G.lookDX;G.pitch=clamp(G.pitch-G.lookDY,-1.5,1.5);G.lookDX=G.lookDY=0;
    updatePlayer(dt);updateMagnet(dt);}
  else{G.lookDX=G.lookDY=0;G.pull*=.9;AU.setHum(G.state==='win'?0:G.pull);}
  if(G.state!=='menu'&&G.state!=='pause')G.battery=Math.min(100,G.battery);
  // pile physics
  if(hfDirty>0){erode(2);hfDirty--;gl.bindTexture(gl.TEXTURE_2D,hfTex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,HN,HN,gl.RED,gl.FLOAT,hf);updateStick();}
  else if(G.first!==true){G.first=true;gl.bindTexture(gl.TEXTURE_2D,hfTex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,HN,HN,gl.RED,gl.FLOAT,hf);updateStick();}
  if(win)updateWin(dt);
  arrivedThisFrame=0;updateDyn(dt);if(arrivedThisFrame){G.flash=Math.max(G.flash,0);for(let i=0;i<Math.min(arrivedThisFrame,3);i++)AU.ping(.5);}
  // camera
  let camPos,cb,stickModelY=STICK.r+FLOOR,spin=STICK.yaw,glowI=0;
  if(win){const w=winCamera();camPos=w.pos;const f=w.f,r=v3.norm(v3.cross(f,[0,1,0])),u=v3.cross(r,f);cb={f,r,u};stickModelY=w.stickY;spin=STICK.yaw+w.spin;glowI=1;}
  else{const b=camBasis();cb=b;camPos=[G.x,G.eye+1.68+Math.sin(G.bob)*.025*(playing?1:0),G.z];}
  G.cam=camPos;
  const shk=G.shake;
  const view=M.view(cb.r,cb.u,cb.f,camPos),proj=M.persp(touch?1.15:1.05,canvas.width/canvas.height,.08,160),VP=M.mul(proj,view);
  const mm=magnetModel(cb,G.time);G.mm=mm;
  G.tip=M.pt(mm,0,-.2,0);
  // HUD
  if(playing||G.state==='upg')updateHUD(dt);
  if(G.flash>0.002)G.flash*=Math.pow(.02,dt);$('flash').style.opacity=Math.min(1,G.flash*.7);
  // ----- draw -----
  gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFBO);gl.viewport(0,0,RW,RH);
  gl.clearColor(FOGCOL[0],FOGCOL[1],FOGCOL[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  const sp=stickWorld();const glow=G.exposed||win?[sp[0],sp[1]+.6,sp[2],win?10:5]:[0,0,0,0];
  // hall + machine
  let p=P.lit;gl.useProgram(p.p);commonUniforms(p,camPos,G.time,glow);gl.uniformMatrix4fv(p.u.uVP,false,VP);gl.uniformMatrix4fv(p.u.uModel,false,M.id());
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texArr);gl.uniform1i(p.u.uTex,0);
  gl.bindVertexArray(hallMesh.vao);gl.drawElements(gl.TRIANGLES,hallMesh.count,gl.UNSIGNED_INT,0);
  gl.bindVertexArray(machineMesh.vao);gl.drawElements(gl.TRIANGLES,machineMesh.count,gl.UNSIGNED_INT,0);
  // stick
  const sm=M.mul(M.trans(sp[0],stickModelY,sp[2]),M.mul(M.rotY(spin),win?M.rotZ(Math.min(1.45,G.winT*1.1)*0):M.id()));
  let smm=sm;if(win){smm=M.mul(M.trans(sp[0],stickModelY,sp[2]),M.mul(M.rotY(spin),M.rotZ(Math.min(1.5,G.winT*1.2))));}
  gl.uniformMatrix4fv(p.u.uModel,false,smm);gl.bindVertexArray(stickMesh.vao);gl.drawElements(gl.TRIANGLES,stickMesh.count,gl.UNSIGNED_INT,0);
  // machine screen
  drawScreen(G.deposited);
  p=P.scr;gl.useProgram(p.p);gl.uniformMatrix4fv(p.u.uVP,false,VP);gl.bindTexture(gl.TEXTURE_2D,scrTex);gl.uniform1i(p.u.uT,0);gl.bindVertexArray(screenQuad);gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0);
  // coin shell
  p=P.shell;gl.useProgram(p.p);commonUniforms(p,camPos,G.time,glow);gl.uniformMatrix4fv(p.u.uVP,false,VP);
  const sd=stickDirXZ();gl.uniform4f(p.u.uStick,STICK.x,STICK.z,sd[0],sd[1]);gl.uniform1f(p.u.uStickLen,STICK.len*.5);gl.uniform1f(p.u.uFloor,FLOOR);gl.uniform1f(p.u.uHS,PIT*2);gl.uniform1f(p.u.uN,HN);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,hfTex);gl.uniform1i(p.u.uHF,0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texCoinA);gl.uniform1i(p.u.uCA,1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texCoinN);gl.uniform1i(p.u.uCN,2);
  gl.bindVertexArray(shellVAO);gl.drawElementsInstanced(gl.TRIANGLES,coinGeo.count,gl.UNSIGNED_SHORT,0,shellN);
  // dynamic coins
  if(dN>0){uploadDyn();p=P.dyn;gl.useProgram(p.p);commonUniforms(p,camPos,G.time,glow);gl.uniformMatrix4fv(p.u.uVP,false,VP);
    gl.uniform1i(p.u.uCA,1);gl.uniform1i(p.u.uCN,2);gl.bindVertexArray(dynVAO);gl.drawElementsInstanced(gl.TRIANGLES,coinGeo.count,gl.UNSIGNED_SHORT,0,dN);}
  gl.activeTexture(gl.TEXTURE0);
  // magnet viewmodel on top of everything
  if(!win){gl.clear(gl.DEPTH_BUFFER_BIT);p=P.lit;gl.useProgram(p.p);commonUniforms(p,camPos,G.time,[0,0,0,0]);gl.uniformMatrix4fv(p.u.uVP,false,VP);gl.uniformMatrix4fv(p.u.uModel,false,mm);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,texArr);gl.uniform1i(p.u.uTex,0);gl.bindVertexArray(magnetMesh.vao);gl.drawElements(gl.TRIANGLES,magnetMesh.count,gl.UNSIGNED_INT,0);}
  // additive effects
  fxN=0;buildFx(cb,camPos,win);
  if(fxN>0){gl.bindBuffer(gl.ARRAY_BUFFER,fxVB);gl.bufferSubData(gl.ARRAY_BUFFER,0,fxData,0,fxN*9);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);p=P.fx;gl.useProgram(p.p);gl.uniformMatrix4fv(p.u.uVP,false,VP);gl.bindVertexArray(fxVAO);
    let off=0;for(const seg of G.fxSegs){gl.uniform1i(p.u.uKind,seg.kind);gl.drawArrays(gl.TRIANGLES,seg.start,seg.n);}
    gl.depthMask(true);gl.disable(gl.BLEND);}
  // ----- bloom -----
  gl.disable(gl.DEPTH_TEST);
  const exposure=win?1+Math.max(0,1-G.winT*.8)*.25:1;
  p=P.extract;gl.useProgram(p.p);gl.activeTexture(gl.TEXTURE0);
  let src=sceneTex,sw=RW,sh=RH;
  for(let i=0;i<bl.length;i++){const b=bl[i];gl.bindFramebuffer(gl.FRAMEBUFFER,b.fa);gl.viewport(0,0,b.w,b.h);gl.useProgram(P.extract.p);gl.bindTexture(gl.TEXTURE_2D,src);
    gl.uniform1i(P.extract.u.uSrc,0);gl.uniform2f(P.extract.u.uTexel,1/sw,1/sh);gl.uniform1f(P.extract.u.uThr,i?0.0:.9);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.useProgram(P.blur.p);gl.uniform1i(P.blur.u.uSrc,0);
    for(let k=0;k<2;k++){gl.bindFramebuffer(gl.FRAMEBUFFER,b.fb);gl.bindTexture(gl.TEXTURE_2D,b.ta);gl.uniform2f(P.blur.u.uDir,1/b.w,0);gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,b.fa);gl.bindTexture(gl.TEXTURE_2D,b.tb);gl.uniform2f(P.blur.u.uDir,0,1/b.h);gl.drawArrays(gl.TRIANGLES,0,3);}
    src=b.ta;sw=b.w;sh=b.h;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
  p=P.comp;gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sceneTex);gl.uniform1i(p.u.uScene,0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,bl[0].ta);gl.uniform1i(p.u.uB1,1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,bl[1].ta);gl.uniform1i(p.u.uB2,2);
  gl.uniform2f(p.u.uTexel,1/RW,1/RH);gl.uniform1f(p.u.uExp,exposure*(hdr?1.05:1.15));gl.uniform1f(p.u.uFlash,0);
  gl.drawArrays(gl.TRIANGLES,0,3);gl.activeTexture(gl.TEXTURE0);
  if(G.toastT>0){G.toastT-=dt;if(G.toastT<=0)$('toast').classList.remove('on');}
}
/* beams, sparks, halos, pillar */
function buildFx(cb,cam,win){
  G.fxSegs=[];const c={r:cb.r,u:cb.u};
  // lamp halos (sprites)
  let start=fxN;
  for(const l of WALLAMPS){if(v3.len(v3.sub(l,cam))<60)sprite([l[0],l[1],l[2]],1.5,[1,.72,.38,.35],c);}
  for(const l of LIGHTS.slice(0,4))sprite([l[0],l[1]-.25,l[2]],1.9,[1,.75,.4,.5],c);
  const sp=stickWorld();
  if(G.exposed&&!win)sprite([sp[0],sp[1]+.5,sp[2]],1.0+Math.sin(G.time*4)*.1,[1,.85,.4,.35],c);
  if(win){const g=Math.min(1,G.winT/1.2);sprite([sp[0],sp[1]+Math.min(G.winT,2.4)*1.0+.6,sp[2]],3.2*g,[1,.85,.45,.4],c);}
  // sparks on the pulled area
  if(G.active&&G.aim){for(let i=0;i<22;i++){const a=Math.random()*TAU,d=Math.random()*UP.radius.vals[UP.radius.lvl];
      const p=[G.aim[0]+Math.cos(a)*d,G.aim[1]+.2+Math.random()*1.2,G.aim[2]+Math.sin(a)*d];sprite(p,.03+Math.random()*.05,[1,.85,.4,1.2],c);}
    sprite([G.aim[0],G.aim[1]+.3,G.aim[2]],.7,[.5,.8,1,.35],c);
    sprite(G.tip,.22,[.6,.9,1,.7],c);}
  if(fxN>start)G.fxSegs.push({kind:1,start,n:fxN-start});
  // beams
  start=fxN;
  if(G.active&&G.aim){const tip=G.tip,aim=G.aim,N=26,dir=v3.sub(aim,tip),len=v3.len(dir),dn=v3.norm(dir);
    const side=v3.norm(v3.cross(dn,cb.f));const up2=v3.cross(dn,side);
    for(let b=0;b<6;b++){let prev=null;const w=(b<2?.06:.028),col=b%2?[.35,.7,1,.8]:[.7,.9,1,.8],ph=G.time*(20+b*4.3)+b*7.1;
      for(let i=0;i<=N;i++){const t=i/N,amp=Math.sin(t*Math.PI)*(.22+.08*b)*Math.min(1,len/6);
        const nA=(Math.sin(ph+t*17+b)+Math.sin(ph*1.7+t*31))*.5,nB=(Math.cos(ph*1.3+t*13)+Math.sin(ph*.8+t*27+b))*.5;
        const base=[lerp(tip[0],aim[0],t),lerp(tip[1],aim[1],t),lerp(tip[2],aim[2],t)];
        const pt=[base[0]+(side[0]*nA+up2[0]*nB)*amp,base[1]+(side[1]*nA+up2[1]*nB)*amp,base[2]+(side[2]*nA+up2[2]*nB)*amp];
        const view=v3.norm(v3.sub(pt,cam)),sdv=v3.norm(v3.cross(i<N?dn:dn,view)),a=[pt[0]+sdv[0]*w,pt[1]+sdv[1]*w,pt[2]+sdv[2]*w],bb=[pt[0]-sdv[0]*w,pt[1]-sdv[1]*w,pt[2]-sdv[2]*w];
        if(prev)fxQuad(prev[0],prev[1],bb,a,[0,-1,0,1,1,1,1,-1].slice(0,8),col);
        prev=[a,bb];}
    }}
  if(fxN>start)G.fxSegs.push({kind:0,start,n:fxN-start});
  // light pillar on the stick
  start=fxN;
  if(G.exposed||win){const h=win?18:7,w=(win?.7:.35),pul=(win?.32:.28)+.12*Math.sin(G.time*3);
    for(const ang of[0,Math.PI/2]){const dx=Math.cos(ang)*w,dz=Math.sin(ang)*w;
      fxQuad([sp[0]-dx,sp[1],sp[2]-dz],[sp[0]+dx,sp[1],sp[2]+dz],[sp[0]+dx,sp[1]+h,sp[2]+dz],[sp[0]-dx,sp[1]+h,sp[2]-dz],[-1,0,1,0,1,1,-1,1],[1,.82,.4,.8*pul]);}}
  if(fxN>start)G.fxSegs.push({kind:2,start,n:fxN-start});
}

/* ------------------------------ HUD ------------------------------ */
let hudCache={};
function setT(id,v){if(hudCache[id]!==v){hudCache[id]=v;$(id).textContent=v;}}
function updateHUD(dt){
  const cap=UP.bag.vals[UP.bag.lvl];
  setT('moneyV',fmt(G.money)+'$');setT('coinsLeft',fmt(Math.max(0,1000000-G.moved)));
  setT('depth',G.exposed?'EXPOSED!':(Math.max(0,G.stickY-.1)).toFixed(1)+' m');
  $('barBag').firstElementChild.style.height=Math.round(clamp(G.bag/cap,0,1)*100)+'%';
  $('barBat').firstElementChild.style.height=Math.round(G.battery)+'%';
  $('barBat').firstElementChild.style.background=G.overheat?'linear-gradient(#ff6a4d,#c43a1f)':'';
  const nearM=Math.hypot(G.x-MACHINE.x,G.z-MACHINE.z)<4.2,nearS=G.exposed&&Math.hypot(G.x-STICK.x,G.z-STICK.z)<5.5;
  const pr=$('prompt');
  if(nearS){pr.textContent=touch?'TAP E — GRAB THE STICK!':'PRESS E — GRAB THE STICK!';pr.classList.add('on');}
  else if(nearM){pr.textContent=(touch?'TAP E':'PRESS E')+' — DEPOSIT '+fmt(G.bag)+' COINS';pr.classList.add('on');}
  else pr.classList.remove('on');
}

/* ------------------------------ input ------------------------------ */
function lockPointer(){if(touch||DEBUG)return;try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(e){}}
function begin(){AU.init();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();$('start').classList.remove('on');$('pause').classList.remove('on');$('hud').classList.add('on');G.state='play';if(!G.tStart)G.tStart=performance.now();lockPointer();}
function pauseGame(){if(G.state!=='play')return;G.state='pause';G.pulling=false;$('pause').classList.add('on');if(document.pointerLockElement)document.exitPointerLock();}
$('playBtn').onclick=begin;$('resumeBtn').onclick=begin;
$('pauseBtn').onclick=pauseGame;
$('upgBtn').onclick=()=>openUpg(true);$('upgBtn2').onclick=()=>{$('pause').classList.remove('on');G.state='play';openUpg(true);};
$('upgClose').onclick=()=>{openUpg(false);};
$('againBtn').onclick=()=>location.reload();
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&G.state==='play'&&!touch&&!DEBUG)pauseGame();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&G.state==='play'){G.lookDX+=e.movementX*.0023;G.lookDY+=e.movementY*.0023;}});
canvas.addEventListener('mousedown',e=>{if(G.state==='play'&&e.button===0){G.pulling=true;AU.init();}});
window.addEventListener('mouseup',e=>{if(e.button===0)G.pulling=false;});
window.addEventListener('keydown',e=>{G.keys[e.code]=true;
  if(e.code==='KeyE'&&!e.repeat)doAction();
  if(e.code==='KeyU'&&!e.repeat&&(G.state==='play'||G.state==='upg'))openUpg(!G.upgOpen);
  if((e.code==='KeyP')&&!e.repeat){if(G.state==='play')pauseGame();}
  if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();});
window.addEventListener('keyup',e=>{G.keys[e.code]=false;});
window.addEventListener('blur',()=>{G.keys={};G.pulling=false;});
// touch controls
(function(){const joy=$('joy'),knob=joy.firstElementChild;let jid=null,lid=null,lx=0,ly=0;
  joy.addEventListener('pointerdown',e=>{jid=e.pointerId;joy.setPointerCapture(e.pointerId);mv(e);});
  const mv=e=>{if(e.pointerId!==jid)return;const r=joy.getBoundingClientRect(),dx=(e.clientX-(r.left+r.width/2))/(r.width/2),dy=(e.clientY-(r.top+r.height/2))/(r.height/2),l=Math.hypot(dx,dy),k=l>1?1/l:1;
    G.joy=[dx*k,dy*k];knob.style.transform=`translate(${dx*k*40}px,${dy*k*40}px)`;};
  joy.addEventListener('pointermove',mv);const up=e=>{if(e.pointerId===jid){jid=null;G.joy=[0,0];knob.style.transform='';}};joy.addEventListener('pointerup',up);joy.addEventListener('pointercancel',up);
  $('btnMag').addEventListener('pointerdown',e=>{G.pulling=true;AU.init();e.preventDefault();});const mu=()=>{G.pulling=false;};$('btnMag').addEventListener('pointerup',mu);$('btnMag').addEventListener('pointercancel',mu);$('btnMag').addEventListener('pointerleave',mu);
  $('btnAct').addEventListener('pointerdown',e=>{doAction();e.preventDefault();});
  canvas.addEventListener('pointerdown',e=>{if(!touch||e.pointerType==='mouse')return;lid=e.pointerId;lx=e.clientX;ly=e.clientY;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==lid)return;G.lookDX+=(e.clientX-lx)*.0052;G.lookDY+=(e.clientY-ly)*.0052;lx=e.clientX;ly=e.clientY;});
  const lu=e=>{if(e.pointerId===lid)lid=null;};canvas.addEventListener('pointerup',lu);canvas.addEventListener('pointercancel',lu);})();
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
if(touch){shellQ=.6;shellN=Math.floor(SHELL_MAX*shellQ);G.scale=.85;}

/* ------------------------------ boot ------------------------------ */
initPile();
setTimeout(()=>{$('loading').style.display='none';},120);
if(DEBUG){window.__mc={G,UP,hf,sampleH,pullPile,erode,STICK,FLOOR,begin,setCam(x,y,z,yaw,pitch){G.x=x;G.eye=y;G.z=z;G.yaw=yaw;G.pitch=pitch;},
  carve(x,z,r,d){for(let j=0;j<HN;j++)for(let i=0;i<HN;i++){const dd=Math.hypot(cellX(i)-x,cellX(j)-z);if(dd<r)hf[j*HN+i]=Math.max(FLOOR,Math.min(hf[j*HN+i],FLOOR+d+(dd/r)*(dd/r)*7));}hfDirty=2;},
  setStat(k,v){G[k]=v;},startWin,deposit,get dN(){return dN;},get V(){return pileVolume();},get V0(){return V0;},get bulk(){return coinBulk;}};
  G.state='play';$('start').classList.remove('on');$('hud').classList.add('on');}
requestAnimationFrame(frame);
})();
