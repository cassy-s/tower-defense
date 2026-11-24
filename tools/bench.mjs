// Simulation benchmark + fingerprints.   npm run bench
// Run before and after an optimisation: the fingerprints must not change
// (same seeded games, same outcome to the last decimal), and msPerStep shows
// whether it got faster. See tests/bench.js. Rendering: tests/render-profile.js.
import { fingerprint, bench } from '../tests/bench.js';

for (const f of fingerprint()) console.log(`${f.hash}  ${f.summary}`);
console.log(bench());
