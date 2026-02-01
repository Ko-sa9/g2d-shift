import React, { useState, useEffect, useMemo } from 'react';
import { Save, Trash2, Plus, ChevronLeft, ChevronRight, Calculator, Sparkles, MessageSquare, X, Send, Loader2, Edit2, Check, RotateCcw, AlertTriangle, User, LogOut, Calendar as CalendarIcon, Lock, Users, Clock, Key, GripVertical, Settings, ShieldCheck, Activity, Zap, Heart, Star, ListFilter, Eraser, Palette, ArrowUp, ArrowDown } from 'lucide-react';
import { auth, db, appId } from './firebase'; 
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, collection, setDoc, onSnapshot } from 'firebase/firestore';

// Gemini API Key
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

// ------------------------------------------------------------------
// 定数・初期設定
// ------------------------------------------------------------------

// 管理者ログイン時のパスワードと表示モードの対応設定
const ADMIN_VIEW_PASSWORDS = {
  'admin': 'all',        // 全体
  'admin-ope': 'ope',    // オペ班
  'admin-echo': 'echo',  // エコー班
  'admin-hhd': 'hhd',    // HHD班
};

// 初期のカテゴリ定義（DBがない場合に使用）
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

// スキル評価項目の定義
const STAFF_SKILLS = [
  { key: 'isLeader', label: 'リーダー', icon: ShieldCheck, desc: '責任者・指示出し' },
  { key: 'canEcho', label: 'エコー', icon: Activity, desc: '難渋例の穿刺' },
  { key: 'canMachine', label: '機器', icon: Zap, desc: 'トラブル対応' },
  { key: 'canFollow', label: 'フォロー', icon: Heart, desc: '自発的ヘルプ' },
  { key: 'isVeteran', label: 'ベテラン', icon: Star, desc: '5年以上・指導役' },
];

// カラーパレット
const COLOR_OPTIONS = [
  { value: 'text-gray-800', label: '黒' },
  { value: 'text-red-600', label: '赤' },
  { value: 'text-blue-600', label: '青' },
  { value: 'text-green-600', label: '緑' },
  { value: 'text-yellow-600', label: '黄' },
  { value: 'text-purple-600', label: '紫' },
  { value: 'text-pink-600', label: 'ピンク' },
  { value: 'text-orange-600', label: 'オレンジ' },
];

const BG_COLOR_OPTIONS = [
  { value: 'bg-gray-50 text-gray-800', label: 'グレー' },
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

// AIモデルの定義
const AI_MODELS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (高速・推奨)' },
  { value: 'gemini-2.0-pro-exp-02-05', label: 'Gemini 2.0 Pro (高性能・実験的)' },
];

const INITIAL_STAFF = [
  { id: '1', loginId: '1', name: '職員A', jobTitle: '副技士長', roles: ['オペ班'], skills: { isLeader: true, isVeteran: true }, password: '1234', maxCool3: 5 },
  { id: '2', loginId: '2', name: '職員B', jobTitle: '主任', roles: ['エコー班'], skills: { isLeader: true, canEcho: true }, password: '1234', maxCool3: 5 },
  { id: '3', loginId: '3', name: '職員C', jobTitle: '一般', roles: [], skills: { canMachine: true }, password: '1234', maxCool3: 5 },
  { id: '4', loginId: '4', name: '職員D', jobTitle: '一般', roles: [], skills: { canFollow: true }, password: '1234', maxCool3: 5 },
  { id: '5', loginId: '5', name: '職員E', jobTitle: '一般', roles: [], skills: {}, password: '1234', maxCool3: 5 },
  { id: '6', loginId: '6', name: '職員F', jobTitle: 'パート', roles: [], skills: {}, password: '1234', maxCool3: 0, excludeFromAi: true },
];

// 管理者設定の初期値
const DEFAULT_ADMIN_SETTINGS = {
  'all':   { password: 'admin',       label: '全体管理者' },
  'ope':   { password: 'admin-ope',   label: 'オペ班管理者' }, 
  'echo':  { password: 'admin-echo',  label: 'エコー班管理者' },
  'hhd':   { password: 'admin-hhd',   label: 'HHD班管理者' },
};

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

