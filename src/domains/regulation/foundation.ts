import seedPackageJson from "@/domains/regulation/seeds/foundation.kr.json";
import {
  searchRegulationSeedPackage,
  validateRegulationSeedPackage,
  type RegulationSeedPackage,
} from "@/domains/regulation/knowledge";

export const foundationRegulationSeedPackage = seedPackageJson as unknown as RegulationSeedPackage;

export function searchFoundationRegulations(query: string, limit = 4) {
  return searchRegulationSeedPackage(foundationRegulationSeedPackage, query, limit);
}

export function validateFoundationRegulationSeed() {
  return validateRegulationSeedPackage(foundationRegulationSeedPackage);
}
