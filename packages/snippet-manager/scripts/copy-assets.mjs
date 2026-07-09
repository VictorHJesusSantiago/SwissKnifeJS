import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const destination = resolve("../../dist/packages/snippet-manager/renderer");
await mkdir(destination, { recursive: true });
await cp(resolve("renderer"), destination, { recursive: true, force: true });
console.log(`Assets do Electron copiados para ${destination}`);
