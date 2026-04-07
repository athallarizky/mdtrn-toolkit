import * as fs from "fs";

const TOKEN = process.env.MDTRN_TOKEN || "";
if (!TOKEN) {
  console.error("Error: MDTRN_TOKEN environment variable is required");
  process.exit(1);
}

// ===== CONFIGURATION =====
const INPUT_FILE = "./extracted-ids.json"; // Change if using different extracted file
const BATCH_SIZE = 10; // Number of concurrent requests
const DELAY_BETWEEN_BATCHES_MS = 500; // Delay between batches
const TYPE = "http";
const IS_OPEN_API = "true";
// ===== END CONFIGURATION =====

interface ExtractedData {
  [category: string]: {
    category: string;
    count: number;
    values: string[];
  };
}

interface RetryResult {
  id: string;
  status: "success" | "failed";
  statusCode?: number;
  error?: string;
}

async function retryNotification(notificationId: string): Promise<RetryResult> {
  try {
    const url = `https://onedashboard.midtrans.com/api/notifications/${notificationId}/retry?type=${TYPE}&is_open_api=${IS_OPEN_API}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        authorization: `Bearer ${TOKEN}`,
        "content-length": "0",
        origin: "https://dashboard.midtrans.com",
        priority: "u=1, i",
        referer: "https://dashboard.midtrans.com/",
        "sec-ch-ua": '"Chromium";v="145", "Not:A-Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      },
    });

    if (response.ok) {
      return { id: notificationId, status: "success", statusCode: response.status };
    } else {
      return {
        id: notificationId,
        status: "failed",
        statusCode: response.status,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (err) {
    return {
      id: notificationId,
      status: "failed",
      error: String(err),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processBatch(ids: string[]): Promise<RetryResult[]> {
  const promises = ids.map((id) => retryNotification(id));
  return Promise.all(promises);
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: ${INPUT_FILE} not found. Run extract-order-ids.ts first.`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(INPUT_FILE, "utf-8");
  const data: ExtractedData = JSON.parse(rawData);

  // Flatten all IDs from all categories
  const allIds: string[] = [];
  for (const [category, extracted] of Object.entries(data)) {
    allIds.push(...(extracted.values as string[]));
  }

  console.log(`🚀 Starting retry for ${allIds.length} notifications...`);
  console.log(`   Batch size: ${BATCH_SIZE}, Delay between batches: ${DELAY_BETWEEN_BATCHES_MS}ms\n`);

  const allResults: RetryResult[] = [];
  let processedCount = 0;

  // Process in batches
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allIds.length / BATCH_SIZE);

    process.stdout.write(`\r⏳ Processing batch ${batchNumber}/${totalBatches}...`);

    const results = await processBatch(batch);
    allResults.push(...results);
    processedCount += results.length;

    if (i + BATCH_SIZE < allIds.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`\r✅ Completed all ${allIds.length} requests\n`);

  // Analyze results
  const successful = allResults.filter((r) => r.status === "success");
  const failed = allResults.filter((r) => r.status === "failed");

  console.log("📊 Summary:");
  console.log("-".repeat(50));
  console.log(`  Total attempts  : ${allResults.length}`);
  console.log(`  Successful      : ${successful.length} (${((successful.length / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed          : ${failed.length} (${((failed.length / allResults.length) * 100).toFixed(1)}%)`);
  console.log("-".repeat(50));

  // Write results to file
  const outputPath = "./retry-results.json";
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        summary: {
          total: allResults.length,
          successful: successful.length,
          failed: failed.length,
        },
        results: allResults,
      },
      null,
      2
    )
  );
  console.log(`\n✓ Results written to ${outputPath}`);

  // Write failed IDs for re-retry
  if (failed.length > 0) {
    const failedFile = "./retry-failed-ids.json";
    fs.writeFileSync(failedFile, JSON.stringify(failed.map((r) => r.id), null, 2));
    console.log(`⚠️  Failed IDs written to ${failedFile} for re-retry`);
  }
}

main().catch(console.error);
