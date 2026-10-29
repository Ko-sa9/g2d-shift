import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Save, Trash2, Plus, ChevronLeft, ChevronRight, Calculator, Sparkles, MessageSquare, X, Send, Loader2, Edit2, Check, RotateCcw, AlertTriangle, User, LogOut, Calendar as CalendarIcon, Lock, Users, Clock, Key, GripVertical, Settings, ShieldCheck, Activity, Zap, Heart, Star, ListFilter, Eraser, Palette, ArrowUp, ArrowDown, Bot, Database, HelpCircle, Wand2 } from 'lucide-react';
import { auth, db, appId } from './firebase'; 
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, collection, setDoc, onSnapshot, updateDoc, addDoc, deleteDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ------------------------------------------------------------------
// 定数・初期設定
// ------------------------------------------------------------------

const ADMIN_VIEW_PASSWORDS = {
  'admin': 'all',        // 全体
  'admin-ope': 'ope',    // オペ班
  'admin-echo': 'echo',  // エコー班
  'admin-hhd': 'hhd',    // HHD班
};

const DEFAULT_CATEGORY_DEFS = {
  'saka':    { id: 'saka',    label: '坂田',    color: 'bg-blue-50 text-blue-800', order: 1 },
  'kimi':    { id: 'kimi',    label: '君津',    color: 'bg-green-50 text-green-800', order: 2 },
  'kikuri':  { id: 'kikuri',  label: '木クリ',  color: 'bg-yellow-50 text-yellow-800', order: 3 }, 
  'jinkuri': { id: 'jinkuri', label: 'じんクリ', color: 'bg-purple-50 text-purple-800', order: 4 },
  'me':      { id: 'me',      label: 'ME室',    color: 'bg-red-50 text-red-800', order: 5 },
  'basic':   { id: 'basic',   label: 'その他',   color: 'bg-gray-50 text-gray-800', order: 6 },
  'off':     { id: 'off',     label: '休み',    color: 'bg-gray-100 text-gray-500', order: 7 },
  'role':    { id: 'role',    label: '役割',    color: 'bg-gray-50 text-gray-800', order: 8 },
  'req':     { id: 'req',     label: '希望',    color: 'bg-pink-50 text-pink-600', order: 9 },
};

const DEFAULT_SHIFT_TYPES = {
  'A': { order: 0, code: 'A', label: '坂3', color: 'bg-transparent', text: 'text-blue-600', startTime: '07:50', endTime: '22:00', overtime: 0, time: '07:50-22:00', category: 'saka', type: 'shift' },
  'P': { order: 1, code: 'P', label: '坂2', color: 'bg-transparent', text: 'text-blue-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'saka', type: 'shift' },
  'C': { order: 2, code: 'C', label: '坂日', color: 'bg-transparent', text: 'text-blue-800', startTime: '07:20', endTime: '16:00', overtime: 0, time: '07:20-16:00', category: 'saka', type: 'shift' },
  'F': { order: 3, code: 'F', label: '君3', color: 'bg-transparent', text: 'text-green-600', startTime: '07:50', endTime: '22:00', overtime: 0, time: '07:50-22:00', category: 'kimi', type: 'shift' },
  'B': { order: 4, code: 'B', label: '君2', color: 'bg-transparent', text: 'text-green-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'kimi', type: 'shift' },
  'D': { order: 5, code: 'D', label: '君日', color: 'bg-transparent', text: 'text-green-800', startTime: '07:20', endTime: '16:00', overtime: 0, time: '07:20-16:00', category: 'kimi', type: 'shift' },
  'I': { order: 6, code: 'I', label: '木2', color: 'bg-transparent', text: 'text-yellow-600', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'kikuri', type: 'shift' },
  'K': { order: 7, code: 'K', label: '木日', color: 'bg-transparent', text: 'text-yellow-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'kikuri', type: 'shift' },
  'Z2': { order: 8, code: 'Z2', label: 'じ',   color: 'bg-transparent', text: 'text-purple-600', startTime: '13:30', endTime: '', overtime: 0, time: '13:30-', category: 'jinkuri', type: 'shift' },
  'Z1': { order: 9, code: 'Z1', label: 'じ半', color: 'bg-transparent', text: 'text-purple-700', startTime: '', endTime: '', overtime: 0, time: 'Short', category: 'jinkuri', type: 'shift' },
  'L':  { order: 10, code: 'L',  label: 'L',    color: 'bg-transparent', text: 'text-red-600',    startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'me', type: 'shift' },
  'G':  { order: 11, code: 'G',  label: 'G',    color: 'bg-transparent', text: 'text-orange-600', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'me', type: 'shift' },
  '/':  { order: 12, code: '/',  label: '出勤', color: 'bg-transparent', text: 'text-gray-800',   startTime: '', endTime: '', overtime: 0, time: '-', category: 'basic', type: 'shift' },
  'O':  { order: 13, code: 'O',  label: '公出', color: 'bg-transparent', text: 'text-indigo-700', startTime: '', endTime: '', overtime: 0, time: '-', category: 'basic', type: 'shift' },
  'S':  { order: 14, code: 'S',  label: '指定', color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift' },
  'H':  { order: 15, code: 'H',  label: '振休', color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift' },
  'Y':  { order: 16, code: 'Y',  label: '年休', color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift' },
  'R':  { order: 17, code: 'R',  label: 'リフレ',color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift' },
  'HOPE': { order: 18, code: 'HOPE', label: '希望', color: 'bg-pink-100', text: 'text-pink-600', startTime: '', endTime: '', overtime: 0, time: 'Request', category: 'req', type: 'shift' },
  
  'task_A': { order: 19, code: 'task_A', label: 'A', color: 'bg-transparent', text: 'text-gray-800', category: 'role', type: 'task' },
  'task_P': { order: 20, code: 'task_P', label: 'P', color: 'bg-transparent', text: 'text-gray-800', category: 'role', type: 'task' },
  'task_N': { order: 21, code: 'task_N', label: 'N', color: 'bg-transparent', text: 'text-gray-800', category: 'role', type: 'task' },
  'task_B': { order: 22, code: 'task_B', label: 'B', color: 'bg-transparent', text: 'text-gray-800', category: 'role', type: 'task' },
  'task_K': { order: 23, code: 'task_K', label: 'K', color: 'bg-transparent', text: 'text-gray-800', category: 'role', type: 'task' },
  'task_3F': { order: 24, code: 'task_3F', label: '3F', color: 'bg-transparent', text: 'text-gray-800', category: 'role', type: 'task' },
  'task_ICU': { order: 25, code: 'task_ICU', label: 'ICU', color: 'bg-transparent', text: 'text-gray-800', category: 'role', type: 'task' },
};

const JOB_TITLES = ['顧問', '科長', '副技士長', '主任', '一般', 'パート'];
const STAFF_ROLES = ['エコー班', 'オペ班', 'HHD班'];
const LEADER_FORCE_TITLES = ['科長', '副技士長', '主任'];

const STAFF_SKILLS = [
  { key: 'isLeader', label: 'リーダー', icon: ShieldCheck, desc: '責任者・指示出し' },
  { key: 'canEcho', label: 'エコー', icon: Activity, desc: '難渋例の穿刺' },
  { key: 'canMachine', label: '機器', icon: Zap, desc: 'トラブル対応' },
  { key: 'canFollow', label: 'フォロー', icon: Heart, desc: '自発的ヘルプ' },
  { key: 'isVeteran', label: 'ベテラン', icon: Star, desc: '5年以上・指導役' },
];

const COLOR_OPTIONS = [
  { value: 'text-gray-800', label: '黒' },
  { value: 'text-red-600', label: '赤' },
  { value: 'text-red-400', label: '薄ピンク(休み色)' }, // ← 追加：実際の休みシフトに使われている色
  { value: 'text-blue-600', label: '青' },
  { value: 'text-green-600', label: '緑' },
  { value: 'text-yellow-600', label: '黄' },
  { value: 'text-purple-600', label: '紫' },
  { value: 'text-pink-600', label: 'ピンク' },
  { value: 'text-orange-600', label: 'オレンジ' },
];

const BG_COLOR_OPTIONS = [
  { value: 'bg-white text-gray-800', label: '設定なし' },
  { value: 'bg-gray-50 text-gray-600', label: 'グレー' },
  { value: 'bg-red-50 text-red-800', label: '赤' },
  { value: 'bg-blue-50 text-blue-800', label: '青' },
  { value: 'bg-green-50 text-green-800', label: '緑' },
  { value: 'bg-yellow-50 text-yellow-800', label: '黄' },
  { value: 'bg-purple-50 text-purple-800', label: '紫' },
  { value: 'bg-pink-50 text-pink-600', label: 'ピンク' },
];

const TEAMS = [
  { id: 'all', label: '全体', role: null },
  { id: 'ope', label: 'オペ班', role: 'オペ班' }, 
  { id: 'echo', label: 'エコー班', role: 'エコー班' },
  { id: 'hhd', label: 'HHD班', role: 'HHD班' },
];

// 画面のドロップダウン等で選択できるAIモデルのリストを定義します
// ユーザーが用途に合わせてAIの性能を選べるようにするための設定です
const AI_MODELS = [
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (最新高速・相談推奨)' },
  { value: 'gemini-4-argon', label: 'Gemini 4 Argon (最高性能・推論重視)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (高精度推論)' },
];

const AI_QUICK_PROMPTS = [
  {
    label: '🔍 不足日・スコア割れを診断',
    text: '今月の勤務表で、必要人数が足りていない日や各施設（坂田・君津・木クリ）の目標スコアを下回っている日をチェックして、どう補うとよさそうか相談させてください。',
  },
  {
    label: '⚖️ 出勤・3クール・残業の偏り確認',
    text: 'スタッフごとの出勤日数・3クール回数・残業時間のバランスを見て、負担が偏っている人がいないか確認してください。',
  },
  {
    label: '🧩 空欄を仮組みして提案して',
    text: 'スタッフ本人の希望箇所と既存のシフトを尊重しつつ、現在空欄になっている箇所をルールに沿って埋める変更案を作成してください。',
  },
  {
    label: '💡 今月の注意点・改善ポイント',
    text: '現在のシフト表全体を見て、連勤やスキル配置（リーダー・エコー等）の観点から気をつけた方がよい日や改善アイデアがあれば教えてください。',
  },
];

const INITIAL_STAFF = [
  { id: '1', loginId: '1', name: '職員A', jobTitle: '副技士長', roles: ['オペ班'], skills: { isLeader: true, isVeteran: true }, password: '1234', maxCool3: 5 },
  { id: '2', loginId: '2', name: '職員B', jobTitle: '主任', roles: ['エコー班'], skills: { isLeader: true, canEcho: true }, password: '1234', maxCool3: 5 },
  { id: '3', loginId: '3', name: '職員C', jobTitle: '一般', roles: [], skills: { canMachine: true }, password: '1234', maxCool3: 5 },
  { id: '4', loginId: '4', name: '職員D', jobTitle: '一般', roles: [], skills: { canFollow: true }, password: '1234', maxCool3: 5 },
  { id: '5', loginId: '5', name: '職員E', jobTitle: '一般', roles: [], skills: {}, password: '1234', maxCool3: 5 },
  { id: '6', loginId: '6', name: '職員F', jobTitle: 'パート', roles: [], skills: {}, password: '1234', maxCool3: 0, excludeFromAi: true },
];

const TEAM_ADMIN_LABELS = {
  ope: 'オペ班管理者',
  echo: 'エコー班管理者',
  hhd: 'HHD班管理者',
};

const DEFAULT_FACILITY_SKILL_TARGETS = {
  saka: { isLeader: 1, canEcho: 0, canMachine: 0, canFollow: 0, isVeteran: 0 },
  kimi: { isLeader: 1, canEcho: 0, canMachine: 0, canFollow: 0, isVeteran: 0 },
  kikuri: { isLeader: 1, canEcho: 0, canMachine: 0, canFollow: 0, isVeteran: 0 },
  jinkuri: { isLeader: 0, canEcho: 0, canMachine: 0, canFollow: 0, isVeteran: 0 },
};

const DEFAULT_ADMIN_SETTINGS = {
  'all':   { password: 'admin',       label: '全体管理者' },
  'ope':   { password: 'admin-ope',   label: 'オペ班管理者' }, 
  'echo':  { password: 'admin-echo',  label: 'エコー班管理者' },
  'hhd':   { password: 'admin-hhd',   label: 'HHD班管理者' },
  'deadline': '',    // 旧設定（念のため残す）
  'deadlineDay': '', // ★追加: 毎月の締切日 (1-31の数値)
  'countedOffShifts': ['HOPE'], // 休み希望人数にカウントするシフトコード配列
  'offRequestAlertCount': '',   // 休み希望人数の強調表示（目安人数）
  'clinicClosedDays': [],       // 外来診療休診日設定（祝日と同様に赤表示）
  'maxConsecutiveWorkDays': 5,  // AI作成時の最大連勤数（週休2日標準: 5連勤まで）
  'monthlyRegularOffDays': 'auto', // 月間の基本公休数（日曜除く指定休・振休枠: 'auto' または数値）
  'facilitySkillTargets': DEFAULT_FACILITY_SKILL_TARGETS, // Step 4: 施設ごとの必須スキル最低人数
};

const TIME_OPTIONS = [];
for (let h = 7; h <= 23; h++) {
  TIME_OPTIONS.push(`${h.toString().padStart(2, '0')}:00`);
  TIME_OPTIONS.push(`${h.toString().padStart(2, '0')}:30`);
}

// ------------------------------------------------------------------
// ヘルパー関数群
// ------------------------------------------------------------------

const getHolidaysForYear = (year) => {
  const holidayMap = {}; 
  const fixed = {
    "1-1": "元日", "2-11": "建国記念の日", "2-23": "天皇誕生日", "4-29": "昭和の日",
    "5-3": "憲法記念日", "5-4": "みどりの日", "5-5": "こどもの日",
    "8-11": "山の日", "11-3": "文化の日", "11-23": "勤労感謝の日"
  };
  Object.keys(fixed).forEach(md => {
    const [m, d] = md.split('-').map(Number);
    holidayMap[new Date(year, m - 1, d).getTime()] = true;
  });
  const happyMondays = [
    { m: 1, w: 2 }, { m: 7, w: 3 }, { m: 9, w: 3 }, { m: 10, w: 2 }
  ];
  happyMondays.forEach(({ m, w }) => {
    let d = 1;
    let count = 0;
    while (count < w) {
      if (new Date(year, m - 1, d).getDay() === 1) count++;
      if (count < w) d++;
    }
    holidayMap[new Date(year, m - 1, d).getTime()] = true;
  });
  const vernal = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const autumnal = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  holidayMap[new Date(year, 2, vernal).getTime()] = true;
  holidayMap[new Date(year, 8, autumnal).getTime()] = true;
  const sortedHolidays = Object.keys(holidayMap).map(Number).sort((a, b) => a - b);
  sortedHolidays.forEach(time => {
    const date = new Date(time);
    if (date.getDay() === 0) { 
      let nextDate = new Date(time);
      nextDate.setDate(nextDate.getDate() + 1);
      while (holidayMap[nextDate.getTime()]) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      holidayMap[nextDate.getTime()] = true; 
    }
  });
  const finalHolidays = Object.keys(holidayMap).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < finalHolidays.length - 1; i++) {
    const t1 = finalHolidays[i];
    const t2 = finalHolidays[i+1];
    const diffDays = (t2 - t1) / (1000 * 60 * 60 * 24);
    if (diffDays === 2) {
       const middleDate = new Date(t1);
       middleDate.setDate(middleDate.getDate() + 1);
       if (middleDate.getDay() !== 0 && !holidayMap[middleDate.getTime()]) {
          holidayMap[middleDate.getTime()] = true;
       }
    }
  }
  return holidayMap;
};

const getMaxDaysForMonthRule = (m) => {
  const monthNum = Number(m);
  if (monthNum === 2) return 29;
  if ([4, 6, 9, 11].includes(monthNum)) return 30;
  return 31;
};

const getClinicClosedRuleMatch = (year, month, day, clinicClosedDays = []) => {
  if (!Array.isArray(clinicClosedDays) || clinicClosedDays.length === 0) return null;
  const md = month * 100 + day;
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  for (const rule of clinicClosedDays) {
    if (!rule) continue;
    if (rule.type === 'yearly') {
      const sMD = Number(rule.startMonth) * 100 + Number(rule.startDay);
      const eMD = Number(rule.endMonth) * 100 + Number(rule.endDay);
      if (!sMD || !eMD) continue;
      // 12/29〜1/3 のような年またぎ期間にも対応
      const matched = sMD <= eMD ? (md >= sMD && md <= eMD) : (md >= sMD || md <= eMD);
      if (matched) return rule;
    } else if (rule.type === 'specific') {
      if (!rule.startDate) continue;
      const sDate = rule.startDate;
      const eDate = rule.endDate || rule.startDate;
      const [minD, maxD] = sDate <= eDate ? [sDate, eDate] : [eDate, sDate];
      if (dateStr >= minD && dateStr <= maxD) return rule;
    }
  }
  return null;
};

const isClinicClosedDay = (year, month, day, clinicClosedDays = []) => {
  return !!getClinicClosedRuleMatch(year, month, day, clinicClosedDays);
};

const formatClinicClosedRule = (rule) => {
  if (!rule) return '';
  if (rule.type === 'yearly') {
    if (Number(rule.startMonth) === Number(rule.endMonth) && Number(rule.startDay) === Number(rule.endDay)) {
      return `${rule.startMonth}月${rule.startDay}日`;
    }
    return `${rule.startMonth}月${rule.startDay}日 〜 ${rule.endMonth}月${rule.endDay}日`;
  }
  const formatYMD = (str) => {
    if (!str) return '';
    const [y, m, d] = str.split('-').map(Number);
    return `${y}年${m}月${d}日`;
  };
  const endStr = rule.endDate || rule.startDate;
  if (rule.startDate === endStr) {
    return formatYMD(rule.startDate);
  }
  return `${formatYMD(rule.startDate)} 〜 ${formatYMD(endStr)}`;
};

const HOLIDAY_CACHE = {};
const isHoliday = (year, month, day, clinicClosedDays = []) => {
  if (!HOLIDAY_CACHE[year]) {
    HOLIDAY_CACHE[year] = getHolidaysForYear(year);
  }
  const date = new Date(year, month - 1, day);
  if (HOLIDAY_CACHE[year][date.getTime()]) return true;
  return isClinicClosedDay(year, month, day, clinicClosedDays);
};

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
const getDayOfWeek = (year, month, day) => new Date(year, month - 1, day).getDay();
const isSunday = (year, month, day) => getDayOfWeek(year, month, day) === 0;
const getDayColor = (year, month, day, clinicClosedDays = []) => {
  const dow = getDayOfWeek(year, month, day);
  if (isHoliday(year, month, day, clinicClosedDays)) return 'text-red-500 bg-red-50';
  if (dow === 0) return 'text-red-500 bg-red-50';
  if (dow === 6) return 'text-blue-500 bg-blue-50';
  return 'text-gray-700';
};

const generateCalendarDays = (year, month) => {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const days = [];
  const prevMonthDays = firstDay.getDay(); 
  for (let i = 0; i < prevMonthDays; i++) {
    days.unshift({ date: new Date(year, month - 1, 1 - (i + 1)), currentMonth: false });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month - 1, i), currentMonth: true, day: i });
  }
const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month, i), currentMonth: false });
  }
  return days;
};

// 共通のAI呼び出し関数（API経由）
// アプリ内の各機能からAIを利用する際の窓口となる関数です
// 引数でモデル指定が省略された場合は、デフォルトで最新の gemini-3.8-flash を使用します
const callGemini = async (prompt, systemInstruction = "", model = "gemini-3.8-flash", options = {}) => { 
  // デバッグ用に実行時のモデル名をコンソールに記録し、どのモデルが呼ばれたか確認できるようにします
  console.log("Model:", model, "バックエンド経由でAIを呼び出します"); 

  try {
    const functions = getFunctions();
    const callGeminiAPI = httpsCallable(functions, 'callGeminiAPI', { timeout: 300000 });

    const payload = {
      prompt: prompt,
      systemInstruction: systemInstruction,
      model: model,
    };
    if (Array.isArray(options.contents) && options.contents.length > 0) {
      payload.contents = options.contents;
    }
    if (options.responseMimeType) {
      payload.responseMimeType = options.responseMimeType;
    }

    const result = await callGeminiAPI(payload);

    return result.data.text;
    
  } catch (error) {
    console.error("Gemini Error:", error);
    return `⚠️ エラー: AIの呼び出しに失敗しました。\n詳細: ${error.message}\n\n※サーバー側の処理でエラーが発生しているか、通信状況を確認してください。`;
  }
};

