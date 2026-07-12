import { Router } from "express";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

function getProvider(body: { provider?: string; model?: string }): "groq" | "gemini" {
  if (body.provider === "gemini") return "gemini";
  if (body.provider === "groq") return "groq";
  if (body.model?.startsWith("gemini")) return "gemini";
  return "groq";
}

router.post("/claude/generate", async (req, res) => {
  const {
    messages,
    max_tokens = 1800,
    model,
    provider,
  } = req.body as {
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    model?: string;
    provider?: string;
  };

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const resolvedProvider = getProvider({ provider, model });

  try {
    if (resolvedProvider === "groq") {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const resolvedModel = model ?? "llama-3.3-70b-versatile";

      const stream = await groq.chat.completions.create({
        model: resolvedModel,
        messages: messages as Groq.Chat.ChatCompletionMessageParam[],
        max_tokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    } else {
      // Gemini
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
      const resolvedModel = model ?? "gemini-2.0-flash";

      // Separate system instruction from conversation
      const sysMsg = messages.find((m) => m.role === "system")?.content ?? "";
      const userMsgs = messages.filter((m) => m.role !== "system");

      const genModel = genAI.getGenerativeModel({
        model: resolvedModel,
        ...(sysMsg ? { systemInstruction: sysMsg } : {}),
      });

      // Build history for multi-turn; last message is the prompt
      const history = userMsgs.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const lastContent = userMsgs[userMsgs.length - 1]?.content ?? "";

      const chat = genModel.startChat({ history });
      const result = await chat.sendMessageStream(lastContent);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, `${resolvedProvider} stream error`);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      res.end();
    }
  }
});

export default router;
