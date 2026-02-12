import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Car Alpha AI, a knowledgeable and helpful vehicle intelligence assistant. You provide expert guidance on:

- **Vehicle Recalls**: Explain recall details, severity, and what owners should do
- **Car Insurance**: Help users understand coverage options, save money, and compare carriers
- **Extended Warranties**: Advise on whether a warranty makes sense based on vehicle age, mileage, and reliability
- **Auto Loans & Refinancing**: Guide users on rates, terms, and when refinancing saves money
- **Repairs & Maintenance**: Explain common issues, estimated costs, and maintenance schedules
- **Lemon Law**: Explain state and federal lemon law rights and when to pursue a claim
- **Selling & Trade-In**: Advise on best channels to sell and how to maximize value
- **EV Incentives**: Explain federal and state tax credits, rebates, and eligibility

RULES:
1. Always be helpful, accurate, and consumer-focused
2. When you recommend an action (get insurance quote, check warranty, etc.), mention that the user can use our partner links for quick access
3. Never make up specific prices, rates, or legal advice — give ranges and direct to professionals
4. Keep responses concise but thorough (2-4 paragraphs max)
5. If vehicle context is provided, tailor your response to that specific vehicle
6. Use plain language — avoid jargon unless explaining a technical term
7. For safety-related recalls, emphasize urgency
8. Always mention that users should verify details with qualified professionals for legal or financial decisions`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  message: string;
  history?: ChatMessage[];
  vehicleContext?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: string;
    engine?: string;
    bodyClass?: string;
    driveType?: string;
    fuelType?: string;
    recallCount?: number;
  };
}

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    return false;
  }

  if (limit.count >= 10) {
    return true;
  }

  limit.count++;
  return false;
}

export default async (req: Request, context: Context) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limiting
  const clientIp = context.ip || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded. Please wait a moment before sending another message.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body: RequestBody = await req.json();
    const { message, history = [], vehicleContext } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (message.length > 2000) {
      return new Response(
        JSON.stringify({ error: "Message too long. Please keep it under 2000 characters." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build context-aware system prompt
    let systemPrompt = SYSTEM_PROMPT;

    if (vehicleContext && vehicleContext.make) {
      systemPrompt += `\n\nCURRENT VEHICLE CONTEXT:`;
      if (vehicleContext.vin) systemPrompt += `\n- VIN: ${vehicleContext.vin}`;
      if (vehicleContext.year) systemPrompt += `\n- Year: ${vehicleContext.year}`;
      if (vehicleContext.make) systemPrompt += `\n- Make: ${vehicleContext.make}`;
      if (vehicleContext.model) systemPrompt += `\n- Model: ${vehicleContext.model}`;
      if (vehicleContext.engine) systemPrompt += `\n- Engine: ${vehicleContext.engine}`;
      if (vehicleContext.bodyClass) systemPrompt += `\n- Body: ${vehicleContext.bodyClass}`;
      if (vehicleContext.driveType) systemPrompt += `\n- Drive: ${vehicleContext.driveType}`;
      if (vehicleContext.fuelType) systemPrompt += `\n- Fuel: ${vehicleContext.fuelType}`;
      if (vehicleContext.recallCount !== undefined) {
        systemPrompt += `\n- Active Recalls Found: ${vehicleContext.recallCount}`;
      }

      const currentYear = new Date().getFullYear();
      const vehicleAge = vehicleContext.year
        ? currentYear - parseInt(vehicleContext.year, 10)
        : null;
      if (vehicleAge !== null) {
        systemPrompt += `\n- Approximate Vehicle Age: ${vehicleAge} years`;
      }

      systemPrompt += `\n\nTailor your responses to this specific vehicle when relevant.`;
    }

    // Build messages array from history
    const messages: Array<{ role: "user" | "assistant"; content: string }> =
      [];

    // Include last 6 messages of history for context
    const recentHistory = history.slice(-6);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add the current message
    messages.push({ role: "user", content: message.trim() });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    return new Response(
      JSON.stringify({
        response: assistantMessage,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: unknown) {
    console.error("AI Chat Error:", error);

    const errMsg =
      error instanceof Error ? error.message : "An unexpected error occurred";

    if (errMsg.includes("rate_limit") || errMsg.includes("429")) {
      return new Response(
        JSON.stringify({
          error:
            "Our AI service is experiencing high demand. Please try again in a moment.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error:
          "Sorry, the AI assistant is temporarily unavailable. Please try again shortly.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = {
  path: "/api/ai-chat",
};
