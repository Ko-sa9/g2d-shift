const functions = require("firebase-functions");

exports.callGeminiAPI = functions.https.onCall(
  { timeoutSeconds: 300, memory: "512MiB" },
  async (data) => {
    // サーバーのバージョン(第2世代)の違いによる、データの格納場所のズレを吸収します
    const requestData = data.data || data;

    // フロントエンドからデータを受け取ります
    const prompt = String(requestData.prompt || "").trim();
    const rawContents = Array.isArray(requestData.contents) ? requestData.contents : null;
    const systemInstruction = String(requestData.systemInstruction || "").trim();
    const responseMimeType = requestData.responseMimeType || null;

    // デフォルトは最新の高速・高精度GAモデル（gemini-3.8-flash）を使用します
    const ALLOWED_MODELS = new Set([
      "gemini-3.8-flash",
      "gemini-4-argon",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ]);
    const requestedModel = String(requestData.model || "").trim();
    const primaryModel = ALLOWED_MODELS.has(requestedModel) ? requestedModel : "gemini-3.8-flash";

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new functions.https.HttpsError("internal", "サーバーにAPIキーが設定されていません。");
    }

    // プロンプトも会話履歴も空の場合はAIに送る前にエラーで返します
    if (!prompt && (!rawContents || rawContents.length === 0)) {
      throw new functions.https.HttpsError("invalid-argument", "AIへの指示内容が空です。");
    }

    try {
      // マルチターン会話履歴(contents)があればそれを使用し、なければ単発のpromptを使用します
      const contents =
        rawContents && rawContents.length > 0
          ? rawContents.map((item) => ({
              role: item.role === "model" ? "model" : "user",
              parts: Array.isArray(item.parts)
                ? item.parts
                : [{ text: String(item.text || "") }],
            }))
          : [{ role: "user", parts: [{ text: prompt }] }];

      // Gemini APIへ送るデータを作成します
      const requestBody = { contents };

      // システム指示が存在する場合のみ追加します
      if (systemInstruction) {
        requestBody.system_instruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      // JSON出力指定などの生成オプションがあれば追加します
      if (responseMimeType) {
        requestBody.generationConfig = {
          responseMimeType,
        };
      }

      // APIへ通信を行います（万一指定モデルがAPI側で未提供(404)の場合は安定版Flashへ自動フォールバック）
      const fallbackCandidates = Array.from(
        new Set([primaryModel, "gemini-3.8-flash", "gemini-2.5-flash"])
      );
      let response = null;
      for (let i = 0; i < fallbackCandidates.length; i++) {
        const candidateModel = fallbackCandidates[i];
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }
        );
        if (response.status !== 404 || i === fallbackCandidates.length - 1) {
          break;
        }
        console.warn(`Model ${candidateModel} returned 404, falling back to next GA model.`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || response.statusText);
      }

      const responseData = await response.json();
      const parts = responseData.candidates?.[0]?.content?.parts || [];
      // 推論モデル(Thinking)の内部思考パート(thought: true)を除外し、実際の回答テキストのみを取り出します
      const answerParts = parts.filter((p) => !p.thought && typeof p.text === "string");
      const text =
        (answerParts.length > 0
          ? answerParts.map((p) => p.text).join("")
          : parts.map((p) => p.text || "").join("")) || "No response";

      return { text };
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw new functions.https.HttpsError("internal", error.message);
    }
  }
);