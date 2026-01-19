// src/firebase.js

// 必要な機能をインポート
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Step 4で取得した鍵情報をここに設定します
// 実際の値に書き換えてください
const firebaseConfig = {
  apiKey: "AIzaSyC7KgH5bhA_RjXUWK5XjZ7ZzNINqmqbzjw",
  authDomain: "g2d-shift.firebaseapp.com",
  projectId: "g2d-shift",
  storageBucket: "g2d-shift.firebasestorage.app",
  messagingSenderId: "576170185815",
  appId: "1:576170185815:web:bd56857b1ef55c193dff12"
};

// Firebaseを初期化
const app = initializeApp(firebaseConfig);
// 認証機能を使う準備
export const auth = getAuth(app);
// データベースを使う準備
export const db = getFirestore(app);

export const appId = "g2d-shift"; // 任意のアプリID