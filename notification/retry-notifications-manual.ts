import * as fs from "fs";

const TOKEN = process.env.MDTRN_TOKEN || "";
if (!TOKEN) {
  console.error("Error: MDTRN_TOKEN environment variable is required");
  process.exit(1);
}

// ===== CONFIGURATION =====
// Add your notification IDs here
const NOTIFICATION_IDS: string[] = [
  // Example: "64a1b2c3d4e5f6a7b8c9d0e1",
  // Example: "64a1b2c3d4e5f6a7b8c9d0e2",
];

const BATCH_SIZE = 50; // Number of concurrent requests
const DELAY_BETWEEN_BATCHES_MS = 3000; // Delay between batches
const TYPE = "http";
const IS_OPEN_API = "true";
// ===== END CONFIGURATION =====

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
  if (NOTIFICATION_IDS.length === 0) {
    console.error("Error: NOTIFICATION_IDS array is empty. Add IDs to retry.");
    process.exit(1);
  }

  console.log(`Starting retry for ${NOTIFICATION_IDS.length} notifications...`);
  console.log(`   Batch size: ${BATCH_SIZE}, Delay between batches: ${DELAY_BETWEEN_BATCHES_MS}ms\n`);

  const allResults: RetryResult[] = [];

  // Process in batches
  for (let i = 0; i < NOTIFICATION_IDS.length; i += BATCH_SIZE) {
    const batch = NOTIFICATION_IDS.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(NOTIFICATION_IDS.length / BATCH_SIZE);

    process.stdout.write(`\rProcessing batch ${batchNumber}/${totalBatches}...`);

    const results = await processBatch(batch);
    allResults.push(...results);

    if (i + BATCH_SIZE < NOTIFICATION_IDS.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`\rCompleted all ${NOTIFICATION_IDS.length} requests\n`);

  // Analyze results
  const successful = allResults.filter((r) => r.status === "success");
  const failed = allResults.filter((r) => r.status === "failed");

  console.log("Summary:");
  console.log("-".repeat(50));
  console.log(`  Total attempts  : ${allResults.length}`);
  console.log(`  Successful      : ${successful.length} (${((successful.length / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed          : ${failed.length} (${((failed.length / allResults.length) * 100).toFixed(1)}%)`);
  console.log("-".repeat(50));

  // Write results to file
  const outputPath = "./retry-results-manual.json";
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
  console.log(`\nResults written to ${outputPath}`);

  // Write failed IDs for re-retry
  if (failed.length > 0) {
    const failedFile = "./retry-failed-ids-manual.json";
    fs.writeFileSync(failedFile, JSON.stringify(failed.map((r) => r.id), null, 2));
    console.log(`Failed IDs written to ${failedFile} for re-retry`);
  }
}

main().catch(console.error);
