/**
 * Seeds a Methods Workbench-only systematic review demo.
 *
 *   npm run seed:methods-demo
 */
import { seedMethodsWorkbenchDemo } from "@/server/methodsDemoSeed";

const result = seedMethodsWorkbenchDemo();
const base =
  process.env.RESEARCHDESK_API_URL ||
  process.env.REVIEWER_API_URL ||
  `http://localhost:${process.env.PORT || 3871}`;

console.log(
  `\n${result.created ? "Seeded" : "Reused"} Methods Workbench demo fixture.`,
);
console.log("Deep links:");
console.log(`  Workbench overview       ${base}${result.links.workbenchOverview}`);
console.log(`  Protocol detail          ${base}${result.links.protocolDetail}`);
console.log(`  SAP                      ${base}${result.links.sapDetail}`);
console.log(`  Data dictionary          ${base}${result.links.dataDictionary}`);
console.log(`  Reporting checklist      ${base}${result.links.reportingChecklist}`);
console.log(`  PROSPERO fields          ${base}${result.links.prosperoFields}`);
