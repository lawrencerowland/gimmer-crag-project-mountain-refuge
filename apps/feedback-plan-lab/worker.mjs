import {analyse, certifyTrace} from './engine.mjs';
self.onmessage = ({data}) => {
  const {id, kind, model, options, trace, cases = []} = data;
  try {
    if (kind === 'certificate') self.postMessage({id, kind, result:certifyTrace(model, trace, options)});
    else {
      const result = analyse(model, options);
      const knownCases = cases.map(name => {
        const fixed = structuredClone(model);
        fixed.transitions = fixed.transitions.filter(t=>t.owner !== 'environment' || !t.outcomeCase || t.outcomeCase === name);
        const checked=analyse(fixed,options);
        return {name,ok:checked.ok,complete:checked.complete,summary:checked.summary};
      });
      self.postMessage({id,kind,result,knownCases});
    }
  } catch (error) { self.postMessage({id,kind,error:String(error?.message || error)}); }
};
