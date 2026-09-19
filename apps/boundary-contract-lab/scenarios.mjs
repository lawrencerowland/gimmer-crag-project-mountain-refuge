const p=(id,type,initial=0)=>({id,type,initial});
const input=(id,place,supply=0)=>({id,place,direction:'in',supply});
const output=(id,place)=>({id,place,direction:'out'});
const e=(id,label,consume={},produce={},duration=1)=>({id,label,consume,produce,duration});
const common=['Ordinary count tokens with unique, once-only selected event identities.','All listed work must finish, even after a physical output is available.','Positive durations are illustrative; schedules reserve inputs at start and release outputs at finish.'];
export const SCENARIOS=[
  {
    id:'replenished-boundary',title:'A blocked method becomes possible',
    description:'A supplier releases the lifting resource. The receiving method has zero standalone supply, so a closed local summary loses its only event.',
    assumptions:[...common,'Release represents resource availability, not certification of a real lifting method.'],
    naive:'closed-summary',
    fragments:[
      {id:'supplier',title:'Resource release',places:[p('lift','lifting-resource')],ports:[output('available','lift')],events:[e('Release','Release lifting resource',{}, {lift:1},2)]},
      {id:'method',title:'Roof method',places:[p('lift','lifting-resource'),p('roof','roof-installed')],ports:[input('borrow','lift',0),output('return','lift')],events:[e('Roof','Lift roof panel',{lift:1},{lift:1,roof:1},3)]}
    ],connections:[{from:'supplier.available',to:'method.borrow'}],
    expected:'Release then Roof is legal. A closed standalone summary omits Roof and fails in context.'
  },
  {
    id:'owned-lifting-resource',title:'Connect one owned lifting resource',
    description:'Two lift operations borrow and return a single owned resource. Connecting the method must discharge its former external supply exactly once.',
    assumptions:[...common,'Each lift holds one resource for its complete toy duration.','Frame and Roof have independent readiness conditions; the model isolates resource ownership.'],
    naive:'double-supply',
    fragments:[
      {id:'owner',title:'Owned resource',places:[p('lift','lifting-resource',1)],ports:[output('owned','lift')],events:[]},
      {id:'method',title:'Two lifts',places:[p('lift','lifting-resource'),p('frame','frame-installed'),p('roof','roof-installed')],ports:[input('borrow','lift',1),output('return','lift')],events:[e('Frame','Lift frame',{lift:1},{lift:1,frame:1},2),e('Roof','Lift roof',{lift:1},{lift:1,roof:1},3)]}
    ],connections:[{from:'owner.owned',to:'method.borrow'}],
    expected:'Both serial orders are lawful; the joint {Frame, Roof} step is forbidden. Retaining external supply invents concurrency.'
  },
  {
    id:'independent-lifting-resources',title:'Supply two resources independently',
    description:'Separate lifting resources remain separately owned under tensor. Both work operations can begin together.',
    assumptions:[...common,'Two independently available resources can operate simultaneously.','Equal type labels do not merge their ownership.'],
    fragments:[
      {id:'frame',title:'Frame crew',places:[p('lift','lifting-resource'),p('done','frame-installed')],ports:[input('resource','lift',1)],events:[e('Frame','Lift frame',{lift:1},{lift:1,done:1},2)]},
      {id:'roof',title:'Roof crew',places:[p('lift','lifting-resource'),p('done','roof-installed')],ports:[input('resource','lift',1)],events:[e('Roof','Lift roof',{lift:1},{lift:1,done:1},3)]}
    ],connections:[],
    expected:'The same two serial words as the one-resource example, plus the joint {Frame, Roof} step.'
  },
  {
    id:'partial-availability',title:'Use an output before its source finishes',
    description:'A supplies C and D; B supplies D. The receiving method may start C after A while B remains unfinished. A whole-fragment barrier adds the false B→C dependency.',
    assumptions:[...common,'A returns separate typed outputs for C and D; C consumes only its own output.'],
    naive:'completion-barrier',
    fragments:[
      {id:'source',title:'Preparatory work',places:[p('ac','C-readiness'),p('ad','D-first-readiness'),p('bd','D-second-readiness')],ports:[output('acOut','ac'),output('adOut','ad'),output('bdOut','bd')],events:[e('A','Prepare first supports',{}, {ac:1,ad:1},2),e('B','Prepare second support',{}, {bd:1},3)]},
      {id:'receiver',title:'Dependent work',places:[p('ac','C-readiness'),p('ad','D-first-readiness'),p('bd','D-second-readiness')],ports:[input('acIn','ac'),input('adIn','ad'),input('bdIn','bd')],events:[e('C','Use first available output',{ac:1},{},1),e('D','Use both required outputs',{ad:1,bd:1},{},2)]}
    ],connections:[{from:'source.acOut',to:'receiver.acIn'},{from:'source.adOut',to:'receiver.adIn'},{from:'source.bdOut',to:'receiver.bdIn'}],
    expected:'Exactly the N dependencies A→C, A→D and B→D survive. B→C is absent.'
  },
  {
    id:'alternative-support',title:'Keep either producer sufficient',
    description:'A or B can supply C. All three selected events must still finish; the source has two ways to supply the same exact boundary place.',
    assumptions:[...common,'The tokens produced by A and B are interchangeable at this explicitly shared place.','C consumes one token; any leftover token is permitted.'],
    naive:'all-producers',
    fragments:[
      {id:'source',title:'Alternative producers',places:[p('support','usable-support')],ports:[output('supportOut','support')],events:[e('A','Produce support A',{}, {support:1},2),e('B','Produce support B',{}, {support:1},1)]},
      {id:'receiver',title:'Consumer',places:[p('support','usable-support')],ports:[input('supportIn','support')],events:[e('C','Use either support',{support:1},{},2)]}
    ],connections:[{from:'source.supportOut',to:'receiver.supportIn'}],
    expected:'Exactly A B C, A C B, B A C and B C A are legal. C-first and requiring both producers are wrong.'
  },
  {
    id:'unconnected-ownership',title:'Matching types do not grant access',
    description:'The frame team has a lifting resource; the roof team has none. No connection grants access between them.',
    assumptions:[...common,'Unconnected ownership is operationally significant; transfer requires an explicit connection.'],
    naive:'type-pooling',
    fragments:[
      {id:'frame',title:'Supplied crew',places:[p('lift','lifting-resource')],ports:[input('resource','lift',1)],events:[e('Frame','Lift frame',{lift:1},{lift:1},2)]},
      {id:'roof',title:'Unsupplied crew',places:[p('lift','lifting-resource')],ports:[input('resource','lift',0)],events:[e('Roof','Lift roof',{lift:1},{lift:1},3)]}
    ],connections:[],
    expected:'The full selected scope cannot complete. Pooling by type invents access and two complete serial words.'
  },
  {
    id:'eight-event-frontier',title:'Eight selected occurrences',
    description:'Four independent suppliers each enable one consumer. This is a complete eight-event boundary exercise, retaining sink completion and partial outputs.',
    assumptions:[...common,'This is a finite construction check, not a claim about arbitrary looping nets.'],
    naive:'completion-barrier',
    fragments:[
      {id:'source',title:'Four suppliers',places:[p('p','kind-p'),p('q','kind-q'),p('r','kind-r'),p('s','kind-s')],ports:[output('pOut','p'),output('qOut','q'),output('rOut','r'),output('sOut','s')],events:['p','q','r','s'].map((x,i)=>e(`A${i+1}`,`Supply ${x}`,{}, {[x]:1},i+1))},
      {id:'receiver',title:'Four consumers',places:[p('p','kind-p'),p('q','kind-q'),p('r','kind-r'),p('s','kind-s')],ports:[input('pIn','p'),input('qIn','q'),input('rIn','r'),input('sIn','s')],events:['p','q','r','s'].map((x,i)=>e(`B${i+1}`,`Use ${x}`,{[x]:1},{},2))}
    ],connections:['p','q','r','s'].map(x=>({from:`source.${x}Out`,to:`receiver.${x}In`})),
    expected:'Eighty-one reachable states retain exactly four independent producer→consumer dependencies, including all four sink occurrences.'
  }
];
export const SCENARIO_BY_ID=Object.fromEntries(SCENARIOS.map(s=>[s.id,s]));
