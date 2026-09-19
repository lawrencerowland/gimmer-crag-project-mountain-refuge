import {analyze} from './engine.mjs';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,result:analyze(data.model,data.options)});}catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}};
