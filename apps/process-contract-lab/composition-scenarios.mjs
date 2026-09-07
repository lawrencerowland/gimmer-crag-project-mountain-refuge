const event=(id,label,duration,inputs,outputs)=>({op:'event',id,label,duration,inputs,outputs});
const id=(...types)=>({op:'id',types});
const permute=(types,order)=>({op:'permute',types,order});
const seq=(...children)=>({op:'seq',children});
const par=(...children)=>({op:'par',children});

const selectiveN=seq(
  par(event('A','Certify anchors',4,['anchor-request'],['anchor-certificate']),
      event('B','Position scaffold',1,['scaffold-request'],['screen-support','deck-support'])),
  par(id('anchor-certificate'),permute(['screen-support','deck-support'],[1,0])),
  par(event('C','Attach deck',3,['anchor-certificate','deck-support'],['deck']),
      event('D','Fit weather screen',4,['screen-support'],['screen']))
);

const refuge=seq(
  par(event('survey','Survey and release method',2,['site-request'],['permit','anchor-plan']),
      event('deliver','Deliver refuge materials',3,['cargo-request','resource:lift'],['materials','resource:lift'])),
  par(id('permit'),event('anchors','Fix and certify anchors',4,['anchor-plan'],['anchors']),id('materials','resource:lift')),
  permute(['permit','anchors','materials','resource:lift'],[0,2,1,3]),
  par(id('permit'),event('deck','Assemble supported deck',3,['materials','anchors','resource:lift'],['wall-ready','roof-ready','resource:lift'])),
  par(id('permit'),event('walls','Build wall shell',4,['wall-ready'],['walls']),
      event('roof','Install roof',3,['roof-ready','resource:lift'],['roof','resource:lift'])),
  par(event('inspect','Inspect enclosure and method',1,['permit','walls','roof'],['safe']),id('resource:lift')),
  par(event('open','Open the refuge',1,['safe'],['open']),id('resource:lift'))
);

const A=event('A','Prepare work',2,['a'],['b']);
const B=event('B','Perform work',3,['b'],['c']);
const C=event('C','Accept work',1,['c'],['d']);
const liftA=event('A','Lift deck section',3,['resource:lift'],['resource:lift']);
const liftB=event('B','Lift wall section',2,['resource:lift'],['resource:lift']);

export const COMPOSITION_SCENARIOS=[
  {id:'typed-refuge',title:'Build the refuge from typed fragments',
   description:'Eight occurrences composed with sequence, tensor, identity wires and an explicit port permutation. Surveying overlaps delivery; walls and roof form a genuine fork before inspection.',
   term:refuge,notes:['Boundary inputs own one site request, one cargo request and one lifting token.','Permit and resource wires pass through several syntax stages without imposing barriers.','A selected schedule is earliest for its compiled witness; durations and construction rules are illustrative.']},
  {id:'selective-n',title:'A typed construction of the N crossing',
   description:'A supplies C. B supplies C and D. Selective wiring constructs exactly A<C, B<C and B<D; the syntax does not require A<D.',
   term:selectiveN,notes:['The middle permutation puts the scaffold outputs next to their intended consumer ports.','This typed composition exists even though an elementary sequence/parallel event-block tree cannot preserve its order.','Expected earliest finish: 7 toy time units; B,D,A,C is a lawful event order.']},
  {id:'identity-pass-through',title:'Keep a wire while other work runs',
   description:'Preparation runs beside an unchanged lifting token. A permutation arranges the two typed inputs for the installation generator.',
   term:seq(par(event('prepare','Prepare installation',2,['request'],['ready']),id('resource:lift')),
     permute(['ready','resource:lift'],[1,0]),
     event('install','Install prepared work',3,['resource:lift','ready'],['resource:lift','installed'])),
   notes:['The identity creates no event and no duplicate token.','The original lifting input remains the same wire until installation consumes it.']},
  {id:'threaded-resource',title:'Thread one lifting token through two jobs',
   description:'One owned lifting token is passed from A to B. This declares a resource handoff and imposes A before B.',
   term:seq(liftA,liftB),notes:['One initial lifting token; expected finish 5.','The declared order could be changed by writing B then A, not by pretending the same token has two owners.']},
  {id:'parallel-resources',title:'Give each job its own lifting token',
   description:'The same two jobs now have separate input wires. Parallel composition requires two independently owned lifting tokens.',
   term:par(liftA,liftB),notes:['Two initial lifting tokens; expected finish 3.','This is a capacity change from the threaded example, not a free acceleration of one shared resource.']},
  {id:'identity-empty',title:'The empty identity',
   description:'No input ports, output ports or events. The explicit engine sentinel certifies the empty execution without adding a typed wire.',
   term:id(),notes:['Only the empty trace is required.','The sentinel is labelled instrumentation and is excluded from the typed port diagram.']},
  {id:'associativity-left',title:'The same chain, grouped on the left',
   description:'Compose (A;B);C. Compare its canonical port connections with A;(B;C).',
   term:seq(seq(A,B),C),notes:['Rebracketing syntax preserves event IDs, wire endpoints, labels, durations and generated traces.']},
  {id:'associativity-right',title:'The same chain, grouped on the right',
   description:'Compose A;(B;C). It has the same canonical denotation as (A;B);C.',
   term:seq(A,seq(B,C)),notes:['This is a concrete law check in a finite typed constructor, not a claim that testing proves every categorical law.']},
  {id:'type-mismatch',title:'Reject a mismatched handoff',
   description:'The first fragment produces an anchor certificate, but the next requires a permit. The compiler reports the mismatch and returns no model.',
   term:seq(event('check','Certify anchors',2,['request'],['anchor-certificate']),
     event('build','Build from permit',3,['permit'],['built'])),
   notes:['Matching counts alone does not make sequential composition well typed.','Correct the producer output or consumer input only when the intended physical assumption supports it.']}
];

export function getCompositionScenario(id) {
  const scenario=COMPOSITION_SCENARIOS.find(x=>x.id===id);
  return scenario?JSON.parse(JSON.stringify(scenario)):null;
}
