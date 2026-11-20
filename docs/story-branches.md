# Story state and visitor branch map

## State
\`caseIndex\` (0–6), \`shift\` (1–4), \`trust\`, \`suspicion\`, \`clues\`, \`foundClues[]\`, \`decisions[]\`, \`items[]\`, \`finalDecision\`.

## Visitor sequence
| Case | Visitor | Document issue | Interview evidence | Expected decision |
|---|---|---|---|---|
| BW-01 | Milad Rahnama, courier | None | Cassette warning or Station 12 report | Admit |
| BW-02 | Dr. Mina Rad | Birth date typo | Valid medical license confirms typo | Hold, then admit after proof |
| BW-03 | Younes, shepherd | Expired passport and no permit | Missing spouse in old ledger / footprints | Deny |
| BW-04 | Niloofar and Sara | Child companion omitted | Birth certificate confirms relationship | Hold, then admit after proof |
| BW-05 | Major Farahmand | Military permit does not match registry | Missing officer report / identical signature | Hold |
| BW-06 | The Nameless Man | Missing identity, photo and permit | He knows the officer's private name / wet ledger | Deny |
| BW-07 | The Double | Passport uses the officer's identity | The creature is made of names left in the ledger | Hold for the best ending |

## Consequences
- The result screen records whether the selected action matches the authored truth for that file.
- Correctly flagging every real discrepancy awards an evidence point.
- Dialogue may reveal proof and change the appropriate decision for that file.
- Final ending is evaluated only after BW-07 is completed.
