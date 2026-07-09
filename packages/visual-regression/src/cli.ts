import { parseArgs, numberArg, stringArg } from "../../core/src/args.js";
import { comparePng } from "./diff.js";
const args = parseArgs(process.argv.slice(2));
const [baseline, actual] = args._ as string[];
if (!baseline || !actual) throw new Error("Uso: visual-regression <baseline.png> <actual.png> [--diff diff.png] [--threshold .1] [--max-ratio 0]");
const result = await comparePng(baseline, actual, stringArg(args, "diff", "diff.png"), numberArg(args, "threshold", 0.1), numberArg(args, "max-ratio", 0));
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
