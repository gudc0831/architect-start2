import seedPackageJson from "../src/domains/regulation/seeds/foundation.kr.json";
import evaluationFixtureJson from "../src/domains/regulation/evaluation/foundation.kr.json";
import {
  evaluateRegulationSearchFixture,
  validateRegulationEvaluationFixture,
  validateRegulationSeedPackage,
  type RegulationEvaluationFixture,
  type RegulationSeedPackage,
} from "../src/domains/regulation/knowledge";

const seedPackage = seedPackageJson as unknown as RegulationSeedPackage;
const evaluationFixture = evaluationFixtureJson as unknown as RegulationEvaluationFixture;

function main() {
  const seedValidation = validateRegulationSeedPackage(seedPackage);
  const fixtureValidation = validateRegulationEvaluationFixture(evaluationFixture);

  printValidation("seed", seedValidation.errors, seedValidation.warnings);
  printValidation("evaluation", fixtureValidation.errors, fixtureValidation.warnings);

  if (!seedValidation.valid || !fixtureValidation.valid) {
    process.exitCode = 1;
    return;
  }

  const report = evaluateRegulationSearchFixture(seedPackage, evaluationFixture);
  for (const queryResult of report.queryResults) {
    const status = queryResult.passed ? "ok" : "fail";
    console.log(
      `[regulation-seed] ${status} ${queryResult.id}: top=${queryResult.topDocumentId ?? "none"} results=${queryResult.resultDocumentIds.join(",")}`,
    );
  }

  if (!report.passed) {
    console.error(`[regulation-seed] failed ${report.failures.length}/${report.queryCount} evaluation queries.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[regulation-seed] ok package=${seedPackage.packageId} sources=${seedValidation.sourceCount} documents=${seedValidation.documentCount} eval=${report.passedCount}/${report.queryCount}`,
  );
}

function printValidation(label: string, errors: string[], warnings: string[]) {
  for (const warning of warnings) {
    console.warn(`[regulation-${label}] warning ${warning}`);
  }
  for (const error of errors) {
    console.error(`[regulation-${label}] error ${error}`);
  }
}

main();
