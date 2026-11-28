const { onCall, HttpsError } = require("firebase-functions/https");

exports.callGeminiAPI = onCall(
  { timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    // サーバーのバージョン(第2世代)の違いによる、データの格納場所のズレを吸収します
    const requestData = request.data || request;

    // フロントエンドからデータを受け取ります
    const prompt = String(requestData.prompt || "").trim();
    const rawContents = Array.isArray(requestData.contents) ? requestData.contents : null;
    const systemInstruction = String(requestData.systemInstruction || "").trim();
    const responseMimeType = requestData.responseMimeType || null;

    // デフォルトはバランス実績の高い gemini-4-argon を使用します
    const ALLOWED_MODELS = new Set([
      "gemini-4-argon",
      "gemini-4-carbon",
      "gemini-4-neon",
      "gemini-4-hydrogen",
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
    ]);
    const requestedModel = String(requestData.model || "").trim();
    const primaryModel = ALLOWED_MODELS.has(requestedModel) ? requestedModel : "gemini-4-argon";

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new HttpsError("internal", "サーバーにAPIキーが設定されていません。");
    }

    // プロンプトも会話履歴も空の場合はAIに送る前にエラーで返します
    if (!prompt && (!rawContents || rawContents.length === 0)) {
      throw new HttpsError("invalid-argument", "AIへの指示内容が空です。");
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

      const buildRequestBody = (candidateModel) => {
        const body = { contents };
        if (systemInstruction) {
          body.system_instruction = {
            parts: [{ text: systemInstruction }],
          };
        }
        const genConfig = {};
        if (responseMimeType) {
          genConfig.responseMimeType = responseMimeType;
        }
        // gemini-4-carbon で大容量JSON(シフト表)を生成する際、デフォルトのMEDIUM思考だと60秒超のタイムアウトを招きやすいためLOWに最適化
        if (candidateModel === "gemini-4-carbon" && responseMimeType === "application/json") {
          genConfig.thinkingConfig = {
            thinkingLevel: "LOW",
          };
        }
        if (Object.keys(genConfig).length > 0) {
          body.generationConfig = genConfig;
        }
        return body;
      };

      // 指定モデルが未提供(404)・一時障害(5xx)・長時間応答なし(タイムアウト)の場合は安定モデルへ自動フォールバック
      const fallbackCandidates = Array.from(
        new Set([primaryModel, "gemini-4-argon", "gemini-4-hydrogen", "gemini-3.8-flash"])
      );
      let response = null;
      let lastFetchError = null;

      for (let i = 0; i < fallbackCandidates.length; i++) {
        const candidateModel = fallbackCandidates[i];
        const isLastCandidate = i === fallbackCandidates.length - 1;
        const perAttemptTimeoutMs = candidateModel === "gemini-4-carbon" ? 110000 : 90000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), perAttemptTimeoutMs);

        try {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildRequestBody(candidateModel)),
              signal: controller.signal,
            }
          );
          clearTimeout(timer);

          const isRetryableStatus =
            response.status === 404 ||
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          if (!isRetryableStatus || isLastCandidate) {
            break;
          }
          console.warn(
            `Model ${candidateModel} returned HTTP ${response.status}, falling back to next model.`
          );
        } catch (fetchErr) {
          clearTimeout(timer);
          lastFetchError = fetchErr;
          if (isLastCandidate) {
            throw fetchErr;
          }
          console.warn(
            `Model ${candidateModel} failed/timed out (${fetchErr.message}), falling back to next model.`
          );
        }
      }

      if (!response) {
        throw lastFetchError || new Error("AIサーバーからの応答がありませんでした。");
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
      throw new HttpsError("internal", error.message || "AI呼び出し中にサーバーエラーが発生しました。");
    }
  }
);
