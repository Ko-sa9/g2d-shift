import React, { useState, useEffect, useMemo } from 'react';
import { Save, Trash2, Plus, ChevronLeft, ChevronRight, Calculator, Sparkles, MessageSquare, X, Send, Loader2, Edit2, Check, RotateCcw, AlertTriangle, User, LogOut, Calendar as CalendarIcon, Lock, Users, Clock, Key, GripVertical, Settings, Filter } from 'lucide-react';
import { auth, db, appId } from './firebase'; // 作成したファイルからインポート
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, collection, setDoc, onSnapshot } from 'firebase/firestore';

// Gemini API Key
// .envファイルから VITE_GEMINI_API_KEY を読み込みます
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

// ------------------------------------------------------------------
// 定数・初期設定
// ------------------------------------------------------------------

const CATEGORY_DEFS = {
  'saka':    { label: '坂田',    color: 'bg-blue-50 text-blue-800' },
  'kimi':    { label: '君津',    color: 'bg-green-50 text-green-800' },
  'moku':    { label: '木クリ',  color: 'bg-yellow-50 text-yellow-800' },
  'jinkuri': { label: 'じんクリ', color: 'bg-purple-50 text-purple-800' },
  'me':      { label: 'ME室',    color: 'bg-red-50 text-red-800' },
  'basic':   { label: 'その他',   color: 'bg-gray-50 text-gray-800' },
  'off':     { label: '休み',    color: 'bg-gray-100 text-gray-500' },
  'role':    { label: '役割',    color: 'bg-gray-50 text-gray-800' },
  'req':     { label: '希望',    color: 'bg-pink-50 text-pink-600' },
};

// 並び替え用のorderを追加
const DEFAULT_SHIFT_TYPES = {
  'A': { order: 0, code: 'A', label: '坂3', color: 'bg-transparent', text: 'text-blue-600', startTime: '07:50', endTime: '22:00', overtime: 0, time: '07:50-22:00', category: 'saka', type: 'shift' },
  'P': { order: 1, code: 'P', label: '坂2', color: 'bg-transparent', text: 'text-blue-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'saka', type: 'shift' },
  'C': { order: 2, code: 'C', label: '坂日', color: 'bg-transparent', text: 'text-blue-800', startTime: '07:20', endTime: '16:00', overtime: 0, time: '07:20-16:00', category: 'saka', type: 'shift' },
  'F': { order: 3, code: 'F', label: '君3', color: 'bg-transparent', text: 'text-green-600', startTime: '07:50', endTime: '22:00', overtime: 0, time: '07:50-22:00', category: 'kimi', type: 'shift' },
  'B': { order: 4, code: 'B', label: '君2', color: 'bg-transparent', text: 'text-green-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'kimi', type: 'shift' },
  'D': { order: 5, code: 'D', label: '君日', color: 'bg-transparent', text: 'text-green-800', startTime: '07:20', endTime: '16:00', overtime: 0, time: '07:20-16:00', category: 'kimi', type: 'shift' },
  'I': { order: 6, code: 'I', label: '木2', color: 'bg-transparent', text: 'text-yellow-600', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'moku', type: 'shift' },
  'K': { order: 7, code: 'K', label: '木日', color: 'bg-transparent', text: 'text-yellow-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'moku', type: 'shift' },
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
const STAFF_ROLES = ['リーダー', 'エコー班', 'オペ班', 'HHD班'];
const LEADER_FORCE_TITLES = ['科長', '副技士長', '主任'];

// チーム定義
const TEAMS = [
  { id: 'all', label: '全体', role: null },
  { id: 'opera', label: 'オペ班', role: 'オペ班' },
  { id: 'echo', label: 'エコー班', role: 'エコー班' },
  { id: 'hhd', label: 'HHD班', role: 'HHD班' },
];

const INITIAL_STAFF = [
  { id: '1', name: '職員A', jobTitle: '副技士長', roles: ['リーダー', 'オペ班'], password: '1234' },
  { id: '2', name: '職員B', jobTitle: '主任', roles: ['リーダー', 'エコー班'], password: '1234' },
  { id: '3', name: '職員C', jobTitle: '一般', roles: [], password: '1234' },
  { id: '4', name: '職員D', jobTitle: '一般', roles: [], password: '1234' },
  { id: '5', name: '職員E', jobTitle: '一般', roles: [], password: '1234' },
  { id: '6', name: '職員F', jobTitle: 'パート', roles: [], password: '1234' },
];

const TIME_OPTIONS = (() => {
  const times = [];
  for (let h = 5; h < 24; h++) {
    for (let m = 0; m < 60; m += 10) {
       const str = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
       times.push(str);
    }
  }
  return times;
})();

const COLOR_OPTIONS = [
  { label: '黒', value: 'text-gray-800' },
  { label: '灰', value: 'text-gray-500' }, 
  { label: '青', value: 'text-blue-600' },
  { label: '緑', value: 'text-green-600' },
  { label: '黄', value: 'text-yellow-600' },
  { label: '紫', value: 'text-purple-600' },
  { label: '赤', value: 'text-red-600' },
  { label: '橙', value: 'text-orange-600' },
  { label: '桃', value: 'text-pink-600' },
  { label: '水', value: 'text-cyan-600' },
  { label: '薄赤', value: 'text-red-400' },
];

/**
 * ------------------------------------------------------------------
 * ユーティリティ (祝日計算)
 * ------------------------------------------------------------------
 */

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

const callGemini = async (prompt, systemInstruction = "") => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      }
    );
    if (!response.ok) throw new Error('API Request Failed');
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error: AIの呼び出しに失敗しました。";
  }
};

