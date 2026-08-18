const functions = require("firebase-functions");

exports.callGeminiAPI = functions.https.onCall(async (data, context) => {
  // 1. フロントエンドからデータを受け取り、確実に文字列として処理します
  const prompt = String(data.prompt || "").trim();
  const systemInstruction = String(data.systemInstruction || "").trim();
  const model = data.model || "gemini-1.5-flash";
  
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new functions.https.HttpsError("internal", "サーバーにAPIキーが設定されていません。");
  }

  // プロンプト（指示内容）が完全に空の場合は、AIに送る前にエラーで返します
  if (!prompt) {
    throw new functions.https.HttpsError("invalid-argument", "AIへの指示内容が空です。");
  }

  try {
    // 2. Gemini APIへ送るデータ（基本形）を作成
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    // 3. ★最も重要な修正ポイント★
    // システム指示（systemInstruction）が存在する場合のみ追加します
    if (systemInstruction) {
      requestBody.system_instruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    // 4. APIへ通信
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