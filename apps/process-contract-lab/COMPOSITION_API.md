# Typed linear-wire construction API

`composition.mjs` exports `compileTerm`, `validateTerm`, `canonicalize`,
`renameOccurrences`, `COMPOSITION_VERSION` and `COMPOSITION_LIMITS`.
The functions are pure and do not mutate the supplied syntax.

## Syntax and scope

```js
{op:'event', id:'A', label:'Certify anchors', duration:4,
 inputs:['anchor-request'], outputs:['anchor-certificate']}
{op:'id', types:['resource:lift']}
{op:'permute', types:['a','b'], order:[1,0]}
{op:'seq', children:[first, second]}
{op:'par', children:[left, right]}
```

Ports are ordered. Every port owns one token. Type equality is exact string equality;
the `resource:` prefix only classifies displayed handoff edges as resources. A
permutation's output at index `j` is its input at `order[j]`. Every input index
must appear exactly once. Identities and permutations add no events or places.

Sequential composition requires adjacent ordered output and input types to match.
It glues only the corresponding wires: it never inserts an all-to-all event barrier.
Parallel composition concatenates the boundaries and keeps the wires distinct.
Two parallel `resource:lift` input ports therefore own **two** initial tokens. It
would misstate the model to call them two users of one shared lifting token.

Event IDs name globally unique **occurrences**, not reusable generator symbols.
Two uses of one template need distinct IDs; `renameOccurrences(term, prefix)`
provides a convenience copy. A generator's declared outputs can differ from its
inputs; any production or consumption is explicit in that generator, never implicit
wire duplication by composition. Empty outputs are supported. Zero-input event
generators are rejected because the existing Petri engine requires a positive
input. Empty identity boundaries are supported.

Limits: 512 syntax nodes, depth 40, 32 generator occurrences and 64 ports on any
boundary. Durations are finite and positive. Types and event IDs are nonempty
strings. Unsupported operations, cyclic syntax, duplicate IDs and malformed
permutations fail with path-specific errors. An event's `maxFirings` is always 1.
Compilation supports more than eight events, but exhaustive ancestry-language
analysis has its own separately reported eight-occurrence display bound.

## Result

`compileTerm(term)` returns a JSON-serializable object:

```js
{
 ok, errors, version, stats:{syntaxNodes,eventCount},
 model,                         // accepted by causal-plan-lab/core.mjs
 inputs:[{index,type,wire}],
 outputs:[{index,type,wire}],
 wires:[{id,type,from,to}],
 events:[{id,label,duration,inputTypes,outputTypes,
          inputWires,outputWires,completionPlace}],
 instrumentation:{strategy:'boundary-and-event-completion',
                  completionPlaces,unitSentinel,explanation},
 canonical
}
```

A wire `from` is `{kind:'input',index}` or
`{kind:'event',eventId,port}`. Its `to` is `{kind:'output',index}` or
`{kind:'event',eventId,port}`. Every physical wire has exactly one source and one
destination. An identity wire can connect the input boundary directly to the
output boundary with the same wire ID. Intermediate sequential boundaries are
not extra places. IDs depend on initial input position or source occurrence/port,
so rebracketing and inserting identities retain them.

On failure `ok` is false, `errors` names the invalid paths, `model` is null and
the diagram arrays are empty. No partial model should replace a previous valid result.
`validateTerm(term)` returns `{ok,errors,inputs,outputs,stats}` with ordered type
arrays; these boundary arrays can be partial information when validation fails.

`canonicalize(compiled)` returns a denotation with schema
`typed-linear-wire-denotation-v1`, `inputTypes`, `outputTypes`, sorted `events`
and sorted `connections:[{type,from,to}]`. It discards only internal wire names
and the explicit monitoring implementation. Event IDs, labels, durations, port
positions, wire types and multiplicity remain significant. It throws for a failed
compilation. This is useful for independently checking concrete associativity,
identity and interchange instances; those tests are not a proof of an unrestricted
free symmetric monoidal construction.

## Explicit completion instrumentation

The model goal requires all typed boundary outputs **and** one terminal marker
for each generator occurrence. Each event produces its own marker; no event
consumes it. These monitor places do not add physical input ports, copy typed
tokens, create enabling prerequisites or impose extra event ordering. They prevent
a discard generator from being silently omitted when another boundary output was
already present. `model.composition.instrumentation` repeats this declaration.

For the empty identity there are no wires or events. The underlying engine needs
a nonempty goal, so this case has one explicit initially-complete sentinel with
no transitions. Its only complete execution is `[]`, matching the empty identity.
The sentinel is not part of the typed interface. No readiness tokens are inserted
to make unsupported zero-input generators run.

Every complete first-goal trace contains exactly the declared generator occurrences.
The monitor strategy is part of this compiler's contract, rather than a physical
claim about refuge construction or an implicit project scope decision.

## Scenarios

`composition-scenarios.mjs` exports `COMPOSITION_SCENARIOS` and
`getCompositionScenario(id)` (an independent JSON copy or null).
Each scenario is `{id,title,description,term,notes:[strings]}`. IDs are
`typed-refuge`, `selective-n`, `identity-pass-through`, `threaded-resource`,
`parallel-resources`, `identity-empty`, `associativity-left`,
`associativity-right`, and `type-mismatch`. The last is intentionally rejected.

The selective N uses typed identity/selective wiring rather than event barriers:
its causal relations are exactly A<C, B<C and B<D. Its construction is valid even
though no elementary event-block sequence/parallel tree preserves that order.
This distinguishes the restricted tree grammar from the richer typed wire syntax.
