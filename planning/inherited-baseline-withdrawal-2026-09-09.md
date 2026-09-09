# Inherited baseline: one maintained implementation

On 9 September 2026 Lawrence requested withdrawal of the inherited “Experiment 01” from the higher-autonomy experiments, a clearly labelled baseline reference, and one maintained code copy in the earlier Gimmer collection.

## What changed

- The root collection no longer presents the baseline as an experiment tile. A separate **Inherited baseline** reference points to the main collection.
- The Process-to-Plan Lab and both autonomous lab pages identify the comparison as earlier human-steered, AI-assisted work, outside the higher-autonomy results. Its former Experiment 01 label is retired.
- `apps/mountain-refuge-petri-wbs-demo/index.html` in this repository contains only a small redirect and an ordinary fallback link. Old query strings and fragments are carried to the canonical application; a URL without a fragment opens the comparison.
- The duplicate `tests/process-witness.test.mjs` and now-unused `common.css` are removed. The baseline's existing tests and stylesheet remain with its implementation in the main repository.

## Canonical home and preservation

[Two processes, one chosen plan](https://lawrencerowland.github.io/gimmer-crag/apps/mountain-refuge-petri-wbs-demo/#same-plan-witness) remains in the [main processes-to-plans collection](https://lawrencerowland.github.io/gimmer-crag/petri-smc-wbs.html#app-20).

The source comparison against the pre-withdrawal higher-autonomy revision `9b2b012edf232f37bdf72d68077f3371916f2400` and canonical main `2ff20a418b9bd170d83fbfb802427b16e8a1a750` found the two inline script blocks exactly equal. The only HTML differences were the title, collection banner, and header/footer return links. The stylesheet was also identical. The comparison controls, editable scheduler, manual process explorer, translation panel, SMC/WBS views and JSON copy therefore already exist in the retained implementation.

The baseline test is also byte-identical, under different paths: this repository's former `tests/process-witness.test.mjs` and the main repository's [scripts/process-witness.test.js](https://github.com/lawrencerowland/gimmer-crag/blob/main/scripts/process-witness.test.js) have Git blob `c4fb19d9c1b4e586c32e1115c2c09b7702172d56`. Run it from the main repository with:

```sh
node --test scripts/process-witness.test.js
```

No canonical application or autonomous engine change is required. The autonomous labs use their own core; they do not import the withdrawn baseline. The local autonomous test count consequently changes from 93 to 81 because the 12 baseline tests belong in the original repository. Dated prior run reports retain their historical counts.

## Verification

The final local checkpoint passes **81 autonomous model tests**, **12 existing canonical baseline tests**, **42 local link/script/fragment checks** and **26 ordinary-browser checks**, with no browser exceptions or failed network requests. Desktop and 390-pixel landing screenshots were inspected. These establish the tested navigation and model preservation; publication remains a separate check.

Run the autonomous tests with `node --test tests/*.test.mjs`. The ordinary-browser withdrawal check is `scripts/inherited-baseline-browser.mjs`, using the same Playwright, `LAB_BASE_URL`, `LAB_BROWSER_CHANNEL` and `LAB_EVIDENCE_DIR` options as the other browser scripts. It checks direct references, the retired URL, fragment/query preservation, the canonical return journey, the baseline controls and phone layout. Publication and served-source results are recorded against the reviewed commit separately from this source note.

Historical baseline method and translation notes remain as labelled provenance. They are not another executable implementation or an autonomous result.
