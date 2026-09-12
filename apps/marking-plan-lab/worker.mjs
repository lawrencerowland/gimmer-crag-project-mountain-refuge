import {analyse} from './engine.mjs';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,result:analyse(data.model,data.limits||{})});}catch(error){self.postMessage({id:data.id,result:{ok:false,errors:[error.message||String(error)]}});}};
