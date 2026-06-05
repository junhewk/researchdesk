/**
 * Seeds the "diabetes chatbot" running case used in the EBM Research Workshop.
 *
 *   npm run seed:demo
 */
import { seedDiabetesDemo } from "@/server/demoSeed";

const result = seedDiabetesDemo();
const base = process.env.REVIEWER_API_URL || `http://localhost:${process.env.PORT || 3871}`;

console.log(
  `\nSeeded diabetes demo fixture (${result.lettersSeeded} reviewer letters).`,
);
console.log("Screenshot deep links:");
console.log(`  01 Workbench overview     ${base}${result.links.workbenchOverview}`);
console.log(`  02 Protocol detail        ${base}${result.links.protocolDetail}`);
console.log(`  03 SAP + data dictionary  ${base}${result.links.sapDetail}`);
console.log(`                            ${base}${result.links.dataDictionary}`);
console.log(`  04 Reporting checklist    ${base}${result.links.reportingChecklist}`);
console.log(`  06/07 My Review           ${base}${result.links.manuscriptWorkspace}`);
console.log("Run the app-level demo button to create LLM-generated readiness, review, and response outputs.");
