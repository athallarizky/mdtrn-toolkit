import * as fs from "fs";

interface NotificationItem {
  id: string;
  created_at: string;
  order_id: string;
  type: string;
  endpoint: string;
  status: string;
  reference_id: string | null;
  is_open_api_transaction: boolean | null;
}

interface GroupedData {
  [category: string]: NotificationItem[];
}

// ===== CONFIGURATION =====
const INPUT_FILE = "./notification-grouped.json";
const EXTRACT_KEY = "id"; // Change this to extract different keys: "id", "order_id", "endpoint", etc.
const OUTPUT_FILENAME = `extracted-${EXTRACT_KEY}s`;
// ===== END CONFIGURATION =====

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: ${INPUT_FILE} not found. Run fetch-notifications-grouped.ts first.`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(INPUT_FILE, "utf-8");
  const data: GroupedData = JSON.parse(rawData);

  // Extract values by key
  const output: Record<string, { category: string; count: number; values: (string | boolean | null)[] }> = {};

  for (const [category, items] of Object.entries(data)) {
    const values = items.map((item) => (item as any)[EXTRACT_KEY]).filter((v) => v !== undefined);
    output[category] = {
      category,
      count: values.length,
      values,
    };
  }

  // Write to single file
  const outputPath = `./${OUTPUT_FILENAME}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✓ Extracted data written to ${outputPath}`);

  // Write individual files for each category
  const categoriesDir = `./${OUTPUT_FILENAME}-by-category`;
  if (!fs.existsSync(categoriesDir)) {
    fs.mkdirSync(categoriesDir, { recursive: true });
  }

  for (const [category, extracted] of Object.entries(output)) {
    const categoryFile = `${categoriesDir}/${category}.json`;
    fs.writeFileSync(categoryFile, JSON.stringify(extracted.values, null, 2));
  }
  console.log(`✓ Individual category files written to ${categoriesDir}/`);

  // Print summary
  console.log(`\n📊 Summary (extracting "${EXTRACT_KEY}"):`);
  console.log("-".repeat(50));
  let totalValues = 0;
  for (const [category, extracted] of Object.entries(output)) {
    console.log(`  ${category.padEnd(15)} : ${extracted.count} values`);
    totalValues += extracted.count;
  }
  console.log("-".repeat(50));
  console.log(`  Total            : ${totalValues} values`);

  // Export as TypeScript constants
  const tsFile = `./${OUTPUT_FILENAME}-constants.ts`;
  let tsContent = `// Auto-generated from extract-order-ids.ts\n// Extracted key: "${EXTRACT_KEY}"\n\n`;
  for (const [category, extracted] of Object.entries(output)) {
    const constName = `${EXTRACT_KEY.toUpperCase()}_${category.toUpperCase()}`;
    tsContent += `export const ${constName}: (string | boolean | null)[] = ${JSON.stringify(extracted.values)};\n\n`;
  }
  fs.writeFileSync(tsFile, tsContent);
  console.log(`✓ TypeScript constants written to ${tsFile}`);
}

main().catch(console.error);
