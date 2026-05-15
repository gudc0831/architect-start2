import seedPackageJson from "../src/domains/regulation/seeds/foundation.kr.json";
import governanceManifestJson from "../src/domains/regulation/governance/foundation.kr.json";
import { validateRegulationSeedPackage, type RegulationSeedPackage } from "../src/domains/regulation/knowledge";
import { validateRegulationGovernanceManifest } from "../src/domains/regulation/governance";

const seedPackage = seedPackageJson as unknown as RegulationSeedPackage;
const asOf = parseAsOf(process.argv);

const seedValidation = validateRegulationSeedPackage(seedPackage);
for (const warning of seedValidation.warnings) {
  console.warn(`[regulation-governance:seed] warning ${warning}`);
}
for (const error of seedValidation.errors) {
  console.error(`[regulation-governance:seed] error ${error}`);
}

const governance = validateRegulationGovernanceManifest(seedPackage, governanceManifestJson, { asOf });
for (const warning of governance.warnings) {
  console.warn(`[regulation-governance] warning ${warning}`);
}
for (const error of governance.errors) {
  console.error(`[regulation-governance] error ${error}`);
}
for (const source of governance.refresh) {
  console.log(`[regulation-governance] ${source.status} ${source.sourceId} refreshDueAt=${source.refreshDueAt || "missing"}`);
}

if (!seedValidation.valid || !governance.valid) {
  process.exit(1);
}

console.log(
  `[regulation-governance] ok package=${seedPackage.packageId} sources=${governance.refresh.length} asOf=${asOf.toISOString().slice(0, 10)}`,
);

function parseAsOf(args: string[]) {
  const index = args.indexOf("--as-of");
  const value = index >= 0 ? args[index + 1] : "2026-05-14";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("--as-of must use YYYY-MM-DD.");
  }
  return new Date(`${value}T00:00:00.000Z`);
}
