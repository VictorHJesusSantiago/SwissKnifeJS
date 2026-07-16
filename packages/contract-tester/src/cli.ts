import { parseArgs, stringArg } from "../../core/src/args.js";
import { loadSpec } from "../../openapi-docgen/src/spec.js";
import { testContract } from "./validator.js";
import { loadContract, verifyContract, writeContract } from "./contractGenerator.js";
import { generateContractFromRecording } from "./mockIntegration.js";
import { computeCoverage, formatCoverageReport, operationsFromContract, operationsFromContractReport } from "./coverageReport.js";

const USAGE = `Uso:
  contract-test verify-spec <spec.yaml|json> --base-url <url>
  contract-test record --recording <arquivo.ndjson> --consumer <nome> --provider <nome> --out <contrato.json>
  contract-test verify-contract <contrato.json> --base-url <url>
  contract-test coverage <spec.yaml|json> [--contract <contrato.json>] [--report <relatorio.json>]`;

const args = parseArgs(process.argv.slice(2));
const positionals = args._ as string[];
const command = positionals[0];

switch (command) {
  case "verify-spec": {
    const input = positionals[1];
    if (!input) throw new Error(USAGE);
    const report = await testContract(await loadSpec(input), stringArg(args, "base-url"));
    console.log(JSON.stringify(report, null, 2));
    if (report.failed) process.exitCode = 1;
    break;
  }
  case "record": {
    const recording = stringArg(args, "recording");
    const consumer = stringArg(args, "consumer");
    const provider = stringArg(args, "provider");
    const out = stringArg(args, "out");
    const contract = await generateContractFromRecording(recording, consumer, provider);
    await writeContract(out, contract);
    console.log(`Contrato gravado em ${out} com ${contract.interactions.length} interação(ões).`);
    break;
  }
  case "verify-contract": {
    const input = positionals[1];
    if (!input) throw new Error(USAGE);
    const contract = await loadContract(input);
    const report = await verifyContract(contract, stringArg(args, "base-url"));
    console.log(JSON.stringify(report, null, 2));
    if (report.failed) process.exitCode = 1;
    break;
  }
  case "coverage": {
    const input = positionals[1];
    if (!input) throw new Error(USAGE);
    const spec = await loadSpec(input);
    const contractPath = args["contract"];
    const reportPath = args["report"];
    let tested: string[] = [];
    if (typeof contractPath === "string") {
      tested = operationsFromContract(await loadContract(contractPath));
    } else if (typeof reportPath === "string") {
      const { readFile } = await import("node:fs/promises");
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      tested = operationsFromContractReport(report);
    } else {
      throw new Error("Informe --contract <contrato.json> ou --report <relatorio.json>");
    }
    const coverage = computeCoverage(spec, tested);
    if (args["json"]) console.log(JSON.stringify(coverage, null, 2));
    else console.log(formatCoverageReport(coverage));
    break;
  }
  default: {
    // Compatibilidade retroativa: `contract-test <spec> --base-url <url>` equivale a `verify-spec`.
    if (command && (command.endsWith(".yaml") || command.endsWith(".yml") || command.endsWith(".json"))) {
      const report = await testContract(await loadSpec(command), stringArg(args, "base-url"));
      console.log(JSON.stringify(report, null, 2));
      if (report.failed) process.exitCode = 1;
      break;
    }
    throw new Error(USAGE);
  }
}
