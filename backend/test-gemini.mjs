import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: "Introduce yourself as Saurus, a friendly AI Spanish tutor.",
  });

  console.log("\n🦖 SAURUS RESPONSE:\n");
  console.log(response.text);
}

main().catch(error => {
  console.error("Gemini error:", error.message);
  process.exitCode = 1;
});
