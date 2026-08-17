// functions/index.js のすべてのコードです。

// Firebase Functionsのモジュール（機能）を読み込みます。
const functions = require("firebase-functions");

// フロントエンド（React）から呼び出せる「callGeminiAPI」という関数を定義して公開します。
exports.callGeminiAPI = functions.https.onCall(async (data, context) => {
  // 1. フロントエンドから送られてきたデータ（プロンプト、システム指示、モデル名）を受け取ります。
  const prompt = data.prompt;
  const systemInstruction = data.systemInstruction;
  const model = data.model || "gemini-1.5-flash";
  
  // 2. サーバーの環境変数（.envファイル）に設定したAPIキーを取得します。
  const apiKey = process.env.GEMINI_API_KEY;

  // APIキーが設定されていない場合は、エラーとして処理を中断します。
  if (!apiKey) {
    throw new functions.https.HttpsError("internal", "サーバーにAPIキーが設定されていません。");
  }

  try {
    // 3. 取得した情報を使って、GoogleのGemini APIへ通信（リクエスト）を行います。
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      }
    );

    // 通信結果が正常でない場合は、エラーメッセージを取得して処理を中断します。
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || response.statusText);
    }

    // 4. 通信が成功した場合、返ってきたデータをJSON形式で読み込みます。
    const responseData = await response.json();
    
    // 5. データの中からAIの回答テキスト部分だけを取り出します。
    const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    
    // 6. 抽出したテキストをフロントエンド（React）へ返却します。
    return { text: text };

  } catch (error) {
    // サーバー内で発生したエラーをコンソールに出力し、フロントエンドにも伝えます。
    console.error("Gemini API Error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});