const LoginScreen = ({ onLogin, staffList, adminSettings = DEFAULT_ADMIN_SETTINGS, isDataLoaded }) => {
  const [selectedRole, setSelectedRole] = useState('staff');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (selectedRole === 'admin') {
      const foundViewKey = Object.keys(adminSettings).find(key => adminSettings[key]?.password === password);
      
      if (foundViewKey) {
        onLogin({ role: 'admin', name: '管理者', initialView: foundViewKey });
      } else {
        setError('パスワードが違います。');
      }
    } else {
      const staff = staffList.find(s => s.loginId === loginId);
      if (!staff) {
        setError('ログインIDが見つかりません');
        return;
      }
      if (password === staff.password) {
        onLogin({ role: 'staff', ...staff });
      } else {
        setError('パスワードが違います (初期: 職員IDと同じ)');
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6 flex justify-center items-center gap-2">
          <Calculator className="text-blue-600"/> 勤務表システム
        </h2>
        <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
          <button className={`flex-1 py-2 rounded-md font-bold text-sm transition ${selectedRole === 'staff' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`} onClick={() => { setSelectedRole('staff'); setError(''); }}>職員ログイン</button>
          <button className={`flex-1 py-2 rounded-md font-bold text-sm transition ${selectedRole === 'admin' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`} onClick={() => { setSelectedRole('admin'); setError(''); }}>管理者ログイン</button>
        </div>
        <div className="space-y-4">
          {selectedRole === 'staff' && (
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">ログインID</label>
              <input type="text" className="w-full border p-2 rounded-lg" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="IDを入力" />
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">パスワード</label>
            <input type="password" className="w-full border p-2 rounded-lg" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}/>
          </div>
          {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}
          
          {/* ★修正: データが読み込まれるまではボタンを押せないようにする */}
          {!isDataLoaded ? (
            <button disabled className="w-full py-3 rounded-lg font-bold text-white shadow bg-gray-400 cursor-not-allowed flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={18}/> データを読み込み中...
            </button>
          ) : (
            <button onClick={handleLogin} className={`w-full py-3 rounded-lg font-bold text-white shadow transition transform active:scale-95 ${selectedRole === 'admin' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>ログイン</button>
          )}
          
          <div className="text-xs text-gray-400 text-center mt-4">
            ※パスワード変更はログイン後に行えます。<br/>
            忘れた場合は管理者へ連絡してください。
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// メインアプリコンポーネント
// ------------------------------------------------------------------

export default function WorkScheduleApp() {
  const [authUser, setAuthUser] = useState(null); 
  const [appUser, setAppUser] = useState(null); 
  const [isDataLoaded, setIsDataLoaded] = useState(false); // ★追加: データ通信完了フラグ
  
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [staffList, setStaffList] = useState([]);
  const [shiftDefs, setShiftDefs] = useState(DEFAULT_SHIFT_TYPES);
  const [categoryDefs, setCategoryDefs] = useState(DEFAULT_CATEGORY_DEFS); 
  const [adminSettings, setAdminSettings] = useState(DEFAULT_ADMIN_SETTINGS); 
  const [targetCounts, setTargetCounts] = useState({});

  const [shiftData, setShiftData] = useState({});
  const [prevMonthShiftData, setPrevMonthShiftData] = useState({}); // Step 3: 前月シフトの引き継ぎ用データ
  const [taskData, setTaskData] = useState({});
  const [userInputs, setUserInputs] = useState({}); // ★追加：個人が入力した箇所を記憶するリスト

  const [changeLogs, setChangeLogs] = useState([]); // ★追加：変更ログ用
  
  const [activePopup, setActivePopup] = useState(null);
  const [popupReasonText, setPopupReasonText] = useState('');
  const popupRef = useRef(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showShiftEditModal, setShowShiftEditModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [showStaffSettingsModal, setShowStaffSettingsModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null, title: '確認' });
  const [showTargetCountModal, setShowTargetCountModal] = useState(false);
  
  const [viewMode, setViewMode] = useState('personal'); 
  const [currentView, setCurrentView] = useState('all'); 

// 設定モーダル内のタブ管理
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('category'); 

  const [targetAdminKey, setTargetAdminKey] = useState('all');

  const [editingShift, setEditingShift] = useState(null);
  const [targetStaff, setTargetStaff] = useState(null);
  const [showStaffShiftDetailRestriction, setShowStaffShiftDetailRestriction] = useState(false);
  const [targetCategory, setTargetCategory] = useState(null); 
  const [newPassword, setNewPassword] = useState('');

  // 基本設定：外来診療休診日追加フォーム用の状態
  const [closedFormType, setClosedFormType] = useState('yearly'); // 'yearly' | 'specific'
  const [closedStartMonth, setClosedStartMonth] = useState(12);
  const [closedStartDay, setClosedStartDay] = useState(29);
  const [closedEndMonth, setClosedEndMonth] = useState(12);
  const [closedEndDay, setClosedEndDay] = useState(29);
  const [closedStartDate, setClosedStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [closedEndDate, setClosedEndDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [closedLabelInput, setClosedLabelInput] = useState('');
  
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [expandedProposalIds, setExpandedProposalIds] = useState({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0); // 【追加】進行状況(%)を管理する状態変数

  const [aiModel, setAiModel] = useState('gemini-3.8-flash'); 
  const chatEndRef = useRef(null);

  const [showAutoFillModal, setShowAutoFillModal] = useState(false);
  
  const [autoFillConditions, setAutoFillConditions] = useState(() => {
    const saved = localStorage.getItem('savedAutoFillConditions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 【追加】過去のデータが単なる文字列や優先度未設定だった場合、チェックボックス＋優先度（初期値: strict=絶対）付きの形式に変換します
        return parsed.map((item, index) => 
          typeof item === 'string'
            ? { id: Date.now() + index, text: item, active: true, priority: 'strict' }
            : {
                ...item,
                active: item.active !== undefined ? !!item.active : true,
                priority: item.priority === 'soft' ? 'soft' : 'strict',
              }
        );
      } catch (e) {        console.error("ローカルストレージの条件データの解析に失敗しました", e);
        return [];
      }
    }
    return [];
  });
  
  const [newConditionText, setNewConditionText] = useState(''); // 新しく入力中の条件テキストを管理します
  const [newConditionPriority, setNewConditionPriority] = useState('strict'); // Step 5: 新規条件の優先度（初期値: 'strict' = 絶対）

  // 条件リスト（autoFillConditions）に追加や削除などの変更が加わるたびに、
  // 最新の配列データを文字列に変換（stringify）してローカルストレージへ自動保存します。
  // これによりブラウザをリロードしても条件リストが復元されます。
  useEffect(() => {
    localStorage.setItem('savedAutoFillConditions', JSON.stringify(autoFillConditions));
  }, [autoFillConditions]);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setAuthUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'general', 'masterData');
    const unsubMaster = onSnapshot(masterDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        const loadedStaffList = (data.staffList || []).map(s => ({
          ...s,
          loginId: s.loginId || '',
          skills: s.skills || {},
          maxCool3: s.maxCool3 !== undefined ? s.maxCool3 : 5, 
          excludeFromAi: s.excludeFromAi || false,
          excludedCategories: Array.isArray(s.excludedCategories) ? s.excludedCategories : [],
          excludedShifts: Array.isArray(s.excludedShifts) ? s.excludedShifts : [],
        }));

        const loadedCategoryDefs = { ...(data.categoryDefs || DEFAULT_CATEGORY_DEFS) };
        if (!loadedCategoryDefs['me'] && !Object.values(loadedCategoryDefs).some(c => c?.label?.includes('ME'))) {
          loadedCategoryDefs['me'] = { ...DEFAULT_CATEGORY_DEFS['me'] };
        }

        const rawShiftDefs = data.shiftDefs || DEFAULT_SHIFT_TYPES;
        const loadedShiftDefs = {};
        Object.keys(rawShiftDefs).forEach(k => {
          if (rawShiftDefs[k]) {
            loadedShiftDefs[k] = {
              ...rawShiftDefs[k],
              code: rawShiftDefs[k].code || k,
              type: rawShiftDefs[k].type || (rawShiftDefs[k].category === 'role' || k.startsWith('task_') ? 'task' : 'shift'),
            };
          }
        });
        const hasShiftL = Object.values(loadedShiftDefs).some(
          s => s && s.type === 'shift' && (s.code === 'L' || (s.label || '').trim() === 'L' || (s.label || '').trim() === 'Ｌ')
        );
        const hasShiftG = Object.values(loadedShiftDefs).some(
          s => s && s.type === 'shift' && (s.code === 'G' || (s.label || '').trim() === 'G' || (s.label || '').trim() === 'Ｇ')
        );
        if (!hasShiftL) loadedShiftDefs['L'] = { ...DEFAULT_SHIFT_TYPES['L'] };
        if (!hasShiftG) loadedShiftDefs['G'] = { ...DEFAULT_SHIFT_TYPES['G'] };

        setStaffList(loadedStaffList);
        setShiftDefs(loadedShiftDefs);
        setCategoryDefs(loadedCategoryDefs); 
        setTargetCounts(data.targetCounts || {});
        
        let loadedAdminSettings = data.adminSettings || DEFAULT_ADMIN_SETTINGS;
        if (loadedAdminSettings['opera']) {
           const { opera, ...rest } = loadedAdminSettings;
           loadedAdminSettings = { ...rest, 'ope': opera };
        }
        setAdminSettings(loadedAdminSettings);

        if (Array.isArray(data.autoFillConditions)) {
          setAutoFillConditions(
            data.autoFillConditions.map((item, index) =>
              typeof item === 'string'
                ? { id: Date.now() + index, text: item, active: true, priority: 'strict' }
                : {
                    ...item,
                    active: item.active !== undefined ? !!item.active : true,
                    priority: item.priority === 'soft' ? 'soft' : 'strict',
                  }
            )
          );
        }
      } else {
        // ★修正: 勝手にデータベースを初期化（上書き保存）する処理を削除
        // 通信エラー時などに本番データが破壊されるのを防ぎます
        setStaffList(INITIAL_STAFF);
        setShiftDefs(DEFAULT_SHIFT_TYPES);
        setCategoryDefs(DEFAULT_CATEGORY_DEFS);
        setAdminSettings(DEFAULT_ADMIN_SETTINGS);
        setTargetCounts({});
      }
      setIsDataLoaded(true); // ★追加: データの有無に関わらず、通信が終わったらフラグを立てる
    });
    const scheduleId = `schedule_${year}_${month}`;
    const scheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
    const unsubSchedule = onSnapshot(scheduleDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setShiftData(data.shifts || {});
        setTaskData(data.tasks || {});
        setUserInputs(data.userInputs || {}); // ★追加: 保護リストを読み込む
      } else {
        setShiftData({});
        setTaskData({});
        setUserInputs({});
      }
    });
    // Step 3: 月またぎの連勤・週休・3クール連続判定のため前月スケジュールもリアルタイム購読
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevScheduleId = `schedule_${prevYear}_${prevMonth}`;
    const prevScheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', prevScheduleId);
    const unsubPrevSchedule = onSnapshot(prevScheduleDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const pData = docSnap.data();
        setPrevMonthShiftData(pData.shifts || {});
      } else {
        setPrevMonthShiftData({});
      }
    });

    return () => {
      unsubMaster();
      unsubSchedule();
      unsubPrevSchedule();
    };
  }, [authUser, year, month]);

  // ★追加：変更ログを監視・取得する処理
  useEffect(() => {
    if (!authUser) return;
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'logs');
    // 今の年月のログだけを取得
    const q = query(logsRef, where('targetYear', '==', year), where('targetMonth', '==', month));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setChangeLogs(logs);
    });
    return () => unsubscribe();
  }, [authUser, year, month]);

  // AI Chat Auto Scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

// ★引数に newUserInputs を追加し、デフォルト値として現在の userInputs を設定します
  const saveSchedule = async (newShifts, newTasks, newUserInputs = userInputs) => {
    if (!authUser) return;
    const scheduleId = `schedule_${year}_${month}`;
    const scheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
    
    try {
      // ★ userInputs も一緒に保存します
      await updateDoc(scheduleDocRef, { shifts: newShifts, tasks: newTasks, userInputs: newUserInputs });
    } catch (e) {
      if (e.code === 'not-found') {
        await setDoc(scheduleDocRef, { shifts: newShifts, tasks: newTasks, userInputs: newUserInputs });
      } else {
        console.error("Save error:", e);
      }
    }
  };

  // ★修正: 変更したいデータだけを指定して安全に更新する仕組みに変更
  const saveMasterData = async (updates) => {
    if (!authUser) return;
    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'general', 'masterData');
    try {
      // updateDoc を使うことで、指定したデータ（例: 職員リストだけ）を更新し、他のデータを保護する
      await updateDoc(masterDocRef, updates);
    } catch (e) {
      // 万が一ドキュメント自体が存在しない場合は新規作成
      if (e.code === 'not-found') {
        await setDoc(masterDocRef, { 
          staffList: INITIAL_STAFF, 
          shiftDefs: DEFAULT_SHIFT_TYPES, 
          categoryDefs: DEFAULT_CATEGORY_DEFS,
          adminSettings: DEFAULT_ADMIN_SETTINGS, 
          targetCounts: {},
          ...updates // 今回保存したいデータを反映
        });
      } else {
        console.error("データ保存エラー:", e);
      }
    }
  };

// ★追加：ログを確認して削除する処理
  const handleConfirmLogs = async () => {
    // 誤操作防止のため、確認ダイアログを出します
    const msg = '全ての変更通知を確認済みにしますか？\n（画面上の黄色い強調表示が消えます）';
    if (!window.confirm(msg)) return;
    
    try {
      // 現在画面に表示されているログ(changeLogs)をひとつずつ削除します
      const promises = changeLogs.map(log => 
        deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'logs', log.id))
      );
      
      // 全ての削除処理が終わるのを待ちます
      await Promise.all(promises);
      
      alert('確認しました。通知を消去します。');
    } catch (error) {
      console.error("削除エラー:", error);
      alert('エラーが発生しました: ' + error.message);
    }
  };

  // 個人の入力履歴(userInputs)を { shift?: string, task?: string } 形式に正規化するヘルパー（旧booleanデータ互換）
  const normalizeUserInputEntry = (rawEntry, currentShiftCode, currentTaskCode) => {
    if (!rawEntry) return {};
    if (rawEntry === true) {
      const migrated = {};
      if (currentShiftCode) migrated.shift = currentShiftCode;
      if (currentTaskCode) migrated.task = currentTaskCode;
      return migrated;
    }
    if (typeof rawEntry === 'string') {
      return { shift: rawEntry };
    }
    if (typeof rawEntry === 'object') {
      return { ...rawEntry };
    }
    return {};
  };

  // 本人が入力した元の希望シフトコードを取得
  const getUserRequestedShift = (staffId, day) => {
    const raw = userInputs[staffId]?.[day];
    if (!raw) return null;
    if (raw === true) return shiftData[staffId]?.[day] || null;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') return raw.shift || null;
    return null;
  };

  // 本人が入力した元の希望タスクコードを取得
  const getUserRequestedTask = (staffId, day) => {
    const raw = userInputs[staffId]?.[day];
    if (!raw) return null;
    if (raw === true) return taskData[staffId]?.[day] || null;
    if (typeof raw === 'object') return raw.task || null;
    return null;
  };

  // 本人が入力した希望理由を取得
  const getUserRequestedReason = (staffId, day) => {
    const raw = userInputs[staffId]?.[day];
    if (raw && typeof raw === 'object' && typeof raw.reason === 'string') {
      return raw.reason;
    }
    return '';
  };

  // スタッフ入力時の締切日超過チェック共通関数
  const checkIsAfterDeadlineForStaff = () => {
    let isAfterDeadline = false;
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');
    const deadlineDay = parseInt(adminSettings.deadlineDay);

    if (deadlineDay && !isNaN(deadlineDay)) {
      const deadlineDate = new Date(year, month - 2, deadlineDay);
      const deadlineStr = deadlineDate.getFullYear() + '-' + (deadlineDate.getMonth() + 1).toString().padStart(2, '0') + '-' + deadlineDate.getDate().toString().padStart(2, '0');
      if (todayStr > deadlineStr) {
        isAfterDeadline = true;
      }
    } else if (adminSettings.deadline && todayStr > adminSettings.deadline) {
      isAfterDeadline = true;
    }

    if (isAfterDeadline) {
      alert("締切日を過ぎているため、入力・変更はできません。\n変更が必要な場合は管理者へご連絡ください。");
      return true;
    }
    return false;
  };

  // スタッフが既存の希望に対して「希望理由のみ」を追記・更新・削除するハンドラ
  const handleSaveStaffReason = (staffId, day, newReason) => {
    if (appUser.role === 'staff') {
      if (staffId !== appUser.id) return;
      if (checkIsAfterDeadlineForStaff()) return;
    }

    const currentShiftBefore = shiftData[staffId]?.[day];
    const currentTaskBefore = taskData[staffId]?.[day];
    const entry = normalizeUserInputEntry(userInputs[staffId]?.[day], currentShiftBefore, currentTaskBefore);

    const targetShift = entry.shift || currentShiftBefore;
    if (!targetShift) return;
    entry.shift = targetShift;

    const trimmed = (newReason || '').trim().slice(0, 50);
    if (trimmed) {
      entry.reason = trimmed;
    } else {
      delete entry.reason;
    }

    const nextUserInputs = {
      ...userInputs,
      [staffId]: {
        ...(userInputs[staffId] || {}),
        [day]: entry
      }
    };

    setUserInputs(nextUserInputs);
    saveSchedule(shiftData, taskData, nextUserInputs);
  };

  // 管理者が「希望履歴そのもの」を取り消すハンドラ
  const handleClearUserRequest = (staffId, day, type = 'shift') => {
    const currentShiftBefore = shiftData[staffId]?.[day];
    const currentTaskBefore = taskData[staffId]?.[day];
    const entry = normalizeUserInputEntry(userInputs[staffId]?.[day], currentShiftBefore, currentTaskBefore);
    const reqCode = type === 'shift' ? entry.shift : entry.task;

    delete entry[type];
    if (type === 'shift') {
      delete entry.reason;
    }

    const nextUserInputs = { ...userInputs };
    if (nextUserInputs[staffId]) {
      nextUserInputs[staffId] = { ...nextUserInputs[staffId] };
    } else {
      nextUserInputs[staffId] = {};
    }

    if (entry.shift || entry.task || entry.teamShiftBy || entry.teamTaskBy) {
      nextUserInputs[staffId][day] = entry;
    } else {
      delete nextUserInputs[staffId][day];
    }

    let nextShifts = shiftData;
    let nextTasks = taskData;

    // 現在のシフト・タスクが元の希望と同じままだった場合は、セル自体も空欄にする
    if (type === 'shift' && reqCode && currentShiftBefore === reqCode) {
      nextShifts = { ...shiftData, [staffId]: { ...(shiftData[staffId] || {}) } };
      delete nextShifts[staffId][day];
      setShiftData(nextShifts);
    } else if (type === 'task' && reqCode && currentTaskBefore === reqCode) {
      nextTasks = { ...taskData, [staffId]: { ...(taskData[staffId] || {}) } };
      delete nextTasks[staffId][day];
      setTaskData(nextTasks);
    }

    setUserInputs(nextUserInputs);
    saveSchedule(nextShifts, nextTasks, nextUserInputs);
  };

  // 基本設定でカウント対象シフトをON/OFF切り替え
  const toggleCountedOffShift = (code) => {
    const currentList = Array.isArray(adminSettings.countedOffShifts) ? adminSettings.countedOffShifts : ['HOPE'];
    const nextList = currentList.includes(code)
      ? currentList.filter(c => c !== code)
      : [...currentList, code];
    const newSettings = { ...adminSettings, countedOffShifts: nextList };
    setAdminSettings(newSettings);
    saveMasterData({ adminSettings: newSettings });
  };

  // 基本設定で外来診療休診日を追加
  const handleAddClinicClosedRule = (presetRule = null) => {
    const currentList = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    let newRule = null;

    if (presetRule) {
      newRule = {
        id: `closed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ...presetRule,
      };
    } else if (closedFormType === 'yearly') {
      const sM = Number(closedStartMonth);
      const sD = Math.min(Number(closedStartDay), getMaxDaysForMonthRule(sM));
      const eM = Number(closedEndMonth);
      const eD = Math.min(Number(closedEndDay), getMaxDaysForMonthRule(eM));
      newRule = {
        id: `closed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'yearly',
        startMonth: sM,
        startDay: sD,
        endMonth: eM,
        endDay: eD,
        label: closedLabelInput.trim(),
      };
    } else {
      if (!closedStartDate) {
        alert('開始日を選択してください。');
        return;
      }
      const rawEnd = closedEndDate || closedStartDate;
      const [sDate, eDate] = closedStartDate <= rawEnd
        ? [closedStartDate, rawEnd]
        : [rawEnd, closedStartDate];
      newRule = {
        id: `closed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'specific',
        startDate: sDate,
        endDate: eDate,
        label: closedLabelInput.trim(),
      };
    }

    const isDuplicate = currentList.some(r => {
      if (r.type !== newRule.type) return false;
      if (r.type === 'yearly') {
        return (
          Number(r.startMonth) === newRule.startMonth &&
          Number(r.startDay) === newRule.startDay &&
          Number(r.endMonth) === newRule.endMonth &&
          Number(r.endDay) === newRule.endDay
        );
      }
      return r.startDate === newRule.startDate && (r.endDate || r.startDate) === newRule.endDate;
    });

    if (isDuplicate) {
      alert('同じ日程の休診日が既に登録されています。');
      return;
    }

    const nextList = [...currentList, newRule];
    const newSettings = { ...adminSettings, clinicClosedDays: nextList };
    setAdminSettings(newSettings);
    saveMasterData({ adminSettings: newSettings });

    if (!presetRule) {
      setClosedLabelInput('');
      if (closedFormType === 'yearly') {
        setClosedEndMonth(closedStartMonth);
        setClosedEndDay(closedStartDay);
      } else {
        setClosedEndDate(closedStartDate);
      }
    }
  };

  // 基本設定で外来診療休診日を削除
  const handleRemoveClinicClosedRule = (ruleId) => {
    const currentList = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    const nextList = currentList.filter(r => r.id !== ruleId);
    const newSettings = { ...adminSettings, clinicClosedDays: nextList };
    setAdminSettings(newSettings);
    saveMasterData({ adminSettings: newSettings });
  };

  // ME室（オペ班のL/G等）に該当するシフトコードかどうかを判定するヘルパー
  const isMeRoomShiftCode = (code, defs = shiftDefs, cats = categoryDefs) => {
    if (!code || !defs[code]) return false;
    const def = defs[code];
    if (def.type && def.type !== 'shift') return false;
    if (def.category === 'me') return true;
    const catLabel = cats[def.category]?.label || '';
    if (catLabel.includes('ME')) return true;
    const normLabel = (def.label || '').trim();
    return code === 'L' || code === 'G' || normLabel === 'L' || normLabel === 'G' || normLabel === 'Ｌ' || normLabel === 'Ｇ';
  };

  // 現在ログイン中または選択中の班管理者キー（ope / echo / hhd）を取得
  const getActiveTeamAdminKey = () => {
    if (!appUser || appUser.role !== 'admin') return null;
    if (['ope', 'echo', 'hhd'].includes(appUser.initialView)) return appUser.initialView;
    if (['ope', 'echo', 'hhd'].includes(currentView)) return currentView;
    return null;
  };

  // HHD班・エコー班・オペ班管理者が入力したシフトかどうかを判定（AI変更ロック＆条件考慮用）
  const getTeamLockedShiftSource = (staffId, day, shiftsMap = shiftData, inputsMap = userInputs) => {
    const currentCode = shiftsMap[staffId]?.[day];
    if (!currentCode) return null;
    const raw = inputsMap[staffId]?.[day];
    if (raw && typeof raw === 'object' && raw.teamShiftBy && TEAM_ADMIN_LABELS[raw.teamShiftBy]) {
      return raw.teamShiftBy;
    }
    if (isMeRoomShiftCode(currentCode)) return 'ope';
    return null;
  };

  // HHD班・エコー班・オペ班管理者が入力したタスクかどうかを判定
  const getTeamLockedTaskSource = (staffId, day, tasksMap = taskData, inputsMap = userInputs) => {
    const currentCode = tasksMap[staffId]?.[day];
    if (!currentCode) return null;
    const raw = inputsMap[staffId]?.[day];
    if (raw && typeof raw === 'object' && raw.teamTaskBy && TEAM_ADMIN_LABELS[raw.teamTaskBy]) {
      return raw.teamTaskBy;
    }
    return null;
  };

const handleUpdateCell = async (staffId, day, toolCode, type = 'shift', reasonOverride = undefined) => {
    if (appUser.role === 'staff') {
      if (staffId !== appUser.id) return; 
      // 締切チェック
      if (checkIsAfterDeadlineForStaff()) return;
      
      if (currentView === 'ope') {
        if (toolCode && !isMeRoomShiftCode(toolCode)) {
           alert('オペ班ページではLとGのみ入力可能です。');
           return;
        }
      }
    }

    // ★追加: 個人の入力(希望履歴)と班管理者の入力元フラグを裏側で保持・更新する変数
    const currentShiftBefore = shiftData[staffId]?.[day];
    const currentTaskBefore = taskData[staffId]?.[day];
    const entry = normalizeUserInputEntry(userInputs[staffId]?.[day], currentShiftBefore, currentTaskBefore);
    const activeTeamKey = getActiveTeamAdminKey();

    const nextUserInputs = { ...userInputs };
    if (nextUserInputs[staffId]) {
      nextUserInputs[staffId] = { ...nextUserInputs[staffId] };
    } else {
      nextUserInputs[staffId] = {};
    }

    if (type === 'shift') {
      const nextShifts = { ...shiftData };
      if (nextShifts[staffId]) {
          nextShifts[staffId] = { ...nextShifts[staffId] };
      } else {
          nextShifts[staffId] = {};
      }

      if (toolCode) {
        nextShifts[staffId][day] = toolCode;
        // スタッフ本人の入力なら希望シフトコードと希望理由を記憶、管理者の編集なら元の本人希望履歴・理由を保持したままにする
        if (appUser.role === 'staff') {
          entry.shift = toolCode;
          if (reasonOverride !== undefined) {
            const trimmedReason = reasonOverride.trim().slice(0, 50);
            if (trimmedReason) {
              entry.reason = trimmedReason;
            } else {
              delete entry.reason;
            }
          }
        } else if (appUser.role === 'admin') {
          if (activeTeamKey) {
            entry.teamShiftBy = activeTeamKey;
          } else if (isMeRoomShiftCode(toolCode)) {
            entry.teamShiftBy = 'ope';
          } else {
            delete entry.teamShiftBy;
          }
        }
      } else {
        delete nextShifts[staffId][day];
        // スタッフ本人がクリアした場合のみ希望履歴・希望理由も削除（管理者のクリアでは希望履歴・理由を残す）
        if (appUser.role === 'staff') {
          delete entry.shift;
          delete entry.reason;
        } else if (appUser.role === 'admin') {
          delete entry.teamShiftBy;
        }
      }

      if (entry.shift || entry.task || entry.teamShiftBy || entry.teamTaskBy) {
        nextUserInputs[staffId][day] = entry;
      } else {
        delete nextUserInputs[staffId][day];
      }

      setShiftData(nextShifts);
      setUserInputs(nextUserInputs); // ★追加
      saveSchedule(nextShifts, taskData, nextUserInputs); // ★引数追加
    } else {
      const nextTasks = { ...taskData };
      if (nextTasks[staffId]) {
          nextTasks[staffId] = { ...nextTasks[staffId] };
      } else {
          nextTasks[staffId] = {};
      }

      if (toolCode) {
        nextTasks[staffId][day] = toolCode;
        // ★追加: タスク入力時もスタッフ本人なら希望コードを記憶、管理者なら元の履歴を保持
        if (appUser.role === 'staff') {
          entry.task = toolCode;
        } else if (appUser.role === 'admin') {
          if (activeTeamKey) {
            entry.teamTaskBy = activeTeamKey;
          } else {
            delete entry.teamTaskBy;
          }
        }
      } else {
        delete nextTasks[staffId][day];
        if (appUser.role === 'staff') {
          delete entry.task;
        } else if (appUser.role === 'admin') {
          delete entry.teamTaskBy;
        }
      }

      if (entry.shift || entry.task || entry.teamShiftBy || entry.teamTaskBy) {
        nextUserInputs[staffId][day] = entry;
      } else {
        delete nextUserInputs[staffId][day];
      }

      setTaskData(nextTasks);
      setUserInputs(nextUserInputs); // ★追加
      saveSchedule(shiftData, nextTasks, nextUserInputs); // ★引数追加
    }
  };

  const handleCellClick = (e, staffId, day, type) => {
    if (isSunday(year, month, day)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (type === 'shift') {
      setPopupReasonText(getUserRequestedReason(staffId, day));
    } else {
      setPopupReasonText('');
    }
    setActivePopup({
      staffId,
      day,
      type,
      cellRect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  // PC表示時: ポップアップの実測サイズをもとに、選択セルのすぐ横（右端では左横）かつ画面内に必ず収まる座標へ配置
  useLayoutEffect(() => {
    const popupEl = popupRef.current;
    if (!activePopup || !popupEl || !activePopup.cellRect) return;

    const updatePosition = () => {
      if (window.innerWidth < 768) {
        popupEl.style.top = '';
        popupEl.style.left = '';
        return;
      }

      const gap = 6;
      const margin = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = popupEl.offsetWidth;
      const ph = popupEl.offsetHeight;
      const { top: cTop, left: cLeft, right: cRight } = activePopup.cellRect;

      // 横方向: 基本はセルの右横、右側に収まらない場合はセルの左横へ自動反転
      let left = cRight + gap;
      if (left + pw > vw - margin) {
        const leftSide = cLeft - pw - gap;
        if (leftSide >= margin) {
          left = leftSide;
        } else {
          left = Math.max(margin, vw - pw - margin);
        }
      }
      left = Math.max(margin, Math.min(left, vw - pw - margin));

      // 縦方向: 基本はセル上端揃え、画面下端からはみ出す場合は下端に収まる高さまで上へスライド
      let top = cTop;
      if (top + ph > vh - margin) {
        top = vh - ph - margin;
      }
      top = Math.max(margin, top);

      popupEl.style.top = `${Math.round(top)}px`;
      popupEl.style.left = `${Math.round(left)}px`;
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [activePopup, popupReasonText]);

  const handleChangePassword = () => {
    if (!newPassword.trim()) {
      alert('新しいパスワードを入力してください');
      return;
    }

    if (appUser.role === 'admin') {
      const newSettings = { ...adminSettings };
      if (newSettings[targetAdminKey]) {
        newSettings[targetAdminKey] = { ...newSettings[targetAdminKey], password: newPassword };
      }
      setAdminSettings(newSettings);
      saveMasterData({ adminSettings: newSettings });
      alert(`${newSettings[targetAdminKey].label}のパスワードを変更しました。`);
    } else {
      const newList = staffList.map(s => s.id === appUser.id ? { ...s, password: newPassword } : s);
      setStaffList(newList);
      saveMasterData({ staffList: newList });
      alert('パスワードを変更しました。次回ログイン時から有効です。');
    }
    
    setShowPasswordChangeModal(false);
    setNewPassword('');
  };

  // Step 1: 職員ごとのAI配置可能な施設・シフト判定ヘルパー
  const isShiftAllowedForStaff = (staff, shiftCode) => {
    if (!staff || !shiftCode) return true;
    const def = shiftDefs[shiftCode];
    if (!def || def.type !== 'shift') return true;
    if (def.category === 'off' || def.category === 'req') return true;

    const exCats = Array.isArray(staff.excludedCategories) ? staff.excludedCategories : [];
    const exShifts = Array.isArray(staff.excludedShifts) ? staff.excludedShifts : [];
    if (exCats.includes(def.category)) return false;
    if (exShifts.includes(shiftCode)) return false;

    const isCool3 = shiftCode === 'A' || shiftCode === 'F' || (def.label && def.label.includes('3')) || (def.endTime && def.endTime >= '21:00');
    if ((staff.maxCool3 ?? 5) <= 0 && isCool3) return false;

    return true;
  };

  // 職員に設定されているAI配置制限の概要テキスト（ツールチップ・バッジ表示用）
  const getStaffRestrictionSummaryText = (staff) => {
    if (!staff) return '';
    const exCats = Array.isArray(staff.excludedCategories) ? staff.excludedCategories : [];
    const exShifts = Array.isArray(staff.excludedShifts) ? staff.excludedShifts : [];
    const parts = [];
    if (exCats.length > 0) {
      const catNames = exCats.map(cid => categoryDefs[cid]?.label || cid);
      parts.push(`不可施設: ${catNames.join('・')}`);
    }
    if (exShifts.length > 0) {
      const shiftNames = exShifts.map(code => shiftDefs[code]?.label || code);
      parts.push(`不可シフト: ${shiftNames.join('・')}`);
    }
    return parts.join(' / ');
  };

  const handleAddStaff = () => {
    setTargetStaff({
      id: null,
      loginId: '',
      name: '',
      jobTitle: '一般',
      roles: [],
      skills: {},
      maxCool3: 5,
      excludeFromAi: false,
      excludedCategories: [],
      excludedShifts: [],
    });
    setShowStaffShiftDetailRestriction(false);
    setShowStaffModal(true);
  };

  const handleEditStaff = (staff) => {
    const exCats = Array.isArray(staff.excludedCategories) ? staff.excludedCategories : [];
    const exShifts = Array.isArray(staff.excludedShifts) ? staff.excludedShifts : [];
    setTargetStaff({ 
      ...staff, 
      skills: staff.skills || {}, 
      maxCool3: staff.maxCool3 !== undefined ? staff.maxCool3 : 5,
      excludeFromAi: staff.excludeFromAi || false,
      excludedCategories: exCats,
      excludedShifts: exShifts,
    });
    setShowStaffShiftDetailRestriction(exShifts.length > 0);
    setShowStaffModal(true);
  };

  const saveStaff = () => {
    if (!targetStaff.name.trim()) {
      alert('名前を入力してください');
      return;
    }
    if (!targetStaff.loginId.trim()) {
      alert('ログインIDを入力してください');
      return;
    }

    const duplicateStaff = staffList.find(s => s.loginId === targetStaff.loginId && s.id !== targetStaff.id);
    if (duplicateStaff) {
      alert(`そのログインID "${targetStaff.loginId}" は既に "${duplicateStaff.name}" さんに使用されています。\n別のIDを指定してください。`);
      return;
    }

    let newList = [...staffList];
    if (targetStaff.id) {
      newList = newList.map(s => s.id === targetStaff.id ? targetStaff : s);
    } else {
      const newStaff = { ...targetStaff, id: Date.now().toString() };
      newList.push(newStaff);
    }

    setStaffList(newList);
    saveMasterData({ staffList: newList }); // ★修正
    setShowStaffModal(false);
  };

  const saveAllStaffSettings = (updatedStaffList) => {
    setStaffList(updatedStaffList);
    saveMasterData({ staffList: updatedStaffList }); // ★修正
    alert('全職員の設定を保存しました。');
    setShowStaffSettingsModal(false);
  };

  const removeStaff = (id) => {
    setConfirmModal({
      isOpen: true,
      title: '職員削除',
      message: 'この職員を削除しますか？復元できません。',
      onConfirm: () => {
        const newList = staffList.filter(s => s.id !== id);
        setStaffList(newList);
        saveMasterData({ staffList: newList }); // ★修正
      }
    });
  };

  const handleSortStaff = (dragId, dropId) => {
    if (dragId === dropId) return;
    const newStaffList = [...staffList];
    const dragIndex = newStaffList.findIndex(s => s.id === dragId);
    const dropIndex = newStaffList.findIndex(s => s.id === dropId);
    if (dragIndex === -1 || dropIndex === -1) return;
    const [dragItem] = newStaffList.splice(dragIndex, 1);
    newStaffList.splice(dropIndex, 0, dragItem);
    setStaffList(newStaffList);
    saveMasterData({ staffList: newStaffList }); // ★修正
  };

  // --- カテゴリ編集関連 ---
  const handleEditCategory = (catId) => {
    const cat = categoryDefs[catId];
    setTargetCategory({ ...cat, originalId: catId });
  };

  const handleAddCategory = () => {
    setTargetCategory({ id: '', label: '', color: 'bg-gray-50 text-gray-800', order: Object.keys(categoryDefs).length + 1, originalId: null });
  };

  const saveCategory = () => {
    if (!targetCategory.id || !targetCategory.label) {
      alert('IDとラベルは必須です');
      return;
    }
    const newDefs = { ...categoryDefs };
    
    // ID変更時の処理
    if (targetCategory.originalId && targetCategory.originalId !== targetCategory.id) {
       delete newDefs[targetCategory.originalId];
    }

    newDefs[targetCategory.id] = {
      id: targetCategory.id,
      label: targetCategory.label,
      color: targetCategory.color,
      order: targetCategory.order
    };
    
    setCategoryDefs(newDefs);
    saveMasterData({ categoryDefs: newDefs }); // ★修正
    setTargetCategory(null);
  };

  const deleteCategory = (catId) => {
    const isUsed = Object.values(shiftDefs).some(s => s.category === catId);
    if (isUsed) {
      alert('このカテゴリを使用しているシフトがあるため削除できません。\n先にシフト設定を変更してください。');
      return;
    }
    const newDefs = { ...categoryDefs };
    delete newDefs[catId];
    setCategoryDefs(newDefs);
    saveMasterData({ categoryDefs: newDefs }); // ★修正
  };

  // カテゴリドラッグソート
  const handleSortCategory = (dragId, dropId) => {
    if (dragId === dropId) return;
    
    // order順に並んだ配列を作る
    const sortedCats = Object.values(categoryDefs).sort((a, b) => a.order - b.order);
    const dragIndex = sortedCats.findIndex(c => c.id === dragId);
    const dropIndex = sortedCats.findIndex(c => c.id === dropId);
    
    if (dragIndex === -1 || dropIndex === -1) return;

    // 配列上で移動
    const [dragItem] = sortedCats.splice(dragIndex, 1);
    sortedCats.splice(dropIndex, 0, dragItem);

    // orderを再番
    const newDefs = { ...categoryDefs };
    sortedCats.forEach((cat, index) => {
      if (newDefs[cat.id]) {
        newDefs[cat.id] = { ...newDefs[cat.id], order: index + 1 };
      }
    });

    setCategoryDefs(newDefs);
    saveMasterData({ categoryDefs: newDefs }); // ★修正
  };

  const handleAddNewShift = () => {
    setEditingShift({ code: '', label: '', color: 'bg-transparent', text: 'text-gray-800', startTime: '', endTime: '', overtime: '', time: '', category: 'saka', type: 'shift', originalCode: null, isRequestable: false });
    setShowShiftEditModal(true);
  };

  const handleEditShift = (code) => {
    setEditingShift({ ...shiftDefs[code], originalCode: code });
    setShowShiftEditModal(true);
  };

  const saveShiftConfig = () => {
    if (!editingShift || !editingShift.code || !editingShift.label) {
      alert('コードと表示名は必須です');
      return;
    }
    const newDefs = { ...shiftDefs };
    if (editingShift.originalCode && editingShift.originalCode !== editingShift.code) {
      delete newDefs[editingShift.originalCode];
    }
    const { originalCode, ...cleanShift } = editingShift;
    if (newDefs[cleanShift.code]?.order === undefined) {
      const maxOrder = Math.max(0, ...Object.values(newDefs).map(s => s.order || 0));
      cleanShift.order = maxOrder + 1;
    } else {
      cleanShift.order = newDefs[cleanShift.code].order;
    }
    newDefs[cleanShift.code] = cleanShift;
    setShiftDefs(newDefs);
    saveMasterData({ shiftDefs: newDefs }); // ★修正
    alert('保存しました');
    setEditingShift({ ...cleanShift, originalCode: cleanShift.code });
  };

  const deleteShiftConfig = (code) => {
    setConfirmModal({
      isOpen: true,
      title: 'シフト設定削除',
      message: `シフト設定「${shiftDefs[code].label}」を削除しますか？`,
      onConfirm: () => {
        const newDefs = { ...shiftDefs };
        delete newDefs[code];
        setShiftDefs(newDefs);
        saveMasterData({ shiftDefs: newDefs }); // ★修正
        if (editingShift?.originalCode === code) setShowShiftEditModal(false);
      }
    });
  };

  const handleSortShift = (dragCode, dropCode) => {
    if (dragCode === dropCode) return;
    const dragShift = shiftDefs[dragCode];
    const dropShift = shiftDefs[dropCode];
    if (dragShift.category !== dropShift.category) return;
    const group = dynamicPaletteGroups.find(g => g.id === dragShift.category);
    if (!group) return;
    const items = [...group.items];
    const dragIdx = items.indexOf(dragCode);
    const dropIdx = items.indexOf(dropCode);
    if (dragIdx === -1 || dropIdx === -1) return;
    const currentOrders = items.map(code => shiftDefs[code]?.order || 0).sort((a, b) => a - b);
    items.splice(dragIdx, 1);
    items.splice(dropIdx, 0, dragCode);
    const newDefs = { ...shiftDefs };
    items.forEach((code, index) => {
      if (newDefs[code]) {
        newDefs[code] = { ...newDefs[code], order: currentOrders[index] };
      }
    });
    setShiftDefs(newDefs);
    saveMasterData({ shiftDefs: newDefs }); // ★修正
  };

  const saveTargetCounts = () => {
    saveMasterData({ targetCounts: targetCounts, adminSettings: adminSettings });
    alert('必要人数・必須スキル設定を保存しました');
    setShowTargetCountModal(false);
  };

const handleResetSchedule = () => {
    setConfirmModal({
      isOpen: true,
      title: '勤務表の消去',
      message: `${year}年${month}月のシフトとタスクを削除しますか？\n\n※「個人(スタッフ)」が直接入力したシフトは削除されずに残ります。\nこの操作は取り消せません。`,
      onConfirm: () => {
        const newShiftData = {};
        const newTaskData = {};
        const newUserInputs = {};

        // userInputsに記録されているスタッフ本人の希望履歴からシフト・タスクを復元します
        Object.keys(userInputs).forEach(staffId => {
          Object.keys(userInputs[staffId] || {}).forEach(day => {
            const entry = normalizeUserInputEntry(
              userInputs[staffId][day],
              shiftData[staffId]?.[day],
              taskData[staffId]?.[day]
            );
            const restoredEntry = {};

            if (entry.shift && shiftDefs[entry.shift]) {
              if (!newShiftData[staffId]) newShiftData[staffId] = {};
              newShiftData[staffId][day] = entry.shift;
              restoredEntry.shift = entry.shift;
              if (entry.reason) {
                restoredEntry.reason = entry.reason;
              }
            }
            if (entry.task && shiftDefs[entry.task]) {
              if (!newTaskData[staffId]) newTaskData[staffId] = {};
              newTaskData[staffId][day] = entry.task;
              restoredEntry.task = entry.task;
            }
            if (restoredEntry.shift || restoredEntry.task) {
              if (!newUserInputs[staffId]) newUserInputs[staffId] = {};
              newUserInputs[staffId][day] = restoredEntry;
            }
          });
        });

        // 抽出したデータで上書き保存します
        setShiftData(newShiftData);
        setTaskData(newTaskData);
        setUserInputs(newUserInputs);
        saveSchedule(newShiftData, newTaskData, newUserInputs);
        
        alert('個人が入力したシフトを残して、その他のデータをリセットしました。');
      }
    });
  };

  const getTargetCount = (shiftCode, day) => {
    if (isSunday(year, month, day)) return 0;
    const def = shiftDefs[shiftCode];
    const closedRules = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    // 祝日・外来休診日のME室は「Gのみ1人（Lは0人）」として判定
    if (isMeRoomShiftCode(shiftCode) && isHoliday(year, month, day, closedRules)) {
      const normLabel = (def?.label || '').trim();
      return (shiftCode === 'G' || normLabel === 'G' || normLabel === 'Ｇ') ? 1 : 0;
    }
    if (!targetCounts[shiftCode]) return 0;
    const dow = getDayOfWeek(year, month, day);
    return targetCounts[shiftCode][dow] || 0;
  };

  // Step 4: 施設ごとの必須スキル最低人数を取得するヘルパー（初期値: 坂田・君津・木クリはリーダー1名以上）
  const getFacilitySkillTarget = (catId, skillKey, settingsObj = adminSettings) => {
    if (!catId || catId === 'me' || catId === 'off' || catId === 'req' || catId === 'role' || catId === 'basic') {
      return 0;
    }
    const customMap = settingsObj?.facilitySkillTargets;
    if (customMap && customMap[catId] && customMap[catId][skillKey] !== undefined) {
      return Math.max(0, parseInt(customMap[catId][skillKey], 10) || 0);
    }
    return DEFAULT_FACILITY_SKILL_TARGETS[catId]?.[skillKey] ?? 0;
  };

  // Step 4: 指定日における各施設のスキル保持者数と必須スキル不足一覧を計算するヘルパー
  const evaluateFacilitySkillShortagesForDay = (day, shiftsMap = shiftData, settingsObj = adminSettings) => {
    const skillCountsByCat = {};
    const shortagesByCat = {};
    const allShortages = [];

    if (isSunday(year, month, day)) {
      return { skillCountsByCat, shortagesByCat, allShortages };
    }

    const facilityCats = Object.values(categoryDefs)
      .filter(cat => cat.id !== 'me' && cat.id !== 'off' && cat.id !== 'req' && cat.id !== 'role' && cat.id !== 'basic')
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    facilityCats.forEach(cat => {
      skillCountsByCat[cat.id] = {};
      STAFF_SKILLS.forEach(sk => {
        skillCountsByCat[cat.id][sk.key] = 0;
      });
    });

    staffList.forEach(s => {
      const code = shiftsMap[s.id]?.[day];
      if (!code || !shiftDefs[code]) return;
      const def = shiftDefs[code];
      if (def.type !== 'shift' || def.category === 'off' || def.category === 'req') return;
      if (!skillCountsByCat[def.category]) return;

      STAFF_SKILLS.forEach(sk => {
        if (s.skills?.[sk.key]) {
          skillCountsByCat[def.category][sk.key] = (skillCountsByCat[def.category][sk.key] || 0) + 1;
        }
      });
    });

    facilityCats.forEach(cat => {
      const catShortages = [];
      const catShiftCodes = Object.values(shiftDefs)
        .filter(sd => sd.type === 'shift' && sd.category === cat.id)
        .map(sd => sd.code);
      if (catShiftCodes.length === 0) return;

      const catTargetHeadcount = catShiftCodes.reduce((sum, code) => sum + getTargetCount(code, day), 0);
      const catActualHeadcount = catShiftCodes.reduce(
        (sum, code) => sum + staffList.filter(s => shiftsMap[s.id]?.[day] === code).length,
        0
      );
      if (catTargetHeadcount === 0 && catActualHeadcount === 0) return;

      STAFF_SKILLS.forEach(sk => {
        const reqMin = getFacilitySkillTarget(cat.id, sk.key, settingsObj);
        if (reqMin > 0) {
          const actual = skillCountsByCat[cat.id]?.[sk.key] || 0;
          if (actual < reqMin) {
            const item = {
              catId: cat.id,
              catLabel: cat.label,
              skillKey: sk.key,
              skillLabel: sk.label,
              actual,
              target: reqMin,
            };
            catShortages.push(item);
            allShortages.push(item);
          }
        }
      });
      if (catShortages.length > 0) {
        shortagesByCat[cat.id] = catShortages;
      }
    });

    return { skillCountsByCat, shortagesByCat, allShortages };
  };

  // Step 3: 前月末（最終週の月〜土）からの連勤数・公休消化・3クール連続判定をリアルタイム計算（AI＆管理表バッジ共通）
  const prevMonthCarryOver = useMemo(() => {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevDaysInMonth = getDaysInMonth(prevYear, prevMonth);
    const closedRules = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    const maxConsecutiveWorkDays = Number(adminSettings.maxConsecutiveWorkDays) || 5;
    const currDaysInMonth = getDaysInMonth(year, month);

    // 3クール該当シフトコード判定
    const cool3ShiftCodes = Object.values(shiftDefs)
      .filter(s => (s.type === 'shift' || !s.type) && (s.code === 'A' || s.code === 'F' || (s.label && s.label.includes('3')) || (s.endTime && s.endTime >= '21:00')))
      .map(s => s.code);
    const cool3Set = new Set(cool3ShiftCodes);

    // 当月1日が火〜土(dow: 2〜6)のときのみ、前月の最終日曜以降の月〜土が「月またぎの同一週」になる（1日が日・月なら日曜休診を挟むため連勤リセット）
    const dowDay1 = getDayOfWeek(year, month, 1);
    const straddlingPrevDays = [];
    if (dowDay1 >= 2) {
      const startPrevDay = prevDaysInMonth - (dowDay1 - 2);
      for (let pd = startPrevDay; pd <= prevDaysInMonth; pd++) {
        if (pd >= 1) straddlingPrevDays.push(pd);
      }
    }

    const byStaff = {};
    staffList.forEach(s => {
      // 前月の勤務表がこの職員について作成済みか（希望以外の出勤シフトが1日以上入っているか）を判定
      const staffPrevMap = prevMonthShiftData[s.id] || {};
      const staffHasPrevWorkShift = Object.keys(staffPrevMap).some(dKey => {
        const c = staffPrevMap[dKey];
        return c && shiftDefs[c] && shiftDefs[c].category !== 'off' && shiftDefs[c].category !== 'req';
      });

      let trailingWorkStreak = 0;
      let prevWeekRegOffCount = 0;
      let prevWeekPaidOffCount = 0;
      let prevWeekWorkCount = 0;
      const breakdownParts = [];

      if (straddlingPrevDays.length > 0 && staffHasPrevWorkShift) {
        straddlingPrevDays.forEach(pd => {
          const c = staffPrevMap[pd];
          const dowLbl = ['日', '月', '火', '水', '木', '金', '土'][getDayOfWeek(prevYear, prevMonth, pd)];
          const holSuffix = isHoliday(prevYear, prevMonth, pd, closedRules) ? '・祝' : '';
          if (c && shiftDefs[c]) {
            const def = shiftDefs[c];
            if (def.category === 'off' || def.category === 'req') {
              trailingWorkStreak = 0;
              if (def.category === 'off' && c !== 'S' && c !== 'H') {
                prevWeekPaidOffCount++;
              } else {
                prevWeekRegOffCount++;
              }
              breakdownParts.push(`${prevMonth}/${pd}(${dowLbl}${holSuffix}):休[${def.label}]`);
            } else {
              trailingWorkStreak++;
              prevWeekWorkCount++;
              breakdownParts.push(`${prevMonth}/${pd}(${dowLbl}${holSuffix}):${def.label}`);
            }
          } else {
            // 前月作成済みの場合、空欄（祝日休みや空欄公休）も休みとしてカウントし連勤リセット（パートは公休数カウントのみ除外）
            trailingWorkStreak = 0;
            if (s.jobTitle !== 'パート') {
              prevWeekRegOffCount++;
            }
            breakdownParts.push(`${prevMonth}/${pd}(${dowLbl}${holSuffix}):休[空欄]`);
          }
        });
      }

      const lastPrevCode = straddlingPrevDays.length > 0 && staffHasPrevWorkShift
        ? (staffPrevMap[prevDaysInMonth] || null)
        : null;
      const prevLastDayWasCool3 = !!(lastPrevCode && cool3Set.has(lastPrevCode));
      const prevLastDayLabel = lastPrevCode && shiftDefs[lastPrevCode] ? shiftDefs[lastPrevCode].label : lastPrevCode;
      const maxAllowedStreakFromDay1 = Math.max(0, maxConsecutiveWorkDays - trailingWorkStreak);

      // 当月1日からの実入力連勤数と月またぎ違反チェック（案Bバッジのリアルタイム警告用）
      let currentLeadingWorkStreak = 0;
      if (straddlingPrevDays.length > 0) {
        for (let d = 1; d <= currDaysInMonth; d++) {
          if (isSunday(year, month, d)) break;
          const currCode = shiftData[s.id]?.[d];
          if (currCode && shiftDefs[currCode] && shiftDefs[currCode].category !== 'off' && shiftDefs[currCode].category !== 'req') {
            currentLeadingWorkStreak++;
          } else {
            break;
          }
        }
      }
      const crossMonthTotalStreak = trailingWorkStreak > 0 ? trailingWorkStreak + currentLeadingWorkStreak : 0;
      const isCrossMonthStreakViolated = trailingWorkStreak > 0 && currentLeadingWorkStreak > 0 && crossMonthTotalStreak > maxConsecutiveWorkDays;
      const day1Code = shiftData[s.id]?.[1] || null;
      const isCrossMonthCool3Violated = prevLastDayWasCool3 && !!(day1Code && cool3Set.has(day1Code));

      const tooltipLines = [];
      if (straddlingPrevDays.length > 0 && staffHasPrevWorkShift) {
        const rangeLbl = `${prevMonth}/${straddlingPrevDays[0]}〜${prevMonth}/${straddlingPrevDays[straddlingPrevDays.length - 1]}`;
        tooltipLines.push(`【前月末（${rangeLbl}）の引き継ぎ】`);
        tooltipLines.push(breakdownParts.join(' / '));
        if (trailingWorkStreak > 0) {
          tooltipLines.push(
            maxAllowedStreakFromDay1 === 0
              ? `・前月末時点で${trailingWorkStreak}連勤到達のため、${month}/1は休み（空欄）が必要`
              : `・前月末時点: ${trailingWorkStreak}連勤中（${month}/1からは最大あと${maxAllowedStreakFromDay1}連勤まで）`
          );
        }
        if (prevWeekRegOffCount > 0) {
          tooltipLines.push(`・月またぎ週の前月分で公休取得済み（${prevWeekRegOffCount}日）`);
        } else if (s.jobTitle !== 'パート') {
          tooltipLines.push(`・月またぎ週の前月分で公休未取得のため、月初土曜までに1日休み（空欄）が必要`);
        }
        if (prevLastDayWasCool3) {
          tooltipLines.push(`・前月最終日(${prevMonth}/${prevDaysInMonth})が「${prevLastDayLabel}」のため、${month}/1の3クール連続配置は不可`);
        }
        if (isCrossMonthStreakViolated) {
          tooltipLines.push(`⚠️現在、月またぎで通算${crossMonthTotalStreak}連勤になっています（上限${maxConsecutiveWorkDays}連勤）`);
        }
        if (isCrossMonthCool3Violated) {
          tooltipLines.push(`⚠️現在、前月末と${month}/1で3クールが2日連続になっています`);
        }
      }

      byStaff[s.id] = {
        staffHasPrevWorkShift,
        trailingWorkStreak,
        prevWeekRegOffCount,
        prevWeekPaidOffCount,
        prevWeekWorkCount,
        prevLastDayCode: lastPrevCode,
        prevLastDayLabel,
        prevLastDayWasCool3,
        maxAllowedStreakFromDay1,
        currentLeadingWorkStreak,
        crossMonthTotalStreak,
        isCrossMonthStreakViolated,
        isCrossMonthCool3Violated,
        dayBreakdownText: breakdownParts.join(', '),
        tooltipText: tooltipLines.join('\n'),
      };
    });

    return {
      prevYear,
      prevMonth,
      prevDaysInMonth,
      straddlingPrevDays,
      hasStraddlingWeek: straddlingPrevDays.length > 0,
      cool3ShiftCodes,
      byStaff,
    };
  }, [year, month, prevMonthShiftData, staffList, shiftDefs, adminSettings.maxConsecutiveWorkDays, adminSettings.clinicClosedDays, shiftData]);

const prepareScheduleDataForAi = () => {
    const days = getDaysInMonth(year, month);
    const closedRules = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    const maxConsecutiveWorkDays = Number(adminSettings.maxConsecutiveWorkDays) || 5;
    const monthlyOffSetting = adminSettings.monthlyRegularOffDays || 'auto';

    const calendarInfo = {};
    let operatingDaysCount = 0;
    const calendarWeeks = [];
    let currentWeekDays = [];

    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month - 1, d);
      const dayOfWeek = date.getDay(); 
      const isHol = isHoliday(year, month, d, closedRules);
      calendarInfo[d] = {
        date: `${month}/${d}`,
        dayOfWeek: ['日','月','火','水','木','金','土'][dayOfWeek],
        isSunday: dayOfWeek === 0,
        isHoliday: isHol
      };

      if (dayOfWeek === 0) {
        if (currentWeekDays.length > 0) {
          calendarWeeks.push({
            weekIndex: calendarWeeks.length + 1,
            label: `${month}/${currentWeekDays[0]}〜${month}/${currentWeekDays[currentWeekDays.length - 1]}`,
            days: currentWeekDays,
            isFullWeek: currentWeekDays.length === 6,
          });
          currentWeekDays = [];
        }
      } else {
        operatingDaysCount++;
        currentWeekDays.push(d);
      }
    }
    if (currentWeekDays.length > 0) {
      calendarWeeks.push({
        weekIndex: calendarWeeks.length + 1,
        label: `${month}/${currentWeekDays[0]}〜${month}/${currentWeekDays[currentWeekDays.length - 1]}`,
        days: currentWeekDays,
        isFullWeek: currentWeekDays.length === 6,
      });
    }

    // Step 2: 週休2日（日曜＋週1日公休＝空欄）に基づく月間の基本公休数・標準出勤日数の算出
    const parsedFixedOff = monthlyOffSetting !== 'auto' ? parseInt(monthlyOffSetting, 10) : NaN;
    const baseRegularOffMin = !isNaN(parsedFixedOff) ? parsedFixedOff : Math.floor(operatingDaysCount / 6);
    const baseRegularOffMax = !isNaN(parsedFixedOff) ? parsedFixedOff : Math.ceil(operatingDaysCount / 6);
    const standardWorkDaysMin = Math.max(0, operatingDaysCount - baseRegularOffMax);
    const standardWorkDaysMax = Math.max(0, operatingDaysCount - baseRegularOffMin);

    // 3クール該当シフトコードを動的抽出（A:坂3, F:君3 や21時以降終了・表示名に3を含むシフト）
    const cool3ShiftCodes = prevMonthCarryOver.cool3ShiftCodes;
    const cool3Set = new Set(cool3ShiftCodes);

    // 指定(S)・振休(H)・希望カテゴリ(HOPE等)は「週1日の通常公休枠」、年休(Y)・リフレ(R)等は「公休とは別枠の有休」として区別
    const isPaidLeaveShiftCode = (code) => {
      if (!code || !shiftDefs[code]) return false;
      const def = shiftDefs[code];
      return def.category === 'off' && code !== 'S' && code !== 'H';
    };

    // 【追加】各スキルの重み付け（点数）を定義
    const skillPoints = {
      isLeader: 5,
      isVeteran: 3,
      canEcho: 2,
      canMachine: 2,
      canFollow: 1
    };

    const staffPowerMap = {};
    const enrichedStaff = staffList.map(s => {
      let powerScore = 0;
      if (s.skills) {
        Object.keys(skillPoints).forEach(key => {
          if (s.skills[key]) powerScore += skillPoints[key];
        });
      }
      staffPowerMap[s.id] = powerScore;

      const carry = prevMonthCarryOver.byStaff[s.id] || {
        staffHasPrevWorkShift: false,
        trailingWorkStreak: 0,
        prevWeekRegOffCount: 0,
        prevLastDayWasCool3: false,
        prevLastDayLabel: null,
        maxAllowedStreakFromDay1: maxConsecutiveWorkDays,
        dayBreakdownText: '',
      };

      // AIが数え間違いを起こさないよう、現時点の個人別集計値・連勤数（前月末からの通算含む）・残りの目標出勤/空欄休みを事前計算して渡す
      let workDays = 0;
      let offDays = 0;
      let regularOffEnteredDays = 0;
      let paidLeaveDays = 0;
      let blankDays = 0;
      let assignableBlankDays = 0;
      let lockedBlankOffDays = 0;
      let cool3Count = 0;
      let overtimeHours = 0;
      let currentStreak = carry.trailingWorkStreak || 0;
      let currentMaxStreak = currentStreak;

      // 各日の状態マップ（週ごとの公休チェック用）
      const dayStateMap = {};

      for (let d = 1; d <= days; d++) {
        if (calendarInfo[d].isSunday) {
          currentStreak = 0;
          continue;
        }
        const code = shiftData[s.id]?.[d];
        const reqShift = getUserRequestedShift(s.id, d);

        if (!code || !shiftDefs[code]) {
          blankDays++;
          currentStreak = 0;
          // 管理者がHOPE等をクリアして空欄にした（希望履歴が残っている）セルは、既に休み確定の空欄として扱う
          if (reqShift && shiftDefs[reqShift] && (shiftDefs[reqShift].category === 'off' || shiftDefs[reqShift].category === 'req')) {
            lockedBlankOffDays++;
            if (isPaidLeaveShiftCode(reqShift)) {
              paidLeaveDays++;
              dayStateMap[d] = 'paid_off';
            } else {
              regularOffEnteredDays++;
              dayStateMap[d] = 'regular_off';
            }
          } else if (reqShift) {
            dayStateMap[d] = 'locked_req';
          } else {
            assignableBlankDays++;
            dayStateMap[d] = 'assignable_blank';
          }
        } else {
          const def = shiftDefs[code];
          if (def.category === 'off' || def.category === 'req') {
            offDays++;
            currentStreak = 0;
            if (isPaidLeaveShiftCode(code)) {
              paidLeaveDays++;
              dayStateMap[d] = 'paid_off';
            } else {
              regularOffEnteredDays++;
              dayStateMap[d] = 'regular_off';
            }
          } else {
            workDays++;
            currentStreak++;
            if (currentStreak > currentMaxStreak) currentMaxStreak = currentStreak;
            dayStateMap[d] = 'work';
          }
          if (cool3Set.has(code)) cool3Count++;
          if (def.overtime) overtimeHours += parseFloat(def.overtime) || 0;
        }
      }

      // 週単位で「まだ週1日の通常公休(S/H/HOPE等)が入っておらず、AIが空欄を残すべき週」を特定（第1週は前月末からの月またぎ週も考慮）
      const weeksNeedingBlankOff = [];
      calendarWeeks.forEach((w, wIdx) => {
        const weekRegOff = w.days.filter(d => dayStateMap[d] === 'regular_off').length;
        const weekAnyOff = w.days.filter(d => dayStateMap[d] === 'regular_off' || dayStateMap[d] === 'paid_off').length;
        const weekAssignable = w.days.filter(d => dayStateMap[d] === 'assignable_blank');

        if (w.isFullWeek && weekRegOff === 0 && weekAssignable.length > 0) {
          weeksNeedingBlankOff.push({
            week: w.label,
            candidateBlankDays: weekAssignable,
            minBlankToKeep: 1,
          });
        } else if (
          wIdx === 0 &&
          !w.isFullWeek &&
          prevMonthCarryOver.hasStraddlingWeek &&
          carry.staffHasPrevWorkShift &&
          s.jobTitle !== 'パート'
        ) {
          // Step 3: 月またぎ第1週（前月末の月〜＋当月1日〜土の計6日）で前月側にも当月側にもまだ公休がない場合、または前月末連勤＋当月第1週で最大連勤を超える場合は必ず1日空欄を残す
          const totalStraddlingRegOff = carry.prevWeekRegOffCount + weekRegOff;
          const wouldExceedStreak = carry.trailingWorkStreak + w.days.length > maxConsecutiveWorkDays && weekAnyOff === 0;
          if ((totalStraddlingRegOff === 0 || wouldExceedStreak) && weekAssignable.length > 0) {
            weeksNeedingBlankOff.push({
              week: `${w.label}（前月末からの月またぎ週・前月${carry.trailingWorkStreak}連勤引き継ぎ）`,
              candidateBlankDays: weekAssignable,
              minBlankToKeep: 1,
            });
          }
        } else if (!w.isFullWeek && w.days.length > maxConsecutiveWorkDays && weekAnyOff === 0 && weekAssignable.length > 0) {
          weeksNeedingBlankOff.push({
            week: w.label,
            candidateBlankDays: weekAssignable,
            minBlankToKeep: 1,
          });
        }
      });

      // 年休(Y)・リフレ(R)等の有休分は基本目標出勤日数から差し引きつつ、週単位で必須となる空欄公休数と矛盾しないよう整合させる
      const targetWorkDaysMin = Math.max(workDays, standardWorkDaysMin - paidLeaveDays);
      const targetWorkDaysMax = Math.max(workDays, standardWorkDaysMax - paidLeaveDays);
      const rawBlankKeepMin = Math.max(0, assignableBlankDays - Math.min(assignableBlankDays, Math.max(0, targetWorkDaysMax - workDays)));
      const rawBlankKeepMax = Math.max(0, assignableBlankDays - Math.min(assignableBlankDays, Math.max(0, targetWorkDaysMin - workDays)));
      const blankOffDaysToKeepMin = Math.min(assignableBlankDays, Math.max(rawBlankKeepMin, weeksNeedingBlankOff.length));
      const blankOffDaysToKeepMax = Math.min(assignableBlankDays, Math.max(rawBlankKeepMax, blankOffDaysToKeepMin));
      const remainingWorkDaysMin = Math.max(0, assignableBlankDays - blankOffDaysToKeepMax);
      const remainingWorkDaysMax = Math.max(0, assignableBlankDays - blankOffDaysToKeepMin);

      // この職員がAI配置で入ることができる出勤系シフトコード一覧を算出（※ME室はOPE班管理のため常時除外）
      const allowedWorkShifts = Object.values(shiftDefs)
        .filter(def => (def.type === 'shift' || !def.type) && def.category !== 'off' && def.category !== 'req' && !isMeRoomShiftCode(def.code) && isShiftAllowedForStaff(s, def.code))
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .map(def => def.code);

      // 前月最終日に3クールに入っていた場合、当月1日に選べる出勤シフトからは3クールを除外
      const day1AllowedWorkShifts = carry.prevLastDayWasCool3
        ? allowedWorkShifts.filter(c => !cool3Set.has(c))
        : allowedWorkShifts;

      const fmtRange = (minV, maxV) => (minV === maxV ? `${minV}日` : `${minV}〜${maxV}日`);

      return { 
        id: s.id,
        name: s.name, 
        jobTitle: s.jobTitle, 
        roles: s.roles,
        skills: s.skills,
        powerScore,
        maxCool3: s.maxCool3, 
        excludeFromAi: s.excludeFromAi,
        allowedWorkShifts,
        day1AllowedWorkShifts,
        excludedCategories: Array.isArray(s.excludedCategories) ? s.excludedCategories : [],
        excludedShifts: Array.isArray(s.excludedShifts) ? s.excludedShifts : [],
        prevMonthCarryOver: {
          hasPrevSchedule: carry.staffHasPrevWorkShift,
          trailingWorkStreak: carry.trailingWorkStreak,
          maxAllowedConsecutiveWorkFromDay1: carry.maxAllowedStreakFromDay1,
          alreadyTookWeeklyOffInPrevMonthPart: carry.prevWeekRegOffCount > 0,
          prevLastDayWasCool3: carry.prevLastDayWasCool3,
          forbidCool3OnDay1: carry.prevLastDayWasCool3,
          prevStraddlingWeekSummary: carry.dayBreakdownText || '引き継ぎなし（日曜区切りまたは前月未作成）',
        },
        currentStats: {
          workDays,
          offDays,
          regularOffEnteredDays,
          paidLeaveDays,
          blankDays,
          assignableBlankDays,
          lockedBlankOffDays,
          targetWorkDaysRange: fmtRange(targetWorkDaysMin, targetWorkDaysMax),
          remainingWorkDaysRange: fmtRange(remainingWorkDaysMin, remainingWorkDaysMax),
          blankOffDaysToKeepRange: fmtRange(blankOffDaysToKeepMin, blankOffDaysToKeepMax),
          weeksNeedingBlankOff,
          currentMaxStreak,
          cool3Count,
          remainingCool3: Math.max(0, (s.maxCool3 ?? 0) - cool3Count),
          overtimeHours
        }
      };
    });

    // スタッフ本人が希望を出した箇所（プライバシー保護のため理由テキストは除外し、希望コードのみ渡す）
    // およびHHD班・エコー班・オペ班管理者が入力したAI変更不可ロック箇所を抽出
    const staffRequests = {};
    const teamAdminLocks = {};
    staffList.forEach(s => {
      const staffReq = {};
      const staffTeamLock = {};
      for (let d = 1; d <= days; d++) {
        const reqShift = getUserRequestedShift(s.id, d);
        const reqTask = getUserRequestedTask(s.id, d);
        if (reqShift || reqTask) {
          staffReq[d] = {};
          if (reqShift) staffReq[d].shift = reqShift;
          if (reqTask) staffReq[d].task = reqTask;
        }

        const teamShiftSrc = getTeamLockedShiftSource(s.id, d);
        const teamTaskSrc = getTeamLockedTaskSource(s.id, d);
        if (teamShiftSrc || teamTaskSrc) {
          staffTeamLock[d] = {};
          if (teamShiftSrc) {
            staffTeamLock[d].shift = shiftData[s.id]?.[d];
            staffTeamLock[d].shiftLockedBy = TEAM_ADMIN_LABELS[teamShiftSrc] || teamShiftSrc;
          }
          if (teamTaskSrc) {
            staffTeamLock[d].task = taskData[s.id]?.[d];
            staffTeamLock[d].taskLockedBy = TEAM_ADMIN_LABELS[teamTaskSrc] || teamTaskSrc;
          }
        }
      }
      if (Object.keys(staffReq).length > 0) {
        staffRequests[s.id] = staffReq;
      }
      if (Object.keys(staffTeamLock).length > 0) {
        teamAdminLocks[s.id] = staffTeamLock;
      }
    });

    // Step 4: 施設ごとの必須スキル最低人数設定を整形
    const facilitySkillRequirements = {};
    Object.values(categoryDefs)
      .filter(cat => cat.id !== 'me' && cat.id !== 'off' && cat.id !== 'req' && cat.id !== 'role' && cat.id !== 'basic')
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .forEach(cat => {
        const reqSkills = {};
        STAFF_SKILLS.forEach(sk => {
          const minCnt = getFacilitySkillTarget(cat.id, sk.key);
          if (minCnt > 0) {
            reqSkills[sk.key] = { label: sk.label, minCount: minCnt };
          }
        });
        if (Object.keys(reqSkills).length > 0) {
          facilitySkillRequirements[cat.id] = {
            facilityLabel: cat.label,
            requiredSkills: reqSkills,
          };
        }
      });

    // 各日付の施設別スコア・必須スキル充足状況・不足状況を事前計算してAIの判断精度を高める
    const dailySummary = {};
    for (let d = 1; d <= days; d++) {
      if (calendarInfo[d].isSunday) continue;
      let sakaScore = 0;
      let kimiScore = 0;
      let kikuriScore = 0;
      let workingCount = 0;
      let meWorkingCount = 0;
      const codeCounts = {};

      staffList.forEach(s => {
        const code = shiftData[s.id]?.[d];
        if (!code || !shiftDefs[code]) return;
        const def = shiftDefs[code];
        codeCounts[code] = (codeCounts[code] || 0) + 1;
        if (def.category !== 'off' && def.category !== 'req') {
          workingCount++;
          if (isMeRoomShiftCode(code)) meWorkingCount++;
          const pScore = staffPowerMap[s.id] || 0;
          if (def.category === 'saka') sakaScore += pScore;
          else if (def.category === 'kimi') kimiScore += pScore;
          else if (def.category === 'kikuri') kikuriScore += pScore;
        }
      });

      const skillEval = evaluateFacilitySkillShortagesForDay(d, shiftData);

      const shortages = [];
      Object.keys(targetCounts || {}).forEach(code => {
        // ME室(L/G)はOPE班管理者が入力するため、AIが埋めるべき不足リスト(shortages)からは除外
        if (isMeRoomShiftCode(code)) return;
        const target = getTargetCount(code, d);
        const actual = codeCounts[code] || 0;
        if (target > 0 && actual < target) {
          const label = shiftDefs[code]?.label || code;
          shortages.push(`${label}(${code}): ${actual}/${target}名`);
        }
      });
      skillEval.allShortages.forEach(sh => {
        shortages.push(`${sh.catLabel} 必須スキル[${sh.skillLabel}]: ${sh.actual}/${sh.target}名`);
      });
      if (sakaScore < 30) shortages.push(`坂田スコア: ${sakaScore}/30点`);
      if (kimiScore < 30) shortages.push(`君津スコア: ${kimiScore}/30点`);
      if (kikuriScore < 40) shortages.push(`木クリスコア: ${kikuriScore}/40点`);

      dailySummary[d] = {
        workingCount,
        meWorkingCount,
        sakaScore,
        kimiScore,
        kikuriScore,
        facilitySkillCounts: skillEval.skillCountsByCat,
        shortages
      };
    }

    const strictConditionsList = autoFillConditions
      .filter(c => c.active && c.priority !== 'soft')
      .map(c => c.text);
    const softConditionsList = autoFillConditions
      .filter(c => c.active && c.priority === 'soft')
      .map(c => c.text);

    return {
      year, month,
      pacingRules: {
        maxConsecutiveWorkDays,
        forbidConsecutiveCool3: true,
        operatingDaysCount,
        standardMonthlyWorkDays: standardWorkDaysMin === standardWorkDaysMax
          ? `${standardWorkDaysMin}日`
          : `${standardWorkDaysMin}〜${standardWorkDaysMax}日`,
        standardMonthlyRegularOffDays: baseRegularOffMin === baseRegularOffMax
          ? `${baseRegularOffMin}日`
          : `${baseRegularOffMin}〜${baseRegularOffMax}日`,
        offDayRepresentation: '空欄（SやH等のコードは入れず未入力のまま残す）',
        meRoomRule: 'ME室(L, G)、個人(スタッフ本人)が入力したシフト・希望（管理者が対応済みの空欄休みや変更後シフトも含む）、およびHHD班・エコー班・オペ班管理者が入力済みのシフト・タスクはAIでの自動入力・既存変更は禁止（条件・スコア・スキル・連勤計算には必ず含める）'
      },
      customConditions: {
        strict: strictConditionsList,
        soft: softConditionsList,
      },
      facilitySkillRequirements,
      calendar: calendarInfo,
      calendarWeeks,
      cool3ShiftCodes,
      staff: enrichedStaff,
      staffRequests,
      teamAdminLocks,
      dailySummary,
      shifts: shiftData, 
      tasks: taskData,
      targetCounts,
      definitions: Object.keys(shiftDefs).reduce((acc, key) => {
        acc[key] = {
          label: shiftDefs[key].label,
          type: shiftDefs[key].type,
          category: shiftDefs[key].category,
          overtime: shiftDefs[key].overtime || 0
        };
        return acc;
      }, {})
    };
  };

// 共通のAI結果反映ロジック（ワンタップAI自動作成用）
  const applyAiResult = async (jsonString) => {
    // 【追加】デバッグ用にコンソールに生の応答を出す
    console.log("AI Raw Response:", jsonString);

    // 【追加】callGeminiからのエラーメッセージ（⚠️で始まるもの）をそのまま返す
    if (typeof jsonString === 'string' && jsonString.startsWith("⚠️")) {
      return { success: false, message: jsonString };
    }

    let cleanJson = jsonString;
    // Markdown除去
    cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '');
    
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    
    // JSONの開始・終了カッコが見つからない場合
    if (firstBrace === -1 || lastBrace === -1) {
        return { 
            success: false, 
            message: "有効なJSON（データ形式）が見つかりませんでした。\nAIがデータ以外の返答をした可能性があります。\nF12キーでコンソールを確認してください。" 
        };
    }
    
    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);

    try {
      const changes = JSON.parse(cleanJson);
      const nameToIdMap = {};
      staffList.forEach(s => nameToIdMap[s.name] = s.id);
      const maxDay = getDaysInMonth(year, month);
      
      let updatedCount = 0;
      const ns = { ...shiftData };
      const nt = { ...taskData };
      const nextUserInputs = { ...userInputs };

      // AIによる上書き前に旧形式(boolean)の希望履歴があればコード形式へ保全する
      Object.keys(userInputs).forEach(sId => {
        Object.keys(userInputs[sId] || {}).forEach(d => {
          if (userInputs[sId][d] === true) {
            nextUserInputs[sId] = { ...(nextUserInputs[sId] || {}) };
            nextUserInputs[sId][d] = normalizeUserInputEntry(true, shiftData[sId]?.[d], taskData[sId]?.[d]);
          }
        });
      });

      const cool3Set = new Set(prevMonthCarryOver.cool3ShiftCodes || []);

      if (changes.shift) {
        Object.keys(changes.shift).forEach(key => {
          let staffId = key;
          // IDが見つからない場合、名前として検索
          if (!staffList.find(s => s.id === staffId)) staffId = nameToIdMap[key];
          const staffObj = staffList.find(s => s.id === staffId);

          // AI除外スタッフは自動作成で書き換えない
          if (staffId && staffObj && !staffObj.excludeFromAi) { 
             ns[staffId] = { ...(ns[staffId] || {}) };
             const staffCarry = prevMonthCarryOver.byStaff[staffId];
             const sortedDays = Object.keys(changes.shift[key])
               .map(d => parseInt(d, 10))
               .filter(d => !isNaN(d) && d >= 1 && d <= maxDay)
               .sort((a, b) => a - b);

             sortedDays.forEach(dayNum => {
                if (isSunday(year, month, dayNum)) return;
                // 既に管理者・本人が入力済みのセル（ME室のL/G、年休Y、指定S、希望HOPEなど）や希望履歴があるセルは絶対に変更しない
                if (shiftData[staffId]?.[dayNum] || getUserRequestedShift(staffId, dayNum)) return;

                let code = changes.shift[key][dayNum] ?? changes.shift[key][String(dayNum)];
                if (!code || !shiftDefs[code]) return;
                const def = shiftDefs[code];
                // Step 2: AI自動作成ではME室(L/G)の自動入力を禁止し、休みは空欄のまま残すため休みコード(off/req)も書き込まない
                if (isMeRoomShiftCode(code) || def.category === 'off' || def.category === 'req') return;

                // Step 3: 3クール連続禁止ガード（前月最終日→1日の月またぎ、および月内の連続営業日）
                if (cool3Set.has(code)) {
                  const prevDayIsCool3 =
                    (dayNum === 1 && staffCarry?.prevLastDayWasCool3) ||
                    (dayNum > 1 && !isSunday(year, month, dayNum - 1) && cool3Set.has(ns[staffId][dayNum - 1]));
                  const nextDayIsCool3 =
                    dayNum < maxDay && !isSunday(year, month, dayNum + 1) && cool3Set.has(ns[staffId][dayNum + 1]);

                  if (prevDayIsCool3 || nextDayIsCool3) {
                    // 同一施設内で許可されている非3クール出勤シフト（例: 坂3→坂2、君3→君2）へ安全にフォールバック
                    const sameFacilityAlt = Object.values(shiftDefs)
                      .filter(
                        alt =>
                          alt.type === 'shift' &&
                          alt.category === def.category &&
                          !cool3Set.has(alt.code) &&
                          !isMeRoomShiftCode(alt.code) &&
                          isShiftAllowedForStaff(staffObj, alt.code)
                      )
                      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))[0];
                    const anyAllowedAlt = Object.values(shiftDefs)
                      .filter(
                        alt =>
                          alt.type === 'shift' &&
                          alt.category !== 'off' &&
                          alt.category !== 'req' &&
                          !cool3Set.has(alt.code) &&
                          !isMeRoomShiftCode(alt.code) &&
                          isShiftAllowedForStaff(staffObj, alt.code)
                      )
                      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))[0];
                    const fallbackDef = sameFacilityAlt || anyAllowedAlt;
                    if (!fallbackDef) return;
                    code = fallbackDef.code;
                  }
                }

                if (isShiftAllowedForStaff(staffObj, code)) {
                   ns[staffId][dayNum] = code;
                   updatedCount++;
                }
             });
          }
        });
      }
      
      if (changes.task) {
        Object.keys(changes.task).forEach(key => {
          let staffId = key;
          if (!staffList.find(s => s.id === staffId)) staffId = nameToIdMap[key];
          const staffObj = staffList.find(s => s.id === staffId);

          if (staffId && staffObj && !staffObj.excludeFromAi) {
             nt[staffId] = { ...(nt[staffId] || {}) };
             Object.keys(changes.task[key]).forEach(day => {
                const dayNum = parseInt(day, 10);
                if (isNaN(dayNum) || dayNum < 1 || dayNum > maxDay || isSunday(year, month, dayNum)) return;
                if (taskData[staffId]?.[dayNum] || getUserRequestedTask(staffId, dayNum) || getTeamLockedTaskSource(staffId, dayNum)) return;

                const code = changes.task[key][day];
                if (shiftDefs[code]) {
                   nt[staffId][dayNum] = code;
                   updatedCount++;
                }
             });
          }
        });
      }

      if (updatedCount > 0) {
        setShiftData(ns);
        setTaskData(nt);
        setUserInputs(nextUserInputs);
        saveSchedule(ns, nt, nextUserInputs);
        return { success: true, count: updatedCount, nextShifts: ns };
      } else {
        return { success: false, message: "変更が必要な箇所が見つかりませんでした。" };
      }

    } catch (e) {
      return { success: false, message: `JSONの解析に失敗しました: ${e.message}` };
    }
  };

// 条件操作ハンドラ（Step 5: [絶対] strict / [なるべく] soft の2段階優先度対応）
  const persistAutoFillConditions = (nextList) => {
    setAutoFillConditions(nextList);
    saveMasterData({ autoFillConditions: nextList });
  };

  const addAutoFillCondition = () => {
    if (!newConditionText.trim()) return;
    const newId = Date.now();
    const nextList = [
      ...autoFillConditions,
      {
        id: newId,
        text: newConditionText.trim(),
        active: true,
        priority: newConditionPriority === 'soft' ? 'soft' : 'strict',
      },
    ];
    persistAutoFillConditions(nextList);
    setNewConditionText('');
    setNewConditionPriority('strict'); // 新規追加時の初期値である「絶対」へ戻す
  };

  const deleteAutoFillCondition = (id) => {
    const nextList = autoFillConditions.filter(c => c.id !== id);
    persistAutoFillConditions(nextList);
  };

  const toggleAutoFillCondition = (id) => {
    const nextList = autoFillConditions.map(c => (c.id === id ? { ...c, active: !c.active } : c));
    persistAutoFillConditions(nextList);
  };

  const toggleAutoFillConditionPriority = (id) => {
    const nextList = autoFillConditions.map(c =>
      c.id === id ? { ...c, priority: c.priority === 'soft' ? 'strict' : 'soft' } : c
    );
    persistAutoFillConditions(nextList);
  };

  // ★追加：条件を再編集する機能（優先度も入力欄に復元）
  const editAutoFillCondition = (id, text, priority = 'strict') => {
    setNewConditionText(text); // 入力欄に文字を戻す
    setNewConditionPriority(priority === 'soft' ? 'soft' : 'strict');
    const nextList = autoFillConditions.filter(c => c.id !== id); // リストからは一旦消す
    persistAutoFillConditions(nextList);
  };

  // ワンタップ自動作成
  const handleOpenAutoFill = () => {
    setShowAutoFillModal(true);
  };

  const executeAutoFill = async () => {
    setShowAutoFillModal(false);
    setIsAiLoading(true);
    setAiProgress(0); 

    const progressInterval = setInterval(() => {
      setAiProgress(prev => (prev >= 95 ? 95 : prev + Math.floor(Math.random() * 8) + 1));
    }, 800);

    try {
      const data = prepareScheduleDataForAi();
      const cool3LabelStr = (data.cool3ShiftCodes || ['A', 'F']).join(', ');
      const maxStreak = data.pacingRules?.maxConsecutiveWorkDays || 5;
      const skillReqLines = Object.values(data.facilitySkillRequirements || {}).map(fReq => {
        const parts = Object.values(fReq.requiredSkills || {}).map(sr => `${sr.label}${sr.minCount}名以上`);
        return `${fReq.facilityLabel}: ${parts.join('・')}`;
      });
      const skillReqSummaryText = skillReqLines.length > 0 ? skillReqLines.join(' ／ ') : '設定なし';
      const systemInstruction = "あなたは臨床工学技士のシフト作成の専門家です。提供されたデータと条件をもとに、可能な範囲でシフトを組んでください。休みの日は空欄のまま残す仕様のため、全ての空欄を出勤で埋め尽くしてはいけません。出力は必ず指定されたJSON形式のみとし、JSONの枠外には絶対に文章を書かないでください。";
      
      const strictConditions = autoFillConditions
        .filter(c => c.active && c.priority !== 'soft')
        .map((c, index) => `${index + 1}. [絶対] ${c.text}`)
        .join("\n");
      const softConditions = autoFillConditions
        .filter(c => c.active && c.priority === 'soft')
        .map((c, index) => `${index + 1}. [なるべく] ${c.text}`)
        .join("\n");

      // AIに1日ずつ考えさせ、具体的なパワーバランス（目標スコア）・施設別必須スキル・最大連勤・前月末引き継ぎ・週休2日（空欄残し）・3クール連続禁止・班管理ロックを行わせるプロンプト
      const prompt = `
      【タスク】
      現在の勤務表データを分析し、各職員の前月末からの引き継ぎ・週休2日（日曜＋週1日休み＝空欄）・最大連勤制限・3クール連続禁止・施設ごとの必須スキル配置を守りながら、必要な出勤シフトのみを割り当ててください。

      【基本ルール】
      1. 既存データ・各班管理者入力・個人希望の維持と活用（★絶対厳守★）:
         - 既にシフト・タスクが入っている箇所（全体管理者やHHD班・エコー班・オペ班管理者が入力したシフト・タスク、ME室のL/G、年休Y、リフレR、指定休S、振休Hなど全て）や、"teamAdminLocks"・"staffRequests" にある箇所は絶対に変更しないでください。
         - ただし、既存シフトのメンバー（HHD班・エコー班・オペ班管理者が入力した分やME室のL/G等も含む）の人数・powerScore・保持スキル（リーダー等）・出勤日数・連勤数は、すべての条件計算に必ず含めて考慮してください（dailySummary と currentStats に事前集計済みです）。
      2. AI除外・配置可能シフト制限・ME室除外（★絶対厳守★）:
         - "excludeFromAi": true の職員は変更しない。日曜日は透析休診のためシフトを入れない。
         - 祝日および外来診療休診日（calendar[d].isHoliday: true）でも、日曜日以外は通常通り透析を実施するため出勤シフトを組んでください。
         - 「ME室 (category: me / コード: L, G)」はOPE班のシフト管理者が別途組むシフトです。AIから L や G を自動入力することは絶対禁止とし、既に L や G が入っているセルも絶対に変更しないでください。
         - 各職員に出勤シフトを割り当てる際は、必ずその職員データの "allowedWorkShifts" 配列（1日については "day1AllowedWorkShifts" 配列）に含まれているシフトコードのみから選んでください。
      3. 前月末引き継ぎ・週休2日・最大連勤制限・休みの「空欄」表現（★最重要★）:
         - 週休2日制（日曜休み＋月〜土のうち週1日休み）のため、連続出勤は最大「${maxStreak}日（${maxStreak}連勤）」までとします。月またぎ（前月末＋当月初）の通算でも${maxStreak + 1}連勤以上は絶対に作らないでください（祝日がある週も休み数は増えず週1日休みペースです）。
         - 各職員の "prevMonthCarryOver" には前月末最終週からの引き継ぎ情報が入っています:
           ・trailingWorkStreak: 前月末時点での連続出勤日数
           ・maxAllowedConsecutiveWorkFromDay1: 当月1日から連続で出勤できる上限日数（0日の場合は必ず1日を空欄休みにすること）
           ・alreadyTookWeeklyOffInPrevMonthPart: 月またぎ第1週の前月側で既に公休を取得済みかどうか
         - AIが休ませる日（指定休・祝日の振替休にあたる日）には、S や H などの休みコードを入れず、必ず「空欄のまま（"shift" に出力しない）」にしてください。
         - 全ての空欄を出勤シフトで埋めてはいけません！各職員の currentStats にある:
           ・targetWorkDaysRange（今月の目標出勤日数 ※年休Y・リフレR等の有休分は既に差し引き済み）
           ・remainingWorkDaysRange（今回AIが追加で割り当てるべき出勤日数の目安）
           ・blankOffDaysToKeepRange（週休として必ず空欄のまま残すべき日数）
           ・weeksNeedingBlankOff（まだ週1日の公休が入っていないため、candidateBlankDays の中から最低1日は必ず空欄のまま残すべき週 ※月またぎ第1週も含む）
           を厳守してください。
      4. 3クール制限・連続3クール禁止（月またぎ含む・★絶対厳守★）:
         - 職員の「maxCool3」は、3クールシフト（コード: ${cool3LabelStr}）の月間上限回数（currentStats.remainingCool3 が残り可能回数）です。これを超えないこと。
         - 同じ職員に3クールシフト（${cool3LabelStr}）を2日連続で割り当てることは絶対禁止です（日曜休診を挟む場合を除く）。
         - 特に月またぎの条件として、"prevMonthCarryOver.forbidCool3OnDay1": true（前月最終日に3クール勤務だった職員）には、当月1日に3クールシフトを絶対に入れないでください（1日に出勤させる場合は必ず "day1AllowedWorkShifts" から選ぶこと）。
      5. 施設ごとの必須スキル最低人数（Step 4）と不足時の次善策:
         - 各施設の1日あたりの必須スキル最低人数（facilitySkillRequirements）: 【${skillReqSummaryText}】
         - まず各施設に該当スキル保持者（例: skills.isLeader === true のリーダー）が最低人数以上入るように優先して割り振ってください。
         - 【どうしても全員揃えられない日の次善策（重要）】:
           ・希望休・年休・既存シフト・ME室・配置不可施設制限・最大${maxStreak}連勤上限を破ってまで無理やり出勤させることは絶対にしないでください。
           ・出勤可能なスキル保持者が足りない日は、1つの施設に2名以上偏らせず「まず各施設に1名ずつ分散配置」して不足施設数を最小限に抑えてください。
           ・どうしても必須スキル保持者が0名になってしまう施設には、代わりに「ベテラン（skills.isVeteran: true）」または powerScore の高いスタッフを優先配置してカバーし、エラーにせず最後までシフトを組み切ってください。
      6. パワーバランスの確保: 各施設の1日あたりの合計powerScoreが、以下の基準を下回らないよう可能な限り調整してください。
         - 坂田 (category: saka): 合計 30点 以上 (目安人数: 6名)
         - 君津 (category: kimi): 合計 30点 以上 (目安人数: 6名)
         - 木クリ (category: kikuri): 合計 40点 以上 (目安人数: 8名)
         ※「じんクリ (jinkuri)」については必要人数の充足（および必須スキル設定がある場合のみその充足）を行い、パワーバランス(スコア計算)は不要です。「ME室 (me)」はOPE班管理のためAI配置対象外です。
      7. 必要人数と負担の分散: 各曜日・各シフトごとの目標人数は「targetCounts」および「dailySummary.shortages」を参照して満たしつつ、出勤日数・3クール回数・残業時間が特定の人に偏らないよう分散させてください。

      【カスタム条件①：[絶対] ルール（★最優先で必ず守る条件★）】
      以下の [絶対] 条件は、パワーバランス（目標スコア）やシフト配分よりも優先して「絶対」に守ってください（ただし、既存シフト・個人入力・各班管理者ロックの変更禁止だけは破らないこと）。
      ${strictConditions ? strictConditions : '特になし'}

      【カスタム条件②：[なるべく] ルール（努力目標・ソフト条件）】
      以下の [なるべく] 条件は、上記の「[絶対] ルール」「必要人数（targetCounts）」「施設別必須スキル（リーダー等）」「最大${maxStreak}連勤上限・週休ペース」「3クール連続禁止」をすべて満たした上で、可能な範囲で配慮してください。もし競合して守れない日がある場合は基本ルールを優先して崩さず、"reason" に見送った旨を一言記載してください。
      ${softConditions ? softConditions : '特になし'}

      【出力形式】
      必ず以下のJSONフォーマットのみを出力してください。Markdownタグを含めないでください。
      エラーを防ぎつつ品質を上げるため、必ず「1日ずつ」データ内の「targetCounts」「施設ごとの必須スキル（リーダー等）」「powerScore（既存シフト分も含む）」「連勤上限（${maxStreak}連勤まで）・週休の空欄確保」をチェックし、その評価を "dailyCheck" に記載してから、出勤させるセルのみ "shift" に出力してください（休みの日は空欄のままにするため "shift" に含めないこと）。
      {
        "dailyCheck": {
          "1": "1日のチェック: 既存シフトも含めて計算。坂田・君津・木クリともリーダー1名以上配置、必要人数・目標スコア達成。週休対象者は空欄を維持し連勤上限もクリア。",
          "2": "2日のチェック: ...",
          "3": "..."
        },
        "shift": {
          "職員ID": { "日付(1-31の数値)": "出勤シフトコード" }
        },
        "reason": "全体を通した申し送り事項や、リーダー不足日・スコア・週休確保の兼ね合いで調整した点があれば記載"
      }
      
      【データ】
      ${JSON.stringify(data)}
      `;

      const result = await callGemini(prompt, systemInstruction, aiModel, { responseMimeType: 'application/json' });
      
      clearInterval(progressInterval);
      setAiProgress(100); 

      const res = await applyAiResult(result);
      if (res.success) {
        const appliedShifts = res.nextShifts || shiftData;
        const totalDays = getDaysInMonth(year, month);
        const unresolvedSkillLines = [];
        for (let d = 1; d <= totalDays; d++) {
          if (isSunday(year, month, d)) continue;
          const evalDay = evaluateFacilitySkillShortagesForDay(d, appliedShifts);
          if (evalDay.allShortages.length > 0) {
            const dowLbl = ['日', '月', '火', '水', '木', '金', '土'][getDayOfWeek(year, month, d)];
            const detail = evalDay.allShortages
              .map(sh => `${sh.catLabel}(${sh.skillLabel} ${sh.actual}/${sh.target}名)`)
              .join('・');
            unresolvedSkillLines.push(`・${month}/${d}(${dowLbl}): ${detail}`);
          }
        }
        setTimeout(() => {
          setIsAiLoading(false);
          if (unresolvedSkillLines.length > 0) {
            const previewList = unresolvedSkillLines.slice(0, 8).join('\n');
            const moreLine = unresolvedSkillLines.length > 8 ? `\n…ほか ${unresolvedSkillLines.length - 8} 日` : '';
            alert(
              `シフトの自動作成が完了しました（${res.count}箇所を入力）。\n\n` +
              `※希望休・既存シフト・連勤制限を優先したため、以下の日程・施設で必須スキル（リーダー等）が不足しています。勤務表下部の集計欄（オレンジ色表示）をご確認ください：\n\n` +
              `${previewList}${moreLine}`
            );
          }
        }, 500);
      } else {
        setIsAiLoading(false);
        alert(`AI結果の適用に失敗しました。\n理由: ${res.message || res.error || '不明なエラー'}`);
      }
    } catch (error) {
      clearInterval(progressInterval);
      setIsAiLoading(false);
      console.error("AI自動入力エラー:", error);
      alert("通信エラーまたはタイムアウトが発生しました。");
    }
  };

  // AIチャットの応答文字列から、人間向けの返答文・変更案・返信候補チップを安全に抽出
  const parseAiChatResponse = (rawString) => {
    if (typeof rawString !== 'string') {
      return { reply: '応答を取得できませんでした。', shift: {}, task: {}, quickReplies: [] };
    }
    if (rawString.startsWith('⚠️')) {
      return { reply: rawString, shift: {}, task: {}, quickReplies: [] };
    }

    const stripped = rawString.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(stripped.substring(firstBrace, lastBrace + 1));
        const shiftObj = parsed.shift && typeof parsed.shift === 'object' ? parsed.shift : {};
        const taskObj = parsed.task && typeof parsed.task === 'object' ? parsed.task : {};
        const replyText =
          typeof parsed.reply === 'string' && parsed.reply.trim()
            ? parsed.reply.trim()
            : typeof parsed.reason === 'string' && parsed.reason.trim()
              ? parsed.reason.trim()
              : '条件をもとに確認・調整案を作成しました。内容をご確認ください。';
        const quickReplies = Array.isArray(parsed.quickReplies)
          ? parsed.quickReplies.filter(q => typeof q === 'string' && q.trim()).slice(0, 4)
          : [];
        return { reply: replyText, shift: shiftObj, task: taskObj, quickReplies };
      } catch (e) {
        console.warn('AI Chat JSON parse fallback:', e);
      }
    }

    return { reply: stripped || rawString, shift: {}, task: {}, quickReplies: [] };
  };

  // AIが出力した shift / task 変更差分をプレビューカード用の配列へ変換
  const buildProposedChangesList = (shiftChanges = {}, taskChanges = {}) => {
    const nameToIdMap = {};
    const staffOrderMap = {};
    staffList.forEach((s, idx) => {
      nameToIdMap[s.name] = s.id;
      staffOrderMap[s.id] = idx;
    });
    const maxDay = getDaysInMonth(year, month);
    const items = [];

    const processKind = (changesMap, kind) => {
      if (!changesMap || typeof changesMap !== 'object') return;
      Object.keys(changesMap).forEach(rawKey => {
        let staffId = rawKey;
        if (!staffList.find(s => s.id === staffId)) {
          staffId = nameToIdMap[rawKey];
        }
        const staff = staffList.find(s => s.id === staffId);
        if (!staff) return;

        const dayMap = changesMap[rawKey];
        if (!dayMap || typeof dayMap !== 'object') return;

        Object.keys(dayMap).forEach(dayKey => {
          const dayNum = parseInt(dayKey, 10);
          if (isNaN(dayNum) || dayNum < 1 || dayNum > maxDay) return;
          if (isSunday(year, month, dayNum)) return;

          const rawCode = dayMap[dayKey];
          const isClear = rawCode === null || rawCode === '' || rawCode === 'CLEAR' || rawCode === 'NONE';
          const normalizedAfter = isClear ? null : String(rawCode);
          if (normalizedAfter && !shiftDefs[normalizedAfter]) return;

          const currentCode = (kind === 'shift' ? shiftData[staffId]?.[dayNum] : taskData[staffId]?.[dayNum]) || null;
          if (currentCode === normalizedAfter) return;

          // 個人(スタッフ本人)が入力したシフト・希望（管理者が空欄公休や別シフトに対応済みのものも含む）、
          // HHD班・エコー班・オペ班管理者が入力したシフト・タスク、およびME室(L/G)の新規自動配置はAIからも一切変更不可とする
          if (kind === 'shift') {
            if (getUserRequestedShift(staffId, dayNum)) return;
            if (getTeamLockedShiftSource(staffId, dayNum)) return;
            if (normalizedAfter && isMeRoomShiftCode(normalizedAfter)) return;
          } else {
            if (getUserRequestedTask(staffId, dayNum)) return;
            if (getTeamLockedTaskSource(staffId, dayNum)) return;
          }

          const reqCode = kind === 'shift'
            ? getUserRequestedShift(staffId, dayNum)
            : getUserRequestedTask(staffId, dayNum);

          const isMeTouch = kind === 'shift' && (
            (currentCode && isMeRoomShiftCode(currentCode)) ||
            (normalizedAfter && isMeRoomShiftCode(normalizedAfter))
          );

          const cool3Set = new Set(prevMonthCarryOver.cool3ShiftCodes || []);
          const getProjectedShiftAt = (d) => {
            if (Object.prototype.hasOwnProperty.call(dayMap, d) || Object.prototype.hasOwnProperty.call(dayMap, String(d))) {
              const rawAdj = dayMap[d] ?? dayMap[String(d)];
              return rawAdj === null || rawAdj === '' || rawAdj === 'CLEAR' || rawAdj === 'NONE' ? null : String(rawAdj);
            }
            return shiftData[staffId]?.[d] || null;
          };
          const isConsecutiveCool3 = kind === 'shift' && !!(
            normalizedAfter &&
            cool3Set.has(normalizedAfter) &&
            (
              (dayNum === 1 && prevMonthCarryOver.byStaff[staffId]?.prevLastDayWasCool3) ||
              (dayNum > 1 && !isSunday(year, month, dayNum - 1) && cool3Set.has(getProjectedShiftAt(dayNum - 1))) ||
              (dayNum < maxDay && !isSunday(year, month, dayNum + 1) && cool3Set.has(getProjectedShiftAt(dayNum + 1)))
            )
          );

          items.push({
            staffId,
            staffName: staff.name,
            staffOrder: staffOrderMap[staffId] ?? 999,
            day: dayNum,
            dowLabel: ['日', '月', '火', '水', '木', '金', '土'][getDayOfWeek(year, month, dayNum)],
            kind,
            beforeCode: currentCode,
            beforeLabel: currentCode ? (shiftDefs[currentCode]?.label || currentCode) : '空欄',
            afterCode: normalizedAfter,
            afterLabel: normalizedAfter ? (shiftDefs[normalizedAfter]?.label || normalizedAfter) : '空欄',
            afterTextClass: normalizedAfter ? (shiftDefs[normalizedAfter]?.text || 'text-gray-800') : 'text-gray-400',
            hasStaffRequest: !!(reqCode && reqCode !== normalizedAfter),
            staffRequestLabel: reqCode ? (shiftDefs[reqCode]?.label || reqCode) : null,
            isRestrictedShift: !!(
              isMeTouch ||
              isConsecutiveCool3 ||
              (kind === 'shift' && normalizedAfter && !isShiftAllowedForStaff(staff, normalizedAfter))
            ),
            isMeTouch: !!isMeTouch,
            isConsecutiveCool3,
          });
        });
      });
    };

    processKind(shiftChanges, 'shift');
    processKind(taskChanges, 'task');

    items.sort((a, b) => (a.day !== b.day ? a.day - b.day : a.staffOrder - b.staffOrder));
    return items;
  };

  // 案A: 変更案カードの「勤務表に反映する」ボタン押下時にシフトへ書き込む
  const handleApplyAiProposal = (msgId) => {
    const targetMsg = aiMessages.find(m => m.id === msgId);
    if (!targetMsg || !Array.isArray(targetMsg.proposedChanges) || targetMsg.proposedChanges.length === 0) return;

    const ns = { ...shiftData };
    const nt = { ...taskData };
    const nextUserInputs = { ...userInputs };

    // 旧形式(boolean)の希望履歴があれば事前にコード形式へ保全
    Object.keys(userInputs).forEach(sId => {
      Object.keys(userInputs[sId] || {}).forEach(d => {
        if (userInputs[sId][d] === true) {
          nextUserInputs[sId] = { ...(nextUserInputs[sId] || {}) };
          nextUserInputs[sId][d] = normalizeUserInputEntry(true, shiftData[sId]?.[d], taskData[sId]?.[d]);
        }
      });
    });

    // 元に戻す(Undo)用に、反映直前の該当セル値を記録
    const snapshot = targetMsg.proposedChanges.map(item => ({
      staffId: item.staffId,
      day: item.day,
      kind: item.kind,
      prevCode: (item.kind === 'shift' ? shiftData[item.staffId]?.[item.day] : taskData[item.staffId]?.[item.day]) || null,
    }));

    targetMsg.proposedChanges.forEach(item => {
      if (item.kind === 'shift') {
        if (getUserRequestedShift(item.staffId, item.day)) return;
        if (getTeamLockedShiftSource(item.staffId, item.day)) return;
        ns[item.staffId] = { ...(ns[item.staffId] || {}) };
        if (item.afterCode) {
          ns[item.staffId][item.day] = item.afterCode;
        } else {
          delete ns[item.staffId][item.day];
        }
      } else {
        if (getUserRequestedTask(item.staffId, item.day)) return;
        if (getTeamLockedTaskSource(item.staffId, item.day)) return;
        nt[item.staffId] = { ...(nt[item.staffId] || {}) };
        if (item.afterCode) {
          nt[item.staffId][item.day] = item.afterCode;
        } else {
          delete nt[item.staffId][item.day];
        }
      }
    });

    setShiftData(ns);
    setTaskData(nt);
    setUserInputs(nextUserInputs);
    saveSchedule(ns, nt, nextUserInputs);

    setAiMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, status: 'applied', appliedSnapshot: snapshot } : m))
    );
  };

  // 反映済みの変更案を元に戻す(Undo)
  const handleUndoAiProposal = (msgId) => {
    const targetMsg = aiMessages.find(m => m.id === msgId);
    if (!targetMsg || !Array.isArray(targetMsg.appliedSnapshot)) return;

    const ns = { ...shiftData };
    const nt = { ...taskData };

    targetMsg.appliedSnapshot.forEach(snap => {
      if (snap.kind === 'shift') {
        ns[snap.staffId] = { ...(ns[snap.staffId] || {}) };
        if (snap.prevCode) {
          ns[snap.staffId][snap.day] = snap.prevCode;
        } else {
          delete ns[snap.staffId][snap.day];
        }
      } else {
        nt[snap.staffId] = { ...(nt[snap.staffId] || {}) };
        if (snap.prevCode) {
          nt[snap.staffId][snap.day] = snap.prevCode;
        } else {
          delete nt[snap.staffId][snap.day];
        }
      }
    });

    setShiftData(ns);
    setTaskData(nt);
    saveSchedule(ns, nt, userInputs);

    setAiMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, status: 'reverted' } : m))
    );
  };

  // チャットでの指示を自動作成の条件リストにもワンクリック保存（初期値: 絶対 = strict）
  const handleSaveMessageAsRule = (msgId, text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const alreadyExists = autoFillConditions.some(c => c.text === trimmed);
    if (!alreadyExists) {
      const nextList = [
        ...autoFillConditions,
        { id: Date.now(), text: trimmed, active: true, priority: 'strict' },
      ];
      persistAutoFillConditions(nextList);
    }
    setAiMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, savedAsRule: true } : m))
    );
  };

  const handleAiSend = async (overrideText = null) => {
    const messageText = typeof overrideText === 'string' ? overrideText.trim() : aiInput.trim();
    if (!messageText || isAiLoading) return;

    const userMsgId = `msg_${Date.now()}_u`;
    const userMsg = { id: userMsgId, role: 'user', text: messageText };
    const previousHistory = [...aiMessages];

    setAiMessages(prev => [...prev, userMsg]);
    setIsAiLoading(true);
    if (typeof overrideText !== 'string') {
      setAiInput('');
    }

    try {
      const data = prepareScheduleDataForAi();
      const cool3LabelStr = (data.cool3ShiftCodes || ['A', 'F']).join(', ');
      const maxStreak = data.pacingRules?.maxConsecutiveWorkDays || 5;
      const skillReqLines = Object.values(data.facilitySkillRequirements || {}).map(fReq => {
        const parts = Object.values(fReq.requiredSkills || {}).map(sr => `${sr.label}${sr.minCount}名以上`);
        return `${fReq.facilityLabel}: ${parts.join('・')}`;
      });
      const skillReqSummaryText = skillReqLines.length > 0 ? skillReqLines.join(' ／ ') : '設定なし';

      const strictConditions = autoFillConditions
        .filter(c => c.active && c.priority !== 'soft')
        .map((c, index) => `${index + 1}. [絶対] ${c.text}`)
        .join("\n");
      const softConditions = autoFillConditions
        .filter(c => c.active && c.priority === 'soft')
        .map((c, index) => `${index + 1}. [なるべく] ${c.text}`)
        .join("\n");

      const systemInstruction = `あなたは透析クリニック・臨床工学技士部門の経験豊富で頼れる副技士長（シフト作成アシスタント）です。
管理者と人間らしく丁寧で温かみのあるキャッチボールを行いながら、勤務表の相談・分析・調整案の作成をサポートしてください。

【会話と出力の鉄則】
1. 出力は必ず指定されたJSONオブジェクト形式のみとしてください（Markdownコードブロックは不要）。
2. "reply" には管理者に語りかける自然な日本語メッセージを書いてください。内部のシフトコード（A, P, HOPEなど）や職員IDは使わず、必ず表示名（坂3、坂2、希望 など）と職員名（職員Aさん など）で分かりやすく伝えてください。
3. 質問への回答、現状の診断、または複数候補の比較相談の段階では、"shift" と "task" は空オブジェクト {} のままにし、まず会話で相談に乗ってください。
4. 管理者が「変更案を作って」「仮組みして」「その案で進めて」「〇〇さんを△△に変えて」などシフト変更を求めた場合や、具体的な変更プレビューを提示した方が話が早い場合は、"reply" で理由や配慮点を説明した上で、"shift"（および必要なら "task"）に変更する箇所の差分だけを入れてください（管理者が画面上の「勤務表に反映する」ボタンを押すまで実際の表は書き換わらない安心設計になっています）。
5. "staffRequests" にある箇所（個人＝スタッフ本人が入力したシフト・希望、およびそれに対して管理者が空欄休みや別シフトに対応済みの箇所）と、"teamAdminLocks" にある箇所（HHD班・エコー班・オペ班管理者が入力したシフト・タスク）は管理者が直接対応する確定領域のため、AIからは絶対に変更・上書きできません。そのまま維持し、条件計算（人数・スコア・必須スキル・連勤・公休数）にのみ反映してください。
6. 無理な条件やトレードオフがある場合は黙って無視せず、「〇〇日にリーダーやスコアが少し足りませんが、希望休と連勤上限を優先してベテランの〜さんを配置する案はいかがでしょうか？」と現場目線で代替案を添えてください。`;

      const currentContextPrompt = `
【現在の対象年月】${year}年${month}月

【基本ルール】
- 日曜日は透析休診（空欄のまま）。祝日および外来診療休診日（calendar[d].isHoliday: true）でも日曜以外は通常通り透析を実施するため出勤日として扱います。
- "excludeFromAi": true の職員は原則変更不可（管理者が名指しで指示した場合のみ例外）。
- 個人（スタッフ本人）入力箇所・各班管理者（HHD班・エコー班・オペ班管理者）入力箇所・ME室（L, G）の扱い（★絶対厳守★）:
  ・"staffRequests"（スタッフ本人が入力した希望・シフト、および管理者が空欄公休に対応済みの lockedBlankOffDays を含む）、"teamAdminLocks"、およびME室（category: me / コード: L, G）は、AIから新規に L・G を入れたり、変更・移動・削除することは絶対禁止です（※祝日のME室必要人数は G:1名 / L:0名 として集計されます）。
  ・ただし、それらのセルに入っているシフトや確定公休も、該当施設の人数・powerScore・必須スキル（リーダー等）・その職員の出勤日数・週休消化・連勤数・3クール回数には必ず含めて考慮してください。
- 配置可能施設・シフト制限（重要）: 各職員に出勤シフトを割り当てる際は、必ずその職員の "allowedWorkShifts"（1日については "day1AllowedWorkShifts"）に含まれるシフトコードのみを使用してください（許可されていない施設・シフトには絶対に入れないこと。管理者が名指しで特例指示した場合のみ一言確認を添えて提案可）。
- 前月末引き継ぎ・週休2日・最大連勤制限・休みの「空欄」表現（重要）:
  ・週休2日制（日曜休み＋月〜土のうち週1日休み）のため、連続出勤は月またぎ（前月末＋当月初）の通算も含めて最大「${maxStreak}日（${maxStreak}連勤）」までとし、${maxStreak + 1}連勤以上は作らないでください（祝日がある週も休み数は増えず週1日休みペースです）。
  ・各職員の "prevMonthCarryOver" に前月末最終週からの連勤数（trailingWorkStreak）、1日からの最大許容連勤数（maxAllowedConsecutiveWorkFromDay1）、前月側での公休取得有無（alreadyTookWeeklyOffInPrevMonthPart）が入っていますので必ず考慮してください。
  ・AIが休ませる日（指定休・祝日の振替休枠）には、S や H 等のコードは入れず「空欄」のまま残します（既にシフトが入っている箇所を休みに戻す場合のみ null を指定）。
  ・仮組み・空欄埋めを行う際は全ての空欄を出勤で埋め尽くさず、各職員の currentStats にある targetWorkDaysRange（年休Y・リフレR等の有休分は差し引き済み）、remainingWorkDaysRange、blankOffDaysToKeepRange、weeksNeedingBlankOff（週1日の公休として空欄を残すべき週 ※月またぎ第1週も含む）を守ってください。
- 3クール制限・連続3クール禁止（月またぎ含む・重要）:
  ・各職員の maxCool3 は3クールシフト（コード: ${cool3LabelStr}）の月間上限回数です（currentStats.remainingCool3 を参照）。
  ・同じ職員に3クールシフト（${cool3LabelStr}）を2日連続で割り当てないでください（日曜休診を挟む場合を除く）。特に "prevMonthCarryOver.forbidCool3OnDay1": true（前月最終日に3クール勤務だった職員）には、当月1日に3クールシフトを入れず "day1AllowedWorkShifts" から選んでください。
- 施設ごとの必須スキル配置（Step 4）と不足時の次善策:
  ・各施設の必須スキル最低人数（facilitySkillRequirements）: 【${skillReqSummaryText}】（dailySummary[d].facilitySkillCounts と shortages に現状が計算済みです）。
  ・希望休・年休・班管理者ロック・連勤上限を破ってまで無理やりリーダー等を出勤させてはいけません。出勤可能なリーダー等が足りない日は、1施設に2名固めず1名ずつ別施設へ分散配置し、どうしても0名になる施設にはベテラン（isVeteran）や高スコアスタッフを優先配置した上で、"reply" でもその旨を分かりやすく共有してください。
- 施設別目標パワースコア: 坂田(saka) 30点以上、君津(kimi) 30点以上、木クリ(kikuri) 40点以上（dailySummary に各日の現在スコアと不足一覧 shortages が計算済みです）。じんクリ(jinkuri)は人数充足のみ。
- 必要人数: targetCounts を満たすように調整し、出勤日数・連勤・残業が特定の職員に偏らないよう配慮してください。

【有効なカスタム条件①：[絶対]（★最優先で必ず守る条件★）】
${strictConditions ? strictConditions : '特になし'}

【有効なカスタム条件②：[なるべく]（基本ルール・必要人数・必須スキルを崩さない範囲で配慮する努力目標）】
${softConditions ? softConditions : '特になし'}

【出力JSONスキーマ】
{
  "reply": "管理者に向けた丁寧で分かりやすい返答メッセージ（改行可）",
  "shift": {
    "職員ID": { "日付(1-31の数値文字列)": "シフトコード（空欄に戻す場合のみ null）" }
  },
  "task": {
    "職員ID": { "日付(1-31の数値文字列)": "タスクコード（空欄に戻す場合のみ null）" }
  },
  "quickReplies": ["管理者が次に押しやすい短い返信候補1(20文字以内)", "返信候補2"]
}

【最新の勤務表データ（集計値・希望箇所つき）】
${JSON.stringify(data)}

【管理者からの今回のメッセージ】
${messageText}`;

      // マルチターン履歴の組み立て（直近10件のやりとりを引き継ぐ）
      const recentTurns = previousHistory.slice(-10).map(m => {
        let historyText = m.text || '';
        if (m.role === 'model' && Array.isArray(m.proposedChanges) && m.proposedChanges.length > 0) {
          const summary = m.proposedChanges
            .slice(0, 15)
            .map(c => `${month}/${c.day} ${c.staffName}: ${c.beforeLabel}→${c.afterLabel}`)
            .join(', ');
          const statusLabel = m.status === 'applied' ? '反映済' : m.status === 'reverted' ? '取消済' : '未反映(プレビュー中)';
          historyText += `\n[提示した変更案(${m.proposedChanges.length}件・${statusLabel}): ${summary}${m.proposedChanges.length > 15 ? ' ほか' : ''}]`;
        }
        return {
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: historyText }],
        };
      });

      const contents = [
        ...recentTurns,
        { role: 'user', parts: [{ text: currentContextPrompt }] },
      ];

      // バックエンド未再デプロイ時でも会話履歴が通じるよう、フォールバック用の統合promptも生成
      const transcriptText = recentTurns
        .map(t => `${t.role === 'user' ? '管理者' : 'AIアシスタント'}: ${t.parts[0].text}`)
        .join('\n\n');
      const fallbackPrompt = transcriptText
        ? `【これまでの会話履歴】\n${transcriptText}\n\n${currentContextPrompt}`
        : currentContextPrompt;

      const result = await callGemini(fallbackPrompt, systemInstruction, aiModel, {
        contents,
        responseMimeType: 'application/json',
      });

      const parsed = parseAiChatResponse(result);
      const proposedChanges = buildProposedChangesList(parsed.shift, parsed.task);

      const aiMsg = {
        id: `msg_${Date.now()}_m`,
        role: 'model',
        text: parsed.reply,
        proposedChanges,
        status: proposedChanges.length > 0 ? 'pending' : null,
        quickReplies: parsed.quickReplies,
      };

      setAiMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      setAiMessages(prev => [
        ...prev,
        { id: `msg_${Date.now()}_err`, role: 'model', text: `エラーが発生しました: ${e.message}` },
      ]);
    }
    setIsAiLoading(false);
  };

  // --- Memoized Values ---
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const calendarDays = useMemo(() => generateCalendarDays(year, month), [year, month]);

  const dynamicPaletteGroups = useMemo(() => {
    const groups = {};
    Object.keys(categoryDefs).forEach(catId => groups[catId] = []);
    Object.values(shiftDefs).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)).forEach(shift => {
      if (groups[shift.category]) groups[shift.category].push(shift.code);
      else { if (!groups['basic']) groups['basic'] = []; groups['basic'].push(shift.code); }
    });
    return Object.values(categoryDefs).sort((a, b) => a.order - b.order).map(cat => ({ id: cat.id, name: cat.label, items: groups[cat.id] || [] })).filter(g => g.items.length > 0);
  }, [shiftDefs, categoryDefs]);

  const dynamicSummaryGroups = useMemo(() => {
    return Object.values(categoryDefs).filter(cat => cat.id !== 'off' && cat.id !== 'req' && cat.id !== 'role').sort((a, b) => a.order - b.order).map(def => {
        const catKey = def.id;
        const categoryItems = Object.values(shiftDefs).filter(s => s.category === catKey && s.type === 'shift').sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)).map(s => s.code);
        return { id: catKey, name: def.label, items: categoryItems, totalLabel: `${def.label} 計`, headerColor: def.color };
      });
  }, [shiftDefs, categoryDefs]);

  const staffOvertimeStats = useMemo(() => {
    const stats = {};
    staffList.forEach(staff => {
      let total = 0;
      daysArray.forEach(day => {
        const code = shiftData[staff.id]?.[day];
        if (code && shiftDefs[code]?.overtime) total += parseFloat(shiftDefs[code].overtime) || 0;
      });
      stats[staff.id] = total;
    });
    return stats;
  }, [staffList, shiftData, shiftDefs, daysArray]);

  const dailyStats = useMemo(() => {
    const stats = {};
    daysArray.forEach(day => {
      stats[day] = { total: 0 };
      Object.keys(shiftDefs).forEach(code => stats[day][code] = 0);
      staffList.forEach(staff => {
        const sCode = shiftData[staff.id]?.[day];
        if (sCode && shiftDefs[sCode]) {
          stats[day][sCode] = (stats[day][sCode] || 0) + 1;
          if (shiftDefs[sCode].category !== 'off' && shiftDefs[sCode].category !== 'req') stats[day].total++;
        }
        const tCode = taskData[staff.id]?.[day];
        if (tCode && shiftDefs[tCode]) stats[day][tCode] = (stats[day][tCode] || 0) + 1;
      });
    });
    return stats;
  }, [shiftData, taskData, staffList, daysArray, shiftDefs]);

  // Step 4: 各日・各施設のスキル保持者数と必須スキル不足（オレンジ警告表示用）をメモ化
  const dailyFacilitySkillSummary = useMemo(() => {
    const summary = {};
    const facilityCats = Object.values(categoryDefs)
      .filter(cat => cat.id !== 'me' && cat.id !== 'off' && cat.id !== 'req' && cat.id !== 'role' && cat.id !== 'basic')
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const customSkillMap = adminSettings?.facilitySkillTargets;

    const readSkillMin = (catId, skillKey) => {
      if (customSkillMap && customSkillMap[catId] && customSkillMap[catId][skillKey] !== undefined) {
        return Math.max(0, parseInt(customSkillMap[catId][skillKey], 10) || 0);
      }
      return DEFAULT_FACILITY_SKILL_TARGETS[catId]?.[skillKey] ?? 0;
    };

    daysArray.forEach(day => {
      const skillCountsByCat = {};
      const shortagesByCat = {};
      const allShortages = [];

      if (isSunday(year, month, day)) {
        summary[day] = { skillCountsByCat, shortagesByCat, allShortages };
        return;
      }

      const dow = getDayOfWeek(year, month, day);
      facilityCats.forEach(cat => {
        skillCountsByCat[cat.id] = {};
        STAFF_SKILLS.forEach(sk => {
          skillCountsByCat[cat.id][sk.key] = 0;
        });
      });

      const actualHeadcountByCat = {};
      staffList.forEach(s => {
        const code = shiftData[s.id]?.[day];
        if (!code || !shiftDefs[code]) return;
        const def = shiftDefs[code];
        if (def.type !== 'shift' || def.category === 'off' || def.category === 'req') return;
        if (skillCountsByCat[def.category] === undefined) return;

        actualHeadcountByCat[def.category] = (actualHeadcountByCat[def.category] || 0) + 1;
        STAFF_SKILLS.forEach(sk => {
          if (s.skills?.[sk.key]) {
            skillCountsByCat[def.category][sk.key] = (skillCountsByCat[def.category][sk.key] || 0) + 1;
          }
        });
      });

      facilityCats.forEach(cat => {
        const catShiftCodes = Object.values(shiftDefs)
          .filter(sd => sd.type === 'shift' && sd.category === cat.id)
          .map(sd => sd.code);
        if (catShiftCodes.length === 0) return;

        const catTargetHeadcount = catShiftCodes.reduce((sum, code) => sum + (targetCounts[code]?.[dow] || 0), 0);
        const catActualHeadcount = actualHeadcountByCat[cat.id] || 0;
        if (catTargetHeadcount === 0 && catActualHeadcount === 0) return;

        const catShortages = [];
        STAFF_SKILLS.forEach(sk => {
          const reqMin = readSkillMin(cat.id, sk.key);
          if (reqMin > 0) {
            const actual = skillCountsByCat[cat.id]?.[sk.key] || 0;
            if (actual < reqMin) {
              const item = {
                catId: cat.id,
                catLabel: cat.label,
                skillKey: sk.key,
                skillLabel: sk.label,
                actual,
                target: reqMin,
              };
              catShortages.push(item);
              allShortages.push(item);
            }
          }
        });
        if (catShortages.length > 0) {
          shortagesByCat[cat.id] = catShortages;
        }
      });

      summary[day] = { skillCountsByCat, shortagesByCat, allShortages };
    });

    return summary;
  }, [daysArray, shiftData, staffList, shiftDefs, categoryDefs, targetCounts, adminSettings, year, month]);

  const countedOffShifts = useMemo(() => {
    return Array.isArray(adminSettings.countedOffShifts) ? adminSettings.countedOffShifts : ['HOPE'];
  }, [adminSettings.countedOffShifts]);

  const clinicClosedDays = useMemo(() => {
    return Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
  }, [adminSettings.clinicClosedDays]);

  // 各日付の休み希望人数をカウント（パートは対象外、管理者が空欄や休みシフトへ変更しても元の希望履歴があれば維持）
  const dailyOffRequestCounts = useMemo(() => {
    const counts = {};
    const countedSet = new Set(countedOffShifts);
    daysArray.forEach(day => {
      let count = 0;
      staffList.forEach(staff => {
        if (staff.jobTitle === 'パート') return;

        const currentCode = shiftData[staff.id]?.[day] || null;
        const rawUserEntry = userInputs[staff.id]?.[day];
        const reqCode = !rawUserEntry ? null
          : rawUserEntry === true ? currentCode
          : typeof rawUserEntry === 'string' ? rawUserEntry
          : rawUserEntry.shift || null;

        const isCurrentCounted = !!(currentCode && countedSet.has(currentCode));
        const isCurrentBlankOrOff = !currentCode || shiftDefs[currentCode]?.category === 'off' || shiftDefs[currentCode]?.category === 'req';
        const isOriginalRequestMaintained = !!(reqCode && countedSet.has(reqCode) && isCurrentBlankOrOff);

        if (isCurrentCounted || isOriginalRequestMaintained) {
          count++;
        }
      });
      counts[day] = count;
    });
    return counts;
  }, [daysArray, staffList, shiftData, userInputs, shiftDefs, countedOffShifts]);

  // 基本設定タブ用: シフトのみ(type === 'shift')をカテゴリごとに整理し、「希望」「休み」カテゴリを先頭に並べる
  const basicSettingsShiftGroups = useMemo(() => {
    const priorityOrder = { req: 0, off: 1 };
    return dynamicPaletteGroups
      .map(g => ({
        ...g,
        color: categoryDefs[g.id]?.color || 'bg-gray-50 text-gray-800',
        items: g.items.filter(code => shiftDefs[code]?.type === 'shift')
      }))
      .filter(g => g.items.length > 0)
      .sort((a, b) => {
        const pa = priorityOrder[a.id] ?? 99;
        const pb = priorityOrder[b.id] ?? 99;
        if (pa !== pb) return pa - pb;
        return (categoryDefs[a.id]?.order ?? 99) - (categoryDefs[b.id]?.order ?? 99);
      });
  }, [dynamicPaletteGroups, categoryDefs, shiftDefs]);

  const displayStaffList = useMemo(() => {
    if (!appUser) return [];
    let list = staffList;
    if (currentView !== 'all') {
      const team = TEAMS.find(t => t.id === currentView);
      if (team && team.role) list = list.filter(s => s.roles && s.roles.includes(team.role));
    }
    if (appUser.role === 'staff' && viewMode === 'personal') list = list.filter(s => s.id === appUser.id);
    return list;
  }, [staffList, currentView, appUser, viewMode]);

  // --- Render ---
  if (!appUser) return (
    <LoginScreen 
      onLogin={(user) => { 
        setAppUser(user); 
        if (user.initialView) {
          setCurrentView(user.initialView); 
        } else {
          setCurrentView('all'); // 職員の場合は必ず'all'にリセット
        }
        if (user.role === 'staff') {
          setViewMode('personal'); 
        }
      }} 
      staffList={staffList} adminSettings={adminSettings}
      isDataLoaded={isDataLoaded} // ★追加
    />
  );
  
  const getPopupOptions = (type) => {
    if ((currentView === 'ope' || appUser.initialView === 'ope') && type === 'shift') {
      const meShifts = Object.values(shiftDefs)
        .filter(s => s && (s.type === 'shift' || !s.type) && isMeRoomShiftCode(s.code, shiftDefs, categoryDefs))
        .sort((a, b) => {
          const getRank = (item) => {
            const lbl = (item.label || '').trim();
            if (item.code === 'L' || lbl === 'L' || lbl === 'Ｌ') return 0;
            if (item.code === 'G' || lbl === 'G' || lbl === 'Ｇ') return 1;
            return 2;
          };
          const rankDiff = getRank(a) - getRank(b);
          return rankDiff !== 0 ? rankDiff : (a.order ?? 9999) - (b.order ?? 9999);
        });
      const hasL = meShifts.some(s => s.code === 'L' || (s.label || '').trim() === 'L' || (s.label || '').trim() === 'Ｌ');
      const hasG = meShifts.some(s => s.code === 'G' || (s.label || '').trim() === 'G' || (s.label || '').trim() === 'Ｇ');
      const opts = [...meShifts];
      if (!hasL) opts.unshift(shiftDefs['L'] || DEFAULT_SHIFT_TYPES['L']);
      if (!hasG) opts.push(shiftDefs['G'] || DEFAULT_SHIFT_TYPES['G']);
      return opts;
    }
    const orderedCodes = dynamicPaletteGroups.flatMap(g => g.items);
    let opts = orderedCodes.map(code => shiftDefs[code]).filter(s => s && s.type === type);
    if (appUser.role === 'staff' && currentView === 'all' && currentView !== 'ope') {
      // 希望カテゴリ(req) または isRequestable が true のものを表示させる
      opts = opts.filter(s => s.category === 'req' || s.isRequestable);
      
      // ★追加: 「希望(req)」カテゴリが必ず一番上(配列の先頭)になるように並び替え
      opts.sort((a, b) => {
        if (a.category === 'req' && b.category !== 'req') return -1;
        if (a.category !== 'req' && b.category === 'req') return 1;
        return 0; // それ以外は元の順序を維持
      });
    }
    return opts;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-sm font-sans" onClick={() => setActivePopup(null)}>
      <header className="bg-white border-b border-gray-200 p-2 sm:px-4 sm:py-3 shadow-sm flex items-center justify-between sticky top-0 z-[60] gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="flex items-center bg-gray-50 rounded-lg p-1 border shrink-0">
            <button onClick={() => { let nm = month - 1, ny = year; if(nm < 1){ nm = 12; ny--; } setMonth(nm); setYear(ny); }} className="p-1 hover:bg-gray-200 rounded"><ChevronLeft size={18} className="sm:w-5 sm:h-5" /></button>
            <div className="px-2 sm:px-4 font-bold text-sm sm:text-lg text-gray-700 min-w-[70px] sm:min-w-[100px] text-center whitespace-nowrap">{year}/{month}</div>
            <button onClick={() => { let nm = month + 1, ny = year; if(nm > 12){ nm = 1; ny++; } setMonth(nm); setYear(ny); }} className="p-1 hover:bg-gray-200 rounded"><ChevronRight size={18} className="sm:w-5 sm:h-5" /></button>
          </div>
          <span className={`px-2 py-1.5 rounded text-xs font-bold shrink-0 truncate max-w-[80px] sm:max-w-none ${appUser.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{appUser.role === 'admin' ? '管理者' : `${appUser.name}`}</span>
          
          {appUser.role === 'admin' && (
            <div className="flex items-center bg-gray-100 rounded p-1 border shrink-0">
              {TEAMS.filter(team => appUser.initialView === 'all' || team.id === appUser.initialView).map(team => (
                <button key={team.id} onClick={() => { setCurrentView(team.id); if(appUser.role==='staff') setViewMode('all'); }} className={`px-2 sm:px-3 py-1 text-xs rounded transition ${currentView === team.id ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-200'}`}>{team.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 justify-end ml-auto">
           {appUser.role === 'admin' && (
             <>
               <button onClick={handleOpenAutoFill} className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-yellow-50 to-orange-50 hover:from-yellow-100 hover:to-orange-100 text-orange-700 rounded transition font-bold border border-orange-200 shadow-sm shrink-0" title="AI自動作成" disabled={isAiLoading}>
                 {isAiLoading ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16} className="sm:w-4 sm:h-4"/>} <span className="hidden md:inline text-sm">AI作成</span>
               </button>
               <button onClick={() => { setShowAiModal(true); }} className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-purple-100 to-indigo-100 hover:from-purple-200 hover:to-indigo-200 text-indigo-700 rounded transition font-bold border border-indigo-200 shadow-sm shrink-0" title="AIチャット">
                 <Bot size={16} className="sm:w-4 sm:h-4"/> <span className="hidden md:inline text-sm">AIチャット</span>
               </button>
               <button onClick={handleResetSchedule} className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded transition font-bold border border-red-200 shadow-sm shrink-0" title="シフト全消去">
                 <Trash2 size={16} className="sm:w-4 sm:h-4"/> <span className="hidden md:inline text-sm">全消去</span>
               </button>
               <button onClick={() => { setEditingShift(null); handleAddNewShift(); setShowSettingsModal(true); }} className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300 shadow-sm shrink-0" title="設定">
                 <Settings size={16} className="sm:w-4 sm:h-4"/> <span className="hidden md:inline text-sm">設定</span>
               </button>
               <div className="hidden sm:block h-6 w-px bg-gray-300 mx-1"></div>
               <button onClick={() => { setAppUser(null); setCurrentView('all'); setViewMode('personal'); }} className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded shrink-0" title="ログアウト"><LogOut size={16} className="sm:w-4 sm:h-4"/> <span className="hidden sm:inline text-sm">ログアウト</span></button>
             </>
           )}
           {appUser.role === 'staff' && (
             <div className="flex bg-gray-100 rounded-lg p-1 border shrink-0 items-center gap-0 sm:gap-1">
               <button onClick={() => { setViewMode('personal'); setCurrentView('all'); }} className={`px-2 sm:px-3 py-1.5 text-xs rounded-md transition ${viewMode==='personal' ? 'bg-white shadow text-blue-600 font-bold':'text-gray-500 hover:bg-gray-200'}`}>個人</button>
               <button onClick={() => setViewMode('all')} className={`px-2 sm:px-3 py-1.5 text-xs rounded-md transition ${viewMode==='all' ? 'bg-white shadow text-blue-600 font-bold':'text-gray-500 hover:bg-gray-200'}`}>全体</button>
               
               <div className="w-px h-5 bg-gray-300 mx-1"></div>

               <button 
                 onClick={(e) => { e.stopPropagation(); setShowPasswordChangeModal(true); }} 
                 className="flex items-center justify-center p-1.5 sm:px-3 sm:py-1.5 hover:bg-gray-200 text-gray-600 rounded-md transition shrink-0"
                 title="パスワード変更"
               >
                 <Key size={16} /> <span className="hidden sm:inline ml-1 text-sm font-bold">パスワード</span>
               </button>
               <button onClick={() => { setAppUser(null); setCurrentView('all'); setViewMode('personal'); }} className="flex items-center justify-center p-1.5 sm:px-3 sm:py-1.5 hover:bg-red-100 hover:text-red-600 text-gray-600 rounded-md transition shrink-0" title="ログアウト">
                 <LogOut size={16} /> <span className="hidden sm:inline ml-1 text-sm font-bold">ログアウト</span>
               </button>
             </div>
           )}
        </div>
      </header>

      {/* ★修正：管理者への通知バー（確認ボタン付き） */}
      {appUser.role === 'admin' && changeLogs.length > 0 && (
        <div className="bg-orange-100 border-b border-orange-200 px-4 py-2 text-orange-800 text-xs font-bold flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14}/>
            <span>締切後の変更が {changeLogs.length} 件あります。シフト枠（黄色）を確認してください。</span>
          </div>
          <button 
            onClick={handleConfirmLogs}
            className="bg-orange-600 text-white px-3 py-1 rounded hover:bg-orange-700 transition shadow-sm"
          >
            確認（通知を消す）
          </button>
        </div>
      )}

      {/* 以下、メインコンテンツと各モーダル */}
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <main className="flex-1 overflow-auto bg-gray-100 relative">
          <div className="inline-block min-w-full align-middle p-4">
            {viewMode === 'personal' && appUser.role === 'staff' ? (
              <div className="bg-white rounded-lg shadow max-w-lg mx-auto overflow-hidden border">
                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2"><User size={18}/> {appUser.name}さんの勤務表</h3>
                  <div className="text-xs text-gray-500">残業合計: <span className="font-bold text-red-600 text-sm">{staffOvertimeStats[appUser.id] || 0}h</span></div>
                </div>
                <div className="px-4 py-1.5 bg-white border-b flex flex-wrap items-center justify-between gap-1 text-[10px] sm:text-xs text-gray-500">
                  <span>※日付横の「休○」は現在の休み希望人数（パート除く）</span>
                  {parseInt(adminSettings.offRequestAlertCount, 10) > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-300 font-bold text-[10px] leading-none">
                        休{parseInt(adminSettings.offRequestAlertCount, 10)}
                      </span>
                      <span>以上は希望集中</span>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-7 border-b bg-gray-100 text-xs font-bold text-gray-600 text-center py-2">
                  <div className="text-red-500">日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div className="text-blue-500">土</div>
                </div>
                <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 gap-px border-b border-gray-200">
                  {calendarDays.map((cell, idx) => {
                    const day = cell.currentMonth ? cell.day : null;
                    const shiftCode = day ? shiftData[appUser.id]?.[day] : null;
                    const taskCode = day ? taskData[appUser.id]?.[day] : null;
                    const shift = shiftDefs[shiftCode];
                    const task = shiftDefs[taskCode];
                    const reqShiftCode = day ? getUserRequestedShift(appUser.id, day) : null;
                    const reqShift = reqShiftCode ? shiftDefs[reqShiftCode] : null;
                    const reqReason = day ? getUserRequestedReason(appUser.id, day) : '';
                    const cellYear = cell.date.getFullYear();
                    const cellMonth = cell.date.getMonth() + 1;
                    const cellDay = cell.date.getDate();
                    const isSun = cell.date.getDay() === 0;
                    const isSat = cell.date.getDay() === 6;
                    const isHol = isHoliday(cellYear, cellMonth, cellDay, clinicClosedDays);
                    const closedRule = getClinicClosedRuleMatch(cellYear, cellMonth, cellDay, clinicClosedDays);
                    const isEditable = cell.currentMonth && !isSun; 
                    const offCount = day && !isSun ? (dailyOffRequestCounts[day] || 0) : 0;
                    const alertThreshold = parseInt(adminSettings.offRequestAlertCount, 10);
                    const hasAlertThreshold = !isNaN(alertThreshold) && alertThreshold > 0;
                    const isOffAlert = hasAlertThreshold && offCount >= alertThreshold;
                    let bg = 'bg-white';
                    if(!cell.currentMonth) bg = 'bg-gray-50';
                    else if(isSun || isHol) bg = 'bg-red-50';
                    else if(isSat) bg = 'bg-blue-50';

                    return (
                      <div key={idx} className={`${bg} min-h-[5rem] p-1 flex flex-col relative`}>
                        <div className="flex items-center justify-between mb-1 gap-0.5 min-h-[14px]">
                          <div
                            title={closedRule ? (closedRule.label || '外来休診日') : undefined}
                            className={`text-[10px] font-bold leading-none ${isSun || isHol ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'} ${!cell.currentMonth && 'opacity-30'}`}
                          >
                            {cellDay}
                          </div>
                          {cell.currentMonth && !isSun && offCount > 0 && (
                            <span
                              className={`text-[9px] sm:text-[10px] leading-none px-1 py-0.5 rounded-full font-bold whitespace-nowrap border ${
                                isOffAlert
                                  ? 'bg-red-100 text-red-600 border-red-300'
                                  : hasAlertThreshold
                                    ? 'bg-gray-100 text-gray-600 border-gray-200'
                                    : 'bg-pink-100 text-pink-600 border-pink-200'
                              }`}
                              title={`現在の休み希望人数: ${offCount}人`}
                            >
                              休{offCount}
                            </span>
                          )}
                        </div>
                        {cell.currentMonth && (
                          <div className="flex-1 flex flex-col gap-1">
                            <div 
                              onClick={(e) => { if(isEditable) { e.stopPropagation(); handleCellClick(e, appUser.id, day, 'shift'); }}}
                              title={reqReason ? `希望理由: ${reqReason}` : ''}
                              className={`flex-1 relative rounded border flex flex-col items-center justify-center cursor-pointer transition px-0.5
                                ${activePopup?.day === day && activePopup?.type === 'shift' ? 'ring-2 ring-blue-500 bg-blue-50' : 
                                  shift ? 'bg-white border-blue-200 shadow-sm' :
                                  reqShiftCode ? 'bg-pink-50/60 border-dashed border-pink-300' : 'bg-transparent border-dashed border-gray-300'} 
                                ${isEditable ? 'hover:border-blue-400' : ''}`}
                            >
                              {reqReason && (
                                <MessageSquare size={9} className="absolute top-1 right-1 text-pink-500 fill-pink-100 pointer-events-none" />
                              )}
                              {shift ? (
                                <>
                                  <span className={`font-bold text-xs ${shift.text}`}>{shift.label}</span>
                                  {reqShiftCode && shiftCode !== reqShiftCode && (
                                    <span className="text-[8px] text-pink-500 leading-none mt-0.5 truncate max-w-full">
                                      希:{reqShift?.label || reqShiftCode}
                                    </span>
                                  )}
                                </>
                              ) : reqShiftCode ? (
                                <span className="text-[9px] sm:text-[10px] font-bold text-pink-500 leading-tight text-center">
                                  {reqShiftCode === 'HOPE' ? '希望済' : `${reqShift?.label || reqShiftCode}(希)`}
                                </span>
                              ) : (
                                <span className="text-[8px] text-gray-300">選択</span>
                              )}
                            </div>
                            {task && <div className="text-[8px] text-center border rounded bg-white text-gray-600">{task.label}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full border-collapse select-none">
                  <thead>
                    <tr>
                      <th className="sticky top-0 left-0 z-30 bg-gray-100 border-b border-r p-2 min-w-[120px] h-24 text-left">
                        <div className="flex flex-col justify-between h-full">
                          <span className="text-xs text-gray-500">職員 / 日付</span>
                          {appUser.role === 'admin' && (
                            <div className="text-[9px] font-normal text-gray-500 leading-tight space-y-0.5 my-0.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block"></span>本人入力
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block ml-1"></span>班管理固定
                                <span className="inline-flex items-center gap-0.5 text-pink-600 ml-1"><MessageSquare size={9} className="fill-pink-100"/>理由あり</span>
                              </div>
                              <div className="flex items-center gap-1"><span className="px-1 py-[1px] rounded bg-pink-100 text-pink-700 border border-pink-200 font-bold text-[8px] leading-none">希望</span>編集前の希望</div>
                            </div>
                          )}
                          {appUser.role === 'admin' && <button onClick={(e) => { e.stopPropagation(); handleAddStaff(); }} className="flex items-center gap-1 text-xs bg-white border px-2 py-1 rounded text-blue-600 font-bold"><Plus size={12}/> 職員追加</button>}
                        </div>
                      </th>
                      {daysArray.map(day => {
                        const isSun = isSunday(year, month, day);
                        const isHol = isHoliday(year, month, day, clinicClosedDays);
                        const closedRule = getClinicClosedRuleMatch(year, month, day, clinicClosedDays);
                        let bgClass = getDayColor(year, month, day, clinicClosedDays); 
                        let headerBg = 'bg-gray-50';
                        if(isSun || isHol) headerBg = 'bg-red-50'; 

                        return (
                          <th
                            key={day}
                            title={closedRule ? (closedRule.label || '外来休診日') : undefined}
                            className={`sticky top-0 z-20 border-b border-r min-w-[40px] p-1 text-center ${headerBg} ${bgClass}`}
                          >
                            <div className="text-sm font-bold">{day}</div>
                            <div className="text-xs font-normal opacity-80">{['日','月','火','水','木','金','土'][getDayOfWeek(year, month, day)]}</div>
                          </th>
                        );
                      })}
                      <th className="sticky top-0 z-20 bg-red-50 border-b border-r p-2 min-w-[60px] text-center text-xs font-bold text-red-800">残業</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {displayStaffList.map((staff) => {
                      const overtime = staffOvertimeStats[staff.id] || 0;
                      const carry = appUser.role === 'admin' ? prevMonthCarryOver.byStaff[staff.id] : null;
                      const maxStreakLimit = Number(adminSettings.maxConsecutiveWorkDays) || 5;
                      const showCarryBadges = !!(
                        carry &&
                        prevMonthCarryOver.hasStraddlingWeek &&
                        carry.staffHasPrevWorkShift &&
                        (carry.trailingWorkStreak > 0 || carry.prevLastDayWasCool3)
                      );
                      return (
                        <tr 
                          key={staff.id} 
                          className="group hover:bg-gray-50"
                          draggable={appUser.role === 'admin'}
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', staff.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { 
                            e.preventDefault(); 
                            if(appUser.role === 'admin') handleSortStaff(e.dataTransfer.getData('text/plain'), staff.id); 
                          }}
                        >
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-b border-r p-2 font-medium text-gray-700 whitespace-nowrap">
                            <div className="flex items-center justify-between group/cell w-full">
                              <div className="cursor-pointer flex-1" onClick={(e) => { if(appUser.role === 'admin') { e.stopPropagation(); handleEditStaff(staff); } }}>
                                <div className="text-sm font-bold text-gray-800 flex items-center gap-1">
                                  {staff.name}
                                  {appUser.role === 'admin' && <Edit2 size={10} className="text-gray-300 opacity-0 group-hover/cell:opacity-100 transition"/>}
                                </div>
                                <div className="text-[10px] text-gray-500 flex items-center gap-2">
                                  {staff.jobTitle}
                                  {staff.skills?.isLeader && <ShieldCheck size={10} className="text-blue-500" title="リーダー可"/>}
                                  {staff.skills?.isVeteran && <Star size={10} className="text-yellow-500" title="ベテラン"/>}
                                  {getStaffRestrictionSummaryText(staff) && (
                                    <ListFilter
                                      size={10}
                                      className="text-amber-500"
                                      title={`AI配置制限あり（${getStaffRestrictionSummaryText(staff)}）`}
                                    />
                                  )}
                                  {staff.excludeFromAi && <Lock size={10} className="text-red-500" title="AI自動生成対象外"/>}
                                </div>
                                {showCarryBadges && (
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1" title={carry.tooltipText}>
                                    {carry.trailingWorkStreak > 0 && (
                                      <span
                                        className={`px-1 py-[1px] rounded border text-[9px] font-bold leading-tight ${
                                          carry.isCrossMonthStreakViolated
                                            ? 'bg-red-100 text-red-700 border-red-300'
                                            : carry.trailingWorkStreak >= maxStreakLimit
                                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                                              : carry.trailingWorkStreak >= maxStreakLimit - 1
                                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}
                                      >
                                        {carry.isCrossMonthStreakViolated
                                          ? `⚠️月またぎ${carry.crossMonthTotalStreak}連勤`
                                          : carry.trailingWorkStreak >= maxStreakLimit
                                            ? `前月${carry.trailingWorkStreak}連勤(1日休要)`
                                            : `前月${carry.trailingWorkStreak}連勤`}
                                      </span>
                                    )}
                                    {carry.prevLastDayWasCool3 && (
                                      <span
                                        className={`px-1 py-[1px] rounded border text-[9px] font-bold leading-tight ${
                                          carry.isCrossMonthCool3Violated
                                            ? 'bg-red-100 text-red-700 border-red-300'
                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        }`}
                                      >
                                        {carry.isCrossMonthCool3Violated
                                          ? '⚠️1日3ｸｰﾙ連続'
                                          : `前末:${carry.prevLastDayLabel}`}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              {appUser.role === 'admin' && (
                                <div className="flex items-center">
                                  {/* ドラッグ処理はtrタグに移したため、ここはアイコン表示のみにする */}
                                  <div className="cursor-grab text-gray-400 mr-2 hover:text-gray-600">
                                    <GripVertical size={14} />
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); removeStaff(staff.id); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 px-1"><Trash2 size={12}/></button>
                                </div>
                              )}
                            </div>
                          </td>
                          {daysArray.map(day => {
                            const shiftCode = shiftData[staff.id]?.[day];
                            const taskCode = taskData[staff.id]?.[day];
                            const shift = shiftDefs[shiftCode];
                            const task = shiftDefs[taskCode];
                            const reqShiftCode = getUserRequestedShift(staff.id, day);
                            const reqShift = reqShiftCode ? shiftDefs[reqShiftCode] : null;
                            const reqReason = getUserRequestedReason(staff.id, day);
                            const reqTaskCode = getUserRequestedTask(staff.id, day);
                            const reqTask = reqTaskCode ? shiftDefs[reqTaskCode] : null;
                            const teamShiftLock = appUser.role === 'admin' ? getTeamLockedShiftSource(staff.id, day) : null;
                            const teamTaskLock = appUser.role === 'admin' ? getTeamLockedTaskSource(staff.id, day) : null;
                            const isSun = isSunday(year, month, day);
                            const isHol = isHoliday(year, month, day, clinicClosedDays);
                            const isEditable = !isSun && (appUser.role === 'admin' || (appUser.role === 'staff' && staff.id === appUser.id));
                            
                            // 該当するログを探す
                            const targetLog = changeLogs.find(log => log.staffId === staff.id && log.targetDay === day && log.type === 'shift');
                            const hasLog = !!targetLog;

                            let cellBg = '';
                            if (isSun) cellBg = 'bg-red-50';
                            else if (isHol) cellBg = isEditable ? 'bg-red-50 cursor-pointer hover:bg-red-100/60' : 'bg-red-50 opacity-80';
                            else if (!isEditable) cellBg = 'bg-gray-50 opacity-80';
                            else cellBg = 'cursor-pointer hover:bg-blue-50 bg-white';

                            // ツールチップ用のテキスト生成（希望履歴・理由は管理者のみ表示。スタッフ自身は自分のセルのみ理由を確認可能）
                            const shiftTooltips = [];
                            if (teamShiftLock) {
                              shiftTooltips.push(`【${TEAM_ADMIN_LABELS[teamShiftLock]}入力】AI変更ロック中（条件計算には反映）`);
                            }
                            if (appUser.role === 'admin' && reqShiftCode) {
                              const reqLabel = reqShift?.label || reqShiftCode;
                              if (shiftCode !== reqShiftCode) {
                                shiftTooltips.push(`【個人希望】${reqLabel} → 現在: ${shift ? shift.label : '空欄'}`);
                              } else {
                                shiftTooltips.push(`【個人希望】${reqLabel}（本人入力）`);
                              }
                            }
                            if (reqReason && (appUser.role === 'admin' || (appUser.role === 'staff' && staff.id === appUser.id))) {
                              shiftTooltips.push(`【希望理由】${reqReason}`);
                            }
                            if (targetLog) {
                              const dateObj = targetLog.timestamp ? targetLog.timestamp.toDate() : new Date();
                              const dateStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${dateObj.getHours()}:${dateObj.getMinutes().toString().padStart(2,'0')}`;
                              const beforeLabel = shiftDefs[targetLog.before]?.label || targetLog.before || '未設定';
                              const afterLabel = shiftDefs[targetLog.after]?.label || targetLog.after || '未設定';
                              shiftTooltips.push(`【変更履歴】\n日時: ${dateStr}\n内容: ${beforeLabel} → ${afterLabel}`);
                            }
                            const tooltipText = shiftTooltips.join('\n\n');

                            const taskTooltips = [];
                            if (teamTaskLock) {
                              taskTooltips.push(`【${TEAM_ADMIN_LABELS[teamTaskLock]}タスク】AI変更ロック中`);
                            }
                            if (appUser.role === 'admin' && reqTaskCode) {
                              const reqTaskLabel = reqTask?.label || reqTaskCode;
                              taskTooltips.push(
                                taskCode !== reqTaskCode
                                  ? `【個人タスク希望】${reqTaskLabel} → 現在: ${task ? task.label : '空欄'}`
                                  : `【個人タスク希望】${reqTaskLabel}（本人入力）`
                              );
                            }
                            const taskTooltip = taskTooltips.join('\n');

                            return (
                              <td key={day} className={`border-b border-r text-center p-0 h-16 relative ${cellBg}`}>
                                <div className="w-full h-full flex flex-col">
                                  {/* シフト表示部分(上3/4)にだけスタイルとツールチップを適用 */}
                                  <div 
                                    className={`h-3/4 relative flex items-center justify-center border-b border-gray-100 transition hover:bg-black/5 
                                      ${hasLog ? 'bg-yellow-100 ring-2 ring-inset ring-orange-400 z-10' : ''} 
                                      ${activePopup?.day === day && activePopup?.staffId === staff.id && activePopup?.type === 'shift' ? 'ring-2 ring-inset ring-blue-500 bg-blue-50 z-10' : ''}
                                    `}
                                    title={tooltipText} 
                                    onClick={(e) => { if(isEditable) { e.stopPropagation(); handleCellClick(e, staff.id, day, 'shift'); } }}
                                  >
                                    {teamShiftLock && (
                                      <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-teal-500 pointer-events-none" />
                                    )}
                                    {appUser.role === 'admin' && reqShiftCode && (
                                      shiftCode !== reqShiftCode ? (
                                        <span className="absolute top-0.5 right-0.5 px-1 py-[1px] rounded text-[8px] leading-none bg-pink-100 text-pink-700 border border-pink-200 font-bold pointer-events-none max-w-[38px] inline-flex items-center gap-0.5">
                                          <span className="truncate">{reqShift?.label || reqShiftCode}</span>
                                          {reqReason && <MessageSquare size={8} className="shrink-0 text-pink-600 fill-pink-200" />}
                                        </span>
                                      ) : reqReason ? (
                                        <MessageSquare size={10} className="absolute top-0.5 right-0.5 text-pink-500 fill-pink-100 pointer-events-none" />
                                      ) : (
                                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-pink-500 pointer-events-none" />
                                      )
                                    )}
                                    {shift ? <span className={`font-bold text-xs ${shift.text}`}>{shift.label}</span> : null}
                                  </div>
                                  
                                  {/* タスク表示部分(下1/4) */}
                                  <div
                                    className={`h-1/4 relative flex items-center justify-center transition hover:bg-black/5
                                      ${activePopup?.day === day && activePopup?.staffId === staff.id && activePopup?.type === 'task' ? 'ring-2 ring-inset ring-blue-500 bg-blue-50 z-10' : ''}
                                    `}
                                    title={taskTooltip}
                                    onClick={(e) => { if(isEditable) { e.stopPropagation(); handleCellClick(e, staff.id, day, 'task'); } }}
                                  >
                                    {teamTaskLock && (
                                      <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 pointer-events-none" />
                                    )}
                                    {appUser.role === 'admin' && reqTaskCode && (
                                      taskCode !== reqTaskCode && !task ? (
                                        <span className="px-0.5 rounded text-[8px] leading-none bg-pink-100 text-pink-700 border border-pink-200 font-bold pointer-events-none max-w-[36px] truncate">
                                          {reqTask?.label || reqTaskCode}
                                        </span>
                                      ) : (
                                        <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full pointer-events-none ${taskCode !== reqTaskCode ? 'bg-pink-600 ring-1 ring-pink-200' : 'bg-pink-400'}`} />
                                      )
                                    )}
                                    {task ? <span className={`font-bold text-[10px] ${task.text} transform scale-90`}>{task.label}</span> : null}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className={`border-b border-r text-center p-1 font-bold text-sm ${overtime > 60 ? 'bg-red-100 text-red-600' : 'bg-gray-50 text-gray-600'}`}>
                            <div className="flex flex-col items-center justify-center h-full"><span>{overtime > 0 ? overtime : '-'}</span>{overtime > 60 && <AlertTriangle size={12} className="text-red-500 mt-1" />}</div>
                          </td>
                        </tr>
                      );
                    })}
                    {appUser.role === 'admin' && (
                      <>
                        <tr>
                          <td className="p-2 bg-gray-100 border-r border-b font-bold text-gray-600 text-xs text-right sticky left-0 z-10 flex justify-between items-center">
                            <button onClick={(e) => { e.stopPropagation(); setShowTargetCountModal(true); }} className="text-gray-400 hover:text-blue-600"><Settings size={14}/></button><span>集計</span>
                          </td>
                          <td colSpan={daysInMonth+1} className="bg-gray-100 border-b"></td>
                        </tr>
                        <tr><td className="sticky left-0 bg-gray-50 border-r border-b p-2 text-xs font-bold text-right">出勤人数</td>{daysArray.map(day => <td key={day} className="border-r border-b text-center text-xs font-bold bg-gray-50">{dailyStats[day].total}</td>)}<td className="bg-gray-50 border-b"></td></tr>
                        <tr>
                          <td className="sticky left-0 bg-pink-50 border-r border-b p-2 text-xs font-bold text-right text-pink-700">休み希望数</td>
                          {daysArray.map(day => {
                            const count = isSunday(year, month, day) ? 0 : (dailyOffRequestCounts[day] || 0);
                            const alertThreshold = parseInt(adminSettings.offRequestAlertCount, 10);
                            const isAlert = !isNaN(alertThreshold) && alertThreshold > 0 && count >= alertThreshold;
                            return (
                              <td key={day} className={`border-r border-b text-center text-xs font-bold ${isAlert ? 'bg-red-100 text-red-600' : 'bg-pink-50/40 text-pink-600'}`}>
                                {count > 0 ? count : '-'}
                              </td>
                            );
                          })}
                          <td className="bg-gray-50 border-b"></td>
                        </tr>
                        {dynamicSummaryGroups.map(group => (
                          <React.Fragment key={group.name}>
                            {group.totalLabel && (
                              <tr>
                                <td className={`sticky left-0 border-r border-b p-2 text-xs font-bold text-right ${group.headerColor}`}>{group.totalLabel}</td>
                                {daysArray.map(day => {
                                  const total = group.items.reduce((sum, code) => sum + (dailyStats[day][code] || 0), 0);
                                  const targetTotal = group.items.reduce((sum, code) => sum + getTargetCount(code, day), 0);
                                  const isAlert = targetTotal > 0 && total < targetTotal;
                                  const skillShortages = dailyFacilitySkillSummary[day]?.shortagesByCat?.[group.id] || [];
                                  const isSkillShort = !isSunday(year, month, day) && skillShortages.length > 0;

                                  const tooltipParts = [];
                                  if (isAlert) {
                                    tooltipParts.push(`【${group.name} 人数不足】現在 ${total}名 / 必要 ${targetTotal}名`);
                                  }
                                  if (isSkillShort) {
                                    tooltipParts.push(
                                      `【${group.name} 必須スキル不足】` +
                                      skillShortages.map(s => `${s.skillLabel}: ${s.actual}/${s.target}名`).join('・')
                                    );
                                  }

                                  const summaryCellClass = isAlert
                                    ? 'bg-red-200 text-red-700'
                                    : isSkillShort
                                      ? 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-400'
                                      : 'bg-gray-50';

                                  return (
                                    <td
                                      key={day}
                                      title={tooltipParts.length > 0 ? tooltipParts.join('\n') : undefined}
                                      className={`border-r border-b text-center text-xs font-bold ${summaryCellClass}`}
                                    >
                                      {total > 0 ? total : '-'}
                                      {!isAlert && isSkillShort && <span className="text-[9px] ml-0.5 align-top">⚠</span>}
                                    </td>
                                  );
                                })}
                                <td className="bg-gray-50 border-b"></td>
                              </tr>
                            )}
                            {group.items.map(code => {
                              const shift = shiftDefs[code];
                              return (
                                <tr key={code}>
                                  <td className="sticky left-0 bg-white border-r border-b p-2 text-xs text-right text-gray-500"><span className={shift.text}>{shift.label}</span> ({shift.code})</td>
                                  {daysArray.map(day => {
                                    const count = dailyStats[day][code] || 0;
                                    const target = getTargetCount(code, day);
                                    let isAlert = false;
                                    if (target > 0) isAlert = count < target;
                                    return <td key={day} className={`border-r border-b text-center text-xs ${isAlert ? 'bg-red-100 text-red-600 font-bold' : 'text-gray-400'}`}>{count > 0 ? count : '-'}</td>;
                                  })}
                                  <td className="bg-gray-50 border-b"></td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {activePopup && (() => {
          const popupStaff = staffList.find(s => s.id === activePopup.staffId);
          const popupCurrentCode = activePopup.type === 'shift'
            ? shiftData[activePopup.staffId]?.[activePopup.day]
            : taskData[activePopup.staffId]?.[activePopup.day];
          const popupReqCode = activePopup.type === 'shift'
            ? getUserRequestedShift(activePopup.staffId, activePopup.day)
            : getUserRequestedTask(activePopup.staffId, activePopup.day);
          const popupReqDef = popupReqCode ? shiftDefs[popupReqCode] : null;
          const popupReqReason = activePopup.type === 'shift'
            ? getUserRequestedReason(activePopup.staffId, activePopup.day)
            : '';

          return (
            <div 
              ref={popupRef}
              className={`z-[80] bg-white border p-3 animate-in duration-200 fixed bottom-0 left-0 right-0 w-full max-h-[80vh] flex flex-col rounded-t-xl shadow-[0_-4px_10px_rgba(0,0,0,0.1)] shrink-0 
                md:w-80 md:max-h-[calc(100vh-24px)] md:rounded-xl md:bottom-auto md:left-auto md:right-auto md:shadow-2xl md:border-gray-300`}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-2 pb-2 border-b shrink-0">
                <div className="text-sm font-bold text-gray-700 truncate pr-2">
                  {month}月{activePopup.day}日{appUser.role === 'admin' && popupStaff ? ` (${popupStaff.name})` : ''} - {activePopup.type === 'shift' ? 'シフト選択' : 'タスク選択'}
                </div>
                <button onClick={() => setActivePopup(null)} className="p-1 bg-gray-100 text-gray-600 rounded-md font-bold hover:bg-gray-200 transition shrink-0"><X size={18} /></button>
              </div>
              {appUser.role === 'admin' && popupReqCode && (
                <div className="mb-2.5 p-2 bg-pink-50 border border-pink-200 rounded-lg text-xs shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-pink-800 flex items-center gap-1 min-w-0">
                      <span className="font-bold shrink-0">個人希望:</span>
                      <span className={`font-extrabold px-1.5 py-0.5 bg-white rounded border border-pink-200 truncate ${popupReqDef?.text || 'text-pink-700'}`}>
                        {popupReqDef ? popupReqDef.label : popupReqCode}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {popupCurrentCode !== popupReqCode && popupReqDef && (
                        <button
                          onClick={() => { handleUpdateCell(activePopup.staffId, activePopup.day, popupReqCode, activePopup.type); setActivePopup(null); }}
                          className="px-2 py-1 bg-white hover:bg-pink-100 text-pink-700 border border-pink-300 rounded font-bold text-[10px] transition"
                          title="本人が入力した希望内容に戻します"
                        >
                          希望に戻す
                        </button>
                      )}
                      <button
                        onClick={() => { handleClearUserRequest(activePopup.staffId, activePopup.day, activePopup.type); setActivePopup(null); }}
                        className="px-2 py-1 bg-white hover:bg-red-100 text-red-600 border border-red-200 rounded font-bold text-[10px] transition"
                        title="個人の希望履歴自体を消去します"
                      >
                        希望取消
                      </button>
                    </div>
                  </div>
                  {popupReqReason && (
                    <div className="mt-1.5 pt-1.5 border-t border-pink-200/80 text-pink-900 flex items-start gap-1.5 break-words">
                      <MessageSquare size={13} className="text-pink-500 fill-pink-100 shrink-0 mt-0.5" />
                      <div className="leading-snug min-w-0 flex-1">
                        <span className="font-bold text-pink-700">理由: </span>
                        <span>{popupReqReason}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {appUser.role === 'staff' && activePopup.type === 'shift' && activePopup.staffId === appUser.id && (
                <div className="mb-2.5 shrink-0">
                  <label className="text-[11px] font-bold text-gray-600 mb-1 flex items-center gap-1">
                    <MessageSquare size={12} className="text-pink-500" />
                    <span>希望理由</span>
                    <span className="font-normal text-gray-400 text-[10px]">（任意・50文字まで）</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={50}
                      value={popupReasonText}
                      onChange={(e) => setPopupReasonText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.keyCode === 229 || e.nativeEvent.isComposing) return;
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (popupCurrentCode || popupReqCode) {
                            handleSaveStaffReason(activePopup.staffId, activePopup.day, popupReasonText);
                            setActivePopup(null);
                          } else {
                            e.currentTarget.blur();
                          }
                        }
                      }}
                      placeholder="例: 通院、学校行事など"
                      className="flex-1 min-w-0 border border-gray-300 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    />
                    {(popupCurrentCode || popupReqCode) && popupReasonText.trim() !== popupReqReason && (
                      <button
                        onClick={() => {
                          handleSaveStaffReason(activePopup.staffId, activePopup.day, popupReasonText);
                          setActivePopup(null);
                        }}
                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold shrink-0 transition"
                      >
                        理由保存
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* PC時は4列、スマホ時は4～6列に調整。クリアボタンのサイズを他と統一。 */}
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-4 gap-2 overflow-y-auto flex-1 min-h-0 max-h-[40vh] md:max-h-[45vh] p-1">
                <button
                  onClick={() => { handleUpdateCell(activePopup.staffId, activePopup.day, null, activePopup.type); setActivePopup(null); }}
                  className="h-12 md:h-9 text-xs text-red-500 border border-red-200 bg-red-50 rounded hover:bg-red-100 flex items-center justify-center font-bold"
                  title={appUser.role === 'admin' && popupReqCode ? 'セルを空欄にします（個人の希望履歴・理由は保持されます）' : 'クリア'}
                >
                  クリア
                </button>
                {getPopupOptions(activePopup.type).map(shift => (
                  <button
                    key={shift.code}
                    onClick={() => {
                      handleUpdateCell(
                        activePopup.staffId,
                        activePopup.day,
                        shift.code,
                        activePopup.type,
                        appUser.role === 'staff' && activePopup.type === 'shift' ? popupReasonText : undefined
                      );
                      setActivePopup(null);
                    }}
                    className={`h-12 md:h-9 w-full rounded flex items-center justify-center font-bold text-xs border transition ${shift.text} hover:bg-gray-50`}
                    title={shift.label}
                  >
                    {shift.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 統合設定モーダル */}
        {showSettingsModal && (
          <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowSettingsModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[85vh]" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Settings size={20}/> システム設定</h3>
                <button onClick={() => setShowSettingsModal(false)}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                <div className="w-48 bg-gray-100 border-r flex flex-col p-2 space-y-1">
                  <button onClick={() => setActiveSettingsTab('basic')} className={`p-3 rounded text-left text-sm font-bold flex items-center gap-2 ${activeSettingsTab === 'basic' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}><CalendarIcon size={16}/> 基本設定</button>
                  <button onClick={() => setActiveSettingsTab('category')} className={`p-3 rounded text-left text-sm font-bold flex items-center gap-2 ${activeSettingsTab === 'category' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}><Palette size={16}/> カテゴリ設定</button>
                  <button onClick={() => setActiveSettingsTab('shift')} className={`p-3 rounded text-left text-sm font-bold flex items-center gap-2 ${activeSettingsTab === 'shift' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}><Clock size={16}/> シフト設定</button>
                  <button onClick={() => setActiveSettingsTab('staff')} className={`p-3 rounded text-left text-sm font-bold flex items-center gap-2 ${activeSettingsTab === 'staff' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}><Users size={16}/> 職員設定</button>
                  <button onClick={() => setActiveSettingsTab('password')} className={`p-3 rounded text-left text-sm font-bold flex items-center gap-2 ${activeSettingsTab === 'password' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}><Key size={16}/> パスワード</button>
                  <div className="flex-1"></div>
                  <button onClick={() => setActiveSettingsTab('data')} className={`p-3 rounded text-left text-sm font-bold flex items-center gap-2 ${activeSettingsTab === 'data' ? 'bg-red-50 text-red-600 border border-red-200' : 'text-gray-600 hover:bg-gray-200'}`}><Database size={16}/> データ管理</button>
                </div>
                <div className="flex-1 overflow-auto bg-white p-6">
                  {/* ... (設定タブの内容は省略せず表示) */}
                  {/* ★追加：基本設定タブの内容 */}
                  {activeSettingsTab === 'basic' && (
                    <div className="max-w-xl mx-auto mt-4 space-y-8 pb-6">
                      <h4 className="font-bold text-gray-700 border-b pb-3">基本設定</h4>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">休み希望の締切設定</label>
                        <div className="flex gap-2 items-center">
                          <span className="text-sm">毎月</span>
                          <select 
                            className="border p-2 rounded w-24 text-right" 
                            value={adminSettings.deadlineDay || ''} 
                            onChange={(e) => {
                              const newSettings = { ...adminSettings, deadlineDay: e.target.value };
                              setAdminSettings(newSettings);
                              saveMasterData({ adminSettings: newSettings }); // ★修正
                            }}
                          >
                            <option value="">未設定</option>
                            {[...Array(31)].map((_, i) => (
                              <option key={i + 1} value={i + 1}>{i + 1}</option>
                            ))}
                          </select>
                          <span className="text-sm">日 まで</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          ※設定すると、対象月（シフトの月）の<strong>前月の設定日</strong>を締切日とみなします。<br/>
                          （例：毎月20日に設定 → 5月分のシフト希望は4月20日が締切）
                        </p>
                      </div>

                      <div className="border-t pt-6">
                        <label className="block text-sm font-bold text-gray-700 mb-1">外来診療休診日の設定（祝日扱い）</label>
                        <p className="text-xs text-gray-500 mb-3">
                          年末年始やお盆・臨時休診など、祝日と同様にカレンダーや勤務表を赤色で表示する日を設定します（シフト・希望の入力は可能です）。
                        </p>

                        <div className="bg-gray-50 p-4 rounded-lg border space-y-4">
                          {/* かんたんプリセット追加 */}
                          <div>
                            <div className="text-[11px] font-bold text-gray-500 mb-1.5">かんたん追加（プリセット）</div>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { label: '年末年始 (毎年 12/29〜1/3)', sM: 12, sD: 29, eM: 1, eD: 3, name: '年末年始' },
                                { label: '年末年始 (毎年 12/30〜1/3)', sM: 12, sD: 30, eM: 1, eD: 3, name: '年末年始' },
                              ].map((preset, idx) => {
                                const alreadyAdded = clinicClosedDays.some(
                                  r =>
                                    r.type === 'yearly' &&
                                    Number(r.startMonth) === preset.sM &&
                                    Number(r.startDay) === preset.sD &&
                                    Number(r.endMonth) === preset.eM &&
                                    Number(r.endDay) === preset.eD
                                );
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    disabled={alreadyAdded}
                                    onClick={() =>
                                      handleAddClinicClosedRule({
                                        type: 'yearly',
                                        startMonth: preset.sM,
                                        startDay: preset.sD,
                                        endMonth: preset.eM,
                                        endDay: preset.eD,
                                        label: preset.name,
                                      })
                                    }
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1 transition ${
                                      alreadyAdded
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                        : 'bg-white text-red-600 border-red-200 hover:bg-red-50 shadow-sm'
                                    }`}
                                  >
                                    {alreadyAdded ? <Check size={12} /> : <Plus size={12} />}
                                    <span>{preset.label}{alreadyAdded ? '（登録済）' : ''}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* カスタム追加フォーム */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-3">
                            <div className="flex gap-1 bg-gray-100 p-1 rounded-md text-xs font-bold">
                              <button
                                type="button"
                                onClick={() => setClosedFormType('yearly')}
                                className={`flex-1 py-1.5 rounded transition ${
                                  closedFormType === 'yearly' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                毎年固定（月日で指定）
                              </button>
                              <button
                                type="button"
                                onClick={() => setClosedFormType('specific')}
                                className={`flex-1 py-1.5 rounded transition ${
                                  closedFormType === 'specific' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                特定年のみ（年月日で指定）
                              </button>
                            </div>

                            {closedFormType === 'yearly' ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="font-bold text-gray-600 mr-1">期間:</span>
                                  <select
                                    className="border rounded px-2 py-1.5 bg-white font-medium"
                                    value={closedStartMonth}
                                    onChange={(e) => {
                                      const nextM = Number(e.target.value);
                                      const maxD = getMaxDaysForMonthRule(nextM);
                                      const nextD = Math.min(closedStartDay, maxD);
                                      const wasSame = closedStartMonth === closedEndMonth && closedStartDay === closedEndDay;
                                      setClosedStartMonth(nextM);
                                      setClosedStartDay(nextD);
                                      if (wasSame) {
                                        setClosedEndMonth(nextM);
                                        setClosedEndDay(nextD);
                                      }
                                    }}
                                  >
                                    {[...Array(12)].map((_, i) => (
                                      <option key={i + 1} value={i + 1}>{i + 1}月</option>
                                    ))}
                                  </select>
                                  <select
                                    className="border rounded px-2 py-1.5 bg-white font-medium"
                                    value={closedStartDay}
                                    onChange={(e) => {
                                      const nextD = Number(e.target.value);
                                      const wasSame = closedStartMonth === closedEndMonth && closedStartDay === closedEndDay;
                                      setClosedStartDay(nextD);
                                      if (wasSame) {
                                        setClosedEndDay(nextD);
                                      }
                                    }}
                                  >
                                    {[...Array(getMaxDaysForMonthRule(closedStartMonth))].map((_, i) => (
                                      <option key={i + 1} value={i + 1}>{i + 1}日</option>
                                    ))}
                                  </select>
                                  <span className="text-gray-400 font-bold px-1">〜</span>
                                  <select
                                    className="border rounded px-2 py-1.5 bg-white font-medium"
                                    value={closedEndMonth}
                                    onChange={(e) => {
                                      const nextM = Number(e.target.value);
                                      const maxD = getMaxDaysForMonthRule(nextM);
                                      setClosedEndMonth(nextM);
                                      if (closedEndDay > maxD) setClosedEndDay(maxD);
                                    }}
                                  >
                                    {[...Array(12)].map((_, i) => (
                                      <option key={i + 1} value={i + 1}>{i + 1}月</option>
                                    ))}
                                  </select>
                                  <select
                                    className="border rounded px-2 py-1.5 bg-white font-medium"
                                    value={closedEndDay}
                                    onChange={(e) => setClosedEndDay(Number(e.target.value))}
                                  >
                                    {[...Array(getMaxDaysForMonthRule(closedEndMonth))].map((_, i) => (
                                      <option key={i + 1} value={i + 1}>{i + 1}日</option>
                                    ))}
                                  </select>
                                </div>
                                <p className="text-[11px] text-gray-400">
                                  ※1日のみの場合は開始と終了を同じ月日にします（12月〜1月のような年またぎ期間も指定可能です）。
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="font-bold text-gray-600 mr-1">期間:</span>
                                  <input
                                    type="date"
                                    className="border rounded px-2 py-1.5 bg-white"
                                    value={closedStartDate}
                                    onChange={(e) => {
                                      const nextStart = e.target.value;
                                      const wasSameOrEmpty = !closedEndDate || closedEndDate === closedStartDate || closedEndDate < nextStart;
                                      setClosedStartDate(nextStart);
                                      if (wasSameOrEmpty) {
                                        setClosedEndDate(nextStart);
                                      }
                                    }}
                                  />
                                  <span className="text-gray-400 font-bold px-1">〜</span>
                                  <input
                                    type="date"
                                    className="border rounded px-2 py-1.5 bg-white"
                                    value={closedEndDate}
                                    min={closedStartDate || undefined}
                                    onChange={(e) => setClosedEndDate(e.target.value)}
                                  />
                                </div>
                                <p className="text-[11px] text-gray-400">
                                  ※1日のみの場合は開始日と終了日を同じ日付にしてください。
                                </p>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                maxLength={30}
                                value={closedLabelInput}
                                onChange={(e) => setClosedLabelInput(e.target.value)}
                                placeholder="名称・メモ（任意 例: 年末年始、夏季休診、臨時休診）"
                                className="flex-1 min-w-0 border rounded px-2.5 py-1.5 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddClinicClosedRule()}
                                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs flex items-center gap-1 shrink-0 transition"
                              >
                                <Plus size={14} /> 追加
                              </button>
                            </div>
                          </div>

                          {/* 登録済み休診日リスト */}
                          <div>
                            <div className="text-[11px] font-bold text-gray-500 mb-1.5">
                              登録済みの休診日 ({clinicClosedDays.length}件)
                            </div>
                            {clinicClosedDays.length === 0 ? (
                              <div className="text-xs text-gray-400 bg-white border border-dashed rounded p-3 text-center">
                                現在、追加の休診日は設定されていません。
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {clinicClosedDays.map((rule) => (
                                  <div
                                    key={rule.id}
                                    className="flex items-center justify-between gap-2 bg-white border border-red-100 rounded-lg px-3 py-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                                          rule.type === 'yearly'
                                            ? 'bg-red-50 text-red-600 border-red-200'
                                            : 'bg-orange-50 text-orange-700 border-orange-200'
                                        }`}
                                      >
                                        {rule.type === 'yearly' ? '毎年' : '特定年'}
                                      </span>
                                      <span className="font-bold text-gray-800">
                                        {formatClinicClosedRule(rule)}
                                      </span>
                                      {rule.label && (
                                        <span className="text-gray-500 truncate">
                                          （{rule.label}）
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveClinicClosedRule(rule.id)}
                                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition shrink-0"
                                      title="この休診日設定を削除"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-6">
                        <label className="block text-sm font-bold text-gray-700 mb-1">休み希望人数としてカウントするシフト</label>
                        <p className="text-xs text-gray-500 mb-3">
                          個人カレンダーの各日付横に表示される「休○」バッジおよび集計の「休み希望数」にカウントするシフトを選択してください。<br/>
                          ※パート職員の入力分はカウント対象外となります（バッジ自体はパート職員の画面にも表示されます）。
                        </p>
                        <div className="space-y-3 bg-gray-50 p-4 rounded-lg border">
                          {basicSettingsShiftGroups.map(group => (
                            <div key={group.id}>
                              <div className="text-[11px] font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${group.color}`}>{group.name}</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {group.items.map(code => {
                                  const s = shiftDefs[code];
                                  if (!s) return null;
                                  const isChecked = countedOffShifts.includes(code);
                                  return (
                                    <label
                                      key={code}
                                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition select-none ${
                                        isChecked
                                          ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-sm'
                                          : 'bg-white border-gray-200 hover:bg-gray-100'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="w-4 h-4 text-blue-600 rounded"
                                        checked={isChecked}
                                        onChange={() => toggleCountedOffShift(code)}
                                      />
                                      <span className={`text-xs font-bold ${s.text}`}>{s.label}</span>
                                      <span className="text-[10px] text-gray-400">({s.code})</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t pt-6">
                        <label className="block text-sm font-bold text-gray-700 mb-2">休み希望人数の強調表示（目安人数）</label>
                        <div className="flex gap-2 items-center">
                          <select
                            className="border p-2 rounded w-36"
                            value={adminSettings.offRequestAlertCount || ''}
                            onChange={(e) => {
                              const newSettings = { ...adminSettings, offRequestAlertCount: e.target.value };
                              setAdminSettings(newSettings);
                              saveMasterData({ adminSettings: newSettings });
                            }}
                          >
                            <option value="">未設定（単色）</option>
                            {[...Array(15)].map((_, i) => (
                              <option key={i + 1} value={i + 1}>{i + 1}人以上</option>
                            ))}
                          </select>
                          <span className="text-sm text-gray-700">で赤色強調</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          ※設定した人数以上に達した日は、個人カレンダーの「休○」バッジが赤色で強調表示されます。
                        </p>
                      </div>

                      <div className="border-t pt-6">
                        <label className="block text-sm font-bold text-gray-700 mb-1">AI作成時の最大連勤数・週休ペース設定</label>
                        <p className="text-xs text-gray-500 mb-3">
                          週休2日制（日曜休診＋月〜土のうち週1日休み）に基づき、AIが自動で確保する「空欄休み」と連続出勤の上限を設定します。
                        </p>
                        <div className="bg-gray-50 border rounded-lg p-4 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">最大連勤数（上限）</label>
                              <select
                                className="w-full border p-2 rounded bg-white text-sm font-medium"
                                value={adminSettings.maxConsecutiveWorkDays || 5}
                                onChange={(e) => {
                                  const newSettings = { ...adminSettings, maxConsecutiveWorkDays: Number(e.target.value) };
                                  setAdminSettings(newSettings);
                                  saveMasterData({ adminSettings: newSettings });
                                }}
                              >
                                <option value={3}>3連勤まで</option>
                                <option value={4}>4連勤まで</option>
                                <option value={5}>5連勤まで（週休2日 標準）</option>
                                <option value={6}>6連勤まで</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">月間の公休数（日曜除く指定休・振休枠）</label>
                              <select
                                className="w-full border p-2 rounded bg-white text-sm font-medium"
                                value={adminSettings.monthlyRegularOffDays || 'auto'}
                                onChange={(e) => {
                                  const newSettings = { ...adminSettings, monthlyRegularOffDays: e.target.value };
                                  setAdminSettings(newSettings);
                                  saveMasterData({ adminSettings: newSettings });
                                }}
                              >
                                <option value="auto">自動計算（週1日休みペース: 月4〜5日）</option>
                                <option value="3">月3日で固定</option>
                                <option value="4">月4日で固定</option>
                                <option value="5">月5日で固定</option>
                                <option value="6">月6日で固定</option>
                                <option value="7">月7日で固定</option>
                              </select>
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-600 bg-white border border-gray-200 rounded-md p-3 space-y-1 leading-relaxed">
                            <div>・<strong>休みの表現：</strong>AIは公休（指定休・振替休枠）にコードを入れず<strong>「空欄」</strong>のまま残します。</div>
                            <div>・<strong>有休の扱い：</strong>既に入力済みの「指定(S)・振休(H)・希望(HOPE)」は公休枠として数え、「年休(Y)・リフレ(R)」などの有休は公休とは別枠（目標出勤日数から差し引き）として計算します。</div>
                            <div>・<strong>祝日・ME室の扱い：</strong>祝日・外来休診日も日曜以外は透析出勤日として組みます。ME室（L/G）はOPE班管理のためAIでの自動入力・既存変更は行いません（祝日のME室必要人数は G:1名 / L:0名 として集計）。</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'category' && (
                    <div className="flex h-full gap-4">
                      <div className="w-1/3 border-r pr-4 overflow-y-auto">
                        <button onClick={handleAddCategory} className="w-full mb-3 py-2 bg-blue-100 text-blue-700 font-bold rounded text-xs flex items-center justify-center gap-1 hover:bg-blue-200"><Plus size={12}/> 新規カテゴリ</button>
                        <div className="space-y-2">{Object.values(categoryDefs).sort((a,b)=>a.order-b.order).map(cat => (<div key={cat.id} className={`p-2 rounded border text-xs font-bold flex items-center gap-2 cursor-pointer ${targetCategory?.originalId === cat.id ? 'ring-2 ring-blue-400' : ''} ${cat.color}`} onClick={() => handleEditCategory(cat.id)} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', cat.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleSortCategory(e.dataTransfer.getData('text/plain'), cat.id); }}><GripVertical size={14} className="text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0" /><span className="flex-1 truncate">{cat.label}</span></div>))}</div>
                      </div>
                      <div className="flex-1 pl-4">
                        {targetCategory ? (
                          <div className="space-y-4 max-w-md">
                            <h4 className="font-bold text-gray-700 border-b pb-2">カテゴリ編集</h4>
                            <div><label className="text-xs font-bold text-gray-500">ID (英数字)</label><input type="text" className="w-full border p-2 rounded" value={targetCategory.id} onChange={e => setTargetCategory({...targetCategory, id: e.target.value})} disabled={!!targetCategory.originalId}/></div>
                            <div><label className="text-xs font-bold text-gray-500">表示名</label><input type="text" className="w-full border p-2 rounded" value={targetCategory.label} onChange={e => setTargetCategory({...targetCategory, label: e.target.value})}/></div>
                            <div><label className="text-xs font-bold text-gray-500">色スタイル</label><div className="grid grid-cols-3 gap-2 mt-1">{BG_COLOR_OPTIONS.map(opt => (<button key={opt.value} onClick={() => setTargetCategory({...targetCategory, color: opt.value})} className={`text-xs p-2 rounded border font-bold ${opt.value} ${targetCategory.color === opt.value ? 'ring-2 ring-blue-500' : ''}`}>{opt.label}</button>))}</div></div>
                            <div className="flex justify-between pt-4">{targetCategory.originalId && <button onClick={() => deleteCategory(targetCategory.originalId)} className="text-red-500 text-sm hover:underline">削除</button>}<button onClick={saveCategory} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">保存</button></div>
                          </div>
                        ) : <div className="text-gray-400 text-center mt-20">左側からカテゴリを選択または新規作成してください</div>}
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'shift' && (
                    <div className="flex h-full gap-4">
                      <div className="w-1/3 border-r pr-4 overflow-y-auto">
                        <button onClick={handleAddNewShift} className="w-full mb-3 py-2 bg-blue-100 text-blue-700 font-bold rounded text-xs flex items-center justify-center gap-1 hover:bg-blue-200"><Plus size={12}/> 新規シフト</button>
                        <div className="space-y-4">{dynamicPaletteGroups.map(g => (<div key={g.id}><div className="text-[10px] text-gray-400 font-bold uppercase mb-1">{g.name}</div><div className="space-y-1">{g.items.map(code => (<div key={code} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', code)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleSortShift(e.dataTransfer.getData('text/plain'), code); }} onClick={() => handleEditShift(code)} className={`p-2 rounded cursor-pointer border text-xs flex items-center gap-2 ${editingShift?.originalCode === code ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200 hover:bg-gray-100'}`}><GripVertical size={14} className="text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0" /><span className={shiftDefs[code].text}>{shiftDefs[code].label}</span></div>))}</div></div>))}</div>
                      </div>
                      <div className="flex-1 pl-4 overflow-y-auto">
                        {editingShift ? (
                          <div className="space-y-4 max-w-lg">
                            <h4 className="font-bold text-gray-700 border-b pb-2">シフト編集</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div><label className="text-xs font-bold text-gray-500">コード</label><input type="text" className="w-full border p-2 rounded" value={editingShift.code || ''} onChange={e => setEditingShift({...editingShift, code: e.target.value.toUpperCase()})} /></div>
                              <div><label className="text-xs font-bold text-gray-500">表示名</label><input type="text" className="w-full border p-2 rounded" value={editingShift.label || ''} onChange={e => setEditingShift({...editingShift, label: e.target.value})} /></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500">カテゴリ</label><select className="w-full border p-2 rounded" value={editingShift.category || 'saka'} onChange={e => setEditingShift({...editingShift, category: e.target.value})}>{Object.values(categoryDefs).sort((a,b)=>a.order-b.order).map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-4">
                              <div><label className="text-xs font-bold text-gray-500">残業(h)</label><input type="number" step="0.5" className="w-full border p-2 rounded" value={editingShift.overtime ?? ''} onChange={e => setEditingShift({...editingShift, overtime: e.target.value})} /></div>
                              <div><label className="text-xs font-bold text-gray-500">文字色</label><div className="flex flex-wrap gap-1 mt-1">{COLOR_OPTIONS.map(c => (<button key={c.value} onClick={() => setEditingShift({...editingShift, text: c.value})} className={`w-6 h-6 rounded border ${c.value} ${editingShift.text === c.value ? 'ring-2 ring-blue-500' : ''}`}>Aa</button>))}</div></div>
                            </div>
                            {editingShift.type === 'shift' && (
                              <div className="grid grid-cols-2 gap-4 bg-blue-50 p-2 rounded">
                                <div><label className="text-xs font-bold text-blue-700">開始</label><input type="time" className="w-full border rounded p-1" value={editingShift.startTime || ''} onChange={e => setEditingShift({...editingShift, startTime: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-blue-700">終了</label><input type="time" className="w-full border rounded p-1" value={editingShift.endTime || ''} onChange={e => setEditingShift({...editingShift, endTime: e.target.value})} /></div>
                              </div>
                            )}
                            <div className="mt-4 p-3 border rounded-lg bg-gray-50">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-blue-600 rounded" 
                                  checked={editingShift.isRequestable || false} 
                                  onChange={e => setEditingShift({...editingShift, isRequestable: e.target.checked})} 
                                />
                                <span className="text-sm font-bold text-gray-700">シフト希望に表示する</span>
                              </label>
                            </div>
                            <div className="flex justify-between pt-4 mt-4">
                              {editingShift.originalCode && <button onClick={() => deleteShiftConfig(editingShift.originalCode)} className="text-red-500 text-sm hover:underline">削除</button>}
                              <button onClick={saveShiftConfig} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">保存</button>
                            </div>
                          </div>
                        ) : <div className="text-gray-400 text-center mt-20">左側からシフトを選択または新規作成してください</div>}
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'staff' && (
                    <div className="h-full flex flex-col">
                      <div className="mb-4 flex justify-between items-center gap-2">
                        <p className="text-xs text-gray-500">
                          スキル、3クール制限、AI配置可能施設、AI除外設定を一括管理します（施設バッジをクリックしてON/OFF切替できます ※ME室はOPE班管理のため常時AI対象外）。
                        </p>
                        <button onClick={handleAddStaff} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded flex items-center gap-1 hover:bg-blue-700 shrink-0"><Plus size={12}/> 職員追加</button>
                      </div>
                      <div className="flex-1 overflow-auto border rounded-lg">
                        <table className="w-full border-collapse text-xs bg-white">
                          <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="p-2 border text-center w-8"></th>
                              <th className="p-2 border text-left min-w-[120px]">職員名 / 役職</th>
                              <th className="p-2 border text-center w-14">編集</th>
                              <th className="p-2 border text-center w-16">AI除外</th>
                              <th className="p-2 border text-center w-20">3クール上限</th>
                              <th className="p-2 border text-left min-w-[210px]">AI配置可能施設 / 制限</th>
                              {STAFF_SKILLS.map(skill => (<th key={skill.key} className="p-2 border text-center w-16"><div className="flex flex-col items-center"><skill.icon size={14} className="text-gray-600 mb-1"/><span>{skill.label}</span></div></th>))}
                            </tr>
                          </thead>
                          <tbody>
                            {staffList.map((staff, index) => {
                              const exCats = Array.isArray(staff.excludedCategories) ? staff.excludedCategories : [];
                              const exShifts = Array.isArray(staff.excludedShifts) ? staff.excludedShifts : [];
                              return (
                                <tr 
                                  key={staff.id} 
                                  className="hover:bg-gray-50 border-b cursor-grab active:cursor-grabbing"
                                  draggable
                                  onDragStart={(e) => e.dataTransfer.setData('text/plain', staff.id)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => { 
                                    e.preventDefault(); 
                                    handleSortStaff(e.dataTransfer.getData('text/plain'), staff.id); 
                                  }}
                                >
                                  <td className="p-2 border text-center text-gray-400 hover:text-gray-600">
                                    <GripVertical size={14} className="mx-auto" />
                                  </td>
                                  <td className="p-2 border font-bold text-gray-700"><div>{staff.name}</div><div className="text-[10px] text-gray-400">{staff.jobTitle}</div></td>
                                  <td className="p-2 border text-center"><button onClick={() => handleEditStaff(staff)} className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="詳細・個別シフト制限を編集"><Edit2 size={14}/></button></td>
                                  <td className="p-2 border text-center bg-red-50"><input type="checkbox" className="w-4 h-4" checked={staff.excludeFromAi || false} onChange={(e) => { const newList = [...staffList]; newList[index] = { ...staff, excludeFromAi: e.target.checked }; setStaffList(newList); }}/></td>
                                  <td className="p-2 border text-center"><input type="number" min="0" className="w-12 p-1 border rounded text-center" value={staff.maxCool3 ?? 5} onChange={(e) => { const newList = [...staffList]; newList[index] = { ...staff, maxCool3: parseInt(e.target.value) || 0 }; setStaffList(newList); }}/></td>
                                  <td className="p-2 border">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {dynamicSummaryGroups.filter(g => g.items.length > 0 && g.id !== 'me').map(group => {
                                        const isAllowed = !exCats.includes(group.id);
                                        return (
                                          <button
                                            key={group.id}
                                            type="button"
                                            onClick={() => {
                                              const nextExCats = isAllowed
                                                ? [...exCats, group.id]
                                                : exCats.filter(id => id !== group.id);
                                              const newList = [...staffList];
                                              newList[index] = { ...staff, excludedCategories: nextExCats };
                                              setStaffList(newList);
                                            }}
                                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold transition select-none ${
                                              isAllowed
                                                ? `${group.headerColor} border-current/20 shadow-xs`
                                                : 'bg-gray-100 text-gray-400 border-gray-200 line-through opacity-70'
                                            }`}
                                            title={isAllowed ? `${group.name}: AI配置OK（クリックで除外）` : `${group.name}: AI配置NG（クリックで許可）`}
                                          >
                                            {group.name}
                                          </button>
                                        );
                                      })}
                                      {exShifts.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleEditStaff(staff)}
                                          className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-300 text-[10px] font-bold hover:bg-amber-100 transition"
                                          title={`個別除外シフト: ${exShifts.map(c => shiftDefs[c]?.label || c).join('・')}（クリックで編集）`}
                                        >
                                          個別NG:{exShifts.length}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  {STAFF_SKILLS.map(skill => (<td key={skill.key} className="p-2 border text-center cursor-pointer hover:bg-blue-50" onClick={() => { const newList = [...staffList]; const currentVal = staff.skills?.[skill.key] || false; newList[index] = { ...staff, skills: { ...(staff.skills || {}), [skill.key]: !currentVal } }; setStaffList(newList); }}>{staff.skills?.[skill.key] ? <Check size={16} className="text-green-600 mx-auto"/> : <div className="w-3 h-3 mx-auto border rounded-sm border-gray-300"></div>}</td>))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex justify-end"><button onClick={() => saveAllStaffSettings(staffList)} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow">全変更を保存</button></div>
                    </div>
                  )}
                  {activeSettingsTab === 'password' && (
                    <div className="max-w-md mx-auto mt-8">
                      <h4 className="font-bold text-gray-700 border-b pb-4 mb-4">パスワード変更</h4>
                      <div className="space-y-4">
                        <div className="mb-4">
                          <label className="block text-xs font-bold text-gray-500 mb-1">変更対象</label>
                          <select className="w-full border p-2 rounded-lg" value={targetAdminKey} onChange={e => setTargetAdminKey(e.target.value)}>
                            {Object.keys(adminSettings).filter(key => adminSettings[key]?.label).map(key => (<option key={key} value={key}>{adminSettings[key].label}</option>))}
                          </select>
                        </div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">新しいパスワード</label><input type="text" className="w-full border p-2 rounded" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                        <button onClick={handleChangePassword} className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">変更を保存</button>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'data' && (
                    <div className="max-w-lg mx-auto mt-8 text-center">
                      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                        <h4 className="font-bold text-red-700 text-lg mb-2 flex items-center justify-center gap-2"><AlertTriangle/> 危険な操作エリア</h4>
                        <p className="text-sm text-red-600 mb-6">現在表示中の月（{year}年{month}月）のシフトデータを完全に削除します。<br/>この操作は取り消せません。</p>
                        {/* このボタンはヘッダーに移動しましたが、ここにも残しておきます */}
                        <button onClick={handleResetSchedule} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow flex items-center justify-center gap-2 w-full"><Eraser size={20}/> 勤務表を全消去（リセット）</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

{/* AI自動作成確認モーダル */}
        {showAutoFillModal && (
          <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowAutoFillModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-yellow-50 to-orange-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-orange-700"><Sparkles size={18}/> AI自動作成 (条件設定)</h3>
                
                {/* モデル選択リストと閉じるボタンをまとめるコンテナ */}
                <div className="flex items-center gap-3">
                  {/* AIモデルを選択するプルダウンを追加（FlashとProの切り替え用） */}
                  <select 
                    className="border border-orange-200 p-1 rounded text-xs bg-white/70 text-orange-800 focus:outline-none focus:ring-1 focus:ring-orange-400" 
                    value={aiModel} 
                    onChange={(e) => setAiModel(e.target.value)}
                  >
                    {AI_MODELS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                  
                  {/* 閉じるボタン */}
                  <button onClick={() => setShowAutoFillModal(false)}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                </div>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <p className="text-sm text-gray-600 mb-2 font-bold">以下の条件と週休ペースを守って、出勤シフトを自動で割り当てます。</p>
                <div className="mb-3 p-2.5 bg-orange-50/70 border border-orange-200 rounded-lg text-[11px] text-orange-900 space-y-0.5 leading-relaxed">
                  <div>・<strong>連勤・週休：</strong>最大<strong>{adminSettings.maxConsecutiveWorkDays || 5}連勤</strong>まで ／ 週1日の公休は<strong>空欄</strong>のまま残します</div>
                  <div>・<strong>月またぎ・3クール：</strong>前月末からの連勤引き継ぎと<strong>3クール連続配置禁止</strong>（月またぎ含む）を自動適用します</div>
                  <div>・<strong>必須スキル配置：</strong>各施設の必須スキル（<strong>リーダー等</strong>）を確保し、不足日は分散配置＋ベテラン補完します</div>
                  <div>・<strong>保護ルール：</strong><strong>個人入力分</strong>・<strong>各班管理者(HHD/エコー/オペ)入力分</strong>・既存シフトは条件に反映しつつ変更不可（ME室はAI対象外）</div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 mb-2 text-[11px] text-gray-500">
                  <span className="font-bold text-gray-700">カスタム条件リスト（AIチャットと共通）</span>
                  <span>
                    バッジタップで切替：
                    <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-red-100 text-red-700 border border-red-300 font-bold text-[10px]">絶対</span>
                    ＝最優先厳守 ／
                    <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-sky-100 text-sky-700 border border-sky-300 font-bold text-[10px]">なるべく</span>
                    ＝努力目標
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  {autoFillConditions.length === 0 && (
                    <div className="text-xs text-gray-400 text-center py-3 border border-dashed rounded-lg bg-gray-50/50">
                      カスタム条件はまだ登録されていません
                    </div>
                  )}
                  {autoFillConditions.map((condition) => {
                    const isSoft = condition.priority === 'soft';
                    return (
                      <div key={condition.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border hover:bg-gray-100 gap-1.5">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input 
                            type="checkbox" 
                            checked={condition.active} 
                            onChange={() => toggleAutoFillCondition(condition.id)} 
                            className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500 cursor-pointer shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => toggleAutoFillConditionPriority(condition.id)}
                            title="クリックで「絶対」と「なるべく」を切り替え"
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0 transition cursor-pointer ${
                              !condition.active ? 'opacity-45 ' : ''
                            }${
                              isSoft
                                ? 'bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200'
                                : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                            }`}
                          >
                            {isSoft ? 'なるべく' : '絶対'}
                          </button>
                          <span
                            onClick={() => toggleAutoFillCondition(condition.id)}
                            className={`text-xs cursor-pointer break-words ${condition.active ? 'text-gray-800 font-bold' : 'text-gray-400 line-through'}`}
                          >
                            {condition.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => editAutoFillCondition(condition.id, condition.text, condition.priority)} className="text-gray-400 hover:text-blue-500 p-1" title="再編集する">
                            <Edit2 size={14}/>
                          </button>
                          <button onClick={() => deleteAutoFillCondition(condition.id)} className="text-gray-400 hover:text-red-500 p-1" title="削除する">
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="flex gap-1.5 mb-6 items-center">
                  <button
                    type="button"
                    onClick={() => setNewConditionPriority(prev => (prev === 'soft' ? 'strict' : 'soft'))}
                    title="追加する条件の優先度（クリックで切替・初期値は「絶対」）"
                    className={`px-2 py-1.5 rounded border text-xs font-bold shrink-0 transition ${
                      newConditionPriority === 'soft'
                        ? 'bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200'
                        : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                    }`}
                  >
                    {newConditionPriority === 'soft' ? 'なるべく' : '絶対'}
                  </button>
                  <input 
                    type="text" 
                    className="flex-1 border rounded px-2 py-1.5 text-xs min-w-0" 
                    placeholder="新しい条件を追加 (例: 水曜日はAさん坂田固定)" 
                    value={newConditionText} 
                    onChange={(e) => setNewConditionText(e.target.value)}
                    onKeyDown={(e) => {
                      // 日本語入力（IME）の変換中、または変換確定のEnterキー（keyCodeが229）の場合は処理を中断します
                      if (e.keyCode === 229 || e.nativeEvent.isComposing) {
                        return;
                      }
                      // 通常のEnterキーが押された場合のみ、リストに条件を追加します
                      if (e.key === 'Enter') {
                        e.preventDefault(); // フォームが意図せず送信されるのを防ぎます
                        addAutoFillCondition();
                      }
                    }}
                  />
                  <button onClick={addAutoFillCondition} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded text-xs font-bold border border-blue-200 hover:bg-blue-100 shrink-0">追加</button>
                </div>

                <button onClick={executeAutoFill} className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg shadow hover:shadow-lg transition flex items-center justify-center gap-2">
                  <Wand2 size={18}/> 実行する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI アシスタントモーダル */}
        {showAiModal && (
          <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowAiModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col h-[85vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50 gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg flex items-center gap-2 text-indigo-800">
                    <Bot className="text-indigo-600 shrink-0"/> AIシフト相談アシスタント
                  </h3>
                  <p className="text-[11px] text-indigo-600/80 hidden sm:block">
                    相談だけでは勤務表は書き換わりません（変更案カードの「反映する」を押した時のみ適用）
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {aiMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('チャットの会話履歴をリセットしますか？（勤務表のデータは消えません）')) {
                          setAiMessages([]);
                          setExpandedProposalIds({});
                        }
                      }}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 bg-white/80 hover:bg-white border border-gray-200 rounded flex items-center gap-1 transition"
                      title="会話履歴をクリア"
                    >
                      <RotateCcw size={12} /> <span className="hidden sm:inline">リセット</span>
                    </button>
                  )}
                  <select
                    className="border border-indigo-200 p-1.5 rounded text-xs bg-white/80 text-indigo-900 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  >
                    {AI_MODELS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                  <button onClick={() => setShowAiModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {aiMessages.length === 0 && (
                  <div className="max-w-lg mx-auto mt-4 space-y-4">
                    <div className="bg-white border border-indigo-100 rounded-xl p-4 shadow-sm text-center">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-2">
                        <Sparkles size={20} />
                      </div>
                      <p className="font-bold text-gray-800 text-sm mb-1">
                        {year}年{month}月のシフト相談・作成をお手伝いします
                      </p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        「15日の木クリに誰か回せる？」「さっきの案でBさんは固定して」など、普段の言葉でやりとりできます。<br/>
                        まずは下のボタンからワンタップで相談を始めることもできます。
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {AI_QUICK_PROMPTS.map((qp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isAiLoading}
                          onClick={() => handleAiSend(qp.text)}
                          className="text-left p-3 bg-white hover:bg-indigo-50/70 border border-gray-200 hover:border-indigo-300 rounded-xl shadow-sm transition group"
                        >
                          <div className="text-xs font-bold text-indigo-700 group-hover:text-indigo-800 mb-0.5">
                            {qp.label}
                          </div>
                          <div className="text-[11px] text-gray-500 line-clamp-2">
                            {qp.text}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiMessages.map((msg, idx) => {
                  const msgKey = msg.id || idx;
                  const isLastModelMsg = msg.role === 'model' && idx === aiMessages.length - 1;
                  const changes = Array.isArray(msg.proposedChanges) ? msg.proposedChanges : [];
                  const isExpanded = !!expandedProposalIds[msgKey];
                  const visibleChanges = isExpanded ? changes : changes.slice(0, 10);
                  const staffReqConflictCount = changes.filter(c => c.hasStaffRequest).length;
                  const restrictedShiftCount = changes.filter(c => c.isRestrictedShift).length;

                  if (msg.role === 'user') {
                    return (
                      <div key={msgKey} className="flex flex-col items-end gap-1">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap bg-indigo-600 text-white shadow-sm">
                          {msg.text}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveMessageAsRule(msg.id, msg.text)}
                          disabled={msg.savedAsRule}
                          className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 transition ${
                            msg.savedAsRule
                              ? 'text-emerald-600 bg-emerald-50 border border-emerald-200 cursor-default'
                              : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                          }`}
                          title="この発言を「AI自動作成」の条件リストにも追加します"
                        >
                          {msg.savedAsRule ? (
                            <>
                              <Check size={10} /> 自動作成条件に保存済
                            </>
                          ) : (
                            <>
                              <Plus size={10} /> 自動作成の条件にも保存
                            </>
                          )}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={msgKey} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot size={16} />
                      </div>
                      <div className="flex-1 min-w-0 max-w-[90%] space-y-2">
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm p-3.5 text-sm text-gray-800 shadow-sm whitespace-pre-wrap leading-relaxed">
                          {msg.text}

                          {/* 案A: シフト変更案プレビュー＆承認カード */}
                          {changes.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 whitespace-normal">
                              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3 space-y-2.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-indigo-600 shrink-0" />
                                    <span>シフト変更案（{changes.length}箇所）</span>
                                  </div>
                                  {msg.status === 'applied' ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                      ✅ 反映済み
                                    </span>
                                  ) : msg.status === 'reverted' ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                      ↩ 元に戻しました
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                      未反映（確認待ち）
                                    </span>
                                  )}
                                </div>

                                {staffReqConflictCount > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] bg-pink-50 border border-pink-200 text-pink-800 rounded-lg px-2.5 py-1.5">
                                    <AlertTriangle size={13} className="text-pink-600 shrink-0 mt-0.5" />
                                    <span>
                                      スタッフ本人の希望箇所に対する変更が <strong>{staffReqConflictCount}件</strong> 含まれています（希望履歴自体は裏側で保持されます）。
                                    </span>
                                  </div>
                                )}

                                {restrictedShiftCount > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5">
                                    <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                                    <span>
                                      職員の「配置制限」外・「ME室(L/G)」・または「3クール連続」に関する変更が <strong>{restrictedShiftCount}件</strong> 含まれています（特例でない場合はご注意ください）。
                                    </span>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                                  {visibleChanges.map((item, cIdx) => (
                                    <div
                                      key={`${item.staffId}_${item.day}_${item.kind}_${cIdx}`}
                                      className={`flex items-center justify-between gap-1.5 bg-white border rounded-lg px-2.5 py-1.5 text-xs ${
                                        item.hasStaffRequest
                                          ? 'border-pink-300'
                                          : item.isRestrictedShift
                                            ? 'border-amber-300'
                                            : 'border-gray-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-bold text-gray-600 shrink-0">
                                          {month}/{item.day}({item.dowLabel})
                                        </span>
                                        <span className="font-bold text-gray-800 truncate">
                                          {item.staffName}
                                        </span>
                                        {item.kind === 'task' && (
                                          <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500 shrink-0">
                                            タスク
                                          </span>
                                        )}
                                        {item.hasStaffRequest && (
                                          <span
                                            className="text-[9px] px-1 rounded bg-pink-100 text-pink-700 font-bold shrink-0"
                                            title={`本人希望: ${item.staffRequestLabel}`}
                                          >
                                            希:{item.staffRequestLabel}
                                          </span>
                                        )}
                                        {item.isRestrictedShift && (
                                          <span
                                            className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 font-bold shrink-0"
                                            title={
                                              item.isMeTouch
                                                ? 'ME室(L/G)は通常OPE班管理のためAI対象外です'
                                                : item.isConsecutiveCool3
                                                  ? '前日または翌日（前月最終日含む）と3クールが連続しています'
                                                  : 'この職員のAI配置制限外のシフトです'
                                            }
                                          >
                                            {item.isMeTouch ? 'ME室' : item.isConsecutiveCool3 ? '3ｸｰﾙ連続' : '制限外'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0 font-bold">
                                        <span className="text-gray-400 text-[11px]">{item.beforeLabel}</span>
                                        <span className="text-gray-400 text-[10px]">→</span>
                                        <span className={`px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 ${item.afterTextClass}`}>
                                          {item.afterLabel}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {changes.length > 10 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedProposalIds(prev => ({
                                        ...prev,
                                        [msgKey]: !prev[msgKey],
                                      }))
                                    }
                                    className="w-full text-center text-[11px] font-bold text-indigo-600 hover:text-indigo-800 py-1"
                                  >
                                    {isExpanded ? '▲ 表示を折りたたむ' : `▼ 他 ${changes.length - 10} 箇所をすべて表示する`}
                                  </button>
                                )}

                                <div className="pt-1 flex items-center justify-end gap-2">
                                  {msg.status === 'applied' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUndoAiProposal(msg.id)}
                                      className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-sm"
                                    >
                                      <RotateCcw size={13} /> 元に戻す
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleApplyAiProposal(msg.id)}
                                      className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
                                    >
                                      <Check size={15} />
                                      <span>
                                        {msg.status === 'reverted'
                                          ? `もう一度勤務表に反映する（${changes.length}箇所）`
                                          : `この変更案を勤務表に反映する（${changes.length}箇所）`}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* AIからのワンタップ返答候補チップ */}
                        {isLastModelMsg && !isAiLoading && Array.isArray(msg.quickReplies) && msg.quickReplies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {msg.quickReplies.map((qr, qIdx) => (
                              <button
                                key={qIdx}
                                type="button"
                                onClick={() => handleAiSend(qr)}
                                className="px-3 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-medium transition shadow-sm"
                              >
                                {qr}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isAiLoading && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Bot size={16} />
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="animate-spin text-indigo-500" size={16}/>
                      <span>勤務表と条件を確認しながら考えています...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-3 sm:p-4 border-t bg-white space-y-2">
                {aiMessages.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {AI_QUICK_PROMPTS.map((qp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isAiLoading}
                        onClick={() => handleAiSend(qp.text)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 rounded-full text-[11px] font-medium whitespace-nowrap transition shrink-0 disabled:opacity-50"
                      >
                        {qp.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={2}
                    className="flex-1 border rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none transition resize-none"
                    placeholder="相談や指示を入力（例: 15日の木クリに誰か回せる？ / さっきの案でお願い）※Shift+Enterで改行"
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.keyCode === 229 || e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAiSend();
                      }
                    }}
                  />
                  <button
                    onClick={() => handleAiSend()}
                    disabled={isAiLoading || !aiInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center shrink-0 h-10"
                    title="送信"
                  >
                    <Send size={18}/>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* スタッフ詳細（サブモーダル） (z-index 110) */}
        {showStaffModal && (
          <div className="absolute inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18}/> 職員情報</h3>
                <button onClick={() => setShowStaffModal(false)}><X size={20} className="text-gray-400"/></button>
              </div>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">ログインID <span className="text-red-500">*</span></label><input type="text" className="w-full border p-2 rounded text-sm" value={targetStaff.loginId || ''} onChange={e => setTargetStaff({...targetStaff, loginId: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">役職</label><select className="w-full border p-2 rounded text-sm" value={targetStaff.jobTitle || '一般'} onChange={e => setTargetStaff({...targetStaff, jobTitle: e.target.value})}>{JOB_TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                </div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">名前</label><input type="text" className="w-full border p-2 rounded text-sm" value={targetStaff.name || ''} onChange={e => setTargetStaff({...targetStaff, name: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">ロール（班）</label><div className="flex flex-wrap gap-3">{STAFF_ROLES.map(r => (<label key={r} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={targetStaff.roles?.includes(r)} onChange={() => { const roles = targetStaff.roles?.includes(r) ? targetStaff.roles.filter(x=>x!==r) : [...(targetStaff.roles||[]), r]; setTargetStaff({...targetStaff, roles}); }}/> <span className="text-sm">{r}</span></label>))}</div></div>

                {/* Step 1: AI配置可能な施設・個別シフト制限（B案） */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                      <ListFilter size={13} className="text-blue-600" />
                      AI配置可能な施設・シフト制限
                    </label>
                    {((targetStaff.excludedCategories?.length || 0) > 0 || (targetStaff.excludedShifts?.length || 0) > 0) && (
                      <button
                        type="button"
                        onClick={() => setTargetStaff({ ...targetStaff, excludedCategories: [], excludedShifts: [] })}
                        className="text-[10px] text-blue-600 hover:underline font-bold"
                      >
                        すべて許可に戻す
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">
                    ※AI作成・提案時のみ適用されます（管理者の手動入力時は全シフト選べます。ME室は常時AI対象外）。
                  </p>

                  <div className="bg-gray-50 border rounded-lg p-3 space-y-2.5">
                    <div className="text-[11px] font-bold text-gray-600">配置可能な施設（チェックを外すとAI配置対象外）</div>
                    <div className="flex flex-wrap gap-2">
                      {dynamicSummaryGroups.filter(g => g.items.length > 0 && g.id !== 'me').map(group => {
                        const exCats = Array.isArray(targetStaff.excludedCategories) ? targetStaff.excludedCategories : [];
                        const isAllowed = !exCats.includes(group.id);
                        return (
                          <label
                            key={group.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer select-none transition ${
                              isAllowed
                                ? 'bg-white border-blue-400 text-gray-800 ring-1 ring-blue-300 shadow-xs'
                                : 'bg-gray-100 border-gray-200 text-gray-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 text-blue-600 rounded"
                              checked={isAllowed}
                              onChange={() => {
                                const nextExCats = isAllowed
                                  ? [...exCats, group.id]
                                  : exCats.filter(id => id !== group.id);
                                setTargetStaff({ ...targetStaff, excludedCategories: nextExCats });
                              }}
                            />
                            <span>{group.name}</span>
                          </label>
                        );
                      })}
                    </div>

                    {/* B案: 折りたたみ式の個別シフトOFF設定 */}
                    <div className="pt-1 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={() => setShowStaffShiftDetailRestriction(prev => !prev)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1"
                      >
                        <span>{showStaffShiftDetailRestriction ? '▼' : '▶'} 個別シフト単位で細かく制限する（2クール不可など）</span>
                        {(targetStaff.excludedShifts?.length || 0) > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">
                            除外 {targetStaff.excludedShifts.length}件
                          </span>
                        )}
                      </button>

                      {showStaffShiftDetailRestriction && (
                        <div className="mt-2 space-y-2.5 bg-white border rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-400">
                            チェックを外したシフトにはAIが割り振りません（例：坂田は行けるが「坂2」「坂3」は外して「坂日」のみにする等）。
                          </p>
                          {dynamicSummaryGroups.filter(g => g.items.length > 0 && g.id !== 'me').map(group => {
                            const exCats = Array.isArray(targetStaff.excludedCategories) ? targetStaff.excludedCategories : [];
                            const exShifts = Array.isArray(targetStaff.excludedShifts) ? targetStaff.excludedShifts : [];
                            const isCatDisabled = exCats.includes(group.id);
                            return (
                              <div key={group.id} className={isCatDisabled ? 'opacity-45' : ''}>
                                <div className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1.5">
                                  <span className={`px-1.5 py-0.5 rounded ${group.headerColor}`}>{group.name}</span>
                                  {isCatDisabled && <span className="text-red-500">（施設ごとOFF）</span>}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {group.items.map(code => {
                                    const sDef = shiftDefs[code];
                                    if (!sDef) return null;
                                    const isShiftChecked = !exShifts.includes(code);
                                    return (
                                      <label
                                        key={code}
                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs select-none transition ${
                                          isCatDisabled
                                            ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                            : isShiftChecked
                                              ? 'bg-blue-50/60 border-blue-300 cursor-pointer'
                                              : 'bg-gray-100 border-gray-200 text-gray-400 line-through cursor-pointer'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          disabled={isCatDisabled}
                                          checked={isShiftChecked}
                                          onChange={() => {
                                            const nextExShifts = isShiftChecked
                                              ? [...exShifts, code]
                                              : exShifts.filter(c => c !== code);
                                            setTargetStaff({ ...targetStaff, excludedShifts: nextExShifts });
                                          }}
                                          className="w-3 h-3 text-blue-600 rounded"
                                        />
                                        <span className={`font-bold ${isShiftChecked && !isCatDisabled ? sDef.text : 'text-gray-400'}`}>
                                          {sDef.label}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div><label className="block text-xs font-bold text-gray-500 mb-1">パスワード</label><input type="text" className="w-full border p-2 rounded text-sm" value={targetStaff.password || ''} onChange={e => setTargetStaff({...targetStaff, password: e.target.value})} /></div>
                <div className="pt-2"><button onClick={saveStaff} className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">保存</button></div>
                {targetStaff.id && <button onClick={() => { removeStaff(targetStaff.id); setShowStaffModal(false); }} className="w-full py-2 text-red-500 text-xs hover:underline">この職員を削除</button>}
              </div>
            </div>
          </div>
        )}

        {/* パスワード変更モーダル（職員用含む） (z-index 120) */}
        {showPasswordChangeModal && (
          <div className="absolute inset-0 bg-black/50 z-[120] flex items-center justify-center p-4" onClick={() => setShowPasswordChangeModal(false)}>
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Key size={18}/> パスワード変更</h3>
                 <button onClick={() => setShowPasswordChangeModal(false)}><X size={20} className="text-gray-400"/></button>
               </div>
               <div className="p-6">
                 {appUser.role === 'admin' ? (
                   <div className="mb-4">
                     <label className="block text-xs font-bold text-gray-500 mb-1">変更対象</label>
                     <select 
                       className="w-full border p-2 rounded-lg"
                       value={targetAdminKey}
                       onChange={e => setTargetAdminKey(e.target.value)}
                     >
                       {Object.keys(adminSettings)
                         .filter(key => adminSettings[key]?.label)
                         .map(key => (
                           <option key={key} value={key}>{adminSettings[key].label}</option>
                         ))}
                     </select>
                   </div>
                 ) : (
                   <p className="mb-4 text-sm text-gray-600">
                     <b>{appUser.name}</b> さんのログインパスワードを変更します。
                   </p>
                 )}
                 <label className="block text-xs font-bold text-gray-500 mb-1">新しいパスワード</label>
                 <input type="text" className="w-full border p-2 rounded" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus />
               </div>
               <div className="p-4 border-t flex justify-end gap-2">
                 <button onClick={handleChangePassword} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">変更する</button>
               </div>
             </div>
          </div>
        )}

        {/* 必要人数設定モーダル (z-index 100) */}
        {showTargetCountModal && (
          <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18}/> 必要人数設定</h3>
                 <button onClick={() => setShowTargetCountModal(false)}><X size={20} className="text-gray-400"/></button>
               </div>
               <div className="p-4 overflow-y-auto">
                 <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                   各シフト・曜日ごとの必要人数と、施設ごとの必須スキル最低人数を設定してください。<br/>
                   ※人数不足は<strong className="text-red-600">赤色</strong>、人数は足りているが必須スキル（リーダー等）が不足している日は集計欄が<strong className="text-amber-700">オレンジ色（⚠）</strong>で表示されます。
                 </p>
                 <div className="space-y-6">
                   {dynamicSummaryGroups.map(group => (
                     <div key={group.id} className="border rounded-lg overflow-hidden">
                       <div className={`px-4 py-2 font-bold text-sm flex flex-wrap items-center justify-between gap-2 ${group.headerColor}`}>
                         <span>{group.name}</span>
                         {group.id === 'me' && (
                           <span className="text-[11px] font-normal opacity-90">
                             ※祝日・外来休診日は自動的に G:1名 / L:0名 として判定（AI自動入力対象外）
                           </span>
                         )}
                       </div>
                       <table className="w-full text-center text-xs border-collapse">
                         <thead><tr className="bg-gray-100 text-gray-600"><th className="p-2 border text-left w-32">シフト</th>{group.id === 'jinkuri' ? (<><th className="p-2 border w-24">月・水・金</th><th className="p-2 border w-24">火・木・土</th></>) : (<th className="p-2 border w-32">通常 (月～土)</th>)}</tr></thead>
                         <tbody>
                           {group.items.map(code => {
                             const shift = shiftDefs[code];
                             const val1 = targetCounts[code]?.[1] ?? 0;
                             const val2 = targetCounts[code]?.[2] ?? 0;
                             return (
                               <tr key={code} className="border-b last:border-b-0">
                                 <td className="p-2 border text-left font-bold text-gray-700"><span className={shift.text}>{shift.label}</span></td>
                                 {group.id === 'jinkuri' ? (
                                   <>
                                     <td className="p-1 border"><input type="number" min="0" className="w-16 p-1 border rounded text-center" value={val1} onChange={(e) => { const v = parseInt(e.target.value) || 0; setTargetCounts(prev => ({ ...prev, [code]: { ...(prev[code] || {}), 1:v, 3:v, 5:v } })); }} /></td>
                                     <td className="p-1 border"><input type="number" min="0" className="w-16 p-1 border rounded text-center" value={val2} onChange={(e) => { const v = parseInt(e.target.value) || 0; setTargetCounts(prev => ({ ...prev, [code]: { ...(prev[code] || {}), 2:v, 4:v, 6:v } })); }} /></td>
                                   </>
                                 ) : (
                                   <td className="p-1 border"><input type="number" min="0" className="w-16 p-1 border rounded text-center" value={val1} onChange={(e) => { const v = parseInt(e.target.value) || 0; setTargetCounts(prev => ({ ...prev, [code]: { ...(prev[code] || {}), 1:v, 2:v, 3:v, 4:v, 5:v, 6:v } })); }} /></td>
                                 )}
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                       {group.id !== 'me' && (
                         <div className="bg-amber-50/50 border-t px-3 py-2.5">
                           <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                             <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                               <ShieldCheck size={14} className="text-amber-600" />
                               必須スキル最低人数（月〜土・AI配置＆集計チェック）
                             </span>
                             <span className="text-[10px] text-amber-700">
                               ※0名の項目はチェックなし（揃わない日は分散配置＋ベテラン補完しオレンジ⚠表示）
                             </span>
                           </div>
                           <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                             {STAFF_SKILLS.map(sk => {
                               const reqVal = getFacilitySkillTarget(group.id, sk.key);
                               return (
                                 <label
                                   key={sk.key}
                                   className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded border text-xs ${
                                     reqVal > 0
                                       ? 'bg-white border-amber-400 text-amber-900 font-bold'
                                       : 'bg-white/70 border-gray-200 text-gray-600'
                                   }`}
                                 >
                                   <span className="truncate">{sk.label}</span>
                                   <div className="flex items-center gap-0.5 shrink-0">
                                     <input
                                       type="number"
                                       min="0"
                                       max="5"
                                       className="w-11 p-0.5 border rounded text-center text-xs font-bold"
                                       value={reqVal}
                                       onChange={(e) => {
                                         const nextNum = Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0));
                                         setAdminSettings(prev => {
                                           const baseTargets = prev.facilitySkillTargets || DEFAULT_FACILITY_SKILL_TARGETS;
                                           const currentCatTargets = {
                                             ...(DEFAULT_FACILITY_SKILL_TARGETS[group.id] || {}),
                                             ...(baseTargets[group.id] || {}),
                                             [sk.key]: nextNum,
                                           };
                                           return {
                                             ...prev,
                                             facilitySkillTargets: {
                                               ...DEFAULT_FACILITY_SKILL_TARGETS,
                                               ...baseTargets,
                                               [group.id]: currentCatTargets,
                                             },
                                           };
                                         });
                                       }}
                                     />
                                     <span className="text-[10px] text-gray-500">名</span>
                                   </div>
                                 </label>
                               );
                             })}
                           </div>
                         </div>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
               <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
                 <button onClick={() => setShowTargetCountModal(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-bold">キャンセル</button>
                 <button onClick={saveTargetCounts} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">保存する</button>
               </div>
            </div>
          </div>
        )}

        {confirmModal.isOpen && (
          <div className="absolute inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><AlertTriangle size={18} className="text-red-500"/> {confirmModal.title}</h3>
                 <button onClick={() => setConfirmModal({...confirmModal, isOpen: false})}><X size={20} className="text-gray-400"/></button>
               </div>
               <div className="p-6">
                 <p className="text-sm text-gray-700 font-bold whitespace-pre-wrap">{confirmModal.message}</p>
               </div>
               <div className="p-4 border-t flex justify-end gap-2">
                 <button onClick={() => setConfirmModal({...confirmModal, isOpen: false})} className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-bold">キャンセル</button>
                 <button onClick={() => { confirmModal.onConfirm(); setConfirmModal({...confirmModal, isOpen: false}); }} className="px-4 py-2 bg-red-600 text-white rounded font-bold">実行する</button>
               </div>
            </div>
          </div>
        )}

        {isAiLoading && !showAiModal && (
          <div className="fixed inset-0 bg-black/60 z-[150] flex flex-col items-center justify-center text-white p-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
            <p className="text-lg font-bold">AIがシフトを作成中...</p>
            <p className="text-sm mt-2 text-gray-200 text-center">
              複雑な条件を計算しています。<br/>最大1分ほどかかります。
            </p>
            
            {/* プログレスバーのUI */}
            <div className="w-64 bg-gray-700 rounded-full h-2.5 mt-6 overflow-hidden border border-gray-600">
              <div 
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${aiProgress}%` }}
              ></div>
            </div>
            <p className="mt-2 text-sm font-semibold">{aiProgress}%</p>
          </div>
        )}
        {/* ↑↑↑ ここまで追加 ↑↑↑ */}

      </div>
    </div>
  );
}