const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GLTFLoader-C8Ag2Ruc.js","assets/three.module-CibWwfTb.js","assets/DRACOLoader-LNaB3iNp.js"])))=>i.map(i=>d[i]);
var kh=Object.defineProperty;var _h=(e,t,a)=>t in e?kh(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a;var A=(e,t,a)=>_h(e,typeof t!="symbol"?t+"":t,a);import{L as qn,_ as Ac,r as Ct,x as Fh,S as kc,j as sa}from"./index-C-k-Vm6p.js";import{S as ci,O as Nr,W as Ht,C as Ve,R as ai,L as ze,H as Pa,a as At,b as yt,M as ga,P as Ko,c as k,D as ya,d as aa,e as Fu,F as zr,N as Uo,f as Dh,g as nt,U as Ut,B as Wo,h as ua,i as Du,V as U,j as _c,k as Ia,I as Ph,T as Ur,l as Ga,m as Ne,n as va,o as Zn,p as Ih,q as Ch,r as ke,s as Vo,t as Bo,u as Qs,v as _s,w as Lh,E as Br,x as Pu,y as Is,z as Or,A as Hr,G as Iu,J as Nh,K as zh,Q as Cu,X as Uh,Y as si,Z as qs,_ as Bh,$ as Oh,a0 as Hh,a1 as Gh,a2 as Kh,a3 as Qn,a4 as Wh,a5 as Vh,a6 as Lu,a7 as _i,a8 as Jn,a9 as Yh,aa as $h,ab as Xh,ac as jh,ad as qh,ae as Zh}from"./three.module-CibWwfTb.js";import{n as Qh,p as Jh,a as ed,b as td,D as Zs,f as Oo,c as Nu}from"./types-CZu1tyoc.js";const Lo=6360,Gr=60,zu=8,Uu=1.2,ii=[.005802,.013558,.0331],ad=.003996,No=.00444,oi=[65e-5,.001881,85e-6],sd=.8,is=64,Fs=32,ni=-.2,id=192,od=108,ri=[5.25,5.05,4.8],nd=.4,er=.4,rd=.72;function ld(e){return Math.max(0,1-Math.abs(e-25)/15)}function Bu(e,t){const a=Lo+e,s=Lo+Gr,i=a*a*(t*t-1)+s*s,o=Math.max(0,-a*t+Math.sqrt(Math.max(0,i))),l=48,u=o/l;let r=0,c=0,h=0;for(let p=0;p<l;p++){const x=(p+.5)*u,y=Math.max(0,Math.sqrt(a*a+x*x+2*a*x*t)-Lo);r+=Math.exp(-y/zu)*u,c+=Math.exp(-y/Uu)*u,h+=ld(y)*u}return[ii[0]*r+No*c+oi[0]*h,ii[1]*r+No*c+oi[1]*h,ii[2]*r+No*c+oi[2]*h]}function Ou(e,t){const a=Bu(Math.max(0,e),Math.max(ni,t));return[Math.exp(-a[0]),Math.exp(-a[1]),Math.exp(-a[2])]}function cd(e,t,a){const s=Ou(e,t),i=[1.404,1.287,1.17];return a.set(.5*i[0]+.5*ri[0]*s[0]/Math.PI,.5*i[1]+.5*ri[1]*s[1]/Math.PI,.5*i[2]+.5*ri[2]*s[2]/Math.PI)}function ud(){const e=new Uint16Array(is*Fs*4);for(let a=0;a<Fs;a++){const s=a/(Fs-1),i=s*s*Gr;for(let o=0;o<is;o++){const l=ni+o/(is-1)*(1-ni),u=Bu(i,l),r=(a*is+o)*4;e[r]=ya.toHalfFloat(Math.exp(-u[0])),e[r+1]=ya.toHalfFloat(Math.exp(-u[1])),e[r+2]=ya.toHalfFloat(Math.exp(-u[2])),e[r+3]=ya.toHalfFloat(1)}}const t=new aa(e,is,Fs,At,Pa);return t.minFilter=ze,t.magFilter=ze,t.wrapS=Ve,t.wrapT=Ve,t.generateMipmaps=!1,t.flipY=!1,t.needsUpdate=!0,t}function pt(e){const t=e.toPrecision(8);return/[.e]/.test(t)?t:`${t}.0`}const Yo=`
const float ATM_RG = ${pt(Lo)};
const float ATM_TOP = ${pt(Gr)};
const float ATM_HR = ${pt(zu)};
const float ATM_HM = ${pt(Uu)};
const vec3 ATM_BETA_R = vec3(${pt(ii[0])}, ${pt(ii[1])}, ${pt(ii[2])});
const float ATM_BETA_MS = ${pt(ad)};
const float ATM_BETA_ME = ${pt(No)};
const vec3 ATM_BETA_O = vec3(${pt(oi[0])}, ${pt(oi[1])}, ${pt(oi[2])});
const vec3 ATM_SUN = vec3(${pt(ri[0])}, ${pt(ri[1])}, ${pt(ri[2])});
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
  const float g = ${pt(sd)};
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
`,$o=`
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
`,Hu=`
uniform sampler2D uTransmittanceLut;

vec3 atmTransmittanceToSpace(float hKm, float mu) {
  float u = (clamp(mu, ${pt(ni)}, 1.0) - (${pt(ni)})) / ${pt(1-ni)};
  float v = sqrt(clamp(hKm / ATM_TOP, 0.0, 1.0));
  vec2 uv = vec2(u * ${pt((is-1)/is)} + ${pt(.5/is)}, v * ${pt((Fs-1)/Fs)} + ${pt(.5/Fs)});
  return texture2D(uTransmittanceLut, uv).rgb;
}
`,Xo=`
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
`,hd=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,dd=`
${Yo}
${Hu}
${Xo}

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
`,fd=`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,md=`
${Yo}
${Hu}
${Xo}

uniform sampler2D uSkyView;
uniform vec3 uSunTrue;             // unit vector toward the sun, true scale
uniform float uCamAltKm;
uniform float uVerticalExaggeration;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform float uSkyExposure;
${$o}
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
`;class pd{constructor(){A(this,"transmittance");A(this,"skyView");A(this,"scene",new ci);A(this,"camera",new Nr(-1,1,1,-1,0,1));A(this,"material");A(this,"quad");A(this,"lastSunSin",9);A(this,"lastAltKm",-9);this.transmittance=ud(),this.skyView=new Ht(id,od,{format:At,type:Pa,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1,wrapS:ai,wrapT:Ve}),this.material=new yt({vertexShader:hd,fragmentShader:dd,uniforms:{uTransmittanceLut:{value:this.transmittance},uSunSin:{value:.5},uCamAltKm:{value:5}},depthTest:!1,depthWrite:!1,toneMapped:!1}),this.quad=new ga(new Ko(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}update(t,a,s){const i=k.clamp(a.y,-.15,1);if(Math.abs(i-this.lastSunSin)<1e-4&&Math.abs(s-this.lastAltKm)<.02)return;this.lastSunSin=i,this.lastAltKm=s,this.material.uniforms.uSunSin.value=i,this.material.uniforms.uCamAltKm.value=s;const o=t.getRenderTarget();t.setRenderTarget(this.skyView),t.render(this.scene,this.camera),t.setRenderTarget(o)}dispose(){this.transmittance.dispose(),this.skyView.dispose(),this.material.dispose(),this.quad.geometry.dispose()}}const Ui=14.8,Bi=10.8,Gu=511,Ds=-.44,We=256,Js=24,vd=80,gd=24,os=["plumas_ca","lytton_bc","evia_greece","blue_mountains_au"],Li={plumas_ca:{id:"plumas_ca",bbox:[-121.6,39.75,-120.75,40.35],widthKm:72.5,minElevM:313,maxElevM:2357,windDirUv:[.68,.73],paletteBase:[.14,.21,.14],paletteRidge:[.44,.43,.4],hasSeaCoast:!1},lytton_bc:{id:"lytton_bc",bbox:[-121.95,49.95,-121.2,50.52],widthKm:54,minElevM:195,maxElevM:2860,windDirUv:[.42,.91],paletteBase:[.24,.22,.16],paletteRidge:[.56,.54,.52],hasSeaCoast:!1},evia_greece:{id:"evia_greece",bbox:[23.02,38.62,23.62,39.12],widthKm:52,minElevM:0,maxElevM:1385,windDirUv:[-.62,-.78],paletteBase:[.27,.3,.2],paletteRidge:[.64,.6,.52],hasSeaCoast:!0},blue_mountains_au:{id:"blue_mountains_au",bbox:[150.02,-33.92,150.74,-33.32],widthKm:66,minElevM:68,maxElevM:1215,windDirUv:[.79,-.61],paletteBase:[.15,.22,.17],paletteRidge:[.54,.38,.27],hasSeaCoast:!1}};function xd(e){const t=os.indexOf(e);return t>=0?t:0}function wd(){const e=new Uint8Array(1024);for(let a=0;a<256;a++)e[a*4]=qn[a*3],e[a*4+1]=qn[a*3+1],e[a*4+2]=qn[a*3+2],e[a*4+3]=255;const t=new aa(e,256,1,At,Ut);return t.colorSpace=nt,t.minFilter=ze,t.magFilter=ze,t.wrapS=Ve,t.wrapT=Ve,t.needsUpdate=!0,t}function ks(e,t=!0){const a=Math.max(2,Math.floor(Math.sqrt(e.length))),s=a*a,i=new Float32Array(s);let o=Number.POSITIVE_INFINITY,l=Number.NEGATIVE_INFINITY;for(let r=0;r<a;r++){const h=(t?a-1-r:r)*a,p=r*a;for(let x=0;x<a;x++){const y=Number.isFinite(e[h+x])?e[h+x]:0;i[p+x]=y,y<o&&(o=y),y>l&&(l=y)}}Number.isFinite(o)||(o=0),(!Number.isFinite(l)||l<=o+1)&&(l=o+1e3);const u=new aa(i,a,a,Fu,zr);return u.internalFormat="R32F",u.minFilter=Uo,u.magFilter=Uo,u.wrapS=Ve,u.wrapT=Ve,u.flipY=!1,u.generateMipmaps=!1,u.needsUpdate=!0,{texture:u,aligned:i,gridRes:a,minElev:o,maxElev:l}}function Fc(e,t=256){const a=Li[e],s=new Float32Array(t*t),i=xd(e)*2.35;for(let o=0;o<t;o++){const u=(1-o/(t-1)-.5)*2;for(let r=0;r<t;r++){const h=(r/(t-1)-.5)*2,p=.24*Math.sin(u*2.7+i)+.11*Math.cos(u*5.6-i),x=Math.abs(h*.88-p),y=Math.pow(Math.min(1.3,x*1.18),.78),M=1-Math.abs(Math.sin(h*4.4+u*3.1+i)),E=1-Math.abs(Math.cos(h*8.9-u*7.4-i*.6)),g=.5+.5*Math.sin(h*18.5+u*16.2+i*1.3);let m=y*(.58+.28*M*M+.11*E+.04*g);if(a.hasSeaCoast){const S=1-Math.max(0,Math.hypot(h*.92,u*.84)-.62)*1.9;m=Math.max(0,m*S-.08)}s[o*t+r]=a.minElevM+Math.max(0,Math.min(1.05,m))*(a.maxElevM-a.minElevM)}}return s}function Dc(e,t,a,s,i,o){const l=Li[e],u=512,r=document.createElement("canvas");r.width=u,r.height=u;const c=r.getContext("2d");if(c){const p=c.createImageData(u,u),x=p.data,y=Math.max(100,i-s);for(let M=0;M<u;M++){const E=1-M/(u-1),g=Math.min(a-1,Math.max(0,Math.round(E*(a-1)))),m=Math.min(a-1,g+1);for(let S=0;S<u;S++){const _=S/(u-1),F=Math.min(a-1,Math.max(0,Math.round(_*(a-1)))),P=Math.min(a-1,F+1),N=t[g*a+F],D=t[g*a+P],T=t[m*a+F],B=Math.max(0,Math.min(1,(N-s)/y)),K=Math.min(1,Math.hypot(D-N,T-N)/48),G=.92+.08*Math.sin(S*.47+M*.31)*Math.cos(S*.19-M*.53);let q,he,oe;if(l.hasSeaCoast&&N<=2.2)q=.05,he=.14+.04*G,oe=.24+.05*G;else{const Me=Math.min(1,Math.max(0,B*.72+K*.55));if(q=(l.paletteBase[0]*(1-Me)+l.paletteRidge[0]*Me)*G,he=(l.paletteBase[1]*(1-Me)+l.paletteRidge[1]*Me)*G,oe=(l.paletteBase[2]*(1-Me)+l.paletteRidge[2]*Me)*G,l.maxElevM>2200&&B>.84){const _e=(B-.84)/.16;q=q*(1-_e*.55)+.78*_e*.55,he=he*(1-_e*.55)+.8*_e*.55,oe=oe*(1-_e*.55)+.84*_e*.55}}const ye=(M*u+S)*4;x[ye]=Math.min(255,Math.max(0,Math.round(q*255))),x[ye+1]=Math.min(255,Math.max(0,Math.round(he*255))),x[ye+2]=Math.min(255,Math.max(0,Math.round(oe*255))),x[ye+3]=255}}c.putImageData(p,0,0)}const h=new Dh(r);return h.colorSpace=nt,h.anisotropy=o,h.wrapS=Ve,h.wrapT=Ve,h.needsUpdate=!0,h}function Md(e,t=!0){const a=We*We*4,s=Math.max(1,Math.floor(e.byteLength/a));if(!t)return{buffer:e.slice(0,s*a),frames:s};const i=new Uint8Array(s*a),o=We*4;for(let l=0;l<s;l++){const u=l*a;for(let r=0;r<We;r++){const c=u+(We-1-r)*o,h=u+r*o;i.set(e.subarray(c,c+o),h)}}return{buffer:i,frames:s}}const jo=`
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
`;function Pc(e=Gu){const a=(e+1)*2*4,s=e*6*4,i=new Float32Array(a*3),o=new Float32Array(a*3),l=new Float32Array(a*4),u=new Uint32Array(s),r=[{normal:[0,0,1],evalUv:x=>[x,0]},{normal:[1,0,0],evalUv:x=>[1,x]},{normal:[0,0,-1],evalUv:x=>[1-x,1]},{normal:[-1,0,0],evalUv:x=>[0,1-x]}];let c=0,h=0;for(let x=0;x<4;x++){const y=r[x],M=c;for(let E=0;E<=e;E++){const g=E/e,[m,S]=y.evalUv(g),_=(m-.5)*Ui,F=(.5-S)*Bi,P=x+g;i[c*3]=_,i[c*3+1]=0,i[c*3+2]=F,o[c*3]=y.normal[0],o[c*3+1]=y.normal[1],o[c*3+2]=y.normal[2],l[c*4]=m,l[c*4+1]=S,l[c*4+2]=1,l[c*4+3]=P,c++,i[c*3]=_,i[c*3+1]=Ds,i[c*3+2]=F,o[c*3]=y.normal[0],o[c*3+1]=y.normal[1],o[c*3+2]=y.normal[2],l[c*4]=m,l[c*4+1]=S,l[c*4+2]=0,l[c*4+3]=P,c++}for(let E=0;E<e;E++){const g=M+E*2,m=g+1,S=g+2,_=g+3;u[h++]=g,u[h++]=m,u[h++]=S,u[h++]=S,u[h++]=m,u[h++]=_}}const p=new Wo;return p.setAttribute("position",new ua(i,3)),p.setAttribute("normal",new ua(o,3)),p.setAttribute("aSkirtParam",new ua(l,4)),p.setIndex(new ua(u,1)),p.boundingSphere=new Du(new U(0,.8,0),14),p}const yd=`
${jo}

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
`,bd=`
${$o}
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
`,Sd=`
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Td=`
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
`;function Ed(e){return Math.max(0,Math.min(e-1,Math.floor((e-1)*.52)))}const Rd=11,Ad=.42,kd=8;function _d(e,t,a,s,i,o){const[l,u,r,c]=t,h=i.gridSize,p=Ed(s),x=p*h*h*4,y=`pass ${p+1}`;let M=!1,E={gx:Math.round(h*.5),gy:Math.round(h*.5),zMw:0};for(let K=14;K<h-14;K+=2)for(let G=14;G<h-14;G+=2){const q=a[x+(K*h+G)*4]/255*i.zMaxMwKm2;q>E.zMw&&(E={gx:G,gy:K,zMw:q},M=!0)}let g=!1,m=-1/0,S={gx:Math.round(h*.375),gy:Math.round(h*.42),zMw:0,modisMw:0};for(let K=14;K<h-14;K+=2)for(let G=14;G<h-14;G+=2){const q=x+(K*h+G)*4,he=a[q]/255*i.zMaxMwKm2,oe=a[q+2]/255*i.zMaxMwKm2,ye=Math.hypot(G-E.gx,K-E.gy);if(he>=Rd&&oe<he*Ad&&ye>24){const Me=o(G/(h-1),K/(h-1)),_e=he-oe*1.25-Me*6e-4;_e>m&&(m=_e,S={gx:G,gy:K,zMw:he,modisMw:oe},g=!0)}}let _=!1,F={gx:Math.round(h*.640625),gy:Math.round(h*.40625),sigmaMw:0};for(let K=14;K<h-14;K+=2)for(let G=14;G<h-14;G+=2){const q=x+(K*h+G)*4,he=a[q]/255*i.zMaxMwKm2,oe=a[q+1]/255*i.sigmaMaxMwKm2,ye=Math.hypot(G-E.gx,K-E.gy),Me=Math.hypot(G-S.gx,K-S.gy);he>=kd&&oe>F.sigmaMw&&ye>28&&Me>24&&(F={gx:G,gy:K,sigmaMw:oe},_=!0)}const P=(K,G,q,he,oe,ye,Me)=>{const _e=q/(h-1),ue=he/(h-1);return{id:`${e}-${K}`,kind:G,title:oe,subtitle:ye,valueText:Me,lat:u+ue*(c-u),lon:l+_e*(r-l),elevM:Math.round(o(_e,ue))}},N=P("front-core","front",E.gx,E.gy,M?"Strongest estimate":"",M?`Highest value of the simulated 375 m estimate at ${y}`:"",M?`${E.zMw.toFixed(1)} MW/km², ${y}`:""),D=P("canyon-subpixel","subpixel",S.gx,S.gy,g?"Estimate above MODIS":"",g?`Simulated estimate where the simulated MODIS pass reads far less, at ${y}`:"",g?`${S.zMw.toFixed(1)} MW/km², MODIS ${S.modisMw.toFixed(1)} MW/km², ${y}`:""),T=P("sigma-peak","uncertainty",F.gx,F.gy,_?"Least certain estimate":"",_?`One standard deviation of the simulated estimate at ${y}`:"",_?`±${F.sigmaMw.toFixed(1)} MW/km² (1 sigma), ${y}`:""),B=[];return M&&B.push(N),g&&B.push(D),_&&B.push(T),{anchors:[N,D,T],callouts:B}}const wt={azimuth:.5,polar:.98,distance:17.2,target:[.1,.3,.2]},Ic={overview:{azimuth:.48,polar:.97,distance:17,target:[-.6,.3,.3]},canyon:{azimuth:-.34,polar:1.24,distance:5.6,target:[-.42,.45,-.22]},ridge:{azimuth:.86,polar:1.12,distance:7.4,target:[.32,.6,-.14]},nadir:{azimuth:0,polar:.14,distance:18.5,target:[0,.3,0]},region:{azimuth:.48,polar:.75,distance:17,target:[-.3,.3,.2]}},Fd={azimuth:0,polar:.42,distance:12,target:[0,.3,0]};function Cc(e,t,a,s,i=!1){if(!t)return wt;const o=e==="region"&&i?Fd:Ic[e]??Ic.overview;return a==="observer"&&e==="overview"?{azimuth:o.azimuth,polar:.98,distance:18.4,target:[0,.7,.2]}:{azimuth:o.azimuth,polar:o.polar,distance:o.distance,target:[o.target[0],o.target[1],o.target[2]]}}function Ku(e){const t=Math.min(1,Math.max(0,e));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)*.5}const Ni=.95;class Dd{constructor(){A(this,"active",!1);A(this,"elapsedSec",0);A(this,"durationSec",Ni);A(this,"startAzimuth",wt.azimuth);A(this,"endAzimuth",wt.azimuth);A(this,"startPolar",wt.polar);A(this,"endPolar",wt.polar);A(this,"startDistance",wt.distance);A(this,"endDistance",wt.distance);A(this,"startTarget",new U(...wt.target));A(this,"endTarget",new U(...wt.target));A(this,"hopHeightDist",2.15)}trigger(t,a,s=2.15,i=Ni){this.active=!0,this.elapsedSec=0,this.durationSec=Math.max(.25,i),this.startAzimuth=t.azimuth;let o=a.azimuth-t.azimuth;for(;o>Math.PI;)o-=Math.PI*2;for(;o<-Math.PI;)o+=Math.PI*2;this.endAzimuth=t.azimuth+o,this.startPolar=t.polar,this.endPolar=a.polar,this.startDistance=t.distance,this.endDistance=a.distance,this.startTarget.copy(t.target),this.endTarget.set(a.target[0],a.target[1],a.target[2]),this.hopHeightDist=s}cancel(){this.active=!1}isActive(){return this.active}step(t,a){if(!this.active)return{slewActive:!1,rawProgress:1,easedProgress:1};this.elapsedSec+=Math.min(.08,Math.max(0,t));const s=Math.min(1,this.elapsedSec/this.durationSec),i=Ku(s),o=Math.sin(s*Math.PI);return a.azimuth=k.lerp(this.startAzimuth,this.endAzimuth,i),a.polar=k.clamp(k.lerp(this.startPolar,this.endPolar,i)-o*.085,.1,1.38),a.distance=k.lerp(this.startDistance,this.endDistance,i)+o*this.hopHeightDist,a.target.lerpVectors(this.startTarget,this.endTarget,i),s>=1&&(this.active=!1),{slewActive:this.active,rawProgress:s,easedProgress:i}}}function Pd(e){const t=e%2===0?1:-1,a=e>=2?-1:1,s=[new U(6.6*t,7.6,7.8*a),new U(4.2*t,3.3,5.1*a),new U(1.1*t,1.85,2.5*a),new U(-2.3*t,1.72,.15*a),new U(-4.6*t,2.65,-2.4*a),new U(-1.8*t,4.45,-4.6*a),new U(3.6*t,6.45,-2.2*a),new U(6.8*t,7.9,3.8*a)],i=[new U(0,.65,0),new U(-.35*t,.85,.45*a),new U(-1.35*t,1.05,-.55*a),new U(-1.85*t,1.12,-1.35*a),new U(-.65*t,1.02,-.85*a),new U(.25*t,.88,-.15*a),new U(.1*t,.72,.15*a),new U(0,.65,0)];return{eyeCurve:new _c(s,!0,"catmullrom",.5),lookCurve:new _c(i,!0,"catmullrom",.5)}}const Fi=13.5;class Id{constructor(){A(this,"rigs");A(this,"elapsedSec",0);A(this,"currentLegIndex",0);A(this,"tmpEye",new U);A(this,"tmpEyeAhead",new U);A(this,"tmpEyeBehind",new U);A(this,"tmpLook",new U);A(this,"tmpVelA",new U);A(this,"tmpVelB",new U);A(this,"tmpForward",new U);A(this,"tmpRight",new U);A(this,"tmpUp",new U(0,1,0));A(this,"worldUp",new U(0,1,0));this.rigs=[0,1,2,3].map(t=>Pd(t))}startAtTheater(t){const a=Math.max(0,os.indexOf(t));this.currentLegIndex=a,this.elapsedSec=a*Fi}update(t,a,s,i=Ui,o=Bi){const l=Math.min(.08,Math.max(0,t));this.elapsedSec+=l;const u=Fi*os.length,r=(this.elapsedSec%u+u)%u,c=Math.min(os.length-1,Math.floor(r/Fi)),h=(r-c*Fi)/Fi;c!==this.currentLegIndex&&(this.currentLegIndex=c,s==null||s(os[c]));const p=this.rigs[c],x=.008,y=(h-x+1)%1,M=(h+x)%1;p.eyeCurve.getPointAt(h,this.tmpEye),p.eyeCurve.getPointAt(y,this.tmpEyeBehind),p.eyeCurve.getPointAt(M,this.tmpEyeAhead),p.lookCurve.getPointAt(h,this.tmpLook);const E=this.tmpEye.x/i+.5,g=.5-this.tmpEye.z/o;if(E>=-.02&&E<=1.02&&g>=-.02&&g<=1.02){const B=a(Math.min(1,Math.max(0,E)),Math.min(1,Math.max(0,g)))+.78;this.tmpEye.y<B&&(this.tmpEye.y=B)}const m=this.tmpLook.x/i+.5,S=.5-this.tmpLook.z/o,_=a(Math.min(1,Math.max(0,m)),Math.min(1,Math.max(0,S)));this.tmpLook.y=Math.max(this.tmpLook.y,_+.18),this.tmpVelA.subVectors(this.tmpEye,this.tmpEyeBehind).setY(0),this.tmpVelB.subVectors(this.tmpEyeAhead,this.tmpEye).setY(0);let F=0;if(this.tmpVelA.lengthSq()>1e-6&&this.tmpVelB.lengthSq()>1e-6){this.tmpVelA.normalize(),this.tmpVelB.normalize();const T=this.tmpVelA.x*this.tmpVelB.z-this.tmpVelA.z*this.tmpVelB.x;F=k.clamp(T*1.45,-.11,.11)}this.tmpForward.subVectors(this.tmpLook,this.tmpEye).normalize(),this.tmpRight.crossVectors(this.tmpForward,this.worldUp).normalize(),this.tmpUp.copy(this.worldUp).applyAxisAngle(this.tmpForward,F).normalize();const P=.18+.68*(.5-.5*Math.cos(h*Math.PI*2)),D=39+Math.sin(h*Math.PI)*3.2;return{position:this.tmpEye,lookAt:this.tmpLook,up:this.tmpUp,fov:D,syntheticTimeProgress:P,cycleProgress:r/u,legProgress:h,activeLegTheater:os[c]}}}function Cd(e,t,a){a.target.copy(t),a.target.x=k.clamp(a.target.x,-Ui*.45,Ui*.45),a.target.z=k.clamp(a.target.z,-Bi*.45,Bi*.45),a.target.y=k.clamp(a.target.y,-.1,2.2);const s=new U().subVectors(e,a.target),i=k.clamp(s.length(),4.2,26),o=k.clamp(Math.acos(k.clamp(s.y/i,-.99,.99)),.1,1.38),l=Math.atan2(s.x,s.z);a.distance=i,a.polar=o,a.azimuth=l}const Fr=.05;function Ld(e,t){const a=new Uint8Array(t*t);for(let i=0;i<t;i++)for(let o=0;o<t;o++){const l=e[i*t+o];if(l===0)continue;let u=1;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++){const h=Math.min(t-1,Math.max(0,i+r)),p=Math.min(t-1,Math.max(0,o+c));if(Math.abs(e[h*t+p]-l)>Fr){u=0;break}}a[i*t+o]=u}const s=new Uint8Array(t*t);for(let i=0;i<t;i++)for(let o=0;o<t;o++){const l=e[i*t+o];if(l===0)continue;let u=a[i*t+o];for(let r=-1;r<=1&&!u;r++)for(let c=-1;c<=1;c++){const h=i+r,p=o+c;if(!(h<0||h>=t||p<0||p>=t)&&a[h*t+p]&&Math.abs(e[h*t+p]-l)<=Fr){u=1;break}}s[i*t+o]=u}return s}function Kr(e,t){let a=0,s=0;for(let i=1;i<t-1;i+=2)for(let o=1;o<t-1;o+=2){const l=e[i*t+o];if(l===0||!Number.isFinite(l))continue;let u=!0;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++)if(Math.abs(e[(i+r)*t+o+c]-l)>Fr){u=!1;break}u&&(a++,Math.abs(l-Math.round(l))<.02&&s++)}return a>=20&&s/a>.5}const Nd=1.5;function zd(e,t){let a=new Uint8Array(t*t);for(let s=0;s<t*t;s++)a[s]=e[s]===0?1:0;for(let s=0;s<2;s++){const i=a.slice();for(let o=1;o<t-1;o++)for(let l=1;l<t-1;l++){const u=o*t+l;if(a[u]||!(e[u]<Nd))continue;let r=0;for(let c=-1;c<=1;c++)for(let h=-1;h<=1;h++)r+=a[(o+c)*t+l+h];r>=5&&(i[u]=1)}a=i}return a}const Ud=5,Bd=.25;function Od(e,t,a){const s=new Uint8Array(t*t),i=new Uint8Array(t*t),o=new Int32Array(t*t),l=[],u=[];let r=0;const c=h=>a[h]===0&&e[h]<Ud;for(let h=0;h<t*t;h++){if(i[h]||!c(h))continue;r++;let p=0,x=0;for(u.length=0,l.push(h),i[h]=1;l.length>0;){const y=l.pop();u.push(y);const M=Math.floor(y/t),E=y-M*t;for(let g=-1;g<=1;g++){const m=M+g;if(!(m<0||m>=t))for(let S=-1;S<=1;S++){const _=E+S;if(_<0||_>=t||g===0&&S===0)continue;const F=m*t+_;c(F)?i[F]||(i[F]=1,l.push(F)):o[F]!==r&&(o[F]=r,a[F]?p++:x++)}}}if(p>0&&x<Bd*(p+x))for(const y of u)s[y]=1}return s}const Lc=4,Nc=1.5,Hd=4;function Wu(e,t){if(t<2*Lc+1||e.length!==t*t)return;const a=Lc;let s=new Float32Array(t*t),i=new Float32Array(t*t);for(let r=0;r<t*t;r++){const c=e[r]!==0?1:0;s[r]=e[r]*c,i[r]=c}const o=new Float32Array(t*t),l=new Float32Array(t*t),u=(r,c,h)=>{for(let p=0;p<t;p++){let x=0;const y=M=>h?p*t+M:M*t+p;for(let M=0;M<=a&&M<t;M++)x+=r[y(M)];for(let M=0;M<t;M++){c[y(M)]=x;const E=M+a+1,g=M-a;E<t&&(x+=r[y(E)]),g>=0&&(x-=r[y(g)])}}};for(let r=0;r<2;r++){u(s,o,!0),u(i,l,!0),u(o,s,!1),u(l,i,!1);for(let c=0;c<t*t;c++){const h=i[c];s[c]=h>0?s[c]/h:0,i[c]=h>0?1:0}}for(let r=0;r<t*t;r++){const c=e[r];if(c===0||i[r]===0)continue;const h=Math.min(1,Math.max(0,(Math.abs(c-s[r])-Nc)/(Hd-Nc))),p=h*h*(3-2*h);e[r]=c+(s[r]-c)*(1-p)}}function Gd(e){const t=Math.floor(e.length/4);if(t===0)return 0;const a=i=>{const o=i/255;return o<=.04045?o/12.92:Math.pow((o+.055)/1.055,2.4)},s=new Float32Array(t);for(let i=0;i<t;i++)s[i]=.2126*a(e[i*4])+.7152*a(e[i*4+1])+.0722*a(e[i*4+2]);return s.sort(),s[Math.floor(t/2)]}function Dr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function tr(e){return Dr(e)&&typeof e.url=="string"&&e.url.length>0&&typeof e.size=="number"}function zc(e){return Array.isArray(e)&&e.length===2&&e.every(t=>typeof t=="number"&&Number.isFinite(t))}function Kd(e){if(!Dr(e)||e.version!==1||!tr(e.dem)||!tr(e.ortho)||!tr(e.aux)||!zc(e.extent_km)||!zc(e.elev_range_m))return null;const t=e.sun;return!Dr(t)||typeof t.azimuth_deg!="number"||typeof t.elevation_deg!="number"||!Number.isFinite(t.azimuth_deg)||!Number.isFinite(t.elevation_deg)?null:e}function zo(e,t){return new Promise(a=>{const s=new Ph;s.setCrossOrigin("anonymous"),s.setOptions(t),s.load(e,i=>a(i),void 0,()=>a(null))})}function Pr(e){const t=new Ur(e);return t.flipY=!1,t.premultiplyAlpha=!1,t.wrapS=Ve,t.wrapT=Ve,t.magFilter=ze,t.minFilter=Ga,t.generateMipmaps=!0,t.onUpdate=()=>{e.close()},t.addEventListener("dispose",()=>{e.close()}),t.needsUpdate=!0,t}async function Wd(e){let t=null;try{t=await createImageBitmap(e,{resizeWidth:256,resizeHeight:256,resizeQuality:"medium"}).catch(()=>null);const i=(typeof OffscreenCanvas<"u"?new OffscreenCanvas(256,256):Object.assign(document.createElement("canvas"),{width:256,height:256})).getContext("2d");return i?(i.imageSmoothingEnabled=!0,i.imageSmoothingQuality="high",i.drawImage(t??e,0,0,256,256),Gd(i.getImageData(0,0,256,256).data)):null}catch{return null}finally{t==null||t.close()}}async function Vu(e,t){const a=await zo(e,{imageOrientation:"flipY",premultiplyAlpha:"none"});if(!a)return null;const s=Pr(a);return s.colorSpace=nt,s.anisotropy=t,s}function Vd(e,t){if(t<3||e.length!==t*t)return;const a=new Float32Array(t*t),s=1/6,i=2/3;for(let o=0;o<t;o++){const l=o*t;for(let u=0;u<t;u++){const r=e[l+(u>0?u-1:0)],c=e[l+(u<t-1?u+1:t-1)];a[l+u]=s*r+i*e[l+u]+s*c}}for(let o=0;o<t;o++){const l=(o>0?o-1:0)*t,u=(o<t-1?o+1:t-1)*t,r=o*t;for(let c=0;c<t;c++)e[r+c]=s*a[l+c]+i*a[r+c]+s*a[u+c]}}async function Yd(e,t){var a,s,i;try{const o=e.ortho.size<=t.maxTextureSize,l=o?e.ortho:e.ortho_fallback??null;if(!l||l.size>t.maxTextureSize)return null;const u=fetch(t.resolveUrl(e.dem.url)).then(P=>P.ok?P.arrayBuffer():null),r=zo(t.resolveUrl(l.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}).then(async P=>P||!o||!e.ortho_fallback?{bitmap:P,size:l.size}:{bitmap:await zo(t.resolveUrl(e.ortho_fallback.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}),size:e.ortho_fallback.size}),c=zo(t.resolveUrl(e.aux.url),{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"}),[h,p,x]=await Promise.all([u,r,c]),y=((a=t.isCancelled)==null?void 0:a.call(t))??!1,M=e.dem.size*e.dem.size*4;if(y||!h||h.byteLength!==M||e.dem.format!=="f32le"||!p.bitmap||!x)return(s=p.bitmap)==null||s.close(),x==null||x.close(),null;const E=new Float32Array(h),g=Kr(E,e.dem.size);g&&Wu(E,e.dem.size),Vd(E,e.dem.size);const m=ks(E,!0),S=await Wd(p.bitmap);if((i=t.isCancelled)!=null&&i.call(t))return m.texture.dispose(),p.bitmap.close(),x.close(),null;const _=Pr(p.bitmap);_.colorSpace=nt,_.anisotropy=t.maxAnisotropy;const F=Pr(x);return F.colorSpace=Ia,F.anisotropy=Math.min(4,t.maxAnisotropy),{manifest:e,demTexture:m.texture,alignedDem:m.aligned,demGridRes:m.gridRes,minElevM:m.minElev,maxElevM:m.maxElev,orthoTexture:_,orthoSize:p.size,auxTexture:F,attribution:e.ortho.attribution??"",levelInWholeMetres:g,pictureMedianLuma:S,dispose:()=>{m.texture.dispose(),_.dispose(),F.dispose()}}}catch{return null}}function $d(e,t,a){const s=e*Math.PI/180,i=t*Math.PI/180;return a.set(Math.sin(s)*Math.cos(i),Math.sin(i),-Math.cos(s)*Math.cos(i)).normalize()}function Xd(e,t,a){return a.set(e.x*t.x,e.y*t.y,e.z*t.z).normalize()}const Oi=.085,jd=1e6;function qd(e,t,a){const s=We,i=s*s,o=i*4,l=Oi*255,u=new Float32Array(i).fill(jd),r=new Float32Array(i).fill(0),c=new Float32Array(i),h=new Uint8Array(i);for(let N=0;N<i;N++){let D=-1,T=-1,B=0;for(let K=0;K<t;K++){const G=e[K*o+N*4];G>B&&(B=G),G>=l&&(D<0&&(D=K),T=K)}if(c[N]=B/255,!(D<0)){if(h[N]=1,D===0)u[N]=-.5;else{const K=e[(D-1)*o+N*4],G=e[D*o+N*4],q=G>K?(l-K)/(G-K):1;u[N]=D-1+Math.min(1,Math.max(0,q))}if(T>=t-1)r[N]=t-1+.5;else{const K=e[T*o+N*4],G=e[(T+1)*o+N*4],q=K>G?(K-l)/(K-G):0;r[N]=T+Math.min(1,Math.max(0,q))}}}let p=0,x=0;for(let N=1;N<s-1;N+=2)for(let D=1;D<s-1;D+=2){const T=N*s+D;if(!h[T]||!h[T+1]||!h[T-1]||!h[T+s]||!h[T-s])continue;const B=(u[T+1]-u[T-1])*.5,K=(u[T+s]-u[T-s])*.5,G=Math.hypot(B,K);G>.001&&G<4&&(p+=G,x++)}const y=x>16?Math.min(1.2,Math.max(.08,p/x)):.3,M=u.slice(),E=y,g=y*Math.SQRT2,m=(N,D,T)=>{const B=M[D]+T;B<M[N]&&(M[N]=B)};for(let N=0;N<2;N++){for(let D=0;D<s;D++)for(let T=0;T<s;T++){const B=D*s+T;h[B]||(T>0&&m(B,B-1,E),D>0&&m(B,B-s,E),T>0&&D>0&&m(B,B-s-1,g),T<s-1&&D>0&&m(B,B-s+1,g))}for(let D=s-1;D>=0;D--)for(let T=s-1;T>=0;T--){const B=D*s+T;h[B]||(T<s-1&&m(B,B+1,E),D<s-1&&m(B,B+s,E),T<s-1&&D<s-1&&m(B,B+s+1,g),T>0&&D<s-1&&m(B,B+s-1,g))}}let S=0;const _=t+64,F=new Float32Array(i*4);for(let N=0;N<i;N++){const D=Math.min(_,M[N]);F[N*4]=D,F[N*4+1]=h[N]?r[N]:D,F[N*4+2]=c[N],F[N*4+3]=h[N],S+=h[N]}let P;if(a)P=new aa(F,s,s,At,zr);else{const N=new Uint16Array(i*4);for(let D=0;D<N.length;D++)N[D]=ya.toHalfFloat(F[D]);P=new aa(N,s,s,At,Pa)}return P.minFilter=ze,P.magFilter=ze,P.wrapS=Ve,P.wrapT=Ve,P.generateMipmaps=!1,P.flipY=!1,P.needsUpdate=!0,{texture:P,burnedFraction:S/i,frameCount:t}}function Uc(e){const t=String(e);return/[.e]/.test(t)?t:`${t}.0`}const Zd=`
const float FIRE_THR = ${Uc(Oi)};
const float FIRE_FIELD_TEXEL = ${Uc(1/We)};

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
`,Qd=`
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
`,ui=6378.137,Ho={family:"modis",altitudeKm:705,maxScanDeg:55,alphaScanNative:1/705,alphaTrack:1/705,detectors:10,zone1Deg:90,zone2Deg:90},ei={family:"viirs",altitudeKm:825.2,maxScanDeg:56.28,alphaScanNative:.125/825.2,alphaTrack:.362/825.2,detectors:32,zone1Deg:31.72,zone2Deg:44.86},Go=Math.PI/180;function Ir(e){return(ui+e.altitudeKm)/ui}function Jd(e,t){const a=Math.min(e.maxScanDeg,Math.abs(t))*Go,s=Ir(e);return ui*(Math.asin(Math.min(1,s*Math.sin(a)))-a)}const Bc={axisEast:1,axisNorth:0,nadirKm:0,valid:!1,scanAngleDeg:0};function Oc(e,t,a){if(!e||e.family!==t.family)return a.valid=!1,a;const s=e.azimuthDeg*Go;return a.axisEast=Math.sin(s),a.axisNorth=Math.cos(s),a.scanAngleDeg=Math.min(t.maxScanDeg,Math.abs(e.scanAngleDeg)),a.nadirKm=Jd(t,a.scanAngleDeg),a.valid=!0,a}function ns(e){const t=e.toPrecision(10);return/[.e]/.test(t)?t:`${t}.0`}function Hc(e){return`vec4(${ns(e.alphaScanNative)}, ${ns(e.alphaTrack)}, ${ns(e.detectors)}, ${e.family==="viirs"?"1.0":"0.0"})`}const ef=`
const float SCAN_RE = ${ns(ui)};
const float MODIS_ORBIT_K = ${ns(Ir(Ho))};
const float VIIRS_ORBIT_K = ${ns(Ir(ei))};
const vec4 MODIS_SENSOR = ${Hc(Ho)};
const vec4 VIIRS_SENSOR = ${Hc(ei)};
const float VIIRS_ZONE1 = ${ns(ei.zone1Deg*Go)};
const float VIIRS_ZONE2 = ${ns(ei.zone2Deg*Go)};

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
`,Yu=`
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
`,Gc=`
${jo}

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
`,tf=`
void main() {
  gl_FragColor = vec4(0.0);
}
`,af=`
${jo}
${ef}

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

${Qd}
${Yo}
${Xo}
${$o}
${Zd}

${Yu}

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
`;function ar(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function Kc(e){if(!ar(e))return null;const{extent_km:t,scale:a,dem:s,ortho:i}=e;return!Array.isArray(t)||t.length!==2||!t.every(o=>typeof o=="number"&&o>0)||typeof a!="number"||!(a>1)||a>15||!ar(s)||typeof s.url!="string"||typeof s.size!="number"||s.format!=="f32le"||!ar(i)||typeof i.url!="string"||typeof i.size!="number"?null:e}function sf(e,t,a,s){const i=new Uint8Array(t*t*4),o=s?new Uint8Array(t*t):Ld(e,t),l=zd(e,t),u=Od(e,t,l),r=a[0]*1e3/(t-1),c=a[1]*1e3/(t-1);for(let p=0;p<t;p++){const x=Math.min(t-1,p+1),y=Math.max(0,p-1);for(let M=0;M<t;M++){const E=Math.min(t-1,M+1),g=Math.max(0,M-1),m=(e[p*t+E]-e[p*t+g])/((E-g)*r),S=(e[y*t+M]-e[x*t+M])/((x-y)*c),_=1/Math.hypot(m,1,S),F=(p*t+M)*4;i[F]=Math.round((-m*_*.5+.5)*255),i[F+1]=Math.round((-S*_*.5+.5)*255),i[F+2]=l[p*t+M]?255:u[p*t+M]?128:0,i[F+3]=o[p*t+M]?255:0}}const h=new aa(i,t,t,At,Ut);return h.colorSpace=Ia,h.wrapS=Ve,h.wrapT=Ve,h.magFilter=ze,h.minFilter=Ga,h.generateMipmaps=!0,h.flipY=!1,h.needsUpdate=!0,h}async function of(e,t){var a;try{if(e.ortho.size>t.maxTextureSize)return null;const[s,i]=await Promise.all([fetch(t.resolveUrl(e.dem.url)).then(h=>h.ok?h.arrayBuffer():null),Vu(t.resolveUrl(e.ortho.url),t.maxAnisotropy)]),o=e.dem.size;if((((a=t.isCancelled)==null?void 0:a.call(t))??!1)||!s||s.byteLength!==o*o*4||!i)return i==null||i.dispose(),null;const l=new Float32Array(s),u=Kr(l,o);u&&Wu(l,o);const r=ks(l,!0),c=sf(r.aligned,r.gridRes,e.extent_km,u);return{manifest:e,scale:e.scale,demTexture:r.texture,alignedDem:r.aligned,gridRes:r.gridRes,shadeTexture:c,orthoTexture:i,dispose:()=>{r.texture.dispose(),c.dispose(),i.dispose()}}}catch{return null}}const $u=6360;function nf(e,t){return(e*e+2*e*t)/(2*$u)}const rf=`
${jo}

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
  y -= (dOut * dOut + 2.0 * dOut * halfKm) / (2.0 * ${$u.toFixed(1)}) * 1000.0 * uUnitsPerMetre.y;

  // Under the pack this surface dives out of the way; the pack is the surface there. The dive
  // starts more than one cell of this mesh inside the pack, so along the pack edge both surfaces
  // are at the same height (the pack takes the context elevation there, see contextJoin).
  vec2 e = min(packUv, 1.0 - packUv);
  y -= clamp((min(e.x, e.y) - 0.012) * 40.0, 0.0, 1.0) * 0.6;

  vec4 worldPos = modelMatrix * vec4(xz.x, y, xz.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,lf=`
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

${Yo}
${Xo}
${$o}
${Yu}

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
`,Wc=640;class cf{constructor(t){A(this,"mesh");A(this,"material");A(this,"shadeUniform",{value:null});const a=new Ko(1,1,Wc,Wc);this.material=new yt({vertexShader:rf,fragmentShader:lf,uniforms:{...t,uContextShade:this.shadeUniform},transparent:!0,depthWrite:!0}),this.mesh=new ga(a,this.material),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.renderOrder=-2}setContext(t){this.shadeUniform.value=(t==null?void 0:t.shadeTexture)??null}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}}function uf(e,t,a){const s=e.gridRes,i=Math.min(s-1,Math.max(0,t*(s-1))),o=Math.min(s-1,Math.max(0,a*(s-1))),l=Math.floor(i),u=Math.floor(o),r=Math.min(s-1,l+1),c=Math.min(s-1,u+1),h=i-l,p=o-u,x=e.alignedDem,y=x[u*s+l]*(1-h)+x[u*s+r]*h,M=x[c*s+l]*(1-h)+x[c*s+r]*h;return y*(1-p)+M*p}const zi=1024,li=1536,Vc=1.1,hf=5,df=.2,ff=.09,mf=.07,Yc=.36,$c=.16,Xc=.34,pf=[1,.09,.015],jc=[1,.36,.05],vf=[1,.66,.32];function gf(e,t){const a=Math.min(1,Math.max(0,e)),s=Vc+(hf-Vc)*a*a*a,i=a<.5?pf:jc,o=a<.5?jc:vf,l=a<.5?a*2:a*2-1;for(let u=0;u<3;u++)t[u]=(i[u]+(o[u]-i[u])*l)*s;t[3]=s}function qc(e,t){const a=Math.sin(e*12.9898+t*78.233)*43758.5453;return a-Math.floor(a)}const Fo=4,xf=3,_a=zi*zi,sr=li*li;class wf{constructor(){A(this,"texture");A(this,"lightTexture");A(this,"modisCount",0);A(this,"viirsCount",0);A(this,"data",new Uint16Array(_a*4));A(this,"blank",new Uint16Array(_a*4));A(this,"outside",[new Float32Array(_a),new Float32Array(_a)]);A(this,"depth",[new Float32Array(_a),new Float32Array(_a)]);A(this,"frp",[new Float32Array(_a),new Float32Array(_a)]);A(this,"touched",new Int32Array(65536));A(this,"touchedCount",0);A(this,"mark",new Uint8Array(_a));A(this,"light",new Float32Array(sr*4));A(this,"lightData",new Uint16Array(sr*4));A(this,"lightTouched",new Int32Array(65536));A(this,"lightTouchedCount",0);A(this,"lightMark",new Uint8Array(sr));A(this,"lightOfOne",new Float32Array(4));const t=ya.toHalfFloat(Fo);for(let i=0;i<_a;i++)this.blank[i*4]=t,this.blank[i*4+2]=t;this.data.set(this.blank);for(let i=0;i<2;i++)this.outside[i].fill(Fo);const a=new aa(this.data,zi,zi,At,Pa);a.colorSpace=Ia,a.minFilter=ze,a.magFilter=ze,a.generateMipmaps=!1,a.wrapS=Ve,a.wrapT=Ve,a.flipY=!1,a.needsUpdate=!0,this.texture=a;const s=new aa(this.lightData,li,li,At,Pa);s.colorSpace=Ia,s.minFilter=Ga,s.magFilter=ze,s.generateMipmaps=!0,s.wrapS=Ve,s.wrapT=Ve,s.flipY=!1,s.needsUpdate=!0,this.lightTexture=s}build(t,a,s,i,o=[],l=[]){for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];this.mark[c]=0;for(let h=0;h<2;h++)this.outside[h][c]=Fo,this.depth[h][c]=0,this.frp[h][c]=0;this.data[c*4]=this.blank[c*4],this.data[c*4+1]=0,this.data[c*4+2]=this.blank[c*4+2],this.data[c*4+3]=0}this.touchedCount=0;for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];this.lightMark[c]=0;for(let h=0;h<4;h++)this.light[c*4+h]=0,this.lightData[c*4+h]=0}this.lightTouchedCount=0,this.modisCount=0,this.viirsCount=0;for(const r of t)this.drawFootprint(r,a,s);for(const r of o)this.drawFootprint(r,a,s);for(const r of t)this.drawLight(r,a,s,i);for(const r of l)this.drawLight(r,a,s,i);const u=ya.toHalfFloat;for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];for(let h=0;h<2;h++){const p=this.depth[h][c];p>0?(this.data[c*4+h*2]=u(-p),this.data[c*4+h*2+1]=u(Math.min(this.frp[h][c],6e4))):this.outside[h][c]<Fo&&(this.data[c*4+h*2]=u(this.outside[h][c]))}}for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];for(let h=0;h<4;h++)this.lightData[c*4+h]=u(Math.min(this.light[c*4+h],6e4))}this.texture.needsUpdate=!0,this.lightTexture.needsUpdate=!0}drawFootprint(t,a,s){const i=zi,[o,l,u,r]=a,c=s[0]/i,h=s[1]/i,p=xf*Math.max(c,h),x=t.family==="viirs"?1:0,y=(t.lon-o)/Math.max(1e-9,u-o)*s[0],M=(t.lat-l)/Math.max(1e-9,r-l)*s[1],E=t.acrossTrackKm*.5,g=t.alongTrackKm*.5,m=Math.max(1e-4,Math.min(E,g)),S=t.azimuthDeg*Math.PI/180,_=Math.sin(S),F=Math.cos(S),P=Math.hypot(E,g)+p,N=Math.max(0,Math.floor((y-P)/c)),D=Math.min(i-1,Math.ceil((y+P)/c)),T=Math.max(0,Math.floor((M-P)/h)),B=Math.min(i-1,Math.ceil((M+P)/h));if(D<N||B<T)return;x===1?this.viirsCount++:this.modisCount++;const K=t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm),G=this.outside[x],q=this.depth[x],he=this.frp[x];for(let oe=T;oe<=B;oe++){const ye=(oe+.5)*h-M;for(let Me=N;Me<=D;Me++){const _e=(Me+.5)*c-y,ue=Math.abs(_e*_+ye*F)-E,Ye=Math.abs(_e*F-ye*_)-g,ve=Math.hypot(Math.max(ue,0),Math.max(Ye,0))+Math.min(Math.max(ue,Ye),0);if(ve>p)continue;const ee=oe*i+Me;if(!this.mark[ee]){if(this.mark[ee]=1,this.touchedCount===this.touched.length){const Z=new Int32Array(this.touched.length*2);Z.set(this.touched),this.touched=Z}this.touched[this.touchedCount++]=ee}if(ve>=0){ve<G[ee]&&(G[ee]=ve);continue}const st=Math.min(1,-ve/m);st>=q[ee]&&(q[ee]=Math.max(st,.001),he[ee]=K)}}}drawLight(t,a,s,i){const o=li,[l,u,r,c]=a,h=s[0]/o,p=s[1]/o,x=(t.lon-l)/Math.max(1e-9,r-l)*s[0],y=(t.lat-u)/Math.max(1e-9,c-u)*s[1],M=t.acrossTrackKm*.5,E=t.alongTrackKm*.5,g=t.azimuthDeg*Math.PI/180,m=Math.sin(g),S=Math.cos(g),_=this.lightOfOne;gf(i(t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm)),_);const F=Math.min(ff,df*Math.min(M,E)),P=Math.max(F,.8*Math.max(h,p)),N=F*F/(P*P),D=9*P*P,T=(qc(t.lon,t.lat)*2-1)*Xc*M,B=(qc(t.lat*1.7,t.lon*.9)*2-1)*Xc*E,K=T*m+B*S,G=T*S-B*m,q=Math.min(Yc*M,$c),he=Math.min(Yc*E,$c),oe=Math.hypot(M,E),ye=Math.max(0,Math.floor((x-oe)/h)),Me=Math.min(o-1,Math.ceil((x+oe)/h)),_e=Math.max(0,Math.floor((y-oe)/p)),ue=Math.min(o-1,Math.ceil((y+oe)/p)),Ye=this.light;for(let ve=_e;ve<=ue;ve++){const ee=(ve+.5)*p-y;for(let st=ye;st<=Me;st++){const Z=(st+.5)*h-x,v=Z*m+ee*S,ut=Z*S-ee*m,Nt=Math.hypot(v/M,ut/E);let Bt=0;const Gt=Z-K,da=ee-G;if(Gt*Gt+da*da<D){for(let at=0;at<4;at++){const ht=Gt+(at&1?.25:-.25)*h,qt=da+(at&2?.25:-.25)*p;Bt+=Math.exp(-(ht*ht+qt*qt)/(P*P))}Bt*=.25*N}if(Nt<1){const at=Nt<=.72?0:(Nt-.72)/.28,ht=(v-T)/q,qt=(ut-B)/he;Bt+=mf*Math.exp(-(ht*ht+qt*qt))*(1-at*at*(3-2*at))}if(Bt<=1e-4)continue;const jt=ve*o+st;if(!this.lightMark[jt]){if(this.lightMark[jt]=1,this.lightTouchedCount===this.lightTouched.length){const at=new Int32Array(this.lightTouched.length*2);at.set(this.lightTouched),this.lightTouched=at}this.lightTouched[this.lightTouchedCount++]=jt}Ye[jt*4]+=_[0]*Bt,Ye[jt*4+1]+=_[1]*Bt,Ye[jt*4+2]+=_[2]*Bt,Ye[jt*4+3]+=_[3]*Bt}}}dispose(){this.texture.dispose(),this.lightTexture.dispose()}}const Mf=1500,Zc=30;function yf(e){const t=Math.log1p(Math.max(0,e)/Zc)/Math.log1p(Mf/Zc);return Math.min(1,t)}function bf(e,t,a,s,i,o=.6){const l=i*i,u=new Uint8Array(t*l),[r,c,h,p]=a,x=s[0]/i,y=s[1]/i;for(let M=0;M<t;M++){const E=M*l;if(M>0){const g=(M-1)*l;for(let m=0;m<l;m++)u[E+m]=Math.floor(u[g+m]*o)}for(const g of e[M]??[])if(!(g.hidden||g.revealedByLook))for(const m of g.footprints){const S=(m.lon-r)/Math.max(1e-9,h-r)*s[0],_=(m.lat-c)/Math.max(1e-9,p-c)*s[1],F=m.acrossTrackKm*.5,P=m.alongTrackKm*.5,N=m.azimuthDeg*Math.PI/180,D=Math.sin(N),T=Math.cos(N),B=Math.round(255*yf(m.frpMw/Math.max(1e-4,m.acrossTrackKm*m.alongTrackKm))),K=Math.hypot(F,P),G=Math.max(0,Math.floor((S-K)/x)),q=Math.min(i-1,Math.ceil((S+K)/x)),he=Math.max(0,Math.floor((_-K)/y)),oe=Math.min(i-1,Math.ceil((_+K)/y));for(let ye=he;ye<=oe;ye++){const Me=(ye+.5)*y-_;for(let _e=G;_e<=q;_e++){const ue=(_e+.5)*x-S;if(Math.abs(ue*D+Me*T)>F+.5*x||Math.abs(ue*T-Me*D)>P+.5*y)continue;const Ye=E+ye*i+_e;B>u[Ye]&&(u[Ye]=B)}}}}return u}function ir(e){if(typeof e!="object"||e===null)return null;const t=e;if(typeof t.grid!="object"||t.grid===null||!Array.isArray(t.looks))return null;const a=t.grid,s=Number(a.nx),i=Number(a.ny);if(!Number.isInteger(s)||!Number.isInteger(i)||s<2||i<2||a.index!=="row * nx + column"||a.rows_run!=="north to south")return null;const o=new Map;for(const l of t.looks){if(typeof l!="object"||l===null)return null;const{frame:u,cells:r}=l;if(u==null)continue;if(!Number.isInteger(u)||u<0||!Array.isArray(r))return null;const c=new Uint32Array(r.length);for(let h=0;h<r.length;h++){const p=r[h];if(!Number.isInteger(p)||p<0||p>=s*i)return null;c[h]=p}o.set(u,c)}return o.size>0?{nx:s,ny:i,byFrame:o}:null}class Sf{constructor(){A(this,"texture");A(this,"grid",new Ne(0,0));A(this,"box",new va(0,0,0,0));A(this,"data");A(this,"nx",1);A(this,"ny",1);A(this,"key","");A(this,"stepKey","");A(this,"step",0);A(this,"declaredGiven",!1);this.data=new Uint8Array(4),this.texture=this.makeTexture(1,1)}makeTexture(t,a){const s=new aa(this.data,t,a,At,Ut);return s.minFilter=ze,s.magFilter=ze,s.generateMipmaps=!1,s.wrapS=Ve,s.wrapT=Ve,s.flipY=!1,s.needsUpdate=!0,s}clear(){this.grid.set(0,0),this.box.set(0,0,0,0),this.key="",this.stepKey="",this.declaredGiven=!1}sync(t,a,s,i=null){const{steps:o,stepMs:l,firstTimeMs:u,nx:r,ny:c}=t.info,h=Math.min(o-1,Math.max(0,(s-u)/l)),p=Math.min(o-1,Math.floor(h)),x=Math.min(o-1,p+1);(r!==this.nx||c!==this.ny)&&(this.texture.dispose(),this.nx=r,this.ny=c,this.data=new Uint8Array(r*c*4),this.texture=this.makeTexture(r,c),this.key=""),this.grid.set(r,c);const y=t.declared&&t.declared.nx===r&&t.declared.ny===c?t.declared:null,M=y&&i!==null?y.byFrame.get(i)??null:null;this.declaredGiven=y!==null;const E=`${a}:${p}`,g=`${E}:${y?i??"none":"no list"}`;if(g!==this.key){this.key=g,this.stepKey=E,this.step=p;const m=t.bytes,S=r*c,_=this.data;let F=r,P=-1,N=c,D=-1;for(let T=0;T<c;T++){const B=(p*S+(c-1-T)*r)*2,K=(x*S+(c-1-T)*r)*2,G=T*r*4;for(let q=0;q<r;q++){const he=m[B+q*2],oe=m[K+q*2];_[G+q*4]=he,_[G+q*4+1]=y?m[B+q*2+1]&254:m[B+q*2+1],_[G+q*4+2]=oe,_[G+q*4+3]=m[K+q*2+1],(he>0||oe>0)&&(q<F&&(F=q),q>P&&(P=q),T<N&&(N=T),T>D&&(D=T))}}if(M)for(let T=0;T<M.length;T++){const B=Math.floor(M[T]/r),K=M[T]-B*r,G=c-1-B;_[(G*r+K)*4+1]|=1,K<F&&(F=K),K>P&&(P=K),G<N&&(N=G),G>D&&(D=G)}P<0?this.box.set(0,0,0,0):this.box.set((F-3)/r,(N-3)/c,(P+4)/r,(D+4)/c),this.texture.needsUpdate=!0}return h-p}cellsAbove(t,a,s){const{nx:i,ny:o}=t.info,l=i*o,u=this.step*l*2,r=Math.ceil(a*255),c=[];for(let h=0;h<o;h++)for(let p=0;p<i;p++){const x=u+(h*i+p)*2;t.bytes[x]<r||c.push((p+.5)/i,1-(h+.5)/o,Math.max(.01,s(t.bytes[x+1]/255)))}return new Float32Array(c)}dispose(){this.texture.dispose()}}function la(e,t){return e.revealed?!1:e.hidden===!0||t&&e.family==="viirs"}/**
 * postprocessing v6.39.6 build Sun Nov 01 2026
 * https://github.com/pmndrs/postprocessing
 * Copyright 2015-2026 Raoul van Rüschen
 * @license Zlib
 */var Tf=(()=>{const e=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),t=new Float32Array([0,0,2,0,0,2]),a=new Wo;return a.setAttribute("position",new ua(e,3)),a.setAttribute("uv",new ua(t,2)),a})(),ha=class Cr{static get fullscreenGeometry(){return Tf}constructor(t="Pass",a=new ci,s=new Nr){this.name=t,this.renderer=null,this.scene=a,this.camera=s,this.screen=null,this.rtt=!0,this.needsSwap=!0,this.needsDepthBlit=!1,this.needsDepthTexture=!1,this.enabled=!0}get renderToScreen(){return!this.rtt}set renderToScreen(t){if(this.rtt===t){const a=this.fullscreenMaterial;a!==null&&(a.needsUpdate=!0),this.rtt=!t}}set mainScene(t){}set mainCamera(t){}setRenderer(t){this.renderer=t}isEnabled(){return this.enabled}setEnabled(t){this.enabled=t}get fullscreenMaterial(){return this.screen!==null?this.screen.material:null}set fullscreenMaterial(t){let a=this.screen;a!==null?a.material=t:(a=new ga(Cr.fullscreenGeometry,t),a.frustumCulled=!1,this.scene===null&&(this.scene=new ci),this.scene.add(a),this.screen=a)}getFullscreenMaterial(){return this.fullscreenMaterial}setFullscreenMaterial(t){this.fullscreenMaterial=t}getDepthTexture(){return null}setDepthTexture(t,a=Vo){}render(t,a,s,i,o){throw new Error("Render method not implemented!")}setSize(t,a){}initialize(t,a,s){}dispose(){for(const t of Object.keys(this)){const a=this[t];(a instanceof Ht||a instanceof Iu||a instanceof Ur||a instanceof Cr)&&this[t].dispose()}this.fullscreenMaterial!==null&&this.fullscreenMaterial.dispose()}},Ef=class extends ha{constructor(){super("ClearMaskPass",null,null),this.needsSwap=!1}render(e,t,a,s,i){const o=e.state.buffers.stencil;o.setLocked(!1),o.setTest(!1)}},Rf=`#ifdef COLOR_WRITE
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
}`,Wr="varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,1.0,1.0);}",Xu=class extends yt{constructor(){super({name:"CopyMaterial",defines:{COLOR_SPACE_CONVERSION:"1",DEPTH_PACKING:"0",COLOR_WRITE:"1"},uniforms:{inputBuffer:new ke(null),depthBuffer:new ke(null),channelWeights:new ke(null),opacity:new ke(1)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Rf,vertexShader:Wr}),this.depthFunc=Nh}get inputBuffer(){return this.uniforms.inputBuffer.value}set inputBuffer(e){const t=e!==null;this.colorWrite!==t&&(t?this.defines.COLOR_WRITE=!0:delete this.defines.COLOR_WRITE,this.colorWrite=t,this.needsUpdate=!0),this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){const t=e!==null;this.depthWrite!==t&&(t?this.defines.DEPTH_WRITE=!0:delete this.defines.DEPTH_WRITE,this.depthTest=t,this.depthWrite=t,this.needsUpdate=!0),this.uniforms.depthBuffer.value=e}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}get colorSpaceConversion(){return this.defines.COLOR_SPACE_CONVERSION!==void 0}set colorSpaceConversion(e){this.colorSpaceConversion!==e&&(e?this.defines.COLOR_SPACE_CONVERSION=!0:delete this.defines.COLOR_SPACE_CONVERSION,this.needsUpdate=!0)}get channelWeights(){return this.uniforms.channelWeights.value}set channelWeights(e){e!==null?(this.defines.USE_WEIGHTS="1",this.uniforms.channelWeights.value=e):delete this.defines.USE_WEIGHTS,this.needsUpdate=!0}setInputBuffer(e){this.uniforms.inputBuffer.value=e}getOpacity(e){return this.uniforms.opacity.value}setOpacity(e){this.uniforms.opacity.value=e}},ju=class extends ha{constructor(e,t=!0){super("CopyPass"),this.fullscreenMaterial=new Xu,this.needsSwap=!1,this.renderTarget=e,e===void 0&&(this.renderTarget=new Ht(1,1,{minFilter:ze,magFilter:ze,stencilBuffer:!1,depthBuffer:!1}),this.renderTarget.texture.name="CopyPass.Target"),this.autoResize=t}get resize(){return this.autoResize}set resize(e){this.autoResize=e}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}setAutoResizeEnabled(e){this.autoResize=e}render(e,t,a,s,i){this.fullscreenMaterial.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){this.autoResize&&this.renderTarget.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTarget.texture.type=a,a!==Ut?this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1":e!==null&&e.outputColorSpace===nt&&(this.renderTarget.texture.colorSpace=nt))}},Qc=new Bo,qu=class extends ha{constructor(e=!0,t=!0,a=!1){super("ClearPass",null,null),this.needsSwap=!1,this.color=e,this.depth=t,this.stencil=a,this.overrideClearColor=null,this.overrideClearAlpha=-1}setClearFlags(e,t,a){this.color=e,this.depth=t,this.stencil=a}getOverrideClearColor(){return this.overrideClearColor}setOverrideClearColor(e){this.overrideClearColor=e}getOverrideClearAlpha(){return this.overrideClearAlpha}setOverrideClearAlpha(e){this.overrideClearAlpha=e}render(e,t,a,s,i){const o=this.overrideClearColor,l=this.overrideClearAlpha,u=e.getClearAlpha(),r=o!==null,c=l>=0;r?(e.getClearColor(Qc),e.setClearColor(o,c?l:u)):c&&e.setClearAlpha(l),e.setRenderTarget(this.renderToScreen?null:t),e.clear(this.color,this.depth,this.stencil),r?e.setClearColor(Qc,u):c&&e.setClearAlpha(u)}},Af=class extends ha{constructor(e,t){super("MaskPass",e,t),this.needsSwap=!1,this.clearPass=new qu(!1,!1,!0),this.inverse=!1}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get inverted(){return this.inverse}set inverted(e){this.inverse=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getClearPass(){return this.clearPass}isInverted(){return this.inverted}setInverted(e){this.inverted=e}render(e,t,a,s,i){const o=e.getContext(),l=e.state.buffers,u=this.scene,r=this.camera,c=this.clearPass,h=this.inverted?0:1,p=1-h;l.color.setMask(!1),l.depth.setMask(!1),l.color.setLocked(!0),l.depth.setLocked(!0),l.stencil.setTest(!0),l.stencil.setOp(o.REPLACE,o.REPLACE,o.REPLACE),l.stencil.setFunc(o.ALWAYS,h,4294967295),l.stencil.setClear(p),l.stencil.setLocked(!0),this.clearPass.enabled&&(this.renderToScreen?c.render(e,null):(c.render(e,t),c.render(e,a))),this.renderToScreen?(e.setRenderTarget(null),e.render(u,r)):(e.setRenderTarget(t),e.render(u,r),e.setRenderTarget(a),e.render(u,r)),l.color.setLocked(!1),l.depth.setLocked(!1),l.stencil.setLocked(!1),l.stencil.setFunc(o.EQUAL,1,4294967295),l.stencil.setOp(o.KEEP,o.KEEP,o.KEEP),l.stencil.setLocked(!0)}};function kf(e,t){const a=e.getContext();if(t<=0||typeof a.renderbufferStorageMultisample!="function")return 0;const s=a.getParameter(a.MAX_SAMPLES),i=Math.min(t,s);if(i<=0)return 0;const o=a.getParameter(a.RENDERBUFFER_BINDING),l=a.createRenderbuffer();try{return a.bindRenderbuffer(a.RENDERBUFFER,l),a.renderbufferStorageMultisample(a.RENDERBUFFER,i,a.RGBA8,1,1),i}catch{return 0}finally{a.bindRenderbuffer(a.RENDERBUFFER,o),a.deleteRenderbuffer(l)}}var or=1/1e3,_f=1e3,Ff=class{constructor(){this.startTime=performance.now(),this.previousTime=0,this.currentTime=0,this._delta=0,this._elapsed=0,this._fixedDelta=1e3/60,this.timescale=1,this.useFixedDelta=!1,this._autoReset=!1}get autoReset(){return this._autoReset}set autoReset(e){typeof document<"u"&&document.hidden!==void 0&&(e?document.addEventListener("visibilitychange",this):document.removeEventListener("visibilitychange",this),this._autoReset=e)}get delta(){return this._delta*or}get fixedDelta(){return this._fixedDelta*or}set fixedDelta(e){this._fixedDelta=e*_f}get elapsed(){return this._elapsed*or}update(e){this.useFixedDelta?this._delta=this.fixedDelta:(this.previousTime=this.currentTime,this.currentTime=(e!==void 0?e:performance.now())-this.startTime,this._delta=this.currentTime-this.previousTime),this._delta*=this.timescale,this._elapsed+=this._delta}reset(){this._delta=0,this._elapsed=0,this.currentTime=performance.now()-this.startTime}getDelta(){return this.delta}getElapsed(){return this.elapsed}handleEvent(e){document.hidden||(this.currentTime=performance.now()-this.startTime)}dispose(){this.autoReset=!1}},Df=class{constructor(e=null,{depthBuffer:t=!0,stencilBuffer:a=!1,multisampling:s=0,frameBufferType:i=Ut}={}){this.renderer=null,this.inputBuffer=this.createBuffer(t,a,i,s),this.outputBuffer=this.inputBuffer.clone(),this.copyPass=new ju,this.depthRenderTarget=null,this.passes=[],this.timer=new Ff,this.autoRenderToScreen=!0,this.setRenderer(e)}get stableDepthTexture(){return this.depthRenderTarget===null?null:this.depthRenderTarget.depthTexture}get multisampling(){return this.inputBuffer.samples}set multisampling(e){const t=this.renderer===null?e:kf(this.renderer,e);this.multisampling!==t&&(this.inputBuffer.samples=t,this.outputBuffer.samples=t,this.inputBuffer.dispose(),this.outputBuffer.dispose())}getTimer(){return this.timer}getRenderer(){return this.renderer}setRenderer(e){if(this.renderer=e,e!==null){const t=e.getSize(new Ne),a=e.getContext().getContextAttributes().alpha,s=this.inputBuffer.texture.type;s===Ut&&e.outputColorSpace===nt&&(this.inputBuffer.texture.colorSpace=nt,this.outputBuffer.texture.colorSpace=nt,this.inputBuffer.dispose(),this.outputBuffer.dispose());const i=this.multisampling;this.multisampling=i,e.autoClear=!1,this.setSize(t.width,t.height);for(const o of this.passes)o.initialize(e,a,s)}}replaceRenderer(e,t=!0){const a=this.renderer,s=a.domElement.parentNode;return this.setRenderer(e),t&&s!==null&&(s.removeChild(a.domElement),s.appendChild(e.domElement)),a}createDepthTexture(){const e=new Zn;e.name="EffectComposer.InputDepth",this.inputBuffer.stencilBuffer?(e.format=Ih,e.type=Ch):e.type=zr;const t=new Zn;t.format=e.format,t.type=e.type,t.name="EffectComposer.OutputDepth";const a=new Zn;a.format=e.format,a.type=e.type,a.name="EffectComposer.StableDepth",this.inputBuffer.depthTexture=e,this.outputBuffer.depthTexture=t,this.inputBuffer.dispose(),this.outputBuffer.dispose();const{width:s,height:i}=this.inputBuffer;this.depthRenderTarget=new Ht(s,i,{depthBuffer:!0,stencilBuffer:this.inputBuffer.stencilBuffer,depthTexture:a})}blitDepthBuffer(e){const t=this.renderer,a=this.depthRenderTarget,s=t.properties,i=t.getContext();t.setRenderTarget(a);const o=s.get(e).__webglFramebuffer,l=s.get(a).__webglFramebuffer,u=e.stencilBuffer?i.DEPTH_BUFFER_BIT|i.STENCIL_BUFFER_BIT:i.DEPTH_BUFFER_BIT;i.bindFramebuffer(i.READ_FRAMEBUFFER,o),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,l),i.blitFramebuffer(0,0,e.width,e.height,0,0,a.width,a.height,u,i.NEAREST),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),t.setRenderTarget(null)}deleteDepthTexture(){const e=this.stableDepthTexture;for(const t of this.passes)t.getDepthTexture()===e&&t.setDepthTexture(null);this.depthRenderTarget!==null&&(this.depthRenderTarget.dispose(),this.depthRenderTarget=null),this.inputBuffer.depthTexture!==null&&(this.inputBuffer.depthTexture.dispose(),this.inputBuffer.depthTexture=null),this.outputBuffer.depthTexture!==null&&(this.outputBuffer.depthTexture.dispose(),this.outputBuffer.depthTexture=null)}createBuffer(e,t,a,s){const i=this.renderer,o=i===null?new Ne:i.getDrawingBufferSize(new Ne),l=new Ht(o.width,o.height,{minFilter:ze,magFilter:ze,samples:s,stencilBuffer:t,depthBuffer:e,type:a});return a===Ut&&i!==null&&i.outputColorSpace===nt&&(l.texture.colorSpace=nt),l.texture.name="EffectComposer.Buffer",l.texture.generateMipmaps=!1,l}setMainScene(e){for(const t of this.passes)t.mainScene=e}setMainCamera(e){for(const t of this.passes)t.mainCamera=e}addPass(e,t){const a=this.passes,s=this.renderer,i=s.getDrawingBufferSize(new Ne),o=s.getContext().getContextAttributes().alpha,l=this.inputBuffer.texture.type;if(e.renderer=s,e.setSize(i.width,i.height),e.initialize(s,o,l),this.autoRenderToScreen&&(a.length>0&&(a[a.length-1].renderToScreen=!1),e.renderToScreen&&(this.autoRenderToScreen=!1)),t!==void 0?a.splice(t,0,e):a.push(e),this.autoRenderToScreen&&(a[a.length-1].renderToScreen=!0),e.needsDepthTexture||this.depthRenderTarget!==null)if(this.depthRenderTarget===null){this.createDepthTexture();for(const u of a)u.setDepthTexture(this.stableDepthTexture)}else e.setDepthTexture(this.stableDepthTexture)}removePass(e){const t=this.passes,a=t.indexOf(e);if(a!==-1&&t.splice(a,1).length>0){const o=this.stableDepthTexture;if(o!==null){const l=(r,c)=>r||c.needsDepthTexture;t.reduce(l,!1)||(e.getDepthTexture()===o&&e.setDepthTexture(null),this.deleteDepthTexture())}this.autoRenderToScreen&&a===t.length&&(e.renderToScreen=!1,t.length>0&&(t[t.length-1].renderToScreen=!0))}}removeAllPasses(){const e=this.passes;this.deleteDepthTexture(),e.length>0&&(this.autoRenderToScreen&&(e[e.length-1].renderToScreen=!1),this.passes=[])}render(e){const t=this.renderer,a=this.copyPass;let s=this.inputBuffer,i=this.outputBuffer,o,l=!1;e===void 0&&(this.timer.update(),e=this.timer.getDelta());for(const u of this.passes)if(u.enabled){if(u.render(t,s,i,e,l),u.needsDepthBlit&&this.depthRenderTarget!==null&&this.blitDepthBuffer(s),u.needsSwap){if(l){a.renderToScreen=u.renderToScreen;const r=t.getContext(),c=t.state.buffers.stencil;c.setFunc(r.NOTEQUAL,1,4294967295),a.render(t,s,i,e,l),c.setFunc(r.EQUAL,1,4294967295)}o=s,s=i,i=o}u instanceof Af?l=!0:u instanceof Ef&&(l=!1)}}setSize(e,t,a){const s=this.renderer,i=s.getSize(new Ne);(e===void 0||t===void 0)&&(e=i.width,t=i.height),(i.width!==e||i.height!==t)&&s.setSize(e,t,a);const o=s.getDrawingBufferSize(new Ne);this.inputBuffer.setSize(o.width,o.height),this.outputBuffer.setSize(o.width,o.height),this.depthRenderTarget!==null&&this.depthRenderTarget.setSize(o.width,o.height);for(const l of this.passes)l.setSize(o.width,o.height)}reset(){this.dispose(),this.autoRenderToScreen=!0}dispose(){for(const e of this.passes)e.dispose();this.deleteDepthTexture(),this.inputBuffer.dispose(),this.outputBuffer.dispose(),this.copyPass.dispose(),this.timer.dispose(),this.passes=[],ha.fullscreenGeometry.dispose()}},Ps={NONE:0,DEPTH:1,CONVOLUTION:2},je={FRAGMENT_HEAD:"FRAGMENT_HEAD",FRAGMENT_MAIN_UV:"FRAGMENT_MAIN_UV",FRAGMENT_MAIN_IMAGE:"FRAGMENT_MAIN_IMAGE",VERTEX_HEAD:"VERTEX_HEAD",VERTEX_MAIN_SUPPORT:"VERTEX_MAIN_SUPPORT"},Pf=class{constructor(){this.shaderParts=new Map([[je.FRAGMENT_HEAD,null],[je.FRAGMENT_MAIN_UV,null],[je.FRAGMENT_MAIN_IMAGE,null],[je.VERTEX_HEAD,null],[je.VERTEX_MAIN_SUPPORT,null]]),this.defines=new Map,this.uniforms=new Map,this.blendModes=new Map,this.extensions=new Set,this.attributes=Ps.NONE,this.varyings=new Set,this.uvTransformation=!1,this.readDepth=!1,this.colorSpace=Pu}},nr=!1,Jc=class{constructor(e=null){this.originalMaterials=new Map,this.material=null,this.materials=null,this.materialsBackSide=null,this.materialsDoubleSide=null,this.materialsFlatShaded=null,this.materialsFlatShadedBackSide=null,this.materialsFlatShadedDoubleSide=null,this.setMaterial(e),this.meshCount=0,this.replaceMaterial=t=>{if(t.isMesh){let a;if(t.material.flatShading)switch(t.material.side){case _s:a=this.materialsFlatShadedDoubleSide;break;case Qs:a=this.materialsFlatShadedBackSide;break;default:a=this.materialsFlatShaded;break}else switch(t.material.side){case _s:a=this.materialsDoubleSide;break;case Qs:a=this.materialsBackSide;break;default:a=this.materials;break}this.originalMaterials.set(t,t.material),t.isSkinnedMesh?t.material=a[2]:t.isInstancedMesh?t.material=a[1]:t.material=a[0],++this.meshCount}}}cloneMaterial(e){if(!(e instanceof yt))return e.clone();const t=e.uniforms,a=new Map;for(const i in t){const o=t[i].value;o.isRenderTargetTexture&&(t[i].value=null,a.set(i,o))}const s=e.clone();for(const i of a)t[i[0]].value=i[1],s.uniforms[i[0]].value=i[1];return s}setMaterial(e){if(this.disposeMaterials(),this.material=e,e!==null){const t=this.materials=[this.cloneMaterial(e),this.cloneMaterial(e),this.cloneMaterial(e)];for(const a of t)a.uniforms=Object.assign({},e.uniforms),a.side=Lh;t[2].skinning=!0,this.materialsBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=Qs,s}),this.materialsDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=_s,s}),this.materialsFlatShaded=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s}),this.materialsFlatShadedBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=Qs,s}),this.materialsFlatShadedDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=_s,s})}}render(e,t,a){const s=e.shadowMap.enabled;if(e.shadowMap.enabled=!1,nr){const i=this.originalMaterials;this.meshCount=0,t.traverse(this.replaceMaterial),e.render(t,a);for(const o of i)o[0].material=o[1];this.meshCount!==i.size&&i.clear()}else{const i=t.overrideMaterial;t.overrideMaterial=this.material,e.render(t,a),t.overrideMaterial=i}e.shadowMap.enabled=s}disposeMaterials(){if(this.material!==null){const e=this.materials.concat(this.materialsBackSide).concat(this.materialsDoubleSide).concat(this.materialsFlatShaded).concat(this.materialsFlatShadedBackSide).concat(this.materialsFlatShadedDoubleSide);for(const t of e)t.dispose()}}dispose(){this.originalMaterials.clear(),this.disposeMaterials()}static get workaroundEnabled(){return nr}static set workaroundEnabled(e){nr=e}},ss=-1,Da=class extends Br{constructor(e=null,t=ss,a=ss,s=1){super(),e!==null&&this.addEventListener("change",()=>e.setSize(this.baseSize.width,this.baseSize.height)),this.baseSize=new Ne(1,1),this.preferredSize=new Ne(t,a),this.target=this.preferredSize,this.s=s,this.effectiveSize=new Ne,this.addEventListener("change",()=>this.updateEffectiveSize()),this.updateEffectiveSize()}updateEffectiveSize(){const e=this.baseSize,t=this.preferredSize,a=this.effectiveSize,s=this.scale;t.width!==ss?a.width=t.width:t.height!==ss?a.width=Math.round(t.height*(e.width/Math.max(e.height,1))):a.width=Math.round(e.width*s),t.height!==ss?a.height=t.height:t.width!==ss?a.height=Math.round(t.width/Math.max(e.width/Math.max(e.height,1),1)):a.height=Math.round(e.height*s)}get width(){return this.effectiveSize.width}set width(e){this.preferredWidth=e}get height(){return this.effectiveSize.height}set height(e){this.preferredHeight=e}getWidth(){return this.width}getHeight(){return this.height}get scale(){return this.s}set scale(e){this.s!==e&&(this.s=e,this.preferredSize.setScalar(ss),this.dispatchEvent({type:"change"}))}getScale(){return this.scale}setScale(e){this.scale=e}get baseWidth(){return this.baseSize.width}set baseWidth(e){this.baseSize.width!==e&&(this.baseSize.width=e,this.dispatchEvent({type:"change"}))}getBaseWidth(){return this.baseWidth}setBaseWidth(e){this.baseWidth=e}get baseHeight(){return this.baseSize.height}set baseHeight(e){this.baseSize.height!==e&&(this.baseSize.height=e,this.dispatchEvent({type:"change"}))}getBaseHeight(){return this.baseHeight}setBaseHeight(e){this.baseHeight=e}setBaseSize(e,t){(this.baseSize.width!==e||this.baseSize.height!==t)&&(this.baseSize.set(e,t),this.dispatchEvent({type:"change"}))}get preferredWidth(){return this.preferredSize.width}set preferredWidth(e){this.preferredSize.width!==e&&(this.preferredSize.width=e,this.dispatchEvent({type:"change"}))}getPreferredWidth(){return this.preferredWidth}setPreferredWidth(e){this.preferredWidth=e}get preferredHeight(){return this.preferredSize.height}set preferredHeight(e){this.preferredSize.height!==e&&(this.preferredSize.height=e,this.dispatchEvent({type:"change"}))}getPreferredHeight(){return this.preferredHeight}setPreferredHeight(e){this.preferredHeight=e}setPreferredSize(e,t){(this.preferredSize.width!==e||this.preferredSize.height!==t)&&(this.preferredSize.set(e,t),this.dispatchEvent({type:"change"}))}copy(e){this.s=e.scale,this.baseSize.set(e.baseWidth,e.baseHeight),this.preferredSize.set(e.preferredWidth,e.preferredHeight),this.dispatchEvent({type:"change"})}static get AUTO_SIZE(){return ss}},Pe={ADD:0,ALPHA:1,AVERAGE:2,COLOR:3,COLOR_BURN:4,COLOR_DODGE:5,DARKEN:6,DIFFERENCE:7,DIVIDE:8,DST:9,EXCLUSION:10,HARD_LIGHT:11,HARD_MIX:12,HUE:13,INVERT:14,INVERT_RGB:15,LIGHTEN:16,LINEAR_BURN:17,LINEAR_DODGE:18,LINEAR_LIGHT:19,LUMINOSITY:20,MULTIPLY:21,NEGATION:22,NORMAL:23,OVERLAY:24,PIN_LIGHT:25,REFLECT:26,SATURATION:27,SCREEN:28,SOFT_LIGHT:29,SRC:30,SUBTRACT:31,VIVID_LIGHT:32},If="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Cf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,src.a*opacity);}",Lf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=(dst.rgb+src.rgb)*0.5;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Nf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.xy,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",zf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=mix(step(0.0,b)*(1.0-min(vec3(1.0),(1.0-a)/max(b,1e-9))),vec3(1.0),step(1.0,a));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Uf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=step(0.0,a)*mix(min(vec3(1.0),a/max(1.0-b,1e-9)),vec3(1.0),step(1.0,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Bf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Of="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=abs(dst.rgb-src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Hf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb/max(src.rgb,1e-9);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Gf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-2.0*dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Kf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb,1.0);vec3 b=min(src.rgb,1.0);vec3 c=mix(2.0*a*b,1.0-2.0*(1.0-a)*(1.0-b),step(0.5,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Wf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=step(1.0,dst.rgb+src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Vf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.x,a.yz));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Yf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",$f="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=src.rgb*max(1.0-dst.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Xf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",jf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",qf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb+src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Zf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(2.0*src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Qf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.xy,b.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Jf="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",em="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-abs(1.0-dst.rgb-src.rgb),0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",tm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,opacity);}",am="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=2.0*src.rgb*dst.rgb;vec3 b=1.0-2.0*(1.0-src.rgb)*(1.0-dst.rgb);vec3 c=mix(a,b,step(0.5,dst.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",sm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 c=mix(mix(src2,dst.rgb,step(0.5*dst.rgb,src.rgb)),max(src2-1.0,vec3(0.0)),step(dst.rgb,src2-1.0));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",im="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb*dst.rgb/max(1.0-src.rgb,1e-9),1.0);vec3 c=mix(a,src.rgb,step(1.0,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",om="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.x,b.y,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",nm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-min(dst.rgb*src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",rm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 d=dst.rgb+(src2-1.0);vec3 w=step(0.5,src.rgb);vec3 a=dst.rgb-(1.0-src2)*dst.rgb*(1.0-dst.rgb);vec3 b=mix(d*(sqrt(dst.rgb)-dst.rgb),d*dst.rgb*((16.0*dst.rgb-12.0)*dst.rgb+3.0),w*(1.0-step(0.25,dst.rgb)));vec3 c=mix(a,b,w);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",lm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return src;}",cm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",um="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=mix(max(1.0-min((1.0-dst.rgb)/(2.0*src.rgb),1.0),0.0),min(dst.rgb/(2.0*(1.0-src.rgb)),1.0),step(0.5,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",hm=new Map([[Pe.ADD,If],[Pe.ALPHA,Cf],[Pe.AVERAGE,Lf],[Pe.COLOR,Nf],[Pe.COLOR_BURN,zf],[Pe.COLOR_DODGE,Uf],[Pe.DARKEN,Bf],[Pe.DIFFERENCE,Of],[Pe.DIVIDE,Hf],[Pe.DST,null],[Pe.EXCLUSION,Gf],[Pe.HARD_LIGHT,Kf],[Pe.HARD_MIX,Wf],[Pe.HUE,Vf],[Pe.INVERT,Yf],[Pe.INVERT_RGB,$f],[Pe.LIGHTEN,Xf],[Pe.LINEAR_BURN,jf],[Pe.LINEAR_DODGE,qf],[Pe.LINEAR_LIGHT,Zf],[Pe.LUMINOSITY,Qf],[Pe.MULTIPLY,Jf],[Pe.NEGATION,em],[Pe.NORMAL,tm],[Pe.OVERLAY,am],[Pe.PIN_LIGHT,sm],[Pe.REFLECT,im],[Pe.SATURATION,om],[Pe.SCREEN,nm],[Pe.SOFT_LIGHT,rm],[Pe.SRC,lm],[Pe.SUBTRACT,cm],[Pe.VIVID_LIGHT,um]]),dm=class extends Br{constructor(e,t=1){super(),this._blendFunction=e,this.opacity=new ke(t)}getOpacity(){return this.opacity.value}setOpacity(e){this.opacity.value=e}get blendFunction(){return this._blendFunction}set blendFunction(e){this._blendFunction=e,this.dispatchEvent({type:"change"})}getBlendFunction(){return this.blendFunction}setBlendFunction(e){this.blendFunction=e}getShaderCode(){return hm.get(this.blendFunction)}},Zu=class extends Br{constructor(e,t,{attributes:a=Ps.NONE,blendFunction:s=Pe.NORMAL,defines:i=new Map,uniforms:o=new Map,extensions:l=null,vertexShader:u=null}={}){super(),this.name=e,this.renderer=null,this.attributes=a,this.fragmentShader=t,this.vertexShader=u,this.defines=i,this.uniforms=o,this.extensions=l,this.blendMode=new dm(s),this.blendMode.addEventListener("change",r=>this.setChanged()),this._inputColorSpace=Pu,this._outputColorSpace=Ia}get inputColorSpace(){return this._inputColorSpace}set inputColorSpace(e){this._inputColorSpace=e,this.setChanged()}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e,this.setChanged()}set mainScene(e){}set mainCamera(e){}getName(){return this.name}setRenderer(e){this.renderer=e}getDefines(){return this.defines}getUniforms(){return this.uniforms}getExtensions(){return this.extensions}getBlendMode(){return this.blendMode}getAttributes(){return this.attributes}setAttributes(e){this.attributes=e,this.setChanged()}getFragmentShader(){return this.fragmentShader}setFragmentShader(e){this.fragmentShader=e,this.setChanged()}getVertexShader(){return this.vertexShader}setVertexShader(e){this.vertexShader=e,this.setChanged()}setChanged(){this.dispatchEvent({type:"change"})}setDepthTexture(e,t=Vo){}update(e,t,a){}setSize(e,t){}initialize(e,t,a){}dispose(){for(const e of Object.keys(this)){const t=this[e];(t instanceof Ht||t instanceof Iu||t instanceof Ur||t instanceof ha)&&this[e].dispose()}}},Vr={MEDIUM:2,LARGE:3},fm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec4 sum=texture2D(inputBuffer,vUv0);sum+=texture2D(inputBuffer,vUv1);sum+=texture2D(inputBuffer,vUv2);sum+=texture2D(inputBuffer,vUv3);gl_FragColor=sum*0.25;
#include <colorspace_fragment>
}`,mm="uniform vec4 texelSize;uniform float kernel;uniform float scale;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec2 uv=position.xy*0.5+0.5;vec2 dUv=(texelSize.xy*vec2(kernel)+texelSize.zw)*scale;vUv0=vec2(uv.x-dUv.x,uv.y+dUv.y);vUv1=vec2(uv.x+dUv.x,uv.y+dUv.y);vUv2=vec2(uv.x+dUv.x,uv.y-dUv.y);vUv3=vec2(uv.x-dUv.x,uv.y-dUv.y);gl_Position=vec4(position.xy,1.0,1.0);}",pm=[new Float32Array([0,0]),new Float32Array([0,1,1]),new Float32Array([0,1,1,2]),new Float32Array([0,1,2,2,3]),new Float32Array([0,1,2,3,4,4,5]),new Float32Array([0,1,2,3,4,5,7,8,9,10])],vm=class extends yt{constructor(e=new va){super({name:"KawaseBlurMaterial",uniforms:{inputBuffer:new ke(null),texelSize:new ke(new va),scale:new ke(1),kernel:new ke(0)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:fm,vertexShader:mm}),this.setTexelSize(e.x,e.y),this.kernelSize=Vr.MEDIUM}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.inputBuffer=e}get kernelSequence(){return pm[this.kernelSize]}get scale(){return this.uniforms.scale.value}set scale(e){this.uniforms.scale.value=e}getScale(){return this.uniforms.scale.value}setScale(e){this.uniforms.scale.value=e}getKernel(){return null}get kernel(){return this.uniforms.kernel.value}set kernel(e){this.uniforms.kernel.value=e}setKernel(e){this.kernel=e}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t,e*.5,t*.5)}setSize(e,t){const a=1/e,s=1/t;this.uniforms.texelSize.value.set(a,s,a*.5,s*.5)}},gm=class extends ha{constructor({kernelSize:e=Vr.MEDIUM,resolutionScale:t=.5,width:a=Da.AUTO_SIZE,height:s=Da.AUTO_SIZE,resolutionX:i=a,resolutionY:o=s}={}){super("KawaseBlurPass"),this.renderTargetA=new Ht(1,1,{depthBuffer:!1}),this.renderTargetA.texture.name="Blur.Target.A",this.renderTargetB=this.renderTargetA.clone(),this.renderTargetB.texture.name="Blur.Target.B";const l=this.resolution=new Da(this,i,o,t);l.addEventListener("change",u=>this.setSize(l.baseWidth,l.baseHeight)),this._blurMaterial=new vm,this._blurMaterial.kernelSize=e,this.copyMaterial=new Xu}getResolution(){return this.resolution}get blurMaterial(){return this._blurMaterial}set blurMaterial(e){this._blurMaterial=e}get dithering(){return this.copyMaterial.dithering}set dithering(e){this.copyMaterial.dithering=e}get kernelSize(){return this.blurMaterial.kernelSize}set kernelSize(e){this.blurMaterial.kernelSize=e}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get scale(){return this.blurMaterial.scale}set scale(e){this.blurMaterial.scale=e}getScale(){return this.blurMaterial.scale}setScale(e){this.blurMaterial.scale=e}getKernelSize(){return this.kernelSize}setKernelSize(e){this.kernelSize=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}render(e,t,a,s,i){const o=this.scene,l=this.camera,u=this.renderTargetA,r=this.renderTargetB,c=this.blurMaterial,h=c.kernelSequence;let p=t;this.fullscreenMaterial=c;for(let x=0,y=h.length;x<y;++x){const M=(x&1)===0?u:r;c.kernel=h[x],c.inputBuffer=p.texture,e.setRenderTarget(M),e.render(o,l),p=M}this.fullscreenMaterial=this.copyMaterial,this.copyMaterial.inputBuffer=p.texture,e.setRenderTarget(this.renderToScreen?null:a),e.render(o,l)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t);const s=a.width,i=a.height;this.renderTargetA.setSize(s,i),this.renderTargetB.setSize(s,i),this.blurMaterial.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTargetA.texture.type=a,this.renderTargetB.texture.type=a,a!==Ut?(this.blurMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.copyMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1"):e!==null&&e.outputColorSpace===nt&&(this.renderTargetA.texture.colorSpace=nt,this.renderTargetB.texture.colorSpace=nt))}static get AUTO_SIZE(){return Da.AUTO_SIZE}},xm=`#include <common>
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
}`,wm=class extends yt{constructor(e=!1,t=null){super({name:"LuminanceMaterial",defines:{THREE_REVISION:Or.replace(/\D+/g,"")},uniforms:{inputBuffer:new ke(null),threshold:new ke(0),smoothing:new ke(1),range:new ke(null)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:xm,vertexShader:Wr}),this.colorOutput=e,this.luminanceRange=t}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get threshold(){return this.uniforms.threshold.value}set threshold(e){this.smoothing>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.threshold.value=e}getThreshold(){return this.threshold}setThreshold(e){this.threshold=e}get smoothing(){return this.uniforms.smoothing.value}set smoothing(e){this.threshold>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.smoothing.value=e}getSmoothingFactor(){return this.smoothing}setSmoothingFactor(e){this.smoothing=e}get useThreshold(){return this.threshold>0||this.smoothing>0}set useThreshold(e){}get colorOutput(){return this.defines.COLOR!==void 0}set colorOutput(e){e?this.defines.COLOR="1":delete this.defines.COLOR,this.needsUpdate=!0}isColorOutputEnabled(e){return this.colorOutput}setColorOutputEnabled(e){this.colorOutput=e}get useRange(){return this.luminanceRange!==null}set useRange(e){this.luminanceRange=null}get luminanceRange(){return this.uniforms.range.value}set luminanceRange(e){e!==null?this.defines.RANGE="1":delete this.defines.RANGE,this.uniforms.range.value=e,this.needsUpdate=!0}getLuminanceRange(){return this.luminanceRange}setLuminanceRange(e){this.luminanceRange=e}},Qu=class extends ha{constructor({renderTarget:e,luminanceRange:t,colorOutput:a,resolutionScale:s=1,width:i=Da.AUTO_SIZE,height:o=Da.AUTO_SIZE,resolutionX:l=i,resolutionY:u=o}={}){super("LuminancePass"),this.fullscreenMaterial=new wm(a,t),this.needsSwap=!1,this.renderTarget=e,this.renderTarget===void 0&&(this.renderTarget=new Ht(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="LuminancePass.Target");const r=this.resolution=new Da(this,l,u,s);r.addEventListener("change",c=>this.setSize(r.baseWidth,r.baseHeight))}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}getResolution(){return this.resolution}render(e,t,a,s,i){const o=this.fullscreenMaterial;o.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height)}initialize(e,t,a){a!==void 0&&a!==Ut&&(this.renderTarget.texture.type=a,this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}},Mm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#define WEIGHT_INNER 0.125
#define WEIGHT_OUTER 0.05556
varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;float clampToBorder(const in vec2 uv){return float(uv.s>=0.0&&uv.s<=1.0&&uv.t>=0.0&&uv.t<=1.0);}void main(){vec4 c=vec4(0.0);vec4 w=WEIGHT_INNER*vec4(clampToBorder(vUv00),clampToBorder(vUv01),clampToBorder(vUv02),clampToBorder(vUv03));c+=w.x*texture2D(inputBuffer,vUv00);c+=w.y*texture2D(inputBuffer,vUv01);c+=w.z*texture2D(inputBuffer,vUv02);c+=w.w*texture2D(inputBuffer,vUv03);w=WEIGHT_OUTER*vec4(clampToBorder(vUv04),clampToBorder(vUv05),clampToBorder(vUv06),clampToBorder(vUv07));c+=w.x*texture2D(inputBuffer,vUv04);c+=w.y*texture2D(inputBuffer,vUv05);c+=w.z*texture2D(inputBuffer,vUv06);c+=w.w*texture2D(inputBuffer,vUv07);w=WEIGHT_OUTER*vec4(clampToBorder(vUv08),clampToBorder(vUv09),clampToBorder(vUv10),clampToBorder(vUv11));c+=w.x*texture2D(inputBuffer,vUv08);c+=w.y*texture2D(inputBuffer,vUv09);c+=w.z*texture2D(inputBuffer,vUv10);c+=w.w*texture2D(inputBuffer,vUv11);c+=WEIGHT_OUTER*texture2D(inputBuffer,vUv);gl_FragColor=c;
#include <colorspace_fragment>
}`,ym="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;void main(){vUv=position.xy*0.5+0.5;vUv00=vUv+texelSize*vec2(-1.0,1.0);vUv01=vUv+texelSize*vec2(1.0,1.0);vUv02=vUv+texelSize*vec2(-1.0,-1.0);vUv03=vUv+texelSize*vec2(1.0,-1.0);vUv04=vUv+texelSize*vec2(-2.0,2.0);vUv05=vUv+texelSize*vec2(0.0,2.0);vUv06=vUv+texelSize*vec2(2.0,2.0);vUv07=vUv+texelSize*vec2(-2.0,0.0);vUv08=vUv+texelSize*vec2(2.0,0.0);vUv09=vUv+texelSize*vec2(-2.0,-2.0);vUv10=vUv+texelSize*vec2(0.0,-2.0);vUv11=vUv+texelSize*vec2(2.0,-2.0);gl_Position=vec4(position.xy,1.0,1.0);}",bm=class extends yt{constructor(){super({name:"DownsamplingMaterial",uniforms:{inputBuffer:new ke(null),texelSize:new ke(new Ne)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Mm,vertexShader:ym})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},Sm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;uniform mediump sampler2D supportBuffer;
#else
uniform lowp sampler2D inputBuffer;uniform lowp sampler2D supportBuffer;
#endif
uniform float radius;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vec4 c=vec4(0.0);c+=texture2D(inputBuffer,vUv0)*0.0625;c+=texture2D(inputBuffer,vUv1)*0.125;c+=texture2D(inputBuffer,vUv2)*0.0625;c+=texture2D(inputBuffer,vUv3)*0.125;c+=texture2D(inputBuffer,vUv)*0.25;c+=texture2D(inputBuffer,vUv4)*0.125;c+=texture2D(inputBuffer,vUv5)*0.0625;c+=texture2D(inputBuffer,vUv6)*0.125;c+=texture2D(inputBuffer,vUv7)*0.0625;vec4 baseColor=texture2D(supportBuffer,vUv);gl_FragColor=mix(baseColor,c,radius);
#include <colorspace_fragment>
}`,Tm="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vUv=position.xy*0.5+0.5;vUv0=vUv+texelSize*vec2(-1.0,1.0);vUv1=vUv+texelSize*vec2(0.0,1.0);vUv2=vUv+texelSize*vec2(1.0,1.0);vUv3=vUv+texelSize*vec2(-1.0,0.0);vUv4=vUv+texelSize*vec2(1.0,0.0);vUv5=vUv+texelSize*vec2(-1.0,-1.0);vUv6=vUv+texelSize*vec2(0.0,-1.0);vUv7=vUv+texelSize*vec2(1.0,-1.0);gl_Position=vec4(position.xy,1.0,1.0);}",Em=class extends yt{constructor(){super({name:"UpsamplingMaterial",uniforms:{inputBuffer:new ke(null),supportBuffer:new ke(null),texelSize:new ke(new Ne),radius:new ke(.85)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Sm,vertexShader:Tm})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}set supportBuffer(e){this.uniforms.supportBuffer.value=e}get radius(){return this.uniforms.radius.value}set radius(e){this.uniforms.radius.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},Rm=class extends ha{constructor(){super("MipmapBlurPass"),this.needsSwap=!1,this.renderTarget=new Ht(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Upsampling.Mipmap0",this.downsamplingMipmaps=[],this.upsamplingMipmaps=[],this.downsamplingMaterial=new bm,this.upsamplingMaterial=new Em,this.resolution=new Ne}get texture(){return this.renderTarget.texture}get levels(){return this.downsamplingMipmaps.length}set levels(e){if(this.levels!==e){const t=this.renderTarget;this.dispose(),this.downsamplingMipmaps=[],this.upsamplingMipmaps=[];for(let a=0;a<e;++a){const s=t.clone();s.texture.name="Downsampling.Mipmap"+a,this.downsamplingMipmaps.push(s)}this.upsamplingMipmaps.push(t);for(let a=1,s=e-1;a<s;++a){const i=t.clone();i.texture.name="Upsampling.Mipmap"+a,this.upsamplingMipmaps.push(i)}this.setSize(this.resolution.x,this.resolution.y)}}get radius(){return this.upsamplingMaterial.radius}set radius(e){this.upsamplingMaterial.radius=e}render(e,t,a,s,i){const{scene:o,camera:l}=this,{downsamplingMaterial:u,upsamplingMaterial:r}=this,{downsamplingMipmaps:c,upsamplingMipmaps:h}=this;let p=t;this.fullscreenMaterial=u;for(let x=0,y=c.length;x<y;++x){const M=c[x];u.setSize(p.width,p.height),u.inputBuffer=p.texture,e.setRenderTarget(M),e.render(o,l),p=M}this.fullscreenMaterial=r;for(let x=h.length-1;x>=0;--x){const y=h[x];r.setSize(p.width,p.height),r.inputBuffer=p.texture,r.supportBuffer=c[x].texture,e.setRenderTarget(y),e.render(o,l),p=y}}setSize(e,t){const a=this.resolution;a.set(e,t);let s=a.width,i=a.height;for(let o=0,l=this.downsamplingMipmaps.length;o<l;++o)s=Math.round(s*.5),i=Math.round(i*.5),this.downsamplingMipmaps[o].setSize(s,i),o<this.upsamplingMipmaps.length&&this.upsamplingMipmaps[o].setSize(s,i)}initialize(e,t,a){if(a!==void 0){const s=this.downsamplingMipmaps.concat(this.upsamplingMipmaps);for(const i of s)i.texture.type=a;if(a!==Ut)this.downsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.upsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1";else if(e!==null&&e.outputColorSpace===nt)for(const i of s)i.texture.colorSpace=nt}}dispose(){super.dispose();for(const e of this.downsamplingMipmaps.concat(this.upsamplingMipmaps))e.dispose()}},Am=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D map;
#else
uniform lowp sampler2D map;
#endif
uniform float intensity;void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){outputColor=texture2D(map,uv)*intensity;}`,km=class extends Zu{constructor({blendFunction:e=Pe.SCREEN,luminanceThreshold:t=1,luminanceSmoothing:a=.03,mipmapBlur:s=!0,intensity:i=1,radius:o=.85,levels:l=8,kernelSize:u=Vr.LARGE,resolutionScale:r=.5,width:c=Da.AUTO_SIZE,height:h=Da.AUTO_SIZE,resolutionX:p=c,resolutionY:x=h}={}){super("BloomEffect",Am,{blendFunction:e,uniforms:new Map([["map",new ke(null)],["intensity",new ke(i)]])}),this.renderTarget=new Ht(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Bloom.Target",this.blurPass=new gm({kernelSize:u}),this.luminancePass=new Qu({colorOutput:!0}),this.luminanceMaterial.threshold=t,this.luminanceMaterial.smoothing=a,this.mipmapBlurPass=new Rm,this.mipmapBlurPass.enabled=s,this.mipmapBlurPass.radius=o,this.mipmapBlurPass.levels=l,this.uniforms.get("map").value=s?this.mipmapBlurPass.texture:this.renderTarget.texture;const y=this.resolution=new Da(this,p,x,r);y.addEventListener("change",M=>this.setSize(y.baseWidth,y.baseHeight))}get texture(){return this.mipmapBlurPass.enabled?this.mipmapBlurPass.texture:this.renderTarget.texture}getTexture(){return this.texture}getResolution(){return this.resolution}getBlurPass(){return this.blurPass}getLuminancePass(){return this.luminancePass}get luminanceMaterial(){return this.luminancePass.fullscreenMaterial}getLuminanceMaterial(){return this.luminancePass.fullscreenMaterial}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get dithering(){return this.blurPass.dithering}set dithering(e){this.blurPass.dithering=e}get kernelSize(){return this.blurPass.kernelSize}set kernelSize(e){this.blurPass.kernelSize=e}get distinction(){return console.warn(this.name,"distinction was removed"),1}set distinction(e){console.warn(this.name,"distinction was removed")}get intensity(){return this.uniforms.get("intensity").value}set intensity(e){this.uniforms.get("intensity").value=e}getIntensity(){return this.intensity}setIntensity(e){this.intensity=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}update(e,t,a){const s=this.renderTarget,i=this.luminancePass;i.enabled?(i.render(e,t),this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,i.renderTarget):this.blurPass.render(e,i.renderTarget,s)):this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,t):this.blurPass.render(e,t,s)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height),this.blurPass.resolution.copy(a),this.luminancePass.setSize(e,t),this.mipmapBlurPass.setSize(e,t)}initialize(e,t,a){this.blurPass.initialize(e,t,a),this.luminancePass.initialize(e,t,a),this.mipmapBlurPass.initialize(e,t,a),a!==void 0&&(this.renderTarget.texture.type=a,e!==null&&e.outputColorSpace===nt&&(this.renderTarget.texture.colorSpace=nt))}},_m=class extends ha{constructor(e,t,a=null){super("RenderPass",e,t),this.needsSwap=!1,this.needsDepthBlit=!0,this.clearPass=new qu,this.overrideMaterialManager=a===null?null:new Jc(a),this.ignoreBackground=!1,this.skipShadowMapUpdate=!1,this.selection=null}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get renderToScreen(){return super.renderToScreen}set renderToScreen(e){super.renderToScreen=e,this.clearPass.renderToScreen=e}get overrideMaterial(){const e=this.overrideMaterialManager;return e!==null?e.material:null}set overrideMaterial(e){const t=this.overrideMaterialManager;e!==null?t!==null?t.setMaterial(e):this.overrideMaterialManager=new Jc(e):t!==null&&(t.dispose(),this.overrideMaterialManager=null)}getOverrideMaterial(){return this.overrideMaterial}setOverrideMaterial(e){this.overrideMaterial=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getSelection(){return this.selection}setSelection(e){this.selection=e}isBackgroundDisabled(){return this.ignoreBackground}setBackgroundDisabled(e){this.ignoreBackground=e}isShadowMapDisabled(){return this.skipShadowMapUpdate}setShadowMapDisabled(e){this.skipShadowMapUpdate=e}getClearPass(){return this.clearPass}render(e,t,a,s,i){const o=this.scene,l=this.camera,u=this.selection,r=l.layers.mask,c=o.background,h=e.shadowMap.autoUpdate,p=this.renderToScreen?null:t;u!==null&&l.layers.set(u.getLayer()),this.skipShadowMapUpdate&&(e.shadowMap.autoUpdate=!1),(this.ignoreBackground||this.clearPass.overrideClearColor!==null)&&(o.background=null),this.clearPass.enabled&&this.clearPass.render(e,t),e.setRenderTarget(p),this.overrideMaterialManager!==null?this.overrideMaterialManager.render(e,o,l):e.render(o,l),l.layers.mask=r,o.background=c,e.shadowMap.autoUpdate=h}},ia={LINEAR:0,REINHARD:1,REINHARD2:2,REINHARD2_ADAPTIVE:3,OPTIMIZED_CINEON:5,CINEON:5,ACES_FILMIC:6,AGX:7,NEUTRAL:8},Fm=`#include <packing>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
uniform lowp sampler2D luminanceBuffer0;uniform lowp sampler2D luminanceBuffer1;uniform float minLuminance;uniform float deltaTime;uniform float tau;varying vec2 vUv;void main(){float l0=unpackRGBAToFloat(texture2D(luminanceBuffer0,vUv));
#if __VERSION__ < 300
float l1=texture2DLodEXT(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#else
float l1=textureLod(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#endif
l0=max(minLuminance,l0);l1=max(minLuminance,l1);float adaptedLum=l0+(l1-l0)*(1.0-exp(-deltaTime*tau));gl_FragColor=(adaptedLum==1.0)?vec4(1.0):packFloatToRGBA(adaptedLum);}`,Dm=class extends yt{constructor(){super({name:"AdaptiveLuminanceMaterial",defines:{MIP_LEVEL_1X1:"0.0"},uniforms:{luminanceBuffer0:new ke(null),luminanceBuffer1:new ke(null),minLuminance:new ke(.01),deltaTime:new ke(0),tau:new ke(1)},extensions:{shaderTextureLOD:!0},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Fm,vertexShader:Wr})}set luminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}setLuminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}set luminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}setLuminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}set mipLevel1x1(e){this.defines.MIP_LEVEL_1X1=e.toFixed(1),this.needsUpdate=!0}setMipLevel1x1(e){this.mipLevel1x1=e}set deltaTime(e){this.uniforms.deltaTime.value=e}setDeltaTime(e){this.uniforms.deltaTime.value=e}get minLuminance(){return this.uniforms.minLuminance.value}set minLuminance(e){this.uniforms.minLuminance.value=e}getMinLuminance(){return this.uniforms.minLuminance.value}setMinLuminance(e){this.uniforms.minLuminance.value=e}get adaptationRate(){return this.uniforms.tau.value}set adaptationRate(e){this.uniforms.tau.value=e}getAdaptationRate(){return this.uniforms.tau.value}setAdaptationRate(e){this.uniforms.tau.value=e}},Pm=class extends ha{constructor(e,{minLuminance:t=.01,adaptationRate:a=1}={}){super("AdaptiveLuminancePass"),this.fullscreenMaterial=new Dm,this.needsSwap=!1,this.renderTargetPrevious=new Ht(1,1,{minFilter:Uo,magFilter:Uo,depthBuffer:!1}),this.renderTargetPrevious.texture.name="Luminance.Previous";const s=this.fullscreenMaterial;s.luminanceBuffer0=this.renderTargetPrevious.texture,s.luminanceBuffer1=e,s.minLuminance=t,s.adaptationRate=a,this.renderTargetAdapted=this.renderTargetPrevious.clone(),this.renderTargetAdapted.texture.name="Luminance.Adapted",this.copyPass=new ju(this.renderTargetPrevious,!1)}get texture(){return this.renderTargetAdapted.texture}getTexture(){return this.renderTargetAdapted.texture}set mipLevel1x1(e){this.fullscreenMaterial.mipLevel1x1=e}get adaptationRate(){return this.fullscreenMaterial.adaptationRate}set adaptationRate(e){this.fullscreenMaterial.adaptationRate=e}render(e,t,a,s,i){this.fullscreenMaterial.deltaTime=s,e.setRenderTarget(this.renderToScreen?null:this.renderTargetAdapted),e.render(this.scene,this.camera),this.copyPass.render(e,this.renderTargetAdapted)}},Im=`#include <tonemapping_pars_fragment>
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
}`,Cm=class extends Zu{constructor({blendFunction:e=Pe.SRC,adaptive:t=!1,mode:a=t?ia.REINHARD2_ADAPTIVE:ia.AGX,resolution:s=256,maxLuminance:i=4,whitePoint:o=i,middleGrey:l=.6,minLuminance:u=.01,averageLuminance:r=1,adaptationRate:c=1}={}){super("ToneMappingEffect",Im,{blendFunction:e,uniforms:new Map([["luminanceBuffer",new ke(null)],["maxLuminance",new ke(i)],["whitePoint",new ke(o)],["middleGrey",new ke(l)],["averageLuminance",new ke(r)]])}),this.renderTargetLuminance=new Ht(1,1,{minFilter:Ga,depthBuffer:!1}),this.renderTargetLuminance.texture.generateMipmaps=!0,this.renderTargetLuminance.texture.name="Luminance",this.luminancePass=new Qu({renderTarget:this.renderTargetLuminance}),this.adaptiveLuminancePass=new Pm(this.luminancePass.texture,{minLuminance:u,adaptationRate:c}),this.uniforms.get("luminanceBuffer").value=this.adaptiveLuminancePass.texture,this.resolution=s,this.mode=a}get mode(){return Number(this.defines.get("TONE_MAPPING_MODE"))}set mode(e){if(this.mode===e)return;const a=Or.replace(/\D+/g,"")>=168?"CineonToneMapping(texel)":"OptimizedCineonToneMapping(texel)";switch(this.defines.clear(),this.defines.set("TONE_MAPPING_MODE",e.toFixed(0)),e){case ia.LINEAR:this.defines.set("toneMapping(texel)","LinearToneMapping(texel)");break;case ia.REINHARD:this.defines.set("toneMapping(texel)","ReinhardToneMapping(texel)");break;case ia.CINEON:case ia.OPTIMIZED_CINEON:this.defines.set("toneMapping(texel)",a);break;case ia.ACES_FILMIC:this.defines.set("toneMapping(texel)","ACESFilmicToneMapping(texel)");break;case ia.AGX:this.defines.set("toneMapping(texel)","AgXToneMapping(texel)");break;case ia.NEUTRAL:this.defines.set("toneMapping(texel)","NeutralToneMapping(texel)");break;default:this.defines.set("toneMapping(texel)","texel");break}this.adaptiveLuminancePass.enabled=e===ia.REINHARD2_ADAPTIVE,this.setChanged()}getMode(){return this.mode}setMode(e){this.mode=e}get whitePoint(){return this.uniforms.get("whitePoint").value}set whitePoint(e){this.uniforms.get("whitePoint").value=e}get middleGrey(){return this.uniforms.get("middleGrey").value}set middleGrey(e){this.uniforms.get("middleGrey").value=e}get averageLuminance(){return this.uniforms.get("averageLuminance").value}set averageLuminance(e){this.uniforms.get("averageLuminance").value=e}get adaptiveLuminanceMaterial(){return this.adaptiveLuminancePass.fullscreenMaterial}getAdaptiveLuminanceMaterial(){return this.adaptiveLuminanceMaterial}get resolution(){return this.luminancePass.resolution.width}set resolution(e){const t=Math.max(0,Math.ceil(Math.log2(e))),a=Math.pow(2,t);this.luminancePass.resolution.setPreferredSize(a,a),this.adaptiveLuminanceMaterial.mipLevel1x1=t}getResolution(){return this.resolution}setResolution(e){this.resolution=e}get adaptive(){return this.mode===ia.REINHARD2_ADAPTIVE}set adaptive(e){this.mode=e?ia.REINHARD2_ADAPTIVE:ia.REINHARD2}get adaptationRate(){return this.adaptiveLuminanceMaterial.adaptationRate}set adaptationRate(e){this.adaptiveLuminanceMaterial.adaptationRate=e}get distinction(){return console.warn(this.name,"distinction was removed."),1}set distinction(e){console.warn(this.name,"distinction was removed.")}update(e,t,a){this.adaptiveLuminancePass.enabled&&(this.luminancePass.render(e,t),this.adaptiveLuminancePass.render(e,null,null,a))}initialize(e,t,a){this.adaptiveLuminancePass.initialize(e,t,a)}},Lm=`#include <common>
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
}`,Nm="uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;VERTEX_HEAD void main(){vUv=position.xy*0.5+0.5;VERTEX_MAIN_SUPPORT gl_Position=vec4(position.xy,1.0,1.0);}",zm=class extends yt{constructor(e,t,a,s,i=!1){super({name:"EffectMaterial",defines:{THREE_REVISION:Or.replace(/\D+/g,""),DEPTH_PACKING:"0",ENCODE_OUTPUT:"1"},uniforms:{inputBuffer:new ke(null),depthBuffer:new ke(null),resolution:new ke(new Ne),texelSize:new ke(new Ne),cameraNear:new ke(.3),cameraFar:new ke(1e3),aspect:new ke(1),time:new ke(0)},blending:Is,toneMapped:!1,depthWrite:!1,depthTest:!1,dithering:i}),e&&this.setShaderParts(e),t&&this.setDefines(t),a&&this.setUniforms(a),this.copyCameraSettings(s)}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){this.uniforms.depthBuffer.value=e}get depthPacking(){return Number(this.defines.DEPTH_PACKING)}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}setDepthBuffer(e,t=Vo){this.depthBuffer=e,this.depthPacking=t}setShaderData(e){this.setShaderParts(e.shaderParts),this.setDefines(e.defines),this.setUniforms(e.uniforms),this.setExtensions(e.extensions)}setShaderParts(e){return this.fragmentShader=Lm.replace(je.FRAGMENT_HEAD,e.get(je.FRAGMENT_HEAD)||"").replace(je.FRAGMENT_MAIN_UV,e.get(je.FRAGMENT_MAIN_UV)||"").replace(je.FRAGMENT_MAIN_IMAGE,e.get(je.FRAGMENT_MAIN_IMAGE)||""),this.vertexShader=Nm.replace(je.VERTEX_HEAD,e.get(je.VERTEX_HEAD)||"").replace(je.VERTEX_MAIN_SUPPORT,e.get(je.VERTEX_MAIN_SUPPORT)||""),this.needsUpdate=!0,this}setDefines(e){for(const t of e.entries())this.defines[t[0]]=t[1];return this.needsUpdate=!0,this}setUniforms(e){for(const t of e.entries())this.uniforms[t[0]]=t[1];return this}setExtensions(e){this.extensions={};for(const t of e)this.extensions[t]=!0;return this}get encodeOutput(){return this.defines.ENCODE_OUTPUT!==void 0}set encodeOutput(e){this.encodeOutput!==e&&(e?this.defines.ENCODE_OUTPUT="1":delete this.defines.ENCODE_OUTPUT,this.needsUpdate=!0)}isOutputEncodingEnabled(e){return this.encodeOutput}setOutputEncodingEnabled(e){this.encodeOutput=e}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}setDeltaTime(e){this.uniforms.time.value+=e}adoptCameraSettings(e){this.copyCameraSettings(e)}copyCameraSettings(e){e&&(this.uniforms.cameraNear.value=e.near,this.uniforms.cameraFar.value=e.far,e instanceof Hr?this.defines.PERSPECTIVE_CAMERA="1":delete this.defines.PERSPECTIVE_CAMERA,this.needsUpdate=!0)}setSize(e,t){const a=this.uniforms;a.resolution.value.set(e,t),a.texelSize.value.set(1/e,1/t),a.aspect.value=e/t}static get Section(){return je}};function eu(e,t,a){for(const s of t){const i="$1"+e+s.charAt(0).toUpperCase()+s.slice(1),o=new RegExp("([^\\.])(\\b"+s+"\\b)","g");for(const l of a.entries())l[1]!==null&&a.set(l[0],l[1].replace(o,i))}}function Um(e,t,a){let s=t.getFragmentShader(),i=t.getVertexShader();const o=s!==void 0&&/mainImage/.test(s),l=s!==void 0&&/mainUv/.test(s);if(a.attributes|=t.getAttributes(),s===void 0)throw new Error(`Missing fragment shader (${t.name})`);if(l&&(a.attributes&Ps.CONVOLUTION)!==0)throw new Error(`Effects that transform UVs are incompatible with convolution effects (${t.name})`);if(!o&&!l)throw new Error(`Could not find mainImage or mainUv function (${t.name})`);{const u=/\w+\s+(\w+)\([\w\s,]*\)\s*{/g,r=a.shaderParts;let c=r.get(je.FRAGMENT_HEAD)||"",h=r.get(je.FRAGMENT_MAIN_UV)||"",p=r.get(je.FRAGMENT_MAIN_IMAGE)||"",x=r.get(je.VERTEX_HEAD)||"",y=r.get(je.VERTEX_MAIN_SUPPORT)||"";const M=new Set,E=new Set;if(l&&(h+=`	${e}MainUv(UV);
`,a.uvTransformation=!0),i!==null&&/mainSupport/.test(i)){const S=/mainSupport *\([\w\s]*?uv\s*?\)/.test(i);y+=`	${e}MainSupport(`,y+=S?`vUv);
`:`);
`;for(const _ of i.matchAll(/(?:varying\s+\w+\s+([\S\s]*?);)/g))for(const F of _[1].split(/\s*,\s*/))a.varyings.add(F),M.add(F),E.add(F);for(const _ of i.matchAll(u))E.add(_[1])}for(const S of s.matchAll(u))E.add(S[1]);for(const S of t.defines.keys())E.add(S.replace(/\([\w\s,]*\)/g,""));for(const S of t.uniforms.keys())E.add(S);E.delete("while"),E.delete("for"),E.delete("if"),t.uniforms.forEach((S,_)=>a.uniforms.set(e+_.charAt(0).toUpperCase()+_.slice(1),S)),t.defines.forEach((S,_)=>a.defines.set(e+_.charAt(0).toUpperCase()+_.slice(1),S));const g=new Map([["fragment",s],["vertex",i]]);eu(e,E,a.defines),eu(e,E,g),s=g.get("fragment"),i=g.get("vertex");const m=t.blendMode;if(a.blendModes.set(m.blendFunction,m),o){t.inputColorSpace!==null&&t.inputColorSpace!==a.colorSpace&&(p+=t.inputColorSpace===nt?`color0 = sRGBTransferOETF(color0);
	`:`color0 = sRGBToLinear(color0);
	`),t.outputColorSpace!==Ia?a.colorSpace=t.outputColorSpace:t.inputColorSpace!==null&&(a.colorSpace=t.inputColorSpace);const S=/MainImage *\([\w\s,]*?depth[\w\s,]*?\)/;p+=`${e}MainImage(color0, UV, `,(a.attributes&Ps.DEPTH)!==0&&S.test(s)&&(p+="depth, ",a.readDepth=!0),p+=`color1);
	`;const _=e+"BlendOpacity";a.uniforms.set(_,m.opacity),p+=`color0 = blend${m.blendFunction}(color0, color1, ${_});

	`,c+=`uniform float ${_};

`}if(c+=s+`
`,i!==null&&(x+=i+`
`),r.set(je.FRAGMENT_HEAD,c),r.set(je.FRAGMENT_MAIN_UV,h),r.set(je.FRAGMENT_MAIN_IMAGE,p),r.set(je.VERTEX_HEAD,x),r.set(je.VERTEX_MAIN_SUPPORT,y),t.extensions!==null)for(const S of t.extensions)a.extensions.add(S)}}var Bm=class extends ha{constructor(e,...t){super("EffectPass"),this.fullscreenMaterial=new zm(null,null,null,e),this.listener=a=>this.handleEvent(a),this.effects=[],this.setEffects(t),this.skipRendering=!1,this.minTime=1,this.maxTime=Number.POSITIVE_INFINITY,this.timeScale=1}set mainScene(e){for(const t of this.effects)t.mainScene=e}set mainCamera(e){this.fullscreenMaterial.copyCameraSettings(e);for(const t of this.effects)t.mainCamera=e}get encodeOutput(){return this.fullscreenMaterial.encodeOutput}set encodeOutput(e){this.fullscreenMaterial.encodeOutput=e}get dithering(){return this.fullscreenMaterial.dithering}set dithering(e){const t=this.fullscreenMaterial;t.dithering=e,t.needsUpdate=!0}setEffects(e){for(const t of this.effects)t.removeEventListener("change",this.listener);this.effects=e.sort((t,a)=>a.attributes-t.attributes);for(const t of this.effects)t.addEventListener("change",this.listener)}updateMaterial(){const e=new Pf;let t=0;for(const l of this.effects)if(l.blendMode.blendFunction===Pe.DST)e.attributes|=l.getAttributes()&Ps.DEPTH;else{if((e.attributes&l.getAttributes()&Ps.CONVOLUTION)!==0)throw new Error(`Convolution effects cannot be merged (${l.name})`);Um("e"+t++,l,e)}let a=e.shaderParts.get(je.FRAGMENT_HEAD),s=e.shaderParts.get(je.FRAGMENT_MAIN_IMAGE),i=e.shaderParts.get(je.FRAGMENT_MAIN_UV);const o=/\bblend\b/g;for(const l of e.blendModes.values())a+=l.getShaderCode().replace(o,`blend${l.blendFunction}`)+`
`;(e.attributes&Ps.DEPTH)!==0?(e.readDepth&&(s=`float depth = readDepth(UV);

	`+s),this.needsDepthTexture=this.getDepthTexture()===null):this.needsDepthTexture=!1,e.colorSpace===nt&&(s+=`color0 = sRGBToLinear(color0);
	`),e.uvTransformation?(i=`vec2 transformedUv = vUv;
`+i,e.defines.set("UV","transformedUv")):e.defines.set("UV","vUv"),e.shaderParts.set(je.FRAGMENT_HEAD,a),e.shaderParts.set(je.FRAGMENT_MAIN_IMAGE,s),e.shaderParts.set(je.FRAGMENT_MAIN_UV,i);for(const[l,u]of e.shaderParts)u!==null&&e.shaderParts.set(l,u.trim().replace(/^#/,`
#`));this.skipRendering=t===0,this.needsSwap=!this.skipRendering,this.fullscreenMaterial.setShaderData(e)}recompile(){this.updateMaterial()}getDepthTexture(){return this.fullscreenMaterial.depthBuffer}setDepthTexture(e,t=Vo){this.fullscreenMaterial.depthBuffer=e,this.fullscreenMaterial.depthPacking=t;for(const a of this.effects)a.setDepthTexture(e,t)}render(e,t,a,s,i){for(const o of this.effects)o.update(e,t,s);if(!this.skipRendering||this.renderToScreen){const o=this.fullscreenMaterial;o.inputBuffer=t.texture,o.time+=s*this.timeScale,e.setRenderTarget(this.renderToScreen?null:a),e.render(this.scene,this.camera)}}setSize(e,t){this.fullscreenMaterial.setSize(e,t);for(const a of this.effects)a.setSize(e,t)}initialize(e,t,a){this.renderer=e;for(const s of this.effects)s.initialize(e,t,a);this.updateMaterial(),a!==void 0&&a!==Ut&&(this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}dispose(){super.dispose();for(const e of this.effects)e.removeEventListener("change",this.listener),e.dispose()}handleEvent(e){switch(e.type){case"change":this.recompile();break}}};const Om={exposure:1,bloomThreshold:1.7,bloomSmoothing:.3,bloomIntensity:.85,bloomRadius:.7,bloomLevels:7,msaaSamples:4},Ju=2,Hm=.5;function tu(){const e=typeof window<"u"&&window.devicePixelRatio||1;return Math.min(Ju,Math.max(1,e))}class Gm{constructor(t,a,s,i={}){A(this,"composer");A(this,"renderPass");A(this,"bloom");A(this,"toneMapping");A(this,"finalPass");A(this,"renderer");A(this,"cssWidth",1);A(this,"cssHeight",1);A(this,"pixelRatio",1);const o={...Om,...i};this.renderer=t,t.toneMapping=zh,t.toneMappingExposure=o.exposure,t.outputColorSpace=nt,this.composer=new Df(t,{frameBufferType:Pa,multisampling:o.msaaSamples,depthBuffer:!0,stencilBuffer:!1}),this.renderPass=new _m(a,s),this.composer.addPass(this.renderPass),this.bloom=new km({blendFunction:Pe.ADD,mipmapBlur:!0,luminanceThreshold:o.bloomThreshold,luminanceSmoothing:o.bloomSmoothing,intensity:o.bloomIntensity,radius:o.bloomRadius,levels:o.bloomLevels}),this.toneMapping=new Cm({mode:ia.ACES_FILMIC}),this.finalPass=new Bm(s,this.bloom,this.toneMapping),this.finalPass.dithering=!0,this.composer.addPass(this.finalPass)}insertScenePass(t){const a=this.composer.passes.indexOf(this.finalPass);this.composer.addPass(t,a>=0?a:void 0)}get exposure(){return this.renderer.toneMappingExposure}set exposure(t){this.renderer.toneMappingExposure=Math.max(.01,t)}get drawingBufferHeight(){return Math.max(1,Math.round(this.cssHeight*this.pixelRatio))}setSize(t,a,s){const i=Math.max(1,Math.floor(t)),o=Math.max(1,Math.floor(a)),l=Math.min(Ju,Math.max(Hm,s));return i===this.cssWidth&&o===this.cssHeight&&Math.abs(l-this.pixelRatio)<.001?!1:(this.cssWidth=i,this.cssHeight=o,this.pixelRatio=l,this.renderer.setPixelRatio(l),this.composer.setSize(i,o,!1),!0)}render(t){this.composer.render(t)}dispose(){this.composer.dispose()}}const Km=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,Wm=`
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
`;class Vm{constructor(t){A(this,"renderer");A(this,"scene",new ci);A(this,"camera",new Nr(-1,1,1,-1,0,1));A(this,"material");A(this,"quad");this.renderer=t,this.material=new yt({vertexShader:Km,fragmentShader:Wm,uniforms:{uDem:{value:null},uDemRes:{value:512},uElevRange:{value:new Ne(0,1e3)},uReliefScale:{value:.001},uSlabSize:{value:new Ne(14.8,10.8)},uSunDir:{value:new U(0,1,0)},uPenumbra:{value:9}},depthTest:!1,depthWrite:!1}),this.quad=new ga(new Ko(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}bake(t,a,s,i,o,l,u,r,c=1024){const h=new Ht(c,c,{format:At,type:Ut,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1});h.texture.wrapS=Ve,h.texture.wrapT=Ve,h.texture.colorSpace=Ia;const p=this.material.uniforms;p.uDem.value=t,p.uDemRes.value=a,p.uElevRange.value.set(s,i),p.uReliefScale.value=o,p.uSlabSize.value.set(l,u),p.uSunDir.value.copy(r);const x=this.renderer.getRenderTarget(),y=this.renderer.autoClear;return this.renderer.autoClear=!0,this.renderer.setRenderTarget(h),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(x),this.renderer.autoClear=y,h}dispose(){this.quad.geometry.dispose(),this.material.dispose()}}function Di(e,t,a,s){const i=Math.floor(e.length/3),o=new Int32Array(i);for(let m=0;m<i;m++)o[m]=m;const l=m=>{for(;o[m]!==m;)o[m]=o[o[m]],m=o[m];return m},u=(m,S)=>{const _=l(m),F=l(S);_!==F&&(o[Math.max(_,F)]=Math.min(_,F))},r=new Int32Array(t*a).fill(-1),c=[],h=m=>Math.min(t-1,Math.max(0,m)),p=m=>Math.min(a-1,Math.max(0,m));for(let m=0;m<i;m++){const S=e[m*3],_=e[m*3+1],F=s?s[m*2]:0,P=s?s[m*2+1]:0,N=h(Math.floor((S-F)*t)),D=h(Math.max(Math.floor(S*t),Math.ceil((S+F)*t)-1)),T=p(Math.floor((_-P)*a)),B=p(Math.max(Math.floor(_*a),Math.ceil((_+P)*a)-1));for(let K=T;K<=B;K++)for(let G=N;G<=D;G++){const q=K*t+G;r[q]<0?(r[q]=m,c.push(q)):u(m,r[q])}}for(const m of c){const S=Math.floor(m/t),_=m-S*t,F=r[m];if(_+1<t&&r[m+1]>=0&&u(F,r[m+1]),S+1<a){const P=m+t;r[P]>=0&&u(F,r[P]),_>0&&r[P-1]>=0&&u(F,r[P-1]),_+1<t&&r[P+1]>=0&&u(F,r[P+1])}}const x=new Map,y=new Map;for(let m=0;m<i;m++){const S=l(m);x.set(S,(x.get(S)??0)+1),y.set(S,(y.get(S)??0)+e[m*3+2])}const M=[...x.keys()].sort((m,S)=>x.get(S)-x.get(m)||y.get(S)-y.get(m)||m-S),E=new Map;M.forEach((m,S)=>E.set(m,S));const g=new Uint16Array(i);for(let m=0;m<i;m++)g[m]=Math.min(65535,E.get(l(m)));return{patchOf:g,sizes:M.map(m=>x.get(m))}}function Ym(e){const t=Math.max(1,Math.floor(e)),a=t+1,s=a*a,i=new Float32Array(s*3),o=new Float32Array(s*3),l=new Float32Array(s*2),u=1/t;for(let h=0;h<=t;h++){const p=h*u-.5,x=1-h/t;for(let y=0;y<=t;y++){const M=h*a+y;i[M*3]=y*u-.5,i[M*3+1]=0,i[M*3+2]=p,o[M*3+1]=1,l[M*2]=y/t,l[M*2+1]=x}}const r=new Uint32Array(t*t*6);let c=0;for(let h=0;h<t;h++)for(let p=0;p<t;p++){const x=p+a*h,y=p+a*(h+1),M=p+1+a*(h+1),E=p+1+a*h;r[c++]=x,r[c++]=y,r[c++]=E,r[c++]=y,r[c++]=M,r[c++]=E}return{position:i,normal:o,uv:l,index:r}}function $m(e){let t=0;for(let a=0;a<2400;a++)for(let s=0;s<e.length;s++){const i=e[s]*1.000001+(s&7)*.5;e[s]=i>1e6?i-1e6:i,t+=Math.sqrt(e[s])}return t}function Xm(e=()=>performance.now()){const t=new Float64Array(2048);for(let i=0;i<t.length;i++)t[i]=i;let a=1/0,s=0;for(let i=0;i<2;i++){const o=e();s+=$m(t),a=Math.min(a,e()-o)}return s===-1?-1:a}const jm=8;function qm(e){return Number.isFinite(e)&&e>jm}const Zm={WINDOW_SEC:1,SLOW_MS:26,SLOW_WINDOWS:2,FAST_MS:18.5,CLIMB_SEC:6,HOLD_SEC:30,STALL_MS:250,STEP_DOWN:.15,STEP_UP:.1,LEAST:.5};class Qm{constructor(){A(this,"scale",1);A(this,"windowSec",0);A(this,"gaps",[]);A(this,"slowWindows",0);A(this,"fastSec",0);A(this,"ceiling",1);A(this,"ceilingSec",0)}feed(t,a=!1){const s=Zm;if(!(t>0)||t>s.STALL_MS||a||(this.gaps.push(t),this.windowSec+=t/1e3,this.ceiling<1&&(this.ceilingSec+=t/1e3,this.ceilingSec>s.HOLD_SEC&&(this.ceiling=Math.min(1,this.ceiling+s.STEP_UP),this.ceilingSec=0)),this.windowSec<s.WINDOW_SEC))return null;const i=this.gaps.sort((u,r)=>u-r),o=i[Math.floor(i.length/2)];this.windowSec=0,this.gaps=[];let l=this.scale;return o>s.SLOW_MS?(this.slowWindows+=1,this.fastSec=0,this.slowWindows>=s.SLOW_WINDOWS&&this.scale>s.LEAST&&(this.ceiling=this.scale-s.STEP_UP,this.ceilingSec=0,l=Math.max(s.LEAST,this.scale-s.STEP_DOWN),this.slowWindows=s.SLOW_WINDOWS-1)):o<s.FAST_MS?(this.slowWindows=0,this.fastSec+=s.WINDOW_SEC,this.fastSec>=s.CLIMB_SEC&&this.scale<this.ceiling&&(l=Math.min(this.ceiling,this.scale+s.STEP_UP),this.fastSec=0)):(this.slowWindows=0,this.fastSec=0),Math.abs(l-this.scale)<=.001?null:(this.scale=l,l)}}const Jm="/isogon/assets/draco_decoder-Z1_iN-Ht.wasm",e0="/isogon/assets/draco_wasm_wrapper-fZCQGLGb.js",au=Math.PI/180,t0=1.05,rr=40,a0=6.2,lr=3,s0=.5,i0=.16,Vs=33,o0={modis:3.5,viirs:4.1},n0={modis:new Bo(1,.5,.24),viirs:new Bo(.4,.84,1)},r0={modis:Ho,viirs:ei},l0={terra:new Qn(0,0,0),aqua:new Qn(Math.PI/2,0,0),suomi_npp:new Qn(0,0,Math.PI/2)},c0="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";function u0(e){const t=e.toUpperCase();return t.includes("TERRA")?["terra"]:t.includes("AQUA")?["aqua"]:t.includes("NOAA")||t.includes("J1")||t.includes("J2")?["noaa_20","suomi_npp"]:["suomi_npp"]}function h0(e,t){const a=Math.sin(e*127.1+t*311.7)*43758.5453;return a-Math.floor(a)}function d0(){const a=new Uint8Array(65536);for(let i=0;i<64;i++)for(let o=0;o<256;o++){const l=o%16,u=i%16,r=l===0||u===0,c=l===8,h=.86+.14*h0(Math.floor(o/16),Math.floor(i/16)),p=(i*256+o)*4;a[p]=Math.round((r?118:c?40:7)*h),a[p+1]=Math.round((r?124:c?52:14)*h),a[p+2]=Math.round((r?138:c?88:46)*h),a[p+3]=255}const s=new aa(a,256,64,At,Ut);return s.colorSpace=nt,s.wrapS=ai,s.wrapT=ai,s.magFilter=ze,s.minFilter=Ga,s.generateMipmaps=!0,s.anisotropy=8,s.needsUpdate=!0,s}function f0(e){const t=new ci,a=new yt({side:Qs,depthWrite:!1,vertexShader:`
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
    `}),s=new ga(new Cu(10,32,16),a);t.add(s);const i=new Uh(e),o=i.fromScene(t,.03);return i.dispose(),s.geometry.dispose(),a.dispose(),o}function cr(e,t,a){e.onBeforeCompile=s=>{s.uniforms.uFoilScale={value:t},s.uniforms.uFoilStrength={value:a},s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
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
        }`)},e.customProgramCacheKey=()=>"isogon-foil"}class m0{constructor(){A(this,"cells",d0())}make(t,a={}){const s=a.map??null,i=new Vh({flatShading:a.flat===!0}),o=a.crinkleScale??26;switch(t){case"foilGold":i.color.setRGB(1,.62,.18),i.metalness=1,i.roughness=.3,cr(i,o,.24);break;case"foilSilver":i.color.setRGB(.9,.91,.93),i.metalness=1,i.roughness=.32,cr(i,o,.2);break;case"foilBlack":i.color.setRGB(.035,.035,.04),i.metalness=.75,i.roughness=.42,cr(i,o,.22);break;case"solar":i.color.setRGB(1,1,1),i.metalness=.55,i.roughness=.22,i.map=s??this.cells,s&&i.color.setRGB(.42,.46,.62);break;case"radiator":i.color.setRGB(.84,.87,.92),i.metalness=.92,i.roughness=.16;break;case"paintWhite":i.color.setRGB(.86,.87,.88),i.metalness=.05,i.roughness=.55;break;case"paintGrey":i.color.setRGB(.3,.31,.33),i.metalness=.45,i.roughness=.5;break;case"dark":i.color.setRGB(.03,.032,.036),i.metalness=.6,i.roughness=.5;break}return s&&t!=="solar"&&(i.map=s,i.color.setRGB(1,1,1),(t==="foilGold"||t==="foilSilver")&&(i.metalness=.82)),i}dispose(){this.cells.dispose()}}function su(e){const t=e.toLowerCase();return t.includes("gold")?"foilGold":t.includes("silver")?"foilSilver":t.includes("krinkle")||t.includes("kapton")?"foilBlack":t.includes("solar")||t.includes("shiny_panel")?"solar":t==="side panels"?"radiator":t.includes("dish")?"paintWhite":t.includes("thruster")?"dark":t.includes("hardware")||t.includes("grey")||t.includes("gray")?"paintGrey":null}function p0(e){const t=e.getAttribute("position");if(!t||e.getAttribute("uv"))return;e.computeBoundingBox();const a=e.boundingBox,s=a.getSize(new U),i=[0,1,2].sort((c,h)=>s.getComponent(h)-s.getComponent(c)),[o,l]=i,u=Math.max(s.getComponent(l)/12,1e-6),r=new Float32Array(t.count*2);for(let c=0;c<t.count;c++)r[c*2]=(t.getComponent(c,o)-a.min.getComponent(o))/(u*16),r[c*2+1]=(t.getComponent(c,l)-a.min.getComponent(l))/(u*4);e.setAttribute("uv",new ua(r,2))}function v0(e,t){const a=new Lu().setFromObject(e),i=26/Math.max(...a.getSize(new U).toArray(),1e-6),o=new Map,l=new Set;e.traverse(u=>{const r=u;if(!r.isMesh)return;const c=!r.geometry.getAttribute("normal"),h=p=>{var S;const x=o.get(p);if(x)return x;const y=p,M=su(p.name),E=(S=y.map)==null?void 0:S.image,g=y.map&&r.geometry.getAttribute("uv")&&((E==null?void 0:E.width)??0)>4?y.map:null;let m=p;return M?m=t.make(M,{flat:c,map:g,crinkleScale:i}):y.isMeshStandardMaterial&&!g&&(m=t.make("paintGrey",{flat:c})),m!==p&&(m.name=p.name,l.add(p),y.map&&y.map!==g&&y.map.dispose()),o.set(p,m),m};Array.isArray(r.material)?r.material=r.material.map(h):(su(r.material.name)==="solar"&&p0(r.geometry),r.material=h(r.material))});for(const u of l)u.dispose()}function iu(e,t){const a=new si,s=t.make("foilGold"),i=t.make("foilSilver"),o=t.make("paintWhite"),l=t.make("dark"),u=t.make("solar"),r=(x,y,M,E,g)=>{const m=new ga(x,y);return m.position.set(M,E,g),a.add(m),m},c=e==="modis"?.42:.32;r(new _i(c,.17,.18),s,0,0,0),r(new _i(c*.86,.035,.15),i,0,-.1,0),r(new Jn(.045,.055,.07,24),l,c*.18,-.145,0),r(new _i(.1,.05,.1),o,-c*.25,-.135,0),r(new _i(c*.5,.012,.14),o,-c*.1,.092,0),r(new Jn(.006,.006,.1,8),i,c*.3,.13,.04);const h=r(new Yh(.05,.03,24,1,!0),o,c*.3,.19,.04);h.rotation.x=Math.PI,h.material.side=_s;const p=r(new Jn(.007,.007,.16,8),i,0,0,.17);p.rotation.x=Math.PI/2;for(let x=0;x<3;x++){const y=new _i(.2,.008,.2),M=y.getAttribute("uv");for(let g=0;g<M.count;g++)M.setXY(g,M.getX(g)*6/16,M.getY(g)*6/4);const E=r(y,u,0,0,.36+x*.208);E.rotation.z=-.35}return a}function ur(e,t){const a=new si;t&&e.rotation.copy(t),a.add(e),a.updateMatrixWorld(!0);const s=new Lu().setFromObject(a),i=s.getSize(new U),o=s.getCenter(new U),l=Math.max(i.x,i.y,i.z,1e-6);e.position.sub(o);const u=new si;return u.add(a),u.scale.setScalar(t0/l),u}function hr(e){const t=new Set,a=new Set,s=new Set;e.traverse(i=>{const o=i;o.geometry&&t.add(o.geometry);const l=Array.isArray(o.material)?o.material:o.material?[o.material]:[];for(const u of l){a.add(u);const r=u;for(const c of[r.map,r.normalMap,r.roughnessMap,r.metalnessMap,r.emissiveMap,r.aoMap])c&&s.add(c)}});for(const i of t)i.dispose();for(const i of a)i.dispose();for(const i of s){const o=i.image;o&&typeof o.close=="function"&&o.close(),i.dispose()}}function dr(e){const t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}class g0{constructor(t){A(this,"group",new si);A(this,"strips",{modis:{alongTrackKm:0,strength:0},viirs:{alongTrackKm:0,strength:0}});A(this,"look",new m0);A(this,"templates",new Map);A(this,"rigs",[]);A(this,"draco",null);A(this,"disposed",!1);A(this,"pos",new U);A(this,"xAxis",new U);A(this,"yAxis",new U(0,1,0));A(this,"zAxis",new U);A(this,"basis",new qs);this.templates.set("procedural-modis",ur(iu("modis",this.look),null)),this.templates.set("procedural-viirs",ur(iu("viirs",this.look),null));for(let a=0;a<t;a++)this.rigs.push(this.buildRig(a))}buildRig(t){const a=new si;a.visible=!1;const s=new si;a.add(s);const i=M=>{const E=new Wo;return E.setAttribute("position",new ua(new Float32Array(M*3),3)),E.setAttribute("color",new ua(new Float32Array(M*4),4)),E},o=()=>new Wh({transparent:!0,opacity:0,depthWrite:!1,vertexColors:!0}),l=o(),u=new Bh(i(rr),l),r=o(),c=new Oh(i(6),r);for(const M of[u,c])M.frustumCulled=!1,a.add(M);const h=i(Vs+1),p=[];for(let M=0;M<Vs-1;M++)p.push(0,1+M,2+M);h.setIndex(p);const x=new Hh({transparent:!0,opacity:0,side:_s,depthWrite:!1,blending:Gh,vertexColors:!0}),y=new ga(h,x);return y.frustumCulled=!1,a.add(y),this.group.add(a),{root:a,craft:s,craftKey:"",along:-1.4+t*.9,passKey:"",track:u,trackMat:l,rays:c,raysMat:r,fan:y,fanMat:x}}async loadModels(t){const a=t.endsWith("/")?t:`${t}/`;let s=[];try{const c=await fetch(`${a}models/spacecraft/manifest.json`);if(!c.ok)return;const h=await c.json();s=Array.isArray(h.models)?h.models:[]}catch{return}const[{GLTFLoader:i},{DRACOLoader:o}]=await Promise.all([Ac(()=>import("./GLTFLoader-C8Ag2Ruc.js"),__vite__mapDeps([0,1])),Ac(()=>import("./DRACOLoader-LNaB3iNp.js"),__vite__mapDeps([2,1]))]);if(this.disposed)return;const l=new Kh;l.setURLModifier(c=>/\.tga(\?|$)/i.test(c)?c0:c);const u=new o(l);u.setDecoderPath({js:e0,wasm:Jm}),this.draco=u;const r=new i(l);r.setDRACOLoader(u),await Promise.all(s.map(async c=>{if(!(typeof c.id!="string"||typeof c.url!="string"))try{const h=await r.loadAsync(`${a}${c.url.replace(/^\/+/,"")}`);if(this.disposed){hr(h.scene);return}v0(h.scene,this.look),this.templates.set(c.id,ur(h.scene,l0[c.id]??null))}catch{}}))}resolveTemplate(t){for(const s of u0(t.sensorLabel)){const i=this.templates.get(s);if(i)return{key:s,template:i}}const a=`procedural-${t.family}`;return{key:a,template:this.templates.get(a)}}update(t,a){this.strips.modis.strength=0,this.strips.viirs.strength=0;const s=a.sky>.004||a.strip>.004,[i,o,l]=a.unitsPerMetre,u=a.slabWidth*.5,r=a.slabDepth*.5,c=a.sampleTerrainY(.5,.5);for(let h=0;h<this.rigs.length;h++){const p=this.rigs[h],x=t[h];if(!x||!s){p.root.visible=!1;continue}p.root.visible=!0;const{key:y,template:M}=this.resolveTemplate(x);p.craftKey!==y&&(p.craft.clear(),p.craft.add(M.clone(!0)),p.craftKey=y);const E=r0[x.family],g=x.azimuthDeg*au,m=Math.min(E.maxScanDeg,Math.abs(x.scanAngleDeg))*au,S=(ui+E.altitudeKm)/ui,_=Math.min(.999,S*Math.sin(m)),F=Math.sqrt(1-_*_),P=Math.sin(g),N=-Math.cos(g);let D=P*_*i,T=F*o,B=N*_*l;const K=Math.hypot(D,T,B)||1,G=o0[x.family];D=D/K*G,T=T/K*G,B=B/K*G;let q=Math.cos(g),he=Math.sin(g);const oe=x.orbitNode?x.orbitNode==="descending":x.sensorLabel.toUpperCase().includes("TERRA");he>0!==oe&&(q=-q,he=-he);const ye=`${x.sensorLabel}|${x.azimuthDeg}|${x.scanAngleDeg}|${x.orbitNode??""}`;p.passKey!==ye&&(p.passKey!==""&&(p.along=-.6),p.passKey=ye),p.along+=i0*Math.min(.1,Math.max(0,a.dtSec)),p.along>lr&&(p.along-=2*lr);const Me=p.along,_e=dr((lr-Math.abs(Me))/s0),ue=this.pos.set(D+q*Me,c+T,B+he*Me);this.xAxis.set(q,0,he),this.zAxis.crossVectors(this.xAxis,this.yAxis).normalize(),this.basis.makeBasis(this.xAxis,this.yAxis,this.zAxis),p.craft.quaternion.setFromRotationMatrix(this.basis),p.craft.position.copy(ue);const Ye=dr(a.sky*1.15)*_e;p.craft.visible=Ye>.002,p.craft.scale.setScalar(Math.max(Ye,1e-4));const ve=n0[x.family],ee=p.track.geometry.getAttribute("position"),st=p.track.geometry.getAttribute("color");for(let Ce=0;Ce<rr;Ce++){const Le=Ce/(rr-1)*2-1,rt=Le*a0;ee.setXYZ(Ce,D+q*rt,c+T,B+he*rt);const Ka=dr((1-Math.abs(Le))/.3),Ca=Me-rt,rs=Ca>=0?Math.exp(-Ca/1.6):Math.exp(Ca/.12);st.setXYZW(Ce,ve.r,ve.g,ve.b,Ka*(.3+.7*rs*_e))}ee.needsUpdate=!0,st.needsUpdate=!0,p.trackMat.opacity=.8*a.sky,p.track.visible=a.sky>.004;const Z=a.sky*_e,v=a.strip*_e;let ut=-1e9,Nt=1e9;if(Math.abs(P)>1e-5){const Ce=(ue.x-u)/P,Le=(ue.x+u)/P;ut=Math.max(ut,Math.min(Ce,Le)),Nt=Math.min(Nt,Math.max(Ce,Le))}else Math.abs(ue.x)>u&&(Nt=-1e9);if(Math.abs(N)>1e-5){const Ce=(ue.z-r)/N,Le=(ue.z+r)/N;ut=Math.max(ut,Math.min(Ce,Le)),Nt=Math.min(Nt,Math.max(Ce,Le))}else Math.abs(ue.z)>r&&(Nt=-1e9);if(x.groundStrip&&v>.004){const Ce=this.strips[x.family],Le=ue.x/(i*1e3),rt=ue.z/(l*1e3);Ce.alongTrackKm=Le*Math.cos(g)+rt*Math.sin(g),Ce.strength=v}const Bt=Z>.004&&Nt>ut+.05;if(p.rays.visible=Bt,p.fan.visible=Bt,!Bt)continue;const Gt=p.fan.geometry.getAttribute("position"),da=p.fan.geometry.getAttribute("color"),jt=ue.y-.04;Gt.setXYZ(0,ue.x,jt,ue.z),da.setXYZW(0,ve.r,ve.g,ve.b,1);for(let Ce=0;Ce<Vs;Ce++){const Le=ut+(Nt-ut)*Ce/(Vs-1),rt=ue.x-P*Le,Ka=ue.z-N*Le,Ca=k.clamp(rt/a.slabWidth+.5,0,1),rs=k.clamp(.5-Ka/a.slabDepth,0,1);Gt.setXYZ(Ce+1,rt,a.sampleTerrainY(Ca,rs)+.02,Ka),da.setXYZW(Ce+1,ve.r,ve.g,ve.b,.12)}Gt.needsUpdate=!0,da.needsUpdate=!0,p.fanMat.opacity=.04*Z;const at=p.rays.geometry.getAttribute("position"),ht=p.rays.geometry.getAttribute("color"),qt=[1,1+Math.floor(Vs/2),Vs];for(let Ce=0;Ce<3;Ce++)at.setXYZ(Ce*2,ue.x,jt,ue.z),at.setXYZ(Ce*2+1,Gt.getX(qt[Ce]),Gt.getY(qt[Ce]),Gt.getZ(qt[Ce])),ht.setXYZW(Ce*2,ve.r,ve.g,ve.b,1),ht.setXYZW(Ce*2+1,ve.r,ve.g,ve.b,Ce===1?.25:.5);at.needsUpdate=!0,ht.needsUpdate=!0,p.raysMat.opacity=.6*Z}}dispose(){var t;this.disposed=!0,(t=this.draco)==null||t.dispose();for(const a of this.templates.values())hr(a);hr(this.group),this.look.dispose()}}const eh=64;function x0(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=t;return a=Math.imul(a^a>>>15,a|1),a^=a+Math.imul(a^a>>>7,a|61),((a^a>>>14)>>>0)/4294967296}}function fr(e,t){const a=new Float32Array(e*e*e);for(let o=0;o<a.length;o++)a[o]=t();const s=e-1,i=e*e;return(o,l,u)=>{const r=o*e,c=l*e,h=u*e,p=Math.floor(r),x=Math.floor(c),y=Math.floor(h),M=r-p,E=c-x,g=h-y,m=M*M*M*(M*(M*6-15)+10),S=E*E*E*(E*(E*6-15)+10),_=g*g*g*(g*(g*6-15)+10),F=p&s,P=p+1&s,N=(x&s)*e,D=(x+1&s)*e,T=(y&s)*i,B=(y+1&s)*i,K=a[T+N+F],G=a[T+N+P],q=a[T+D+F],he=a[T+D+P],oe=a[B+N+F],ye=a[B+N+P],Me=a[B+D+F],_e=a[B+D+P],ue=K+(G-K)*m,Ye=q+(he-q)*m,ve=oe+(ye-oe)*m,ee=Me+(_e-Me)*m,st=ue+(Ye-ue)*S,Z=ve+(ee-ve)*S;return st+(Z-st)*_}}function mr(e,t){const a=new Float32Array(e*e*e*3);for(let i=0;i<a.length;i++)a[i]=t();const s=e-1;return(i,o,l)=>{const u=i*e,r=o*e,c=l*e,h=Math.floor(u),p=Math.floor(r),x=Math.floor(c);let y=9;for(let M=-1;M<=1;M++){const E=(x+M&s)*e,g=x+M-c;for(let m=-1;m<=1;m++){const S=(E+(p+m&s))*e,_=p+m-r;for(let F=-1;F<=1;F++){const P=(S+(h+F&s))*3,N=h+F+a[P]-u,D=_+a[P+1],T=g+a[P+2],B=N*N+D*D+T*T;B<y&&(y=B)}}}return Math.min(1,Math.sqrt(y))}}let pr=null;function w0(){if(pr)return pr;const e=eh,t=x0(1377799),a=fr(4,t),s=fr(8,t),i=fr(16,t),o=mr(4,t),l=mr(8,t),u=mr(16,t),r=new Uint8Array(e*e*e*4),c=1/e;let h=0;for(let p=0;p<e;p++){const x=(p+.5)*c;for(let y=0;y<e;y++){const M=(y+.5)*c;for(let E=0;E<e;E++){const g=(E+.5)*c,m=a(g,M,x)*.5+s(g,M,x)*.3+i(g,M,x)*.2,S=1-o(g,M,x),_=1-l(g,M,x),F=1-u(g,M,x),P=Math.min(1,Math.max(0,m*.62+S*.46-.06)),N=Math.min(1,Math.max(0,_*.62+F*.38));r[h]=Math.round(P*255),r[h+1]=Math.round(N*255),r[h+2]=Math.round(m*255),r[h+3]=255,h+=4}}}return pr=r,r}function M0(){const e=eh,t=new $h(w0(),e,e,e);return t.format=At,t.type=Ut,t.minFilter=ze,t.magFilter=ze,t.wrapS=ai,t.wrapT=ai,t.wrapR=ai,t.unpackAlignment=1,t.needsUpdate=!0,t}const Ys=256,y0=256;function b0(e,t,a,s,i){const o=y0,l=new Float32Array(o*o);for(let M=0;M<o;M++){const E=Math.min(t-1,Math.round(M/(o-1)*(t-1)));for(let g=0;g<o;g++){const m=Math.min(t-1,Math.round(g/(o-1)*(t-1)));l[M*o+g]=a(e[E*t+m])}}const u=5,r=new Float32Array(o*o),c=new Float32Array(o*o);for(let M=0;M<o;M++)for(let E=0;E<o;E++){let g=0;for(let m=-u;m<=u;m++)g+=l[M*o+Math.min(o-1,Math.max(0,E+m))];r[M*o+E]=g/(2*u+1)}for(let M=0;M<o;M++)for(let E=0;E<o;E++){let g=0;for(let m=-u;m<=u;m++)g+=r[Math.min(o-1,Math.max(0,M+m))*o+E];c[M*o+E]=g/(2*u+1)}const h=new Uint16Array(o*o*4),p=s/(o-1),x=i/(o-1);for(let M=0;M<o;M++){const E=Math.max(0,M-2),g=Math.min(o-1,M+2);for(let m=0;m<o;m++){const S=Math.max(0,m-2),_=Math.min(o-1,m+2),F=(c[M*o+_]-c[M*o+S])/((_-S)*p),P=(c[g*o+m]-c[E*o+m])/((g-E)*x),N=Math.hypot(F,P),D=N>1e-5?Math.min(1,N*1.6)/N:0,T=(M*o+m)*4;h[T]=ya.toHalfFloat(l[M*o+m]),h[T+1]=ya.toHalfFloat(F*D),h[T+2]=ya.toHalfFloat(P*D),h[T+3]=ya.toHalfFloat(c[M*o+m])}}const y=new aa(h,o,o,At,Pa);return y.minFilter=ze,y.magFilter=ze,y.wrapS=Ve,y.wrapT=Ve,y.generateMipmaps=!1,y.flipY=!1,y.needsUpdate=!0,y}const Pi=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,S0=`
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
  float s = max(0.0, z - ${Oi.toFixed(4)}) / ${(1-Oi).toFixed(4)};
  gl_FragColor = vec4(clamp(s * 1.6, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`,T0=`
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
`,th=`
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
`,E0=`
${th}
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
`,R0=`
${th}
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
`,A0=`
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
`,k0=.62,_0=.88;class ah extends ha{constructor(){super("SmokePass");A(this,"shadowTarget");A(this,"sourceTarget");A(this,"smokeTarget");A(this,"historyTarget");A(this,"historyValid",!1);A(this,"frame",0);A(this,"lastTime",-1);A(this,"prevViewProj",new qs);A(this,"viewProj",new qs);A(this,"noiseTexture");A(this,"plumeTarget");A(this,"sourceMaterial");A(this,"plumeMaterial");A(this,"shadowMaterial");A(this,"marchMaterial");A(this,"compositeMaterial");A(this,"densityUniforms");A(this,"lastSourceRenderer",null);A(this,"lastSourceSig",new Float64Array(6).fill(Number.NaN));A(this,"lastPlumeRenderer",null);A(this,"lastPlumeSig",new Float64Array(15).fill(Number.NaN));this.needsDepthTexture=!0,this.needsSwap=!0,this.noiseTexture=M0(),this.sourceTarget=new Ht(Ys,Ys,{format:At,type:Pa,depthBuffer:!1,stencilBuffer:!1,minFilter:Ga,magFilter:ze,generateMipmaps:!0}),this.sourceTarget.texture.colorSpace=Ia,this.plumeTarget=new Ht(Ys,Ys,{format:At,type:Pa,depthBuffer:!1,stencilBuffer:!1,minFilter:Ga,magFilter:ze,generateMipmaps:!0}),this.plumeTarget.texture.colorSpace=Ia,this.shadowTarget=new Ht(Ys,Ys,{format:At,type:Ut,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1}),this.shadowTarget.texture.colorSpace=Ia;const a=()=>new Ht(2,2,{format:At,type:Pa,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1});this.smokeTarget=a(),this.historyTarget=a(),this.densityUniforms={uHeightPrev:{value:null},uHeightNext:{value:null},uMorph:{value:1},uSourceTex:{value:this.sourceTarget.texture},uPlumeTex:{value:this.plumeTarget.texture},uNoiseTex:{value:this.noiseTexture},uSlabSize:{value:new Ne(14.8,10.8)},uSmokeTop:{value:k0},uWindUv:{value:new Ne(.7,.7)},uTime:{value:0},uOpacity:{value:1},uCutawayMix:{value:0},uCutawayPlane:{value:0},uCutawayDir:{value:new Ne(1,0)},uClearCenter:{value:new U},uClearRadius:{value:0},uThinOverFire:{value:0},uLid:{value:new va(0,1,0,-1e4)},uLidAmount:{value:0},uSunDir:{value:new U(0,1,0)},uSigma:{value:4.6}};const s={depthTest:!1,depthWrite:!1,toneMapped:!1};this.sourceMaterial=new yt({...s,vertexShader:Pi,fragmentShader:S0,uniforms:{uField0:{value:null},uField1:{value:null},uDetection0:{value:null},uDetection1:{value:null},uRealSource:{value:0},uFrameMix:{value:0}}}),this.plumeMaterial=new yt({...s,vertexShader:Pi,fragmentShader:T0,uniforms:{uSourceTex:this.densityUniforms.uSourceTex,uHeightPrev:this.densityUniforms.uHeightPrev,uHeightNext:this.densityUniforms.uHeightNext,uMorph:this.densityUniforms.uMorph,uWindUv:this.densityUniforms.uWindUv,uSmokeTop:this.densityUniforms.uSmokeTop,uSlabSize:this.densityUniforms.uSlabSize,uLid:this.densityUniforms.uLid,uLidAmount:this.densityUniforms.uLidAmount}}),this.shadowMaterial=new yt({...s,vertexShader:Pi,fragmentShader:E0,uniforms:this.densityUniforms}),this.marchMaterial=new yt({...s,vertexShader:Pi,fragmentShader:R0,uniforms:{...this.densityUniforms,uDepthTex:{value:null},uProjInv:{value:new qs},uViewInv:{value:new qs},uCameraPos:{value:new U},uBoxTop:{value:4},uSunColor:{value:new U(1.4,1.29,1.17)},uNight:{value:0},uFireLight:{value:1},uStepFine:{value:.075},uHistoryTex:{value:null},uPrevViewProj:{value:new qs},uHistoryWeight:{value:0},uFrame:{value:0},uProxyY:{value:1},uHalfSize:{value:new Ne(2,2)}}}),this.compositeMaterial=new yt({...s,vertexShader:Pi,fragmentShader:A0,uniforms:{uSceneTex:{value:null},uSmokeTex:{value:this.smokeTarget.texture},uDepthTex:{value:null},uHalfSize:{value:new Ne(2,2)},uNear:{value:.1},uFar:{value:100}}}),this.fullscreenMaterial=this.compositeMaterial}setDepthTexture(a){this.marchMaterial.uniforms.uDepthTex.value=a,this.compositeMaterial.uniforms.uDepthTex.value=a}setSize(a,s){const i=Math.max(2,Math.ceil(a/2)),o=Math.max(2,Math.ceil(s/2));this.smokeTarget.setSize(i,o),this.historyTarget.setSize(i,o),this.historyValid=!1,this.compositeMaterial.uniforms.uHalfSize.value.set(i,o),this.marchMaterial.uniforms.uHalfSize.value.set(i,o)}update(a){const s=this.densityUniforms;s.uHeightPrev.value=a.heightPrev,s.uHeightNext.value=a.heightNext,s.uMorph.value=a.morph,s.uSlabSize.value.set(a.slabWidth,a.slabDepth),s.uWindUv.value.copy(a.windUv).normalize(),s.uTime.value=a.time,s.uLid.value.copy(a.lid),s.uLidAmount.value=a.lidAmount,s.uClearCenter.value.setFromMatrixPosition(a.camera.matrixWorld),s.uClearRadius.value=a.clearRadius,s.uThinOverFire.value=a.thinOverFire,s.uOpacity.value=a.opacity,s.uCutawayMix.value=a.cutawayMix,s.uCutawayPlane.value=a.cutawayPlane,s.uCutawayDir.value.copy(a.cutawayDir),s.uSunDir.value.copy(a.sunDir);const i=this.sourceMaterial.uniforms;i.uField0.value=a.field0,i.uField1.value=a.field1,i.uDetection0.value=a.detection0??a.field0,i.uDetection1.value=a.detection1??a.field1,i.uRealSource.value=a.detection0&&a.detection1?1:0,i.uFrameMix.value=a.frameMix;const o=this.marchMaterial.uniforms,l=a.camera;o.uProjInv.value.copy(l.projectionMatrixInverse),o.uViewInv.value.copy(l.matrixWorld),o.uCameraPos.value.setFromMatrixPosition(l.matrixWorld),o.uSunColor.value.copy(a.sunColor),o.uNight.value=a.night??0,o.uFireLight.value=a.fireLight??1,o.uBoxTop.value=a.reliefTop+s.uSmokeTop.value+.05,o.uProxyY.value=.5*(a.reliefTop+s.uSmokeTop.value),(this.lastTime<0||a.time-this.lastTime>.25||a.time<this.lastTime)&&(this.historyValid=!1),this.lastTime=a.time,o.uPrevViewProj.value.copy(this.prevViewProj),this.viewProj.multiplyMatrices(l.projectionMatrix,l.matrixWorldInverse),this.prevViewProj.copy(this.viewProj),o.uHistoryWeight.value=this.historyValid?_0:0,o.uFrame.value=this.frame,this.frame=(this.frame+1)%4096;const u=this.compositeMaterial.uniforms;u.uNear.value=l.near,u.uFar.value=l.far}render(a,s,i){const o=this.scene,l=this.camera,u=this.sourceMaterial.uniforms,r=u.uRealSource.value>.5?1:0,c=r?u.uDetection0.value:u.uField0.value,h=r?u.uDetection1.value:u.uField1.value,p=c?c.id:-1,x=c?c.version:-1,y=h?h.id:-1,M=h?h.version:-1,E=u.uFrameMix.value,g=this.lastSourceSig,m=this.lastSourceRenderer!==a||g[0]!==r||g[1]!==p||g[2]!==x||g[3]!==y||g[4]!==M||g[5]!==E;m&&(this.fullscreenMaterial=this.sourceMaterial,a.setRenderTarget(this.sourceTarget),a.render(o,l),this.lastSourceRenderer=a,g[0]=r,g[1]=p,g[2]=x,g[3]=y,g[4]=M,g[5]=E);const S=this.densityUniforms,_=S.uMorph.value,F=_<.999?_:1,P=_<.999?S.uHeightPrev.value:null,N=S.uHeightNext.value,D=P?P.id:-1,T=P?P.version:-1,B=N?N.id:-1,K=N?N.version:-1,G=S.uWindUv.value,q=S.uSmokeTop.value,he=S.uSlabSize.value,oe=S.uLidAmount.value,ye=oe>0?oe:0,Me=S.uLid.value,_e=ye>0?Me.x:0,ue=ye>0?Me.y:0,Ye=ye>0?Me.z:0,ve=ye>0?Me.w:0,ee=this.lastPlumeSig;(m||this.lastPlumeRenderer!==a||ee[0]!==D||ee[1]!==T||ee[2]!==B||ee[3]!==K||ee[4]!==F||ee[5]!==G.x||ee[6]!==G.y||ee[7]!==q||ee[8]!==he.x||ee[9]!==he.y||ee[10]!==ye||ee[11]!==_e||ee[12]!==ue||ee[13]!==Ye||ee[14]!==ve)&&(this.fullscreenMaterial=this.plumeMaterial,a.setRenderTarget(this.plumeTarget),a.render(o,l),this.lastPlumeRenderer=a,ee[0]=D,ee[1]=T,ee[2]=B,ee[3]=K,ee[4]=F,ee[5]=G.x,ee[6]=G.y,ee[7]=q,ee[8]=he.x,ee[9]=he.y,ee[10]=ye,ee[11]=_e,ee[12]=ue,ee[13]=Ye,ee[14]=ve),this.fullscreenMaterial=this.shadowMaterial,a.setRenderTarget(this.shadowTarget),a.render(o,l);const Z=this.smokeTarget;this.smokeTarget=this.historyTarget,this.historyTarget=Z,this.marchMaterial.uniforms.uHistoryTex.value=this.historyTarget.texture,this.fullscreenMaterial=this.marchMaterial,a.setRenderTarget(this.smokeTarget),a.render(o,l),this.historyValid=!0,this.compositeMaterial.uniforms.uSmokeTex.value=this.smokeTarget.texture,this.compositeMaterial.uniforms.uSceneTex.value=s.texture,this.fullscreenMaterial=this.compositeMaterial,a.setRenderTarget(this.renderToScreen?null:i),a.render(o,l)}dispose(){this.lastSourceRenderer=null,this.lastSourceSig.fill(Number.NaN),this.lastPlumeRenderer=null,this.lastPlumeSig.fill(Number.NaN),this.sourceTarget.dispose(),this.plumeTarget.dispose(),this.shadowTarget.dispose(),this.smokeTarget.dispose(),this.historyTarget.dispose(),this.noiseTexture.dispose(),this.sourceMaterial.dispose(),this.plumeMaterial.dispose(),this.shadowMaterial.dispose(),this.marchMaterial.dispose(),this.compositeMaterial.dispose()}}A(ah,"sourceGrid",We);const Lr=2,ou=Ui*Bi,F0=.62,D0=1.75;function P0(e,t){const a=Math.max(1,e),s=Math.max(1,t),i=Math.min(D0,Math.max(F0,a/s)),o=Math.sqrt(ou*i),l=ou/o,u=o/(a*1e3),r=l/(s*1e3),c=Math.sqrt(u*r)*Lr;return{width:o,depth:l,unitsPerMetre:[u,c,r]}}function I0(e,t,a,s){const i=Math.max(350,a-t);return Math.min(i*1.15,Math.max(0,e-t))*s.unitsPerMetre[1]}const nu=.08,C0=.3,L0=3;function Ii(e){if(!e)return null;const{left:t,top:a,right:s,bottom:i}=e;if(![t,a,s,i].every(c=>Number.isFinite(c)))return null;const o=Math.min(1,Math.max(0,Math.min(t,s))),l=Math.min(1,Math.max(0,Math.max(t,s))),u=Math.min(1,Math.max(0,Math.min(a,i))),r=Math.min(1,Math.max(0,Math.max(a,i)));return l-o<nu||r-u<nu?null:{left:o,top:u,right:l,bottom:r}}function vr(e,t){return e===t?!0:!e||!t?!1:Math.abs(e.left-t.left)<1e-5&&Math.abs(e.top-t.top)<1e-5&&Math.abs(e.right-t.right)<1e-5&&Math.abs(e.bottom-t.bottom)<1e-5}const Mt=new Hr,ca=new U,Lt=new U,Do=new U,Es=new U;function N0(e,t,a,s,i,o,l,u){let r=Number.POSITIVE_INFINITY,c=Number.NEGATIVE_INFINITY,h=Number.POSITIVE_INFINITY,p=Number.NEGATIVE_INFINITY;Mt.fov=i,Mt.aspect=o,Mt.near=.1,Mt.far=200,Mt.clearViewOffset(),Mt.updateProjectionMatrix(),ca.set(a.target[0],a.target[1],a.target[2]);const x=s>1e-4?[-s,0,s]:[0];for(const F of x){const P=a.azimuth+F,N=Math.sin(a.polar);Mt.position.set(ca.x+a.distance*N*Math.sin(P),ca.y+a.distance*Math.cos(a.polar),ca.z+a.distance*N*Math.cos(P)),Mt.up.set(0,1,0),Mt.lookAt(ca),Mt.updateMatrixWorld(!0);for(let D=0;D<t;D++)Lt.set(e[D*3],e[D*3+1],e[D*3+2]).project(Mt),!(Lt.z>=1||Lt.z<=-1)&&(Lt.x<r&&(r=Lt.x),Lt.x>c&&(c=Lt.x),Lt.y<h&&(h=Lt.y),Lt.y>p&&(p=Lt.y))}if(!(c>r)||!(p>h))return u.scale=1,u.offsetX=0,u.offsetY=0,u;const y=(c-r)*.5,M=(p-h)*.5,E=(r+c)*.25+.5,g=.5-(h+p)*.25,m=l.right-l.left,S=l.bottom-l.top,_=Math.min(L0,Math.max(C0,Math.min(m/y,S/M)));return u.scale=_,u.offsetX=E*_-(l.left+l.right)*.5,u.offsetY=g*_-(l.top+l.bottom)*.5,u}const z0=.24,U0=.46,sh=.03;function ih(e){return Math.min(U0,Math.max(z0,e.bottom+sh))}function B0(e,t,a,s){Mt.fov=a,Mt.aspect=s,Mt.near=.1,Mt.far=200,Mt.clearViewOffset(),Mt.updateProjectionMatrix(),ca.set(e.target[0],e.target[1],e.target[2]);const i=Math.sin(e.polar);Mt.position.set(ca.x+e.distance*i*Math.sin(t),ca.y+e.distance*Math.cos(e.polar),ca.z+e.distance*i*Math.cos(t)),Mt.up.set(0,1,0),Mt.lookAt(ca),Mt.updateMatrixWorld(!0)}function O0(e,t,a,s,i,o,l,u){let r=Number.POSITIVE_INFINITY;const c=s>1e-4?[-s,0,s]:[0];for(const p of c){B0(a,a.azimuth+p,i,o);for(let x=0;x<t;x++){if(Lt.set(e[x*3],e[x*3+1],e[x*3+2]).project(Mt),Lt.z>=1||Lt.z<=-1)continue;const y=Lt.x*.5+.5;if(y<l.left-.04||y>l.right+.04)continue;const M=.5-Lt.y*.5;M<r&&(r=M)}}if(u.scale=1,u.offsetX=0,!Number.isFinite(r))return u.offsetY=0,u;const h=ih(l);return u.offsetY=Math.min(.1,Math.max(-.42,r-h)),u}function H0(e){return Math.min(e.bottom,ih(e)-sh)}function G0(e,t,a){const s=1-2*t;return Lt.set(-1,s,.5).unproject(e),ca.set(1,s,.5).unproject(e),Do.setFromMatrixPosition(e.matrixWorld),Lt.sub(Do),ca.sub(Do),Es.crossVectors(ca,Lt).normalize(),Es.y<0&&Es.negate(),a.set(Es.x,Es.y,Es.z,-Es.dot(Do))}function K0(e,t,a,s){if(Math.abs(s.scale-1)<4e-4&&Math.abs(s.offsetX)<4e-4&&Math.abs(s.offsetY)<4e-4){e.view!==null&&e.view.enabled&&e.clearViewOffset();return}e.setViewOffset(t*s.scale,a*s.scale,s.offsetX*t,s.offsetY*a,t,a)}const ru=wt.azimuth,W0=.62,Po=30,Io=.055,V0=[3.6,5,6.5,8],Y0=[90,180,300,450,650,900],$0=2,X0=2.5,j0=.05,q0=.6,gr=.14,$s=150,lu=.3,Z0=.03,Fa=19,Q0=1.7,J0=.6,cu={left:0,top:0,right:1,bottom:.34},ep=4,Xs=33,js=48,tp=3.2,Co=1.15,uu=6;function ap(e,t,a,s){return s.set(-t*Math.cos(e),-a*Math.sin(e)).normalize()}const hu=4,sp=4.4,ip=4.6,op=3.5,np=3.2,rp=111.32;function xr(e){return Math.max(1,(e[3]-e[1])*rp)}const du=-.11,lp=.065,ti=13,oh=5,cp=ti*ti+4+oh,Rs=24;function up(e){const t=e==null?void 0:e.held_out_passes_answered_by;return typeof(t==null?void 0:t.method)=="string"&&t.method!=="reconstruction"}let wr=null;function Mr(){return wr||(wr=new Uint8Array(Js*We*We*4)),wr}function yr(){return{source:"procedural_fallback",provenanceNote:"No run on show.",frames:Array.from({length:Js},()=>[])}}function hp(){const e=new aa(new Uint8Array([104,106,102,255]),1,1,At);return e.colorSpace=nt,e.needsUpdate=!0,e}function fu(e){return e.noRealGround?!1:(e.levelIsWater===void 0&&(e.levelIsWater=!Kr(e.alignedDem,e.demGridRes)),e.levelIsWater)}function dp(e){const t=e.toUpperCase();return t.includes("TERRA")?"MODIS_TERRA":t.includes("AQUA")?"MODIS_AQUA":t.includes("NOAA20")||t.includes("NOAA-20")||t.includes("JPSS")?"VIIRS_NOAA20":t.includes("SNPP")||t.includes("NPP")?"VIIRS_SNPP":null}function mu(){if(typeof window>"u")return null;const e=new URLSearchParams(window.location.search).get("film");return e==="record"||e==="estimate"||e==="test"||e==="play"||e==="auto"?e:null}function fp(e,t){const a=e.runId!==null&&t.has(e.runId);if(!e.missingFiles&&!a)return;const s=(e.missingFiles??[]).filter(o=>!(e.pack&&(o==="elevation"||o==="imagery"))),i=a?[...s,"estimate"]:s;return i.length>0?i:void 0}const mp=[];function br(e){return e.observerDataset.dataSource==="firms"?mp:e.callouts}function pp(e){const t=e.fieldScale??Zs;return{scale:t.kind==="linear"?"linear":"log",ticks:t.ticks??[0,.25,.5,.75,1].map(a=>({at:a,mwPerKm2:Nu(t,a)}))}}const vp=2.6,gp=9,xp=6,wp=9.5,Mp=.08,Sr=8,yp=1,bp=1.8,Sp=.05,Tp=12,pu=.12,vu=9,Ep=1.22,Tr=.94,Rp=5,gu=1.5,Ap=5,xu=2,wu=.8,Er=3,Rr=22,Mu=.75,yu=[1.1,.95,.8,.65],Ar=39,bu=.375,Su=.3,kp=.4,Tu=.43,_p=3,Fp=.3,Dp=24*3600*1e3,Pp=5,Ip=.25,Cp=50,Lp=15,Eu=.4,Ru=.375,Np=1.3,zp=1.9,Up=.044,Bp=1.08,Op=1.8,Hp=2,Gp=e=>typeof e=="number"&&e>0?k.clamp(Math.pow(Math.max(1,Up/e/Bp),Op),1,Hp):1,Kp=[.64,.76],Wp=.7,Vp=1.2,Yp=.02,$p=0,Xp=1;function jp(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Oo(e,Xp),1)}const qp=4,Zp=2500;function Qp(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Oo(e,qp),Oo(e,Zp))}const Jp=.45;function ev(e,t,a,s){if(e.dataSource!=="firms")return null;const[i,o,l,u]=t,r=Jp*Math.min(a,s);let c=-1,h=-1;return e.frames.forEach((p,x)=>{let y=0,M=!1,E=!1;const g=[],m=[];for(const D of p)if(!D.hidden){y+=D.footprints.length,D.family==="viirs"&&D.isDay===!1&&(M=!0),D.isDay===!1&&D.footprints.length>0&&(E=!0);for(const T of D.footprints)g.push((T.lon-i)/Math.max(1e-9,l-i)*a),m.push((T.lat-o)/Math.max(1e-9,u-o)*s)}if(y===0)return;g.sort((D,T)=>D-T),m.sort((D,T)=>D-T);const S=Math.floor(.05*(y-1)),_=Math.ceil(.95*(y-1)),P=Math.hypot(g[_]-g[S],m[_]-m[S])<=r,N=y+(E?1e5:0)+(E&&P?2e5:0)+(M?1e6:0)+(M&&P?1e7:0);N>h&&(h=N,c=x)}),c>=0?c:null}function tv(e){var s;const t=e.attribution,a=((s=e.context)==null?void 0:s.manifest.ortho.attribution)??"";return a&&a!==t?t?`${t}; ${a}`:a:t}function Au(e){return os.includes(e)}function Ha(e,t){return e.resolveAsset?e.resolveAsset(t):av(e.apiBase,t)}function ku(e){return`/isogon/${e}`}function av(e,t){if(t.startsWith("http://")||t.startsWith("https://")||t.startsWith("data:"))return t;const a=e.replace(/\/+$/,"");return t.startsWith("/")?`${a}${t}`:`${a}/${t}`}function Ci(e,t,a,s){const i=Math.min(1,Math.max(0,a))*(t-1),o=Math.min(1,Math.max(0,s))*(t-1),l=Math.floor(i),u=Math.floor(o),r=Math.min(t-1,l+1),c=Math.min(t-1,u+1),h=i-l,p=o-u,x=e[u*t+l],y=e[u*t+r],M=e[c*t+l],E=e[c*t+r],g=x+(y-x)*h,m=M+(E-M)*h;return g+(m-g)*p}const sv=new U(.075,.098,.135),nh=new U(-.56,.64,.52).normalize();function iv(e,t,a){const s=Kd(a),i=s?s.extent_km[0]:e,o=s?s.extent_km[1]:t,l=P0(i,o),u=nh.clone(),[r,c,h]=l.unitsPerMetre,p=new U(u.x/r,u.y/c,u.z/h).normalize();return s&&($d(s.sun.azimuth_deg,s.sun.elevation_deg,p),Xd(p,new U(r,c,h),u)),{widthKm:i,depthKm:o,frame:l,sunDir:u,sunTrue:p,packManifest:s}}const _u="Esri, Vantor, Earthstar Geographics, and the GIS User Community";function kr(e,t,a,s,i){const o=iv(e,t,a),l=o.widthKm/Math.max(64,s);return{widthKm:o.widthKm,depthKm:o.depthKm,frame:o.frame,sunDir:o.sunDir,sunTrue:o.sunTrue,orthoTexelKm:l,sharpen:1,shadow:null,packManifest:o.packManifest,packState:"none",pack:null,lite:null,context:null,contextState:"none",auxTex:null,detailTex:null,detailRect:[0,0,1,1],detailTexelKm:l,attribution:i}}function As(e,t){return I0(e,t.minElevM,t.maxElevM,t.frame)}function _r(e,t,a,s,i,o){return _d(e,t,i,o,{gridSize:We,zMaxMwKm2:vd,sigmaMaxMwKm2:gd},(l,u)=>Ci(a,s,l,u))}function cv(e){const t=Ct.useRef(null),a=Ct.useRef([null,null,null]),s=Ct.useRef([null,null,null]),i=Ct.useRef([null,null,null]),o=Ct.useRef(null),l=Ct.useRef(null),u=Ct.useRef(null),[r,c]=Ct.useState([]),h=Ct.useRef(new Map),p=Ct.useRef(new Set),x=Ct.useRef(e);x.current=e;const y=Ct.useRef(null);Ct.useEffect(()=>{const g=t.current;if(!g)return;let m=!1;if(!Fh())throw new kc("unavailable");let S;try{S=new Xh({antialias:!1,alpha:!1,depth:!1,powerPreference:"high-performance",stencil:!1})}catch(n){throw new kc("failed",n)}const _=qm(Xm());let F=tu();S.setPixelRatio(F),S.setClearColor(new Bo("#080b11"),1),S.domElement.style.width="100%",S.domElement.style.height="100%",S.domElement.style.display="block",g.appendChild(S.domElement);const P=Math.min(16,S.capabilities.getMaxAnisotropy()||4),N=new jh;N.setCrossOrigin("anonymous");const D=new ci,T=new Hr(39,16/9,.12,140),B=new Gm(S,D,T),K=new ah;B.insertScenePass(K);const G=new Set,q=n=>(n.smokeHeight||(n.smokeHeight=b0(n.alignedDem,n.demGridRes,f=>As(f,n),n.frame.width,n.frame.depth),G.add(n.smokeHeight)),n.smokeHeight);let he=1,oe=0;const ye=nh.clone(),Me=new qh(16775922,sp);Me.position.copy(ye).multiplyScalar(20),D.add(Me);const _e=f0(S);D.environment=_e.texture;const ue=new Map,Ye=new Map;for(const n of os){const f=Li[n],w=Fc(n,256),d=ks(w,!1),R=Dc(n,d.aligned,d.gridRes,d.minElev,d.maxElev,P),b=Mr(),L=_r(n,f.bbox,d.aligned,d.gridRes,b,Js);ue.set(n,{key:`proc-${n}`,regionId:n,runId:null,noRealGround:!0,noRealPicture:!0,demTex:d.texture,alignedDem:d.aligned,demGridRes:d.gridRes,minElevM:d.minElev,maxElevM:d.maxElev,satTex:R,orthoLabel:"drawn stand-in",demLabel:"512²",tensor:b,frameCount:Js,bbox:[...f.bbox],windDirUv:[...f.windDirUv],hasSeaCoast:f.hasSeaCoast,observerDataset:yr(),findings:L.anchors,callouts:L.callouts,fireHistory:null,...kr(f.widthKm,xr(f.bbox),null,512,"")})}const ve=S.extensions.has("OES_texture_float_linear"),ee=n=>(n.fireHistory||(n.fireHistory=qd(n.tensor,n.frameCount,ve)),n.fireHistory),st=x.current.activeTheaterId;let Z=ue.get(st)??ue.get("plumas_ca"),v=Z;const ut=[],Nt=n=>{n&&!ut.includes(n)&&ut.push(n)},Bt=()=>{const n=new Set,f=w=>{w&&(n.add(w),w.lite&&n.add(w.lite))};f(Z),f(v);for(const w of ue.values())f(w);for(const w of Ye.values())f(w);for(const w of Sa.values())f(w);return n},Gt=()=>{var d,R;if(ut.length===0)return;const n=Bt(),f=new Set;for(const b of n)f.add(b.demTex),f.add(b.satTex),f.add((d=b.fireHistory)==null?void 0:d.texture),f.add(b.shadow),f.add(b.smokeHeight);const w=b=>{!b||f.has(b)||(f.add(b),b.dispose())};for(const b of ut)n.has(b)||(w(b.demTex),w(b.satTex),w((R=b.fireHistory)==null?void 0:R.texture),w(b.shadow),b.smokeHeight&&(G.delete(b.smokeHeight),w(b.smokeHeight)),b.fireHistory=null,b.shadow=null,b.smokeHeight=null,b.detectionSource=null);for(let b=ut.length-1;b>=0;b--){const L=ut[b];L===Z||L===v||L===Z.lite||L===v.lite||ut.splice(b,1)}},da=(n,f)=>{const w=ue.get(n);ue.set(n,f),w&&w!==f&&Nt(w)},jt=n=>{const f=Ye.get(n);return f&&(Ye.delete(n),Ye.set(n,f)),f},at=(n,f,w)=>{for(da(n,w),Ye.set(f,w);Ye.size>ep;){const d=Ye.keys().next().value,R=Ye.get(d);Ye.delete(d),Nt(R)}};c(br(v));const ht=new Uint8Array(We*We*4),qt=new Uint8Array(We*We*4),Ce=n=>{const f=new aa(n,We,We,At,Ut);return f.minFilter=Ga,f.magFilter=ze,f.generateMipmaps=!0,f.wrapS=Ve,f.wrapT=Ve,f.flipY=!1,f.needsUpdate=!0,f},Le=Ce(ht),rt=Ce(qt),Ka=wd();let Ca=-1,rs=-1,Hi=null;const hi=We*We,Yr=()=>{const n=new aa(new Uint8Array(hi),We,We,Fu,Ut);return n.minFilter=ze,n.magFilter=ze,n.generateMipmaps=!1,n.flipY=!1,n.needsUpdate=!0,n},Gi=Yr(),Ki=Yr();let $r="",Xr="";const rh=(n,f,w)=>{const d=n.detectionSource??(n.detectionSource=bf(n.observerDataset.frames,n.frameCount,n.bbox,[n.widthKm,n.depthKm],We)),R=`${n.key}:${f}`;R!==$r&&(Gi.image.data.set(d.subarray(f*hi,(f+1)*hi)),Gi.needsUpdate=!0,$r=R);const b=`${n.key}:${w}`;b!==Xr&&(Ki.image.data.set(d.subarray(w*hi,(w+1)*hi)),Ki.needsUpdate=!0,Xr=b)},Wi=new wf,oa=new Sf,jr=h.current,qr={value:0},qo={value:0},Zr={value:0},Qr={value:0};let Zo=null,Jr="";const Qo=new Ne(0,0),el=Array.from({length:64},()=>new va(0,0,0,0)),Jo={value:-1};let Vi=null;const en=[];let tn=1;const Wa=new va(0,1,0,0);let tl=-1e9,al="",an=[];const sl=new Ne(0,0),il=new U(0,Zs.maxMwKm2,Zs.minMwKm2),ol=new Ne(.02,1),Yi=new Ne(.02,1),nl={value:0},Cs=new Ne(0,0),sn={value:0},on={value:0},rl={value:1},$i=new Map;let Xi=!1,nn;const Ls=new va(0,1,1e4,.4);let ll=0,cl=0,ul=-1e9;const rn={value:0},Va={value:0};let ln="",Ns=[],ji=0,qi=0,cn=!1,di,hl="",dl="",fl=!1;const un={value:0},fi={value:1};let hn,ls="";const cs=[],zs=[],Zi=[],mi={value:0},Ya={value:1},dn={value:0};let ml="",pl=!1,Qi,pi="",vi="detections",dt=new Float32Array(0),us={patchOf:new Uint16Array(0),sizes:[]};const Qe=new Float64Array(Sr*7),hs=new Float64Array(Sr*3);let gi=!1,Ji="";const Kt=new Float64Array(38).fill(Number.NaN);let xi=null;const vl=(n,f,w)=>{const R=Math.min(1,Math.max(0,w))*Math.max(1,f-1),b=Math.min(f-1,Math.floor(R)),L=Math.min(f-1,b+1),te=R-b,Q=We*We*4;return(Hi!==n||Ca!==b)&&(ht.set(n.subarray(b*Q,(b+1)*Q)),Le.needsUpdate=!0,Ca=b),(Hi!==n||rs!==L)&&(qt.set(n.subarray(L*Q,(L+1)*Q)),rt.needsUpdate=!0,rs=L),Hi=n,te},lh=vl(v.tensor,v.frameCount,x.current.timeProgress),wi=new pd,eo=v.sunTrue.clone(),fn=new U(1.4,1.29,1.17),gl=new U(.9,.8,.66),xl=n=>{const f=(n.minElevM+n.maxElevM)*5e-4;eo.copy(n.sunTrue),cd(f,n.sunTrue.y,fn),gl.fromArray(Ou(f,n.sunTrue.y))};xl(v);const wl={value:0},$a={uNight:wl,uSkyView:{value:wi.skyView.texture},uTransmittanceLut:{value:wi.transmittance},uSunTrue:{value:eo},uCamAltKm:{value:8},uVerticalExaggeration:{value:Lr},uFloorColor:{value:new U(.044,.06,.094)},uFloorHaze:{value:.3},uSkyExposure:{value:er}},Ml=new Cu(62,48,32),yl=new yt({vertexShader:fd,fragmentShader:md,uniforms:$a,side:Qs,depthWrite:!1}),mn=new ga(Ml,yl);mn.renderOrder=-10,D.add(mn);const pn=new Ne(v.frame.width,v.frame.depth),bl=new Ne(Z.frame.unitsPerMetre[1],v.frame.unitsPerMetre[1]),vn=new Ko(34,34,1,1);vn.rotateX(-Math.PI/2);const gn=new yt({vertexShader:Sd,fragmentShader:Td,uniforms:{uSlabSize:{value:pn},uShadowMix:{value:1}},transparent:!0,depthWrite:!1}),to=new ga(vn,gn);to.position.y=Ds-.005,to.renderOrder=-2,D.add(to);const Sl=ap(ru,v.frame.width,v.frame.depth,new Ne),Tl=new Ne(Z.demGridRes,v.demGridRes),El=new Ne(Z.minElevM,Z.maxElevM),Rl=new Ne(v.minElevM,v.maxElevM),Al=new Ne(v.widthKm,v.depthKm),kl=new va(1,0,0,0),_l=new va(1,0,0,0),Fl=new va(0,0,0,0),Mi={...Bc},yi={...Bc},xn=new Ne(v.windDirUv[0],v.windDirUv[1]),Dl=new U(...v.frame.unitsPerMetre),Pl=new va(0,0,1,1),Il=(n,f,w,d)=>{const R=new aa(new Uint8Array([n,f,w,d]),1,1,At,Ut);return R.needsUpdate=!0,R},wn=Il(128,128,255,0),Mn=Il(255,255,255,255),Cl=new Vm(S),Ll=n=>(n.shadow||(n.shadow=Cl.bake(n.demTex,n.demGridRes,n.minElevM,n.maxElevM,n.frame.unitsPerMetre[1],n.frame.width,n.frame.depth,n.sunDir,n.demGridRes>=1024?2048:1024)),n.shadow.texture),Nl=n=>{const f=Ym(n),w=new Wo;return w.setAttribute("position",new ua(f.position,3)),w.setAttribute("normal",new ua(f.normal,3)),w.setAttribute("uv",new ua(f.uv,2)),w.setIndex(new ua(f.index,1)),w.boundingSphere=new Du(new U(0,1,0),15),w},yn=Nl(Gu);let ds=null,bi=null;const C={uDemPrev:{value:Z.demTex},uDemNext:{value:v.demTex},uDemRes:{value:Tl},uElevPrevRange:{value:El},uElevNextRange:{value:Rl},uMorph:{value:1},uSatPrev:{value:Z.satTex},uSatNext:{value:v.satTex},uFieldTex0:{value:Le},uFieldTex1:{value:rt},uLipariTex:{value:Ka},uFrameMix:{value:lh},uSunDir:{value:ye},uTime:{value:0},uCutawayMix:{value:1},uCutawayPlane:{value:0},uCutawayDir:{value:Sl},uReconMix:{value:0},uObserverMix:{value:0},uModisWeight:{value:1},uViirsWeight:{value:1},uUncertaintyMix:{value:x.current.showUncertainty?1:0},uSensitivity:{value:x.current.sensitivityThreshold},uExtentKm:{value:Al},uModisPass:{value:kl},uViirsPass:{value:_l},uScanStrip:{value:Fl},uLatticeMix:{value:1},uHasSeaCoast:{value:v.hasSeaCoast?1:0},uLakeMix:{value:fu(v)?1:0},uFireHist:{value:ee(v).texture},uFireTime:{value:0},uWindDirUv:{value:xn},uReliefScale:{value:bl},uSlabSize:{value:pn},uAuxTex:{value:v.auxTex??wn},uAuxNormals:{value:1},uAuxMix:{value:0},uShadowTex:{value:Ll(v)},uUnitsPerMetre:{value:Dl},uOrthoTexelKm:{value:v.orthoTexelKm},uSatSharpen:{value:v.sharpen},uDetailTex:{value:Mn},uDetailRect:{value:Pl},uDetailMix:{value:0},uDetailTexelKm:{value:v.detailTexelKm},uSmokeShadowTex:{value:K.shadowTarget.texture},uSunTrue:{value:eo},uSunColor:{value:fn},uSunTransmittance:{value:gl},uHazeStrength:{value:nd},uSkyView:{value:wi.skyView.texture},uSkyExposure:{value:er},uEdgeFade:{value:0},uContextDem:{value:null},uContextRes:{value:1024},uContextScale:{value:5},uContextMix:{value:0},uContextOrtho:{value:null},uFloorColor:$a.uFloorColor,uFloorHaze:$a.uFloorHaze,uSmokeShadowMix:{value:0},uFootTex:{value:Wi.texture},uFootMix:{value:sl},uFieldScale:{value:il},uHeatRange:{value:ol},uBeliefGrid:{value:oa.grid},uBeliefBox:{value:oa.box},uTileGrid:{value:Qo},uTileState:{value:el},uTileHover:Jo,uScan:{value:Wa},uPixelOutline:{value:0},uBeliefMix:qr,uHeldOut:qo,uHeldOutOther:Zr,uDeclaredGiven:Qr,uChanceSquares:rn,uDayJoin:sn,uDayFalse:on,uMicroDetail:rl,uRevealArrive:{value:Ls},uAfterglow:mi,uLightGain:Ya,uFarView:un,uBeliefQuiet:dn,uLightModis:nl,uLightTexels:{value:li},uRevealed:{value:Cs},uNight:Va,uMoonLift:fi},zl=new yt({vertexShader:Gc,fragmentShader:af,uniforms:C}),ao=new ga(yn,zl);ao.frustumCulled=!1,D.add(ao);const Ul=new yt({vertexShader:Gc,fragmentShader:tf,uniforms:C,colorWrite:!1,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),so=new ga(yn,Ul);so.frustumCulled=!1,so.renderOrder=-11,D.add(so);const io=new cf({uSlabSize:C.uSlabSize,uElevNextRange:C.uElevNextRange,uReliefScale:C.uReliefScale,uUnitsPerMetre:C.uUnitsPerMetre,uSunDir:C.uSunDir,uSunTrue:C.uSunTrue,uSunColor:C.uSunColor,uSunTransmittance:C.uSunTransmittance,uHazeStrength:C.uHazeStrength,uSkyView:C.uSkyView,uSkyExposure:C.uSkyExposure,uFloorColor:C.uFloorColor,uFloorHaze:C.uFloorHaze,uContextDem:C.uContextDem,uContextRes:C.uContextRes,uContextScale:C.uContextScale,uContextMix:C.uContextMix,uContextOrtho:C.uContextOrtho,uNight:Va,uMoonLift:fi});D.add(io.mesh);let xa=0;const Bl=Pc(),ch={uDemPrev:C.uDemPrev,uDemNext:C.uDemNext,uDemRes:C.uDemRes,uElevPrevRange:C.uElevPrevRange,uElevNextRange:C.uElevNextRange,uReliefScale:C.uReliefScale,uSlabSize:C.uSlabSize,uMorph:C.uMorph,uSunDir:C.uSunDir,uCutawayMix:C.uCutawayMix,uCutawayPlane:C.uCutawayPlane,uCutawayDir:C.uCutawayDir,uEdgeFade:C.uEdgeFade,uContextDem:C.uContextDem,uContextRes:C.uContextRes,uContextScale:C.uContextScale,uContextMix:C.uContextMix,uNight:Va,uMoonLift:fi},Ol=new yt({vertexShader:yd,fragmentShader:bd,uniforms:ch,side:_s}),Si=new ga(Bl,Ol);Si.frustumCulled=!1,D.add(Si);const Hl=new va(0,1,0,-1e4),Xa=new g0(hu);D.add(Xa.group);let Gl=!1;const oo=[];let bn=0;const pe={azimuth:wt.azimuth,polar:wt.polar,distance:wt.distance,target:new U(...wt.target)},Y={azimuth:wt.azimuth,polar:wt.polar,distance:wt.distance,target:new U(...wt.target)},ja=new Dd,Kl=new Id;let Sn=!1,ba=!1,Wl=!1,Tn=0,no=Ni,Zt=1;const Je={width:v.frame.width,depth:v.frame.depth},Vl=()=>{Je.width=k.lerp(Z.frame.width,v.frame.width,Zt),Je.depth=k.lerp(Z.frame.depth,v.frame.depth,Zt),pn.set(Je.width,Je.depth)},Wt=n=>(n-.5)*Je.width,Vt=n=>(.5-n)*Je.depth,ro=n=>n/Je.width+.5,lo=n=>.5-n/Je.depth,bt=(n,f)=>{const w=Ci(v.alignedDem,v.demGridRes,n,f),d=As(w,v);if(Zt>=.999||Z===v)return d;const R=Ci(Z.alignedDem,Z.demGridRes,n,f),b=As(R,Z);return b+(d-b)*Zt},co=()=>{C.uDemPrev.value=Z.demTex,C.uDemNext.value=v.demTex,Tl.set(Z.demGridRes,v.demGridRes),El.set(Z.minElevM,Z.maxElevM),Rl.set(v.minElevM,v.maxElevM),C.uSatPrev.value=Z.satTex,C.uSatNext.value=v.satTex,Al.set(v.widthKm,v.depthKm),C.uHasSeaCoast.value=v.hasSeaCoast?1:0,C.uLakeMix.value=fu(v)?1:0,xn.set(v.windDirUv[0],v.windDirUv[1]),C.uFireHist.value=ee(v).texture,bl.set(Z.frame.unitsPerMetre[1],v.frame.unitsPerMetre[1]),Dl.set(...v.frame.unitsPerMetre),Vl(),ye.copy(v.sunDir),xl(v),Me.position.copy(ye).multiplyScalar(20),C.uShadowTex.value=Ll(v),C.uAuxTex.value=v.auxTex??wn,C.uAuxNormals.value=v.pack&&v.levelIsWater===!1?0:1,C.uOrthoTexelKm.value=v.orthoTexelKm,C.uSatSharpen.value=v.sharpen,C.uDetailTex.value=v.detailTex??Mn,Pl.set(...v.detailRect),C.uDetailTexelKm.value=v.detailTexelKm,v.auxTex||(C.uAuxMix.value=0),v.detailTex||(C.uDetailMix.value=0);const n=v.context;C.uContextDem.value=(n==null?void 0:n.demTexture)??null,C.uContextOrtho.value=(n==null?void 0:n.orthoTexture)??null,C.uContextRes.value=(n==null?void 0:n.gridRes)??1024,C.uContextScale.value=(n==null?void 0:n.scale)??5,io.setContext(n),n||(xa=0,C.uContextMix.value=0)},Sa=new Map,Yl=S.capabilities.maxTextureSize>=8192&&(navigator.deviceMemory??8)>=8&&!_,uh=()=>{ds||(ds=Nl(1023),bi=Pc(1023),ao.geometry=ds,so.geometry=ds,Si.geometry=bi)},$l=(n,f,w)=>{const d=f.manifest.extent_km[0]/f.orthoSize;return{...n,key:`pack-${n.key}`,demTex:f.demTexture,alignedDem:f.alignedDem,levelIsWater:!f.levelInWholeMetres,demGridRes:f.demGridRes,minElevM:f.minElevM,maxElevM:f.maxElevM,satTex:f.orthoTexture,orthoLabel:f.orthoSize>=8192?"Esri 8K":"Esri 4K",demLabel:`${f.demGridRes}²`,orthoTexelKm:d,sharpen:0,shadow:(w==null?void 0:w.shadow)??null,pack:f,lite:n,auxTex:f.auxTexture,detailTex:(w==null?void 0:w.detailTex)??null,detailRect:(w==null?void 0:w.detailRect)??[0,0,1,1],detailTexelKm:(w==null?void 0:w.detailTexelKm)??d,context:(w==null?void 0:w.context)??null,contextState:(w==null?void 0:w.contextState)??"none",attribution:f.attribution||n.attribution}},Xl=n=>{var f,w,d,R,b,L;(f=n.pack)==null||f.dispose(),(w=n.detailTex)==null||w.dispose(),(d=n.shadow)==null||d.dispose(),(R=n.context)==null||R.dispose(),n.fireHistory&&n.fireHistory!==((b=n.lite)==null?void 0:b.fireHistory)&&n.fireHistory.texture.dispose(),n.smokeHeight&&n.smokeHeight!==((L=n.lite)==null?void 0:L.smokeHeight)&&(G.delete(n.smokeHeight),n.smokeHeight.dispose()),n.fireHistory=null,n.smokeHeight=null,n.detectionSource=null,n.context=null,n.pack=null,n.detailTex=null,n.shadow=null},En=n=>{for(const[f,w]of Sa)f===n||w===Z||w===v||(Xl(w),Sa.delete(f))},hh=n=>{if(n.pack||!n.packManifest)return n;const f=Sa.get(n.regionId);if(!(f!=null&&f.pack))return n;if(f.lite===n)return f;const w=$l(n,f.pack,f);return Sa.set(n.regionId,w),Nt(f),w},dh=n=>{var R;const f=n.pack,w=(R=f==null?void 0:f.manifest.ortho_detail)==null?void 0:R[0];if(!f||!w||!Yl||w.size>S.capabilities.maxTextureSize)return;const d=w.uv_rect;!Array.isArray(d)||d.length!==4||!(d[2]>d[0])||!(d[3]>d[1])||Vu(Ha(x.current,w.url),P).then(b=>{if(!b)return;const L=Sa.get(n.regionId);if(m||!L||L.pack!==f){b.dispose();return}L.detailTex=b,L.detailRect=[d[0],d[1],d[2],d[3]],L.detailTexelKm=f.manifest.extent_km[0]*(d[2]-d[0])/w.size,v===L&&co()})},fh=n=>{const f=n.pack,w=Kc(f==null?void 0:f.manifest.context);!f||!w||n.context||n.contextState!=="none"||(n.contextState="loading",of(w,{resolveUrl:d=>Ha(x.current,d),maxTextureSize:S.capabilities.maxTextureSize,maxAnisotropy:P,isCancelled:()=>m}).then(d=>{const R=Sa.get(n.regionId);if(m||!R||R.pack!==f){d==null||d.dispose();return}R.contextState=d?"none":"failed",d&&(R.context=d,v===R&&co())}))},mh=n=>{const f=n.packManifest;!f||n.pack||n.packState!=="none"||(n.packState="loading",Yd(f,{resolveUrl:w=>Ha(x.current,w),maxTextureSize:Yl?S.capabilities.maxTextureSize:4096,maxAnisotropy:P,isCancelled:()=>m}).then(w=>{if(m){w==null||w.dispose();return}if(!w){n.packState="failed";return}if(n.packState="none",v!==n){w.dispose();return}En(n.regionId);const d=$l(n,w,null);Sa.set(n.regionId,d),uo(d,!0),no=.62,dh(d),fh(d)}))},uo=(n,f)=>{if(m)return;const w=hh(n);if(w===v&&f)return;w.demGridRes>=1024&&uh();const d=v.regionId!==w.regionId;Wl=d,f?(Z=Zt<.5?Z:v,v=w,ba=!0,Tn=0,no=Ni,Zt=0,C.uMorph.value=0):(Z=w,v=w,ba=!1,Zt=1,C.uMorph.value=1,En(w.regionId),Gt()),d&&f&&(C.uAuxMix.value=0),co(),Hi=null,c(br(w)),ps=!0,w.pack||mh(w)},jl=n=>{m||v.regionId===n.regionId&&(uo(n,!0),no=.62)},ql=new WeakMap,ph=(n,f)=>{var ct,xt;let w=ql.get(n);w||ql.set(n,w=new Map);const d=w.get(f);if(d!==void 0)return d;if(w.set(f,null),n.observerDataset.dataSource!=="firms")return null;const[R,b,L,te]=n.bbox,Q=Date.parse(((xt=(ct=n.observerDataset.frames[f])==null?void 0:ct[0])==null?void 0:xt.timeUtc)??""),re=[],ae=[];for(const fe of n.observerDataset.frames)for(const Ee of fe){if(Ee.hidden||Ee.revealed)continue;const $e=Date.parse(Ee.timeUtc??""),ge=Number.isFinite(Q)&&Number.isFinite($e)&&Math.abs($e-Q)<=Dp;for(const we of Ee.footprints){const Se=(we.lon-R)/Math.max(1e-9,L-R),Oe=(we.lat-b)/Math.max(1e-9,te-b),Yt=Math.max(1,we.frpMw);re.push(Se,Oe,Yt),ge&&ae.push(Se,Oe,Yt)}}const Re=fe=>{let Ee=0,$e=0,ge=0;for(let we=0;we<fe.length;we+=3)Ee+=fe[we]*fe[we+2],$e+=fe[we+1]*fe[we+2],ge+=fe[we+2];return ge>0?[Ee/ge,$e/ge]:null},Te=(fe,Ee,$e)=>Math.hypot((fe[Ee]-$e[0])*n.widthKm,(fe[Ee+1]-$e[1])*n.depthKm),Ue=(fe,Ee)=>{let $e=0,ge=0;for(let we=0;we<fe.length;we+=3)ge+=fe[we+2],Te(fe,we,Ee)<Pp&&($e+=fe[we+2]);return ge>0?$e/ge:0};let de=Re(re);if(!de)return null;let be=re;const xe=Re(ae);xe&&Ue(ae,de)<.1&&Ue(ae,xe)>=.3&&(de=xe,be=ae);let Ke=1/0;for(let fe=0;fe<be.length;fe+=3)Ke=Math.min(Ke,Te(be,fe,de));if(Ke>Ap){const fe=Math.max(1,Math.ceil(n.widthKm/xu)),Ee=Math.max(1,Math.ceil(n.depthKm/xu)),$e=Di(new Float32Array(be),fe,Ee),ge=new Float64Array($e.sizes.length),we=new Float64Array($e.sizes.length*2);for(let Oe=0;Oe<$e.patchOf.length;Oe++){const Yt=$e.patchOf[Oe],Ie=be[Oe*3+2];ge[Yt]+=Ie,we[Yt*2]+=Ie*be[Oe*3],we[Yt*2+1]+=Ie*be[Oe*3+1]}let Se=0;for(let Oe=1;Oe<ge.length;Oe++)ge[Oe]>ge[Se]&&(Se=Oe);ge[Se]>0&&(de=[we[Se*2]/ge[Se],we[Se*2+1]/ge[Se]])}return w.set(f,de),de};let ho=1;const La=(n,f,w,d)=>{var ys;const R=!!x.current.tileBoard,b=Cc(n,f,w,d,R);if(f&&R&&n==="region"&&ho>1)return{...b,distance:b.distance*ho};if(!f||n!=="canyon"&&n!=="ridge")return b;const L=n==="canyon"?"subpixel":"front",te=v.findings.find(le=>le.kind===L),Q=v.observerDataset.frames.length,re=Math.min(Q-1,Math.max(0,Math.round(k.clamp(x.current.timeProgress,0,1)*(Q-1)))),ae=ph(v,re);if(!te&&!ae)return b;const[Re,Te,Ue,de]=v.bbox;let be=ae?k.clamp(ae[0],.1,.9):k.clamp((te.lon-Re)/Math.max(1e-4,Ue-Re),.2,.8),xe=ae?k.clamp(ae[1],.1,.9):k.clamp((te.lat-Te)/Math.max(1e-4,de-Te),.2,.8);const Ke=n==="canyon"?(ys=v.declared)==null?void 0:ys.byFrame.get(re):void 0;let ct=null,xt=null;if(Ke&&Ke.length>0&&v.declared)ct=v.declared,xt=Ke;else if(n==="canyon"&&vi==="estimate"&&dt.length>0&&v.runId){const le=jr.get(v.runId);if(le){const{nx:Xe,ny:et}=le.info,qe=new Set;for(let Tt=0;Tt<dt.length;Tt+=3){const mt=Math.min(Xe-1,Math.max(0,Math.floor(dt[Tt]*Xe))),ne=Math.min(et-1,Math.max(0,Math.floor((1-dt[Tt+1])*et)));qe.add(ne*Xe+mt)}ct={nx:Xe,ny:et},xt=Uint32Array.from(qe)}}let fe=null,Ee=null;if(ct&&xt&&xt.length>0){const le=xt,{nx:Xe,ny:et}=ct,qe=new Float32Array(le.length*3);le.forEach((He,se)=>{qe[se*3]=(He%Xe+.5)/Xe,qe[se*3+1]=1-(Math.floor(He/Xe)+.5)/et,qe[se*3+2]=1});const Tt=Di(qe,Xe,et);let mt=0;for(let He=0;mt<Tt.sizes.length&&He<Mu*le.length;mt++)He+=Tt.sizes[mt];let ne=1,Ae=0,Fe=1,tt=0;fe=[],Ee=[];for(let He=0;He<le.length;He++){const se=le[He],De=se%Xe/Xe,Et=1-Math.floor(se/Xe)/et,_t=De+1/Xe,Ft=Et-1/et;Ee.push(De,Ft,_t,Ft,De,Et,_t,Et),!(Tt.patchOf[He]>=mt)&&(ne=Math.min(ne,De),Ae=Math.max(Ae,_t),Fe=Math.min(Fe,Ft),tt=Math.max(tt,Et),fe.push(De,Ft,_t,Ft,De,Et,_t,Et))}be=k.clamp((ne+Ae)/2,.05,.95),xe=k.clamp((Fe+tt)/2,.05,.95)}const $e=Wt(be),ge=Vt(xe),we=Math.hypot($e,ge),Se=Math.atan2(-$e,-ge),Oe=k.smoothstep(we,.8,3.2),Yt=Math.atan2(v.sunDir.x,v.sunDir.z);let Ie=b.azimuth,Ms=-1e9;for(let le=0;le<72;le++){const Xe=le/72*Math.PI*2-Math.PI;let et=Xe-ru;for(;et>Math.PI/2;)et-=Math.PI;for(;et<-Math.PI/2;)et+=Math.PI;if(Math.abs(et)>W0)continue;let qe=Math.abs(Xe-Yt)%(Math.PI*2);qe>Math.PI&&(qe=Math.PI*2-qe);const mt=1-Math.min(1,Math.abs(qe-Co)/Co)+.9*Oe*Math.cos(Xe-Se)+.2*Math.cos(Xe-b.azimuth);mt>Ms&&(Ms=mt,Ie=Xe)}let $t=[$e,bt(be,xe)+.1,ge],Aa=b.distance,Jt=b.polar;if(fe&&Ee){const le=$t,Xe=qe=>{let Tt={target:le,distance:b.distance,polar:b.polar};for(const mt of[b.polar,...yu].filter(ne=>ne<=b.polar)){let ne=le,Ae={distance:b.distance,fits:!1};for(let Fe=0;Fe<3&&(Ae=Jl(qe,ne,Ie,mt),Fe!==2);Fe++)ne=Ql(qe,ne,Ie,mt,Ae.distance);if(Tt={target:ne,distance:Ae.distance,polar:mt},Ae.fits)break}return Tt};let et=Xe(fe);Ee.length>fe.length&&xh(Ee,et.target,Ie,et.polar,et.distance)&&(et=Xe(Ee)),$t=et.target,Aa=et.distance,Jt=et.polar}const ea=n==="canyon"?vh(v,re):null;if(ea&&ea.length>0){const le=bu/Math.max(.001,v.widthKm),Xe=bu/Math.max(.001,v.depthKm),et=Math.max(1,Math.round(1/le)),qe=Math.max(1,Math.round(1/Xe)),Tt=new Float32Array(ea.length/2*3);for(let se=0,De=0;se<ea.length;se+=2,De+=3)Tt[De]=ea[se],Tt[De+1]=ea[se+1],Tt[De+2]=1;const mt=Di(Tt,et,qe);let ne=0;const Ae=ea.length/2;for(let se=0;ne<mt.sizes.length&&se<Mu*Ae;ne++)se+=mt.sizes[ne];const Fe=fe?[...fe]:[],tt=[];for(let se=0;se<Ae;se++){if(mt.patchOf[se]>=ne)continue;const De=ea[se*2]-le/2,Et=ea[se*2+1]-Xe/2;Fe.push(De,Et,De+le,Et,De,Et+Xe,De+le,Et+Xe),tt.push(ea[se*2],ea[se*2+1])}if(gh(Fe,$t,Ie,Jt,Aa*Tr)||Zl(tt,$t,Ie,Jt,Aa)>Su){const se=$t;let De=null;for(const Et of[Jt,...yu].filter(_t=>_t<=Jt)){let _t=se,Ft={distance:Aa,fits:!1};for(let Xt=0;Xt<3&&(Ft=Jl(Fe,_t,Ie,Et),Xt!==2);Xt++)_t=Ql(Fe,_t,Ie,Et,Ft.distance);const Ua=Zl(tt,_t,Ie,Et,Ft.distance),bs={target:_t,distance:Ft.distance,polar:Et,fits:Ft.fits,hidden:Ua};if(Ft.fits&&Ua<=Su){De=bs;break}(!De||bs.fits&&(!De.fits||Ua<De.hidden))&&(De=bs)}De&&($t=De.target,Aa=De.distance,Jt=De.polar)}}return{...b,azimuth:Ie,polar:Jt,distance:Aa,target:$t}},vh=(n,f)=>{if(n.observerDataset.dataSource!=="firms")return null;const[w,d,R,b]=n.bbox,L=[];for(const te of n.observerDataset.frames[f]??[])if(!(!te.revealed||te.revealedByLook))for(const Q of te.footprints)L.push((Q.lon-w)/Math.max(1e-9,R-w),(Q.lat-d)/Math.max(1e-9,b-d));return L.length>0?L:null},gh=(n,f,w,d,R)=>{const b=Ii(x.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},L=Math.tan(k.degToRad(Ar/2)),te=(b.right-b.left)*L*T.aspect,Q=(b.bottom-b.top)*L,re=new U().setFromSphericalCoords(1,d,w),ae=re.clone().negate(),Re=new U().crossVectors(ae,new U(0,1,0)).normalize(),Te=new U().crossVectors(Re,ae),Ue=new U(f[0],f[1],f[2]).addScaledVector(re,R),de=new U;for(let be=0;be<n.length;be+=2){de.set(Wt(n[be]),bt(n[be],n[be+1]),Vt(n[be+1])).sub(Ue);const xe=de.dot(ae);if(xe<=.05||Math.abs(de.dot(Re)/xe)>te||Math.abs(de.dot(Te)/xe)>Q)return!0}return!1},Zl=(n,f,w,d,R)=>{if(n.length===0)return 0;const b=new U().setFromSphericalCoords(1,d,w),L=f[0]+b.x*R,te=f[1]+b.y*R,Q=f[2]+b.z*R;let re=0;for(let ae=0;ae<n.length;ae+=2){const Re=n[ae],Te=n[ae+1],Ue=Wt(Re),de=bt(Re,Te),be=Vt(Te);for(let xe=1;xe<32;xe++){const Ke=xe/32,ct=ro(L+(Ue-L)*Ke),xt=lo(Q+(be-Q)*Ke);if(!(ct<0||ct>1||xt<0||xt>1)&&bt(ct,xt)>te+(de-te)*Ke+.012){re+=1;break}}}return re/(n.length/2)},xh=(n,f,w,d,R)=>{const b=Ii(x.current.workspaceSubjectFrame)??{top:0,bottom:1},L=(b.bottom-b.top)*Math.tan(k.degToRad(Ar/2)),te=new U().setFromSphericalCoords(1,d,w),Q=te.clone().negate(),re=new U().crossVectors(Q,new U(0,1,0)).normalize(),ae=new U().crossVectors(re,Q),Re=new U(f[0],f[1],f[2]).addScaledVector(te,R),Te=new U;for(let Ue=0;Ue<n.length;Ue+=2){Te.set(Wt(n[Ue]),bt(n[Ue],n[Ue+1]),Vt(n[Ue+1])).sub(Re);const de=Te.dot(Q);if(de>.05&&Te.dot(ae)/de<-L)return!0}return!1},Ql=(n,f,w,d,R)=>{const b=new U().setFromSphericalCoords(1,d,w),L=b.clone().negate(),te=new U().crossVectors(L,new U(0,1,0)).normalize(),Q=new U().crossVectors(te,L),re=new U(f[0],f[1],f[2]).addScaledVector(b,R);let ae=1/0,Re=-1/0,Te=1/0,Ue=-1/0;const de=new U;for(let fe=0;fe<n.length;fe+=2){de.set(Wt(n[fe]),bt(n[fe],n[fe+1]),Vt(n[fe+1])).sub(re);const Ee=de.dot(L);if(Ee<=.05)continue;const $e=de.dot(te)/Ee,ge=de.dot(Q)/Ee;ae=Math.min(ae,$e),Re=Math.max(Re,$e),Te=Math.min(Te,ge),Ue=Math.max(Ue,ge)}if(!Number.isFinite(ae))return f;const be=L.clone().addScaledVector(te,(ae+Re)/2).addScaledVector(Q,(Te+Ue)/2);if(be.y>=-1e-4)return f;const xe=(f[1]-re.y)/be.y,Ke=re.clone().addScaledVector(be,xe),ct=k.clamp(Ke.x/Je.width+.5,.05,.95),xt=k.clamp(.5-Ke.z/Je.depth,.05,.95);return[Wt(ct),bt(ct,xt)+.1,Vt(xt)]},Jl=(n,f,w,d)=>{const R=Ii(x.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},b=Math.tan(k.degToRad(Ar/2)),L=(R.right-R.left)*b*T.aspect*wu,te=(R.bottom-R.top)*b*wu,Q=[];for(let xe=0;xe<n.length;xe+=2)Q.push(Wt(n[xe]),bt(n[xe],n[xe+1]),Vt(n[xe+1]));const re=new U().setFromSphericalCoords(1,d,w),ae=re.clone().negate(),Re=new U().crossVectors(ae,new U(0,1,0)).normalize(),Te=new U().crossVectors(Re,ae),Ue=xe=>{const Ke=f[0]+re.x*xe,ct=f[1]+re.y*xe,xt=f[2]+re.z*xe;for(let fe=0;fe<Q.length;fe+=3){const Ee=Q[fe]-Ke,$e=Q[fe+1]-ct,ge=Q[fe+2]-xt,we=Ee*ae.x+$e*ae.y+ge*ae.z;if(we<=.05||Math.abs((Ee*Re.x+$e*Re.y+ge*Re.z)/we)>L||Math.abs((Ee*Te.x+$e*Te.y+ge*Te.z)/we)>te)return!1}return!0};if(Ue(Er))return{distance:Er,fits:!0};if(!Ue(Rr))return{distance:Rr,fits:!1};let de=Er,be=Rr;for(let xe=0;xe<22;xe++){const Ke=(de+be)/2;Ue(Ke)?be=Ke:de=Ke}return{distance:be,fits:!0}},wh=n=>{var mt;const f=v,[w,d,R,b]=f.bbox,L=f.findings.find(ne=>ne.kind==="front")??f.findings.find(ne=>ne.kind==="subpixel")??f.findings[0];let te=.5,Q=.5;L&&(te=k.clamp((L.lon-w)/Math.max(1e-4,R-w),.25,.75),Q=k.clamp((L.lat-d)/Math.max(1e-4,b-d),.25,.75));const re=f.observerDataset.dataSource==="firms";if(re){const ne=Math.min(f.frameCount-1,Math.max(0,Math.round(k.clamp(n,0,1)*(f.frameCount-1))));let Ae=0,Fe=0,tt=0;for(const He of f.observerDataset.frames[ne]??[])if(!He.hidden)for(const se of He.footprints)Ae+=se.frpMw,Fe+=se.frpMw*(se.lon-w)/Math.max(1e-4,R-w),tt+=se.frpMw*(se.lat-d)/Math.max(1e-4,b-d);Ae>0&&(te=k.clamp(Fe/Ae,.15,.85),Q=k.clamp(tt/Ae,.15,.85))}const ae=f.frame.width,Re=f.frame.depth,Te=ae*.5,Ue=Re*.5,de=(ne,Ae)=>As(Ci(f.alignedDem,f.demGridRes,ne/ae+.5,.5-Ae/Re),f),be=Kc((mt=f.packManifest)==null?void 0:mt.context)!==null&&f.contextState!=="failed",xe=(te-.5)*ae,Ke=(.5-Q)*Re,ct=de(xe,Ke)+.05,xt=Math.min(f.frameCount-1,Math.max(0,Math.round(k.clamp(n,0,1)*(f.frameCount-1)))),fe=xt*We*We*4,Ee=[],$e=(ne,Ae,Fe)=>{Ee.push(ne,de(ne,Ae)+.03,Ae,(de(ne-.1,Ae)-de(ne+.1,Ae))/.2,(de(ne,Ae-.1)-de(ne,Ae+.1))/.2,Fe)};if(f.observerDataset.dataSource==="firms"){const ne=[];for(const tt of f.observerDataset.frames[xt]??[])if(!tt.hidden)for(const He of tt.footprints)ne.push(He);const Ae=Math.max(1,Math.ceil(ne.length/320)),Fe=f.frame.unitsPerMetre[0]*f.frame.unitsPerMetre[2]*1e6;for(let tt=0;tt<ne.length;tt+=Ae){const He=ne[tt],se=((He.lon-w)/Math.max(1e-4,R-w)-.5)*ae,De=(.5-(He.lat-d)/Math.max(1e-4,b-d))*Re;Math.abs(se)>Te||Math.abs(De)>Ue||$e(se,De,He.acrossTrackKm*He.alongTrackKm*Fe*Ae)}}else{const ne=3*ae/(We-1)*(3*Re/(We-1));for(let Ae=2;Ae<We-2;Ae+=3)for(let Fe=2;Fe<We-2;Fe+=3)f.tensor[fe+(Ae*We+Fe)*4]/255<=Oi||$e((Fe/(We-1)-.5)*ae,(.5-Ae/(We-1))*Re,ne)}const ge=Ee.length/6,we=Math.tan(Po*Math.PI/360),Se=4*we*we*1.6,Oe=2*Math.atan(we*(16/9))/1920,Yt=Math.min(X0,f.orthoTexelKm*1e3*f.frame.unitsPerMetre[0]/($0*Oe)),Ie=de(xe-.12,Ke)-de(xe+.12,Ke),Ms=de(xe,Ke-.12)-de(xe,Ke+.12),$t=Math.hypot(Ie,Ms)||1,Aa=Math.atan2(f.sunDir.x,f.sunDir.z),Jt=Math.hypot(f.windDirUv[0]*ae,f.windDirUv[1]*Re)||1,ea=f.windDirUv[0]*ae/Jt,ys=-f.windDirUv[1]*Re/Jt,le=Math.atan(Math.tan(Po*Math.PI/360)*(16/9))+Io;let Xe={...wt,target:[xe,ct,Ke]},et=-1e9;const qe={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0},Tt=f.frame.unitsPerMetre[1];for(const ne of V0)for(let Ae=0;Ae<48;Ae++){const Fe=Ae/48*Math.PI*2-Math.PI,tt=xe+ne*Math.sin(Fe),He=Ke+ne*Math.cos(Fe);if(Te-Math.abs(tt)<.35||Ue-Math.abs(He)<.35)continue;let se=de(tt,He);for(const Xt of[-1,1]){const Dt=Fe+Xt*Io;se=Math.max(se,de(xe+ne*Math.sin(Dt),Ke+ne*Math.cos(Dt)))}let De=Math.abs(Fe-Aa)%(Math.PI*2);De>Math.PI&&(De=Math.PI*2-De);const Et=1-Math.min(1,Math.abs(De-Co)/Co),_t=Math.sin(Fe)*ea+Math.cos(Fe)*ys,Ft=Math.max(0,_t),Ua=be?.45*Math.max(0,-_t)+(re?.16:-.12)*ne:0,bs=(Ie*Math.sin(Fe)+Ms*Math.cos(Fe))/$t;for(let Xt=0;Xt<Fa;Xt++){const Dt=-le+2*le*Xt/(Fa-1),ka=Fe+Math.PI-Dt,es=Math.sin(ka),Ss=Math.cos(ka);let Ma=0;for(;Ma<$s;Ma++){const na=.3+Ma*gr,ts=tt+es*na,Ba=He+Ss*na;if(Math.abs(ts)>Te||Math.abs(Ba)>Ue)break;mo[Xt*$s+Ma]=de(ts,Ba)}kn[Xt]=Ma}for(const Xt of Y0){const Dt=se+Xt*Tt;let ka=1e6;for(let $=1;$<10;$++){const Ze=$/10;ka=Math.min(ka,Dt+(ct-Dt)*Ze-de(tt+(xe-tt)*Ze,He+(Ke-He)*Ze))}if(ka<.03)continue;let es=0,Ss=0,Ma=0,na=-1e6,ts=0,Ba=0,Ri=0;for(let $=0;$<Fa;$++){const Ze=-le+2*le*$/(Fa-1),V=kn[$];let z=-1e6,X=0,j=0;for(let ce=0;ce<V;ce++){const Ge=.3+ce*gr,Be=(mo[$*$s+ce]-Dt)/Ge;Be>z?(X>=2&&Ge>ne&&j++,z=Be,X=0):Be<z-.004&&X++}if(z<0){const ce=V>0?mo[$*$s+V-1]:1;be||f.hasSeaCoast&&ce<.004?Ss++:es++}Ma+=Math.max(z,-.2),na=Math.max(na,z),Math.abs(Ze)<le*.55&&(ts+=j,Ba=Math.max(Ba,j),Ri++)}const Hs=na-.59*2*we;let as=1e6;for(let $=0;$<Fa;$++){const Ze=kn[$];for(let V=0;V<Ze;V++){const z=.3+V*gr;if(z>=as)break;const X=mo[$*$s+V];if(X>.004&&(X-Dt)/z>Hs){as=z;break}}}const ko=na-(ct-Dt)/ne;let Ai=0,ki=0,Gs=0;const _o=na-q0*(na-Hs);for(let $=0;$<ge;$++){const Ze=Ee[$*6],V=Ee[$*6+1],z=Ee[$*6+2],X=Math.hypot(Ze-tt,z-He);if(X<.5)continue;let j=Math.atan2(Ze-tt,z-He)-(Fe+Math.PI);if(j-=Math.round(j/(Math.PI*2))*Math.PI*2,Math.abs(j)>le*.8)continue;const ce=(V-Dt)/X;if(ce<_o&&ki++,ce<Hs||ce>na)continue;let Ge=!0;for(let Be=1;Be<8&&Ge;Be++){const it=Be/8;Dt+(V-Dt)*it<de(tt+(Ze-tt)*it,He+(z-He)*it)-.01&&(Ge=!1)}if(Ge){Ai++;const Be=Ee[$*6+3],it=Ee[$*6+4],Pt=tt-Ze,Rt=Dt-V,ta=He-z,ra=Pt*Pt+Rt*Rt+ta*ta,fa=Math.max(0,(Be*Pt+Rt+it*ta)/(Math.hypot(Be,1,it)*Math.sqrt(ra)));Gs+=Ee[$*6+5]*Math.hypot(Be,1,it)*fa/(ra*Se)}}const I=ge>0?Ai/ge:0,H=es/Fa,W=Ss/Fa,O=ts/Math.max(1,Ri),J=Ma/Fa,ie=-9*H-(es>0?3:0)-.6*W+1.1*Math.min(O,2)+.3*Math.min(Math.max(O-2,0),1)+.8*Et+.5*k.clamp(bs*2,-1,1)+(re?4*I:2.4*Math.min(I,.5))+2.5*Math.min(1,Gs/j0)-(re&&ge>0?7*ki/ge:0)-.5*Ft+Ua-(as<Yt?5+4*(1-as/Yt):0)-8*Math.max(0,ko-.2)-4*Math.max(0,.04-J);if(ie>et){et=ie;const $=Math.hypot(ne,Dt-ct);Xe={azimuth:Fe,polar:Math.acos(k.clamp((Dt-ct)/$,-1,1)),distance:$,target:[xe,ct,Ke]},qe.floorShare=H,qe.seaShare=W,qe.ridgeLines=O,qe.ridgeLinesMost=Ba,qe.fireShare=I,qe.fireFrameShare=Gs,qe.carryDistance=Yt,qe.skylineDeg=Math.atan(J)*180/Math.PI,qe.eyeAboveGroundM=Xt,qe.nearGround=as}}}return fo=qe,Xe};let Na=null,ec="",Rn=!1;const Mh=(n,f)=>{const w=Math.min(32,Math.max(1,Math.round(f))),d=[];T.updateMatrixWorld();for(let R=0;R<=w;R++)for(let b=0;b<=w;b++){const L=b/w,te=1-R/w,Q=As(Ci(n.alignedDem,n.demGridRes,L,te),n);Ti.set((L-.5)*Je.width,Q,(.5-te)*Je.depth).project(T),d.push(Ti.z>1||Ti.z<-1?null:[(Ti.x*.5+.5)*ft,(.5-Ti.y*.5)*vt])}return{divisions:w,points:d}},Ti=new U,An=n=>n.landingFrame===void 0?n.landingFrame=ev(n.observerDataset,n.bbox,n.widthKm,n.depthKm):n.landingFrame,tc=()=>{const n=v.contextState==="failed"?`${v.key}!`:v.key;if(!Na||ec!==n){const f=An(v);Na=wh(f!==null?f/Math.max(1,v.frameCount-1):x.current.timeProgress),ec=n,xs=Rs}return Na};let fo={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0};const mo=new Float32Array(Fa*$s),kn=new Int32Array(Fa),ac=(n,f,w)=>{const d=n.context;if(!d)return 0;const R=n.frame,[b,L,te]=R.unitsPerMetre,Q=Math.hypot(Math.max(Math.abs(f)-R.width*.5,0)/(b*1e3),Math.max(Math.abs(w)-R.depth*.5,0)/(te*1e3)),re=.25*(R.width/b+R.depth/te)*.001;return(uf(d,f/(R.width*d.scale)+.5,.5-w/(R.depth*d.scale))-n.minElevM-nf(Q,re)*1e3)*L},fs=new Float32Array((Xs*Xs+js*js)*3),yh=()=>{let n=0;for(let w=0;w<Xs;w++){const d=w/(Xs-1);for(let R=0;R<Xs;R++){const b=R/(Xs-1);fs[n*3]=Wt(b),fs[n*3+1]=bt(b,d),fs[n*3+2]=Vt(d),n++}}const f=v.context;if(f&&xa>.5){const w=v.frame;for(let d=0;d<js;d++){const R=d/(js-1);for(let b=0;b<js;b++){const te=(b/(js-1)-.5)*w.width*f.scale,Q=(.5-R)*w.depth*f.scale;Math.abs(te)<=w.width*.5&&Math.abs(Q)<=w.depth*.5||(fs[n*3]=te,fs[n*3+1]=ac(v,te,Q),fs[n*3+2]=Q,n++)}}}return n};let wa=!1;const _n=mu();let Qt=null,sc="",ic=null,ms=!!(x.current.filmMove??_n)&&!x.current.inWorkspace,Fn=0,Dn=-1,oc=null;ms&&(S.domElement.style.opacity="0");let Pn=!1,po=0,qa=0,Us=!0,kt=null,Ot=null,Bs=0,Za=null,ps=!1,nc=!1,rc=!1;const In=n=>{pe.azimuth=n.azimuth,pe.polar=n.polar,pe.distance=n.distance,pe.target.set(n.target[0],n.target[1],n.target[2])},bh=n=>{const f=x.current,w=ue.get(n);w&&w!==v&&uo(w,!0);const d=La(f.cameraPreset,f.inWorkspace,f.mode,n);ja.trigger(Y,d,2.15,Ni),wa=!1,ps=!1},Sh=()=>{const n=x.current;ja.cancel(),!n.inWorkspace&&n.landingView!=="slab"?(tc(),pe.azimuth=Y.azimuth,pe.polar=Y.polar,pe.distance=Y.distance,pe.target.copy(Y.target)):In(La(n.cameraPreset,n.inWorkspace,n.mode,n.activeTheaterId)),wa=!1,ps=!1},Th=n=>{if(n&&!Sn)ja.cancel(),Kl.startAtTheater(x.current.activeTheaterId);else if(!n&&Sn){const f=new U(0,.65,0);T.getWorldDirection(f),f.multiplyScalar(10.5).add(T.position),Cd(T.position,f,Y),pe.azimuth=Y.azimuth,pe.polar=Y.polar,pe.distance=Y.distance,pe.target.copy(Y.target),T.up.set(0,1,0)}Sn=n};y.current={activateBundle:uo,upgradeBundleInPlace:jl,bundleCache:ue,takeRunBundle:jt,storeRunBundle:at,onScreenRegionId:()=>v.regionId,maxAnisotropy:P,texLoader:N,triggerSlew:bh,applyCameraPreset:Sh,syncCinemaStart:Th},(async()=>{try{const n=await fetch(ku("generated/terrain/ca_dem_f32.bin")).catch(()=>null),f=new Promise(Re=>{N.load(ku("generated/terrain/ca_satellite.jpg"),Te=>{Te.colorSpace=nt,Te.anisotropy=P,Te.wrapS=Ve,Te.wrapT=Ve,Re(Te)},void 0,()=>Re(null))}),[w,d]=await Promise.all([n&&n.ok?n.arrayBuffer():Promise.resolve(null),f]);if(m)return;const R=ue.get("plumas_ca");if(!R||R.runId!==null)return;const b=Li.plumas_ca,L=w?ks(new Float32Array(w),!0):{texture:R.demTex,aligned:R.alignedDem,gridRes:R.demGridRes,minElev:R.minElevM,maxElev:R.maxElevM},te={buffer:Mr(),frames:Js},Q=yr(),re=_r("plumas_ca",b.bbox,L.aligned,L.gridRes,te.buffer,te.frames),ae={...R,...kr(b.widthKm,xr(b.bbox),null,1024,d?_u:""),fireHistory:null,key:"static-plumas_ca",noRealGround:w?void 0:R.noRealGround,noRealPicture:d?void 0:R.noRealPicture,demTex:L.texture,alignedDem:L.aligned,demGridRes:L.gridRes,minElevM:L.minElev,maxElevM:L.maxElev,satTex:d??R.satTex,orthoLabel:"1K",demLabel:`${L.gridRes}²`,tensor:te.buffer,frameCount:te.frames,observerDataset:Q,findings:re.anchors,callouts:re.callouts};da("plumas_ca",ae),jl(ae)}catch{}})();let ft=Math.max(1,g.clientWidth),vt=Math.max(1,g.clientHeight),vo=1;const Cn=()=>{g&&(ft=Math.max(1,g.clientWidth),vt=Math.max(1,g.clientHeight),F=tu(),B.setSize(ft,vt,F*vo),T.aspect=ft/vt)};Cn();const Eh=new Qm,Rh=n=>{const f=Eh.feed(n,document.hidden);f!==null&&(vo=f,B.setSize(ft,vt,F*vo))},lc=new ResizeObserver(Cn);lc.observe(g);let Qa=null;const Ln=()=>{Cn(),cc()},cc=()=>{Qa==null||Qa.removeEventListener("change",Ln),Qa=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`),Qa.addEventListener("change",Ln)};cc();let Ta=!1,uc=0,Nn=0,zn=0,go=0,xo=Number.NaN,Un=Number.NaN,hc=!1;const wo=new U,Bn=new Zh,dc=new Ne,fc=(n,f,w,d)=>{const R=S.domElement.getBoundingClientRect();if(R.width<=0||R.height<=0||n<R.left||n>R.right||f<R.top||f>R.bottom)return null;dc.set((n-R.left)/R.width*2-1,-((f-R.top)/R.height)*2+1),Bn.setFromCamera(dc,T);const b=Bn.ray.origin,L=Bn.ray.direction,te=Math.max(.02,Je.width/400);for(let Q=0;Q<Je.width*6;Q+=te){const re=b.x+L.x*Q,ae=b.y+L.y*Q,Re=b.z+L.z*Q,Te=ro(re),Ue=lo(Re);if(!(Te<0||Te>1||Ue<0||Ue>1)&&ae<=bt(Te,Ue)){const de=Math.min(w-1,Math.floor(Te*w));return Math.min(d-1,Math.floor((1-Ue)*d))*w+de}}return null},mc=n=>{n.target instanceof HTMLElement&&n.target.closest('[data-stage-ui="true"]')||(Ta=!0,uc=n.button,n.clientX,n.clientY,Nn=n.clientX,zn=n.clientY,go=0,ja.cancel(),S.domElement.setPointerCapture(n.pointerId))},pc=n=>{const f=x.current;if(xo=n.clientX,Un=n.clientY,!Ta)return;const w=n.clientX-Nn,d=n.clientY-zn;if(Nn=n.clientX,zn=n.clientY,go+=Math.hypot(w,d),!f.cinemaActive)if(uc===2||n.shiftKey){wa=!0;const R=Y.distance*.0011,b=Math.cos(Y.azimuth),L=Math.sin(Y.azimuth);pe.target.x=k.clamp(pe.target.x-(w*b-d*L)*R,-Je.width*.42,Je.width*.42),pe.target.z=k.clamp(pe.target.z-(-w*L-d*b)*R,-Je.depth*.42,Je.depth*.42)}else{wa=!0;const R=f.inWorkspace?.0046:.0028;pe.azimuth-=w*R;const b=f.inWorkspace?.12:.72,L=f.inWorkspace?1.36:1.18;pe.polar=k.clamp(pe.polar-d*R,b,L)}},vc=n=>{var d,R,b;if(!Ta)return;Ta=!1,S.domElement.hasPointerCapture(n.pointerId)&&S.domElement.releasePointerCapture(n.pointerId);const f=x.current;!f.inWorkspace&&go<5&&n.button===0&&((d=f.onEnterWorkspace)==null||d.call(f));const w=f.tileBoard;if(w&&w.pickable&&f.inWorkspace&&go<5&&n.button===0){const L=fc(n.clientX,n.clientY,w.cols,w.rows);L!==null&&!((R=w.tiles[L])!=null&&R.closed)&&((b=f.onTilePick)==null||b.call(f,L))}},gc=()=>{xo=Number.NaN,Un=Number.NaN},xc=n=>{const f=x.current;if(!f.inWorkspace||f.cinemaActive)return;n.preventDefault(),wa=!0,ja.cancel();const w=1+k.clamp(n.deltaY,-120,120)*.0011;pe.distance=k.clamp(pe.distance*w,4.6,23.5)},wc=n=>{x.current.inWorkspace&&n.preventDefault()},Ea=S.domElement;Ea.addEventListener("pointerdown",mc),window.addEventListener("pointermove",pc,{passive:!0}),window.addEventListener("pointerup",vc),Ea.addEventListener("pointerleave",gc),Ea.addEventListener("wheel",xc,{passive:!1}),Ea.addEventListener("contextmenu",wc);const Mo=window.matchMedia("(prefers-reduced-motion: reduce)");let vs=Mo.matches;const Mc=()=>{vs=Mo.matches};Mo.addEventListener("change",Mc);let Ja=0,On=0,yc=performance.now(),zt=0;const gs={scale:1,offsetX:0,offsetY:0},St={scale:1,offsetX:0,offsetY:0},Os={scale:1,offsetX:0,offsetY:du},Ra=new Float32Array(cp*3);let bc=!1,Ei=null,yo=0,xs=Rs,ws=null,gt=null;const za={scale:1,offsetX:0,offsetY:0};let bo=Rs,So=null,Sc=!1,Tc=null,Hn=!1,To=!1;const Eo=(n,f,w,d,R=!1)=>{let b=0;for(let L=0;L<ti;L++){const te=L/(ti-1);for(let Q=0;Q<ti;Q++){const re=Q/(ti-1);Ra[b*3]=Wt(re),Ra[b*3+1]=bt(re,te),Ra[b*3+2]=Vt(te),b++}}for(let L=0;L<4;L++)Ra[b*3]=(L%2===0?-.5:.5)*Je.width,Ra[b*3+1]=Ds,Ra[b*3+2]=(L<2?-.5:.5)*Je.depth,b++;if(R){const L=bt(.5,.5);for(let te=0;te<oh;te++){const Q=te===0?0:np,re=(te-1)*Math.PI*.5;Ra[b*3]=Math.cos(re)*Q,Ra[b*3+1]=L+(te===0?ip:op),Ra[b*3+2]=Math.sin(re)*Q,b++}}N0(Ra,b,f,w,39,ft/vt,n,d)};let Ro=0,Gn=0,Ao=0,Kn=60,Ec=0;const lt=new U,Rc=n=>{var Ss,Ma,na,ts,Ba,Ri,Hs,as,ko,Ai,ki,Gs,_o;if(m)return;On=requestAnimationFrame(Rc);const f=n-yc,w=Math.min(.065,Math.max(.001,f*.001));yc=n,zt+=w,Rh(f);const d=x.current,R=1-Math.exp(-w*8.5),b=1-Math.exp(-w*5.8),L=!d.inWorkspace&&d.landingView!=="slab";if(L&&tc(),ba){Tn+=ms?1e3:w;const I=Math.min(1,Tn/no);Zt=Ku(I),C.uMorph.value=Zt,Vl(),I>=1&&(ba=!1,Zt=1,Z=v,co(),C.uMorph.value=1,En(v.regionId),Gt())}const te=v.auxTex?ba&&Z.regionId!==v.regionId?k.smoothstep(Zt,.55,1):1:0;if(C.uAuxMix.value=k.lerp(C.uAuxMix.value,te,b),C.uDetailMix.value=k.lerp(C.uDetailMix.value,v.detailTex&&!Xi?1:0,b),ws=d.inWorkspace?null:Ii(d.landingSubjectFrame),gt=d.inWorkspace&&!d.cleanHud&&!d.cinemaActive?Ii(d.workspaceSubjectFrame):null,d.inWorkspace&&gt){const I=(gt.left+gt.right)*.5,H=(gt.top+gt.bottom)*.5,W=Za??d.cameraPreset;if(W==="overview"||W==="nadir"||W==="region"){bo+=1;const O=d.mode==="observer"&&W==="overview",J=!!d.tileBoard;let ie=kp;if(To&&J&&W==="region")Eo(gt,{azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]},0,za,O),ie=Fp,((Qt==="play"?Bs>=1:Math.abs(Y.distance-pe.distance)<.002*pe.distance)||wa)&&(To=!1,bo=Rs);else if(bo>=Rs||So!==W||Sc!==O||rc!==J||!vr(Tc,gt)){rc=J;const V=Cc(W,!0,d.mode,d.activeTheaterId,J);Eo(gt,V,0,za,O);let z=1;J&&W==="region"&&za.scale<Tu&&(z=Math.min(_p,Tu/Math.max(.001,za.scale)),Eo(gt,{...V,distance:V.distance*z},0,za,O)),J&&W==="region"&&Math.abs(z-ho)>.005&&(ho=z,Hn=!0),bo=0,So=W,Sc=O,Tc={...gt}}const $=k.clamp(za.scale,ie,1),Ze=Math.max(.001,za.scale);St.scale=$,St.offsetX=(za.offsetX+I)/Ze*$-I,St.offsetY=(za.offsetY+H)/Ze*$-H}else So=null,St.scale=1,St.offsetX=.5-I,St.offsetY=.5-H}else if(d.inWorkspace)So=null,St.scale=1,St.offsetX=0,St.offsetY=0;else if(L&&Na){const I=ws??cu;xs+=1;const H=ft/vt;if(xs>=Rs||!vr(Ei,I)||Math.abs(yo-H)>1e-4){const W=yh();O0(fs,W,Na,vs?0:Io,Po,H,I,Os),Ei=I,yo=H,xs=0}St.scale=1,St.offsetX=0,St.offsetY=Os.offsetY}else if(!ws)St.scale=1,St.offsetX=0,St.offsetY=du,Ei=null;else{xs+=1;const I=ft/vt;(xs>=Rs||!vr(Ei,ws)||Math.abs(yo-I)>1e-4)&&(Eo(ws,wt,lp,Os),Ei=ws,yo=I,xs=0),St.scale=Os.scale,St.offsetX=Os.offsetX,St.offsetY=Os.offsetY}const Q=bc?R:1;bc=!0,gs.scale=k.lerp(gs.scale,St.scale,Q),gs.offsetX=k.lerp(gs.offsetX,St.offsetX,Q),gs.offsetY=k.lerp(gs.offsetY,St.offsetY,Q),K0(T,ft,vt,gs);let re=d.timeProgress;const ae=L?An(v):null;let Re=null;ae!==null&&d.landingTour&&typeof d.landingPass!="number"&&!vs?(ln!==v.key&&(ln=v.key,Ns=[],v.observerDataset.frames.forEach((I,H)=>{var W;(H===ae||((W=I[0])==null?void 0:W.isDay)===!1)&&Ns.push(H)}),ji=Math.max(0,Ns.indexOf(ae)),qi=0,cn=!1),qi+=w,Ns.length>1&&qi>(cn?xp:gp)&&(ji=(ji+1)%Ns.length,qi=0,cn=!0),Re=Ns[ji]??null):ln="";const Te=ae!==null&&typeof d.landingPass=="number"&&Number.isFinite(d.landingPass)?k.clamp(d.landingPass,0,v.frameCount-1):Re??ae;if(Te!==null&&(re=Te/Math.max(1,v.frameCount-1)),d.backdrop){const I=An(v);I!==null&&(re=I/Math.max(1,v.frameCount-1))}let Ue=0,de=!1;if(d.cinemaActive&&d.inWorkspace){const I=Kl.update(w,bt,d.onCinemaStepTheater,Je.width,Je.depth);T.fov=I.fov,T.updateProjectionMatrix(),T.up.copy(I.up),T.position.copy(I.position),T.lookAt(I.lookAt),re=I.syntheticTimeProgress,Ue=I.cycleProgress}else{const I=L&&Na?Po:39;if(Math.abs(T.fov-I)>.01&&(T.fov=Rn||!L?k.lerp(T.fov,I,R):I),T.updateProjectionMatrix(),T.up.set(0,1,0),!d.inWorkspace&&!ja.isActive()&&!Ta){const V=L?Na:null,z=V??wt,X=vs?0:V?Math.sin(zt*.11)*Io:Math.sin(zt*.16)*.065;let j=z.azimuth+X;for(;j-pe.azimuth>Math.PI;)j-=Math.PI*2;for(;j-pe.azimuth<-Math.PI;)j+=Math.PI*2;pe.azimuth=V?k.lerp(pe.azimuth,j,Math.min(1,w*2)):j,pe.polar=k.lerp(pe.polar,z.polar,w*1.2),pe.distance=k.lerp(pe.distance,z.distance,w*1.6),wo.set(z.target[0],z.target[1],z.target[2]),pe.target.lerp(wo,w*2.2),V&&!Rn&&(pe.azimuth=j,pe.polar=z.polar,pe.distance=z.distance,pe.target.copy(wo),Y.azimuth=pe.azimuth,Y.polar=z.polar,Y.distance=z.distance,Y.target.copy(wo),Rn=!0)}ps&&d.inWorkspace&&!wa&&!Ta&&!ja.isActive()&&(In(La(d.cameraPreset,!0,d.mode,d.activeTheaterId)),ps=!1),de=ja.step(w,pe).slewActive,Y.azimuth=k.lerp(Y.azimuth,pe.azimuth,R),Y.polar=k.lerp(Y.polar,pe.polar,R),Y.distance=k.lerp(Y.distance,pe.distance,R),Y.target.lerp(pe.target,R);let W=!1;if(!ba&&d.inWorkspace&&(Za??d.cameraPreset)==="canyon"&&v.observerDataset.dataSource==="firms"){const V=v.observerDataset.frames.length,z=Math.min(V-1,Math.max(0,Math.round(k.clamp(d.timeProgress,0,1)*(V-1)))),X=(((Ma=(Ss=v.declared)==null?void 0:Ss.byFrame.get(z))==null?void 0:Ma.length)??0)>0;if(X||vi==="estimate"&&dt.length>0){const j=d.workspaceSubjectFrame,ce=`${v.regionId}:${((ts=(na=v.observerDataset.frames[0])==null?void 0:na[0])==null?void 0:ts.timeUtc)??""}`;let Ge=0;for(const it of v.observerDataset.frames[z]??[])it.revealed&&!it.revealedByLook&&(Ge+=it.footprints.length);const Be=`${ce}:${z}:${X?"declared":pi}:${Ge}:${j?[j.left,j.top,j.right,j.bottom].map(it=>it.toFixed(3)).join(","):""}:${ft}x${vt}`;Be!==sc&&(sc=Be,!wa&&!Ta&&(Qt==="estimate"||Qt==="test"?W=!0:ps=!0))}}const O=d.filmMove!==void 0?d.filmMove:_n;O!==ic&&(ic=O,Pn=!1),Qt&&(wa||Ta)&&(Pn=!0),ms&&(Fn=v.observerDataset.dataSource==="firms"&&v.runId!==null&&!ba&&(v.pack?v.contextState!=="loading":v.packManifest===null||v.packState==="failed")&&f<Cp?Fn+w:0,(Fn>Ip||zt>Lp||!O||d.inWorkspace)&&(ms=!1,Dn=zt,S.domElement.style.transition=`opacity ${Eu}s ease-out`,S.domElement.style.opacity="1"));let J=null;if(O&&!Pn&&!(ba&&Wl)&&!ms&&!d.backdrop){J=O!=="auto"?O:d.inWorkspace?d.tileBoard?"play":Cs.x+Cs.y>.5?"test":"estimate":"record";const V=v.observerDataset.dataSource==="firms";J!=="record"&&(!d.inWorkspace||!V)&&(J=null)}if(J!==Qt){const V=Qt;if(Qt=J,po=zt,Bs=0,Za=null,kt=null,Ot=null,J){wa=!1;const z=La("canyon",!0,d.mode,d.activeTheaterId),X={...z,distance:z.distance*Tr,azimuth:z.azimuth+.04};if(J==="estimate")kt={...z,distance:z.distance*Ep,azimuth:z.azimuth-.06},Ot=X,qa=vu,Us=!0,Za="canyon";else if(J==="test"){const j={azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]};kt=V==="estimate"?j:X,Ot=kt,qa=0,Za="canyon"}else if(J==="play")kt=X,Ot=La("region",!0,d.mode,d.activeTheaterId),qa=Rp,Us=!0,Za="region";else{const j=d.inWorkspace?La("region",!0,d.mode,d.activeTheaterId):Na??wt;kt={...j,azimuth:j.azimuth-pu/2},Ot={...j,azimuth:j.azimuth+pu/2},qa=Tp,Us=!1,Za=d.inWorkspace?"region":null}}}if(W&&kt&&Ot&&(Qt==="estimate"||Qt==="test")){const V=La("canyon",!0,d.mode,d.activeTheaterId);kt={azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]},Ot={...V,distance:V.distance*Tr,azimuth:V.azimuth+.04},qa=Qt==="estimate"?vu:gu,Us=!0,po=zt}if(Hn)if(Hn=!1,Qt==="play"&&kt&&Ot){const V=La("region",!0,d.mode,d.activeTheaterId);Bs<1?Ot=V:(kt={azimuth:Y.azimuth,polar:Y.polar,distance:Y.distance,target:[Y.target.x,Y.target.y,Y.target.z]},Ot=V,qa=gu,Us=!0,po=zt,Bs=0,To=!0)}else!Qt&&d.cameraPreset==="region"&&d.inWorkspace&&!wa&&!Ta&&(In(La("region",!0,d.mode,d.activeTheaterId)),To=!0);if(Qt&&kt&&Ot){const V=qa>0?k.clamp((zt-po)/qa,0,1):1,z=Us?V*V*(3-2*V):V;let X=Ot.azimuth-kt.azimuth;for(;X>Math.PI;)X-=Math.PI*2;for(;X<-Math.PI;)X+=Math.PI*2;Y.azimuth=kt.azimuth+X*z,Y.polar=k.lerp(kt.polar,Ot.polar,z),Y.distance=kt.distance*Math.pow(Ot.distance/kt.distance,z),Y.target.set(k.lerp(kt.target[0],Ot.target[0],z),k.lerp(kt.target[1],Ot.target[1],z),k.lerp(kt.target[2],Ot.target[2],z)),pe.azimuth=Y.azimuth,pe.polar=Y.polar,pe.distance=Y.distance,pe.target.copy(Y.target),Bs=V}const ie=Math.sin(Y.polar);T.position.set(Y.target.x+Y.distance*ie*Math.sin(Y.azimuth),Y.target.y+Y.distance*Math.cos(Y.polar),Y.target.z+Y.distance*ie*Math.cos(Y.azimuth));const $=ro(T.position.x),Ze=lo(T.position.z);if($>=0&&$<=1&&Ze>=0&&Ze<=1){const V=bt($,Ze)+k.lerp(lu,Z0,Ja);T.position.y<V&&(T.position.y=V)}else if(v.context&&xa>.5){const V=ac(v,T.position.x,T.position.z)+lu;T.position.y<V&&(T.position.y=V)}T.lookAt(Y.target)}const be=!d.inWorkspace||d.cinemaActive?"cutaway":d.mode,xe=be==="cutaway"?1:0,Ke=be==="reconstruction"?1:0,ct=be==="observer"?1:0,xt=be==="world"||be==="earth"||v.observerDataset.dataSource==="firms"?0:be==="observer"?.45:1;C.uCutawayMix.value=k.lerp(C.uCutawayMix.value,xe,b),C.uReconMix.value=k.lerp(C.uReconMix.value,Ke,b),C.uObserverMix.value=k.lerp(C.uObserverMix.value,ct,b),C.uCutawayPlane.value=uu,C.uTime.value=zt,C.uUncertaintyMix.value=k.lerp(C.uUncertaintyMix.value,d.showUncertainty?1:0,R),C.uSensitivity.value=k.lerp(C.uSensitivity.value,d.sensitivityThreshold,R);const fe=d.observerFilter==="all"||d.observerFilter==="modis"?1:0,Ee=!d.holdoutViirs&&(d.observerFilter==="all"||d.observerFilter==="viirs")?1:0;C.uModisWeight.value=k.lerp(C.uModisWeight.value,fe,R),C.uViirsWeight.value=k.lerp(C.uViirsWeight.value,Ee,R),he=k.lerp(he,xt*k.lerp(1,$p,Va.value),b);const $e=vl(v.tensor,v.frameCount,re);C.uFrameMix.value=$e,C.uFireTime.value=k.clamp(re,0,1)*Math.max(1,v.frameCount-1);const ge=v.observerDataset.frames,we=Math.min(ge.length-1,Math.max(0,Math.round(re*(ge.length-1)))),Se=ge[we]??[],Oe=v.observerDataset.dataSource==="firms";if(Oe){rh(v,Ca,rs);const I=`${v.key}:${we}:${d.holdoutViirs?1:0}:${L?1:0}`,H=L&&(typeof d.landingPass=="number"||!!d.landingTour)&&!vs,W=I!==ls&&H&&ls.startsWith(`${v.key}:`)&&Ya.value>.02;if(W?Ya.value=Math.max(0,Ya.value-w/Wp):I===ls&&(Ya.value=H?Math.min(1,Ya.value+w/Vp):1),I!==ls&&!W){ls=I,Ya.value=H?0:1;const O=Se.find(z=>!la(z,d.holdoutViirs)&&!z.revealed)??Se.find(z=>!la(z,d.holdoutViirs)),J=Se.some(z=>z.family==="modis"&&!la(z,d.holdoutViirs)&&!z.revealed);hn=O?{index:we,sensor:O.sensorLabel,timeUtc:O.timeUtc??"",isDay:O.isDay!==!1,detections:O.footprints.length}:void 0;const ie=O??Se[0];if(d.passScan&&(d.inWorkspace||typeof d.landingPass=="number")&&ie&&!vs){const z=k.degToRad(ie.azimuthDeg);let X=Math.cos(z),j=-Math.sin(z);const ce=ie.orbitNode==="ascending";ie.orbitNode&&ce!==j>0&&(X=-X,j=-j),Wa.x=X,Wa.y=j,tl=zt}cs.length=0,zs.length=0,Cs.set(0,0);for(const z of Se)if(!la(z,d.holdoutViirs)){if(z.revealed){for(const X of z.footprints)zs.push(X);z.family==="modis"?Cs.x=1:Cs.y=1;continue}for(const X of z.footprints)cs.push(X)}const $=Se.find(z=>z.revealed&&!la(z,d.holdoutViirs));if(zs.length>0&&$){const z=k.degToRad($.azimuthDeg);let X=Math.cos(z),j=-Math.sin(z);$.orbitNode&&$.orbitNode==="ascending"!=j>0&&(X=-X,j=-j);const[ce,Ge,Be,it]=v.bbox;let Pt=1/0,Rt=-1/0,ta=0;for(const ra of zs){const fa=((ra.lon-ce)/Math.max(1e-9,Be-ce)-.5)*v.widthKm,Oa=((ra.lat-Ge)/Math.max(1e-9,it-Ge)-.5)*v.depthKm,Ks=fa*X+Oa*j;Pt=Math.min(Pt,Ks),Rt=Math.max(Rt,Ks),ta=Math.max(ta,ra.acrossTrackKm,ra.alongTrackKm)}Ls.x=X,Ls.y=j,Ls.w=Math.max(.2,ta),ll=Pt-ta,cl=Rt+ta+Ls.w,ul=vs?-1e9:zt}if(Zi.length=0,mi.value=0,Qi=void 0,cs.length===0&&Se.length>0&&Se.every(z=>z.revealed||la(z,d.holdoutViirs))&&v.residenceHours!==void 0){const z=Date.parse(((Ba=Se[0])==null?void 0:Ba.timeUtc)??"");for(let X=we-1;X>=0&&Zi.length===0;X--)for(const j of ge[X]??[]){if(j.revealed||la(j,d.holdoutViirs)||j.footprints.length===0)continue;for(const Be of j.footprints)Zi.push(Be);const ce=Date.parse(j.timeUtc??""),Ge=Number.isFinite(z)&&Number.isFinite(ce)?Math.max(0,(z-ce)/36e5):0;mi.value=Math.exp(-Ge/(v.residenceHours??1)),Qi={index:X,sensor:j.sensorLabel,timeUtc:j.timeUtc??"",hoursBefore:Ge}}}const V=v.fieldScale??Zs;Qp(V,Yi),Wi.build(cs,v.bbox,[v.widthKm,v.depthKm],z=>(Oo(V,z)-Yi.x)/Math.max(.001,Yi.y-Yi.x),zs,Zi),nl.value=J?1:0}}else hn=void 0,ls="",mi.value=0,Qi=void 0;const Yt=(zt-tl)/vp;if(Oe&&Yt>=0&&Yt<1){const I=.5*(Math.abs(Wa.x)*v.widthKm+Math.abs(Wa.y)*v.depthKm)+1.5;Wa.z=-I+2*I*Yt,Wa.w=1}else Wa.w=0;ml!==v.key&&(ml=v.key,pl=Oe&&!ge.some(I=>I.some(H=>H.hidden||H.revealed))),dn.value=k.lerp(dn.value,pl&&!d.holdoutViirs?1:0,R);const Ie=Oe&&v.runId?jr.get(v.runId):void 0;if(Ie&&!d.backdrop){al!==v.key&&(al=v.key,an=ge.map(ie=>{var $;return Date.parse((($=ie[0])==null?void 0:$.timeUtc)??"")}));const I=k.clamp(re,0,1)*Math.max(1,ge.length-1),H=Math.min(ge.length-1,Math.floor(I)),W=Math.min(ge.length-1,H+1),O=an[H],J=an[W];if(Number.isFinite(O)&&Number.isFinite(J)){const ie=O+(J-O)*(I-H)+Ie.info.stepMs;Jr!==v.key&&(Jr=v.key,Zo=null),Se.length>0&&Se.every($=>$.revealed||la($,d.holdoutViirs))&&(Zo=we),qr.value=oa.sync(Ie,v.key,ie,Zo)}else oa.clear()}else oa.clear();C.uLipariTex.value=oa.grid.x>0?oa.texture:Ka,Qr.value=oa.grid.x>0&&oa.declaredGiven?1:0,rn.value=k.lerp(rn.value,d.chanceSquares?1:0,R);{const I=!!(d.filmMove??_n),H=k.clamp((zt-ul)/(I?bp:yp),0,1),W=I?H*H*(3-2*H):1-(1-H)*(1-H);Ls.z=H>=1?1e4:k.lerp(ll,cl,W)}const Ms=Oe&&Se.length>0&&Se.every(I=>I.revealed||la(I,d.holdoutViirs))?1:0;qo.value=k.lerp(qo.value,Ms,1-Math.exp(-w*6)),Zr.value=Oe&&v.answeredByOther?1:0,tn=k.lerp(tn,(!Oe||cs.length>0?1:.5*mi.value)*Ya.value,1-Math.exp(-w*4)),C.uPixelOutline.value=k.lerp(C.uPixelOutline.value,d.detectionPixels?1:0,R),un.value=L?0:k.smoothstep(Y.distance,8.5,15),fi.value=k.lerp(fi.value,(L?1:k.lerp(Np,zp,un.value))*Gp((Ri=v.pack)==null?void 0:Ri.pictureMedianLuma),b),di=Oe&&Se[0]?{index:we,sensor:Se[0].sensorLabel,timeUtc:Se[0].timeUtc??"",isDay:Se[0].isDay!==!1,hidden:Se.every(I=>I.revealed||la(I,d.holdoutViirs))&&!Se.some(I=>I.revealed&&!I.revealedByLook)}:void 0,C.uFireHist.value=Oe?Wi.lightTexture:ee(v).texture,nn=void 0;let $t=null;if(d.dayPicture&&Oe&&d.inWorkspace&&((Hs=Se[0])!=null&&Hs.timeUtc)&&v.runId){const I=(di==null?void 0:di.hidden)===!0,H=Se.find($=>!la($,d.holdoutViirs)&&!$.revealed)??Se[0],W=I?"MODIS_AQUA":dp(H.sensorLabel)??"MODIS_AQUA",O=Se[0].timeUtc.slice(0,10),J=Ha(x.current,`/api/gibs/day?region_id=${encodeURIComponent(v.regionId)}&day=${O}&platform=${W}&kind=${d.dayPicture}`);let ie=$i.get(J);ie===void 0&&($i.set(J,"loading"),ie="loading",N.load(J,$=>{$.colorSpace=nt,$.anisotropy=P,$.wrapS=Ve,$.wrapT=Ve,$i.set(J,$)},void 0,()=>$i.set(J,"missing"))),ie!=="loading"&&ie!=="missing"&&($t=ie),nn={state:ie==="loading"?"loading":ie==="missing"?"missing":"shown",platform:W,kind:d.dayPicture,day:O,insteadOfHidden:I}}if($t){C.uSatNext.value=$t,C.uSatPrev.value=$t,C.uSatSharpen.value=0;const I=$t.image;C.uOrthoTexelKm.value=v.widthKm/Math.max(1,(I==null?void 0:I.width)??256),Xi=!0,sn.value=Sp,on.value=d.dayPicture==="false_color"?1:0}else Xi&&(C.uSatNext.value=v.satTex,C.uSatPrev.value=Z.satTex,C.uSatSharpen.value=v.sharpen,C.uOrthoTexelKm.value=v.orthoTexelKm,Xi=!1,sn.value=0,on.value=0);rl.value=v.runId===null?0:1;const Aa=d.backdrop?1:$t?0:Oe&&((as=Se[0])==null?void 0:as.isDay)===!1||v.runId===null?1:0;Va.value=k.lerp(Va.value,Aa,1-Math.exp(-w*2.4)),wl.value=Va.value;const Jt=v.fieldScale??Zs;il.set(Jt.kind==="linear"?0:1,Jt.maxMwKm2,Jt.minMwKm2),jp(Jt,ol),sl.set(Oe?1:0,Oe?1:0),Oc(Se.find(I=>I.family==="modis"),Ho,Mi),Oc(Se.find(I=>I.family==="viirs"&&!la(I,d.holdoutViirs)),ei,yi),kl.set(Mi.axisEast,Mi.axisNorth,Mi.nadirKm,Mi.valid?1:0),_l.set(yi.axisEast,yi.axisNorth,yi.nadirKm,yi.valid?1:0),Ro=k.lerp(Ro,be==="observer"?1:0,b),!Gl&&be==="observer"&&(Gl=!0,Xa.loadModels("/isogon/"));{const I=k.smoothstep(Y.distance,8.5,11.5);if(bn=k.lerp(bn,be==="observer"?I:0,b),oo.length=0,Ro>=.01){let H=!1,W=!1;for(const O of Se){if(oo.length>=hu)break;if(la(O,d.holdoutViirs)||d.observerFilter==="modis"&&O.family!=="modis"||d.observerFilter==="viirs"&&O.family!=="viirs")continue;const J=O.family==="modis"?!H:!W;O.family==="modis"?H=!0:W=!0,oo.push({sensorLabel:O.sensorLabel,family:O.family,azimuthDeg:O.azimuthDeg,scanAngleDeg:O.scanAngleDeg,orbitNode:O.orbitNode,groundStrip:J})}}Xa.update(oo,{sky:bn,strip:Ro,dtSec:w,sampleTerrainY:bt,slabWidth:Je.width,slabDepth:Je.depth,unitsPerMetre:v.frame.unitsPerMetre}),Fl.set(Xa.strips.modis.alongTrackKm,Xa.strips.modis.strength,Xa.strips.viirs.alongTrackKm,Xa.strips.viirs.strength)}mn.position.copy(T.position);{const I=k.lerp(Z.minElevM,v.minElevM,Zt),H=Math.max(.05,(I+T.position.y/v.frame.unitsPerMetre[1])*.001);$a.uCamAltKm.value=H,oe=k.lerp(oe,L||d.inWorkspace&&(d.cleanHud||d.cinemaActive)?1:0,b),Ja=k.lerp(Ja,L?1:0,b),$a.uSkyExposure.value=k.lerp(er,k.lerp(rd,J0,Ja),oe),C.uLatticeMix.value=1-Ja;const W=Za??d.cameraPreset,O=d.inWorkspace?W==="region"||W==="canyon"&&v.observerDataset.dataSource==="firms"?1:1-k.smoothstep(Y.distance,8.5,11.5):L?1:0,J=v.context!==null&&!ba;xa=ms?J?O:0:k.lerp(xa,J?O:0,b),C.uContextMix.value=xa,io.mesh.visible=xa>.003,Si.visible=Ja<.5&&xa<.5,to.visible=Ja<.5&&xa<.5,C.uSkyExposure.value=$a.uSkyExposure.value,C.uEdgeFade.value=k.lerp(C.uEdgeFade.value,v.context?0:d.inWorkspace?1-k.smoothstep(Y.distance,8.5,11.5):L&&(fo.floorShare>0||fo.seaShare>0)?1:0,b);const ie=Math.max(C.uEdgeFade.value,xa);gn.uniforms.uShadowMix.value=1-ie,$a.uFloorHaze.value=k.lerp(.3,k.lerp(1,tp,ie),oe),$a.uFloorColor.value.set(.044,.06,.094).lerp(sv,oe),wi.update(S,eo,H)}T.updateMatrixWorld();const ea=Math.max(As(Z.maxElevM,Z),As(v.maxElevM,v));K.enabled=he>.01,L&&(T.updateMatrixWorld(),G0(T,H0(ws??cu),Hl)),C.uSmokeShadowMix.value=K.enabled?1:0,K.enabled&&K.update({camera:T,slabWidth:Je.width,slabDepth:Je.depth,reliefTop:ea,heightPrev:q(Z),heightNext:q(v),morph:Zt,field0:Le,field1:rt,detection0:v.observerDataset.dataSource==="firms"?Gi:null,detection1:v.observerDataset.dataSource==="firms"?Ki:null,frameMix:C.uFrameMix.value,windUv:xn,sunDir:ye,sunColor:fn,time:zt,opacity:he,cutawayMix:C.uCutawayMix.value,cutawayPlane:uu,cutawayDir:Sl,lid:Hl,lidAmount:Ja,clearRadius:Q0,thinOverFire:Oe?.82:0,night:Va.value,fireLight:tn}),B.render(w);const ys=d.onCurtainScreen;ys&&!hc&&(ys({near:{x:0,y:0},far:{x:0,y:0},modisSide:"left",visible:!1}),hc=!0);const le=d.tileBoard,Xe=!!le&&le.cols>=1&&le.rows>=1&&le.cols*le.rows<=64;if(!!le!==nc&&(nc=!!le,d.cameraPreset==="region"&&(ps=!0)),le&&Xe){Qo.set(le.cols,le.rows);const I=le.cols*le.rows;for(let W=0;W<I;W++){const O=le.tiles[W];el[W].set(k.clamp((O==null?void 0:O.level)??0,0,1),O!=null&&O.looked?1:0,O!=null&&O.chosen?1:0,O!=null&&O.closed?1:0)}const H=le.pickable&&!Ta&&Number.isFinite(xo)?fc(xo,Un,le.cols,le.rows):null;if(Jo.value=H??-1,H!==Vi&&(Vi=H,(ko=d.onTileHover)==null||ko.call(d,H)),d.onTileAnchors){en.length=0;for(let W=0;W<I;W++){const O=W%le.cols/le.cols,J=1-Math.floor(W/le.cols)/le.rows;lt.set(Wt(O),bt(O,J),Vt(J)).project(T);const ie=(lt.x*.5+.5)*ft,$=(-lt.y*.5+.5)*vt;en.push({tile:W,x:ie,y:$,visible:lt.z>-1&&lt.z<1&&ie>=0&&ie<=ft&&$>=0&&$<=vt})}d.onTileAnchors(en.slice())}}else Qo.set(0,0),Jo.value=-1,Vi!==null&&(Vi=null,(Ai=d.onTileHover)==null||Ai.call(d,null));if(d.onFireAnchor&&d.inWorkspace&&Oe){const I=cs.length>0?cs:zs,H=Ie?Math.round(oa.grid.x)+":"+oa.stepKey:"",W=`${ls}:${I.length}:${I.length===0?H:""}`;if(W!==pi){pi=W;const[J,ie,$,Ze]=v.bbox;if(I.length>0){vi="detections",dt=new Float32Array(I.length*3);const V=new Float32Array(I.length*2);I.forEach((z,X)=>{dt[X*3]=(z.lon-J)/Math.max(1e-9,$-J),dt[X*3+1]=(z.lat-ie)/Math.max(1e-9,Ze-ie),dt[X*3+2]=Math.max(1,z.frpMw),V[X*2]=.5*z.acrossTrackKm/Math.max(1e-6,v.widthKm),V[X*2+1]=.5*z.alongTrackKm/Math.max(1e-6,v.depthKm)}),us=Di(dt,k.clamp(Math.round(v.widthKm/Ru),8,512),k.clamp(Math.round(v.depthKm/Ru),8,512),V)}else{vi="estimate";const V=Ie!=null&&Ie.declared&&Ie.declared.nx===Ie.info.nx&&Ie.declared.ny===Ie.info.ny?Ie.declared.byFrame.get(we):void 0;if(Ie&&V&&V.length>0){const{nx:z,ny:X}=Ie.info;dt=new Float32Array(V.length*3),V.forEach((j,ce)=>{dt[ce*3]=(j%z+.5)/z,dt[ce*3+1]=1-(Math.floor(j/z)+.5)/X,dt[ce*3+2]=1})}else dt=Ie?oa.cellsAbove(Ie,Yp,z=>Nu(v.fieldScale??Zs,z)):new Float32Array(0);us=Ie?Di(dt,Ie.info.nx,Ie.info.ny):{patchOf:new Uint16Array(0),sizes:[]}}}const O=dt.length/3;if(O===0)gi&&d.onFireAnchor(null),gi=!1,Ji="",xi=null;else{const J=`${pi}:${Z.key}:${v.key}`,ie=T.matrixWorld.elements,$=T.projectionMatrix.elements;let Ze=xi!==null&&J===Ji&&Kt[0]===we&&Kt[1]===Zt&&Kt[2]===ft&&Kt[3]===vt&&Kt[4]===Je.width&&Kt[5]===Je.depth;if(Ze){for(let V=0;V<16;V++)if(Kt[6+V]!==ie[V]||Kt[22+V]!==$[V]){Ze=!1;break}}if(!Ze){let V=0,z=0,X=0,j=1/0,ce=-1/0,Ge=1/0,Be=-1/0;const it=Math.min(Sr,us.sizes.length);for(let me=0;me<it;me++)Qe[me*7]=0,Qe[me*7+1]=0,Qe[me*7+2]=0,Qe[me*7+3]=1/0,Qe[me*7+4]=1/0,Qe[me*7+5]=-1/0,Qe[me*7+6]=-1/0;for(let me=0;me<O;me++){const ot=dt[me*3],ma=dt[me*3+1],pa=dt[me*3+2];V+=ot*pa,z+=ma*pa,X+=pa;const It=us.patchOf[me]<it?us.patchOf[me]*7:-1;if(It>=0&&(Qe[It]+=ot*pa,Qe[It+1]+=ma*pa,Qe[It+2]+=pa),lt.set(Wt(ot),bt(ot,ma),Vt(ma)).project(T),lt.z<=-1||lt.z>=1)continue;const Ts=(lt.x*.5+.5)*ft,Ws=(-lt.y*.5+.5)*vt;j=Math.min(j,Ts),ce=Math.max(ce,Ts),Ge=Math.min(Ge,Ws),Be=Math.max(Be,Ws),It>=0&&(Qe[It+3]=Math.min(Qe[It+3],Ts),Qe[It+4]=Math.min(Qe[It+4],Ws),Qe[It+5]=Math.max(Qe[It+5],Ts),Qe[It+6]=Math.max(Qe[It+6],Ws))}let Pt=0,Rt=0;const ta=(me,ot)=>{const ma=bt(me,ot);if(lt.set(Wt(me),ma,Vt(ot)).project(T),Pt=(lt.x*.5+.5)*ft,Rt=(-lt.y*.5+.5)*vt,!(lt.z>-1&&lt.z<1&&Pt>=0&&Pt<=ft&&Rt>=0&&Rt<=vt))return!1;const pa=T.position.x,It=T.position.y,Ts=T.position.z,Ws=Wt(me),Ah=Vt(ot);for(let Yn=1;Yn<48;Yn++){const $n=Yn/48,Xn=ro(pa+(Ws-pa)*$n),jn=lo(Ts+(Ah-Ts)*$n);if(!(Xn<0||Xn>1||jn<0||jn>1)&&bt(Xn,jn)>It+(ma-It)*$n+.012)return!1}return!0};for(let me=0;me<it;me++)hs[me*3]=1/0;const ra=v.widthKm,fa=v.depthKm;for(let me=0;me<O;me++){const ot=us.patchOf[me];if(ot>=it)continue;const ma=(dt[me*3]-Qe[ot*7]/Qe[ot*7+2])*ra,pa=(dt[me*3+1]-Qe[ot*7+1]/Qe[ot*7+2])*fa,It=ma*ma+pa*pa;It<hs[ot*3]&&(hs[ot*3]=It,hs[ot*3+1]=dt[me*3],hs[ot*3+2]=dt[me*3+1])}const Oa=[];for(let me=0;me<it;me++){const ot=me*7,ma=ta(hs[me*3+1],hs[me*3+2]);Oa.push({x:Pt,y:Rt,left:Number.isFinite(Qe[ot+3])?Qe[ot+3]:Pt,top:Number.isFinite(Qe[ot+4])?Qe[ot+4]:Rt,right:Number.isFinite(Qe[ot+5])?Qe[ot+5]:Pt,bottom:Number.isFinite(Qe[ot+6])?Qe[ot+6]:Rt,cells:us.sizes[me],visible:ma})}const Ks=ta(V/X,z/X),Wn=Pt,Vn=Rt;xi={frame:we,from:vi,x:Wn,y:Vn,left:Number.isFinite(j)?j:Wn,top:Number.isFinite(Ge)?Ge:Vn,right:Number.isFinite(ce)?ce:Wn,bottom:Number.isFinite(Be)?Be:Vn,visible:Ks,patches:Oa},Ji=J,Kt[0]=we,Kt[1]=Zt,Kt[2]=ft,Kt[3]=vt,Kt[4]=Je.width,Kt[5]=Je.depth;for(let me=0;me<16;me++)Kt[6+me]=ie[me],Kt[22+me]=$[me]}d.onFireAnchor(xi),gi=!0}}else gi&&((ki=d.onFireAnchor)==null||ki.call(d,null),gi=!1,pi="",Ji="",xi=null);const et=o.current;if(et){let I=!1;if(d.inWorkspace&&!L&&!d.cinemaActive&&Y.distance>wp){const H=[[0,0,1,0,v.widthKm],[1,0,1,1,v.depthKm],[1,1,0,1,v.widthKm],[0,1,0,0,v.depthKm]];let W=H[0],O=1/0;for(const ce of H){const Ge=Wt((ce[0]+ce[2])*.5)-T.position.x,Be=Vt((ce[1]+ce[3])*.5)-T.position.z,it=Ge*Ge+Be*Be;it<O&&(O=it,W=ce)}const J=W[4];let ie=1;for(const ce of[1,2,5,10,20,50,100])ce<=J*.3&&(ie=ce);const $=ce=>{const Ge=Mp+ce/J;return[W[0]+(W[2]-W[0])*Ge,W[1]+(W[3]-W[1])*Ge]},Ze=.07*(1-xa);let V=1/0;for(let ce=0;ce<=8;ce++){const[Ge,Be]=$(ie*ce/8);V=Math.min(V,bt(Ge,Be))}const z=ce=>{const[Ge,Be]=$(ce);return lt.set(Wt(Ge),V-Ze,Vt(Be)).project(T),lt.z<=-1||lt.z>=1?null:[(lt.x*.5+.5)*ft,(-lt.y*.5+.5)*vt]},X=z(0),j=z(ie);if(X&&j){const ce=Math.hypot(j[0]-X[0],j[1]-X[1]);if(ce>40){let Ge=-(j[1]-X[1])/ce,Be=(j[0]-X[0])/ce;Be>0&&(Ge=-Ge,Be=-Be);const it=(fa,Oa)=>`M${fa[0].toFixed(1)},${fa[1].toFixed(1)} L${(fa[0]+Ge*Oa).toFixed(1)},${(fa[1]+Be*Oa).toFixed(1)}`,Pt=`${it(X,7)} M${X[0].toFixed(1)},${X[1].toFixed(1)} L${j[0].toFixed(1)},${j[1].toFixed(1)} ${it(j,7)}`;Pt!==hl&&(hl=Pt,(Gs=l.current)==null||Gs.setAttribute("d",Pt));const Rt=u.current,ta=j[0]>=X[0]?j:X,ra=`${ie} km|${(ta[0]+8).toFixed(1)}|${(ta[1]+4).toFixed(1)}`;if(Rt&&ra!==dl){dl=ra;const[fa,Oa,Ks]=ra.split("|");Rt.textContent=fa,Rt.setAttribute("x",Oa),Rt.setAttribute("y",Ks)}I=!0}}}I!==fl&&(fl=I,et.style.opacity=I?"1":"0")}const qe=d.inWorkspace&&!d.cleanHud&&!d.cinemaActive,Tt=br(v),[mt,ne,Ae,Fe]=v.bbox,tt=Math.max(1e-4,Ae-mt),He=Math.max(1e-4,Fe-ne),se=[],De=232,Et=gt?gt.left*ft+12:24,_t=Math.max(Et,(gt?gt.right*ft-12:ft-356)-De),Ft=gt?gt.top*vt+12:68,Ua=Math.max(Ft,gt?gt.bottom*vt-76:Math.max(160,vt-134)),bs=gt?(gt.left+gt.right)*.5*ft:ft*.44;for(let I=0;I<3;I++){const H=Tt[I];if(!qe||!H){se.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const W=k.clamp((H.lon-mt)/tt,.04,.96),O=k.clamp((H.lat-ne)/He,.04,.96),J=bt(W,O)+.05;if(lt.set(Wt(W),J,Vt(O)).project(T),lt.z>=1||lt.z<=-1){se.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const ie=(lt.x*.5+.5)*ft,$=(-lt.y*.5+.5)*vt,V=(I===1||ie+108>_t||ie>bs?-1:1)>0?ie+56:ie-56-De,z=k.clamp(V,Et,_t),X=k.clamp($-(I===0?64:I===1?48:-44),Ft,Ua);se.push({ax:ie,ay:$,bx:z,by:X,valid:!0})}const Xt=240,Dt=62;for(let I=0;I<2;I++)for(let H=0;H<se.length;H++)if(se[H].valid)for(let W=H+1;W<se.length;W++){if(!se[W].valid)continue;const O=se[W].bx-se[H].bx,J=se[W].by-se[H].by;if(Math.abs(O)<Xt&&Math.abs(J)<Dt){const ie=(Dt-Math.abs(J))*.55*(J>=0?1:-1);se[H].by=k.clamp(se[H].by-ie,Ft,Ua),se[W].by=k.clamp(se[W].by+ie,Ft,Ua)}}for(let I=0;I<3;I++){const H=se[I],W=s.current[I],O=i.current[I],J=a.current[I];if(!H||!H.valid){W&&(W.style.opacity="0"),O&&(O.style.opacity="0",O.style.pointerEvents="none",O.style.visibility="hidden"),J&&(J.style.opacity="0");continue}if(W&&(W.style.opacity="1",W.style.transform=`translate3d(${H.ax.toFixed(1)}px, ${H.ay.toFixed(1)}px, 0) translate(-50%, -50%)`),O&&(O.style.opacity="1",O.style.pointerEvents="auto",O.style.visibility="visible",O.style.transform=`translate3d(${H.bx.toFixed(1)}px, ${H.by.toFixed(1)}px, 0)`),J){const ie=H.ax+(H.bx-H.ax)*.42,$=H.by+22,Ze=H.bx>H.ax?H.bx:H.bx+(O?O.offsetWidth:De);J.setAttribute("points",`${H.ax.toFixed(1)},${H.ay.toFixed(1)} ${ie.toFixed(1)},${$.toFixed(1)} ${Ze.toFixed(1)},${$.toFixed(1)}`),J.style.opacity="1"}}Gn+=1,Ao+=w;const ka=ms?"holding":Dn>=0&&zt-Dn<Eu?"fading":"shown",es=ka!==oc;if(oc=ka,Ao>=.32||es){const I=Gn/Math.max(.001,Ao);if(Kn=Kn*.55+Math.min(120,I)*.45,Gn=0,Ao=0,zt-Ec>=.3||es){Ec=zt;const H={fps:Math.round(Kn),renderScale:+vo.toFixed(2),slowDevice:_,vertexCount:ao.geometry.getAttribute("position").count+Si.geometry.getAttribute("position").count,orthoResolution:v.orthoLabel,demResolution:v.demLabel,activeTheaterId:d.activeTheaterId,slewActive:de||ba,cinemaProgress:Ue,wavePosition:0,imageryAttribution:tv(v),missingFiles:fp(v,p.current),film:Qt?{move:Qt,progress:Bs}:void 0,verticalExaggeration:Lr,landingStandpoint:L&&Na?fo:void 0,intensityLegend:pp(v),realPass:hn,lastSeen:Qi,passOnShow:di,dayPicture:nn,picture:ka,regionGrid:d.regionGridDivisions?Mh(v,d.regionGridDivisions):void 0};(_o=d.onTelemetry)==null||_o.call(d,H)}}};return On=requestAnimationFrame(Rc),()=>{var w;m=!0,cancelAnimationFrame(On),lc.disconnect(),Qa==null||Qa.removeEventListener("change",Ln),Ea.removeEventListener("pointerdown",mc),window.removeEventListener("pointermove",pc),window.removeEventListener("pointerup",vc),Ea.removeEventListener("pointerleave",gc),Ea.removeEventListener("wheel",xc),Mo.removeEventListener("change",Mc),Ea.removeEventListener("contextmenu",wc),Ml.dispose(),yl.dispose(),wi.dispose(),vn.dispose(),gn.dispose(),yn.dispose(),zl.dispose(),Ul.dispose(),Bl.dispose(),Ol.dispose();for(const d of G)d.dispose();Le.dispose(),rt.dispose(),Gi.dispose(),Ki.dispose(),Wi.dispose(),oa.dispose(),Ka.dispose(),ds==null||ds.dispose(),bi==null||bi.dispose(),Cl.dispose(),wn.dispose(),Mn.dispose();for(const d of Sa.values())Xl(d);Sa.clear(),io.dispose(),Xa.dispose(),D.environment=null,_e.dispose();const n=new Set,f=d=>{!d||n.has(d)||(n.add(d),d.dispose())};for(const d of new Set([...ue.values(),...Ye.values(),...ut,Z,v]))!d.pack&&d.lite===null&&(f(d.demTex),f(d.satTex)),f((w=d.fireHistory)==null?void 0:w.texture),f(d.shadow);B.dispose(),S.dispose(),Ea.parentElement===g&&g.removeChild(Ea),y.current=null}},[]),Ct.useEffect(()=>{var g;(g=y.current)==null||g.applyCameraPreset()},[e.cameraPreset,e.inWorkspace,e.mode]),Ct.useEffect(()=>{var g;(g=y.current)==null||g.syncCinemaStart(e.cinemaActive)},[e.cinemaActive]);const M=Ct.useRef(null),E=Ct.useRef(e.activeTheaterId);return Ct.useEffect(()=>{const g=y.current;if(!g)return;const m=e.slewRequest;if(m&&m.nonce!==M.current){M.current=m.nonce,E.current=m.targetTheaterId,g.triggerSlew(m.targetTheaterId);return}e.activeTheaterId!==E.current&&(E.current=e.activeTheaterId,g.triggerSlew(e.activeTheaterId))},[e.activeTheaterId,e.slewRequest]),Ct.useEffect(()=>{const g=e.activeRun,m=y.current;if(!g||!m)return;let S=!1;const _=m.takeRunBundle(g.run_id);if(_){m.activateBundle(_,_.regionId!==m.onScreenRegionId());return}return(async()=>{var F;try{const P=m.bundleCache.get(g.region.id),N=g.assets.dem_hires_f32_url?Ha(x.current,g.assets.dem_hires_f32_url):null,D=Ha(x.current,g.assets.dem_f32_url),T=Ha(x.current,g.assets.satellite_url),B=!!(x.current.filmMove??mu()),K=Ha(x.current,g.assets.reconstruction_u8_url),G=async()=>{if(N){const rt=await fetch(N).catch(()=>null);if(rt&&rt.ok)return rt.arrayBuffer()}const Le=await fetch(D).catch(()=>null);return Le&&Le.ok?Le.arrayBuffer():null},q=()=>new Promise(Le=>{if(B){Le(null);return}m.texLoader.load(T,rt=>{rt.colorSpace=nt,rt.anisotropy=m.maxAnisotropy,rt.minFilter=Ga,rt.magFilter=ze,rt.wrapS=Ve,rt.wrapT=Ve,Le(rt)},void 0,()=>Le(null))}),[he,oe,ye]=await Promise.all([G(),q(),fetch(K).catch(()=>null)]),Me=ye&&ye.ok?await ye.arrayBuffer():null;if(S)return;const _e=Au(g.region.id)?Li[g.region.id]:null,ue=g.region.bbox,Ye=g.observer_passes?Qh(g.observer_passes,ue):yr(),ve=Ye.dataSource==="firms",ee=[],st=P&&!(ve&&P.noRealGround)?P:void 0,Z=P&&!(ve&&P.noRealPicture)?P:void 0;ve&&!he&&!st&&ee.push("elevation"),ve&&!oe&&!Z&&!B&&ee.push("imagery"),ve&&!Me&&ee.push("field");const v=he?ks(new Float32Array(he),!0):st?{texture:st.demTex,aligned:st.alignedDem,gridRes:st.demGridRes,minElev:st.minElevM,maxElev:st.maxElevM}:ks(ve?new Float32Array(4096).fill(Number.isFinite(g.region.min_elev_m)?g.region.min_elev_m:0):Fc("plumas_ca",256),!1),ut=Me?Md(new Uint8Array(Me),!0):ve||!P?{buffer:Mr(),frames:Js}:{buffer:P.tensor,frames:P.frameCount},Nt=oe??(Z==null?void 0:Z.satTex)??(ve?hp():null)??Dc(_e?_e.id:"plumas_ca",v.aligned,v.gridRes,v.minElev,v.maxElev,m.maxAnisotropy),Bt=oe&&typeof((F=oe.image)==null?void 0:F.width)=="number"?oe.image.width:2048,Gt=_r(g.region.id,ue,v.aligned,v.gridRes,ut.buffer,ut.frames),da=g.region.min_elev_m<=1.5,jt={key:`run-${g.run_id}`,regionId:g.region.id,runId:g.run_id,missingFiles:ee.length>0?ee:void 0,demTex:v.texture,alignedDem:v.aligned,demGridRes:v.gridRes,minElevM:Number.isFinite(g.region.min_elev_m)?Math.min(v.minElev,g.region.min_elev_m):v.minElev,maxElevM:Number.isFinite(g.region.max_elev_m)?Math.max(v.maxElev,g.region.max_elev_m):v.maxElev,satTex:Nt,orthoLabel:oe?Bt>=1600?"2K":"1K":(Z==null?void 0:Z.orthoLabel)??(ve?"not loaded":"drawn stand-in"),demLabel:he||st||!ve?`${v.gridRes}²`:"not loaded",noRealGround:he?void 0:st?st.noRealGround:!0,noRealPicture:oe?void 0:Z?Z.noRealPicture:!0,tensor:ut.buffer,frameCount:ut.frames,bbox:ue,windDirUv:[...Kp],hasSeaCoast:da,observerDataset:Ye,findings:Gt.anchors,callouts:Gt.callouts,fieldScale:ed(g.encoding),residenceHours:Jh(g.model)??void 0,declared:ir(g.declared_cells),answeredByOther:up(g),fireHistory:null,...kr(Math.max(18,g.region.width_km||60),Math.max(12,g.region.depth_km||xr(ue)),g.assets.terrain_pack,Bt,oe?_u:(Z==null?void 0:Z.attribution)??"")};m.storeRunBundle(g.region.id,g.run_id,jt);const at=td(g.belief_frames),ht=h.current,qt=at&&!ht.has(g.run_id)?[...ht.values()].find(Le=>Le.info.url===at.url&&Le.info.steps===at.steps):void 0;if(at&&qt)for(ht.set(g.run_id,{info:at,bytes:qt.bytes,declared:ir(g.declared_cells)});ht.size>6;)ht.delete(ht.keys().next().value);at&&!ht.has(g.run_id)&&fetch(Ha(x.current,at.url)).then(Le=>Le.ok?Le.arrayBuffer():null).then(Le=>{if(!Le||Le.byteLength!==at.steps*at.nx*at.ny*2){p.current.add(g.run_id);return}for(ht.set(g.run_id,{info:at,bytes:new Uint8Array(Le),declared:ir(g.declared_cells)});ht.size>6;)ht.delete(ht.keys().next().value)}).catch(()=>{p.current.add(g.run_id)});const Ce=x.current.activeTheaterId;(!Au(g.region.id)||g.region.id===Ce)&&m.activateBundle(jt,!0)}catch{}})(),()=>{S=!0}},[e.activeRun,e.apiBase]),sa.jsx("div",{ref:t,tabIndex:0,role:"application","aria-label":"3D terrain of the place, with the fire on it",onKeyDown:g=>{var m;!e.inWorkspace&&g.key==="Enter"&&((m=e.onEnterWorkspace)==null||m.call(e))},style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",outline:"none",backgroundColor:"#080b11",cursor:e.inWorkspace?"grab":"pointer"},children:sa.jsxs("div",{"aria-hidden":!e.inWorkspace||e.cleanHud||e.cinemaActive,style:{position:"absolute",inset:0,pointerEvents:"none",zIndex:5},children:[sa.jsxs("svg",{width:"100%",height:"100%",style:{position:"absolute",inset:0,overflow:"visible",pointerEvents:"none"},children:[[0,1,2].map(g=>sa.jsx("polyline",{ref:m=>{a.current[g]=m},fill:"none",stroke:r[g]&&e.selectedFindingId===r[g].id?"rgba(155, 227, 255, 0.88)":"rgba(245, 246, 250, 0.34)",strokeWidth:"1",style:{opacity:0,transition:"stroke 160ms ease"}},g)),sa.jsxs("g",{ref:o,className:"stage-scale",style:{opacity:0},children:[sa.jsx("path",{ref:l,fill:"none",stroke:"rgba(243, 244, 246, 0.72)",strokeWidth:"1"}),sa.jsx("text",{ref:u,fill:"rgba(243, 244, 246, 0.92)",stroke:"rgba(8, 11, 17, 0.72)",strokeWidth:"3",style:{fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",paintOrder:"stroke"}})]})]}),[0,1,2].map(g=>{const m=r[g],S=!!(m&&e.selectedFindingId===m.id),_=(m==null?void 0:m.kind)==="uncertainty"?"#9be3ff":(m==null?void 0:m.kind)==="subpixel"?"#ffb36b":"#ff7849";return sa.jsxs("div",{children:[sa.jsx("div",{ref:F=>{s.current[g]=F},style:{position:"absolute",top:0,left:0,width:"14px",height:"14px",display:"flex",alignItems:"center",justifyContent:"center",color:_,fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"13px",fontWeight:600,lineHeight:1,textShadow:"0 1px 6px rgba(0, 0, 0, 0.9)",opacity:0,willChange:"transform, opacity"},children:"+"}),sa.jsxs("button",{ref:F=>{i.current[g]=F},type:"button","data-stage-ui":"true",onClick:()=>{var F;m&&((F=e.onSelectFinding)==null||F.call(e,m))},style:{position:"absolute",top:0,left:0,minWidth:"188px",maxWidth:"248px",padding:"7px 10px",textAlign:"left",borderRadius:0,border:S?`1px solid ${_}`:"1px solid rgba(243, 244, 246, 0.24)",background:"rgba(10, 13, 19, 0.88)",color:"#f3f4f6",cursor:"pointer",opacity:0,visibility:"hidden",pointerEvents:"none",willChange:"transform, opacity"},children:[sa.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px",fontFamily:"'Geist', -apple-system, sans-serif",fontSize:"13px",fontWeight:500,letterSpacing:"-0.01em",color:"#f3f4f6"},children:[sa.jsx("span",{children:(m==null?void 0:m.title)??""}),sa.jsx("span",{style:{width:"6px",height:"6px",borderRadius:0,backgroundColor:_,flexShrink:0}})]}),sa.jsx("div",{style:{marginTop:"3px",fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",fontVariantNumeric:"tabular-nums",color:_},children:(m==null?void 0:m.valueText)??""})]})]},g)})]})})}export{cv as EarthCutawayStage,cv as default};
