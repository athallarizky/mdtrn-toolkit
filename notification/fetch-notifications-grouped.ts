import * as fs from "fs";
import { API_BASE_URL, DASHBOARD_BASE_URL } from "./config.js";

const TOKEN = process.env.MDTRN_TOKEN || "";
if (!TOKEN) {
  console.error("Error: MDTRN_TOKEN environment variable is required");
  process.exit(1);
}

const START_PAGE = 1;
const END_PAGE = 10; // adjust as needed
const LIMIT = 10;
const START_DATE = "2026-03-13T00:00:00+07:00"; // adjust date range as needed
const END_DATE = "2026-03-13T23:59:59+07:00";
const DELAY_MS = 1000;

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

interface ApiResponse {
  success: boolean;
  data: {
    page: number;
    limit: number;
    totalItems: number;
    items: NotificationItem[];
    nextPage: number | null;
    previousPage: number | null;
    totalPage: number;
  };
}

function getPrefix(orderId: string): string {
  if (orderId.startsWith("SUBS-")) return "SUBS";
  if (orderId.startsWith("auto_topup_")) return "auto_topup";
  if (orderId.startsWith("plan_")) return "plan";
  const match = orderId.match(/^([a-zA-Z]+[-_])/);
  if (match) return match[1].replace(/[-_]$/, "");
  return "other";
}

async function fetchPage(page: number): Promise<ApiResponse> {
  const response = await fetch(
    `${API_BASE_URL}/notifications/search`,
    {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        origin: DASHBOARD_BASE_URL,
        priority: "u=1, i",
        referer: `${DASHBOARD_BASE_URL}/`,
        "sec-ch-ua": '"Chromium";v="145", "Not:A-Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        page,
        limit: LIMIT,
        type: "http",
        start_created_at: START_DATE,
        end_created_at: END_DATE,
        http: { status: "dead" },
        email_notification: {},
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on page ${page}`);
  }

  return response.json() as Promise<ApiResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const result: Record<string, NotificationItem[]> = {};
  let totalFetched = 0;

  console.log(`Fetching pages ${START_PAGE} to ${END_PAGE}...`);

  for (let page = START_PAGE; page <= END_PAGE; page++) {
    try {
      const data = await fetchPage(page);

      if (!data.success) {
        console.error(`Page ${page}: API returned success=false, skipping`);
        continue;
      }

      const items = data.data.items;
      totalFetched += items.length;

      for (const item of items) {
        const prefix = getPrefix(item.order_id);
        if (!result[prefix]) result[prefix] = [];
        result[prefix].push(item);
      }

      const totalPages = data.data.totalPage;
      console.log(
        `Page ${page}/${Math.min(END_PAGE, totalPages)} — ${items.length} items (total so far: ${totalFetched})`
      );

      if (page >= totalPages) {
        console.log(`Reached last page (${totalPages}), stopping early.`);
        break;
      }
    } catch (err) {
      console.error(`Error on page ${page}:`, err);
    }

    if (page < END_PAGE) await sleep(DELAY_MS);
  }

  // Write results
  const outputPath = "./notification-grouped.json";
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`\nDone. Total items collected: ${totalFetched}`);
  console.log(`Results written to ${outputPath}`);
  console.log("\nSummary by prefix:");
  for (const [prefix, items] of Object.entries(result)) {
    console.log(`  ${prefix}: ${items.length} items`);
  }
}

main().catch(console.error);
