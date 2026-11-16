// Usage: vite-node run.writer.ts <tracevault arguments>. Runs the CLI from source, as `node dist/cli/index.js` would.
import { main } from "../../src/cli/index.js";

process.exitCode = await main(process.argv.slice(2));
