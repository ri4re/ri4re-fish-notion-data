// scripts/fetch-notion.js
import fs from "fs/promises";
import path from "path";

const NOTION_SECRET = process.env.NOTION_SECRET;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_SECRET || !DATABASE_ID) {
  console.error("❌ 缺少 NOTION_SECRET 或 NOTION_DATABASE_ID 環境變數");
  process.exit(1);
}

const NOTION_API_URL = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
const NOTION_VERSION = "2022-06-28";

async function fetchNotionPages() {
  const allResults = [];
  let hasMore = true;
  let cursor = undefined;

  while (hasMore) {
    const res = await fetch(NOTION_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_SECRET}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        cursor
          ? { start_cursor: cursor, page_size: 100 }
          : { page_size: 100 }
      )
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ Notion API error:", res.status, text);
      process.exit(1);
    }

    const data = await res.json();
    allResults.push(...data.results);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  return allResults;
}

function getText(prop) {
  if (!prop) return "";
  if (prop.type === "title" && prop.title.length > 0) {
    return prop.title.map(t => t.plain_text).join("");
  }
  if (prop.type === "rich_text" && prop.rich_text.length > 0) {
    return prop.rich_text.map(t => t.plain_text).join("");
  }
  return "";
}

function getNumber(prop) {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

async function main() {
  console.log("📥 開始從 Notion 抓資料…");
  const pages = await fetchNotionPages();

  const mapped = pages.map(page => {
    const props = page.properties;

    return {
      id: page.id,
      last_edited_time: page.last_edited_time,
      客人名稱: getText(props["客人名稱"]),
      商品: getText(props["商品"]),
      數量: getNumber(props["數量"]),
      金額: getNumber(props["金額"]),
      備註: getText(props["備註"])
    };
  });

  const outDir = path.join(process.cwd(), "data");
  const outFile = path.join(outDir, "notion-orders.json");

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(mapped, null, 2), "utf8");

  console.log(`✅ 已寫入 ${outFile}，共 ${mapped.length} 筆紀錄`);
}

main().catch(err => {
  console.error("❌ 發生錯誤：", err);
  process.exit(1);
});
