const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GLTFLoader-C8Ag2Ruc.js","assets/three.module-CibWwfTb.js","assets/DRACOLoader-LNaB3iNp.js"])))=>i.map(i=>d[i]);
var Th=Object.defineProperty;var Eh=(e,t,a)=>t in e?Th(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a;var k=(e,t,a)=>Eh(e,typeof t!="symbol"?t+"":t,a);import{L as $n,_ as Ec,r as Ct,w as Rh,S as Rc,j as sa}from"./index-DZPK8DSy.js";import{S as ci,O as Ir,W as Ot,C as Ve,R as ai,L as ze,H as Da,a as Rt,b as wt,M as pa,P as Ui,c as _,D as Ma,d as aa,e as ku,F as Cr,N as zo,f as Ah,g as ot,U as Ut,B as Lr,h as Ha,i as _u,V as B,j as Ac,k as Pa,I as kh,T as Nr,l as Ga,m as Ne,n as ma,o as Xn,p as _h,q as Fh,r as _e,s as Go,t as Uo,u as Qs,v as _s,w as Dh,E as zr,x as Fu,y as Is,z as Ur,A as Br,G as Du,J as Ph,K as Ih,Q as Pu,X as Ch,Y as si,Z as qs,_ as Lh,$ as Nh,a0 as zh,a1 as Uh,a2 as Bh,a3 as jn,a4 as Oh,a5 as Hh,a6 as Iu,a7 as _i,a8 as qn,a9 as Gh,aa as Kh,ab as Wh,ac as Vh,ad as Yh,ae as $h}from"./three.module-CibWwfTb.js";import{n as Xh,p as jh,a as qh,b as Zh,D as Zs,f as Bo,c as Cu}from"./types-CZu1tyoc.js";const Co=6360,Or=60,Lu=8,Nu=1.2,ii=[.005802,.013558,.0331],Qh=.003996,Lo=.00444,oi=[65e-5,.001881,85e-6],Jh=.8,os=64,Fs=32,ni=-.2,ed=192,td=108,ri=[5.25,5.05,4.8],ad=.4,Zn=.4,sd=.72;function id(e){return Math.max(0,1-Math.abs(e-25)/15)}function zu(e,t){const a=Co+e,s=Co+Or,i=a*a*(t*t-1)+s*s,o=Math.max(0,-a*t+Math.sqrt(Math.max(0,i))),l=48,u=o/l;let r=0,c=0,h=0;for(let v=0;v<l;v++){const x=(v+.5)*u,y=Math.max(0,Math.sqrt(a*a+x*x+2*a*x*t)-Co);r+=Math.exp(-y/Lu)*u,c+=Math.exp(-y/Nu)*u,h+=id(y)*u}return[ii[0]*r+Lo*c+oi[0]*h,ii[1]*r+Lo*c+oi[1]*h,ii[2]*r+Lo*c+oi[2]*h]}function Uu(e,t){const a=zu(Math.max(0,e),Math.max(ni,t));return[Math.exp(-a[0]),Math.exp(-a[1]),Math.exp(-a[2])]}function od(e,t,a){const s=Uu(e,t),i=[1.404,1.287,1.17];return a.set(.5*i[0]+.5*ri[0]*s[0]/Math.PI,.5*i[1]+.5*ri[1]*s[1]/Math.PI,.5*i[2]+.5*ri[2]*s[2]/Math.PI)}function nd(){const e=new Uint16Array(os*Fs*4);for(let a=0;a<Fs;a++){const s=a/(Fs-1),i=s*s*Or;for(let o=0;o<os;o++){const l=ni+o/(os-1)*(1-ni),u=zu(i,l),r=(a*os+o)*4;e[r]=Ma.toHalfFloat(Math.exp(-u[0])),e[r+1]=Ma.toHalfFloat(Math.exp(-u[1])),e[r+2]=Ma.toHalfFloat(Math.exp(-u[2])),e[r+3]=Ma.toHalfFloat(1)}}const t=new aa(e,os,Fs,Rt,Da);return t.minFilter=ze,t.magFilter=ze,t.wrapS=Ve,t.wrapT=Ve,t.generateMipmaps=!1,t.flipY=!1,t.needsUpdate=!0,t}function mt(e){const t=e.toPrecision(8);return/[.e]/.test(t)?t:`${t}.0`}const Ko=`
const float ATM_RG = ${mt(Co)};
const float ATM_TOP = ${mt(Or)};
const float ATM_HR = ${mt(Lu)};
const float ATM_HM = ${mt(Nu)};
const vec3 ATM_BETA_R = vec3(${mt(ii[0])}, ${mt(ii[1])}, ${mt(ii[2])});
const float ATM_BETA_MS = ${mt(Qh)};
const float ATM_BETA_ME = ${mt(Lo)};
const vec3 ATM_BETA_O = vec3(${mt(oi[0])}, ${mt(oi[1])}, ${mt(oi[2])});
const vec3 ATM_SUN = vec3(${mt(ri[0])}, ${mt(ri[1])}, ${mt(ri[2])});
const float ATM_PI = 3.14159265;
// Multiple scattering, approximated: an isotropic share on top of the phase function, larger
// where the air scatters more (blue), and part of the light scattered out of a path counted as
// returning to it. Without this a single-scattering horizon turns yellow-green.
const vec3 ATM_MS = vec3(0.020, 0.030, 0.055);
const vec3 ATM_RETURN = vec3(0.92, 0.82, 0.62);

float atmRayleighPhase(float c) {
  return 3.0 / (16.0 * ATM_PI) * (1.0 + c * c);
}

float atmMiePhase(float c) {
  const float g = ${mt(Jh)};
  float g2 = g * g;
  return 3.0 / (8.0 * ATM_PI) * ((1.0 - g2) * (1.0 + c * c))
       / ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}

// Optical depth of a straight segment of length distKm between altitudes h0 and h1 (km), for an
// exponential layer of scale height H. Exact when altitude changes linearly along the segment.
float atmLayerDepth(float h0, float h1, float distKm, float H) {
  float dh = h1 - h0;
  float e0 = exp(-max(h0, 0.0) / H);
  float e1 = exp(-max(h1, 0.0) / H);
  return distKm * (abs(dh) < 0.02 ? e0 : H * (e0 - e1) / dh);
}

// Aerial perspective between the camera and a surface point (true scale, km).
// Returns the transmittance of the segment; inscatter receives the light scattered into it.
vec3 atmAerialPerspective(
  float camAltKm, float pointAltKm, float distKm, float cosSun, vec3 sunTrans, out vec3 inscatter
) {
  float dR = atmLayerDepth(camAltKm, pointAltKm, distKm, ATM_HR);
  float dM = atmLayerDepth(camAltKm, pointAltKm, distKm, ATM_HM);
  vec3 tauR = ATM_BETA_R * dR;
  float tauM = ATM_BETA_ME * dM;
  vec3 trans = exp(-(tauR + vec3(tauM)));
  // Single scattering with the sun transmittance held at its value for the segment, plus the
  // multiple scattering approximation
  vec3 source = ATM_BETA_R * dR * (vec3(atmRayleighPhase(cosSun)) + ATM_MS)
              + vec3(ATM_BETA_MS * dM) * (atmMiePhase(cosSun) + 0.02);
  vec3 tauEff = max((tauR + vec3(tauM)) * ATM_RETURN, vec3(1e-6));
  inscatter = ATM_SUN * sunTrans * source * (1.0 - exp(-tauEff)) / tauEff;
  return trans;
}
`,Wo=`
uniform float uNight; // 0 by day, 1 on a night overpass of a real run
// How much brighter the moonlit ground is drawn than in a close view: 1 or more. The whole block
// seen from far is a small dark shape on a dark page and its relief has to read; a material that
// does not set it (the sky) gets 1.
uniform float uMoonLift;
vec3 nightGrade(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Relief keeps its contrast up to the brightness of ordinary ground. Anything brighter (bare
  // rock, snow, a quarry, glint on water) is held just above that, so no ground the moon lights
  // is brighter than the dimmest fire light.
  float held = l < 0.22 ? l : 0.22 + 0.06 * (1.0 - exp(-(l - 0.22) / 0.06));
  held *= mix(1.0, 0.7, smoothstep(0.45, 0.9, l));
  vec3 moon = mix(vec3(l), c, 0.3) * (held / max(l, 1e-4)) * vec3(0.150, 0.215, 0.352) * max(uMoonLift, 1.0);
  return mix(c, moon, uNight);
}
`,Bu=`
uniform sampler2D uTransmittanceLut;

vec3 atmTransmittanceToSpace(float hKm, float mu) {
  float u = (clamp(mu, ${mt(ni)}, 1.0) - (${mt(ni)})) / ${mt(1-ni)};
  float v = sqrt(clamp(hKm / ATM_TOP, 0.0, 1.0));
  vec2 uv = vec2(u * ${mt((os-1)/os)} + ${mt(.5/os)}, v * ${mt((Fs-1)/Fs)} + ${mt(.5/Fs)});
  return texture2D(uTransmittanceLut, uv).rgb;
}
`,Vo=`
float atmHorizonAngle(float camAltKm) {
  float r = ATM_RG + camAltKm;
  return acos(-sqrt(max(0.0, 1.0 - (ATM_RG * ATM_RG) / (r * r))));
}

// What the backdrop shows in a true-scale direction (without the sun disc): sky above the horizon
// and the floor below it. The dome draws this, and the terrain dissolves its far edge into it.
//
// The floor is a backdrop, not data. With the interface on it stays dark when seen from above
// (floorHaze is a fraction of the physical air path); in clean feed it reads as distant ground
// under the air path. It always fades out completely within the last two degrees, so it meets the
// sky at the horizon without a step.
vec3 atmBackdrop(
  sampler2D skyView, vec3 dir, vec3 sun, float camAlt, float exposure, vec3 floorColor, float floorHaze
) {
  float thetaH = atmHorizonAngle(camAlt);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  float above = max(thetaH - theta, 0.0);
  float phi = atan(dir.z, dir.x) - atan(sun.z, sun.x);
  // Below the horizon this reads the horizon row, which is the color the floor fades into
  vec3 sky = texture2D(skyView, vec2(phi / (2.0 * ATM_PI), sqrt(above / thetaH))).rgb * exposure;
  if (theta < thetaH) {
    return sky;
  }
  float r = ATM_RG + camAlt;
  float mu = dir.y;
  float distKm = -r * mu - sqrt(max(0.0, r * r * (mu * mu - 1.0) + ATM_RG * ATM_RG));
  vec3 unused;
  vec3 trans = atmAerialPerspective(camAlt, 0.0, distKm * floorHaze, dot(dir, sun), vec3(1.0), unused);
  float clear = trans.g * smoothstep(0.0, 0.035, theta - thetaH);
  return mix(sky, floorColor, clear);
}
`,rd=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,ld=`
${Ko}
${Bu}
${Vo}

uniform float uSunSin;   // sine of the sun elevation
uniform float uCamAltKm;
varying vec2 vUv;

void main() {
  float camAlt = clamp(uCamAltKm, 0.02, ATM_TOP - 1.0);
  float thetaH = atmHorizonAngle(camAlt);
  float theta = thetaH - vUv.y * vUv.y * thetaH;
  float phi = vUv.x * 2.0 * ATM_PI;
  vec3 dir = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - uSunSin * uSunSin)), uSunSin, 0.0);

  float r = ATM_RG + camAlt;
  float mu = dir.y;
  float rt = ATM_RG + ATM_TOP;
  float dist = -r * mu + sqrt(max(0.0, r * r * (mu * mu - 1.0) + rt * rt));
  float cosSun = dot(dir, sun);
  float phaseR = atmRayleighPhase(cosSun);
  float phaseM = atmMiePhase(cosSun);

  const int STEPS = 24;
  vec3 radiance = vec3(0.0);
  vec3 tau = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < STEPS; i++) {
    // Samples are denser near the camera, where the air is thickest
    float s1 = float(i + 1) / float(STEPS);
    float t1 = dist * s1 * s1;
    float ds = t1 - prev;
    float t = prev + 0.5 * ds;
    prev = t1;
    vec3 p = vec3(0.0, r, 0.0) + dir * t;
    float pr = length(p);
    float h = max(0.0, pr - ATM_RG);
    float rhoR = exp(-h / ATM_HR);
    float rhoM = exp(-h / ATM_HM);
    float rhoO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
    vec3 dTau = (ATM_BETA_R * rhoR + vec3(ATM_BETA_ME * rhoM) + ATM_BETA_O * rhoO) * ds;
    vec3 transCam = exp(-(tau + 0.5 * dTau) * ATM_RETURN);
    vec3 transSun = atmTransmittanceToSpace(h, dot(p, sun) / pr);
    vec3 scatter = ATM_BETA_R * rhoR * (vec3(phaseR) + ATM_MS) + vec3(ATM_BETA_MS * rhoM) * (phaseM + 0.02);
    radiance += transCam * transSun * scatter * ds;
    tau += dTau;
  }
  gl_FragColor = vec4(radiance * ATM_SUN, 1.0);
}
`,cd=`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,ud=`
${Ko}
${Bu}
${Vo}

uniform sampler2D uSkyView;
uniform vec3 uSunTrue;             // unit vector toward the sun, true scale
uniform float uCamAltKm;
uniform float uVerticalExaggeration;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform float uSkyExposure;
${Wo}
varying vec3 vDir;

void main() {
  // Stage direction to true direction: relief is exaggerated, so elevation angles are too
  vec3 d = normalize(vDir);
  vec3 dir = normalize(vec3(d.x, d.y / uVerticalExaggeration, d.z));
  vec3 sun = normalize(uSunTrue);
  float camAlt = clamp(uCamAltKm, 0.02, ATM_TOP - 1.0);

  vec3 color = atmBackdrop(uSkyView, dir, sun, camAlt, uSkyExposure, uFloorColor, uFloorHaze);
  if (acos(clamp(dir.y, -1.0, 1.0)) < atmHorizonAngle(camAlt)) {
    // Sun disc (angular radius about 0.27 degrees), bright enough to bloom
    float disc = smoothstep(0.999978, 0.999989, dot(dir, sun));
    if (disc > 0.0) {
      color += atmTransmittanceToSpace(camAlt, sun.y) * ATM_SUN * disc * 12.0 * (1.0 - uNight);
    }
  }
  // A little grain in the sky on top of the output dither: a slow gradient is the first thing a
  // video encoder turns into bands, and half a code of dither does not survive it
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  color *= 1.0 + (grain - 0.5) * 0.02;
  gl_FragColor = vec4(nightGrade(color), 1.0);
}
`;class hd{constructor(){k(this,"transmittance");k(this,"skyView");k(this,"scene",new ci);k(this,"camera",new Ir(-1,1,1,-1,0,1));k(this,"material");k(this,"quad");k(this,"lastSunSin",9);k(this,"lastAltKm",-9);this.transmittance=nd(),this.skyView=new Ot(ed,td,{format:Rt,type:Da,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1,wrapS:ai,wrapT:Ve}),this.material=new wt({vertexShader:rd,fragmentShader:ld,uniforms:{uTransmittanceLut:{value:this.transmittance},uSunSin:{value:.5},uCamAltKm:{value:5}},depthTest:!1,depthWrite:!1,toneMapped:!1}),this.quad=new pa(new Ui(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}update(t,a,s){const i=_.clamp(a.y,-.15,1);if(Math.abs(i-this.lastSunSin)<1e-4&&Math.abs(s-this.lastAltKm)<.02)return;this.lastSunSin=i,this.lastAltKm=s,this.material.uniforms.uSunSin.value=i,this.material.uniforms.uCamAltKm.value=s;const o=t.getRenderTarget();t.setRenderTarget(this.skyView),t.render(this.scene,this.camera),t.setRenderTarget(o)}dispose(){this.transmittance.dispose(),this.skyView.dispose(),this.material.dispose(),this.quad.geometry.dispose()}}const Bi=14.8,Oi=10.8,Ou=511,Ds=-.44,We=256,Js=24,dd=80,fd=24,ns=["plumas_ca","lytton_bc","evia_greece","blue_mountains_au"],Li={plumas_ca:{id:"plumas_ca",bbox:[-121.6,39.75,-120.75,40.35],widthKm:72.5,minElevM:313,maxElevM:2357,windDirUv:[.68,.73],paletteBase:[.14,.21,.14],paletteRidge:[.44,.43,.4],hasSeaCoast:!1},lytton_bc:{id:"lytton_bc",bbox:[-121.95,49.95,-121.2,50.52],widthKm:54,minElevM:195,maxElevM:2860,windDirUv:[.42,.91],paletteBase:[.24,.22,.16],paletteRidge:[.56,.54,.52],hasSeaCoast:!1},evia_greece:{id:"evia_greece",bbox:[23.02,38.62,23.62,39.12],widthKm:52,minElevM:0,maxElevM:1385,windDirUv:[-.62,-.78],paletteBase:[.27,.3,.2],paletteRidge:[.64,.6,.52],hasSeaCoast:!0},blue_mountains_au:{id:"blue_mountains_au",bbox:[150.02,-33.92,150.74,-33.32],widthKm:66,minElevM:68,maxElevM:1215,windDirUv:[.79,-.61],paletteBase:[.15,.22,.17],paletteRidge:[.54,.38,.27],hasSeaCoast:!1}};function md(e){const t=ns.indexOf(e);return t>=0?t:0}function pd(){const e=new Uint8Array(1024);for(let a=0;a<256;a++)e[a*4]=$n[a*3],e[a*4+1]=$n[a*3+1],e[a*4+2]=$n[a*3+2],e[a*4+3]=255;const t=new aa(e,256,1,Rt,Ut);return t.colorSpace=ot,t.minFilter=ze,t.magFilter=ze,t.wrapS=Ve,t.wrapT=Ve,t.needsUpdate=!0,t}function ks(e,t=!0){const a=Math.max(2,Math.floor(Math.sqrt(e.length))),s=a*a,i=new Float32Array(s);let o=Number.POSITIVE_INFINITY,l=Number.NEGATIVE_INFINITY;for(let r=0;r<a;r++){const h=(t?a-1-r:r)*a,v=r*a;for(let x=0;x<a;x++){const y=Number.isFinite(e[h+x])?e[h+x]:0;i[v+x]=y,y<o&&(o=y),y>l&&(l=y)}}Number.isFinite(o)||(o=0),(!Number.isFinite(l)||l<=o+1)&&(l=o+1e3);const u=new aa(i,a,a,ku,Cr);return u.internalFormat="R32F",u.minFilter=zo,u.magFilter=zo,u.wrapS=Ve,u.wrapT=Ve,u.flipY=!1,u.generateMipmaps=!1,u.needsUpdate=!0,{texture:u,aligned:i,gridRes:a,minElev:o,maxElev:l}}function kc(e,t=256){const a=Li[e],s=new Float32Array(t*t),i=md(e)*2.35;for(let o=0;o<t;o++){const u=(1-o/(t-1)-.5)*2;for(let r=0;r<t;r++){const h=(r/(t-1)-.5)*2,v=.24*Math.sin(u*2.7+i)+.11*Math.cos(u*5.6-i),x=Math.abs(h*.88-v),y=Math.pow(Math.min(1.3,x*1.18),.78),M=1-Math.abs(Math.sin(h*4.4+u*3.1+i)),E=1-Math.abs(Math.cos(h*8.9-u*7.4-i*.6)),g=.5+.5*Math.sin(h*18.5+u*16.2+i*1.3);let p=y*(.58+.28*M*M+.11*E+.04*g);if(a.hasSeaCoast){const b=1-Math.max(0,Math.hypot(h*.92,u*.84)-.62)*1.9;p=Math.max(0,p*b-.08)}s[o*t+r]=a.minElevM+Math.max(0,Math.min(1.05,p))*(a.maxElevM-a.minElevM)}}return s}function _c(e,t,a,s,i,o){const l=Li[e],u=512,r=document.createElement("canvas");r.width=u,r.height=u;const c=r.getContext("2d");if(c){const v=c.createImageData(u,u),x=v.data,y=Math.max(100,i-s);for(let M=0;M<u;M++){const E=1-M/(u-1),g=Math.min(a-1,Math.max(0,Math.round(E*(a-1)))),p=Math.min(a-1,g+1);for(let b=0;b<u;b++){const F=b/(u-1),A=Math.min(a-1,Math.max(0,Math.round(F*(a-1)))),z=Math.min(a-1,A+1),D=t[g*a+A],T=t[g*a+z],L=t[p*a+A],U=Math.max(0,Math.min(1,(D-s)/y)),K=Math.min(1,Math.hypot(T-D,L-D)/48),G=.92+.08*Math.sin(b*.47+M*.31)*Math.cos(b*.19-M*.53);let X,ue,oe;if(l.hasSeaCoast&&D<=2.2)X=.05,ue=.14+.04*G,oe=.24+.05*G;else{const ye=Math.min(1,Math.max(0,U*.72+K*.55));if(X=(l.paletteBase[0]*(1-ye)+l.paletteRidge[0]*ye)*G,ue=(l.paletteBase[1]*(1-ye)+l.paletteRidge[1]*ye)*G,oe=(l.paletteBase[2]*(1-ye)+l.paletteRidge[2]*ye)*G,l.maxElevM>2200&&U>.84){const ve=(U-.84)/.16;X=X*(1-ve*.55)+.78*ve*.55,ue=ue*(1-ve*.55)+.8*ve*.55,oe=oe*(1-ve*.55)+.84*ve*.55}}const Te=(M*u+b)*4;x[Te]=Math.min(255,Math.max(0,Math.round(X*255))),x[Te+1]=Math.min(255,Math.max(0,Math.round(ue*255))),x[Te+2]=Math.min(255,Math.max(0,Math.round(oe*255))),x[Te+3]=255}}c.putImageData(v,0,0)}const h=new Ah(r);return h.colorSpace=ot,h.anisotropy=o,h.wrapS=Ve,h.wrapT=Ve,h.needsUpdate=!0,h}function vd(e,t=!0){const a=We*We*4,s=Math.max(1,Math.floor(e.byteLength/a));if(!t)return{buffer:e.slice(0,s*a),frames:s};const i=new Uint8Array(s*a),o=We*4;for(let l=0;l<s;l++){const u=l*a;for(let r=0;r<We;r++){const c=u+(We-1-r)*o,h=u+r*o;i.set(e.subarray(c,c+o),h)}}return{buffer:i,frames:s}}const Yo=`
uniform sampler2D uDemPrev;
uniform sampler2D uDemNext;
uniform vec2 uDemRes;       // (prevGridRes, nextGridRes)
uniform vec2 uElevPrevRange; // (minElevM, maxElevM)
uniform vec2 uElevNextRange; // (minElevM, maxElevM)
uniform vec2 uReliefScale;   // world units per metre of elevation (prev, next)
uniform vec2 uSlabSize;      // world size of the slab (east-west, north-south)
uniform float uMorph;       // [0..1] smooth sub-orbital elevation & ortho morph
uniform float uEdgeFade;    // 1 in close views: the far edge of the slab is taken away

// Close views: how much of the terrain is taken away at this point (0 none, 1 all). It is a band
// along the slab's edges, and only where the edge is far from the camera: a near edge is a cut
// wall, not a horizon. The surface dissolves into the backdrop by this share AND sinks to the base
// by it, so a ridge that is no longer drawn cannot hide smoke or sky behind it.
// Ground that stands above the eye's horizon is in front of sky and is kept whole (edgeGoneAt): a
// far ridge on the skyline is depth, not a model edge. Only ground seen below the horizon goes.
const float EDGE_BAND = 3.0;   // world units, about 9 km
const float EDGE_SOLID = 0.67; // gone completely inside the last 2 km
float edgeGone(vec2 uv) {
  if (uEdgeFade < 0.003) return 0.0;
  vec2 e = min(uv, 1.0 - uv) * uSlabSize;
  float band = 1.0 - smoothstep(EDGE_SOLID, EDGE_BAND, min(e.x, e.y));
  vec3 at = vec3((uv.x - 0.5) * uSlabSize.x, 0.0, (0.5 - uv.y) * uSlabSize.y);
  float farSide = smoothstep(0.22, 0.42, distance(at, cameraPosition) / max(uSlabSize.x, uSlabSize.y));
  return uEdgeFade * band * farSide;
}

float belowHorizon(vec3 worldPos) {
  vec3 d = worldPos - cameraPosition;
  return smoothstep(0.01, -0.05, d.y / max(length(d), 1e-3));
}

float edgeGoneAt(vec2 uv, float worldY) {
  float gone = edgeGone(uv);
  if (gone <= 0.0) return 0.0;
  return gone * belowHorizon(vec3((uv.x - 0.5) * uSlabSize.x, worldY, (0.5 - uv.y) * uSlabSize.y));
}

float sampleR32FBilinear(sampler2D demTex, vec2 uv, float res) {
  vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 coord = clamped * (res - 1.0);
  vec2 i0 = floor(coord);
  vec2 f = coord - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(res - 1.0));

  float invRes = 1.0 / res;
  float h00 = texture2D(demTex, (i0 + vec2(0.5, 0.5)) * invRes).r;
  float h10 = texture2D(demTex, (vec2(i1.x, i0.y) + vec2(0.5, 0.5)) * invRes).r;
  float h01 = texture2D(demTex, (vec2(i0.x, i1.y) + vec2(0.5, 0.5)) * invRes).r;
  float h11 = texture2D(demTex, (i1 + vec2(0.5, 0.5)) * invRes).r;

  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

float sampleWorldHeightPrev(vec2 uv, out float elevM) {
  elevM = sampleR32FBilinear(uDemPrev, uv, uDemRes.x);
  float span = max(350.0, uElevPrevRange.y - uElevPrevRange.x);
  return clamp(elevM - uElevPrevRange.x, 0.0, span * 1.15) * uReliefScale.x;
}

float sampleWorldHeightNext(vec2 uv, out float elevM) {
  elevM = sampleR32FBilinear(uDemNext, uv, uDemRes.y);
  float span = max(350.0, uElevNextRange.y - uElevNextRange.x);
  return clamp(elevM - uElevNextRange.x, 0.0, span * 1.15) * uReliefScale.y;
}

// Context terrain (optional): elevation in metres around the pack, uContextScale times
// its side, same centre and axes. Where it is drawn (uContextMix 1) the pack takes the context
// surface over the last stretch before its edge, so the two meet without a step and nothing has
// to dissolve there.
uniform sampler2D uContextDem;
uniform float uContextRes;    // posts per side
uniform float uContextScale;  // context side over pack side
uniform float uContextMix;
const float CONTEXT_JOIN = 0.02; // share of the pack's side over which it joins the context

float contextJoin(vec2 uv) {
  if (uContextMix < 0.003) return 0.0;
  vec2 e = min(uv, 1.0 - uv);
  return (1.0 - smoothstep(0.0, CONTEXT_JOIN, min(e.x, e.y))) * uContextMix;
}

// World height of the context surface at a pack uv (which may lie outside 0..1). Not clamped to
// the pack's elevation range: ground beyond the pack can be lower than its lowest point.
float contextWorldY(vec2 uv) {
  float elevM = sampleR32FBilinear(uContextDem, (uv - 0.5) / uContextScale + 0.5, uContextRes);
  return (elevM - uElevNextRange.x) * uReliefScale.y;
}

float evalTerrainWorldY(vec2 uv, out float blendedElevM) {
  float e1 = 0.0;
  float y = sampleWorldHeightNext(uv, e1);
  blendedElevM = e1;
  // Outside a region morph only the current heightfield is read
  if (uMorph <= 0.999) {
    float e0 = 0.0;
    float y0 = sampleWorldHeightPrev(uv, e0);
    blendedElevM = mix(e0, e1, uMorph);
    y = mix(y0, y, uMorph);
  }
  float join = contextJoin(uv);
  if (join > 0.0) y = mix(y, contextWorldY(uv), join);
  return y * (1.0 - edgeGoneAt(uv, y));
}

float evalTerrainWorldYFast(vec2 uv) {
  float dummy = 0.0;
  return evalTerrainWorldY(uv, dummy);
}
`;function Fc(e=Ou){const a=(e+1)*2*4,s=e*6*4,i=new Float32Array(a*3),o=new Float32Array(a*3),l=new Float32Array(a*4),u=new Uint32Array(s),r=[{normal:[0,0,1],evalUv:x=>[x,0]},{normal:[1,0,0],evalUv:x=>[1,x]},{normal:[0,0,-1],evalUv:x=>[1-x,1]},{normal:[-1,0,0],evalUv:x=>[0,1-x]}];let c=0,h=0;for(let x=0;x<4;x++){const y=r[x],M=c;for(let E=0;E<=e;E++){const g=E/e,[p,b]=y.evalUv(g),F=(p-.5)*Bi,A=(.5-b)*Oi,z=x+g;i[c*3]=F,i[c*3+1]=0,i[c*3+2]=A,o[c*3]=y.normal[0],o[c*3+1]=y.normal[1],o[c*3+2]=y.normal[2],l[c*4]=p,l[c*4+1]=b,l[c*4+2]=1,l[c*4+3]=z,c++,i[c*3]=F,i[c*3+1]=Ds,i[c*3+2]=A,o[c*3]=y.normal[0],o[c*3+1]=y.normal[1],o[c*3+2]=y.normal[2],l[c*4]=p,l[c*4+1]=b,l[c*4+2]=0,l[c*4+3]=z,c++}for(let E=0;E<e;E++){const g=M+E*2,p=g+1,b=g+2,F=g+3;u[h++]=g,u[h++]=p,u[h++]=b,u[h++]=b,u[h++]=p,u[h++]=F}}const v=new Lr;return v.setAttribute("position",new Ha(i,3)),v.setAttribute("normal",new Ha(o,3)),v.setAttribute("aSkirtParam",new Ha(l,4)),v.setIndex(new Ha(u,1)),v.boundingSphere=new _u(new B(0,.8,0),14),v}const gd=`
${Yo}

attribute vec4 aSkirtParam; // (u, v, isTop, perimeterRun)

varying vec2 vEdgeUv;
varying float vSurfaceY;
varying float vSurfaceElevM;
varying float vWorldY;
varying float vRunParam;
varying vec3 vWallNormal;
varying vec3 vWorldPos;

void main() {
  vec2 edgeUv = aSkirtParam.xy;
  float isTop = aSkirtParam.z;
  float surfElevM = 0.0;
  float surfY = evalTerrainWorldY(edgeUv, surfElevM);

  float wy = mix(${Ds.toFixed(2)}, surfY, isTop);
  vec3 displaced = vec3((edgeUv.x - 0.5) * uSlabSize.x, wy, (0.5 - edgeUv.y) * uSlabSize.y);
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);

  vEdgeUv = edgeUv;
  vSurfaceY = surfY;
  vSurfaceElevM = surfElevM;
  vWorldY = wy;
  vRunParam = aSkirtParam.w;
  vWallNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPos = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,xd=`
${Wo}
uniform vec2 uElevPrevRange;
uniform vec2 uElevNextRange;
uniform vec2 uReliefScale;
uniform float uMorph;
uniform vec3 uSunDir;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;

varying vec2 vEdgeUv;
varying float vSurfaceY;
varying float vSurfaceElevM;
varying float vWorldY;
varying float vRunParam;
varying vec3 vWallNormal;
varying vec3 vWorldPos;

void main() {
  float minRange = mix(uElevPrevRange.x, uElevNextRange.x, uMorph);
  float maxRange = mix(uElevPrevRange.y, uElevNextRange.y, uMorph);
  float spanM = max(350.0, maxRange - minRange);

  // Depth fraction from base (-0.44) up to surface (vSurfaceY)
  float wallSpan = max(0.08, vSurfaceY - (${Ds.toFixed(2)}));
  float hFrac = clamp((vWorldY - (${Ds.toFixed(2)})) / wallSpan, 0.0, 1.0);

  // Equivalent geological elevation in meters at this vertical cross-section pixel
  float pixelElevM = minRange + vWorldY / max(mix(uReliefScale.x, uReliefScale.y, uMorph), 1e-7);

  // Lithospheric basalt-slate gradient (#1d2129 -> #0d1016) with directional facet lighting
  vec3 topSlate = vec3(0.125, 0.145, 0.184);
  vec3 baseBasalt = vec3(0.048, 0.058, 0.082);
  vec3 wallCol = mix(baseBasalt, topSlate, pow(hFrac, 0.85));

  // Subtle folded sedimentary strata bands
  float foldWarp = 38.0 * sin(vRunParam * 5.2) + 16.0 * cos(vRunParam * 13.5);
  float strataA = 0.5 + 0.5 * sin((pixelElevM + foldWarp) * 0.036);
  float strataB = 0.5 + 0.5 * cos((pixelElevM - foldWarp * 0.6) * 0.095);
  wallCol *= 0.88 + 0.14 * strataA + 0.06 * strataB;

  // Architectural facet lighting across N / E / S / W cutaway faces
  float facetLight = 0.62 + 0.38 * max(0.0, dot(normalize(vWallNormal), normalize(vec3(uSunDir.x, 0.25, uSunDir.z))));
  wallCol *= facetLight;

  // Crisp 1px horizontal elevation datum lines every 500 m (500 m, 1,000 m, 1,500 m, 2,000 m, 2,500 m)
  float datumStep = 500.0;
  float datumPhase = pixelElevM / datumStep;
  float datumDist = abs(fract(datumPhase - 0.5) - 0.5) / max(fwidth(datumPhase), 0.002);
  float datumLine = (1.0 - smoothstep(0.45, 1.35, datumDist)) * step(120.0, pixelElevM);
  wallCol = mix(wallCol, vec3(0.44, 0.52, 0.64), datumLine * 0.34);

  // Clean top bevel rim hairline + base ground seam hairline
  float distFromTop = vSurfaceY - vWorldY;
  float topBevel = 1.0 - smoothstep(0.0, 0.018, distFromTop);
  float baseRule = 1.0 - smoothstep(0.0, 0.014, vWorldY - (${Ds.toFixed(2)}));
  wallCol += vec3(0.18, 0.22, 0.29) * topBevel * 0.65;
  wallCol = mix(wallCol, vec3(0.24, 0.30, 0.40), baseRule * 0.42);

  // Continuation of the optical laser line down the vertical cliff face where the scan curtain slices it
  if (uCutawayMix > 0.01) {
    float scanCoord = dot(vEdgeUv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
    float cliffLaser = exp(-abs(scanCoord) * 260.0) * uCutawayMix;
    wallCol += vec3(0.55, 0.90, 1.0) * cliffLaser * 0.72;
  }

  // By night the block's sides are lit a little more than its top, so the block and its edge
  // read against the dark page (the sides are only seen in the block views)
  gl_FragColor = vec4(mix(wallCol, wallCol * vec3(0.26, 0.34, 0.52), uNight), 1.0);
}
`,wd=`
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Md=`
uniform vec2 uSlabSize;
uniform float uShadowMix; // 1 = contact shadow drawn; 0 in close views, where it is a dark band past the far edge
varying vec3 vLocalPos;
varying vec3 vWorldPos;

float sdBox2D(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

void main() {
  // The floor under the block is quiet: one soft contact shadow, no grid, no rings, no axes
  float boxDist = sdBox2D(vWorldPos.xz, uSlabSize * 0.5);
  float contactShadow = 1.0 - smoothstep(-0.2, 2.6, boxDist);
  float reach = 1.0 - smoothstep(8.2, 14.5, length(vWorldPos.xz));
  gl_FragColor = vec4(vec3(0.015, 0.020, 0.030), contactShadow * contactShadow * 0.62 * reach * uShadowMix);
}
`;function yd(e){return Math.max(0,Math.min(e-1,Math.floor((e-1)*.52)))}const bd=11,Sd=.42,Td=8;function Ed(e,t,a,s,i,o){const[l,u,r,c]=t,h=i.gridSize,v=yd(s),x=v*h*h*4,y=`pass ${v+1}`;let M=!1,E={gx:Math.round(h*.5),gy:Math.round(h*.5),zMw:0};for(let K=14;K<h-14;K+=2)for(let G=14;G<h-14;G+=2){const X=a[x+(K*h+G)*4]/255*i.zMaxMwKm2;X>E.zMw&&(E={gx:G,gy:K,zMw:X},M=!0)}let g=!1,p=-1/0,b={gx:Math.round(h*.375),gy:Math.round(h*.42),zMw:0,modisMw:0};for(let K=14;K<h-14;K+=2)for(let G=14;G<h-14;G+=2){const X=x+(K*h+G)*4,ue=a[X]/255*i.zMaxMwKm2,oe=a[X+2]/255*i.zMaxMwKm2,Te=Math.hypot(G-E.gx,K-E.gy);if(ue>=bd&&oe<ue*Sd&&Te>24){const ye=o(G/(h-1),K/(h-1)),ve=ue-oe*1.25-ye*6e-4;ve>p&&(p=ve,b={gx:G,gy:K,zMw:ue,modisMw:oe},g=!0)}}let F=!1,A={gx:Math.round(h*.640625),gy:Math.round(h*.40625),sigmaMw:0};for(let K=14;K<h-14;K+=2)for(let G=14;G<h-14;G+=2){const X=x+(K*h+G)*4,ue=a[X]/255*i.zMaxMwKm2,oe=a[X+1]/255*i.sigmaMaxMwKm2,Te=Math.hypot(G-E.gx,K-E.gy),ye=Math.hypot(G-b.gx,K-b.gy);ue>=Td&&oe>A.sigmaMw&&Te>28&&ye>24&&(A={gx:G,gy:K,sigmaMw:oe},F=!0)}const z=(K,G,X,ue,oe,Te,ye)=>{const ve=X/(h-1),he=ue/(h-1);return{id:`${e}-${K}`,kind:G,title:oe,subtitle:Te,valueText:ye,lat:u+he*(c-u),lon:l+ve*(r-l),elevM:Math.round(o(ve,he))}},D=z("front-core","front",E.gx,E.gy,M?"Strongest estimate":"",M?`Highest value of the simulated 375 m estimate at ${y}`:"",M?`${E.zMw.toFixed(1)} MW/km², ${y}`:""),T=z("canyon-subpixel","subpixel",b.gx,b.gy,g?"Estimate above MODIS":"",g?`Simulated estimate where the simulated MODIS pass reads far less, at ${y}`:"",g?`${b.zMw.toFixed(1)} MW/km², MODIS ${b.modisMw.toFixed(1)} MW/km², ${y}`:""),L=z("sigma-peak","uncertainty",A.gx,A.gy,F?"Least certain estimate":"",F?`One standard deviation of the simulated estimate at ${y}`:"",F?`±${A.sigmaMw.toFixed(1)} MW/km² (1 sigma), ${y}`:""),U=[];return M&&U.push(D),g&&U.push(T),F&&U.push(L),{anchors:[D,T,L],callouts:U}}const gt={azimuth:.5,polar:.98,distance:17.2,target:[.1,.3,.2]},Dc={overview:{azimuth:.48,polar:.97,distance:17,target:[-.6,.3,.3]},canyon:{azimuth:-.34,polar:1.24,distance:5.6,target:[-.42,.45,-.22]},ridge:{azimuth:.86,polar:1.12,distance:7.4,target:[.32,.6,-.14]},nadir:{azimuth:0,polar:.14,distance:18.5,target:[0,.3,0]},region:{azimuth:.48,polar:.75,distance:17,target:[-.3,.3,.2]}},Rd={azimuth:0,polar:.42,distance:12,target:[0,.3,0]};function Pc(e,t,a,s,i=!1){if(!t)return gt;const o=e==="region"&&i?Rd:Dc[e]??Dc.overview;return a==="observer"&&e==="overview"?{azimuth:o.azimuth,polar:.98,distance:18.4,target:[0,.7,.2]}:{azimuth:o.azimuth,polar:o.polar,distance:o.distance,target:[o.target[0],o.target[1],o.target[2]]}}function Hu(e){const t=Math.min(1,Math.max(0,e));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)*.5}const Ni=.95;class Ad{constructor(){k(this,"active",!1);k(this,"elapsedSec",0);k(this,"durationSec",Ni);k(this,"startAzimuth",gt.azimuth);k(this,"endAzimuth",gt.azimuth);k(this,"startPolar",gt.polar);k(this,"endPolar",gt.polar);k(this,"startDistance",gt.distance);k(this,"endDistance",gt.distance);k(this,"startTarget",new B(...gt.target));k(this,"endTarget",new B(...gt.target));k(this,"hopHeightDist",2.15)}trigger(t,a,s=2.15,i=Ni){this.active=!0,this.elapsedSec=0,this.durationSec=Math.max(.25,i),this.startAzimuth=t.azimuth;let o=a.azimuth-t.azimuth;for(;o>Math.PI;)o-=Math.PI*2;for(;o<-Math.PI;)o+=Math.PI*2;this.endAzimuth=t.azimuth+o,this.startPolar=t.polar,this.endPolar=a.polar,this.startDistance=t.distance,this.endDistance=a.distance,this.startTarget.copy(t.target),this.endTarget.set(a.target[0],a.target[1],a.target[2]),this.hopHeightDist=s}cancel(){this.active=!1}isActive(){return this.active}step(t,a){if(!this.active)return{slewActive:!1,rawProgress:1,easedProgress:1};this.elapsedSec+=Math.min(.08,Math.max(0,t));const s=Math.min(1,this.elapsedSec/this.durationSec),i=Hu(s),o=Math.sin(s*Math.PI);return a.azimuth=_.lerp(this.startAzimuth,this.endAzimuth,i),a.polar=_.clamp(_.lerp(this.startPolar,this.endPolar,i)-o*.085,.1,1.38),a.distance=_.lerp(this.startDistance,this.endDistance,i)+o*this.hopHeightDist,a.target.lerpVectors(this.startTarget,this.endTarget,i),s>=1&&(this.active=!1),{slewActive:this.active,rawProgress:s,easedProgress:i}}}function kd(e){const t=e%2===0?1:-1,a=e>=2?-1:1,s=[new B(6.6*t,7.6,7.8*a),new B(4.2*t,3.3,5.1*a),new B(1.1*t,1.85,2.5*a),new B(-2.3*t,1.72,.15*a),new B(-4.6*t,2.65,-2.4*a),new B(-1.8*t,4.45,-4.6*a),new B(3.6*t,6.45,-2.2*a),new B(6.8*t,7.9,3.8*a)],i=[new B(0,.65,0),new B(-.35*t,.85,.45*a),new B(-1.35*t,1.05,-.55*a),new B(-1.85*t,1.12,-1.35*a),new B(-.65*t,1.02,-.85*a),new B(.25*t,.88,-.15*a),new B(.1*t,.72,.15*a),new B(0,.65,0)];return{eyeCurve:new Ac(s,!0,"catmullrom",.5),lookCurve:new Ac(i,!0,"catmullrom",.5)}}const Fi=13.5;class _d{constructor(){k(this,"rigs");k(this,"elapsedSec",0);k(this,"currentLegIndex",0);k(this,"tmpEye",new B);k(this,"tmpEyeAhead",new B);k(this,"tmpEyeBehind",new B);k(this,"tmpLook",new B);k(this,"tmpVelA",new B);k(this,"tmpVelB",new B);k(this,"tmpForward",new B);k(this,"tmpRight",new B);k(this,"tmpUp",new B(0,1,0));k(this,"worldUp",new B(0,1,0));this.rigs=[0,1,2,3].map(t=>kd(t))}startAtTheater(t){const a=Math.max(0,ns.indexOf(t));this.currentLegIndex=a,this.elapsedSec=a*Fi}update(t,a,s,i=Bi,o=Oi){const l=Math.min(.08,Math.max(0,t));this.elapsedSec+=l;const u=Fi*ns.length,r=(this.elapsedSec%u+u)%u,c=Math.min(ns.length-1,Math.floor(r/Fi)),h=(r-c*Fi)/Fi;c!==this.currentLegIndex&&(this.currentLegIndex=c,s==null||s(ns[c]));const v=this.rigs[c],x=.008,y=(h-x+1)%1,M=(h+x)%1;v.eyeCurve.getPointAt(h,this.tmpEye),v.eyeCurve.getPointAt(y,this.tmpEyeBehind),v.eyeCurve.getPointAt(M,this.tmpEyeAhead),v.lookCurve.getPointAt(h,this.tmpLook);const E=this.tmpEye.x/i+.5,g=.5-this.tmpEye.z/o;if(E>=-.02&&E<=1.02&&g>=-.02&&g<=1.02){const U=a(Math.min(1,Math.max(0,E)),Math.min(1,Math.max(0,g)))+.78;this.tmpEye.y<U&&(this.tmpEye.y=U)}const p=this.tmpLook.x/i+.5,b=.5-this.tmpLook.z/o,F=a(Math.min(1,Math.max(0,p)),Math.min(1,Math.max(0,b)));this.tmpLook.y=Math.max(this.tmpLook.y,F+.18),this.tmpVelA.subVectors(this.tmpEye,this.tmpEyeBehind).setY(0),this.tmpVelB.subVectors(this.tmpEyeAhead,this.tmpEye).setY(0);let A=0;if(this.tmpVelA.lengthSq()>1e-6&&this.tmpVelB.lengthSq()>1e-6){this.tmpVelA.normalize(),this.tmpVelB.normalize();const L=this.tmpVelA.x*this.tmpVelB.z-this.tmpVelA.z*this.tmpVelB.x;A=_.clamp(L*1.45,-.11,.11)}this.tmpForward.subVectors(this.tmpLook,this.tmpEye).normalize(),this.tmpRight.crossVectors(this.tmpForward,this.worldUp).normalize(),this.tmpUp.copy(this.worldUp).applyAxisAngle(this.tmpForward,A).normalize();const z=.18+.68*(.5-.5*Math.cos(h*Math.PI*2)),T=39+Math.sin(h*Math.PI)*3.2;return{position:this.tmpEye,lookAt:this.tmpLook,up:this.tmpUp,fov:T,syntheticTimeProgress:z,cycleProgress:r/u,legProgress:h,activeLegTheater:ns[c]}}}function Fd(e,t,a){a.target.copy(t),a.target.x=_.clamp(a.target.x,-Bi*.45,Bi*.45),a.target.z=_.clamp(a.target.z,-Oi*.45,Oi*.45),a.target.y=_.clamp(a.target.y,-.1,2.2);const s=new B().subVectors(e,a.target),i=_.clamp(s.length(),4.2,26),o=_.clamp(Math.acos(_.clamp(s.y/i,-.99,.99)),.1,1.38),l=Math.atan2(s.x,s.z);a.distance=i,a.polar=o,a.azimuth=l}const Ar=.05;function Dd(e,t){const a=new Uint8Array(t*t);for(let i=0;i<t;i++)for(let o=0;o<t;o++){const l=e[i*t+o];if(l===0)continue;let u=1;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++){const h=Math.min(t-1,Math.max(0,i+r)),v=Math.min(t-1,Math.max(0,o+c));if(Math.abs(e[h*t+v]-l)>Ar){u=0;break}}a[i*t+o]=u}const s=new Uint8Array(t*t);for(let i=0;i<t;i++)for(let o=0;o<t;o++){const l=e[i*t+o];if(l===0)continue;let u=a[i*t+o];for(let r=-1;r<=1&&!u;r++)for(let c=-1;c<=1;c++){const h=i+r,v=o+c;if(!(h<0||h>=t||v<0||v>=t)&&a[h*t+v]&&Math.abs(e[h*t+v]-l)<=Ar){u=1;break}}s[i*t+o]=u}return s}function Hr(e,t){let a=0,s=0;for(let i=1;i<t-1;i+=2)for(let o=1;o<t-1;o+=2){const l=e[i*t+o];if(l===0||!Number.isFinite(l))continue;let u=!0;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++)if(Math.abs(e[(i+r)*t+o+c]-l)>Ar){u=!1;break}u&&(a++,Math.abs(l-Math.round(l))<.02&&s++)}return a>=20&&s/a>.5}const Pd=1.5;function Id(e,t){let a=new Uint8Array(t*t);for(let s=0;s<t*t;s++)a[s]=e[s]===0?1:0;for(let s=0;s<2;s++){const i=a.slice();for(let o=1;o<t-1;o++)for(let l=1;l<t-1;l++){const u=o*t+l;if(a[u]||!(e[u]<Pd))continue;let r=0;for(let c=-1;c<=1;c++)for(let h=-1;h<=1;h++)r+=a[(o+c)*t+l+h];r>=5&&(i[u]=1)}a=i}return a}const Cd=5,Ld=.25;function Nd(e,t,a){const s=new Uint8Array(t*t),i=new Uint8Array(t*t),o=new Int32Array(t*t),l=[],u=[];let r=0;const c=h=>a[h]===0&&e[h]<Cd;for(let h=0;h<t*t;h++){if(i[h]||!c(h))continue;r++;let v=0,x=0;for(u.length=0,l.push(h),i[h]=1;l.length>0;){const y=l.pop();u.push(y);const M=Math.floor(y/t),E=y-M*t;for(let g=-1;g<=1;g++){const p=M+g;if(!(p<0||p>=t))for(let b=-1;b<=1;b++){const F=E+b;if(F<0||F>=t||g===0&&b===0)continue;const A=p*t+F;c(A)?i[A]||(i[A]=1,l.push(A)):o[A]!==r&&(o[A]=r,a[A]?v++:x++)}}}if(v>0&&x<Ld*(v+x))for(const y of u)s[y]=1}return s}const Ic=4,Cc=1.5,zd=4;function Gu(e,t){if(t<2*Ic+1||e.length!==t*t)return;const a=Ic;let s=new Float32Array(t*t),i=new Float32Array(t*t);for(let r=0;r<t*t;r++){const c=e[r]!==0?1:0;s[r]=e[r]*c,i[r]=c}const o=new Float32Array(t*t),l=new Float32Array(t*t),u=(r,c,h)=>{for(let v=0;v<t;v++){let x=0;const y=M=>h?v*t+M:M*t+v;for(let M=0;M<=a&&M<t;M++)x+=r[y(M)];for(let M=0;M<t;M++){c[y(M)]=x;const E=M+a+1,g=M-a;E<t&&(x+=r[y(E)]),g>=0&&(x-=r[y(g)])}}};for(let r=0;r<2;r++){u(s,o,!0),u(i,l,!0),u(o,s,!1),u(l,i,!1);for(let c=0;c<t*t;c++){const h=i[c];s[c]=h>0?s[c]/h:0,i[c]=h>0?1:0}}for(let r=0;r<t*t;r++){const c=e[r];if(c===0||i[r]===0)continue;const h=Math.min(1,Math.max(0,(Math.abs(c-s[r])-Cc)/(zd-Cc))),v=h*h*(3-2*h);e[r]=c+(s[r]-c)*(1-v)}}function Ud(e){const t=Math.floor(e.length/4);if(t===0)return 0;const a=i=>{const o=i/255;return o<=.04045?o/12.92:Math.pow((o+.055)/1.055,2.4)},s=new Float32Array(t);for(let i=0;i<t;i++)s[i]=.2126*a(e[i*4])+.7152*a(e[i*4+1])+.0722*a(e[i*4+2]);return s.sort(),s[Math.floor(t/2)]}function kr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function Qn(e){return kr(e)&&typeof e.url=="string"&&e.url.length>0&&typeof e.size=="number"}function Lc(e){return Array.isArray(e)&&e.length===2&&e.every(t=>typeof t=="number"&&Number.isFinite(t))}function Bd(e){if(!kr(e)||e.version!==1||!Qn(e.dem)||!Qn(e.ortho)||!Qn(e.aux)||!Lc(e.extent_km)||!Lc(e.elev_range_m))return null;const t=e.sun;return!kr(t)||typeof t.azimuth_deg!="number"||typeof t.elevation_deg!="number"||!Number.isFinite(t.azimuth_deg)||!Number.isFinite(t.elevation_deg)?null:e}function No(e,t){return new Promise(a=>{const s=new kh;s.setCrossOrigin("anonymous"),s.setOptions(t),s.load(e,i=>a(i),void 0,()=>a(null))})}function _r(e){const t=new Nr(e);return t.flipY=!1,t.premultiplyAlpha=!1,t.wrapS=Ve,t.wrapT=Ve,t.magFilter=ze,t.minFilter=Ga,t.generateMipmaps=!0,t.onUpdate=()=>{e.close()},t.addEventListener("dispose",()=>{e.close()}),t.needsUpdate=!0,t}function Od(e){try{const s=(typeof OffscreenCanvas<"u"?new OffscreenCanvas(256,256):Object.assign(document.createElement("canvas"),{width:256,height:256})).getContext("2d");return s?(s.imageSmoothingEnabled=!0,s.imageSmoothingQuality="high",s.drawImage(e,0,0,256,256),Ud(s.getImageData(0,0,256,256).data)):null}catch{return null}}async function Ku(e,t){const a=await No(e,{imageOrientation:"flipY",premultiplyAlpha:"none"});if(!a)return null;const s=_r(a);return s.colorSpace=ot,s.anisotropy=t,s}function Hd(e,t){if(t<3||e.length!==t*t)return;const a=new Float32Array(t*t),s=1/6,i=2/3;for(let o=0;o<t;o++){const l=o*t;for(let u=0;u<t;u++){const r=e[l+(u>0?u-1:0)],c=e[l+(u<t-1?u+1:t-1)];a[l+u]=s*r+i*e[l+u]+s*c}}for(let o=0;o<t;o++){const l=(o>0?o-1:0)*t,u=(o<t-1?o+1:t-1)*t,r=o*t;for(let c=0;c<t;c++)e[r+c]=s*a[l+c]+i*a[r+c]+s*a[u+c]}}async function Gd(e,t){var a,s;try{const i=e.ortho.size<=t.maxTextureSize,o=i?e.ortho:e.ortho_fallback??null;if(!o||o.size>t.maxTextureSize)return null;const l=fetch(t.resolveUrl(e.dem.url)).then(A=>A.ok?A.arrayBuffer():null),u=No(t.resolveUrl(o.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}).then(async A=>A||!i||!e.ortho_fallback?{bitmap:A,size:o.size}:{bitmap:await No(t.resolveUrl(e.ortho_fallback.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}),size:e.ortho_fallback.size}),r=No(t.resolveUrl(e.aux.url),{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"}),[c,h,v]=await Promise.all([l,u,r]),x=((a=t.isCancelled)==null?void 0:a.call(t))??!1,y=e.dem.size*e.dem.size*4;if(x||!c||c.byteLength!==y||e.dem.format!=="f32le"||!h.bitmap||!v)return(s=h.bitmap)==null||s.close(),v==null||v.close(),null;const M=new Float32Array(c),E=Hr(M,e.dem.size);E&&Gu(M,e.dem.size),Hd(M,e.dem.size);const g=ks(M,!0),p=Od(h.bitmap),b=_r(h.bitmap);b.colorSpace=ot,b.anisotropy=t.maxAnisotropy;const F=_r(v);return F.colorSpace=Pa,F.anisotropy=Math.min(4,t.maxAnisotropy),{manifest:e,demTexture:g.texture,alignedDem:g.aligned,demGridRes:g.gridRes,minElevM:g.minElev,maxElevM:g.maxElev,orthoTexture:b,orthoSize:h.size,auxTexture:F,attribution:e.ortho.attribution??"",levelInWholeMetres:E,pictureMedianLuma:p,dispose:()=>{g.texture.dispose(),b.dispose(),F.dispose()}}}catch{return null}}function Kd(e,t,a){const s=e*Math.PI/180,i=t*Math.PI/180;return a.set(Math.sin(s)*Math.cos(i),Math.sin(i),-Math.cos(s)*Math.cos(i)).normalize()}function Wd(e,t,a){return a.set(e.x*t.x,e.y*t.y,e.z*t.z).normalize()}const Hi=.085,Vd=1e6;function Yd(e,t,a){const s=We,i=s*s,o=i*4,l=Hi*255,u=new Float32Array(i).fill(Vd),r=new Float32Array(i).fill(0),c=new Float32Array(i),h=new Uint8Array(i);for(let D=0;D<i;D++){let T=-1,L=-1,U=0;for(let K=0;K<t;K++){const G=e[K*o+D*4];G>U&&(U=G),G>=l&&(T<0&&(T=K),L=K)}if(c[D]=U/255,!(T<0)){if(h[D]=1,T===0)u[D]=-.5;else{const K=e[(T-1)*o+D*4],G=e[T*o+D*4],X=G>K?(l-K)/(G-K):1;u[D]=T-1+Math.min(1,Math.max(0,X))}if(L>=t-1)r[D]=t-1+.5;else{const K=e[L*o+D*4],G=e[(L+1)*o+D*4],X=K>G?(K-l)/(K-G):0;r[D]=L+Math.min(1,Math.max(0,X))}}}let v=0,x=0;for(let D=1;D<s-1;D+=2)for(let T=1;T<s-1;T+=2){const L=D*s+T;if(!h[L]||!h[L+1]||!h[L-1]||!h[L+s]||!h[L-s])continue;const U=(u[L+1]-u[L-1])*.5,K=(u[L+s]-u[L-s])*.5,G=Math.hypot(U,K);G>.001&&G<4&&(v+=G,x++)}const y=x>16?Math.min(1.2,Math.max(.08,v/x)):.3,M=u.slice(),E=y,g=y*Math.SQRT2,p=(D,T,L)=>{const U=M[T]+L;U<M[D]&&(M[D]=U)};for(let D=0;D<2;D++){for(let T=0;T<s;T++)for(let L=0;L<s;L++){const U=T*s+L;h[U]||(L>0&&p(U,U-1,E),T>0&&p(U,U-s,E),L>0&&T>0&&p(U,U-s-1,g),L<s-1&&T>0&&p(U,U-s+1,g))}for(let T=s-1;T>=0;T--)for(let L=s-1;L>=0;L--){const U=T*s+L;h[U]||(L<s-1&&p(U,U+1,E),T<s-1&&p(U,U+s,E),L<s-1&&T<s-1&&p(U,U+s+1,g),L>0&&T<s-1&&p(U,U+s-1,g))}}let b=0;const F=t+64,A=new Float32Array(i*4);for(let D=0;D<i;D++){const T=Math.min(F,M[D]);A[D*4]=T,A[D*4+1]=h[D]?r[D]:T,A[D*4+2]=c[D],A[D*4+3]=h[D],b+=h[D]}let z;if(a)z=new aa(A,s,s,Rt,Cr);else{const D=new Uint16Array(i*4);for(let T=0;T<D.length;T++)D[T]=Ma.toHalfFloat(A[T]);z=new aa(D,s,s,Rt,Da)}return z.minFilter=ze,z.magFilter=ze,z.wrapS=Ve,z.wrapT=Ve,z.generateMipmaps=!1,z.flipY=!1,z.needsUpdate=!0,{texture:z,burnedFraction:b/i,frameCount:t}}function Nc(e){const t=String(e);return/[.e]/.test(t)?t:`${t}.0`}const $d=`
const float FIRE_THR = ${Nc(Hi)};
const float FIRE_FIELD_TEXEL = ${Nc(1/We)};

struct FireSurface {
  vec3 emission;   // HDR radiance emitted by flames and embers
  float burned;    // 0..1 char coverage of the ground
  float ash;       // 0..1 pale ash share inside the char
  float front;     // 0..1 flaming front coverage
  float glow;      // 0..1 smoldering bed activity
};

// Radiance of the flame body, t = 0 dull ember red, t = 1 bright amber. The display tone curve
// turns any strong radiance white, so the body is held at levels where it stays orange on screen
// (about sRGB 190 30 10, 250 115 35, 255 150 55 and 255 190 85 for the four stops).
vec3 fireRamp(float t) {
  vec3 c0 = vec3(0.45, 0.030, 0.003);
  vec3 c1 = vec3(1.05, 0.110, 0.008);
  vec3 c2 = vec3(1.40, 0.190, 0.013);
  vec3 c3 = vec3(2.00, 0.360, 0.024);
  return t < 0.33
    ? mix(c0, c1, t / 0.33)
    : (t < 0.66 ? mix(c1, c2, (t - 0.33) / 0.33) : mix(c2, c3, (t - 0.66) / 0.34));
}

// White-hot core of a flaming front: the only part of the scene above the bloom threshold
const vec3 FIRE_CORE = vec3(18.0, 6.5, 0.9);

float fireFieldNow(vec2 uv, out float zBracket) {
  float z0 = textureLod(uFieldTex0, uv, 0.0).r;
  float z1 = textureLod(uFieldTex1, uv, 0.0).r;
  zBracket = max(z0, z1);
  return mix(z0, z1, uFrameMix);
}

// Blurred fire power around a point, from the mip chain of the solver field.
float fireFieldBlur(vec2 uv, float lod) {
  return mix(textureLod(uFieldTex0, uv, lod).r, textureLod(uFieldTex1, uv, lod).r, uFrameMix);
}

FireSurface evalFireSurface(
  vec2 uv,
  vec2 pKm,
  float kmPerPx,
  vec3 normalW,
  float slopeMag,
  float fuel,
  float waterMask
) {
  FireSurface fs;
  fs.emission = vec3(0.0);
  fs.burned = 0.0;
  fs.ash = 0.0;
  fs.front = 0.0;
  fs.glow = 0.0;

  vec4 hist = texture2D(uFireHist, uv);
  float zBracket = 0.0;
  float zNow = fireFieldNow(uv, zBracket);

  // Nothing burned here yet and nothing is burning: leave the ground untouched.
  if (hist.a < 0.004 && zBracket < FIRE_THR * 0.5) {
    return fs;
  }

  // Arrival gradient gives the local spread direction and slowness (epochs per km).
  vec2 tx = vec2(FIRE_FIELD_TEXEL, 0.0);
  vec2 ty = vec2(0.0, FIRE_FIELD_TEXEL);
  float aE = texture2D(uFireHist, uv + tx).r;
  float aW = texture2D(uFireHist, uv - tx).r;
  float aN = texture2D(uFireHist, uv + ty).r;
  float aS = texture2D(uFireHist, uv - ty).r;
  vec2 gradKm = vec2(aE - aW, aN - aS) / (2.0 * FIRE_FIELD_TEXEL * uExtentKm);
  float gradLen = length(gradKm);
  float slowness = clamp(gradLen, 0.35, 5.0);
  vec2 spreadDir = gradLen > 1e-4 ? gradKm / gradLen : vec2(1.0, 0.0);

  // Noise domain aligned with the wind so tongues run downwind.
  vec2 windEN = normalize(uWindDirUv * uExtentKm + vec2(1e-5));
  vec2 q = vec2(dot(pKm, windEN) * 0.55, dot(pKm, vec2(-windEN.y, windEN.x)));
  vec2 drift = windEN * uTime * 0.006;

  // Uphill direction in (east, north). Fire runs upslope, so fingers lengthen there.
  vec2 uphillEN = vec2(-normalW.x, normalW.z);
  float upslope = clamp(dot(spreadDir, uphillEN) * 2.2, -1.0, 1.0) * clamp(slopeMag * 1.4, 0.0, 1.0);

  float lobes = fbm2(q * 1.35 + drift);
  float tongues = fbm2(q * 5.8 - drift * 3.0 + vec2(41.0, 13.0));
  vec3 cellA = worley2(q * 8.5 + vec2(3.1, 7.7));

  // Sub-cell raggedness in km: more with fuel and upslope runs, never more than about one cell.
  float ragKm = (0.16 + 0.26 * fuel) * (1.0 + 0.9 * max(upslope, 0.0)) * (1.0 - 0.35 * max(-upslope, 0.0));
  float warpKm = ((lobes - 0.5) * 1.1 + (tongues - 0.5) * 0.55 + (0.42 - cellA.x) * 0.38) * ragKm;
  // Fine crinkle that only resolves up close (about 40 m features, a few meters of displacement)
  warpKm += (valueNoise2(q * 26.0 + drift * 9.0) - 0.5) * 0.030;

  // Signed distance behind the front, km (positive on burned ground).
  float dKm = (uFireTime - hist.r) / slowness + warpKm;

  // Truthfulness gate: flame only where the solver field is above threshold in a bracketing epoch.
  float gate = smoothstep(FIRE_THR * 0.75, FIRE_THR * 1.20, zBracket) * (1.0 - waterMask);
  float power = clamp((zBracket - FIRE_THR) / 0.45, 0.0, 1.0);

  // --- Flaming front: a thin band right behind the level set -------------------------------
  float depthKm = 0.030 + 0.045 * power;
  float bandKm = max(depthKm, 1.25 * kmPerPx);
  float lead = smoothstep(-0.55 * bandKm, 0.0, dKm);
  float tail = exp(-max(dKm, 0.0) / (bandKm * 1.25));
  float breakup = smoothstep(0.18, 0.46, tongues + 0.35 * (cellA.z - 0.5) + 0.25 * fuel);
  float flicker = 0.70 + 0.60 * valueNoise2(q * 31.0 + vec2(uTime * 2.6, -uTime * 1.9));
  float front = lead * tail * gate * breakup;
  // Keep far fronts from gaining energy when the band is widened to stay visible.
  float energy = mix(1.0, sqrt(depthKm / bandKm), 0.55);
  float heat = clamp(0.38 + 0.62 * pow(power, 0.6), 0.0, 1.0) * flicker;
  // Orange body across the band, and a thin core along its leading edge. The core thins out
  // when the band has been widened to stay visible from far away.
  float core = smoothstep(0.58, 0.96, lead * tail) * (depthKm / bandKm);
  vec3 frontRgb = fireRamp(clamp(0.30 + 0.70 * heat, 0.0, 1.0)) * mix(1.0, energy, 0.5)
                + FIRE_CORE * core * (0.30 + 0.85 * heat * heat) * energy;

  // Flame body and ground glow hugging the front, a few flame depths wide, well below the core
  float fringe = exp(-abs(dKm) / (bandKm * 2.4 + 0.015)) * gate * (0.45 + 0.55 * breakup);
  vec3 fringeRgb = fireRamp(clamp(0.12 + 0.38 * heat, 0.0, 1.0)) * (0.60 + 0.45 * power) * fringe;

  // --- Ember bed: cooling, speckled, only while the solver field is still active here ------
  float stillActive = smoothstep(FIRE_THR * 0.45, FIRE_THR * 1.05, zNow) * (1.0 - waterMask);
  float bedKm = 0.16 + 0.50 * power;
  float bed = step(0.0, dKm) * exp(-max(dKm, 0.0) / bedKm) * stillActive;
  vec3 cellB = worley2(pKm * 21.0 + vec2(11.0, 5.0));
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.3 + 2.2 * cellB.z) + cellB.z * 40.0);
  float spots = smoothstep(0.46, 0.06, cellB.x) * smoothstep(0.30, 0.75, cellB.z + 0.45 * tongues);
  // Individual embers resolve only up close; from far away the bed is a faint dull glow
  float emberFade = smoothstep(2.5, 9.0, 0.045 / max(kmPerPx, 1e-6));
  float embers = bed * mix(0.10, spots * twinkle * 1.8, emberFade);
  vec3 emberRgb = fireRamp(clamp(0.04 + 0.50 * embers, 0.0, 1.0)) * (0.55 + 0.60 * power) * embers;

  fs.emission = frontRgb * front + (fringeRgb + emberRgb) * (1.0 - front);
  fs.front = front;
  fs.glow = bed;

  // --- Char and ash: everything the level set has already crossed --------------------------
  float crossed = smoothstep(-0.015, 0.05, dKm) * smoothstep(0.08, 0.55, hist.a);
  float severity = smoothstep(FIRE_THR, FIRE_THR + 0.34, hist.b);
  float mottle = fbm2(pKm * 7.5 + vec2(5.0, 19.0));
  float patchy = smoothstep(0.20, 0.62, mottle + 0.55 * severity);
  fs.burned = crossed * mix(0.50, 0.97, severity) * mix(0.72, 1.0, patchy) * (1.0 - waterMask);
  float ageEpochs = max(0.0, uFireTime - hist.r);
  float settled = smoothstep(0.4, 4.0, ageEpochs);
  // Ash settles in soft patches where fuel was heavy and the burn severe
  fs.ash = crossed * severity * fuel * settled
         * smoothstep(0.46, 0.86, fbm2(pKm * 4.6 + vec2(29.0, 3.0)) + 0.12 * (mottle - 0.5));

  return fs;
}

// Warm light from nearby flames on the surrounding ground and canyon walls.
// Returns irradiance in the HDR scene unit (multiply by albedo).
vec3 fireBounceLight(vec2 uv, vec3 normalW, float front) {
  // Cheap reject: nothing burning within a few kilometres
  if (fireFieldBlur(uv, 5.0) < 0.003) {
    return vec3(0.0);
  }
  // Two rings of taps on low mip levels. Rotated offsets hide the texel grid of the mip chain,
  // and the east-west and north-south differences of the same taps give the direction to the fire.
  const vec2 k1 = vec2(0.92388, 0.38268);
  const vec2 k2 = vec2(-0.38268, 0.92388);
  const vec2 k3 = vec2(0.70711, 0.70711);
  const vec2 k4 = vec2(-0.70711, 0.70711);
  float r1 = 2.6 * FIRE_FIELD_TEXEL;
  float r2 = 7.0 * FIRE_FIELD_TEXEL;
  float a1 = fireFieldBlur(uv + k1 * r1, 1.5);
  float a2 = fireFieldBlur(uv - k1 * r1, 1.5);
  float a3 = fireFieldBlur(uv + k2 * r1, 1.5);
  float a4 = fireFieldBlur(uv - k2 * r1, 1.5);
  float b1 = fireFieldBlur(uv + k3 * r2, 2.8);
  float b2 = fireFieldBlur(uv - k3 * r2, 2.8);
  float b3 = fireFieldBlur(uv + k4 * r2, 2.8);
  float b4 = fireFieldBlur(uv - k4 * r2, 2.8);
  float near = 0.25 * (a1 + a2 + a3 + a4);
  float wide = 0.25 * (b1 + b2 + b3 + b4);
  vec2 grad = (a1 - a2) * k1 + (a3 - a4) * k2 + 0.7 * ((b1 - b2) * k3 + (b3 - b4) * k4);
  // Toward the fire: east is +x, north is -z in world space
  vec3 toFire = normalize(vec3(grad.x, 0.30 * length(grad) + 0.01, -grad.y));
  float facing = 0.30 + 0.70 * max(0.0, dot(normalW, toFire));
  float amount = clamp(near * 1.05 + wide * 0.75, 0.0, 1.0);
  return vec3(1.0, 0.33, 0.06) * amount * amount * facing * 1.9 * (1.0 - front);
}
`,Xd=`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// Four octaves, each rotated to hide the lattice. Returns roughly 0..1 with mean 0.5.
float fbm2(vec2 p) {
  const mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise2(p);
    p = rot * p * 2.03 + vec2(17.3, 9.1);
    amp *= 0.5;
  }
  return sum / 0.9375;
}

float fbm2Lite(vec2 p) {
  const mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  float sum = 0.5 * valueNoise2(p);
  p = rot * p * 2.03 + vec2(17.3, 9.1);
  sum += 0.25 * valueNoise2(p);
  return sum / 0.75;
}

// Cellular noise: x = distance to the nearest feature point, y = to the second nearest,
// z = a stable random value for the nearest cell.
vec3 worley2(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(cell + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash12(cell + g + 7.7);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
`,ui=6378.137,Oo={family:"modis",altitudeKm:705,maxScanDeg:55,alphaScanNative:1/705,alphaTrack:1/705,detectors:10,zone1Deg:90,zone2Deg:90},ei={family:"viirs",altitudeKm:825.2,maxScanDeg:56.28,alphaScanNative:.125/825.2,alphaTrack:.362/825.2,detectors:32,zone1Deg:31.72,zone2Deg:44.86},Ho=Math.PI/180;function Fr(e){return(ui+e.altitudeKm)/ui}function jd(e,t){const a=Math.min(e.maxScanDeg,Math.abs(t))*Ho,s=Fr(e);return ui*(Math.asin(Math.min(1,s*Math.sin(a)))-a)}const zc={axisEast:1,axisNorth:0,nadirKm:0,valid:!1,scanAngleDeg:0};function Uc(e,t,a){if(!e||e.family!==t.family)return a.valid=!1,a;const s=e.azimuthDeg*Ho;return a.axisEast=Math.sin(s),a.axisNorth=Math.cos(s),a.scanAngleDeg=Math.min(t.maxScanDeg,Math.abs(e.scanAngleDeg)),a.nadirKm=jd(t,a.scanAngleDeg),a.valid=!0,a}function rs(e){const t=e.toPrecision(10);return/[.e]/.test(t)?t:`${t}.0`}function Bc(e){return`vec4(${rs(e.alphaScanNative)}, ${rs(e.alphaTrack)}, ${rs(e.detectors)}, ${e.family==="viirs"?"1.0":"0.0"})`}const qd=`
const float SCAN_RE = ${rs(ui)};
const float MODIS_ORBIT_K = ${rs(Fr(Oo))};
const float VIIRS_ORBIT_K = ${rs(Fr(ei))};
const vec4 MODIS_SENSOR = ${Bc(Oo)};
const vec4 VIIRS_SENSOR = ${Bc(ei)};
const float VIIRS_ZONE1 = ${rs(ei.zone1Deg*Ho)};
const float VIIRS_ZONE2 = ${rs(ei.zone2Deg*Ho)};

struct ScanCell {
  vec2 centerKm;  // cell center, east and north of the region center
  vec2 sizeKm;    // footprint (along scan, along track)
  float edgeKm;   // distance from this point to the nearest cell border
  float edgeScanKm;  // distance along the scan axis to the nearest border across it
  float edgeTrackKm; // distance along the track to the nearest row border or seam
  float seamKm;   // distance to the nearest scan-to-scan seam
  float overlap;  // 0 at nadir, grows with the bow-tie overlap between consecutive scans
  float zone;     // aggregation zone 1..3 (always 1 for MODIS)
};

float scanGroundKm(float theta, float k) {
  return SCAN_RE * (asin(clamp(k * sin(theta), -1.0, 1.0)) - theta);
}

float scanThetaFromGround(float xKm, float k) {
  float g = xKm / SCAN_RE;
  return atan(sin(g), k - cos(g));
}

float scanSampleFromTheta(float theta, vec4 sensor) {
  float n = abs(theta) / sensor.x;
  if (sensor.w > 0.5) {
    float n1 = VIIRS_ZONE1 / sensor.x;
    float n2 = VIIRS_ZONE2 / sensor.x;
    n = min(n, n1) / 3.0 + clamp(n - n1, 0.0, n2 - n1) / 2.0 + max(n - n2, 0.0);
  }
  return n;
}

float scanThetaFromSample(float p, vec4 sensor) {
  if (sensor.w > 0.5) {
    float n1 = VIIRS_ZONE1 / sensor.x;
    float n2 = VIIRS_ZONE2 / sensor.x;
    float p1 = n1 / 3.0;
    float p2 = p1 + (n2 - n1) / 2.0;
    float n = p < p1 ? p * 3.0 : (p < p2 ? n1 + (p - p1) * 2.0 : n2 + (p - p2));
    return n * sensor.x;
  }
  return p * sensor.x;
}

ScanCell evalScanCell(vec2 pKm, vec4 pass, vec4 sensor, float k) {
  ScanCell cell;
  vec2 axis = pass.xy;
  vec2 track = vec2(axis.y, -axis.x);

  // Ground distance from the sub-satellite track: grows away from the satellite. The lattice is
  // mirrored about the track so a region that straddles nadir still gets well-formed cells.
  float xsSigned = pass.z - dot(pKm, axis);
  float side = xsSigned < 0.0 ? -1.0 : 1.0;
  float xs = abs(xsSigned);
  float yt = dot(pKm, track);

  float theta = scanThetaFromGround(xs, k);
  float sampleIdx = floor(scanSampleFromTheta(theta, sensor));
  float th0 = scanThetaFromSample(sampleIdx, sensor);
  float th1 = scanThetaFromSample(sampleIdx + 1.0, sensor);
  float x0 = scanGroundKm(th0, k);
  float x1 = scanGroundKm(th1, k);
  float thC = 0.5 * (th0 + th1);

  float root = sqrt(max(1.0 / (k * k) - sin(thC) * sin(thC), 1e-8));
  float trackKm = SCAN_RE * k * sensor.y * (cos(thC) - root);
  float nadirTrackKm = SCAN_RE * (k - 1.0) * sensor.y;
  float stripKm = sensor.z * nadirTrackKm;

  float strip = floor(yt / stripKm + 0.5);
  float yLocal = yt - strip * stripKm;
  float rowF = yLocal / trackKm + 0.5 * sensor.z;
  float row = clamp(floor(rowF), 0.0, sensor.z - 1.0);
  float rowFrac = rowF - row;

  float xc = 0.5 * (x0 + x1);
  float yc = strip * stripKm + (row + 0.5 - 0.5 * sensor.z) * trackKm;

  float dScan = min(xs - x0, x1 - xs);
  float dRow = min(rowFrac, 1.0 - rowFrac) * trackKm;
  float dSeam = 0.5 * stripKm - abs(yLocal);

  cell.centerKm = axis * (pass.z - side * xc) + track * yc;
  cell.sizeKm = vec2(x1 - x0, trackKm);
  cell.edgeKm = max(0.0, min(dScan, min(dRow, dSeam)));
  cell.edgeScanKm = max(0.0, dScan);
  cell.edgeTrackKm = max(0.0, min(dRow, dSeam));
  cell.seamKm = max(0.0, dSeam);
  cell.overlap = clamp(trackKm / nadirTrackKm - 1.0, 0.0, 1.0);
  cell.zone = sensor.w > 0.5
    ? (abs(thC) < VIIRS_ZONE1 ? 1.0 : (abs(thC) < VIIRS_ZONE2 ? 2.0 : 3.0))
    : 1.0;
  return cell;
}

// Coverage of a hairline of the given width (device pixels) centered on a border that lies
// edgeKm away, where kmPerPx is the screen-space footprint of one pixel on the ground.
float scanHairline(float edgeKm, float kmPerPx, float widthPx) {
  return clamp(0.5 + 0.5 * widthPx - edgeKm / max(kmPerPx, 1e-6), 0.0, 1.0);
}
`,Wu=`
const float TERRAIN_CEILING = 1.5;   // highest radiance of lit ground, under the bloom threshold
const float SUN_KEY = 0.66;          // sunlight on the ground: a slope square to the sun gets about 1.15
const float HAZE_NEAR_KM = 14.0;     // air within about this distance of the camera counts less

// Imagery is a finished picture, not a reflectance map. It goes through the inverse of the display
// tone curve (the ACES fit of three.js at exposure 1, see ./hdrPipeline.ts) so that under reference
// light (1.0) the pipeline returns the picture's own colors, and lighter or darker light moves
// them the way exposure would. The same mapping keeps flat data fills on their legend colors.
const mat3 ACES_OUT_INV = mat3(
  vec3(0.643038, 0.059269, 0.005962),
  vec3(0.311187, 0.931436, 0.063929),
  vec3(0.045775, 0.009295, 0.930118));
const mat3 ACES_IN_INV = mat3(
  vec3(1.764741, -0.147028, -0.036337),
  vec3(-0.675778, 1.160252, -0.162436),
  vec3(-0.088963, -0.013224, 1.198773));

vec3 pictureToScene(vec3 displayLinear) {
  vec3 y = clamp(ACES_OUT_INV * displayLinear, vec3(0.0), vec3(0.90));
  vec3 a = 1.0 - 0.983729 * y;
  vec3 b = 0.0245786 - 0.4329510 * y;
  vec3 c = 0.000090537 + 0.238081 * y;
  vec3 v = (-b + sqrt(b * b + 4.0 * a * c)) / (2.0 * a);
  return max(ACES_IN_INV * v, vec3(0.0)) * 0.6;
}

// Water. Where it is comes from the data: the sea at 0 m, a lake as ground that is exactly level
// in the elevation (see ./shadowBake.ts and ./contextTerrain.ts). Its colour is drawn: on a lake
// mostly one deep tone, so the strips and glints of an aerial mosaic do not cut the lake into
// pieces, with a little of the picture left in it; the sea the same. The pack and the land around it use the
// same terms, so a lake that crosses the pack's edge is one body of water.
const vec3 WATER_DEEP = vec3(0.05, 0.13, 0.21);
const float WATER_PICTURE_LEFT = 0.14;  // share of the picture's own colour kept on a lake
// (none on the sea: imagery at sea is tiles of other dates and brightness, and shows them)
const float WATER_NIGHT_DIM = 0.55;     // by night water gives back a dark sky

// Level ground is a lake only where the picture looks like water: bluer than it is red or green (a
// glint on a lake is pale but blue), or dark, and in either case not green. A swamp or a marsh is as
// level as a lake and covered in plants; a field on a level floodplain is green or brown.
float waterLook(vec3 picture) {
  float luma = dot(picture, vec3(0.2126, 0.7152, 0.0722));
  float greenish = smoothstep(1.04, 1.12, picture.g / max(max(picture.r, picture.b), 1e-3)) * smoothstep(0.02, 0.04, luma);
  float bluish = smoothstep(0.93, 1.0, picture.b / max(max(picture.r, picture.g), 1e-3));
  float dark = 1.0 - smoothstep(0.04, 0.06, luma);
  return max(bluish, dark) * (1.0 - greenish);
}

// The lit surface with water on it. glint: fresnel and sun glint, already scaled; none by night
vec3 waterSurface(vec3 lit, float water, float lake, float sea, float fresnel, float spec, float night) {
  float deepShare = max(mix(0.42, 1.0 - WATER_PICTURE_LEFT, lake), mix(0.42, 1.0, sea));
  vec3 deep = mix(lit, WATER_DEEP, deepShare);
  vec3 glint = (vec3(0.22, 0.28, 0.36) * fresnel * 0.45 + vec3(1.0, 0.93, 0.80) * spec * 0.85) * (1.0 - night);
  return mix(lit, deep + glint, water);
}

// Lit ground never reaches the bloom threshold: a smooth ceiling that keeps the hue
vec3 capSurface(vec3 c) {
  float m = max(c.r, max(c.g, c.b)) / TERRAIN_CEILING;
  return c / pow(1.0 + m * m * m * m, 0.25);
}
`,Oc=`
${Yo}

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;

void main() {
  vUv = uv;
  float elevM = 0.0;
  float baseY = evalTerrainWorldY(uv, elevM);

  vBaseY = baseY;
  vElevM = elevM;

  // The plane is unit-parameterised by uv, so the slab can take each region's own aspect ratio
  vec4 worldPos = modelMatrix * vec4((uv.x - 0.5) * uSlabSize.x, baseY, (0.5 - uv.y) * uSlabSize.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,Zd=`
void main() {
  gl_FragColor = vec4(0.0);
}
`,Qd=`
${Yo}
${qd}

// How strongly the detections' light falls on the ground near them and farther out (display choice)
// From far (the whole block in view) a detection is a few pixels: its light and its fall on the
// ground are lifted so a small fire still reads as fire (display choice)
const float FAR_LIGHT_LIFT = 2.4;
const float FAR_CAST_LIFT = 1.4;
const float FIRE_CAST_NEAR = 14.0;
const float FIRE_CAST_FAR = 9.0;
const float FIRE_CAST_EASE = 0.8;

// Display choices of the close-range look
const float WALL_STRETCH_FROM = 1.3; // imagery stretched this much down a slope starts to count as a wall
const float WALL_STRETCH_FULL = 2.3; // about 46 degrees of true slope at the stage's vertical factor

uniform sampler2D uSatPrev;
uniform sampler2D uSatNext;
uniform sampler2D uFieldTex0;
uniform sampler2D uFieldTex1;
uniform sampler2D uLipariTex;

uniform float uFrameMix;
uniform vec3 uSunDir;          // stage space, toward the sun
uniform float uTime;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform float uReconMix;
uniform float uObserverMix;
uniform float uModisWeight;
uniform float uViirsWeight;
uniform float uUncertaintyMix;
uniform float uSensitivity;
uniform vec2 uExtentKm;   // region size on the ground (east-west, north-south)
uniform vec4 uModisPass;  // (scan axis east, scan axis north, nadir distance km, valid)
uniform vec4 uViirsPass;
uniform vec4 uScanStrip;  // (MODIS strip center along track km, strength, VIIRS center km, strength)
uniform float uLatticeMix; // 1 draws the lattice of empty scan cells; 0 on the landing page, which shows no grid
uniform float uHasSeaCoast;
uniform float uLakeMix;       // 1 when the elevation is the place's own: level ground is then a lake
uniform sampler2D uFireHist;  // arrival, extinction, peak, burned (see ./fireField.ts)
uniform float uFireTime;      // fractional epoch
uniform vec2 uWindDirUv;

// Terrain pack (all optional, weights are 0 without a pack)
uniform sampler2D uAuxTex;      // r normal x (east), g normal z (south), b sky view, a canopy
uniform float uMicroDetail;   // 1: the drawn fine texture (crowns, rock) where the picture is magnified; 0 on a stand-in
uniform float uAuxMix;
uniform float uAuxNormals;    // 1: light by the baked normals; 0: by the stage's own (elevation in whole metres, smoothed)
uniform sampler2D uShadowTex;   // baked once: r the sun shadow factor (1 = lit), g level ground
uniform sampler2D uSmokeShadowTex; // transmittance of the smoke toward the sun at ground level
uniform float uSmokeShadowMix;
uniform vec3 uUnitsPerMetre;    // stage units per metre on x, y, z
uniform vec3 uSunTrue;          // unit vector toward the sun at true scale
uniform vec3 uSunColor;         // radiance of a white surface in full sun
uniform vec3 uSunTransmittance; // of the air above the region, toward the sun (feeds only the inscatter the haze discards)
uniform float uHazeStrength;    // share of the physical air path that is drawn
uniform sampler2D uSkyView;     // sky radiance by azimuth from the sun and elevation (./atmosphere.ts)
uniform float uSkyExposure;     // the dome's display exposure, so the far edge meets it exactly
uniform vec3 uFloorColor;       // the dome's floor (shared with ./atmosphere.ts)
uniform float uFloorHaze;
uniform float uOrthoTexelKm;    // ground size of one texel of the current imagery
uniform float uSatSharpen;      // 1 for low-resolution imagery, 0 for the pack ortho
uniform sampler2D uDetailTex;   // optional zoom 16 inset
uniform vec4 uDetailRect;       // (u0, v0, u1, v1) of the inset in slab uv
uniform float uDetailMix;
uniform float uDetailTexelKm;
uniform sampler2D uContextOrtho; // imagery around the pack (see contextJoin in the heightfield code)
// Real runs: the detections of the overpass on show, each in its own footprint (./footprintField.ts).
// r, b: inside a footprint minus its depth (0 edge, 1 centre line), outside km to the nearest one
// (MODIS, VIIRS). g, a: fire radiative power density of that footprint, MW/km2.
uniform sampler2D uFootTex;
uniform vec2 uFootMix;      // (MODIS, VIIRS): 1 on a real run, where footprints replace the scan lattice
uniform float uLightModis;  // 1 when the lights on show are MODIS detections (the raw side shows them too), 0 for VIIRS
uniform float uLightTexels; // side of the light texture, texels
uniform vec2 uRevealed;     // (MODIS, VIIRS): 1 when that family's footprints on show were revealed after scoring
uniform float uPixelOutline; // 1 draws the outline of each detection's pixel around its light, on the estimate's side too
// The run's intensity scale, from its payload: (0 linear or 1 log10, top MW/km2, bottom MW/km2)
uniform vec3 uFieldScale;
// Positions on that scale where emitted light starts and where it is at its brightest
uniform vec2 uHeatRange;
// Real runs: what the model believes at the time on show (./beliefField.ts). The texture rides on
// uLipariTex, whose legend ramp is not drawn on a real run (the shader is at its sampler limit):
// r, g probability that the cell burns and its expected intensity at one time step, b, a the same
// at the next step, one texel per cell of the model's grid.
uniform vec2 uBeliefGrid;    // cells east-west and north-south; (0, 0) when the run has no belief frames
uniform float uBeliefMix;    // position between the two steps
uniform vec4 uBeliefBox;     // the part of the region that holds any belief: (u west, v south, u east, v north)
uniform float uHeldOut;      // 1 on a pass whose detections were kept from the estimate
uniform float uHeldOutOther; // 1 on a run whose hidden passes another model answered than the one whose belief it carries
uniform vec4 uRevealArrive;  // detections laid on after scoring arrive: xy the pass's direction of travel (east, north), z the front along it (km from the box's centre), w the front's soft width (km)
uniform float uDayJoin;       // share of the box's side over which a day's photograph blends into the land around (0: none)
uniform float uDayFalse;      // 1 while the day's photograph on the box is the false-colour one (bands 7, 2, 1)
uniform float uChanceSquares; // 1 when the squares sized by chance are asked for (eased)
uniform float uDeclaredGiven; // 1 when the run says which cells its model declares at the hidden pass on show (the low bit of a cell's intensity byte)
// A hidden pass: above 0 the light texture holds the last visible pass, drawn as an afterglow at
// this share of its light. 0: the lights are the detections of the pass on show.
uniform float uAfterglow;
uniform float uFarView;      // 0 in a close view, 1 when the whole block is in view: lights and their fall on the ground are lifted there
uniform float uLightGain;    // share of the lights drawn (below 1 while the landing fades from one pass to the next)
uniform float uBeliefQuiet;  // 1 on a run that kept nothing from the model: its squares are drawn quieter
// A pass as a scan: while a pass arrives, a front crosses the region along its ground track and
// what the pass brought appears behind it. (track east, track north, front along the track km, 1
// while the front is crossing)
uniform vec4 uScan;
// A board of tiles over the region's box (the page's round of looks). Row 0 is the north edge.
uniform vec2 uTileGrid;       // (columns, rows); (0, 0) without a board
uniform vec4 uTileState[64];  // per tile: level 0..1, looked, chosen, closed
uniform float uTileHover;     // the tile under the pointer, -1 for none

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;

${Xd}
${Ko}
${Vo}
${Wo}
${$d}

${Wu}

// Imagery for the current region. During a region morph the outgoing image is blended in.
// Returns the picture color and, in insetWeight, how much of it came from the zoom 16 inset.
//
// The imagery is projected straight down, so on a steep face every texel is stretched along the
// fall line by 'stretch' (surface length over map length) and reads as a smear when magnified.
// The filter footprint is therefore widened across the slope by the same amount ('contourUv' is
// the uv step per world unit along the contour): detail becomes as coarse across the slope as the
// projection already made it along the slope, soft instead of streaked.
// The false-colour photograph (MODIS bands 7, 2, 1) shows plants a vivid green and burned ground
// brown or red. Drawing: its green is laid at a third of its saturation and a little darker, so the
// burn reads against the land and the box does not stand as a green slab on its land; red, brown,
// the smoke's cyan and water keep their colours. Each pixel's own colour decides; no burn is drawn.
vec3 quietFalseColour(vec3 c) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float green = smoothstep(1.03, 1.30, c.g / max(max(c.r, c.b), 1e-4));
  return mix(c, mix(vec3(luma), c, 0.33) * 0.85, green);
}

vec3 sampleOrtho(vec2 uv, float kmPerPx, vec2 contourUv, float stretch, float bare, out float insetWeight) {
  float worldPerKm = uUnitsPerMetre.x * 1000.0;
  float magnified = smoothstep(2.4, 0.9, kmPerPx / max(uOrthoTexelKm, 1e-5));
  vec2 smear = contourUv * (uOrthoTexelKm * worldPerKm * (stretch - 1.0) * magnified);
  // On a wall the picture holds almost no real detail (a few texels cover the whole face), so it
  // is also filtered wider in every direction there and keeps only its color. Rock texture drawn in
  // the shader takes the place of the streaks (see wallFade in main).
  // 'bare' is 1 on open rock and 0 under canopy or without a terrain pack: forest keeps its texture
  float wall = smoothstep(WALL_STRETCH_FROM, WALL_STRETCH_FULL, stretch) * bare;
  float widen = 1.0 + wall * 5.0;
  vec2 baseGx = dFdx(uv) * widen;
  vec2 baseGy = dFdy(uv) * widen;
  vec3 center = textureGrad(uSatNext, uv, baseGx + smear, baseGy).rgb;
  insetWeight = 0.0;

  if (uSatSharpen > 0.01) {
    // Mild unsharp mask, only for the 2048 fallback imagery
    vec2 texStep = vec2(1.0 / 2048.0);
    vec3 blur = 0.25 * (
      texture2D(uSatNext, uv + vec2(texStep.x, 0.0)).rgb + texture2D(uSatNext, uv - vec2(texStep.x, 0.0)).rgb +
      texture2D(uSatNext, uv + vec2(0.0, texStep.y)).rgb + texture2D(uSatNext, uv - vec2(0.0, texStep.y)).rgb);
    float detailLuma = dot(center - blur, vec3(0.299, 0.587, 0.114));
    center = clamp(center + vec3(detailLuma * 0.42 * uSatSharpen), 0.0, 1.0);
  }

  // Zoom 16 inset over the fire window, used only where the base imagery is being magnified.
  // Its low frequencies are replaced by those of the base image so tone or season differences
  // between the two mosaics do not show as a rectangle.
  vec2 rectSize = max(uDetailRect.zw - uDetailRect.xy, vec2(1e-4));
  vec2 duv = (uv - uDetailRect.xy) / rectSize;
  float insetMagnified = smoothstep(2.4, 0.9, kmPerPx / max(uDetailTexelKm, 1e-5));
  vec2 dGx = dFdx(duv) * widen + contourUv * (uDetailTexelKm * worldPerKm * (stretch - 1.0) * insetMagnified) / rectSize;
  vec2 dGy = dFdy(duv) * widen;
  if (uDetailMix > 0.01) {
    vec2 edge = min(duv, 1.0 - duv);
    float inside = smoothstep(0.0, 0.035, min(edge.x, edge.y));
    float need = smoothstep(1.5, 0.75, kmPerPx / max(uOrthoTexelKm, 1e-5));
    float w = inside * need * uDetailMix;
    if (w > 0.003) {
      vec2 cuv = clamp(duv, vec2(0.0), vec2(1.0));
      vec3 fine = textureGrad(uDetailTex, cuv, dGx, dGy).rgb;
      vec3 fineLow = textureLod(uDetailTex, cuv, 6.5).rgb;
      vec3 baseLow = textureLod(uSatNext, uv, 5.0).rgb;
      fine *= clamp((baseLow + 0.01) / (fineLow + 0.01), vec3(0.55), vec3(1.8));
      center = mix(center, fine, w);
      insetWeight = w;
    }
  }

  if (uMorph < 0.999) {
    center = mix(texture2D(uSatPrev, uv).rgb, center, uMorph);
  }
  return center;
}

// Stage-space normal from the heightfield (fallback path and during region morphs)
vec3 computeTerrainNormal(vec2 uv, out float slopeMag) {
  float eps = 1.0 / 512.0;
  float hE = evalTerrainWorldYFast(uv + vec2(eps, 0.0));
  float hW = evalTerrainWorldYFast(uv - vec2(eps, 0.0));
  float hN = evalTerrainWorldYFast(uv + vec2(0.0, eps));
  float hS = evalTerrainWorldYFast(uv - vec2(0.0, eps));

  // Note: +v is North (-Z world), so dY/dZ = -(hN - hS) / dzWorld
  float dydx = (hE - hW) / (2.0 * eps * uSlabSize.x);
  float dydz = -(hN - hS) / (2.0 * eps * uSlabSize.y);
  slopeMag = length(vec2(dydx, dydz));
  return normalize(vec3(-dydx, 1.0, -dydz));
}

// Normal of a surface displaced by a small height h (world units), from screen-space derivatives
// (Mikkelsen, bump mapping unparametrized surfaces).
vec3 perturbNormal(vec3 pos, vec3 n, float h) {
  vec3 dpdx = dFdx(pos);
  vec3 dpdy = dFdy(pos);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}

// A sensor overpass is one discrete observation, so cell values come from the nearest epoch
// instead of a blend of two.
vec4 sampleFieldNearestEpoch(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.002), vec2(0.998));
  // Explicit level 0: cell centers jump between fragments, which would pick a blurred mip level
  return mix(textureLod(uFieldTex0, c, 0.0), textureLod(uFieldTex1, c, 0.0), step(0.5, uFrameMix));
}

// Mean of the field channel over the cell footprint (center weighted twice plus four inner taps).
float scanCellValue(ScanCell cell, vec2 axis, vec4 channelMask) {
  vec2 track = vec2(axis.y, -axis.x);
  vec2 inv = 1.0 / uExtentKm;
  vec2 du = axis * cell.sizeKm.x * 0.25 * inv;
  vec2 dv = track * cell.sizeKm.y * 0.25 * inv;
  vec2 c0 = cell.centerKm * inv + vec2(0.5);
  float v = 2.0 * dot(sampleFieldNearestEpoch(c0), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 + du + dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 + du - dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 - du + dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 - du - dv), channelMask);
  return v / 6.0;
}

struct ScanDraw {
  float value;   // per-cell field value, 0..1 of the field range
  float hair;    // hairline coverage of the cell border (constant width in device pixels)
  float hairLit; // wider coverage used for the border of a cell that holds a detection
  float seam;    // hairline coverage of the scan-to-scan seam, scaled by the bow-tie overlap
  float cellPx;  // smaller cell dimension in device pixels
};

// The strip one mirror scan sweeps under the spacecraft: two hairlines one scan apart (the nadir
// width, the spacing of the scan seams in the lattice) and a faint lift between them.
vec3 scanStripMark(vec3 rgb, vec2 pKm, float kmPerPx, vec4 pass, vec4 sensor, float k, vec2 strip, vec3 tint) {
  vec2 track = vec2(pass.y, -pass.x);
  float halfKm = 0.5 * sensor.z * SCAN_RE * (k - 1.0) * sensor.y;
  float d = abs(dot(pKm, track) - strip.x);
  float edge = scanHairline(abs(d - halfKm), kmPerPx, 1.6);
  float inside = 1.0 - smoothstep(halfKm - kmPerPx, halfKm + kmPerPx, d);
  rgb = mix(rgb, rgb * 1.07 + tint * 0.04, inside * strip.y);
  return mix(rgb, tint, edge * strip.y * 0.92);
}

ScanDraw evalScanDraw(vec2 pKm, float kmPerPx, vec4 pass, vec4 sensor, float k, vec4 channelMask) {
  ScanDraw d;
  ScanCell cell = evalScanCell(pKm, pass, sensor, k);
  d.value = scanCellValue(cell, pass.xy, channelMask);
  d.cellPx = min(cell.sizeKm.x, cell.sizeKm.y) / max(kmPerPx, 1e-6);
  // Ground distance one pixel covers across each family of borders. With one isotropic figure a
  // border that runs away from the camera would come out several pixels wide at grazing angles.
  vec2 track = vec2(pass.y, -pass.x);
  float sAxis = dot(pKm, pass.xy);
  float sTrack = dot(pKm, track);
  float pxAxis = max(length(vec2(dFdx(sAxis), dFdy(sAxis))), 1e-6);
  float pxTrack = max(length(vec2(dFdx(sTrack), dFdy(sTrack))), 1e-6);
  d.hair = max(scanHairline(cell.edgeScanKm, pxAxis, 1.15), scanHairline(cell.edgeTrackKm, pxTrack, 1.15));
  d.hairLit = max(scanHairline(cell.edgeScanKm, pxAxis, 2.3), scanHairline(cell.edgeTrackKm, pxTrack, 2.3));
  d.seam = scanHairline(cell.seamKm, pxTrack, 1.9) * smoothstep(0.04, 0.35, cell.overlap);
  return d;
}

// Position (0..1, byte / 255) of a fire radiative power density on the run's intensity scale, as
// the field bytes are encoded: a detection's own value and the field then share one scale.
float fieldNorm(float mwKm2) {
  if (uFieldScale.x < 0.5) return clamp(mwKm2 / max(uFieldScale.y, 1e-3), 0.0, 1.0);
  if (mwKm2 < uFieldScale.z) return 0.0;
  return clamp((1.0 + 254.0 * log(mwKm2 / uFieldScale.z) / log(uFieldScale.y / uFieldScale.z)) / 255.0, 0.0, 1.0);
}

// How hot a position on the scale is drawn: 0 where emitted light starts, 1 at its brightest
float heatOf(float v) {
  return clamp((v - uHeatRange.x) / max(uHeatRange.y - uHeatRange.x, 1e-3), 0.0, 1.0);
}

// A real detection is heat a satellite measured as emitted radiance. It is drawn as light the
// ground gives off: one light per detection, inside the detection's own footprint, as a small hot
// core with a soft halo (FIRMS says the fire is somewhere in the footprint, not that it fills it).
// The lights are drawn into a texture with a mip chain (./footprintField.ts), colour and brightness
// from each detection's radiative power: deep red, through orange, to near white. On a real run it
// is bound to uFireHist, whose fire history is not drawn there. rgb: emitted light. a: its strength
// without the colour.
// Lights that are small on screen run together: the mip chain averages them into one glow, and
// the average is lifted so a light smaller than a pixel still shows, as a far lamp does.
vec4 detectionLight(vec2 uv) {
  vec2 texel = uv * uLightTexels;
  float lod = log2(max(max(length(dFdx(texel)), length(dFdy(texel))), 1.0));
  vec4 light = texture2D(uFireHist, uv) * min(exp2(0.85 * lod), 6.0);
  // By day the same light competes with sunlit ground and with smoke: it is lifted and kept orange
  light.rgb *= mix(vec3(1.5, 1.05, 0.7), vec3(1.0), uNight);
  return light;
}

// A detection laid on after scoring (the hidden instrument once it is revealed, or what a look
// found) is drawn as a filled square in the middle of the instrument's pixel, about six tenths
// of the pixel across, so that it can be told from the estimate's open frames and compared
// with them cell by cell. field: the footprint field of its family (minus depth inside).
// few is 1 where the pixel is only a few screen pixels wide: the square's edge is then soft.
float revealCore(float field, float few) {
  float depth = clamp(-field, 0.0, 1.0);
  return mix(smoothstep(0.36, 0.46, depth), smoothstep(0.30, 0.62, depth), few);
}

// --- The model's belief (real runs) -----------------------------------------------------------
// A detection is a measurement: light at a place and a time. The estimate is a belief, and it is
// drawn as one: marks in ink on the model's own grid, never as light and never as a coat of colour.
//   one square per cell of the model's 375 m grid, its area growing with the probability that
//   the cell burns (a large square is near certain, a small dot is doubt), its strength with the
//   expected intensity
//   a dotted line around the ground where the model holds that fire may be
//   on a pass that was kept from the model, an open frame in place of the square of every cell it
//   declares burning (one half or more, the blind test's own rule): the answer it committed to
// Everything comes from the belief frames. The ink, the dot shape and the line are drawing.
const float BELIEF_DECLARED = 0.5;   // a cell at this probability or more is declared burning
const float BELIEF_MAY_BURN = 0.02;  // the dotted line runs where the smoothed probability crosses this
const float BELIEF_CELL_FILL = 0.58; // side of a certain cell's square, as a share of the cell
// By day the estimate's white ink and a detection's light lie on sunlit ground. Two display
// choices keep them readable there, and neither marks ground the data does not: the ground
// inside the dotted line is drawn this much darker (the same ground the line already encloses),
// and the ground right under a light is drawn darker by up to this share (the light's own
// extent, inside the detection's pixel). Neither says the ground is burned.
const float BELIEF_DAY_SHADE = 0.30;
// Detections laid on after a look or a reveal: how much the ground under their marks is darkened
// by day, and how much their blue is lifted when the whole block is in view
const float REVEAL_DAY_UNDER = 0.55;
const float REVEAL_FILL = 0.9;        // how much of the ground the blue square covers
const float REVEAL_FAR_LIFT = 0.6;
// A declared cell too small on screen for an open frame is drawn as a square of at least this
// probability's size (display choice: the list says declared or not, it gives no size)
const float BELIEF_DECLARED_FAR = 0.4;
const float DAY_LIGHT_UNDER = 0.72;
const float BELIEF_INK_FAR = 1.35;       // how much stronger the ink is drawn on such small cells
const float BELIEF_CELL_FILL_FAR = 0.88; // the same when the cell is only a few pixels wide on screen
const float BELIEF_FRAME_HALF = 0.40; // half side of the open frame of a declared cell on a held-out pass

// Probability and expected intensity of one cell at the time on show
vec2 beliefCell(vec2 cellId) {
  vec4 b = textureLod(uLipariTex, (cellId + 0.5) / uBeliefGrid, 0.0);
  return mix(b.rg, b.ba, uBeliefMix);
}

float beliefTap(vec2 texel) {
  vec4 b = textureLod(uLipariTex, texel / uBeliefGrid, 0.0);
  return mix(b.r, b.b, uBeliefMix);
}

// The probability as a smooth surface over the cells: a cubic B-spline through four bilinear taps
float beliefSmooth(vec2 uv) {
  vec2 st = uv * uBeliefGrid - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = i - 0.5 + w1 / g0 + 0.5;
  vec2 h1 = i + 1.5 + w3 / g1 + 0.5;
  return g0.y * (g0.x * beliefTap(vec2(h0.x, h0.y)) + g1.x * beliefTap(vec2(h1.x, h0.y)))
       + g1.y * (g0.x * beliefTap(vec2(h0.x, h1.y)) + g1.x * beliefTap(vec2(h1.x, h1.y)));
}

// Ink over the ground: (coverage of the marks, coverage of the dark edge that holds the lines on
// bright ground by day, strength of the ink)
// (the fourth value: 1 on ground inside the dotted line, 0 outside)
vec4 beliefMarks(vec2 uv, vec2 pKm, float kmPerPx, float heldOut) {
  vec2 g = uv * uBeliefGrid;
  vec2 id = floor(g);
  vec2 fc = g - id - 0.5;
  vec2 aa = max(fwidth(g), vec2(1e-5));   // cells per pixel along each axis
  float px = max(aa.x, aa.y);
  float cellPx = 1.0 / px;
  vec4 cellBytes = textureLod(uLipariTex, (id + 0.5) / uBeliefGrid, 0.0);
  vec2 be = mix(cellBytes.rg, cellBytes.ba, uBeliefMix);
  float p = clamp(be.x, 0.0, 1.0);
  // A pass kept from the model: which cells the model declares burning there. The run says so
  // itself, with the list the blind test scores; a run that gives no list (an older recording)
  // falls back to the cells the belief on show holds at one half or more, which is a reading of
  // the model and not its own answer.
  float listed = mod(floor(cellBytes.g * 255.0 + 0.5), 2.0);
  float declaredCell = mix(step(BELIEF_DECLARED, p), listed, uDeclaredGiven) * heldOut;
  // (where another model answered the hidden pass, that pass shows its frames alone: the belief the
  // run carries, its chance squares and its dotted line, is the other model's)
  float ownBelief = 1.0 - uHeldOutOther * heldOut;
  // (an open frame needs about seven pixels to read as open; a smaller declared cell is drawn as
  // a square no smaller than BELIEF_DECLARED_FAR stands for, whatever its probability, so the
  // model's answer is still the shape seen from far, as a field of squares and not a fill)
  float framed = smoothstep(5.5, 8.0, cellPx);
  // (the squares sized by chance only when asked for; a declared cell keeps its mark)
  p = max(p * uChanceSquares * ownBelief, BELIEF_DECLARED_FAR * declaredCell * (1.0 - framed));
  float some = step(0.004, p);

  // The cell's square: its area grows with the probability. Even a certain cell leaves ground
  // showing around it, so a sure area is a field of squares and never a fill. How it is drawn
  // depends on its size on screen, so the marks weigh about the same at any distance: solid when
  // small, an outline over a faint pane when larger, and its four corners alone in a close view,
  // where an outline around every cell would cage the ground and the lights.
  // (a cell that is only a few pixels wide is drawn fuller and, below, brighter: from far the
  // estimate has to read as a shape, and the ground between such squares could not be seen anyway)
  float tiny = 1.0 - smoothstep(5.0, 11.0, inversesqrt(aa.x * aa.y));
  float halfSide = mix(BELIEF_CELL_FILL, BELIEF_CELL_FILL_FAR, tiny) * 0.5 * sqrt(p);
  vec2 d = abs(fc) - halfSide;
  float inside = (1.0 - smoothstep(-0.5 * aa.x, 0.5 * aa.x, d.x)) * (1.0 - smoothstep(-0.5 * aa.y, 0.5 * aa.y, d.y)) * some;
  vec2 dIn = d + 1.3 * aa;
  float inner = (1.0 - smoothstep(-0.5 * aa.x, 0.5 * aa.x, dIn.x)) * (1.0 - smoothstep(-0.5 * aa.y, 0.5 * aa.y, dIn.y)) * some;
  // (its size on screen: the mean of its two sides, since a cell on a slope seen at a low angle
  // is long one way and short the other)
  float sizePx = inversesqrt(aa.x * aa.y);
  float close = smoothstep(13.0, 22.0, sizePx);
  float pane = mix(mix(1.0, 0.20, smoothstep(6.0, 13.0, sizePx)), 0.0, close);
  float corners = step(0.55 * halfSide, min(abs(fc.x), abs(fc.y)));
  float square = max((inside - inner) * mix(1.0, corners, close), inside * pane * (1.0 - 0.75 * uBeliefQuiet));

  // A pass kept from the model: every cell the model declares burning is an open frame in place
  // of its square, the answer it committed to and has not been shown. The other cells stay as
  // they are.
  float declared = declaredCell * framed;
  float box = max(abs(fc.x), abs(fc.y));
  float strokeCells = max(1.5 * px, 0.06);
  float ring = (1.0 - smoothstep(BELIEF_FRAME_HALF - 0.5 * px, BELIEF_FRAME_HALF + 0.5 * px, box))
             * smoothstep(BELIEF_FRAME_HALF - strokeCells - 0.5 * px, BELIEF_FRAME_HALF - strokeCells + 0.5 * px, box);
  float mark = mix(square, ring, declared);

  // Cells too small to draw one by one run together into a tone of the same coverage
  float resolved = smoothstep(2.0, 3.6, cellPx);
  vec4 near = texture2D(uLipariTex, uv);
  float tone = BELIEF_CELL_FILL * BELIEF_CELL_FILL
             * max(mix(near.r, near.b, uBeliefMix) * uChanceSquares * ownBelief, BELIEF_DECLARED_FAR * declaredCell);
  float cells = mix(tone * 0.8, mark, resolved);

  // The dotted line around the ground that may burn
  float ps = beliefSmooth(uv);
  float grad = max(fwidth(ps), 1e-5);
  // (no line where the surface is exactly zero: that is ground beyond every cell's reach, and at
  // the edge of the box above the gradient is not to be trusted)
  float reach = step(1e-6, ps);
  float line = (1.0 - smoothstep(0.55, 1.45, abs(ps - BELIEF_MAY_BURN) / grad)) * reach;
  float lineEdge = (1.0 - smoothstep(1.4, 2.6, abs(ps - BELIEF_MAY_BURN) / grad)) * reach;
  // Dots of a steady size on screen, fixed to the ground (their size steps by octaves with distance)
  float dotKm = exp2(floor(log2(max(kmPerPx, 1e-4) * 5.0)));
  vec2 q = pKm / dotKm;
  float dots = step(0.0, sin(3.14159265 * (q.x + q.y)) * sin(3.14159265 * (q.x - q.y)));
  line *= dots * ownBelief;
  lineEdge *= dots * ownBelief;

  // (the ink's strength follows the belief's intensity; on a pass another model answered, an even one)
  float strength = mix(0.70, 1.0, mix(0.5, heatOf(be.y), ownBelief)) * mix(1.0, BELIEF_INK_FAR, tiny);
  float within = smoothstep(-1.0, 1.0, (ps - BELIEF_MAY_BURN) / grad) * reach * ownBelief;
  return vec4(max(cells, line * 0.9), lineEdge * 0.7, mix(strength, mix(1.0, BELIEF_INK_FAR, tiny), line), within);
}

// --- The board of tiles ------------------------------------------------------------------------
// Lines in ink on the ground, never a fill: a hairline along every tile edge; a frame inside the
// tile that grows heavier with its level; a firm outline where a look was spent; corner brackets
// on the tile chosen now; a brighter outline under the pointer.
// Returns (coverage of the ink, coverage of the dark edge under it, strength of the ink).
const float TILE_BRACKET_ARM = 0.25;    // arm length, as a share of the tile's side
const float TILE_BRACKET_DAY = 1.1;     // ink strength of the brackets by day
const float TILE_BRACKET_NIGHT = 1.6;   // and by night, where the board's ink is dimmed
const float TILE_EDGE_INK = 0.55;       // coverage of every tile's edge line
const float TILE_OUTER_INSET = 0.007;   // the board's outer line, as a share of the box's side inside its edge
vec3 tileMarks(vec2 uv) {
  vec2 tg = vec2(uv.x, 1.0 - uv.y) * uTileGrid;
  vec2 id = min(floor(tg), uTileGrid - 1.0);
  vec2 tf = tg - id;
  float index = id.y * uTileGrid.x + id.x;
  vec4 state = uTileState[int(clamp(index, 0.0, 63.0))];
  // Tiles per pixel across each family of edges (measured along its own direction, so an edge
  // that runs away from the camera keeps its width)
  vec2 px = max(vec2(length(vec2(dFdx(tg.x), dFdy(tg.x))), length(vec2(dFdx(tg.y), dFdy(tg.y)))), vec2(1e-6));
  // The land around overlaps the box's last strip (see the context terrain's discard), so the board's
  // outer line is set just inside it, where nothing covers it and it stays one unbroken line
  vec2 inset = TILE_OUTER_INSET * uTileGrid;
  vec2 lo = tf - inset * (1.0 - step(0.5, id));
  vec2 hi = (1.0 - tf) - inset * step(uTileGrid - 1.5, id);
  vec2 edgePx = min(lo, hi) / px;                 // distance to the tile's edges, pixels
  float d = min(edgePx.x, edgePx.y);
  float hover = 1.0 - step(0.5, abs(index - uTileHover));

  // Every edge: a line about one and a half pixels wide, firm enough to read from the block's
  // distance on entry, when nothing else is marked yet; thin, so a light under it still shows
  float hair = 1.0 - smoothstep(0.7, 1.6, abs(d));
  float ink = hair * mix(TILE_EDGE_INK, 0.12, state.a);
  float strength = 0.8;
  // Every mark of a tile is a thin line set inside the tile, so where two marked tiles meet there
  // are two fine lines with ground between them and never one heavy band.
  // Level: a frame well inside the edge, one to three pixels thick, brighter as the level rises
  float thick = 1.0 + 2.0 * state.r;
  float frame = smoothstep(5.6, 6.4, d) * (1.0 - smoothstep(6.0 + thick - 0.4, 6.0 + thick + 0.4, d)) * step(0.004, state.r);
  ink = max(ink, frame * (0.14 + 0.62 * state.r));
  // Looked at: a firm fine outline just inside the edge
  float firm = smoothstep(1.6, 2.2, d) * (1.0 - smoothstep(3.2, 3.8, d)) * state.g;
  ink = max(ink, firm * 0.9);
  // Under the pointer
  float under = smoothstep(1.6, 2.2, d) * (1.0 - smoothstep(3.4, 4.0, d)) * hover;
  ink = max(ink, under * 0.7);
  // Chosen: brackets at the four corners, the strongest mark on the board. Each arm runs a
  // quarter of the tile's side along its own edge, so a tile seen at a slant keeps four
  // brackets and not four dots
  vec2 cornerFrac = min(tf, 1.0 - tf);
  float inCorner = step(max(cornerFrac.x, cornerFrac.y), TILE_BRACKET_ARM);
  float bracket = smoothstep(0.6, 1.2, d) * (1.0 - smoothstep(5.4, 6.2, d)) * inCorner * state.b;
  ink = max(ink, bracket);
  strength = mix(strength, 1.0, max(firm, under));
  strength = mix(strength, mix(TILE_BRACKET_DAY, TILE_BRACKET_NIGHT, uNight), bracket);
  float edge = smoothstep(0.6, 1.4, d) * (1.0 - smoothstep(4.6, 6.0, d));
  edge *= max(max(state.g, state.b), hover);
  // (every edge line gets a faint dark edge of its own, so it stands on bright ground by day)
  edge = max(edge, (1.0 - smoothstep(1.6, 3.2, abs(d))) * 0.45 * (1.0 - state.a));
  // (the brackets get a wider dark edge of their own, so they stand on bright ground too)
  edge = max(edge, (1.0 - smoothstep(7.0, 9.0, d)) * inCorner * state.b);
  return vec3(ink, edge, strength);
}

// Border visibility. A lit cell keeps its border until the cell is only a few pixels across. The
// lattice over empty ground fades out much earlier so it never turns into a wireframe texture.
float scanLitFade(float cellPx) { return smoothstep(3.0, 9.0, cellPx); }
float scanEmptyFade(float cellPx, float fullPx) { return smoothstep(fullPx * 0.34, fullPx, cellPx); }

void main() {
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // Ground position in km (east, north of the region center) and its screen-space footprint
  vec2 pKm = (vUv - vec2(0.5)) * uExtentKm;
  float kmPerPx = max(length(dFdx(pKm)), length(dFdy(pKm)));

  // Real detection footprints, and the screen-space gradient of each family's field (for the
  // one-pixel edge of a footprint, whatever the field's units on either side of that edge)
  vec4 foot = texture2D(uFootTex, vUv);
  float footGradM = max(length(vec2(dFdx(foot.r), dFdy(foot.r))), 1e-6);
  float footGradV = max(length(vec2(dFdx(foot.b), dFdy(foot.b))), 1e-6);
  // What the overpass on show detected, as emitted light (nothing on a simulated run)
  // The pass being scanned: 1 on ground the front has crossed (everywhere once it is through)
  float scanAlong = dot(pKm, uScan.xy);
  float scanned = mix(1.0, 1.0 - smoothstep(uScan.z - 0.25, uScan.z, scanAlong), uScan.w);
  vec4 lit = detectionLight(vUv) * uFootMix.x * scanned * uLightGain * (1.0 + FAR_LIGHT_LIFT * uFarView);
  // How much of the light's fall on the ground is drawn (all of it for the pass on show)
  float castShare = uLightGain * (1.0 + FAR_CAST_LIFT * uFarView);
  if (uAfterglow > 0.001) {
    // The pass on show is hidden. What the last visible pass detected is kept as an afterglow:
    // blurred, dull and red, with no point of light, so it cannot be taken for a detection of this pass.
    // It fades with the hours since that pass (see the stage). It says where the visible
    // instrument last saw fire, not what burns now. By night only: by day a glow would be a red
    // tint on sunlit ground, and the trace of the fire is the smoke that pass left.
    vec4 soft = textureLod(uFireHist, vUv, 3.4);
    // (lifted when it is small on screen, as the lights are: from far a dull glow would vanish)
    float glowLift = mix(1.0, 2.6, smoothstep(0.02, 0.06, kmPerPx));
    lit = vec4(vec3(0.62, 0.10, 0.03) * dot(soft.rgb, vec3(0.5, 0.4, 0.1)) * 1.3 * glowLift, 0.0) * uAfterglow * uNight * uFootMix.x * uLightGain;
    castShare = 0.30 * uAfterglow * uLightGain;
  }
  // The model's belief as ink marks (worked out here, outside any branch, for its derivatives)
  vec4 marks = vec4(0.0);
  // (only inside the box that holds any belief: most of the ground has none and skips the work)
  if (uBeliefGrid.x > 0.5 && vUv.x > uBeliefBox.x && vUv.x < uBeliefBox.z && vUv.y > uBeliefBox.y && vUv.y < uBeliefBox.w) {
    marks = beliefMarks(vUv, pKm, kmPerPx, uHeldOut * scanned);
  }
  vec3 tiles = vec3(0.0);
  if (uTileGrid.x > 0.5) tiles = tileMarks(vUv);

  // --- Surface normal and sky visibility ------------------------------------------------------
  float slopeMag = 0.0;   // stage-space gradient magnitude
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec4 aux = texture2D(uAuxTex, vUv);
  // (the baked normals come from the elevation as it came: in whole metres they hold its terraces,
  // so such a pack is lit by normals from its own smoothed elevation; see smoothTerraces)
  float auxNormalMix = uAuxMix * uAuxNormals;
  if (auxNormalMix < 0.999) {
    N = computeTerrainNormal(vUv, slopeMag);
  }
  if (auxNormalMix > 0.001) {
    // True-scale unit normal, y rebuilt, then mapped into the scaled stage space
    vec2 nxz = aux.rg * 2.0 - 1.0;
    vec3 nTrue = vec3(nxz.x, sqrt(max(1e-4, 1.0 - dot(nxz, nxz))), nxz.y);
    vec3 nAux = normalize(nTrue / uUnitsPerMetre);
    float slopeAux = length(nAux.xz) / max(nAux.y, 1e-3);
    N = normalize(mix(N, nAux, auxNormalMix));
    slopeMag = mix(slopeMag, slopeAux, auxNormalMix);
  }
  // Tangent of the true slope angle (the stage exaggerates relief)
  float trueSlope = slopeMag * uUnitsPerMetre.x / max(uUnitsPerMetre.y, 1e-9);
  float skyView = mix(1.0, aux.b, uAuxMix);

  // --- Imagery ---------------------------------------------------------------------------------
  // Contour direction on the ground (uv step per world unit) and the stretch of the projection
  vec2 fall = N.xz / max(length(N.xz), 1e-4);
  vec2 contourUv = vec2(-fall.y / uSlabSize.x, -fall.x / uSlabSize.y);
  float stretch = min(sqrt(1.0 + slopeMag * slopeMag), 6.0);
  float insetWeight = 0.0;
  float bare = uAuxMix * (1.0 - smoothstep(0.15, 0.6, aux.a));
  vec3 photoRgb = sampleOrtho(vUv, kmPerPx, contourUv, stretch, bare, insetWeight);
  if (uDayFalse > 0.5) photoRgb = quietFalseColour(photoRgb);
  // Over its last stretch the pack shows the context imagery, like its surface takes the context
  // elevation there: the step in detail between the two is spread over the join
  float joinK = contextJoin(vUv);
  // A day's photograph laid on the box (dayPicture) meets the land around's own picture over a wider
  // band, so its colours (a false-colour one above all) go into the land and do not stop at a line.
  // Drawing: the photograph covers the box, the blend is only where they meet.
  if (uDayJoin > 0.0) {
    vec2 toEdge = min(vUv, 1.0 - vUv);
    joinK = max(joinK, (1.0 - smoothstep(0.0, uDayJoin, min(toEdge.x, toEdge.y))) * uContextMix);
  }
  // (derivatives are taken outside the branch; inside it they are undefined)
  vec2 contextUv = (vUv - 0.5) / uContextScale + 0.5;
  vec2 contextDx = dFdx(contextUv);
  vec2 contextDy = dFdy(contextUv);
  if (joinK > 0.0) {
    photoRgb = mix(photoRgb, textureGrad(uContextOrtho, contextUv, contextDx, contextDy).rgb, joinK);
  }
  float satLuma = dot(photoRgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 satRgb = pictureToScene(photoRgb);

  // Canopy cover: the pack's canopy index, or an imagery heuristic without a pack
  float vegHeuristic = clamp((photoRgb.g - max(photoRgb.r, photoRgb.b)) * 7.0 + 0.5, 0.0, 1.0);
  float canopyK = mix(vegHeuristic, aux.a, uAuxMix);

  // Water (hydrologically flat lakes, rivers, sea coves)
  float seaMask = uHasSeaCoast * (1.0 - smoothstep(1.2, 4.5, vElevM));
  float inlandWater = step(photoRgb.g * 0.94, photoRgb.b)
                    * step(photoRgb.r * 1.45, photoRgb.b)
                    * (1.0 - smoothstep(0.022, 0.042, satLuma))
                    * (1.0 - smoothstep(0.012, 0.028, slopeMag));
  // A lake: level ground in the elevation where the picture looks like water
  vec4 baked = texture2D(uShadowTex, vUv);
  float lake = baked.g * uLakeMix * waterLook(photoRgb);
  float waterMask = clamp(max(max(seaMask, inlandWater), lake), 0.0, 1.0);

  // --- Close-range micro detail: rock on steep walls, crown texture where canopy is high ----
  // Rendering treatment only. It appears when the imagery is magnified past its own resolution.
  float texelKm = mix(uOrthoTexelKm, uDetailTexelKm, insetWeight);
  // (none on a stand-in: its picture is coarse, and close to it the drawn texture aliases into waves)
  // and only where a pixel is under about half a crown (crowns are 14 to 22 m): on a coarse picture
  // the imagery is magnified at distances where the drawn crowns would be a pixel's stipple
  float detailResolves = 1.0 - smoothstep(0.006, 0.014, kmPerPx);
  float detailFade = smoothstep(1.6, 0.45, kmPerPx / max(texelKm, 1e-5)) * detailResolves * (1.0 - waterMask) * uMicroDetail;
  float rockMask = smoothstep(0.50, 1.05, trueSlope) * (1.0 - 0.75 * canopyK);
  float canopyMask = smoothstep(0.30, 0.75, canopyK) * (1.0 - smoothstep(0.9, 1.6, trueSlope));
  // On walls the imagery keeps only its color (see sampleOrtho), so the rock texture is drawn there
  // at any distance where it still resolves, not only when the imagery is magnified
  float wallFade = smoothstep(WALL_STRETCH_FROM, WALL_STRETCH_FULL, stretch) * bare
                 * (1.0 - smoothstep(0.010, 0.030, kmPerPx)) * (1.0 - waterMask) * uMicroDetail;
  float roughness = 0.9;
  if (detailFade > 0.01 || wallFade > 0.01) {
    // Isotropic km-like coordinates in stage space, so detail is not stretched by the exaggeration
    vec3 p = vWorldPos / (uUnitsPerMetre.x * 1000.0);
    vec3 wgt = pow(abs(N), vec3(4.0));
    wgt /= (wgt.x + wgt.y + wgt.z);

    // Rock: fractured faces, slightly banded on the side projections
    float rockTop = fbm2Lite(p.xz * 34.0);
    float rockX = fbm2Lite(vec2(p.z * 22.0, p.y * 58.0) + vec2(7.0, 3.0));
    float rockZ = fbm2Lite(vec2(p.x * 22.0, p.y * 58.0) + vec2(1.0, 9.0));
    float rockH = wgt.y * rockTop + wgt.x * rockX + wgt.z * rockZ;
    if (wallFade > 0.01) {
      // Beds across the face (they follow elevation, gently bent) break up the fall-line streaks
      float bend = (valueNoise2(p.xz * 2.3) - 0.5) * 0.14;
      float beds = fbm2Lite(vec2((vElevM * 0.001 + bend) * 38.0, dot(p.xz, vec2(0.71, 0.71)) * 3.0));
      rockH = mix(rockH, smoothstep(0.25, 0.75, 0.5 * (rockH + beds)), wallFade);
    }

    // Canopy: crown clusters about 16 m across, seen from above
    // (cluster size varies with a low-frequency term so it does not read as a regular stipple)
    float crownScale = 46.0 + 26.0 * valueNoise2(p.xz * 3.1);
    vec3 crown = worley2(p.xz * crownScale + vec2(13.0, 5.0));
    float crownH = 1.0 - smoothstep(0.0, 0.70, crown.x);

    float rockW = rockMask * max(detailFade, wallFade);
    float canopyW = canopyMask * detailFade;
    satRgb *= 1.0 + (rockH - 0.5) * mix(0.34, 0.85, wallFade) * rockW;
    satRgb *= mix(1.0, 0.84 + 0.24 * crownH + 0.08 * (crown.z - 0.5), canopyW);

    // Relief of the detail in world units (metres times the vertical scale)
    float hWorld = (rockH * 9.0 * rockMask * detailFade + crownH * 6.0 * canopyW) * uUnitsPerMetre.y;
    N = normalize(mix(N, perturbNormal(vWorldPos, N, hWorld), detailFade));
    roughness = mix(roughness, 0.55 + 0.35 * rockH, rockW);
  }

  // --- Lighting ------------------------------------------------------------------------------
  // Reference light is 1.0: there the imagery shows its own colors (it already carries the sun
  // of the day it was taken). A slope square to the sun gets about 1.15, level ground about 0.95,
  // a slope turned away or in cast shadow about 0.25, so relief reads by contrast.
  // Sun shadow is baked once per region with a soft edge (./shadowBake.ts).
  float shadow = mix(0.10, 1.0, baked.r);
  // The context terrain around the pack has no baked shadows and no sky view map. Toward the pack
  // edge both ease out to what the context uses, so the light does not step along the boundary.
  vec2 toPackEdge = min(vUv, 1.0 - vUv);
  float edgeEase = (1.0 - smoothstep(0.0, 0.07, min(toPackEdge.x, toPackEdge.y))) * uContextMix;
  shadow = mix(shadow, 1.0, edgeEase);
  // Soft shadow of the smoke column (see ./smokeVolume.ts). It dims sunlight, not emission.
  // Five taps soften it into a penumbra, and part of the light always gets through: thick smoke
  // dims the ground, it does not blot it out.
  float smokeT = 0.36 * texture2D(uSmokeShadowTex, vUv).r
               + 0.16 * (texture2D(uSmokeShadowTex, vUv + vec2(0.012, 0.007)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(-0.007, 0.012)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(-0.012, -0.007)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(0.007, -0.012)).r);
  float smokeShade = mix(1.0, mix(0.42, 1.0, smokeT), uSmokeShadowMix);
  float nDotL = max(0.0, dot(N, sunDir));
  float skyFill = 0.5 + 0.5 * N.y;
  float ao = mix(mix(0.34, 1.0, smoothstep(0.42, 0.98, skyView)), 0.92, edgeEase);
  vec3 sunIrradiance = uSunColor * (SUN_KEY * nDotL * shadow * smokeShade);
  vec3 ambientSky = mix(vec3(0.16, 0.19, 0.25), vec3(0.24, 0.27, 0.33), skyFill) * ao;
  vec3 lighting = ambientSky + sunIrradiance;
  vec3 litEarth = satRgb * lighting;

  // Broad sun sheen on bare rock, scaled by the detail roughness
  vec3 halfVec = normalize(sunDir + viewDir);
  float rockSpec = pow(max(0.0, dot(N, halfVec)), mix(64.0, 10.0, roughness))
                 * (1.0 - roughness) * 0.22 * rockMask * shadow * nDotL;
  litEarth += vec3(1.0, 0.96, 0.90) * rockSpec;

  // Relief shading term reused by flat data fills so they sit on the ground instead of floating
  float shadeTerm = clamp(nDotL * shadow * 1.15 + 0.22, 0.0, 1.0);

  if (waterMask > 0.02) {
    // Wind ruffles from two drifting noise fields. Regular wave trains read as stripes across
    // the whole sea from the distances the stage looks from.
    vec2 wq = vWorldPos.xz * 7.0;
    float rippleA = valueNoise2(wq + vec2(uTime * 0.21, uTime * 0.13)) - 0.5;
    float rippleB = valueNoise2(wq * 2.3 + vec2(7.0 - uTime * 0.17, 3.0 + uTime * 0.19)) - 0.5;
    float rippleFade = 1.0 - smoothstep(0.015, 0.09, kmPerPx);
    vec3 waterN = normalize(N + vec3(rippleA, 0.0, rippleB) * (0.05 * rippleFade * waterMask));
    float spec = pow(max(0.0, dot(waterN, halfVec)), 96.0) * shadow;
    float fresnel = pow(1.0 - max(0.0, dot(waterN, viewDir)), 4.0);
    // (the sea, from the elevation's 0 m, takes one deep tone as a lake does: imagery at sea is
    // often tiles of other dates and brightness)
    litEarth = waterSurface(litEarth, waterMask, lake, seaMask, fresnel, spec, uNight);
  }

  // Aerial perspective: Rayleigh and Mie scattering along the true-scale path from the camera
  // (see ./atmosphere.ts). Valleys and far slopes sit behind more air than ridges and near ones.
  vec3 toPointKm = (vWorldPos - cameraPosition) / (uUnitsPerMetre * 1000.0);
  float pathKm = length(toPointKm);
  float baseElevM = mix(uElevPrevRange.x, uElevNextRange.x, uMorph);
  float camAltKm = (baseElevM + cameraPosition.y / uUnitsPerMetre.y) * 0.001;
  // The stage is a miniature: a close view is in truth tens of kilometres away, and the full air
  // path would veil the foreground. Air near the camera therefore counts less (display choice).
  float hazeKm = pathKm * uHazeStrength * pathKm / (pathKm + HAZE_NEAR_KM);
  vec3 viewTrue = toPointKm / max(pathKm, 1e-4);
  vec3 hazeUnused;
  vec3 hazeTrans = atmAerialPerspective(
    camAltKm, vElevM * 0.001, hazeKm, dot(viewTrue, uSunTrue), uSunTransmittance, hazeUnused
  );
  // The light scattered into the path is whatever the dome draws behind this direction: sky near
  // and above the horizon, the floor when the view looks down. Distance therefore takes the ground
  // into exactly its backdrop, in every view and mode, and the far part of the slab never stands
  // out lighter or darker than what surrounds it.
  vec3 backdrop = atmBackdrop(
    uSkyView, viewTrue, normalize(uSunTrue), clamp(camAltKm, 0.02, ATM_TOP - 1.0),
    uSkyExposure, uFloorColor, uFloorHaze
  );
  vec3 hazeIn = backdrop * (1.0 - hazeTrans);
  // Surface radiance before the air in between (burned ground is composed from it below)
  vec3 litEarthClear = litEarth;
  litEarth = nightGrade(capSurface(litEarth * hazeTrans + hazeIn));
  // By night water gives back a dark sky: never brighter than the land beside it
  litEarth *= 1.0 - WATER_NIGHT_DIM * waterMask * uNight;

  // Sample 256x256 scientific solver fields
  vec4 f0 = textureLod(uFieldTex0, vUv, 0.0);
  vec4 f1 = textureLod(uFieldTex1, vUv, 0.0);
  vec4 field = mix(f0, f1, uFrameMix);

  float sensGate = max(0.015, uSensitivity * 0.42);
  float zHatNorm  = field.r;
  float sigmaNorm = field.g;

  // Orbital Sensor Split Curtain plane signed distance
  vec2 cutDir = normalize(uCutawayDir);
  float scanCoord = dot(vUv - vec2(0.5), cutDir) - uCutawayPlane;
  float posteriorSide = smoothstep(-0.0045, 0.0045, -scanCoord);
  float rawSide = 1.0 - posteriorSide;

  float showPosterior = clamp(uReconMix + uCutawayMix * posteriorSide, 0.0, 1.0);
  float showRawModis  = clamp(uCutawayMix * rawSide, 0.0, 1.0);

  vec3 finalRgb = litEarth;

  // ===========================================================================
  // A. HARMONIZED 375 M SIDE (OR FULL FIRE FIELD MODE): FIRE AS A SURFACE TREATMENT
  // Position, timing and strength come from the solver field. Shape below one cell is rendering.
  // ===========================================================================
  if (showPosterior > 0.005) {
    vec3 postRgb;
    if (uFootMix.x > 0.5) {
      // A real run. Two things are drawn and nothing is invented: no flames, no embers, no
      // burned ground.
      // 1. The model's estimate.
      if (uBeliefGrid.x > 0.5) {
        // The belief, in ink (see beliefMarks). By day a dark edge holds the ink on bright ground.
        vec3 ink = mix(vec3(1.30, 1.32, 1.36), vec3(0.40, 0.46, 0.56), uNight) * marks.z;
        postRgb = litEarth * (1.0 - 0.55 * marks.y * (1.0 - uNight) * hazeTrans.g);
        postRgb *= 1.0 - BELIEF_DAY_SHADE * marks.w * (1.0 - uNight) * hazeTrans.g;
        // (while the landing fades from one pass to the next the ink dips with the lights, so the
        // belief's change of time does not pop)
        postRgb = mix(postRgb, ink, marks.x * mix(0.84, 0.48, uBeliefQuiet) * mix(0.4, 1.0, uLightGain) * hazeTrans.g);
      } else {
        // No belief frames on show (the file has not come yet, or did not load): no estimate is
        // drawn. A tint read off the run's field used to stand in here; on a real field it washed
        // the whole block red, since that field is above its floor almost everywhere.
        postRgb = litEarth;
      }
      // 2. What the overpass on show detected, as emitted light, each detection in its own
      // footprint. A paired MODIS overpass (landing) belongs to the raw side only.
      // The light falls on the ground around it: the same light texture read at two coarse levels
      // (about half a kilometre and two kilometres wide), taken up by the ground's own colour. Where the
      // light is and how strong comes from the detections; how far it reaches is drawing.
      vec3 castLight = textureLod(uFireHist, vUv, 4.4).rgb * FIRE_CAST_NEAR + textureLod(uFireHist, vUv, 6.2).rgb * FIRE_CAST_FAR;
      // Eased toward a ceiling: a few very strong detections light their ridge, they do not flood it
      castLight /= 1.0 + FIRE_CAST_EASE * dot(castLight, vec3(0.3, 0.5, 0.2));
      postRgb += (satRgb + vec3(0.012)) * castLight * mix(0.3, 1.0, uNight) * (1.0 - 0.6 * waterMask) * hazeTrans * uFootMix.x * scanned * castShare;
      postRgb *= 1.0 - DAY_LIGHT_UNDER * clamp(lit.a, 0.0, 1.0) * (1.0 - uNight) * hazeTrans.g;
      postRgb += lit.rgb * hazeTrans.g;
      // The instrument's pixel around each light, when asked for: a faint warm hairline, so a
      // coarse pixel reads as coarse beside the model's finer cells
      if (uPixelOutline > 0.01) {
        float pixelHair = scanHairline(abs(foot.r), footGradM, 1.2) * (1.0 - uRevealed.x)
                        + scanHairline(abs(foot.b), footGradV, 1.2) * (1.0 - uRevealed.y);
        postRgb = mix(postRgb, vec3(1.05, 0.66, 0.42) * mix(1.0, 0.8, uNight), clamp(pixelHair, 0.0, 1.0) * 0.55 * uPixelOutline * scanned * hazeTrans.g);
      }
      // 3. Detections laid on after scoring (the hidden instrument of a blind run once it is
      // revealed, or what a look found): a filled blue square in each detection's own pixel. One
      // mark, the same for a look and for a reveal, never the warm light of a detection the
      // estimate was made from, and filled where the estimate's frames are open.
      if (uRevealed.x + uRevealed.y > 0.5) {
        // (a pixel's half width on screen is one over its field's gradient)
        float smallM = 1.0 - smoothstep(3.0, 9.0, 1.0 / footGradM);
        float smallV = 1.0 - smoothstep(3.0, 9.0, 1.0 / footGradV);
        float coreM = revealCore(foot.r, smallM) * uRevealed.x;
        float coreV = revealCore(foot.b, smallV) * uRevealed.y;
        // (they arrive behind a front that crosses the fire along the pass's own ground track: the
        // order the satellite acquired them in; the timing is drawing)
        float arrived = smoothstep(-uRevealArrive.w, 0.0, uRevealArrive.z - dot(pKm, uRevealArrive.xy));
        coreM *= arrived;
        coreV *= arrived;
        float core = clamp(coreM + coreV, 0.0, 1.0);
        float fewPx = max(smallM * uRevealed.x, smallV * uRevealed.y);
        // By day the ground under the square is drawn darker first, so the blue stands on sunlit
        // ground (display choice)
        postRgb *= 1.0 - REVEAL_DAY_UNDER * core * (1.0 - uNight) * hazeTrans.g;
        // Its strength follows the detection's fire power. Small squares run together: they are
        // drawn in a deeper blue there, so the patch they make stays apart from the estimate's ink
        float power = (coreM * mix(0.6, 1.2, heatOf(fieldNorm(foot.g))) + coreV * mix(0.6, 1.2, heatOf(fieldNorm(foot.a)))) / max(coreM + coreV, 1e-4);
        vec3 blue = mix(vec3(0.20, 0.62, 1.0), vec3(0.05, 0.42, 1.0), fewPx) * power * (1.0 + REVEAL_FAR_LIFT * uFarView);
        postRgb = mix(postRgb, blue, core * REVEAL_FILL * hazeTrans.g);
        // The estimate's ink stays on top, so a frame the hidden satellite filled reads as a white
        // frame with blue inside it: the two things the test compares, one over the other
        if (uBeliefGrid.x > 0.5) {
          vec3 inkOver = mix(vec3(1.30, 1.32, 1.36), vec3(0.62, 0.68, 0.78), uNight) * marks.z;
          postRgb = mix(postRgb, inkOver, marks.x * 0.84 * core * hazeTrans.g);
        }
      }
    } else {
      // Fuel from canopy cover (pack canopy index, or the imagery heuristic without a pack)
      float fuel = mix(0.30, 1.0, canopyK) * (1.0 - waterMask);

      FireSurface fire = evalFireSurface(vUv, pKm, kmPerPx, N, slopeMag, fuel, waterMask);

      // 1. Burned ground: char with pale ash where severity and fuel were high
      float grit = 0.80 + 0.40 * valueNoise2(pKm * 46.0);
      // Char keeps a share of the picture under it, so rock faces, gullies and roads still read
      // through the burn instead of the ground turning into flat dark paint with pale blotches.
      vec3 charAlbedo = (vec3(0.012, 0.011, 0.012) + satRgb * 0.22) * grit;
      vec3 ashAlbedo = (vec3(0.085, 0.082, 0.076) + satRgb * 0.30) * grit;
      vec3 burnAlbedo = mix(charAlbedo, ashAlbedo, fire.ash * 0.6);
      postRgb = mix(litEarthClear, burnAlbedo * lighting, fire.burned);

      // 2. Warm bounce light from nearby flames on the ground and canyon walls around them
      vec3 groundAlbedo = mix(satRgb, burnAlbedo, fire.burned);
      postRgb += groundAlbedo * fireBounceLight(vUv, N, fire.front) * (1.0 - 0.7 * waterMask);

      // The air in between tints the ground, not the flames
      postRgb = capSurface(postRgb * hazeTrans + hazeIn);

      // 3. Flaming front and ember bed (HDR, above the bloom threshold only at the front)
      postRgb = mix(postRgb, vec3(0.0), clamp(fire.front, 0.0, 1.0) * 0.85);
      postRgb += fire.emission;

      // 4. One standard deviation around the active fire line: where the estimate plus its sigma
      // and the estimate minus its sigma cross the fire threshold. This is the run's own sigma, not
      // an interval of a stated coverage. Hairlines from screen-space derivatives. Nothing is drawn
      // where a bound does not cross the threshold (for example an epoch in a swath gap, where
      // sigma is saturated).
      if (uUncertaintyMix > 0.01) {
        float zMw = zHatNorm * 80.0;
        float sMw = sigmaNorm * 24.0;
        float thrMw = FIRE_THR * 80.0;
        float upper = zMw + sMw - thrMw;
        float lower = zMw - sMw - thrMw;
        float gU = max(fwidth(upper), 1e-4);
        float gL = max(fwidth(lower), 1e-4);
        // Require a real gradient (MW/km2 per km) so flat plateaus near the threshold stay clean
        float steepU = smoothstep(0.6, 2.4, gU / max(kmPerPx, 1e-6));
        float steepL = smoothstep(0.6, 2.4, gL / max(kmPerPx, 1e-6));
        float lineU = (1.0 - smoothstep(0.55, 1.45, abs(upper) / gU)) * steepU;
        float lineL = (1.0 - smoothstep(0.40, 1.10, abs(lower) / gL)) * steepL;
        float boundsMask = uUncertaintyMix * (1.0 - waterMask * 0.85) * (1.0 - fire.front);
        postRgb = mix(postRgb, vec3(0.20, 0.66, 1.0), lineU * 0.62 * boundsMask);
        postRgb = mix(postRgb, vec3(0.72, 0.90, 1.0), lineL * 0.38 * boundsMask);
      }
    }

    finalRgb = mix(finalRgb, postRgb, showPosterior);
  }

  // ===========================================================================
  // B. RAW MODIS SIDE: GROUND-PROJECTED SCAN CELLS OF THE ACTUAL OVERPASS
  // Cells are flat. Nothing is extruded. The fill is the per-cell value of the MODIS channel.
  // ===========================================================================
  if (showRawModis > 0.005) {
    // 1. Cool slate rendition of the terrain so the data layer reads as an instrument view
    float irContrast = clamp((pow(max(satLuma, 0.0005), 0.45) - 0.24) * 1.42 + 0.34, 0.04, 0.96);
    float irShade = irContrast * (0.42 + 0.58 * nDotL * shadow);
    vec3 slateIr = nightGrade(mix(vec3(0.018, 0.028, 0.048), vec3(0.22, 0.30, 0.42), irShade));
    // With context terrain around the pack the rendition fades out before the edge of the data,
    // so the instrument view ends in the landscape and not along a straight line across it
    float slateShare = 0.82 * mix(1.0, smoothstep(0.0, 0.10, min(toPackEdge.x, toPackEdge.y)), uContextMix);
    vec3 rawPassRgb = mix(litEarth, slateIr, slateShare);

    float modisFloor = 0.105 * (0.55 + 0.65 * uSensitivity);
    float modisLit = 0.0;

    if (uFootMix.x > 0.5) {
      // Real run: every MODIS detection as emitted light in its own footprint (scan by track
      // km), with a faint hairline around the pixel: this side is the instrument's view. No empty
      // cells: the source lists detections, not where the sensor looked and saw nothing.
      modisLit = step(0.001, -foot.r);
      rawPassRgb += lit.rgb * uLightModis * hazeTrans.g * (1.0 - step(0.001, uAfterglow));
      float hair = scanHairline(abs(foot.r), footGradM, 1.6) * scanLitFade(1.0 / footGradM);
      rawPassRgb = mix(rawPassRgb, vec3(0.80, 0.87, 0.96), hair * 0.34);
    } else if (uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float mScaled = clamp((md.value - modisFloor) / 0.35, 0.0, 1.0);
      modisLit = step(0.035, mScaled);

      // 2. Flat radiometric fill: the cell value read straight off the intensity scale of the
      // legend (Lipari, 0 to 80 MW/km2 across the ramp), with no remapping.
      // The fill is translucent and takes the relief shading, so the ground reads through it.
      vec3 fill = pictureToScene(texture2D(uLipariTex, vec2(clamp(md.value, 0.005, 0.995), 0.5)).rgb);
      fill *= mix(0.62, 1.30, shadeTerm);
      rawPassRgb = mix(rawPassRgb, fill + rawPassRgb * 0.30, modisLit * 0.66);

      // 3. Hairline borders (constant width in device pixels). A cell that holds a detection gets
      // a crisp light border so it reads as one discrete sensor cell; the lattice over empty
      // ground stays faint.
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), modisLit);
      vec3 hairEmpty = vec3(0.36, 0.47, 0.62);
      vec3 hairLit = vec3(0.93, 0.91, 0.86);
      rawPassRgb = mix(rawPassRgb, hairEmpty, md.hair * hairFade * 0.30 * (1.0 - modisLit) * uLatticeMix);
      rawPassRgb = mix(rawPassRgb, hairLit, md.hairLit * hairFade * 0.92 * modisLit);
      rawPassRgb = mix(rawPassRgb, vec3(0.50, 0.62, 0.78), md.seam * hairFade * 0.45 * (1.0 - modisLit) * uLatticeMix);
    }

    // 4. Amber hairline hatch where the harmonized record has fire and this MODIS pass reports none
    // Only on a frame that has a MODIS overpass: without one, MODIS missed nothing, it did not look
    float missedMask = smoothstep(0.11, 0.24, zHatNorm) * (1.0 - modisLit) * (1.0 - waterMask)
                     * step(0.5, uModisPass.w) * (1.0 - step(0.5, uFootMix.x));
    if (missedMask > 0.01) {
      float spacingKm = 0.30;
      float hatchDistKm = abs(fract((pKm.x + pKm.y) / spacingKm) - 0.5) * spacingKm * 0.7071;
      float hatch = scanHairline(hatchDistKm, kmPerPx, 1.1)
                  * smoothstep(3.0, 7.0, spacingKm * 0.7071 / max(kmPerPx, 1e-6));
      rawPassRgb = mix(rawPassRgb, vec3(0.86, 0.46, 0.10), missedMask * (0.10 + 0.62 * hatch));
    }

    finalRgb = mix(finalRgb, rawPassRgb, showRawModis);
  }

  // ===========================================================================
  // C. SATELLITE PASSES MODE: SCAN CELLS OF BOTH SENSORS, COLORED BY SENSOR IDENTITY
  // ===========================================================================
  if (uObserverMix > 0.005) {
    float earthLuma = dot(litEarth, vec3(0.2126, 0.7152, 0.0722));
    vec3 obsRgb = mix(litEarth, vec3(earthLuma), 0.35) * 0.80;

    if (uModisWeight > 0.01 && uFootMix.x > 0.5) {
      // Real run: the detections themselves, as light in the sensor's colour, each in its own footprint
      obsRgb += vec3(1.0, 0.36, 0.10) * (0.55 * lit.a * uLightModis) * uModisWeight * (1.0 - step(0.001, uAfterglow));
      float hair = scanHairline(abs(foot.r), footGradM, 1.6);
      obsRgb = mix(obsRgb, vec3(1.0, 0.87, 0.78), hair * 0.60 * uModisWeight);
    } else if (uModisWeight > 0.01 && uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float s = clamp((md.value - sensGate) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.30, 0.05, 0.015), vec3(1.0, 0.36, 0.10), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.90 * uModisWeight);
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), lit);
      obsRgb = mix(obsRgb, vec3(0.62, 0.36, 0.24), md.hair * hairFade * 0.24 * (1.0 - lit) * uModisWeight);
      obsRgb = mix(obsRgb, vec3(1.0, 0.87, 0.78), md.hairLit * hairFade * 0.90 * lit * uModisWeight);
      obsRgb = mix(obsRgb, vec3(0.78, 0.50, 0.36), md.seam * hairFade * 0.40 * (1.0 - lit) * uModisWeight);
    }

    if (uViirsWeight > 0.01 && uFootMix.y > 0.5) {
      obsRgb += vec3(0.16, 0.70, 1.0) * (0.55 * lit.a * (1.0 - uLightModis)) * uViirsWeight;
      float hair = scanHairline(abs(foot.b), footGradV, 1.3);
      obsRgb = mix(obsRgb, vec3(0.84, 0.96, 1.0), hair * 0.50 * uViirsWeight);
    } else if (uViirsWeight > 0.01 && uViirsPass.w > 0.5) {
      ScanDraw vd = evalScanDraw(pKm, kmPerPx, uViirsPass, VIIRS_SENSOR, VIIRS_ORBIT_K, vec4(0.0, 0.0, 0.0, 1.0));
      float s = clamp((vd.value - sensGate * 0.45) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.02, 0.16, 0.26), vec3(0.16, 0.70, 1.0), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.92 * uViirsWeight);
      // The 375 m lattice over empty ground appears only once its cells are large on screen
      float hairFade = mix(scanEmptyFade(vd.cellPx, 54.0), scanLitFade(vd.cellPx), lit);
      obsRgb = mix(obsRgb, vec3(0.30, 0.52, 0.66), vd.hair * hairFade * 0.20 * (1.0 - lit) * uViirsWeight);
      obsRgb = mix(obsRgb, vec3(0.84, 0.96, 1.0), vd.hairLit * hairFade * 0.85 * lit * uViirsWeight);
      obsRgb = mix(obsRgb, vec3(0.42, 0.68, 0.84), vd.seam * hairFade * 0.40 * (1.0 - lit) * uViirsWeight);
    }

    if (uModisWeight > 0.01 && uModisPass.w > 0.5 && uScanStrip.y > 0.004) {
      obsRgb = scanStripMark(obsRgb, pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K,
                             vec2(uScanStrip.x, uScanStrip.y * uModisWeight), vec3(1.0, 0.74, 0.52));
    }
    if (uViirsWeight > 0.01 && uViirsPass.w > 0.5 && uScanStrip.w > 0.004) {
      obsRgb = scanStripMark(obsRgb, pKm, kmPerPx, uViirsPass, VIIRS_SENSOR, VIIRS_ORBIT_K,
                             vec2(uScanStrip.z, uScanStrip.w * uViirsWeight), vec3(0.72, 0.93, 1.0));
    }

    finalRgb = mix(finalRgb, obsRgb, uObserverMix);
  }

  // ===========================================================================
  // D. RAZOR-SHARP OPTICAL LASER LINE WHERE THE 3D GLASS CURTAIN SLICES TERRAIN
  // ===========================================================================
  if (uCutawayMix > 0.01) {
    // Hairline of constant screen width where the curtain meets the ground, with a tight halo.
    // Instrument graphics stay under the bloom threshold: only fire is allowed to bloom.
    float cutKm = abs(scanCoord) * length(cutDir * uExtentKm);
    float scanLine = scanHairline(cutKm, kmPerPx, 1.6) * uCutawayMix;
    // Over open water the seam is a straight bright bar to the horizon, so it is drawn fainter there
    float scanHalo = exp(-cutKm / max(0.10, 7.0 * kmPerPx)) * uCutawayMix * (1.0 - 0.8 * waterMask);
    scanLine *= 1.0 - 0.6 * waterMask;
    // By night the seam is kept quiet: the fire is the brightest thing in the frame
    finalRgb += (vec3(0.35, 0.82, 1.0) * scanHalo * 0.15 + vec3(0.92, 0.99, 1.0) * scanLine * 0.70)
              * mix(1.0, 0.22, uNight);
  }

  // The scan front of a pass that is arriving: one hairline across the ground. Warm for a
  // pass the estimate takes in, in ink and broken for a pass kept from it.
  if (uScan.w > 0.001) {
    float behindKm = uScan.z - scanAlong;
    float frontLine = scanHairline(abs(behindKm), max(length(vec2(dFdx(scanAlong), dFdy(scanAlong))), 1e-6), 1.4);
    float acrossKm = dot(pKm, vec2(-uScan.y, uScan.x));
    float dashKm = 7.0 * max(length(vec2(dFdx(acrossKm), dFdy(acrossKm))), 1e-6);
    float broken = mix(1.0, step(0.5, fract(acrossKm / exp2(floor(log2(dashKm))))), uHeldOut);
    vec3 scanRgb = mix(vec3(1.25, 1.02, 0.74), mix(vec3(1.16, 1.18, 1.22), vec3(0.62, 0.68, 0.78), uNight), uHeldOut);
    finalRgb = mix(finalRgb, scanRgb, frontLine * broken * 0.9 * uScan.w * hazeTrans.g);
  }

  // The board of tiles, over every view of the ground
  if (uTileGrid.x > 0.5) {
    vec3 tileInk = mix(vec3(1.16, 1.18, 1.22), vec3(0.62, 0.68, 0.78), uNight) * tiles.z;
    finalRgb *= 1.0 - 0.5 * tiles.y * (1.0 - uNight) * hazeTrans.g;
    finalRgb = mix(finalRgb, tileInk, tiles.x * hazeTrans.g);
  }

  // Close views: the far edge of the slab dissolves into what the dome draws behind it (sky, or
  // the hazy floor under the horizon), so the view ends in air and not at the cut edge of a model.
  // Overview and nadir keep the edge.
  // The same share of the surface also sinks to the base, and ground that stands above the
  // horizon is left alone (see edgeGone and edgeGoneAt in the heightfield code).
  float gone = edgeGone(vUv) * belowHorizon(vWorldPos);
  finalRgb = mix(finalRgb, nightGrade(backdrop), gone);

  // Subtle top bevel edge highlight around the 4 outer cut boundaries of the slab. Where the land
  // around the box is drawn there is no cut boundary, and no line
  float borderDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float rimBevel = 1.0 - smoothstep(0.0, 0.0028, borderDist);
  finalRgb = mix(finalRgb, finalRgb + vec3(0.14, 0.17, 0.22), rimBevel * 0.65 * (1.0 - gone) * (1.0 - uContextMix));

  gl_FragColor = vec4(finalRgb, 1.0);
}
`;function Jn(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function Hc(e){if(!Jn(e))return null;const{extent_km:t,scale:a,dem:s,ortho:i}=e;return!Array.isArray(t)||t.length!==2||!t.every(o=>typeof o=="number"&&o>0)||typeof a!="number"||!(a>1)||a>15||!Jn(s)||typeof s.url!="string"||typeof s.size!="number"||s.format!=="f32le"||!Jn(i)||typeof i.url!="string"||typeof i.size!="number"?null:e}function Jd(e,t,a,s){const i=new Uint8Array(t*t*4),o=s?new Uint8Array(t*t):Dd(e,t),l=Id(e,t),u=Nd(e,t,l),r=a[0]*1e3/(t-1),c=a[1]*1e3/(t-1);for(let v=0;v<t;v++){const x=Math.min(t-1,v+1),y=Math.max(0,v-1);for(let M=0;M<t;M++){const E=Math.min(t-1,M+1),g=Math.max(0,M-1),p=(e[v*t+E]-e[v*t+g])/((E-g)*r),b=(e[y*t+M]-e[x*t+M])/((x-y)*c),F=1/Math.hypot(p,1,b),A=(v*t+M)*4;i[A]=Math.round((-p*F*.5+.5)*255),i[A+1]=Math.round((-b*F*.5+.5)*255),i[A+2]=l[v*t+M]?255:u[v*t+M]?128:0,i[A+3]=o[v*t+M]?255:0}}const h=new aa(i,t,t,Rt,Ut);return h.colorSpace=Pa,h.wrapS=Ve,h.wrapT=Ve,h.magFilter=ze,h.minFilter=Ga,h.generateMipmaps=!0,h.flipY=!1,h.needsUpdate=!0,h}async function ef(e,t){var a;try{if(e.ortho.size>t.maxTextureSize)return null;const[s,i]=await Promise.all([fetch(t.resolveUrl(e.dem.url)).then(h=>h.ok?h.arrayBuffer():null),Ku(t.resolveUrl(e.ortho.url),t.maxAnisotropy)]),o=e.dem.size;if((((a=t.isCancelled)==null?void 0:a.call(t))??!1)||!s||s.byteLength!==o*o*4||!i)return i==null||i.dispose(),null;const l=new Float32Array(s),u=Hr(l,o);u&&Gu(l,o);const r=ks(l,!0),c=Jd(r.aligned,r.gridRes,e.extent_km,u);return{manifest:e,scale:e.scale,demTexture:r.texture,alignedDem:r.aligned,gridRes:r.gridRes,shadeTexture:c,orthoTexture:i,dispose:()=>{r.texture.dispose(),c.dispose(),i.dispose()}}}catch{return null}}const Vu=6360;function tf(e,t){return(e*e+2*e*t)/(2*Vu)}const af=`
${Yo}

uniform vec3 uUnitsPerMetre;

varying vec2 vCuv;
varying vec2 vPackUv;
varying vec3 vWorldPos;
varying float vElevM;

void main() {
  vCuv = uv;
  vec2 packUv = (uv - 0.5) * uContextScale + 0.5;
  vPackUv = packUv;
  float elevM = sampleR32FBilinear(uContextDem, uv, uContextRes);
  vElevM = elevM;
  float y = (elevM - uElevNextRange.x) * uReliefScale.y;

  vec2 xz = vec2((packUv.x - 0.5) * uSlabSize.x, (0.5 - packUv.y) * uSlabSize.y);
  // The ground curves away beyond the pack (see contextDropKm)
  vec2 outKm = max(abs(xz) - 0.5 * uSlabSize, vec2(0.0)) / (uUnitsPerMetre.xz * 1000.0);
  float halfKm = 0.25 * (uSlabSize.x / uUnitsPerMetre.x + uSlabSize.y / uUnitsPerMetre.z) * 0.001;
  float dOut = length(outKm);
  y -= (dOut * dOut + 2.0 * dOut * halfKm) / (2.0 * ${Vu.toFixed(1)}) * 1000.0 * uUnitsPerMetre.y;

  // Under the pack this surface dives out of the way; the pack is the surface there. The dive
  // starts more than one cell of this mesh inside the pack, so along the pack edge both surfaces
  // are at the same height (the pack takes the context elevation there, see contextJoin).
  vec2 e = min(packUv, 1.0 - packUv);
  y -= clamp((min(e.x, e.y) - 0.012) * 40.0, 0.0, 1.0) * 0.6;

  vec4 worldPos = modelMatrix * vec4(xz.x, y, xz.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,sf=`
uniform sampler2D uContextOrtho;
uniform sampler2D uContextShade;
uniform float uContextMix;
uniform vec3 uSunDir;
uniform vec3 uSunTrue;
uniform vec3 uSunColor;
uniform vec3 uSunTransmittance;
uniform float uHazeStrength;
uniform sampler2D uSkyView;
uniform float uSkyExposure;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform vec3 uUnitsPerMetre;
uniform vec2 uElevNextRange;

varying vec2 vCuv;
varying vec2 vPackUv;
varying vec3 vWorldPos;
varying float vElevM;

${Ko}
${Vo}
${Wo}
${Wu}

const float CONTEXT_FADE_FROM = 0.8; // share of the way to the context box's edge where the fade starts

void main() {
  vec2 e = min(vPackUv, 1.0 - vPackUv);
  if (min(e.x, e.y) > 0.004) discard;

  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec4 shade = texture2D(uContextShade, vCuv);
  vec2 nxz = shade.rg * 2.0 - 1.0;
  vec3 nTrue = vec3(nxz.x, sqrt(max(1e-4, 1.0 - dot(nxz, nxz))), nxz.y);
  vec3 N = normalize(nTrue / uUnitsPerMetre);
  vec3 picture = texture2D(uContextOrtho, vCuv).rgb;
  vec3 albedo = pictureToScene(picture);
  // (a slightly blurred sample, so a patch passes or fails a test on the picture as one piece)
  vec3 broad = texture2D(uContextOrtho, vCuv, 2.0).rgb;
  // The sea: posts at sea level in the elevation; a low patch with sea around most of it, where the
  // picture there looks like water or has none (imagery has no data over open sea: pure black); and
  // any ground within a few metres of the sea that has no picture at all. A barrier island or a sand
  // bar is as low, and its picture shows sand or houses: it stays land.
  float noPicture = 1.0 - smoothstep(0.02, 0.05, max(broad.r, max(broad.g, broad.b)));
  float sea = max(smoothstep(0.55, 0.95, shade.b), smoothstep(0.30, 0.45, shade.b) * max(waterLook(broad), noPicture));
  sea = max(sea, noPicture * (1.0 - smoothstep(3.0, 8.0, vElevM)));
  // A lake: level ground in the elevation where the picture looks like water
  // (a gentler edge than the sea's: a lake is a few posts wide out here, and its shore would step)
  float lake = smoothstep(0.30, 0.70, shade.a) * waterLook(picture);
  // Water by the picture alone, as in the pack: dark, bluer than it is green or red, on flat ground
  // (a reservoir where the elevation gives no level surface would otherwise be a dark stain)
  // (on the blurred sample, so a reservoir passes or fails as one piece and not pixel by pixel)
  float pictureLuma = dot(broad, vec3(0.2126, 0.7152, 0.0722));
  float pictureWater = smoothstep(0.90, 0.98, broad.b / max(broad.g, 1e-3)) * smoothstep(1.30, 1.50, broad.b / max(broad.r, 1e-3))
                     * (1.0 - smoothstep(0.022, 0.042, pictureLuma)) * (1.0 - smoothstep(0.03, 0.08, length(nxz)));
  float water = max(max(sea, lake), pictureWater);

  // The pack's light balance (see ./terrainShader.ts), without baked shadows or sky view
  float nDotL = max(0.0, dot(N, sunDir));
  float skyFill = 0.5 + 0.5 * N.y;
  vec3 lighting = mix(vec3(0.16, 0.19, 0.25), vec3(0.24, 0.27, 0.33), skyFill) * 0.92
                + uSunColor * (SUN_KEY * nDotL);
  vec3 lit = albedo * lighting;

  // The pack's water (see waterSurface in ./terrainShader.ts): the same terms, so a lake or a
  // sea that crosses the pack's edge is one body of water
  if (water > 0.01) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 halfVec = normalize(sunDir + viewDir);
    float fresnel = pow(1.0 - max(0.0, dot(up, viewDir)), 4.0);
    float spec = pow(max(0.0, dot(up, halfVec)), 96.0);
    lit = waterSurface(lit, water, lake, sea, fresnel, spec, uNight);
  }

  // The same air as over the pack: distance takes the ground into what the dome draws behind it
  vec3 toPointKm = (vWorldPos - cameraPosition) / (uUnitsPerMetre * 1000.0);
  float pathKm = length(toPointKm);
  float camAltKm = (uElevNextRange.x + cameraPosition.y / uUnitsPerMetre.y) * 0.001;
  float hazeKm = pathKm * uHazeStrength * pathKm / (pathKm + HAZE_NEAR_KM);
  vec3 viewTrue = toPointKm / max(pathKm, 1e-4);
  vec3 unused;
  vec3 trans = atmAerialPerspective(
    camAltKm, vElevM * 0.001, hazeKm, dot(viewTrue, uSunTrue), uSunTransmittance, unused
  );
  vec3 backdrop = atmBackdrop(
    uSkyView, viewTrue, normalize(uSunTrue), clamp(camAltKm, 0.02, ATM_TOP - 1.0),
    uSkyExposure, uFloorColor, uFloorHaze
  );
  // The data around the pack ends at the context box. Over its outer fifth the ground goes into what
  // the dome draws behind it, so neither land nor an even sea stops at a straight line
  vec2 fromCentre = abs(vCuv - 0.5) * 2.0;
  float dataEnds = smoothstep(CONTEXT_FADE_FROM, 1.0, max(fromCentre.x, fromCentre.y));
  trans *= 1.0 - dataEnds;
  vec3 rgb = nightGrade(capSurface(lit * trans + backdrop * (1.0 - trans)));
  // By night water gives back a dark sky: never brighter than the land beside it
  rgb *= 1.0 - WATER_NIGHT_DIM * water * uNight * (1.0 - dataEnds);
  gl_FragColor = vec4(rgb, uContextMix);
}
`,Gc=640;class of{constructor(t){k(this,"mesh");k(this,"material");k(this,"shadeUniform",{value:null});const a=new Ui(1,1,Gc,Gc);this.material=new wt({vertexShader:af,fragmentShader:sf,uniforms:{...t,uContextShade:this.shadeUniform},transparent:!0,depthWrite:!0}),this.mesh=new pa(a,this.material),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.renderOrder=-2}setContext(t){this.shadeUniform.value=(t==null?void 0:t.shadeTexture)??null}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}}function nf(e,t,a){const s=e.gridRes,i=Math.min(s-1,Math.max(0,t*(s-1))),o=Math.min(s-1,Math.max(0,a*(s-1))),l=Math.floor(i),u=Math.floor(o),r=Math.min(s-1,l+1),c=Math.min(s-1,u+1),h=i-l,v=o-u,x=e.alignedDem,y=x[u*s+l]*(1-h)+x[u*s+r]*h,M=x[c*s+l]*(1-h)+x[c*s+r]*h;return y*(1-v)+M*v}const zi=1024,li=1536,Kc=1.1,rf=5,lf=.2,cf=.09,uf=.07,Wc=.36,Vc=.16,Yc=.34,hf=[1,.09,.015],$c=[1,.36,.05],df=[1,.66,.32];function ff(e,t){const a=Math.min(1,Math.max(0,e)),s=Kc+(rf-Kc)*a*a*a,i=a<.5?hf:$c,o=a<.5?$c:df,l=a<.5?a*2:a*2-1;for(let u=0;u<3;u++)t[u]=(i[u]+(o[u]-i[u])*l)*s;t[3]=s}function Xc(e,t){const a=Math.sin(e*12.9898+t*78.233)*43758.5453;return a-Math.floor(a)}const _o=4,mf=3,ka=zi*zi,er=li*li;class pf{constructor(){k(this,"texture");k(this,"lightTexture");k(this,"modisCount",0);k(this,"viirsCount",0);k(this,"data",new Uint16Array(ka*4));k(this,"blank",new Uint16Array(ka*4));k(this,"outside",[new Float32Array(ka),new Float32Array(ka)]);k(this,"depth",[new Float32Array(ka),new Float32Array(ka)]);k(this,"frp",[new Float32Array(ka),new Float32Array(ka)]);k(this,"touched",new Int32Array(65536));k(this,"touchedCount",0);k(this,"mark",new Uint8Array(ka));k(this,"light",new Float32Array(er*4));k(this,"lightData",new Uint16Array(er*4));k(this,"lightTouched",new Int32Array(65536));k(this,"lightTouchedCount",0);k(this,"lightMark",new Uint8Array(er));k(this,"lightOfOne",new Float32Array(4));const t=Ma.toHalfFloat(_o);for(let i=0;i<ka;i++)this.blank[i*4]=t,this.blank[i*4+2]=t;this.data.set(this.blank);for(let i=0;i<2;i++)this.outside[i].fill(_o);const a=new aa(this.data,zi,zi,Rt,Da);a.colorSpace=Pa,a.minFilter=ze,a.magFilter=ze,a.generateMipmaps=!1,a.wrapS=Ve,a.wrapT=Ve,a.flipY=!1,a.needsUpdate=!0,this.texture=a;const s=new aa(this.lightData,li,li,Rt,Da);s.colorSpace=Pa,s.minFilter=Ga,s.magFilter=ze,s.generateMipmaps=!0,s.wrapS=Ve,s.wrapT=Ve,s.flipY=!1,s.needsUpdate=!0,this.lightTexture=s}build(t,a,s,i,o=[],l=[]){for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];this.mark[c]=0;for(let h=0;h<2;h++)this.outside[h][c]=_o,this.depth[h][c]=0,this.frp[h][c]=0;this.data[c*4]=this.blank[c*4],this.data[c*4+1]=0,this.data[c*4+2]=this.blank[c*4+2],this.data[c*4+3]=0}this.touchedCount=0;for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];this.lightMark[c]=0;for(let h=0;h<4;h++)this.light[c*4+h]=0,this.lightData[c*4+h]=0}this.lightTouchedCount=0,this.modisCount=0,this.viirsCount=0;for(const r of t)this.drawFootprint(r,a,s);for(const r of o)this.drawFootprint(r,a,s);for(const r of t)this.drawLight(r,a,s,i);for(const r of l)this.drawLight(r,a,s,i);const u=Ma.toHalfFloat;for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];for(let h=0;h<2;h++){const v=this.depth[h][c];v>0?(this.data[c*4+h*2]=u(-v),this.data[c*4+h*2+1]=u(Math.min(this.frp[h][c],6e4))):this.outside[h][c]<_o&&(this.data[c*4+h*2]=u(this.outside[h][c]))}}for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];for(let h=0;h<4;h++)this.lightData[c*4+h]=u(Math.min(this.light[c*4+h],6e4))}this.texture.needsUpdate=!0,this.lightTexture.needsUpdate=!0}drawFootprint(t,a,s){const i=zi,[o,l,u,r]=a,c=s[0]/i,h=s[1]/i,v=mf*Math.max(c,h),x=t.family==="viirs"?1:0,y=(t.lon-o)/Math.max(1e-9,u-o)*s[0],M=(t.lat-l)/Math.max(1e-9,r-l)*s[1],E=t.acrossTrackKm*.5,g=t.alongTrackKm*.5,p=Math.max(1e-4,Math.min(E,g)),b=t.azimuthDeg*Math.PI/180,F=Math.sin(b),A=Math.cos(b),z=Math.hypot(E,g)+v,D=Math.max(0,Math.floor((y-z)/c)),T=Math.min(i-1,Math.ceil((y+z)/c)),L=Math.max(0,Math.floor((M-z)/h)),U=Math.min(i-1,Math.ceil((M+z)/h));if(T<D||U<L)return;x===1?this.viirsCount++:this.modisCount++;const K=t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm),G=this.outside[x],X=this.depth[x],ue=this.frp[x];for(let oe=L;oe<=U;oe++){const Te=(oe+.5)*h-M;for(let ye=D;ye<=T;ye++){const ve=(ye+.5)*c-y,he=Math.abs(ve*F+Te*A)-E,ht=Math.abs(ve*A-Te*F)-g,fe=Math.hypot(Math.max(he,0),Math.max(ht,0))+Math.min(Math.max(he,ht),0);if(fe>v)continue;const te=oe*i+ye;if(!this.mark[te]){if(this.mark[te]=1,this.touchedCount===this.touched.length){const f=new Int32Array(this.touched.length*2);f.set(this.touched),this.touched=f}this.touched[this.touchedCount++]=te}if(fe>=0){fe<G[te]&&(G[te]=fe);continue}const Q=Math.min(1,-fe/p);Q>=X[te]&&(X[te]=Math.max(Q,.001),ue[te]=K)}}}drawLight(t,a,s,i){const o=li,[l,u,r,c]=a,h=s[0]/o,v=s[1]/o,x=(t.lon-l)/Math.max(1e-9,r-l)*s[0],y=(t.lat-u)/Math.max(1e-9,c-u)*s[1],M=t.acrossTrackKm*.5,E=t.alongTrackKm*.5,g=t.azimuthDeg*Math.PI/180,p=Math.sin(g),b=Math.cos(g),F=this.lightOfOne;ff(i(t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm)),F);const A=Math.min(cf,lf*Math.min(M,E)),z=Math.max(A,.8*Math.max(h,v)),D=A*A/(z*z),T=9*z*z,L=(Xc(t.lon,t.lat)*2-1)*Yc*M,U=(Xc(t.lat*1.7,t.lon*.9)*2-1)*Yc*E,K=L*p+U*b,G=L*b-U*p,X=Math.min(Wc*M,Vc),ue=Math.min(Wc*E,Vc),oe=Math.hypot(M,E),Te=Math.max(0,Math.floor((x-oe)/h)),ye=Math.min(o-1,Math.ceil((x+oe)/h)),ve=Math.max(0,Math.floor((y-oe)/v)),he=Math.min(o-1,Math.ceil((y+oe)/v)),ht=this.light;for(let fe=ve;fe<=he;fe++){const te=(fe+.5)*v-y;for(let Q=Te;Q<=ye;Q++){const f=(Q+.5)*h-x,at=f*p+te*b,At=f*b-te*p,Ht=Math.hypot(at/M,At/E);let Nt=0;const Gt=f-K,va=te-G;if(Gt*Gt+va*va<T){for(let Ze=0;Ze<4;Ze++){const lt=Gt+(Ze&1?.25:-.25)*h,qt=va+(Ze&2?.25:-.25)*v;Nt+=Math.exp(-(lt*lt+qt*qt)/(z*z))}Nt*=.25*D}if(Ht<1){const Ze=Ht<=.72?0:(Ht-.72)/.28,lt=(at-L)/X,qt=(At-U)/ue;Nt+=uf*Math.exp(-(lt*lt+qt*qt))*(1-Ze*Ze*(3-2*Ze))}if(Nt<=1e-4)continue;const jt=fe*o+Q;if(!this.lightMark[jt]){if(this.lightMark[jt]=1,this.lightTouchedCount===this.lightTouched.length){const Ze=new Int32Array(this.lightTouched.length*2);Ze.set(this.lightTouched),this.lightTouched=Ze}this.lightTouched[this.lightTouchedCount++]=jt}ht[jt*4]+=F[0]*Nt,ht[jt*4+1]+=F[1]*Nt,ht[jt*4+2]+=F[2]*Nt,ht[jt*4+3]+=F[3]*Nt}}}dispose(){this.texture.dispose(),this.lightTexture.dispose()}}const vf=1500,jc=30;function gf(e){const t=Math.log1p(Math.max(0,e)/jc)/Math.log1p(vf/jc);return Math.min(1,t)}function xf(e,t,a,s,i,o=.6){const l=i*i,u=new Uint8Array(t*l),[r,c,h,v]=a,x=s[0]/i,y=s[1]/i;for(let M=0;M<t;M++){const E=M*l;if(M>0){const g=(M-1)*l;for(let p=0;p<l;p++)u[E+p]=Math.floor(u[g+p]*o)}for(const g of e[M]??[])if(!(g.hidden||g.revealedByLook))for(const p of g.footprints){const b=(p.lon-r)/Math.max(1e-9,h-r)*s[0],F=(p.lat-c)/Math.max(1e-9,v-c)*s[1],A=p.acrossTrackKm*.5,z=p.alongTrackKm*.5,D=p.azimuthDeg*Math.PI/180,T=Math.sin(D),L=Math.cos(D),U=Math.round(255*gf(p.frpMw/Math.max(1e-4,p.acrossTrackKm*p.alongTrackKm))),K=Math.hypot(A,z),G=Math.max(0,Math.floor((b-K)/x)),X=Math.min(i-1,Math.ceil((b+K)/x)),ue=Math.max(0,Math.floor((F-K)/y)),oe=Math.min(i-1,Math.ceil((F+K)/y));for(let Te=ue;Te<=oe;Te++){const ye=(Te+.5)*y-F;for(let ve=G;ve<=X;ve++){const he=(ve+.5)*x-b;if(Math.abs(he*T+ye*L)>A+.5*x||Math.abs(he*L-ye*T)>z+.5*y)continue;const ht=E+Te*i+ve;U>u[ht]&&(u[ht]=U)}}}}return u}function tr(e){if(typeof e!="object"||e===null)return null;const t=e;if(typeof t.grid!="object"||t.grid===null||!Array.isArray(t.looks))return null;const a=t.grid,s=Number(a.nx),i=Number(a.ny);if(!Number.isInteger(s)||!Number.isInteger(i)||s<2||i<2||a.index!=="row * nx + column"||a.rows_run!=="north to south")return null;const o=new Map;for(const l of t.looks){if(typeof l!="object"||l===null)return null;const{frame:u,cells:r}=l;if(u==null)continue;if(!Number.isInteger(u)||u<0||!Array.isArray(r))return null;const c=new Uint32Array(r.length);for(let h=0;h<r.length;h++){const v=r[h];if(!Number.isInteger(v)||v<0||v>=s*i)return null;c[h]=v}o.set(u,c)}return o.size>0?{nx:s,ny:i,byFrame:o}:null}class wf{constructor(){k(this,"texture");k(this,"grid",new Ne(0,0));k(this,"box",new ma(0,0,0,0));k(this,"data");k(this,"nx",1);k(this,"ny",1);k(this,"key","");k(this,"stepKey","");k(this,"step",0);k(this,"declaredGiven",!1);this.data=new Uint8Array(4),this.texture=this.makeTexture(1,1)}makeTexture(t,a){const s=new aa(this.data,t,a,Rt,Ut);return s.minFilter=ze,s.magFilter=ze,s.generateMipmaps=!1,s.wrapS=Ve,s.wrapT=Ve,s.flipY=!1,s.needsUpdate=!0,s}clear(){this.grid.set(0,0),this.box.set(0,0,0,0),this.key="",this.stepKey="",this.declaredGiven=!1}sync(t,a,s,i=null){const{steps:o,stepMs:l,firstTimeMs:u,nx:r,ny:c}=t.info,h=Math.min(o-1,Math.max(0,(s-u)/l)),v=Math.min(o-1,Math.floor(h)),x=Math.min(o-1,v+1);(r!==this.nx||c!==this.ny)&&(this.texture.dispose(),this.nx=r,this.ny=c,this.data=new Uint8Array(r*c*4),this.texture=this.makeTexture(r,c),this.key=""),this.grid.set(r,c);const y=t.declared&&t.declared.nx===r&&t.declared.ny===c?t.declared:null,M=y&&i!==null?y.byFrame.get(i)??null:null;this.declaredGiven=y!==null;const E=`${a}:${v}`,g=`${E}:${y?i??"none":"no list"}`;if(g!==this.key){this.key=g,this.stepKey=E,this.step=v;const p=t.bytes,b=r*c,F=this.data;let A=r,z=-1,D=c,T=-1;for(let L=0;L<c;L++){const U=(v*b+(c-1-L)*r)*2,K=(x*b+(c-1-L)*r)*2,G=L*r*4;for(let X=0;X<r;X++){const ue=p[U+X*2],oe=p[K+X*2];F[G+X*4]=ue,F[G+X*4+1]=y?p[U+X*2+1]&254:p[U+X*2+1],F[G+X*4+2]=oe,F[G+X*4+3]=p[K+X*2+1],(ue>0||oe>0)&&(X<A&&(A=X),X>z&&(z=X),L<D&&(D=L),L>T&&(T=L))}}if(M)for(let L=0;L<M.length;L++){const U=Math.floor(M[L]/r),K=M[L]-U*r,G=c-1-U;F[(G*r+K)*4+1]|=1,K<A&&(A=K),K>z&&(z=K),G<D&&(D=G),G>T&&(T=G)}z<0?this.box.set(0,0,0,0):this.box.set((A-3)/r,(D-3)/c,(z+4)/r,(T+4)/c),this.texture.needsUpdate=!0}return h-v}cellsAbove(t,a,s){const{nx:i,ny:o}=t.info,l=i*o,u=this.step*l*2,r=Math.ceil(a*255),c=[];for(let h=0;h<o;h++)for(let v=0;v<i;v++){const x=u+(h*i+v)*2;t.bytes[x]<r||c.push((v+.5)/i,1-(h+.5)/o,Math.max(.01,s(t.bytes[x+1]/255)))}return new Float32Array(c)}dispose(){this.texture.dispose()}}function la(e,t){return e.revealed?!1:e.hidden===!0||t&&e.family==="viirs"}/**
 * postprocessing v6.39.6 build Sun Nov 01 2026
 * https://github.com/pmndrs/postprocessing
 * Copyright 2015-2026 Raoul van Rüschen
 * @license Zlib
 */var Mf=(()=>{const e=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),t=new Float32Array([0,0,2,0,0,2]),a=new Lr;return a.setAttribute("position",new Ha(e,3)),a.setAttribute("uv",new Ha(t,2)),a})(),ua=class Dr{static get fullscreenGeometry(){return Mf}constructor(t="Pass",a=new ci,s=new Ir){this.name=t,this.renderer=null,this.scene=a,this.camera=s,this.screen=null,this.rtt=!0,this.needsSwap=!0,this.needsDepthBlit=!1,this.needsDepthTexture=!1,this.enabled=!0}get renderToScreen(){return!this.rtt}set renderToScreen(t){if(this.rtt===t){const a=this.fullscreenMaterial;a!==null&&(a.needsUpdate=!0),this.rtt=!t}}set mainScene(t){}set mainCamera(t){}setRenderer(t){this.renderer=t}isEnabled(){return this.enabled}setEnabled(t){this.enabled=t}get fullscreenMaterial(){return this.screen!==null?this.screen.material:null}set fullscreenMaterial(t){let a=this.screen;a!==null?a.material=t:(a=new pa(Dr.fullscreenGeometry,t),a.frustumCulled=!1,this.scene===null&&(this.scene=new ci),this.scene.add(a),this.screen=a)}getFullscreenMaterial(){return this.fullscreenMaterial}setFullscreenMaterial(t){this.fullscreenMaterial=t}getDepthTexture(){return null}setDepthTexture(t,a=Go){}render(t,a,s,i,o){throw new Error("Render method not implemented!")}setSize(t,a){}initialize(t,a,s){}dispose(){for(const t of Object.keys(this)){const a=this[t];(a instanceof Ot||a instanceof Du||a instanceof Nr||a instanceof Dr)&&this[t].dispose()}this.fullscreenMaterial!==null&&this.fullscreenMaterial.dispose()}},yf=class extends ua{constructor(){super("ClearMaskPass",null,null),this.needsSwap=!1}render(e,t,a,s,i){const o=e.state.buffers.stencil;o.setLocked(!1),o.setTest(!1)}},bf=`#ifdef COLOR_WRITE
#include <common>
#include <dithering_pars_fragment>
#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#endif
#ifdef DEPTH_WRITE
#include <packing>
#ifdef GL_FRAGMENT_PRECISION_HIGH
uniform highp sampler2D depthBuffer;
#else
uniform mediump sampler2D depthBuffer;
#endif
float readDepth(const in vec2 uv){
#if DEPTH_PACKING == 3201
return unpackRGBAToDepth(texture2D(depthBuffer,uv));
#else
return texture2D(depthBuffer,uv).r;
#endif
}
#endif
#ifdef USE_WEIGHTS
uniform vec4 channelWeights;
#endif
uniform float opacity;varying vec2 vUv;void main(){
#ifdef COLOR_WRITE
vec4 texel=texture2D(inputBuffer,vUv);
#ifdef USE_WEIGHTS
texel*=channelWeights;
#endif
gl_FragColor=opacity*texel;
#ifdef COLOR_SPACE_CONVERSION
#include <colorspace_fragment>
#endif
#include <dithering_fragment>
#else
gl_FragColor=vec4(0.0);
#endif
#ifdef DEPTH_WRITE
gl_FragDepth=readDepth(vUv);
#endif
}`,Gr="varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,1.0,1.0);}",Yu=class extends wt{constructor(){super({name:"CopyMaterial",defines:{COLOR_SPACE_CONVERSION:"1",DEPTH_PACKING:"0",COLOR_WRITE:"1"},uniforms:{inputBuffer:new _e(null),depthBuffer:new _e(null),channelWeights:new _e(null),opacity:new _e(1)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:bf,vertexShader:Gr}),this.depthFunc=Ph}get inputBuffer(){return this.uniforms.inputBuffer.value}set inputBuffer(e){const t=e!==null;this.colorWrite!==t&&(t?this.defines.COLOR_WRITE=!0:delete this.defines.COLOR_WRITE,this.colorWrite=t,this.needsUpdate=!0),this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){const t=e!==null;this.depthWrite!==t&&(t?this.defines.DEPTH_WRITE=!0:delete this.defines.DEPTH_WRITE,this.depthTest=t,this.depthWrite=t,this.needsUpdate=!0),this.uniforms.depthBuffer.value=e}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}get colorSpaceConversion(){return this.defines.COLOR_SPACE_CONVERSION!==void 0}set colorSpaceConversion(e){this.colorSpaceConversion!==e&&(e?this.defines.COLOR_SPACE_CONVERSION=!0:delete this.defines.COLOR_SPACE_CONVERSION,this.needsUpdate=!0)}get channelWeights(){return this.uniforms.channelWeights.value}set channelWeights(e){e!==null?(this.defines.USE_WEIGHTS="1",this.uniforms.channelWeights.value=e):delete this.defines.USE_WEIGHTS,this.needsUpdate=!0}setInputBuffer(e){this.uniforms.inputBuffer.value=e}getOpacity(e){return this.uniforms.opacity.value}setOpacity(e){this.uniforms.opacity.value=e}},$u=class extends ua{constructor(e,t=!0){super("CopyPass"),this.fullscreenMaterial=new Yu,this.needsSwap=!1,this.renderTarget=e,e===void 0&&(this.renderTarget=new Ot(1,1,{minFilter:ze,magFilter:ze,stencilBuffer:!1,depthBuffer:!1}),this.renderTarget.texture.name="CopyPass.Target"),this.autoResize=t}get resize(){return this.autoResize}set resize(e){this.autoResize=e}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}setAutoResizeEnabled(e){this.autoResize=e}render(e,t,a,s,i){this.fullscreenMaterial.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){this.autoResize&&this.renderTarget.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTarget.texture.type=a,a!==Ut?this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1":e!==null&&e.outputColorSpace===ot&&(this.renderTarget.texture.colorSpace=ot))}},qc=new Uo,Xu=class extends ua{constructor(e=!0,t=!0,a=!1){super("ClearPass",null,null),this.needsSwap=!1,this.color=e,this.depth=t,this.stencil=a,this.overrideClearColor=null,this.overrideClearAlpha=-1}setClearFlags(e,t,a){this.color=e,this.depth=t,this.stencil=a}getOverrideClearColor(){return this.overrideClearColor}setOverrideClearColor(e){this.overrideClearColor=e}getOverrideClearAlpha(){return this.overrideClearAlpha}setOverrideClearAlpha(e){this.overrideClearAlpha=e}render(e,t,a,s,i){const o=this.overrideClearColor,l=this.overrideClearAlpha,u=e.getClearAlpha(),r=o!==null,c=l>=0;r?(e.getClearColor(qc),e.setClearColor(o,c?l:u)):c&&e.setClearAlpha(l),e.setRenderTarget(this.renderToScreen?null:t),e.clear(this.color,this.depth,this.stencil),r?e.setClearColor(qc,u):c&&e.setClearAlpha(u)}},Sf=class extends ua{constructor(e,t){super("MaskPass",e,t),this.needsSwap=!1,this.clearPass=new Xu(!1,!1,!0),this.inverse=!1}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get inverted(){return this.inverse}set inverted(e){this.inverse=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getClearPass(){return this.clearPass}isInverted(){return this.inverted}setInverted(e){this.inverted=e}render(e,t,a,s,i){const o=e.getContext(),l=e.state.buffers,u=this.scene,r=this.camera,c=this.clearPass,h=this.inverted?0:1,v=1-h;l.color.setMask(!1),l.depth.setMask(!1),l.color.setLocked(!0),l.depth.setLocked(!0),l.stencil.setTest(!0),l.stencil.setOp(o.REPLACE,o.REPLACE,o.REPLACE),l.stencil.setFunc(o.ALWAYS,h,4294967295),l.stencil.setClear(v),l.stencil.setLocked(!0),this.clearPass.enabled&&(this.renderToScreen?c.render(e,null):(c.render(e,t),c.render(e,a))),this.renderToScreen?(e.setRenderTarget(null),e.render(u,r)):(e.setRenderTarget(t),e.render(u,r),e.setRenderTarget(a),e.render(u,r)),l.color.setLocked(!1),l.depth.setLocked(!1),l.stencil.setLocked(!1),l.stencil.setFunc(o.EQUAL,1,4294967295),l.stencil.setOp(o.KEEP,o.KEEP,o.KEEP),l.stencil.setLocked(!0)}};function Tf(e,t){const a=e.getContext();if(t<=0||typeof a.renderbufferStorageMultisample!="function")return 0;const s=a.getParameter(a.MAX_SAMPLES),i=Math.min(t,s);if(i<=0)return 0;const o=a.getParameter(a.RENDERBUFFER_BINDING),l=a.createRenderbuffer();try{return a.bindRenderbuffer(a.RENDERBUFFER,l),a.renderbufferStorageMultisample(a.RENDERBUFFER,i,a.RGBA8,1,1),i}catch{return 0}finally{a.bindRenderbuffer(a.RENDERBUFFER,o),a.deleteRenderbuffer(l)}}var ar=1/1e3,Ef=1e3,Rf=class{constructor(){this.startTime=performance.now(),this.previousTime=0,this.currentTime=0,this._delta=0,this._elapsed=0,this._fixedDelta=1e3/60,this.timescale=1,this.useFixedDelta=!1,this._autoReset=!1}get autoReset(){return this._autoReset}set autoReset(e){typeof document<"u"&&document.hidden!==void 0&&(e?document.addEventListener("visibilitychange",this):document.removeEventListener("visibilitychange",this),this._autoReset=e)}get delta(){return this._delta*ar}get fixedDelta(){return this._fixedDelta*ar}set fixedDelta(e){this._fixedDelta=e*Ef}get elapsed(){return this._elapsed*ar}update(e){this.useFixedDelta?this._delta=this.fixedDelta:(this.previousTime=this.currentTime,this.currentTime=(e!==void 0?e:performance.now())-this.startTime,this._delta=this.currentTime-this.previousTime),this._delta*=this.timescale,this._elapsed+=this._delta}reset(){this._delta=0,this._elapsed=0,this.currentTime=performance.now()-this.startTime}getDelta(){return this.delta}getElapsed(){return this.elapsed}handleEvent(e){document.hidden||(this.currentTime=performance.now()-this.startTime)}dispose(){this.autoReset=!1}},Af=class{constructor(e=null,{depthBuffer:t=!0,stencilBuffer:a=!1,multisampling:s=0,frameBufferType:i=Ut}={}){this.renderer=null,this.inputBuffer=this.createBuffer(t,a,i,s),this.outputBuffer=this.inputBuffer.clone(),this.copyPass=new $u,this.depthRenderTarget=null,this.passes=[],this.timer=new Rf,this.autoRenderToScreen=!0,this.setRenderer(e)}get stableDepthTexture(){return this.depthRenderTarget===null?null:this.depthRenderTarget.depthTexture}get multisampling(){return this.inputBuffer.samples}set multisampling(e){const t=this.renderer===null?e:Tf(this.renderer,e);this.multisampling!==t&&(this.inputBuffer.samples=t,this.outputBuffer.samples=t,this.inputBuffer.dispose(),this.outputBuffer.dispose())}getTimer(){return this.timer}getRenderer(){return this.renderer}setRenderer(e){if(this.renderer=e,e!==null){const t=e.getSize(new Ne),a=e.getContext().getContextAttributes().alpha,s=this.inputBuffer.texture.type;s===Ut&&e.outputColorSpace===ot&&(this.inputBuffer.texture.colorSpace=ot,this.outputBuffer.texture.colorSpace=ot,this.inputBuffer.dispose(),this.outputBuffer.dispose());const i=this.multisampling;this.multisampling=i,e.autoClear=!1,this.setSize(t.width,t.height);for(const o of this.passes)o.initialize(e,a,s)}}replaceRenderer(e,t=!0){const a=this.renderer,s=a.domElement.parentNode;return this.setRenderer(e),t&&s!==null&&(s.removeChild(a.domElement),s.appendChild(e.domElement)),a}createDepthTexture(){const e=new Xn;e.name="EffectComposer.InputDepth",this.inputBuffer.stencilBuffer?(e.format=_h,e.type=Fh):e.type=Cr;const t=new Xn;t.format=e.format,t.type=e.type,t.name="EffectComposer.OutputDepth";const a=new Xn;a.format=e.format,a.type=e.type,a.name="EffectComposer.StableDepth",this.inputBuffer.depthTexture=e,this.outputBuffer.depthTexture=t,this.inputBuffer.dispose(),this.outputBuffer.dispose();const{width:s,height:i}=this.inputBuffer;this.depthRenderTarget=new Ot(s,i,{depthBuffer:!0,stencilBuffer:this.inputBuffer.stencilBuffer,depthTexture:a})}blitDepthBuffer(e){const t=this.renderer,a=this.depthRenderTarget,s=t.properties,i=t.getContext();t.setRenderTarget(a);const o=s.get(e).__webglFramebuffer,l=s.get(a).__webglFramebuffer,u=e.stencilBuffer?i.DEPTH_BUFFER_BIT|i.STENCIL_BUFFER_BIT:i.DEPTH_BUFFER_BIT;i.bindFramebuffer(i.READ_FRAMEBUFFER,o),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,l),i.blitFramebuffer(0,0,e.width,e.height,0,0,a.width,a.height,u,i.NEAREST),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),t.setRenderTarget(null)}deleteDepthTexture(){const e=this.stableDepthTexture;for(const t of this.passes)t.getDepthTexture()===e&&t.setDepthTexture(null);this.depthRenderTarget!==null&&(this.depthRenderTarget.dispose(),this.depthRenderTarget=null),this.inputBuffer.depthTexture!==null&&(this.inputBuffer.depthTexture.dispose(),this.inputBuffer.depthTexture=null),this.outputBuffer.depthTexture!==null&&(this.outputBuffer.depthTexture.dispose(),this.outputBuffer.depthTexture=null)}createBuffer(e,t,a,s){const i=this.renderer,o=i===null?new Ne:i.getDrawingBufferSize(new Ne),l=new Ot(o.width,o.height,{minFilter:ze,magFilter:ze,samples:s,stencilBuffer:t,depthBuffer:e,type:a});return a===Ut&&i!==null&&i.outputColorSpace===ot&&(l.texture.colorSpace=ot),l.texture.name="EffectComposer.Buffer",l.texture.generateMipmaps=!1,l}setMainScene(e){for(const t of this.passes)t.mainScene=e}setMainCamera(e){for(const t of this.passes)t.mainCamera=e}addPass(e,t){const a=this.passes,s=this.renderer,i=s.getDrawingBufferSize(new Ne),o=s.getContext().getContextAttributes().alpha,l=this.inputBuffer.texture.type;if(e.renderer=s,e.setSize(i.width,i.height),e.initialize(s,o,l),this.autoRenderToScreen&&(a.length>0&&(a[a.length-1].renderToScreen=!1),e.renderToScreen&&(this.autoRenderToScreen=!1)),t!==void 0?a.splice(t,0,e):a.push(e),this.autoRenderToScreen&&(a[a.length-1].renderToScreen=!0),e.needsDepthTexture||this.depthRenderTarget!==null)if(this.depthRenderTarget===null){this.createDepthTexture();for(const u of a)u.setDepthTexture(this.stableDepthTexture)}else e.setDepthTexture(this.stableDepthTexture)}removePass(e){const t=this.passes,a=t.indexOf(e);if(a!==-1&&t.splice(a,1).length>0){const o=this.stableDepthTexture;if(o!==null){const l=(r,c)=>r||c.needsDepthTexture;t.reduce(l,!1)||(e.getDepthTexture()===o&&e.setDepthTexture(null),this.deleteDepthTexture())}this.autoRenderToScreen&&a===t.length&&(e.renderToScreen=!1,t.length>0&&(t[t.length-1].renderToScreen=!0))}}removeAllPasses(){const e=this.passes;this.deleteDepthTexture(),e.length>0&&(this.autoRenderToScreen&&(e[e.length-1].renderToScreen=!1),this.passes=[])}render(e){const t=this.renderer,a=this.copyPass;let s=this.inputBuffer,i=this.outputBuffer,o,l=!1;e===void 0&&(this.timer.update(),e=this.timer.getDelta());for(const u of this.passes)if(u.enabled){if(u.render(t,s,i,e,l),u.needsDepthBlit&&this.depthRenderTarget!==null&&this.blitDepthBuffer(s),u.needsSwap){if(l){a.renderToScreen=u.renderToScreen;const r=t.getContext(),c=t.state.buffers.stencil;c.setFunc(r.NOTEQUAL,1,4294967295),a.render(t,s,i,e,l),c.setFunc(r.EQUAL,1,4294967295)}o=s,s=i,i=o}u instanceof Sf?l=!0:u instanceof yf&&(l=!1)}}setSize(e,t,a){const s=this.renderer,i=s.getSize(new Ne);(e===void 0||t===void 0)&&(e=i.width,t=i.height),(i.width!==e||i.height!==t)&&s.setSize(e,t,a);const o=s.getDrawingBufferSize(new Ne);this.inputBuffer.setSize(o.width,o.height),this.outputBuffer.setSize(o.width,o.height),this.depthRenderTarget!==null&&this.depthRenderTarget.setSize(o.width,o.height);for(const l of this.passes)l.setSize(o.width,o.height)}reset(){this.dispose(),this.autoRenderToScreen=!0}dispose(){for(const e of this.passes)e.dispose();this.deleteDepthTexture(),this.inputBuffer.dispose(),this.outputBuffer.dispose(),this.copyPass.dispose(),this.timer.dispose(),this.passes=[],ua.fullscreenGeometry.dispose()}},Ps={NONE:0,DEPTH:1,CONVOLUTION:2},Xe={FRAGMENT_HEAD:"FRAGMENT_HEAD",FRAGMENT_MAIN_UV:"FRAGMENT_MAIN_UV",FRAGMENT_MAIN_IMAGE:"FRAGMENT_MAIN_IMAGE",VERTEX_HEAD:"VERTEX_HEAD",VERTEX_MAIN_SUPPORT:"VERTEX_MAIN_SUPPORT"},kf=class{constructor(){this.shaderParts=new Map([[Xe.FRAGMENT_HEAD,null],[Xe.FRAGMENT_MAIN_UV,null],[Xe.FRAGMENT_MAIN_IMAGE,null],[Xe.VERTEX_HEAD,null],[Xe.VERTEX_MAIN_SUPPORT,null]]),this.defines=new Map,this.uniforms=new Map,this.blendModes=new Map,this.extensions=new Set,this.attributes=Ps.NONE,this.varyings=new Set,this.uvTransformation=!1,this.readDepth=!1,this.colorSpace=Fu}},sr=!1,Zc=class{constructor(e=null){this.originalMaterials=new Map,this.material=null,this.materials=null,this.materialsBackSide=null,this.materialsDoubleSide=null,this.materialsFlatShaded=null,this.materialsFlatShadedBackSide=null,this.materialsFlatShadedDoubleSide=null,this.setMaterial(e),this.meshCount=0,this.replaceMaterial=t=>{if(t.isMesh){let a;if(t.material.flatShading)switch(t.material.side){case _s:a=this.materialsFlatShadedDoubleSide;break;case Qs:a=this.materialsFlatShadedBackSide;break;default:a=this.materialsFlatShaded;break}else switch(t.material.side){case _s:a=this.materialsDoubleSide;break;case Qs:a=this.materialsBackSide;break;default:a=this.materials;break}this.originalMaterials.set(t,t.material),t.isSkinnedMesh?t.material=a[2]:t.isInstancedMesh?t.material=a[1]:t.material=a[0],++this.meshCount}}}cloneMaterial(e){if(!(e instanceof wt))return e.clone();const t=e.uniforms,a=new Map;for(const i in t){const o=t[i].value;o.isRenderTargetTexture&&(t[i].value=null,a.set(i,o))}const s=e.clone();for(const i of a)t[i[0]].value=i[1],s.uniforms[i[0]].value=i[1];return s}setMaterial(e){if(this.disposeMaterials(),this.material=e,e!==null){const t=this.materials=[this.cloneMaterial(e),this.cloneMaterial(e),this.cloneMaterial(e)];for(const a of t)a.uniforms=Object.assign({},e.uniforms),a.side=Dh;t[2].skinning=!0,this.materialsBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=Qs,s}),this.materialsDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=_s,s}),this.materialsFlatShaded=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s}),this.materialsFlatShadedBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=Qs,s}),this.materialsFlatShadedDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=_s,s})}}render(e,t,a){const s=e.shadowMap.enabled;if(e.shadowMap.enabled=!1,sr){const i=this.originalMaterials;this.meshCount=0,t.traverse(this.replaceMaterial),e.render(t,a);for(const o of i)o[0].material=o[1];this.meshCount!==i.size&&i.clear()}else{const i=t.overrideMaterial;t.overrideMaterial=this.material,e.render(t,a),t.overrideMaterial=i}e.shadowMap.enabled=s}disposeMaterials(){if(this.material!==null){const e=this.materials.concat(this.materialsBackSide).concat(this.materialsDoubleSide).concat(this.materialsFlatShaded).concat(this.materialsFlatShadedBackSide).concat(this.materialsFlatShadedDoubleSide);for(const t of e)t.dispose()}}dispose(){this.originalMaterials.clear(),this.disposeMaterials()}static get workaroundEnabled(){return sr}static set workaroundEnabled(e){sr=e}},is=-1,Fa=class extends zr{constructor(e=null,t=is,a=is,s=1){super(),e!==null&&this.addEventListener("change",()=>e.setSize(this.baseSize.width,this.baseSize.height)),this.baseSize=new Ne(1,1),this.preferredSize=new Ne(t,a),this.target=this.preferredSize,this.s=s,this.effectiveSize=new Ne,this.addEventListener("change",()=>this.updateEffectiveSize()),this.updateEffectiveSize()}updateEffectiveSize(){const e=this.baseSize,t=this.preferredSize,a=this.effectiveSize,s=this.scale;t.width!==is?a.width=t.width:t.height!==is?a.width=Math.round(t.height*(e.width/Math.max(e.height,1))):a.width=Math.round(e.width*s),t.height!==is?a.height=t.height:t.width!==is?a.height=Math.round(t.width/Math.max(e.width/Math.max(e.height,1),1)):a.height=Math.round(e.height*s)}get width(){return this.effectiveSize.width}set width(e){this.preferredWidth=e}get height(){return this.effectiveSize.height}set height(e){this.preferredHeight=e}getWidth(){return this.width}getHeight(){return this.height}get scale(){return this.s}set scale(e){this.s!==e&&(this.s=e,this.preferredSize.setScalar(is),this.dispatchEvent({type:"change"}))}getScale(){return this.scale}setScale(e){this.scale=e}get baseWidth(){return this.baseSize.width}set baseWidth(e){this.baseSize.width!==e&&(this.baseSize.width=e,this.dispatchEvent({type:"change"}))}getBaseWidth(){return this.baseWidth}setBaseWidth(e){this.baseWidth=e}get baseHeight(){return this.baseSize.height}set baseHeight(e){this.baseSize.height!==e&&(this.baseSize.height=e,this.dispatchEvent({type:"change"}))}getBaseHeight(){return this.baseHeight}setBaseHeight(e){this.baseHeight=e}setBaseSize(e,t){(this.baseSize.width!==e||this.baseSize.height!==t)&&(this.baseSize.set(e,t),this.dispatchEvent({type:"change"}))}get preferredWidth(){return this.preferredSize.width}set preferredWidth(e){this.preferredSize.width!==e&&(this.preferredSize.width=e,this.dispatchEvent({type:"change"}))}getPreferredWidth(){return this.preferredWidth}setPreferredWidth(e){this.preferredWidth=e}get preferredHeight(){return this.preferredSize.height}set preferredHeight(e){this.preferredSize.height!==e&&(this.preferredSize.height=e,this.dispatchEvent({type:"change"}))}getPreferredHeight(){return this.preferredHeight}setPreferredHeight(e){this.preferredHeight=e}setPreferredSize(e,t){(this.preferredSize.width!==e||this.preferredSize.height!==t)&&(this.preferredSize.set(e,t),this.dispatchEvent({type:"change"}))}copy(e){this.s=e.scale,this.baseSize.set(e.baseWidth,e.baseHeight),this.preferredSize.set(e.preferredWidth,e.preferredHeight),this.dispatchEvent({type:"change"})}static get AUTO_SIZE(){return is}},Ie={ADD:0,ALPHA:1,AVERAGE:2,COLOR:3,COLOR_BURN:4,COLOR_DODGE:5,DARKEN:6,DIFFERENCE:7,DIVIDE:8,DST:9,EXCLUSION:10,HARD_LIGHT:11,HARD_MIX:12,HUE:13,INVERT:14,INVERT_RGB:15,LIGHTEN:16,LINEAR_BURN:17,LINEAR_DODGE:18,LINEAR_LIGHT:19,LUMINOSITY:20,MULTIPLY:21,NEGATION:22,NORMAL:23,OVERLAY:24,PIN_LIGHT:25,REFLECT:26,SATURATION:27,SCREEN:28,SOFT_LIGHT:29,SRC:30,SUBTRACT:31,VIVID_LIGHT:32},_f="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Ff="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,src.a*opacity);}",Df="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=(dst.rgb+src.rgb)*0.5;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Pf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.xy,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",If="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=mix(step(0.0,b)*(1.0-min(vec3(1.0),(1.0-a)/max(b,1e-9))),vec3(1.0),step(1.0,a));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Cf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=step(0.0,a)*mix(min(vec3(1.0),a/max(1.0-b,1e-9)),vec3(1.0),step(1.0,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Lf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Nf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=abs(dst.rgb-src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",zf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb/max(src.rgb,1e-9);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Uf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-2.0*dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Bf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb,1.0);vec3 b=min(src.rgb,1.0);vec3 c=mix(2.0*a*b,1.0-2.0*(1.0-a)*(1.0-b),step(0.5,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Of="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=step(1.0,dst.rgb+src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Hf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.x,a.yz));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Gf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Kf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=src.rgb*max(1.0-dst.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Wf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Vf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Yf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb+src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",$f="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(2.0*src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Xf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.xy,b.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",jf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",qf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-abs(1.0-dst.rgb-src.rgb),0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Zf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,opacity);}",Qf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=2.0*src.rgb*dst.rgb;vec3 b=1.0-2.0*(1.0-src.rgb)*(1.0-dst.rgb);vec3 c=mix(a,b,step(0.5,dst.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Jf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 c=mix(mix(src2,dst.rgb,step(0.5*dst.rgb,src.rgb)),max(src2-1.0,vec3(0.0)),step(dst.rgb,src2-1.0));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",em="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb*dst.rgb/max(1.0-src.rgb,1e-9),1.0);vec3 c=mix(a,src.rgb,step(1.0,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",tm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.x,b.y,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",am="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-min(dst.rgb*src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",sm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 d=dst.rgb+(src2-1.0);vec3 w=step(0.5,src.rgb);vec3 a=dst.rgb-(1.0-src2)*dst.rgb*(1.0-dst.rgb);vec3 b=mix(d*(sqrt(dst.rgb)-dst.rgb),d*dst.rgb*((16.0*dst.rgb-12.0)*dst.rgb+3.0),w*(1.0-step(0.25,dst.rgb)));vec3 c=mix(a,b,w);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",im="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return src;}",om="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",nm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=mix(max(1.0-min((1.0-dst.rgb)/(2.0*src.rgb),1.0),0.0),min(dst.rgb/(2.0*(1.0-src.rgb)),1.0),step(0.5,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",rm=new Map([[Ie.ADD,_f],[Ie.ALPHA,Ff],[Ie.AVERAGE,Df],[Ie.COLOR,Pf],[Ie.COLOR_BURN,If],[Ie.COLOR_DODGE,Cf],[Ie.DARKEN,Lf],[Ie.DIFFERENCE,Nf],[Ie.DIVIDE,zf],[Ie.DST,null],[Ie.EXCLUSION,Uf],[Ie.HARD_LIGHT,Bf],[Ie.HARD_MIX,Of],[Ie.HUE,Hf],[Ie.INVERT,Gf],[Ie.INVERT_RGB,Kf],[Ie.LIGHTEN,Wf],[Ie.LINEAR_BURN,Vf],[Ie.LINEAR_DODGE,Yf],[Ie.LINEAR_LIGHT,$f],[Ie.LUMINOSITY,Xf],[Ie.MULTIPLY,jf],[Ie.NEGATION,qf],[Ie.NORMAL,Zf],[Ie.OVERLAY,Qf],[Ie.PIN_LIGHT,Jf],[Ie.REFLECT,em],[Ie.SATURATION,tm],[Ie.SCREEN,am],[Ie.SOFT_LIGHT,sm],[Ie.SRC,im],[Ie.SUBTRACT,om],[Ie.VIVID_LIGHT,nm]]),lm=class extends zr{constructor(e,t=1){super(),this._blendFunction=e,this.opacity=new _e(t)}getOpacity(){return this.opacity.value}setOpacity(e){this.opacity.value=e}get blendFunction(){return this._blendFunction}set blendFunction(e){this._blendFunction=e,this.dispatchEvent({type:"change"})}getBlendFunction(){return this.blendFunction}setBlendFunction(e){this.blendFunction=e}getShaderCode(){return rm.get(this.blendFunction)}},ju=class extends zr{constructor(e,t,{attributes:a=Ps.NONE,blendFunction:s=Ie.NORMAL,defines:i=new Map,uniforms:o=new Map,extensions:l=null,vertexShader:u=null}={}){super(),this.name=e,this.renderer=null,this.attributes=a,this.fragmentShader=t,this.vertexShader=u,this.defines=i,this.uniforms=o,this.extensions=l,this.blendMode=new lm(s),this.blendMode.addEventListener("change",r=>this.setChanged()),this._inputColorSpace=Fu,this._outputColorSpace=Pa}get inputColorSpace(){return this._inputColorSpace}set inputColorSpace(e){this._inputColorSpace=e,this.setChanged()}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e,this.setChanged()}set mainScene(e){}set mainCamera(e){}getName(){return this.name}setRenderer(e){this.renderer=e}getDefines(){return this.defines}getUniforms(){return this.uniforms}getExtensions(){return this.extensions}getBlendMode(){return this.blendMode}getAttributes(){return this.attributes}setAttributes(e){this.attributes=e,this.setChanged()}getFragmentShader(){return this.fragmentShader}setFragmentShader(e){this.fragmentShader=e,this.setChanged()}getVertexShader(){return this.vertexShader}setVertexShader(e){this.vertexShader=e,this.setChanged()}setChanged(){this.dispatchEvent({type:"change"})}setDepthTexture(e,t=Go){}update(e,t,a){}setSize(e,t){}initialize(e,t,a){}dispose(){for(const e of Object.keys(this)){const t=this[e];(t instanceof Ot||t instanceof Du||t instanceof Nr||t instanceof ua)&&this[e].dispose()}}},Kr={MEDIUM:2,LARGE:3},cm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec4 sum=texture2D(inputBuffer,vUv0);sum+=texture2D(inputBuffer,vUv1);sum+=texture2D(inputBuffer,vUv2);sum+=texture2D(inputBuffer,vUv3);gl_FragColor=sum*0.25;
#include <colorspace_fragment>
}`,um="uniform vec4 texelSize;uniform float kernel;uniform float scale;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec2 uv=position.xy*0.5+0.5;vec2 dUv=(texelSize.xy*vec2(kernel)+texelSize.zw)*scale;vUv0=vec2(uv.x-dUv.x,uv.y+dUv.y);vUv1=vec2(uv.x+dUv.x,uv.y+dUv.y);vUv2=vec2(uv.x+dUv.x,uv.y-dUv.y);vUv3=vec2(uv.x-dUv.x,uv.y-dUv.y);gl_Position=vec4(position.xy,1.0,1.0);}",hm=[new Float32Array([0,0]),new Float32Array([0,1,1]),new Float32Array([0,1,1,2]),new Float32Array([0,1,2,2,3]),new Float32Array([0,1,2,3,4,4,5]),new Float32Array([0,1,2,3,4,5,7,8,9,10])],dm=class extends wt{constructor(e=new ma){super({name:"KawaseBlurMaterial",uniforms:{inputBuffer:new _e(null),texelSize:new _e(new ma),scale:new _e(1),kernel:new _e(0)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:cm,vertexShader:um}),this.setTexelSize(e.x,e.y),this.kernelSize=Kr.MEDIUM}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.inputBuffer=e}get kernelSequence(){return hm[this.kernelSize]}get scale(){return this.uniforms.scale.value}set scale(e){this.uniforms.scale.value=e}getScale(){return this.uniforms.scale.value}setScale(e){this.uniforms.scale.value=e}getKernel(){return null}get kernel(){return this.uniforms.kernel.value}set kernel(e){this.uniforms.kernel.value=e}setKernel(e){this.kernel=e}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t,e*.5,t*.5)}setSize(e,t){const a=1/e,s=1/t;this.uniforms.texelSize.value.set(a,s,a*.5,s*.5)}},fm=class extends ua{constructor({kernelSize:e=Kr.MEDIUM,resolutionScale:t=.5,width:a=Fa.AUTO_SIZE,height:s=Fa.AUTO_SIZE,resolutionX:i=a,resolutionY:o=s}={}){super("KawaseBlurPass"),this.renderTargetA=new Ot(1,1,{depthBuffer:!1}),this.renderTargetA.texture.name="Blur.Target.A",this.renderTargetB=this.renderTargetA.clone(),this.renderTargetB.texture.name="Blur.Target.B";const l=this.resolution=new Fa(this,i,o,t);l.addEventListener("change",u=>this.setSize(l.baseWidth,l.baseHeight)),this._blurMaterial=new dm,this._blurMaterial.kernelSize=e,this.copyMaterial=new Yu}getResolution(){return this.resolution}get blurMaterial(){return this._blurMaterial}set blurMaterial(e){this._blurMaterial=e}get dithering(){return this.copyMaterial.dithering}set dithering(e){this.copyMaterial.dithering=e}get kernelSize(){return this.blurMaterial.kernelSize}set kernelSize(e){this.blurMaterial.kernelSize=e}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get scale(){return this.blurMaterial.scale}set scale(e){this.blurMaterial.scale=e}getScale(){return this.blurMaterial.scale}setScale(e){this.blurMaterial.scale=e}getKernelSize(){return this.kernelSize}setKernelSize(e){this.kernelSize=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}render(e,t,a,s,i){const o=this.scene,l=this.camera,u=this.renderTargetA,r=this.renderTargetB,c=this.blurMaterial,h=c.kernelSequence;let v=t;this.fullscreenMaterial=c;for(let x=0,y=h.length;x<y;++x){const M=(x&1)===0?u:r;c.kernel=h[x],c.inputBuffer=v.texture,e.setRenderTarget(M),e.render(o,l),v=M}this.fullscreenMaterial=this.copyMaterial,this.copyMaterial.inputBuffer=v.texture,e.setRenderTarget(this.renderToScreen?null:a),e.render(o,l)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t);const s=a.width,i=a.height;this.renderTargetA.setSize(s,i),this.renderTargetB.setSize(s,i),this.blurMaterial.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTargetA.texture.type=a,this.renderTargetB.texture.type=a,a!==Ut?(this.blurMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.copyMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1"):e!==null&&e.outputColorSpace===ot&&(this.renderTargetA.texture.colorSpace=ot,this.renderTargetB.texture.colorSpace=ot))}static get AUTO_SIZE(){return Fa.AUTO_SIZE}},mm=`#include <common>
#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#ifdef RANGE
uniform vec2 range;
#elif defined(THRESHOLD)
uniform float threshold;uniform float smoothing;
#endif
varying vec2 vUv;void main(){vec4 texel=texture2D(inputBuffer,vUv);float l=luminance(texel.rgb);float mask=1.0;
#ifdef RANGE
float low=step(range.x,l);float high=step(l,range.y);mask=low*high;
#elif defined(THRESHOLD)
mask=smoothstep(threshold,threshold+smoothing,l);
#endif
#ifdef COLOR
gl_FragColor=texel*mask;
#else
gl_FragColor=vec4(l*mask);
#endif
}`,pm=class extends wt{constructor(e=!1,t=null){super({name:"LuminanceMaterial",defines:{THREE_REVISION:Ur.replace(/\D+/g,"")},uniforms:{inputBuffer:new _e(null),threshold:new _e(0),smoothing:new _e(1),range:new _e(null)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:mm,vertexShader:Gr}),this.colorOutput=e,this.luminanceRange=t}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get threshold(){return this.uniforms.threshold.value}set threshold(e){this.smoothing>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.threshold.value=e}getThreshold(){return this.threshold}setThreshold(e){this.threshold=e}get smoothing(){return this.uniforms.smoothing.value}set smoothing(e){this.threshold>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.smoothing.value=e}getSmoothingFactor(){return this.smoothing}setSmoothingFactor(e){this.smoothing=e}get useThreshold(){return this.threshold>0||this.smoothing>0}set useThreshold(e){}get colorOutput(){return this.defines.COLOR!==void 0}set colorOutput(e){e?this.defines.COLOR="1":delete this.defines.COLOR,this.needsUpdate=!0}isColorOutputEnabled(e){return this.colorOutput}setColorOutputEnabled(e){this.colorOutput=e}get useRange(){return this.luminanceRange!==null}set useRange(e){this.luminanceRange=null}get luminanceRange(){return this.uniforms.range.value}set luminanceRange(e){e!==null?this.defines.RANGE="1":delete this.defines.RANGE,this.uniforms.range.value=e,this.needsUpdate=!0}getLuminanceRange(){return this.luminanceRange}setLuminanceRange(e){this.luminanceRange=e}},qu=class extends ua{constructor({renderTarget:e,luminanceRange:t,colorOutput:a,resolutionScale:s=1,width:i=Fa.AUTO_SIZE,height:o=Fa.AUTO_SIZE,resolutionX:l=i,resolutionY:u=o}={}){super("LuminancePass"),this.fullscreenMaterial=new pm(a,t),this.needsSwap=!1,this.renderTarget=e,this.renderTarget===void 0&&(this.renderTarget=new Ot(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="LuminancePass.Target");const r=this.resolution=new Fa(this,l,u,s);r.addEventListener("change",c=>this.setSize(r.baseWidth,r.baseHeight))}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}getResolution(){return this.resolution}render(e,t,a,s,i){const o=this.fullscreenMaterial;o.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height)}initialize(e,t,a){a!==void 0&&a!==Ut&&(this.renderTarget.texture.type=a,this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}},vm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#define WEIGHT_INNER 0.125
#define WEIGHT_OUTER 0.05556
varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;float clampToBorder(const in vec2 uv){return float(uv.s>=0.0&&uv.s<=1.0&&uv.t>=0.0&&uv.t<=1.0);}void main(){vec4 c=vec4(0.0);vec4 w=WEIGHT_INNER*vec4(clampToBorder(vUv00),clampToBorder(vUv01),clampToBorder(vUv02),clampToBorder(vUv03));c+=w.x*texture2D(inputBuffer,vUv00);c+=w.y*texture2D(inputBuffer,vUv01);c+=w.z*texture2D(inputBuffer,vUv02);c+=w.w*texture2D(inputBuffer,vUv03);w=WEIGHT_OUTER*vec4(clampToBorder(vUv04),clampToBorder(vUv05),clampToBorder(vUv06),clampToBorder(vUv07));c+=w.x*texture2D(inputBuffer,vUv04);c+=w.y*texture2D(inputBuffer,vUv05);c+=w.z*texture2D(inputBuffer,vUv06);c+=w.w*texture2D(inputBuffer,vUv07);w=WEIGHT_OUTER*vec4(clampToBorder(vUv08),clampToBorder(vUv09),clampToBorder(vUv10),clampToBorder(vUv11));c+=w.x*texture2D(inputBuffer,vUv08);c+=w.y*texture2D(inputBuffer,vUv09);c+=w.z*texture2D(inputBuffer,vUv10);c+=w.w*texture2D(inputBuffer,vUv11);c+=WEIGHT_OUTER*texture2D(inputBuffer,vUv);gl_FragColor=c;
#include <colorspace_fragment>
}`,gm="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;void main(){vUv=position.xy*0.5+0.5;vUv00=vUv+texelSize*vec2(-1.0,1.0);vUv01=vUv+texelSize*vec2(1.0,1.0);vUv02=vUv+texelSize*vec2(-1.0,-1.0);vUv03=vUv+texelSize*vec2(1.0,-1.0);vUv04=vUv+texelSize*vec2(-2.0,2.0);vUv05=vUv+texelSize*vec2(0.0,2.0);vUv06=vUv+texelSize*vec2(2.0,2.0);vUv07=vUv+texelSize*vec2(-2.0,0.0);vUv08=vUv+texelSize*vec2(2.0,0.0);vUv09=vUv+texelSize*vec2(-2.0,-2.0);vUv10=vUv+texelSize*vec2(0.0,-2.0);vUv11=vUv+texelSize*vec2(2.0,-2.0);gl_Position=vec4(position.xy,1.0,1.0);}",xm=class extends wt{constructor(){super({name:"DownsamplingMaterial",uniforms:{inputBuffer:new _e(null),texelSize:new _e(new Ne)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:vm,vertexShader:gm})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},wm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;uniform mediump sampler2D supportBuffer;
#else
uniform lowp sampler2D inputBuffer;uniform lowp sampler2D supportBuffer;
#endif
uniform float radius;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vec4 c=vec4(0.0);c+=texture2D(inputBuffer,vUv0)*0.0625;c+=texture2D(inputBuffer,vUv1)*0.125;c+=texture2D(inputBuffer,vUv2)*0.0625;c+=texture2D(inputBuffer,vUv3)*0.125;c+=texture2D(inputBuffer,vUv)*0.25;c+=texture2D(inputBuffer,vUv4)*0.125;c+=texture2D(inputBuffer,vUv5)*0.0625;c+=texture2D(inputBuffer,vUv6)*0.125;c+=texture2D(inputBuffer,vUv7)*0.0625;vec4 baseColor=texture2D(supportBuffer,vUv);gl_FragColor=mix(baseColor,c,radius);
#include <colorspace_fragment>
}`,Mm="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vUv=position.xy*0.5+0.5;vUv0=vUv+texelSize*vec2(-1.0,1.0);vUv1=vUv+texelSize*vec2(0.0,1.0);vUv2=vUv+texelSize*vec2(1.0,1.0);vUv3=vUv+texelSize*vec2(-1.0,0.0);vUv4=vUv+texelSize*vec2(1.0,0.0);vUv5=vUv+texelSize*vec2(-1.0,-1.0);vUv6=vUv+texelSize*vec2(0.0,-1.0);vUv7=vUv+texelSize*vec2(1.0,-1.0);gl_Position=vec4(position.xy,1.0,1.0);}",ym=class extends wt{constructor(){super({name:"UpsamplingMaterial",uniforms:{inputBuffer:new _e(null),supportBuffer:new _e(null),texelSize:new _e(new Ne),radius:new _e(.85)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:wm,vertexShader:Mm})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}set supportBuffer(e){this.uniforms.supportBuffer.value=e}get radius(){return this.uniforms.radius.value}set radius(e){this.uniforms.radius.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},bm=class extends ua{constructor(){super("MipmapBlurPass"),this.needsSwap=!1,this.renderTarget=new Ot(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Upsampling.Mipmap0",this.downsamplingMipmaps=[],this.upsamplingMipmaps=[],this.downsamplingMaterial=new xm,this.upsamplingMaterial=new ym,this.resolution=new Ne}get texture(){return this.renderTarget.texture}get levels(){return this.downsamplingMipmaps.length}set levels(e){if(this.levels!==e){const t=this.renderTarget;this.dispose(),this.downsamplingMipmaps=[],this.upsamplingMipmaps=[];for(let a=0;a<e;++a){const s=t.clone();s.texture.name="Downsampling.Mipmap"+a,this.downsamplingMipmaps.push(s)}this.upsamplingMipmaps.push(t);for(let a=1,s=e-1;a<s;++a){const i=t.clone();i.texture.name="Upsampling.Mipmap"+a,this.upsamplingMipmaps.push(i)}this.setSize(this.resolution.x,this.resolution.y)}}get radius(){return this.upsamplingMaterial.radius}set radius(e){this.upsamplingMaterial.radius=e}render(e,t,a,s,i){const{scene:o,camera:l}=this,{downsamplingMaterial:u,upsamplingMaterial:r}=this,{downsamplingMipmaps:c,upsamplingMipmaps:h}=this;let v=t;this.fullscreenMaterial=u;for(let x=0,y=c.length;x<y;++x){const M=c[x];u.setSize(v.width,v.height),u.inputBuffer=v.texture,e.setRenderTarget(M),e.render(o,l),v=M}this.fullscreenMaterial=r;for(let x=h.length-1;x>=0;--x){const y=h[x];r.setSize(v.width,v.height),r.inputBuffer=v.texture,r.supportBuffer=c[x].texture,e.setRenderTarget(y),e.render(o,l),v=y}}setSize(e,t){const a=this.resolution;a.set(e,t);let s=a.width,i=a.height;for(let o=0,l=this.downsamplingMipmaps.length;o<l;++o)s=Math.round(s*.5),i=Math.round(i*.5),this.downsamplingMipmaps[o].setSize(s,i),o<this.upsamplingMipmaps.length&&this.upsamplingMipmaps[o].setSize(s,i)}initialize(e,t,a){if(a!==void 0){const s=this.downsamplingMipmaps.concat(this.upsamplingMipmaps);for(const i of s)i.texture.type=a;if(a!==Ut)this.downsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.upsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1";else if(e!==null&&e.outputColorSpace===ot)for(const i of s)i.texture.colorSpace=ot}}dispose(){super.dispose();for(const e of this.downsamplingMipmaps.concat(this.upsamplingMipmaps))e.dispose()}},Sm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D map;
#else
uniform lowp sampler2D map;
#endif
uniform float intensity;void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){outputColor=texture2D(map,uv)*intensity;}`,Tm=class extends ju{constructor({blendFunction:e=Ie.SCREEN,luminanceThreshold:t=1,luminanceSmoothing:a=.03,mipmapBlur:s=!0,intensity:i=1,radius:o=.85,levels:l=8,kernelSize:u=Kr.LARGE,resolutionScale:r=.5,width:c=Fa.AUTO_SIZE,height:h=Fa.AUTO_SIZE,resolutionX:v=c,resolutionY:x=h}={}){super("BloomEffect",Sm,{blendFunction:e,uniforms:new Map([["map",new _e(null)],["intensity",new _e(i)]])}),this.renderTarget=new Ot(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Bloom.Target",this.blurPass=new fm({kernelSize:u}),this.luminancePass=new qu({colorOutput:!0}),this.luminanceMaterial.threshold=t,this.luminanceMaterial.smoothing=a,this.mipmapBlurPass=new bm,this.mipmapBlurPass.enabled=s,this.mipmapBlurPass.radius=o,this.mipmapBlurPass.levels=l,this.uniforms.get("map").value=s?this.mipmapBlurPass.texture:this.renderTarget.texture;const y=this.resolution=new Fa(this,v,x,r);y.addEventListener("change",M=>this.setSize(y.baseWidth,y.baseHeight))}get texture(){return this.mipmapBlurPass.enabled?this.mipmapBlurPass.texture:this.renderTarget.texture}getTexture(){return this.texture}getResolution(){return this.resolution}getBlurPass(){return this.blurPass}getLuminancePass(){return this.luminancePass}get luminanceMaterial(){return this.luminancePass.fullscreenMaterial}getLuminanceMaterial(){return this.luminancePass.fullscreenMaterial}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get dithering(){return this.blurPass.dithering}set dithering(e){this.blurPass.dithering=e}get kernelSize(){return this.blurPass.kernelSize}set kernelSize(e){this.blurPass.kernelSize=e}get distinction(){return console.warn(this.name,"distinction was removed"),1}set distinction(e){console.warn(this.name,"distinction was removed")}get intensity(){return this.uniforms.get("intensity").value}set intensity(e){this.uniforms.get("intensity").value=e}getIntensity(){return this.intensity}setIntensity(e){this.intensity=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}update(e,t,a){const s=this.renderTarget,i=this.luminancePass;i.enabled?(i.render(e,t),this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,i.renderTarget):this.blurPass.render(e,i.renderTarget,s)):this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,t):this.blurPass.render(e,t,s)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height),this.blurPass.resolution.copy(a),this.luminancePass.setSize(e,t),this.mipmapBlurPass.setSize(e,t)}initialize(e,t,a){this.blurPass.initialize(e,t,a),this.luminancePass.initialize(e,t,a),this.mipmapBlurPass.initialize(e,t,a),a!==void 0&&(this.renderTarget.texture.type=a,e!==null&&e.outputColorSpace===ot&&(this.renderTarget.texture.colorSpace=ot))}},Em=class extends ua{constructor(e,t,a=null){super("RenderPass",e,t),this.needsSwap=!1,this.needsDepthBlit=!0,this.clearPass=new Xu,this.overrideMaterialManager=a===null?null:new Zc(a),this.ignoreBackground=!1,this.skipShadowMapUpdate=!1,this.selection=null}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get renderToScreen(){return super.renderToScreen}set renderToScreen(e){super.renderToScreen=e,this.clearPass.renderToScreen=e}get overrideMaterial(){const e=this.overrideMaterialManager;return e!==null?e.material:null}set overrideMaterial(e){const t=this.overrideMaterialManager;e!==null?t!==null?t.setMaterial(e):this.overrideMaterialManager=new Zc(e):t!==null&&(t.dispose(),this.overrideMaterialManager=null)}getOverrideMaterial(){return this.overrideMaterial}setOverrideMaterial(e){this.overrideMaterial=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getSelection(){return this.selection}setSelection(e){this.selection=e}isBackgroundDisabled(){return this.ignoreBackground}setBackgroundDisabled(e){this.ignoreBackground=e}isShadowMapDisabled(){return this.skipShadowMapUpdate}setShadowMapDisabled(e){this.skipShadowMapUpdate=e}getClearPass(){return this.clearPass}render(e,t,a,s,i){const o=this.scene,l=this.camera,u=this.selection,r=l.layers.mask,c=o.background,h=e.shadowMap.autoUpdate,v=this.renderToScreen?null:t;u!==null&&l.layers.set(u.getLayer()),this.skipShadowMapUpdate&&(e.shadowMap.autoUpdate=!1),(this.ignoreBackground||this.clearPass.overrideClearColor!==null)&&(o.background=null),this.clearPass.enabled&&this.clearPass.render(e,t),e.setRenderTarget(v),this.overrideMaterialManager!==null?this.overrideMaterialManager.render(e,o,l):e.render(o,l),l.layers.mask=r,o.background=c,e.shadowMap.autoUpdate=h}},ia={LINEAR:0,REINHARD:1,REINHARD2:2,REINHARD2_ADAPTIVE:3,OPTIMIZED_CINEON:5,CINEON:5,ACES_FILMIC:6,AGX:7,NEUTRAL:8},Rm=`#include <packing>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
uniform lowp sampler2D luminanceBuffer0;uniform lowp sampler2D luminanceBuffer1;uniform float minLuminance;uniform float deltaTime;uniform float tau;varying vec2 vUv;void main(){float l0=unpackRGBAToFloat(texture2D(luminanceBuffer0,vUv));
#if __VERSION__ < 300
float l1=texture2DLodEXT(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#else
float l1=textureLod(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#endif
l0=max(minLuminance,l0);l1=max(minLuminance,l1);float adaptedLum=l0+(l1-l0)*(1.0-exp(-deltaTime*tau));gl_FragColor=(adaptedLum==1.0)?vec4(1.0):packFloatToRGBA(adaptedLum);}`,Am=class extends wt{constructor(){super({name:"AdaptiveLuminanceMaterial",defines:{MIP_LEVEL_1X1:"0.0"},uniforms:{luminanceBuffer0:new _e(null),luminanceBuffer1:new _e(null),minLuminance:new _e(.01),deltaTime:new _e(0),tau:new _e(1)},extensions:{shaderTextureLOD:!0},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Rm,vertexShader:Gr})}set luminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}setLuminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}set luminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}setLuminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}set mipLevel1x1(e){this.defines.MIP_LEVEL_1X1=e.toFixed(1),this.needsUpdate=!0}setMipLevel1x1(e){this.mipLevel1x1=e}set deltaTime(e){this.uniforms.deltaTime.value=e}setDeltaTime(e){this.uniforms.deltaTime.value=e}get minLuminance(){return this.uniforms.minLuminance.value}set minLuminance(e){this.uniforms.minLuminance.value=e}getMinLuminance(){return this.uniforms.minLuminance.value}setMinLuminance(e){this.uniforms.minLuminance.value=e}get adaptationRate(){return this.uniforms.tau.value}set adaptationRate(e){this.uniforms.tau.value=e}getAdaptationRate(){return this.uniforms.tau.value}setAdaptationRate(e){this.uniforms.tau.value=e}},km=class extends ua{constructor(e,{minLuminance:t=.01,adaptationRate:a=1}={}){super("AdaptiveLuminancePass"),this.fullscreenMaterial=new Am,this.needsSwap=!1,this.renderTargetPrevious=new Ot(1,1,{minFilter:zo,magFilter:zo,depthBuffer:!1}),this.renderTargetPrevious.texture.name="Luminance.Previous";const s=this.fullscreenMaterial;s.luminanceBuffer0=this.renderTargetPrevious.texture,s.luminanceBuffer1=e,s.minLuminance=t,s.adaptationRate=a,this.renderTargetAdapted=this.renderTargetPrevious.clone(),this.renderTargetAdapted.texture.name="Luminance.Adapted",this.copyPass=new $u(this.renderTargetPrevious,!1)}get texture(){return this.renderTargetAdapted.texture}getTexture(){return this.renderTargetAdapted.texture}set mipLevel1x1(e){this.fullscreenMaterial.mipLevel1x1=e}get adaptationRate(){return this.fullscreenMaterial.adaptationRate}set adaptationRate(e){this.fullscreenMaterial.adaptationRate=e}render(e,t,a,s,i){this.fullscreenMaterial.deltaTime=s,e.setRenderTarget(this.renderToScreen?null:this.renderTargetAdapted),e.render(this.scene,this.camera),this.copyPass.render(e,this.renderTargetAdapted)}},_m=`#include <tonemapping_pars_fragment>
uniform float whitePoint;
#if TONE_MAPPING_MODE == 2 || TONE_MAPPING_MODE == 3
uniform float middleGrey;
#if TONE_MAPPING_MODE == 3
uniform lowp sampler2D luminanceBuffer;
#else
uniform float averageLuminance;
#endif
vec3 Reinhard2ToneMapping(vec3 color){color*=toneMappingExposure;float l=luminance(color);
#if TONE_MAPPING_MODE == 3
float lumAvg=unpackRGBAToFloat(texture2D(luminanceBuffer,vec2(0.5)));
#else
float lumAvg=averageLuminance;
#endif
float lumScaled=(l*middleGrey)/max(lumAvg,1e-6);float lumCompressed=lumScaled*(1.0+lumScaled/(whitePoint*whitePoint));lumCompressed/=(1.0+lumScaled);return clamp(lumCompressed*color,0.0,1.0);}
#elif TONE_MAPPING_MODE == 4
#define A 0.15
#define B 0.50
#define C 0.10
#define D 0.20
#define E 0.02
#define F 0.30
vec3 Uncharted2Helper(const in vec3 x){return((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;}vec3 Uncharted2ToneMapping(vec3 color){color*=toneMappingExposure;return clamp(Uncharted2Helper(color)/Uncharted2Helper(vec3(whitePoint)),0.0,1.0);}
#endif
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
#if TONE_MAPPING_MODE == 2 || TONE_MAPPING_MODE == 3
outputColor=vec4(Reinhard2ToneMapping(inputColor.rgb),inputColor.a);
#elif TONE_MAPPING_MODE == 4
outputColor=vec4(Uncharted2ToneMapping(inputColor.rgb),inputColor.a);
#else
outputColor=vec4(toneMapping(inputColor.rgb),inputColor.a);
#endif
}`,Fm=class extends ju{constructor({blendFunction:e=Ie.SRC,adaptive:t=!1,mode:a=t?ia.REINHARD2_ADAPTIVE:ia.AGX,resolution:s=256,maxLuminance:i=4,whitePoint:o=i,middleGrey:l=.6,minLuminance:u=.01,averageLuminance:r=1,adaptationRate:c=1}={}){super("ToneMappingEffect",_m,{blendFunction:e,uniforms:new Map([["luminanceBuffer",new _e(null)],["maxLuminance",new _e(i)],["whitePoint",new _e(o)],["middleGrey",new _e(l)],["averageLuminance",new _e(r)]])}),this.renderTargetLuminance=new Ot(1,1,{minFilter:Ga,depthBuffer:!1}),this.renderTargetLuminance.texture.generateMipmaps=!0,this.renderTargetLuminance.texture.name="Luminance",this.luminancePass=new qu({renderTarget:this.renderTargetLuminance}),this.adaptiveLuminancePass=new km(this.luminancePass.texture,{minLuminance:u,adaptationRate:c}),this.uniforms.get("luminanceBuffer").value=this.adaptiveLuminancePass.texture,this.resolution=s,this.mode=a}get mode(){return Number(this.defines.get("TONE_MAPPING_MODE"))}set mode(e){if(this.mode===e)return;const a=Ur.replace(/\D+/g,"")>=168?"CineonToneMapping(texel)":"OptimizedCineonToneMapping(texel)";switch(this.defines.clear(),this.defines.set("TONE_MAPPING_MODE",e.toFixed(0)),e){case ia.LINEAR:this.defines.set("toneMapping(texel)","LinearToneMapping(texel)");break;case ia.REINHARD:this.defines.set("toneMapping(texel)","ReinhardToneMapping(texel)");break;case ia.CINEON:case ia.OPTIMIZED_CINEON:this.defines.set("toneMapping(texel)",a);break;case ia.ACES_FILMIC:this.defines.set("toneMapping(texel)","ACESFilmicToneMapping(texel)");break;case ia.AGX:this.defines.set("toneMapping(texel)","AgXToneMapping(texel)");break;case ia.NEUTRAL:this.defines.set("toneMapping(texel)","NeutralToneMapping(texel)");break;default:this.defines.set("toneMapping(texel)","texel");break}this.adaptiveLuminancePass.enabled=e===ia.REINHARD2_ADAPTIVE,this.setChanged()}getMode(){return this.mode}setMode(e){this.mode=e}get whitePoint(){return this.uniforms.get("whitePoint").value}set whitePoint(e){this.uniforms.get("whitePoint").value=e}get middleGrey(){return this.uniforms.get("middleGrey").value}set middleGrey(e){this.uniforms.get("middleGrey").value=e}get averageLuminance(){return this.uniforms.get("averageLuminance").value}set averageLuminance(e){this.uniforms.get("averageLuminance").value=e}get adaptiveLuminanceMaterial(){return this.adaptiveLuminancePass.fullscreenMaterial}getAdaptiveLuminanceMaterial(){return this.adaptiveLuminanceMaterial}get resolution(){return this.luminancePass.resolution.width}set resolution(e){const t=Math.max(0,Math.ceil(Math.log2(e))),a=Math.pow(2,t);this.luminancePass.resolution.setPreferredSize(a,a),this.adaptiveLuminanceMaterial.mipLevel1x1=t}getResolution(){return this.resolution}setResolution(e){this.resolution=e}get adaptive(){return this.mode===ia.REINHARD2_ADAPTIVE}set adaptive(e){this.mode=e?ia.REINHARD2_ADAPTIVE:ia.REINHARD2}get adaptationRate(){return this.adaptiveLuminanceMaterial.adaptationRate}set adaptationRate(e){this.adaptiveLuminanceMaterial.adaptationRate=e}get distinction(){return console.warn(this.name,"distinction was removed."),1}set distinction(e){console.warn(this.name,"distinction was removed.")}update(e,t,a){this.adaptiveLuminancePass.enabled&&(this.luminancePass.render(e,t),this.adaptiveLuminancePass.render(e,null,null,a))}initialize(e,t,a){this.adaptiveLuminancePass.initialize(e,t,a)}},Dm=`#include <common>
#include <packing>
#include <dithering_pars_fragment>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#if DEPTH_PACKING == 3201
uniform lowp sampler2D depthBuffer;
#elif defined(GL_FRAGMENT_PRECISION_HIGH)
uniform highp sampler2D depthBuffer;
#else
uniform mediump sampler2D depthBuffer;
#endif
uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;vec4 sRGBToLinear(const in vec4 value){return vec4(mix(pow(value.rgb*0.9478672986+vec3(0.0521327014),vec3(2.4)),value.rgb*0.0773993808,vec3(lessThanEqual(value.rgb,vec3(0.04045)))),value.a);}float readDepth(const in vec2 uv){
#if DEPTH_PACKING == 3201
float depth=unpackRGBAToDepth(texture2D(depthBuffer,uv));
#else
float depth=texture2D(depthBuffer,uv).r;
#endif
#if defined(USE_LOGARITHMIC_DEPTH_BUFFER) || defined(LOG_DEPTH)
float d=pow(2.0,depth*log2(cameraFar+1.0))-1.0;float a=cameraFar/(cameraFar-cameraNear);float b=cameraFar*cameraNear/(cameraNear-cameraFar);depth=a+b/d;
#elif defined(USE_REVERSED_DEPTH_BUFFER)
depth=1.0-depth;
#endif
return depth;}float getViewZ(const in float depth){
#ifdef PERSPECTIVE_CAMERA
return perspectiveDepthToViewZ(depth,cameraNear,cameraFar);
#else
return orthographicDepthToViewZ(depth,cameraNear,cameraFar);
#endif
}vec3 RGBToHCV(const in vec3 RGB){vec4 P=mix(vec4(RGB.bg,-1.0,2.0/3.0),vec4(RGB.gb,0.0,-1.0/3.0),step(RGB.b,RGB.g));vec4 Q=mix(vec4(P.xyw,RGB.r),vec4(RGB.r,P.yzx),step(P.x,RGB.r));float C=Q.x-min(Q.w,Q.y);float H=abs((Q.w-Q.y)/(6.0*C+EPSILON)+Q.z);return vec3(H,C,Q.x);}vec3 RGBToHSL(const in vec3 RGB){vec3 HCV=RGBToHCV(RGB);float L=HCV.z-HCV.y*0.5;float S=HCV.y/(1.0-abs(L*2.0-1.0)+EPSILON);return vec3(HCV.x,S,L);}vec3 HueToRGB(const in float H){float R=abs(H*6.0-3.0)-1.0;float G=2.0-abs(H*6.0-2.0);float B=2.0-abs(H*6.0-4.0);return clamp(vec3(R,G,B),0.0,1.0);}vec3 HSLToRGB(const in vec3 HSL){vec3 RGB=HueToRGB(HSL.x);float C=(1.0-abs(2.0*HSL.z-1.0))*HSL.y;return(RGB-0.5)*C+HSL.z;}FRAGMENT_HEAD void main(){FRAGMENT_MAIN_UV vec4 color0=texture2D(inputBuffer,UV);vec4 color1=vec4(0.0);FRAGMENT_MAIN_IMAGE color0.a=clamp(color0.a,0.0,1.0);gl_FragColor=color0;
#ifdef ENCODE_OUTPUT
#include <colorspace_fragment>
#endif
#include <dithering_fragment>
}`,Pm="uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;VERTEX_HEAD void main(){vUv=position.xy*0.5+0.5;VERTEX_MAIN_SUPPORT gl_Position=vec4(position.xy,1.0,1.0);}",Im=class extends wt{constructor(e,t,a,s,i=!1){super({name:"EffectMaterial",defines:{THREE_REVISION:Ur.replace(/\D+/g,""),DEPTH_PACKING:"0",ENCODE_OUTPUT:"1"},uniforms:{inputBuffer:new _e(null),depthBuffer:new _e(null),resolution:new _e(new Ne),texelSize:new _e(new Ne),cameraNear:new _e(.3),cameraFar:new _e(1e3),aspect:new _e(1),time:new _e(0)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,dithering:i}),e&&this.setShaderParts(e),t&&this.setDefines(t),a&&this.setUniforms(a),this.copyCameraSettings(s)}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){this.uniforms.depthBuffer.value=e}get depthPacking(){return Number(this.defines.DEPTH_PACKING)}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}setDepthBuffer(e,t=Go){this.depthBuffer=e,this.depthPacking=t}setShaderData(e){this.setShaderParts(e.shaderParts),this.setDefines(e.defines),this.setUniforms(e.uniforms),this.setExtensions(e.extensions)}setShaderParts(e){return this.fragmentShader=Dm.replace(Xe.FRAGMENT_HEAD,e.get(Xe.FRAGMENT_HEAD)||"").replace(Xe.FRAGMENT_MAIN_UV,e.get(Xe.FRAGMENT_MAIN_UV)||"").replace(Xe.FRAGMENT_MAIN_IMAGE,e.get(Xe.FRAGMENT_MAIN_IMAGE)||""),this.vertexShader=Pm.replace(Xe.VERTEX_HEAD,e.get(Xe.VERTEX_HEAD)||"").replace(Xe.VERTEX_MAIN_SUPPORT,e.get(Xe.VERTEX_MAIN_SUPPORT)||""),this.needsUpdate=!0,this}setDefines(e){for(const t of e.entries())this.defines[t[0]]=t[1];return this.needsUpdate=!0,this}setUniforms(e){for(const t of e.entries())this.uniforms[t[0]]=t[1];return this}setExtensions(e){this.extensions={};for(const t of e)this.extensions[t]=!0;return this}get encodeOutput(){return this.defines.ENCODE_OUTPUT!==void 0}set encodeOutput(e){this.encodeOutput!==e&&(e?this.defines.ENCODE_OUTPUT="1":delete this.defines.ENCODE_OUTPUT,this.needsUpdate=!0)}isOutputEncodingEnabled(e){return this.encodeOutput}setOutputEncodingEnabled(e){this.encodeOutput=e}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}setDeltaTime(e){this.uniforms.time.value+=e}adoptCameraSettings(e){this.copyCameraSettings(e)}copyCameraSettings(e){e&&(this.uniforms.cameraNear.value=e.near,this.uniforms.cameraFar.value=e.far,e instanceof Br?this.defines.PERSPECTIVE_CAMERA="1":delete this.defines.PERSPECTIVE_CAMERA,this.needsUpdate=!0)}setSize(e,t){const a=this.uniforms;a.resolution.value.set(e,t),a.texelSize.value.set(1/e,1/t),a.aspect.value=e/t}static get Section(){return Xe}};function Qc(e,t,a){for(const s of t){const i="$1"+e+s.charAt(0).toUpperCase()+s.slice(1),o=new RegExp("([^\\.])(\\b"+s+"\\b)","g");for(const l of a.entries())l[1]!==null&&a.set(l[0],l[1].replace(o,i))}}function Cm(e,t,a){let s=t.getFragmentShader(),i=t.getVertexShader();const o=s!==void 0&&/mainImage/.test(s),l=s!==void 0&&/mainUv/.test(s);if(a.attributes|=t.getAttributes(),s===void 0)throw new Error(`Missing fragment shader (${t.name})`);if(l&&(a.attributes&Ps.CONVOLUTION)!==0)throw new Error(`Effects that transform UVs are incompatible with convolution effects (${t.name})`);if(!o&&!l)throw new Error(`Could not find mainImage or mainUv function (${t.name})`);{const u=/\w+\s+(\w+)\([\w\s,]*\)\s*{/g,r=a.shaderParts;let c=r.get(Xe.FRAGMENT_HEAD)||"",h=r.get(Xe.FRAGMENT_MAIN_UV)||"",v=r.get(Xe.FRAGMENT_MAIN_IMAGE)||"",x=r.get(Xe.VERTEX_HEAD)||"",y=r.get(Xe.VERTEX_MAIN_SUPPORT)||"";const M=new Set,E=new Set;if(l&&(h+=`	${e}MainUv(UV);
`,a.uvTransformation=!0),i!==null&&/mainSupport/.test(i)){const b=/mainSupport *\([\w\s]*?uv\s*?\)/.test(i);y+=`	${e}MainSupport(`,y+=b?`vUv);
`:`);
`;for(const F of i.matchAll(/(?:varying\s+\w+\s+([\S\s]*?);)/g))for(const A of F[1].split(/\s*,\s*/))a.varyings.add(A),M.add(A),E.add(A);for(const F of i.matchAll(u))E.add(F[1])}for(const b of s.matchAll(u))E.add(b[1]);for(const b of t.defines.keys())E.add(b.replace(/\([\w\s,]*\)/g,""));for(const b of t.uniforms.keys())E.add(b);E.delete("while"),E.delete("for"),E.delete("if"),t.uniforms.forEach((b,F)=>a.uniforms.set(e+F.charAt(0).toUpperCase()+F.slice(1),b)),t.defines.forEach((b,F)=>a.defines.set(e+F.charAt(0).toUpperCase()+F.slice(1),b));const g=new Map([["fragment",s],["vertex",i]]);Qc(e,E,a.defines),Qc(e,E,g),s=g.get("fragment"),i=g.get("vertex");const p=t.blendMode;if(a.blendModes.set(p.blendFunction,p),o){t.inputColorSpace!==null&&t.inputColorSpace!==a.colorSpace&&(v+=t.inputColorSpace===ot?`color0 = sRGBTransferOETF(color0);
	`:`color0 = sRGBToLinear(color0);
	`),t.outputColorSpace!==Pa?a.colorSpace=t.outputColorSpace:t.inputColorSpace!==null&&(a.colorSpace=t.inputColorSpace);const b=/MainImage *\([\w\s,]*?depth[\w\s,]*?\)/;v+=`${e}MainImage(color0, UV, `,(a.attributes&Ps.DEPTH)!==0&&b.test(s)&&(v+="depth, ",a.readDepth=!0),v+=`color1);
	`;const F=e+"BlendOpacity";a.uniforms.set(F,p.opacity),v+=`color0 = blend${p.blendFunction}(color0, color1, ${F});

	`,c+=`uniform float ${F};

`}if(c+=s+`
`,i!==null&&(x+=i+`
`),r.set(Xe.FRAGMENT_HEAD,c),r.set(Xe.FRAGMENT_MAIN_UV,h),r.set(Xe.FRAGMENT_MAIN_IMAGE,v),r.set(Xe.VERTEX_HEAD,x),r.set(Xe.VERTEX_MAIN_SUPPORT,y),t.extensions!==null)for(const b of t.extensions)a.extensions.add(b)}}var Lm=class extends ua{constructor(e,...t){super("EffectPass"),this.fullscreenMaterial=new Im(null,null,null,e),this.listener=a=>this.handleEvent(a),this.effects=[],this.setEffects(t),this.skipRendering=!1,this.minTime=1,this.maxTime=Number.POSITIVE_INFINITY,this.timeScale=1}set mainScene(e){for(const t of this.effects)t.mainScene=e}set mainCamera(e){this.fullscreenMaterial.copyCameraSettings(e);for(const t of this.effects)t.mainCamera=e}get encodeOutput(){return this.fullscreenMaterial.encodeOutput}set encodeOutput(e){this.fullscreenMaterial.encodeOutput=e}get dithering(){return this.fullscreenMaterial.dithering}set dithering(e){const t=this.fullscreenMaterial;t.dithering=e,t.needsUpdate=!0}setEffects(e){for(const t of this.effects)t.removeEventListener("change",this.listener);this.effects=e.sort((t,a)=>a.attributes-t.attributes);for(const t of this.effects)t.addEventListener("change",this.listener)}updateMaterial(){const e=new kf;let t=0;for(const l of this.effects)if(l.blendMode.blendFunction===Ie.DST)e.attributes|=l.getAttributes()&Ps.DEPTH;else{if((e.attributes&l.getAttributes()&Ps.CONVOLUTION)!==0)throw new Error(`Convolution effects cannot be merged (${l.name})`);Cm("e"+t++,l,e)}let a=e.shaderParts.get(Xe.FRAGMENT_HEAD),s=e.shaderParts.get(Xe.FRAGMENT_MAIN_IMAGE),i=e.shaderParts.get(Xe.FRAGMENT_MAIN_UV);const o=/\bblend\b/g;for(const l of e.blendModes.values())a+=l.getShaderCode().replace(o,`blend${l.blendFunction}`)+`
`;(e.attributes&Ps.DEPTH)!==0?(e.readDepth&&(s=`float depth = readDepth(UV);

	`+s),this.needsDepthTexture=this.getDepthTexture()===null):this.needsDepthTexture=!1,e.colorSpace===ot&&(s+=`color0 = sRGBToLinear(color0);
	`),e.uvTransformation?(i=`vec2 transformedUv = vUv;
`+i,e.defines.set("UV","transformedUv")):e.defines.set("UV","vUv"),e.shaderParts.set(Xe.FRAGMENT_HEAD,a),e.shaderParts.set(Xe.FRAGMENT_MAIN_IMAGE,s),e.shaderParts.set(Xe.FRAGMENT_MAIN_UV,i);for(const[l,u]of e.shaderParts)u!==null&&e.shaderParts.set(l,u.trim().replace(/^#/,`
#`));this.skipRendering=t===0,this.needsSwap=!this.skipRendering,this.fullscreenMaterial.setShaderData(e)}recompile(){this.updateMaterial()}getDepthTexture(){return this.fullscreenMaterial.depthBuffer}setDepthTexture(e,t=Go){this.fullscreenMaterial.depthBuffer=e,this.fullscreenMaterial.depthPacking=t;for(const a of this.effects)a.setDepthTexture(e,t)}render(e,t,a,s,i){for(const o of this.effects)o.update(e,t,s);if(!this.skipRendering||this.renderToScreen){const o=this.fullscreenMaterial;o.inputBuffer=t.texture,o.time+=s*this.timeScale,e.setRenderTarget(this.renderToScreen?null:a),e.render(this.scene,this.camera)}}setSize(e,t){this.fullscreenMaterial.setSize(e,t);for(const a of this.effects)a.setSize(e,t)}initialize(e,t,a){this.renderer=e;for(const s of this.effects)s.initialize(e,t,a);this.updateMaterial(),a!==void 0&&a!==Ut&&(this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}dispose(){super.dispose();for(const e of this.effects)e.removeEventListener("change",this.listener),e.dispose()}handleEvent(e){switch(e.type){case"change":this.recompile();break}}};const Nm={exposure:1,bloomThreshold:1.7,bloomSmoothing:.3,bloomIntensity:.85,bloomRadius:.7,bloomLevels:7,msaaSamples:4},Zu=2;function Jc(){const e=typeof window<"u"&&window.devicePixelRatio||1;return Math.min(Zu,Math.max(1,e))}class zm{constructor(t,a,s,i={}){k(this,"composer");k(this,"renderPass");k(this,"bloom");k(this,"toneMapping");k(this,"finalPass");k(this,"renderer");k(this,"cssWidth",1);k(this,"cssHeight",1);k(this,"pixelRatio",1);const o={...Nm,...i};this.renderer=t,t.toneMapping=Ih,t.toneMappingExposure=o.exposure,t.outputColorSpace=ot,this.composer=new Af(t,{frameBufferType:Da,multisampling:o.msaaSamples,depthBuffer:!0,stencilBuffer:!1}),this.renderPass=new Em(a,s),this.composer.addPass(this.renderPass),this.bloom=new Tm({blendFunction:Ie.ADD,mipmapBlur:!0,luminanceThreshold:o.bloomThreshold,luminanceSmoothing:o.bloomSmoothing,intensity:o.bloomIntensity,radius:o.bloomRadius,levels:o.bloomLevels}),this.toneMapping=new Fm({mode:ia.ACES_FILMIC}),this.finalPass=new Lm(s,this.bloom,this.toneMapping),this.finalPass.dithering=!0,this.composer.addPass(this.finalPass)}insertScenePass(t){const a=this.composer.passes.indexOf(this.finalPass);this.composer.addPass(t,a>=0?a:void 0)}get exposure(){return this.renderer.toneMappingExposure}set exposure(t){this.renderer.toneMappingExposure=Math.max(.01,t)}get drawingBufferHeight(){return Math.max(1,Math.round(this.cssHeight*this.pixelRatio))}setSize(t,a,s){const i=Math.max(1,Math.floor(t)),o=Math.max(1,Math.floor(a)),l=Math.min(Zu,Math.max(1,s));return i===this.cssWidth&&o===this.cssHeight&&Math.abs(l-this.pixelRatio)<.001?!1:(this.cssWidth=i,this.cssHeight=o,this.pixelRatio=l,this.renderer.setPixelRatio(l),this.composer.setSize(i,o,!1),!0)}render(t){this.composer.render(t)}dispose(){this.composer.dispose()}}const Um=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,Bm=`
precision highp float;
uniform sampler2D uDem;
uniform float uDemRes;
uniform vec2 uElevRange;
uniform float uReliefScale; // world units per metre of elevation
uniform vec2 uSlabSize;     // world size of the slab (east-west, north-south)
uniform vec3 uSunDir;      // stage world space, pointing toward the sun
uniform float uPenumbra;   // larger = sharper edge

varying vec2 vUv;

float demHeight(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0), vec2(1.0)) * (uDemRes - 1.0);
  vec2 i0 = floor(c);
  vec2 f = c - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(uDemRes - 1.0));
  float inv = 1.0 / uDemRes;
  float h00 = texture2D(uDem, (i0 + 0.5) * inv).r;
  float h10 = texture2D(uDem, (vec2(i1.x, i0.y) + 0.5) * inv).r;
  float h01 = texture2D(uDem, (vec2(i0.x, i1.y) + 0.5) * inv).r;
  float h11 = texture2D(uDem, (i1 + 0.5) * inv).r;
  float elev = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  float span = max(350.0, uElevRange.y - uElevRange.x);
  return clamp(elev - uElevRange.x, 0.0, span * 1.15) * uReliefScale;
}

// Elevation in metres, as the data holds it
float demElev(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0), vec2(1.0)) * (uDemRes - 1.0);
  vec2 i0 = floor(c);
  vec2 f = c - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(uDemRes - 1.0));
  float inv = 1.0 / uDemRes;
  float h00 = texture2D(uDem, (i0 + 0.5) * inv).r;
  float h10 = texture2D(uDem, (vec2(i1.x, i0.y) + 0.5) * inv).r;
  float h01 = texture2D(uDem, (vec2(i0.x, i1.y) + 0.5) * inv).r;
  float h11 = texture2D(uDem, (i1 + 0.5) * inv).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// Level ground: within most of a post in every direction the elevation changes by a few
// centimetres at most. The elevation sources in use level their lakes, and nothing else in
// them is that level, so this is where a lake is. 1 on level ground, 0 elsewhere.
float levelGround(vec2 uv) {
  float reach = 0.7 / (uDemRes - 1.0);
  float e0 = demElev(uv);
  float worst = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    worst = max(worst, abs(demElev(uv + vec2(cos(a), sin(a)) * reach) - e0));
  }
  return 1.0 - smoothstep(0.05, 0.12, worst);
}

void main() {
  vec3 sun = normalize(uSunDir);
  float horiz = max(length(sun.xz), 1e-4);
  // uv step and height gain per world unit travelled horizontally toward the sun
  vec2 uvPerUnit = vec2(sun.x / uSlabSize.x, -sun.z / uSlabSize.y) / horiz;
  float risePerUnit = sun.y / horiz;

  float y0 = demHeight(vUv) + 0.004;
  float maxRelief = max(350.0, uElevRange.y - uElevRange.x) * 1.15 * uReliefScale;
  // The ray is clear of all terrain once it is above the highest possible relief
  float tMax = min(22.0, (maxRelief - y0) / max(risePerUnit, 1e-3));

  float lit = 1.0;
  const int STEPS = 112;
  for (int i = 1; i <= STEPS; i++) {
    float s = float(i) / float(STEPS);
    float t = tMax * s * (0.35 + 0.65 * s);
    vec2 uv = vUv + uvPerUnit * t;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float clearance = (y0 + risePerUnit * t) - demHeight(uv);
    lit = min(lit, uPenumbra * clearance / max(t, 0.02) + 0.5);
    if (lit <= 0.0) break;
  }
  lit = smoothstep(0.0, 1.0, clamp(lit, 0.0, 1.0));
  gl_FragColor = vec4(lit, levelGround(vUv), lit, 1.0);
}
`;class Om{constructor(t){k(this,"renderer");k(this,"scene",new ci);k(this,"camera",new Ir(-1,1,1,-1,0,1));k(this,"material");k(this,"quad");this.renderer=t,this.material=new wt({vertexShader:Um,fragmentShader:Bm,uniforms:{uDem:{value:null},uDemRes:{value:512},uElevRange:{value:new Ne(0,1e3)},uReliefScale:{value:.001},uSlabSize:{value:new Ne(14.8,10.8)},uSunDir:{value:new B(0,1,0)},uPenumbra:{value:9}},depthTest:!1,depthWrite:!1}),this.quad=new pa(new Ui(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}bake(t,a,s,i,o,l,u,r,c=1024){const h=new Ot(c,c,{format:Rt,type:Ut,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1});h.texture.wrapS=Ve,h.texture.wrapT=Ve,h.texture.colorSpace=Pa;const v=this.material.uniforms;v.uDem.value=t,v.uDemRes.value=a,v.uElevRange.value.set(s,i),v.uReliefScale.value=o,v.uSlabSize.value.set(l,u),v.uSunDir.value.copy(r);const x=this.renderer.getRenderTarget(),y=this.renderer.autoClear;return this.renderer.autoClear=!0,this.renderer.setRenderTarget(h),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(x),this.renderer.autoClear=y,h}dispose(){this.quad.geometry.dispose(),this.material.dispose()}}function Di(e,t,a,s){const i=Math.floor(e.length/3),o=new Int32Array(i);for(let p=0;p<i;p++)o[p]=p;const l=p=>{for(;o[p]!==p;)o[p]=o[o[p]],p=o[p];return p},u=(p,b)=>{const F=l(p),A=l(b);F!==A&&(o[Math.max(F,A)]=Math.min(F,A))},r=new Int32Array(t*a).fill(-1),c=[],h=p=>Math.min(t-1,Math.max(0,p)),v=p=>Math.min(a-1,Math.max(0,p));for(let p=0;p<i;p++){const b=e[p*3],F=e[p*3+1],A=s?s[p*2]:0,z=s?s[p*2+1]:0,D=h(Math.floor((b-A)*t)),T=h(Math.max(Math.floor(b*t),Math.ceil((b+A)*t)-1)),L=v(Math.floor((F-z)*a)),U=v(Math.max(Math.floor(F*a),Math.ceil((F+z)*a)-1));for(let K=L;K<=U;K++)for(let G=D;G<=T;G++){const X=K*t+G;r[X]<0?(r[X]=p,c.push(X)):u(p,r[X])}}for(const p of c){const b=Math.floor(p/t),F=p-b*t,A=r[p];if(F+1<t&&r[p+1]>=0&&u(A,r[p+1]),b+1<a){const z=p+t;r[z]>=0&&u(A,r[z]),F>0&&r[z-1]>=0&&u(A,r[z-1]),F+1<t&&r[z+1]>=0&&u(A,r[z+1])}}const x=new Map,y=new Map;for(let p=0;p<i;p++){const b=l(p);x.set(b,(x.get(b)??0)+1),y.set(b,(y.get(b)??0)+e[p*3+2])}const M=[...x.keys()].sort((p,b)=>x.get(b)-x.get(p)||y.get(b)-y.get(p)||p-b),E=new Map;M.forEach((p,b)=>E.set(p,b));const g=new Uint16Array(i);for(let p=0;p<i;p++)g[p]=Math.min(65535,E.get(l(p)));return{patchOf:g,sizes:M.map(p=>x.get(p))}}const Hm="/isogon/assets/draco_decoder-Z1_iN-Ht.wasm",Gm="/isogon/assets/draco_wasm_wrapper-fZCQGLGb.js",eu=Math.PI/180,Km=1.05,ir=40,Wm=6.2,or=3,Vm=.5,Ym=.16,Vs=33,$m={modis:3.5,viirs:4.1},Xm={modis:new Uo(1,.5,.24),viirs:new Uo(.4,.84,1)},jm={modis:Oo,viirs:ei},qm={terra:new jn(0,0,0),aqua:new jn(Math.PI/2,0,0),suomi_npp:new jn(0,0,Math.PI/2)},Zm="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";function Qm(e){const t=e.toUpperCase();return t.includes("TERRA")?["terra"]:t.includes("AQUA")?["aqua"]:t.includes("NOAA")||t.includes("J1")||t.includes("J2")?["noaa_20","suomi_npp"]:["suomi_npp"]}function Jm(e,t){const a=Math.sin(e*127.1+t*311.7)*43758.5453;return a-Math.floor(a)}function e0(){const a=new Uint8Array(65536);for(let i=0;i<64;i++)for(let o=0;o<256;o++){const l=o%16,u=i%16,r=l===0||u===0,c=l===8,h=.86+.14*Jm(Math.floor(o/16),Math.floor(i/16)),v=(i*256+o)*4;a[v]=Math.round((r?118:c?40:7)*h),a[v+1]=Math.round((r?124:c?52:14)*h),a[v+2]=Math.round((r?138:c?88:46)*h),a[v+3]=255}const s=new aa(a,256,64,Rt,Ut);return s.colorSpace=ot,s.wrapS=ai,s.wrapT=ai,s.magFilter=ze,s.minFilter=Ga,s.generateMipmaps=!0,s.anisotropy=8,s.needsUpdate=!0,s}function t0(e){const t=new ci,a=new wt({side:Qs,depthWrite:!1,vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        vec3 space = vec3(0.012, 0.016, 0.026);
        // Sunlit Earth from orbit: ocean and cloud average, brighter toward the limb
        vec3 earth = mix(vec3(0.30, 0.42, 0.58), vec3(0.62, 0.68, 0.74), smoothstep(-1.0, -0.15, y) * 0.6);
        vec3 limb = vec3(0.55, 0.80, 1.25);
        vec3 col = mix(earth, space, smoothstep(-0.07, 0.05, y));
        col += limb * exp(-abs(y + 0.02) * 22.0) * 1.1;
        gl_FragColor = vec4(col, 1.0);
      }
    `}),s=new pa(new Pu(10,32,16),a);t.add(s);const i=new Ch(e),o=i.fromScene(t,.03);return i.dispose(),s.geometry.dispose(),a.dispose(),o}function nr(e,t,a){e.onBeforeCompile=s=>{s.uniforms.uFoilScale={value:t},s.uniforms.uFoilStrength={value:a},s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vFoilPos;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vFoilPos = position;`),s.fragmentShader=s.fragmentShader.replace("#include <common>",`#include <common>
        varying vec3 vFoilPos;
        uniform float uFoilScale;
        uniform float uFoilStrength;
        uniform mat3 normalMatrix;
        vec3 foilHash(vec3 p) {
          p = fract(p * vec3(0.1031, 0.1030, 0.0973));
          p += dot(p, p.yxz + 33.33);
          return fract((p.xxy + p.yxx) * p.zyx);
        }
        // Tilt of the facet that holds p
        vec3 foilFacet(vec3 p) {
          vec3 i = floor(p);
          vec3 f = p - i;
          float best = 8.0;
          vec3 tilt = vec3(0.0);
          for (int z = -1; z <= 1; z++) {
            for (int y = -1; y <= 1; y++) {
              for (int x = -1; x <= 1; x++) {
                vec3 g = vec3(float(x), float(y), float(z));
                vec3 r = g + foilHash(i + g) - f;
                float d = dot(r, r);
                if (d < best) {
                  best = d;
                  tilt = foilHash(i + g + 17.0) * 2.0 - 1.0;
                }
              }
            }
          }
          return tilt;
        }`).replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
        {
          vec3 fp = vFoilPos * uFoilScale;
          float fw = max(length(dFdx(fp)), length(dFdy(fp)));
          float fine = 1.0 - smoothstep(0.16, 0.5, fw);
          vec3 tilt = foilFacet(fp) + 0.45 * foilFacet(fp * 2.7 + 5.1) * (1.0 - smoothstep(0.06, 0.18, fw));
          vec3 tv = normalize(normalMatrix * tilt) * length(tilt);
          tv -= dot(tv, normal) * normal;
          normal = normalize(normal + uFoilStrength * fine * tv);
          roughnessFactor = min(1.0, roughnessFactor + 0.2 * (1.0 - fine));
        }`)},e.customProgramCacheKey=()=>"isogon-foil"}class a0{constructor(){k(this,"cells",e0())}make(t,a={}){const s=a.map??null,i=new Hh({flatShading:a.flat===!0}),o=a.crinkleScale??26;switch(t){case"foilGold":i.color.setRGB(1,.62,.18),i.metalness=1,i.roughness=.3,nr(i,o,.24);break;case"foilSilver":i.color.setRGB(.9,.91,.93),i.metalness=1,i.roughness=.32,nr(i,o,.2);break;case"foilBlack":i.color.setRGB(.035,.035,.04),i.metalness=.75,i.roughness=.42,nr(i,o,.22);break;case"solar":i.color.setRGB(1,1,1),i.metalness=.55,i.roughness=.22,i.map=s??this.cells,s&&i.color.setRGB(.42,.46,.62);break;case"radiator":i.color.setRGB(.84,.87,.92),i.metalness=.92,i.roughness=.16;break;case"paintWhite":i.color.setRGB(.86,.87,.88),i.metalness=.05,i.roughness=.55;break;case"paintGrey":i.color.setRGB(.3,.31,.33),i.metalness=.45,i.roughness=.5;break;case"dark":i.color.setRGB(.03,.032,.036),i.metalness=.6,i.roughness=.5;break}return s&&t!=="solar"&&(i.map=s,i.color.setRGB(1,1,1),(t==="foilGold"||t==="foilSilver")&&(i.metalness=.82)),i}dispose(){this.cells.dispose()}}function tu(e){const t=e.toLowerCase();return t.includes("gold")?"foilGold":t.includes("silver")?"foilSilver":t.includes("krinkle")||t.includes("kapton")?"foilBlack":t.includes("solar")||t.includes("shiny_panel")?"solar":t==="side panels"?"radiator":t.includes("dish")?"paintWhite":t.includes("thruster")?"dark":t.includes("hardware")||t.includes("grey")||t.includes("gray")?"paintGrey":null}function s0(e){const t=e.getAttribute("position");if(!t||e.getAttribute("uv"))return;e.computeBoundingBox();const a=e.boundingBox,s=a.getSize(new B),i=[0,1,2].sort((c,h)=>s.getComponent(h)-s.getComponent(c)),[o,l]=i,u=Math.max(s.getComponent(l)/12,1e-6),r=new Float32Array(t.count*2);for(let c=0;c<t.count;c++)r[c*2]=(t.getComponent(c,o)-a.min.getComponent(o))/(u*16),r[c*2+1]=(t.getComponent(c,l)-a.min.getComponent(l))/(u*4);e.setAttribute("uv",new Ha(r,2))}function i0(e,t){const a=new Iu().setFromObject(e),i=26/Math.max(...a.getSize(new B).toArray(),1e-6),o=new Map,l=new Set;e.traverse(u=>{const r=u;if(!r.isMesh)return;const c=!r.geometry.getAttribute("normal"),h=v=>{var b;const x=o.get(v);if(x)return x;const y=v,M=tu(v.name),E=(b=y.map)==null?void 0:b.image,g=y.map&&r.geometry.getAttribute("uv")&&((E==null?void 0:E.width)??0)>4?y.map:null;let p=v;return M?p=t.make(M,{flat:c,map:g,crinkleScale:i}):y.isMeshStandardMaterial&&!g&&(p=t.make("paintGrey",{flat:c})),p!==v&&(p.name=v.name,l.add(v),y.map&&y.map!==g&&y.map.dispose()),o.set(v,p),p};Array.isArray(r.material)?r.material=r.material.map(h):(tu(r.material.name)==="solar"&&s0(r.geometry),r.material=h(r.material))});for(const u of l)u.dispose()}function au(e,t){const a=new si,s=t.make("foilGold"),i=t.make("foilSilver"),o=t.make("paintWhite"),l=t.make("dark"),u=t.make("solar"),r=(x,y,M,E,g)=>{const p=new pa(x,y);return p.position.set(M,E,g),a.add(p),p},c=e==="modis"?.42:.32;r(new _i(c,.17,.18),s,0,0,0),r(new _i(c*.86,.035,.15),i,0,-.1,0),r(new qn(.045,.055,.07,24),l,c*.18,-.145,0),r(new _i(.1,.05,.1),o,-c*.25,-.135,0),r(new _i(c*.5,.012,.14),o,-c*.1,.092,0),r(new qn(.006,.006,.1,8),i,c*.3,.13,.04);const h=r(new Gh(.05,.03,24,1,!0),o,c*.3,.19,.04);h.rotation.x=Math.PI,h.material.side=_s;const v=r(new qn(.007,.007,.16,8),i,0,0,.17);v.rotation.x=Math.PI/2;for(let x=0;x<3;x++){const y=new _i(.2,.008,.2),M=y.getAttribute("uv");for(let g=0;g<M.count;g++)M.setXY(g,M.getX(g)*6/16,M.getY(g)*6/4);const E=r(y,u,0,0,.36+x*.208);E.rotation.z=-.35}return a}function rr(e,t){const a=new si;t&&e.rotation.copy(t),a.add(e),a.updateMatrixWorld(!0);const s=new Iu().setFromObject(a),i=s.getSize(new B),o=s.getCenter(new B),l=Math.max(i.x,i.y,i.z,1e-6);e.position.sub(o);const u=new si;return u.add(a),u.scale.setScalar(Km/l),u}function lr(e){const t=new Set,a=new Set,s=new Set;e.traverse(i=>{const o=i;o.geometry&&t.add(o.geometry);const l=Array.isArray(o.material)?o.material:o.material?[o.material]:[];for(const u of l){a.add(u);const r=u;for(const c of[r.map,r.normalMap,r.roughnessMap,r.metalnessMap,r.emissiveMap,r.aoMap])c&&s.add(c)}});for(const i of t)i.dispose();for(const i of a)i.dispose();for(const i of s){const o=i.image;o&&typeof o.close=="function"&&o.close(),i.dispose()}}function cr(e){const t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}class o0{constructor(t){k(this,"group",new si);k(this,"strips",{modis:{alongTrackKm:0,strength:0},viirs:{alongTrackKm:0,strength:0}});k(this,"look",new a0);k(this,"templates",new Map);k(this,"rigs",[]);k(this,"draco",null);k(this,"disposed",!1);k(this,"pos",new B);k(this,"xAxis",new B);k(this,"yAxis",new B(0,1,0));k(this,"zAxis",new B);k(this,"basis",new qs);this.templates.set("procedural-modis",rr(au("modis",this.look),null)),this.templates.set("procedural-viirs",rr(au("viirs",this.look),null));for(let a=0;a<t;a++)this.rigs.push(this.buildRig(a))}buildRig(t){const a=new si;a.visible=!1;const s=new si;a.add(s);const i=M=>{const E=new Lr;return E.setAttribute("position",new Ha(new Float32Array(M*3),3)),E.setAttribute("color",new Ha(new Float32Array(M*4),4)),E},o=()=>new Oh({transparent:!0,opacity:0,depthWrite:!1,vertexColors:!0}),l=o(),u=new Lh(i(ir),l),r=o(),c=new Nh(i(6),r);for(const M of[u,c])M.frustumCulled=!1,a.add(M);const h=i(Vs+1),v=[];for(let M=0;M<Vs-1;M++)v.push(0,1+M,2+M);h.setIndex(v);const x=new zh({transparent:!0,opacity:0,side:_s,depthWrite:!1,blending:Uh,vertexColors:!0}),y=new pa(h,x);return y.frustumCulled=!1,a.add(y),this.group.add(a),{root:a,craft:s,craftKey:"",along:-1.4+t*.9,passKey:"",track:u,trackMat:l,rays:c,raysMat:r,fan:y,fanMat:x}}async loadModels(t){const a=t.endsWith("/")?t:`${t}/`;let s=[];try{const c=await fetch(`${a}models/spacecraft/manifest.json`);if(!c.ok)return;const h=await c.json();s=Array.isArray(h.models)?h.models:[]}catch{return}const[{GLTFLoader:i},{DRACOLoader:o}]=await Promise.all([Ec(()=>import("./GLTFLoader-C8Ag2Ruc.js"),__vite__mapDeps([0,1])),Ec(()=>import("./DRACOLoader-LNaB3iNp.js"),__vite__mapDeps([2,1]))]);if(this.disposed)return;const l=new Bh;l.setURLModifier(c=>/\.tga(\?|$)/i.test(c)?Zm:c);const u=new o(l);u.setDecoderPath({js:Gm,wasm:Hm}),this.draco=u;const r=new i(l);r.setDRACOLoader(u),await Promise.all(s.map(async c=>{if(!(typeof c.id!="string"||typeof c.url!="string"))try{const h=await r.loadAsync(`${a}${c.url.replace(/^\/+/,"")}`);if(this.disposed){lr(h.scene);return}i0(h.scene,this.look),this.templates.set(c.id,rr(h.scene,qm[c.id]??null))}catch{}}))}resolveTemplate(t){for(const s of Qm(t.sensorLabel)){const i=this.templates.get(s);if(i)return{key:s,template:i}}const a=`procedural-${t.family}`;return{key:a,template:this.templates.get(a)}}update(t,a){this.strips.modis.strength=0,this.strips.viirs.strength=0;const s=a.sky>.004||a.strip>.004,[i,o,l]=a.unitsPerMetre,u=a.slabWidth*.5,r=a.slabDepth*.5,c=a.sampleTerrainY(.5,.5);for(let h=0;h<this.rigs.length;h++){const v=this.rigs[h],x=t[h];if(!x||!s){v.root.visible=!1;continue}v.root.visible=!0;const{key:y,template:M}=this.resolveTemplate(x);v.craftKey!==y&&(v.craft.clear(),v.craft.add(M.clone(!0)),v.craftKey=y);const E=jm[x.family],g=x.azimuthDeg*eu,p=Math.min(E.maxScanDeg,Math.abs(x.scanAngleDeg))*eu,b=(ui+E.altitudeKm)/ui,F=Math.min(.999,b*Math.sin(p)),A=Math.sqrt(1-F*F),z=Math.sin(g),D=-Math.cos(g);let T=z*F*i,L=A*o,U=D*F*l;const K=Math.hypot(T,L,U)||1,G=$m[x.family];T=T/K*G,L=L/K*G,U=U/K*G;let X=Math.cos(g),ue=Math.sin(g);const oe=x.orbitNode?x.orbitNode==="descending":x.sensorLabel.toUpperCase().includes("TERRA");ue>0!==oe&&(X=-X,ue=-ue);const Te=`${x.sensorLabel}|${x.azimuthDeg}|${x.scanAngleDeg}|${x.orbitNode??""}`;v.passKey!==Te&&(v.passKey!==""&&(v.along=-.6),v.passKey=Te),v.along+=Ym*Math.min(.1,Math.max(0,a.dtSec)),v.along>or&&(v.along-=2*or);const ye=v.along,ve=cr((or-Math.abs(ye))/Vm),he=this.pos.set(T+X*ye,c+L,U+ue*ye);this.xAxis.set(X,0,ue),this.zAxis.crossVectors(this.xAxis,this.yAxis).normalize(),this.basis.makeBasis(this.xAxis,this.yAxis,this.zAxis),v.craft.quaternion.setFromRotationMatrix(this.basis),v.craft.position.copy(he);const ht=cr(a.sky*1.15)*ve;v.craft.visible=ht>.002,v.craft.scale.setScalar(Math.max(ht,1e-4));const fe=Xm[x.family],te=v.track.geometry.getAttribute("position"),Q=v.track.geometry.getAttribute("color");for(let Fe=0;Fe<ir;Fe++){const Le=Fe/(ir-1)*2-1,ct=Le*Wm;te.setXYZ(Fe,T+X*ct,c+L,U+ue*ct);const Ka=cr((1-Math.abs(Le))/.3),Ia=ye-ct,Wa=Ia>=0?Math.exp(-Ia/1.6):Math.exp(Ia/.12);Q.setXYZW(Fe,fe.r,fe.g,fe.b,Ka*(.3+.7*Wa*ve))}te.needsUpdate=!0,Q.needsUpdate=!0,v.trackMat.opacity=.8*a.sky,v.track.visible=a.sky>.004;const f=a.sky*ve,at=a.strip*ve;let At=-1e9,Ht=1e9;if(Math.abs(z)>1e-5){const Fe=(he.x-u)/z,Le=(he.x+u)/z;At=Math.max(At,Math.min(Fe,Le)),Ht=Math.min(Ht,Math.max(Fe,Le))}else Math.abs(he.x)>u&&(Ht=-1e9);if(Math.abs(D)>1e-5){const Fe=(he.z-r)/D,Le=(he.z+r)/D;At=Math.max(At,Math.min(Fe,Le)),Ht=Math.min(Ht,Math.max(Fe,Le))}else Math.abs(he.z)>r&&(Ht=-1e9);if(x.groundStrip&&at>.004){const Fe=this.strips[x.family],Le=he.x/(i*1e3),ct=he.z/(l*1e3);Fe.alongTrackKm=Le*Math.cos(g)+ct*Math.sin(g),Fe.strength=at}const Nt=f>.004&&Ht>At+.05;if(v.rays.visible=Nt,v.fan.visible=Nt,!Nt)continue;const Gt=v.fan.geometry.getAttribute("position"),va=v.fan.geometry.getAttribute("color"),jt=he.y-.04;Gt.setXYZ(0,he.x,jt,he.z),va.setXYZW(0,fe.r,fe.g,fe.b,1);for(let Fe=0;Fe<Vs;Fe++){const Le=At+(Ht-At)*Fe/(Vs-1),ct=he.x-z*Le,Ka=he.z-D*Le,Ia=_.clamp(ct/a.slabWidth+.5,0,1),Wa=_.clamp(.5-Ka/a.slabDepth,0,1);Gt.setXYZ(Fe+1,ct,a.sampleTerrainY(Ia,Wa)+.02,Ka),va.setXYZW(Fe+1,fe.r,fe.g,fe.b,.12)}Gt.needsUpdate=!0,va.needsUpdate=!0,v.fanMat.opacity=.04*f;const Ze=v.rays.geometry.getAttribute("position"),lt=v.rays.geometry.getAttribute("color"),qt=[1,1+Math.floor(Vs/2),Vs];for(let Fe=0;Fe<3;Fe++)Ze.setXYZ(Fe*2,he.x,jt,he.z),Ze.setXYZ(Fe*2+1,Gt.getX(qt[Fe]),Gt.getY(qt[Fe]),Gt.getZ(qt[Fe])),lt.setXYZW(Fe*2,fe.r,fe.g,fe.b,1),lt.setXYZW(Fe*2+1,fe.r,fe.g,fe.b,Fe===1?.25:.5);Ze.needsUpdate=!0,lt.needsUpdate=!0,v.raysMat.opacity=.6*f}}dispose(){var t;this.disposed=!0,(t=this.draco)==null||t.dispose();for(const a of this.templates.values())lr(a);lr(this.group),this.look.dispose()}}const Qu=64;function n0(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=t;return a=Math.imul(a^a>>>15,a|1),a^=a+Math.imul(a^a>>>7,a|61),((a^a>>>14)>>>0)/4294967296}}function ur(e,t){const a=new Float32Array(e*e*e);for(let o=0;o<a.length;o++)a[o]=t();const s=e-1,i=e*e;return(o,l,u)=>{const r=o*e,c=l*e,h=u*e,v=Math.floor(r),x=Math.floor(c),y=Math.floor(h),M=r-v,E=c-x,g=h-y,p=M*M*M*(M*(M*6-15)+10),b=E*E*E*(E*(E*6-15)+10),F=g*g*g*(g*(g*6-15)+10),A=v&s,z=v+1&s,D=(x&s)*e,T=(x+1&s)*e,L=(y&s)*i,U=(y+1&s)*i,K=a[L+D+A],G=a[L+D+z],X=a[L+T+A],ue=a[L+T+z],oe=a[U+D+A],Te=a[U+D+z],ye=a[U+T+A],ve=a[U+T+z],he=K+(G-K)*p,ht=X+(ue-X)*p,fe=oe+(Te-oe)*p,te=ye+(ve-ye)*p,Q=he+(ht-he)*b,f=fe+(te-fe)*b;return Q+(f-Q)*F}}function hr(e,t){const a=new Float32Array(e*e*e*3);for(let i=0;i<a.length;i++)a[i]=t();const s=e-1;return(i,o,l)=>{const u=i*e,r=o*e,c=l*e,h=Math.floor(u),v=Math.floor(r),x=Math.floor(c);let y=9;for(let M=-1;M<=1;M++){const E=(x+M&s)*e,g=x+M-c;for(let p=-1;p<=1;p++){const b=(E+(v+p&s))*e,F=v+p-r;for(let A=-1;A<=1;A++){const z=(b+(h+A&s))*3,D=h+A+a[z]-u,T=F+a[z+1],L=g+a[z+2],U=D*D+T*T+L*L;U<y&&(y=U)}}}return Math.min(1,Math.sqrt(y))}}let dr=null;function r0(){if(dr)return dr;const e=Qu,t=n0(1377799),a=ur(4,t),s=ur(8,t),i=ur(16,t),o=hr(4,t),l=hr(8,t),u=hr(16,t),r=new Uint8Array(e*e*e*4),c=1/e;let h=0;for(let v=0;v<e;v++){const x=(v+.5)*c;for(let y=0;y<e;y++){const M=(y+.5)*c;for(let E=0;E<e;E++){const g=(E+.5)*c,p=a(g,M,x)*.5+s(g,M,x)*.3+i(g,M,x)*.2,b=1-o(g,M,x),F=1-l(g,M,x),A=1-u(g,M,x),z=Math.min(1,Math.max(0,p*.62+b*.46-.06)),D=Math.min(1,Math.max(0,F*.62+A*.38));r[h]=Math.round(z*255),r[h+1]=Math.round(D*255),r[h+2]=Math.round(p*255),r[h+3]=255,h+=4}}}return dr=r,r}function l0(){const e=Qu,t=new Kh(r0(),e,e,e);return t.format=Rt,t.type=Ut,t.minFilter=ze,t.magFilter=ze,t.wrapS=ai,t.wrapT=ai,t.wrapR=ai,t.unpackAlignment=1,t.needsUpdate=!0,t}const Ys=256,c0=256;function u0(e,t,a,s,i){const o=c0,l=new Float32Array(o*o);for(let M=0;M<o;M++){const E=Math.min(t-1,Math.round(M/(o-1)*(t-1)));for(let g=0;g<o;g++){const p=Math.min(t-1,Math.round(g/(o-1)*(t-1)));l[M*o+g]=a(e[E*t+p])}}const u=5,r=new Float32Array(o*o),c=new Float32Array(o*o);for(let M=0;M<o;M++)for(let E=0;E<o;E++){let g=0;for(let p=-u;p<=u;p++)g+=l[M*o+Math.min(o-1,Math.max(0,E+p))];r[M*o+E]=g/(2*u+1)}for(let M=0;M<o;M++)for(let E=0;E<o;E++){let g=0;for(let p=-u;p<=u;p++)g+=r[Math.min(o-1,Math.max(0,M+p))*o+E];c[M*o+E]=g/(2*u+1)}const h=new Uint16Array(o*o*4),v=s/(o-1),x=i/(o-1);for(let M=0;M<o;M++){const E=Math.max(0,M-2),g=Math.min(o-1,M+2);for(let p=0;p<o;p++){const b=Math.max(0,p-2),F=Math.min(o-1,p+2),A=(c[M*o+F]-c[M*o+b])/((F-b)*v),z=(c[g*o+p]-c[E*o+p])/((g-E)*x),D=Math.hypot(A,z),T=D>1e-5?Math.min(1,D*1.6)/D:0,L=(M*o+p)*4;h[L]=Ma.toHalfFloat(l[M*o+p]),h[L+1]=Ma.toHalfFloat(A*T),h[L+2]=Ma.toHalfFloat(z*T),h[L+3]=Ma.toHalfFloat(c[M*o+p])}}const y=new aa(h,o,o,Rt,Da);return y.minFilter=ze,y.magFilter=ze,y.wrapS=Ve,y.wrapT=Ve,y.generateMipmaps=!1,y.flipY=!1,y.needsUpdate=!0,y}const Pi=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,h0=`
uniform sampler2D uField0;
uniform sampler2D uField1;
uniform sampler2D uDetection0;
uniform sampler2D uDetection1;
uniform float uRealSource;
uniform float uFrameMix;
varying vec2 vUv;
void main() {
  float z = mix(textureLod(uField0, vUv, 0.0).r, textureLod(uField1, vUv, 0.0).r, uFrameMix);
  // A real run: smoke rises where the satellites detected fire (see buildDetectionSource in
  // ./footprintField.ts), not where the model estimates it
  if (uRealSource > 0.5) {
    z = mix(textureLod(uDetection0, vUv, 0.0).r, textureLod(uDetection1, vUv, 0.0).r, uFrameMix);
  }
  // Emission only where the field is above the fire threshold
  float s = max(0.0, z - ${Hi.toFixed(4)}) / ${(1-Hi).toFixed(4)};
  gl_FragColor = vec4(clamp(s * 1.6, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`,d0=`
uniform sampler2D uSourceTex;
uniform sampler2D uHeightPrev;
uniform sampler2D uHeightNext;
uniform float uMorph;
uniform vec2 uWindUv;
uniform float uSmokeTop;
uniform vec2 uSlabSize;
uniform vec4 uLid;
uniform float uLidAmount;
varying vec2 vUv;

const int TAPS = 26;
const float REACH = 0.40;        // how far downwind a plume is followed, slab uv
const float RISE_LENGTH = 0.07;  // downwind distance over which a plume reaches its final rise
const float SPREAD_LENGTH = 0.18;
const float FADE_LENGTH = 0.10;  // dilution and fallout
const float PLUME_GAIN = 44.0;

float smoothGround(vec2 uv) {
  float g = texture2D(uHeightNext, uv).a;
  if (uMorph < 0.999) g = mix(texture2D(uHeightPrev, uv).a, g, uMorph);
  return g;
}

void main() {
  float g0 = smoothGround(vUv);
  float m0 = 0.0;
  float m1 = 0.0;
  float m2 = 0.0;
  float strongest = 0.0;
  float sPrev = 0.0;
  for (int j = 0; j < TAPS; j++) {
    // Taps are dense near the point (fresh smoke changes fast) and sparse far upwind
    float s = REACH * pow((float(j) + 0.5) / float(TAPS), 1.7);
    float sNext = REACH * pow((float(j) + 1.0) / float(TAPS), 1.7);
    float ds = sNext - sPrev;
    sPrev = sNext;
    vec2 uvS = vUv - uWindUv * s;
    if (uvS.x < 0.0 || uvS.x > 1.0 || uvS.y < 0.0 || uvS.y > 1.0) continue;
    // A plume widens sideways as it drifts: older smoke comes from a wider stretch of the source
    // The plume is as wide as the stretch of front that burns, plus a modest sideways spread with
    // age (at most about half a slab unit). The lowest level already merges neighbouring fire
    // cells, so single cells do not rise as separate streaks.
    float src = textureLod(uSourceTex, uvS, 1.6 + 1.6 * sqrt(s / REACH)).r;
    if (src < 0.0004) continue;
    float power = textureLod(uSourceTex, uvS, 4.5).r;
    // Bent over from the first rise: the axis climbs at a shallow angle and levels off, and the
    // layer stays thin. Axis plus thickness never exceed the ceiling uSmokeTop.
    float rise = uSmokeTop * mix(0.24, 0.44, smoothstep(0.004, 0.10, power));
    float center = rise * (1.0 - exp(-s / RISE_LENGTH));
    float thick = uSmokeTop * (0.07 + 0.10 * (1.0 - exp(-s / SPREAD_LENGTH)));
    // Smoke climbs with rising ground and comes most of the way down with falling ground: it neither
    // runs into a slope nor stays hanging high over a valley
    float drop = smoothGround(uvS) - g0;
    float h = center + (drop > 0.0 ? 0.22 : 0.15) * drop;
    float c = src * ds * exp(-s / FADE_LENGTH);
    m0 += c;
    m1 += c * h;
    m2 += c * (h * h + thick * thick);
    strongest = max(strongest, power * exp(-s / FADE_LENGTH));
  }
  float mean = m0 > 1e-7 ? m1 / m0 : 0.0;
  float variance = m0 > 1e-7 ? max(m2 / m0 - mean * mean, 1e-4) : 1e-2;
  float sigma = sqrt(variance);
  // What ends up far above the ground under it is let go: a thin sheet alone in the sky reads as
  // a stray streak, not as smoke
  float mass = m0 * PLUME_GAIN * (1.0 - smoothstep(0.24, 0.48, mean));
  // The fire field ends at the edge of the region, and smoke that reached it would end there in a
  // straight cut. It thins out over the last stretch instead.
  mass *= smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  if (uLidAmount > 0.0) {
    // Under a lid the layer levels off lower and thinner, and carries less: the rise is capped,
    // the smoke is not cut
    vec2 xz = vec2((vUv.x - 0.5) * uSlabSize.x, (0.5 - vUv.y) * uSlabSize.y);
    float room = -(uLid.w + uLid.x * xz.x + uLid.z * xz.y) / max(uLid.y, 0.05) - g0;
    float k = clamp(0.8 * room / max(mean + 2.0 * sigma, 1e-3), 0.0, 1.0);
    k = mix(1.0, k, uLidAmount);
    mean *= k;
    sigma *= k;
    mass *= k;
  }
  gl_FragColor = vec4(mass, mean, sigma, strongest);
}
`,Ju=`
precision highp sampler3D;

uniform sampler2D uHeightPrev;
uniform sampler2D uHeightNext;
uniform float uMorph;
uniform sampler2D uSourceTex;
uniform sampler2D uPlumeTex;   // column mass, mean height, thickness, fire power (see the plume pass)
uniform sampler3D uNoiseTex;
uniform vec2 uSlabSize;
uniform float uSmokeTop;     // plume ceiling above the ground, world units
uniform vec2 uWindUv;        // unit downwind direction in slab uv
uniform float uTime;
uniform float uOpacity;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform vec3 uClearCenter;   // the camera
uniform float uClearRadius;  // smoke within this distance of it is not drawn, 0 = off
uniform float uThinOverFire; // share of the smoke taken away right over its source, 0 = none
uniform vec4 uLid;           // plane the smoke stays under: dot(xyz, p) + w < 0
uniform float uLidAmount;    // 0 = no lid

vec2 smokeUv(vec3 p) {
  return vec2(p.x / uSlabSize.x + 0.5, 0.5 - p.z / uSlabSize.y);
}

vec4 smokeGround(vec2 uv) {
  vec4 g = texture2D(uHeightNext, uv);
  if (uMorph < 0.999) {
    g = mix(texture2D(uHeightPrev, uv), g, uMorph);
  }
  return g;
}

// Smoke belongs to the harmonized record, so the sensor curtain cuts it like the terrain layers
float smokeGate(vec2 uv) {
  float scanCoord = dot(uv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
  return mix(1.0, smoothstep(-0.004, 0.012, -scanCoord), uCutawayMix);
}

// Returns density. detailAmount: 0 to 1 for the view march (share of the finest noise), below 0
// for light and shadow samples (the cheapest form). info = (height above the ground as a share of the ceiling, position inside the
// layer in sigmas with 0 at its middle, column mass, fire power feeding the column).
float smokeDensity(vec3 p, float detailAmount, out vec4 info) {
  info = vec4(0.0);
  vec2 uv = smokeUv(p);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  // Explicit level: inside the march loop the automatic level of detail is undefined, and the
  // plume map has a mip chain (the march reads level 4 on purpose to find where smoke can be)
  vec4 plume = textureLod(uPlumeTex, uv, 0.0);
  if (plume.r < 0.004) return 0.0;
  vec4 ground = smokeGround(uv);
  float h = p.y - ground.a;
  float sigma = max(plume.b, 0.06 * uSmokeTop);
  // Beyond 3.3 sigma of the layer's middle, plus the most the lumps can move it, there is nothing:
  // leave before any noise is read (most samples of a march end here)
  if (abs(h - plume.g) > 3.3 * sigma + 0.5 * (0.07 + sigma * 1.5)) return 0.0;

  // Billows: a noise volume that drifts with the wind and rises slowly. Two scales: fine lumps a
  // few hundred metres across, small against the ridges, and a slower variation several times
  // larger so the fine pattern does not repeat along a plume.
  vec3 windW = normalize(vec3(uWindUv.x * uSlabSize.x, 0.0, -uWindUv.y * uSlabSize.y));
  vec3 q = p * 2.3 - windW * (uTime * 0.06) - vec3(0.0, uTime * 0.04, 0.0);
  float n = texture(uNoiseTex, q).r;
  // The slow second scale is left out of the light and shadow samples (detailAmount below 0):
  // they only need to know roughly how much smoke lies toward the sun
  if (detailAmount >= 0.0) {
    n = 0.62 * n + 0.38 * texture(uNoiseTex, q * 0.37 + vec3(0.31, 0.17, 0.53)).r;
  }
  // Young smoke (still fed by strong fire close upwind) is lumpy and has holes; aged smoke is a
  // veil that only varies in strength and trails off, so nothing breaks away and hangs alone
  float young = smoothstep(0.004, 0.05, plume.a);
  // The lumps move the whole layer up and down, by more than its own thickness where it is thin
  float z = (h - plume.g - (n - 0.5) * (0.07 + sigma * 1.5)) / sigma;
  // A thin fresh layer is dense, an old thick one is thin: the same smoke in more air
  float base = min(1.4, plume.r * (0.20 * uSmokeTop / sigma)) * exp(-0.5 * z * z);
  if (base < 0.002) return 0.0;
  // Everything below is a share of the local density, so thin smoke is shaped like thick smoke
  // and no fixed threshold cuts it into islands
  float shape = mix(0.45, 1.30, smoothstep(0.28, 0.72, n));
  // The upper side is eaten into more than the underside (rising lumps, a flatter base)
  shape -= (1.0 - n) * mix(0.10, 0.55, young) * smoothstep(-1.0, 1.6, z);
  if (detailAmount > 0.0) {
    // Finer cellular noise eats into the edges of each billow
    float n2 = texture(uNoiseTex, q * 2.9 + vec3(0.37, uTime * 0.05, 0.11)).g;
    shape -= (1.0 - n2) * mix(0.12, 0.45, young) * detailAmount;
  }
  float d = base * shape;
  if (d <= 0.0) return 0.0;
  // Aged smoke is thin. A level sight line runs through it for kilometres, and at full strength
  // that adds up to a brown veil over everything behind it.
  float dens = d / (d + 0.10) * mix(0.38, 1.0, young);
  // No smoke close to the lens: a plume a few hundred metres from the camera is a blob across
  // the frame, not a plume
  // A real run by day: the smoke is thinned over the detections that feed it, so their light
  // reads through it. Illustrative: real smoke is thickest there.
  if (uThinOverFire > 0.0) {
    dens *= 1.0 - uThinOverFire * smoothstep(0.02, 0.22, textureLod(uSourceTex, uv, 2.2).r);
  }
  if (uClearRadius > 0.0) {
    dens *= smoothstep(uClearRadius * 0.6, uClearRadius, distance(p, uClearCenter));
  }
  if (uLidAmount > 0.0) {
    // The lid passes through the eye, so the fade is over an angle (about two degrees under it)
    float under = -(dot(uLid.xyz, p) + uLid.w) / max(distance(p, uClearCenter), 1e-3);
    dens *= mix(1.0, smoothstep(0.0, 0.05, under), uLidAmount);
  }
  // Smoke thins out where it meets the ground, so it does not end in a hard line on a slope
  // and the fire line under it stays readable
  dens *= smoothstep(0.004, 0.05, p.y - ground.x);
  info = vec4(clamp(h / uSmokeTop, 0.0, 1.0), z, plume.r, plume.a);
  return dens * smokeGate(uv) * uOpacity;
}
`,f0=`
${Ju}
uniform vec3 uSunDir;
uniform float uSigma;
varying vec2 vUv;
void main() {
  vec4 ground = smokeGround(vUv);
  vec3 p0 = vec3((vUv.x - 0.5) * uSlabSize.x, ground.x, (0.5 - vUv.y) * uSlabSize.y);
  vec3 sun = normalize(uSunDir);
  // Leave the smoke layer in 24 steps, each texel starting at its own fraction of a step, so the
  // shadow of a thin layer is not a stack of copies of it
  float reach = (uSmokeTop + 0.2) / max(sun.y, 0.12);
  float ds = reach / 24.0;
  float offset = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float tau = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 info;
    vec3 p = p0 + sun * (ds * (float(i) + offset));
    tau += smokeDensity(p, -1.0, info) * ds;
  }
  gl_FragColor = vec4(exp(-tau * uSigma), 0.0, 0.0, 1.0);
}
`,m0=`
${Ju}
uniform sampler2D uDepthTex;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSigma;
uniform float uBoxTop;
uniform float uStepFine;  // march step inside a plume, world units
uniform sampler2D uHistoryTex;   // the march result of the previous frame
uniform mat4 uPrevViewProj;
uniform float uHistoryWeight;    // share of the previous result that is kept, 0 without history
uniform float uFrame;
uniform float uNight;          // 1 on a night overpass: moonlight, and the fire lights its own smoke
uniform float uFireLight;      // by night: 1 when the pass on show has detections of its own to light the smoke
uniform float uProxyY;           // height of the middle of the smoke layer, for reprojection
uniform vec2 uHalfSize;
varying vec2 vUv;

const int MAX_STEPS = 84;
const float SMOKE_PEAK_OPACITY = 0.62;

float hgRel(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1e-3, 1.0 + g2 - 2.0 * g * c), 1.5);
}

float ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 far4 = uProjInv * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((uViewInv * vec4(normalize(far4.xyz / far4.w), 0.0)).xyz);
  vec3 ro = uCameraPos;

  float depth = texture2D(uDepthTex, vUv).r;
  float sceneDist = 1.0e6;
  if (depth < 0.99999) {
    vec4 sp = uProjInv * vec4(ndc, depth * 2.0 - 1.0, 1.0);
    sceneDist = length(sp.xyz / sp.w);
  }

  // Slab of air that can hold smoke
  vec3 bmin = vec3(-0.5 * uSlabSize.x, 0.0, -0.5 * uSlabSize.y);
  vec3 bmax = vec3(0.5 * uSlabSize.x, uBoxTop, 0.5 * uSlabSize.y);
  vec3 inv = 1.0 / (abs(rd) + 1e-6) * sign(rd + 1e-9);
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tsm = min(t0, t1);
  vec3 tbg = max(t0, t1);
  float tNear = max(max(tsm.x, tsm.y), max(tsm.z, 0.0));
  float tFar = min(min(tbg.x, tbg.y), min(tbg.z, sceneDist));

  vec3 scatter = vec3(0.0);
  float trans = 1.0;

  // Nothing is drawn inside the cleared zone around the camera, so the march starts beyond it
  if (uClearRadius > 0.0) tNear = max(tNear, uClearRadius * 0.6);
  // The lid passes through the eye: a ray that leaves above it stays above it and meets no smoke
  bool underLid = uLidAmount < 0.999 || dot(uLid.xyz, rd) < 0.0;

  if (tFar > tNear && uOpacity > 0.003 && underLid) {
    vec3 sun = normalize(uSunDir);
    float cosT = dot(rd, sun);
    // Forward-peaked phase function blended with an isotropic term (multiple scattering)
    float phase = mix(1.0, min(3.0, hgRel(cosT, 0.6)), 0.45);
    // By night the key light is the moon: the same picture as the moonlit ground, far dimmer
    vec3 sunColor = uSunColor * 0.73 * mix(1.0, 0.045, uNight);

    // Adaptive march: long steps through empty air, short steps where a plume can be
    float fine = uStepFine;
    // The stride through empty air does not shrink with the fine step: clear air needs no detail
    float coarse = max(fine * 5.0, 0.375);
    // The start of the march moves by a different fraction of a step every frame; blended over
    // time (below) the slices of the march average out instead of showing as bands
    float jitter = ign(gl_FragCoord.xy + 5.588238 * mod(uFrame, 64.0));
    // The offset spans one whole step at this distance (steps grow with distance). With a shorter
    // offset the slices only blur, and from the overview they still show as ribs.
    float t = tNear + max(fine, tNear * 0.0068) * jitter;
    bool wasCoarse = false;
    int fineLeft = 0;
    // Length of the last stride through clear air inside a plume region, 0 after a normal step
    float strode = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (t >= tFar || trans < 0.02) break;
      vec3 p = ro + rd * t;
      // A blurred copy of the plume map tells whether any smoke can be near this column
      float presence = textureLod(uPlumeTex, smokeUv(p), 4.0).r;
      bool empty = presence < 0.0025;
      if (empty && fineLeft <= 0) {
        t += coarse;
        wasCoarse = true;
        continue;
      }
      if (wasCoarse && !empty) {
        // Entered a plume region with a long step: back up so its near edge is not skipped
        t -= coarse - fine;
        wasCoarse = false;
        fineLeft = 6;
        continue;
      }
      wasCoarse = false;
      fineLeft -= 1;

      float stepLen = max(fine, t * 0.0068);
      vec4 info;
      // Fine detail is dropped with distance, where it is finer than a march step and only adds grain
      float d = smokeDensity(p, 1.0 - smoothstep(5.0, 11.0, t), info);
      // Soft meeting with the terrain behind: the last stretch before the surface thins out, so a
      // peak that pokes through a plume does not cut it with a hard line
      d *= smoothstep(0.0, 0.12, sceneDist - t);
      if (d > 0.002 && strode > 0.0) {
        // A long stride landed inside smoke: go back to one normal step after the last clear
        // sample. Entering a layer at stride spacing would draw it in slices that no start
        // offset could hide.
        t -= strode - stepLen;
        strode = 0.0;
        continue;
      }
      if (d > 0.002) {
        float hn = info.x;
        // Short march toward the sun for self-shadowing (coarse density, no detail noise)
        float tau = 0.0;
        vec4 li;
        float lj = 0.75 + 0.5 * fract(jitter * 7.31 + float(i) * 0.618);
        if (uNight > 0.5) {
          // By night the key light is a twentieth of the sun's: the smoke's own shadow on itself
          // cannot be seen, and its march is the costly part of every step, so it is left out
          tau = 0.0;
        } else if (d > 0.2) {
          tau += smokeDensity(p + sun * (0.05 * lj), -1.0, li) * 0.09;
          tau += smokeDensity(p + sun * (0.17 * lj), -1.0, li) * 0.17;
          tau += smokeDensity(p + sun * (0.42 * lj), -1.0, li) * 0.28;
        } else if (d > 0.07) {
          // Thin smoke adds little to the pixel and the veil of aged smoke covers a lot of ground:
          // one sample toward the sun stands for the three, and the thinnest smoke takes none
          tau = smokeDensity(p + sun * (0.17 * lj), -1.0, li) * 0.54;
        }
        float sunT = exp(-tau * uSigma * 1.5);
        // Light that has scattered many times still gets through thick smoke
        float sunVis = mix(sunT, pow(sunT, 0.3), 0.26);
        // Sky light comes from above: the share of the layer over this point shades it, so a
        // thick plume has a bright top and a dark underside
        float over = info.z / (1.0 + exp(1.7 * info.y));
        float skyVis = exp(-over * 1.9);

        // Brown and absorbing where it is young and dense, grey once it has aged and risen
        float aged = smoothstep(0.10, 0.75, hn) * (1.0 - 0.35 * smoothstep(0.02, 0.2, info.w) * (1.0 - smoothstep(0.1, 0.45, hn)));
        vec3 albedo = mix(vec3(0.30, 0.25, 0.20), vec3(0.64, 0.60, 0.545), aged);
        vec3 skyLight = vec3(0.152, 0.160, 0.176) * (0.50 + 0.50 * skyVis);
        // Light bounced up from the sunlit ground keeps undersides from going black
        skyLight += vec3(0.070, 0.066, 0.058) * (1.0 - skyVis);
        skyLight *= mix(1.0, 0.05, uNight);
        vec3 light = sunColor * sunVis * phase + skyLight;
        // Warm light from the fire scattered inside the base of the column. By night it is the main
        // light the smoke has: it reaches higher into the column and is read from a wider source.
        vec3 fireGlow = vec3(0.0);
        if (hn < mix(0.28, 0.72, uNight)) {
          float src = textureLod(uSourceTex, smokeUv(p), mix(1.5, 2.6, uNight)).r;
          // Smoke lingers from the pass before (see buildDetectionSource), but by night it is lit
          // only by detections that are on show: a pass that shows none leaves it dark
          fireGlow = vec3(1.0, 0.36, 0.08) * src * exp(-hn * uSmokeTop * mix(14.0, 4.6, uNight)) * mix(0.9, 2.1 * uFireLight, uNight);
        }

        float a = 1.0 - exp(-d * uSigma * stepLen);
        scatter += trans * a * (albedo * light + fireGlow);
        trans *= 1.0 - a;
        t += stepLen;
        strode = 0.0;
      } else {
        // Clear air inside a plume region: stride faster so the step budget reaches far smoke
        strode = stepLen * 2.4;
        t += strode;
      }
    }
  }
  // Even the thickest plume lets the ridge behind it show as a silhouette
  scatter *= SMOKE_PEAK_OPACITY;
  trans = 1.0 - SMOKE_PEAK_OPACITY * (1.0 - trans);
  vec4 result = vec4(scatter, trans);
  if (uHistoryWeight > 0.0) {
    // Where this ray crosses the middle of the smoke layer was on screen last frame at prevUv
    float tp = abs(rd.y) > 1e-4 ? (uProxyY - ro.y) / rd.y : tNear;
    tp = clamp(tp, tNear, max(tNear, tFar));
    vec4 clip = uPrevViewProj * vec4(ro + rd * tp, 1.0);
    vec2 prevUv = clip.xy / max(clip.w, 1e-5) * 0.5 + 0.5;
    if (clip.w > 0.0 && prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0) {
      // Less history where the picture moves fast, so a moving camera does not leave trails
      float movedPx = length((prevUv - vUv) * uHalfSize);
      float keep = uHistoryWeight * (1.0 - 0.55 * smoothstep(1.0, 9.0, movedPx));
      result = mix(result, texture2D(uHistoryTex, prevUv), keep);
    }
  }
  gl_FragColor = result;
}
`,p0=`
uniform sampler2D uSceneTex;
uniform sampler2D uSmokeTex;
uniform sampler2D uDepthTex;
uniform vec2 uHalfSize;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;

float viewDist(float depth) {
  return (uNear * uFar) / max(1e-6, uFar - depth * (uFar - uNear));
}

void main() {
  vec4 scene = texture2D(uSceneTex, vUv);
  // Most of the frame has no smoke near it: one filtered fetch settles those pixels
  vec4 quick = texture2D(uSmokeTex, vUv);
  if (quick.a > 0.9985 && quick.r + quick.g + quick.b < 0.0015) {
    gl_FragColor = scene;
    return;
  }
  float dC = viewDist(texture2D(uDepthTex, vUv).r);

  // Depth-aware upsample: a 3 x 3 neighborhood of half-res texels, weighted by distance and by
  // how close the depth their ray was marched against is to the depth of this pixel. The wider
  // footprint also averages out the per-pixel jitter of the march.
  vec2 hp = vUv * uHalfSize - 0.5;
  vec2 base = floor(hp + 0.5);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 texel = clamp(base + vec2(float(i), float(j)), vec2(0.0), uHalfSize - 1.0);
      vec2 tuv = (texel + 0.5) / uHalfSize;
      float dH = viewDist(texture2D(uDepthTex, tuv).r);
      vec2 dpx = texel - hp;
      float ws = exp(-dot(dpx, dpx) * 0.85);
      float wd = 1.0 / (0.02 + abs(dH - dC) / max(dC, 1e-3) * 24.0);
      float w = max(1e-5, ws * wd);
      acc += texture2D(uSmokeTex, tuv) * w;
      wsum += w;
    }
  }
  vec4 smoke = acc / wsum;
  gl_FragColor = vec4(scene.rgb * smoke.a + smoke.rgb, scene.a);
}
`,v0=.62,g0=.88;class eh extends ua{constructor(){super("SmokePass");k(this,"shadowTarget");k(this,"sourceTarget");k(this,"smokeTarget");k(this,"historyTarget");k(this,"historyValid",!1);k(this,"frame",0);k(this,"lastTime",-1);k(this,"prevViewProj",new qs);k(this,"viewProj",new qs);k(this,"noiseTexture");k(this,"plumeTarget");k(this,"sourceMaterial");k(this,"plumeMaterial");k(this,"shadowMaterial");k(this,"marchMaterial");k(this,"compositeMaterial");k(this,"densityUniforms");k(this,"lastSourceRenderer",null);k(this,"lastSourceSig",new Float64Array(6).fill(Number.NaN));k(this,"lastPlumeRenderer",null);k(this,"lastPlumeSig",new Float64Array(15).fill(Number.NaN));this.needsDepthTexture=!0,this.needsSwap=!0,this.noiseTexture=l0(),this.sourceTarget=new Ot(Ys,Ys,{format:Rt,type:Da,depthBuffer:!1,stencilBuffer:!1,minFilter:Ga,magFilter:ze,generateMipmaps:!0}),this.sourceTarget.texture.colorSpace=Pa,this.plumeTarget=new Ot(Ys,Ys,{format:Rt,type:Da,depthBuffer:!1,stencilBuffer:!1,minFilter:Ga,magFilter:ze,generateMipmaps:!0}),this.plumeTarget.texture.colorSpace=Pa,this.shadowTarget=new Ot(Ys,Ys,{format:Rt,type:Ut,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1}),this.shadowTarget.texture.colorSpace=Pa;const a=()=>new Ot(2,2,{format:Rt,type:Da,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1});this.smokeTarget=a(),this.historyTarget=a(),this.densityUniforms={uHeightPrev:{value:null},uHeightNext:{value:null},uMorph:{value:1},uSourceTex:{value:this.sourceTarget.texture},uPlumeTex:{value:this.plumeTarget.texture},uNoiseTex:{value:this.noiseTexture},uSlabSize:{value:new Ne(14.8,10.8)},uSmokeTop:{value:v0},uWindUv:{value:new Ne(.7,.7)},uTime:{value:0},uOpacity:{value:1},uCutawayMix:{value:0},uCutawayPlane:{value:0},uCutawayDir:{value:new Ne(1,0)},uClearCenter:{value:new B},uClearRadius:{value:0},uThinOverFire:{value:0},uLid:{value:new ma(0,1,0,-1e4)},uLidAmount:{value:0},uSunDir:{value:new B(0,1,0)},uSigma:{value:4.6}};const s={depthTest:!1,depthWrite:!1,toneMapped:!1};this.sourceMaterial=new wt({...s,vertexShader:Pi,fragmentShader:h0,uniforms:{uField0:{value:null},uField1:{value:null},uDetection0:{value:null},uDetection1:{value:null},uRealSource:{value:0},uFrameMix:{value:0}}}),this.plumeMaterial=new wt({...s,vertexShader:Pi,fragmentShader:d0,uniforms:{uSourceTex:this.densityUniforms.uSourceTex,uHeightPrev:this.densityUniforms.uHeightPrev,uHeightNext:this.densityUniforms.uHeightNext,uMorph:this.densityUniforms.uMorph,uWindUv:this.densityUniforms.uWindUv,uSmokeTop:this.densityUniforms.uSmokeTop,uSlabSize:this.densityUniforms.uSlabSize,uLid:this.densityUniforms.uLid,uLidAmount:this.densityUniforms.uLidAmount}}),this.shadowMaterial=new wt({...s,vertexShader:Pi,fragmentShader:f0,uniforms:this.densityUniforms}),this.marchMaterial=new wt({...s,vertexShader:Pi,fragmentShader:m0,uniforms:{...this.densityUniforms,uDepthTex:{value:null},uProjInv:{value:new qs},uViewInv:{value:new qs},uCameraPos:{value:new B},uBoxTop:{value:4},uSunColor:{value:new B(1.4,1.29,1.17)},uNight:{value:0},uFireLight:{value:1},uStepFine:{value:.075},uHistoryTex:{value:null},uPrevViewProj:{value:new qs},uHistoryWeight:{value:0},uFrame:{value:0},uProxyY:{value:1},uHalfSize:{value:new Ne(2,2)}}}),this.compositeMaterial=new wt({...s,vertexShader:Pi,fragmentShader:p0,uniforms:{uSceneTex:{value:null},uSmokeTex:{value:this.smokeTarget.texture},uDepthTex:{value:null},uHalfSize:{value:new Ne(2,2)},uNear:{value:.1},uFar:{value:100}}}),this.fullscreenMaterial=this.compositeMaterial}setDepthTexture(a){this.marchMaterial.uniforms.uDepthTex.value=a,this.compositeMaterial.uniforms.uDepthTex.value=a}setSize(a,s){const i=Math.max(2,Math.ceil(a/2)),o=Math.max(2,Math.ceil(s/2));this.smokeTarget.setSize(i,o),this.historyTarget.setSize(i,o),this.historyValid=!1,this.compositeMaterial.uniforms.uHalfSize.value.set(i,o),this.marchMaterial.uniforms.uHalfSize.value.set(i,o)}update(a){const s=this.densityUniforms;s.uHeightPrev.value=a.heightPrev,s.uHeightNext.value=a.heightNext,s.uMorph.value=a.morph,s.uSlabSize.value.set(a.slabWidth,a.slabDepth),s.uWindUv.value.copy(a.windUv).normalize(),s.uTime.value=a.time,s.uLid.value.copy(a.lid),s.uLidAmount.value=a.lidAmount,s.uClearCenter.value.setFromMatrixPosition(a.camera.matrixWorld),s.uClearRadius.value=a.clearRadius,s.uThinOverFire.value=a.thinOverFire,s.uOpacity.value=a.opacity,s.uCutawayMix.value=a.cutawayMix,s.uCutawayPlane.value=a.cutawayPlane,s.uCutawayDir.value.copy(a.cutawayDir),s.uSunDir.value.copy(a.sunDir);const i=this.sourceMaterial.uniforms;i.uField0.value=a.field0,i.uField1.value=a.field1,i.uDetection0.value=a.detection0??a.field0,i.uDetection1.value=a.detection1??a.field1,i.uRealSource.value=a.detection0&&a.detection1?1:0,i.uFrameMix.value=a.frameMix;const o=this.marchMaterial.uniforms,l=a.camera;o.uProjInv.value.copy(l.projectionMatrixInverse),o.uViewInv.value.copy(l.matrixWorld),o.uCameraPos.value.setFromMatrixPosition(l.matrixWorld),o.uSunColor.value.copy(a.sunColor),o.uNight.value=a.night??0,o.uFireLight.value=a.fireLight??1,o.uBoxTop.value=a.reliefTop+s.uSmokeTop.value+.05,o.uProxyY.value=.5*(a.reliefTop+s.uSmokeTop.value),(this.lastTime<0||a.time-this.lastTime>.25||a.time<this.lastTime)&&(this.historyValid=!1),this.lastTime=a.time,o.uPrevViewProj.value.copy(this.prevViewProj),this.viewProj.multiplyMatrices(l.projectionMatrix,l.matrixWorldInverse),this.prevViewProj.copy(this.viewProj),o.uHistoryWeight.value=this.historyValid?g0:0,o.uFrame.value=this.frame,this.frame=(this.frame+1)%4096;const u=this.compositeMaterial.uniforms;u.uNear.value=l.near,u.uFar.value=l.far}render(a,s,i){const o=this.scene,l=this.camera,u=this.sourceMaterial.uniforms,r=u.uRealSource.value>.5?1:0,c=r?u.uDetection0.value:u.uField0.value,h=r?u.uDetection1.value:u.uField1.value,v=c?c.id:-1,x=c?c.version:-1,y=h?h.id:-1,M=h?h.version:-1,E=u.uFrameMix.value,g=this.lastSourceSig,p=this.lastSourceRenderer!==a||g[0]!==r||g[1]!==v||g[2]!==x||g[3]!==y||g[4]!==M||g[5]!==E;p&&(this.fullscreenMaterial=this.sourceMaterial,a.setRenderTarget(this.sourceTarget),a.render(o,l),this.lastSourceRenderer=a,g[0]=r,g[1]=v,g[2]=x,g[3]=y,g[4]=M,g[5]=E);const b=this.densityUniforms,F=b.uMorph.value,A=F<.999?F:1,z=F<.999?b.uHeightPrev.value:null,D=b.uHeightNext.value,T=z?z.id:-1,L=z?z.version:-1,U=D?D.id:-1,K=D?D.version:-1,G=b.uWindUv.value,X=b.uSmokeTop.value,ue=b.uSlabSize.value,oe=b.uLidAmount.value,Te=oe>0?oe:0,ye=b.uLid.value,ve=Te>0?ye.x:0,he=Te>0?ye.y:0,ht=Te>0?ye.z:0,fe=Te>0?ye.w:0,te=this.lastPlumeSig;(p||this.lastPlumeRenderer!==a||te[0]!==T||te[1]!==L||te[2]!==U||te[3]!==K||te[4]!==A||te[5]!==G.x||te[6]!==G.y||te[7]!==X||te[8]!==ue.x||te[9]!==ue.y||te[10]!==Te||te[11]!==ve||te[12]!==he||te[13]!==ht||te[14]!==fe)&&(this.fullscreenMaterial=this.plumeMaterial,a.setRenderTarget(this.plumeTarget),a.render(o,l),this.lastPlumeRenderer=a,te[0]=T,te[1]=L,te[2]=U,te[3]=K,te[4]=A,te[5]=G.x,te[6]=G.y,te[7]=X,te[8]=ue.x,te[9]=ue.y,te[10]=Te,te[11]=ve,te[12]=he,te[13]=ht,te[14]=fe),this.fullscreenMaterial=this.shadowMaterial,a.setRenderTarget(this.shadowTarget),a.render(o,l);const f=this.smokeTarget;this.smokeTarget=this.historyTarget,this.historyTarget=f,this.marchMaterial.uniforms.uHistoryTex.value=this.historyTarget.texture,this.fullscreenMaterial=this.marchMaterial,a.setRenderTarget(this.smokeTarget),a.render(o,l),this.historyValid=!0,this.compositeMaterial.uniforms.uSmokeTex.value=this.smokeTarget.texture,this.compositeMaterial.uniforms.uSceneTex.value=s.texture,this.fullscreenMaterial=this.compositeMaterial,a.setRenderTarget(this.renderToScreen?null:i),a.render(o,l)}dispose(){this.lastSourceRenderer=null,this.lastSourceSig.fill(Number.NaN),this.lastPlumeRenderer=null,this.lastPlumeSig.fill(Number.NaN),this.sourceTarget.dispose(),this.plumeTarget.dispose(),this.shadowTarget.dispose(),this.smokeTarget.dispose(),this.historyTarget.dispose(),this.noiseTexture.dispose(),this.sourceMaterial.dispose(),this.plumeMaterial.dispose(),this.shadowMaterial.dispose(),this.marchMaterial.dispose(),this.compositeMaterial.dispose()}}k(eh,"sourceGrid",We);const Pr=2,su=Bi*Oi,x0=.62,w0=1.75;function M0(e,t){const a=Math.max(1,e),s=Math.max(1,t),i=Math.min(w0,Math.max(x0,a/s)),o=Math.sqrt(su*i),l=su/o,u=o/(a*1e3),r=l/(s*1e3),c=Math.sqrt(u*r)*Pr;return{width:o,depth:l,unitsPerMetre:[u,c,r]}}function y0(e,t,a,s){const i=Math.max(350,a-t);return Math.min(i*1.15,Math.max(0,e-t))*s.unitsPerMetre[1]}const iu=.08,b0=.3,S0=3;function Ii(e){if(!e)return null;const{left:t,top:a,right:s,bottom:i}=e;if(![t,a,s,i].every(c=>Number.isFinite(c)))return null;const o=Math.min(1,Math.max(0,Math.min(t,s))),l=Math.min(1,Math.max(0,Math.max(t,s))),u=Math.min(1,Math.max(0,Math.min(a,i))),r=Math.min(1,Math.max(0,Math.max(a,i)));return l-o<iu||r-u<iu?null:{left:o,top:u,right:l,bottom:r}}function fr(e,t){return e===t?!0:!e||!t?!1:Math.abs(e.left-t.left)<1e-5&&Math.abs(e.top-t.top)<1e-5&&Math.abs(e.right-t.right)<1e-5&&Math.abs(e.bottom-t.bottom)<1e-5}const xt=new Br,ca=new B,Lt=new B,Fo=new B,Es=new B;function T0(e,t,a,s,i,o,l,u){let r=Number.POSITIVE_INFINITY,c=Number.NEGATIVE_INFINITY,h=Number.POSITIVE_INFINITY,v=Number.NEGATIVE_INFINITY;xt.fov=i,xt.aspect=o,xt.near=.1,xt.far=200,xt.clearViewOffset(),xt.updateProjectionMatrix(),ca.set(a.target[0],a.target[1],a.target[2]);const x=s>1e-4?[-s,0,s]:[0];for(const A of x){const z=a.azimuth+A,D=Math.sin(a.polar);xt.position.set(ca.x+a.distance*D*Math.sin(z),ca.y+a.distance*Math.cos(a.polar),ca.z+a.distance*D*Math.cos(z)),xt.up.set(0,1,0),xt.lookAt(ca),xt.updateMatrixWorld(!0);for(let T=0;T<t;T++)Lt.set(e[T*3],e[T*3+1],e[T*3+2]).project(xt),!(Lt.z>=1||Lt.z<=-1)&&(Lt.x<r&&(r=Lt.x),Lt.x>c&&(c=Lt.x),Lt.y<h&&(h=Lt.y),Lt.y>v&&(v=Lt.y))}if(!(c>r)||!(v>h))return u.scale=1,u.offsetX=0,u.offsetY=0,u;const y=(c-r)*.5,M=(v-h)*.5,E=(r+c)*.25+.5,g=.5-(h+v)*.25,p=l.right-l.left,b=l.bottom-l.top,F=Math.min(S0,Math.max(b0,Math.min(p/y,b/M)));return u.scale=F,u.offsetX=E*F-(l.left+l.right)*.5,u.offsetY=g*F-(l.top+l.bottom)*.5,u}const E0=.24,R0=.46,th=.03;function ah(e){return Math.min(R0,Math.max(E0,e.bottom+th))}function A0(e,t,a,s){xt.fov=a,xt.aspect=s,xt.near=.1,xt.far=200,xt.clearViewOffset(),xt.updateProjectionMatrix(),ca.set(e.target[0],e.target[1],e.target[2]);const i=Math.sin(e.polar);xt.position.set(ca.x+e.distance*i*Math.sin(t),ca.y+e.distance*Math.cos(e.polar),ca.z+e.distance*i*Math.cos(t)),xt.up.set(0,1,0),xt.lookAt(ca),xt.updateMatrixWorld(!0)}function k0(e,t,a,s,i,o,l,u){let r=Number.POSITIVE_INFINITY;const c=s>1e-4?[-s,0,s]:[0];for(const v of c){A0(a,a.azimuth+v,i,o);for(let x=0;x<t;x++){if(Lt.set(e[x*3],e[x*3+1],e[x*3+2]).project(xt),Lt.z>=1||Lt.z<=-1)continue;const y=Lt.x*.5+.5;if(y<l.left-.04||y>l.right+.04)continue;const M=.5-Lt.y*.5;M<r&&(r=M)}}if(u.scale=1,u.offsetX=0,!Number.isFinite(r))return u.offsetY=0,u;const h=ah(l);return u.offsetY=Math.min(.1,Math.max(-.42,r-h)),u}function _0(e){return Math.min(e.bottom,ah(e)-th)}function F0(e,t,a){const s=1-2*t;return Lt.set(-1,s,.5).unproject(e),ca.set(1,s,.5).unproject(e),Fo.setFromMatrixPosition(e.matrixWorld),Lt.sub(Fo),ca.sub(Fo),Es.crossVectors(ca,Lt).normalize(),Es.y<0&&Es.negate(),a.set(Es.x,Es.y,Es.z,-Es.dot(Fo))}function D0(e,t,a,s){if(Math.abs(s.scale-1)<4e-4&&Math.abs(s.offsetX)<4e-4&&Math.abs(s.offsetY)<4e-4){e.view!==null&&e.view.enabled&&e.clearViewOffset();return}e.setViewOffset(t*s.scale,a*s.scale,s.offsetX*t,s.offsetY*a,t,a)}const ou=gt.azimuth,P0=.62,Do=30,Po=.055,I0=[3.6,5,6.5,8],C0=[90,180,300,450,650,900],L0=2,N0=2.5,z0=.05,U0=.6,mr=.14,$s=150,nu=.3,B0=.03,_a=19,O0=1.7,H0=.6,ru={left:0,top:0,right:1,bottom:.34},G0=4,Xs=33,js=48,K0=3.2,Io=1.15,lu=6;function W0(e,t,a,s){return s.set(-t*Math.cos(e),-a*Math.sin(e)).normalize()}const cu=4,V0=4.4,Y0=4.6,$0=3.5,X0=3.2,j0=111.32;function pr(e){return Math.max(1,(e[3]-e[1])*j0)}const uu=-.11,q0=.065,ti=13,sh=5,Z0=ti*ti+4+sh,Rs=24;function Q0(e){const t=e==null?void 0:e.held_out_passes_answered_by;return typeof(t==null?void 0:t.method)=="string"&&t.method!=="reconstruction"}let vr=null;function gr(){return vr||(vr=new Uint8Array(Js*We*We*4)),vr}function xr(){return{source:"procedural_fallback",provenanceNote:"No run on show.",frames:Array.from({length:Js},()=>[])}}function J0(){const e=new aa(new Uint8Array([104,106,102,255]),1,1,Rt);return e.colorSpace=ot,e.needsUpdate=!0,e}function hu(e){return e.noRealGround?!1:(e.levelIsWater===void 0&&(e.levelIsWater=!Hr(e.alignedDem,e.demGridRes)),e.levelIsWater)}function ep(e){const t=e.toUpperCase();return t.includes("TERRA")?"MODIS_TERRA":t.includes("AQUA")?"MODIS_AQUA":t.includes("NOAA20")||t.includes("NOAA-20")||t.includes("JPSS")?"VIIRS_NOAA20":t.includes("SNPP")||t.includes("NPP")?"VIIRS_SNPP":null}function du(){if(typeof window>"u")return null;const e=new URLSearchParams(window.location.search).get("film");return e==="record"||e==="estimate"||e==="test"||e==="play"||e==="auto"?e:null}function tp(e,t){const a=e.runId!==null&&t.has(e.runId);if(!e.missingFiles&&!a)return;const s=(e.missingFiles??[]).filter(o=>!(e.pack&&(o==="elevation"||o==="imagery"))),i=a?[...s,"estimate"]:s;return i.length>0?i:void 0}const ap=[];function wr(e){return e.observerDataset.dataSource==="firms"?ap:e.callouts}function sp(e){const t=e.fieldScale??Zs;return{scale:t.kind==="linear"?"linear":"log",ticks:t.ticks??[0,.25,.5,.75,1].map(a=>({at:a,mwPerKm2:Cu(t,a)}))}}const ip=2.6,op=9,np=6,rp=9.5,lp=.08,Mr=8,cp=1,up=1.8,hp=.05,dp=12,fu=.12,mu=9,fp=1.22,yr=.94,mp=5,pu=1.5,pp=5,vu=2,gu=.8,br=3,Sr=22,xu=.75,wu=[1.1,.95,.8,.65],Tr=39,Mu=.375,yu=.3,vp=.4,bu=.43,gp=3,xp=.3,wp=24*3600*1e3,Mp=5,yp=.25,bp=50,Sp=15,Su=.4,Tu=.375,Tp=1.3,Ep=1.9,Rp=.044,Ap=1.08,kp=1.8,_p=2,Fp=e=>typeof e=="number"&&e>0?_.clamp(Math.pow(Math.max(1,Rp/e/Ap),kp),1,_p):1,Dp=[.64,.76],Pp=.7,Ip=1.2,Cp=.02,Lp=0,Np=1;function zp(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Bo(e,Np),1)}const Up=4,Bp=2500;function Op(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Bo(e,Up),Bo(e,Bp))}const Hp=.45;function Gp(e,t,a,s){if(e.dataSource!=="firms")return null;const[i,o,l,u]=t,r=Hp*Math.min(a,s);let c=-1,h=-1;return e.frames.forEach((v,x)=>{let y=0,M=!1,E=!1;const g=[],p=[];for(const T of v)if(!T.hidden){y+=T.footprints.length,T.family==="viirs"&&T.isDay===!1&&(M=!0),T.isDay===!1&&T.footprints.length>0&&(E=!0);for(const L of T.footprints)g.push((L.lon-i)/Math.max(1e-9,l-i)*a),p.push((L.lat-o)/Math.max(1e-9,u-o)*s)}if(y===0)return;g.sort((T,L)=>T-L),p.sort((T,L)=>T-L);const b=Math.floor(.05*(y-1)),F=Math.ceil(.95*(y-1)),z=Math.hypot(g[F]-g[b],p[F]-p[b])<=r,D=y+(E?1e5:0)+(E&&z?2e5:0)+(M?1e6:0)+(M&&z?1e7:0);D>h&&(h=D,c=x)}),c>=0?c:null}function Kp(e){var s;const t=e.attribution,a=((s=e.context)==null?void 0:s.manifest.ortho.attribution)??"";return a&&a!==t?t?`${t}; ${a}`:a:t}function Eu(e){return ns.includes(e)}function Oa(e,t){return e.resolveAsset?e.resolveAsset(t):Wp(e.apiBase,t)}function Ru(e){return`/isogon/${e}`}function Wp(e,t){if(t.startsWith("http://")||t.startsWith("https://")||t.startsWith("data:"))return t;const a=e.replace(/\/+$/,"");return t.startsWith("/")?`${a}${t}`:`${a}/${t}`}function Ci(e,t,a,s){const i=Math.min(1,Math.max(0,a))*(t-1),o=Math.min(1,Math.max(0,s))*(t-1),l=Math.floor(i),u=Math.floor(o),r=Math.min(t-1,l+1),c=Math.min(t-1,u+1),h=i-l,v=o-u,x=e[u*t+l],y=e[u*t+r],M=e[c*t+l],E=e[c*t+r],g=x+(y-x)*h,p=M+(E-M)*h;return g+(p-g)*v}const Vp=new B(.075,.098,.135),ih=new B(-.56,.64,.52).normalize();function Yp(e,t,a){const s=Bd(a),i=s?s.extent_km[0]:e,o=s?s.extent_km[1]:t,l=M0(i,o),u=ih.clone(),[r,c,h]=l.unitsPerMetre,v=new B(u.x/r,u.y/c,u.z/h).normalize();return s&&(Kd(s.sun.azimuth_deg,s.sun.elevation_deg,v),Wd(v,new B(r,c,h),u)),{widthKm:i,depthKm:o,frame:l,sunDir:u,sunTrue:v,packManifest:s}}const Au="Esri, Vantor, Earthstar Geographics, and the GIS User Community";function Er(e,t,a,s,i){const o=Yp(e,t,a),l=o.widthKm/Math.max(64,s);return{widthKm:o.widthKm,depthKm:o.depthKm,frame:o.frame,sunDir:o.sunDir,sunTrue:o.sunTrue,orthoTexelKm:l,sharpen:1,shadow:null,packManifest:o.packManifest,packState:"none",pack:null,lite:null,context:null,contextState:"none",auxTex:null,detailTex:null,detailRect:[0,0,1,1],detailTexelKm:l,attribution:i}}function As(e,t){return y0(e,t.minElevM,t.maxElevM,t.frame)}function Rr(e,t,a,s,i,o){return Ed(e,t,i,o,{gridSize:We,zMaxMwKm2:dd,sigmaMaxMwKm2:fd},(l,u)=>Ci(a,s,l,u))}function Zp(e){const t=Ct.useRef(null),a=Ct.useRef([null,null,null]),s=Ct.useRef([null,null,null]),i=Ct.useRef([null,null,null]),o=Ct.useRef(null),l=Ct.useRef(null),u=Ct.useRef(null),[r,c]=Ct.useState([]),h=Ct.useRef(new Map),v=Ct.useRef(new Set),x=Ct.useRef(e);x.current=e;const y=Ct.useRef(null);Ct.useEffect(()=>{const g=t.current;if(!g)return;let p=!1;if(!Rh())throw new Rc("unavailable");let b;try{b=new Wh({antialias:!1,alpha:!1,depth:!1,powerPreference:"high-performance",stencil:!1})}catch(n){throw new Rc("failed",n)}let F=Jc();b.setPixelRatio(F),b.setClearColor(new Uo("#080b11"),1),b.domElement.style.width="100%",b.domElement.style.height="100%",b.domElement.style.display="block",g.appendChild(b.domElement);const A=Math.min(16,b.capabilities.getMaxAnisotropy()||4),z=new Vh;z.setCrossOrigin("anonymous");const D=new ci,T=new Br(39,16/9,.12,140),L=new zm(b,D,T),U=new eh;L.insertScenePass(U);const K=new Set,G=n=>(n.smokeHeight||(n.smokeHeight=u0(n.alignedDem,n.demGridRes,m=>As(m,n),n.frame.width,n.frame.depth),K.add(n.smokeHeight)),n.smokeHeight);let X=1,ue=0;const oe=ih.clone(),Te=new Yh(16775922,V0);Te.position.copy(oe).multiplyScalar(20),D.add(Te);const ye=t0(b);D.environment=ye.texture;const ve=new Map,he=new Map;for(const n of ns){const m=Li[n],w=kc(n,256),d=ks(w,!1),R=_c(n,d.aligned,d.gridRes,d.minElev,d.maxElev,A),S=gr(),C=Rr(n,m.bbox,d.aligned,d.gridRes,S,Js);ve.set(n,{key:`proc-${n}`,regionId:n,runId:null,noRealGround:!0,noRealPicture:!0,demTex:d.texture,alignedDem:d.aligned,demGridRes:d.gridRes,minElevM:d.minElev,maxElevM:d.maxElev,satTex:R,orthoLabel:"drawn stand-in",demLabel:"512²",tensor:S,frameCount:Js,bbox:[...m.bbox],windDirUv:[...m.windDirUv],hasSeaCoast:m.hasSeaCoast,observerDataset:xr(),findings:C.anchors,callouts:C.callouts,fireHistory:null,...Er(m.widthKm,pr(m.bbox),null,512,"")})}const ht=b.extensions.has("OES_texture_float_linear"),fe=n=>(n.fireHistory||(n.fireHistory=Yd(n.tensor,n.frameCount,ht)),n.fireHistory),te=x.current.activeTheaterId;let Q=ve.get(te)??ve.get("plumas_ca"),f=Q;const at=[],At=n=>{n&&!at.includes(n)&&at.push(n)},Ht=()=>{const n=new Set,m=w=>{w&&(n.add(w),w.lite&&n.add(w.lite))};m(Q),m(f);for(const w of ve.values())m(w);for(const w of he.values())m(w);for(const w of ba.values())m(w);return n},Nt=()=>{var d,R;if(at.length===0)return;const n=Ht(),m=new Set;for(const S of n)m.add(S.demTex),m.add(S.satTex),m.add((d=S.fireHistory)==null?void 0:d.texture),m.add(S.shadow),m.add(S.smokeHeight);const w=S=>{!S||m.has(S)||(m.add(S),S.dispose())};for(const S of at)n.has(S)||(w(S.demTex),w(S.satTex),w((R=S.fireHistory)==null?void 0:R.texture),w(S.shadow),S.smokeHeight&&(K.delete(S.smokeHeight),w(S.smokeHeight)),S.fireHistory=null,S.shadow=null,S.smokeHeight=null,S.detectionSource=null);for(let S=at.length-1;S>=0;S--){const C=at[S];C===Q||C===f||C===Q.lite||C===f.lite||at.splice(S,1)}},Gt=(n,m)=>{const w=ve.get(n);ve.set(n,m),w&&w!==m&&At(w)},va=n=>{const m=he.get(n);return m&&(he.delete(n),he.set(n,m)),m},jt=(n,m,w)=>{for(Gt(n,w),he.set(m,w);he.size>G0;){const d=he.keys().next().value,R=he.get(d);he.delete(d),At(R)}};c(wr(f));const Ze=new Uint8Array(We*We*4),lt=new Uint8Array(We*We*4),qt=n=>{const m=new aa(n,We,We,Rt,Ut);return m.minFilter=Ga,m.magFilter=ze,m.generateMipmaps=!0,m.wrapS=Ve,m.wrapT=Ve,m.flipY=!1,m.needsUpdate=!0,m},Fe=qt(Ze),Le=qt(lt),ct=pd();let Ka=-1,Ia=-1,Wa=null;const hi=We*We,Wr=()=>{const n=new aa(new Uint8Array(hi),We,We,ku,Ut);return n.minFilter=ze,n.magFilter=ze,n.generateMipmaps=!1,n.flipY=!1,n.needsUpdate=!0,n},Gi=Wr(),Ki=Wr();let Vr="",Yr="";const oh=(n,m,w)=>{const d=n.detectionSource??(n.detectionSource=xf(n.observerDataset.frames,n.frameCount,n.bbox,[n.widthKm,n.depthKm],We)),R=`${n.key}:${m}`;R!==Vr&&(Gi.image.data.set(d.subarray(m*hi,(m+1)*hi)),Gi.needsUpdate=!0,Vr=R);const S=`${n.key}:${w}`;S!==Yr&&(Ki.image.data.set(d.subarray(w*hi,(w+1)*hi)),Ki.needsUpdate=!0,Yr=S)},Wi=new pf,oa=new wf,$r=h.current,Xr={value:0},$o={value:0},jr={value:0},qr={value:0};let Xo=null,Zr="";const jo=new Ne(0,0),Qr=Array.from({length:64},()=>new ma(0,0,0,0)),qo={value:-1};let Vi=null;const Zo=[];let Qo=1;const Va=new ma(0,1,0,0);let Jr=-1e9,el="",Jo=[];const tl=new Ne(0,0),al=new B(0,Zs.maxMwKm2,Zs.minMwKm2),sl=new Ne(.02,1),Yi=new Ne(.02,1),il={value:0},Cs=new Ne(0,0),en={value:0},tn={value:0},ol={value:1},$i=new Map;let Xi=!1,an;const Ls=new ma(0,1,1e4,.4);let nl=0,rl=0,ll=-1e9;const sn={value:0},Ya={value:0};let on="",Ns=[],ji=0,qi=0,nn=!1,di,cl="",ul="",hl=!1;const rn={value:0},fi={value:1};let ln,ls="";const cs=[],zs=[],Zi=[],mi={value:0},$a={value:1},cn={value:0};let dl="",fl=!1,Qi,pi="",vi="detections",ut=new Float32Array(0),us={patchOf:new Uint16Array(0),sizes:[]};const Qe=new Float64Array(Mr*7),hs=new Float64Array(Mr*3);let gi=!1,Ji="";const Kt=new Float64Array(38).fill(Number.NaN);let xi=null;const ml=(n,m,w)=>{const R=Math.min(1,Math.max(0,w))*Math.max(1,m-1),S=Math.min(m-1,Math.floor(R)),C=Math.min(m-1,S+1),ee=R-S,Z=We*We*4;return(Wa!==n||Ka!==S)&&(Ze.set(n.subarray(S*Z,(S+1)*Z)),Fe.needsUpdate=!0,Ka=S),(Wa!==n||Ia!==C)&&(lt.set(n.subarray(C*Z,(C+1)*Z)),Le.needsUpdate=!0,Ia=C),Wa=n,ee},nh=ml(f.tensor,f.frameCount,x.current.timeProgress),wi=new hd,eo=f.sunTrue.clone(),un=new B(1.4,1.29,1.17),pl=new B(.9,.8,.66),vl=n=>{const m=(n.minElevM+n.maxElevM)*5e-4;eo.copy(n.sunTrue),od(m,n.sunTrue.y,un),pl.fromArray(Uu(m,n.sunTrue.y))};vl(f);const gl={value:0},Xa={uNight:gl,uSkyView:{value:wi.skyView.texture},uTransmittanceLut:{value:wi.transmittance},uSunTrue:{value:eo},uCamAltKm:{value:8},uVerticalExaggeration:{value:Pr},uFloorColor:{value:new B(.044,.06,.094)},uFloorHaze:{value:.3},uSkyExposure:{value:Zn}},xl=new Pu(62,48,32),wl=new wt({vertexShader:cd,fragmentShader:ud,uniforms:Xa,side:Qs,depthWrite:!1}),hn=new pa(xl,wl);hn.renderOrder=-10,D.add(hn);const dn=new Ne(f.frame.width,f.frame.depth),Ml=new Ne(Q.frame.unitsPerMetre[1],f.frame.unitsPerMetre[1]),fn=new Ui(34,34,1,1);fn.rotateX(-Math.PI/2);const mn=new wt({vertexShader:wd,fragmentShader:Md,uniforms:{uSlabSize:{value:dn},uShadowMix:{value:1}},transparent:!0,depthWrite:!1}),to=new pa(fn,mn);to.position.y=Ds-.005,to.renderOrder=-2,D.add(to);const yl=W0(ou,f.frame.width,f.frame.depth,new Ne),bl=new Ne(Q.demGridRes,f.demGridRes),Sl=new Ne(Q.minElevM,Q.maxElevM),Tl=new Ne(f.minElevM,f.maxElevM),El=new Ne(f.widthKm,f.depthKm),Rl=new ma(1,0,0,0),Al=new ma(1,0,0,0),kl=new ma(0,0,0,0),Mi={...zc},yi={...zc},pn=new Ne(f.windDirUv[0],f.windDirUv[1]),_l=new B(...f.frame.unitsPerMetre),Fl=new ma(0,0,1,1),Dl=(n,m,w,d)=>{const R=new aa(new Uint8Array([n,m,w,d]),1,1,Rt,Ut);return R.needsUpdate=!0,R},vn=Dl(128,128,255,0),gn=Dl(255,255,255,255),Pl=new Om(b),Il=n=>(n.shadow||(n.shadow=Pl.bake(n.demTex,n.demGridRes,n.minElevM,n.maxElevM,n.frame.unitsPerMetre[1],n.frame.width,n.frame.depth,n.sunDir,n.demGridRes>=1024?2048:1024)),n.shadow.texture),Cl=n=>{const m=new Ui(1,1,n,n);return m.rotateX(-Math.PI/2),m.boundingSphere=new _u(new B(0,1,0),15),m},xn=Cl(Ou);let ds=null,bi=null;const I={uDemPrev:{value:Q.demTex},uDemNext:{value:f.demTex},uDemRes:{value:bl},uElevPrevRange:{value:Sl},uElevNextRange:{value:Tl},uMorph:{value:1},uSatPrev:{value:Q.satTex},uSatNext:{value:f.satTex},uFieldTex0:{value:Fe},uFieldTex1:{value:Le},uLipariTex:{value:ct},uFrameMix:{value:nh},uSunDir:{value:oe},uTime:{value:0},uCutawayMix:{value:1},uCutawayPlane:{value:0},uCutawayDir:{value:yl},uReconMix:{value:0},uObserverMix:{value:0},uModisWeight:{value:1},uViirsWeight:{value:1},uUncertaintyMix:{value:x.current.showUncertainty?1:0},uSensitivity:{value:x.current.sensitivityThreshold},uExtentKm:{value:El},uModisPass:{value:Rl},uViirsPass:{value:Al},uScanStrip:{value:kl},uLatticeMix:{value:1},uHasSeaCoast:{value:f.hasSeaCoast?1:0},uLakeMix:{value:hu(f)?1:0},uFireHist:{value:fe(f).texture},uFireTime:{value:0},uWindDirUv:{value:pn},uReliefScale:{value:Ml},uSlabSize:{value:dn},uAuxTex:{value:f.auxTex??vn},uAuxNormals:{value:1},uAuxMix:{value:0},uShadowTex:{value:Il(f)},uUnitsPerMetre:{value:_l},uOrthoTexelKm:{value:f.orthoTexelKm},uSatSharpen:{value:f.sharpen},uDetailTex:{value:gn},uDetailRect:{value:Fl},uDetailMix:{value:0},uDetailTexelKm:{value:f.detailTexelKm},uSmokeShadowTex:{value:U.shadowTarget.texture},uSunTrue:{value:eo},uSunColor:{value:un},uSunTransmittance:{value:pl},uHazeStrength:{value:ad},uSkyView:{value:wi.skyView.texture},uSkyExposure:{value:Zn},uEdgeFade:{value:0},uContextDem:{value:null},uContextRes:{value:1024},uContextScale:{value:5},uContextMix:{value:0},uContextOrtho:{value:null},uFloorColor:Xa.uFloorColor,uFloorHaze:Xa.uFloorHaze,uSmokeShadowMix:{value:0},uFootTex:{value:Wi.texture},uFootMix:{value:tl},uFieldScale:{value:al},uHeatRange:{value:sl},uBeliefGrid:{value:oa.grid},uBeliefBox:{value:oa.box},uTileGrid:{value:jo},uTileState:{value:Qr},uTileHover:qo,uScan:{value:Va},uPixelOutline:{value:0},uBeliefMix:Xr,uHeldOut:$o,uHeldOutOther:jr,uDeclaredGiven:qr,uChanceSquares:sn,uDayJoin:en,uDayFalse:tn,uMicroDetail:ol,uRevealArrive:{value:Ls},uAfterglow:mi,uLightGain:$a,uFarView:rn,uBeliefQuiet:cn,uLightModis:il,uLightTexels:{value:li},uRevealed:{value:Cs},uNight:Ya,uMoonLift:fi},Ll=new wt({vertexShader:Oc,fragmentShader:Qd,uniforms:I}),ao=new pa(xn,Ll);ao.frustumCulled=!1,D.add(ao);const Nl=new wt({vertexShader:Oc,fragmentShader:Zd,uniforms:I,colorWrite:!1,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),so=new pa(xn,Nl);so.frustumCulled=!1,so.renderOrder=-11,D.add(so);const io=new of({uSlabSize:I.uSlabSize,uElevNextRange:I.uElevNextRange,uReliefScale:I.uReliefScale,uUnitsPerMetre:I.uUnitsPerMetre,uSunDir:I.uSunDir,uSunTrue:I.uSunTrue,uSunColor:I.uSunColor,uSunTransmittance:I.uSunTransmittance,uHazeStrength:I.uHazeStrength,uSkyView:I.uSkyView,uSkyExposure:I.uSkyExposure,uFloorColor:I.uFloorColor,uFloorHaze:I.uFloorHaze,uContextDem:I.uContextDem,uContextRes:I.uContextRes,uContextScale:I.uContextScale,uContextMix:I.uContextMix,uContextOrtho:I.uContextOrtho,uNight:Ya,uMoonLift:fi});D.add(io.mesh);let ga=0;const zl=Fc(),rh={uDemPrev:I.uDemPrev,uDemNext:I.uDemNext,uDemRes:I.uDemRes,uElevPrevRange:I.uElevPrevRange,uElevNextRange:I.uElevNextRange,uReliefScale:I.uReliefScale,uSlabSize:I.uSlabSize,uMorph:I.uMorph,uSunDir:I.uSunDir,uCutawayMix:I.uCutawayMix,uCutawayPlane:I.uCutawayPlane,uCutawayDir:I.uCutawayDir,uEdgeFade:I.uEdgeFade,uContextDem:I.uContextDem,uContextRes:I.uContextRes,uContextScale:I.uContextScale,uContextMix:I.uContextMix,uNight:Ya,uMoonLift:fi},Ul=new wt({vertexShader:gd,fragmentShader:xd,uniforms:rh,side:_s}),Si=new pa(zl,Ul);Si.frustumCulled=!1,D.add(Si);const Bl=new ma(0,1,0,-1e4),ja=new o0(cu);D.add(ja.group);let Ol=!1;const oo=[];let wn=0;const ge={azimuth:gt.azimuth,polar:gt.polar,distance:gt.distance,target:new B(...gt.target)},Y={azimuth:gt.azimuth,polar:gt.polar,distance:gt.distance,target:new B(...gt.target)},qa=new Ad,Hl=new _d;let Mn=!1,ya=!1,Gl=!1,yn=0,no=Ni,Zt=1;const Je={width:f.frame.width,depth:f.frame.depth},Kl=()=>{Je.width=_.lerp(Q.frame.width,f.frame.width,Zt),Je.depth=_.lerp(Q.frame.depth,f.frame.depth,Zt),dn.set(Je.width,Je.depth)},Wt=n=>(n-.5)*Je.width,Vt=n=>(.5-n)*Je.depth,ro=n=>n/Je.width+.5,lo=n=>.5-n/Je.depth,Mt=(n,m)=>{const w=Ci(f.alignedDem,f.demGridRes,n,m),d=As(w,f);if(Zt>=.999||Q===f)return d;const R=Ci(Q.alignedDem,Q.demGridRes,n,m),S=As(R,Q);return S+(d-S)*Zt},co=()=>{I.uDemPrev.value=Q.demTex,I.uDemNext.value=f.demTex,bl.set(Q.demGridRes,f.demGridRes),Sl.set(Q.minElevM,Q.maxElevM),Tl.set(f.minElevM,f.maxElevM),I.uSatPrev.value=Q.satTex,I.uSatNext.value=f.satTex,El.set(f.widthKm,f.depthKm),I.uHasSeaCoast.value=f.hasSeaCoast?1:0,I.uLakeMix.value=hu(f)?1:0,pn.set(f.windDirUv[0],f.windDirUv[1]),I.uFireHist.value=fe(f).texture,Ml.set(Q.frame.unitsPerMetre[1],f.frame.unitsPerMetre[1]),_l.set(...f.frame.unitsPerMetre),Kl(),oe.copy(f.sunDir),vl(f),Te.position.copy(oe).multiplyScalar(20),I.uShadowTex.value=Il(f),I.uAuxTex.value=f.auxTex??vn,I.uAuxNormals.value=f.pack&&f.levelIsWater===!1?0:1,I.uOrthoTexelKm.value=f.orthoTexelKm,I.uSatSharpen.value=f.sharpen,I.uDetailTex.value=f.detailTex??gn,Fl.set(...f.detailRect),I.uDetailTexelKm.value=f.detailTexelKm,f.auxTex||(I.uAuxMix.value=0),f.detailTex||(I.uDetailMix.value=0);const n=f.context;I.uContextDem.value=(n==null?void 0:n.demTexture)??null,I.uContextOrtho.value=(n==null?void 0:n.orthoTexture)??null,I.uContextRes.value=(n==null?void 0:n.gridRes)??1024,I.uContextScale.value=(n==null?void 0:n.scale)??5,io.setContext(n),n||(ga=0,I.uContextMix.value=0)},ba=new Map,Wl=b.capabilities.maxTextureSize>=8192&&(navigator.deviceMemory??8)>=8,lh=()=>{ds||(ds=Cl(1023),bi=Fc(1023),ao.geometry=ds,so.geometry=ds,Si.geometry=bi)},Vl=(n,m,w)=>{const d=m.manifest.extent_km[0]/m.orthoSize;return{...n,key:`pack-${n.key}`,demTex:m.demTexture,alignedDem:m.alignedDem,levelIsWater:!m.levelInWholeMetres,demGridRes:m.demGridRes,minElevM:m.minElevM,maxElevM:m.maxElevM,satTex:m.orthoTexture,orthoLabel:m.orthoSize>=8192?"Esri 8K":"Esri 4K",demLabel:`${m.demGridRes}²`,orthoTexelKm:d,sharpen:0,shadow:(w==null?void 0:w.shadow)??null,pack:m,lite:n,auxTex:m.auxTexture,detailTex:(w==null?void 0:w.detailTex)??null,detailRect:(w==null?void 0:w.detailRect)??[0,0,1,1],detailTexelKm:(w==null?void 0:w.detailTexelKm)??d,context:(w==null?void 0:w.context)??null,contextState:(w==null?void 0:w.contextState)??"none",attribution:m.attribution||n.attribution}},Yl=n=>{var m,w,d,R,S,C;(m=n.pack)==null||m.dispose(),(w=n.detailTex)==null||w.dispose(),(d=n.shadow)==null||d.dispose(),(R=n.context)==null||R.dispose(),n.fireHistory&&n.fireHistory!==((S=n.lite)==null?void 0:S.fireHistory)&&n.fireHistory.texture.dispose(),n.smokeHeight&&n.smokeHeight!==((C=n.lite)==null?void 0:C.smokeHeight)&&(K.delete(n.smokeHeight),n.smokeHeight.dispose()),n.fireHistory=null,n.smokeHeight=null,n.detectionSource=null,n.context=null,n.pack=null,n.detailTex=null,n.shadow=null},bn=n=>{for(const[m,w]of ba)m===n||w===Q||w===f||(Yl(w),ba.delete(m))},ch=n=>{if(n.pack||!n.packManifest)return n;const m=ba.get(n.regionId);if(!(m!=null&&m.pack))return n;if(m.lite===n)return m;const w=Vl(n,m.pack,m);return ba.set(n.regionId,w),At(m),w},uh=n=>{var R;const m=n.pack,w=(R=m==null?void 0:m.manifest.ortho_detail)==null?void 0:R[0];if(!m||!w||!Wl||w.size>b.capabilities.maxTextureSize)return;const d=w.uv_rect;!Array.isArray(d)||d.length!==4||!(d[2]>d[0])||!(d[3]>d[1])||Ku(Oa(x.current,w.url),A).then(S=>{if(!S)return;const C=ba.get(n.regionId);if(p||!C||C.pack!==m){S.dispose();return}C.detailTex=S,C.detailRect=[d[0],d[1],d[2],d[3]],C.detailTexelKm=m.manifest.extent_km[0]*(d[2]-d[0])/w.size,f===C&&co()})},hh=n=>{const m=n.pack,w=Hc(m==null?void 0:m.manifest.context);!m||!w||n.context||n.contextState!=="none"||(n.contextState="loading",ef(w,{resolveUrl:d=>Oa(x.current,d),maxTextureSize:b.capabilities.maxTextureSize,maxAnisotropy:A,isCancelled:()=>p}).then(d=>{const R=ba.get(n.regionId);if(p||!R||R.pack!==m){d==null||d.dispose();return}R.contextState=d?"none":"failed",d&&(R.context=d,f===R&&co())}))},dh=n=>{const m=n.packManifest;!m||n.pack||n.packState!=="none"||(n.packState="loading",Gd(m,{resolveUrl:w=>Oa(x.current,w),maxTextureSize:Wl?b.capabilities.maxTextureSize:4096,maxAnisotropy:A,isCancelled:()=>p}).then(w=>{if(p){w==null||w.dispose();return}if(!w){n.packState="failed";return}if(n.packState="none",f!==n){w.dispose();return}bn(n.regionId);const d=Vl(n,w,null);ba.set(n.regionId,d),uo(d,!0),no=.62,uh(d),hh(d)}))},uo=(n,m)=>{if(p)return;const w=ch(n);if(w===f&&m)return;w.demGridRes>=1024&&lh();const d=f.regionId!==w.regionId;Gl=d,m?(Q=Zt<.5?Q:f,f=w,ya=!0,yn=0,no=Ni,Zt=0,I.uMorph.value=0):(Q=w,f=w,ya=!1,Zt=1,I.uMorph.value=1,bn(w.regionId),Nt()),d&&m&&(I.uAuxMix.value=0),co(),Wa=null,c(wr(w)),ps=!0,w.pack||dh(w)},$l=n=>{p||f.regionId===n.regionId&&(uo(n,!0),no=.62)},Xl=new WeakMap,fh=(n,m)=>{var rt,vt;let w=Xl.get(n);w||Xl.set(n,w=new Map);const d=w.get(m);if(d!==void 0)return d;if(w.set(m,null),n.observerDataset.dataSource!=="firms")return null;const[R,S,C,ee]=n.bbox,Z=Date.parse(((vt=(rt=n.observerDataset.frames[m])==null?void 0:rt[0])==null?void 0:vt.timeUtc)??""),re=[],ae=[];for(const me of n.observerDataset.frames)for(const Re of me){if(Re.hidden||Re.revealed)continue;const Ye=Date.parse(Re.timeUtc??""),xe=Number.isFinite(Z)&&Number.isFinite(Ye)&&Math.abs(Ye-Z)<=wp;for(const Me of Re.footprints){const Se=(Me.lon-R)/Math.max(1e-9,C-R),Oe=(Me.lat-S)/Math.max(1e-9,ee-S),Yt=Math.max(1,Me.frpMw);re.push(Se,Oe,Yt),xe&&ae.push(Se,Oe,Yt)}}const Ae=me=>{let Re=0,Ye=0,xe=0;for(let Me=0;Me<me.length;Me+=3)Re+=me[Me]*me[Me+2],Ye+=me[Me+1]*me[Me+2],xe+=me[Me+2];return xe>0?[Re/xe,Ye/xe]:null},Ee=(me,Re,Ye)=>Math.hypot((me[Re]-Ye[0])*n.widthKm,(me[Re+1]-Ye[1])*n.depthKm),Ue=(me,Re)=>{let Ye=0,xe=0;for(let Me=0;Me<me.length;Me+=3)xe+=me[Me+2],Ee(me,Me,Re)<Mp&&(Ye+=me[Me+2]);return xe>0?Ye/xe:0};let de=Ae(re);if(!de)return null;let be=re;const we=Ae(ae);we&&Ue(ae,de)<.1&&Ue(ae,we)>=.3&&(de=we,be=ae);let Ke=1/0;for(let me=0;me<be.length;me+=3)Ke=Math.min(Ke,Ee(be,me,de));if(Ke>pp){const me=Math.max(1,Math.ceil(n.widthKm/vu)),Re=Math.max(1,Math.ceil(n.depthKm/vu)),Ye=Di(new Float32Array(be),me,Re),xe=new Float64Array(Ye.sizes.length),Me=new Float64Array(Ye.sizes.length*2);for(let Oe=0;Oe<Ye.patchOf.length;Oe++){const Yt=Ye.patchOf[Oe],Ce=be[Oe*3+2];xe[Yt]+=Ce,Me[Yt*2]+=Ce*be[Oe*3],Me[Yt*2+1]+=Ce*be[Oe*3+1]}let Se=0;for(let Oe=1;Oe<xe.length;Oe++)xe[Oe]>xe[Se]&&(Se=Oe);xe[Se]>0&&(de=[Me[Se*2]/xe[Se],Me[Se*2+1]/xe[Se]])}return w.set(m,de),de};let ho=1;const Ca=(n,m,w,d)=>{var ys;const R=!!x.current.tileBoard,S=Pc(n,m,w,d,R);if(m&&R&&n==="region"&&ho>1)return{...S,distance:S.distance*ho};if(!m||n!=="canyon"&&n!=="ridge")return S;const C=n==="canyon"?"subpixel":"front",ee=f.findings.find(le=>le.kind===C),Z=f.observerDataset.frames.length,re=Math.min(Z-1,Math.max(0,Math.round(_.clamp(x.current.timeProgress,0,1)*(Z-1)))),ae=fh(f,re);if(!ee&&!ae)return S;const[Ae,Ee,Ue,de]=f.bbox;let be=ae?_.clamp(ae[0],.1,.9):_.clamp((ee.lon-Ae)/Math.max(1e-4,Ue-Ae),.2,.8),we=ae?_.clamp(ae[1],.1,.9):_.clamp((ee.lat-Ee)/Math.max(1e-4,de-Ee),.2,.8);const Ke=n==="canyon"?(ys=f.declared)==null?void 0:ys.byFrame.get(re):void 0;let rt=null,vt=null;if(Ke&&Ke.length>0&&f.declared)rt=f.declared,vt=Ke;else if(n==="canyon"&&vi==="estimate"&&ut.length>0&&f.runId){const le=$r.get(f.runId);if(le){const{nx:$e,ny:et}=le.info,je=new Set;for(let St=0;St<ut.length;St+=3){const ft=Math.min($e-1,Math.max(0,Math.floor(ut[St]*$e))),ne=Math.min(et-1,Math.max(0,Math.floor((1-ut[St+1])*et)));je.add(ne*$e+ft)}rt={nx:$e,ny:et},vt=Uint32Array.from(je)}}let me=null,Re=null;if(rt&&vt&&vt.length>0){const le=vt,{nx:$e,ny:et}=rt,je=new Float32Array(le.length*3);le.forEach((He,se)=>{je[se*3]=(He%$e+.5)/$e,je[se*3+1]=1-(Math.floor(He/$e)+.5)/et,je[se*3+2]=1});const St=Di(je,$e,et);let ft=0;for(let He=0;ft<St.sizes.length&&He<xu*le.length;ft++)He+=St.sizes[ft];let ne=1,ke=0,De=1,tt=0;me=[],Re=[];for(let He=0;He<le.length;He++){const se=le[He],Pe=se%$e/$e,Tt=1-Math.floor(se/$e)/et,_t=Pe+1/$e,Ft=Tt-1/et;Re.push(Pe,Ft,_t,Ft,Pe,Tt,_t,Tt),!(St.patchOf[He]>=ft)&&(ne=Math.min(ne,Pe),ke=Math.max(ke,_t),De=Math.min(De,Ft),tt=Math.max(tt,Tt),me.push(Pe,Ft,_t,Ft,Pe,Tt,_t,Tt))}be=_.clamp((ne+ke)/2,.05,.95),we=_.clamp((De+tt)/2,.05,.95)}const Ye=Wt(be),xe=Vt(we),Me=Math.hypot(Ye,xe),Se=Math.atan2(-Ye,-xe),Oe=_.smoothstep(Me,.8,3.2),Yt=Math.atan2(f.sunDir.x,f.sunDir.z);let Ce=S.azimuth,Ms=-1e9;for(let le=0;le<72;le++){const $e=le/72*Math.PI*2-Math.PI;let et=$e-ou;for(;et>Math.PI/2;)et-=Math.PI;for(;et<-Math.PI/2;)et+=Math.PI;if(Math.abs(et)>P0)continue;let je=Math.abs($e-Yt)%(Math.PI*2);je>Math.PI&&(je=Math.PI*2-je);const ft=1-Math.min(1,Math.abs(je-Io)/Io)+.9*Oe*Math.cos($e-Se)+.2*Math.cos($e-S.azimuth);ft>Ms&&(Ms=ft,Ce=$e)}let $t=[Ye,Mt(be,we)+.1,xe],Ra=S.distance,Jt=S.polar;if(me&&Re){const le=$t,$e=je=>{let St={target:le,distance:S.distance,polar:S.polar};for(const ft of[S.polar,...wu].filter(ne=>ne<=S.polar)){let ne=le,ke={distance:S.distance,fits:!1};for(let De=0;De<3&&(ke=Zl(je,ne,Ce,ft),De!==2);De++)ne=ql(je,ne,Ce,ft,ke.distance);if(St={target:ne,distance:ke.distance,polar:ft},ke.fits)break}return St};let et=$e(me);Re.length>me.length&&vh(Re,et.target,Ce,et.polar,et.distance)&&(et=$e(Re)),$t=et.target,Ra=et.distance,Jt=et.polar}const ea=n==="canyon"?mh(f,re):null;if(ea&&ea.length>0){const le=Mu/Math.max(.001,f.widthKm),$e=Mu/Math.max(.001,f.depthKm),et=Math.max(1,Math.round(1/le)),je=Math.max(1,Math.round(1/$e)),St=new Float32Array(ea.length/2*3);for(let se=0,Pe=0;se<ea.length;se+=2,Pe+=3)St[Pe]=ea[se],St[Pe+1]=ea[se+1],St[Pe+2]=1;const ft=Di(St,et,je);let ne=0;const ke=ea.length/2;for(let se=0;ne<ft.sizes.length&&se<xu*ke;ne++)se+=ft.sizes[ne];const De=me?[...me]:[],tt=[];for(let se=0;se<ke;se++){if(ft.patchOf[se]>=ne)continue;const Pe=ea[se*2]-le/2,Tt=ea[se*2+1]-$e/2;De.push(Pe,Tt,Pe+le,Tt,Pe,Tt+$e,Pe+le,Tt+$e),tt.push(ea[se*2],ea[se*2+1])}if(ph(De,$t,Ce,Jt,Ra*yr)||jl(tt,$t,Ce,Jt,Ra)>yu){const se=$t;let Pe=null;for(const Tt of[Jt,...wu].filter(_t=>_t<=Jt)){let _t=se,Ft={distance:Ra,fits:!1};for(let Xt=0;Xt<3&&(Ft=Zl(De,_t,Ce,Tt),Xt!==2);Xt++)_t=ql(De,_t,Ce,Tt,Ft.distance);const za=jl(tt,_t,Ce,Tt,Ft.distance),bs={target:_t,distance:Ft.distance,polar:Tt,fits:Ft.fits,hidden:za};if(Ft.fits&&za<=yu){Pe=bs;break}(!Pe||bs.fits&&(!Pe.fits||za<Pe.hidden))&&(Pe=bs)}Pe&&($t=Pe.target,Ra=Pe.distance,Jt=Pe.polar)}}return{...S,azimuth:Ce,polar:Jt,distance:Ra,target:$t}},mh=(n,m)=>{if(n.observerDataset.dataSource!=="firms")return null;const[w,d,R,S]=n.bbox,C=[];for(const ee of n.observerDataset.frames[m]??[])if(!(!ee.revealed||ee.revealedByLook))for(const Z of ee.footprints)C.push((Z.lon-w)/Math.max(1e-9,R-w),(Z.lat-d)/Math.max(1e-9,S-d));return C.length>0?C:null},ph=(n,m,w,d,R)=>{const S=Ii(x.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},C=Math.tan(_.degToRad(Tr/2)),ee=(S.right-S.left)*C*T.aspect,Z=(S.bottom-S.top)*C,re=new B().setFromSphericalCoords(1,d,w),ae=re.clone().negate(),Ae=new B().crossVectors(ae,new B(0,1,0)).normalize(),Ee=new B().crossVectors(Ae,ae),Ue=new B(m[0],m[1],m[2]).addScaledVector(re,R),de=new B;for(let be=0;be<n.length;be+=2){de.set(Wt(n[be]),Mt(n[be],n[be+1]),Vt(n[be+1])).sub(Ue);const we=de.dot(ae);if(we<=.05||Math.abs(de.dot(Ae)/we)>ee||Math.abs(de.dot(Ee)/we)>Z)return!0}return!1},jl=(n,m,w,d,R)=>{if(n.length===0)return 0;const S=new B().setFromSphericalCoords(1,d,w),C=m[0]+S.x*R,ee=m[1]+S.y*R,Z=m[2]+S.z*R;let re=0;for(let ae=0;ae<n.length;ae+=2){const Ae=n[ae],Ee=n[ae+1],Ue=Wt(Ae),de=Mt(Ae,Ee),be=Vt(Ee);for(let we=1;we<32;we++){const Ke=we/32,rt=ro(C+(Ue-C)*Ke),vt=lo(Z+(be-Z)*Ke);if(!(rt<0||rt>1||vt<0||vt>1)&&Mt(rt,vt)>ee+(de-ee)*Ke+.012){re+=1;break}}}return re/(n.length/2)},vh=(n,m,w,d,R)=>{const S=Ii(x.current.workspaceSubjectFrame)??{top:0,bottom:1},C=(S.bottom-S.top)*Math.tan(_.degToRad(Tr/2)),ee=new B().setFromSphericalCoords(1,d,w),Z=ee.clone().negate(),re=new B().crossVectors(Z,new B(0,1,0)).normalize(),ae=new B().crossVectors(re,Z),Ae=new B(m[0],m[1],m[2]).addScaledVector(ee,R),Ee=new B;for(let Ue=0;Ue<n.length;Ue+=2){Ee.set(Wt(n[Ue]),Mt(n[Ue],n[Ue+1]),Vt(n[Ue+1])).sub(Ae);const de=Ee.dot(Z);if(de>.05&&Ee.dot(ae)/de<-C)return!0}return!1},ql=(n,m,w,d,R)=>{const S=new B().setFromSphericalCoords(1,d,w),C=S.clone().negate(),ee=new B().crossVectors(C,new B(0,1,0)).normalize(),Z=new B().crossVectors(ee,C),re=new B(m[0],m[1],m[2]).addScaledVector(S,R);let ae=1/0,Ae=-1/0,Ee=1/0,Ue=-1/0;const de=new B;for(let me=0;me<n.length;me+=2){de.set(Wt(n[me]),Mt(n[me],n[me+1]),Vt(n[me+1])).sub(re);const Re=de.dot(C);if(Re<=.05)continue;const Ye=de.dot(ee)/Re,xe=de.dot(Z)/Re;ae=Math.min(ae,Ye),Ae=Math.max(Ae,Ye),Ee=Math.min(Ee,xe),Ue=Math.max(Ue,xe)}if(!Number.isFinite(ae))return m;const be=C.clone().addScaledVector(ee,(ae+Ae)/2).addScaledVector(Z,(Ee+Ue)/2);if(be.y>=-1e-4)return m;const we=(m[1]-re.y)/be.y,Ke=re.clone().addScaledVector(be,we),rt=_.clamp(Ke.x/Je.width+.5,.05,.95),vt=_.clamp(.5-Ke.z/Je.depth,.05,.95);return[Wt(rt),Mt(rt,vt)+.1,Vt(vt)]},Zl=(n,m,w,d)=>{const R=Ii(x.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},S=Math.tan(_.degToRad(Tr/2)),C=(R.right-R.left)*S*T.aspect*gu,ee=(R.bottom-R.top)*S*gu,Z=[];for(let we=0;we<n.length;we+=2)Z.push(Wt(n[we]),Mt(n[we],n[we+1]),Vt(n[we+1]));const re=new B().setFromSphericalCoords(1,d,w),ae=re.clone().negate(),Ae=new B().crossVectors(ae,new B(0,1,0)).normalize(),Ee=new B().crossVectors(Ae,ae),Ue=we=>{const Ke=m[0]+re.x*we,rt=m[1]+re.y*we,vt=m[2]+re.z*we;for(let me=0;me<Z.length;me+=3){const Re=Z[me]-Ke,Ye=Z[me+1]-rt,xe=Z[me+2]-vt,Me=Re*ae.x+Ye*ae.y+xe*ae.z;if(Me<=.05||Math.abs((Re*Ae.x+Ye*Ae.y+xe*Ae.z)/Me)>C||Math.abs((Re*Ee.x+Ye*Ee.y+xe*Ee.z)/Me)>ee)return!1}return!0};if(Ue(br))return{distance:br,fits:!0};if(!Ue(Sr))return{distance:Sr,fits:!1};let de=br,be=Sr;for(let we=0;we<22;we++){const Ke=(de+be)/2;Ue(Ke)?be=Ke:de=Ke}return{distance:be,fits:!0}},gh=n=>{var ft;const m=f,[w,d,R,S]=m.bbox,C=m.findings.find(ne=>ne.kind==="front")??m.findings.find(ne=>ne.kind==="subpixel")??m.findings[0];let ee=.5,Z=.5;C&&(ee=_.clamp((C.lon-w)/Math.max(1e-4,R-w),.25,.75),Z=_.clamp((C.lat-d)/Math.max(1e-4,S-d),.25,.75));const re=m.observerDataset.dataSource==="firms";if(re){const ne=Math.min(m.frameCount-1,Math.max(0,Math.round(_.clamp(n,0,1)*(m.frameCount-1))));let ke=0,De=0,tt=0;for(const He of m.observerDataset.frames[ne]??[])if(!He.hidden)for(const se of He.footprints)ke+=se.frpMw,De+=se.frpMw*(se.lon-w)/Math.max(1e-4,R-w),tt+=se.frpMw*(se.lat-d)/Math.max(1e-4,S-d);ke>0&&(ee=_.clamp(De/ke,.15,.85),Z=_.clamp(tt/ke,.15,.85))}const ae=m.frame.width,Ae=m.frame.depth,Ee=ae*.5,Ue=Ae*.5,de=(ne,ke)=>As(Ci(m.alignedDem,m.demGridRes,ne/ae+.5,.5-ke/Ae),m),be=Hc((ft=m.packManifest)==null?void 0:ft.context)!==null&&m.contextState!=="failed",we=(ee-.5)*ae,Ke=(.5-Z)*Ae,rt=de(we,Ke)+.05,vt=Math.min(m.frameCount-1,Math.max(0,Math.round(_.clamp(n,0,1)*(m.frameCount-1)))),me=vt*We*We*4,Re=[],Ye=(ne,ke,De)=>{Re.push(ne,de(ne,ke)+.03,ke,(de(ne-.1,ke)-de(ne+.1,ke))/.2,(de(ne,ke-.1)-de(ne,ke+.1))/.2,De)};if(m.observerDataset.dataSource==="firms"){const ne=[];for(const tt of m.observerDataset.frames[vt]??[])if(!tt.hidden)for(const He of tt.footprints)ne.push(He);const ke=Math.max(1,Math.ceil(ne.length/320)),De=m.frame.unitsPerMetre[0]*m.frame.unitsPerMetre[2]*1e6;for(let tt=0;tt<ne.length;tt+=ke){const He=ne[tt],se=((He.lon-w)/Math.max(1e-4,R-w)-.5)*ae,Pe=(.5-(He.lat-d)/Math.max(1e-4,S-d))*Ae;Math.abs(se)>Ee||Math.abs(Pe)>Ue||Ye(se,Pe,He.acrossTrackKm*He.alongTrackKm*De*ke)}}else{const ne=3*ae/(We-1)*(3*Ae/(We-1));for(let ke=2;ke<We-2;ke+=3)for(let De=2;De<We-2;De+=3)m.tensor[me+(ke*We+De)*4]/255<=Hi||Ye((De/(We-1)-.5)*ae,(.5-ke/(We-1))*Ae,ne)}const xe=Re.length/6,Me=Math.tan(Do*Math.PI/360),Se=4*Me*Me*1.6,Oe=2*Math.atan(Me*(16/9))/1920,Yt=Math.min(N0,m.orthoTexelKm*1e3*m.frame.unitsPerMetre[0]/(L0*Oe)),Ce=de(we-.12,Ke)-de(we+.12,Ke),Ms=de(we,Ke-.12)-de(we,Ke+.12),$t=Math.hypot(Ce,Ms)||1,Ra=Math.atan2(m.sunDir.x,m.sunDir.z),Jt=Math.hypot(m.windDirUv[0]*ae,m.windDirUv[1]*Ae)||1,ea=m.windDirUv[0]*ae/Jt,ys=-m.windDirUv[1]*Ae/Jt,le=Math.atan(Math.tan(Do*Math.PI/360)*(16/9))+Po;let $e={...gt,target:[we,rt,Ke]},et=-1e9;const je={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0},St=m.frame.unitsPerMetre[1];for(const ne of I0)for(let ke=0;ke<48;ke++){const De=ke/48*Math.PI*2-Math.PI,tt=we+ne*Math.sin(De),He=Ke+ne*Math.cos(De);if(Ee-Math.abs(tt)<.35||Ue-Math.abs(He)<.35)continue;let se=de(tt,He);for(const Xt of[-1,1]){const Dt=De+Xt*Po;se=Math.max(se,de(we+ne*Math.sin(Dt),Ke+ne*Math.cos(Dt)))}let Pe=Math.abs(De-Ra)%(Math.PI*2);Pe>Math.PI&&(Pe=Math.PI*2-Pe);const Tt=1-Math.min(1,Math.abs(Pe-Io)/Io),_t=Math.sin(De)*ea+Math.cos(De)*ys,Ft=Math.max(0,_t),za=be?.45*Math.max(0,-_t)+(re?.16:-.12)*ne:0,bs=(Ce*Math.sin(De)+Ms*Math.cos(De))/$t;for(let Xt=0;Xt<_a;Xt++){const Dt=-le+2*le*Xt/(_a-1),Aa=De+Math.PI-Dt,ts=Math.sin(Aa),Ss=Math.cos(Aa);let wa=0;for(;wa<$s;wa++){const na=.3+wa*mr,as=tt+ts*na,Ua=He+Ss*na;if(Math.abs(as)>Ee||Math.abs(Ua)>Ue)break;mo[Xt*$s+wa]=de(as,Ua)}En[Xt]=wa}for(const Xt of C0){const Dt=se+Xt*St;let Aa=1e6;for(let $=1;$<10;$++){const qe=$/10;Aa=Math.min(Aa,Dt+(rt-Dt)*qe-de(tt+(we-tt)*qe,He+(Ke-He)*qe))}if(Aa<.03)continue;let ts=0,Ss=0,wa=0,na=-1e6,as=0,Ua=0,Ri=0;for(let $=0;$<_a;$++){const qe=-le+2*le*$/(_a-1),V=En[$];let N=-1e6,j=0,q=0;for(let ce=0;ce<V;ce++){const Ge=.3+ce*mr,Be=(mo[$*$s+ce]-Dt)/Ge;Be>N?(j>=2&&Ge>ne&&q++,N=Be,j=0):Be<N-.004&&j++}if(N<0){const ce=V>0?mo[$*$s+V-1]:1;be||m.hasSeaCoast&&ce<.004?Ss++:ts++}wa+=Math.max(N,-.2),na=Math.max(na,N),Math.abs(qe)<le*.55&&(as+=q,Ua=Math.max(Ua,q),Ri++)}const Hs=na-.59*2*Me;let ss=1e6;for(let $=0;$<_a;$++){const qe=En[$];for(let V=0;V<qe;V++){const N=.3+V*mr;if(N>=ss)break;const j=mo[$*$s+V];if(j>.004&&(j-Dt)/N>Hs){ss=N;break}}}const Ao=na-(rt-Dt)/ne;let Ai=0,ki=0,Gs=0;const ko=na-U0*(na-Hs);for(let $=0;$<xe;$++){const qe=Re[$*6],V=Re[$*6+1],N=Re[$*6+2],j=Math.hypot(qe-tt,N-He);if(j<.5)continue;let q=Math.atan2(qe-tt,N-He)-(De+Math.PI);if(q-=Math.round(q/(Math.PI*2))*Math.PI*2,Math.abs(q)>le*.8)continue;const ce=(V-Dt)/j;if(ce<ko&&ki++,ce<Hs||ce>na)continue;let Ge=!0;for(let Be=1;Be<8&&Ge;Be++){const st=Be/8;Dt+(V-Dt)*st<de(tt+(qe-tt)*st,He+(N-He)*st)-.01&&(Ge=!1)}if(Ge){Ai++;const Be=Re[$*6+3],st=Re[$*6+4],Pt=tt-qe,Et=Dt-V,ta=He-N,ra=Pt*Pt+Et*Et+ta*ta,ha=Math.max(0,(Be*Pt+Et+st*ta)/(Math.hypot(Be,1,st)*Math.sqrt(ra)));Gs+=Re[$*6+5]*Math.hypot(Be,1,st)*ha/(ra*Se)}}const P=xe>0?Ai/xe:0,H=ts/_a,W=Ss/_a,O=as/Math.max(1,Ri),J=wa/_a,ie=-9*H-(ts>0?3:0)-.6*W+1.1*Math.min(O,2)+.3*Math.min(Math.max(O-2,0),1)+.8*Tt+.5*_.clamp(bs*2,-1,1)+(re?4*P:2.4*Math.min(P,.5))+2.5*Math.min(1,Gs/z0)-(re&&xe>0?7*ki/xe:0)-.5*Ft+za-(ss<Yt?5+4*(1-ss/Yt):0)-8*Math.max(0,Ao-.2)-4*Math.max(0,.04-J);if(ie>et){et=ie;const $=Math.hypot(ne,Dt-rt);$e={azimuth:De,polar:Math.acos(_.clamp((Dt-rt)/$,-1,1)),distance:$,target:[we,rt,Ke]},je.floorShare=H,je.seaShare=W,je.ridgeLines=O,je.ridgeLinesMost=Ua,je.fireShare=P,je.fireFrameShare=Gs,je.carryDistance=Yt,je.skylineDeg=Math.atan(J)*180/Math.PI,je.eyeAboveGroundM=Xt,je.nearGround=ss}}}return fo=je,$e};let La=null,Ql="",Sn=!1;const xh=(n,m)=>{const w=Math.min(32,Math.max(1,Math.round(m))),d=[];T.updateMatrixWorld();for(let R=0;R<=w;R++)for(let S=0;S<=w;S++){const C=S/w,ee=1-R/w,Z=As(Ci(n.alignedDem,n.demGridRes,C,ee),n);Ti.set((C-.5)*Je.width,Z,(.5-ee)*Je.depth).project(T),d.push(Ti.z>1||Ti.z<-1?null:[(Ti.x*.5+.5)*dt,(.5-Ti.y*.5)*yt])}return{divisions:w,points:d}},Ti=new B,Tn=n=>n.landingFrame===void 0?n.landingFrame=Gp(n.observerDataset,n.bbox,n.widthKm,n.depthKm):n.landingFrame,Jl=()=>{const n=f.contextState==="failed"?`${f.key}!`:f.key;if(!La||Ql!==n){const m=Tn(f);La=gh(m!==null?m/Math.max(1,f.frameCount-1):x.current.timeProgress),Ql=n,xs=Rs}return La};let fo={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0};const mo=new Float32Array(_a*$s),En=new Int32Array(_a),ec=(n,m,w)=>{const d=n.context;if(!d)return 0;const R=n.frame,[S,C,ee]=R.unitsPerMetre,Z=Math.hypot(Math.max(Math.abs(m)-R.width*.5,0)/(S*1e3),Math.max(Math.abs(w)-R.depth*.5,0)/(ee*1e3)),re=.25*(R.width/S+R.depth/ee)*.001;return(nf(d,m/(R.width*d.scale)+.5,.5-w/(R.depth*d.scale))-n.minElevM-tf(Z,re)*1e3)*C},fs=new Float32Array((Xs*Xs+js*js)*3),wh=()=>{let n=0;for(let w=0;w<Xs;w++){const d=w/(Xs-1);for(let R=0;R<Xs;R++){const S=R/(Xs-1);fs[n*3]=Wt(S),fs[n*3+1]=Mt(S,d),fs[n*3+2]=Vt(d),n++}}const m=f.context;if(m&&ga>.5){const w=f.frame;for(let d=0;d<js;d++){const R=d/(js-1);for(let S=0;S<js;S++){const ee=(S/(js-1)-.5)*w.width*m.scale,Z=(.5-R)*w.depth*m.scale;Math.abs(ee)<=w.width*.5&&Math.abs(Z)<=w.depth*.5||(fs[n*3]=ee,fs[n*3+1]=ec(f,ee,Z),fs[n*3+2]=Z,n++)}}}return n};let xa=!1;const Rn=du();let Qt=null,tc="",ac=null,ms=!!(x.current.filmMove??Rn)&&!x.current.inWorkspace,An=0,kn=-1,sc=null;ms&&(b.domElement.style.opacity="0");let _n=!1,po=0,Za=0,Us=!0,kt=null,Bt=null,Bs=0,Qa=null,ps=!1,ic=!1,oc=!1;const Fn=n=>{ge.azimuth=n.azimuth,ge.polar=n.polar,ge.distance=n.distance,ge.target.set(n.target[0],n.target[1],n.target[2])},Mh=n=>{const m=x.current,w=ve.get(n);w&&w!==f&&uo(w,!0);const d=Ca(m.cameraPreset,m.inWorkspace,m.mode,n);qa.trigger(Y,d,2.15,Ni),xa=!1,ps=!1},yh=()=>{const n=x.current;qa.cancel(),!n.inWorkspace&&n.landingView!=="slab"?(Jl(),ge.azimuth=Y.azimuth,ge.polar=Y.polar,ge.distance=Y.distance,ge.target.copy(Y.target)):Fn(Ca(n.cameraPreset,n.inWorkspace,n.mode,n.activeTheaterId)),xa=!1,ps=!1},bh=n=>{if(n&&!Mn)qa.cancel(),Hl.startAtTheater(x.current.activeTheaterId);else if(!n&&Mn){const m=new B(0,.65,0);T.getWorldDirection(m),m.multiplyScalar(10.5).add(T.position),Fd(T.position,m,Y),ge.azimuth=Y.azimuth,ge.polar=Y.polar,ge.distance=Y.distance,ge.target.copy(Y.target),T.up.set(0,1,0)}Mn=n};y.current={activateBundle:uo,upgradeBundleInPlace:$l,bundleCache:ve,takeRunBundle:va,storeRunBundle:jt,onScreenRegionId:()=>f.regionId,maxAnisotropy:A,texLoader:z,triggerSlew:Mh,applyCameraPreset:yh,syncCinemaStart:bh},(async()=>{try{const n=await fetch(Ru("generated/terrain/ca_dem_f32.bin")).catch(()=>null),m=new Promise(Ae=>{z.load(Ru("generated/terrain/ca_satellite.jpg"),Ee=>{Ee.colorSpace=ot,Ee.anisotropy=A,Ee.wrapS=Ve,Ee.wrapT=Ve,Ae(Ee)},void 0,()=>Ae(null))}),[w,d]=await Promise.all([n&&n.ok?n.arrayBuffer():Promise.resolve(null),m]);if(p)return;const R=ve.get("plumas_ca");if(!R||R.runId!==null)return;const S=Li.plumas_ca,C=w?ks(new Float32Array(w),!0):{texture:R.demTex,aligned:R.alignedDem,gridRes:R.demGridRes,minElev:R.minElevM,maxElev:R.maxElevM},ee={buffer:gr(),frames:Js},Z=xr(),re=Rr("plumas_ca",S.bbox,C.aligned,C.gridRes,ee.buffer,ee.frames),ae={...R,...Er(S.widthKm,pr(S.bbox),null,1024,d?Au:""),fireHistory:null,key:"static-plumas_ca",noRealGround:w?void 0:R.noRealGround,noRealPicture:d?void 0:R.noRealPicture,demTex:C.texture,alignedDem:C.aligned,demGridRes:C.gridRes,minElevM:C.minElev,maxElevM:C.maxElev,satTex:d??R.satTex,orthoLabel:"1K",demLabel:`${C.gridRes}²`,tensor:ee.buffer,frameCount:ee.frames,observerDataset:Z,findings:re.anchors,callouts:re.callouts};Gt("plumas_ca",ae),$l(ae)}catch{}})();let dt=Math.max(1,g.clientWidth),yt=Math.max(1,g.clientHeight);const Dn=()=>{g&&(dt=Math.max(1,g.clientWidth),yt=Math.max(1,g.clientHeight),F=Jc(),L.setSize(dt,yt,F),T.aspect=dt/yt)};Dn();const nc=new ResizeObserver(Dn);nc.observe(g);let Ja=null;const Pn=()=>{Dn(),rc()},rc=()=>{Ja==null||Ja.removeEventListener("change",Pn),Ja=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`),Ja.addEventListener("change",Pn)};rc();let Sa=!1,lc=0,In=0,Cn=0,vo=0,go=Number.NaN,Ln=Number.NaN,cc=!1;const xo=new B,Nn=new $h,uc=new Ne,hc=(n,m,w,d)=>{const R=b.domElement.getBoundingClientRect();if(R.width<=0||R.height<=0||n<R.left||n>R.right||m<R.top||m>R.bottom)return null;uc.set((n-R.left)/R.width*2-1,-((m-R.top)/R.height)*2+1),Nn.setFromCamera(uc,T);const S=Nn.ray.origin,C=Nn.ray.direction,ee=Math.max(.02,Je.width/400);for(let Z=0;Z<Je.width*6;Z+=ee){const re=S.x+C.x*Z,ae=S.y+C.y*Z,Ae=S.z+C.z*Z,Ee=ro(re),Ue=lo(Ae);if(!(Ee<0||Ee>1||Ue<0||Ue>1)&&ae<=Mt(Ee,Ue)){const de=Math.min(w-1,Math.floor(Ee*w));return Math.min(d-1,Math.floor((1-Ue)*d))*w+de}}return null},dc=n=>{n.target instanceof HTMLElement&&n.target.closest('[data-stage-ui="true"]')||(Sa=!0,lc=n.button,n.clientX,n.clientY,In=n.clientX,Cn=n.clientY,vo=0,qa.cancel(),b.domElement.setPointerCapture(n.pointerId))},fc=n=>{const m=x.current;if(go=n.clientX,Ln=n.clientY,!Sa)return;const w=n.clientX-In,d=n.clientY-Cn;if(In=n.clientX,Cn=n.clientY,vo+=Math.hypot(w,d),!m.cinemaActive)if(lc===2||n.shiftKey){xa=!0;const R=Y.distance*.0011,S=Math.cos(Y.azimuth),C=Math.sin(Y.azimuth);ge.target.x=_.clamp(ge.target.x-(w*S-d*C)*R,-Je.width*.42,Je.width*.42),ge.target.z=_.clamp(ge.target.z-(-w*C-d*S)*R,-Je.depth*.42,Je.depth*.42)}else{xa=!0;const R=m.inWorkspace?.0046:.0028;ge.azimuth-=w*R;const S=m.inWorkspace?.12:.72,C=m.inWorkspace?1.36:1.18;ge.polar=_.clamp(ge.polar-d*R,S,C)}},mc=n=>{var d,R,S;if(!Sa)return;Sa=!1,b.domElement.hasPointerCapture(n.pointerId)&&b.domElement.releasePointerCapture(n.pointerId);const m=x.current;!m.inWorkspace&&vo<5&&n.button===0&&((d=m.onEnterWorkspace)==null||d.call(m));const w=m.tileBoard;if(w&&w.pickable&&m.inWorkspace&&vo<5&&n.button===0){const C=hc(n.clientX,n.clientY,w.cols,w.rows);C!==null&&!((R=w.tiles[C])!=null&&R.closed)&&((S=m.onTilePick)==null||S.call(m,C))}},pc=()=>{go=Number.NaN,Ln=Number.NaN},vc=n=>{const m=x.current;if(!m.inWorkspace||m.cinemaActive)return;n.preventDefault(),xa=!0,qa.cancel();const w=1+_.clamp(n.deltaY,-120,120)*.0011;ge.distance=_.clamp(ge.distance*w,4.6,23.5)},gc=n=>{x.current.inWorkspace&&n.preventDefault()},Ta=b.domElement;Ta.addEventListener("pointerdown",dc),window.addEventListener("pointermove",fc,{passive:!0}),window.addEventListener("pointerup",mc),Ta.addEventListener("pointerleave",pc),Ta.addEventListener("wheel",vc,{passive:!1}),Ta.addEventListener("contextmenu",gc);const wo=window.matchMedia("(prefers-reduced-motion: reduce)");let vs=wo.matches;const xc=()=>{vs=wo.matches};wo.addEventListener("change",xc);let es=0,zn=0,wc=performance.now(),zt=0;const gs={scale:1,offsetX:0,offsetY:0},bt={scale:1,offsetX:0,offsetY:0},Os={scale:1,offsetX:0,offsetY:uu},Ea=new Float32Array(Z0*3);let Mc=!1,Ei=null,Mo=0,xs=Rs,ws=null,pt=null;const Na={scale:1,offsetX:0,offsetY:0};let yo=Rs,bo=null,yc=!1,bc=null,Un=!1,So=!1;const To=(n,m,w,d,R=!1)=>{let S=0;for(let C=0;C<ti;C++){const ee=C/(ti-1);for(let Z=0;Z<ti;Z++){const re=Z/(ti-1);Ea[S*3]=Wt(re),Ea[S*3+1]=Mt(re,ee),Ea[S*3+2]=Vt(ee),S++}}for(let C=0;C<4;C++)Ea[S*3]=(C%2===0?-.5:.5)*Je.width,Ea[S*3+1]=Ds,Ea[S*3+2]=(C<2?-.5:.5)*Je.depth,S++;if(R){const C=Mt(.5,.5);for(let ee=0;ee<sh;ee++){const Z=ee===0?0:X0,re=(ee-1)*Math.PI*.5;Ea[S*3]=Math.cos(re)*Z,Ea[S*3+1]=C+(ee===0?Y0:$0),Ea[S*3+2]=Math.sin(re)*Z,S++}}T0(Ea,S,m,w,39,dt/yt,n,d)};let Eo=0,Bn=0,Ro=0,On=60,Sc=0;const nt=new B,Tc=n=>{var Ss,wa,na,as,Ua,Ri,Hs,ss,Ao,Ai,ki,Gs,ko;if(p)return;zn=requestAnimationFrame(Tc);const m=n-wc,w=Math.min(.065,Math.max(.001,m*.001));wc=n,zt+=w;const d=x.current,R=1-Math.exp(-w*8.5),S=1-Math.exp(-w*5.8),C=!d.inWorkspace&&d.landingView!=="slab";if(C&&Jl(),ya){yn+=ms?1e3:w;const P=Math.min(1,yn/no);Zt=Hu(P),I.uMorph.value=Zt,Kl(),P>=1&&(ya=!1,Zt=1,Q=f,co(),I.uMorph.value=1,bn(f.regionId),Nt())}const ee=f.auxTex?ya&&Q.regionId!==f.regionId?_.smoothstep(Zt,.55,1):1:0;if(I.uAuxMix.value=_.lerp(I.uAuxMix.value,ee,S),I.uDetailMix.value=_.lerp(I.uDetailMix.value,f.detailTex&&!Xi?1:0,S),ws=d.inWorkspace?null:Ii(d.landingSubjectFrame),pt=d.inWorkspace&&!d.cleanHud&&!d.cinemaActive?Ii(d.workspaceSubjectFrame):null,d.inWorkspace&&pt){const P=(pt.left+pt.right)*.5,H=(pt.top+pt.bottom)*.5,W=Qa??d.cameraPreset;if(W==="overview"||W==="nadir"||W==="region"){yo+=1;const O=d.mode==="observer"&&W==="overview",J=!!d.tileBoard;let ie=vp;if(So&&J&&W==="region")To(pt,{azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]},0,Na,O),ie=xp,((Qt==="play"?Bs>=1:Math.abs(Y.distance-ge.distance)<.002*ge.distance)||xa)&&(So=!1,yo=Rs);else if(yo>=Rs||bo!==W||yc!==O||oc!==J||!fr(bc,pt)){oc=J;const V=Pc(W,!0,d.mode,d.activeTheaterId,J);To(pt,V,0,Na,O);let N=1;J&&W==="region"&&Na.scale<bu&&(N=Math.min(gp,bu/Math.max(.001,Na.scale)),To(pt,{...V,distance:V.distance*N},0,Na,O)),J&&W==="region"&&Math.abs(N-ho)>.005&&(ho=N,Un=!0),yo=0,bo=W,yc=O,bc={...pt}}const $=_.clamp(Na.scale,ie,1),qe=Math.max(.001,Na.scale);bt.scale=$,bt.offsetX=(Na.offsetX+P)/qe*$-P,bt.offsetY=(Na.offsetY+H)/qe*$-H}else bo=null,bt.scale=1,bt.offsetX=.5-P,bt.offsetY=.5-H}else if(d.inWorkspace)bo=null,bt.scale=1,bt.offsetX=0,bt.offsetY=0;else if(C&&La){const P=ws??ru;xs+=1;const H=dt/yt;if(xs>=Rs||!fr(Ei,P)||Math.abs(Mo-H)>1e-4){const W=wh();k0(fs,W,La,vs?0:Po,Do,H,P,Os),Ei=P,Mo=H,xs=0}bt.scale=1,bt.offsetX=0,bt.offsetY=Os.offsetY}else if(!ws)bt.scale=1,bt.offsetX=0,bt.offsetY=uu,Ei=null;else{xs+=1;const P=dt/yt;(xs>=Rs||!fr(Ei,ws)||Math.abs(Mo-P)>1e-4)&&(To(ws,gt,q0,Os),Ei=ws,Mo=P,xs=0),bt.scale=Os.scale,bt.offsetX=Os.offsetX,bt.offsetY=Os.offsetY}const Z=Mc?R:1;Mc=!0,gs.scale=_.lerp(gs.scale,bt.scale,Z),gs.offsetX=_.lerp(gs.offsetX,bt.offsetX,Z),gs.offsetY=_.lerp(gs.offsetY,bt.offsetY,Z),D0(T,dt,yt,gs);let re=d.timeProgress;const ae=C?Tn(f):null;let Ae=null;ae!==null&&d.landingTour&&typeof d.landingPass!="number"&&!vs?(on!==f.key&&(on=f.key,Ns=[],f.observerDataset.frames.forEach((P,H)=>{var W;(H===ae||((W=P[0])==null?void 0:W.isDay)===!1)&&Ns.push(H)}),ji=Math.max(0,Ns.indexOf(ae)),qi=0,nn=!1),qi+=w,Ns.length>1&&qi>(nn?np:op)&&(ji=(ji+1)%Ns.length,qi=0,nn=!0),Ae=Ns[ji]??null):on="";const Ee=ae!==null&&typeof d.landingPass=="number"&&Number.isFinite(d.landingPass)?_.clamp(d.landingPass,0,f.frameCount-1):Ae??ae;if(Ee!==null&&(re=Ee/Math.max(1,f.frameCount-1)),d.backdrop){const P=Tn(f);P!==null&&(re=P/Math.max(1,f.frameCount-1))}let Ue=0,de=!1;if(d.cinemaActive&&d.inWorkspace){const P=Hl.update(w,Mt,d.onCinemaStepTheater,Je.width,Je.depth);T.fov=P.fov,T.updateProjectionMatrix(),T.up.copy(P.up),T.position.copy(P.position),T.lookAt(P.lookAt),re=P.syntheticTimeProgress,Ue=P.cycleProgress}else{const P=C&&La?Do:39;if(Math.abs(T.fov-P)>.01&&(T.fov=Sn||!C?_.lerp(T.fov,P,R):P),T.updateProjectionMatrix(),T.up.set(0,1,0),!d.inWorkspace&&!qa.isActive()&&!Sa){const V=C?La:null,N=V??gt,j=vs?0:V?Math.sin(zt*.11)*Po:Math.sin(zt*.16)*.065;let q=N.azimuth+j;for(;q-ge.azimuth>Math.PI;)q-=Math.PI*2;for(;q-ge.azimuth<-Math.PI;)q+=Math.PI*2;ge.azimuth=V?_.lerp(ge.azimuth,q,Math.min(1,w*2)):q,ge.polar=_.lerp(ge.polar,N.polar,w*1.2),ge.distance=_.lerp(ge.distance,N.distance,w*1.6),xo.set(N.target[0],N.target[1],N.target[2]),ge.target.lerp(xo,w*2.2),V&&!Sn&&(ge.azimuth=q,ge.polar=N.polar,ge.distance=N.distance,ge.target.copy(xo),Y.azimuth=ge.azimuth,Y.polar=N.polar,Y.distance=N.distance,Y.target.copy(xo),Sn=!0)}ps&&d.inWorkspace&&!xa&&!Sa&&!qa.isActive()&&(Fn(Ca(d.cameraPreset,!0,d.mode,d.activeTheaterId)),ps=!1),de=qa.step(w,ge).slewActive,Y.azimuth=_.lerp(Y.azimuth,ge.azimuth,R),Y.polar=_.lerp(Y.polar,ge.polar,R),Y.distance=_.lerp(Y.distance,ge.distance,R),Y.target.lerp(ge.target,R);let W=!1;if(!ya&&d.inWorkspace&&(Qa??d.cameraPreset)==="canyon"&&f.observerDataset.dataSource==="firms"){const V=f.observerDataset.frames.length,N=Math.min(V-1,Math.max(0,Math.round(_.clamp(d.timeProgress,0,1)*(V-1)))),j=(((wa=(Ss=f.declared)==null?void 0:Ss.byFrame.get(N))==null?void 0:wa.length)??0)>0;if(j||vi==="estimate"&&ut.length>0){const q=d.workspaceSubjectFrame,ce=`${f.regionId}:${((as=(na=f.observerDataset.frames[0])==null?void 0:na[0])==null?void 0:as.timeUtc)??""}`;let Ge=0;for(const st of f.observerDataset.frames[N]??[])st.revealed&&!st.revealedByLook&&(Ge+=st.footprints.length);const Be=`${ce}:${N}:${j?"declared":pi}:${Ge}:${q?[q.left,q.top,q.right,q.bottom].map(st=>st.toFixed(3)).join(","):""}:${dt}x${yt}`;Be!==tc&&(tc=Be,!xa&&!Sa&&(Qt==="estimate"||Qt==="test"?W=!0:ps=!0))}}const O=d.filmMove!==void 0?d.filmMove:Rn;O!==ac&&(ac=O,_n=!1),Qt&&(xa||Sa)&&(_n=!0),ms&&(An=f.observerDataset.dataSource==="firms"&&f.runId!==null&&!ya&&(f.pack?f.contextState!=="loading":f.packManifest===null||f.packState==="failed")&&m<bp?An+w:0,(An>yp||zt>Sp||!O||d.inWorkspace)&&(ms=!1,kn=zt,b.domElement.style.transition=`opacity ${Su}s ease-out`,b.domElement.style.opacity="1"));let J=null;if(O&&!_n&&!(ya&&Gl)&&!ms&&!d.backdrop){J=O!=="auto"?O:d.inWorkspace?d.tileBoard?"play":Cs.x+Cs.y>.5?"test":"estimate":"record";const V=f.observerDataset.dataSource==="firms";J!=="record"&&(!d.inWorkspace||!V)&&(J=null)}if(J!==Qt){const V=Qt;if(Qt=J,po=zt,Bs=0,Qa=null,kt=null,Bt=null,J){xa=!1;const N=Ca("canyon",!0,d.mode,d.activeTheaterId),j={...N,distance:N.distance*yr,azimuth:N.azimuth+.04};if(J==="estimate")kt={...N,distance:N.distance*fp,azimuth:N.azimuth-.06},Bt=j,Za=mu,Us=!0,Qa="canyon";else if(J==="test"){const q={azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]};kt=V==="estimate"?q:j,Bt=kt,Za=0,Qa="canyon"}else if(J==="play")kt=j,Bt=Ca("region",!0,d.mode,d.activeTheaterId),Za=mp,Us=!0,Qa="region";else{const q=d.inWorkspace?Ca("region",!0,d.mode,d.activeTheaterId):La??gt;kt={...q,azimuth:q.azimuth-fu/2},Bt={...q,azimuth:q.azimuth+fu/2},Za=dp,Us=!1,Qa=d.inWorkspace?"region":null}}}if(W&&kt&&Bt&&(Qt==="estimate"||Qt==="test")){const V=Ca("canyon",!0,d.mode,d.activeTheaterId);kt={azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]},Bt={...V,distance:V.distance*yr,azimuth:V.azimuth+.04},Za=Qt==="estimate"?mu:pu,Us=!0,po=zt}if(Un)if(Un=!1,Qt==="play"&&kt&&Bt){const V=Ca("region",!0,d.mode,d.activeTheaterId);Bs<1?Bt=V:(kt={azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]},Bt=V,Za=pu,Us=!0,po=zt,Bs=0,So=!0)}else!Qt&&d.cameraPreset==="region"&&d.inWorkspace&&!xa&&!Sa&&(Fn(Ca("region",!0,d.mode,d.activeTheaterId)),So=!0);if(Qt&&kt&&Bt){const V=Za>0?_.clamp((zt-po)/Za,0,1):1,N=Us?V*V*(3-2*V):V;let j=Bt.azimuth-kt.azimuth;for(;j>Math.PI;)j-=Math.PI*2;for(;j<-Math.PI;)j+=Math.PI*2;Y.azimuth=kt.azimuth+j*N,Y.polar=_.lerp(kt.polar,Bt.polar,N),Y.distance=kt.distance*Math.pow(Bt.distance/kt.distance,N),Y.target.set(_.lerp(kt.target[0],Bt.target[0],N),_.lerp(kt.target[1],Bt.target[1],N),_.lerp(kt.target[2],Bt.target[2],N)),ge.azimuth=Y.azimuth,ge.polar=Y.polar,ge.distance=Y.distance,ge.target.copy(Y.target),Bs=V}const ie=Math.sin(Y.polar);T.position.set(Y.target.x+Y.distance*ie*Math.sin(Y.azimuth),Y.target.y+Y.distance*Math.cos(Y.polar),Y.target.z+Y.distance*ie*Math.cos(Y.azimuth));const $=ro(T.position.x),qe=lo(T.position.z);if($>=0&&$<=1&&qe>=0&&qe<=1){const V=Mt($,qe)+_.lerp(nu,B0,es);T.position.y<V&&(T.position.y=V)}else if(f.context&&ga>.5){const V=ec(f,T.position.x,T.position.z)+nu;T.position.y<V&&(T.position.y=V)}T.lookAt(Y.target)}const be=!d.inWorkspace||d.cinemaActive?"cutaway":d.mode,we=be==="cutaway"?1:0,Ke=be==="reconstruction"?1:0,rt=be==="observer"?1:0,vt=be==="world"||be==="earth"||f.observerDataset.dataSource==="firms"?0:be==="observer"?.45:1;I.uCutawayMix.value=_.lerp(I.uCutawayMix.value,we,S),I.uReconMix.value=_.lerp(I.uReconMix.value,Ke,S),I.uObserverMix.value=_.lerp(I.uObserverMix.value,rt,S),I.uCutawayPlane.value=lu,I.uTime.value=zt,I.uUncertaintyMix.value=_.lerp(I.uUncertaintyMix.value,d.showUncertainty?1:0,R),I.uSensitivity.value=_.lerp(I.uSensitivity.value,d.sensitivityThreshold,R);const me=d.observerFilter==="all"||d.observerFilter==="modis"?1:0,Re=!d.holdoutViirs&&(d.observerFilter==="all"||d.observerFilter==="viirs")?1:0;I.uModisWeight.value=_.lerp(I.uModisWeight.value,me,R),I.uViirsWeight.value=_.lerp(I.uViirsWeight.value,Re,R),X=_.lerp(X,vt*_.lerp(1,Lp,Ya.value),S);const Ye=ml(f.tensor,f.frameCount,re);I.uFrameMix.value=Ye,I.uFireTime.value=_.clamp(re,0,1)*Math.max(1,f.frameCount-1);const xe=f.observerDataset.frames,Me=Math.min(xe.length-1,Math.max(0,Math.round(re*(xe.length-1)))),Se=xe[Me]??[],Oe=f.observerDataset.dataSource==="firms";if(Oe){oh(f,Ka,Ia);const P=`${f.key}:${Me}:${d.holdoutViirs?1:0}:${C?1:0}`,H=C&&(typeof d.landingPass=="number"||!!d.landingTour)&&!vs,W=P!==ls&&H&&ls.startsWith(`${f.key}:`)&&$a.value>.02;if(W?$a.value=Math.max(0,$a.value-w/Pp):P===ls&&($a.value=H?Math.min(1,$a.value+w/Ip):1),P!==ls&&!W){ls=P,$a.value=H?0:1;const O=Se.find(N=>!la(N,d.holdoutViirs)&&!N.revealed)??Se.find(N=>!la(N,d.holdoutViirs)),J=Se.some(N=>N.family==="modis"&&!la(N,d.holdoutViirs)&&!N.revealed);ln=O?{index:Me,sensor:O.sensorLabel,timeUtc:O.timeUtc??"",isDay:O.isDay!==!1,detections:O.footprints.length}:void 0;const ie=O??Se[0];if(d.passScan&&(d.inWorkspace||typeof d.landingPass=="number")&&ie&&!vs){const N=_.degToRad(ie.azimuthDeg);let j=Math.cos(N),q=-Math.sin(N);const ce=ie.orbitNode==="ascending";ie.orbitNode&&ce!==q>0&&(j=-j,q=-q),Va.x=j,Va.y=q,Jr=zt}cs.length=0,zs.length=0,Cs.set(0,0);for(const N of Se)if(!la(N,d.holdoutViirs)){if(N.revealed){for(const j of N.footprints)zs.push(j);N.family==="modis"?Cs.x=1:Cs.y=1;continue}for(const j of N.footprints)cs.push(j)}const $=Se.find(N=>N.revealed&&!la(N,d.holdoutViirs));if(zs.length>0&&$){const N=_.degToRad($.azimuthDeg);let j=Math.cos(N),q=-Math.sin(N);$.orbitNode&&$.orbitNode==="ascending"!=q>0&&(j=-j,q=-q);const[ce,Ge,Be,st]=f.bbox;let Pt=1/0,Et=-1/0,ta=0;for(const ra of zs){const ha=((ra.lon-ce)/Math.max(1e-9,Be-ce)-.5)*f.widthKm,Ba=((ra.lat-Ge)/Math.max(1e-9,st-Ge)-.5)*f.depthKm,Ks=ha*j+Ba*q;Pt=Math.min(Pt,Ks),Et=Math.max(Et,Ks),ta=Math.max(ta,ra.acrossTrackKm,ra.alongTrackKm)}Ls.x=j,Ls.y=q,Ls.w=Math.max(.2,ta),nl=Pt-ta,rl=Et+ta+Ls.w,ll=vs?-1e9:zt}if(Zi.length=0,mi.value=0,Qi=void 0,cs.length===0&&Se.length>0&&Se.every(N=>N.revealed||la(N,d.holdoutViirs))&&f.residenceHours!==void 0){const N=Date.parse(((Ua=Se[0])==null?void 0:Ua.timeUtc)??"");for(let j=Me-1;j>=0&&Zi.length===0;j--)for(const q of xe[j]??[]){if(q.revealed||la(q,d.holdoutViirs)||q.footprints.length===0)continue;for(const Be of q.footprints)Zi.push(Be);const ce=Date.parse(q.timeUtc??""),Ge=Number.isFinite(N)&&Number.isFinite(ce)?Math.max(0,(N-ce)/36e5):0;mi.value=Math.exp(-Ge/(f.residenceHours??1)),Qi={index:j,sensor:q.sensorLabel,timeUtc:q.timeUtc??"",hoursBefore:Ge}}}const V=f.fieldScale??Zs;Op(V,Yi),Wi.build(cs,f.bbox,[f.widthKm,f.depthKm],N=>(Bo(V,N)-Yi.x)/Math.max(.001,Yi.y-Yi.x),zs,Zi),il.value=J?1:0}}else ln=void 0,ls="",mi.value=0,Qi=void 0;const Yt=(zt-Jr)/ip;if(Oe&&Yt>=0&&Yt<1){const P=.5*(Math.abs(Va.x)*f.widthKm+Math.abs(Va.y)*f.depthKm)+1.5;Va.z=-P+2*P*Yt,Va.w=1}else Va.w=0;dl!==f.key&&(dl=f.key,fl=Oe&&!xe.some(P=>P.some(H=>H.hidden||H.revealed))),cn.value=_.lerp(cn.value,fl&&!d.holdoutViirs?1:0,R);const Ce=Oe&&f.runId?$r.get(f.runId):void 0;if(Ce&&!d.backdrop){el!==f.key&&(el=f.key,Jo=xe.map(ie=>{var $;return Date.parse((($=ie[0])==null?void 0:$.timeUtc)??"")}));const P=_.clamp(re,0,1)*Math.max(1,xe.length-1),H=Math.min(xe.length-1,Math.floor(P)),W=Math.min(xe.length-1,H+1),O=Jo[H],J=Jo[W];if(Number.isFinite(O)&&Number.isFinite(J)){const ie=O+(J-O)*(P-H)+Ce.info.stepMs;Zr!==f.key&&(Zr=f.key,Xo=null),Se.length>0&&Se.every($=>$.revealed||la($,d.holdoutViirs))&&(Xo=Me),Xr.value=oa.sync(Ce,f.key,ie,Xo)}else oa.clear()}else oa.clear();I.uLipariTex.value=oa.grid.x>0?oa.texture:ct,qr.value=oa.grid.x>0&&oa.declaredGiven?1:0,sn.value=_.lerp(sn.value,d.chanceSquares?1:0,R);{const P=!!(d.filmMove??Rn),H=_.clamp((zt-ll)/(P?up:cp),0,1),W=P?H*H*(3-2*H):1-(1-H)*(1-H);Ls.z=H>=1?1e4:_.lerp(nl,rl,W)}const Ms=Oe&&Se.length>0&&Se.every(P=>P.revealed||la(P,d.holdoutViirs))?1:0;$o.value=_.lerp($o.value,Ms,1-Math.exp(-w*6)),jr.value=Oe&&f.answeredByOther?1:0,Qo=_.lerp(Qo,(!Oe||cs.length>0?1:.5*mi.value)*$a.value,1-Math.exp(-w*4)),I.uPixelOutline.value=_.lerp(I.uPixelOutline.value,d.detectionPixels?1:0,R),rn.value=C?0:_.smoothstep(Y.distance,8.5,15),fi.value=_.lerp(fi.value,(C?1:_.lerp(Tp,Ep,rn.value))*Fp((Ri=f.pack)==null?void 0:Ri.pictureMedianLuma),S),di=Oe&&Se[0]?{index:Me,sensor:Se[0].sensorLabel,timeUtc:Se[0].timeUtc??"",isDay:Se[0].isDay!==!1,hidden:Se.every(P=>P.revealed||la(P,d.holdoutViirs))&&!Se.some(P=>P.revealed&&!P.revealedByLook)}:void 0,I.uFireHist.value=Oe?Wi.lightTexture:fe(f).texture,an=void 0;let $t=null;if(d.dayPicture&&Oe&&d.inWorkspace&&((Hs=Se[0])!=null&&Hs.timeUtc)&&f.runId){const P=(di==null?void 0:di.hidden)===!0,H=Se.find($=>!la($,d.holdoutViirs)&&!$.revealed)??Se[0],W=P?"MODIS_AQUA":ep(H.sensorLabel)??"MODIS_AQUA",O=Se[0].timeUtc.slice(0,10),J=Oa(x.current,`/api/gibs/day?region_id=${encodeURIComponent(f.regionId)}&day=${O}&platform=${W}&kind=${d.dayPicture}`);let ie=$i.get(J);ie===void 0&&($i.set(J,"loading"),ie="loading",z.load(J,$=>{$.colorSpace=ot,$.anisotropy=A,$.wrapS=Ve,$.wrapT=Ve,$i.set(J,$)},void 0,()=>$i.set(J,"missing"))),ie!=="loading"&&ie!=="missing"&&($t=ie),an={state:ie==="loading"?"loading":ie==="missing"?"missing":"shown",platform:W,kind:d.dayPicture,day:O,insteadOfHidden:P}}if($t){I.uSatNext.value=$t,I.uSatPrev.value=$t,I.uSatSharpen.value=0;const P=$t.image;I.uOrthoTexelKm.value=f.widthKm/Math.max(1,(P==null?void 0:P.width)??256),Xi=!0,en.value=hp,tn.value=d.dayPicture==="false_color"?1:0}else Xi&&(I.uSatNext.value=f.satTex,I.uSatPrev.value=Q.satTex,I.uSatSharpen.value=f.sharpen,I.uOrthoTexelKm.value=f.orthoTexelKm,Xi=!1,en.value=0,tn.value=0);ol.value=f.runId===null?0:1;const Ra=d.backdrop?1:$t?0:Oe&&((ss=Se[0])==null?void 0:ss.isDay)===!1||f.runId===null?1:0;Ya.value=_.lerp(Ya.value,Ra,1-Math.exp(-w*2.4)),gl.value=Ya.value;const Jt=f.fieldScale??Zs;al.set(Jt.kind==="linear"?0:1,Jt.maxMwKm2,Jt.minMwKm2),zp(Jt,sl),tl.set(Oe?1:0,Oe?1:0),Uc(Se.find(P=>P.family==="modis"),Oo,Mi),Uc(Se.find(P=>P.family==="viirs"&&!la(P,d.holdoutViirs)),ei,yi),Rl.set(Mi.axisEast,Mi.axisNorth,Mi.nadirKm,Mi.valid?1:0),Al.set(yi.axisEast,yi.axisNorth,yi.nadirKm,yi.valid?1:0),Eo=_.lerp(Eo,be==="observer"?1:0,S),!Ol&&be==="observer"&&(Ol=!0,ja.loadModels("/isogon/"));{const P=_.smoothstep(Y.distance,8.5,11.5);if(wn=_.lerp(wn,be==="observer"?P:0,S),oo.length=0,Eo>=.01){let H=!1,W=!1;for(const O of Se){if(oo.length>=cu)break;if(la(O,d.holdoutViirs)||d.observerFilter==="modis"&&O.family!=="modis"||d.observerFilter==="viirs"&&O.family!=="viirs")continue;const J=O.family==="modis"?!H:!W;O.family==="modis"?H=!0:W=!0,oo.push({sensorLabel:O.sensorLabel,family:O.family,azimuthDeg:O.azimuthDeg,scanAngleDeg:O.scanAngleDeg,orbitNode:O.orbitNode,groundStrip:J})}}ja.update(oo,{sky:wn,strip:Eo,dtSec:w,sampleTerrainY:Mt,slabWidth:Je.width,slabDepth:Je.depth,unitsPerMetre:f.frame.unitsPerMetre}),kl.set(ja.strips.modis.alongTrackKm,ja.strips.modis.strength,ja.strips.viirs.alongTrackKm,ja.strips.viirs.strength)}hn.position.copy(T.position);{const P=_.lerp(Q.minElevM,f.minElevM,Zt),H=Math.max(.05,(P+T.position.y/f.frame.unitsPerMetre[1])*.001);Xa.uCamAltKm.value=H,ue=_.lerp(ue,C||d.inWorkspace&&(d.cleanHud||d.cinemaActive)?1:0,S),es=_.lerp(es,C?1:0,S),Xa.uSkyExposure.value=_.lerp(Zn,_.lerp(sd,H0,es),ue),I.uLatticeMix.value=1-es;const W=Qa??d.cameraPreset,O=d.inWorkspace?W==="region"||W==="canyon"&&f.observerDataset.dataSource==="firms"?1:1-_.smoothstep(Y.distance,8.5,11.5):C?1:0,J=f.context!==null&&!ya;ga=ms?J?O:0:_.lerp(ga,J?O:0,S),I.uContextMix.value=ga,io.mesh.visible=ga>.003,Si.visible=es<.5&&ga<.5,to.visible=es<.5&&ga<.5,I.uSkyExposure.value=Xa.uSkyExposure.value,I.uEdgeFade.value=_.lerp(I.uEdgeFade.value,f.context?0:d.inWorkspace?1-_.smoothstep(Y.distance,8.5,11.5):C&&(fo.floorShare>0||fo.seaShare>0)?1:0,S);const ie=Math.max(I.uEdgeFade.value,ga);mn.uniforms.uShadowMix.value=1-ie,Xa.uFloorHaze.value=_.lerp(.3,_.lerp(1,K0,ie),ue),Xa.uFloorColor.value.set(.044,.06,.094).lerp(Vp,ue),wi.update(b,eo,H)}T.updateMatrixWorld();const ea=Math.max(As(Q.maxElevM,Q),As(f.maxElevM,f));U.enabled=X>.01,C&&(T.updateMatrixWorld(),F0(T,_0(ws??ru),Bl)),I.uSmokeShadowMix.value=U.enabled?1:0,U.enabled&&U.update({camera:T,slabWidth:Je.width,slabDepth:Je.depth,reliefTop:ea,heightPrev:G(Q),heightNext:G(f),morph:Zt,field0:Fe,field1:Le,detection0:f.observerDataset.dataSource==="firms"?Gi:null,detection1:f.observerDataset.dataSource==="firms"?Ki:null,frameMix:I.uFrameMix.value,windUv:pn,sunDir:oe,sunColor:un,time:zt,opacity:X,cutawayMix:I.uCutawayMix.value,cutawayPlane:lu,cutawayDir:yl,lid:Bl,lidAmount:es,clearRadius:O0,thinOverFire:Oe?.82:0,night:Ya.value,fireLight:Qo}),L.render(w);const ys=d.onCurtainScreen;ys&&!cc&&(ys({near:{x:0,y:0},far:{x:0,y:0},modisSide:"left",visible:!1}),cc=!0);const le=d.tileBoard,$e=!!le&&le.cols>=1&&le.rows>=1&&le.cols*le.rows<=64;if(!!le!==ic&&(ic=!!le,d.cameraPreset==="region"&&(ps=!0)),le&&$e){jo.set(le.cols,le.rows);const P=le.cols*le.rows;for(let W=0;W<P;W++){const O=le.tiles[W];Qr[W].set(_.clamp((O==null?void 0:O.level)??0,0,1),O!=null&&O.looked?1:0,O!=null&&O.chosen?1:0,O!=null&&O.closed?1:0)}const H=le.pickable&&!Sa&&Number.isFinite(go)?hc(go,Ln,le.cols,le.rows):null;if(qo.value=H??-1,H!==Vi&&(Vi=H,(Ao=d.onTileHover)==null||Ao.call(d,H)),d.onTileAnchors){Zo.length=0;for(let W=0;W<P;W++){const O=W%le.cols/le.cols,J=1-Math.floor(W/le.cols)/le.rows;nt.set(Wt(O),Mt(O,J),Vt(J)).project(T);const ie=(nt.x*.5+.5)*dt,$=(-nt.y*.5+.5)*yt;Zo.push({tile:W,x:ie,y:$,visible:nt.z>-1&&nt.z<1&&ie>=0&&ie<=dt&&$>=0&&$<=yt})}d.onTileAnchors(Zo.slice())}}else jo.set(0,0),qo.value=-1,Vi!==null&&(Vi=null,(Ai=d.onTileHover)==null||Ai.call(d,null));if(d.onFireAnchor&&d.inWorkspace&&Oe){const P=cs.length>0?cs:zs,H=Ce?Math.round(oa.grid.x)+":"+oa.stepKey:"",W=`${ls}:${P.length}:${P.length===0?H:""}`;if(W!==pi){pi=W;const[J,ie,$,qe]=f.bbox;if(P.length>0){vi="detections",ut=new Float32Array(P.length*3);const V=new Float32Array(P.length*2);P.forEach((N,j)=>{ut[j*3]=(N.lon-J)/Math.max(1e-9,$-J),ut[j*3+1]=(N.lat-ie)/Math.max(1e-9,qe-ie),ut[j*3+2]=Math.max(1,N.frpMw),V[j*2]=.5*N.acrossTrackKm/Math.max(1e-6,f.widthKm),V[j*2+1]=.5*N.alongTrackKm/Math.max(1e-6,f.depthKm)}),us=Di(ut,_.clamp(Math.round(f.widthKm/Tu),8,512),_.clamp(Math.round(f.depthKm/Tu),8,512),V)}else{vi="estimate";const V=Ce!=null&&Ce.declared&&Ce.declared.nx===Ce.info.nx&&Ce.declared.ny===Ce.info.ny?Ce.declared.byFrame.get(Me):void 0;if(Ce&&V&&V.length>0){const{nx:N,ny:j}=Ce.info;ut=new Float32Array(V.length*3),V.forEach((q,ce)=>{ut[ce*3]=(q%N+.5)/N,ut[ce*3+1]=1-(Math.floor(q/N)+.5)/j,ut[ce*3+2]=1})}else ut=Ce?oa.cellsAbove(Ce,Cp,N=>Cu(f.fieldScale??Zs,N)):new Float32Array(0);us=Ce?Di(ut,Ce.info.nx,Ce.info.ny):{patchOf:new Uint16Array(0),sizes:[]}}}const O=ut.length/3;if(O===0)gi&&d.onFireAnchor(null),gi=!1,Ji="",xi=null;else{const J=`${pi}:${Q.key}:${f.key}`,ie=T.matrixWorld.elements,$=T.projectionMatrix.elements;let qe=xi!==null&&J===Ji&&Kt[0]===Me&&Kt[1]===Zt&&Kt[2]===dt&&Kt[3]===yt&&Kt[4]===Je.width&&Kt[5]===Je.depth;if(qe){for(let V=0;V<16;V++)if(Kt[6+V]!==ie[V]||Kt[22+V]!==$[V]){qe=!1;break}}if(!qe){let V=0,N=0,j=0,q=1/0,ce=-1/0,Ge=1/0,Be=-1/0;const st=Math.min(Mr,us.sizes.length);for(let pe=0;pe<st;pe++)Qe[pe*7]=0,Qe[pe*7+1]=0,Qe[pe*7+2]=0,Qe[pe*7+3]=1/0,Qe[pe*7+4]=1/0,Qe[pe*7+5]=-1/0,Qe[pe*7+6]=-1/0;for(let pe=0;pe<O;pe++){const it=ut[pe*3],da=ut[pe*3+1],fa=ut[pe*3+2];V+=it*fa,N+=da*fa,j+=fa;const It=us.patchOf[pe]<st?us.patchOf[pe]*7:-1;if(It>=0&&(Qe[It]+=it*fa,Qe[It+1]+=da*fa,Qe[It+2]+=fa),nt.set(Wt(it),Mt(it,da),Vt(da)).project(T),nt.z<=-1||nt.z>=1)continue;const Ts=(nt.x*.5+.5)*dt,Ws=(-nt.y*.5+.5)*yt;q=Math.min(q,Ts),ce=Math.max(ce,Ts),Ge=Math.min(Ge,Ws),Be=Math.max(Be,Ws),It>=0&&(Qe[It+3]=Math.min(Qe[It+3],Ts),Qe[It+4]=Math.min(Qe[It+4],Ws),Qe[It+5]=Math.max(Qe[It+5],Ts),Qe[It+6]=Math.max(Qe[It+6],Ws))}let Pt=0,Et=0;const ta=(pe,it)=>{const da=Mt(pe,it);if(nt.set(Wt(pe),da,Vt(it)).project(T),Pt=(nt.x*.5+.5)*dt,Et=(-nt.y*.5+.5)*yt,!(nt.z>-1&&nt.z<1&&Pt>=0&&Pt<=dt&&Et>=0&&Et<=yt))return!1;const fa=T.position.x,It=T.position.y,Ts=T.position.z,Ws=Wt(pe),Sh=Vt(it);for(let Kn=1;Kn<48;Kn++){const Wn=Kn/48,Vn=ro(fa+(Ws-fa)*Wn),Yn=lo(Ts+(Sh-Ts)*Wn);if(!(Vn<0||Vn>1||Yn<0||Yn>1)&&Mt(Vn,Yn)>It+(da-It)*Wn+.012)return!1}return!0};for(let pe=0;pe<st;pe++)hs[pe*3]=1/0;const ra=f.widthKm,ha=f.depthKm;for(let pe=0;pe<O;pe++){const it=us.patchOf[pe];if(it>=st)continue;const da=(ut[pe*3]-Qe[it*7]/Qe[it*7+2])*ra,fa=(ut[pe*3+1]-Qe[it*7+1]/Qe[it*7+2])*ha,It=da*da+fa*fa;It<hs[it*3]&&(hs[it*3]=It,hs[it*3+1]=ut[pe*3],hs[it*3+2]=ut[pe*3+1])}const Ba=[];for(let pe=0;pe<st;pe++){const it=pe*7,da=ta(hs[pe*3+1],hs[pe*3+2]);Ba.push({x:Pt,y:Et,left:Number.isFinite(Qe[it+3])?Qe[it+3]:Pt,top:Number.isFinite(Qe[it+4])?Qe[it+4]:Et,right:Number.isFinite(Qe[it+5])?Qe[it+5]:Pt,bottom:Number.isFinite(Qe[it+6])?Qe[it+6]:Et,cells:us.sizes[pe],visible:da})}const Ks=ta(V/j,N/j),Hn=Pt,Gn=Et;xi={frame:Me,from:vi,x:Hn,y:Gn,left:Number.isFinite(q)?q:Hn,top:Number.isFinite(Ge)?Ge:Gn,right:Number.isFinite(ce)?ce:Hn,bottom:Number.isFinite(Be)?Be:Gn,visible:Ks,patches:Ba},Ji=J,Kt[0]=Me,Kt[1]=Zt,Kt[2]=dt,Kt[3]=yt,Kt[4]=Je.width,Kt[5]=Je.depth;for(let pe=0;pe<16;pe++)Kt[6+pe]=ie[pe],Kt[22+pe]=$[pe]}d.onFireAnchor(xi),gi=!0}}else gi&&((ki=d.onFireAnchor)==null||ki.call(d,null),gi=!1,pi="",Ji="",xi=null);const et=o.current;if(et){let P=!1;if(d.inWorkspace&&!C&&!d.cinemaActive&&Y.distance>rp){const H=[[0,0,1,0,f.widthKm],[1,0,1,1,f.depthKm],[1,1,0,1,f.widthKm],[0,1,0,0,f.depthKm]];let W=H[0],O=1/0;for(const ce of H){const Ge=Wt((ce[0]+ce[2])*.5)-T.position.x,Be=Vt((ce[1]+ce[3])*.5)-T.position.z,st=Ge*Ge+Be*Be;st<O&&(O=st,W=ce)}const J=W[4];let ie=1;for(const ce of[1,2,5,10,20,50,100])ce<=J*.3&&(ie=ce);const $=ce=>{const Ge=lp+ce/J;return[W[0]+(W[2]-W[0])*Ge,W[1]+(W[3]-W[1])*Ge]},qe=.07*(1-ga);let V=1/0;for(let ce=0;ce<=8;ce++){const[Ge,Be]=$(ie*ce/8);V=Math.min(V,Mt(Ge,Be))}const N=ce=>{const[Ge,Be]=$(ce);return nt.set(Wt(Ge),V-qe,Vt(Be)).project(T),nt.z<=-1||nt.z>=1?null:[(nt.x*.5+.5)*dt,(-nt.y*.5+.5)*yt]},j=N(0),q=N(ie);if(j&&q){const ce=Math.hypot(q[0]-j[0],q[1]-j[1]);if(ce>40){let Ge=-(q[1]-j[1])/ce,Be=(q[0]-j[0])/ce;Be>0&&(Ge=-Ge,Be=-Be);const st=(ha,Ba)=>`M${ha[0].toFixed(1)},${ha[1].toFixed(1)} L${(ha[0]+Ge*Ba).toFixed(1)},${(ha[1]+Be*Ba).toFixed(1)}`,Pt=`${st(j,7)} M${j[0].toFixed(1)},${j[1].toFixed(1)} L${q[0].toFixed(1)},${q[1].toFixed(1)} ${st(q,7)}`;Pt!==cl&&(cl=Pt,(Gs=l.current)==null||Gs.setAttribute("d",Pt));const Et=u.current,ta=q[0]>=j[0]?q:j,ra=`${ie} km|${(ta[0]+8).toFixed(1)}|${(ta[1]+4).toFixed(1)}`;if(Et&&ra!==ul){ul=ra;const[ha,Ba,Ks]=ra.split("|");Et.textContent=ha,Et.setAttribute("x",Ba),Et.setAttribute("y",Ks)}P=!0}}}P!==hl&&(hl=P,et.style.opacity=P?"1":"0")}const je=d.inWorkspace&&!d.cleanHud&&!d.cinemaActive,St=wr(f),[ft,ne,ke,De]=f.bbox,tt=Math.max(1e-4,ke-ft),He=Math.max(1e-4,De-ne),se=[],Pe=232,Tt=pt?pt.left*dt+12:24,_t=Math.max(Tt,(pt?pt.right*dt-12:dt-356)-Pe),Ft=pt?pt.top*yt+12:68,za=Math.max(Ft,pt?pt.bottom*yt-76:Math.max(160,yt-134)),bs=pt?(pt.left+pt.right)*.5*dt:dt*.44;for(let P=0;P<3;P++){const H=St[P];if(!je||!H){se.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const W=_.clamp((H.lon-ft)/tt,.04,.96),O=_.clamp((H.lat-ne)/He,.04,.96),J=Mt(W,O)+.05;if(nt.set(Wt(W),J,Vt(O)).project(T),nt.z>=1||nt.z<=-1){se.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const ie=(nt.x*.5+.5)*dt,$=(-nt.y*.5+.5)*yt,V=(P===1||ie+108>_t||ie>bs?-1:1)>0?ie+56:ie-56-Pe,N=_.clamp(V,Tt,_t),j=_.clamp($-(P===0?64:P===1?48:-44),Ft,za);se.push({ax:ie,ay:$,bx:N,by:j,valid:!0})}const Xt=240,Dt=62;for(let P=0;P<2;P++)for(let H=0;H<se.length;H++)if(se[H].valid)for(let W=H+1;W<se.length;W++){if(!se[W].valid)continue;const O=se[W].bx-se[H].bx,J=se[W].by-se[H].by;if(Math.abs(O)<Xt&&Math.abs(J)<Dt){const ie=(Dt-Math.abs(J))*.55*(J>=0?1:-1);se[H].by=_.clamp(se[H].by-ie,Ft,za),se[W].by=_.clamp(se[W].by+ie,Ft,za)}}for(let P=0;P<3;P++){const H=se[P],W=s.current[P],O=i.current[P],J=a.current[P];if(!H||!H.valid){W&&(W.style.opacity="0"),O&&(O.style.opacity="0",O.style.pointerEvents="none",O.style.visibility="hidden"),J&&(J.style.opacity="0");continue}if(W&&(W.style.opacity="1",W.style.transform=`translate3d(${H.ax.toFixed(1)}px, ${H.ay.toFixed(1)}px, 0) translate(-50%, -50%)`),O&&(O.style.opacity="1",O.style.pointerEvents="auto",O.style.visibility="visible",O.style.transform=`translate3d(${H.bx.toFixed(1)}px, ${H.by.toFixed(1)}px, 0)`),J){const ie=H.ax+(H.bx-H.ax)*.42,$=H.by+22,qe=H.bx>H.ax?H.bx:H.bx+(O?O.offsetWidth:Pe);J.setAttribute("points",`${H.ax.toFixed(1)},${H.ay.toFixed(1)} ${ie.toFixed(1)},${$.toFixed(1)} ${qe.toFixed(1)},${$.toFixed(1)}`),J.style.opacity="1"}}Bn+=1,Ro+=w;const Aa=ms?"holding":kn>=0&&zt-kn<Su?"fading":"shown",ts=Aa!==sc;if(sc=Aa,Ro>=.32||ts){const P=Bn/Math.max(.001,Ro);if(On=On*.55+Math.min(120,P)*.45,Bn=0,Ro=0,zt-Sc>=.3||ts){Sc=zt;const H={fps:Math.round(On),vertexCount:ao.geometry.getAttribute("position").count+Si.geometry.getAttribute("position").count,orthoResolution:f.orthoLabel,demResolution:f.demLabel,activeTheaterId:d.activeTheaterId,slewActive:de||ya,cinemaProgress:Ue,wavePosition:0,imageryAttribution:Kp(f),missingFiles:tp(f,v.current),film:Qt?{move:Qt,progress:Bs}:void 0,verticalExaggeration:Pr,landingStandpoint:C&&La?fo:void 0,intensityLegend:sp(f),realPass:ln,lastSeen:Qi,passOnShow:di,dayPicture:an,picture:Aa,regionGrid:d.regionGridDivisions?xh(f,d.regionGridDivisions):void 0};(ko=d.onTelemetry)==null||ko.call(d,H)}}};return zn=requestAnimationFrame(Tc),()=>{var w;p=!0,cancelAnimationFrame(zn),nc.disconnect(),Ja==null||Ja.removeEventListener("change",Pn),Ta.removeEventListener("pointerdown",dc),window.removeEventListener("pointermove",fc),window.removeEventListener("pointerup",mc),Ta.removeEventListener("pointerleave",pc),Ta.removeEventListener("wheel",vc),wo.removeEventListener("change",xc),Ta.removeEventListener("contextmenu",gc),xl.dispose(),wl.dispose(),wi.dispose(),fn.dispose(),mn.dispose(),xn.dispose(),Ll.dispose(),Nl.dispose(),zl.dispose(),Ul.dispose();for(const d of K)d.dispose();Fe.dispose(),Le.dispose(),Gi.dispose(),Ki.dispose(),Wi.dispose(),oa.dispose(),ct.dispose(),ds==null||ds.dispose(),bi==null||bi.dispose(),Pl.dispose(),vn.dispose(),gn.dispose();for(const d of ba.values())Yl(d);ba.clear(),io.dispose(),ja.dispose(),D.environment=null,ye.dispose();const n=new Set,m=d=>{!d||n.has(d)||(n.add(d),d.dispose())};for(const d of new Set([...ve.values(),...he.values(),...at,Q,f]))!d.pack&&d.lite===null&&(m(d.demTex),m(d.satTex)),m((w=d.fireHistory)==null?void 0:w.texture),m(d.shadow);L.dispose(),b.dispose(),Ta.parentElement===g&&g.removeChild(Ta),y.current=null}},[]),Ct.useEffect(()=>{var g;(g=y.current)==null||g.applyCameraPreset()},[e.cameraPreset,e.inWorkspace,e.mode]),Ct.useEffect(()=>{var g;(g=y.current)==null||g.syncCinemaStart(e.cinemaActive)},[e.cinemaActive]);const M=Ct.useRef(null),E=Ct.useRef(e.activeTheaterId);return Ct.useEffect(()=>{const g=y.current;if(!g)return;const p=e.slewRequest;if(p&&p.nonce!==M.current){M.current=p.nonce,E.current=p.targetTheaterId,g.triggerSlew(p.targetTheaterId);return}e.activeTheaterId!==E.current&&(E.current=e.activeTheaterId,g.triggerSlew(e.activeTheaterId))},[e.activeTheaterId,e.slewRequest]),Ct.useEffect(()=>{const g=e.activeRun,p=y.current;if(!g||!p)return;let b=!1;const F=p.takeRunBundle(g.run_id);if(F){p.activateBundle(F,F.regionId!==p.onScreenRegionId());return}return(async()=>{var A;try{const z=p.bundleCache.get(g.region.id),D=g.assets.dem_hires_f32_url?Oa(x.current,g.assets.dem_hires_f32_url):null,T=Oa(x.current,g.assets.dem_f32_url),L=Oa(x.current,g.assets.satellite_url),U=!!(x.current.filmMove??du()),K=Oa(x.current,g.assets.reconstruction_u8_url),G=async()=>{if(D){const ct=await fetch(D).catch(()=>null);if(ct&&ct.ok)return ct.arrayBuffer()}const Le=await fetch(T).catch(()=>null);return Le&&Le.ok?Le.arrayBuffer():null},X=()=>new Promise(Le=>{if(U){Le(null);return}p.texLoader.load(L,ct=>{ct.colorSpace=ot,ct.anisotropy=p.maxAnisotropy,ct.minFilter=Ga,ct.magFilter=ze,ct.wrapS=Ve,ct.wrapT=Ve,Le(ct)},void 0,()=>Le(null))}),[ue,oe,Te]=await Promise.all([G(),X(),fetch(K).catch(()=>null)]),ye=Te&&Te.ok?await Te.arrayBuffer():null;if(b)return;const ve=Eu(g.region.id)?Li[g.region.id]:null,he=g.region.bbox,ht=g.observer_passes?Xh(g.observer_passes,he):xr(),fe=ht.dataSource==="firms",te=[],Q=z&&!(fe&&z.noRealGround)?z:void 0,f=z&&!(fe&&z.noRealPicture)?z:void 0;fe&&!ue&&!Q&&te.push("elevation"),fe&&!oe&&!f&&!U&&te.push("imagery"),fe&&!ye&&te.push("field");const at=ue?ks(new Float32Array(ue),!0):Q?{texture:Q.demTex,aligned:Q.alignedDem,gridRes:Q.demGridRes,minElev:Q.minElevM,maxElev:Q.maxElevM}:ks(fe?new Float32Array(4096).fill(Number.isFinite(g.region.min_elev_m)?g.region.min_elev_m:0):kc("plumas_ca",256),!1),At=ye?vd(new Uint8Array(ye),!0):fe||!z?{buffer:gr(),frames:Js}:{buffer:z.tensor,frames:z.frameCount},Ht=oe??(f==null?void 0:f.satTex)??(fe?J0():null)??_c(ve?ve.id:"plumas_ca",at.aligned,at.gridRes,at.minElev,at.maxElev,p.maxAnisotropy),Nt=oe&&typeof((A=oe.image)==null?void 0:A.width)=="number"?oe.image.width:2048,Gt=Rr(g.region.id,he,at.aligned,at.gridRes,At.buffer,At.frames),va=g.region.min_elev_m<=1.5,jt={key:`run-${g.run_id}`,regionId:g.region.id,runId:g.run_id,missingFiles:te.length>0?te:void 0,demTex:at.texture,alignedDem:at.aligned,demGridRes:at.gridRes,minElevM:Number.isFinite(g.region.min_elev_m)?Math.min(at.minElev,g.region.min_elev_m):at.minElev,maxElevM:Number.isFinite(g.region.max_elev_m)?Math.max(at.maxElev,g.region.max_elev_m):at.maxElev,satTex:Ht,orthoLabel:oe?Nt>=1600?"2K":"1K":(f==null?void 0:f.orthoLabel)??(fe?"not loaded":"drawn stand-in"),demLabel:ue||Q||!fe?`${at.gridRes}²`:"not loaded",noRealGround:ue?void 0:Q?Q.noRealGround:!0,noRealPicture:oe?void 0:f?f.noRealPicture:!0,tensor:At.buffer,frameCount:At.frames,bbox:he,windDirUv:[...Dp],hasSeaCoast:va,observerDataset:ht,findings:Gt.anchors,callouts:Gt.callouts,fieldScale:qh(g.encoding),residenceHours:jh(g.model)??void 0,declared:tr(g.declared_cells),answeredByOther:Q0(g),fireHistory:null,...Er(Math.max(18,g.region.width_km||60),Math.max(12,g.region.depth_km||pr(he)),g.assets.terrain_pack,Nt,oe?Au:(f==null?void 0:f.attribution)??"")};p.storeRunBundle(g.region.id,g.run_id,jt);const Ze=Zh(g.belief_frames),lt=h.current,qt=Ze&&!lt.has(g.run_id)?[...lt.values()].find(Le=>Le.info.url===Ze.url&&Le.info.steps===Ze.steps):void 0;if(Ze&&qt)for(lt.set(g.run_id,{info:Ze,bytes:qt.bytes,declared:tr(g.declared_cells)});lt.size>6;)lt.delete(lt.keys().next().value);Ze&&!lt.has(g.run_id)&&fetch(Oa(x.current,Ze.url)).then(Le=>Le.ok?Le.arrayBuffer():null).then(Le=>{if(!Le||Le.byteLength!==Ze.steps*Ze.nx*Ze.ny*2){v.current.add(g.run_id);return}for(lt.set(g.run_id,{info:Ze,bytes:new Uint8Array(Le),declared:tr(g.declared_cells)});lt.size>6;)lt.delete(lt.keys().next().value)}).catch(()=>{v.current.add(g.run_id)});const Fe=x.current.activeTheaterId;(!Eu(g.region.id)||g.region.id===Fe)&&p.activateBundle(jt,!0)}catch{}})(),()=>{b=!0}},[e.activeRun,e.apiBase]),sa.jsx("div",{ref:t,tabIndex:0,role:"application","aria-label":"3D terrain of the place, with the fire on it",onKeyDown:g=>{var p;!e.inWorkspace&&g.key==="Enter"&&((p=e.onEnterWorkspace)==null||p.call(e))},style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",outline:"none",backgroundColor:"#080b11",cursor:e.inWorkspace?"grab":"pointer"},children:sa.jsxs("div",{"aria-hidden":!e.inWorkspace||e.cleanHud||e.cinemaActive,style:{position:"absolute",inset:0,pointerEvents:"none",zIndex:5},children:[sa.jsxs("svg",{width:"100%",height:"100%",style:{position:"absolute",inset:0,overflow:"visible",pointerEvents:"none"},children:[[0,1,2].map(g=>sa.jsx("polyline",{ref:p=>{a.current[g]=p},fill:"none",stroke:r[g]&&e.selectedFindingId===r[g].id?"rgba(155, 227, 255, 0.88)":"rgba(245, 246, 250, 0.34)",strokeWidth:"1",style:{opacity:0,transition:"stroke 160ms ease"}},g)),sa.jsxs("g",{ref:o,className:"stage-scale",style:{opacity:0},children:[sa.jsx("path",{ref:l,fill:"none",stroke:"rgba(243, 244, 246, 0.72)",strokeWidth:"1"}),sa.jsx("text",{ref:u,fill:"rgba(243, 244, 246, 0.92)",stroke:"rgba(8, 11, 17, 0.72)",strokeWidth:"3",style:{fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",paintOrder:"stroke"}})]})]}),[0,1,2].map(g=>{const p=r[g],b=!!(p&&e.selectedFindingId===p.id),F=(p==null?void 0:p.kind)==="uncertainty"?"#9be3ff":(p==null?void 0:p.kind)==="subpixel"?"#ffb36b":"#ff7849";return sa.jsxs("div",{children:[sa.jsx("div",{ref:A=>{s.current[g]=A},style:{position:"absolute",top:0,left:0,width:"14px",height:"14px",display:"flex",alignItems:"center",justifyContent:"center",color:F,fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"13px",fontWeight:600,lineHeight:1,textShadow:"0 1px 6px rgba(0, 0, 0, 0.9)",opacity:0,willChange:"transform, opacity"},children:"+"}),sa.jsxs("button",{ref:A=>{i.current[g]=A},type:"button","data-stage-ui":"true",onClick:()=>{var A;p&&((A=e.onSelectFinding)==null||A.call(e,p))},style:{position:"absolute",top:0,left:0,minWidth:"188px",maxWidth:"248px",padding:"7px 10px",textAlign:"left",borderRadius:0,border:b?`1px solid ${F}`:"1px solid rgba(243, 244, 246, 0.24)",background:"rgba(10, 13, 19, 0.88)",color:"#f3f4f6",cursor:"pointer",opacity:0,visibility:"hidden",pointerEvents:"none",willChange:"transform, opacity"},children:[sa.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px",fontFamily:"'Geist', -apple-system, sans-serif",fontSize:"13px",fontWeight:500,letterSpacing:"-0.01em",color:"#f3f4f6"},children:[sa.jsx("span",{children:(p==null?void 0:p.title)??""}),sa.jsx("span",{style:{width:"6px",height:"6px",borderRadius:0,backgroundColor:F,flexShrink:0}})]}),sa.jsx("div",{style:{marginTop:"3px",fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",fontVariantNumeric:"tabular-nums",color:F},children:(p==null?void 0:p.valueText)??""})]})]},g)})]})})}export{Zp as EarthCutawayStage,Zp as default};
