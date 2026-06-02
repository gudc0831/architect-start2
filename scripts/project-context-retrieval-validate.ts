import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashProjectContextQuery } from "../src/use-cases/project-context-retrieval-service";

const root = process.cwd();
const serviceSource = readFileSync(join(root, "src", "use-cases", "project-context-retrieval-service.ts"), "utf8");

assert.equal(hashProjectContextQuery(" Same Query "), hashProjectContextQuery("same query"));
assert.match(serviceSource, /corpusType: "project_context"/);
assert.match(serviceSource, /version\.status = 'active'/);
assert.match(serviceSource, /source\.latest_active_version_id/);
assert.match(serviceSource, /join chunk_location location/);
assert.match(serviceSource, /length\(btrim\(chunk\.source_quote\)\) > 0/);
assert.match(serviceSource, /chunk\.injection_risk <> 'blocked'/);
assert.match(serviceSource, /active_corpus_missing/);
assert.match(serviceSource, /no_relevant_chunks/);
assert.match(serviceSource, /search_failed/);
assert.match(serviceSource, /legal_only_after_project_context_error/);
assert.match(serviceSource, /insert into review_corpus_trace/);
assert.match(serviceSource, /corpus_type/);
assert.match(serviceSource, /candidate_chunk_ids/);
assert.match(serviceSource, /matched_chunk_ids/);
assert.match(serviceSource, /included_chunk_ids/);
assert.match(serviceSource, /lexical_threshold_not_met/);
assert.doesNotMatch(serviceSource, /EvidenceBundle/);
assert.doesNotMatch(serviceSource, /legalEvidence/i);

console.log(JSON.stringify({ status: "passed", retrieval: "project_context" }));
