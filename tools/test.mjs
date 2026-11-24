// Runs the simulation tests in Node.   npm test
// (The same tests run in the browser at /tests/ for anyone without Node.)
import { runAll } from '../tests/sim.test.js';

const { failed } = await runAll();
process.exit(failed.length ? 1 : 0);
