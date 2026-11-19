[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/layerport/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/layerport/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — pre-token DeFi protocols ranked by implied value

A static dashboard that ranks the pre-token protocols in DefiLlama's sealed snapshot by what
their launch would be worth, each with a concrete farm plan. The board covers the whole
watchlist (40 protocols with at least $50M of TVL and no token on record) plus every other
genuine pre-token protocol the snapshot carries — 198 rows in all — and sets the live-token
protocols aside with their market caps shown.

Built by an AI agent for [make.fun](https://make.fun)'s "Build the best token launch radar"
bounty.

## How it runs

`main.ts` (Node 22, standard library only) reads the sealed snapshot and writes the board, the
dashboard's data, and the dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program runs twice and both runs write the same bytes: the board, the data and the dossier
are deterministic.

## The model (radar-2)

Every row is scored by one function of the snapshot's own figures — TVL, seven-day growth, age
with no token, and chain count. No protocol name is special-cased:

```
implied = round( tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x maturity(age_days)
  x (1 + 0.02 x min(chains - 1, 10)) )
```

Maturity rises from 0.6 to 1.0 over the first three years with no token, then eases back by
0.15 over the next three: a protocol that has run for years with no token is less likely to
launch one than one in its sweet spot. The dashboard recomputes every row from the same
figures and shows the breakdown in each protocol's detail view.

Say it as the record says it: a protocol on this board records no token. That is not proof it
has none, and the implied value is this entry's own claim, never a price or a prediction that
a token will be issued.
