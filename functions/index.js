const functions = require("firebase-functions");

exports.callGeminiAPI = functions.https.onCall(async (data, context) => {
  // サーバーのバージョン(第2世代)の違いによる、データの格納場所のズレを吸収
  const requestData = data.data || data; 

  const prompt = String(requestData.prompt || "").trim();
  const systemInstruction = String(requestData.systemInstruction || "").trim();
  // ★修正: モデル名に -latest を付与してAPIの仕様に合わせる
  const model = requestData.model || "gemini-1.5-flash-latest";
  
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new functions.https.HttpsError("internal", "サーバーにAPIキーが設定されていません。");
  }

  if (!prompt) {
    throw new functions.https.HttpsError("invalid-argument", "AIへの指示内容が空です。");
  }

  try {
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    if (systemInstruction) {
      requestBody.system_instruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || response.statusText);
    }

    const responseData = await response.json();
    const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    
    return { text: text };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});