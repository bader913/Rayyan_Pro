import { dbGet } from '../../shared/db/pool.js';
import type { AssistantIntent } from './assistant.types.js';
import { INTENTS } from './assistant.types.js';

type GeminiOptions = {
  jsonMode?: boolean;
  temperature?: number;
};

async function tryDbGet<T>(queries: string[]): Promise<T | null> {
  for (const sql of queries) {
    try {
      const row = await dbGet<T>(sql);
      if (row) return row;
    } catch {
      // try next query
    }
  }
  return null;
}

function extractTextFromGeminiResponse(payload: any): string {
  if (!Array.isArray(payload?.candidates)) return '';

  const chunks: string[] = [];

  for (const candidate of payload.candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function extractJsonObject(text: string): any | null {
  if (!text) return null;

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function getGeminiConfig() {
  const row = await tryDbGet<{ value: string }>([
    `SELECT value FROM settings WHERE key = 'gemini_api_key' LIMIT 1`,
  ]);

  const apiKey = String(row?.value || '').trim();
  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

  return { apiKey, model, enabled: Boolean(apiKey) };
}

export async function callGemini(
  instructions: string,
  input: string,
  options?: GeminiOptions
): Promise<string> {
  const { apiKey, model, enabled } = await getGeminiConfig();
  if (!enabled) return '';

  try {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const body: any = {
      systemInstruction: {
        parts: [{ text: instructions }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: input }],
        },
      ],
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
      },
    };

    if (options?.jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[Gemini] HTTP error:', response.status, errText);
      return '';
    }

    const payload = await response.json();
    return extractTextFromGeminiResponse(payload);
  } catch (error) {
    console.error('[Gemini] request error:', error);
    return '';
  }
}

export async function detectIntentWithGemini(message: string): Promise<AssistantIntent | null> {
  const { enabled } = await getGeminiConfig();
  if (!enabled) return null;

  const systemPrompt = `
أنت مصنف نوايا داخل برنامج محاسبة ومخزون عربي اسمه Rayyan Pro.
مهمتك فقط تحديد نية واحدة من هذه القيم:
sales_today
sales_week
sales_month
profit_today
low_stock
out_of_stock
dashboard_summary
top_products_today
returns_today
expenses_today
purchases_today
customer_balances
supplier_balances
open_shift
product_price
product_stock
all_products
recent_sales
slow_moving
reorder_suggestions
general_ai
unsupported
أعد JSON فقط بهذا الشكل:
{"intent":"sales_today"}

إذا كان السؤال عامًا أو استشاريًا أو لا يطابق استعلامًا مباشرًا من قاعدة البيانات فأعد:
{"intent":"general_ai"}
`.trim();

  const text = await callGemini(systemPrompt, message, {
    jsonMode: true,
    temperature: 0,
  });

  const parsed = extractJsonObject(text);
  const intent = parsed?.intent;

  if (INTENTS.includes(intent)) {
    return intent as AssistantIntent;
  }

  return null;
}

export async function buildGeneralAIText(params: {
  message: string;
  context: string;
}): Promise<string> {
  const { enabled } = await getGeminiConfig();
  if (!enabled) return '';

  const instructions = `
أنت "مساعد الريان" داخل برنامج Rayyan Pro لإدارة المبيعات والمخزون والمحاسبة.
أجب دائمًا بالعربية وبأسلوب واضح ومهني ومفيد.
اعتمد أولًا على البيانات الحية الموجودة في CONTEXT.
إذا لم تكفِ البيانات لذكر رقم دقيق، قل ذلك بصراحة ولا تخترع أرقامًا.
يمكنك تقديم اقتراحات تشغيلية وتحليلية عامة، لكن ميّزها بوضوح على أنها "اقتراح".
لا تذكر SQL ولا تفاصيل تقنية داخل الجواب.
إذا كان المستخدم يسأل عن البرنامج أو عن قرارات تشغيلية أو أفكار تطوير أو تحليل وضع اليوم، فأجب بشكل عملي ومباشر.
`.trim();

  const input = `CONTEXT:\n${params.context}\n\nUSER MESSAGE:\n${params.message}`;
  return (await callGemini(instructions, input, { temperature: 0.4 })).trim();
}