/**
 * ------------------------------------------------------------------
 * コンポーネント: ログイン画面
 * ------------------------------------------------------------------
 */
const LoginScreen = ({ onLogin, staffList }) => {
  const [selectedRole, setSelectedRole] = useState('staff');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (selectedRole === 'admin') {
      if (password === 'admin') {
        onLogin({ role: 'admin', name: '管理者' });
      } else {
        setError('パスワードが違います (初期: admin)');
      }
    } else {
      const staff = staffList.find(s => s.id === selectedStaffId);
      if (!staff) {
        setError('職員を選択してください');
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
              <label className="block text-sm font-bold text-gray-600 mb-1">職員名</label>
              <select className="w-full border p-2 rounded-lg" value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
                <option value="">選択してください</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.jobTitle})</option>)}
              </select>
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

/**
 * ------------------------------------------------------------------
 * メインコンポーネント: WorkScheduleApp
 * ------------------------------------------------------------------
 */
export default function WorkScheduleApp() {
  // Global State
  const [authUser, setAuthUser] = useState(null); 
  const [appUser, setAppUser] = useState(null); 
  
  // Data State
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [staffList, setStaffList] = useState([]);
  const [shiftDefs, setShiftDefs] = useState(DEFAULT_SHIFT_TYPES);
  const [shiftData, setShiftData] = useState({});
  const [taskData, setTaskData] = useState({});
  
  // UI State
  const [activePopup, setActivePopup] = useState(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showShiftEditModal, setShowShiftEditModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  
  // View Mode
  const [viewMode, setViewMode] = useState('personal'); 
  const [currentView, setCurrentView] = useState('all'); // 'all', 'opera', 'echo', 'hhd'

  // Edit Buffer
  const [editingShift, setEditingShift] = useState(null);
  const [targetStaff, setTargetStaff] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [aiMode, setAiMode] = useState('chat');
  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- Firebase Authentication ---
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

  // --- Data Sync (Firestore) ---
  useEffect(() => {
    if (!authUser) return;

    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'general', 'masterData');
    const unsubMaster = onSnapshot(masterDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStaffList(data.staffList || []);
        setShiftDefs(data.shiftDefs || DEFAULT_SHIFT_TYPES);
      } else {
        setDoc(masterDocRef, { staffList: INITIAL_STAFF, shiftDefs: DEFAULT_SHIFT_TYPES });
        setStaffList(INITIAL_STAFF);
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

  // --- Data Persistance ---
  const saveSchedule = async (newShifts, newTasks) => {
    if (!authUser) return;
    const scheduleId = `schedule_${year}_${month}`;
    const scheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
    await setDoc(scheduleDocRef, { shifts: newShifts, tasks: newTasks }, { merge: true });
  };

  const saveMasterData = async (newStaffList, newShiftDefs) => {
    if (!authUser) return;
    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'general', 'masterData');
    await setDoc(masterDocRef, { staffList: newStaffList, shiftDefs: newShiftDefs }, { merge: true });
  };

  // --- Actions ---

  const handleUpdateCell = (staffId, day, toolCode, type = 'shift') => {
    // 職員モードの制限チェック
    if (appUser.role === 'staff') {
      if (staffId !== appUser.id) return; 

      // オペ班表示時はL, Gのみ許可 (職員でも入力可とする)
      if (currentView === 'opera') {
        if (toolCode && toolCode !== 'L' && toolCode !== 'G') {
           alert('オペ班ページではLとGのみ入力可能です。');
           return;
        }
      } else {
        // 通常は希望・休みのみ
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
    const newList = staffList.map(s => s.id === appUser.id ? { ...s, password: newPassword } : s);
    setStaffList(newList);
    saveMasterData(newList, shiftDefs);
    alert('パスワードを変更しました。次回ログイン時から有効です。');
    setShowPasswordChangeModal(false);
    setNewPassword('');
  };

  // Staff Management
  const handleAddStaff = () => {
    setTargetStaff({ id: null, name: '', jobTitle: '一般', roles: [] });
    setShowStaffModal(true);
  };

  const handleEditStaff = (staff) => {
    setTargetStaff({ ...staff });
    setShowStaffModal(true);
  };

  const saveStaff = () => {
    if (!targetStaff.name.trim()) {
      alert('名前を入力してください');
      return;
    }
    const newList = targetStaff.id 
      ? staffList.map(s => s.id === targetStaff.id ? targetStaff : s)
      : [...staffList, { ...targetStaff, id: Date.now().toString() }];
    setStaffList(newList);
    saveMasterData(newList, shiftDefs);
    setShowStaffModal(false);
  };

  const removeStaff = (id) => {
    if (window.confirm('この職員を削除しますか？')) {
      const newList = staffList.filter(s => s.id !== id);
      setStaffList(newList);
      saveMasterData(newList, shiftDefs);
    }
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
    saveMasterData(newStaffList, shiftDefs);
  };

  // Shift Config
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
    
    // コード変更時の処理
    if (editingShift.originalCode && editingShift.originalCode !== editingShift.code) {
      delete newDefs[editingShift.originalCode];
    }

    const { originalCode, ...cleanShift } = editingShift;

    // 新規作成の場合、orderを自動付与
    if (newDefs[cleanShift.code]?.order === undefined) {
      const maxOrder = Math.max(0, ...Object.values(newDefs).map(s => s.order || 0));
      cleanShift.order = maxOrder + 1;
    } else {
      // 既存の場合はorderを維持（フォームには含まれていない可能性があるため念のため）
      cleanShift.order = newDefs[cleanShift.code].order;
    }

    newDefs[cleanShift.code] = cleanShift;
    setShiftDefs(newDefs);
    saveMasterData(staffList, newDefs);
    
    // 修正: モーダルを閉じずにアラートを表示し、連続編集を可能にする
    alert('保存しました');
    // コードが変更された場合、editingShiftのoriginalCodeも更新しておく
    setEditingShift({ ...cleanShift, originalCode: cleanShift.code });
  };

  const deleteShiftConfig = (code) => {
    if (window.confirm(`シフト設定「${shiftDefs[code].label}」を削除しますか？`)) {
      const newDefs = { ...shiftDefs };
      delete newDefs[code];
      setShiftDefs(newDefs);
      saveMasterData(staffList, newDefs);
      if (editingShift?.originalCode === code) setShowShiftEditModal(false);
    }
  };

  const handleSortShift = (dragCode, dropCode) => {
    if (dragCode === dropCode) return;
    const dragShift = shiftDefs[dragCode];
    const dropShift = shiftDefs[dropCode];
    // 同じカテゴリ内のみ移動可能とする
    if (dragShift.category !== dropShift.category) return;

    // 現在の表示順（ソート済み）を取得
    const group = dynamicPaletteGroups.find(g => g.id === dragShift.category);
    if (!group) return;

    const items = [...group.items];
    const dragIdx = items.indexOf(dragCode);
    const dropIdx = items.indexOf(dropCode);
    if (dragIdx === -1 || dropIdx === -1) return;

    // --- 修正: カテゴリ内の既存order値を維持するロジック ---
    // 移動対象のカテゴリに含まれるアイテムが現在持っているorder値を収集・ソートして確保
    const currentOrders = items.map(code => shiftDefs[code]?.order || 0).sort((a, b) => a - b);

    // 配列内でアイテムを移動
    items.splice(dragIdx, 1);
    items.splice(dropIdx, 0, dragCode);

    // 確保しておいたorder値を、新しい並び順に合わせて再配分
    // これにより、他のカテゴリのorder値（0, 1, 2...等）と衝突しなくなります
    const newDefs = { ...shiftDefs };
    items.forEach((code, index) => {
      if (newDefs[code]) {
        newDefs[code] = { ...newDefs[code], order: currentOrders[index] };
      }
    });

    setShiftDefs(newDefs);
    saveMasterData(staffList, newDefs);
  };

  // AI
  const prepareScheduleDataForAi = () => ({
    year, month,
    staff: staffList.map(s => ({ id: s.id, name: s.name, jobTitle: s.jobTitle, roles: s.roles })),
    shifts: shiftData, tasks: taskData,
    definitions: Object.keys(shiftDefs).reduce((acc, key) => { acc[key] = { label: shiftDefs[key].label, type: shiftDefs[key].type }; return acc; }, {})
  });

  const handleAiAnalyze = async () => {
    setAiMode('analyze'); setShowAiModal(true); setIsAiLoading(true); setAiResponse('');
    const data = prepareScheduleDataForAi();
    const result = await callGemini(`勤務表分析: ${JSON.stringify(data)}`, "プロの勤務表管理者として分析・改善案を日本語で提示");
    setAiResponse(result); setIsAiLoading(false);
  };

  const handleAiMagicFill = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    const data = prepareScheduleDataForAi();
    try {
      const result = await callGemini(`現状:${JSON.stringify(data)} 指示:${aiInput} JSON({shift:{staffId:{day:code}},task:{...}})のみ出力`, "JSON出力マシーン");
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const changes = JSON.parse(match[0]);
        if (changes.shift) {
          const ns = { ...shiftData };
          Object.keys(changes.shift).forEach(s => { if(!ns[s]) ns[s]={}; Object.assign(ns[s], changes.shift[s]); });
          setShiftData(ns); saveSchedule(ns, taskData);
        }
        if (changes.task) {
          const nt = { ...taskData };
          Object.keys(changes.task).forEach(s => { if(!nt[s]) nt[s]={}; Object.assign(nt[s], changes.task[s]); });
          setTaskData(nt); saveSchedule(shiftData, nt);
        }
        setAiResponse("✅ 更新完了");
      } else { setAiResponse("⚠️ エラー"); }
    } catch (e) { console.error(e); setAiResponse("⚠️ エラー"); }
    setIsAiLoading(false);
  };

  // --- Derived Data ---
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const calendarDays = useMemo(() => generateCalendarDays(year, month), [year, month]);

  const dynamicPaletteGroups = useMemo(() => {
    const groups = {};
    Object.keys(CATEGORY_DEFS).forEach(cat => groups[cat] = []);
    Object.values(shiftDefs)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)) // orderでソート
      .forEach(shift => {
        if (groups[shift.category]) groups[shift.category].push(shift.code);
        else { if (!groups['basic']) groups['basic'] = []; groups['basic'].push(shift.code); }
      });
    return Object.keys(CATEGORY_DEFS).map(key => ({ id: key, name: CATEGORY_DEFS[key].label, items: groups[key] })).filter(g => g.items.length > 0);
  }, [shiftDefs]);
  const dynamicSummaryGroups = useMemo(() => {
    const targetCategories = ['saka', 'kimi', 'moku', 'jinkuri', 'me'];
    return targetCategories.map(catKey => {
      // 集計欄もorder順に表示するためソート
      const categoryItems = Object.values(shiftDefs)
        .filter(s => s.category === catKey && s.type === 'shift')
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .map(s => s.code);
      return { name: CATEGORY_DEFS[catKey].label, items: categoryItems, totalLabel: `${CATEGORY_DEFS[catKey].label} 計`, headerColor: CATEGORY_DEFS[catKey].color };
    });
  }, [shiftDefs]);
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

  // --- Render ---
  if (!appUser) return <LoginScreen onLogin={setAppUser} staffList={staffList} />;
  
  // 職員リストのフィルタリング
  const displayStaffList = useMemo(() => {
    let list = staffList;

    // Viewによるフィルタ
    if (currentView !== 'all') {
      const team = TEAMS.find(t => t.id === currentView);
      if (team && team.role) {
        list = list.filter(s => s.roles && s.roles.includes(team.role));
      }
    }

    // 職員個人の場合のフィルタ（全体モードでなければ適用）
    if (appUser.role === 'staff' && viewMode === 'personal') {
      list = list.filter(s => s.id === appUser.id);
    }

    return list;
  }, [staffList, currentView, appUser, viewMode]);

  const getPopupOptions = (type) => {
    // オペ班モードなら L, G のみ
    if (currentView === 'opera' && type === 'shift') {
      return [shiftDefs['L'], shiftDefs['G']].filter(Boolean);
    }

    // Left palette order
    const orderedCodes = dynamicPaletteGroups.flatMap(g => g.items);
    let opts = orderedCodes
      .map(code => shiftDefs[code])
      .filter(s => s && s.type === type);

    // 職員モードでの制限 (オペ班以外)
    if (appUser.role === 'staff' && currentView === 'all' && currentView !== 'opera') {
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

          {appUser.role === 'staff' && (
            <div className="flex bg-gray-100 rounded p-1 ml-4 border">
              <button onClick={() => { setViewMode('personal'); setCurrentView('all'); }} className={`px-3 py-1 text-xs rounded transition ${viewMode==='personal' ? 'bg-white shadow text-blue-600 font-bold':'text-gray-500 hover:bg-gray-200'}`}>個人</button>
              <button onClick={() => setViewMode('all')} className={`px-3 py-1 text-xs rounded transition ${viewMode==='all' ? 'bg-white shadow text-blue-600 font-bold':'text-gray-500 hover:bg-gray-200'}`}>全体</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
           {appUser.role === 'admin' && (
             <button onClick={() => { setEditingShift(null); handleAddNewShift(); }} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300">
               <Settings size={16} /> <span className="hidden sm:inline">シフト設定</span>
             </button>
           )}
           <button onClick={() => setShowPasswordChangeModal(true)} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300">
             <Key size={16} /> <span className="hidden sm:inline">パスワード変更</span>
           </button>
          
          {appUser.role === 'admin' && (
            <>
              <button onClick={() => { setAiMode('analyze'); setShowAiModal(true); }} className="flex items-center gap-1 px-3 py-2 bg-purple-100 text-purple-700 rounded font-bold border border-purple-300"><Sparkles size={16} /> AI分析</button>
              <button onClick={() => { setAiMode('chat'); setShowAiModal(true); }} className="flex items-center gap-1 px-3 py-2 bg-indigo-100 text-indigo-700 rounded font-bold border border-indigo-300"><MessageSquare size={16} /> AI入力</button>
              <div className="h-6 w-px bg-gray-300 mx-2"></div>
            </>
          )}
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
                                <div className="text-[10px] text-gray-500">{staff.jobTitle}</div>
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
                        <tr><td className="p-2 bg-gray-100 border-r border-b font-bold text-gray-600 text-xs text-right sticky left-0 z-10">集計</td><td colSpan={daysInMonth+1} className="bg-gray-100 border-b"></td></tr>
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
                                  return <td key={day} className="border-r border-b text-center text-xs font-bold bg-gray-50">{total > 0 ? total : '-'}</td>;
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
                                    let isAlert = false;
                                    if (code === 'L') isAlert = (!isHoliday(year, month, day) && !isSunday(year, month, day) && count === 0);
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
            className="absolute z-50 bg-white shadow-xl rounded-lg border p-2 w-64 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: Math.min(activePopup.y + 10, window.innerHeight + window.scrollY - 200), left: Math.min(activePopup.x - 100, window.innerWidth + window.scrollX - 280) }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-xs font-bold text-gray-500 mb-2 border-b pb-1">{activePopup.type === 'shift' ? 'シフト選択' : 'タスク選択'}</div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { handleUpdateCell(activePopup.staffId, activePopup.day, null, activePopup.type); setActivePopup(null); }} className="col-span-4 h-8 text-xs text-red-500 border border-red-200 bg-red-50 rounded hover:bg-red-100 mb-1">クリア</button>
              {getPopupOptions(activePopup.type).map(shift => (
                <button key={shift.code} onClick={() => { handleUpdateCell(activePopup.staffId, activePopup.day, shift.code, activePopup.type); setActivePopup(null); }} className={`h-9 w-full rounded flex items-center justify-center font-bold text-xs border transition ${shift.text} hover:bg-gray-50`} title={shift.label}>{shift.label}</button>
              ))}
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
                          {Object.keys(CATEGORY_DEFS).map(k => <option key={k} value={k}>{CATEGORY_DEFS[k].label}</option>)}
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
                            <select className="w-full border rounded" value={editingShift.startTime || ''} onChange={e => setEditingShift({...editingShift, startTime: e.target.value, time: `${e.target.value}-${editingShift.endTime}`})}>
                              <option value="">--</option>{TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div><label className="block text-xs font-bold text-blue-700">終了</label>
                            <select className="w-full border rounded" value={editingShift.endTime || ''} onChange={e => setEditingShift({...editingShift, endTime: e.target.value, time: `${editingShift.startTime}-${e.target.value}`})}>
                              <option value="">--</option>{TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
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

        {showStaffModal && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowStaffModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18}/> 職員情報</h3>
                <button onClick={() => setShowStaffModal(false)}><X size={20} className="text-gray-400"/></button>
              </div>
              <div className="p-6 space-y-4">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">名前</label><input type="text" className="w-full border p-2 rounded" value={targetStaff.name || ''} onChange={e => setTargetStaff({...targetStaff, name: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">役職</label>
                  <select className="w-full border p-2 rounded" value={targetStaff.jobTitle || '一般'} onChange={e => {
                    const newTitle = e.target.value;
                    let newRoles = targetStaff.roles ? [...targetStaff.roles] : [];
                    if(LEADER_FORCE_TITLES.includes(newTitle) && !newRoles.includes('リーダー')) newRoles.push('リーダー');
                    setTargetStaff({...targetStaff, jobTitle: newTitle, roles: newRoles});
                  }}>
                    {JOB_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">ロール</label>
                  <div className="space-y-2">{STAFF_ROLES.map(r => (
                    <label key={r} className="flex items-center gap-2"><input type="checkbox" checked={targetStaff.roles?.includes(r)} onChange={() => {
                      const roles = targetStaff.roles?.includes(r) ? targetStaff.roles.filter(x=>x!==r) : [...(targetStaff.roles||[]), r];
                      setTargetStaff({...targetStaff, roles});
                    }}/> <span className="text-sm">{r}</span></label>
                  ))}</div>
                </div>
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
                 <label className="block text-xs font-bold text-gray-500 mb-1">新しいパスワード</label>
                 <input type="text" className="w-full border p-2 rounded" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus />
               </div>
               <div className="p-4 border-t flex justify-end gap-2">
                 <button onClick={handleChangePassword} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">変更する</button>
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
                {isAiLoading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500"/></div> : (
                  <div className="space-y-4">
                    {aiMode === 'chat' && <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">💡 例: 「Aさんの土日を休みに」「Bさんの空きをPで埋めて」</div>}
                    <div className="whitespace-pre-wrap text-sm">{aiResponse}</div>
                  </div>
                )}
              </div>
              {aiMode === 'chat' && (
                <div className="p-4 border-t bg-white flex gap-2">
                  <input type="text" className="flex-1 border rounded px-3 py-2" placeholder="指示を入力..." value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAiMagicFill()} />
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