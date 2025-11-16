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

// 文字型欄位（title / rich_text）
function getText(prop) {
  if (!prop) return "";
  if (prop.type === "title" && prop.title?.length > 0) {
    return prop.title.map(t => t.plain_text).join("");
  }
  if (prop.type === "rich_text" && prop.rich_text?.length > 0) {
    return prop.rich_text.map(t => t.plain_text).join("");
  }
  if (prop.type === "email" && prop.email) {
    return prop.email;
  }
  return "";
}

// 數字欄位
function getNumber(prop) {
  if (!prop || prop.type !== "number") return "";
  return prop.number ?? "";
}

// checkbox
function getCheckbox(prop) {
  if (!prop || prop.type !== "checkbox") return "";
  return prop.checkbox ? "true" : "false"; // 之後前台會用文字判斷
}

// 日期欄位
function getDate(prop) {
  if (!prop || prop.type !== "date" || !prop.date) return "";
  return prop.date.start || "";
}

// 將 rows 陣列轉成 CSV 字串
function toCsv(rows) {
  // 欄位順序：要跟前台常數一致
  const headers = [
    "信箱",
    "會員編號",
    "LINE名稱",
    "客人名稱",
    "商品名稱",
    "款式",
    "數量",
    "狀態",
    "金額",
    "商品網址",
    "備註",
    "更新日期",
    "出貨日期",
    "重量",
    "國際運費",
    "含國際運費"
  ];

  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [];
  lines.push(headers.map(escape).join(",")); // header

  rows.forEach(row => {
    const line = headers.map(h => escape(row[h] ?? "")).join(",");
    lines.push(line);
  });

  return lines.join("\n");
}

async function main() {
  console.log("📥 開始從 Notion 抓資料…");
  const pages = await fetchNotionPages();

  // 把 Notion 的欄位對應到 CSV 欄位名稱
  const mapped = pages.map(page => {
    const props = page.properties || {};

    return {
      // ===== 客人 / 聯絡資訊 =====
      "信箱": getText(props["信箱"]),
      "會員編號": getText(props["會員編號"]),
      "LINE名稱": getText(props["LINE名稱"]),
      "客人名稱": getText(props["客人名稱"]),

      // ===== 商品資訊 =====
      "商品名稱": getText(props["商品名稱"] || props["商品"]),
      "款式": getText(props["款式"]),
      "數量": getNumber(props["數量"]),
      "狀態": getText(props["狀態"]),
      "金額": getNumber(props["金額"]),
      "商品網址": getText(props["商品網址"]),
      "備註": getText(props["備註"]),

      // ===== 日期 =====
      "更新日期": getDate(props["更新日期"]) || page.last_edited_time || "",
      "出貨日期": getDate(props["出貨日期"]),

      // ===== 後台用欄位 =====
      "重量": getNumber(props["重量"]),
      "國際運費": getNumber(props["國際運費"]),
      "含國際運費": getCheckbox(props["含國際運費"])
    };
  });

  // 輸出到 repo 根目錄的 fishorder.csv
  const outFile = path.join(process.cwd(), "fishorder.csv");
  const csv = toCsv(mapped);
  await fs.writeFile(outFile, csv, "utf8");

  console.log(`✅ 已寫入 ${outFile}，共 ${mapped.length} 筆紀錄`);
}

main().catch(err => {
  console.error("❌ 發生錯誤：", err);
  process.exit(1);
});
