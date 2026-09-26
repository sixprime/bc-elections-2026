var i=(e,t,a=[])=>{let f=document.createElementNS("http://www.w3.org/2000/svg",e);return Object.keys(t).forEach(r=>{f.setAttribute(r,String(t[r]))}),a.length&&a.forEach(r=>{let l=i(...r);f.appendChild(l)}),f},n=([e,t,a])=>i(e,t,a);var M=e=>Array.from(e.attributes).reduce((t,a)=>(t[a.name]=a.value,t),{}),F=e=>typeof e=="string"?e:!e||!e.class?"":e.class&&typeof e.class=="string"?e.class.split(" "):e.class&&Array.isArray(e.class)?e.class:"",D=e=>e.flatMap(F).map(a=>a.trim()).filter(Boolean).filter((a,f,r)=>r.indexOf(a)===f).join(" "),L=e=>e.replace(/(\w)(\w*)(_|-|\s*)/g,(t,a,f)=>a.toUpperCase()+f.toLowerCase()),s=(e,{nameAttr:t,icons:a,attrs:f})=>{let r=e.getAttribute(t);if(r==null)return;let l=L(r),d=a[l];if(!d)return console.warn(`${e.outerHTML} icon name was not found in the provided icons object.`);let p=M(e),[P,k,A]=d,m={...k,"data-lucide":r,...f,...p},x=D(["lucide",`lucide-${r}`,p,f]);x&&Object.assign(m,{class:x});let B=n([P,m,A]);return e.parentNode?.replaceChild(B,e)};var o={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};var c=["svg",o,[["path",{d:"M7 7h10v10"}],["path",{d:"M7 17 17 7"}]]];var u=["svg",o,[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]]];var C=["svg",o,[["line",{x1:"2",x2:"5",y1:"12",y2:"12"}],["line",{x1:"19",x2:"22",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"2",y2:"5"}],["line",{x1:"12",x2:"12",y1:"19",y2:"22"}],["circle",{cx:"12",cy:"12",r:"7"}],["circle",{cx:"12",cy:"12",r:"3"}]]];var h=["svg",o,[["path",{d:"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"}],["path",{d:"M15 5.764v15"}],["path",{d:"M9 3.236v15"}]]];var g=["svg",o,[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]]];var S=["svg",o,[["circle",{cx:"11",cy:"11",r:"8"}],["path",{d:"m21 21-4.3-4.3"}]]];var w=["svg",o,[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]]];var R=({icons:e={},nameAttr:t="data-lucide",attrs:a={}}={})=>{if(!Object.values(e).length)throw new Error(`Please provide an icons object.
If you want to use all the icons you can import it like:
 \`import { createIcons, icons } from 'lucide';
lucide.createIcons({icons});\``);if(typeof document>"u")throw new Error("`createIcons()` only works in a browser environment.");let f=document.querySelectorAll(`[${t}]`);if(Array.from(f).forEach(r=>s(r,{nameAttr:t,icons:e,attrs:a})),t==="data-lucide"){let r=document.querySelectorAll("[icon-name]");r.length>0&&(console.warn("[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"),Array.from(r).forEach(l=>s(l,{nameAttr:"icon-name",icons:e,attrs:a})))}};export{c as ArrowUpRight,u as Layers,C as LocateFixed,h as Map,g as Maximize,S as Search,w as X,R as createIcons};
/*! Bundled license information:

lucide/dist/esm/createElement.js:
lucide/dist/esm/replaceElement.js:
lucide/dist/esm/defaultAttributes.js:
lucide/dist/esm/icons/arrow-up-right.js:
lucide/dist/esm/icons/layers.js:
lucide/dist/esm/icons/locate-fixed.js:
lucide/dist/esm/icons/map.js:
lucide/dist/esm/icons/maximize.js:
lucide/dist/esm/icons/search.js:
lucide/dist/esm/icons/x.js:
lucide/dist/esm/lucide.js:
  (**
   * @license lucide v0.468.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