const HOLIDAY_CACHE = {};
const isHoliday = (year, month, day) => {
  if (!HOLIDAY_CACHE[year]) {
    HOLIDAY_CACHE[year] = getHolidaysForYear(year);
  }
  const date = new Date(year, month - 1, day);
  return !!HOLIDAY_CACHE[year][date.getTime()];
};

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
const getDayOfWeek = (year, month, day) => new Date(year, month - 1, day).getDay();
const isSunday = (year, month, day) => getDayOfWeek(year, month, day) === 0;
const getDayColor = (year, month, day) => {
  const dow = getDayOfWeek(year, month, day);
  if (isHoliday(year, month, day)) return 'text-red-500 bg-red-50';
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

const callGemini = async (prompt, systemInstruction = "", model = "gemini-2.0-flash") => {
  console.log("API Key Status:", apiKey ? "Loaded (文字数:" + apiKey.length + ")" : "Not Loaded", "Model:", model);
  if (!apiKey) {
    return "⚠️ エラー: APIキーが設定されていません。\n.envファイルを作成し、VITE_GEMINI_API_KEYを設定してください。";
  }

  try {
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
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Gemini API Error Detail:", errorData);
        const errorMsg = errorData.error?.message || response.statusText;
        throw new Error(`${response.status} ${errorMsg}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
  } catch (error) {
    console.error("Gemini Error:", error);
    return `⚠️ エラー: AIの呼び出しに失敗しました。\n詳細: ${error.message}\n\n※APIキーが有効か、Google CloudでGemini APIが有効化されているか確認してください。`;
  }
};

const LoginScreen = ({ onLogin, staffList, adminSettings = DEFAULT_ADMIN_SETTINGS }) => {
  const [selectedRole, setSelectedRole] = useState('staff');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (selectedRole === 'admin') {
      const foundViewKey = Object.keys(adminSettings).find(key => adminSettings[key].password === password);
      
      if (foundViewKey) {
        onLogin({ role: 'admin', name: '管理者', initialView: foundViewKey });
      } else {
        setError('パスワードが違います (初期: admin)');
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
        setError('パスワードが違います (初期: 1234)');
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
          <button onClick={handleLogin} className={`w-full py-3 rounded-lg font-bold text-white shadow transition transform active:scale-95 ${selectedRole === 'admin' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>ログイン</button>
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
  
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [staffList, setStaffList] = useState([]);
  const [shiftDefs, setShiftDefs] = useState(DEFAULT_SHIFT_TYPES);
  const [categoryDefs, setCategoryDefs] = useState(DEFAULT_CATEGORY_DEFS); // カテゴリ定義をState管理に変更
  const [adminSettings, setAdminSettings] = useState(DEFAULT_ADMIN_SETTINGS); 
  const [targetCounts, setTargetCounts] = useState({});

  const [shiftData, setShiftData] = useState({});
  const [taskData, setTaskData] = useState({});
  
  const [activePopup, setActivePopup] = useState(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showShiftEditModal, setShowShiftEditModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [showStaffSettingsModal, setShowStaffSettingsModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false); // カテゴリ編集モーダル
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null, title: '確認' });
  const [showTargetCountModal, setShowTargetCountModal] = useState(false);
  
  const [viewMode, setViewMode] = useState('personal'); 
  const [currentView, setCurrentView] = useState('all'); 

  const [targetAdminKey, setTargetAdminKey] = useState('all');

  const [editingShift, setEditingShift] = useState(null);
  const [targetStaff, setTargetStaff] = useState(null);
  const [targetCategory, setTargetCategory] = useState(null); // 編集中のカテゴリ
  const [newPassword, setNewPassword] = useState('');
  
  // AI関連のステート
  const [aiMode, setAiMode] = useState('chat');
  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiModel, setAiModel] = useState('gemini-2.0-flash'); 

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
          excludeFromAi: s.excludeFromAi || false 
        }));

        setStaffList(loadedStaffList);
        setShiftDefs(data.shiftDefs || DEFAULT_SHIFT_TYPES);
        setCategoryDefs(data.categoryDefs || DEFAULT_CATEGORY_DEFS); // カテゴリ定義の読み込み
        setTargetCounts(data.targetCounts || {});
        
        let loadedAdminSettings = data.adminSettings || DEFAULT_ADMIN_SETTINGS;
        if (loadedAdminSettings['opera']) {
           const { opera, ...rest } = loadedAdminSettings;
           loadedAdminSettings = { ...rest, 'ope': opera };
        }
        setAdminSettings(loadedAdminSettings);
      } else {
        // 初期データ保存
        setDoc(masterDocRef, { 
          staffList: INITIAL_STAFF, 
          shiftDefs: DEFAULT_SHIFT_TYPES, 
          categoryDefs: DEFAULT_CATEGORY_DEFS,
          adminSettings: DEFAULT_ADMIN_SETTINGS, 
          targetCounts: {} 
        });
        setStaffList(INITIAL_STAFF);
        setCategoryDefs(DEFAULT_CATEGORY_DEFS);
        setAdminSettings(DEFAULT_ADMIN_SETTINGS);
        setTargetCounts({});
      }
    });
    const scheduleId = `schedule_${year}_${month}`;
    const scheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
    const unsubSchedule = onSnapshot(scheduleDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setShiftData(data.shifts || {});
        setTaskData(data.tasks || {});
      } else {
        setShiftData({});
        setTaskData({});
      }
    });
    return () => {
      unsubMaster();
      unsubSchedule();
    };
  }, [authUser, year, month]);

  const saveSchedule = async (newShifts, newTasks) => {
    if (!authUser) return;
    const scheduleId = `schedule_${year}_${month}`;
    const scheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
    await setDoc(scheduleDocRef, { shifts: newShifts, tasks: newTasks }, { merge: true });
  };

  const saveMasterData = async (list = staffList, defs = shiftDefs, cats = categoryDefs, settings = adminSettings, targets = targetCounts) => {
    if (!authUser) return;
    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'general', 'masterData');
    await setDoc(masterDocRef, { 
      staffList: list, 
      shiftDefs: defs, 
      categoryDefs: cats,
      adminSettings: settings,
      targetCounts: targets
    }, { merge: true });
  };

  const handleUpdateCell = (staffId, day, toolCode, type = 'shift') => {
    if (appUser.role === 'staff') {
      if (staffId !== appUser.id) return; 
      if (currentView === 'ope') {
        if (toolCode && toolCode !== 'L' && toolCode !== 'G') {
           alert('オペ班ページではLとGのみ入力可能です。');
           return;
        }
      } else {
        const tool = shiftDefs[toolCode];
        const isAllowed = !toolCode || (tool && (tool.category === 'req' || tool.category === 'off'));
        if (!isAllowed) {
          alert('職員モードでは「希望」「休み」のみ入力できます。');
          return;
        }
      }
    }
    if (type === 'shift') {
      const nextShifts = { ...shiftData };
      if (!nextShifts[staffId]) nextShifts[staffId] = {};
      if (toolCode) {
        nextShifts[staffId][day] = toolCode;
      } else {
        delete nextShifts[staffId][day];
      }
      setShiftData(nextShifts);
      saveSchedule(nextShifts, taskData);
    } else {
      const nextTasks = { ...taskData };
      if (!nextTasks[staffId]) nextTasks[staffId] = {};
      if (toolCode) {
        nextTasks[staffId][day] = toolCode;
      } else {
        delete nextTasks[staffId][day];
      }
      setTaskData(nextTasks);
      saveSchedule(shiftData, nextTasks);
    }
  };

  const handleCellClick = (e, staffId, day, type) => {
    if (isSunday(year, month, day)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 270);
    const top = Math.min(rect.bottom + window.scrollY, window.innerHeight + window.scrollY - 150);
    setActivePopup({
      staffId,
      day,
      type,
      x: left,
      y: top,
    });
  };

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
      saveMasterData(staffList, shiftDefs, categoryDefs, newSettings, targetCounts);
      alert(`${newSettings[targetAdminKey].label}のパスワードを変更しました。`);
    } else {
      const newList = staffList.map(s => s.id === appUser.id ? { ...s, password: newPassword } : s);
      setStaffList(newList);
      saveMasterData(newList, shiftDefs, categoryDefs, adminSettings, targetCounts);
      alert('パスワードを変更しました。次回ログイン時から有効です。');
    }
    
    setShowPasswordChangeModal(false);
    setNewPassword('');
  };

  const handleAddStaff = () => {
    setTargetStaff({ id: null, loginId: '', name: '', jobTitle: '一般', roles: [], skills: {}, maxCool3: 5, excludeFromAi: false });
    setShowStaffModal(true);
  };

  const handleEditStaff = (staff) => {
    setTargetStaff({ 
      ...staff, 
      skills: staff.skills || {}, 
      maxCool3: staff.maxCool3 !== undefined ? staff.maxCool3 : 5,
      excludeFromAi: staff.excludeFromAi || false
    });
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
    saveMasterData(newList);
    alert('保存しました。');
  };

  const saveAllStaffSettings = (updatedStaffList) => {
    setStaffList(updatedStaffList);
    saveMasterData(updatedStaffList);
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
        saveMasterData(newList);
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
    saveMasterData(newStaffList);
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
       // 既存シフトのカテゴリIDも更新する必要があるかも（今回は簡易実装）
    }

    newDefs[targetCategory.id] = {
      id: targetCategory.id,
      label: targetCategory.label,
      color: targetCategory.color,
      order: targetCategory.order
    };
    
    setCategoryDefs(newDefs);
    saveMasterData(staffList, shiftDefs, newDefs);
    setTargetCategory(null);
  };

  const deleteCategory = (catId) => {
    // 使用中のシフトがあるか確認
    const isUsed = Object.values(shiftDefs).some(s => s.category === catId);
    if (isUsed) {
      alert('このカテゴリを使用しているシフトがあるため削除できません。\n先にシフト設定を変更してください。');
      return;
    }
    const newDefs = { ...categoryDefs };
    delete newDefs[catId];
    setCategoryDefs(newDefs);
    saveMasterData(staffList, shiftDefs, newDefs);
  };

  const moveCategoryOrder = (catId, direction) => {
    const sortedCats = Object.values(categoryDefs).sort((a,b) => a.order - b.order);
    const index = sortedCats.findIndex(c => c.id === catId);
    if (index === -1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedCats.length) return;

    const swapCat = sortedCats[targetIndex];
    const currentCat = sortedCats[index];
    
    const newDefs = { ...categoryDefs };
    newDefs[currentCat.id].order = swapCat.order;
    newDefs[swapCat.id].order = currentCat.order;
    
    setCategoryDefs(newDefs);
    saveMasterData(staffList, shiftDefs, newDefs);
  };


  const handleAddNewShift = () => {
    setEditingShift({ code: '', label: '', color: 'bg-transparent', text: 'text-gray-800', startTime: '', endTime: '', overtime: '', time: '', category: 'saka', type: 'shift', originalCode: null });
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
    saveMasterData(staffList, newDefs);
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
        saveMasterData(staffList, newDefs);
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
    saveMasterData(staffList, newDefs);
  };

  const saveTargetCounts = () => {
    saveMasterData(staffList, shiftDefs, categoryDefs, adminSettings, targetCounts);
    alert('必要人数設定を保存しました');
    setShowTargetCountModal(false);
  };

  const handleResetSchedule = () => {
    setConfirmModal({
      isOpen: true,
      title: '勤務表の全消去',
      message: `${year}年${month}月のシフトとタスクを全て削除しますか？\nこの操作は取り消せません。`,
      onConfirm: () => {
        setShiftData({});
        setTaskData({});
        saveSchedule({}, {});
        alert('全てのシフトデータをリセットしました。');
      }
    });
  };

  const prepareScheduleDataForAi = () => ({
    year, month,
    staff: staffList.map(s => ({ 
      id: s.id, 
      name: s.name, 
      jobTitle: s.jobTitle, 
      roles: s.roles,
      skills: s.skills,
      maxCool3: s.maxCool3, 
      excludeFromAi: s.excludeFromAi 
    })),
    shifts: shiftData, 
    tasks: taskData,
    targetCounts,
    definitions: Object.keys(shiftDefs).reduce((acc, key) => { acc[key] = { label: shiftDefs[key].label, type: shiftDefs[key].type, category: shiftDefs[key].category }; return acc; }, {})
  });

  const handleAiAnalyze = async () => {
    setAiMode('analyze'); setShowAiModal(true); setIsAiLoading(true); setAiResponse('');
    const data = prepareScheduleDataForAi();
    const result = await callGemini(`勤務表分析: ${JSON.stringify(data)}`, "プロの勤務表管理者として分析・改善案を日本語で提示", aiModel);
    setAiResponse(result); setIsAiLoading(false);
  };

  const handleAiMagicFill = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    const data = prepareScheduleDataForAi();
    
    // 制約条件の追加
    const constraintPrompt = `
    【自動作成・調整ルール】
    あなたは熟練の勤務表管理者です。以下のルールを厳密に守ってシフトを作成・修正してください。

    1. **絶対遵守条件 (Hard Constraints)**:
       - **AI除外職員の保護**: 職員データの 'excludeFromAi' が true の場合、その職員のシフトは一切変更せず、空欄であっても埋めないでください。
       - **希望休の維持**: シフト区分が「希望(req)」または「休み(off)」として既に入力されている箇所は絶対に変更しないでください。
       - **固定シフトの維持**: 役割(roles)に「オペ班」「エコー班」「HHD班」が含まれる職員のシフト、および既に割り当てられている特殊シフトは変更しないでください。
       - **必要人数の充足**: 「必要人数設定(targetCounts)」に基づき、各カテゴリ・各日の目標人数を満たすように配置してください。

    2. **出力形式**:
       - 必ず **純粋なJSONデータのみ** を出力してください。Markdownのコードブロック（\`\`\`json ... \`\`\`）や解説文は一切不要です。
       - フォーマット: { "shift": { "staffId": { "day": "code" } }, "task": { ... } }

    指示: ${aiInput}
    `;

    try {
      const result = await callGemini(`現状:${JSON.stringify(data)} ${constraintPrompt}`, "JSON出力マシーン", aiModel);
      
      // Markdownのコードブロックを除去してJSONを抽出
      const jsonMatch = result.replace(/```json\n?|```/g, '').trim();
      const match = jsonMatch.match(/\{[\s\S]*\}/);
      
      if (match) {
        const changes = JSON.parse(match[0]);
        let updated = false;
        if (changes.shift) {
          const ns = { ...shiftData };
          Object.keys(changes.shift).forEach(s => { if(!ns[s]) ns[s]={}; Object.assign(ns[s], changes.shift[s]); });
          setShiftData(ns); saveSchedule(ns, taskData);
          updated = true;
        }
        if (changes.task) {
          const nt = { ...taskData };
          Object.keys(changes.task).forEach(s => { if(!nt[s]) nt[s]={}; Object.assign(nt[s], changes.task[s]); });
          setTaskData(nt); saveSchedule(shiftData, nt);
          updated = true;
        }
        setAiResponse(updated ? "✅ シフトを更新しました" : "⚠️ 変更が必要な箇所が見つかりませんでした");
      } else { 
        setAiResponse(`⚠️ エラー: AIの応答を解析できませんでした。\n生の応答: ${result.substring(0, 100)}...`); 
      }
    } catch (e) { 
      console.error(e); 
      setAiResponse(`⚠️ エラー: ${e.message}`); 
    }
    setIsAiLoading(false);
  };
  
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const calendarDays = useMemo(() => generateCalendarDays(year, month), [year, month]);

  // categoryDefs に基づいてパレットを生成
  const dynamicPaletteGroups = useMemo(() => {
    const groups = {};
    Object.keys(categoryDefs).forEach(catId => groups[catId] = []);
    
    // シフトをカテゴリごとに分類
    Object.values(shiftDefs)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)) 
      .forEach(shift => {
        if (groups[shift.category]) {
          groups[shift.category].push(shift.code);
        } else {
           // 未定義カテゴリの場合はbasicに入れる
           if (!groups['basic']) groups['basic'] = []; 
           groups['basic'].push(shift.code); 
        }
      });

    // カテゴリのオーダー順に並び替え
    return Object.values(categoryDefs)
      .sort((a, b) => a.order - b.order)
      .map(cat => ({
        id: cat.id,
        name: cat.label,
        items: groups[cat.id] || []
      }))
      .filter(g => g.items.length > 0);
  }, [shiftDefs, categoryDefs]);

  // 集計用グループも categoryDefs に基づく
  const dynamicSummaryGroups = useMemo(() => {
    const targetCategories = Object.keys(categoryDefs).filter(k => k !== 'off' && k !== 'req' && k !== 'role');
    return targetCategories.map(catKey => {
      const def = categoryDefs[catKey];
      const categoryItems = Object.values(shiftDefs)
        .filter(s => s.category === catKey && s.type === 'shift')
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .map(s => s.code);
      return { 
        id: catKey,
        name: def.label, 
        items: categoryItems, 
        totalLabel: `${def.label} 計`, 
        headerColor: def.color 
      };
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

  const getTargetCount = (shiftCode, day) => {
    if (!targetCounts[shiftCode]) return 0;
    const dow = getDayOfWeek(year, month, day);
    return targetCounts[shiftCode][dow] || 0;
  };

  const displayStaffList = useMemo(() => {
    if (!appUser) return [];
    let list = staffList;

    if (currentView !== 'all') {
      const team = TEAMS.find(t => t.id === currentView);
      if (team && team.role) {
        list = list.filter(s => s.roles && s.roles.includes(team.role));
      }
    }

    if (appUser.role === 'staff' && viewMode === 'personal') {
      list = list.filter(s => s.id === appUser.id);
    }

    return list;
  }, [staffList, currentView, appUser, viewMode]);

  // --- Render ---
  if (!appUser) return (
    <LoginScreen 
      onLogin={(user) => {
        setAppUser(user);
        if (user.initialView) setCurrentView(user.initialView);
        if (user.role === 'staff') setViewMode('personal');
      }} 
      staffList={staffList} 
      adminSettings={adminSettings}
    />
  );
  
  const getPopupOptions = (type) => {
    if (currentView === 'ope' && type === 'shift') {
      const l = shiftDefs['L'];
      const g = shiftDefs['G'];
      const opts = [];
      if (l) opts.push(l);
      if (g) opts.push(g);
      return opts;
    }

    const orderedCodes = dynamicPaletteGroups.flatMap(g => g.items);
    let opts = orderedCodes
      .map(code => shiftDefs[code])
      .filter(s => s && s.type === type);

    if (appUser.role === 'staff' && currentView === 'all' && currentView !== 'ope') {
      opts = opts.filter(s => s.category === 'req' || s.category === 'off');
    }
    return opts;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-sm font-sans" onClick={() => setActivePopup(null)}>
      <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-50 rounded-lg p-1 border">
            <button onClick={() => { let nm = month - 1, ny = year; if(nm < 1){ nm = 12; ny--; } setMonth(nm); setYear(ny); }} className="p-1 hover:bg-gray-200 rounded"><ChevronLeft size={20} /></button>
            <div className="px-4 font-bold text-lg text-gray-700 w-32 text-center">{year}年 {month}月</div>
            <button onClick={() => { let nm = month + 1, ny = year; if(nm > 12){ nm = 1; ny++; } setMonth(nm); setYear(ny); }} className="p-1 hover:bg-gray-200 rounded"><ChevronRight size={20} /></button>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-bold ${appUser.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{appUser.role === 'admin' ? '管理者モード' : `${appUser.name} (職員)`}</span>
          
          {appUser.role === 'admin' && (
            <div className="flex items-center bg-gray-100 rounded p-1 border ml-2">
              {TEAMS.map(team => (
                <button 
                  key={team.id}
                  onClick={() => { setCurrentView(team.id); if(appUser.role==='staff') setViewMode('all'); }}
                  className={`px-3 py-1 text-xs rounded transition ${currentView === team.id ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-200'}`}
                >
                  {team.label}
                </button>
              ))}
            </div>
          )}

          {appUser.role === 'staff' && (
            <div className="flex bg-gray-100 rounded p-1 ml-4 border">
              <button onClick={() => { setViewMode('personal'); setCurrentView('all'); }} className={`px-3 py-1 text-xs rounded transition ${viewMode==='personal' ? 'bg-white shadow text-blue-600 font-bold':'text-gray-500 hover:bg-gray-200'}`}>個人</button>
              <button onClick={() => setViewMode('all')} className={`px-3 py-1 text-xs rounded transition ${viewMode==='all' ? 'bg-white shadow text-blue-600 font-bold':'text-gray-500 hover:bg-gray-200'}`}>全体</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
           {appUser.role === 'admin' && (
             <>
               <button onClick={() => setShowCategoryModal(true)} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300">
                 <Palette size={16} /> <span className="hidden sm:inline">カテゴリ設定</span>
               </button>
               <button onClick={() => { setEditingShift(null); handleAddNewShift(); }} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300">
                 <Settings size={16} /> <span className="hidden sm:inline">シフト設定</span>
               </button>
               <button onClick={() => setShowStaffSettingsModal(true)} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300">
                 <ListFilter size={16} /> <span className="hidden sm:inline">職員設定</span>
               </button>
             </>
           )}
           <button onClick={() => setShowPasswordChangeModal(true)} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300">
             <Key size={16} /> <span className="hidden sm:inline">パスワード</span>
           </button>
           
           {appUser.role === 'admin' && (
             <button onClick={handleResetSchedule} className="flex items-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded transition font-bold border border-red-200" title="現在の月のシフトを全て消去">
               <Eraser size={16} /> <span className="hidden sm:inline">全消去</span>
             </button>
           )}
          
          {appUser.role === 'admin' && (
            <>
              <div className="h-6 w-px bg-gray-300 mx-2"></div>
              <button onClick={() => { setAiMode('analyze'); setShowAiModal(true); }} className="flex items-center gap-1 px-3 py-2 bg-purple-100 text-purple-700 rounded font-bold border border-purple-300"><Sparkles size={16} /> AI分析</button>
              <button onClick={() => { setAiMode('chat'); setShowAiModal(true); }} className="flex items-center gap-1 px-3 py-2 bg-indigo-100 text-indigo-700 rounded font-bold border border-indigo-300"><MessageSquare size={16} /> AI入力</button>
            </>
          )}
          <div className="h-6 w-px bg-gray-300 mx-2"></div>
          <button onClick={() => setAppUser(null)} className="flex items-center gap-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"><LogOut size={16} /> ログアウト</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 overflow-auto bg-gray-100 relative">
          <div className="inline-block min-w-full align-middle p-4">
            
            {viewMode === 'personal' && appUser.role === 'staff' ? (
              <div className="bg-white rounded-lg shadow max-w-lg mx-auto overflow-hidden border">
                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2"><User size={18}/> {appUser.name}さんの勤務表</h3>
                  <div className="text-xs text-gray-500">残業合計: <span className="font-bold text-red-600 text-sm">{staffOvertimeStats[appUser.id] || 0}h</span></div>
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
                    const isSun = cell.date.getDay() === 0;
                    const isSat = cell.date.getDay() === 6;
                    const isHol = day && isHoliday(year, month, day);
                    const isEditable = cell.currentMonth && !isSun; 
                    let bg = 'bg-white';
                    if(!cell.currentMonth) bg = 'bg-gray-50';
                    else if(isSun || isHol) bg = 'bg-red-50';
                    else if(isSat) bg = 'bg-blue-50';

                    return (
                      <div key={idx} className={`${bg} min-h-[5rem] p-1 flex flex-col relative`}>
                        <div className={`text-[10px] font-bold mb-1 ${isSun || isHol ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'} ${!cell.currentMonth && 'opacity-30'}`}>{cell.date.getDate()}</div>
                        {cell.currentMonth && (
                          <div className="flex-1 flex flex-col gap-1">
                            <div 
                              onClick={(e) => { if(isEditable) { e.stopPropagation(); handleCellClick(e, appUser.id, day, 'shift'); }}}
                              className={`flex-1 rounded border flex flex-col items-center justify-center cursor-pointer transition ${shift ? 'bg-white border-blue-200 shadow-sm' : 'bg-transparent border-dashed border-gray-300'} ${isEditable ? 'hover:border-blue-400' : ''}`}
                            >
                              {shift ? <span className={`font-bold text-xs ${shift.text}`}>{shift.label}</span> : <span className="text-[8px] text-gray-300">選択</span>}
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
                          {appUser.role === 'admin' && <button onClick={(e) => { e.stopPropagation(); handleAddStaff(); }} className="flex items-center gap-1 text-xs bg-white border px-2 py-1 rounded text-blue-600 font-bold"><Plus size={12}/> 職員追加</button>}
                        </div>
                      </th>
                      {daysArray.map(day => {
                        const isSun = isSunday(year, month, day);
                        const isHol = isHoliday(year, month, day);
                        let bgClass = getDayColor(year, month, day); 
                        let headerBg = 'bg-gray-50';
                        if(isSun || isHol) headerBg = 'bg-red-50'; 

                        return (
                          <th key={day} className={`sticky top-0 z-20 border-b border-r min-w-[40px] p-1 text-center ${headerBg} ${bgClass}`}>
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
                      return (
                        <tr 
                          key={staff.id} 
                          className="group hover:bg-gray-50"
                          draggable={appUser.role === 'admin'}
                          onDragStart={(e) => {
                            if (appUser.role !== 'admin') return;
                            e.dataTransfer.setData('text/plain', staff.id);
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (appUser.role !== 'admin') return;
                            const dragId = e.dataTransfer.getData('text/plain');
                            handleSortStaff(dragId, staff.id);
                          }}
                        >
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-b border-r p-2 font-medium text-gray-700 whitespace-nowrap">
                            <div className="flex items-center justify-between group/cell w-full">
                              {appUser.role === 'admin' && (
                                <div className="cursor-grab active:cursor-grabbing text-gray-400 mr-2 hover:text-gray-600">
                                  <GripVertical size={14} />
                                </div>
                              )}
                              <div className="cursor-pointer flex-1" onClick={(e) => { if(appUser.role === 'admin') { e.stopPropagation(); handleEditStaff(staff); } }}>
                                <div className="text-sm font-bold text-gray-800 flex items-center gap-1">
                                  {staff.name}
                                  {appUser.role === 'admin' && <Edit2 size={10} className="text-gray-300 opacity-0 group-hover/cell:opacity-100 transition"/>}
                                </div>
                                <div className="text-[10px] text-gray-500 flex items-center gap-2">
                                  {staff.jobTitle}
                                  {/* スキルバッジの表示 */}
                                  {staff.skills?.isLeader && <ShieldCheck size={10} className="text-blue-500" title="リーダー可"/>}
                                  {staff.skills?.isVeteran && <Star size={10} className="text-yellow-500" title="ベテラン"/>}
                                  {/* AI除外マーク */}
                                  {staff.excludeFromAi && <Lock size={10} className="text-red-500" title="AI自動生成対象外"/>}
                                </div>
                              </div>
                              {appUser.role === 'admin' && <button onClick={(e) => { e.stopPropagation(); removeStaff(staff.id); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 px-1"><Trash2 size={12}/></button>}
                            </div>
                          </td>
                          {daysArray.map(day => {
                            const shiftCode = shiftData[staff.id]?.[day];
                            const taskCode = taskData[staff.id]?.[day];
                            const shift = shiftDefs[shiftCode];
                            const task = shiftDefs[taskCode];
                            const isSun = isSunday(year, month, day);
                            const isHol = isHoliday(year, month, day);
                            const isEditable = !isSun && (appUser.role === 'admin' || (appUser.role === 'staff' && staff.id === appUser.id));

                            let cellBg = '';
                            if (isSun || isHol) {
                              cellBg = 'bg-red-50'; 
                            } else if (!isEditable) {
                              cellBg = 'bg-gray-50 opacity-80';
                            } else {
                              cellBg = 'cursor-pointer hover:bg-blue-50 bg-white';
                            }

                            return (
                              <td key={day} className={`border-b border-r text-center p-0 h-16 relative ${cellBg}`}>
                                <div className="w-full h-full flex flex-col">
                                  <div className="h-3/4 flex items-center justify-center border-b border-gray-100 transition hover:bg-black/5" onClick={(e) => { if(isEditable) { e.stopPropagation(); handleCellClick(e, staff.id, day, 'shift'); } }}>
                                    {shift ? <span className={`font-bold text-xs ${shift.text}`}>{shift.label}</span> : null}
                                  </div>
                                  <div className="h-1/4 flex items-center justify-center transition hover:bg-black/5" onClick={(e) => { if(isEditable) { e.stopPropagation(); handleCellClick(e, staff.id, day, 'task'); } }}>
                                    {task ? <span className={`font-bold text-[10px] ${task.text} transform scale-90`}>{task.label}</span> : null}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className={`border-b border-r text-center p-1 font-bold text-sm ${overtime > 60 ? 'bg-red-100 text-red-600' : 'bg-gray-50 text-gray-600'}`}>
                            <div className="flex flex-col items-center justify-center h-full">
                              <span>{overtime > 0 ? overtime : '-'}</span>
                              {overtime > 60 && <AlertTriangle size={12} className="text-red-500 mt-1" />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {appUser.role === 'admin' && (
                      <>
                        <tr>
                          <td className="p-2 bg-gray-100 border-r border-b font-bold text-gray-600 text-xs text-right sticky left-0 z-10 flex justify-between items-center">
                            <button onClick={(e) => { e.stopPropagation(); setShowTargetCountModal(true); }} className="text-gray-400 hover:text-blue-600"><Settings size={14}/></button>
                            <span>集計</span>
                          </td>
                          <td colSpan={daysInMonth+1} className="bg-gray-100 border-b"></td>
                        </tr>
                        <tr>
                          <td className="sticky left-0 bg-gray-50 border-r border-b p-2 text-xs font-bold text-right">出勤人数</td>
                          {daysArray.map(day => <td key={day} className="border-r border-b text-center text-xs font-bold bg-gray-50">{dailyStats[day].total}</td>)}
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
                                  
                                  return (
                                    <td key={day} className={`border-r border-b text-center text-xs font-bold ${isAlert ? 'bg-red-200 text-red-700' : 'bg-gray-50'}`}>
                                      {total > 0 ? total : '-'}
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
                                    if (target > 0) {
                                      isAlert = count < target;
                                    }

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

        {activePopup && (
          <div 
            className={`
              z-50 bg-white shadow-xl border p-2 animate-in fade-in zoom-in-95 duration-100
              fixed bottom-0 left-0 right-0 w-full rounded-t-xl
              md:absolute md:w-64 md:rounded-lg md:bottom-auto md:left-auto md:right-auto
            `}
            style={window.innerWidth >= 768 ? { top: Math.min(activePopup.y + 10, window.innerHeight + window.scrollY - 200), left: Math.min(activePopup.x - 100, window.innerWidth + window.scrollX - 280) } : {}}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-xs font-bold text-gray-500 mb-2 border-b pb-1 text-center md:text-left">{activePopup.type === 'shift' ? 'シフト選択' : 'タスク選択'}</div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { handleUpdateCell(activePopup.staffId, activePopup.day, null, activePopup.type); setActivePopup(null); }} className="col-span-4 h-10 md:h-8 text-xs text-red-500 border border-red-200 bg-red-50 rounded hover:bg-red-100 mb-1">クリア</button>
              {getPopupOptions(activePopup.type).map(shift => (
                <button key={shift.code} onClick={() => { handleUpdateCell(activePopup.staffId, activePopup.day, shift.code, activePopup.type); setActivePopup(null); }} className={`h-12 md:h-9 w-full rounded flex items-center justify-center font-bold text-xs border transition ${shift.text} hover:bg-gray-50`} title={shift.label}>{shift.label}</button>
              ))}
            </div>
            <div className="mt-2 md:hidden">
              <button onClick={() => setActivePopup(null)} className="w-full py-3 bg-gray-100 text-gray-600 rounded-lg font-bold">閉じる</button>
            </div>
          </div>
        )}

        {/* カテゴリ編集モーダル */}
        {showCategoryModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCategoryModal(false)}>
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Palette size={18}/> カテゴリ設定</h3>
                 <button onClick={() => setShowCategoryModal(false)}><X size={20} className="text-gray-400"/></button>
               </div>
               <div className="flex flex-1 overflow-hidden">
                 <div className="w-1/3 border-r bg-gray-50 overflow-y-auto p-2">
                    <button onClick={handleAddCategory} className="w-full mb-2 py-2 bg-blue-100 text-blue-700 font-bold rounded text-xs flex items-center justify-center gap-1 hover:bg-blue-200"><Plus size={12}/> 新規作成</button>
                    <div className="space-y-1">
                      {Object.values(categoryDefs).sort((a,b)=>a.order-b.order).map(cat => (
                        <div key={cat.id} onClick={() => handleEditCategory(cat.id)} className={`p-2 rounded cursor-pointer border text-xs font-bold ${targetCategory?.originalId === cat.id ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200'} ${cat.color}`}>
                           {cat.label}
                        </div>
                      ))}
                    </div>
                 </div>
                 <div className="w-2/3 p-4 overflow-y-auto">
                    {targetCategory ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">ID (英数字)</label>
                          <input type="text" className="w-full border p-2 rounded" value={targetCategory.id} onChange={e => setTargetCategory({...targetCategory, id: e.target.value})} placeholder="例: morning" disabled={!!targetCategory.originalId}/>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">表示名</label>
                          <input type="text" className="w-full border p-2 rounded" value={targetCategory.label} onChange={e => setTargetCategory({...targetCategory, label: e.target.value})}/>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">背景色・文字色</label>
                          <div className="grid grid-cols-2 gap-2">
                             {BG_COLOR_OPTIONS.map(opt => (
                               <button key={opt.value} onClick={() => setTargetCategory({...targetCategory, color: opt.value})} className={`text-xs p-2 rounded border font-bold ${opt.value} ${targetCategory.color === opt.value ? 'ring-2 ring-blue-500' : ''}`}>
                                 {opt.label}
                               </button>
                             ))}
                          </div>
                        </div>
                        {targetCategory.originalId && (
                           <div className="flex gap-2 border-t pt-4">
                              <button onClick={() => moveCategoryOrder(targetCategory.id, 'up')} className="flex-1 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 flex justify-center"><ArrowUp size={16}/></button>
                              <button onClick={() => moveCategoryOrder(targetCategory.id, 'down')} className="flex-1 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 flex justify-center"><ArrowDown size={16}/></button>
                           </div>
                        )}
                        <div className="flex justify-between pt-4 border-t mt-4">
                          {targetCategory.originalId && <button onClick={() => deleteCategory(targetCategory.originalId)} className="text-red-500 text-sm hover:underline">削除</button>}
                          <button onClick={saveCategory} className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">保存</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">左側から選択または新規作成</div>
                    )}
                 </div>
               </div>
             </div>
          </div>
        )}

        {showShiftEditModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowShiftEditModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">シフト編集</h3>
                <button onClick={() => setShowShiftEditModal(false)}><X size={20} className="text-gray-400"/></button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                <div className="w-1/3 border-r bg-gray-50 overflow-y-auto p-2">
                  <button onClick={() => { setEditingShift({ code: '', label: '', color: 'bg-transparent', text: 'text-gray-800', startTime: '', endTime: '', overtime: '', time: '', category: 'saka', type: 'shift', originalCode: null }); }} className="w-full mb-2 py-2 bg-blue-100 text-blue-700 font-bold rounded text-xs flex items-center justify-center gap-1 hover:bg-blue-200"><Plus size={12}/> 新規作成</button>
                  <div className="space-y-3">
                    {dynamicPaletteGroups.map(g => (
                      <div key={g.id}>
                        <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">{g.name}</div>
                        <div className="space-y-1">
                          {g.items.map(code => (
                            <div 
                              key={code} 
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', code)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const dragCode = e.dataTransfer.getData('text/plain');
                                handleSortShift(dragCode, code);
                              }}
                              onClick={() => handleEditShift(code)} 
                              className={`p-2 rounded cursor-pointer border text-xs flex items-center gap-2 ${editingShift?.originalCode === code ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
                            >
                              <GripVertical size={14} className="text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0" />
                              <span className={shiftDefs[code].text}>{shiftDefs[code].label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-2/3 p-4 overflow-y-auto">
                  {editingShift ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-500">コード</label><input type="text" className="w-full border p-2 rounded" value={editingShift.code || ''} onChange={e => setEditingShift({...editingShift, code: e.target.value.toUpperCase()})} /></div>
                        <div><label className="block text-xs font-bold text-gray-500">表示名</label><input type="text" className="w-full border p-2 rounded" value={editingShift.label || ''} onChange={e => setEditingShift({...editingShift, label: e.target.value})} /></div>
                      </div>
                      <div><label className="block text-xs font-bold text-gray-500">カテゴリ</label>
                        <select className="w-full border p-2 rounded" value={editingShift.category || 'saka'} onChange={e => setEditingShift({...editingShift, category: e.target.value})}>
                          {Object.values(categoryDefs).sort((a,b)=>a.order-b.order).map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-500">残業(h)</label><input type="number" step="0.5" className="w-full border p-2 rounded" value={editingShift.overtime ?? ''} onChange={e => setEditingShift({...editingShift, overtime: e.target.value})} /></div>
                        <div><label className="block text-xs font-bold text-gray-500">文字色</label>
                          <div className="flex flex-wrap gap-1 mt-1">{COLOR_OPTIONS.map(c => (
                            <button key={c.value} onClick={() => setEditingShift({...editingShift, text: c.value})} className={`w-6 h-6 rounded border ${c.value} ${editingShift.text === c.value ? 'ring-2 ring-blue-500' : ''}`} title={c.label}>Aa</button>
                          ))}</div>
                        </div>
                      </div>
                      {editingShift.type === 'shift' && (
                        <div className="grid grid-cols-2 gap-4 bg-blue-50 p-2 rounded">
                          <div><label className="block text-xs font-bold text-blue-700">開始</label>
                            {/* 時刻入力への変更 */}
                            <input type="time" className="w-full border rounded p-1" value={editingShift.startTime || ''} onChange={e => setEditingShift({...editingShift, startTime: e.target.value, time: `${e.target.value}-${editingShift.endTime}`})} />
                          </div>
                          <div><label className="block text-xs font-bold text-blue-700">終了</label>
                            {/* 時刻入力への変更 */}
                            <input type="time" className="w-full border rounded p-1" value={editingShift.endTime || ''} onChange={e => setEditingShift({...editingShift, endTime: e.target.value, time: `${editingShift.startTime}-${e.target.value}`})} />
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between pt-4 border-t mt-4">
                        {editingShift.originalCode && <button onClick={() => deleteShiftConfig(editingShift.originalCode)} className="text-red-500 text-sm hover:underline">削除</button>}
                        <button onClick={saveShiftConfig} className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">保存</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">左側から選択または新規作成</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 職員設定一括モーダル */}
        {showStaffSettingsModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><ListFilter size={18}/> 職員設定一覧 (スキル・制限・AI設定)</h3>
                <button onClick={() => setShowStaffSettingsModal(false)}><X size={20} className="text-gray-400"/></button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                 <table className="w-full border-collapse text-xs">
                   <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                     <tr>
                       <th className="p-2 border text-left min-w-[120px]">職員名 / 役職</th>
                       <th className="p-2 border text-center w-20">AI除外</th>
                       <th className="p-2 border text-center w-24">3クール上限</th>
                       {STAFF_SKILLS.map(skill => (
                         <th key={skill.key} className="p-2 border text-center w-20">
                           <div className="flex flex-col items-center">
                             <skill.icon size={16} className="text-gray-600 mb-1"/>
                             <span>{skill.label}</span>
                           </div>
                         </th>
                       ))}
                     </tr>
                   </thead>
                   <tbody>
                     {staffList.map((staff, index) => (
                       <tr key={staff.id} className="hover:bg-gray-50 border-b">
                         <td className="p-2 border font-bold text-gray-700">
                           <div>{staff.name}</div>
                           <div className="text-[10px] text-gray-400">{staff.jobTitle}</div>
                         </td>
                         <td className="p-2 border text-center bg-red-50">
                           <input 
                             type="checkbox" 
                             className="w-4 h-4"
                             checked={staff.excludeFromAi || false}
                             onChange={(e) => {
                               const newList = [...staffList];
                               newList[index] = { ...staff, excludeFromAi: e.target.checked };
                               setStaffList(newList);
                             }}
                           />
                           {staff.excludeFromAi && <div className="text-[9px] text-red-500 font-bold">除外</div>}
                         </td>
                         <td className="p-2 border text-center">
                           <input 
                             type="number" 
                             min="0"
                             className="w-16 p-1 border rounded text-center"
                             value={staff.maxCool3 ?? 5}
                             onChange={(e) => {
                               const newList = [...staffList];
                               newList[index] = { ...staff, maxCool3: parseInt(e.target.value) || 0 };
                               setStaffList(newList);
                             }}
                           />
                         </td>
                         {STAFF_SKILLS.map(skill => (
                           <td key={skill.key} className="p-2 border text-center cursor-pointer hover:bg-blue-50" onClick={() => {
                              const newList = [...staffList];
                              const currentVal = staff.skills?.[skill.key] || false;
                              newList[index] = { ...staff, skills: { ...(staff.skills || {}), [skill.key]: !currentVal } };
                              setStaffList(newList);
                           }}>
                             {staff.skills?.[skill.key] ? <Check size={18} className="text-green-600 mx-auto"/> : <div className="w-4 h-4 mx-auto border rounded-sm border-gray-300"></div>}
                           </td>
                         ))}
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </div>
              <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
                 <button onClick={() => setShowStaffSettingsModal(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-bold">キャンセル</button>
                 <button onClick={() => saveAllStaffSettings(staffList)} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">保存する</button>
              </div>
            </div>
          </div>
        )}

        {showStaffModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18}/> 職員情報</h3>
                <button onClick={() => setShowStaffModal(false)}><X size={20} className="text-gray-400"/></button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">ログインID <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border p-2 rounded" placeholder="任意のIDを入力" value={targetStaff.loginId || ''} onChange={e => setTargetStaff({...targetStaff, loginId: e.target.value})} />
                  <p className="text-[10px] text-gray-400 mt-1">ログインに使用するIDです</p>
                </div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">名前</label><input type="text" className="w-full border p-2 rounded" value={targetStaff.name || ''} onChange={e => setTargetStaff({...targetStaff, name: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">役職</label>
                  <select className="w-full border p-2 rounded" value={targetStaff.jobTitle || '一般'} onChange={e => {
                    const newTitle = e.target.value;
                    let newSkills = targetStaff.skills ? { ...targetStaff.skills } : {};
                    // 役職に応じてスキル「リーダー可」を自動チェック
                    if(LEADER_FORCE_TITLES.includes(newTitle)) newSkills.isLeader = true;
                    setTargetStaff({...targetStaff, jobTitle: newTitle, skills: newSkills});
                  }}>
                    {JOB_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">ロール（班）</label>
                  <div className="space-y-2">{STAFF_ROLES.map(r => (
                    <label key={r} className="flex items-center gap-2"><input type="checkbox" checked={targetStaff.roles?.includes(r)} onChange={() => {
                      const roles = targetStaff.roles?.includes(r) ? targetStaff.roles.filter(x=>x!==r) : [...(targetStaff.roles||[]), r];
                      setTargetStaff({...targetStaff, roles});
                    }}/> <span className="text-sm">{r}</span></label>
                  ))}</div>
                </div>

                {/* スキル評価設定（管理者のみ） */}
                {appUser.role === 'admin' && (
                  <>
                    <div className="border-t pt-4 mt-2">
                      <label className="block text-xs font-bold text-blue-600 mb-2 flex items-center gap-1"><ShieldCheck size={14}/> スキル評価 (管理者のみ)</label>
                      <div className="space-y-3 bg-blue-50 p-3 rounded-lg">
                        {STAFF_SKILLS.map(skill => (
                          <div key={skill.key} className="flex items-start gap-2">
                            <input 
                              type="checkbox" 
                              id={`skill-${skill.key}`}
                              className="mt-1"
                              checked={targetStaff.skills?.[skill.key] || false} 
                              onChange={(e) => {
                                const newSkills = { ...targetStaff.skills, [skill.key]: e.target.checked };
                                setTargetStaff({ ...targetStaff, skills: newSkills });
                              }}
                            />
                            <label htmlFor={`skill-${skill.key}`} className="text-sm cursor-pointer">
                              <div className="font-bold flex items-center gap-1">{skill.label}</div>
                              <div className="text-[10px] text-gray-500">{skill.desc}</div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* 詳細設定 */}
                    <div className="border-t pt-4 mt-2">
                      <label className="block text-xs font-bold text-gray-600 mb-2">詳細設定</label>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">3クール上限回数 (月間)</label>
                          <input type="number" className="w-full border p-2 rounded" value={targetStaff.maxCool3 ?? 5} onChange={e => setTargetStaff({...targetStaff, maxCool3: parseInt(e.target.value)||0})} />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="excludeFromAi" className="w-4 h-4" checked={targetStaff.excludeFromAi || false} onChange={e => setTargetStaff({...targetStaff, excludeFromAi: e.target.checked})}/>
                          <label htmlFor="excludeFromAi" className="text-xs font-bold text-red-600 cursor-pointer">AI自動生成から除外する (シフトを固定)</label>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div><label className="block text-xs font-bold text-gray-500 mb-1">パスワード</label><input type="text" className="w-full border p-2 rounded" value={targetStaff.password || ''} onChange={e => setTargetStaff({...targetStaff, password: e.target.value})} /></div>
              </div>
              <div className="p-4 border-t flex justify-end gap-2">
                <button onClick={saveStaff} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">保存</button>
              </div>
            </div>
          </div>
        )}

        {showPasswordChangeModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPasswordChangeModal(false)}>
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
                       {Object.keys(adminSettings).map(key => (
                         <option key={key} value={key}>{adminSettings[key].label}</option>
                       ))}
                     </select>
                   </div>
                 ) : null}
                 <label className="block text-xs font-bold text-gray-500 mb-1">新しいパスワード</label>
                 <input type="text" className="w-full border p-2 rounded" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus />
               </div>
               <div className="p-4 border-t flex justify-end gap-2">
                 <button onClick={handleChangePassword} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">変更する</button>
               </div>
             </div>
          </div>
        )}

        {/* 必要人数設定モーダル */}
        {showTargetCountModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18}/> 必要人数設定</h3>
                 <button onClick={() => setShowTargetCountModal(false)}><X size={20} className="text-gray-400"/></button>
               </div>
               <div className="p-4 overflow-y-auto">
                 <p className="text-xs text-gray-500 mb-4">
                   各シフト・曜日ごとの必要人数を設定してください。<br/>
                   設定値を下回ると集計欄が赤く表示されます。
                 </p>
                 <div className="space-y-6">
                   {dynamicSummaryGroups.map(group => (
                     <div key={group.id} className="border rounded-lg overflow-hidden">
                       <div className={`px-4 py-2 font-bold text-sm ${group.headerColor}`}>{group.name}</div>
                       <table className="w-full text-center text-xs border-collapse">
                         <thead>
                           <tr className="bg-gray-100 text-gray-600">
                             <th className="p-2 border text-left w-32">シフト</th>
                             {group.id === 'jinkuri' ? (
                               <>
                                 <th className="p-2 border w-24">月・水・金</th>
                                 <th className="p-2 border w-24">火・木・土</th>
                               </>
                             ) : (
                               <th className="p-2 border w-32">通常 (月～土)</th>
                             )}
                           </tr>
                         </thead>
                         <tbody>
                           {group.items.map(code => {
                             const shift = shiftDefs[code];
                             // じんクリ: 月(1)の値を代表として表示
                             const val1 = targetCounts[code]?.[1] ?? 0;
                             // じんクリ: 火(2)の値を代表として表示
                             const val2 = targetCounts[code]?.[2] ?? 0;
                             
                             return (
                               <tr key={code} className="border-b last:border-b-0">
                                 <td className="p-2 border text-left font-bold text-gray-700">
                                    <span className={shift.text}>{shift.label}</span>
                                 </td>
                                 {group.id === 'jinkuri' ? (
                                   <>
                                     <td className="p-1 border">
                                       <input 
                                         type="number" min="0" className="w-16 p-1 border rounded text-center"
                                         value={val1}
                                         onChange={(e) => {
                                           const v = parseInt(e.target.value) || 0;
                                           setTargetCounts(prev => ({
                                             ...prev,
                                             [code]: { ...(prev[code] || {}), 1:v, 3:v, 5:v } // 月水金
                                           }));
                                         }}
                                       />
                                     </td>
                                     <td className="p-1 border">
                                       <input 
                                         type="number" min="0" className="w-16 p-1 border rounded text-center"
                                         value={val2}
                                         onChange={(e) => {
                                           const v = parseInt(e.target.value) || 0;
                                           setTargetCounts(prev => ({
                                             ...prev,
                                             [code]: { ...(prev[code] || {}), 2:v, 4:v, 6:v } // 火木土
                                           }));
                                         }}
                                       />
                                     </td>
                                   </>
                                 ) : (
                                   <td className="p-1 border">
                                     <input 
                                       type="number" min="0" className="w-16 p-1 border rounded text-center"
                                       value={val1}
                                       onChange={(e) => {
                                         const v = parseInt(e.target.value) || 0;
                                         setTargetCounts(prev => ({
                                           ...prev,
                                           [code]: { ...(prev[code] || {}), 1:v, 2:v, 3:v, 4:v, 5:v, 6:v } // 月～土
                                         }));
                                       }}
                                     />
                                   </td>
                                 )}
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
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
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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

        {showAiModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAiModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-bold text-lg flex items-center gap-2"><Sparkles className="text-purple-600"/> AIアシスタント</h3>
                <button onClick={() => setShowAiModal(false)}><X size={20} className="text-gray-400"/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                
                {/* モデル選択エリア */}
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 mb-1">使用モデル</label>
                  <select 
                    className="w-full border p-2 rounded text-sm bg-white"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  >
                    {AI_MODELS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>

                {isAiLoading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500"/></div> : (
                  <div className="space-y-4">
                    {aiMode === 'chat' && <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">💡 例: 「Aさんの土日を休みに」「Bさんの空きをPで埋めて」</div>}
                    <div className="whitespace-pre-wrap text-sm">{aiResponse}</div>
                  </div>
                )}
              </div>
              {aiMode === 'chat' && (
                <div className="p-4 border-t bg-white flex gap-2">
                  <input 
                    type="text" 
                    className="flex-1 border rounded px-3 py-2" 
                    placeholder="指示を入力..." 
                    value={aiInput} 
                    onChange={e => setAiInput(e.target.value)} 
                    // 日本語変換中（isComposing）は送信しない
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        handleAiMagicFill();
                      }
                    }} 
                  />
                  <button onClick={handleAiMagicFill} disabled={isAiLoading || !aiInput.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded"><Send size={18}/></button>
                </div>
              )}
              {aiMode === 'analyze' && !aiResponse && !isAiLoading && (
                <div className="p-4 border-t bg-white"><button onClick={handleAiAnalyze} className="w-full bg-purple-600 text-white py-2 rounded font-bold">分析開始</button></div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}