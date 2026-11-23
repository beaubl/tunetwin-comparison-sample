# TuneTwin comparison reader

TuneTwin compares two Spotify libraries. The frontend lets both listeners browse shared tracks while the scan is still running. This repository contains selected JavaScript functions from that comparison flow, with a small demo and regression tests using synthetic data. [TuneTwin project site](https://tunetw.in/)

## Run locally

Use Node.js 22 or later.

```sh
node demo.mjs
node --test
```

The demo retries a page, shows two clients keeping independent positions, and displays coverage once the library total is confirmed. It runs without network access or credentials.

## How it works

- Each reader carries a run ID and a cursor. A page for a new run resets the reader. Within the same run, a valid page advances by exactly the number of items returned.
- A lost response can be replayed from the current cursor. Merging by track ID preserves the first arrival order and reports whether the local result cap omitted any unique matches.
- Coverage depends on a confirmed library total. A count of one processed item out of one currently known entry stays provisional while playlist counting continues.

The [reader functions](src/comparison-reader.mjs) are pure JavaScript. The [tests](test/comparison-reader.test.mjs) cover malformed responses, restarts, replay, independent readers, result limits, and provisional totals.
