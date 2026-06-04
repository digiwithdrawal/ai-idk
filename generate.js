export const config = {
  maxDuration: 300
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable." });
  }

  try {
    const { prompt, referenceImages = [], size = "1024x1024", quality = "high" } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const content = [{ type: "input_text", text: prompt }];
    for (const dataUrl of referenceImages.slice(0, 6)) {
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
        content.push({ type: "input_image", image_url: dataUrl });
      }
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MAIN_MODEL || "gpt-5.5",
        input: [{ role: "user", content }],
        tools: [{ type: "image_generation", quality, size }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenAI generation failed." });
    }

    const imageCall = (data.output || []).find(item => item.type === "image_generation_call" && item.result);
    if (!imageCall) {
      return res.status(500).json({ error: "No image was returned by the model." });
    }

    return res.status(200).json({ imageBase64: imageCall.result, revisedPrompt: imageCall.revised_prompt || null });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected server error." });
  }
}
