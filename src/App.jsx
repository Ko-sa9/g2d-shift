import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { Save, Trash2, Plus, ChevronLeft, ChevronRight, Calculator, Sparkles, MessageSquare, X, Send, Loader2, Edit2, Check, RotateCcw, RefreshCw, AlertTriangle, User, LogOut, Calendar as CalendarIcon, Lock, Users, Clock, Key, GripVertical, Settings, ShieldCheck, Activity, Zap, Heart, Star, ListFilter, Eraser, Palette, ArrowUp, ArrowDown, Bot, Database, HelpCircle, Wand2, Printer, Bell, FileSpreadsheet, ClipboardCopy, FileUp } from 'lucide-react';
import { buildShiftExcelXlsxBytes, buildShiftCodeTsv } from './utils/excelExport';
import { parseShiftExcelArrayBuffer, computeExcelImportPlan } from './utils/excelImport';
import { validateShiftCode, migrateMasterDataShiftCode, migrateScheduleDocShiftCode } from './utils/shiftCodeMigration';
import { WheelTimeInput, WheelDurationInput } from './components/WheelTimePicker';
import { buildUndoHistoryKey, loadUndoHistory, saveUndoHistory, deleteUndoHistory, clearAllUndoHistories } from './utils/undoHistoryStorage';
import { auth, db, appId } from './firebase'; 
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, collection, setDoc, onSnapshot, updateDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
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
  'saka':    { id: 'saka',    label: '坂田',    color: 'bg-blue-50 text-blue-800',   order: 1, kind: 'facility' },
  'kimi':    { id: 'kimi',    label: '君津',    color: 'bg-green-50 text-green-800',  order: 2, kind: 'facility' },
  'kikuri':  { id: 'kikuri',  label: '木クリ',  color: 'bg-yellow-50 text-yellow-800', order: 3, kind: 'facility' },
  'jinkuri': { id: 'jinkuri', label: 'じんクリ', color: 'bg-purple-50 text-purple-800', order: 4, kind: 'facility' },
  'me':      { id: 'me',      label: 'ME室',    color: 'bg-red-50 text-red-800',     order: 5, kind: 'me' },
  'basic':   { id: 'basic',   label: 'その他',   color: 'bg-gray-50 text-gray-800',    order: 6, kind: 'basic' },
  'off':     { id: 'off',     label: '休み',    color: 'bg-gray-100 text-gray-500',   order: 7, kind: 'off' },
  'role':    { id: 'role',    label: '役割',    color: 'bg-gray-50 text-gray-800',    order: 8, kind: 'role' },
  'req':     { id: 'req',     label: '希望',    color: 'bg-pink-50 text-pink-600',    order: 9, kind: 'req' },
};

const DEFAULT_SHIFT_TYPES = {
  'A': { order: 0, code: 'A', label: '坂3', color: 'bg-transparent', text: 'text-blue-600', startTime: '07:50', endTime: '22:00', overtime: 0, time: '07:50-22:00', category: 'saka', type: 'shift', shiftSlot: 'cool3' },
  'P': { order: 1, code: 'P', label: '坂2', color: 'bg-transparent', text: 'text-blue-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'saka', type: 'shift', shiftSlot: 'cool2' },
  'C': { order: 2, code: 'C', label: '坂日', color: 'bg-transparent', text: 'text-blue-800', startTime: '07:20', endTime: '16:00', overtime: 0, time: '07:20-16:00', category: 'saka', type: 'shift', shiftSlot: 'day' },
  'F': { order: 3, code: 'F', label: '君3', color: 'bg-transparent', text: 'text-green-600', startTime: '07:50', endTime: '22:00', overtime: 0, time: '07:50-22:00', category: 'kimi', type: 'shift', shiftSlot: 'cool3' },
  'B': { order: 4, code: 'B', label: '君2', color: 'bg-transparent', text: 'text-green-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'kimi', type: 'shift', shiftSlot: 'cool2' },
  'D': { order: 5, code: 'D', label: '君日', color: 'bg-transparent', text: 'text-green-800', startTime: '07:20', endTime: '16:00', overtime: 0, time: '07:20-16:00', category: 'kimi', type: 'shift', shiftSlot: 'day' },
  'I': { order: 6, code: 'I', label: '木2', color: 'bg-transparent', text: 'text-yellow-600', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'kikuri', type: 'shift', shiftSlot: 'cool2' },
  'K': { order: 7, code: 'K', label: '木日', color: 'bg-transparent', text: 'text-yellow-700', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'kikuri', type: 'shift', shiftSlot: 'day' },
  'Z2': { order: 8, code: 'Z2', label: 'じ',   color: 'bg-transparent', text: 'text-purple-600', startTime: '13:30', endTime: '', overtime: 0, time: '13:30-', category: 'jinkuri', type: 'shift', shiftSlot: 'other' },
  'Z1': { order: 9, code: 'Z1', label: 'じ半', color: 'bg-transparent', text: 'text-purple-700', startTime: '', endTime: '', overtime: 0, time: 'Short', category: 'jinkuri', type: 'shift', shiftSlot: 'half' },
  'L':  { order: 10, code: 'L',  label: 'L',    color: 'bg-transparent', text: 'text-red-600',    startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'me', type: 'shift', shiftSlot: 'day' },
  'G':  { order: 11, code: 'G',  label: 'G',    color: 'bg-transparent', text: 'text-orange-600', startTime: '07:50', endTime: '18:00', overtime: 0, time: '07:50-18:00', category: 'me', type: 'shift', shiftSlot: 'day' },
  '/':  { order: 12, code: '/',  label: '出勤', color: 'bg-transparent', text: 'text-gray-800',   startTime: '', endTime: '', overtime: 0, time: '-', category: 'basic', type: 'shift', shiftSlot: 'other' },
  'O':  { order: 13, code: 'O',  label: '公出', color: 'bg-transparent', text: 'text-indigo-700', startTime: '', endTime: '', overtime: 0, time: '-', category: 'basic', type: 'shift', shiftSlot: 'other' },
  'S':  { order: 14, code: 'S',  label: '指定', color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift', offSubType: 'regular_off' },
  'H':  { order: 15, code: 'H',  label: '振休', color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift', offSubType: 'regular_off' },
  'Y':  { order: 16, code: 'Y',  label: '年休', color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift', offSubType: 'paid_leave' },
  'R':  { order: 17, code: 'R',  label: 'リフレ',color: 'bg-transparent', text: 'text-red-400',   startTime: '', endTime: '', overtime: 0, time: 'Off', category: 'off', type: 'shift', offSubType: 'paid_leave' },
  'HOPE': { order: 18, code: 'HOPE', label: '希望', color: 'bg-pink-100', text: 'text-pink-600', startTime: '', endTime: '', overtime: 0, time: 'Request', category: 'req', type: 'shift', offSubType: 'regular_off' },
  
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

const PRINT_PAPER_PRESETS = {
  A4: { label: 'A4', shortMm: 210, longMm: 297 },
  B4: { label: 'B4 (JIS)', shortMm: 257, longMm: 364 },
  A3: { label: 'A3', shortMm: 297, longMm: 420 },
};
const PRINT_MARGIN_MM = 6;
const PRINT_PX_PER_MM = 96 / 25.4;

// 画面のドロップダウン等で選択できるAIモデルのリストを定義します
// ユーザーが用途に合わせてAIの性能を選べるようにするための設定です
const AI_MODELS = [
  { value: 'gemini-4-carbon', label: 'Gemini 4 Carbon (最高性能・深層推論)' },
  { value: 'gemini-4-argon', label: 'Gemini 4 Argon (高精度・バランス実績あり)' },
  { value: 'gemini-4-neon', label: 'Gemini 4 Neon (高速・バランス型)' },
  { value: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (最速・軽量・無料枠対応)' },
];

const CATEGORY_KIND_OPTIONS = [
  { value: 'facility', label: '透析・勤務施設（AI配置・人数・スキル・スコア対象）', shortLabel: '勤務施設' },
  { value: 'me', label: 'ME室・オペ班枠（OPE班管理・AI自動配置対象外）', shortLabel: 'ME室' },
  { value: 'basic', label: 'その他（出勤・公出など・管理者/個人入力用・AI自動配置対象外）', shortLabel: 'その他' },
  { value: 'off', label: '休み（指定休・振休・年休・リフレ等）', shortLabel: '休み' },
  { value: 'req', label: '希望（休み希望など）', shortLabel: '希望' },
  { value: 'role', label: '役割・タスク（セル下段タスク）', shortLabel: '役割タスク' },
];

const SHIFT_WORK_SLOTS = [
  { value: 'cool3', label: '3クール', badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'cool2', label: '2クール', badgeClass: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'day',   label: '日勤',    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'half',  label: '半日',    badgeClass: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'other', label: 'その他',  badgeClass: 'bg-gray-100 text-gray-600 border-gray-200' },
];

const CONTRACT_WORK_DAY_OPTIONS = [0, 1, 2, 3, 4, 5];
const COOL3_LIMIT_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
// 残業・開始/終了時刻は WheelTimePicker（1分刻みドラムロール式）を使用
const FACILITY_POWER_TARGET_OPTIONS = Array.from({ length: 41 }, (_, i) => i * 5);
const SHIFT_TARGET_COUNT_OPTIONS = Array.from({ length: 21 }, (_, i) => i);
const SKILL_TARGET_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5];
const ROLE_FACILITY_TARGET_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// 既定候補に含まれない既存の保存数値も選択肢として保持するヘルパー
const buildNumericOptions = (baseOptions, currentValue) => {
  if (currentValue === '' || currentValue === null || currentValue === undefined) {
    return baseOptions;
  }
  const num = Number(currentValue);
  if (!Number.isFinite(num) || baseOptions.includes(num)) {
    return baseOptions;
  }
  return [...baseOptions, num].sort((a, b) => a - b);
};



const INITIAL_STAFF = [
  { id: '1', loginId: '1', name: '職員A', jobTitle: '副技士長', roles: ['オペ班'], skills: { isLeader: true, isVeteran: true }, password: '1234', maxCool3: 5 },
  { id: '2', loginId: '2', name: '職員B', jobTitle: '主任', roles: ['エコー班'], skills: { isLeader: true, canEcho: true }, password: '1234', maxCool3: 5 },
  { id: '3', loginId: '3', name: '職員C', jobTitle: '一般', roles: [], skills: { canMachine: true }, password: '1234', maxCool3: 5 },
  { id: '4', loginId: '4', name: '職員D', jobTitle: '一般', roles: [], skills: { canFollow: true }, password: '1234', maxCool3: 5 },
  { id: '5', loginId: '5', name: '職員E', jobTitle: '一般', roles: [], skills: {}, password: '1234', maxCool3: 5 },
  { id: '6', loginId: '6', name: '職員F', jobTitle: 'パート', roles: [], skills: {}, password: '1234', maxCool3: 0, excludeFromAi: true },
];

const TEAM_ADMIN_LABELS = {
  all: '全体管理者',
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

const DEFAULT_FACILITY_POWER_TARGETS = {
  saka: 30,
  kimi: 30,
  kikuri: 40,
  jinkuri: 0,
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
  'facilityPowerTargets': DEFAULT_FACILITY_POWER_TARGETS, // 施設ごとの目標パワースコア目安
  'facilitySplitDays': {},      // 施設ごとの必要人数曜日区分モード ('uniform' | 'mwf_tts' | 'daily')
  'teamAllowedShifts': {},      // 各班管理者(ope/echo/hhd)が入力可能なシフトコード配列
  'teamAllowedTasks': {},       // 各班管理者(ope/echo/hhd)が入力可能なタスクコード配列
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

// ------------------------------------------------------------------
// カスタムシフト設定・カテゴリ設定の動的解決ヘルパー群（初期設定との差異に完全対応）
// ------------------------------------------------------------------

const resolveCategoryKind = (cat) => {
  if (!cat) return 'basic';
  if (CATEGORY_KIND_OPTIONS.some(o => o.value === cat.kind)) {
    return cat.kind;
  }
  const id = String(cat.id || '').trim();
  const lbl = String(cat.label || '').trim();
  if (id === 'role' || lbl.includes('役割') || lbl.includes('タスク')) return 'role';
  if (id === 'req' || lbl.includes('希望')) return 'req';
  if (id === 'off' || (lbl.includes('休') && !lbl.includes('休診'))) return 'off';
  if (id === 'me' || lbl.toUpperCase().includes('ME') || lbl.includes('オペ')) return 'me';
  if (id === 'basic' || lbl === 'その他') return 'basic';
  return 'facility';
};

const getCategoryKindById = (catId, categoryDefs = {}) => {
  if (!catId) return 'basic';
  if (categoryDefs && categoryDefs[catId]) {
    return resolveCategoryKind(categoryDefs[catId]);
  }
  return resolveCategoryKind({ id: catId, label: '' });
};

const isOffOrReqCategoryId = (catId, categoryDefs = {}) => {
  const kind = getCategoryKindById(catId, categoryDefs);
  return kind === 'off' || kind === 'req';
};

const isReqCategoryId = (catId, categoryDefs = {}) => {
  return getCategoryKindById(catId, categoryDefs) === 'req';
};

const getEffectiveShiftType = (def, categoryDefs = {}) => {
  if (!def) return 'shift';
  if (def.type === 'task' || def.type === 'shift') return def.type;
  return getCategoryKindById(def.category, categoryDefs) === 'role' || String(def.code || '').startsWith('task_')
    ? 'task'
    : 'shift';
};

// 施設シフト以外の出勤希望・業務シフト（委・日勤・3以外・出勤など＝休み扱いではなく出勤扱いにするシフト）を判定
const isWorkRequestShiftDef = (def, categoryDefs = {}) => {
  if (!def) return false;
  if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return false;
  const lbl = String(def.label || '').trim();
  if (!lbl) return false;
  if (lbl.includes('公出') || (def.code === 'O' && lbl === 'O' && getCategoryKindById(def.category, categoryDefs) === 'basic')) {
    return false;
  }
  const catKind = getCategoryKindById(def.category, categoryDefs);
  if (catKind === 'facility' || catKind === 'me') return false;
  if (def.isWorkRequest === true) return true;
  if (
    lbl.includes('休') ||
    lbl === '希望' ||
    lbl === '有' ||
    lbl.includes('有給') ||
    lbl.includes('年休') ||
    lbl.includes('夏') ||
    lbl.includes('リフ')
  ) {
    return false;
  }
  if (
    lbl === '委' ||
    lbl.includes('委員') ||
    lbl === '日勤' ||
    lbl.includes('日勤') ||
    lbl.includes('3以外') ||
    lbl.includes('３以外') ||
    lbl.includes('3クール以外') ||
    lbl.includes('３クール以外') ||
    lbl.includes('2まで') ||
    lbl.includes('２まで') ||
    lbl === '出勤' ||
    lbl === '出張' ||
    lbl === '研' ||
    lbl.includes('研修') ||
    catKind === 'basic'
  ) {
    return true;
  }
  return false;
};

// 純粋な休み・休み希望シフトかどうかを判定（出勤希望扱いの「委・日勤・3以外・出勤」は除外）
const isTrueOffShiftDef = (def, categoryDefs = {}) => {
  if (!def) return false;
  if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return false;
  if (isWorkRequestShiftDef(def, categoryDefs)) return false;
  return isOffOrReqCategoryId(def.category, categoryDefs);
};

const resolveShiftWorkSlot = (def, categoryDefs = {}) => {
  if (!def) return null;
  if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return null;
  if (isTrueOffShiftDef(def, categoryDefs) || isKoushutsuShiftDef(def, categoryDefs)) return null;

  if (def.shiftSlot === 'cool1') return 'day';
  if (SHIFT_WORK_SLOTS.some(s => s.value === def.shiftSlot)) {
    return def.shiftSlot;
  }

  // 未設定データ向けの自動推定（コードではなく実際の終了時刻・表示名を優先し、初期設定のままの時のみA=坂3/F=君3を判定）
  if (def.endTime && def.endTime >= '21:00') return 'cool3';
  const lbl = String(def.label || '').trim();
  if (lbl.includes('3以外') || lbl.includes('３以外') || lbl.includes('3クール以外') || lbl.includes('３クール以外')) return 'other';
  if ((def.code === 'A' && lbl === '坂3') || (def.code === 'F' && lbl === '君3')) return 'cool3';
  if (lbl.includes('3') || lbl.includes('３')) return 'cool3';
  if (lbl.includes('2') || lbl.includes('２')) return 'cool2';
  if (lbl.includes('半') || def.time === 'Short') return 'half';
  if (lbl.includes('1') || lbl.includes('１') || lbl.includes('日')) return 'day';
  return 'other';
};

const getShiftWorkSlotMeta = (slotValue) => {
  return SHIFT_WORK_SLOTS.find(s => s.value === slotValue) || SHIFT_WORK_SLOTS[SHIFT_WORK_SLOTS.length - 1];
};

const isCool3ShiftDef = (def, categoryDefs = {}) => {
  if (!def || getCategoryKindById(def.category, categoryDefs) !== 'facility') return false;
  return resolveShiftWorkSlot(def, categoryDefs) === 'cool3';
};

const resolveOffSubType = (def, categoryDefs = {}) => {
  if (!def) return null;
  if (isWorkRequestShiftDef(def, categoryDefs)) return null;
  if (isKoushutsuShiftDef(def, categoryDefs)) return 'paid_leave';
  const catKind = getCategoryKindById(def.category, categoryDefs);
  if (catKind === 'off' || catKind === 'req') return 'regular_off';
  return null;
};

const isPaidLeaveShiftDef = (def, categoryDefs = {}) => {
  return isKoushutsuShiftDef(def, categoryDefs);
};

const isMeShiftDef = (code, shiftDefs = {}, categoryDefs = {}) => {
  if (!code || !shiftDefs[code]) return false;
  const def = shiftDefs[code];
  if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return false;
  const catKind = getCategoryKindById(def.category, categoryDefs);
  if (catKind === 'me') return true;
  if (catKind === 'off' || catKind === 'req' || catKind === 'role') return false;
  // 透析施設カテゴリに明示所属するシフト（表示名がA〜G等のアルファベットである場合を含む）をME室と誤認しないよう保護
  if (catKind === 'facility' && categoryDefs && categoryDefs[def.category]) return false;
  const normLabel = String(def.label || '').trim();
  return (
    normLabel === 'L' ||
    normLabel === 'G' ||
    normLabel === 'Ｌ' ||
    normLabel === 'Ｇ' ||
    ((code === 'L' || code === 'G') && normLabel === code)
  );
};

// スタッフがME班（オペ班）に所属しているかどうかを判定
const isMeTeamMember = (staff) =>
  Boolean(
    staff &&
    Array.isArray(staff.roles) &&
    (staff.roles.includes('オペ班') || staff.roles.includes('ME班'))
  );

const LIGHT_BG_CLASS_BY_HUE = {
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  yellow: 'bg-yellow-100',
  purple: 'bg-purple-100',
  red: 'bg-red-100',
  pink: 'bg-pink-100',
  orange: 'bg-orange-100',
  indigo: 'bg-indigo-100',
  teal: 'bg-teal-100',
  sky: 'bg-sky-100',
  emerald: 'bg-emerald-100',
  amber: 'bg-amber-100',
  gray: 'bg-gray-200',
};

const extractColorHue = (classStr = '', ignoreGray = true) => {
  const matches = String(classStr || '').match(/\b(?:text|bg)-([a-z]+)-\d+\b/g) || [];
  for (const cls of matches) {
    const hue = cls.split('-')[1];
    if (hue && (!ignoreGray || hue !== 'gray') && LIGHT_BG_CLASS_BY_HUE[hue]) {
      return hue;
    }
  }
  return null;
};

// 各施設のリーダー背景色は施設固有の色で固定し、シフトの文字色（shiftDef.text）を変えても変動しないようにする
const resolveLightBgFromShiftOrCategory = (_shiftDef, categoryDef) => {
  const catHue = extractColorHue(categoryDef?.color, true);
  if (catHue) return LIGHT_BG_CLASS_BY_HUE[catHue];
  const id = String(categoryDef?.id || '').trim();
  const lbl = String(categoryDef?.label || '').trim();
  if (id === 'saka' || lbl.includes('坂')) return 'bg-blue-100';
  if (id === 'kimi' || lbl.includes('君')) return 'bg-green-100';
  if (id === 'kikuri' || lbl.includes('木')) return 'bg-yellow-100';
  if (id === 'jinkuri' || lbl.includes('じん') || lbl.includes('腎')) return 'bg-purple-100';
  return 'bg-blue-100';
};

const getStaffPowerScore = (staff) => {
  if (!staff || !staff.skills) return 0;
  const pts = { isLeader: 5, isVeteran: 3, canEcho: 2, canMachine: 2, canFollow: 1 };
  return Object.keys(pts).reduce((sum, k) => sum + (staff.skills[k] ? pts[k] : 0), 0);
};

// パート職員の週単位契約出勤日数（下限〜上限）を取得（パート以外または未設定時は null）
const getPartTimeWeeklyContractRange = (staff) => {
  if (!staff || staff.jobTitle !== 'パート') return null;
  const rawMin =
    staff.contractWorkDaysMin !== undefined && staff.contractWorkDaysMin !== ''
      ? staff.contractWorkDaysMin
      : staff.contractWorkDays;
  const rawMax =
    staff.contractWorkDaysMax !== undefined && staff.contractWorkDaysMax !== ''
      ? staff.contractWorkDaysMax
      : staff.contractWorkDays;
  const hasMin = rawMin !== undefined && rawMin !== null && rawMin !== '';
  const hasMax = rawMax !== undefined && rawMax !== null && rawMax !== '';
  if (!hasMin && !hasMax) return null;
  const numMin = hasMin ? Number(rawMin) : null;
  const numMax = hasMax ? Number(rawMax) : null;
  if ((numMin === null || numMin <= 0) && (numMax === null || numMax <= 0)) return null;
  const effMin = hasMin ? Math.max(0, Math.min(6, numMin)) : Math.max(0, Math.min(6, numMax));
  const effMax = hasMax ? Math.max(0, Math.min(6, numMax)) : Math.max(0, Math.min(6, numMin));
  return {
    min: Math.min(effMin, effMax),
    max: Math.max(effMin, effMax),
  };
};

// スタッフの3クール希望回数バッジ表示情報（幅がある場合は「○〜○回」、上下限一致時は「○回」）
const getCool3BadgeInfo = (staff) => {
  if (!staff) return null;
  const rawMin = Number(staff.minCool3 ?? 0);
  const rawMax = Number(staff.maxCool3 ?? 5);
  const min = Number.isFinite(rawMin) ? Math.max(0, rawMin) : 0;
  const max = Number.isFinite(rawMax) ? Math.max(min, rawMax) : Math.max(min, 5);
  if (min === 0 && max === 0 && staff.jobTitle === 'パート') return null;
  const rangeText = min === max ? `${min}回` : `${min}〜${max}回`;
  return {
    min,
    max,
    rangeText,
    label: `3ｸｰﾙ:${rangeText}`,
    title: min === max ? `3クール希望数: ${min}回` : `3クール希望数: 下限${min}回〜上限${max}回`,
  };
};

// じんクリ施設カテゴリかどうかを判定（役割設定で月水金・火木土に分割する対象）
const isJinkuriFacilityCategory = (cat) => {
  if (!cat || resolveCategoryKind(cat) !== 'facility') return false;
  const id = String(cat.id || '').trim();
  const lbl = String(cat.label || '').trim();
  return id === 'jinkuri' || lbl.includes('じん') || lbl.includes('腎');
};

// 木クリ施設カテゴリかどうかを判定（2クール以下施設のうちリーダー1名以上必須の対象）
const isKikuriFacilityCategory = (cat) => {
  if (!cat || resolveCategoryKind(cat) !== 'facility') return false;
  const id = String(cat.id || '').trim().toLowerCase();
  const lbl = String(cat.label || '').trim();
  return id === 'kikuri' || lbl.includes('木クリ') || lbl.includes('木更津');
};

// 役割（タスク）に設定された施設別の必要人数マップ（じんクリは _mwf / _tts 分割対応・1名以上）を取得
const getRoleFacilityTargets = (taskDef, categoryDefs = {}) => {
  if (!taskDef || !taskDef.facilityTargets || typeof taskDef.facilityTargets !== 'object') return {};
  const raw = taskDef.facilityTargets;
  const result = {};
  Object.values(categoryDefs).forEach(cat => {
    if (!cat || resolveCategoryKind(cat) !== 'facility') return;
    if (isJinkuriFacilityCategory(cat)) {
      const mwfKey = `${cat.id}_mwf`;
      const ttsKey = `${cat.id}_tts`;
      const hasSplit = raw[mwfKey] !== undefined || raw[ttsKey] !== undefined;
      const mwfNum = Math.floor(Number(hasSplit ? raw[mwfKey] : raw[cat.id]) || 0);
      const ttsNum = Math.floor(Number(hasSplit ? raw[ttsKey] : raw[cat.id]) || 0);
      if (mwfNum > 0) result[mwfKey] = mwfNum;
      if (ttsNum > 0) result[ttsKey] = ttsNum;
    } else {
      const num = Math.floor(Number(raw[cat.id]) || 0);
      if (num > 0) result[cat.id] = num;
    }
  });
  return result;
};

// 特定の曜日(dow: 1..6)における対象施設の役割必要数を取得
const getRoleFacilityTargetForDow = (normalizedTargets = {}, cat, dow) => {
  if (!cat || resolveCategoryKind(cat) !== 'facility' || dow === 0) return 0;
  if (isJinkuriFacilityCategory(cat)) {
    if (dow === 1 || dow === 3 || dow === 5) return normalizedTargets[`${cat.id}_mwf`] || 0;
    if (dow === 2 || dow === 4 || dow === 6) return normalizedTargets[`${cat.id}_tts`] || 0;
    return 0;
  }
  return normalizedTargets[cat.id] || 0;
};

// 役割（タスク）の全施設合計必要人数（月水金 / 火木土）を取得
const getRoleTotalTargetInfo = (taskDef, categoryDefs = {}) => {
  const targets = getRoleFacilityTargets(taskDef, categoryDefs);
  let mwfTotal = 0;
  let ttsTotal = 0;
  Object.values(categoryDefs).forEach(cat => {
    if (!cat || resolveCategoryKind(cat) !== 'facility') return;
    mwfTotal += getRoleFacilityTargetForDow(targets, cat, 1);
    ttsTotal += getRoleFacilityTargetForDow(targets, cat, 2);
  });
  return {
    mwfTotal,
    ttsTotal,
    maxTotal: Math.max(mwfTotal, ttsTotal),
    isSame: mwfTotal === ttsTotal,
    summaryLabel:
      mwfTotal === 0 && ttsTotal === 0
        ? ''
        : mwfTotal === ttsTotal
          ? `${mwfTotal}名`
          : `月水金${mwfTotal}名 / 火木土${ttsTotal}名`,
    shortBadgeLabel:
      mwfTotal === 0 && ttsTotal === 0
        ? ''
        : mwfTotal === ttsTotal
          ? `要${mwfTotal}`
          : `要:月水金${mwfTotal}/火木土${ttsTotal}`,
  };
};

// 年間の有休（年休・有給）に該当するシフト定義かどうかを判定
const isAnnualPaidLeaveShiftDef = (def, categoryDefs = {}) => {
  if (!def) return false;
  if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return false;
  const lbl = String(def.label || '').trim();
  if (lbl.includes('年休') || lbl.includes('有休') || lbl.includes('有給') || lbl === '有' || lbl === '年') {
    return true;
  }
  if (def.code === 'Y' && getCategoryKindById(def.category, categoryDefs) === 'off') {
    return true;
  }
  return false;
};

const isLeaderHighlightTargetFacility = (cat) => {
  if (!cat || resolveCategoryKind(cat) !== 'facility') return false;
  const id = String(cat.id || '').trim();
  const lbl = String(cat.label || '').trim();
  return id === 'saka' || id === 'kimi' || lbl.includes('坂') || lbl.includes('君');
};

const isMeHighlightTargetShiftDef = (code, isHol, shiftDefs = {}, categoryDefs = {}) => {
  if (!code || !shiftDefs[code] || !isMeShiftDef(code, shiftDefs, categoryDefs)) return false;
  const normLabel = String(shiftDefs[code].label || '').trim();
  if (isHol) {
    return normLabel === 'G' || normLabel === 'Ｇ' || (code === 'G' && normLabel === 'G');
  }
  return normLabel === 'L' || normLabel === 'Ｌ' || (code === 'L' && normLabel === 'L');
};

const getHolidayMeTargetCount = (code, shiftDefs = {}, categoryDefs = {}, fallbackCount = 0) => {
  const def = shiftDefs[code];
  if (!def || !isMeShiftDef(code, shiftDefs, categoryDefs)) return fallbackCount;
  const normLabel = String(def.label || '').trim();
  if (normLabel === 'G' || normLabel === 'Ｇ' || (code === 'G' && normLabel === 'G')) return 1;
  if (normLabel === 'L' || normLabel === 'Ｌ' || (code === 'L' && normLabel === 'L')) return 0;
  return fallbackCount;
};

// 公出シフト判定ヘルパー（カスタムコード設定にも表示名から自動追従。公出は出勤人数・出勤日数・連勤に数えず公休と同枠として扱う）
const isKoushutsuShiftDef = (def, categoryDefs = {}) => {
  if (!def) return false;
  if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return false;
  const lbl = String(def.label || '').trim();
  if (lbl.includes('公出')) return true;
  if (def.code === 'O' && lbl === 'O' && getCategoryKindById(def.category, categoryDefs) === 'basic') return true;
  return false;
};

// 休み・希望休・または公出（＝出勤日数・連勤・日別出勤人数にカウントしないシフト）かどうかを判定
// ※施設シフト以外の「委・日勤・3以外・出勤」は出勤希望（出勤扱い）のためfalseを返す
const isNonWorkOrKoushutsuShiftDef = (def, categoryDefs = {}) => {
  if (!def) return true;
  if (isWorkRequestShiftDef(def, categoryDefs)) return false;
  return isOffOrReqCategoryId(def.category, categoryDefs) || isKoushutsuShiftDef(def, categoryDefs);
};

// AIが新規割り当て・入れ替え可能なシフトかどうかを判定（勤務施設カテゴリのみ対象とし、ME室・その他(出勤/公出)・休み・希望をすべて除外）
const isAiAssignableFacilityShiftDef = (code, shiftDefs = {}, categoryDefs = {}) => {
  if (!code || !shiftDefs[code]) return false;
  const def = shiftDefs[code];
  if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return false;
  if (getCategoryKindById(def.category, categoryDefs) !== 'facility') return false;
  if (isMeShiftDef(code, shiftDefs, categoryDefs)) return false;
  return true;
};

const getFacilityTargetPowerScore = (cat, adminSettings = {}) => {
  if (!cat || resolveCategoryKind(cat) !== 'facility') return 0;
  const customMap = adminSettings?.facilityPowerTargets;
  if (customMap && customMap[cat.id] !== undefined && customMap[cat.id] !== '') {
    return Math.max(0, parseInt(customMap[cat.id], 10) || 0);
  }
  if (DEFAULT_FACILITY_POWER_TARGETS[cat.id] !== undefined) {
    return DEFAULT_FACILITY_POWER_TARGETS[cat.id];
  }
  const lbl = String(cat.label || '').trim();
  if (lbl.includes('じん') || lbl.includes('腎')) return 0;
  if (lbl.includes('木')) return 40;
  if (lbl.includes('坂') || lbl.includes('君')) return 30;
  return 0;
};

// 案A: 固定の30点・40点ではなく、その日の出勤スタッフ全体の1人あたり平均スコアと各施設の人数比から動的に期待スコア・施設間偏りを算出
const evaluateDailyFacilityPowerBalance = ({
  facilityCats = [],
  shiftDefs = {},
  categoryDefs = {},
  actualHeadcountByCat = {},
  powerScoreByCat = {},
  readTargetCount = () => 0,
  adminSettings = {},
  fallbackStaffAvgScore = 10,
}) => {
  const enabledCats = facilityCats.filter(cat => getFacilityTargetPowerScore(cat, adminSettings) > 0);
  let totalAssignedHc = 0;
  let totalAssignedScore = 0;
  const catStats = {};

  enabledCats.forEach(cat => {
    const codes = Object.values(shiftDefs)
      .filter(sd => sd && getEffectiveShiftType(sd, categoryDefs) === 'shift' && sd.category === cat.id)
      .map(sd => sd.code);
    const targetHc = codes.reduce((sum, c) => sum + readTargetCount(c), 0);
    const actualHc = actualHeadcountByCat[cat.id] || 0;
    const actualScore = powerScoreByCat[cat.id] || 0;
    const isActive = targetHc > 0 || actualHc > 0;
    if (actualHc > 0) {
      totalAssignedHc += actualHc;
      totalAssignedScore += actualScore;
    }
    catStats[cat.id] = {
      catId: cat.id,
      label: cat.label,
      targetHc,
      actualHc,
      actualScore,
      actualAvg: actualHc > 0 ? actualScore / actualHc : 0,
      isActive,
      isEnabled: true,
    };
  });

  const dayAvgScore = totalAssignedHc > 0 ? totalAssignedScore / totalAssignedHc : fallbackStaffAvgScore;
  const activeWithStaff = Object.values(catStats).filter(st => st.isActive && st.actualHc > 0);
  const maxFacAvg = activeWithStaff.length > 0 ? Math.max(...activeWithStaff.map(st => st.actualAvg)) : dayAvgScore;
  const minFacAvg = activeWithStaff.length > 0 ? Math.min(...activeWithStaff.map(st => st.actualAvg)) : dayAvgScore;
  const maxFacObj = activeWithStaff.find(st => st.actualAvg === maxFacAvg) || null;

  const byCat = {};
  const imbalancedItems = [];

  facilityCats.forEach(cat => {
    const st = catStats[cat.id];
    if (!st) {
      const actualHc = actualHeadcountByCat[cat.id] || 0;
      const actualScore = powerScoreByCat[cat.id] || 0;
      byCat[cat.id] = {
        catId: cat.id,
        label: cat.label,
        isEnabled: false,
        isActive: actualHc > 0,
        actualHc,
        targetHc: 0,
        actualScore,
        expectedScore: 0,
        actualAvg: actualHc > 0 ? Number((actualScore / actualHc).toFixed(1)) : 0,
        dayAvg: Number(dayAvgScore.toFixed(1)),
        diffFromDayAvg: 0,
        isImbalancedLow: false,
        isImbalancedHigh: false,
      };
      return;
    }

    const refHc = st.actualHc > 0 ? st.actualHc : st.targetHc;
    const expectedScore = refHc > 0 ? Math.round(dayAvgScore * refHc) : 0;
    const diffFromDayAvg = st.actualHc > 0 ? st.actualAvg - dayAvgScore : 0;
    const gapFromMax = st.actualHc > 0 ? maxFacAvg - st.actualAvg : 0;

    // 2施設以上稼働している日に、1人あたり平均が当日全体平均より0.9点以上低い、または最高施設と1.6点以上差がある場合は「低スコア偏り」
    const isImbalancedLow =
      activeWithStaff.length >= 2 &&
      st.actualHc > 0 &&
      (dayAvgScore - st.actualAvg >= 0.9 || gapFromMax >= 1.6);

    const isImbalancedHigh =
      activeWithStaff.length >= 2 &&
      st.actualHc > 0 &&
      (st.actualAvg - dayAvgScore >= 1.0 || (st.actualAvg === maxFacAvg && maxFacAvg - minFacAvg >= 1.6));

    byCat[cat.id] = {
      catId: cat.id,
      label: cat.label,
      isEnabled: true,
      isActive: st.isActive,
      actualHc: st.actualHc,
      targetHc: st.targetHc,
      actualScore: st.actualScore,
      expectedScore,
      actualAvg: Number(st.actualAvg.toFixed(1)),
      dayAvg: Number(dayAvgScore.toFixed(1)),
      diffFromDayAvg: Number(diffFromDayAvg.toFixed(1)),
      isImbalancedLow,
      isImbalancedHigh,
      highFacilityLabel: maxFacObj && maxFacObj.catId !== cat.id ? maxFacObj.label : null,
      highFacilityAvg: maxFacObj ? Number(maxFacObj.actualAvg.toFixed(1)) : Number(dayAvgScore.toFixed(1)),
    };

    if (isImbalancedLow) {
      const highHint =
        maxFacObj && maxFacObj.catId !== cat.id
          ? `（当日平均${dayAvgScore.toFixed(1)}点/人・${maxFacObj.label}平均${maxFacObj.actualAvg.toFixed(1)}点に高スコア集中）`
          : `（当日平均${dayAvgScore.toFixed(1)}点/人）`;
      imbalancedItems.push(
        `${cat.label} ${st.actualScore}/目安${expectedScore}点 [平均${st.actualAvg.toFixed(1)}点]${highHint}`
      );
    }
  });

  return {
    dayAvgScore: Number(dayAvgScore.toFixed(1)),
    maxFacAvg: Number(maxFacAvg.toFixed(1)),
    minFacAvg: Number(minFacAvg.toFixed(1)),
    byCat,
    imbalancedItems,
  };
};

const resolveFacilitySkillTarget = (cat, skillKey, adminSettings = {}) => {
  if (!cat || resolveCategoryKind(cat) !== 'facility') return 0;
  const customMap = adminSettings?.facilitySkillTargets;
  if (customMap && customMap[cat.id] && customMap[cat.id][skillKey] !== undefined) {
    return Math.max(0, parseInt(customMap[cat.id][skillKey], 10) || 0);
  }
  if (DEFAULT_FACILITY_SKILL_TARGETS[cat.id]?.[skillKey] !== undefined) {
    return DEFAULT_FACILITY_SKILL_TARGETS[cat.id][skillKey];
  }
  if (skillKey === 'isLeader') {
    const lbl = String(cat.label || '').trim();
    if (lbl.includes('坂') || lbl.includes('君') || lbl.includes('木')) return 1;
  }
  return 0;
};

// 配列の順序をランダムにシャッフルした新しい配列を返すヘルパー（AIの機械的な名簿順・施設順の固まり配置を防ぐ）
const shuffleArray = (items = []) => {
  const arr = Array.isArray(items) ? [...items] : [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// AIが万一シフトコードではなく画面表示名（例: コード"1"の代わりに表示名"A"）を出力した場合でも安全に解決するヘルパー
const resolveAiOutputCode = (rawVal, shiftDefs = {}, categoryDefs = {}, expectedType = 'shift', staffObj = null) => {
  if (rawVal === null || rawVal === undefined) return null;
  const rawStr = String(rawVal).trim();
  if (!rawStr || rawStr === 'CLEAR' || rawStr === 'NONE') return null;

  // 1. シフトコード完全一致（最優先）
  if (shiftDefs[rawStr] && getEffectiveShiftType(shiftDefs[rawStr], categoryDefs) === expectedType) {
    return rawStr;
  }

  // 2. コードに該当がない場合のみ、同種別の表示名完全一致で一意に特定できる場合にコードへ変換
  const labelMatches = Object.values(shiftDefs).filter(
    d => d && getEffectiveShiftType(d, categoryDefs) === expectedType && String(d.label || '').trim() === rawStr
  );
  if (labelMatches.length === 1) {
    return labelMatches[0].code;
  }
  if (labelMatches.length > 1 && staffObj && expectedType === 'shift') {
    const exCats = Array.isArray(staffObj.excludedCategories) ? staffObj.excludedCategories : [];
    const exShifts = Array.isArray(staffObj.excludedShifts) ? staffObj.excludedShifts : [];
    const allowedMatches = labelMatches.filter(
      d =>
        isAiAssignableFacilityShiftDef(d.code, shiftDefs, categoryDefs) &&
        !exCats.includes(d.category) &&
        !exShifts.includes(d.code)
    );
    if (allowedMatches.length === 1) {
      return allowedMatches[0].code;
    }
  }
  return null;
};

// 現在のシフト設定・カテゴリ設定をAIへ誤解ゼロで伝えるライブ対応表テキストを生成
const buildShiftSystemReferenceText = (shiftDefs = {}, categoryDefs = {}, adminSettings = {}, options = {}) => {
  const { includeTasks = true } = options;
  const sortedCats = Object.values(categoryDefs).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const lines = [
    '【現在のシステム設定：シフトコード・表示名・勤務区分 対応表（★初期設定ではなく必ずこの最新設定に従うこと★）】',
    '※重要：画面上の「表示名」とデータ保存用の「シフトコード」が異なる設定に対応しています（例：コード "1" ＝ 表示名「A」など）。',
    '・管理者がカスタム条件やチャットでシフト名・施設名を書くときは、主に「表示名（例: A）」や「施設名＋区分（例: 坂田の3クール、日勤）」で呼びます（※「1クール」＝「日勤」と同一の意味です）。必ず下の対応表で該当する「コード」を確認して解釈してください。',
    '・AIが出勤として新規割り当て・入れ替えできるシフトは【勤務施設】カテゴリ（坂田・君津・木クリ・じんクリ等）のシフトコードのみです。ME室（L・G等）やその他（出勤・公出等）、休み・希望カテゴリのコードはAIから絶対に出力・変更しないでください。',
    includeTasks
      ? '・JSONの "shift" / "task" に出力する値は、表示名ではなく必ず【コード】の文字列（例: "1"）を指定してください。'
      : '・JSONの "shift" に出力する値は、表示名ではなく必ず【コード】の文字列（例: "1"）を指定してください。',
  ];

  const assignedCodes = new Set();
  sortedCats.forEach(cat => {
    const kind = resolveCategoryKind(cat);
    if (!includeTasks && kind === 'role') {
      Object.values(shiftDefs)
        .filter(s => s && s.category === cat.id)
        .forEach(s => assignedCodes.add(s.code));
      return;
    }
    const kindMeta = CATEGORY_KIND_OPTIONS.find(o => o.value === kind);
    const items = Object.values(shiftDefs)
      .filter(s => s && s.category === cat.id && (includeTasks || getEffectiveShiftType(s, categoryDefs) !== 'task'))
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    if (items.length === 0) return;

    const headerExtras = [];
    if (kind === 'facility') {
      const pTarget = getFacilityTargetPowerScore(cat, adminSettings);
      headerExtras.push(pTarget > 0 ? 'パワーバランス均等化対象（当日平均スコア×人数比）' : 'スコア判定なし');
      const reqSkills = STAFF_SKILLS
        .map(sk => ({ label: sk.label, cnt: resolveFacilitySkillTarget(cat, sk.key, adminSettings) }))
        .filter(x => x.cnt > 0)
        .map(x => `${x.label}${x.cnt}名以上`);
      if (reqSkills.length > 0) headerExtras.push(`必須スキル:${reqSkills.join('・')}`);
    } else if (kind === 'me') {
      headerExtras.push('OPE班管理・AIからの新規出力や既存変更は禁止');
    } else if (kind === 'basic') {
      headerExtras.push('管理者・個人入力用・AIからの新規出力や既存変更は禁止');
    } else if (kind === 'off' || kind === 'req') {
      headerExtras.push('AIは公休を空欄のまま残すため出力禁止');
    }

    lines.push(
      `- [${kindMeta?.shortLabel || kind}] ${cat.label} (categoryId: "${cat.id}"${headerExtras.length > 0 ? ` / ${headerExtras.join(' / ')}` : ''}):`
    );

    items.forEach(s => {
      assignedCodes.add(s.code);
      const effType = getEffectiveShiftType(s, categoryDefs);
      const timePart = (s.startTime || s.endTime) ? ` / 時間:${s.startTime || ''}-${s.endTime || ''}` : '';
      const otPart = Number(s.overtime) > 0 ? ` / 残業:${s.overtime}h` : '';
      if (effType === 'task') {
        lines.push(`  ・タスク コード "${s.code}" ＝ 表示名「${s.label}」`);
      } else if (kind === 'off' || kind === 'req') {
        lines.push(`  ・コード "${s.code}" ＝ 表示名「${s.label}」 [区分:週休枠の休み（その週の休み1日分として扱い、残り5日は出勤配置）]`);
      } else if (kind === 'basic') {
        if (isKoushutsuShiftDef(s, categoryDefs)) {
          lines.push(`  ・コード "${s.code}" ＝ 表示名「${s.label}」 [区分:公出（AI出力・変更禁止 / 業務出張扱いのため出勤人数・現場出勤日数・連勤には含めず、公出のみの週は別日に空欄の公休を1日残して現場出勤4日にする）${otPart}]`);
        } else {
          lines.push(`  ・コード "${s.code}" ＝ 表示名「${s.label}」 [区分:その他出勤（AI出力・変更禁止 / 既に入力済みの日は連勤・出勤日数にカウント）${timePart}${otPart}]`);
        }
      } else if (kind === 'me' || isMeShiftDef(s.code, shiftDefs, categoryDefs)) {
        lines.push(`  ・コード "${s.code}" ＝ 表示名「${s.label}」 [区分:ME室（AI出力・変更禁止 / 既に入力済みの日は連勤・出勤日数にカウント）${timePart}${otPart}]`);
      } else {
        const slot = resolveShiftWorkSlot(s, categoryDefs);
        const slotLbl = slot === 'day' ? '日勤(=1クール)' : getShiftWorkSlotMeta(slot).label;
        lines.push(`  ・コード "${s.code}" ＝ 表示名「${s.label}」 [区分:${slotLbl}${timePart}${otPart}]`);
      }
    });
  });

  const orphanItems = Object.values(shiftDefs).filter(
    s => s && !assignedCodes.has(s.code) && (includeTasks || getEffectiveShiftType(s, categoryDefs) !== 'task')
  );
  if (orphanItems.length > 0) {
    lines.push('- [その他・未分類カテゴリ]:');
    orphanItems.forEach(s => {
      const slot = resolveShiftWorkSlot(s, categoryDefs);
      const slotPart = slot ? ` [区分:${getShiftWorkSlotMeta(slot).label}]` : '';
      lines.push(`  ・コード "${s.code}" ＝ 表示名「${s.label}」${slotPart}`);
    });
  }

  return lines.join('\n');
};

const buildAiQuickPrompts = (categoryDefs = {}) => {
  const facilityNames = Object.values(categoryDefs)
    .filter(c => resolveCategoryKind(c) === 'facility')
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map(c => c.label);
  const facText = facilityNames.length > 0 ? `各施設（${facilityNames.join('・')}）` : '各施設';
  return [
    {
      label: '🔍 不足日・スコア割れを診断',
      text: `今月の勤務表で、必要人数が足りていない日や${facText}の目標スコア・必須スキルを下回っている日をチェックして、どう補うとよさそうか相談させてください。`,
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
};

// Step 6: 勤務表全体のルール違反・人数不足・必須スキル不足・スコア未達を一括検算する純粋関数
const evaluateScheduleValidation = ({
  year,
  month,
  staffList = [],
  shiftDefs = {},
  categoryDefs = {},
  targetCounts = {},
  adminSettings = {},
  userInputs = {},
  prevMonthCarryOver = { hasStraddlingWeek: false, cool3ShiftCodes: [], byStaff: {} },
  shiftsMap = {},
  lockedBaselineShifts = null,
  includeEmptyDays = false,
  scopeDaysSet = null,
}) => {
  const daysInMonth = getDaysInMonth(year, month);
  const hasScope = scopeDaysSet instanceof Set && scopeDaysSet.size > 0;
  const isDayInScope = (dayNum) => !hasScope || scopeDaysSet.has(dayNum);
  const closedRules = Array.isArray(adminSettings?.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
  const maxStreak = Number(adminSettings?.maxConsecutiveWorkDays) || 5;
  const dynamicCool3Codes =
    Array.isArray(prevMonthCarryOver?.cool3ShiftCodes) && prevMonthCarryOver.cool3ShiftCodes.length > 0
      ? prevMonthCarryOver.cool3ShiftCodes
      : Object.values(shiftDefs)
          .filter(s => isCool3ShiftDef(s, categoryDefs))
          .map(s => s.code);
  const cool3Set = new Set(dynamicCool3Codes);
  const baselineMap = lockedBaselineShifts || shiftsMap;

  const isMeCode = (code) => isMeShiftDef(code, shiftDefs, categoryDefs);

  const isPaidLeaveCode = (code) => {
    if (!code || !shiftDefs[code]) return false;
    return isPaidLeaveShiftDef(shiftDefs[code], categoryDefs);
  };

  const isShiftAllowed = (staff, code) => {
    const def = shiftDefs[code];
    if (!def) return false;
    if (Array.isArray(staff?.excludedCategories) && staff.excludedCategories.includes(def.category)) return false;
    if (Array.isArray(staff?.excludedShifts) && staff.excludedShifts.includes(code)) return false;
    if ((staff?.maxCool3 ?? 5) <= 0 && cool3Set.has(code)) return false;
    return true;
  };

  const getReqShift = (sId, d) => {
    const raw = userInputs?.[sId]?.[d];
    if (!raw) return null;
    if (raw === true) return baselineMap?.[sId]?.[d] || shiftsMap?.[sId]?.[d] || null;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') return raw.shift || null;
    return null;
  };

  const getTeamShiftLock = (sId, d, mapRef = baselineMap) => {
    const cur = mapRef?.[sId]?.[d];
    if (!cur) return null;
    const raw = userInputs?.[sId]?.[d];
    if (raw && typeof raw === 'object' && raw.teamShiftBy && TEAM_ADMIN_LABELS[raw.teamShiftBy]) {
      return raw.teamShiftBy;
    }
    if (isMeCode(cur)) return 'ope';
    return null;
  };

  const isCellAiEditable = (staff, d) => {
    if (!staff || staff.excludeFromAi || isSunday(year, month, d)) return false;
    if (baselineMap?.[staff.id]?.[d]) return false;
    if (getReqShift(staff.id, d)) return false;
    if (getTeamShiftLock(staff.id, d, baselineMap)) return false;
    const curCode = shiftsMap?.[staff.id]?.[d];
    if (curCode && shiftDefs[curCode] && !isAiAssignableFacilityShiftDef(curCode, shiftDefs, categoryDefs)) {
      return false;
    }
    return true;
  };

  const readSkillMin = (catId, skillKey) => {
    if (!catId || !categoryDefs[catId]) return 0;
    return resolveFacilitySkillTarget(categoryDefs[catId], skillKey, adminSettings);
  };

  const readTargetCount = (code, d) => {
    if (isSunday(year, month, d)) return 0;
    const normalTarget = targetCounts?.[code]?.[getDayOfWeek(year, month, d)] || 0;
    if (isMeCode(code) && isHoliday(year, month, d, closedRules)) {
      return getHolidayMeTargetCount(code, shiftDefs, categoryDefs, normalTarget);
    }
    return normalTarget;
  };

  // 営業日と週情報の集計
  const operatingDays = [];
  const operatingWeeks = [];
  let currentOpWeek = [];
  let filledOperatingDaysCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (isSunday(year, month, d)) {
      if (currentOpWeek.length > 0) {
        operatingWeeks.push(currentOpWeek);
        currentOpWeek = [];
      }
      continue;
    }
    operatingDays.push(d);
    currentOpWeek.push(d);
    const hasWork = staffList.some(s => {
      const c = shiftsMap?.[s.id]?.[d];
      const def = c ? shiftDefs[c] : null;
      return !!(def && getEffectiveShiftType(def, categoryDefs) === 'shift' && !isNonWorkOrKoushutsuShiftDef(def, categoryDefs));
    });
    if (hasWork) filledOperatingDaysCount++;
  }
  if (currentOpWeek.length > 0) operatingWeeks.push(currentOpWeek);

  const operatingDaysCount = operatingDays.length;
  const emptyOperatingDaysCount = operatingDaysCount - filledOperatingDaysCount;
  const isFullMonthCreated = filledOperatingDaysCount >= Math.max(1, operatingDaysCount - 1);

  const baseRegularOffMin = Math.floor(operatingDaysCount / 6);
  const baseRegularOffMax = Math.ceil(operatingDaysCount / 6);
  const standardWorkDaysMin = Math.max(0, operatingDaysCount - baseRegularOffMax);
  const standardWorkDaysMax = Math.max(0, operatingDaysCount - baseRegularOffMin);

  const staffViolations = [];
  const aiRepairableItems = [];
  const staffEvalMap = {};

  // 1. 職員ごとの勤務ルール検算（連勤超過・3クール連続・3クール上限・配置制限・出勤日数不足）
  staffList.forEach(s => {
    const carry = prevMonthCarryOver?.byStaff?.[s.id] || {
      staffHasPrevWorkShift: false,
      trailingWorkStreak: 0,
      prevWeekRegOffCount: 0,
      prevLastDayWasCool3: false,
      prevLastDayLabel: null,
    };

    let streakLen = carry.trailingWorkStreak || 0;
    let runStartDay = streakLen > 0 ? 0 : null; // 0 = 前月末から継続
    let currentRunDays = [];
    const cool3Days = [];
    let workDays = 0;
    let paidLeaveDays = 0;
    const regOffDaySet = new Set();
    const workDaySet = new Set();
    const editableBlankDays = [];

    const flushStreakRun = (endDay) => {
      if (
        streakLen > maxStreak &&
        currentRunDays.length > 0 &&
        (!hasScope || currentRunDays.some(dayNum => isDayInScope(dayNum)))
      ) {
        const editableDays = currentRunDays.filter(dayNum => isDayInScope(dayNum) && isCellAiEditable(s, dayNum));
        const isAiFixable = !s.excludeFromAi && editableDays.length > 0;
        const rangeText = runStartDay === 0
          ? `前月末(${carry.trailingWorkStreak}連勤)〜${month}/${endDay}`
          : `${month}/${runStartDay}〜${month}/${endDay}`;
        staffViolations.push({
          type: 'streak_exceeded',
          severity: 'error',
          staffId: s.id,
          staffName: s.name,
          isAiFixable,
          label: `最大連勤超過（${streakLen}連勤 / 上限${maxStreak}日）`,
          detail: `${rangeText} が連続出勤になっています`,
        });
        if (isAiFixable) {
          aiRepairableItems.push(
            `[連勤超過] ${s.name}(ID:${s.id}): ${rangeText} で${streakLen}連勤（上限${maxStreak}連勤）になっています。編集可能な日 [${editableDays.join(', ')}] のうち最低1日を null（空欄の公休）に戻し、減ったシフトを他の余力ある職員へ振り替えてください。`
          );
        }
      }
      streakLen = 0;
      runStartDay = null;
      currentRunDays = [];
    };

    for (let d = 1; d <= daysInMonth; d++) {
      if (isSunday(year, month, d)) {
        flushStreakRun(d - 1);
        continue;
      }
      const code = shiftsMap?.[s.id]?.[d];
      const def = code ? shiftDefs[code] : null;
      const reqShift = getReqShift(s.id, d);

      if (!code || !def) {
        flushStreakRun(d - 1);
        if (reqShift && shiftDefs[reqShift] && isPaidLeaveCode(reqShift)) {
          paidLeaveDays++;
        } else if (reqShift && shiftDefs[reqShift] && isNonWorkOrKoushutsuShiftDef(shiftDefs[reqShift], categoryDefs)) {
          regOffDaySet.add(d);
        } else if (isHoliday(year, month, d, closedRules)) {
          // 祝日の空欄は「その週の週休枠（祝日休み）」としてカウントし、同週に休み希望等があれば週4日以下の出勤も許容する
          regOffDaySet.add(d);
        } else if (!reqShift && isCellAiEditable(s, d)) {
          editableBlankDays.push(d);
        }
        continue;
      }

      if (isNonWorkOrKoushutsuShiftDef(def, categoryDefs)) {
        flushStreakRun(d - 1);
        if (isPaidLeaveCode(code)) {
          paidLeaveDays++;
        } else {
          regOffDaySet.add(d);
        }
        continue;
      }

      // 出勤シフト
      workDays++;
      workDaySet.add(d);
      if (streakLen === 0) runStartDay = d;
      streakLen++;
      currentRunDays.push(d);

      if (cool3Set.has(code)) {
        cool3Days.push(d);
        // 月またぎ1日の3クール連続チェック
        if (d === 1 && carry.prevLastDayWasCool3 && isDayInScope(1)) {
          const isAiFixable = isCellAiEditable(s, 1);
          staffViolations.push({
            type: 'consecutive_cool3',
            severity: 'error',
            staffId: s.id,
            staffName: s.name,
            isAiFixable,
            label: '月またぎ3クール連続',
            detail: `前月最終日(${carry.prevLastDayLabel || '3クール'}) → ${month}/1(${def.label}) が連続しています`,
          });
          if (isAiFixable) {
            aiRepairableItems.push(
              `[3クール連続] ${s.name}(ID:${s.id}): 前月最終日が3クールのため ${month}/1 に表示名「${def.label}」(コード:"${code}")は入れられません。1日は3クール以外のシフトコードへ変更してください。`
            );
          }
        }
        // 月内の連続営業日3クール連続チェック
        if (d > 1 && !isSunday(year, month, d - 1) && (isDayInScope(d) || isDayInScope(d - 1))) {
          const prevCode = shiftsMap?.[s.id]?.[d - 1];
          if (prevCode && cool3Set.has(prevCode)) {
            const prevLabel = shiftDefs[prevCode]?.label || prevCode;
            const editablePair = [d - 1, d].filter(dayNum => isDayInScope(dayNum) && isCellAiEditable(s, dayNum));
            const isAiFixable = !s.excludeFromAi && editablePair.length > 0;
            staffViolations.push({
              type: 'consecutive_cool3',
              severity: 'error',
              staffId: s.id,
              staffName: s.name,
              isAiFixable,
              label: '3クール連続配置',
              detail: `${month}/${d - 1}(${prevLabel}) → ${month}/${d}(${def.label}) が連続しています`,
            });
            if (isAiFixable) {
              aiRepairableItems.push(
                `[3クール連続] ${s.name}(ID:${s.id}): ${month}/${d - 1}(${prevLabel} / コード:"${prevCode}") と ${month}/${d}(${def.label} / コード:"${code}") が連続しています。編集可能な日 [${editablePair.join(', ')}] の3クールを通常シフトに入れ替えてください。`
              );
            }
          }
        }
      }

      // 配置制限外シフトのチェック（勤務施設カテゴリのシフトのみ対象。ME室・その他・個人希望・班管理ロックは除外）
      const isPersonalSame = reqShift === code;
      const isTeamLocked = !!getTeamShiftLock(s.id, d, shiftsMap);
      if (isDayInScope(d) && isAiAssignableFacilityShiftDef(code, shiftDefs, categoryDefs) && !isPersonalSame && !isTeamLocked && !isShiftAllowed(s, code)) {
        const isAiFixable = isCellAiEditable(s, d);
        staffViolations.push({
          type: 'restricted_shift',
          severity: 'error',
          staffId: s.id,
          staffName: s.name,
          isAiFixable,
          label: '配置制限外のシフト割当',
          detail: `${month}/${d} に配置制限外の「${def.label}」が割り当てられています`,
        });
        if (isAiFixable) {
          aiRepairableItems.push(
            `[配置制限違反] ${s.name}(ID:${s.id}): ${month}/${d} の表示名「${def.label}」(コード:"${code}")は配置不可です。許可された allowedWorkShifts 内のシフトコードに変更してください。`
          );
        }
      }
    }
    flushStreakRun(daysInMonth);

    // 3クール月間上限超過チェック
    if (
      s.maxCool3 !== undefined &&
      s.maxCool3 !== null &&
      cool3Days.length > s.maxCool3 &&
      (!hasScope || cool3Days.some(dayNum => isDayInScope(dayNum)))
    ) {
      const editableCool3 = cool3Days.filter(dayNum => isDayInScope(dayNum) && isCellAiEditable(s, dayNum));
      const isAiFixable = !s.excludeFromAi && editableCool3.length > 0;
      const overBy = cool3Days.length - s.maxCool3;
      staffViolations.push({
        type: 'cool3_over_limit',
        severity: 'error',
        staffId: s.id,
        staffName: s.name,
        isAiFixable,
        label: `3クール月間上限超過（${cool3Days.length}回 / 上限${s.maxCool3}回）`,
        detail: `該当: ${cool3Days.map(d => `${month}/${d}`).join('・')}`,
      });
      if (isAiFixable) {
        aiRepairableItems.push(
          `[3クール上限超過] ${s.name}(ID:${s.id}): 3クールが計${cool3Days.length}回（上限${s.maxCool3}回）で ${overBy}回 超過しています。編集可能な3クール日 [${editableCool3.join(', ')}] のうち${overBy}日分を他の上限に余裕がある職員と入れ替えてください。`
        );
      }
    }

    if (
      !hasScope &&
      s.minCool3 !== undefined &&
      s.minCool3 !== null &&
      Number(s.minCool3) > 0 &&
      cool3Days.length < Number(s.minCool3)
    ) {
      const minReq = Number(s.minCool3);
      const shortBy = minReq - cool3Days.length;
      const isAiFixable = !s.excludeFromAi;
      staffViolations.push({
        type: 'cool3_under_limit',
        severity: 'warning',
        staffId: s.id,
        staffName: s.name,
        isAiFixable,
        label: `3クール月間下限未達（${cool3Days.length}回 / 下限${minReq}回）`,
        detail:
          cool3Days.length > 0
            ? `現在: ${cool3Days.map(d => `${month}/${d}`).join('・')}（あと${shortBy}回必要）`
            : `現在0回（最低${minReq}回必要）`,
      });
      if (isAiFixable) {
        aiRepairableItems.push(
          `[3クール下限未達] ${s.name}(ID:${s.id}): 3クールが計${cool3Days.length}回（下限${minReq}回）で ${shortBy}回 不足しています。連続3クール禁止・配置制限を守りつつ、他の3クール上限に余裕がある職員と入れ替えて3クールをあと${shortBy}回増やしてください。`
        );
      }
    }

    const excessSameWeekRegOffDays = operatingWeeks.reduce((acc, wDays) => {
      const cnt = wDays.filter(wd => regOffDaySet.has(wd)).length;
      return acc + Math.max(0, cnt - 1);
    }, 0);
    const partContractRange = getPartTimeWeeklyContractRange(s);
    const hasContractDays = Boolean(partContractRange);
    const contractMin = partContractRange ? partContractRange.min : null;
    const contractMax = partContractRange ? partContractRange.max : null;
    const contractRangeLabel = partContractRange
      ? contractMin === contractMax
        ? `週${contractMin}日`
        : `週${contractMin}〜${contractMax}日`
      : null;

    let targetMin = Math.max(0, standardWorkDaysMin - paidLeaveDays - excessSameWeekRegOffDays);
    let targetMax = Math.max(targetMin, standardWorkDaysMax - paidLeaveDays - excessSameWeekRegOffDays);
    if (hasContractDays) {
      const weeklyMinSum = operatingWeeks.reduce((sum, wDays) => {
        return sum + (wDays.length === 6 ? Math.min(wDays.length, contractMin) : 0);
      }, 0);
      const weeklyMaxSum = operatingWeeks.reduce((sum, wDays) => {
        return sum + Math.min(wDays.length, contractMax);
      }, 0);
      targetMin = Math.max(0, weeklyMinSum - paidLeaveDays);
      targetMax = Math.max(targetMin, weeklyMaxSum - paidLeaveDays);
    }

    staffEvalMap[s.id] = {
      workDays,
      targetMin,
      targetMax,
      workDaySet,
      hasContractDays,
      contractMin,
      contractMax,
    };

    // ★パート職員の週契約出勤日数（下限〜上限：絶対ルール）チェック
    if (hasContractDays && filledOperatingDaysCount > 0) {
      operatingWeeks.forEach((wDays, wIdx) => {
        if (hasScope && !wDays.some(wd => isDayInScope(wd))) return;
        const wWorkDays = wDays.filter(wd => workDaySet.has(wd));
        const wEditWorkDays = wWorkDays.filter(wd => isCellAiEditable(s, wd));
        const wEditBlankDays = wDays.filter(wd => !shiftsMap?.[s.id]?.[wd] && isCellAiEditable(s, wd));
        if (wWorkDays.length > contractMax) {
          const overBy = wWorkDays.length - contractMax;
          const isAiFixable = !s.excludeFromAi && wEditWorkDays.length > 0;
          staffViolations.push({
            type: 'contract_workdays_over',
            severity: 'error',
            staffId: s.id,
            staffName: s.name,
            isAiFixable,
            label: `契約出勤日数超過（第${wIdx + 1}週: ${wWorkDays.length}日 / 契約:${contractRangeLabel}）`,
            detail: `出勤日: ${wWorkDays.map(d => `${month}/${d}`).join('・')}`,
          });
          if (isAiFixable) {
            aiRepairableItems.push(
              `[契約出勤日数超過] ${s.name}(ID:${s.id}): 第${wIdx + 1}週の出勤が${wWorkDays.length}日で契約(${contractRangeLabel})の上限${contractMax}日を${overBy}日超過しています。編集可能な出勤日 [${wEditWorkDays.join(', ')}] のうち${overBy}日分を null(空欄) に戻してください。`
            );
          }
        } else if (
          wDays.length === 6 &&
          (isFullMonthCreated || includeEmptyDays || hasScope) &&
          wWorkDays.length < contractMin &&
          wEditBlankDays.length > 0
        ) {
          const shortBy = Math.min(wEditBlankDays.length, contractMin - wWorkDays.length);
          const isAiFixable = !s.excludeFromAi && shortBy > 0;
          staffViolations.push({
            type: 'contract_workdays_under',
            severity: 'error',
            staffId: s.id,
            staffName: s.name,
            isAiFixable,
            label: `契約出勤日数未達（第${wIdx + 1}週: ${wWorkDays.length}日 / 契約:${contractRangeLabel}）`,
            detail: `空き候補日: ${wEditBlankDays.map(d => `${month}/${d}`).join('・')}`,
          });
          if (isAiFixable) {
            aiRepairableItems.push(
              `[契約出勤日数未達] ${s.name}(ID:${s.id}): 第${wIdx + 1}週の出勤が${wWorkDays.length}日で契約(${contractRangeLabel})の下限${contractMin}日に${shortBy}日不足しています。未ロック空欄日 [${wEditBlankDays.join(', ')}] のうち${shortBy}日分に出勤シフトを割り当ててください。`
            );
          }
        }
      });
    } else if (!hasScope && (isFullMonthCreated || includeEmptyDays) && filledOperatingDaysCount > 0 && !s.excludeFromAi && s.jobTitle !== 'パート') {
      // 1ヶ月分が作成済みの場合のみ、常勤職員の「空欄残しすぎ（出勤日数不足）」をチェック
      if (workDays < targetMin && editableBlankDays.length > 0) {
        staffViolations.push({
          type: 'underwork_excess_blank',
          severity: 'warn',
          staffId: s.id,
          staffName: s.name,
          isAiFixable: true,
          label: `出勤日数不足・空欄過多（${workDays}日 / 目安${targetMin}〜${targetMax}日）`,
          detail: `未ロックの空欄日: ${editableBlankDays.map(d => `${month}/${d}`).join('・')}`,
        });
        aiRepairableItems.push(
          `[出勤日数不足] ${s.name}(ID:${s.id}): 出勤が${workDays}日（目安${targetMin}〜${targetMax}日）で空欄が多すぎます。未ロック空欄日 [${editableBlankDays.join(', ')}] のうち最大連勤を超えない日に出勤シフトを割り当ててください。`
        );
      }
    }
  });

  // 週休（空欄公休）と最大連勤・月間出勤上限（契約出勤日数含む）を守ったまま、指定日に追加出勤できる余力があるか判定
  const canSafelyFillBlankOnDay = (staff, dayNum) => {
    if (!staff || staff.excludeFromAi) return false;
    const stEval = staffEvalMap[staff.id];
    if (!stEval) return false;
    if (staff.jobTitle === 'パート' && !stEval.hasContractDays) return false;
    if (shiftsMap?.[staff.id]?.[dayNum] || !isCellAiEditable(staff, dayNum)) return false;
    if ((isFullMonthCreated || includeEmptyDays) && stEval.workDays >= stEval.targetMax) {
      return false;
    }
    const weekIdx = operatingWeeks.findIndex(w => w.includes(dayNum));
    if (weekIdx !== -1) {
      const wDays = operatingWeeks[weekIdx];
      if (stEval.hasContractDays) {
        const curWeekWork = wDays.filter(wd => stEval.workDaySet.has(wd)).length;
        if (curWeekWork >= stEval.contractMax) return false;
      }
      const otherNonWorkDaysInWeek = wDays.filter(wd => wd !== dayNum && !stEval.workDaySet.has(wd)).length;
      if (wDays.length === 6 && otherNonWorkDaysInWeek === 0) {
        return false;
      }
      if (
        weekIdx === 0 &&
        wDays.length < 6 &&
        prevMonthCarryOver?.hasStraddlingWeek &&
        prevMonthCarryOver?.byStaff?.[staff.id]?.staffHasPrevWorkShift &&
        (prevMonthCarryOver?.byStaff?.[staff.id]?.prevWeekRegOffCount || 0) + otherNonWorkDaysInWeek === 0
      ) {
        return false;
      }
    }
    const carryStreak = prevMonthCarryOver?.byStaff?.[staff.id]?.trailingWorkStreak || 0;
    let beforeStreak = 0;
    let cur = dayNum - 1;
    let hitBreakBefore = false;
    while (cur >= 1) {
      if (isSunday(year, month, cur)) {
        hitBreakBefore = true;
        break;
      }
      if (stEval.workDaySet.has(cur)) {
        beforeStreak++;
        cur--;
      } else {
        hitBreakBefore = true;
        break;
      }
    }
    if (!hitBreakBefore && cur === 0) {
      beforeStreak += carryStreak;
    }
    let afterStreak = 0;
    let nextCur = dayNum + 1;
    while (nextCur <= daysInMonth && !isSunday(year, month, nextCur)) {
      if (stEval.workDaySet.has(nextCur)) {
        afterStreak++;
        nextCur++;
      } else {
        break;
      }
    }
    if (beforeStreak + 1 + afterStreak > maxStreak) {
      return false;
    }
    return true;
  };

  // 2. 日別の必要人数不足・必須スキル不足・目標パワースコア未達の検算
  const facilityCats = Object.values(categoryDefs)
    .filter(cat => resolveCategoryKind(cat) === 'facility')
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const skillPoints = { isLeader: 5, isVeteran: 3, canEcho: 2, canMachine: 2, canFollow: 1 };
  const staffPowerMap = {};
  staffList.forEach(s => {
    let pt = 0;
    if (s.skills) {
      Object.keys(skillPoints).forEach(k => {
        if (s.skills[k]) pt += skillPoints[k];
      });
    }
    staffPowerMap[s.id] = pt;
  });

  const dailyHeadcountShortages = [];
  const dailySkillShortages = [];
  const dailyPowerShortages = [];
  let omittedEmptyDaysCount = 0;

  operatingDays.forEach(d => {
    if (!isDayInScope(d)) return;
    const dow = getDayOfWeek(year, month, d);
    const dowLabel = ['日', '月', '火', '水', '木', '金', '土'][dow];

    const codeCounts = {};
    const actualHeadcountByCat = {};
    const powerScoreByCat = {};
    const skillCountsByCat = {};
    facilityCats.forEach(cat => {
      actualHeadcountByCat[cat.id] = 0;
      powerScoreByCat[cat.id] = 0;
      skillCountsByCat[cat.id] = {};
      STAFF_SKILLS.forEach(sk => {
        skillCountsByCat[cat.id][sk.key] = 0;
      });
    });

    let workingOnDay = 0;

    staffList.forEach(s => {
      const code = shiftsMap?.[s.id]?.[d];
      if (!code || !shiftDefs[code]) return;
      const def = shiftDefs[code];
      if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return;
      codeCounts[code] = (codeCounts[code] || 0) + 1;
      if (!isNonWorkOrKoushutsuShiftDef(def, categoryDefs)) {
        workingOnDay++;
        const pScore = staffPowerMap[s.id] || 0;
        if (powerScoreByCat[def.category] !== undefined) {
          powerScoreByCat[def.category] += pScore;
        }
        if (skillCountsByCat[def.category] !== undefined) {
          actualHeadcountByCat[def.category] = (actualHeadcountByCat[def.category] || 0) + 1;
          STAFF_SKILLS.forEach(sk => {
            if (s.skills?.[sk.key]) {
              skillCountsByCat[def.category][sk.key] = (skillCountsByCat[def.category][sk.key] || 0) + 1;
            }
          });
        }
      }
    });

    if (workingOnDay === 0 && !includeEmptyDays) {
      omittedEmptyDaysCount++;
      return;
    }

    // (a) シフト必要人数チェック
    const hcItems = [];
    Object.values(shiftDefs)
      .filter(sd => sd && getEffectiveShiftType(sd, categoryDefs) === 'shift' && !isOffOrReqCategoryId(sd.category, categoryDefs))
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .forEach(sd => {
        const target = readTargetCount(sd.code, d);
        const actual = codeCounts[sd.code] || 0;
        if (target > 0 && actual < target) {
          hcItems.push({
            code: sd.code,
            label: sd.label,
            actual,
            target,
            isMeRoom: isMeCode(sd.code),
          });
        }
      });

    if (hcItems.length > 0) {
      const nonMeItems = hcItems.filter(it => isAiAssignableFacilityShiftDef(it.code, shiftDefs, categoryDefs));
      const spareBlankCandidates =
        nonMeItems.length > 0
          ? shuffleArray(
              staffList.filter(
                s => canSafelyFillBlankOnDay(s, d) && nonMeItems.some(it => isShiftAllowed(s, it.code))
              )
            )
              .map(s => `${s.name}(ID:${s.id})`)
              .slice(0, 6)
          : [];
      dailyHeadcountShortages.push({
        day: d,
        dowLabel,
        items: hcItems,
        nonMeItems,
        hasSpareAiCandidate: spareBlankCandidates.length > 0,
      });
      // 週休や最大連勤を崩さずに追加出勤できる余力スタッフがいる場合のみAI手直し対象とする（いない場合はパート・AI除外スタッフ・手動調整で補う前提）
      if (nonMeItems.length > 0 && spareBlankCandidates.length > 0) {
        aiRepairableItems.push(
          `[必要人数不足（余力スタッフあり）] ${month}/${d}(${dowLabel}): ${nonMeItems.map(it => `表示名「${it.label}」(コード:"${it.code}") ${it.actual}/${it.target}名`).join('・')}（週休・連勤上限を守ったまま追加出勤可能な候補: ${spareBlankCandidates.join(', ')}）`
        );
      }
    }

    // (b) 施設別必須スキルチェック（3クール枠内リーダー必須 ＆ 2クール以下は木クリのみリーダー必須）
    const skItems = [];
    facilityCats.forEach(cat => {
      const catShiftDefs = Object.values(shiftDefs)
        .filter(sd => sd && getEffectiveShiftType(sd, categoryDefs) === 'shift' && sd.category === cat.id);
      const catShiftCodes = catShiftDefs.map(sd => sd.code);
      if (catShiftCodes.length === 0) return;

      const catTargetHc = catShiftCodes.reduce((sum, c) => sum + readTargetCount(c, d), 0);
      const catActualHc = actualHeadcountByCat[cat.id] || 0;
      if (catTargetHc === 0 && catActualHc === 0) return;

      const catHasAnyCool3Def = catShiftDefs.some(sd => cool3Set.has(sd.code));
      const activeCool3DefsToday = catShiftDefs.filter(
        sd => cool3Set.has(sd.code) && (readTargetCount(sd.code, d) > 0 || (codeCounts[sd.code] || 0) > 0)
      );

      STAFF_SKILLS.forEach(sk => {
        if (sk.key === 'isLeader') {
          // ① 3クールがある施設で当日3クール枠が稼働している場合: 「3クール枠の中に」リーダー1名以上必須
          if (activeCool3DefsToday.length > 0) {
            activeCool3DefsToday.forEach(c3Def => {
              const c3LeaderActual = staffList.filter(
                s => shiftsMap?.[s.id]?.[d] === c3Def.code && s.skills?.isLeader
              ).length;
              if (c3LeaderActual < 1) {
                const sameDayNonC3Leaders = staffList.filter(s => {
                  const sc = shiftsMap?.[s.id]?.[d];
                  return Boolean(sc && !cool3Set.has(sc) && s.skills?.isLeader && isShiftAllowed(s, c3Def.code));
                });
                const blankLeaders = staffList.filter(
                  s => s.skills?.isLeader && canSafelyFillBlankOnDay(s, d) && isShiftAllowed(s, c3Def.code)
                );
                const isAiFixable = sameDayNonC3Leaders.length > 0 || blankLeaders.length > 0;
                const hint = sameDayNonC3Leaders.length > 0
                  ? '同日の日勤・2クールにリーダー保持者あり'
                  : blankLeaders.length > 0
                    ? '未割当のリーダー保持者あり'
                    : '';
                skItems.push({
                  catId: cat.id,
                  catLabel: `${cat.label}(${c3Def.label})`,
                  skillKey: 'isLeader',
                  skillLabel: '3クール内リーダー',
                  actual: c3LeaderActual,
                  target: 1,
                  isAiFixable,
                  hint,
                });
                if (isAiFixable) {
                  aiRepairableItems.push(
                    `[3クール内リーダー不足] ${month}/${d}(${dowLabel}): ${cat.label}の3クール「${c3Def.label}」(コード:"${c3Def.code}")内にリーダーが0名です（${hint}）。同日の通常シフトにいるリーダー保持者と入れ替えて必ず3クール内にリーダーを1名以上確保してください。`
                  );
                }
              }
            });
            return;
          }

          // ② 2クールまでの施設は「木クリ」のみリーダー1名以上必須（3クール施設の3クール非稼働日は設定値に従う）
          if (!catHasAnyCool3Def && !isKikuriFacilityCategory(cat)) {
            return;
          }
          const reqLeaderMin = isKikuriFacilityCategory(cat) ? Math.max(1, readSkillMin(cat.id, 'isLeader')) : readSkillMin(cat.id, 'isLeader');
          if (reqLeaderMin <= 0) return;
          const actualLeader = skillCountsByCat[cat.id]?.isLeader || 0;
          if (actualLeader < reqLeaderMin) {
            const surplusCats = facilityCats
              .filter(other => {
                if (other.id === cat.id) return false;
                const otherActual = skillCountsByCat[other.id]?.isLeader || 0;
                return otherActual > 1;
              })
              .map(other => `${other.label}(${skillCountsByCat[other.id]?.isLeader}名)`);
            const blankLeaders = staffList.filter(
              s => s.skills?.isLeader && canSafelyFillBlankOnDay(s, d)
            );
            const isAiFixable = surplusCats.length > 0 || blankLeaders.length > 0;
            const hint = surplusCats.length > 0
              ? `同日の${surplusCats.join('・')}に余剰あり`
              : blankLeaders.length > 0
                ? '未割当のリーダー保持者あり'
                : '';
            skItems.push({
              catId: cat.id,
              catLabel: cat.label,
              skillKey: 'isLeader',
              skillLabel: sk.label,
              actual: actualLeader,
              target: reqLeaderMin,
              isAiFixable,
              hint,
            });
            if (isAiFixable) {
              aiRepairableItems.push(
                `[必須スキル不足] ${month}/${d}(${dowLabel}): ${cat.label} の リーダー が ${actualLeader}/${reqLeaderMin}名 です（${hint}）。同日の余剰リーダーと配置を入れ替えて必ず1名以上確保してください。`
              );
            }
          }
          return;
        }

        const reqMin = readSkillMin(cat.id, sk.key);
        if (reqMin <= 0) return;
        const actual = skillCountsByCat[cat.id]?.[sk.key] || 0;
        if (actual < reqMin) {
          const surplusCats = facilityCats
            .filter(other => {
              if (other.id === cat.id) return false;
              const otherMin = readSkillMin(other.id, sk.key);
              const otherActual = skillCountsByCat[other.id]?.[sk.key] || 0;
              return otherActual > otherMin;
            })
            .map(other => `${other.label}(${skillCountsByCat[other.id]?.[sk.key]}名)`);

          const blankSkillHolders = staffList.filter(
            s => s.skills?.[sk.key] && canSafelyFillBlankOnDay(s, d)
          );

          const isAiFixable = surplusCats.length > 0 || blankSkillHolders.length > 0;
          const hint = surplusCats.length > 0
            ? `同日の${surplusCats.join('・')}に余剰あり`
            : blankSkillHolders.length > 0
              ? `未割当の${sk.label}保持者あり`
              : '';

          skItems.push({
            catId: cat.id,
            catLabel: cat.label,
            skillKey: sk.key,
            skillLabel: sk.label,
            actual,
            target: reqMin,
            isAiFixable,
            hint,
          });

          if (isAiFixable) {
            aiRepairableItems.push(
              `[必須スキル不足] ${month}/${d}(${dowLabel}): ${cat.label} の ${sk.label} が ${actual}/${reqMin}名 です（${hint}）。ロック外のメンバーと配置を入れ替える等で確保してください。`
            );
          }
        }
      });
    });

    if (skItems.length > 0) {
      dailySkillShortages.push({
        day: d,
        dowLabel,
        items: skItems,
      });
    }

    // (c) パワーバランス参考チェック（案A: 当日出勤者の施設間1人あたり平均スコアと人数比の動的目安で偏りを検出）
    const activePoolForAvg = staffList.filter(s => !s.excludeFromAi);
    const avgPool = activePoolForAvg.length > 0 ? activePoolForAvg : staffList;
    const fallbackStaffAvgScore =
      avgPool.length > 0
        ? avgPool.reduce((sum, s) => sum + (staffPowerMap[s.id] || 0), 0) / avgPool.length
        : 10;
    const dayPowerBalance = evaluateDailyFacilityPowerBalance({
      facilityCats,
      shiftDefs,
      categoryDefs,
      actualHeadcountByCat,
      powerScoreByCat,
      readTargetCount: (c) => readTargetCount(c, d),
      adminSettings,
      fallbackStaffAvgScore,
    });
    if (dayPowerBalance.imbalancedItems.length > 0) {
      dailyPowerShortages.push({
        day: d,
        dowLabel,
        items: dayPowerBalance.imbalancedItems,
      });
    }
  });

  const hardStaffViolationCount = staffViolations.filter(v => v.type !== 'underwork_excess_blank').length;
  const underworkCount = staffViolations.filter(v => v.type === 'underwork_excess_blank').length;
  const nonMeHeadcountShortageCount = dailyHeadcountShortages.reduce((s, d) => s + d.nonMeItems.length, 0);
  const allHeadcountShortageCount = dailyHeadcountShortages.reduce((s, d) => s + d.items.length, 0);
  const skillShortageTotalCount = dailySkillShortages.reduce((s, d) => s + d.items.length, 0);

  // 重大度スコア（Pass 1 と Pass 2 の改善度比較用：低いほど優良。個人の連勤・制限違反を最重視）
  const criticalScore =
    hardStaffViolationCount * 200 +
    nonMeHeadcountShortageCount * 25 +
    skillShortageTotalCount * 20 +
    underworkCount * 10 +
    dailyPowerShortages.length;

  return {
    operatingDaysCount,
    filledOperatingDaysCount,
    emptyOperatingDaysCount,
    omittedEmptyDaysCount,
    isFullMonthCreated,
    staffViolations,
    dailyHeadcountShortages,
    dailySkillShortages,
    dailyPowerShortages,
    aiRepairableItems,
    hardStaffViolationCount,
    underworkCount,
    nonMeHeadcountShortageCount,
    allHeadcountShortageCount,
    skillShortageTotalCount,
    totalActionableCount: staffViolations.length + dailyHeadcountShortages.length + dailySkillShortages.length,
    criticalScore,
  };
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
// 引数でモデル指定が省略された場合は、デフォルトで最新の gemini-4-carbon を使用します
const callGemini = async (prompt, systemInstruction = "", model = "gemini-4-carbon", options = {}) => { 
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
// ログイン状態永続化ヘルパー（ページ再読み込み時は維持し、タブを閉じたらログアウト）
// ------------------------------------------------------------------
const SAVED_AUTH_SESSION_KEY = 'workScheduleAppSession';

const createAuthFingerprint = (secret = '') => {
  const str = String(secret || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const readSavedAuthSession = () => {
  try {
    // 旧localStorage方式の残存データを掃除
    try {
      localStorage.removeItem(SAVED_AUTH_SESSION_KEY);
    } catch {
      // ignore
    }
    const raw = sessionStorage.getItem(SAVED_AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || (parsed.role !== 'admin' && parsed.role !== 'staff')) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeSavedAuthSession = (user, adminSettingsMap = DEFAULT_ADMIN_SETTINGS) => {
  try {
    // 旧localStorage方式の残存データを掃除
    try {
      localStorage.removeItem(SAVED_AUTH_SESSION_KEY);
    } catch {
      // ignore
    }
    if (!user) {
      sessionStorage.removeItem(SAVED_AUTH_SESSION_KEY);
      return;
    }
    if (user.role === 'admin') {
      const viewKey = user.initialView || 'all';
      const pwd = adminSettingsMap?.[viewKey]?.password ?? '';
      sessionStorage.setItem(
        SAVED_AUTH_SESSION_KEY,
        JSON.stringify({
          role: 'admin',
          initialView: viewKey,
          sig: createAuthFingerprint(pwd),
        })
      );
    } else if (user.role === 'staff' && user.id) {
      sessionStorage.setItem(
        SAVED_AUTH_SESSION_KEY,
        JSON.stringify({
          role: 'staff',
          staffId: user.id,
          sig: createAuthFingerprint(user.password ?? ''),
        })
      );
    }
  } catch {
    // ストレージ利用不可環境では無視
  }
};

// ------------------------------------------------------------------
// メインアプリコンポーネント
// ------------------------------------------------------------------

export default function WorkScheduleApp() {
  const [authUser, setAuthUser] = useState(null); 
  const [appUser, setAppUser] = useState(null); 
  const [isDataLoaded, setIsDataLoaded] = useState(false); // ★追加: データ通信完了フラグ
  const [isRestoringSession, setIsRestoringSession] = useState(() => Boolean(readSavedAuthSession()));
  const [loadedScheduleId, setLoadedScheduleId] = useState(null);
  const loadedScheduleIdRef = useRef(null);
  const updateLoadedScheduleId = (val) => {
    loadedScheduleIdRef.current = val;
    setLoadedScheduleId(val);
  };
  
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
  const [bellData, setBellData] = useState({}); // カテゴリ1: 緊急待機番(ベル)のタスク欄背景色フラグ
  const [leaderData, setLeaderData] = useState({}); // カテゴリ1: 3クールにリーダー不在時などの手動リーダー背景色フラグ
  const [userInputs, setUserInputs] = useState({}); // ★追加：個人が入力した箇所を記憶するリスト

  const [changeLogs, setChangeLogs] = useState([]); // ★追加：変更ログ用
  // カテゴリ3(B案): 確定後（締切後）の勤務交換(A⇔B)・休み変更申請リスト
  const [changeRequests, setChangeRequests] = useState([]);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [showAdminChangeRequestsModal, setShowAdminChangeRequestsModal] = useState(false);
  const [crMode, setCrMode] = useState('swap'); // 'swap' | 'single'
  const [crRequesterDay, setCrRequesterDay] = useState(1);
  const [crTargetStaffId, setCrTargetStaffId] = useState('');
  const [crTargetDay, setCrTargetDay] = useState(1);
  const [crSameDay, setCrSameDay] = useState(true);
  const [crSwapShift, setCrSwapShift] = useState(true);
  const [crSwapTask, setCrSwapTask] = useState(false);
  const [crSwapBell, setCrSwapBell] = useState(false);
  const [crSingleShiftCode, setCrSingleShiftCode] = useState('Y');
  const [crClearTaskAndBell, setCrClearTaskAndBell] = useState(true);
  const [crReason, setCrReason] = useState('');
  
  const [activePopup, setActivePopup] = useState(null);
  const [popupReasonText, setPopupReasonText] = useState('');
  const [showPopupFullMonthCal, setShowPopupFullMonthCal] = useState(false);
  const popupRef = useRef(null);
  const popupManualPosRef = useRef(null);
  const popupJustDraggedRef = useRef(false);
  const popupDragCleanupRef = useRef(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null, title: '確認' });
  const [showTargetCountModal, setShowTargetCountModal] = useState(false);

  // 配布用全体表の印刷設定モーダル用状態
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printPaperSize, setPrintPaperSize] = useState('A4');
  const [printOrientation, setPrintOrientation] = useState('portrait');
  const [printFitMode, setPrintFitMode] = useState('auto'); // 'auto' | 'manual'
  const [printManualScale, setPrintManualScale] = useState(100);
  const [printTeamFilter, setPrintTeamFilter] = useState('all');
  const [printShowJobTitle, setPrintShowJobTitle] = useState(false);
  const [printShowMarks, setPrintShowMarks] = useState(false);
  const [printMeasuredSize, setPrintMeasuredSize] = useState({ width: 1100, height: 600 });
  const printSheetMeasureRef = useRef(null);
  const [excelCopyDone, setExcelCopyDone] = useState(false);
  const [excelMenuAnchor, setExcelMenuAnchor] = useState(null);
  const [excelImportPreview, setExcelImportPreview] = useState(null);
  const [excelImportMode, setExcelImportMode] = useState('overwrite_all');
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isMigratingShiftCode, setIsMigratingShiftCode] = useState(false);
  const [headerNotice, setHeaderNotice] = useState(null);
  const [headerTooltip, setHeaderTooltip] = useState(null);
  const excelFileInputRef = useRef(null);
  const headerNoticeTimerRef = useRef(null);
  const excelCopyDoneTimerRef = useRef(null);

  // 管理者編集用の戻る・進む（Undo / Redo）履歴
  const [undoHistory, setUndoHistory] = useState({ past: [], future: [] });
  const undoHistoryRef = useRef({ past: [], future: [] });
  const activeUndoHistoryKeyRef = useRef(null);
  const [showUndoHistoryModal, setShowUndoHistoryModal] = useState(false);
  const scheduleSnapshotRef = useRef({
    shifts: {},
    tasks: {},
    userInputs: {},
    bells: {},
    leaders: {},
  });
  
  const [viewMode, setViewMode] = useState('personal'); 
  const [currentView, setCurrentView] = useState('all'); 
  const [overallSubViewMode, setOverallSubViewMode] = useState('monthly'); // 'monthly' | 'daily'
  const [selectedDailyViewDay, setSelectedDailyViewDay] = useState(1);
  const [adminCountDisplayMode, setAdminCountDisplayMode] = useState('slot'); // 'slot' (<シフト表示別>) | 'facility' (<施設別>)

// 設定モーダル内のタブ管理
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('category'); 

  const [targetAdminKey, setTargetAdminKey] = useState('all');
  const [selectedTeamPermTab, setSelectedTeamPermTab] = useState('ope');
  const isMasterAdmin = Boolean(appUser && appUser.role === 'admin' && appUser.initialView === 'all');

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
  const [aiLoadingMessage, setAiLoadingMessage] = useState(''); // Step 6 & 7: 自動作成・自動手直し中のメインステータス表示
  const [aiLoadingSubDetail, setAiLoadingSubDetail] = useState(''); // 進捗モニター: 現在の具体的な処理内容
  const [autoFillSteps, setAutoFillSteps] = useState([]); // 進捗モニター: 工程チェックリスト
  const [aiElapsedSec, setAiElapsedSec] = useState(0); // 進捗モニター: 経過秒数
  const [aiRemainingText, setAiRemainingText] = useState(''); // 進捗モニター: 残り目安時間テキスト
  const [isMonitorMinimized, setIsMonitorMinimized] = useState(false); // 進捗モニター: 上部タスクバー最小化フラグ
  const [confirmingCancelAutoFill, setConfirmingCancelAutoFill] = useState(false); // 進捗モニター: 中断確認状態
  const [lastLiveFilledWeekLabel, setLastLiveFilledWeekLabel] = useState(''); // 進捗モニター: 背景の勤務表に仮反映済みの週ラベル
  const isAutoFillRunningRef = useRef(false);
  const autoFillCancelRef = useRef(false);
  const autoFillRunIdRef = useRef(0);
  const autoFillBackupRef = useRef(null);
  const autoFillTimingRef = useRef({
    startTimeMs: 0,
    phase: 'init',
    totalBuildWeeks: 0,
    completedBuildWeeks: 0,
    completedBuildMs: 0,
    currentStepStartMs: 0,
    baseSecPerWeek: 11,
  });

  const [aiModel, setAiModel] = useState('gemini-4-carbon'); 
  const chatEndRef = useRef(null);

  const [showAutoFillModal, setShowAutoFillModal] = useState(false);
  const [autoFillTargetMode, setAutoFillTargetMode] = useState('all'); // 'all' | 'weeks'
  const [selectedAutoFillWeeks, setSelectedAutoFillWeeks] = useState([]);
  const [validationScopeDays, setValidationScopeDays] = useState(null);
  const [validationScopeLabel, setValidationScopeLabel] = useState('');
  const [showValidationModal, setShowValidationModal] = useState(false); // Step 6: 検算チェック結果モーダル
  const [showUncreatedDaysInValidation, setShowUncreatedDaysInValidation] = useState(false);
  const [autoFillValidationSummary, setAutoFillValidationSummary] = useState(null);
  
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
      if (typeof window !== 'undefined' && window.__initial_auth_token) {
        await signInWithCustomToken(auth, window.__initial_auth_token);
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
        
        const loadedCategoryDefs = { ...(data.categoryDefs || DEFAULT_CATEGORY_DEFS) };
        let existingMeCat = Object.values(loadedCategoryDefs).find(c => c && resolveCategoryKind(c) === 'me');
        if (!existingMeCat) {
          loadedCategoryDefs['me'] = { ...DEFAULT_CATEGORY_DEFS['me'] };
          existingMeCat = loadedCategoryDefs['me'];
        }
        const meCatId = existingMeCat.id || 'me';

        const rawShiftDefs = data.shiftDefs || DEFAULT_SHIFT_TYPES;
        const loadedShiftDefs = {};
        Object.keys(rawShiftDefs).forEach(k => {
          if (rawShiftDefs[k]) {
            const catKind = getCategoryKindById(rawShiftDefs[k].category, loadedCategoryDefs);
            loadedShiftDefs[k] = {
              ...rawShiftDefs[k],
              code: rawShiftDefs[k].code || k,
              type: rawShiftDefs[k].type || (catKind === 'role' || k.startsWith('task_') ? 'task' : 'shift'),
            };
          }
        });

        const loadedStaffList = (data.staffList || []).map(s => {
          const restStaff = { ...s };
          delete restStaff.contractWorkDays;
          const resolvedMin =
            s.contractWorkDaysMin !== undefined
              ? (s.contractWorkDaysMin !== '' ? s.contractWorkDaysMin : null)
              : (s.contractWorkDays !== undefined && s.contractWorkDays !== '' ? s.contractWorkDays : null);
          const resolvedMax =
            s.contractWorkDaysMax !== undefined
              ? (s.contractWorkDaysMax !== '' ? s.contractWorkDaysMax : null)
              : (s.contractWorkDays !== undefined && s.contractWorkDays !== '' ? s.contractWorkDays : null);
          return {
            ...restStaff,
            loginId: s.loginId || '',
            skills: s.skills || {},
            minCool3: s.minCool3 !== undefined ? s.minCool3 : 0,
            maxCool3: s.maxCool3 !== undefined ? s.maxCool3 : 5,
            contractWorkDaysMin: resolvedMin,
            contractWorkDaysMax: resolvedMax,
            excludeFromAi: s.excludeFromAi || false,
            excludedCategories: (Array.isArray(s.excludedCategories) ? s.excludedCategories : []).filter(
              cid => loadedCategoryDefs[cid] && resolveCategoryKind(loadedCategoryDefs[cid]) === 'facility'
            ),
            excludedShifts: (Array.isArray(s.excludedShifts) ? s.excludedShifts : []).filter(
              c => isAiAssignableFacilityShiftDef(c, loadedShiftDefs, loadedCategoryDefs)
            ),
            requestNote: s.requestNote || '',
          };
        });
        const existingMeShifts = Object.values(loadedShiftDefs).filter(
          s => s && isMeShiftDef(s.code, loadedShiftDefs, loadedCategoryDefs)
        );
        const hasMeL = existingMeShifts.some(
          s => s.code === 'L' || (s.label || '').trim() === 'L' || (s.label || '').trim() === 'Ｌ'
        );
        const hasMeG = existingMeShifts.some(
          s => s.code === 'G' || (s.label || '').trim() === 'G' || (s.label || '').trim() === 'Ｇ'
        );
        // ME室シフトが未登録、または従来のL/G片方のみ登録されている場合のみ不足分を安全に補完（既存の他シフトコードは絶対に上書きしない）
        if (existingMeShifts.length === 0 || hasMeL || hasMeG) {
          if (!hasMeL) {
            const lKey = !loadedShiftDefs['L'] ? 'L' : 'ME_L';
            if (!loadedShiftDefs[lKey]) {
              loadedShiftDefs[lKey] = { ...DEFAULT_SHIFT_TYPES['L'], code: lKey, category: meCatId };
            }
          }
          if (!hasMeG) {
            const gKey = !loadedShiftDefs['G'] ? 'G' : 'ME_G';
            if (!loadedShiftDefs[gKey]) {
              loadedShiftDefs[gKey] = { ...DEFAULT_SHIFT_TYPES['G'], code: gKey, category: meCatId };
            }
          }
        }

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

    return () => {
      unsubMaster();
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    let isCurrentEffect = true;
    const scheduleId = `schedule_${year}_${month}`;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevScheduleId = `schedule_${prevYear}_${prevMonth}`;

    // 月切り替え時に前月のシフト・タスク等が残って表示/誤保存されないよう即座に初期化
    updateLoadedScheduleId(null);
    setShiftData({});
    setTaskData({});
    setBellData({});
    setLeaderData({});
    setUserInputs({});
    setChangeRequests([]);
    setPrevMonthShiftData({});
    setActivePopup(null);

    const scheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
    const unsubSchedule = onSnapshot(
      scheduleDocRef,
      (docSnap) => {
        if (!isCurrentEffect) return;
        // AI自動作成の週ごとライブ仮反映中は、保存完了または中断までスナップショットによる上書きを保留
        if (isAutoFillRunningRef.current) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          setShiftData(data.shifts || {});
          setTaskData(data.tasks || {});
          setBellData(data.bells || {});
          setLeaderData(data.leaders || {});
          setUserInputs(data.userInputs || {}); // ★追加: 保護リストを読み込む
          setChangeRequests(Array.isArray(data.changeRequests) ? data.changeRequests : []);
        } else {
          setShiftData({});
          setTaskData({});
          setBellData({});
          setLeaderData({});
          setUserInputs({});
          setChangeRequests([]);
        }
        updateLoadedScheduleId(scheduleId);
      },
      (error) => {
        console.error('Schedule load error:', error);
        if (isCurrentEffect) updateLoadedScheduleId(scheduleId);
      }
    );

    // Step 3: 月またぎの連勤・週休・3クール連続判定のため前月スケジュールもリアルタイム購読
    const prevScheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', prevScheduleId);
    const unsubPrevSchedule = onSnapshot(
      prevScheduleDocRef,
      (docSnap) => {
        if (!isCurrentEffect) return;
        if (docSnap.exists()) {
          const pData = docSnap.data();
          setPrevMonthShiftData(pData.shifts || {});
        } else {
          setPrevMonthShiftData({});
        }
      },
      (error) => {
        console.error('Prev schedule load error:', error);
      }
    );

    return () => {
      isCurrentEffect = false;
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

// ★引数に newUserInputs / newBells / newLeaders / newChangeRequests を追加し、デフォルト値として現在の状態を維持します
  const saveSchedule = async (
    newShifts,
    newTasks,
    newUserInputs = userInputs,
    newBells = bellData,
    newLeaders = leaderData,
    newChangeRequests = changeRequests
  ) => {
    if (!authUser) return;
    const scheduleId = `schedule_${year}_${month}`;
    // 月切り替え直後の読み込み完了前に前月データで上書き保存するのを防止
    if (loadedScheduleIdRef.current !== scheduleId) return;
    const scheduleDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
    
    try {
      // ★ userInputs / bells / leaders / changeRequests も一緒に保存します
      await updateDoc(scheduleDocRef, {
        shifts: newShifts,
        tasks: newTasks,
        userInputs: newUserInputs,
        bells: newBells,
        leaders: newLeaders,
        changeRequests: newChangeRequests,
      });
    } catch (e) {
      if (e.code === 'not-found') {
        await setDoc(scheduleDocRef, {
          shifts: newShifts,
          tasks: newTasks,
          userInputs: newUserInputs,
          bells: newBells,
          leaders: newLeaders,
          changeRequests: newChangeRequests,
        });
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
      const cloned = { ...rawEntry };
      if (cloned.teamShiftBy === 'opera') cloned.teamShiftBy = 'ope';
      if (cloned.teamTaskBy === 'opera') cloned.teamTaskBy = 'ope';
      if (cloned.editedShiftBy === 'opera') cloned.editedShiftBy = 'ope';
      if (cloned.editedTaskBy === 'opera') cloned.editedTaskBy = 'ope';
      return cloned;
    }
    return {};
  };

  // userInputsエントリに保持すべき履歴・管理者メタデータが残っているか判定
  const hasAnyUserInputMetadata = (entry) =>
    Boolean(
      entry &&
        typeof entry === 'object' &&
        (entry.shift ||
          entry.task ||
          entry.teamShiftBy ||
          entry.teamTaskBy ||
          entry.editedShiftBy ||
          entry.editedTaskBy ||
          entry.editedBellBy ||
          entry.editedLeaderBy)
    );

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

  // 当月がスタッフ入力の締切日を過ぎているか判定（カテゴリ3 B案の申請モード切替にも使用）
  const isAfterDeadlineForCurrentMonth = useMemo(() => {
    const today = new Date();
    const todayStr =
      today.getFullYear() +
      '-' +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      '-' +
      today.getDate().toString().padStart(2, '0');
    const deadlineDay = parseInt(adminSettings.deadlineDay, 10);

    if (deadlineDay && !isNaN(deadlineDay)) {
      const deadlineDate = new Date(year, month - 2, deadlineDay);
      const deadlineStr =
        deadlineDate.getFullYear() +
        '-' +
        (deadlineDate.getMonth() + 1).toString().padStart(2, '0') +
        '-' +
        deadlineDate.getDate().toString().padStart(2, '0');
      if (todayStr > deadlineStr) {
        return true;
      }
    }
    return false;
  }, [year, month, adminSettings.deadlineDay]);

  // カテゴリ3(B案): スタッフ用の勤務変更・交換申請モーダルを開く初期化ヘルパー
  const openStaffChangeRequestModal = (initialDay = 1, defaultMode = 'swap') => {
    if (!appUser || appUser.role !== 'staff') return;
    const validDay = Math.max(1, Math.min(getDaysInMonth(year, month), Number(initialDay) || 1));
    const otherStaff = staffList.filter(s => s.id !== appUser.id);
    const defaultPartnerId =
      crTargetStaffId && otherStaff.some(s => s.id === crTargetStaffId)
        ? crTargetStaffId
        : otherStaff[0]?.id || '';

    const myTask = Boolean(taskData[appUser.id]?.[validDay]);
    const myBell = Boolean(bellData[appUser.id]?.[validDay]);
    const isSun = isSunday(year, month, validDay);

    setCrMode(defaultMode);
    setCrRequesterDay(validDay);
    setCrTargetStaffId(defaultPartnerId);
    setCrTargetDay(validDay);
    setCrSameDay(true);
    setCrSwapShift(!isSun || Boolean(shiftData[appUser.id]?.[validDay]));
    setCrSwapTask(myTask);
    setCrSwapBell(myBell || isSun);

    const defaultOffCode = shiftDefs['Y']
      ? 'Y'
      : Object.values(shiftDefs).find(s => s && isTrueOffShiftDef(s, categoryDefs))?.code || '__CLEAR__';
    setCrSingleShiftCode(defaultOffCode);
    setCrClearTaskAndBell(true);
    setCrReason('');
    setActivePopup(null);
    setShowChangeRequestModal(true);
  };

  // スタッフ入力時の締切日超過チェック共通関数
  const checkIsAfterDeadlineForStaff = (targetDay = 1) => {
    if (isAfterDeadlineForCurrentMonth) {
      openStaffChangeRequestModal(targetDay, 'swap');
      return true;
    }
    return false;
  };

  // カテゴリ3(B案): スタッフ本人による勤務交換（A⇔B）・休み変更申請の送信
  const handleSubmitChangeRequest = () => {
    if (!appUser || appUser.role !== 'staff') return;
    const reqDay = Number(crRequesterDay);
    if (!reqDay || reqDay < 1 || reqDay > getDaysInMonth(year, month)) {
      alert('対象日を正しく選択してください。');
      return;
    }

    if (crMode === 'swap') {
      if (!crTargetStaffId || crTargetStaffId === appUser.id) {
        alert('交換相手の職員を選択してください。');
        return;
      }
      const partner = staffList.find(s => s.id === crTargetStaffId);
      if (!partner) {
        alert('交換相手の職員情報が見つかりません。');
        return;
      }
      const tDay = crSameDay ? reqDay : Number(crTargetDay);
      if (!tDay || tDay < 1 || tDay > getDaysInMonth(year, month)) {
        alert('相手の対象日を正しく選択してください。');
        return;
      }
      if (!crSwapShift && !crSwapTask && !crSwapBell) {
        alert('入れ替える項目（シフト・タスク・緊急待機番）を1つ以上選択してください。');
        return;
      }

      const myS = shiftData[appUser.id]?.[reqDay] || null;
      const myT = taskData[appUser.id]?.[reqDay] || null;
      const myB = Boolean(bellData[appUser.id]?.[reqDay]);
      const partnerS = shiftData[crTargetStaffId]?.[tDay] || null;
      const partnerT = taskData[crTargetStaffId]?.[tDay] || null;
      const partnerB = Boolean(bellData[crTargetStaffId]?.[tDay]);

      const hasAnyDiff =
        (crSwapShift && myS !== partnerS) ||
        (crSwapTask && myT !== partnerT) ||
        (crSwapBell && myB !== partnerB);
      if (!hasAnyDiff) {
        alert('選択された項目は現在あなたと交換相手で同じ内容のため、入れ替えによる変化がありません。');
        return;
      }

      const newReq = {
        id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        status: 'pending',
        type: 'swap',
        requestType: 'swap',
        requesterId: appUser.id,
        requesterName: appUser.name,
        requesterDay: reqDay,
        targetStaffId: crTargetStaffId,
        targetStaffName: partner.name,
        targetDay: tDay,
        swapShift: Boolean(crSwapShift),
        swapTask: Boolean(crSwapTask),
        swapBell: Boolean(crSwapBell),
        reason: (crReason || '').trim().slice(0, 100),
        requesterShift: myS,
        targetShift: partnerS,
        snapshot: {
          requesterShift: myS,
          requesterTask: myT,
          requesterBell: myB,
          targetShift: partnerS,
          targetTask: partnerT,
          targetBell: partnerB,
        },
        resolvedAt: null,
      };

      const nextList = [newReq, ...changeRequests];
      setChangeRequests(nextList);
      saveSchedule(shiftData, taskData, userInputs, bellData, leaderData, nextList);
      setCrReason('');
      alert(`${partner.name}さんとのシフト交換申請を送信しました。\n管理者の承認後に勤務表へ反映されます。`);
    } else {
      const currentS = shiftData[appUser.id]?.[reqDay] || null;
      const targetS = !crSingleShiftCode || crSingleShiftCode === '__CLEAR__' ? null : crSingleShiftCode;
      if (currentS === targetS) {
        alert('現在のシフトと同じ内容が選択されています。');
        return;
      }

      const newReq = {
        id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        status: 'pending',
        type: 'single',
        requestType: 'single',
        requesterId: appUser.id,
        requesterName: appUser.name,
        requesterDay: reqDay,
        beforeShift: currentS,
        requestedShiftCode: targetS || '__CLEAR__',
        clearTaskAndBellOnOff: Boolean(crClearTaskAndBell),
        reason: (crReason || '').trim().slice(0, 100),
        snapshot: {
          requesterShift: currentS,
          requesterTask: taskData[appUser.id]?.[reqDay] || null,
          requesterBell: Boolean(bellData[appUser.id]?.[reqDay]),
        },
        resolvedAt: null,
      };

      const nextList = [newReq, ...changeRequests];
      setChangeRequests(nextList);
      saveSchedule(shiftData, taskData, userInputs, bellData, leaderData, nextList);
      setCrReason('');
      alert('勤務変更（休み等）の申請を送信しました。\n管理者の承認後に勤務表へ反映されます。');
    }
  };

  // カテゴリ3(B案): スタッフ本人による未処理申請の取り消し
  const handleCancelChangeRequest = (reqId) => {
    const target = changeRequests.find(r => r && r.id === reqId);
    if (!target) return;
    if (appUser.role === 'staff' && target.requesterId !== appUser.id) return;
    if (target.status !== 'pending') return;
    const nextList = changeRequests.filter(r => r && r.id !== reqId);
    setChangeRequests(nextList);
    saveSchedule(shiftData, taskData, userInputs, bellData, leaderData, nextList);
  };

  // カテゴリ3(B案): 全体管理者が承認カード上で入れ替え対象チェック（シフト・タスク・ベル等）を微調整するヘルパー
  const handleUpdatePendingRequestOption = (reqId, keyOrPatch, value) => {
    if (!isMasterAdmin) return;
    const patch = typeof keyOrPatch === 'string' ? { [keyOrPatch]: value } : keyOrPatch;
    const nextList = changeRequests.map(r => (r && r.id === reqId ? { ...r, ...patch } : r));
    setChangeRequests(nextList);
    saveSchedule(shiftData, taskData, userInputs, bellData, leaderData, nextList);
  };

  // カテゴリ3(B案): 全体管理者による変更・交換申請のワンクリック承認＆勤務表反映
  const handleApproveChangeRequest = (reqOrId) => {
    const req = typeof reqOrId === 'string' ? changeRequests.find(r => r && r.id === reqOrId) : reqOrId;
    if (!isMasterAdmin || !req || req.status !== 'pending') return;

    const nextShifts = { ...shiftData };
    const nextTasks = { ...taskData };
    const nextBells = { ...bellData };
    const nextLeaders = { ...leaderData };
    const nextUserInputs = { ...userInputs };

    const updateTeamInputMark = (staffId, day, field, nextTeamKey) => {
      const entry = normalizeUserInputEntry(
        nextUserInputs[staffId]?.[day],
        shiftData[staffId]?.[day],
        taskData[staffId]?.[day]
      );
      if (nextTeamKey) {
        entry[field] = nextTeamKey;
      } else {
        delete entry[field];
      }
      const staffInputs = { ...(nextUserInputs[staffId] || {}) };
      if (hasAnyUserInputMetadata(entry)) {
        staffInputs[day] = entry;
        nextUserInputs[staffId] = staffInputs;
      } else {
        delete staffInputs[day];
        if (Object.keys(staffInputs).length > 0) nextUserInputs[staffId] = staffInputs;
        else delete nextUserInputs[staffId];
      }
    };

    const resolveMovedTeamShiftKey = (sourceTeamKey, destStaffId, destShiftCode) => {
      if (!destShiftCode) return null;
      if (!sourceTeamKey) return isMeRoomShiftCode(destShiftCode) ? 'ope' : 'all';
      if (sourceTeamKey === 'hhd') {
        const destStaff = staffList.find(s => s.id === destStaffId);
        if (!destStaff || !Array.isArray(destStaff.roles) || !destStaff.roles.includes('HHD班')) {
          return 'all';
        }
      }
      return sourceTeamKey;
    };

    const cleanLeaderFlagIfNeeded = (staffId, day, newShiftCode) => {
      if (!nextLeaders[staffId]?.[day]) return;
      const nextDef = newShiftCode ? shiftDefs[newShiftCode] : null;
      const nextCat = nextDef ? categoryDefs[nextDef.category] : null;
      const keepsTargetFacility = Boolean(
        nextDef &&
          getEffectiveShiftType(nextDef, categoryDefs) === 'shift' &&
          isLeaderHighlightTargetFacility(nextCat)
      );
      if (!keepsTargetFacility) {
        const staffL = { ...(nextLeaders[staffId] || {}) };
        delete staffL[day];
        if (Object.keys(staffL).length > 0) nextLeaders[staffId] = staffL;
        else delete nextLeaders[staffId];
      }
    };

    if ((req.requestType || req.type) === 'swap') {
      const s1 = req.requesterId;
      const d1 = Number(req.requesterDay);
      const s2 = req.targetStaffId;
      const d2 = Number(req.targetDay || req.requesterDay);

      if (!req.swapShift && !req.swapTask && !req.swapBell) {
        alert('入れ替える項目（シフト・タスク・ベル）が1つも選択されていません。');
        return;
      }

      const curS1 = nextShifts[s1]?.[d1] || null;
      const curS2 = nextShifts[s2]?.[d2] || null;
      const curT1 = nextTasks[s1]?.[d1] || null;
      const curT2 = nextTasks[s2]?.[d2] || null;
      const curB1 = Boolean(nextBells[s1]?.[d1]);
      const curB2 = Boolean(nextBells[s2]?.[d2]);
      const curTeamShift1 = userInputs[s1]?.[d1] && typeof userInputs[s1][d1] === 'object' ? userInputs[s1][d1].teamShiftBy || null : null;
      const curTeamShift2 = userInputs[s2]?.[d2] && typeof userInputs[s2][d2] === 'object' ? userInputs[s2][d2].teamShiftBy || null : null;
      const curTeamTask1 = userInputs[s1]?.[d1] && typeof userInputs[s1][d1] === 'object' ? userInputs[s1][d1].teamTaskBy || null : null;
      const curTeamTask2 = userInputs[s2]?.[d2] && typeof userInputs[s2][d2] === 'object' ? userInputs[s2][d2].teamTaskBy || null : null;
      const curEditedShift1 = userInputs[s1]?.[d1] && typeof userInputs[s1][d1] === 'object' ? userInputs[s1][d1].editedShiftBy || null : null;
      const curEditedShift2 = userInputs[s2]?.[d2] && typeof userInputs[s2][d2] === 'object' ? userInputs[s2][d2].editedShiftBy || null : null;
      const curEditedTask1 = userInputs[s1]?.[d1] && typeof userInputs[s1][d1] === 'object' ? userInputs[s1][d1].editedTaskBy || null : null;
      const curEditedTask2 = userInputs[s2]?.[d2] && typeof userInputs[s2][d2] === 'object' ? userInputs[s2][d2].editedTaskBy || null : null;

      if (req.snapshot) {
        const snapshotMismatch =
          (req.swapShift && (curS1 !== (req.snapshot.requesterShift || null) || curS2 !== (req.snapshot.targetShift || null))) ||
          (req.swapTask && (curT1 !== (req.snapshot.requesterTask || null) || curT2 !== (req.snapshot.targetTask || null))) ||
          (req.swapBell && (curB1 !== Boolean(req.snapshot.requesterBell) || curB2 !== Boolean(req.snapshot.targetBell)));
        if (snapshotMismatch) {
          const ok = window.confirm(
            '申請時点から現在までにシフト・タスク・ベルのいずれかが変更されています。\n現在の勤務表の状態同士を入れ替えて反映しますか？'
          );
          if (!ok) return;
        }
      }

      if (req.swapShift) {
        nextShifts[s1] = { ...(nextShifts[s1] || {}) };
        nextShifts[s2] = { ...(nextShifts[s2] || {}) };
        if (curS2) nextShifts[s1][d1] = curS2;
        else delete nextShifts[s1][d1];
        if (curS1) nextShifts[s2][d2] = curS1;
        else delete nextShifts[s2][d2];
        cleanLeaderFlagIfNeeded(s1, d1, curS2);
        cleanLeaderFlagIfNeeded(s2, d2, curS1);
        updateTeamInputMark(s1, d1, 'teamShiftBy', resolveMovedTeamShiftKey(curTeamShift2, s1, curS2));
        updateTeamInputMark(s2, d2, 'teamShiftBy', resolveMovedTeamShiftKey(curTeamShift1, s2, curS1));
        updateTeamInputMark(s1, d1, 'editedShiftBy', curS2 ? (curEditedShift2 || 'all') : null);
        updateTeamInputMark(s2, d2, 'editedShiftBy', curS1 ? (curEditedShift1 || 'all') : null);
      }

      if (req.swapTask) {
        nextTasks[s1] = { ...(nextTasks[s1] || {}) };
        nextTasks[s2] = { ...(nextTasks[s2] || {}) };
        if (curT2) nextTasks[s1][d1] = curT2;
        else delete nextTasks[s1][d1];
        if (curT1) nextTasks[s2][d2] = curT1;
        else delete nextTasks[s2][d2];
        updateTeamInputMark(s1, d1, 'teamTaskBy', curT2 ? curTeamTask2 : null);
        updateTeamInputMark(s2, d2, 'teamTaskBy', curT1 ? curTeamTask1 : null);
        updateTeamInputMark(s1, d1, 'editedTaskBy', curT2 ? (curEditedTask2 || 'all') : null);
        updateTeamInputMark(s2, d2, 'editedTaskBy', curT1 ? (curEditedTask1 || 'all') : null);
      }

      if (req.swapBell) {
        const bMap1 = { ...(nextBells[s1] || {}) };
        if (curB2) bMap1[d1] = true;
        else delete bMap1[d1];
        if (Object.keys(bMap1).length > 0) nextBells[s1] = bMap1;
        else delete nextBells[s1];

        const bMap2 = { ...(nextBells[s2] || {}) };
        if (curB1) bMap2[d2] = true;
        else delete bMap2[d2];
        if (Object.keys(bMap2).length > 0) nextBells[s2] = bMap2;
        else delete nextBells[s2];
      }
    } else {
      const s1 = req.requesterId;
      const d1 = Number(req.requesterDay);
      const newCode = req.requestedShiftCode === '__CLEAR__' ? null : req.requestedShiftCode;

      nextShifts[s1] = { ...(nextShifts[s1] || {}) };
      if (newCode) nextShifts[s1][d1] = newCode;
      else delete nextShifts[s1][d1];
      cleanLeaderFlagIfNeeded(s1, d1, newCode);
      updateTeamInputMark(s1, d1, 'teamShiftBy', newCode ? (isMeRoomShiftCode(newCode) ? 'ope' : 'all') : null);
      updateTeamInputMark(s1, d1, 'editedShiftBy', newCode ? 'all' : null);

      if (req.clearTaskAndBellOnOff) {
        if (nextTasks[s1]?.[d1]) {
          nextTasks[s1] = { ...nextTasks[s1] };
          delete nextTasks[s1][d1];
          updateTeamInputMark(s1, d1, 'teamTaskBy', null);
          updateTeamInputMark(s1, d1, 'editedTaskBy', null);
        }
        if (nextBells[s1]?.[d1]) {
          const bMap = { ...nextBells[s1] };
          delete bMap[d1];
          if (Object.keys(bMap).length > 0) nextBells[s1] = bMap;
          else delete nextBells[s1];
        }
      }
    }

    const nextChangeRequests = changeRequests.map(r =>
      r && r.id === req.id ? { ...r, status: 'approved', resolvedAt: new Date().toISOString() } : r
    );

    setShiftData(nextShifts);
    setTaskData(nextTasks);
    setUserInputs(nextUserInputs);
    setBellData(nextBells);
    setLeaderData(nextLeaders);
    setChangeRequests(nextChangeRequests);
    saveSchedule(nextShifts, nextTasks, nextUserInputs, nextBells, nextLeaders, nextChangeRequests);
  };

  // カテゴリ3(B案): 全体管理者による申請の却下
  const handleRejectChangeRequest = (reqId) => {
    if (!isMasterAdmin) return;
    const nextChangeRequests = changeRequests.map(r =>
      r && r.id === reqId ? { ...r, status: 'rejected', resolvedAt: new Date().toISOString() } : r
    );
    setChangeRequests(nextChangeRequests);
    saveSchedule(shiftData, taskData, userInputs, bellData, leaderData, nextChangeRequests);
  };

  // カテゴリ3(B案): 処理済み（承認済・却下）の申請履歴をクリア
  const handleClearResolvedChangeRequests = () => {
    if (!isMasterAdmin) return;
    const nextChangeRequests = changeRequests.filter(r => r && r.status === 'pending');
    setChangeRequests(nextChangeRequests);
    saveSchedule(shiftData, taskData, userInputs, bellData, leaderData, nextChangeRequests);
  };

  // スタッフが既存の希望に対して「希望理由のみ」を追記・更新・削除するハンドラ
  const handleSaveStaffReason = (staffId, day, newReason) => {
    if (appUser.role === 'staff') {
      if (staffId !== appUser.id) return;
      if (checkIsAfterDeadlineForStaff(day)) return;
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
    if (appUser?.role === 'admin') {
      const targetStaff = staffList.find(s => s.id === staffId);
      const reqCode = type === 'shift' ? getUserRequestedShift(staffId, day) : getUserRequestedTask(staffId, day);
      const reqLabel = reqCode ? (shiftDefs[reqCode]?.label || reqCode) : '希望';
      recordAdminUndoSnapshot(null, {
        label: `${targetStaff?.name || '職員'}（${month}/${day}）${type === 'shift' ? 'シフト' : 'タスク'}希望取消`,
        detail: `${reqLabel} を取消`,
      });
    }
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

    if (hasAnyUserInputMetadata(entry)) {
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

  // 現在のシフト設定に整合した休み希望カウント対象コード一覧を解決
  // ※施設シフト以外の「委・日勤・3以外・出勤」は出勤希望扱いのため休み希望数カウントから常時除外
  const resolveEffectiveCountedOffShifts = useCallback((settingsObj = adminSettings, defs = shiftDefs, cats = categoryDefs) => {
    const rawList = Array.isArray(settingsObj?.countedOffShifts) ? settingsObj.countedOffShifts : ['HOPE'];
    const isUntouchedDefault = rawList.length === 1 && rawList[0] === 'HOPE';
    if (isUntouchedDefault) {
      // 初期値['HOPE']のままの場合は、純粋な休み・休み希望（委・日勤・3以外を除く）および公出を自動対象にする
      const autoCodes = Object.values(defs)
        .filter(
          s =>
            s &&
            getEffectiveShiftType(s, cats) === 'shift' &&
            (isTrueOffShiftDef(s, cats) || isKoushutsuShiftDef(s, cats))
        )
        .map(s => s.code);
      if (autoCodes.length > 0) return autoCodes;
    }
    const existingMatched = rawList.filter(c => Boolean(defs[c]) && !isWorkRequestShiftDef(defs[c], cats));
    if (existingMatched.length > 0) return existingMatched;
    return rawList.filter(c => !defs[c] || !isWorkRequestShiftDef(defs[c], cats));
  }, [adminSettings, shiftDefs, categoryDefs]);

  // 基本設定でカウント対象シフトをON/OFF切り替え
  const toggleCountedOffShift = (code) => {
    const currentList = resolveEffectiveCountedOffShifts(adminSettings, shiftDefs, categoryDefs);
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
    return isMeShiftDef(code, defs, cats);
  };

  // 現在ログイン中または選択中の班管理者キー（ope / echo / hhd）を取得
  const getActiveTeamAdminKey = () => {
    if (!appUser || appUser.role !== 'admin') return null;
    if (['ope', 'echo', 'hhd'].includes(appUser.initialView)) return appUser.initialView;
    if (['ope', 'echo', 'hhd'].includes(currentView)) return currentView;
    return null;
  };

  // 現在ログインしている管理者自身のキー（'all' | 'ope' | 'echo' | 'hhd'）と表示名を取得
  const getLoggedInAdminKey = () => {
    if (!appUser || appUser.role !== 'admin') return null;
    return ['ope', 'echo', 'hhd'].includes(appUser.initialView) ? appUser.initialView : 'all';
  };

  const getLoggedInAdminDisplayLabel = (adminKey = getLoggedInAdminKey()) => {
    if (!adminKey) return '管理者';
    return adminSettings?.[adminKey]?.label || TEAM_ADMIN_LABELS[adminKey] || '全体管理者';
  };

  // 各班管理者（ope / echo / hhd）のデフォルト入力可能シフトコード一覧を算出（未設定時の互換用）
  const getDefaultTeamAllowedShiftCodes = (teamKey, defs = shiftDefs, cats = categoryDefs) => {
    const allShiftCodes = Object.values(defs)
      .filter(s => s && getEffectiveShiftType(s, cats) === 'shift')
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .map(s => s.code);
    if (teamKey === 'ope') {
      return allShiftCodes.filter(c => isMeShiftDef(c, defs, cats));
    }
    return allShiftCodes;
  };

  // 各班管理者（ope / echo / hhd）の実効入力可能シフトコード一覧を解決
  const resolveTeamAllowedShiftCodes = (teamKey, settingsObj = adminSettings, defs = shiftDefs, cats = categoryDefs) => {
    if (!['ope', 'echo', 'hhd'].includes(teamKey)) return [];
    const savedMap = settingsObj?.teamAllowedShifts;
    if (savedMap && Array.isArray(savedMap[teamKey])) {
      return savedMap[teamKey].filter(c => Boolean(defs[c]) && getEffectiveShiftType(defs[c], cats) === 'shift');
    }
    return getDefaultTeamAllowedShiftCodes(teamKey, defs, cats);
  };

  // 各班管理者（ope / echo / hhd）の実効入力可能タスクコード一覧を解決
  const resolveTeamAllowedTaskCodes = (teamKey, settingsObj = adminSettings, defs = shiftDefs, cats = categoryDefs) => {
    if (!['ope', 'echo', 'hhd'].includes(teamKey)) return [];
    const allTaskCodes = Object.values(defs)
      .filter(s => s && getEffectiveShiftType(s, cats) === 'task')
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .map(s => s.code);
    const savedMap = settingsObj?.teamAllowedTasks;
    if (savedMap && Array.isArray(savedMap[teamKey])) {
      return savedMap[teamKey].filter(c => Boolean(defs[c]) && getEffectiveShiftType(defs[c], cats) === 'task');
    }
    return allTaskCodes;
  };

  // 全体管理者専用: 各班管理者の入力可能シフト・タスク設定を更新＆即時保存
  const saveTeamAllowedCodes = (teamKey, nextCodes, codeType = 'shift') => {
    if (!isMasterAdmin || !['ope', 'echo', 'hhd'].includes(teamKey)) return;
    const fieldName = codeType === 'task' ? 'teamAllowedTasks' : 'teamAllowedShifts';
    const currentMap = adminSettings?.[fieldName] && typeof adminSettings[fieldName] === 'object' ? adminSettings[fieldName] : {};
    const nextMap = { ...currentMap };
    if (nextCodes === null) {
      delete nextMap[teamKey];
    } else {
      nextMap[teamKey] = Array.from(new Set(nextCodes));
    }
    const newSettings = { ...adminSettings, [fieldName]: nextMap };
    setAdminSettings(newSettings);
    saveMasterData({ adminSettings: newSettings });
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

  // 各班管理者が該当セルを「クリア（空欄化）」可能か判定（自班が入力したセルのみクリア許可。上書き入力自体は許可されたシフト・タスクであれば可能）
  const canTeamAdminClearCell = (staffId, day, type = 'shift') => {
    if (!appUser || appUser.role !== 'admin' || isMasterAdmin) {
      return { allowed: true, reason: '' };
    }
    const myTeam = appUser.initialView;
    if (type === 'task') {
      const currentTask = taskData[staffId]?.[day];
      if (!currentTask) return { allowed: false, reason: '' };
      const ownerTeam = getTeamLockedTaskSource(staffId, day);
      if (ownerTeam === myTeam) return { allowed: true, reason: '' };
      if (ownerTeam) {
        const ownerLabel = adminSettings[ownerTeam]?.label || TEAM_ADMIN_LABELS[ownerTeam] || '他班の管理者';
        return { allowed: false, reason: `${ownerLabel}が入力したタスクのため、クリアできません。` };
      }
      const reqTask = getUserRequestedTask(staffId, day);
      if (reqTask && currentTask === reqTask) {
        return { allowed: false, reason: '職員本人が入力したタスクのため、クリアできません。' };
      }
      return { allowed: false, reason: '全体管理者が設定したタスクのため、クリアできません。' };
    }

    const currentShift = shiftData[staffId]?.[day];
    if (!currentShift) return { allowed: false, reason: '' };
    const ownerTeam = getTeamLockedShiftSource(staffId, day);
    if (ownerTeam === myTeam) return { allowed: true, reason: '' };
    if (ownerTeam) {
      const ownerLabel = adminSettings[ownerTeam]?.label || TEAM_ADMIN_LABELS[ownerTeam] || '他班の管理者';
      return { allowed: false, reason: `${ownerLabel}が入力したシフトのため、クリアできません。` };
    }
    const reqShift = getUserRequestedShift(staffId, day);
    if (reqShift && currentShift === reqShift) {
      return { allowed: false, reason: '職員本人が入力した希望・シフトのため、クリアできません。' };
    }
    return { allowed: false, reason: '全体管理者が設定したシフトのため、クリアできません。' };
  };

const handleUpdateCell = async (staffId, day, toolCode, type = 'shift', reasonOverride = undefined) => {
    if (type === 'shift' && toolCode && isMeShiftDef(toolCode, shiftDefs, categoryDefs)) {
      const targetSt = staffList.find(s => s.id === staffId);
      if (targetSt && !isMeTeamMember(targetSt)) {
        alert('L・G（ME室）シフトはME班（オペ班）のスタッフのみ設定可能です。');
        return;
      }
    }
    if (isSunday(year, month, day)) {
      if (type !== 'shift') return;
      if (toolCode && (!shiftDefs[toolCode] || !isKoushutsuShiftDef(shiftDefs[toolCode], categoryDefs))) {
        alert('日曜日は「公出」のみ入力可能です。');
        return;
      }
    }
    if (appUser.role === 'staff') {
      if (staffId !== appUser.id) return; 
      // 締切チェック
      if (checkIsAfterDeadlineForStaff(day)) return;
    } else if (appUser.role === 'admin' && !isMasterAdmin) {
      if (!toolCode) {
        const existingVal = type === 'task' ? taskData[staffId]?.[day] : shiftData[staffId]?.[day];
        if (!existingVal) return;
        const clearPerm = canTeamAdminClearCell(staffId, day, type);
        if (!clearPerm.allowed) {
          if (clearPerm.reason) alert(clearPerm.reason);
          return;
        }
      } else {
        // 各班管理者ログイン時は、全体管理者が許可したシフト・タスクであれば上書き入力も可能（許可外の項目のみブロック）
        const allowedCodes =
          type === 'task'
            ? resolveTeamAllowedTaskCodes(appUser.initialView, adminSettings, shiftDefs, categoryDefs)
            : resolveTeamAllowedShiftCodes(appUser.initialView, adminSettings, shiftDefs, categoryDefs);
        if (!allowedCodes.includes(toolCode)) {
          const teamLabel = adminSettings[appUser.initialView]?.label || TEAM_ADMIN_LABELS[appUser.initialView] || 'この班の管理者';
          alert(`${teamLabel}では選択・入力できない項目です。`);
          return;
        }
      }
    }

    // ★追加: 個人の入力(希望履歴)と班管理者の入力元フラグを裏側で保持・更新する変数
    const currentShiftBefore = shiftData[staffId]?.[day];
    const currentTaskBefore = taskData[staffId]?.[day];
    const entry = normalizeUserInputEntry(userInputs[staffId]?.[day], currentShiftBefore, currentTaskBefore);
    const activeTeamKey = getActiveTeamAdminKey();
    const loginAdminKey = getLoggedInAdminKey();

    const nextUserInputs = { ...userInputs };
    if (nextUserInputs[staffId]) {
      nextUserInputs[staffId] = { ...nextUserInputs[staffId] };
    } else {
      nextUserInputs[staffId] = {};
    }

    if (type === 'shift') {
      if (appUser.role === 'admin') {
        const changedShift = (toolCode || null) !== (currentShiftBefore || null);
        const changedOwner =
          toolCode &&
          (entry.editedShiftBy !== loginAdminKey ||
            (activeTeamKey && entry.teamShiftBy !== activeTeamKey));
        if (changedShift || changedOwner) {
          const targetStaff = staffList.find(s => s.id === staffId);
          const beforeLbl = currentShiftBefore ? (shiftDefs[currentShiftBefore]?.label || currentShiftBefore) : '空欄';
          const afterLbl = toolCode ? (shiftDefs[toolCode]?.label || toolCode) : '空欄';
          recordAdminUndoSnapshot(null, {
            label: `${targetStaff?.name || '職員'}（${month}/${day}）シフト変更`,
            detail: `${beforeLbl} → ${afterLbl}`,
          });
        }
      }

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
          } else if (entry.shift === toolCode) {
            delete entry.teamShiftBy;
          } else {
            entry.teamShiftBy = loginAdminKey || 'all';
          }
          if (!activeTeamKey && entry.shift === toolCode) {
            delete entry.editedShiftBy;
          } else if (loginAdminKey) {
            entry.editedShiftBy = loginAdminKey;
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
          if (entry.shift && loginAdminKey) {
            entry.editedShiftBy = loginAdminKey;
          } else {
            delete entry.editedShiftBy;
          }
        }
      }

      // シフトクリアまたは坂田・君津以外への変更時は手動リーダー色付けフラグも自動解除
      let nextLeaders = leaderData;
      if (leaderData[staffId]?.[day]) {
        const nextDef = toolCode ? shiftDefs[toolCode] : null;
        const nextCat = nextDef ? categoryDefs[nextDef.category] : null;
        const keepsTargetFacility = Boolean(
          nextDef &&
          getEffectiveShiftType(nextDef, categoryDefs) === 'shift' &&
          isLeaderHighlightTargetFacility(nextCat)
        );
        if (!keepsTargetFacility) {
          nextLeaders = { ...leaderData };
          const staffL = { ...(nextLeaders[staffId] || {}) };
          delete staffL[day];
          if (Object.keys(staffL).length > 0) nextLeaders[staffId] = staffL;
          else delete nextLeaders[staffId];
          delete entry.editedLeaderBy;
          setLeaderData(nextLeaders);
        }
      }

      if (hasAnyUserInputMetadata(entry)) {
        nextUserInputs[staffId][day] = entry;
      } else {
        delete nextUserInputs[staffId][day];
      }

      setShiftData(nextShifts);
      setUserInputs(nextUserInputs); // ★追加
      saveSchedule(nextShifts, taskData, nextUserInputs, bellData, nextLeaders); // ★引数追加
    } else {
      if (appUser.role === 'admin') {
        const changedTask = (toolCode || null) !== (currentTaskBefore || null);
        const changedOwner =
          toolCode &&
          (entry.editedTaskBy !== loginAdminKey ||
            (activeTeamKey && entry.teamTaskBy !== activeTeamKey));
        if (changedTask || changedOwner) {
          const targetStaff = staffList.find(s => s.id === staffId);
          const beforeLbl = currentTaskBefore ? (shiftDefs[currentTaskBefore]?.label || currentTaskBefore) : '空欄';
          const afterLbl = toolCode ? (shiftDefs[toolCode]?.label || toolCode) : '空欄';
          recordAdminUndoSnapshot(null, {
            label: `${targetStaff?.name || '職員'}（${month}/${day}）タスク変更`,
            detail: `${beforeLbl} → ${afterLbl}`,
          });
        }
      }

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
          } else if (entry.task === toolCode) {
            delete entry.teamTaskBy;
          } else {
            entry.teamTaskBy = loginAdminKey || 'all';
          }
          if (!activeTeamKey && entry.task === toolCode) {
            delete entry.editedTaskBy;
          } else if (loginAdminKey) {
            entry.editedTaskBy = loginAdminKey;
          }
        }
      } else {
        delete nextTasks[staffId][day];
        if (appUser.role === 'staff') {
          delete entry.task;
        } else if (appUser.role === 'admin') {
          delete entry.teamTaskBy;
          if (entry.task && loginAdminKey) {
            entry.editedTaskBy = loginAdminKey;
          } else {
            delete entry.editedTaskBy;
          }
        }
      }

      if (hasAnyUserInputMetadata(entry)) {
        nextUserInputs[staffId][day] = entry;
      } else {
        delete nextUserInputs[staffId][day];
      }

      setTaskData(nextTasks);
      setUserInputs(nextUserInputs); // ★追加
      saveSchedule(shiftData, nextTasks, nextUserInputs); // ★引数追加
    }
  };

  // 緊急待機番(ベル)のタスク欄背景色（オレンジ）をタスク内容を変更せずにON/OFF切り替え
  const handleToggleBell = (staffId, day) => {
    if (!appUser || appUser.role !== 'admin') return;
    const targetStaff = staffList.find(s => s.id === staffId);
    const wasBellOn = Boolean(bellData[staffId]?.[day]);
    recordAdminUndoSnapshot(null, {
      label: `${targetStaff?.name || '職員'}（${month}/${day}）緊急待機番`,
      detail: wasBellOn ? 'ON → OFF' : 'OFF → ON',
    });
    const loginAdminKey = getLoggedInAdminKey();
    const nextBells = { ...bellData };
    const staffBells = nextBells[staffId] ? { ...nextBells[staffId] } : {};
    const willTurnOn = !staffBells[day];
    if (staffBells[day]) {
      delete staffBells[day];
    } else {
      staffBells[day] = true;
    }
    if (Object.keys(staffBells).length > 0) {
      nextBells[staffId] = staffBells;
    } else {
      delete nextBells[staffId];
    }

    const entry = normalizeUserInputEntry(userInputs[staffId]?.[day], shiftData[staffId]?.[day], taskData[staffId]?.[day]);
    if (willTurnOn && loginAdminKey) {
      entry.editedBellBy = loginAdminKey;
    } else {
      delete entry.editedBellBy;
    }
    const nextUserInputs = { ...userInputs };
    const staffInputs = { ...(nextUserInputs[staffId] || {}) };
    if (hasAnyUserInputMetadata(entry)) {
      staffInputs[day] = entry;
      nextUserInputs[staffId] = staffInputs;
    } else {
      delete staffInputs[day];
      if (Object.keys(staffInputs).length > 0) nextUserInputs[staffId] = staffInputs;
      else delete nextUserInputs[staffId];
    }

    setBellData(nextBells);
    setUserInputs(nextUserInputs);
    saveSchedule(shiftData, taskData, nextUserInputs, nextBells, leaderData);
  };

  // 各施設(君津・坂田)の手動リーダー色付け（3クールにリーダー不在時など）をON/OFF切り替え
  const handleToggleManualLeader = (staffId, day) => {
    if (!appUser || appUser.role !== 'admin') return;
    if (isSunday(year, month, day)) return;
    const code = shiftData[staffId]?.[day];
    const def = code ? shiftDefs[code] : null;
    const cat = def ? categoryDefs[def.category] : null;
    if (!def || getEffectiveShiftType(def, categoryDefs) !== 'shift' || !isLeaderHighlightTargetFacility(cat)) {
      return;
    }

    const targetStaff = staffList.find(s => s.id === staffId);
    const wasLeaderOn = Boolean(leaderData[staffId]?.[day]);
    recordAdminUndoSnapshot(null, {
      label: `${targetStaff?.name || '職員'}（${month}/${day}）${cat?.label || ''}リーダー色`,
      detail: wasLeaderOn ? 'ON → OFF' : 'OFF → ON',
    });
    const loginAdminKey = getLoggedInAdminKey();
    const nextLeaders = { ...leaderData };
    const nextUserInputs = { ...userInputs };
    const isCurrentlyOn = Boolean(nextLeaders[staffId]?.[day]);

    const updateLeaderOwnerMark = (targetStaffId, nextOwnerKey) => {
      const tEntry = normalizeUserInputEntry(
        nextUserInputs[targetStaffId]?.[day],
        shiftData[targetStaffId]?.[day],
        taskData[targetStaffId]?.[day]
      );
      if (nextOwnerKey) tEntry.editedLeaderBy = nextOwnerKey;
      else delete tEntry.editedLeaderBy;
      const tMap = { ...(nextUserInputs[targetStaffId] || {}) };
      if (hasAnyUserInputMetadata(tEntry)) {
        tMap[day] = tEntry;
        nextUserInputs[targetStaffId] = tMap;
      } else {
        delete tMap[day];
        if (Object.keys(tMap).length > 0) nextUserInputs[targetStaffId] = tMap;
        else delete nextUserInputs[targetStaffId];
      }
    };

    if (isCurrentlyOn) {
      const staffLeaders = { ...(nextLeaders[staffId] || {}) };
      delete staffLeaders[day];
      if (Object.keys(staffLeaders).length > 0) nextLeaders[staffId] = staffLeaders;
      else delete nextLeaders[staffId];
      updateLeaderOwnerMark(staffId, null);
    } else {
      // 同一施設(坂田・君津別)の他の手動リーダー指定は解除し、施設ごとに1名に揃える
      Object.keys(nextLeaders).forEach(otherId => {
        if (!nextLeaders[otherId]?.[day]) return;
        const oCode = shiftData[otherId]?.[day];
        const oDef = oCode ? shiftDefs[oCode] : null;
        if (oDef && oDef.category === cat.id) {
          const updatedOther = { ...nextLeaders[otherId] };
          delete updatedOther[day];
          if (Object.keys(updatedOther).length > 0) nextLeaders[otherId] = updatedOther;
          else delete nextLeaders[otherId];
          updateLeaderOwnerMark(otherId, null);
        }
      });
      nextLeaders[staffId] = { ...(nextLeaders[staffId] || {}), [day]: true };
      updateLeaderOwnerMark(staffId, loginAdminKey);
    }

    setLeaderData(nextLeaders);
    setUserInputs(nextUserInputs);
    saveSchedule(shiftData, taskData, nextUserInputs, bellData, nextLeaders);
  };

  const handleCellClick = (e, staffId, day, type) => {
    // AI自動作成のライブ仮反映中・または月データ読み込み中は誤編集防止のためセル操作をロック
    if (isAutoFillRunningRef.current) return;
    if (loadedScheduleIdRef.current !== `schedule_${year}_${month}`) return;
    const isStaffPostDeadlineSelf =
      appUser?.role === 'staff' && staffId === appUser.id && isAfterDeadlineForCurrentMonth;
    if (isStaffPostDeadlineSelf) {
      openStaffChangeRequestModal(day, 'swap');
      return;
    }
    if (isSunday(year, month, day)) {
      if (type === 'task') {
        if (!appUser || appUser.role !== 'admin') return;
      } else {
        const hasKoushutsu = Object.values(shiftDefs).some(s => isKoushutsuShiftDef(s, categoryDefs));
        if (type !== 'shift' || !hasKoushutsu) return;
      }
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (type === 'shift') {
      setPopupReasonText(getUserRequestedReason(staffId, day));
    } else {
      setPopupReasonText('');
    }
    setShowPopupFullMonthCal(false);
    popupManualPosRef.current = null;
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

  // PC表示時: 手動ドラッグ位置があれば維持しつつ画面内にクランプ、未移動時は選択セルのすぐ横に配置
  useLayoutEffect(() => {
    const popupEl = popupRef.current;
    if (!activePopup) {
      popupManualPosRef.current = null;
      if (popupDragCleanupRef.current) {
        popupDragCleanupRef.current();
      }
      return;
    }
    if (!popupEl || !activePopup.cellRect) return;

    const updatePosition = () => {
      if (window.innerWidth < 768) {
        popupEl.style.top = '';
        popupEl.style.left = '';
        return;
      }

      const margin = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = popupEl.offsetWidth;
      const ph = popupEl.offsetHeight;

      if (popupManualPosRef.current) {
        const clampedLeft = Math.max(margin, Math.min(popupManualPosRef.current.left, vw - pw - margin));
        const clampedTop = Math.max(margin, Math.min(popupManualPosRef.current.top, vh - ph - margin));
        popupManualPosRef.current = { left: clampedLeft, top: clampedTop };
        popupEl.style.top = `${Math.round(clampedTop)}px`;
        popupEl.style.left = `${Math.round(clampedLeft)}px`;
        return;
      }

      const gap = 6;
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
  }, [activePopup, popupReasonText, showPopupFullMonthCal]);

  // ポップアップヘッダーのドラッグ移動ハンドラ（PC・タブレット幅で有効：GPU transformでマウス移動へ1:1連動）
  const handlePopupDragStart = useCallback((e) => {
    if (window.innerWidth < 768) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    const popupEl = popupRef.current;
    if (!popupEl) return;

    e.preventDefault();
    e.stopPropagation();

    if (popupDragCleanupRef.current) {
      popupDragCleanupRef.current();
    }

    const handleEl = e.currentTarget;
    const pointerId = e.pointerId;
    try {
      handleEl.setPointerCapture?.(pointerId);
    } catch {
      // ignore if capture is unsupported
    }

    const rect = popupEl.getBoundingClientRect();
    const originLeft = rect.left;
    const originTop = rect.top;
    const pw = rect.width;
    const ph = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const minLeft = margin;
    const maxLeft = Math.max(margin, vw - pw - margin);
    const minTop = margin;
    const maxTop = Math.max(margin, vh - ph - margin);

    const startX = e.clientX;
    const startY = e.clientY;
    let lastDx = 0;
    let lastDy = 0;
    let hasMoved = false;

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    popupEl.style.left = `${originLeft}px`;
    popupEl.style.top = `${originTop}px`;
    popupEl.style.willChange = 'transform';

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const rawDx = moveEvent.clientX - startX;
      const rawDy = moveEvent.clientY - startY;
      if (!hasMoved && Math.abs(rawDx) + Math.abs(rawDy) < 1) return;
      hasMoved = true;

      const targetLeft = Math.max(minLeft, Math.min(originLeft + rawDx, maxLeft));
      const targetTop = Math.max(minTop, Math.min(originTop + rawDy, maxTop));
      lastDx = targetLeft - originLeft;
      lastDy = targetTop - originTop;
      popupEl.style.transform = `translate3d(${lastDx}px, ${lastDy}px, 0)`;
    };

    const cleanup = (endEvent) => {
      if (endEvent && endEvent.pointerId !== undefined && endEvent.pointerId !== pointerId) return;
      try {
        if (handleEl.hasPointerCapture?.(pointerId)) {
          handleEl.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      handleEl.removeEventListener('lostpointercapture', cleanup);
      if (popupDragCleanupRef.current === cleanup) {
        popupDragCleanupRef.current = null;
      }

      popupEl.style.transform = '';
      popupEl.style.willChange = '';
      if (hasMoved) {
        const finalLeft = originLeft + lastDx;
        const finalTop = originTop + lastDy;
        popupManualPosRef.current = { left: finalLeft, top: finalTop };
        popupEl.style.left = `${finalLeft}px`;
        popupEl.style.top = `${finalTop}px`;
        popupJustDraggedRef.current = true;
        setTimeout(() => {
          popupJustDraggedRef.current = false;
        }, 100);
      }
    };

    popupDragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
    handleEl.addEventListener('lostpointercapture', cleanup);
  }, []);

  const handleChangePassword = () => {
    const trimmedPassword = newPassword.trim();
    if (!trimmedPassword) {
      alert('新しいパスワードを入力してください');
      return;
    }

    if (appUser.role === 'admin') {
      // 全体管理者以外は必ず自分自身の班管理者パスワードのみ変更可能（他管理者のパスワード書き換えを防止）
      const effectiveAdminKey = appUser.initialView === 'all' ? targetAdminKey : appUser.initialView;
      if (!effectiveAdminKey || !adminSettings[effectiveAdminKey]) {
        alert('変更対象の管理者情報が見つかりません');
        return;
      }
      const newSettings = {
        ...adminSettings,
        [effectiveAdminKey]: { ...adminSettings[effectiveAdminKey], password: trimmedPassword },
      };
      setAdminSettings(newSettings);
      saveMasterData({ adminSettings: newSettings });
      if (effectiveAdminKey === appUser.initialView) {
        writeSavedAuthSession(appUser, newSettings);
      }
      alert(`${newSettings[effectiveAdminKey].label}のパスワードを変更しました。`);
    } else {
      const newList = staffList.map(s => s.id === appUser.id ? { ...s, password: trimmedPassword } : s);
      setStaffList(newList);
      saveMasterData({ staffList: newList });
      const updatedUser = { ...appUser, password: trimmedPassword };
      setAppUser(updatedUser);
      writeSavedAuthSession(updatedUser);
      alert('パスワードを変更しました。次回ログイン時から有効です。');
    }
    
    setShowPasswordChangeModal(false);
    setNewPassword('');
  };

  // Step 1: 職員ごとのAI配置可能な施設・シフト判定ヘルパー（勤務施設カテゴリのシフトのみAI配置対象）
  const isShiftAllowedForStaff = (staff, shiftCode) => {
    if (!staff || !shiftCode) return true;
    const def = shiftDefs[shiftCode];
    if (!def || getEffectiveShiftType(def, categoryDefs) !== 'shift') return true;
    if (isOffOrReqCategoryId(def.category, categoryDefs)) return true;
    if (!isAiAssignableFacilityShiftDef(shiftCode, shiftDefs, categoryDefs)) return false;

    const exCats = Array.isArray(staff.excludedCategories) ? staff.excludedCategories : [];
    const exShifts = Array.isArray(staff.excludedShifts) ? staff.excludedShifts : [];
    if (exCats.includes(def.category)) return false;
    if (exShifts.includes(shiftCode)) return false;

    const isCool3 = isCool3ShiftDef(def, categoryDefs);
    if ((staff.maxCool3 ?? 5) <= 0 && isCool3) return false;

    return true;
  };

  // 職員に設定されているAI配置制限の概要テキスト（ツールチップ・バッジ表示用：勤務施設カテゴリのみ対象）
  const getStaffRestrictionSummaryText = (staff) => {
    if (!staff) return '';
    const exCats = (Array.isArray(staff.excludedCategories) ? staff.excludedCategories : []).filter(
      cid => categoryDefs[cid] && resolveCategoryKind(categoryDefs[cid]) === 'facility'
    );
    const exShifts = (Array.isArray(staff.excludedShifts) ? staff.excludedShifts : []).filter(
      code => isAiAssignableFacilityShiftDef(code, shiftDefs, categoryDefs)
    );
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
    if (!isMasterAdmin) return;
    setTargetStaff({
      id: null,
      loginId: '',
      name: '',
      jobTitle: '一般',
      roles: [],
      skills: {},
      minCool3: 0,
      maxCool3: 5,
      contractWorkDaysMin: null,
      contractWorkDaysMax: null,
      excludeFromAi: false,
      excludedCategories: [],
      excludedShifts: [],
      requestNote: '',
    });
    setShowStaffShiftDetailRestriction(false);
    setShowStaffModal(true);
  };

  const handleEditStaff = (staff) => {
    if (!isMasterAdmin) return;
    const exCats = (Array.isArray(staff.excludedCategories) ? staff.excludedCategories : []).filter(
      cid => categoryDefs[cid] && resolveCategoryKind(categoryDefs[cid]) === 'facility'
    );
    const exShifts = (Array.isArray(staff.excludedShifts) ? staff.excludedShifts : []).filter(
      c => isAiAssignableFacilityShiftDef(c, shiftDefs, categoryDefs)
    );
    const restStaff = { ...staff };
    delete restStaff.contractWorkDays;
    setTargetStaff({
      ...restStaff,
      skills: staff.skills || {},
      minCool3: staff.minCool3 !== undefined ? staff.minCool3 : 0,
      maxCool3: staff.maxCool3 !== undefined ? staff.maxCool3 : 5,
      contractWorkDaysMin:
        staff.contractWorkDaysMin !== undefined
          ? (staff.contractWorkDaysMin !== '' ? staff.contractWorkDaysMin : null)
          : (staff.contractWorkDays ?? null),
      contractWorkDaysMax:
        staff.contractWorkDaysMax !== undefined
          ? (staff.contractWorkDaysMax !== '' ? staff.contractWorkDaysMax : null)
          : (staff.contractWorkDays ?? null),
      excludeFromAi: staff.excludeFromAi || false,
      excludedCategories: exCats,
      excludedShifts: exShifts,
      requestNote: staff.requestNote || '',
    });
    setShowStaffShiftDetailRestriction(exShifts.length > 0);
    setShowStaffModal(true);
  };

  const saveStaff = () => {
    if (!isMasterAdmin) return;
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
    if (!isMasterAdmin) return;
    setStaffList(updatedStaffList);
    saveMasterData({ staffList: updatedStaffList }); // ★修正
    alert('全職員の設定を保存しました。');
  };

  const removeStaff = (id) => {
    if (!isMasterAdmin) return;
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
    if (!isMasterAdmin) return;
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
    setTargetCategory({ ...cat, kind: resolveCategoryKind(cat), originalId: catId });
  };

  const handleAddCategory = () => {
    setTargetCategory({
      id: '',
      label: '',
      color: 'bg-gray-50 text-gray-800',
      kind: 'facility',
      order: Object.keys(categoryDefs).length + 1,
      originalId: null,
    });
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
      order: targetCategory.order,
      kind: resolveCategoryKind(targetCategory),
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
    const sortedCats = Object.values(categoryDefs).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const defaultCat = sortedCats.find(c => resolveCategoryKind(c) === 'facility') || sortedCats[0];
    const defaultCatId = defaultCat ? defaultCat.id : 'saka';
    const defaultType = getCategoryKindById(defaultCatId, categoryDefs) === 'role' ? 'task' : 'shift';
    setEditingShift({
      code: '',
      label: '',
      color: 'bg-transparent',
      text: 'text-gray-800',
      startTime: '',
      endTime: '',
      overtime: '',
      time: '',
      category: defaultCatId,
      type: defaultType,
      shiftSlot: 'other',
      offSubType: 'regular_off',
      facilityTargets: {},
      originalCode: null,
      isRequestable: false,
    });
  };

  const handleEditShift = (code) => {
    const target = shiftDefs[code];
    if (!target) return;
    const effType = getEffectiveShiftType(target, categoryDefs);
    const catKind = getCategoryKindById(target.category, categoryDefs);
    setEditingShift({
      ...target,
      type: effType,
      shiftSlot:
        effType === 'shift' && catKind !== 'off' && catKind !== 'req'
          ? resolveShiftWorkSlot(target, categoryDefs) || 'other'
          : target.shiftSlot,
      offSubType:
        effType === 'shift' && catKind === 'off'
          ? resolveOffSubType(target, categoryDefs) || 'regular_off'
          : target.offSubType,
      facilityTargets: getRoleFacilityTargets(target, categoryDefs),
      originalCode: code,
    });
  };

  // シフト一覧から勤務区分・休み区分をワンタップ即時変更＆自動保存するハンドラ
  const handleQuickShiftMetaChange = (code, patch) => {
    if (!code || !shiftDefs[code]) return;
    const updatedShift = { ...shiftDefs[code], ...patch };
    const newDefs = { ...shiftDefs, [code]: updatedShift };
    setShiftDefs(newDefs);
    saveMasterData({ shiftDefs: newDefs });
    if (editingShift && editingShift.originalCode === code) {
      setEditingShift(prev => (prev ? { ...prev, ...patch } : prev));
    }
  };

  const saveShiftConfig = async () => {
    if (!isMasterAdmin || isMigratingShiftCode) return;
    if (!editingShift || !editingShift.label || !String(editingShift.label).trim()) {
      alert('コードと表示名は必須です');
      return;
    }
    const oldCode = editingShift.originalCode || null;
    const validation = validateShiftCode(editingShift.code, shiftDefs, oldCode);
    if (!validation.ok) {
      alert(validation.error);
      return;
    }
    const nextCode = validation.code;
    const isNewShiftCreation = !oldCode;
    const isCodeRenamed = Boolean(oldCode && nextCode !== oldCode);

    if (isCodeRenamed) {
      const ok = window.confirm(
        `シフトコードを「${oldCode}」→「${nextCode}」へ変更します。\n\n保存済みの全月シフト・希望履歴・変更申請・除外シフト・必要人数設定などの旧コードも自動で一括置換されます（戻る履歴はリセットされます）。\n実行してよろしいですか？`
      );
      if (!ok) return;
    }

    const newDefs = { ...shiftDefs };
    const cleanShift = { ...editingShift };
    delete cleanShift.originalCode;
    cleanShift.code = nextCode;
    const catKind = getCategoryKindById(cleanShift.category, categoryDefs);
    cleanShift.type = catKind === 'role' ? 'task' : (cleanShift.type || 'shift');
    if (cleanShift.type === 'shift') {
      if (catKind === 'off') {
        cleanShift.offSubType = resolveOffSubType(cleanShift, categoryDefs) || 'regular_off';
        delete cleanShift.shiftSlot;
      } else if (catKind === 'req') {
        cleanShift.offSubType = 'regular_off';
        delete cleanShift.shiftSlot;
      } else {
        cleanShift.shiftSlot = resolveShiftWorkSlot(cleanShift, categoryDefs) || 'other';
        delete cleanShift.offSubType;
      }
      delete cleanShift.facilityTargets;
    } else {
      const normalizedTargets = getRoleFacilityTargets(cleanShift, categoryDefs);
      if (Object.keys(normalizedTargets).length > 0) {
        cleanShift.facilityTargets = normalizedTargets;
      } else {
        delete cleanShift.facilityTargets;
      }
      delete cleanShift.shiftSlot;
      delete cleanShift.offSubType;
    }

    const prevDef = oldCode ? newDefs[oldCode] : newDefs[nextCode];
    if (prevDef?.order === undefined) {
      const maxOrder = Math.max(0, ...Object.values(newDefs).map(s => s.order || 0));
      cleanShift.order = maxOrder + 1;
    } else {
      cleanShift.order = prevDef.order;
    }

    if (isCodeRenamed) {
      delete newDefs[oldCode];
    }
    newDefs[nextCode] = cleanShift;

    if (isCodeRenamed) {
      setIsMigratingShiftCode(true);
      try {
        // 1. マスタ設定内の参照（必要人数・除外シフト・休みカウント対象・班別許可リスト）を一括置換
        const masterMigration = migrateMasterDataShiftCode({
          oldCode,
          newCode: nextCode,
          targetCounts,
          staffList,
          adminSettings,
        });
        const masterUpdates = { shiftDefs: newDefs };
        if (masterMigration.targetCountsChanged) masterUpdates.targetCounts = masterMigration.nextTargetCounts;
        if (masterMigration.staffListChanged) masterUpdates.staffList = masterMigration.nextStaffList;
        if (masterMigration.adminSettingsChanged) masterUpdates.adminSettings = masterMigration.nextAdminSettings;

        setShiftDefs(newDefs);
        if (masterMigration.targetCountsChanged) setTargetCounts(masterMigration.nextTargetCounts);
        if (masterMigration.staffListChanged) setStaffList(masterMigration.nextStaffList);
        if (masterMigration.adminSettingsChanged) setAdminSettings(masterMigration.nextAdminSettings);
        await saveMasterData(masterUpdates);

        // 2. 保存済み全月スケジュール（shifts / tasks / userInputs / changeRequests）を一括置換
        let migratedMonthCount = 0;
        if (authUser) {
          const schedulesColRef = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
          const snap = await getDocs(schedulesColRef);
          const updatePromises = [];
          snap.forEach((docSnap) => {
            const res = migrateScheduleDocShiftCode(docSnap.data(), oldCode, nextCode);
            if (res.changed) {
              migratedMonthCount++;
              updatePromises.push(updateDoc(docSnap.ref, res.updates));
            }
          });
          if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
          }
        }

        // 3. 現在表示中のローカル状態＆前月シフトも即時反映し、旧コード復活防止のため戻る履歴をリセット
        const currentLocalRes = migrateScheduleDocShiftCode(
          { shifts: shiftData, tasks: taskData, userInputs, changeRequests },
          oldCode,
          nextCode
        );
        if (currentLocalRes.updates.shifts) setShiftData(currentLocalRes.updates.shifts);
        if (currentLocalRes.updates.tasks) setTaskData(currentLocalRes.updates.tasks);
        if (currentLocalRes.updates.userInputs) setUserInputs(currentLocalRes.updates.userInputs);
        if (currentLocalRes.updates.changeRequests) setChangeRequests(currentLocalRes.updates.changeRequests);

        const prevLocalRes = migrateScheduleDocShiftCode(
          { shifts: prevMonthShiftData },
          oldCode,
          nextCode
        );
        if (prevLocalRes.updates.shifts) setPrevMonthShiftData(prevLocalRes.updates.shifts);

        const emptyHistory = { past: [], future: [] };
        undoHistoryRef.current = emptyHistory;
        setUndoHistory(emptyHistory);
        setShowUndoHistoryModal(false);
        clearAllUndoHistories(appId);
        setActivePopup(null);

        setEditingShift({
          ...cleanShift,
          facilityTargets: cleanShift.facilityTargets ? { ...cleanShift.facilityTargets } : {},
          originalCode: cleanShift.code,
        });
        alert(
          `保存しました（コード「${oldCode}」→「${nextCode}」へ変更し、保存済みスケジュール ${migratedMonthCount}ヶ月分と各種設定を一括置換しました）`
        );
      } catch (err) {
        console.error('Shift code migration error:', err);
        alert(`コード変更の一括置換中にエラーが発生しました: ${err?.message || err}`);
      } finally {
        setIsMigratingShiftCode(false);
      }
      return;
    }

    setShiftDefs(newDefs);
    // 新規シフト作成時に「休み」「希望」カテゴリまたは「公出」であれば、休み希望カウント対象(countedOffShifts)にも自動追加
    if (
      isNewShiftCreation &&
      cleanShift.type === 'shift' &&
      (catKind === 'off' || catKind === 'req' || isKoushutsuShiftDef(cleanShift, categoryDefs))
    ) {
      const currentCounted = resolveEffectiveCountedOffShifts(adminSettings, shiftDefs, categoryDefs);
      if (!currentCounted.includes(cleanShift.code)) {
        const nextAdminSettings = {
          ...adminSettings,
          countedOffShifts: [...currentCounted, cleanShift.code],
        };
        setAdminSettings(nextAdminSettings);
        await saveMasterData({ shiftDefs: newDefs, adminSettings: nextAdminSettings });
      } else {
        await saveMasterData({ shiftDefs: newDefs });
      }
    } else {
      await saveMasterData({ shiftDefs: newDefs }); // ★修正
    }
    alert('保存しました');
    setEditingShift({
      ...cleanShift,
      facilityTargets: cleanShift.facilityTargets ? { ...cleanShift.facilityTargets } : {},
      originalCode: cleanShift.code,
    });
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
        if (editingShift?.originalCode === code) setEditingShift(null);
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
    alert('必要人数・必須スキル・目標スコア設定を保存しました');
    setShowTargetCountModal(false);
  };

const handleResetSchedule = () => {
    if (!appUser || appUser.role !== 'admin') return;
    const loginAdminKey = getLoggedInAdminKey();
    const adminLabel = getLoggedInAdminDisplayLabel(loginAdminKey);
    const isMasterReset = loginAdminKey === 'all';
    setConfirmModal({
      isOpen: true,
      title: isMasterReset ? 'AI作成シフトを全消去' : `${adminLabel}の編集内容を全消去`,
      message: isMasterReset
        ? `${year}年${month}月の「AIが作成したシフト」のみをすべて消去しますか？\n\n※職員本人の希望入力、各班管理者の入力、および全体管理者が手動入力（固定）したシフト・タスク・待機番はすべてそのまま残ります。\n（消去後もヘッダーの「<」ボタンで元に戻せます）`
        : `「${adminLabel}」が編集した${year}年${month}月のシフト・タスク等を消去しますか？\n\n※職員本人の希望入力や、他の管理者が編集したシフトはそのまま残ります。\n（消去後もヘッダーの「<」ボタンで元に戻せます）`,
      onConfirm: () => {
        recordAdminUndoSnapshot(null, {
          label: isMasterReset ? 'AI作成シフトを全消去' : `${adminLabel}の編集内容を全消去`,
          detail: `${year}年${month}月`,
        });
        const newShiftData = JSON.parse(JSON.stringify(shiftData || {}));
        const newTaskData = JSON.parse(JSON.stringify(taskData || {}));
        const newBellData = JSON.parse(JSON.stringify(bellData || {}));
        const newLeaderData = JSON.parse(JSON.stringify(leaderData || {}));
        const newUserInputs = JSON.parse(JSON.stringify(userInputs || {}));

        const staffIdSet = new Set([
          ...Object.keys(newShiftData),
          ...Object.keys(newTaskData),
          ...Object.keys(newBellData),
          ...Object.keys(newLeaderData),
          ...Object.keys(newUserInputs),
        ]);

        staffIdSet.forEach(staffId => {
          const daySet = new Set([
            ...Object.keys(newShiftData[staffId] || {}),
            ...Object.keys(newTaskData[staffId] || {}),
            ...Object.keys(newBellData[staffId] || {}),
            ...Object.keys(newLeaderData[staffId] || {}),
            ...Object.keys(newUserInputs[staffId] || {}),
          ]);

          daySet.forEach(day => {
            const curShift = newShiftData[staffId]?.[day] || null;
            const curTask = newTaskData[staffId]?.[day] || null;
            const hasBell = Boolean(newBellData[staffId]?.[day]);
            const hasLeader = Boolean(newLeaderData[staffId]?.[day]);
            const entry = normalizeUserInputEntry(newUserInputs[staffId]?.[day], curShift, curTask);

            if (isMasterReset) {
              // 全体管理者の全消去: AIが作成したシフト（＝勤務施設シフトかつ本人希望でも管理者手動固定[teamShiftBy]でもAI除外職員でもないシフト）のみ消去
              const staffObjForClear = staffList.find(s => s.id === staffId);
              const isNonAiShift = Boolean(
                curShift && shiftDefs[curShift] && !isAiAssignableFacilityShiftDef(curShift, shiftDefs, categoryDefs)
              );
              const hasLockedAdminShift = Boolean(
                (entry.teamShiftBy && TEAM_ADMIN_LABELS[entry.teamShiftBy]) ||
                  isMeRoomShiftCode(curShift) ||
                  isNonAiShift ||
                  staffObjForClear?.excludeFromAi
              );
              const isStaffRequestShift = Boolean(entry.shift && curShift === entry.shift);
              if (curShift && !hasLockedAdminShift && !isStaffRequestShift) {
                if (entry.shift && shiftDefs[entry.shift]) {
                  newShiftData[staffId] = newShiftData[staffId] || {};
                  newShiftData[staffId][day] = entry.shift;
                } else if (newShiftData[staffId]) {
                  delete newShiftData[staffId][day];
                  if (Object.keys(newShiftData[staffId]).length === 0) delete newShiftData[staffId];
                }
                delete entry.editedShiftBy;
              }
            } else {
              // 各班管理者の全消去: ログイン中の班管理者が編集したシフト・タスク・待機番のみ元に戻す
              const shiftOwner =
                entry.editedShiftBy ||
                (entry.teamShiftBy && TEAM_ADMIN_LABELS[entry.teamShiftBy] ? entry.teamShiftBy : null) ||
                (curShift ? (entry.shift && curShift === entry.shift ? 'staff' : 'all') : null);
              if (shiftOwner === loginAdminKey) {
                if (entry.shift && shiftDefs[entry.shift]) {
                  newShiftData[staffId] = newShiftData[staffId] || {};
                  newShiftData[staffId][day] = entry.shift;
                } else if (newShiftData[staffId]) {
                  delete newShiftData[staffId][day];
                  if (Object.keys(newShiftData[staffId]).length === 0) delete newShiftData[staffId];
                }
                delete entry.teamShiftBy;
                delete entry.editedShiftBy;
              }

              const taskOwner =
                entry.editedTaskBy ||
                (entry.teamTaskBy && TEAM_ADMIN_LABELS[entry.teamTaskBy] ? entry.teamTaskBy : null) ||
                (curTask ? (entry.task && curTask === entry.task ? 'staff' : 'all') : null);
              if (taskOwner === loginAdminKey) {
                if (entry.task && shiftDefs[entry.task]) {
                  newTaskData[staffId] = newTaskData[staffId] || {};
                  newTaskData[staffId][day] = entry.task;
                } else if (newTaskData[staffId]) {
                  delete newTaskData[staffId][day];
                  if (Object.keys(newTaskData[staffId]).length === 0) delete newTaskData[staffId];
                }
                delete entry.teamTaskBy;
                delete entry.editedTaskBy;
              }

              if (hasBell) {
                const bellOwner = entry.editedBellBy || 'all';
                if (bellOwner === loginAdminKey) {
                  delete newBellData[staffId][day];
                  if (Object.keys(newBellData[staffId]).length === 0) delete newBellData[staffId];
                  delete entry.editedBellBy;
                }
              } else if (entry.editedBellBy === loginAdminKey) {
                delete entry.editedBellBy;
              }
            }

            const afterShiftCode = newShiftData[staffId]?.[day] || null;
            const afterShiftDef = afterShiftCode ? shiftDefs[afterShiftCode] : null;
            const afterCat = afterShiftDef ? categoryDefs[afterShiftDef.category] : null;
            const keepsLeaderFacility = Boolean(
              afterShiftDef &&
                getEffectiveShiftType(afterShiftDef, categoryDefs) === 'shift' &&
                isLeaderHighlightTargetFacility(afterCat)
            );
            if (hasLeader) {
              const leaderOwner = entry.editedLeaderBy || 'all';
              if ((!isMasterReset && leaderOwner === loginAdminKey) || !keepsLeaderFacility) {
                delete newLeaderData[staffId][day];
                if (Object.keys(newLeaderData[staffId]).length === 0) delete newLeaderData[staffId];
                delete entry.editedLeaderBy;
              }
            } else if (!isMasterReset && entry.editedLeaderBy === loginAdminKey) {
              delete entry.editedLeaderBy;
            }

            if (hasAnyUserInputMetadata(entry)) {
              newUserInputs[staffId] = newUserInputs[staffId] || {};
              newUserInputs[staffId][day] = entry;
            } else if (newUserInputs[staffId]) {
              delete newUserInputs[staffId][day];
              if (Object.keys(newUserInputs[staffId]).length === 0) delete newUserInputs[staffId];
            }
          });
        });

        setActivePopup(null);
        setShiftData(newShiftData);
        setTaskData(newTaskData);
        setBellData(newBellData);
        setLeaderData(newLeaderData);
        setUserInputs(newUserInputs);
        saveSchedule(newShiftData, newTaskData, newUserInputs, newBellData, newLeaderData);

        alert(
          isMasterReset
            ? '職員本人の希望や管理者手動入力（固定）のシフトを残し、AIが作成したシフトのみ消去しました。'
            : `職員本人の希望や他の管理者が編集したシフトを残し、「${adminLabel}」が編集した内容のみ消去しました。`
        );
      }
    });
  };

  const getTargetCount = (shiftCode, day) => {
    if (isSunday(year, month, day)) return 0;
    const dow = getDayOfWeek(year, month, day);
    const normalTarget = targetCounts[shiftCode]?.[dow] || 0;
    const closedRules = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    // 祝日・外来休診日のME室は「Gのみ1人（Lは0人）」として判定
    if (isMeRoomShiftCode(shiftCode) && isHoliday(year, month, day, closedRules)) {
      return getHolidayMeTargetCount(shiftCode, shiftDefs, categoryDefs, normalTarget);
    }
    return normalTarget;
  };

  // Step 4: 施設ごとの必須スキル最低人数を取得するヘルパー（現在のカテゴリ設定・役割種別を動的参照）
  const getFacilitySkillTarget = (catId, skillKey, settingsObj = adminSettings) => {
    if (!catId || !categoryDefs[catId]) return 0;
    return resolveFacilitySkillTarget(categoryDefs[catId], skillKey, settingsObj);
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
      .filter(cat => resolveCategoryKind(cat) === 'facility')
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
      if (getEffectiveShiftType(def, categoryDefs) !== 'shift' || isOffOrReqCategoryId(def.category, categoryDefs)) return;
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
        .filter(sd => sd && getEffectiveShiftType(sd, categoryDefs) === 'shift' && sd.category === cat.id)
        .map(sd => sd.code);
      if (catShiftCodes.length === 0) return;

      const catTargetHeadcount = catShiftCodes.reduce((sum, code) => sum + getTargetCount(code, day), 0);
      const catActualHeadcount = catShiftCodes.reduce(
        (sum, code) => sum + staffList.filter(s => shiftsMap[s.id]?.[day] === code).length,
        0
      );
      if (catTargetHeadcount === 0 && catActualHeadcount === 0) return;

      const catShiftDefsForDay = catShiftCodes.map(c => shiftDefs[c]).filter(Boolean);
      const catHasCool3 = catShiftDefsForDay.some(sd => isCool3ShiftDef(sd, categoryDefs));
      const activeCool3ForDay = catShiftDefsForDay.filter(
        sd =>
          isCool3ShiftDef(sd, categoryDefs) &&
          (getTargetCount(sd.code, day) > 0 || staffList.some(s => shiftsMap[s.id]?.[day] === sd.code))
      );

      STAFF_SKILLS.forEach(sk => {
        if (sk.key === 'isLeader') {
          if (activeCool3ForDay.length > 0) {
            activeCool3ForDay.forEach(c3Def => {
              const c3LeaderCnt = staffList.filter(
                s => shiftsMap[s.id]?.[day] === c3Def.code && s.skills?.isLeader
              ).length;
              if (c3LeaderCnt < 1) {
                const item = {
                  catId: cat.id,
                  catLabel: `${cat.label}(${c3Def.label})`,
                  skillKey: 'isLeader',
                  skillLabel: '3クール内リーダー',
                  actual: c3LeaderCnt,
                  target: 1,
                };
                catShortages.push(item);
                allShortages.push(item);
              }
            });
            return;
          }
          if (!catHasCool3 && !isKikuriFacilityCategory(cat)) return;
          const reqLeader = isKikuriFacilityCategory(cat)
            ? Math.max(1, getFacilitySkillTarget(cat.id, 'isLeader', settingsObj))
            : getFacilitySkillTarget(cat.id, 'isLeader', settingsObj);
          if (reqLeader > 0) {
            const actualL = skillCountsByCat[cat.id]?.isLeader || 0;
            if (actualL < reqLeader) {
              const item = {
                catId: cat.id,
                catLabel: cat.label,
                skillKey: 'isLeader',
                skillLabel: sk.label,
                actual: actualL,
                target: reqLeader,
              };
              catShortages.push(item);
              allShortages.push(item);
            }
          }
          return;
        }

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

    // 3クール該当シフトコード判定（現在のシフト設定の勤務区分を動的参照）
    const cool3ShiftCodes = Object.values(shiftDefs)
      .filter(s => isCool3ShiftDef(s, categoryDefs))
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
        return c && shiftDefs[c] && getEffectiveShiftType(shiftDefs[c], categoryDefs) === 'shift' && !isNonWorkOrKoushutsuShiftDef(shiftDefs[c], categoryDefs);
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
            if (isNonWorkOrKoushutsuShiftDef(def, categoryDefs)) {
              trailingWorkStreak = 0;
              if (isPaidLeaveShiftDef(def, categoryDefs)) {
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
      // 前月の最終営業日（日曜なら前日の土曜）の施設カテゴリも記録し、当月初日の日替わり勤務地ローテーションに活用
      const prevLastOpDay = getDayOfWeek(prevYear, prevMonth, prevDaysInMonth) === 0 ? prevDaysInMonth - 1 : prevDaysInMonth;
      const lastPrevOpCode = staffHasPrevWorkShift && prevLastOpDay >= 1 ? (staffPrevMap[prevLastOpDay] || null) : null;
      const lastPrevOpDef = lastPrevOpCode && shiftDefs[lastPrevOpCode] ? shiftDefs[lastPrevOpCode] : null;
      const prevLastDayCategory =
        lastPrevOpDef && getCategoryKindById(lastPrevOpDef.category, categoryDefs) === 'facility'
          ? lastPrevOpDef.category
          : null;
      const prevLastDayCategoryLabel =
        prevLastDayCategory && categoryDefs[prevLastDayCategory]
          ? categoryDefs[prevLastDayCategory].label || prevLastDayCategory
          : null;
      const maxAllowedStreakFromDay1 = Math.max(0, maxConsecutiveWorkDays - trailingWorkStreak);

      // 当月1日からの実入力連勤数と月またぎ違反チェック（案Bバッジのリアルタイム警告用）
      let currentLeadingWorkStreak = 0;
      if (straddlingPrevDays.length > 0) {
        for (let d = 1; d <= currDaysInMonth; d++) {
          if (isSunday(year, month, d)) break;
          const currCode = shiftData[s.id]?.[d];
          if (currCode && shiftDefs[currCode] && !isNonWorkOrKoushutsuShiftDef(shiftDefs[currCode], categoryDefs)) {
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
        prevLastDayCategory,
        prevLastDayCategoryLabel,
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
  }, [year, month, prevMonthShiftData, staffList, shiftDefs, categoryDefs, adminSettings.maxConsecutiveWorkDays, adminSettings.clinicClosedDays, shiftData]);

const prepareScheduleDataForAi = (customShifts = shiftData, customTasks = taskData, options = {}) => {
    const { includeTasks = true } = options;
    const days = getDaysInMonth(year, month);
    const closedRules = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    const maxConsecutiveWorkDays = Number(adminSettings.maxConsecutiveWorkDays) || 5;

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
            label: currentWeekDays.length === 1
              ? `${month}/${currentWeekDays[0]}`
              : `${month}/${currentWeekDays[0]}〜${month}/${currentWeekDays[currentWeekDays.length - 1]}`,
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
        label: currentWeekDays.length === 1
          ? `${month}/${currentWeekDays[0]}`
          : `${month}/${currentWeekDays[0]}〜${month}/${currentWeekDays[currentWeekDays.length - 1]}`,
        days: currentWeekDays,
        isFullWeek: currentWeekDays.length === 6,
      });
    }

    // Step 2: 週休2日（日曜＋週1日公休＝空欄）に基づく月間の基本公休数・標準出勤日数の算出（自動計算を標準）
    const baseRegularOffMin = Math.floor(operatingDaysCount / 6);
    const baseRegularOffMax = Math.ceil(operatingDaysCount / 6);
    const standardWorkDaysMin = Math.max(0, operatingDaysCount - baseRegularOffMax);
    const standardWorkDaysMax = Math.max(0, operatingDaysCount - baseRegularOffMin);

    // 3クール該当シフトコードを動的抽出（A:坂3, F:君3 や21時以降終了・表示名に3を含むシフト）
    const cool3ShiftCodes = prevMonthCarryOver.cool3ShiftCodes;
    const cool3Set = new Set(cool3ShiftCodes);

    // 現在のシフト設定に即して「週休枠の公休」と「別枠の有休」を区別（コードではなく設定区分・表示名を参照）
    const isPaidLeaveShiftCode = (code) => {
      if (!code || !shiftDefs[code]) return false;
      return isPaidLeaveShiftDef(shiftDefs[code], categoryDefs);
    };

    // 現在のカテゴリ設定から透析施設一覧を先に抽出（個人別の施設回数カウント・日替わりローテーション・偏り平準化でも使用）
    const sortedCategories = Object.values(categoryDefs).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const facilityCats = sortedCategories.filter(cat => resolveCategoryKind(cat) === 'facility');
    const facilityCatIdSet = new Set(facilityCats.map(cat => cat.id));

    // 【追加】各スキルの重み付け（点数）を定義
    const skillPoints = {
      isLeader: 5,
      isVeteran: 3,
      canEcho: 2,
      canMachine: 2,
      canFollow: 1
    };

    const staffPowerMap = {};
    const filledDaySet = new Set();
    for (let d = 1; d <= days; d++) {
      if (calendarInfo[d].isSunday) continue;
      const hasAnyWork = staffList.some(st => {
        const c = customShifts?.[st.id]?.[d];
        const def = c ? shiftDefs[c] : null;
        return !!(def && getEffectiveShiftType(def, categoryDefs) === 'shift' && !isNonWorkOrKoushutsuShiftDef(def, categoryDefs));
      });
      if (hasAnyWork) filledDaySet.add(d);
    }

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
        prevLastDayCategory: null,
        prevLastDayCategoryLabel: null,
        maxAllowedStreakFromDay1: maxConsecutiveWorkDays,
        dayBreakdownText: '',
      };

      // AIが数え間違いを起こさないよう、現時点の個人別集計値・連勤数（前月末からの通算含む）・施設別配置回数・残りの目標出勤/空欄休みを事前計算して渡す
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
      const facilityCountsById = {};
      facilityCats.forEach(fc => {
        facilityCountsById[fc.id] = 0;
      });
      const workSlotCounts = { cool3: 0, cool2: 0, day: 0, half: 0, other: 0 };

      // 各日の状態マップ（週ごとの公休チェック用）
      const dayStateMap = {};

      for (let d = 1; d <= days; d++) {
        if (calendarInfo[d].isSunday) {
          currentStreak = 0;
          continue;
        }
        const code = customShifts[s.id]?.[d];
        const reqShift = getUserRequestedShift(s.id, d);

        if (!code || !shiftDefs[code]) {
          blankDays++;
          currentStreak = 0;
          // 管理者が希望休等をクリアして空欄にした（希望履歴が残っている）セルは、既に休み確定の空欄として扱う
          if (reqShift && shiftDefs[reqShift] && isNonWorkOrKoushutsuShiftDef(shiftDefs[reqShift], categoryDefs)) {
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
          if (isNonWorkOrKoushutsuShiftDef(def, categoryDefs)) {
            offDays++;
            currentStreak = 0;
            if (isPaidLeaveShiftCode(code)) {
              paidLeaveDays++;
              dayStateMap[d] = 'paid_off';
            } else {
              regularOffEnteredDays++;
              dayStateMap[d] = 'regular_off';
            }
          } else if (getEffectiveShiftType(def, categoryDefs) === 'shift') {
            workDays++;
            currentStreak++;
            if (currentStreak > currentMaxStreak) currentMaxStreak = currentStreak;
            dayStateMap[d] = 'work';
            if (facilityCatIdSet.has(def.category)) {
              facilityCountsById[def.category] = (facilityCountsById[def.category] || 0) + 1;
            }
            const wSlot = resolveShiftWorkSlot(def, categoryDefs);
            if (wSlot && workSlotCounts[wSlot] !== undefined) {
              workSlotCounts[wSlot]++;
            }
          }
          if (cool3Set.has(code)) cool3Count++;
          if (def.overtime) overtimeHours += parseFloat(def.overtime) || 0;
        }
      }

      // 週単位で「まだ週1日の通常公休が入っておらず、AIが空欄を残すべき週」を特定（第1週は前月末からの月またぎ週も考慮）
      // ※祝日の空欄は週休枠としてカウントし、同週に休み希望等がある場合は週4日以下の出勤も許容する
      const weeksNeedingBlankOff = [];
      let excessSameWeekRegOffDays = 0;
      let potentialHolidayExtraOffDays = 0;
      calendarWeeks.forEach((w, wIdx) => {
        const weekEnteredRegOff = w.days.filter(d => dayStateMap[d] === 'regular_off').length;
        const weekPaidOff = w.days.filter(d => dayStateMap[d] === 'paid_off').length;
        const weekCreatedHolidayBlanks = w.days.filter(
          d => calendarInfo[d]?.isHoliday && dayStateMap[d] === 'assignable_blank' && filledDaySet.has(d)
        ).length;
        const weekUncreatedHolidayBlanks = w.days.filter(
          d => calendarInfo[d]?.isHoliday && dayStateMap[d] === 'assignable_blank' && !filledDaySet.has(d)
        ).length;
        const weekRegOff = weekEnteredRegOff + weekCreatedHolidayBlanks;
        const weekAnyOff = weekRegOff + weekPaidOff;
        const weekAssignable = w.days.filter(d => dayStateMap[d] === 'assignable_blank');
        if (weekRegOff > 1) {
          excessSameWeekRegOffDays += weekRegOff - 1;
        }
        if (weekUncreatedHolidayBlanks > 0) {
          if (weekEnteredRegOff + weekPaidOff >= 1) {
            potentialHolidayExtraOffDays += weekUncreatedHolidayBlanks;
          } else if (weekUncreatedHolidayBlanks > 1) {
            potentialHolidayExtraOffDays += weekUncreatedHolidayBlanks - 1;
          }
        }

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

      // パート週契約出勤日数（下限〜上限：絶対厳守ルール）または常勤標準出勤日数を算出
      const partContractRange = getPartTimeWeeklyContractRange(s);
      const hasContractDays = Boolean(partContractRange);

      let targetWorkDaysMin;
      let targetWorkDaysMax;
      if (hasContractDays) {
        const weeklyMinSum = calendarWeeks.reduce(
          (sum, w) => sum + (w.isFullWeek ? Math.min(w.days.length, partContractRange.min) : 0),
          0
        );
        const weeklyMaxSum = calendarWeeks.reduce(
          (sum, w) => sum + Math.min(w.days.length, partContractRange.max),
          0
        );
        targetWorkDaysMin = Math.max(workDays, weeklyMinSum - paidLeaveDays);
        targetWorkDaysMax = Math.max(targetWorkDaysMin, weeklyMaxSum - paidLeaveDays);
      } else {
        targetWorkDaysMin = Math.max(
          workDays,
          standardWorkDaysMin - paidLeaveDays - excessSameWeekRegOffDays - potentialHolidayExtraOffDays
        );
        targetWorkDaysMax = Math.max(workDays, standardWorkDaysMax - paidLeaveDays - excessSameWeekRegOffDays);
      }
      const rawBlankKeepMin = Math.max(0, assignableBlankDays - Math.min(assignableBlankDays, Math.max(0, targetWorkDaysMax - workDays)));
      const rawBlankKeepMax = Math.max(0, assignableBlankDays - Math.min(assignableBlankDays, Math.max(0, targetWorkDaysMin - workDays)));
      const blankOffDaysToKeepMin = Math.min(assignableBlankDays, Math.max(rawBlankKeepMin, weeksNeedingBlankOff.length));
      const blankOffDaysToKeepMax = Math.min(assignableBlankDays, Math.max(rawBlankKeepMax, blankOffDaysToKeepMin));
      const remainingWorkDaysMin = Math.max(0, assignableBlankDays - blankOffDaysToKeepMax);
      const remainingWorkDaysMax = Math.max(0, assignableBlankDays - blankOffDaysToKeepMin);

      // この職員がAI配置で入ることができる出勤系シフトコード一覧を算出（※勤務施設カテゴリのみ対象とし、ME室・その他は常時除外）
      // ★固定のカテゴリ順・コード順（常に坂田A→君津F…）で並べるとAIが上から機械的にAAAA,FFFFと固めるため、
      //   これまでの配置回数が少ない施設を優先しつつ同数施設・施設内シフト順をランダムシャッフルして渡す
      const rawAllowedShiftDefs = Object.values(shiftDefs).filter(
        def =>
          def &&
          isAiAssignableFacilityShiftDef(def.code, shiftDefs, categoryDefs) &&
          isShiftAllowedForStaff(s, def.code)
      );

      const allowedFacilityCatIdSet = new Set(
        rawAllowedShiftDefs.map(def => def.category).filter(catId => facilityCatIdSet.has(catId))
      );
      const allowedFacilityCats = facilityCats.filter(fc => allowedFacilityCatIdSet.has(fc.id));
      const balancedFacilityCats = shuffleArray(allowedFacilityCats).sort(
        (a, b) => (facilityCountsById[a.id] || 0) - (facilityCountsById[b.id] || 0)
      );

      const shiftsByCat = {};
      rawAllowedShiftDefs.forEach(def => {
        const cKey = def.category || '__uncategorized__';
        if (!shiftsByCat[cKey]) shiftsByCat[cKey] = [];
        shiftsByCat[cKey].push(def);
      });

      const orderedCategoryKeys = [
        ...balancedFacilityCats.map(fc => fc.id),
        ...shuffleArray(Object.keys(shiftsByCat).filter(cKey => !allowedFacilityCatIdSet.has(cKey))),
      ];

      const allowedWorkShifts = [];
      orderedCategoryKeys.forEach(cKey => {
        const catDefs = shuffleArray(shiftsByCat[cKey] || []).sort((a, b) => {
          const slotA = resolveShiftWorkSlot(a, categoryDefs) || 'other';
          const slotB = resolveShiftWorkSlot(b, categoryDefs) || 'other';
          if (slotA !== 'cool3' && slotB !== 'cool3') {
            const diff = (workSlotCounts[slotA] || 0) - (workSlotCounts[slotB] || 0);
            if (Math.abs(diff) >= 2) return diff;
          }
          return 0;
        });
        catDefs.forEach(d => allowedWorkShifts.push(d.code));
      });

      // 前月最終日に3クールに入っていた場合、当月1日に選べる出勤シフトからは3クールを除外
      const day1AllowedWorkShifts = carry.prevLastDayWasCool3
        ? allowedWorkShifts.filter(c => !cool3Set.has(c))
        : allowedWorkShifts;

      const facilityCountsSummary = {};
      allowedFacilityCats.forEach(fc => {
        facilityCountsSummary[fc.label] = facilityCountsById[fc.id] || 0;
      });
      const priorityFacilitiesToBalance = balancedFacilityCats.map(fc => fc.label);

      const fmtRange = (minV, maxV) => (minV === maxV ? `${minV}日` : `${minV}〜${maxV}日`);

      return { 
        id: s.id,
        name: s.name, 
        jobTitle: s.jobTitle, 
        roles: s.roles,
        skills: s.skills,
        powerScore,
        minCool3: s.minCool3 ?? 0,
        maxCool3: s.maxCool3, 
        contractWorkDaysMin: partContractRange ? partContractRange.min : null,
        contractWorkDaysMax: partContractRange ? partContractRange.max : null,
        excludeFromAi: s.excludeFromAi,
        allowedFacilities: allowedFacilityCats.map(fc => ({ id: fc.id, label: fc.label })),
        allowedWorkShifts,
        day1AllowedWorkShifts,
        excludedCategories: (Array.isArray(s.excludedCategories) ? s.excludedCategories : []).filter(cid => facilityCatIdSet.has(cid)),
        excludedShifts: (Array.isArray(s.excludedShifts) ? s.excludedShifts : []).filter(c => isAiAssignableFacilityShiftDef(c, shiftDefs, categoryDefs)),
        prevMonthCarryOver: {
          hasPrevSchedule: carry.staffHasPrevWorkShift,
          trailingWorkStreak: carry.trailingWorkStreak,
          maxAllowedConsecutiveWorkFromDay1: carry.maxAllowedStreakFromDay1,
          alreadyTookWeeklyOffInPrevMonthPart: carry.prevWeekRegOffCount > 0,
          prevLastDayWasCool3: carry.prevLastDayWasCool3,
          forbidCool3OnDay1: carry.prevLastDayWasCool3,
          prevLastDayCategory: carry.prevLastDayCategory || null,
          prevLastDayFacilityLabel: carry.prevLastDayCategoryLabel || null,
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
          targetWorkDaysMin,
          targetWorkDaysMax,
          targetWorkDaysRange: fmtRange(targetWorkDaysMin, targetWorkDaysMax),
          remainingWorkDaysRange: fmtRange(remainingWorkDaysMin, remainingWorkDaysMax),
          blankOffDaysToKeepRange: fmtRange(blankOffDaysToKeepMin, blankOffDaysToKeepMax),
          weeksNeedingBlankOff,
          currentMaxStreak,
          cool3Count,
          remainingCool3: Math.max(0, (s.maxCool3 ?? 0) - cool3Count),
          remainingMinCool3Needed: Math.max(0, (s.minCool3 ?? 0) - cool3Count),
          overtimeHours,
          allowedFacilitiesCount: allowedFacilityCats.length,
          facilityCounts: facilityCountsSummary,
          priorityFacilitiesToBalance,
        }
      };
    });

    // スタッフ本人が希望を出した箇所（プライバシー保護のため理由テキストは除外し、希望コードのみ渡す）
    // およびHHD班・エコー班・オペ班管理者が入力したAI変更不可ロック箇所を抽出（※日曜の公出等がAIデータへ混入しないよう日曜は除外）
    const staffRequests = {};
    const teamAdminLocks = {};
    const aiFilteredShifts = {};
    const aiFilteredTasks = {};
    staffList.forEach(s => {
      const staffReq = {};
      const staffTeamLock = {};
      const sShifts = {};
      const sTasks = {};
      for (let d = 1; d <= days; d++) {
        if (calendarInfo[d]?.isSunday) continue;
        if (customShifts?.[s.id]?.[d]) {
          sShifts[d] = customShifts[s.id][d];
        }
        if (includeTasks && customTasks?.[s.id]?.[d]) {
          sTasks[d] = customTasks[s.id][d];
        }
        const reqShift = getUserRequestedShift(s.id, d);
        const reqTask = includeTasks ? getUserRequestedTask(s.id, d) : null;
        if (reqShift || reqTask) {
          staffReq[d] = {};
          if (reqShift) staffReq[d].shift = reqShift;
          if (reqTask) staffReq[d].task = reqTask;
        }

        const teamShiftSrc = getTeamLockedShiftSource(s.id, d, customShifts);
        const teamTaskSrc = includeTasks ? getTeamLockedTaskSource(s.id, d, customTasks) : null;
        if (teamShiftSrc || teamTaskSrc) {
          staffTeamLock[d] = {};
          if (teamShiftSrc) {
            staffTeamLock[d].shift = customShifts[s.id]?.[d];
            staffTeamLock[d].shiftLockedBy = TEAM_ADMIN_LABELS[teamShiftSrc] || teamShiftSrc;
          }
          if (teamTaskSrc) {
            staffTeamLock[d].task = customTasks[s.id]?.[d];
            staffTeamLock[d].taskLockedBy = TEAM_ADMIN_LABELS[teamTaskSrc] || teamTaskSrc;
          }
        }
      }
      if (Object.keys(sShifts).length > 0) {
        aiFilteredShifts[s.id] = sShifts;
      }
      if (includeTasks && Object.keys(sTasks).length > 0) {
        aiFilteredTasks[s.id] = sTasks;
      }
      if (Object.keys(staffReq).length > 0) {
        staffRequests[s.id] = staffReq;
      }
      if (Object.keys(staffTeamLock).length > 0) {
        teamAdminLocks[s.id] = staffTeamLock;
      }
    });

    // 現在のカテゴリ設定からパワーバランス対象施設（案A: 当日平均スコア×人数比）と必須スキル設定を動的整形
    const activeAiStaffForAvg = staffList.filter(s => !s.excludeFromAi);
    const staffPoolForAvg = activeAiStaffForAvg.length > 0 ? activeAiStaffForAvg : staffList;
    const overallStaffAvgPowerScore =
      staffPoolForAvg.length > 0
        ? Number((staffPoolForAvg.reduce((sum, s) => sum + (staffPowerMap[s.id] || 0), 0) / staffPoolForAvg.length).toFixed(1))
        : 10;

    const categoriesMeta = {};
    const facilityPowerTargetsSummary = {};
    sortedCategories.forEach(cat => {
      const kind = resolveCategoryKind(cat);
      if (!includeTasks && kind === 'role') return;
      const targetPowerScore = kind === 'facility' ? getFacilityTargetPowerScore(cat, adminSettings) : 0;
      const isPowerBalanceTarget = targetPowerScore > 0;
      categoriesMeta[cat.id] = {
        id: cat.id,
        label: cat.label,
        kind,
        order: cat.order ?? 99,
        ...(kind === 'facility' ? { isPowerBalanceTarget, referenceStaffAvgScore: overallStaffAvgPowerScore } : {}),
      };
      if (kind === 'facility') {
        facilityPowerTargetsSummary[cat.id] = {
          facilityLabel: cat.label,
          targetPowerScore,
          isPowerBalanceTarget,
          balanceRule: isPowerBalanceTarget
            ? `当日出勤者の1人あたり平均スコア（全体平均目安:${overallStaffAvgPowerScore}点/人）×施設人数で施設間均等化`
            : 'スコア判定なし',
        };
      }
    });

    const facilitySkillRequirements = {};
    facilityCats.forEach(cat => {
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
      let workingCount = 0;
      let meWorkingCount = 0;
      const codeCounts = {};
      const actualScoreByCat = {};
      const actualHeadcountByCat = {};
      facilityCats.forEach(cat => {
        actualScoreByCat[cat.id] = 0;
        actualHeadcountByCat[cat.id] = 0;
      });

      staffList.forEach(s => {
        const code = customShifts[s.id]?.[d];
        if (!code || !shiftDefs[code]) return;
        const def = shiftDefs[code];
        if (getEffectiveShiftType(def, categoryDefs) !== 'shift') return;
        codeCounts[code] = (codeCounts[code] || 0) + 1;
        if (!isNonWorkOrKoushutsuShiftDef(def, categoryDefs)) {
          workingCount++;
          if (isMeRoomShiftCode(code)) meWorkingCount++;
          const pScore = staffPowerMap[s.id] || 0;
          if (actualScoreByCat[def.category] !== undefined) {
            actualScoreByCat[def.category] += pScore;
            actualHeadcountByCat[def.category] += 1;
          }
        }
      });

      const skillEval = evaluateFacilitySkillShortagesForDay(d, customShifts);

      const shortages = [];
      Object.keys(targetCounts || {}).forEach(code => {
        // AIが埋めるべき不足リスト(shortages)は勤務施設カテゴリのシフトのみ対象（ME室・その他は除外）
        if (!isAiAssignableFacilityShiftDef(code, shiftDefs, categoryDefs)) return;
        const target = getTargetCount(code, d);
        const actual = codeCounts[code] || 0;
        if (target > 0 && actual < target) {
          const label = shiftDefs[code]?.label || code;
          shortages.push(`表示名「${label}」(コード:"${code}"): ${actual}/${target}名`);
        }
      });
      skillEval.allShortages.forEach(sh => {
        shortages.push(`${sh.catLabel} 必須スキル[${sh.skillLabel}]: ${sh.actual}/${sh.target}名`);
      });

      const dayPowerBalance = evaluateDailyFacilityPowerBalance({
        facilityCats,
        shiftDefs,
        categoryDefs,
        actualHeadcountByCat,
        powerScoreByCat: actualScoreByCat,
        readTargetCount: (c) => getTargetCount(c, d),
        adminSettings,
        fallbackStaffAvgScore: overallStaffAvgPowerScore,
      });
      const facilityPowerScores = {};
      facilityCats.forEach(cat => {
        const pBal = dayPowerBalance.byCat[cat.id];
        facilityPowerScores[cat.id] = {
          label: cat.label,
          actualScore: pBal?.actualScore || 0,
          expectedBalancedScore: pBal?.expectedScore || 0,
          actualAvgPerPerson: pBal?.actualAvg || 0,
          dayOverallAvgPerPerson: dayPowerBalance.dayAvgScore,
          isPowerBalanceTarget: Boolean(pBal?.isEnabled),
          isImbalancedLow: Boolean(pBal?.isImbalancedLow),
        };
        if (pBal?.isEnabled && pBal?.isActive && pBal?.isImbalancedLow) {
          shortages.push(`${cat.label}パワーバランス偏り: ${pBal.actualScore}/目安${pBal.expectedScore}点(平均${pBal.actualAvg}点 vs 当日平均${dayPowerBalance.dayAvgScore}点)`);
        }
      });

      dailySummary[d] = {
        workingCount,
        meWorkingCount,
        facilityPowerScores,
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
        offDayRepresentation: '空欄（休みカテゴリのコードは入れず未入力のまま残す）',
        meRoomRule: 'AIが新規入力・入れ替えできるシフトは勤務施設カテゴリ（坂田・君津・木クリ・じんクリ等）のみです。ME室（L・G等）、その他（出勤・公出等）、個人(スタッフ本人)が入力したシフト・希望、および各班管理者が入力済みのシフト・タスクはAIでの自動入力・既存変更は禁止です（既に入力済みのME室・出勤は連勤・出勤日数に含め、公出は業務出張扱いのため出勤人数・現場出勤日数・連勤には含めず、公出しか入っていない週は必ずもう1日空欄の公休を残して現場出勤4日にする）'
      },
      customConditions: {
        strict: strictConditionsList,
        soft: softConditionsList,
      },
      categories: categoriesMeta,
      facilityPowerTargets: facilityPowerTargetsSummary,
      facilitySkillRequirements,
      calendar: calendarInfo,
      calendarWeeks,
      cool3ShiftCodes,
      staff: enrichedStaff,
      staffRequests,
      teamAdminLocks,
      dailySummary,
      shifts: aiFilteredShifts, 
      ...(includeTasks ? { tasks: aiFilteredTasks } : {}),
      targetCounts,
      definitions: Object.keys(shiftDefs).reduce((acc, key) => {
        const def = shiftDefs[key];
        const effType = getEffectiveShiftType(def, categoryDefs);
        if (!includeTasks && effType === 'task') return acc;
        const catObj = categoryDefs[def.category];
        const catKind = getCategoryKindById(def.category, categoryDefs);
        const isKoushutsu = isKoushutsuShiftDef(def, categoryDefs);
        const workSlot = catKind === 'facility' ? resolveShiftWorkSlot(def, categoryDefs) : null;
        const offSubType = resolveOffSubType(def, categoryDefs);
        acc[key] = {
          code: key,
          displayLabel: def.label,
          label: def.label,
          type: effType,
          category: def.category,
          categoryLabel: catObj?.label || def.category || '',
          categoryKind: catKind,
          aiAssignable: effType === 'shift' ? isAiAssignableFacilityShiftDef(key, shiftDefs, categoryDefs) : true,
          ...(isKoushutsu ? { isKoushutsu: true } : {}),
          ...(workSlot ? { workSlot, workSlotLabel: getShiftWorkSlotMeta(workSlot).label } : {}),
          ...(offSubType ? { offSubType } : {}),
          ...(def.startTime ? { startTime: def.startTime } : {}),
          ...(def.endTime ? { endTime: def.endTime } : {}),
          overtime: def.overtime || 0
        };
        return acc;
      }, {})
    };
  };

// Step 6 & Step 7対応: AIのJSON出力を安全ガード・対象日スコープ付きでマージ計算する共通関数
  const computeAiAppliedSchedule = (
    jsonString,
    baseShifts = shiftData,
    baseTasks = taskData,
    lockedBaselineShifts = shiftData,
    lockedBaselineTasks = taskData,
    allowClearAiCells = false,
    allowedDaysSet = null
  ) => {
    console.log("AI Raw Response:", jsonString);

    if (typeof jsonString === 'string' && jsonString.startsWith("⚠️")) {
      return { success: false, parsedOk: false, message: jsonString };
    }

    let cleanJson = typeof jsonString === 'string' ? jsonString : '';
    cleanJson = cleanJson.replace(/```json/gi, '').replace(/```/g, '');
    
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      return {
        success: false,
        parsedOk: false,
        message: "有効なJSON（データ形式）が見つかりませんでした。\nAIがデータ以外の返答をした可能性があります。\nF12キーでコンソールを確認してください。"
      };
    }
    
    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);

    try {
      const changes = JSON.parse(cleanJson);
      const nameToIdMap = {};
      staffList.forEach(s => {
        nameToIdMap[s.name] = s.id;
      });
      const maxDay = getDaysInMonth(year, month);
      
      let updatedCount = 0;
      const ns = { ...baseShifts };
      const nt = { ...baseTasks };
      const nextUserInputs = { ...userInputs };

      // AIによる上書き前に旧形式(boolean)の希望履歴があればコード形式へ保全する
      Object.keys(userInputs).forEach(sId => {
        Object.keys(userInputs[sId] || {}).forEach(d => {
          if (userInputs[sId][d] === true) {
            nextUserInputs[sId] = { ...(nextUserInputs[sId] || {}) };
            nextUserInputs[sId][d] = normalizeUserInputEntry(true, lockedBaselineShifts[sId]?.[d], lockedBaselineTasks[sId]?.[d]);
          }
        });
      });

      const cool3Set = new Set(prevMonthCarryOver.cool3ShiftCodes || []);

      if (changes.shift && typeof changes.shift === 'object') {
        Object.keys(changes.shift).forEach(key => {
          let staffId = key;
          if (!staffList.find(s => s.id === staffId)) staffId = nameToIdMap[key];
          const staffObj = staffList.find(s => s.id === staffId);

          // AI除外スタッフは自動作成で書き換えない
          if (staffId && staffObj && !staffObj.excludeFromAi && changes.shift[key] && typeof changes.shift[key] === 'object') {
            ns[staffId] = { ...(ns[staffId] || {}) };
            const staffCarry = prevMonthCarryOver.byStaff[staffId];
            const rawDays = Object.keys(changes.shift[key])
              .map(d => parseInt(d, 10))
              .filter(d => !isNaN(d) && d >= 1 && d <= maxDay)
              .sort((a, b) => a - b);

            // Step 6等のクリア操作が先に行われるよう並べ替え（契約日数上限判定の正確性確保）
            const isDayClearOp = (dNum) => {
              const rv = Object.prototype.hasOwnProperty.call(changes.shift[key], dNum)
                ? changes.shift[key][dNum]
                : changes.shift[key][String(dNum)];
              const rc = resolveAiOutputCode(rv, shiftDefs, categoryDefs, 'shift', staffObj);
              return (
                rv === null ||
                rv === '' ||
                rv === 'CLEAR' ||
                rv === 'NONE' ||
                (rc && shiftDefs[rc] && isTrueOffShiftDef(shiftDefs[rc], categoryDefs))
              );
            };
            const sortedDays = [
              ...rawDays.filter(dNum => isDayClearOp(dNum)),
              ...rawDays.filter(dNum => !isDayClearOp(dNum)),
            ];

            const partContractRange = getPartTimeWeeklyContractRange(staffObj);
            const hasContractLimit = Boolean(partContractRange);
            const contractWeeklyMax = partContractRange ? partContractRange.max : null;

            const countStaffWeekWorkDays = (targetDay) => {
              const targetWeekObj = currentMonthCalendarWeeks.find(w => w.days.includes(targetDay));
              if (!targetWeekObj) return 0;
              return targetWeekObj.days.filter(wd => {
                const sc = ns[staffId]?.[wd];
                return Boolean(
                  sc &&
                    shiftDefs[sc] &&
                    getEffectiveShiftType(shiftDefs[sc], categoryDefs) === 'shift' &&
                    !isNonWorkOrKoushutsuShiftDef(shiftDefs[sc], categoryDefs)
                );
              }).length;
            };

            sortedDays.forEach(dayNum => {
              if (allowedDaysSet && !allowedDaysSet.has(dayNum)) return;
              if (isSunday(year, month, dayNum)) return;
              // 実行開始前から管理者・班管理者・本人が入力済みのセルや希望履歴があるセルは絶対に変更しない
              if (
                lockedBaselineShifts[staffId]?.[dayNum] ||
                getUserRequestedShift(staffId, dayNum) ||
                getTeamLockedShiftSource(staffId, dayNum, lockedBaselineShifts)
              ) {
                return;
              }

              const rawVal = Object.prototype.hasOwnProperty.call(changes.shift[key], dayNum)
                ? changes.shift[key][dayNum]
                : changes.shift[key][String(dayNum)];

              const resolvedCode = resolveAiOutputCode(rawVal, shiftDefs, categoryDefs, 'shift', staffObj);

              // Step 6 自動手直し時（allowClearAiCells = true）は、AIが割当済みのセルを空欄公休（null等、または誤って休みコード/表示名を出力した場合）に戻す操作を許可
              const isClearOp =
                rawVal === null ||
                rawVal === '' ||
                rawVal === 'CLEAR' ||
                rawVal === 'NONE' ||
                (resolvedCode && shiftDefs[resolvedCode] && isTrueOffShiftDef(shiftDefs[resolvedCode], categoryDefs));

              if (isClearOp) {
                if (allowClearAiCells && ns[staffId]?.[dayNum]) {
                  delete ns[staffId][dayNum];
                  updatedCount++;
                }
                return;
              }

              let code = resolvedCode;
              if (!code || !shiftDefs[code]) return;
              const def = shiftDefs[code];
              // 勤務施設カテゴリのシフト以外の書き込みは禁止（ME室・その他[出勤/公出]・休み・希望はすべてブロック）
              if (!isAiAssignableFacilityShiftDef(code, shiftDefs, categoryDefs)) return;

              // Step 3: 3クール連続禁止 ＆ 月間3クール上限（maxCool3）超過防止ガード
              if (cool3Set.has(code)) {
                const prevDayIsCool3 =
                  (dayNum === 1 && staffCarry?.prevLastDayWasCool3) ||
                  (dayNum > 1 && !isSunday(year, month, dayNum - 1) && cool3Set.has(ns[staffId][dayNum - 1]));
                const nextDayIsCool3 =
                  dayNum < maxDay && !isSunday(year, month, dayNum + 1) && cool3Set.has(ns[staffId][dayNum + 1]);
                const wasAlreadyCool3OnThisDay = Boolean(ns[staffId]?.[dayNum] && cool3Set.has(ns[staffId][dayNum]));
                const currentStaffCool3Count = Object.keys(ns[staffId] || {}).filter(dKey => {
                  const dIdx = parseInt(dKey, 10);
                  return !isNaN(dIdx) && !isSunday(year, month, dIdx) && cool3Set.has(ns[staffId][dKey]);
                }).length;
                const hasMaxCool3Limit = staffObj.maxCool3 !== undefined && staffObj.maxCool3 !== null;
                const wouldExceedMaxCool3 =
                  hasMaxCool3Limit &&
                  !wasAlreadyCool3OnThisDay &&
                  currentStaffCool3Count >= Number(staffObj.maxCool3);

                if (prevDayIsCool3 || nextDayIsCool3 || wouldExceedMaxCool3) {
                  const sameFacilityAlt = Object.values(shiftDefs)
                    .filter(
                      alt =>
                        alt &&
                        isAiAssignableFacilityShiftDef(alt.code, shiftDefs, categoryDefs) &&
                        alt.category === def.category &&
                        !cool3Set.has(alt.code) &&
                        isShiftAllowedForStaff(staffObj, alt.code)
                    )
                    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))[0];
                  const anyAllowedAlt = Object.values(shiftDefs)
                    .filter(
                      alt =>
                        alt &&
                        isAiAssignableFacilityShiftDef(alt.code, shiftDefs, categoryDefs) &&
                        !cool3Set.has(alt.code) &&
                        isShiftAllowedForStaff(staffObj, alt.code)
                    )
                    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))[0];
                  const fallbackDef = sameFacilityAlt || anyAllowedAlt;
                  if (!fallbackDef) return;
                  code = fallbackDef.code;
                }
              }

              if (isShiftAllowedForStaff(staffObj, code)) {
                const existingCodeOnDay = ns[staffId]?.[dayNum];
                const isReplacingExistingWork = Boolean(
                  existingCodeOnDay &&
                    shiftDefs[existingCodeOnDay] &&
                    getEffectiveShiftType(shiftDefs[existingCodeOnDay], categoryDefs) === 'shift' &&
                    !isNonWorkOrKoushutsuShiftDef(shiftDefs[existingCodeOnDay], categoryDefs)
                );
                if (hasContractLimit && !isReplacingExistingWork) {
                  if (countStaffWeekWorkDays(dayNum) >= contractWeeklyMax) return;
                }
                if (ns[staffId][dayNum] !== code) {
                  ns[staffId][dayNum] = code;
                  updatedCount++;
                }
              }
            });
          }
        });
      }
      
      if (changes.task && typeof changes.task === 'object') {
        Object.keys(changes.task).forEach(key => {
          let staffId = key;
          if (!staffList.find(s => s.id === staffId)) staffId = nameToIdMap[key];
          const staffObj = staffList.find(s => s.id === staffId);

          if (staffId && staffObj && !staffObj.excludeFromAi && changes.task[key] && typeof changes.task[key] === 'object') {
            nt[staffId] = { ...(nt[staffId] || {}) };
            Object.keys(changes.task[key]).forEach(day => {
              const dayNum = parseInt(day, 10);
              if (isNaN(dayNum) || dayNum < 1 || dayNum > maxDay || isSunday(year, month, dayNum)) return;
              if (allowedDaysSet && !allowedDaysSet.has(dayNum)) return;
              if (
                lockedBaselineTasks[staffId]?.[dayNum] ||
                getUserRequestedTask(staffId, dayNum) ||
                getTeamLockedTaskSource(staffId, dayNum, lockedBaselineTasks)
              ) {
                return;
              }

              const rawTaskVal = changes.task[key][day];
              if (allowClearAiCells && (rawTaskVal === null || rawTaskVal === '' || rawTaskVal === 'CLEAR' || rawTaskVal === 'NONE')) {
                if (nt[staffId]?.[dayNum]) {
                  delete nt[staffId][dayNum];
                  updatedCount++;
                }
                return;
              }

              const code = resolveAiOutputCode(rawTaskVal, shiftDefs, categoryDefs, 'task', staffObj);
              if (code && shiftDefs[code] && nt[staffId][dayNum] !== code) {
                nt[staffId][dayNum] = code;
                updatedCount++;
              }
            });
          }
        });
      }

      return {
        success: updatedCount > 0,
        parsedOk: true,
        count: updatedCount,
        nextShifts: ns,
        nextTasks: nt,
        nextUserInputs,
        reason: typeof changes.reason === 'string' ? changes.reason : '',
        message: updatedCount > 0 ? '' : '変更が必要な箇所が見つかりませんでした。',
      };
    } catch (e) {
      return { success: false, parsedOk: false, message: `JSONの解析に失敗しました: ${e.message}` };
    }
  };

  // AI自動作成後、個人の厳守ルール（3クール上下限・連続3クール禁止・最大連勤・週契約出勤日数・常勤所定出勤日数）を
  // 90%〜100%クリアするよう安全に入れ替え・補正するローカルパス（足りない施設枠は無理に埋めず手動調整用に残す）
  const enforcePersonalRulesAndCool3Bounds = (
    baseShifts,
    lockedBaselineShifts = shiftData,
    scopeDaysSet = null
  ) => {
    const ns = {};
    Object.keys(baseShifts || {}).forEach(sId => {
      ns[sId] = { ...(baseShifts[sId] || {}) };
    });

    const maxDay = getDaysInMonth(year, month);
    const maxStreak = Number(adminSettings?.maxConsecutiveWorkDays) || 5;
    const closedRules = Array.isArray(adminSettings?.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
    const cool3Codes = Object.values(shiftDefs)
      .filter(sd => sd && isCool3ShiftDef(sd, categoryDefs))
      .map(sd => sd.code);
    const cool3Set = new Set(cool3Codes);

    const isDayInScope = (d) => !scopeDaysSet || scopeDaysSet.has(d);
    const hasScope = Boolean(scopeDaysSet && scopeDaysSet.size > 0);

    const isEditable = (staff, d) => {
      if (!staff || staff.excludeFromAi) return false;
      if (!isDayInScope(d) || isSunday(year, month, d)) return false;
      if (lockedBaselineShifts?.[staff.id]?.[d]) return false;
      if (getUserRequestedShift(staff.id, d)) return false;
      if (getTeamLockedShiftSource(staff.id, d, lockedBaselineShifts)) return false;
      const curCode = ns[staff.id]?.[d];
      if (curCode && shiftDefs[curCode] && !isAiAssignableFacilityShiftDef(curCode, shiftDefs, categoryDefs)) {
        return false;
      }
      return true;
    };

    const isWorkCode = (code) => {
      if (!code || !shiftDefs[code]) return false;
      const def = shiftDefs[code];
      return getEffectiveShiftType(def, categoryDefs) === 'shift' && !isNonWorkOrKoushutsuShiftDef(def, categoryDefs);
    };

    const isPaidLeave = (code) => {
      if (!code || !shiftDefs[code]) return false;
      return isPaidLeaveShiftDef(shiftDefs[code], categoryDefs);
    };

    const operatingDays = [];
    const operatingWeeks = [];
    let curWeek = [];
    for (let d = 1; d <= maxDay; d++) {
      if (isSunday(year, month, d)) {
        if (curWeek.length > 0) {
          operatingWeeks.push(curWeek);
          curWeek = [];
        }
        continue;
      }
      operatingDays.push(d);
      curWeek.push(d);
    }
    if (curWeek.length > 0) operatingWeeks.push(curWeek);

    const operatingDaysCount = operatingDays.length;
    const baseRegularOffMin = Math.floor(operatingDaysCount / 6);
    const baseRegularOffMax = Math.ceil(operatingDaysCount / 6);
    const standardWorkDaysMin = Math.max(0, operatingDaysCount - baseRegularOffMax);
    const standardWorkDaysMax = Math.max(0, operatingDaysCount - baseRegularOffMin);

    const allFacilityWorkCodes = Object.values(shiftDefs)
      .filter(sd => sd && isAiAssignableFacilityShiftDef(sd.code, shiftDefs, categoryDefs))
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .map(sd => sd.code);

    const countCodeOnDay = (code, d) => {
      let cnt = 0;
      staffList.forEach(s => {
        if (ns[s.id]?.[d] === code) cnt++;
      });
      return cnt;
    };

    const getStaffCool3Days = (staffId) => {
      const days = [];
      for (let d = 1; d <= maxDay; d++) {
        if (isSunday(year, month, d)) continue;
        const c = ns[staffId]?.[d];
        if (c && cool3Set.has(c)) days.push(d);
      }
      return days;
    };

    const canTakeCool3OnDay = (staff, d, cool3Code) => {
      if (!staff || !cool3Code || !cool3Set.has(cool3Code)) return false;
      if (!isShiftAllowedForStaff(staff, cool3Code)) return false;
      const carry = prevMonthCarryOver?.byStaff?.[staff.id];
      if (d === 1 && carry?.prevLastDayWasCool3) return false;
      if (d > 1 && !isSunday(year, month, d - 1) && cool3Set.has(ns[staff.id]?.[d - 1])) return false;
      if (d < maxDay && !isSunday(year, month, d + 1) && cool3Set.has(ns[staff.id]?.[d + 1])) return false;
      return true;
    };

    const wouldAddingWorkExceedStreak = (staff, d) => {
      const carry = prevMonthCarryOver?.byStaff?.[staff.id];
      const carryStreak = carry?.trailingWorkStreak || 0;
      let before = 0;
      let cur = d - 1;
      let hitBreak = false;
      while (cur >= 1 && !isSunday(year, month, cur)) {
        if (isWorkCode(ns[staff.id]?.[cur])) {
          before++;
          cur--;
        } else {
          hitBreak = true;
          break;
        }
      }
      if (!hitBreak && cur === 0) before += carryStreak;

      let after = 0;
      let next = d + 1;
      while (next <= maxDay && !isSunday(year, month, next)) {
        if (isWorkCode(ns[staff.id]?.[next])) {
          after++;
          next++;
        } else {
          break;
        }
      }
      return before + 1 + after > maxStreak;
    };

    const countStaffFacilityInMonth = (staffId, catId) => {
      if (!catId) return 0;
      let cnt = 0;
      for (let dayIdx = 1; dayIdx <= maxDay; dayIdx++) {
        if (isSunday(year, month, dayIdx)) continue;
        const c = ns[staffId]?.[dayIdx];
        if (c && shiftDefs[c]?.category === catId) cnt++;
      }
      return cnt;
    };

    const countStaffCodeInMonth = (staffId, code) => {
      let cnt = 0;
      for (let dayIdx = 1; dayIdx <= maxDay; dayIdx++) {
        if (isSunday(year, month, dayIdx)) continue;
        if (ns[staffId]?.[dayIdx] === code) cnt++;
      }
      return cnt;
    };

    const getAdjacentFacilitySet = (staffId, d) => {
      const adj = new Set();
      if (d === 1) {
        const prevCat = prevMonthCarryOver?.byStaff?.[staffId]?.prevLastDayCategory;
        if (prevCat) adj.add(prevCat);
      } else if (!isSunday(year, month, d - 1)) {
        const prevCode = ns[staffId]?.[d - 1];
        if (prevCode && shiftDefs[prevCode]?.category) adj.add(shiftDefs[prevCode].category);
      }
      if (d < maxDay && !isSunday(year, month, d + 1)) {
        const nextCode = ns[staffId]?.[d + 1];
        if (nextCode && shiftDefs[nextCode]?.category) adj.add(shiftDefs[nextCode].category);
      }
      return adj;
    };

    const pickAllowedNonCool3ShiftForDay = (staff, d, preferredCategoryId = null) => {
      const allowedNonCool3 = allFacilityWorkCodes.filter(
        c => !cool3Set.has(c) && isShiftAllowedForStaff(staff, c)
      );
      if (allowedNonCool3.length === 0) return null;

      const adjFacs = getAdjacentFacilitySet(staff.id, d);

      // 不足枠がある場合は、前後日と施設が連続せず・本人の当月施設回数＆シフト回数が少ない枠を優先（固定order順による坂田偏りを防止）
      const sortShortageBalanced = (list) =>
        [...list].sort((a, b) => {
          const catA = shiftDefs[a]?.category;
          const catB = shiftDefs[b]?.category;
          const adjPenaltyA = adjFacs.has(catA) ? 1 : 0;
          const adjPenaltyB = adjFacs.has(catB) ? 1 : 0;
          if (adjPenaltyA !== adjPenaltyB) return adjPenaltyA - adjPenaltyB;
          const facCntA = countStaffFacilityInMonth(staff.id, catA);
          const facCntB = countStaffFacilityInMonth(staff.id, catB);
          if (facCntA !== facCntB) return facCntA - facCntB;
          const deficitA = getTargetCount(a, d) - countCodeOnDay(a, d);
          const deficitB = getTargetCount(b, d) - countCodeOnDay(b, d);
          if (deficitA !== deficitB) return deficitB - deficitA;
          return countStaffCodeInMonth(staff.id, a) - countStaffCodeInMonth(staff.id, b);
        });

      // 余剰時はオーバーが少ない枠かつ本人の当月施設・シフト回数が少ない枠へ分散（日勤だけに固定しない）
      const sortSurplusBalanced = (list) =>
        [...list].sort((a, b) => {
          const surpA = countCodeOnDay(a, d) - getTargetCount(a, d);
          const surpB = countCodeOnDay(b, d) - getTargetCount(b, d);
          if (surpA !== surpB) return surpA - surpB;
          const catA = shiftDefs[a]?.category;
          const catB = shiftDefs[b]?.category;
          const adjPenaltyA = adjFacs.has(catA) ? 1 : 0;
          const adjPenaltyB = adjFacs.has(catB) ? 1 : 0;
          if (adjPenaltyA !== adjPenaltyB) return adjPenaltyA - adjPenaltyB;
          const facCntA = countStaffFacilityInMonth(staff.id, catA);
          const facCntB = countStaffFacilityInMonth(staff.id, catB);
          if (facCntA !== facCntB) return facCntA - facCntB;
          const isDayA = resolveShiftWorkSlot(shiftDefs[a], categoryDefs) === 'day' ? 0 : 1;
          const isDayB = resolveShiftWorkSlot(shiftDefs[b], categoryDefs) === 'day' ? 0 : 1;
          if (isDayA !== isDayB) return isDayA - isDayB;
          return countStaffCodeInMonth(staff.id, a) - countStaffCodeInMonth(staff.id, b);
        });

      if (preferredCategoryId) {
        const sameFacShort = allowedNonCool3.filter(
          c => shiftDefs[c]?.category === preferredCategoryId && countCodeOnDay(c, d) < getTargetCount(c, d)
        );
        if (sameFacShort.length > 0) return sortShortageBalanced(sameFacShort)[0];
      }
      const anyShort = allowedNonCool3.filter(c => countCodeOnDay(c, d) < getTargetCount(c, d));
      if (anyShort.length > 0) return sortShortageBalanced(anyShort)[0];

      if (preferredCategoryId) {
        const sameFacAny = allowedNonCool3.filter(
          c => shiftDefs[c]?.category === preferredCategoryId && getTargetCount(c, d) > 0
        );
        if (sameFacAny.length > 0) return sortSurplusBalanced(sameFacAny)[0];
      }
      const activeAllowed = allowedNonCool3.filter(c => getTargetCount(c, d) > 0);
      return activeAllowed.length > 0
        ? sortSurplusBalanced(activeAllowed)[0]
        : sortSurplusBalanced(allowedNonCool3)[0];
    };

    let changedCount = 0;

    // --- Phase 1: 配置制限外シフトの即時修正 ---
    staffList.forEach(s => {
      if (s.excludeFromAi) return;
      for (let d = 1; d <= maxDay; d++) {
        if (!isEditable(s, d)) continue;
        const code = ns[s.id]?.[d];
        if (!code || !shiftDefs[code]) continue;
        if (isAiAssignableFacilityShiftDef(code, shiftDefs, categoryDefs) && !isShiftAllowedForStaff(s, code)) {
          const alt = pickAllowedNonCool3ShiftForDay(s, d, shiftDefs[code].category);
          if (alt) {
            ns[s.id][d] = alt;
          } else {
            delete ns[s.id][d];
          }
          changedCount++;
        }
      }
    });

    // --- Phase 2: 連続出勤上限（maxStreak）超過・パート週契約上限超過・常勤フル6日週の公休確保 ---
    staffList.forEach(s => {
      if (s.excludeFromAi) return;
      ns[s.id] = { ...(ns[s.id] || {}) };
      const partRange = getPartTimeWeeklyContractRange(s);

      // 2-A: パート職員の週契約上限超過を空欄に戻す
      if (partRange) {
        operatingWeeks.forEach(wDays => {
          if (hasScope && !wDays.some(wd => isDayInScope(wd))) return;
          let wWorkDays = wDays.filter(wd => isWorkCode(ns[s.id]?.[wd]));
          while (wWorkDays.length > partRange.max) {
            const editableInWeek = wWorkDays.filter(wd => isEditable(s, wd));
            if (editableInWeek.length === 0) break;
            editableInWeek.sort((a, b) => {
              const codeA = ns[s.id][a];
              const codeB = ns[s.id][b];
              const surpA = countCodeOnDay(codeA, a) - getTargetCount(codeA, a);
              const surpB = countCodeOnDay(codeB, b) - getTargetCount(codeB, b);
              if (surpA !== surpB) return surpB - surpA;
              const c3A = cool3Set.has(codeA) ? 1 : 0;
              const c3B = cool3Set.has(codeB) ? 1 : 0;
              return c3A - c3B;
            });
            delete ns[s.id][editableInWeek[0]];
            changedCount++;
            wWorkDays = wDays.filter(wd => isWorkCode(ns[s.id]?.[wd]));
          }
        });
      } else if (s.jobTitle !== 'パート') {
        // 2-B: 常勤職員のフル6日週で週休（空欄・休・公出）が0日の場合は最低1日を空欄公休にする
        operatingWeeks.forEach(wDays => {
          if (wDays.length < 6) return;
          if (hasScope && !wDays.every(wd => isDayInScope(wd))) return;
          const wWorkDays = wDays.filter(wd => isWorkCode(ns[s.id]?.[wd]));
          if (wWorkDays.length === 6) {
            const editableInWeek = wWorkDays.filter(wd => isEditable(s, wd));
            if (editableInWeek.length > 0) {
              editableInWeek.sort((a, b) => {
                const codeA = ns[s.id][a];
                const codeB = ns[s.id][b];
                const surpA = countCodeOnDay(codeA, a) - getTargetCount(codeA, a);
                const surpB = countCodeOnDay(codeB, b) - getTargetCount(codeB, b);
                if (surpA !== surpB) return surpB - surpA;
                const c3A = cool3Set.has(codeA) ? 1 : 0;
                const c3B = cool3Set.has(codeB) ? 1 : 0;
                return c3A - c3B;
              });
              delete ns[s.id][editableInWeek[0]];
              changedCount++;
            }
          }
        });
      }

      // 2-C: 最大連勤超過（前月末からの通算含む）を分割して空欄公休にする
      const carryStreak = prevMonthCarryOver?.byStaff?.[s.id]?.trailingWorkStreak || 0;
      for (let guard = 0; guard < 10; guard++) {
        let streakLen = carryStreak;
        let runDays = [];
        let broken = false;

        const tryBreakRun = (daysArr, totalLen) => {
          if (totalLen <= maxStreak || daysArr.length === 0) return false;
          if (hasScope && !daysArr.some(wd => isDayInScope(wd))) return false;
          const editableDays = daysArr.filter(wd => isEditable(s, wd));
          if (editableDays.length === 0) return false;
          const idealIdx = Math.floor(daysArr.length / 2);
          editableDays.sort((a, b) => {
            const distA = Math.abs(daysArr.indexOf(a) - idealIdx);
            const distB = Math.abs(daysArr.indexOf(b) - idealIdx);
            if (distA !== distB) return distA - distB;
            const codeA = ns[s.id][a];
            const codeB = ns[s.id][b];
            const surpA = countCodeOnDay(codeA, a) - getTargetCount(codeA, a);
            const surpB = countCodeOnDay(codeB, b) - getTargetCount(codeB, b);
            return surpB - surpA;
          });
          delete ns[s.id][editableDays[0]];
          changedCount++;
          return true;
        };

        for (let d = 1; d <= maxDay; d++) {
          if (isSunday(year, month, d)) {
            if (tryBreakRun(runDays, streakLen)) {
              broken = true;
              break;
            }
            streakLen = 0;
            runDays = [];
            continue;
          }
          if (isWorkCode(ns[s.id]?.[d])) {
            streakLen++;
            runDays.push(d);
          } else {
            if (tryBreakRun(runDays, streakLen)) {
              broken = true;
              break;
            }
            streakLen = 0;
            runDays = [];
          }
        }
        if (!broken && tryBreakRun(runDays, streakLen)) {
          broken = true;
        }
        if (!broken) break;
      }
    });

    // --- Phase 3: 出勤日数不足（パートの週契約下限・常勤の空欄過多）の安全穴埋め ---
    staffList.forEach(s => {
      if (s.excludeFromAi) return;
      ns[s.id] = { ...(ns[s.id] || {}) };
      const partRange = getPartTimeWeeklyContractRange(s);

      const pickShiftToFillBlank = (staff, d) => {
        const cool3Days = getStaffCool3Days(staff.id);
        const minC3 = Number(staff.minCool3 || 0);
        const maxC3 = staff.maxCool3 !== undefined && staff.maxCool3 !== null ? Number(staff.maxCool3) : 99;
        const needsCool3 = cool3Days.length < minC3 && cool3Days.length < maxC3;

        if (needsCool3) {
          const adjFacs = getAdjacentFacilitySet(staff.id, d);
          const shortCool3 = cool3Codes
            .filter(c => canTakeCool3OnDay(staff, d, c) && countCodeOnDay(c, d) < getTargetCount(c, d))
            .sort((a, b) => {
              const catA = shiftDefs[a]?.category;
              const catB = shiftDefs[b]?.category;
              const adjA = adjFacs.has(catA) ? 1 : 0;
              const adjB = adjFacs.has(catB) ? 1 : 0;
              if (adjA !== adjB) return adjA - adjB;
              return countStaffFacilityInMonth(staff.id, catA) - countStaffFacilityInMonth(staff.id, catB);
            });
          if (shortCool3.length > 0) return shortCool3[0];
        }

        const nonCool3 = pickAllowedNonCool3ShiftForDay(staff, d, null);
        if (nonCool3) return nonCool3;

        if (cool3Days.length < maxC3) {
          const anyCool3 = cool3Codes.filter(c => canTakeCool3OnDay(staff, d, c));
          if (anyCool3.length > 0) return anyCool3[0];
        }
        return null;
      };

      if (partRange) {
        // 3-A: パート職員のフル6日週での週契約下限達成
        operatingWeeks.forEach(wDays => {
          if (wDays.length < 6) return;
          if (hasScope && !wDays.every(wd => isDayInScope(wd))) return;
          let wWorkDays = wDays.filter(wd => isWorkCode(ns[s.id]?.[wd]));
          while (wWorkDays.length < partRange.min) {
            const blankCandidates = wDays.filter(
              wd => !ns[s.id]?.[wd] && isEditable(s, wd) && !wouldAddingWorkExceedStreak(s, wd)
            );
            if (blankCandidates.length === 0) break;
            blankCandidates.sort((a, b) => {
              const shortA = allFacilityWorkCodes.filter(
                c => isShiftAllowedForStaff(s, c) && countCodeOnDay(c, a) < getTargetCount(c, a)
              ).length;
              const shortB = allFacilityWorkCodes.filter(
                c => isShiftAllowedForStaff(s, c) && countCodeOnDay(c, b) < getTargetCount(c, b)
              ).length;
              return shortB - shortA;
            });
            const targetDay = blankCandidates[0];
            const codeToFill = pickShiftToFillBlank(s, targetDay);
            if (!codeToFill) break;
            ns[s.id][targetDay] = codeToFill;
            changedCount++;
            wWorkDays = wDays.filter(wd => isWorkCode(ns[s.id]?.[wd]));
          }
        });
      } else if (!hasScope && s.jobTitle !== 'パート') {
        // 3-B: 常勤職員の月間出勤日数不足（空欄公休の残しすぎ）を解消
        let workDays = 0;
        let paidLeaveDays = 0;
        const regOffDaySet = new Set();
        for (let d = 1; d <= maxDay; d++) {
          if (isSunday(year, month, d)) continue;
          const code = ns[s.id]?.[d];
          const def = code ? shiftDefs[code] : null;
          const reqShift = getUserRequestedShift(s.id, d);
          if (!code || !def) {
            if (reqShift && shiftDefs[reqShift] && isPaidLeave(reqShift)) paidLeaveDays++;
            else if (reqShift && shiftDefs[reqShift] && isNonWorkOrKoushutsuShiftDef(shiftDefs[reqShift], categoryDefs)) regOffDaySet.add(d);
            else if (isHoliday(year, month, d, closedRules)) regOffDaySet.add(d);
          } else if (isNonWorkOrKoushutsuShiftDef(def, categoryDefs)) {
            if (isPaidLeave(code)) paidLeaveDays++;
            else regOffDaySet.add(d);
          } else {
            workDays++;
          }
        }
        const excessSameWeekRegOffDays = operatingWeeks.reduce((acc, wDays) => {
          const cnt = wDays.filter(wd => regOffDaySet.has(wd)).length;
          return acc + Math.max(0, cnt - 1);
        }, 0);
        const targetMin = Math.max(0, standardWorkDaysMin - paidLeaveDays - excessSameWeekRegOffDays);
        const targetMax = Math.max(targetMin, standardWorkDaysMax - paidLeaveDays - excessSameWeekRegOffDays);

        while (workDays < targetMin) {
          const candidateDays = [];
          operatingWeeks.forEach(wDays => {
            const nonWorkInWeek = wDays.filter(wd => !isWorkCode(ns[s.id]?.[wd]));
            if (wDays.length === 6 && nonWorkInWeek.length <= 1) return;
            wDays.forEach(wd => {
              if (
                !ns[s.id]?.[wd] &&
                !isHoliday(year, month, wd, closedRules) &&
                isEditable(s, wd) &&
                !wouldAddingWorkExceedStreak(s, wd)
              ) {
                candidateDays.push(wd);
              }
            });
          });
          if (candidateDays.length === 0) break;
          candidateDays.sort((a, b) => {
            const shortA = allFacilityWorkCodes.filter(
              c => isShiftAllowedForStaff(s, c) && countCodeOnDay(c, a) < getTargetCount(c, a)
            ).length;
            const shortB = allFacilityWorkCodes.filter(
              c => isShiftAllowedForStaff(s, c) && countCodeOnDay(c, b) < getTargetCount(c, b)
            ).length;
            return shortB - shortA;
          });
          const dayToFill = candidateDays[0];
          const codeToFill = pickShiftToFillBlank(s, dayToFill);
          if (!codeToFill) break;
          ns[s.id][dayToFill] = codeToFill;
          workDays++;
          changedCount++;
        }

        // 月間目安上限（targetMax）を超えている場合でも、必要人数割れ（穴）を作ってまで削除せず、余剰がある日のみ空欄公休へ戻す
        while (workDays > targetMax) {
          const surplusEditableWorkDays = [];
          operatingWeeks.forEach(wDays => {
            const wWork = wDays.filter(wd => isWorkCode(ns[s.id]?.[wd]));
            if (wDays.length === 6 && wWork.length <= 5) return;
            wWork.forEach(wd => {
              if (!isEditable(s, wd)) return;
              const curCode = ns[s.id][wd];
              if (countCodeOnDay(curCode, wd) > getTargetCount(curCode, wd)) {
                surplusEditableWorkDays.push(wd);
              }
            });
          });
          if (surplusEditableWorkDays.length === 0) break;
          surplusEditableWorkDays.sort((a, b) => {
            const codeA = ns[s.id][a];
            const codeB = ns[s.id][b];
            const surpA = countCodeOnDay(codeA, a) - getTargetCount(codeA, a);
            const surpB = countCodeOnDay(codeB, b) - getTargetCount(codeB, b);
            return surpB - surpA;
          });
          delete ns[s.id][surplusEditableWorkDays[0]];
          workDays--;
          changedCount++;
        }
      }
    });

    const countLeadersOnCode = (code, d) => {
      let cnt = 0;
      staffList.forEach(st => {
        if (ns[st.id]?.[d] === code && st.skills?.isLeader) cnt++;
      });
      return cnt;
    };

    const countLeadersInFacility = (catId, d) => {
      if (!catId) return 0;
      let cnt = 0;
      staffList.forEach(st => {
        const c = ns[st.id]?.[d];
        if (c && shiftDefs[c]?.category === catId && isWorkCode(c) && st.skills?.isLeader) {
          cnt++;
        }
      });
      return cnt;
    };

    const wouldRemovingBreakKikuriLeader = (staff, d, nextFacId = null) => {
      if (!staff?.skills?.isLeader) return false;
      const curCode = ns[staff.id]?.[d];
      const curFacId = curCode ? shiftDefs[curCode]?.category : null;
      if (!curFacId || curFacId === nextFacId) return false;
      if (!isKikuriFacilityCategory(categoryDefs[curFacId])) return false;
      return countLeadersInFacility(curFacId, d) <= 1;
    };

    // --- Phase 4: 連続3クール禁止（consecutive_cool3）および3クール月間上限超過（cool3_over_limit）の解消 ---
    const replaceOrSwapOutCool3OnDay = (staff, d, { preserveCool3AndLeader = false } = {}) => {
      const curCool3Code = ns[staff.id]?.[d];
      if (!curCool3Code || !cool3Set.has(curCool3Code)) return false;
      const facId = shiftDefs[curCool3Code]?.category;
      const isSoleC3Leader =
        Boolean(staff.skills?.isLeader) && countLeadersOnCode(curCool3Code, d) <= 1;

      const swapPartners = staffList.filter(other => {
        if (other.id === staff.id || other.excludeFromAi) return false;
        if (!isEditable(other, d)) return false;
        const otherCode = ns[other.id]?.[d];
        if (!otherCode || !isWorkCode(otherCode) || cool3Set.has(otherCode)) return false;
        if (!isShiftAllowedForStaff(staff, otherCode)) return false;
        if (!canTakeCool3OnDay(other, d, curCool3Code)) return false;
        // 3クール内の唯一のリーダーを外す場合は、相手もリーダー保持者の場合のみ許可（preserve時）
        if (preserveCool3AndLeader && isSoleC3Leader && !other.skills?.isLeader) return false;
        // 相手が木クリの唯一のリーダーで自分が非リーダーなら木クリのリーダーが0になるため除外
        if (!staff.skills?.isLeader && wouldRemovingBreakKikuriLeader(other, d, facId)) return false;
        const otherC3Count = getStaffCool3Days(other.id).length;
        const otherMax = other.maxCool3 !== undefined && other.maxCool3 !== null ? Number(other.maxCool3) : 99;
        return otherC3Count < otherMax;
      });

      if (swapPartners.length > 0) {
        swapPartners.sort((a, b) => {
          // 唯一リーダーのときは相手がリーダーであることを最優先（4-Aでもリーダー維持）
          if (isSoleC3Leader) {
            const aL = a.skills?.isLeader ? 1 : 0;
            const bL = b.skills?.isLeader ? 1 : 0;
            if (aL !== bL) return bL - aL;
          }
          const aSameFac = shiftDefs[ns[a.id][d]]?.category === facId ? 1 : 0;
          const bSameFac = shiftDefs[ns[b.id][d]]?.category === facId ? 1 : 0;
          if (aSameFac !== bSameFac) return bSameFac - aSameFac;
          const aNeed = Math.max(0, Number(a.minCool3 || 0) - getStaffCool3Days(a.id).length);
          const bNeed = Math.max(0, Number(b.minCool3 || 0) - getStaffCool3Days(b.id).length);
          if (aNeed !== bNeed) return bNeed - aNeed;
          const aRem = (a.maxCool3 ?? 99) - getStaffCool3Days(a.id).length;
          const bRem = (b.maxCool3 ?? 99) - getStaffCool3Days(b.id).length;
          return bRem - aRem;
        });
        const partner = swapPartners[0];
        const partnerCode = ns[partner.id][d];
        ns[staff.id][d] = partnerCode;
        ns[partner.id][d] = curCool3Code;
        changedCount++;
        return true;
      }

      // preserveCool3AndLeader=true（月間上限調整時）は、3クール必要人数割れやリーダー不在を起こしてまで単純降格させない
      if (preserveCool3AndLeader) {
        if (isSoleC3Leader) return false;
        if (countCodeOnDay(curCool3Code, d) <= getTargetCount(curCool3Code, d)) return false;
      }

      const fallbackNonCool3 = pickAllowedNonCool3ShiftForDay(staff, d, facId);
      if (fallbackNonCool3) {
        ns[staff.id][d] = fallbackNonCool3;
        changedCount++;
        return true;
      }
      return false;
    };

    // 4-A: 連続3クールの解消（絶対禁止ルール）
    staffList.forEach(s => {
      if (s.excludeFromAi) return;
      const carry = prevMonthCarryOver?.byStaff?.[s.id];
      if (cool3Set.has(ns[s.id]?.[1]) && carry?.prevLastDayWasCool3 && isEditable(s, 1)) {
        replaceOrSwapOutCool3OnDay(s, 1, { preserveCool3AndLeader: false });
      }
      for (let d = 2; d <= maxDay; d++) {
        if (isSunday(year, month, d) || isSunday(year, month, d - 1)) continue;
        if (cool3Set.has(ns[s.id]?.[d]) && cool3Set.has(ns[s.id]?.[d - 1])) {
          if (isEditable(s, d)) {
            replaceOrSwapOutCool3OnDay(s, d, { preserveCool3AndLeader: false });
          } else if (isEditable(s, d - 1)) {
            replaceOrSwapOutCool3OnDay(s, d - 1, { preserveCool3AndLeader: false });
          }
        }
      }
    });

    // 4-B: 3クール月間上限超過（maxCool3）の解消（※3クール必要人数と3クール内リーダーを崩さない範囲でスワップ・調整）
    staffList.forEach(s => {
      if (s.excludeFromAi) return;
      if (s.maxCool3 === undefined || s.maxCool3 === null) return;
      const maxLimit = Number(s.maxCool3);
      const triedDays = new Set();
      for (let guard = 0; guard < 15; guard++) {
        const c3Days = getStaffCool3Days(s.id);
        if (c3Days.length <= maxLimit) break;
        const editableC3Days = c3Days.filter(d => isEditable(s, d) && !triedDays.has(d));
        if (editableC3Days.length === 0) break;
        editableC3Days.sort((a, b) => {
          const soleA = s.skills?.isLeader && countLeadersOnCode(ns[s.id][a], a) <= 1 ? 1 : 0;
          const soleB = s.skills?.isLeader && countLeadersOnCode(ns[s.id][b], b) <= 1 ? 1 : 0;
          if (soleA !== soleB) return soleA - soleB;
          const surpA = countCodeOnDay(ns[s.id][a], a) - getTargetCount(ns[s.id][a], a);
          const surpB = countCodeOnDay(ns[s.id][b], b) - getTargetCount(ns[s.id][b], b);
          return surpB - surpA;
        });
        const targetDay = editableC3Days[0];
        triedDays.add(targetDay);
        replaceOrSwapOutCool3OnDay(s, targetDay, { preserveCool3AndLeader: true });
      }
    });

    // --- Phase 5: 3クール月間下限未達（minCool3）の引き上げ（リーダー要件・施設バランスを保護しつつ調整） ---
    if (!hasScope) {
      staffList.forEach(s => {
        if (s.excludeFromAi) return;
        const minReq = Number(s.minCool3 || 0);
        const maxLim = s.maxCool3 !== undefined && s.maxCool3 !== null ? Number(s.maxCool3) : 99;
        if (minReq <= 0) return;

        for (let guard = 0; guard < 15; guard++) {
          const curC3Days = getStaffCool3Days(s.id);
          if (curC3Days.length >= minReq || curC3Days.length >= maxLim) break;

          const candidateWorkDays = [];
          for (let d = 1; d <= maxDay; d++) {
            if (!isEditable(s, d)) continue;
            const curCode = ns[s.id]?.[d];
            if (!curCode || !isWorkCode(curCode) || cool3Set.has(curCode)) continue;
            candidateWorkDays.push(d);
          }
          if (candidateWorkDays.length === 0) break;

          let gainedCool3 = false;

          // ステップA: 同じ日に必要人数未達の3クール枠があれば直接昇格（木クリ唯一リーダーを空けない場合のみ）
          for (const d of candidateWorkDays) {
            const curCode = ns[s.id][d];
            const curFacId = shiftDefs[curCode]?.category;
            const allowedShortC3 = cool3Codes
              .filter(
                c3 =>
                  canTakeCool3OnDay(s, d, c3) &&
                  countCodeOnDay(c3, d) < getTargetCount(c3, d) &&
                  !wouldRemovingBreakKikuriLeader(s, d, shiftDefs[c3]?.category)
              )
              .sort((a, b) => {
                const aSame = shiftDefs[a]?.category === curFacId ? 1 : 0;
                const bSame = shiftDefs[b]?.category === curFacId ? 1 : 0;
                return bSame - aSame;
              });
            if (allowedShortC3.length > 0) {
              ns[s.id][d] = allowedShortC3[0];
              changedCount++;
              gainedCool3 = true;
              break;
            }
          }
          if (gainedCool3) continue;

          // ステップB: 同じ日に3クール回数の余裕（cool3Count > minCool3）がある他職員と1対1スワップ（3クール内リーダー・木クリリーダー・ローテーション保護）
          let bestSwap = null;
          for (const d of candidateWorkDays) {
            const curCode = ns[s.id][d];
            const curFacId = shiftDefs[curCode]?.category;
            staffList.forEach(donor => {
              if (donor.id === s.id || donor.excludeFromAi) return;
              if (!isEditable(donor, d)) return;
              const donorC3Code = ns[donor.id]?.[d];
              if (!donorC3Code || !cool3Set.has(donorC3Code)) return;
              const donorC3Count = getStaffCool3Days(donor.id).length;
              const donorMin = Number(donor.minCool3 || 0);
              if (donorC3Count <= donorMin) return;
              if (!canTakeCool3OnDay(s, d, donorC3Code)) return;
              if (!isShiftAllowedForStaff(donor, curCode)) return;
              // donorが3クール唯一のリーダーで自分が非リーダーなら交換不可
              if (!s.skills?.isLeader && donor.skills?.isLeader && countLeadersOnCode(donorC3Code, d) <= 1) return;
              const donorFacId = shiftDefs[donorC3Code]?.category;
              // 自分が木クリ唯一のリーダーでdonorが非リーダーなら交換不可
              if (!donor.skills?.isLeader && wouldRemovingBreakKikuriLeader(s, d, donorFacId)) return;

              const isSameFac = donorFacId === curFacId ? 1 : 0;
              if (!isSameFac) {
                const sAdj = getAdjacentFacilitySet(s.id, d);
                const dAdj = getAdjacentFacilitySet(donor.id, d);
                if (sAdj.has(donorFacId) || dAdj.has(curFacId)) return;
              }
              const donorSurplus = donorC3Count - donorMin;
              const score = isSameFac * 100 + donorSurplus;
              if (!bestSwap || score > bestSwap.score) {
                bestSwap = { d, donor, donorC3Code, replacementForDonor: curCode, score };
              }
            });
          }

          if (bestSwap) {
            ns[s.id][bestSwap.d] = bestSwap.donorC3Code;
            ns[bestSwap.donor.id][bestSwap.d] = bestSwap.replacementForDonor;
            changedCount++;
            gainedCool3 = true;
          }
          if (!gainedCool3) break;
        }
      });
    }

    // --- Phase 6: 3クール必要人数の確実確保 ＆ 3クール枠内リーダー1名以上 ＆ 木クリリーダー1名以上の自動確保パス ---
    const canSafelyAssignBlankStaffToWorkOnDay = (staff, d) => {
      if (!staff || staff.excludeFromAi || ns[staff.id]?.[d] || !isEditable(staff, d)) return false;
      if (wouldAddingWorkExceedStreak(staff, d)) return false;
      const partRange = getPartTimeWeeklyContractRange(staff);
      const wDays = operatingWeeks.find(w => w.includes(d));
      if (wDays) {
        const curWeekWork = wDays.filter(wd => isWorkCode(ns[staff.id]?.[wd])).length;
        if (partRange && curWeekWork >= partRange.max) return false;
        if (!partRange && staff.jobTitle !== 'パート' && wDays.length === 6) {
          const otherOffs = wDays.filter(wd => wd !== d && !isWorkCode(ns[staff.id]?.[wd])).length;
          if (otherOffs === 0) return false;
        }
      }
      return true;
    };

    for (let d = 1; d <= maxDay; d++) {
      if (!isDayInScope(d) || isSunday(year, month, d)) continue;

      // 6-A: 各3クールシフトの必要人数を最優先で100%満たす
      cool3Codes.forEach(c3Code => {
        const target = getTargetCount(c3Code, d);
        if (target <= 0) return;
        const c3FacId = shiftDefs[c3Code]?.category;

        for (let guard = 0; guard < 12; guard++) {
          if (countCodeOnDay(c3Code, d) >= target) break;
          const needsLeaderNow = countLeadersOnCode(c3Code, d) === 0;

          // ① 同日に通常シフト（日勤・2クール）で出勤中の配置可能スタッフを3クールへ昇格（上限内の人を優先）
          let workingCands = staffList.filter(cand => {
            if (cand.excludeFromAi || !isEditable(cand, d)) return false;
            const curCode = ns[cand.id]?.[d];
            if (!curCode || !isWorkCode(curCode) || cool3Set.has(curCode)) return false;
            if (!canTakeCool3OnDay(cand, d, c3Code)) return false;
            if (wouldRemovingBreakKikuriLeader(cand, d, c3FacId)) return false;
            const cMax = cand.maxCool3 !== undefined && cand.maxCool3 !== null ? Number(cand.maxCool3) : 99;
            return getStaffCool3Days(cand.id).length < cMax;
          });

          // ② 上限内の通常出勤者に候補がいなければ、週休・連勤を守れる当日の空欄スタッフから補充
          if (workingCands.length === 0) {
            const blankCands = staffList.filter(cand => {
              if (!canSafelyAssignBlankStaffToWorkOnDay(cand, d)) return false;
              if (!canTakeCool3OnDay(cand, d, c3Code)) return false;
              const cMax = cand.maxCool3 !== undefined && cand.maxCool3 !== null ? Number(cand.maxCool3) : 99;
              return getStaffCool3Days(cand.id).length < cMax;
            });
            if (blankCands.length > 0) {
              blankCands.sort((a, b) => {
                if (needsLeaderNow) {
                  const aL = a.skills?.isLeader ? 1 : 0;
                  const bL = b.skills?.isLeader ? 1 : 0;
                  if (aL !== bL) return bL - aL;
                }
                const aRem = (a.maxCool3 ?? 99) - getStaffCool3Days(a.id).length;
                const bRem = (b.maxCool3 ?? 99) - getStaffCool3Days(b.id).length;
                return bRem - aRem;
              });
              ns[blankCands[0].id][d] = c3Code;
              changedCount++;
              continue;
            }
          }

          // ③ それでも足りない緊急時のみ、連続3クールにならない通常出勤者から最小超過で昇格して欠員を防ぐ
          if (workingCands.length === 0) {
            workingCands = staffList.filter(cand => {
              if (cand.excludeFromAi || !isEditable(cand, d)) return false;
              const curCode = ns[cand.id]?.[d];
              if (!curCode || !isWorkCode(curCode) || cool3Set.has(curCode)) return false;
              if ((cand.maxCool3 ?? 5) <= 0) return false;
              if (!canTakeCool3OnDay(cand, d, c3Code)) return false;
              if (wouldRemovingBreakKikuriLeader(cand, d, c3FacId)) return false;
              return true;
            });
          }

          if (workingCands.length === 0) break;

          workingCands.sort((a, b) => {
            if (needsLeaderNow) {
              const aL = a.skills?.isLeader ? 1 : 0;
              const bL = b.skills?.isLeader ? 1 : 0;
              if (aL !== bL) return bL - aL;
            }
            const codeA = ns[a.id][d];
            const codeB = ns[b.id][d];
            const surpA = countCodeOnDay(codeA, d) - getTargetCount(codeA, d);
            const surpB = countCodeOnDay(codeB, d) - getTargetCount(codeB, d);
            if (surpA !== surpB) return surpB - surpA;
            const sameA = shiftDefs[codeA]?.category === c3FacId ? 1 : 0;
            const sameB = shiftDefs[codeB]?.category === c3FacId ? 1 : 0;
            if (sameA !== sameB) return sameB - sameA;
            const remA = (a.maxCool3 ?? 99) - getStaffCool3Days(a.id).length;
            const remB = (b.maxCool3 ?? 99) - getStaffCool3Days(b.id).length;
            return remB - remA;
          });

          ns[workingCands[0].id][d] = c3Code;
          changedCount++;
        }
      });

      // 6-B: 各3クール枠の中に必ずリーダー（isLeader）を1名以上確保する
      cool3Codes.forEach(c3Code => {
        if (getTargetCount(c3Code, d) <= 0 && countCodeOnDay(c3Code, d) <= 0) return;
        if (countLeadersOnCode(c3Code, d) >= 1) return;

        const c3FacId = shiftDefs[c3Code]?.category;
        const editableNonLeadersInC3 = staffList.filter(
          st => !st.excludeFromAi && isEditable(st, d) && ns[st.id]?.[d] === c3Code && !st.skills?.isLeader
        );

        // 方法①: 同日の日勤・2クールにいるリーダー保持者と1対1スワップ（同施設を最優先、上限内を優先）
        if (editableNonLeadersInC3.length > 0) {
          let bestLeaderSwap = null;
          staffList.forEach(leaderCand => {
            if (leaderCand.excludeFromAi || !leaderCand.skills?.isLeader || !isEditable(leaderCand, d)) return;
            const lCode = ns[leaderCand.id]?.[d];
            if (!lCode || !isWorkCode(lCode) || cool3Set.has(lCode)) return;
            if ((leaderCand.maxCool3 ?? 5) <= 0) return;
            if (!canTakeCool3OnDay(leaderCand, d, c3Code)) return;
            if (wouldRemovingBreakKikuriLeader(leaderCand, d, c3FacId)) return;

            const lMax = leaderCand.maxCool3 !== undefined && leaderCand.maxCool3 !== null ? Number(leaderCand.maxCool3) : 99;
            const lRem = lMax - getStaffCool3Days(leaderCand.id).length;
            const withinMax = lRem > 0 ? 1 : 0;
            const sameFac = shiftDefs[lCode]?.category === c3FacId ? 1 : 0;

            editableNonLeadersInC3.forEach(nonL => {
              if (!isShiftAllowedForStaff(nonL, lCode)) return;
              const score = withinMax * 1000 + sameFac * 100 + lRem;
              if (!bestLeaderSwap || score > bestLeaderSwap.score) {
                bestLeaderSwap = { leaderCand, nonL, lCode, score };
              }
            });
          });

          if (bestLeaderSwap) {
            ns[bestLeaderSwap.leaderCand.id][d] = c3Code;
            ns[bestLeaderSwap.nonL.id][d] = bestLeaderSwap.lCode;
            changedCount++;
            return;
          }
        }

        // 方法②: 別の3クール枠にリーダーが2名以上いる場合、3クール同士で1対1スワップ
        if (editableNonLeadersInC3.length > 0) {
          let bestCrossC3Swap = null;
          cool3Codes.forEach(otherC3 => {
            if (otherC3 === c3Code || countLeadersOnCode(otherC3, d) < 2) return;
            staffList.forEach(surplusLeader => {
              if (
                surplusLeader.excludeFromAi ||
                !surplusLeader.skills?.isLeader ||
                !isEditable(surplusLeader, d) ||
                ns[surplusLeader.id]?.[d] !== otherC3
              ) {
                return;
              }
              if (!canTakeCool3OnDay(surplusLeader, d, c3Code)) return;
              editableNonLeadersInC3.forEach(nonL => {
                if (!canTakeCool3OnDay(nonL, d, otherC3)) return;
                bestCrossC3Swap = { surplusLeader, nonL, otherC3 };
              });
            });
          });

          if (bestCrossC3Swap) {
            ns[bestCrossC3Swap.surplusLeader.id][d] = c3Code;
            ns[bestCrossC3Swap.nonL.id][d] = bestCrossC3Swap.otherC3;
            changedCount++;
          }
        }
      });

      // 6-C: 2クールまでの施設のうち「木クリ」に必ずリーダーを1名以上確保する
      Object.values(categoryDefs)
        .filter(cat => isKikuriFacilityCategory(cat))
        .forEach(kikuriCat => {
          const kikuriShiftCodes = allFacilityWorkCodes.filter(c => shiftDefs[c]?.category === kikuriCat.id);
          const kikuriTargetSum = kikuriShiftCodes.reduce((sum, c) => sum + getTargetCount(c, d), 0);
          if (kikuriTargetSum <= 0) return;
          if (countLeadersInFacility(kikuriCat.id, d) >= 1) return;

          const editableNonLeadersInKikuri = staffList.filter(st => {
            const c = ns[st.id]?.[d];
            return Boolean(c && shiftDefs[c]?.category === kikuriCat.id && !st.excludeFromAi && isEditable(st, d) && !st.skills?.isLeader);
          });
          if (editableNonLeadersInKikuri.length === 0) return;

          let bestKikuriSwap = null;
          staffList.forEach(donorLeader => {
            if (donorLeader.excludeFromAi || !donorLeader.skills?.isLeader || !isEditable(donorLeader, d)) return;
            const dCode = ns[donorLeader.id]?.[d];
            if (!dCode || !isWorkCode(dCode)) return;
            const dFacId = shiftDefs[dCode]?.category;
            if (dFacId === kikuriCat.id) return;

            // donorが3クール唯一のリーダー、または他木クリ系施設の唯一リーダーなら除外
            if (cool3Set.has(dCode) && countLeadersOnCode(dCode, d) <= 1) return;
            if (isKikuriFacilityCategory(categoryDefs[dFacId]) && countLeadersInFacility(dFacId, d) <= 1) return;

            editableNonLeadersInKikuri.forEach(kNonL => {
              const kCode = ns[kNonL.id][d];
              if (!isShiftAllowedForStaff(donorLeader, kCode)) return;
              if (!isShiftAllowedForStaff(kNonL, dCode)) return;
              if (cool3Set.has(dCode)) {
                const kMax = kNonL.maxCool3 !== undefined && kNonL.maxCool3 !== null ? Number(kNonL.maxCool3) : 99;
                if (!canTakeCool3OnDay(kNonL, d, dCode) || getStaffCool3Days(kNonL.id).length >= kMax) return;
              }
              const nonCool3Bonus = cool3Set.has(dCode) ? 0 : 50;
              const score = nonCool3Bonus - countStaffFacilityInMonth(donorLeader.id, kikuriCat.id);
              if (!bestKikuriSwap || score > bestKikuriSwap.score) {
                bestKikuriSwap = { donorLeader, kNonL, dCode, kCode, score };
              }
            });
          });

          if (bestKikuriSwap) {
            ns[bestKikuriSwap.donorLeader.id][d] = bestKikuriSwap.kCode;
            ns[bestKikuriSwap.kNonL.id][d] = bestKikuriSwap.dCode;
            changedCount++;
          }
        });
    }

    return { nextShifts: ns, changedCount };
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

  const currentMonthCalendarWeeks = useMemo(() => {
    const totalDays = getDaysInMonth(year, month);
    const weeks = [];
    let curDays = [];
    for (let d = 1; d <= totalDays; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (dow === 0) {
        if (curDays.length > 0) {
          weeks.push({
            weekIndex: weeks.length + 1,
            label:
              curDays.length === 1
                ? `${month}/${curDays[0]}`
                : `${month}/${curDays[0]}〜${month}/${curDays[curDays.length - 1]}`,
            days: curDays,
            isFullWeek: curDays.length === 6,
          });
          curDays = [];
        }
      } else {
        curDays.push(d);
      }
    }
    if (curDays.length > 0) {
      weeks.push({
        weekIndex: weeks.length + 1,
        label:
          curDays.length === 1
            ? `${month}/${curDays[0]}`
            : `${month}/${curDays[0]}〜${month}/${curDays[curDays.length - 1]}`,
        days: curDays,
        isFullWeek: curDays.length === 6,
      });
    }
    return weeks;
  }, [year, month]);

  useEffect(() => {
    setSelectedAutoFillWeeks(currentMonthCalendarWeeks.map(w => w.weekIndex));
    setAutoFillTargetMode('all');
    setValidationScopeDays(null);
    setValidationScopeLabel('');
    setSelectedDailyViewDay(prev => Math.max(1, Math.min(getDaysInMonth(year, month), prev || 1)));
  }, [currentMonthCalendarWeeks, year, month]);

  const toggleAutoFillWeekSelection = (weekIndex) => {
    if (autoFillTargetMode === 'all') {
      setAutoFillTargetMode('weeks');
      setSelectedAutoFillWeeks([weekIndex]);
      return;
    }
    setSelectedAutoFillWeeks(prev => {
      const next = prev.includes(weekIndex) ? prev.filter(w => w !== weekIndex) : [...prev, weekIndex];
      return [...next].sort((a, b) => a - b);
    });
  };

  // ワンタップ自動作成
  const handleOpenAutoFill = () => {
    setShowAutoFillModal(true);
  };

  // 進捗モニター用の時間フォーマッタ＆実測ハイブリッド残り時間予測
  const formatElapsedMmSs = (sec) => {
    const safeSec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(safeSec / 60);
    const s = safeSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const computeRemainingStatusText = (timing) => {
    if (!timing || !timing.startTimeMs) return '計算中...';
    const now = Date.now();
    const stepElapsedSec = Math.max(0, (now - (timing.currentStepStartMs || now)) / 1000);
    const avgWeekSec =
      timing.completedBuildWeeks > 0
        ? timing.completedBuildMs / 1000 / timing.completedBuildWeeks
        : timing.baseSecPerWeek;

    let estRemSec = 0;
    if (timing.phase === 'init') {
      estRemSec = timing.isParallel
        ? Math.round(avgWeekSec * 1.4) + 6
        : Math.max(1, timing.totalBuildWeeks) * avgWeekSec + 8;
    } else if (timing.phase === 'building') {
      if (timing.isParallel) {
        const buildElapsedSec = Math.max(0, (now - (timing.buildStartMs || timing.currentStepStartMs || now)) / 1000);
        const estParallelTotal = Math.max(12, Math.round((timing.baseSecPerWeek || avgWeekSec) * 1.45));
        const remRatio = Math.max(0.15, (timing.totalBuildWeeks - timing.completedBuildWeeks) / Math.max(1, timing.totalBuildWeeks));
        estRemSec = Math.max(4, Math.round(Math.max(4, estParallelTotal - buildElapsedSec) * (0.45 + 0.55 * remRatio))) + 5;
      } else {
        const currentWeekRem = Math.max(4, avgWeekSec - stepElapsedSec);
        const futureWeeksCount = Math.max(0, timing.totalBuildWeeks - timing.completedBuildWeeks - 1);
        const postCheckBuffer = Math.max(5, Math.round(avgWeekSec * 0.5));
        estRemSec = currentWeekRem + futureWeeksCount * avgWeekSec + postCheckBuffer;
      }
    } else if (timing.phase === 'validating') {
      estRemSec = 4;
    } else if (timing.phase === 'repairing') {
      const estRepairTotal = Math.max(12, Math.round(avgWeekSec * 1.35));
      estRemSec = Math.max(4, estRepairTotal - stepElapsedSec);
    } else if (timing.phase === 'saving' || timing.phase === 'done') {
      return 'まもなく完了...';
    }

    if (estRemSec <= 5) return 'まもなく完了...';
    if (estRemSec <= 12) return 'あと約10秒';
    const rounded5 = Math.ceil(estRemSec / 5) * 5;
    if (rounded5 < 60) {
      return `あと約${rounded5}秒`;
    }
    const mins = Math.floor(rounded5 / 60);
    const secs = rounded5 % 60;
    return secs === 0 ? `あと約${mins}分` : `あと約${mins}分${secs}秒`;
  };

  // 進捗モニターからの安全な途中中断（作成開始前の状態へ即時ロールバック）
  const handleCancelAutoFill = () => {
    autoFillCancelRef.current = true;
    autoFillRunIdRef.current += 1;
    isAutoFillRunningRef.current = false;

    if (autoFillBackupRef.current) {
      setShiftData(autoFillBackupRef.current.shifts);
      setTaskData(autoFillBackupRef.current.tasks);
      setUserInputs(autoFillBackupRef.current.userInputs);
    }

    setConfirmingCancelAutoFill(false);
    setIsMonitorMinimized(false);
    setIsAiLoading(false);
    setAiLoadingMessage('');
    setAiLoadingSubDetail('');
    setLastLiveFilledWeekLabel('');
  };

  const executeAutoFill = async () => {
    if (autoFillTargetMode === 'weeks' && selectedAutoFillWeeks.length === 0) {
      alert('作成する週を1つ以上選択してください。');
      return;
    }
    const currentRunId = ++autoFillRunIdRef.current;
    autoFillCancelRef.current = false;
    isAutoFillRunningRef.current = true;

    const originalShifts = shiftData;
    const originalTasks = taskData;
    const originalUserInputs = userInputs;
    autoFillBackupRef.current = {
      shifts: originalShifts,
      tasks: originalTasks,
      userInputs: originalUserInputs,
    };

    const modelLower = String(aiModel || '').toLowerCase();
    const isProModel =
      modelLower.includes('pro') ||
      modelLower.includes('argon') ||
      modelLower.includes('carbon');
    const baseSecPerWeek = isProModel ? 24 : modelLower.includes('neon') ? 15 : 10;
    const startedAtMs = Date.now();
    autoFillTimingRef.current = {
      startTimeMs: startedAtMs,
      phase: 'init',
      isParallel: false,
      buildStartMs: startedAtMs,
      totalBuildWeeks: 4,
      completedBuildWeeks: 0,
      completedBuildMs: 0,
      currentStepStartMs: startedAtMs,
      baseSecPerWeek,
    };

    setShowAutoFillModal(false);
    setConfirmingCancelAutoFill(false);
    setIsMonitorMinimized(false);
    setLastLiveFilledWeekLabel('');
    setIsAiLoading(true);
    setAiProgress(2);
    setAiElapsedSec(0);
    setAiRemainingText(isProModel ? 'あと約1分30秒' : 'あと約45秒');
    setAiLoadingMessage('勤務表データを事前分析中...');
    setAiLoadingSubDetail('前月末からの連勤引き継ぎ・希望休・各班固定枠・目標人数を集計しています');
    setAutoFillValidationSummary(null);
    setAutoFillSteps([
      {
        id: 'prep',
        label: '事前分析（前月末引き継ぎ・希望休・各班固定の集計）',
        status: 'active',
        detail: '集計中...',
      },
    ]);

    const isRunActive = () => !autoFillCancelRef.current && autoFillRunIdRef.current === currentRunId;

    const updateStepItem = (stepId, patch) => {
      setAutoFillSteps(prev => prev.map(st => (st.id === stepId ? { ...st, ...patch } : st)));
    };

    let progressCeiling = 12;

    const progressInterval = setInterval(() => {
      if (!isRunActive()) return;
      setAiProgress(prev => (prev >= progressCeiling ? prev : prev + 1));
    }, 700);

    const timerInterval = setInterval(() => {
      if (!isRunActive()) return;
      const now = Date.now();
      setAiElapsedSec(Math.floor((now - startedAtMs) / 1000));
      setAiRemainingText(computeRemainingStatusText(autoFillTimingRef.current));
    }, 1000);

    const stopAllIntervalsAndRollback = () => {
      clearInterval(progressInterval);
      clearInterval(timerInterval);
      if (autoFillRunIdRef.current === currentRunId) {
        isAutoFillRunningRef.current = false;
        setShiftData(originalShifts);
        setTaskData(originalTasks);
        setUserInputs(originalUserInputs);
        setIsAiLoading(false);
        setAiLoadingMessage('');
        setAiLoadingSubDetail('');
        setConfirmingCancelAutoFill(false);
      }
    };

    try {
      const initialData = prepareScheduleDataForAi(originalShifts, originalTasks, { includeTasks: false });
      const calendarWeeks = initialData.calendarWeeks || [];
      const cool3Codes = initialData.cool3ShiftCodes || [];
      const cool3DescStr = cool3Codes.length > 0
        ? cool3Codes.map(c => (shiftDefs[c] ? `表示名「${shiftDefs[c].label}」(コード:"${c}")` : `コード:"${c}"`)).join('・')
        : '設定なし';
      const cool3Set = new Set(cool3Codes);
      const meShiftDescList = Object.values(shiftDefs)
        .filter(sd => sd && isMeRoomShiftCode(sd.code))
        .map(sd => `表示名「${sd.label}」(コード:"${sd.code}")`);
      const meShiftDescStr = meShiftDescList.length > 0 ? meShiftDescList.join('・') : 'ME室カテゴリのシフト';
      const maxStreak = initialData.pacingRules?.maxConsecutiveWorkDays || 5;
      const skillReqLines = Object.values(initialData.facilitySkillRequirements || {}).map(fReq => {
        const parts = Object.values(fReq.requiredSkills || {}).map(sr => `${sr.label}${sr.minCount}名以上`);
        return `${fReq.facilityLabel}: ${parts.join('・')}`;
      });
      const skillReqSummaryText = skillReqLines.length > 0 ? skillReqLines.join(' ／ ') : '設定なし';
      const powerTargetEntries = Object.entries(initialData.facilityPowerTargets || {});
      const powerScoreSummaryText = powerTargetEntries.length > 0
        ? powerTargetEntries
            .map(([catId, fp]) =>
              fp.targetPowerScore > 0
                ? `${fp.facilityLabel}(${catId}): 当日平均×人数で均等化`
                : `${fp.facilityLabel}(${catId}): スコア判定なし`
            )
            .join(' ／ ')
        : '設定なし';
      const shiftSystemRefText = buildShiftSystemReferenceText(shiftDefs, categoryDefs, adminSettings, { includeTasks: false });
      const systemInstruction = "あなたは臨床工学技士のシフト作成の専門家です。提供された現在のシステム設定（シフトコード・表示名・勤務区分・カテゴリ設定）と条件をもとに、可能な範囲でシフトを組んでください。画面上の表示名（例: A）とデータ上のシフトコード（例: 1）が異なる設定の場合があるため、必ず対応表を確認し、JSONにはシフトコードを出力してください。完璧にすべての必要人数をAI対象スタッフだけで100%埋めきる必要はありません。足りない枠はAI除外のパート職員や管理者の手動調整であとから補う運用のため、個人の週休確保（空欄公休）・最大連勤制限・3クール制限・希望休・配置制限を最優先し、人数が足りない日は無理に休みを潰さず不足のまま残してください。名簿の上から機械的にAAAA, FFFFのように同じシフト・施設を固めて並べたり、同じ職員を連日同じ施設に固定することは避け、複数施設に入れる職員は日ごとに勤務地・クールをバラけてローテーションさせ、月間の勤務地の偏りが少なくなるように組んでください。休みの日は空欄のまま残す仕様のため、全ての空欄を出勤で埋め尽くしてはいけません。出力は必ず指定されたJSON形式のみとし、JSONの枠外には絶対に文章を書かないでください。";

      const strictConditions = autoFillConditions
        .filter(c => c.active && c.priority !== 'soft')
        .map((c, index) => `${index + 1}. [絶対] ${c.text}`)
        .join("\n");
      const softConditions = autoFillConditions
        .filter(c => c.active && c.priority === 'soft')
        .map((c, index) => `${index + 1}. [なるべく] ${c.text}`)
        .join("\n");

      const isPaidLeaveCode = (code) => {
        if (!code || !shiftDefs[code]) return false;
        return isPaidLeaveShiftDef(shiftDefs[code], categoryDefs);
      };

      let workingShifts = { ...originalShifts };
      let workingTasks = { ...originalTasks };
      let workingUserInputs = { ...userInputs };
      Object.keys(userInputs).forEach(sId => {
        Object.keys(userInputs[sId] || {}).forEach(d => {
          if (userInputs[sId][d] === true) {
            workingUserInputs[sId] = { ...(workingUserInputs[sId] || {}) };
            workingUserInputs[sId][d] = normalizeUserInputEntry(true, originalShifts[sId]?.[d], originalTasks[sId]?.[d]);
          }
        });
      });

      // Step 7 (案B): 第1週→最終週のうち、選択された対象週かつ未ロック空欄があり配置が必要な週を特定して順番に段階ビルド
      const isFullMonthTarget =
        autoFillTargetMode === 'all' || selectedAutoFillWeeks.length >= calendarWeeks.length;
      const targetWeekIndexSet = isFullMonthTarget
        ? new Set(calendarWeeks.map(w => w.weekIndex))
        : new Set(selectedAutoFillWeeks);
      const targetScopeDaysSet = isFullMonthTarget
        ? null
        : new Set(
            calendarWeeks
              .filter(w => targetWeekIndexSet.has(w.weekIndex))
              .flatMap(w => w.days)
          );
      const targetScopeLabel = isFullMonthTarget
        ? ''
        : selectedAutoFillWeeks.map(w => `第${w}週`).join('・');

      const weeksToBuild = calendarWeeks.filter(w => {
        if (!targetWeekIndexSet.has(w.weekIndex)) return false;
        const hasAssignableCell = staffList.some(
          s =>
            !s.excludeFromAi &&
            w.days.some(
              d =>
                !workingShifts[s.id]?.[d] &&
                !getUserRequestedShift(s.id, d) &&
                !getTeamLockedShiftSource(s.id, d, originalShifts)
            )
        );
        if (!hasAssignableCell) return false;

        return w.days.some(d => {
          const sum = initialData.dailySummary?.[d];
          if (!sum) return false;
          if (sum.workingCount === 0) return true;
          return Object.keys(targetCounts || {}).some(code => {
            if (!isAiAssignableFacilityShiftDef(code, shiftDefs, categoryDefs)) return false;
            const target = getTargetCount(code, d);
            if (target <= 0) return false;
            const actual = staffList.filter(st => workingShifts[st.id]?.[d] === code).length;
            return actual < target;
          });
        });
      });

      const buildWeekIdxSet = new Set(weeksToBuild.map(w => w.weekIndex));
      const buildStartAtMs = Date.now();
      autoFillTimingRef.current = {
        ...autoFillTimingRef.current,
        phase: weeksToBuild.length > 0 ? 'building' : 'validating',
        isParallel: false,
        buildStartMs: buildStartAtMs,
        totalBuildWeeks: weeksToBuild.length,
        completedBuildWeeks: 0,
        completedBuildMs: 0,
        currentStepStartMs: buildStartAtMs,
      };
      setAiRemainingText(computeRemainingStatusText(autoFillTimingRef.current));

      setAutoFillSteps([
        {
          id: 'prep',
          label: '事前分析（前月末引き継ぎ・希望休・各班固定・目標人数の集計）',
          status: 'done',
          detail: '完了',
        },
        ...calendarWeeks.map(w => ({
          id: `week_${w.weekIndex}`,
          label: `第${w.weekIndex}週（${w.label}）のシフト作成`,
          status: buildWeekIdxSet.has(w.weekIndex) ? 'pending' : 'skipped',
          detail: !targetWeekIndexSet.has(w.weekIndex)
            ? '未選択（スキップ）'
            : buildWeekIdxSet.has(w.weekIndex)
              ? '待機中'
              : '入力済み（スキップ）',
        })),
        {
          id: 'validate',
          label: isFullMonthTarget
            ? '1ヶ月通し検算（連勤・週休・リーダー・人数チェック）'
            : `作成週（${targetScopeLabel}）の検算チェック`,
          status: 'pending',
          detail: '待機中',
        },
        {
          id: 'finish',
          label: '最終調整（必要時のみ自動手直し）＆ 保存',
          status: 'pending',
          detail: '待機中',
        },
      ]);

      const totalDaysInMonth = getDaysInMonth(year, month);
      let totalUpdatedCells = 0;
      const weekErrors = [];

      const facilityCatsInBuild = Object.values(categoryDefs)
        .filter(cat => cat && resolveCategoryKind(cat) === 'facility');

      const wouldWeekWorkExceedStreak = (targetWeekDays, stEntry, blankSet) => {
        let streak = stEntry.thisWeekPlan.enteringWorkStreak || 0;
        for (const d of targetWeekDays) {
          const exCode = stEntry.thisWeekPlan.existingShiftsInThisWeek?.[d];
          if (exCode && shiftDefs[exCode]) {
            const exDef = shiftDefs[exCode];
            if (getEffectiveShiftType(exDef, categoryDefs) === 'shift' && !isNonWorkOrKoushutsuShiftDef(exDef, categoryDefs)) {
              streak++;
              if (streak > maxStreak) return true;
            } else {
              streak = 0;
            }
          } else if (!stEntry.excludeFromAi && stEntry.thisWeekPlan.assignableDaysInThisWeek.includes(d) && !blankSet.has(d)) {
            streak++;
            if (streak > maxStreak) return true;
          } else {
            streak = 0;
          }
        }
        return false;
      };

      // 第1週→最終週へ順番にビルドし、前週までの「実際の施設回数・クール区分回数・3クール消化実績・直近施設」を次週へ正確に引き継ぐ
      for (let wIdx = 0; wIdx < weeksToBuild.length; wIdx++) {
        if (!isRunActive()) break;

        const targetWeek = weeksToBuild[wIdx];
        const remainingBuildWeeksCount = Math.max(1, weeksToBuild.length - wIdx);
        const weekStepId = `week_${targetWeek.weekIndex}`;
        const firstDay = targetWeek.days[0];
        const lastDay = targetWeek.days[targetWeek.days.length - 1];
        const allowedWeekDaysSet = new Set(targetWeek.days);

        const weekStartedMs = Date.now();
        autoFillTimingRef.current = {
          ...autoFillTimingRef.current,
          phase: 'building',
          currentStepStartMs: weekStartedMs,
        };
        progressCeiling = Math.min(80, Math.round(10 + ((wIdx + 0.85) / Math.max(1, weeksToBuild.length)) * 70));
        setAiProgress(prev => Math.max(prev, Math.round(8 + (wIdx / Math.max(1, weeksToBuild.length)) * 70)));
        updateStepItem(weekStepId, { status: 'active', detail: 'AI作成中...' });
        setAiLoadingMessage(
          `第${targetWeek.weekIndex}週（${targetWeek.label}）のシフトを作成中... (${wIdx + 1}/${weeksToBuild.length}週)`
        );
        setAiLoadingSubDetail(
          wIdx === 0
            ? `前月末引き継ぎ・希望休・必要人数・${skillReqSummaryText}を踏まえて第1週を配置しています`
            : '前週までの実際の施設・シフト回数と3クール実績を引き継ぎ、偏りなくローテーション配置しています'
        );
        setAiRemainingText(computeRemainingStatusText(autoFillTimingRef.current));

        // 前週までの確定済み workingShifts から最新の累積統計を再計算
        const liveData = prepareScheduleDataForAi(workingShifts, workingTasks, { includeTasks: false });

        const weekCalendar = {};
        const weekDailySummary = {};
        const exactTargetCountsByDay = {};
        targetWeek.days.forEach(d => {
          weekCalendar[d] = liveData.calendar[d];
          weekDailySummary[d] = liveData.dailySummary[d];
          const dayTargets = {};
          Object.keys(targetCounts || {}).forEach(code => {
            if (!isAiAssignableFacilityShiftDef(code, shiftDefs, categoryDefs)) return;
            const t = getTargetCount(code, d);
            if (t > 0) dayTargets[code] = t;
          });
          exactTargetCountsByDay[d] = dayTargets;
        });

        const staffRequestsInWeek = {};
        const teamAdminLocksInWeek = {};
        Object.keys(liveData.staffRequests || {}).forEach(sId => {
          const filtered = {};
          targetWeek.days.forEach(d => {
            if (liveData.staffRequests[sId]?.[d]) filtered[d] = liveData.staffRequests[sId][d];
          });
          if (Object.keys(filtered).length > 0) staffRequestsInWeek[sId] = filtered;
        });
        Object.keys(liveData.teamAdminLocks || {}).forEach(sId => {
          const filtered = {};
          targetWeek.days.forEach(d => {
            if (liveData.teamAdminLocks[sId]?.[d]) filtered[d] = liveData.teamAdminLocks[sId][d];
          });
          if (Object.keys(filtered).length > 0) teamAdminLocksInWeek[sId] = filtered;
        });

        const baseStaffById = {};
        const weeklyStaffList = liveData.staff.map(st => {
          baseStaffById[st.id] = st;
          const enteringWorkStreak = firstDay === 1 ? (st.prevMonthCarryOver?.trailingWorkStreak || 0) : 0;
          const forbidCool3OnFirstDay = firstDay === 1 ? Boolean(st.prevMonthCarryOver?.forbidCool3OnDay1) : false;

          let enteringLastFacilityId = null;
          let enteringLastFacilityLabel = null;
          let enteringLastShiftCode = null;
          if (firstDay === 1) {
            enteringLastFacilityId = st.prevMonthCarryOver?.prevLastDayCategory || null;
            enteringLastFacilityLabel = st.prevMonthCarryOver?.prevLastDayFacilityLabel || null;
            enteringLastShiftCode = st.prevMonthCarryOver?.prevLastDayCode || null;
          } else {
            for (let cursor = firstDay - 1; cursor >= 1; cursor--) {
              if (isSunday(year, month, cursor)) continue;
              const pCode = workingShifts[st.id]?.[cursor];
              if (!pCode || !shiftDefs[pCode]) continue;
              const pDef = shiftDefs[pCode];
              if (isNonWorkOrKoushutsuShiftDef(pDef, categoryDefs)) continue;
              if (getCategoryKindById(pDef.category, categoryDefs) === 'facility') {
                enteringLastFacilityId = pDef.category;
                enteringLastFacilityLabel = categoryDefs[pDef.category]?.label || pDef.category;
                enteringLastShiftCode = pCode;
                break;
              }
            }
          }

          const shiftSlotCountsSoFar = { cool3: 0, cool2: 0, day: 0, half: 0, other: 0 };
          for (let cursor = 1; cursor < firstDay; cursor++) {
            if (isSunday(year, month, cursor)) continue;
            const c = workingShifts[st.id]?.[cursor];
            if (!c || !shiftDefs[c] || !isAiAssignableFacilityShiftDef(c, shiftDefs, categoryDefs)) continue;
            const slot = resolveShiftWorkSlot(shiftDefs[c], categoryDefs) || 'other';
            shiftSlotCountsSoFar[slot] = (shiftSlotCountsSoFar[slot] || 0) + 1;
          }

          const existingShiftsInThisWeek = {};
          const lockedBlankOffDaysInThisWeek = [];
          const assignableDaysInThisWeek = [];
          let regOffInThisWeek = 0;
          let paidOffInThisWeek = 0;

          targetWeek.days.forEach(d => {
            const code = workingShifts[st.id]?.[d];
            const reqShift = getUserRequestedShift(st.id, d);
            const teamLock = getTeamLockedShiftSource(st.id, d, originalShifts);

            if (code && shiftDefs[code]) {
              existingShiftsInThisWeek[d] = code;
              if (isNonWorkOrKoushutsuShiftDef(shiftDefs[code], categoryDefs)) {
                if (isPaidLeaveCode(code)) paidOffInThisWeek++;
                else regOffInThisWeek++;
              }
            } else if (reqShift || teamLock) {
              lockedBlankOffDaysInThisWeek.push(d);
              if (reqShift && shiftDefs[reqShift] && isNonWorkOrKoushutsuShiftDef(shiftDefs[reqShift], categoryDefs)) {
                if (isPaidLeaveCode(reqShift)) paidOffInThisWeek++;
                else regOffInThisWeek++;
              }
            } else if (!st.excludeFromAi) {
              assignableDaysInThisWeek.push(d);
            }
          });

          const holidayAssignableDaysInThisWeek = assignableDaysInThisWeek.filter(d => weekCalendar[d]?.isHoliday);
          let mustKeepBlankDaysMinInThisWeek = 0;
          let maxOptionalBlanksInThisWeek = 0;
          let recommendedNewWorkDaysInThisWeek = '0日';

          const existingWorkInThisWeek = Object.values(existingShiftsInThisWeek).filter(
            c => c && shiftDefs[c] && getEffectiveShiftType(shiftDefs[c], categoryDefs) === 'shift' && !isNonWorkOrKoushutsuShiftDef(shiftDefs[c], categoryDefs)
          ).length;

          const stPartContractRange = getPartTimeWeeklyContractRange(st);
          if (st.excludeFromAi || assignableDaysInThisWeek.length === 0) {
            mustKeepBlankDaysMinInThisWeek = 0;
            maxOptionalBlanksInThisWeek = 0;
            recommendedNewWorkDaysInThisWeek = '0日（変更不可）';
          } else if (st.jobTitle === 'パート' && stPartContractRange) {
            const wMin = stPartContractRange.min;
            const wMax = stPartContractRange.max;
            const streakNeedsOff =
              enteringWorkStreak + targetWeek.days.length > maxStreak && regOffInThisWeek + paidOffInThisWeek === 0;
            const capByStreak = Math.max(0, assignableDaysInThisWeek.length - (streakNeedsOff ? 1 : 0));
            const maxAllowedNew = Math.max(0, Math.min(targetWeek.days.length, wMax) - existingWorkInThisWeek);
            const minRequiredNew = targetWeek.isFullWeek
              ? Math.max(0, Math.min(targetWeek.days.length, wMin) - existingWorkInThisWeek)
              : 0;
            const recMax = Math.min(assignableDaysInThisWeek.length, capByStreak, maxAllowedNew);
            const recMin = Math.min(recMax, minRequiredNew);
            mustKeepBlankDaysMinInThisWeek = Math.max(streakNeedsOff ? 1 : 0, assignableDaysInThisWeek.length - recMax);
            maxOptionalBlanksInThisWeek = Math.max(mustKeepBlankDaysMinInThisWeek, assignableDaysInThisWeek.length - recMin);
            const rangeLbl = wMin === wMax ? `週${wMin}日` : `週${wMin}〜${wMax}日`;
            recommendedNewWorkDaysInThisWeek =
              recMin === recMax
                ? `${recMax}日（★絶対厳守：パート契約 ${rangeLbl}★）`
                : `${recMin}〜${recMax}日（★絶対厳守：パート契約 ${rangeLbl}★）`;
          } else if (st.jobTitle === 'パート') {
            const streakNeedsOff =
              enteringWorkStreak + targetWeek.days.length > maxStreak && regOffInThisWeek + paidOffInThisWeek === 0;
            mustKeepBlankDaysMinInThisWeek = streakNeedsOff ? 1 : 0;
            maxOptionalBlanksInThisWeek = assignableDaysInThisWeek.length;
            const maxNew = Math.max(0, assignableDaysInThisWeek.length - mustKeepBlankDaysMinInThisWeek);
            recommendedNewWorkDaysInThisWeek = `0〜${maxNew}日（パート条件・必要人数に応じて配置）`;
          } else if (targetWeek.isFullWeek) {
            mustKeepBlankDaysMinInThisWeek = regOffInThisWeek === 0 ? 1 : 0;
            maxOptionalBlanksInThisWeek = mustKeepBlankDaysMinInThisWeek;
            const recWork = Math.max(0, assignableDaysInThisWeek.length - mustKeepBlankDaysMinInThisWeek);
            if (holidayAssignableDaysInThisWeek.length > 0 && regOffInThisWeek + paidOffInThisWeek >= 1) {
              const minWorkWithHolidayOff = Math.max(0, recWork - holidayAssignableDaysInThisWeek.length);
              maxOptionalBlanksInThisWeek = Math.max(mustKeepBlankDaysMinInThisWeek, assignableDaysInThisWeek.length - minWorkWithHolidayOff);
              recommendedNewWorkDaysInThisWeek =
                minWorkWithHolidayOff === recWork
                  ? `${recWork}日`
                  : `${minWorkWithHolidayOff}〜${recWork}日（祝日に余剰があれば空欄休み可、人数が必要なら出勤）`;
            } else if (holidayAssignableDaysInThisWeek.length > 1 && regOffInThisWeek === 0) {
              const minWorkWithMultiHolOff = Math.max(0, assignableDaysInThisWeek.length - holidayAssignableDaysInThisWeek.length);
              maxOptionalBlanksInThisWeek = Math.max(mustKeepBlankDaysMinInThisWeek, assignableDaysInThisWeek.length - minWorkWithMultiHolOff);
              recommendedNewWorkDaysInThisWeek =
                minWorkWithMultiHolOff === recWork
                  ? `${recWork}日`
                  : `${minWorkWithMultiHolOff}〜${recWork}日（祝日の空欄は週休枠としてカウント）`;
            } else {
              recommendedNewWorkDaysInThisWeek = `${recWork}日`;
            }
          } else if (targetWeek.weekIndex === 1) {
            const prevCarry = st.prevMonthCarryOver || {};
            const streakNeedsOff =
              enteringWorkStreak + targetWeek.days.length > maxStreak && regOffInThisWeek + paidOffInThisWeek === 0;
            const straddleNeedsOff =
              prevMonthCarryOver.hasStraddlingWeek &&
              prevCarry.hasPrevSchedule &&
              !prevCarry.alreadyTookWeeklyOffInPrevMonthPart &&
              regOffInThisWeek === 0;
            mustKeepBlankDaysMinInThisWeek = streakNeedsOff || straddleNeedsOff ? 1 : 0;
            maxOptionalBlanksInThisWeek = prevCarry.hasPrevSchedule
              ? mustKeepBlankDaysMinInThisWeek
              : Math.min(assignableDaysInThisWeek.length, mustKeepBlankDaysMinInThisWeek + 1);
            const maxNew = Math.max(0, assignableDaysInThisWeek.length - mustKeepBlankDaysMinInThisWeek);
            recommendedNewWorkDaysInThisWeek = prevCarry.hasPrevSchedule
              ? `${maxNew}日`
              : maxNew > 0
                ? `${Math.max(0, maxNew - 1)}〜${maxNew}日（必要人数を満たすよう優先配置）`
                : '0日';
          } else {
            // 案2: 月末などの端数週では、連勤超過の恐れがない限り「強制空欄」にはせず、人数に余剰(surplus>0)がある日だけ公休を入れることで未入力穴を防ぐ
            const workSoFar = st.currentStats?.workDays || 0;
            const remMin = Math.max(0, (st.currentStats?.targetWorkDaysMin ?? 0) - workSoFar);
            const streakNeedsOff =
              enteringWorkStreak + targetWeek.days.length > maxStreak && regOffInThisWeek + paidOffInThisWeek === 0;
            mustKeepBlankDaysMinInThisWeek = streakNeedsOff ? 1 : 0;
            const capMax = Math.max(0, assignableDaysInThisWeek.length - mustKeepBlankDaysMinInThisWeek);
            const recMin = Math.min(capMax, remMin);
            maxOptionalBlanksInThisWeek = Math.max(mustKeepBlankDaysMinInThisWeek, assignableDaysInThisWeek.length - recMin);
            recommendedNewWorkDaysInThisWeek =
              recMin === capMax
                ? `${capMax}日`
                : `${recMin}〜${capMax}日（必要人数を満たすことを優先し、余剰日のみ空欄休み）`;
          }

          const futurePreEnteredShifts = {};
          for (let d = lastDay + 1; d <= totalDaysInMonth; d++) {
            const fCode = workingShifts[st.id]?.[d];
            const fReq = getUserRequestedShift(st.id, d);
            if (fCode) futurePreEnteredShifts[d] = fCode;
            else if (fReq) futurePreEnteredShifts[d] = `(希望空欄:${fReq})`;
          }

          const staffEntry = {
            id: st.id,
            name: st.name,
            jobTitle: st.jobTitle,
            roles: st.roles,
            skills: st.skills,
            powerScore: st.powerScore,
            minCool3: st.minCool3 ?? 0,
            maxCool3: st.maxCool3,
            ...(stPartContractRange
              ? {
                  contractWorkDaysMin: stPartContractRange.min,
                  contractWorkDaysMax: stPartContractRange.max,
                }
              : {}),
            excludeFromAi: st.excludeFromAi,
            allowedWorkShifts: st.allowedWorkShifts,
            ...(allowedWeekDaysSet.has(1) ? { day1AllowedWorkShifts: st.day1AllowedWorkShifts } : {}),
            ...(targetWeek.weekIndex === 1 ? { prevMonthCarryOver: st.prevMonthCarryOver } : {}),
            _enteringLastFacilityId: enteringLastFacilityId,
            _enteringLastFacilityLabel: enteringLastFacilityLabel,
            _enteringLastShiftCode: enteringLastShiftCode,
            _forbidCool3OnFirstDay: forbidCool3OnFirstDay,
            _maxOptionalBlanksInThisWeek: maxOptionalBlanksInThisWeek,
            cumulativeStatsSoFar: {
              workDaysInMonthSoFar: st.currentStats.workDays,
              targetMonthlyWorkDaysRange: st.currentStats.targetWorkDaysRange,
              facilityCountsSoFar: { ...st.currentStats.facilityCounts },
              shiftSlotCountsSoFar,
              cool3CountSoFar: st.currentStats.cool3Count,
              remainingCool3: st.currentStats.remainingCool3,
              remainingMinCool3Needed: st.currentStats.remainingMinCool3Needed,
              overtimeHoursSoFar: st.currentStats.overtimeHours,
            },
            thisWeekPlan: {
              existingShiftsInThisWeek,
              lockedBlankOffDaysInThisWeek,
              assignableDaysInThisWeek,
              enteringWorkStreak,
              maxAllowedConsecutiveFromWeekStart: Math.max(0, maxStreak - enteringWorkStreak),
              forbidCool3OnFirstDayOfWeek: forbidCool3OnFirstDay,
              mustKeepBlankDaysMinInThisWeek,
              recommendedNewWorkDaysInThisWeek,
            },
          };

          if (Object.keys(futurePreEnteredShifts).length > 0) {
            staffEntry.futurePreEnteredShifts = futurePreEnteredShifts;
          }
          return staffEntry;
        });

        // 今週の公休(空欄休み)を日別の必要人数・リーダー数に応じてフラット事前配分
        const dailyTargetFacilityTotal = {};
        const dailyRequiredLeaders = {};
        const dailyPlannedWorking = {};
        const dailyPlannedLeaders = {};

        targetWeek.days.forEach(d => {
          const dayTargets = exactTargetCountsByDay[d] || {};
          dailyTargetFacilityTotal[d] = Object.values(dayTargets).reduce((sum, n) => sum + (n || 0), 0);

          let reqLeaders = 0;
          facilityCatsInBuild.forEach(cat => {
            const hasActiveShiftOnDay = Object.values(shiftDefs).some(
              sd => sd && getEffectiveShiftType(sd, categoryDefs) === 'shift' && sd.category === cat.id && (dayTargets[sd.code] || 0) > 0
            );
            const hasExistingInCatOnDay = weeklyStaffList.some(st => {
              const exCode = st.thisWeekPlan.existingShiftsInThisWeek?.[d];
              return Boolean(exCode && shiftDefs[exCode]?.category === cat.id && isAiAssignableFacilityShiftDef(exCode, shiftDefs, categoryDefs));
            });
            if (hasActiveShiftOnDay || hasExistingInCatOnDay) {
              reqLeaders += getFacilitySkillTarget(cat.id, 'isLeader') || 0;
            }
          });
          dailyRequiredLeaders[d] = reqLeaders;

          let plannedW = 0;
          let plannedL = 0;
          weeklyStaffList.forEach(st => {
            const exCode = st.thisWeekPlan.existingShiftsInThisWeek?.[d];
            const worksExistingFacility = Boolean(exCode && isAiAssignableFacilityShiftDef(exCode, shiftDefs, categoryDefs));
            const assignableDay = !st.excludeFromAi && st.thisWeekPlan.assignableDaysInThisWeek.includes(d);
            if (worksExistingFacility || assignableDay) {
              plannedW++;
              if (st.skills?.isLeader) plannedL++;
            }
          });
          dailyPlannedWorking[d] = plannedW;
          dailyPlannedLeaders[d] = plannedL;
        });

        const plannedBlanksByStaffId = {};
        const staffBlankSpecs = weeklyStaffList.map(st => {
          const assignable = st.thisWeekPlan.assignableDaysInThisWeek || [];
          const minBlanks = Math.min(assignable.length, st.thisWeekPlan.mustKeepBlankDaysMinInThisWeek || 0);
          const maxBlanks = Math.min(assignable.length, Math.max(minBlanks, st._maxOptionalBlanksInThisWeek ?? minBlanks));
          plannedBlanksByStaffId[st.id] = new Set();
          return {
            st,
            minBlanks,
            maxBlanks,
            isStreakRestricted: st.thisWeekPlan.maxAllowedConsecutiveFromWeekStart < assignable.length,
          };
        });

        const mandatoryQueue = shuffleArray(staffBlankSpecs.filter(sp => sp.minBlanks > 0)).sort((a, b) => {
          if (a.isStreakRestricted !== b.isStreakRestricted) return a.isStreakRestricted ? -1 : 1;
          return a.st.thisWeekPlan.assignableDaysInThisWeek.length - b.st.thisWeekPlan.assignableDaysInThisWeek.length;
        });

        mandatoryQueue.forEach(spec => {
          const { st, minBlanks } = spec;
          const assignable = st.thisWeekPlan.assignableDaysInThisWeek || [];
          const chosen = plannedBlanksByStaffId[st.id];

          for (let step = 0; step < minBlanks; step++) {
            const remaining = assignable.filter(d => !chosen.has(d));
            if (remaining.length === 0) break;

            let candidates = remaining;
            if (step === minBlanks - 1) {
              const streakSafe = remaining.filter(d => {
                const testSet = new Set(chosen);
                testSet.add(d);
                return !wouldWeekWorkExceedStreak(targetWeek.days, st, testSet);
              });
              if (streakSafe.length > 0) candidates = streakSafe;
            } else {
              const maxAfterPick = st.thisWeekPlan.maxAllowedConsecutiveFromWeekStart || 0;
              if (chosen.size === 0 && maxAfterPick === 0 && remaining.includes(firstDay)) {
                candidates = [firstDay];
              }
            }

            let bestDay = candidates[0];
            let bestScore = -Infinity;
            candidates.forEach(d => {
              const surplus = dailyPlannedWorking[d] - dailyTargetFacilityTotal[d];
              let score = surplus * 10;
              if (weekCalendar[d]?.isHoliday && surplus >= 0) {
                score += 4;
              }
              if (st.skills?.isLeader) {
                if (dailyPlannedLeaders[d] - 1 < dailyRequiredLeaders[d]) {
                  score -= 1000;
                } else {
                  score += (dailyPlannedLeaders[d] - dailyRequiredLeaders[d]) * 2.5;
                }
              }
              score += Math.random() * 0.5;
              if (score > bestScore) {
                bestScore = score;
                bestDay = d;
              }
            });

            chosen.add(bestDay);
            dailyPlannedWorking[bestDay]--;
            if (st.skills?.isLeader) {
              dailyPlannedLeaders[bestDay]--;
            }
          }
        });

        const flexibleQueue = shuffleArray(staffBlankSpecs.filter(sp => sp.maxBlanks > sp.minBlanks));
        flexibleQueue.forEach(spec => {
          const { st, maxBlanks } = spec;
          const assignable = st.thisWeekPlan.assignableDaysInThisWeek || [];
          const chosen = plannedBlanksByStaffId[st.id];

          while (chosen.size < maxBlanks) {
            const remaining = assignable.filter(d => !chosen.has(d));
            const surplusDays = remaining.filter(d => {
              if (dailyPlannedWorking[d] - dailyTargetFacilityTotal[d] <= 0) return false;
              if (st.skills?.isLeader && dailyPlannedLeaders[d] - 1 < dailyRequiredLeaders[d]) return false;
              const testSet = new Set(chosen);
              testSet.add(d);
              return !wouldWeekWorkExceedStreak(targetWeek.days, st, testSet);
            });
            if (surplusDays.length === 0) break;

            surplusDays.sort((a, b) => {
              const sa = dailyPlannedWorking[a] - dailyTargetFacilityTotal[a];
              const sb = dailyPlannedWorking[b] - dailyTargetFacilityTotal[b];
              return sb - sa;
            });
            const pick = surplusDays[0];
            chosen.add(pick);
            dailyPlannedWorking[pick]--;
            if (st.skills?.isLeader) {
              dailyPlannedLeaders[pick]--;
            }
          }
        });

        // 実績ベースのローテーションガイド＆柔軟な3クール残り枠ペース設定
        weeklyStaffList.forEach(st => {
          const baseSt = baseStaffById[st.id];
          const blankSet = plannedBlanksByStaffId[st.id] || new Set();
          const assignable = st.thisWeekPlan.assignableDaysInThisWeek || [];
          const plannedBlankOffDaysInThisWeek = Array.from(blankSet).sort((a, b) => a - b);
          const plannedWorkDaysInThisWeek = assignable.filter(d => !blankSet.has(d));
          const plannedWorkSet = new Set(plannedWorkDaysInThisWeek);

          st.thisWeekPlan.plannedBlankOffDaysInThisWeek = plannedBlankOffDaysInThisWeek;
          st.thisWeekPlan.plannedWorkDaysInThisWeek = plannedWorkDaysInThisWeek;

          const allowedFacs = Array.isArray(baseSt?.allowedFacilities) ? baseSt.allowedFacilities : [];
          const realFacCounts = {};
          allowedFacs.forEach(fc => {
            realFacCounts[fc.id] = st.cumulativeStatsSoFar.facilityCountsSoFar?.[fc.label] || 0;
          });
          const underusedBefore = [...allowedFacs]
            .sort((a, b) => (realFacCounts[a.id] || 0) - (realFacCounts[b.id] || 0))
            .map(fc => fc.label);

          let prevFacId = st._enteringLastFacilityId;
          if (!st.excludeFromAi && allowedFacs.length >= 2 && plannedWorkDaysInThisWeek.length > 0) {
            const localSimCounts = { ...realFacCounts };
            const dailyFacilityPreferenceHint = {};
            targetWeek.days.forEach((d, idxInWeek) => {
              const existingCode = st.thisWeekPlan.existingShiftsInThisWeek?.[d];
              if (existingCode && shiftDefs[existingCode]) {
                const exDef = shiftDefs[existingCode];
                if (getCategoryKindById(exDef.category, categoryDefs) === 'facility') {
                  prevFacId = exDef.category;
                } else if (isNonWorkOrKoushutsuShiftDef(exDef, categoryDefs)) {
                  prevFacId = null;
                }
                return;
              }
              if (!plannedWorkSet.has(d)) {
                prevFacId = null;
                return;
              }
              const nextDay = targetWeek.days[idxInWeek + 1];
              const nextExistingCode = nextDay ? st.thisWeekPlan.existingShiftsInThisWeek?.[nextDay] : null;
              const nextExistingFacId =
                nextExistingCode &&
                shiftDefs[nextExistingCode] &&
                getCategoryKindById(shiftDefs[nextExistingCode].category, categoryDefs) === 'facility'
                  ? shiftDefs[nextExistingCode].category
                  : null;

              const rankedFacs = shuffleArray(allowedFacs).sort((a, b) => {
                const aSamePrev = prevFacId && a.id === prevFacId ? 1 : 0;
                const bSamePrev = prevFacId && b.id === prevFacId ? 1 : 0;
                if (aSamePrev !== bSamePrev) return aSamePrev - bSamePrev;
                const aSameNext = nextExistingFacId && a.id === nextExistingFacId ? 1 : 0;
                const bSameNext = nextExistingFacId && b.id === nextExistingFacId ? 1 : 0;
                if (aSameNext !== bSameNext) return aSameNext - bSameNext;
                return (localSimCounts[a.id] || 0) - (localSimCounts[b.id] || 0);
              });

              dailyFacilityPreferenceHint[d] = rankedFacs.map(fc => fc.label);
              const topFac = rankedFacs[0];
              if (topFac) {
                prevFacId = topFac.id;
                localSimCounts[topFac.id] = (localSimCounts[topFac.id] || 0) + 1;
              }
            });

            st.thisWeekPlan.rotationGuide = {
              enteringLastFacility: st._enteringLastFacilityLabel,
              ...(st._enteringLastShiftCode ? { enteringLastShiftCode: st._enteringLastShiftCode } : {}),
              underusedFacilitiesFirst: underusedBefore,
              dailyFacilityPreferenceHint,
            };
          }

          const hasAllowedCool3Shift = (st.allowedWorkShifts || []).some(c => cool3Set.has(c));
          const hasDay1Cool3Shift = !allowedWeekDaysSet.has(1) || (st.day1AllowedWorkShifts || []).some(c => cool3Set.has(c));
          let physicalCap = 0;
          if (!st.excludeFromAi && hasAllowedCool3Shift && plannedWorkDaysInThisWeek.length > 0) {
            let prevWasCool3 = st._forbidCool3OnFirstDay;
            targetWeek.days.forEach((d, idx) => {
              const exCode = st.thisWeekPlan.existingShiftsInThisWeek?.[d];
              if (exCode) {
                prevWasCool3 = cool3Set.has(exCode);
                return;
              }
              if (!plannedWorkSet.has(d)) {
                prevWasCool3 = false;
                return;
              }
              const nextDay = targetWeek.days[idx + 1];
              const nextExCode = nextDay ? st.thisWeekPlan.existingShiftsInThisWeek?.[nextDay] : null;
              const nextExistingIsCool3 = Boolean(nextExCode && cool3Set.has(nextExCode));
              const canCool3Today = (d !== 1 || hasDay1Cool3Shift) && !prevWasCool3 && !nextExistingIsCool3;
              if (canCool3Today) {
                physicalCap++;
                prevWasCool3 = true;
              } else {
                prevWasCool3 = false;
              }
            });
          }

          const remMaxCool3 = st.cumulativeStatsSoFar.remainingCool3;
          const remMinCool3 = st.cumulativeStatsSoFar.remainingMinCool3Needed || 0;
          const maxAllowedThisWeek =
            remMaxCool3 === null || remMaxCool3 === undefined
              ? physicalCap
              : Math.max(0, Math.min(physicalCap, remMaxCool3));
          const softPaceMin =
            remMinCool3 > 0
              ? Math.min(maxAllowedThisWeek, Math.ceil(remMinCool3 / remainingBuildWeeksCount))
              : 0;
          const softPaceMax = Math.min(
            maxAllowedThisWeek,
            Math.max(softPaceMin + 1, Math.ceil((remMaxCool3 ?? physicalCap) / remainingBuildWeeksCount) + 1)
          );

          st.thisWeekPlan.maxAllowedNewCool3InThisWeek = maxAllowedThisWeek;
          st.thisWeekPlan.recommendedNewCool3InThisWeek =
            maxAllowedThisWeek === 0
              ? '0回（月間上限到達または配置不可のため今週は0回厳守）'
              : softPaceMin > 0
                ? `目安 ${softPaceMin}〜${softPaceMax}回（月間残り上限あと${remMaxCool3}回まで可・下限達成まであと${remMinCool3}回）`
                : `目安 0〜${softPaceMax}回（月間残り上限あと${remMaxCool3 ?? physicalCap}回まで可・必要枠に応じて柔軟配置）`;

          delete st._enteringLastFacilityId;
          delete st._enteringLastFacilityLabel;
          delete st._enteringLastShiftCode;
          delete st._forbidCool3OnFirstDay;
          delete st._maxOptionalBlanksInThisWeek;
        });

        const dailyHeadcountBalancePlan = {};
        targetWeek.days.forEach(d => {
          dailyHeadcountBalancePlan[d] = {
            targetFacilityTotal: dailyTargetFacilityTotal[d],
            plannedWorkingFacility: dailyPlannedWorking[d],
            surplus: dailyPlannedWorking[d] - dailyTargetFacilityTotal[d],
            plannedLeaders: dailyPlannedLeaders[d],
            requiredLeaders: dailyRequiredLeaders[d],
          };
        });

        const shuffledWeeklyStaffList = shuffleArray(weeklyStaffList);
        const dailyShuffledStaffOrder = {};
        targetWeek.days.forEach(d => {
          dailyShuffledStaffOrder[d] = shuffleArray(
            weeklyStaffList
              .filter(st => !st.excludeFromAi && (st.thisWeekPlan.plannedWorkDaysInThisWeek || []).includes(d))
              .map(st => st.id)
          );
        });

        const weeklyPayload = {
          year,
          month,
          targetWeek: {
            weekIndex: targetWeek.weekIndex,
            totalCalendarWeeks: calendarWeeks.length,
            label: targetWeek.label,
            days: targetWeek.days,
            isFullWeek: targetWeek.isFullWeek,
            calendar: weekCalendar,
            exactTargetCountsByDay,
            dailyHeadcountBalancePlan,
            currentDailySummary: weekDailySummary,
            dailyShuffledStaffOrder,
          },
          pacingRules: liveData.pacingRules,
          categories: liveData.categories,
          facilityPowerTargets: liveData.facilityPowerTargets,
          facilitySkillRequirements: liveData.facilitySkillRequirements,
          cool3ShiftCodes: liveData.cool3ShiftCodes,
          definitions: liveData.definitions,
          staff: shuffledWeeklyStaffList,
          staffRequestsInWeek,
          teamAdminLocksInWeek,
        };

        const dailyCheckExampleLines = targetWeek.days
          .map(d => `          "${d}": "${month}/${d}のチェック: 既存シフト含め必要人数・各施設リーダー・目標スコア・施設ローテーション・週休空欄を確認"`)
          .join(',\n');

        const weekPrompt = `
      【タスク：段階的シフト作成 — 第${targetWeek.weekIndex}週（${targetWeek.label}）のシフト作成】
      第1週から順番に実績を引き継ぎながら作成しています。今回は **第${targetWeek.weekIndex}週の対象日 [${targetWeek.days.join(', ')}] のみ** について、前週までの実績（cumulativeStatsSoFar）と今週プラン（thisWeekPlan）を踏まえ、各日の必要人数と施設・シフトのバランスが良くなるよう出勤シフトを割り当ててください。
      ※対象日 [${targetWeek.days.join(', ')}] 以外の日付は絶対に出力しないでください。

      ${shiftSystemRefText}

      【基本ルール】
      1. 既存データ・各班管理者入力・個人希望の維持と活用（★絶対厳守★）:
         - 各職員の "thisWeekPlan.assignableDaysInThisWeek" に含まれる日付のみ、AIから出勤シフトを新規割り当てできます。
         - 既にシフトが入っている箇所（thisWeekPlan.existingShiftsInThisWeek）、希望休をクリアした確定空欄日（lockedBlankOffDaysInThisWeek）、"teamAdminLocksInWeek"・"staffRequestsInWeek" にある箇所は絶対に変更しないでください。
         - 既存シフトのうち、勤務施設のメンバーは人数・powerScore・保持スキル（リーダー等）・連勤数すべてに含め、ME室（${meShiftDescStr}）や「出勤」の日はその職員の連勤数・出勤日数に含めてください。一方、「公出」は業務出張扱いのため日別出勤人数・現場出勤日数・連勤数にはカウントせず、公出しか入っていない週（休み・希望休が入っていない週）は別日に1日を空欄の公休として残して現場出勤4日間とし、公出と休み（休・年休等）の両方が入っている週は残り4日間にそのまま出勤シフトを割り当ててください。
      2. AI除外・配置可能シフト制限・対象カテゴリ限定・祝日の扱い（★絶対厳守★）:
         - "excludeFromAi": true の職員は変更しない。日曜日は透析休診のため対象外。
         - 祝日および外来診療休診日（calendar[d].isHoliday: true）でも日曜日以外は透析を実施するため、各施設の必要人数（exactTargetCountsByDay）を満たすよう出勤シフトを割り当ててください。
         - AIが出力できるのは【勤務施設】カテゴリ（坂田・君津・木クリ・じんクリ等）のシフトコードのみです。ME室（${meShiftDescStr}）およびその他（出勤・公出等）はAI配置対象外です（新規出力禁止・既存変更禁止）。
         - 出勤シフトは必ずその職員の "allowedWorkShifts"（1日については "day1AllowedWorkShifts"）に含まれる【シフトコード】のみから選んでください（※表示名ではなくコード文字列を出力すること）。
      3. 今週の公休バランス計画と最大${maxStreak}連勤制限・必要人数のしっかりした充足（★重要★）:
         - 日別の出勤人数が偏らないよう、"thisWeekPlan.plannedBlankOffDaysInThisWeek"（公休候補日）と "thisWeekPlan.plannedWorkDaysInThisWeek"（出勤予定日）を事前バランス配分しています。
         - 原則として **plannedWorkDaysInThisWeek の日は漏れなく出勤シフトを割り当て**、**plannedBlankOffDaysInThisWeek は空欄（公休）のまま残してください**。ただし、特定シフトの必要人数や必須スキルが欠ける場合は、その職員の週休最低日数（mustKeepBlankDaysMinInThisWeek）・最大${maxStreak}連勤制限・パート週契約上限（contractWorkDaysMax）を絶対に破らない範囲で、同週内の出勤日と公休日を入れ替えて必要人数を満たす工夫をして構いません。
         - ★週単位の契約出勤日数（"contractWorkDaysMin"〜"contractWorkDaysMax"）が設定されているパート職員は、その契約出勤日数（下限〜上限）を【絶対厳守】してください。
      4. 3クールの人員＆リーダー最優先確保と連続3クール禁止・柔軟なペース配分（★最優先・絶対厳守★）:
         - 【3クール人員の絶対確保】3クールシフト（${cool3DescStr}）の必要人数が設定されている日は、日勤や2クール枠より**最優先で3クールの必要人数を100%満たしてください**（万一人数が足りない日でも、不足は日勤側に残し3クールは絶対に欠員させないこと）。
         - 【3クール内リーダー必須】3クールがある施設では、施設全体ではなく**「その3クール枠の中に」必ずリーダー保持者（skills.isLeader: true）を1名以上配置**してください（夜間帯のリーダー不在を防ぐため）。
         - 3クールシフトは原則として月間残り上限（"thisWeekPlan.maxAllowedNewCool3InThisWeek"）以内で、"thisWeekPlan.recommendedNewCool3InThisWeek" を目安に特定の人に固定せず柔軟に配分してください。また、同じ職員に3クールシフトを2日連続で割り当てることは絶対禁止です（"forbidCool3OnFirstDayOfWeek": true の職員には今週初日 ${firstDay}日 に3クールを入れないこと）。
      5. 施設ごとのリーダー・必須スキル確保とパワーバランス・必要人数の充足:
         - 2クールまでの施設については、**木クリに必ずリーダー保持者（skills.isLeader: true）を1名以上配置**してください（じんクリはリーダー必須ではありません）。その他の必須スキル設定【${skillReqSummaryText}】も満たすよう優先配置してください。
         - 各日のシフト別目標人数は "targetWeek.exactTargetCountsByDay" と "currentDailySummary" を参照し、出勤予定スタッフ全員を使って**空欄の取りこぼしなくバランスよく埋めてください**。
         - 出勤予定人数が必要人数合計を上回る日（dailyHeadcountBalancePlan[d].surplus > 0）は、3クール枠を必要人数以上にオーバーさせず、余剰分は各施設の日勤・2クール枠へ偏りなく分散して配置してください。
         - 各施設のパワーバランス平準化: 【${powerScoreSummaryText}】。その日に出勤するスタッフの1人あたり平均powerScoreが施設間で極端に偏らないよう、高スコア者と中堅・若手を施設間でバランスよく分散配置してください。
      6. 日ごとの勤務地・シフト種別ローテーションと偏り防止（★最重要★）:
         - 機械的な固まり配置の禁止: 名簿順で「AAAA, FFFF」のように同じ施設・同じシフトを固めたり、特定の職員を1週間ずっと同じ施設や同じ勤務区分（日勤ばかり・2クールばかり等）に張り付ける組み方は絶対にやめてください。
         - 日替わり勤務地ローテーション: 複数施設に配置可能な職員（"thisWeekPlan.rotationGuide" がある職員）は、前営業日と同じ施設（週初日は "enteringLastFacility"）が連続しないよう、**日ごとに別の施設・別のクール区分（2クール⇔日勤⇔3クール）へ自然にローテーション**させてください（"rotationGuide.dailyFacilityPreferenceHint" を積極活用）。
         - 月間の施設＆シフト種別バランス: 前週までの実績である "cumulativeStatsSoFar.facilityCountsSoFar"（施設別回数）と "cumulativeStatsSoFar.shiftSlotCountsSoFar"（クール区分別回数）を確認し、**これまでに入った回数が少ない施設・少ないクール区分へ優先配置**して、1ヶ月を通した個人の偏りを解消してください。

      【カスタム条件①：[絶対] ルール（★最優先で必ず守る条件★ ※文中のシフト名・施設名は上の対応表の表示名・区分からコードへ変換して適用すること）】
      ${strictConditions ? strictConditions : '特になし'}

      【カスタム条件②：[なるべく] ルール（努力目標・ソフト条件）】
      基本ルール・[絶対]ルール・必要人数・必須スキル・最大${maxStreak}連勤・週休確保を満たした上で可能な範囲で配慮してください。
      ${softConditions ? softConditions : '特になし'}

      【出力形式】
      必ず以下のJSONフォーマットのみを出力してください（Markdownタグ禁止）。
      対象日 [${targetWeek.days.join(', ')}] を1日ずつチェックして "dailyCheck" に記載し、今週出勤させるセルのみ "shift" に【シフトコード】で出力してください（休みの日は空欄のままにするため出力しないこと）。
      {
        "dailyCheck": {
${dailyCheckExampleLines}
        },
        "shift": {
          "職員ID": { "今週の対象日付(${firstDay}〜${lastDay})": "出勤シフトコード（※表示名ではなくコード文字列）" }
        },
        "reason": "第${targetWeek.weekIndex}週（${targetWeek.label}）の調整メモ"
      }

      【第${targetWeek.weekIndex}週のデータ】
      ${JSON.stringify(weeklyPayload)}
      `;

        let weekRaw = await callGemini(weekPrompt, systemInstruction, aiModel, { responseMimeType: 'application/json' });
        if (!isRunActive()) break;

        let weekPass = computeAiAppliedSchedule(
          weekRaw,
          workingShifts,
          workingTasks,
          originalShifts,
          originalTasks,
          false,
          allowedWeekDaysSet
        );

        if (!weekPass.parsedOk && !(typeof weekRaw === 'string' && weekRaw.startsWith('⚠️'))) {
          console.warn(`第${targetWeek.weekIndex}週の初回応答解析に失敗したため1回リトライします:`, weekPass.message);
          updateStepItem(weekStepId, { status: 'active', detail: '応答を再取得中 (1/1)...' });
          await new Promise(resolve => setTimeout(resolve, 1500));
          if (!isRunActive()) break;
          weekRaw = await callGemini(weekPrompt, systemInstruction, aiModel, { responseMimeType: 'application/json' });
          if (!isRunActive()) break;
          weekPass = computeAiAppliedSchedule(
            weekRaw,
            workingShifts,
            workingTasks,
            originalShifts,
            originalTasks,
            false,
            allowedWeekDaysSet
          );
        }

        if (!isRunActive()) break;

        const weekDurationMs = Math.max(500, Date.now() - weekStartedMs);
        const weekDurationSec = Math.max(1, Math.round(weekDurationMs / 1000));
        const completedCount = wIdx + 1;
        autoFillTimingRef.current = {
          ...autoFillTimingRef.current,
          completedBuildWeeks: completedCount,
          completedBuildMs: autoFillTimingRef.current.completedBuildMs + weekDurationMs,
          currentStepStartMs: Date.now(),
        };
        setAiRemainingText(computeRemainingStatusText(autoFillTimingRef.current));
        setAiProgress(prev => Math.max(prev, Math.min(80, Math.round(10 + (completedCount / weeksToBuild.length) * 70))));

        if (weekPass.parsedOk) {
          const weekEnforced = enforcePersonalRulesAndCool3Bounds(
            weekPass.nextShifts,
            originalShifts,
            allowedWeekDaysSet
          );
          workingShifts = weekEnforced.nextShifts;
          totalUpdatedCells += weekPass.count + weekEnforced.changedCount;

          setShiftData(workingShifts);
          setLastLiveFilledWeekLabel(
            `第${targetWeek.weekIndex}週（${targetWeek.label}）を仮反映済み（${completedCount}/${weeksToBuild.length}週完了）`
          );
          updateStepItem(weekStepId, {
            status: 'done',
            detail: weekPass.count > 0 ? `+${weekPass.count}枠配置（${weekDurationSec}秒）` : `変更なし（${weekDurationSec}秒）`,
          });
        } else {
          const rawErrText = typeof weekRaw === 'string' && weekRaw.startsWith('⚠️') ? weekRaw : weekPass.message;
          weekErrors.push(`第${targetWeek.weekIndex}週(${targetWeek.label}): ${rawErrText || '応答エラー'}`);
          updateStepItem(weekStepId, {
            status: 'done',
            detail: '後の全体検算で補完',
          });
        }
      }

      if (!isRunActive()) {
        clearInterval(progressInterval);
        clearInterval(timerInterval);
        return;
      }

      if (totalUpdatedCells === 0 && weekErrors.length > 0) {
        stopAllIntervalsAndRollback();
        alert(`AI結果の適用に失敗しました。\n理由: ${weekErrors[0]}`);
        return;
      }

      // Step 6: 全週ビルド完了後に、1ヶ月通しのプログラム厳密検算を実行
      autoFillTimingRef.current = {
        ...autoFillTimingRef.current,
        phase: 'validating',
        currentStepStartMs: Date.now(),
      };
      setAiRemainingText(computeRemainingStatusText(autoFillTimingRef.current));
      progressCeiling = 86;
      setAiProgress(prev => Math.max(prev, 82));
      setAiLoadingMessage(
        isFullMonthTarget ? '1ヶ月分の通し検算を実施中...' : `作成した週（${targetScopeLabel}）の検算を実施中...`
      );
      setAiLoadingSubDetail('最大連勤・週休ペース・3クール連続禁止・各施設リーダー配置・必要人数を検証しています');
      updateStepItem('validate', { status: 'active', detail: '検算中...' });

      const monthEnforced1 = enforcePersonalRulesAndCool3Bounds(
        workingShifts,
        originalShifts,
        targetScopeDaysSet
      );
      workingShifts = monthEnforced1.nextShifts;
      totalUpdatedCells += monthEnforced1.changedCount;
      if (monthEnforced1.changedCount > 0) {
        setShiftData(workingShifts);
      }

      const pass1Report = evaluateScheduleValidation({
        year,
        month,
        staffList,
        shiftDefs,
        categoryDefs,
        targetCounts,
        adminSettings,
        userInputs,
        prevMonthCarryOver,
        shiftsMap: workingShifts,
        lockedBaselineShifts: originalShifts,
        includeEmptyDays: true,
        scopeDaysSet: targetScopeDaysSet,
      });

      if (totalUpdatedCells === 0 && pass1Report.aiRepairableItems.length === 0) {
        stopAllIntervalsAndRollback();
        alert('変更が必要な箇所が見つかりませんでした。');
        return;
      }

      updateStepItem('validate', {
        status: 'done',
        detail:
          pass1Report.aiRepairableItems.length === 0
            ? 'クリア（手直し不要）'
            : `要調整 ${pass1Report.aiRepairableItems.length}件を検出`,
      });

      let finalShifts = workingShifts;
      let finalTasks = workingTasks;
      let finalUserInputs = workingUserInputs;
      let finalReport = pass1Report;
      let didAutoRepair = false;
      let repairedIssueCount = 0;

      // Step 6 案A: AI側で修正可能な違反・不足が検出された場合のみ、最大1回の1ヶ月横断ピンポイント自動手直しを実行（0件なら待ち時間ゼロで即完了）
      if (pass1Report.aiRepairableItems.length > 0) {
        didAutoRepair = true;
        const repairStartedMs = Date.now();
        autoFillTimingRef.current = {
          ...autoFillTimingRef.current,
          phase: 'repairing',
          currentStepStartMs: repairStartedMs,
        };
        setAiRemainingText(computeRemainingStatusText(autoFillTimingRef.current));
        progressCeiling = 96;
        setAiProgress(prev => Math.max(prev, 86));
        setAiLoadingMessage(`要調整箇所（${pass1Report.aiRepairableItems.length}件）をAIが自動手直し中... (1/1回)`);
        setAiLoadingSubDetail('他の週のバランスやロック済みセルを崩さず、連勤・リーダー偏り・人数不足をピンポイント修正しています');
        updateStepItem('finish', {
          status: 'active',
          label: `AIピンポイント自動手直し（${pass1Report.aiRepairableItems.length}件）＆ 保存`,
          detail: '手直し計算中...',
        });

        try {
          const pass1AiData = prepareScheduleDataForAi(workingShifts, workingTasks, { includeTasks: false });
          const aiEditableDaysByStaff = {};
          staffList.forEach(s => {
            if (s.excludeFromAi) return;
            const editable = [];
            for (let d = 1; d <= totalDaysInMonth; d++) {
              if (targetScopeDaysSet && !targetScopeDaysSet.has(d)) continue;
              if (isSunday(year, month, d)) continue;
              if (originalShifts[s.id]?.[d]) continue;
              if (getUserRequestedShift(s.id, d)) continue;
              if (getTeamLockedShiftSource(s.id, d, originalShifts)) continue;
              editable.push(d);
            }
            aiEditableDaysByStaff[s.id] = editable;
          });

          const repairListText = pass1Report.aiRepairableItems
            .slice(0, 25)
            .map((item, idx) => `${idx + 1}. ${item}`)
            .join('\n');

          const repairPrompt = `
          【タスク：自動検算で見つかったルール違反・不足箇所のピンポイント手直し（セルフリペア）】
          第1週から最終週まで順番に作成した仮シフトを1ヶ月通しで検算したところ、以下の違反・不足箇所が見つかりました。
          問題のない他の日程・職員のバランスは崩さず、以下の指摘事項を解消するための「修正差分のみ」をJSONで出力してください。

          ${shiftSystemRefText}

          【検算で検出された要修正リスト】
          ${repairListText}

          【手直し時の厳守ルール】
          1. 変更してよいセル: 各職員の "aiEditableDaysByStaff" に含まれる日付のみ変更・入れ替え・空欄戻し（null）が可能です。個人入力（staffRequests）・各班管理者固定（teamAdminLocks）・当初からの既存シフト・ME室（${meShiftDescStr}）・その他（出勤・公出等）・日曜日は絶対に変更・新規出力しないでください（※公出は公休扱いのため連勤・出勤日数・出勤人数にはカウントしません）。
          2. 連勤超過の直し方: 最大${maxStreak}連勤を超えている職員は、aiEditableDaysByStaff に含まれる連勤途中の日を null（空欄の公休）に変更して連勤を切り、その日に週休・連勤上限を守ったまま追加出勤できる余力スタッフが他にいる場合のみ振り替えてください（余力スタッフがいなければパート・手動調整で補うため未達のまま空けておくこと）。
          3. 3クール人員・3クール内リーダー・木クリリーダー・人数不足の直し方: 3クール枠の必要人数と「各3クール枠内のリーダー1名以上」、および「木クリのリーダー1名以上」を最優先で確保してください（じんクリはリーダー不要）。3クール内にリーダーがいない場合や木クリにリーダーがいない場合は、同日の日勤・2クールや他施設の余剰リーダーとシフトを入れ替えて確実に解消してください。誰かの週休（空欄公休）を潰したり${maxStreak + 1}連勤以上を作ったりすることは絶対禁止です。
          4. 新たな違反を作らないこと: 手直しによって別の職員が${maxStreak + 1}連勤以上になったり、週休が消えたり、3クール連続（${cool3DescStr}の連続）や maxCool3 超過にならないよう必ず確認してください。
          5. 勤務地の偏り・連日同一施設への配慮: 空欄への追加配置やシフト入れ替えを行う際は、複数施設に入れる職員（allowedFacilitiesCount >= 2）について前後の営業日と別の施設・これまでに回数が少ない施設（currentStats.priorityFacilitiesToBalance）を優先して選び、同じ施設ばかり連続しないよう配慮してください。
          ${strictConditions ? `\n【引き続き厳守する [絶対] カスタム条件（※文中のシフト名・施設名は上の対応表からコードへ変換して適用）】\n${strictConditions}\n` : ''}
          【各職員のAI編集可能日リスト（aiEditableDaysByStaff）】
          ${JSON.stringify(aiEditableDaysByStaff)}

          【現在の仮シフト全体データ】
          ${JSON.stringify(pass1AiData)}

          【出力JSONフォーマット（修正する差分セルのみ出力。表示名ではなくシフトコードを指定し、休みの空欄に戻すセルは null を指定）】
          {
            "shift": {
              "職員ID": { "日付(1-31の数値)": "新しいシフトコード または 空欄公休に戻す場合は null" }
            },
            "reason": "手直しした内容の要約"
          }
          `;

          const result2 = await callGemini(repairPrompt, systemInstruction, aiModel, { responseMimeType: 'application/json' });
          if (!isRunActive()) {
            clearInterval(progressInterval);
            clearInterval(timerInterval);
            return;
          }

          const pass2 = computeAiAppliedSchedule(
            result2,
            workingShifts,
            workingTasks,
            originalShifts,
            originalTasks,
            true,
            targetScopeDaysSet
          );

          if (pass2.success) {
            const monthEnforced2 = enforcePersonalRulesAndCool3Bounds(
              pass2.nextShifts,
              originalShifts,
              targetScopeDaysSet
            );
            const candidateShifts2 = monthEnforced2.nextShifts;
            const pass2Report = evaluateScheduleValidation({
              year,
              month,
              staffList,
              shiftDefs,
              categoryDefs,
              targetCounts,
              adminSettings,
              userInputs,
              prevMonthCarryOver,
              shiftsMap: candidateShifts2,
              lockedBaselineShifts: originalShifts,
              includeEmptyDays: true,
              scopeDaysSet: targetScopeDaysSet,
            });

            // 重大度スコアが改善（または同等で件数減）し、かつ個人の連勤・制限違反が増えていない場合のみ手直し版を採用
            if (
              pass2Report.hardStaffViolationCount <= pass1Report.hardStaffViolationCount &&
              pass2Report.criticalScore <= pass1Report.criticalScore
            ) {
              repairedIssueCount = Math.max(0, pass1Report.totalActionableCount - pass2Report.totalActionableCount);
              finalShifts = candidateShifts2;
              finalTasks = pass2.nextTasks;
              finalUserInputs = pass2.nextUserInputs;
              finalReport = pass2Report;
              totalUpdatedCells += pass2.count + monthEnforced2.changedCount;
            }
          }
        } catch (repairErr) {
          console.warn('Step 6 自動手直しパスでエラーが発生したため週次ビルド結果を採用します:', repairErr);
        }
      }

      if (!isRunActive()) {
        clearInterval(progressInterval);
        clearInterval(timerInterval);
        return;
      }

      if (totalUpdatedCells === 0) {
        stopAllIntervalsAndRollback();
        alert('変更が必要な箇所が見つかりませんでした。');
        return;
      }

      // 最終確定したシフトを保存
      autoFillTimingRef.current = {
        ...autoFillTimingRef.current,
        phase: 'saving',
        currentStepStartMs: Date.now(),
      };
      setAiRemainingText('まもなく完了...');
      setAiProgress(98);
      setAiLoadingMessage('作成した勤務表を保存しています...');
      setAiLoadingSubDetail('クラウドデータベースへ確定シフトを書き込んでいます');
      updateStepItem('finish', { status: 'active', detail: '保存中...' });

      isAutoFillRunningRef.current = false;
      recordAdminUndoSnapshot({
        shifts: originalShifts,
        tasks: originalTasks,
        userInputs: originalUserInputs,
        bells: bellData,
        leaders: leaderData,
      }, {
        label: 'AIシフト自動作成',
        detail: `${year}年${month}月 一括作成`,
      });
      setShiftData(finalShifts);
      setTaskData(finalTasks);
      setUserInputs(finalUserInputs);
      await saveSchedule(finalShifts, finalTasks, finalUserInputs);

      clearInterval(progressInterval);
      clearInterval(timerInterval);
      setAiProgress(100);
      setAiRemainingText('完了！');
      setAiLoadingMessage('AIシフト自動作成が完了しました！');
      setAiLoadingSubDetail('');
      updateStepItem('finish', {
        status: 'done',
        detail: didAutoRepair ? `手直し＆保存完了` : '保存完了',
      });

      setTimeout(() => {
        if (autoFillRunIdRef.current !== currentRunId) return;
        setIsAiLoading(false);
        setAiLoadingMessage('');
        setAiLoadingSubDetail('');
        setIsMonitorMinimized(false);
        setConfirmingCancelAutoFill(false);

        if (isFullMonthTarget) {
          setValidationScopeDays(null);
          setValidationScopeLabel('');
        } else {
          setValidationScopeDays(Array.from(targetScopeDaysSet));
          setValidationScopeLabel(targetScopeLabel);
        }

        // 手直し後も解消しきれなかった違反・人数不足・必須スキル不足が残っている場合は検算レポートモーダルを開いて案内
        if (finalReport.totalActionableCount > 0) {
          if (isFullMonthTarget) {
            setShowUncreatedDaysInValidation(true);
          }
          setAutoFillValidationSummary({
            didAutoRepair,
            repairedIssueCount,
            remainingCount: finalReport.totalActionableCount,
            scopeLabel: targetScopeLabel,
          });
          setShowValidationModal(true);
        }
      }, 500);
    } catch (error) {
      if (!isRunActive()) {
        clearInterval(progressInterval);
        clearInterval(timerInterval);
        return;
      }
      stopAllIntervalsAndRollback();
      console.error("AI自動入力エラー:", error);
      alert("通信エラーまたはタイムアウトが発生しました。作成前の状態に戻しました。");
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
          const normalizedAfter = isClear ? null : resolveAiOutputCode(rawCode, shiftDefs, categoryDefs, kind, staff);
          if (!isClear && !normalizedAfter) return;

          const currentCode = (kind === 'shift' ? shiftData[staffId]?.[dayNum] : taskData[staffId]?.[dayNum]) || null;
          if (currentCode === normalizedAfter) return;

          // 個人(スタッフ本人)が入力したシフト・希望（管理者が空欄公休や別シフトに対応済みのものも含む）、
          // HHD班・エコー班・オペ班管理者が入力したシフト・タスク、およびME室・その他(出勤/公出)はAIからも一切変更・新規配置不可とする
          if (kind === 'shift') {
            if (getUserRequestedShift(staffId, dayNum)) return;
            if (getTeamLockedShiftSource(staffId, dayNum)) return;
            if (currentCode && shiftDefs[currentCode] && !isAiAssignableFacilityShiftDef(currentCode, shiftDefs, categoryDefs)) {
              return;
            }
            if (normalizedAfter && !isAiAssignableFacilityShiftDef(normalizedAfter, shiftDefs, categoryDefs)) {
              return;
            }
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
              if (rawAdj === null || rawAdj === '' || rawAdj === 'CLEAR' || rawAdj === 'NONE') return null;
              return resolveAiOutputCode(rawAdj, shiftDefs, categoryDefs, 'shift', staff);
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

    const changePreview = targetMsg.proposedChanges
      .slice(0, 3)
      .map(it => `${staffList.find(s => s.id === it.staffId)?.name || '職員'}(${month}/${it.day})`)
      .join('・');
    recordAdminUndoSnapshot(null, {
      label: `AIチャット提案を反映（${targetMsg.proposedChanges.length}件）`,
      detail: changePreview + (targetMsg.proposedChanges.length > 3 ? ' ほか' : ''),
    });

    targetMsg.proposedChanges.forEach(item => {
      if (item.kind === 'shift') {
        if (getUserRequestedShift(item.staffId, item.day)) return;
        if (getTeamLockedShiftSource(item.staffId, item.day)) return;
        const curCode = shiftData[item.staffId]?.[item.day];
        if (curCode && shiftDefs[curCode] && !isAiAssignableFacilityShiftDef(curCode, shiftDefs, categoryDefs)) return;
        if (item.afterCode && !isAiAssignableFacilityShiftDef(item.afterCode, shiftDefs, categoryDefs)) return;
        ns[item.staffId] = { ...(ns[item.staffId] || {}) };
        if (item.afterCode) {
          ns[item.staffId][item.day] = item.afterCode;
        } else {
          delete ns[item.staffId][item.day];
        }
        const sEntry = normalizeUserInputEntry(nextUserInputs[item.staffId]?.[item.day], curCode, taskData[item.staffId]?.[item.day]);
        delete sEntry.editedShiftBy;
        delete sEntry.teamShiftBy;
        nextUserInputs[item.staffId] = { ...(nextUserInputs[item.staffId] || {}) };
        if (hasAnyUserInputMetadata(sEntry)) nextUserInputs[item.staffId][item.day] = sEntry;
        else delete nextUserInputs[item.staffId][item.day];
      } else {
        if (getUserRequestedTask(item.staffId, item.day)) return;
        if (getTeamLockedTaskSource(item.staffId, item.day)) return;
        nt[item.staffId] = { ...(nt[item.staffId] || {}) };
        if (item.afterCode) {
          nt[item.staffId][item.day] = item.afterCode;
        } else {
          delete nt[item.staffId][item.day];
        }
        const tEntry = normalizeUserInputEntry(nextUserInputs[item.staffId]?.[item.day], shiftData[item.staffId]?.[item.day], taskData[item.staffId]?.[item.day]);
        if (item.afterCode) tEntry.editedTaskBy = 'all';
        else delete tEntry.editedTaskBy;
        nextUserInputs[item.staffId] = { ...(nextUserInputs[item.staffId] || {}) };
        if (hasAnyUserInputMetadata(tEntry)) nextUserInputs[item.staffId][item.day] = tEntry;
        else delete nextUserInputs[item.staffId][item.day];
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
      const cool3Codes = data.cool3ShiftCodes || [];
      const cool3DescStr = cool3Codes.length > 0
        ? cool3Codes.map(c => (shiftDefs[c] ? `表示名「${shiftDefs[c].label}」(コード:"${c}")` : `コード:"${c}"`)).join('・')
        : '設定なし';
      const meShiftDescList = Object.values(shiftDefs)
        .filter(sd => sd && isMeRoomShiftCode(sd.code))
        .map(sd => `表示名「${sd.label}」(コード:"${sd.code}")`);
      const meShiftDescStr = meShiftDescList.length > 0 ? meShiftDescList.join('・') : 'ME室カテゴリのシフト';
      const maxStreak = data.pacingRules?.maxConsecutiveWorkDays || 5;
      const skillReqLines = Object.values(data.facilitySkillRequirements || {}).map(fReq => {
        const parts = Object.values(fReq.requiredSkills || {}).map(sr => `${sr.label}${sr.minCount}名以上`);
        return `${fReq.facilityLabel}: ${parts.join('・')}`;
      });
      const skillReqSummaryText = skillReqLines.length > 0 ? skillReqLines.join(' ／ ') : '設定なし';
      const powerTargetEntries = Object.entries(data.facilityPowerTargets || {});
      const powerScoreSummaryText = powerTargetEntries.length > 0
        ? powerTargetEntries
            .map(([catId, fp]) =>
              fp.targetPowerScore > 0
                ? `${fp.facilityLabel}(${catId}): 当日出勤者の平均スコア×人数で施設間均等化`
                : `${fp.facilityLabel}(${catId}): スコア判定なし`
            )
            .join(' ／ ')
        : '設定なし';
      const shiftSystemRefText = buildShiftSystemReferenceText(shiftDefs, categoryDefs, adminSettings);

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
2. 画面上の「表示名」とデータ保存用の「シフトコード」が異なる設定に対応しています（例：コード "1" ＝ 表示名「A」など）。
   ・"reply" には管理者に語りかける自然な日本語メッセージを書き、内部のシフトコードや職員IDではなく、必ず現在のシステム設定の【表示名】と【職員名】で分かりやすく伝えてください。
   ・一方、JSONの "shift" / "task" に出力する値は、表示名ではなく必ず対応表の【シフトコード】（または空欄に戻す null）を指定してください。
3. 質問への回答、現状の診断、または複数候補の比較相談の段階では、"shift" と "task" は空オブジェクト {} のままにし、まず会話で相談に乗ってください。
4. 管理者が「変更案を作って」「仮組みして」「その案で進めて」「〇〇さんを△△に変えて」などシフト変更を求めた場合や、具体的な変更プレビューを提示した方が話が早い場合は、"reply" で理由や配慮点を説明した上で、"shift"（および必要なら "task"）に変更する箇所の差分だけを入れてください（管理者が画面上の「勤務表に反映する」ボタンを押すまで実際の表は書き換わらない安心設計になっています）。
5. "staffRequests" にある箇所（個人＝スタッフ本人が入力したシフト・希望、およびそれに対して管理者が空欄休みや別シフトに対応済みの箇所）と、"teamAdminLocks" にある箇所（HHD班・エコー班・オペ班管理者が入力したシフト・タスク）は管理者が直接対応する確定領域のため、AIからは絶対に変更・上書きできません。そのまま維持し、条件計算（人数・スコア・必須スキル・連勤・公休数）にのみ反映してください。
6. 無理な条件やトレードオフがある場合は黙って無視せず、「〇〇日にリーダーやスコアが少し足りませんが、希望休と連勤上限を優先してベテランの〜さんを配置する案はいかがでしょうか？」と現場目線で代替案を添えてください。`;

      const currentContextPrompt = `
【現在の対象年月】${year}年${month}月

${shiftSystemRefText}

【基本ルール】
- 日曜日は透析休診（空欄のまま）。祝日および外来診療休診日（calendar[d].isHoliday: true）でも日曜以外は通常通り透析を実施するため出勤日として扱います。
- "excludeFromAi": true の職員は原則変更不可（管理者が名指しで指示した場合のみ例外）。
- 個人（スタッフ本人）入力箇所・各班管理者（HHD班・エコー班・オペ班管理者）入力箇所・ME室・その他（出勤・公出）の扱い（★絶対厳守★）:
  ・AIが新規入力・入れ替え提案できるシフトは【勤務施設】カテゴリ（坂田・君津・木クリ・じんクリ等）のシフトコードのみです。
  ・"staffRequests"（スタッフ本人が入力した希望・シフト、および管理者が空欄公休に対応済みの lockedBlankOffDays を含む）、"teamAdminLocks"、ME室（${meShiftDescStr}）、およびその他（出勤・公出等）は、AIから新規に入れたり、変更・移動・削除することは絶対禁止です。
  ・既に入力済みのME室・出勤はその職員の連勤数・出勤日数に含めて考慮してください。一方、「公出」は業務出張扱いのため日別出勤人数・現場出勤日数・連勤数にはカウントせず、公出しか入っていない週（休・年休等の休みが入っていない週）は必ずもう1日「空欄の公休」を残して現場出勤4日間とし、公出と休み（休・年休等）の両方が入っている週は残り4日間にそのまま出勤シフトを入れてください。
- 配置可能施設・シフト制限（重要）: 各職員に出勤シフトを割り当てる際は、必ずその職員の "allowedWorkShifts"（1日については "day1AllowedWorkShifts"）に含まれる【シフトコード】のみを使用してください（許可されていない施設・シフトには絶対に入れないこと。管理者が名指しで特例指示した場合のみ一言確認を添えて提案可）。
- 前月末引き継ぎ・週休2日・祝日空欄と振休・最大連勤制限・休みの「空欄」表現（重要）:
  ・週休2日制（日曜休み＋月〜土のうち週1日休み）のため、連続出勤は月またぎ（前月末＋当月初）の通算も含めて最大「${maxStreak}日（${maxStreak}連勤）」までとし、${maxStreak + 1}連勤以上は作らないでください。
  ・祝日の休みは「空欄」で表し、その祝日の空欄を「その週の週休1日分（週休枠）」としてカウントします（基本は残り5日間が出勤ですが、同じ週に休み希望等がある場合は週4日以下の出勤でも構いません）。また、祝日に出勤した職員に月の別日で「振休」が入っている場合も、その「振休」を該当週の休み1日分としてカウントします（基本は5日出勤、同じ週に休み希望等がある場合は週4日以下の出勤でも可）。
  ・各職員の "prevMonthCarryOver" に前月末最終週からの連勤数（trailingWorkStreak）、1日からの最大許容連勤数（maxAllowedConsecutiveWorkFromDay1）、前月側での公休取得有無（alreadyTookWeeklyOffInPrevMonthPart）が入っていますので必ず考慮してください。
  ・AIが休ませる日（週休枠の公休・祝日の空欄休み）には、休みコードは入れず「空欄」のまま残します（既にシフトが入っている箇所を休みに戻す場合のみ null を指定）。
  ・仮組み・空欄埋めを行う際は全ての空欄を出勤で埋め尽くさず、各職員の currentStats にある targetWorkDaysRange、remainingWorkDaysRange、blankOffDaysToKeepRange、weeksNeedingBlankOff（週1日の公休として空欄を残すべき週 ※月またぎ第1週も含む）を守ってください。
- 3クール制限・連続3クール禁止（月またぎ含む・重要）:
  ・各職員の maxCool3 は現在のシステム設定における3クールシフト（${cool3DescStr}）の月間上限回数です（currentStats.remainingCool3 を参照）。
  ・同じ職員に3クールシフトを2日連続で割り当てないでください（日曜休診を挟む場合を除く）。特に "prevMonthCarryOver.forbidCool3OnDay1": true（前月最終日に3クール勤務だった職員）には、当月1日に3クールシフトを入れず "day1AllowedWorkShifts" から選んでください。
- 施設ごとの必須スキル配置（Step 4）と不足時の次善策:
  ・各施設の必須スキル最低人数（facilitySkillRequirements）: 【${skillReqSummaryText}】（dailySummary[d].facilitySkillCounts と shortages に現状が計算済みです）。
  ・希望休・年休・班管理者ロック・連勤上限を破ってまで無理やりリーダー等を出勤させてはいけません。出勤可能なリーダー等が足りない日は、1施設に2名固めず1名ずつ別施設へ分散配置し、どうしても0名になる施設にはベテラン（isVeteran）や高スコアスタッフを優先配置した上で、"reply" でもその旨を分かりやすく共有してください。
- 施設間パワーバランス（案A：当日出勤者の1人あたり平均powerScoreと人数比による動的目安）: 【${powerScoreSummaryText}】（dailySummary[d].facilityPowerScores の expectedBalancedScore / actualAvgPerPerson / dayOverallAvgPerPerson と shortages に計算済みです。特定の施設だけに高スコア者が偏らず、各施設の1人あたり平均スコアが均等になるよう調整してください）。
- 必要人数と不足時の優先順位（パート・手動調整前提）: targetCounts（キーはシフトコード）を可能な範囲で満たすように調整しますが、AI対象スタッフだけで完璧に100%埋めきる必要はありません。足りない分はパート職員やAI除外スタッフ・管理者の手動調整で補う運用のため、個人の週休確保（空欄公休）・最大${maxStreak}連勤制限・3クール制限・配置制限を破ってまで無理に埋めず、人数が足りない日はリーダー（必須スキル）や3クール・2クール等の主力枠を優先して確保し、日勤・半日等の補いやすい枠を未達として残してください。
- ランダム分散・日ごとの勤務地ローテーション・施設偏りの平準化（重要）:
  ・仮組みや複数日のシフト提案を行う際は、名簿の上から機械的に「AAAA, FFFF」のように同じ施設・シフトを固めて並べないでください。
  ・複数の施設に配置可能な職員（currentStats.allowedFacilitiesCount >= 2）は、[絶対]カスタム条件（曜日・施設の固定指定等）や必須スキル・必要人数に反しない限り、連日同じ施設が続かないよう**日ごとに勤務地・クールをバラけてローテーション**させ、currentStats.facilityCounts / priorityFacilitiesToBalance を参照して月間の勤務地の偏りが少なくなるよう組んでください。

【有効なカスタム条件①：[絶対]（★最優先で必ず守る条件★ ※文中のシフト名・施設名は上の対応表からコードへ変換して解釈すること）】
${strictConditions ? strictConditions : '特になし'}

【有効なカスタム条件②：[なるべく]（基本ルール・必要人数・必須スキルを崩さない範囲で配慮する努力目標）】
${softConditions ? softConditions : '特になし'}

【出力JSONスキーマ】
{
  "reply": "管理者に向けた丁寧で分かりやすい返答メッセージ（内部コードではなく表示名を使用・改行可）",
  "shift": {
    "職員ID": { "日付(1-31の数値文字列)": "シフトコード（※表示名ではなくコード文字列。空欄に戻す場合のみ null）" }
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

  // Step 6: 現在の勤務表に対するリアルタイム検算レポート（ヘッダーバッジ＆検算モーダル用）
  const liveValidationReport = useMemo(() => {
    const activeScopeSet =
      Array.isArray(validationScopeDays) && validationScopeDays.length > 0
        ? new Set(validationScopeDays)
        : null;
    return evaluateScheduleValidation({
      year,
      month,
      staffList,
      shiftDefs,
      categoryDefs,
      targetCounts,
      adminSettings,
      userInputs,
      prevMonthCarryOver,
      shiftsMap: shiftData,
      lockedBaselineShifts: shiftData,
      includeEmptyDays: activeScopeSet ? true : showUncreatedDaysInValidation,
      scopeDaysSet: activeScopeSet,
    });
  }, [
    year,
    month,
    staffList,
    shiftDefs,
    categoryDefs,
    targetCounts,
    adminSettings,
    userInputs,
    prevMonthCarryOver,
    shiftData,
    showUncreatedDaysInValidation,
    validationScopeDays,
  ]);

  const handleOpenValidationModal = () => {
    setAutoFillValidationSummary(null);
    setShowValidationModal(true);
  };

  // 検算モーダルからワンタップでAIチャットへ違反・不足箇所を引き継いで調整案を相談
  const handleConsultValidationWithAi = () => {
    const lines = [];
    liveValidationReport.staffViolations.slice(0, 10).forEach(v => {
      lines.push(`・[個人ルール] ${v.staffName}: ${v.label}（${v.detail}）`);
    });
    liveValidationReport.dailyHeadcountShortages.slice(0, 10).forEach(dItem => {
      const nonMe = dItem.nonMeItems;
      if (nonMe.length > 0) {
        lines.push(`・[人数不足] ${month}/${dItem.day}(${dItem.dowLabel}): ${nonMe.map(it => `${it.label} ${it.actual}/${it.target}名`).join('、')}`);
      }
    });
    liveValidationReport.dailySkillShortages.slice(0, 10).forEach(dItem => {
      lines.push(
        `・[必須スキル不足] ${month}/${dItem.day}(${dItem.dowLabel}): ` +
        dItem.items.map(it => `${it.catLabel}(${it.skillLabel} ${it.actual}/${it.target}名)`).join('、')
      );
    });

    const summaryPrompt = lines.length > 0
      ? `検算チェックで以下の課題が見つかりました。個人入力分や各班管理者の固定シフトは変更せず、解消できる箇所について具体的なシフト変更案を作成してください（どうしても解消できない箇所があれば次善策を教えてください）：\n${lines.join('\n')}`
      : `${year}年${month}月のシフト全体を確認し、パワーバランスや負担の偏りをさらに良くできる箇所があれば提案してください。`;

    setShowValidationModal(false);
    setAutoFillValidationSummary(null);
    setShowAiModal(true);
    handleAiSend(summaryPrompt);
  };

  // --- Memoized Values ---
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const calendarDays = useMemo(() => generateCalendarDays(year, month), [year, month]);
  const aiQuickPrompts = useMemo(() => buildAiQuickPrompts(categoryDefs), [categoryDefs]);

  const dynamicPaletteGroups = useMemo(() => {
    const groups = {};
    Object.keys(categoryDefs).forEach(catId => { groups[catId] = []; });
    const fallbackBasicId = Object.values(categoryDefs).find(c => resolveCategoryKind(c) === 'basic')?.id || null;
    const uncategorized = [];
    Object.values(shiftDefs).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)).forEach(shift => {
      if (!shift) return;
      if (groups[shift.category]) groups[shift.category].push(shift.code);
      else if (fallbackBasicId && groups[fallbackBasicId]) groups[fallbackBasicId].push(shift.code);
      else uncategorized.push(shift.code);
    });
    const result = Object.values(categoryDefs)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .map(cat => ({ id: cat.id, name: cat.label, kind: resolveCategoryKind(cat), items: groups[cat.id] || [] }))
      .filter(g => g.items.length > 0);
    if (uncategorized.length > 0) {
      result.push({ id: '__uncategorized', name: '未分類', kind: 'basic', items: uncategorized });
    }
    return result;
  }, [shiftDefs, categoryDefs]);

  const dynamicSummaryGroups = useMemo(() => {
    return Object.values(categoryDefs)
      .filter(cat => {
        const kind = resolveCategoryKind(cat);
        return kind !== 'off' && kind !== 'req' && kind !== 'role';
      })
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .map(def => {
        const catKey = def.id;
        const kind = resolveCategoryKind(def);
        const categoryItems = Object.values(shiftDefs)
          .filter(s => s && s.category === catKey && getEffectiveShiftType(s, categoryDefs) === 'shift')
          .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
          .map(s => s.code);
        return { id: catKey, name: def.label, kind, items: categoryItems, totalLabel: `${def.label} 計`, headerColor: def.color };
      });
  }, [shiftDefs, categoryDefs]);

  const staffOvertimeStats = useMemo(() => {
    const stats = {};
    staffList.forEach(staff => {
      let totalMinutes = 0;
      daysArray.forEach(day => {
        const code = shiftData[staff.id]?.[day];
        if (code && shiftDefs[code]?.overtime) {
          totalMinutes += Math.round((parseFloat(shiftDefs[code].overtime) || 0) * 60);
        }
      });
      stats[staff.id] = Math.round((totalMinutes / 60) * 100) / 100;
    });
    return stats;
  }, [staffList, shiftData, shiftDefs, daysArray]);

  const staffKikuriStats = useMemo(() => {
    const stats = {};
    staffList.forEach(staff => {
      let count = 0;
      daysArray.forEach(day => {
        if (isSunday(year, month, day)) return;
        const code = shiftData[staff.id]?.[day];
        if (!code) return;
        const def = shiftDefs[code];
        if (!def || getEffectiveShiftType(def, categoryDefs) !== 'shift') return;
        const catLabel = (categoryDefs[def.category]?.label || '').trim();
        if (def.category === 'kikuri' || catLabel === '木クリ') {
          count += 1;
        }
      });
      stats[staff.id] = count;
    });
    return stats;
  }, [staffList, shiftData, shiftDefs, categoryDefs, daysArray, year, month]);

  // #4: 管理者全体表の右側に表示する2段ヘッダー用グループ定義（<施設別> / <シフト表示別>）
  const adminRightCountGroups = useMemo(() => {
    const sortedCats = Object.values(categoryDefs)
      .filter(Boolean)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const catOrderMap = {};
    sortedCats.forEach((c, idx) => {
      catOrderMap[c.id] = idx;
    });

    const allShifts = Object.values(shiftDefs)
      .filter(s => s && getEffectiveShiftType(s, categoryDefs) === 'shift')
      .sort((a, b) => {
        const oa = a.order ?? 999;
        const ob = b.order ?? 999;
        if (oa !== ob) return oa - ob;
        return String(a.code).localeCompare(String(b.code));
      });

    const meGroups = sortedCats
      .filter(c => resolveCategoryKind(c) === 'me')
      .map(c => ({
        id: `cat_${c.id}`,
        label: c.label,
        headerColor: c.color || 'bg-red-50 text-red-800',
        shifts: allShifts.filter(s => s.category === c.id),
      }))
      .filter(g => g.shifts.length > 0);

    const offGroups = sortedCats
      .filter(c => resolveCategoryKind(c) === 'off')
      .map(c => ({
        id: `cat_${c.id}`,
        label: c.label,
        headerColor: c.color || 'bg-gray-100 text-gray-700',
        shifts: allShifts.filter(s => s.category === c.id && !isWorkRequestShiftDef(s, categoryDefs)),
      }))
      .filter(g => g.shifts.length > 0);

    const cool3TotalCol = {
      code: '__COOL3_TOTAL__',
      label: '計',
      text: 'text-indigo-800',
      isCool3Total: true,
    };

    if (adminCountDisplayMode === 'slot') {
      // <シフト表示別>: 3クール(各シフト + 合計) / 2クール / 日勤 / 半日・他 + ME室 + 休み
      const facilityShifts = allShifts
        .filter(s => getCategoryKindById(s.category, categoryDefs) === 'facility')
        .sort((a, b) => {
          const ca = catOrderMap[a.category] ?? 99;
          const cb = catOrderMap[b.category] ?? 99;
          if (ca !== cb) return ca - cb;
          return (a.order ?? 999) - (b.order ?? 999);
        });

      const slotDefs = [
        { id: 'slot_cool3', label: '3クール', headerColor: 'bg-purple-50 text-purple-800', match: sl => sl === 'cool3' },
        { id: 'slot_cool2', label: '2クール', headerColor: 'bg-indigo-50 text-indigo-800', match: sl => sl === 'cool2' },
        { id: 'slot_day', label: '日勤', headerColor: 'bg-blue-50 text-blue-800', match: sl => sl === 'day' },
        { id: 'slot_other', label: '半日・他', headerColor: 'bg-amber-50 text-amber-800', match: sl => sl === 'half' || sl === 'other' },
      ];

      const slotGroups = slotDefs
        .map(sd => {
          const matchedShifts = facilityShifts.filter(s => sd.match(resolveShiftWorkSlot(s, categoryDefs) || 'other'));
          if (sd.id === 'slot_cool3' && matchedShifts.length > 0) {
            return {
              id: sd.id,
              label: sd.label,
              headerColor: sd.headerColor,
              shifts: [...matchedShifts, cool3TotalCol],
            };
          }
          return {
            id: sd.id,
            label: sd.label,
            headerColor: sd.headerColor,
            shifts: matchedShifts,
          };
        })
        .filter(g => g.shifts.length > 0);

      return [...slotGroups, ...meGroups, ...offGroups];
    }

    // <施設別>: 坂田 / 君津 / 木クリ / じんクリ / ME室 / 休み / 3クール計
    const facGroups = sortedCats
      .filter(c => resolveCategoryKind(c) === 'facility')
      .map(c => ({
        id: `cat_${c.id}`,
        label: c.label,
        headerColor: c.color || 'bg-blue-50 text-blue-800',
        shifts: allShifts.filter(s => s.category === c.id),
      }))
      .filter(g => g.shifts.length > 0);

    const hasAnyCool3 = allShifts.some(s => isCool3ShiftDef(s, categoryDefs));
    const cool3SummaryGroup = hasAnyCool3
      ? [
          {
            id: 'slot_cool3_total',
            label: '3ｸｰﾙ',
            headerColor: 'bg-purple-50 text-purple-800',
            shifts: [cool3TotalCol],
          },
        ]
      : [];

    return [...facGroups, ...meGroups, ...offGroups, ...cool3SummaryGroup];
  }, [categoryDefs, shiftDefs, adminCountDisplayMode]);

  const adminRightFlatShifts = useMemo(() => {
    const flat = [];
    adminRightCountGroups.forEach((grp, gIdx) => {
      grp.shifts.forEach((s, sIdx) => {
        flat.push({
          groupId: grp.id,
          groupLabel: grp.label,
          shift: s,
          isFirstInGroup: gIdx > 0 && sIdx === 0,
        });
      });
    });
    return flat;
  }, [adminRightCountGroups]);

  // #4: 各職員のシフトコード別取得回数集計（日曜除外）＋ 3クール合計
  const staffShiftCodeCounts = useMemo(() => {
    const result = {};
    staffList.forEach(staff => {
      const counts = { __COOL3_TOTAL__: 0 };
      daysArray.forEach(day => {
        if (isSunday(year, month, day)) return;
        const code = shiftData[staff.id]?.[day];
        if (code && shiftDefs[code]) {
          counts[code] = (counts[code] || 0) + 1;
          if (isCool3ShiftDef(shiftDefs[code], categoryDefs)) {
            counts.__COOL3_TOTAL__ += 1;
          }
        }
      });
      result[staff.id] = counts;
    });
    return result;
  }, [staffList, shiftData, shiftDefs, categoryDefs, daysArray, year, month]);

  const dailyStats = useMemo(() => {
    const stats = {};
    daysArray.forEach(day => {
      stats[day] = { total: 0 };
      Object.keys(shiftDefs).forEach(code => stats[day][code] = 0);
      // 日曜日の入力分（公出など）は集計カウントには含めない
      if (isSunday(year, month, day)) return;
      staffList.forEach(staff => {
        const sCode = shiftData[staff.id]?.[day];
        if (sCode && shiftDefs[sCode]) {
          stats[day][sCode] = (stats[day][sCode] || 0) + 1;
          if (
            getEffectiveShiftType(shiftDefs[sCode], categoryDefs) === 'shift' &&
            !isNonWorkOrKoushutsuShiftDef(shiftDefs[sCode], categoryDefs)
          ) {
            stats[day].total++;
          }
        }
        const tCode = taskData[staff.id]?.[day];
        if (tCode && shiftDefs[tCode]) stats[day][tCode] = (stats[day][tCode] || 0) + 1;
      });
    });
    return stats;
  }, [shiftData, taskData, staffList, daysArray, shiftDefs, categoryDefs, year, month]);

  // Step 4: 各日・各施設のスキル保持者数と必須スキル不足（オレンジ警告表示用）をメモ化
  const dailyFacilitySkillSummary = useMemo(() => {
    const summary = {};
    const facilityCats = Object.values(categoryDefs)
      .filter(cat => resolveCategoryKind(cat) === 'facility')
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    const readSkillMin = (catId, skillKey) => {
      if (!catId || !categoryDefs[catId]) return 0;
      return resolveFacilitySkillTarget(categoryDefs[catId], skillKey, adminSettings);
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
        if (getEffectiveShiftType(def, categoryDefs) !== 'shift' || isOffOrReqCategoryId(def.category, categoryDefs)) return;
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
          .filter(sd => sd && getEffectiveShiftType(sd, categoryDefs) === 'shift' && sd.category === cat.id)
          .map(sd => sd.code);
        if (catShiftCodes.length === 0) return;

        const catTargetHeadcount = catShiftCodes.reduce((sum, code) => sum + (targetCounts[code]?.[dow] || 0), 0);
        const catActualHeadcount = actualHeadcountByCat[cat.id] || 0;
        if (catTargetHeadcount === 0 && catActualHeadcount === 0) return;

        const catShiftDefsForDay = catShiftCodes.map(c => shiftDefs[c]).filter(Boolean);
        const catHasCool3 = catShiftDefsForDay.some(sd => isCool3ShiftDef(sd, categoryDefs));
        const activeCool3ForDay = catShiftDefsForDay.filter(
          sd =>
            isCool3ShiftDef(sd, categoryDefs) &&
            ((targetCounts[sd.code]?.[dow] || 0) > 0 || staffList.some(s => shiftData[s.id]?.[day] === sd.code))
        );

        const catShortages = [];
        STAFF_SKILLS.forEach(sk => {
          if (sk.key === 'isLeader') {
            if (activeCool3ForDay.length > 0) {
              activeCool3ForDay.forEach(c3Def => {
                const c3LeaderCnt = staffList.filter(
                  s => shiftData[s.id]?.[day] === c3Def.code && s.skills?.isLeader
                ).length;
                if (c3LeaderCnt < 1) {
                  const item = {
                    catId: cat.id,
                    catLabel: `${cat.label}(${c3Def.label})`,
                    skillKey: 'isLeader',
                    skillLabel: '3クール内リーダー',
                    actual: c3LeaderCnt,
                    target: 1,
                  };
                  catShortages.push(item);
                  allShortages.push(item);
                }
              });
              return;
            }
            if (!catHasCool3 && !isKikuriFacilityCategory(cat)) return;
            const reqLeader = isKikuriFacilityCategory(cat)
              ? Math.max(1, readSkillMin(cat.id, 'isLeader'))
              : readSkillMin(cat.id, 'isLeader');
            if (reqLeader > 0) {
              const actualL = skillCountsByCat[cat.id]?.isLeader || 0;
              if (actualL < reqLeader) {
                const item = {
                  catId: cat.id,
                  catLabel: cat.label,
                  skillKey: 'isLeader',
                  skillLabel: sk.label,
                  actual: actualL,
                  target: reqLeader,
                };
                catShortages.push(item);
                allShortages.push(item);
              }
            }
            return;
          }

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

  // 役割（タスク）定義一覧（表示順ソート）
  const roleTaskDefs = useMemo(() => {
    return Object.values(shiftDefs)
      .filter(s => s && getEffectiveShiftType(s, categoryDefs) === 'task')
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }, [shiftDefs, categoryDefs]);

  // 各日・各施設の役割（タスク）必要数に対する配置実績・充足状況をメモ化
  const dailyFacilityTaskSummary = useMemo(() => {
    const summary = {};
    const facilityCats = Object.values(categoryDefs)
      .filter(cat => resolveCategoryKind(cat) === 'facility')
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    const targetsByTask = {};
    roleTaskDefs.forEach(rt => {
      targetsByTask[rt.code] = getRoleFacilityTargets(rt, categoryDefs);
    });

    daysArray.forEach(day => {
      const countsByCatTask = {};
      const totalTaskCounts = {};
      facilityCats.forEach(cat => {
        countsByCatTask[cat.id] = {};
      });

      if (!isSunday(year, month, day)) {
        staffList.forEach(s => {
          const tCode = taskData[s.id]?.[day];
          if (!tCode || !shiftDefs[tCode]) return;
          totalTaskCounts[tCode] = (totalTaskCounts[tCode] || 0) + 1;

          const sCode = shiftData[s.id]?.[day];
          if (!sCode || !shiftDefs[sCode]) return;
          const sDef = shiftDefs[sCode];
          if (
            getEffectiveShiftType(sDef, categoryDefs) !== 'shift' ||
            isOffOrReqCategoryId(sDef.category, categoryDefs)
          ) {
            return;
          }
          if (countsByCatTask[sDef.category] !== undefined) {
            countsByCatTask[sDef.category][tCode] = (countsByCatTask[sDef.category][tCode] || 0) + 1;
          }
        });
      }

      const dow = getDayOfWeek(year, month, day);
      const itemsByCat = {};
      facilityCats.forEach(cat => {
        const list = [];
        roleTaskDefs.forEach(rt => {
          const target = getRoleFacilityTargetForDow(targetsByTask[rt.code], cat, dow);
          if (target > 0) {
            const actual = countsByCatTask[cat.id]?.[rt.code] || 0;
            list.push({
              code: rt.code,
              label: rt.label,
              text: rt.text,
              actual,
              target,
              isMet: actual >= target,
            });
          }
        });
        itemsByCat[cat.id] = list;
      });

      const byTask = {};
      roleTaskDefs.forEach(rt => {
        const catTargets = targetsByTask[rt.code] || {};
        const facilityDetails = [];
        let totalTarget = 0;
        facilityCats.forEach(cat => {
          const target = getRoleFacilityTargetForDow(catTargets, cat, dow);
          if (target > 0) {
            totalTarget += target;
            const actual = countsByCatTask[cat.id]?.[rt.code] || 0;
            facilityDetails.push({
              catId: cat.id,
              catLabel: cat.label,
              actual,
              target,
              isMet: actual >= target,
            });
          }
        });
        byTask[rt.code] = {
          totalActual: totalTaskCounts[rt.code] || 0,
          totalTarget,
          facilityDetails,
          shortFacilities: facilityDetails.filter(f => !f.isMet),
        };
      });

      summary[day] = { countsByCatTask, itemsByCat, byTask };
    });

    return summary;
  }, [daysArray, shiftData, taskData, staffList, shiftDefs, categoryDefs, roleTaskDefs, year, month]);

  const countedOffShifts = useMemo(() => {
    return resolveEffectiveCountedOffShifts(adminSettings, shiftDefs, categoryDefs);
  }, [resolveEffectiveCountedOffShifts, adminSettings, shiftDefs, categoryDefs]);

  const clinicClosedDays = useMemo(() => {
    return Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];
  }, [adminSettings.clinicClosedDays]);

  const hasKoushutsuShiftDef = useMemo(() => {
    return Object.values(shiftDefs).some(s => isKoushutsuShiftDef(s, categoryDefs));
  }, [shiftDefs, categoryDefs]);

  // 各日付の休み希望人数をカウント（平日・平日の祝日・土曜すべて対象、日曜およびパートは対象外）
  // 基本設定の「休み希望人数としてカウントするシフト」で設定したシフトのうち、個人（スタッフ本人）から入力されたもののみをカウント
  const dailyOffRequestCounts = useMemo(() => {
    const counts = {};
    const countedSet = new Set(countedOffShifts);
    daysArray.forEach(day => {
      if (isSunday(year, month, day)) {
        counts[day] = 0;
        return;
      }
      let count = 0;
      staffList.forEach(staff => {
        if (staff.jobTitle === 'パート') return;

        const currentCode = shiftData[staff.id]?.[day] || null;
        const rawUserEntry = userInputs[staff.id]?.[day];
        const reqCode = !rawUserEntry ? null
          : rawUserEntry === true ? currentCode
          : typeof rawUserEntry === 'string' ? rawUserEntry
          : rawUserEntry.shift || null;

        if (reqCode && countedSet.has(reqCode)) {
          count++;
        }
      });
      counts[day] = count;
    });
    return counts;
  }, [daysArray, year, month, staffList, shiftData, userInputs, countedOffShifts]);

  // カテゴリ1: 各施設(君津・坂田)の先頭3クールリーダー（または手動指定）およびME室L/祝日Gの自動背景色マップを計算
  const autoShiftHighlightMap = useMemo(() => {
    const map = {};
    const targetLeaderCats = Object.values(categoryDefs)
      .filter(cat => isLeaderHighlightTargetFacility(cat))
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    daysArray.forEach(day => {
      // 0. HHD班管理者が入力した勤務：対象職員がHHD班に所属している場合のみ薄い黄色（bg-yellow-100）で自動色付け（日曜の公出含む、リーダー色・ME室色が優先）
      staffList.forEach(s => {
        const code = shiftData[s.id]?.[day];
        const rawInput = userInputs[s.id]?.[day];
        if (
          code &&
          rawInput &&
          typeof rawInput === 'object' &&
          rawInput.teamShiftBy === 'hhd' &&
          Array.isArray(s.roles) &&
          s.roles.includes('HHD班')
        ) {
          map[`${s.id}_${day}`] = {
            bgClass: 'bg-yellow-100',
            tooltip: '',
            source: 'hhd',
          };
        }
      });

      if (isSunday(year, month, day)) return;
      const isHol = isHoliday(year, month, day, clinicClosedDays);

      // 1. 各施設(君津・坂田)のリーダー：
      //    手動指定がある場合はその人を優先色付けし、手動指定がない場合は「3クールに入っているリーダー」のうちstaffList上で一番上の人のみ自動色付け
      targetLeaderCats.forEach(cat => {
        let hasManualForCat = false;
        staffList.forEach(s => {
          if (!leaderData[s.id]?.[day]) return;
          const code = shiftData[s.id]?.[day];
          const def = code ? shiftDefs[code] : null;
          if (def && getEffectiveShiftType(def, categoryDefs) === 'shift' && def.category === cat.id) {
            hasManualForCat = true;
            map[`${s.id}_${day}`] = {
              bgClass: resolveLightBgFromShiftOrCategory(def, cat),
              tooltip: `【${cat.label} リーダー（手動指定）】`,
              source: 'manual',
            };
          }
        });

        if (!hasManualForCat) {
          for (let i = 0; i < staffList.length; i++) {
            const s = staffList[i];
            if (!s?.skills?.isLeader) continue;
            const code = shiftData[s.id]?.[day];
            const def = code ? shiftDefs[code] : null;
            if (
              def &&
              getEffectiveShiftType(def, categoryDefs) === 'shift' &&
              def.category === cat.id &&
              isCool3ShiftDef(def, categoryDefs)
            ) {
              map[`${s.id}_${day}`] = {
                bgClass: resolveLightBgFromShiftOrCategory(def, cat),
                tooltip: `【${cat.label} 3クール先頭リーダー】`,
                source: 'auto',
              };
              break;
            }
          }
        }
      });

      // 2. ME室：通常営業日は「L」、祝日・外来休診日は「G」を薄い灰色で自動色付け
      staffList.forEach(s => {
        const code = shiftData[s.id]?.[day];
        if (code && isMeHighlightTargetShiftDef(code, isHol, shiftDefs, categoryDefs)) {
          map[`${s.id}_${day}`] = {
            bgClass: 'bg-gray-200',
            tooltip: isHol ? '【ME室 G（祝日・休診日）】' : '【ME室 L】',
            source: 'me',
          };
        }
      });
    });

    return map;
  }, [daysArray, year, month, clinicClosedDays, staffList, shiftData, leaderData, userInputs, shiftDefs, categoryDefs]);

  // 基本設定タブ用: 個人カレンダーで選択可能なシフト（希望・休み・その他[公出等]・シフト希望表示ON）のみに絞り込み、設定画面が雑多にならないよう整理
  const basicSettingsShiftGroups = useMemo(() => {
    const priorityByKind = { req: 0, off: 1, basic: 2 };
    const countedSet = new Set(countedOffShifts);
    return dynamicPaletteGroups
      .map(g => ({
        ...g,
        color: categoryDefs[g.id]?.color || 'bg-gray-50 text-gray-800',
        items: g.items.filter(code => {
          const s = shiftDefs[code];
          if (!s || getEffectiveShiftType(s, categoryDefs) !== 'shift') return false;
          const catKind = getCategoryKindById(s.category, categoryDefs);
          return (
            catKind === 'req' ||
            catKind === 'off' ||
            catKind === 'basic' ||
            Boolean(s.isRequestable) ||
            countedSet.has(code)
          );
        })
      }))
      .filter(g => g.items.length > 0)
      .sort((a, b) => {
        const kindA = getCategoryKindById(a.id, categoryDefs);
        const kindB = getCategoryKindById(b.id, categoryDefs);
        const pa = priorityByKind[kindA] ?? 99;
        const pb = priorityByKind[kindB] ?? 99;
        if (pa !== pb) return pa - pb;
        return (categoryDefs[a.id]?.order ?? 99) - (categoryDefs[b.id]?.order ?? 99);
      });
  }, [dynamicPaletteGroups, categoryDefs, shiftDefs, countedOffShifts]);

  const pendingChangeRequests = useMemo(
    () => (Array.isArray(changeRequests) ? changeRequests.filter(r => r && r.status === 'pending') : []),
    [changeRequests]
  );

  const myChangeRequests = useMemo(() => {
    if (!appUser) return [];
    return (Array.isArray(changeRequests) ? changeRequests : []).filter(
      r => r && (r.requesterId === appUser.id || r.targetStaffId === appUser.id)
    );
  }, [changeRequests, appUser]);

  const pendingChangeRequestMapByStaffDay = useMemo(() => {
    const map = {};
    pendingChangeRequests.forEach(req => {
      const addEntry = (sId, d) => {
        if (!sId || !d) return;
        const key = `${sId}_${d}`;
        if (!map[key]) map[key] = [];
        map[key].push(req);
      };
      addEntry(req.requesterId, req.requesterDay);
      if ((req.requestType || req.type) === 'swap') {
        addEntry(req.targetStaffId, req.targetDay || req.requesterDay);
      }
    });
    return map;
  }, [pendingChangeRequests]);

  const getDayOfWeekStr = (y, m, d) => ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];

  const formatShiftCodeLabel = (code) => {
    if (!code || code === '__CLEAR__') return '空欄(公休)';
    const def = shiftDefs[code];
    return def ? (def.label || code) : code;
  };

  const formatTaskCodeLabel = (code) => {
    if (!code || code === '__CLEAR__') return 'なし';
    const def = shiftDefs[code];
    return def ? (def.label || code) : code;
  };

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



  // #1: 各日の「施設シフト以外（委・日勤・3以外・出勤など）で施設未割当の人数」をカウント
  const dailyUnassignedWorkReqCountMap = useMemo(() => {
    const map = {};
    daysArray.forEach(day => {
      if (isSunday(year, month, day)) {
        map[day] = 0;
        return;
      }
      let cnt = 0;
      displayStaffList.forEach(s => {
        // 役職が「顧問」の職員は未割当カウント対象外
        if (s.jobTitle === '顧問') return;
        const sCode = shiftData[s.id]?.[day];
        const sDef = sCode ? shiftDefs[sCode] : null;
        const rawReq = userInputs?.[s.id]?.[day];
        const reqCode =
          rawReq === true
            ? sCode || null
            : typeof rawReq === 'string'
              ? rawReq
              : rawReq && typeof rawReq === 'object'
                ? rawReq.shift || null
                : null;
        const reqDef = reqCode ? shiftDefs[reqCode] : null;
        if (sDef && isWorkRequestShiftDef(sDef, categoryDefs)) {
          cnt += 1;
        } else if (!sDef && reqDef && isWorkRequestShiftDef(reqDef, categoryDefs)) {
          cnt += 1;
        }
      });
      map[day] = cnt;
    });
    return map;
  }, [daysArray, year, month, displayStaffList, shiftData, shiftDefs, categoryDefs, userInputs]);

  const applyAuthenticatedUser = useCallback((user, { persist = true } = {}) => {
    if (!user) return;
    setAppUser(user);
    if (user.initialView) {
      setCurrentView(user.initialView);
    } else {
      setCurrentView('all'); // 職員の場合は必ず'all'にリセット
    }
    if (user.role === 'admin') {
      setTargetAdminKey(user.initialView || 'all');
      if (user.initialView !== 'all') {
        setActiveSettingsTab(prev => (prev === 'teamAdmin' ? 'password' : prev));
      }
    }
    if (user.role === 'staff') {
      setViewMode('personal');
    }
    if (persist) {
      writeSavedAuthSession(user, adminSettings);
    }
  }, [adminSettings]);

  const handleLogout = () => {
    writeSavedAuthSession(null);
    setAppUser(null);
    setCurrentView('all');
    setViewMode('personal');
    setActivePopup(null);
  };

  const handleChangeMonth = (delta) => {
    let nm = month + delta;
    let ny = year;
    if (nm < 1) {
      nm = 12;
      ny -= 1;
    } else if (nm > 12) {
      nm = 1;
      ny += 1;
    }
    // 次月・前月へ移動した瞬間に当月データが表示/誤保存されないよう即座にクリア
    updateLoadedScheduleId(null);
    setActivePopup(null);
    setShiftData({});
    setTaskData({});
    setBellData({});
    setLeaderData({});
    setUserInputs({});
    setPrevMonthShiftData({});
    setChangeLogs([]);
    setChangeRequests([]);
    setMonth(nm);
    setYear(ny);
  };

  const printStaffList = useMemo(() => {
    const team = TEAMS.find(t => t.id === printTeamFilter);
    if (team && team.role) {
      return staffList.filter(s => Array.isArray(s.roles) && s.roles.includes(team.role));
    }
    return staffList;
  }, [staffList, printTeamFilter]);

  const printPaperMetrics = useMemo(() => {
    const preset = PRINT_PAPER_PRESETS[printPaperSize] || PRINT_PAPER_PRESETS.A4;
    const widthMm = printOrientation === 'landscape' ? preset.longMm : preset.shortMm;
    const heightMm = printOrientation === 'landscape' ? preset.shortMm : preset.longMm;
    const printableWidthPx = Math.floor((widthMm - PRINT_MARGIN_MM * 2) * PRINT_PX_PER_MM);
    const printableHeightPx = Math.floor((heightMm - PRINT_MARGIN_MM * 2) * PRINT_PX_PER_MM);
    const widthPx = Math.round(widthMm * PRINT_PX_PER_MM);
    const heightPx = Math.round(heightMm * PRINT_PX_PER_MM);
    const fitScaleW = (printableWidthPx - 6) / Math.max(1, printMeasuredSize.width);
    const fitScaleH = (printableHeightPx - 6) / Math.max(1, printMeasuredSize.height);
    const autoFitScale = Math.max(0.25, Math.min(1, fitScaleW, fitScaleH));
    const effectiveScale =
      printFitMode === 'auto'
        ? autoFitScale
        : Math.max(0.3, Math.min(1.2, (Number(printManualScale) || 100) / 100));
    return {
      label: preset.label,
      widthMm,
      heightMm,
      widthPx,
      heightPx,
      printableWidthPx,
      printableHeightPx,
      autoFitScale,
      effectiveScale,
    };
  }, [printPaperSize, printOrientation, printMeasuredSize, printFitMode, printManualScale]);

  useLayoutEffect(() => {
    if (!showPrintModal || !printSheetMeasureRef.current) return;
    const el = printSheetMeasureRef.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w > 0 && h > 0) {
      setPrintMeasuredSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    }
  }, [
    showPrintModal,
    printTeamFilter,
    printShowJobTitle,
    printShowMarks,
    printOrientation,
    adminCountDisplayMode,
    adminRightFlatShifts.length,
    printStaffList,
    year,
    month,
    daysInMonth,
  ]);

  const handleOpenPrintModal = () => {
    setActivePopup(null);
    const initialTeam =
      appUser?.role === 'admin' && appUser.initialView && appUser.initialView !== 'all'
        ? appUser.initialView
        : currentView || 'all';
    setPrintTeamFilter(initialTeam);
    setShowPrintModal(true);
  };

  useEffect(() => {
    return () => {
      if (headerNoticeTimerRef.current) clearTimeout(headerNoticeTimerRef.current);
      if (excelCopyDoneTimerRef.current) clearTimeout(excelCopyDoneTimerRef.current);
    };
  }, []);

  const showHeaderNotice = (message) => {
    setHeaderNotice(message);
    if (headerNoticeTimerRef.current) clearTimeout(headerNoticeTimerRef.current);
    headerNoticeTimerRef.current = setTimeout(() => {
      setHeaderNotice(null);
    }, 3200);
  };

  const showHeaderTooltip = (e, label) => {
    if (!label || !e?.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawCenterX = rect.left + rect.width / 2;
    const clampedX = typeof window !== 'undefined'
      ? Math.min(Math.max(rawCenterX, 90), window.innerWidth - 90)
      : rawCenterX;
    setHeaderTooltip({
      label,
      x: clampedX,
      y: rect.bottom + 8,
    });
  };

  const hideHeaderTooltip = () => {
    setHeaderTooltip(null);
  };

  const handleExportExcel = () => {
    hideHeaderTooltip();
    setActivePopup(null);
    if (displayStaffList.length === 0) {
      showHeaderNotice('出力対象の職員が表示されていません。');
      return;
    }
    try {
      const xlsxBytes = buildShiftExcelXlsxBytes({
        year,
        month,
        daysArray,
        staffList: displayStaffList,
        shiftData,
        shiftDefs,
        isReqCategory: (catId) => isReqCategoryId(catId, categoryDefs),
        getDayOfWeek,
        // Excel側にコード39(Z1)はないため曜日問わず10(Z)へ変換して出力
        transformCode: (c) => (c === '39' ? '10' : c),
        sheetName: 'in',
      });
      const blob = new Blob([xlsxBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const activeTeam = TEAMS.find((t) => t.id === currentView);
      const teamSuffix = activeTeam && activeTeam.id !== 'all' ? `_${activeTeam.label}` : '';
      a.href = url;
      a.download = `シフト表_${year}年${String(month).padStart(2, '0')}月${teamSuffix}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showHeaderNotice(`Excel出力完了（${displayStaffList.length}名分・inシート形式）`);
    } catch (err) {
      console.error('Excel export error:', err);
      showHeaderNotice('Excel出力に失敗しました。');
    }
  };

  const handleCopyShiftCodesForExcel = async () => {
    hideHeaderTooltip();
    setActivePopup(null);
    if (displayStaffList.length === 0) {
      showHeaderNotice('コピー対象の職員が表示されていません。');
      return;
    }
    const tsv = buildShiftCodeTsv({
      staffList: displayStaffList,
      daysArray,
      shiftData,
      shiftDefs,
      isReqCategory: (catId) => isReqCategoryId(catId, categoryDefs),
      // Excel側にコード39(Z1)はないため曜日問わず10(Z)へ変換してコピー
      transformCode: (c) => (c === '39' ? '10' : c),
    });
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(tsv);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err) {
        console.error('Clipboard fallback copy error:', err);
      }
    }
    if (copied) {
      setExcelCopyDone(true);
      if (excelCopyDoneTimerRef.current) clearTimeout(excelCopyDoneTimerRef.current);
      excelCopyDoneTimerRef.current = setTimeout(() => setExcelCopyDone(false), 2200);
      showHeaderNotice(`1日〜${daysArray.length}日のコードをコピーしました（${displayStaffList.length}名分・Excelのinタブに貼付可）`);
    } else {
      showHeaderNotice('クリップボードへのコピーに失敗しました。');
    }
  };

  const handleToggleExcelMenu = (e) => {
    e.stopPropagation();
    hideHeaderTooltip();
    setActivePopup(null);
    if (excelMenuAnchor) {
      setExcelMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 236;
    const left = typeof window !== 'undefined'
      ? Math.min(Math.max(rect.left, 8), window.innerWidth - menuWidth - 8)
      : rect.left;
    setExcelMenuAnchor({
      left,
      top: rect.bottom + 6,
    });
  };

  const handleTriggerExcelImport = () => {
    hideHeaderTooltip();
    setExcelMenuAnchor(null);
    setActivePopup(null);
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
      excelFileInputRef.current.click();
    }
  };

  const handleExcelFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseShiftExcelArrayBuffer({
        arrayBuffer,
        fileName: file.name,
        year,
        month,
        staffList: displayStaffList,
        daysArray,
        shiftDefs,
        isReqCategory: (catId) => isReqCategoryId(catId, categoryDefs),
        isUpperShift: (def) => getEffectiveShiftType(def, categoryDefs) === 'shift',
        getDayOfWeek,
        // Excel取り込み時、火・木・土のコード10(Z)は半日扱いのコード39(Z1)へ自動変換
        transformImportedCode: (c, { dow }) => {
          if (c === '10' && (dow === 2 || dow === 4 || dow === 6) && shiftDefs['39']) {
            return '39';
          }
          return c;
        },
      });
      setExcelImportMode('overwrite_all');
      setExcelImportPreview(parsed);
    } catch (err) {
      console.error('Excel import parse error:', err);
      showHeaderNotice(err?.message || 'Excelファイルの読み込みに失敗しました。');
    } finally {
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
    }
  };

  const excelImportPlan = useMemo(() => {
    if (!excelImportPreview) return null;
    return computeExcelImportPlan({
      parsedResult: excelImportPreview,
      currentShiftData: shiftData,
      mode: excelImportMode,
    });
  }, [excelImportPreview, shiftData, excelImportMode]);

  const handleConfirmExcelImport = async () => {
    if (!excelImportPreview || !excelImportPlan || isImportingExcel) return;
    setIsImportingExcel(true);
    try {
      const modeLabel = excelImportMode === 'overwrite_all' ? 'すべて上書き' : '空欄のみ反映';
      recordAdminUndoSnapshot(null, {
        label: 'Excel読込',
        detail: `${excelImportPreview.fileName}（${modeLabel}・${excelImportPlan.totalChanges}セル）`,
      });
      setShiftData(excelImportPlan.nextShifts);
      // 上段シフトのみ更新し、下段タスク・希望履歴・理由・ベル・リーダー等はそのまま保持
      await saveSchedule(
        excelImportPlan.nextShifts,
        taskData,
        userInputs,
        bellData,
        leaderData,
        changeRequests
      );
      showHeaderNotice(
        `Excel読込完了（${excelImportPlan.affectedStaffCount}名・${excelImportPlan.totalChanges}セル反映）`
      );
      setExcelImportPreview(null);
    } catch (err) {
      console.error('Excel import apply error:', err);
      showHeaderNotice('Excel読み込みの保存に失敗しました。');
    } finally {
      setIsImportingExcel(false);
    }
  };

  // --- 管理者編集の戻る・進む（Undo / Redo） ---
  const cloneScheduleSnapshot = (snap) => ({
    shifts: JSON.parse(JSON.stringify(snap?.shifts || {})),
    tasks: JSON.parse(JSON.stringify(snap?.tasks || {})),
    userInputs: JSON.parse(JSON.stringify(snap?.userInputs || {})),
    bells: JSON.parse(JSON.stringify(snap?.bells || {})),
    leaders: JSON.parse(JSON.stringify(snap?.leaders || {})),
  });

  useEffect(() => {
    scheduleSnapshotRef.current = {
      shifts: shiftData,
      tasks: taskData,
      userInputs,
      bells: bellData,
      leaders: leaderData,
    };
  }, [shiftData, taskData, userInputs, bellData, leaderData]);

  const commitUndoHistory = (nextHistory) => {
    undoHistoryRef.current = nextHistory;
    setUndoHistory(nextHistory);
    const key = activeUndoHistoryKeyRef.current;
    if (key) {
      saveUndoHistory(key, nextHistory);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const emptyHistory = { past: [], future: [] };
    undoHistoryRef.current = emptyHistory;
    setUndoHistory(emptyHistory);
    setShowUndoHistoryModal(false);

    if (appUser?.role !== 'admin') {
      activeUndoHistoryKeyRef.current = null;
      return undefined;
    }

    const historyKey = buildUndoHistoryKey({
      appId,
      year,
      month,
      adminScope: appUser.initialView || 'all',
    });
    activeUndoHistoryKeyRef.current = historyKey;

    loadUndoHistory(historyKey).then((loaded) => {
      if (cancelled || activeUndoHistoryKeyRef.current !== historyKey) return;
      undoHistoryRef.current = loaded;
      setUndoHistory(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [year, month, appUser?.role, appUser?.initialView]);

  const handleClearCurrentMonthHistory = async () => {
    if (!appUser || appUser.role !== 'admin') return;
    const total = (undoHistoryRef.current.past?.length || 0) + (undoHistoryRef.current.future?.length || 0);
    if (total === 0) return;
    const ok = window.confirm(
      `${year}年${month}月の変更履歴（${total}件）をすべて消去しますか？\n※現在の勤務表データ自体は変更されません。`
    );
    if (!ok) return;
    const emptyHistory = { past: [], future: [] };
    undoHistoryRef.current = emptyHistory;
    setUndoHistory(emptyHistory);
    const key = activeUndoHistoryKeyRef.current;
    if (key) {
      await deleteUndoHistory(key);
    }
    showHeaderNotice(`${year}年${month}月の変更履歴をクリアしました`);
  };

  const recordAdminUndoSnapshot = (customSnapshot = null, actionMeta = null) => {
    if (!appUser || appUser.role !== 'admin') return;
    const baseSnap = cloneScheduleSnapshot(customSnapshot || scheduleSnapshotRef.current);
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const meta = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: actionMeta?.label || 'シフト編集',
      detail: actionMeta?.detail || '',
      timeStr,
    };
    const nextPast = [...undoHistoryRef.current.past, { snapshot: baseSnap, actionMeta: meta }].slice(-50);
    const nextHistory = { past: nextPast, future: [] };
    commitUndoHistory(nextHistory);
  };

  const applyScheduleSnapshotForHistory = (snapshot) => {
    if (!snapshot) return;
    const restored = cloneScheduleSnapshot(snapshot);
    scheduleSnapshotRef.current = restored;
    setActivePopup(null);
    setShiftData(restored.shifts);
    setTaskData(restored.tasks);
    setUserInputs(restored.userInputs);
    setBellData(restored.bells);
    setLeaderData(restored.leaders);
    saveSchedule(restored.shifts, restored.tasks, restored.userInputs, restored.bells, restored.leaders);
  };

  const handleUndoSchedule = () => {
    if (!appUser || appUser.role !== 'admin') return;
    if (isAutoFillRunningRef.current) return;
    if (loadedScheduleIdRef.current !== `schedule_${year}_${month}`) return;
    const { past, future } = undoHistoryRef.current;
    if (past.length === 0) return;

    const lastEntry = past[past.length - 1];
    const targetSnapshot = lastEntry.snapshot || lastEntry;
    const currentSnapshot = cloneScheduleSnapshot(scheduleSnapshotRef.current);
    const nextHistory = {
      past: past.slice(0, -1),
      future: [{ snapshot: currentSnapshot, actionMeta: lastEntry.actionMeta || { label: 'シフト編集', detail: '', timeStr: '' } }, ...future].slice(0, 50),
    };
    commitUndoHistory(nextHistory);
    applyScheduleSnapshotForHistory(targetSnapshot);
  };

  const handleRedoSchedule = () => {
    if (!appUser || appUser.role !== 'admin') return;
    if (isAutoFillRunningRef.current) return;
    if (loadedScheduleIdRef.current !== `schedule_${year}_${month}`) return;
    const { past, future } = undoHistoryRef.current;
    if (future.length === 0) return;

    const nextEntry = future[0];
    const targetSnapshot = nextEntry.snapshot || nextEntry;
    const currentSnapshot = cloneScheduleSnapshot(scheduleSnapshotRef.current);
    const nextHistory = {
      past: [...past, { snapshot: currentSnapshot, actionMeta: nextEntry.actionMeta || { label: 'シフト編集', detail: '', timeStr: '' } }].slice(-50),
      future: future.slice(1),
    };
    commitUndoHistory(nextHistory);
    applyScheduleSnapshotForHistory(targetSnapshot);
  };

  const handleJumpToHistoryStep = (targetStep) => {
    if (!appUser || appUser.role !== 'admin') return;
    if (isAutoFillRunningRef.current) return;
    if (loadedScheduleIdRef.current !== `schedule_${year}_${month}`) return;
    const { past, future } = undoHistoryRef.current;
    const currentStep = past.length;
    const totalActions = past.length + future.length;
    if (targetStep === currentStep || targetStep < 0 || targetStep > totalActions) return;
    const currentSnapshot = cloneScheduleSnapshot(scheduleSnapshotRef.current);
    const allActions = [
      ...past.map(p => p.actionMeta || { label: 'シフト編集', detail: '', timeStr: '' }),
      ...future.map(f => f.actionMeta || { label: 'シフト編集', detail: '', timeStr: '' }),
    ];
    const allStates = [
      ...past.map(p => p.snapshot || p),
      currentSnapshot,
      ...future.map(f => f.snapshot || f),
    ];
    const nextPast = Array.from({ length: targetStep }, (_, i) => ({
      snapshot: allStates[i],
      actionMeta: allActions[i],
    }));
    const nextFuture = Array.from({ length: totalActions - targetStep }, (_, idx) => {
      const i = targetStep + idx;
      return {
        snapshot: allStates[i + 1],
        actionMeta: allActions[i],
      };
    });
    const nextHistory = { past: nextPast, future: nextFuture };
    commitUndoHistory(nextHistory);
    applyScheduleSnapshotForHistory(allStates[targetStep]);
  };

  const undoRedoActionsRef = useRef({ undo: () => {}, redo: () => {} });
  undoRedoActionsRef.current = { undo: handleUndoSchedule, redo: handleRedoSchedule };

  useEffect(() => {
    if (!appUser || appUser.role !== 'admin') return;
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (undoHistoryRef.current.past.length > 0) {
          e.preventDefault();
          undoRedoActionsRef.current.undo();
        }
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        if (undoHistoryRef.current.future.length > 0) {
          e.preventDefault();
          undoRedoActionsRef.current.redo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appUser]);

  // ページ再読み込み時に保存済みセッションからログイン状態を自動復元
  useEffect(() => {
    if (!isDataLoaded || !isRestoringSession) return;
    const saved = readSavedAuthSession();
    let restoredUser = null;
    if (saved?.role === 'admin') {
      const viewKey = saved.initialView || 'all';
      const adminEntry = adminSettings?.[viewKey];
      if (adminEntry && (!saved.sig || saved.sig === createAuthFingerprint(adminEntry.password ?? ''))) {
        restoredUser = { role: 'admin', name: '管理者', initialView: viewKey };
      }
    } else if (saved?.role === 'staff') {
      const matchedStaff = staffList.find(s => s.id === saved.staffId);
      if (matchedStaff && (!saved.sig || saved.sig === createAuthFingerprint(matchedStaff.password ?? ''))) {
        restoredUser = { role: 'staff', ...matchedStaff };
      }
    }
    if (restoredUser) {
      applyAuthenticatedUser(restoredUser, { persist: false });
    } else {
      writeSavedAuthSession(null);
    }
    setIsRestoringSession(false);
  }, [isDataLoaded, isRestoringSession, adminSettings, staffList, applyAuthenticatedUser]);

  // --- Render ---
  if (!appUser && isRestoringSession) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white px-6 py-5 rounded-xl shadow flex items-center gap-3 text-gray-700 font-bold text-sm">
        <Loader2 className="animate-spin text-blue-600" size={20} />
        <span>ログイン状態を確認中...</span>
      </div>
    </div>
  );

  if (!appUser) return (
    <LoginScreen 
      onLogin={(user) => applyAuthenticatedUser(user, { persist: true })} 
      staffList={staffList} adminSettings={adminSettings}
      isDataLoaded={isDataLoaded} // ★追加
    />
  );
  
  const getPopupOptions = (type, day = activePopup?.day) => {
    const orderedCodes = dynamicPaletteGroups.flatMap(g => g.items);
    let opts = orderedCodes.map(code => shiftDefs[code]).filter(s => s && getEffectiveShiftType(s, categoryDefs) === type);

    // 日曜日は「公出」のみ入力可能（タスクは対象外）
    if (day && isSunday(year, month, day)) {
      if (type !== 'shift') return [];
      opts = opts.filter(s => isKoushutsuShiftDef(s, categoryDefs));
      const activeTeamOnSun = getActiveTeamAdminKey();
      if (activeTeamOnSun) {
        const allowedSunSet = new Set(resolveTeamAllowedShiftCodes(activeTeamOnSun, adminSettings, shiftDefs, categoryDefs));
        opts = opts.filter(s => allowedSunSet.has(s.code));
      }
      return opts;
    }

    const activeTeamKey = getActiveTeamAdminKey();
    if (activeTeamKey) {
      const allowedSet = new Set(
        type === 'task'
          ? resolveTeamAllowedTaskCodes(activeTeamKey, adminSettings, shiftDefs, categoryDefs)
          : resolveTeamAllowedShiftCodes(activeTeamKey, adminSettings, shiftDefs, categoryDefs)
      );
      opts = opts.filter(s => allowedSet.has(s.code));
      if (activeTeamKey === 'ope' && type === 'shift') {
        opts = [...opts].sort((a, b) => {
          const getRank = (item) => {
            const lbl = (item.label || '').trim();
            if (item.code === 'L' || lbl === 'L' || lbl === 'Ｌ') return 0;
            if (item.code === 'G' || lbl === 'G' || lbl === 'Ｇ') return 1;
            return 2;
          };
          const rankDiff = getRank(a) - getRank(b);
          return rankDiff !== 0 ? rankDiff : 0;
        });
      }
      return opts;
    }

    if (appUser.role === 'staff' && currentView === 'all' && currentView !== 'ope') {
      // 希望カテゴリ(req)、isRequestable が true のもの、または「公出」を表示させる
      opts = opts.filter(s => isReqCategoryId(s.category, categoryDefs) || s.isRequestable || isKoushutsuShiftDef(s, categoryDefs));
      
      // ★追加: 「希望」カテゴリが必ず一番上(配列の先頭)になるように並び替え
      opts.sort((a, b) => {
        const aReq = isReqCategoryId(a.category, categoryDefs);
        const bReq = isReqCategoryId(b.category, categoryDefs);
        if (aReq && !bReq) return -1;
        if (!aReq && bReq) return 1;
        return 0; // それ以外は元の順序を維持
      });
    }
    return opts;
  };

  const renderPrintScheduleSheet = () => {
    const printTeamObj = TEAMS.find(t => t.id === printTeamFilter);
    const showPrintPersonalSummary = printOrientation === 'landscape' && adminRightFlatShifts.length > 0;
    return (
      <div className="bg-white text-gray-900 pb-1.5 pr-1">
        <div className="flex items-end justify-between gap-4 mb-1.5 px-0.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-bold text-gray-900 leading-none">
              {year}年{month}月 勤務表{printTeamObj?.role ? `（${printTeamObj.label}）` : ''}
            </h2>
            <span className="text-[10px] text-gray-600 font-medium">対象 {printStaffList.length}名</span>
            {showPrintPersonalSummary && (
              <span className="text-[9px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                個人集計（{adminCountDisplayMode === 'slot' ? 'シフト表示別' : '施設別'}）付き
              </span>
            )}
          </div>
          <div className="text-[9px] text-gray-500 whitespace-nowrap">
            背景色：リーダー（施設色）・ME室(灰)・HHD(黄)・緊急待機番(橙)
            {printShowMarks ? ' ／ マーク：個人希望(桃)・班固定(緑)' : ''}
          </div>
        </div>
        <table className="border-collapse border border-gray-400 bg-white text-gray-800">
          <thead>
            <tr>
              <th
                rowSpan={showPrintPersonalSummary ? 2 : 1}
                className="min-w-[96px] px-1.5 py-1 text-left border border-gray-400 bg-gray-100 text-[10px] font-bold whitespace-nowrap"
              >
                氏名
              </th>
              {daysArray.map(day => {
                const isSun = isSunday(year, month, day);
                const isHol = isHoliday(year, month, day, clinicClosedDays);
                const dow = getDayOfWeek(year, month, day);
                const thColor =
                  isSun || isHol
                    ? 'bg-red-50 text-red-600'
                    : dow === 6
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-gray-50 text-gray-800';
                return (
                  <th
                    key={day}
                    rowSpan={showPrintPersonalSummary ? 2 : 1}
                    className={`w-[32px] min-w-[32px] px-0.5 py-0.5 text-center border border-gray-400 ${thColor}`}
                  >
                    <div className="text-[10px] font-bold leading-tight">{day}</div>
                    <div className="text-[9px] font-normal leading-none">
                      {['日', '月', '火', '水', '木', '金', '土'][dow]}
                    </div>
                  </th>
                );
              })}
              {showPrintPersonalSummary && (
                <>
                  <th
                    rowSpan={2}
                    className="w-[10px] min-w-[10px] bg-gray-100 border border-gray-400 p-0"
                    aria-hidden="true"
                  />
                  {adminRightCountGroups.map(grp => (
                    <th
                      key={grp.id}
                      colSpan={grp.shifts.length}
                      className={`px-1 py-0.5 text-center border border-gray-400 text-[9px] font-bold whitespace-nowrap ${grp.headerColor}`}
                    >
                      {grp.label}
                    </th>
                  ))}
                </>
              )}
            </tr>
            {showPrintPersonalSummary && (
              <tr>
                {adminRightFlatShifts.map(item => (
                  <th
                    key={`${item.groupId}_${item.shift.code}`}
                    className="w-[24px] min-w-[24px] px-0.5 py-0.5 text-center border border-gray-400 bg-gray-50 text-[9px] font-bold whitespace-nowrap"
                  >
                    <span className={item.shift.text || 'text-gray-700'}>{item.shift.label}</span>
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {printStaffList.map(staff => (
              <tr key={staff.id}>
                <td className="px-1.5 py-0.5 border border-gray-400 bg-white text-left whitespace-nowrap">
                  <div className="text-[11px] font-bold leading-tight text-gray-900 flex items-center gap-1">
                    <span>{staff.name}</span>
                    {printShowMarks && (
                      <span className="inline-flex items-center gap-0.5">
                        {staff.skills?.isLeader && <ShieldCheck size={9} className="text-blue-500" />}
                        {staff.skills?.isVeteran && <Star size={9} className="text-yellow-500" />}
                        {getStaffRestrictionSummaryText(staff) && <ListFilter size={9} className="text-amber-500" />}
                        {staff.excludeFromAi && <Lock size={9} className="text-red-500" />}
                      </span>
                    )}
                  </div>
                  {printShowJobTitle && staff.jobTitle && (
                    <div className="text-[8px] leading-tight text-gray-500">{staff.jobTitle}</div>
                  )}
                </td>
                {daysArray.map(day => {
                  const shiftCode = shiftData[staff.id]?.[day];
                  const taskCode = taskData[staff.id]?.[day];
                  const hasBell = Boolean(bellData[staff.id]?.[day]);
                  const autoShiftHighlight = autoShiftHighlightMap[`${staff.id}_${day}`];
                  const shift = shiftDefs[shiftCode];
                  const task = shiftDefs[taskCode];
                  const isSun = isSunday(year, month, day);
                  const reqShiftCode = printShowMarks ? getUserRequestedShift(staff.id, day) : null;
                  const reqShift = reqShiftCode ? shiftDefs[reqShiftCode] : null;
                  const reqReason = printShowMarks ? getUserRequestedReason(staff.id, day) : null;
                  const reqTaskCode = printShowMarks ? getUserRequestedTask(staff.id, day) : null;
                  const reqTask = reqTaskCode ? shiftDefs[reqTaskCode] : null;
                  const teamShiftLock = printShowMarks ? getTeamLockedShiftSource(staff.id, day) : null;
                  const teamTaskLock = printShowMarks ? getTeamLockedTaskSource(staff.id, day) : null;
                  const shiftBg = autoShiftHighlight
                    ? autoShiftHighlight.bgClass
                    : isSun
                      ? 'bg-red-50'
                      : 'bg-white';
                  const taskBg = hasBell ? 'bg-orange-200' : isSun ? 'bg-red-50' : 'bg-white';
                  return (
                    <td key={day} className="p-0 border border-gray-400 text-center align-middle">
                      <div className="flex flex-col w-full">
                        <div className={`relative h-[17px] flex items-center justify-center border-b border-gray-200 ${shiftBg}`}>
                          {printShowMarks && teamShiftLock && (
                            <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500" />
                          )}
                          {printShowMarks && reqShiftCode && (
                            shiftCode !== reqShiftCode ? (
                              <span className="absolute top-0 right-0 px-0.5 rounded-bl text-[6.5px] leading-tight bg-pink-100 text-pink-700 border-l border-b border-pink-200 font-bold max-w-[20px] truncate">
                                {reqShift?.label || reqShiftCode}
                              </span>
                            ) : reqReason ? (
                              <span className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-pink-500 border-l-[6px] border-l-transparent" />
                            ) : (
                              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-pink-500" />
                            )
                          )}
                          {shift ? (
                            <span className={`font-bold text-[10px] leading-none ${shift.text}`}>{shift.label}</span>
                          ) : null}
                        </div>
                        <div className={`relative h-[16px] flex items-center justify-center ${taskBg}`}>
                          {printShowMarks && teamTaskLock && (
                            <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500" />
                          )}
                          {printShowMarks && reqTaskCode && (
                            taskCode !== reqTaskCode && !task ? (
                              <span className="px-0.5 rounded text-[6.5px] leading-none bg-pink-100 text-pink-700 border border-pink-200 font-bold max-w-[28px] truncate">
                                {reqTask?.label || reqTaskCode}
                              </span>
                            ) : (
                              <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${taskCode !== reqTaskCode ? 'bg-pink-600' : 'bg-pink-400'}`} />
                            )
                          )}
                          {task ? (
                            <span className={`font-bold text-[9px] leading-none ${task.text || 'text-gray-700'}`}>
                              {task.label}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  );
                })}
                {showPrintPersonalSummary && (
                  <>
                    <td className="w-[10px] min-w-[10px] bg-gray-100 border border-gray-400 p-0" aria-hidden="true" />
                    {adminRightFlatShifts.map(item => {
                      const cnt = staffShiftCodeCounts[staff.id]?.[item.shift.code] || 0;
                      if (item.shift.isCool3Total) {
                        const minC3 = Number(staff.minCool3 ?? 0);
                        const maxC3 = Number(staff.maxCool3 ?? 5);
                        const isOverC3 = cnt > maxC3;
                        const isUnderC3 = minC3 > 0 && cnt < minC3;
                        return (
                          <td
                            key={`${item.groupId}_${item.shift.code}`}
                            className={`w-[24px] min-w-[24px] px-0.5 py-0.5 border border-gray-400 text-center text-[10px] font-extrabold ${
                              isOverC3
                                ? 'bg-red-100 text-red-700'
                                : isUnderC3
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-purple-50 text-purple-900'
                            }`}
                          >
                            {cnt > 0 ? cnt : <span className="text-gray-400 font-normal">0</span>}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={`${item.groupId}_${item.shift.code}`}
                          className="w-[24px] min-w-[24px] px-0.5 py-0.5 border border-gray-400 text-center text-[10px] font-bold bg-white"
                        >
                          {cnt > 0 ? (
                            <span className={item.shift.text || 'text-gray-800'}>{cnt}</span>
                          ) : (
                            <span className="text-gray-300 font-normal">-</span>
                          )}
                        </td>
                      );
                    })}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div
        className={`flex flex-col h-screen bg-gray-100 text-sm font-sans ${showPrintModal ? 'print:hidden' : ''}`}
        onClick={() => {
          if (popupJustDraggedRef.current) {
            popupJustDraggedRef.current = false;
            return;
          }
          setActivePopup(null);
          setExcelMenuAnchor(null);
        }}
      >
        <header className="bg-white border-b border-gray-200 p-2 sm:px-4 sm:py-3 shadow-sm flex items-center justify-between sticky top-0 z-[60] gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="flex items-center bg-gray-50 rounded-lg p-1 border shrink-0">
              <button onClick={() => handleChangeMonth(-1)} className="p-1 hover:bg-gray-200 rounded" title="前月"><ChevronLeft size={18} className="sm:w-5 sm:h-5" /></button>
              <div className="px-2 sm:px-4 font-bold text-sm sm:text-lg text-gray-700 min-w-[70px] sm:min-w-[100px] text-center whitespace-nowrap flex items-center justify-center gap-1">
                <span>{year}/{month}</span>
                {loadedScheduleId !== `schedule_${year}_${month}` && (
                  <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" title="読み込み中" />
                )}
              </div>
              <button onClick={() => handleChangeMonth(1)} className="p-1 hover:bg-gray-200 rounded" title="次月"><ChevronRight size={18} className="sm:w-5 sm:h-5" /></button>
            </div>
            <span className={`px-2 py-1.5 rounded text-xs font-bold shrink-0 truncate max-w-[110px] sm:max-w-none ${appUser.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {appUser.role === 'admin' ? (adminSettings[appUser.initialView]?.label || '管理者') : `${appUser.name}`}
            </span>
            
            {appUser.role === 'admin' && (
              <div className="flex items-center bg-gray-100 rounded p-1 border shrink-0">
                {TEAMS.filter(team => appUser.initialView === 'all' || team.id === appUser.initialView).map(team => (
                  <button key={team.id} onClick={() => { setCurrentView(team.id); if(appUser.role==='staff') setViewMode('all'); }} className={`px-2 sm:px-3 py-1 text-xs rounded transition ${currentView === team.id ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-200'}`}>{team.label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 justify-end ml-auto">
           {appUser.role === 'admin' && (
             <div className="flex items-center bg-gray-50 rounded-lg p-0.5 border border-gray-300 shadow-sm shrink-0">
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); handleUndoSchedule(); }}
                 disabled={undoHistory.past.length === 0}
                 onMouseEnter={(e) => showHeaderTooltip(e, undoHistory.past.length > 0 ? `編集を1つ戻る（残り${undoHistory.past.length}件・Ctrl+Z）` : '戻せる編集がありません')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, undoHistory.past.length > 0 ? `編集を1つ戻る（残り${undoHistory.past.length}件・Ctrl+Z）` : '戻せる編集がありません')}
                 onBlur={hideHeaderTooltip}
                 aria-label="戻る"
                 className="flex items-center gap-0.5 px-1.5 py-1 sm:py-1.5 rounded text-gray-700 hover:bg-gray-200 disabled:opacity-35 disabled:hover:bg-transparent transition font-bold text-xs"
               >
                 <ChevronLeft size={16} />
                 <span>戻る</span>
               </button>
               <div className="w-px h-4 bg-gray-300" />
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); setShowUndoHistoryModal(true); }}
                 onMouseEnter={(e) => showHeaderTooltip(e, '作業の履歴を確認・状態移行')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, '作業の履歴を確認・状態移行')}
                 onBlur={hideHeaderTooltip}
                 aria-label="履歴"
                 className="flex items-center gap-1 px-1.5 py-1 sm:py-1.5 rounded text-gray-700 hover:bg-gray-200 transition font-bold text-xs"
               >
                 <Clock size={14} className="text-indigo-600 shrink-0" />
                 <span>履歴</span>
                 {(undoHistory.past.length + undoHistory.future.length) > 0 && (
                   <span className="px-1 py-0.2 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-extrabold leading-none">
                     {undoHistory.past.length}/{undoHistory.past.length + undoHistory.future.length}
                   </span>
                 )}
               </button>
               <div className="w-px h-4 bg-gray-300" />
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); handleRedoSchedule(); }}
                 disabled={undoHistory.future.length === 0}
                 onMouseEnter={(e) => showHeaderTooltip(e, undoHistory.future.length > 0 ? `編集を1つ進む（残り${undoHistory.future.length}件・Ctrl+Y）` : '進める編集がありません')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, undoHistory.future.length > 0 ? `編集を1つ進む（残り${undoHistory.future.length}件・Ctrl+Y）` : '進める編集がありません')}
                 onBlur={hideHeaderTooltip}
                 aria-label="進む"
                 className="flex items-center gap-0.5 px-1.5 py-1 sm:py-1.5 rounded text-gray-700 hover:bg-gray-200 disabled:opacity-35 disabled:hover:bg-transparent transition font-bold text-xs"
               >
                 <span>進む</span>
                 <ChevronRight size={16} />
               </button>
             </div>
           )}
           {appUser.role === 'admin' && isMasterAdmin && (
             <>
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); handleOpenAutoFill(); }}
                 onMouseEnter={(e) => showHeaderTooltip(e, 'AI自動作成')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, 'AI自動作成')}
                 onBlur={hideHeaderTooltip}
                 aria-label="AI自動作成"
                 className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-yellow-50 to-orange-50 hover:from-yellow-100 hover:to-orange-100 text-orange-700 rounded transition font-bold border border-orange-200 shadow-sm shrink-0"
                 disabled={isAiLoading}
               >
                 {isAiLoading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
               </button>
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); setShowAiModal(true); }}
                 onMouseEnter={(e) => showHeaderTooltip(e, 'AIチャット')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, 'AIチャット')}
                 onBlur={hideHeaderTooltip}
                 aria-label="AIチャット"
                 className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-purple-100 to-indigo-100 hover:from-purple-200 hover:to-indigo-200 text-indigo-700 rounded transition font-bold border border-indigo-200 shadow-sm shrink-0"
               >
                 <Bot size={17} />
               </button>
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); handleOpenValidationModal(); }}
                 onMouseEnter={(e) => showHeaderTooltip(e, 'シフト検算チェック（連勤・3クール・必要人数・必須スキル）')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, 'シフト検算チェック（連勤・3クール・必要人数・必須スキル）')}
                 onBlur={hideHeaderTooltip}
                 aria-label="シフト検算チェック"
                 className={`relative flex items-center justify-center h-9 px-2.5 gap-1 rounded transition font-bold border shadow-sm shrink-0 ${
                   liveValidationReport.hardStaffViolationCount > 0
                     ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                     : liveValidationReport.filledOperatingDaysCount > 0 && liveValidationReport.totalActionableCount === 0
                       ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                       : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                 }`}
               >
                 <ShieldCheck size={17} />
                 {liveValidationReport.hardStaffViolationCount > 0 ? (
                   <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] leading-tight">
                     {liveValidationReport.hardStaffViolationCount}
                   </span>
                 ) : liveValidationReport.filledOperatingDaysCount > 0 && liveValidationReport.totalActionableCount > 0 ? (
                   <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] leading-tight">
                     {liveValidationReport.totalActionableCount}
                   </span>
                 ) : liveValidationReport.isFullMonthCreated && liveValidationReport.totalActionableCount === 0 ? (
                   <Check size={13} className="text-emerald-600" />
                 ) : null}
               </button>
             </>
           )}
           {appUser.role === 'admin' ? (
             <>
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); handleOpenPrintModal(); }}
                 onMouseEnter={(e) => showHeaderTooltip(e, '全体表を印刷（A4・B4・A3）')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, '全体表を印刷（A4・B4・A3）')}
                 onBlur={hideHeaderTooltip}
                 aria-label="全体表を印刷"
                 className="flex items-center justify-center w-9 h-9 bg-slate-50 hover:bg-slate-200 text-slate-700 rounded transition font-bold border border-slate-300 shadow-sm shrink-0"
               >
                 <Printer size={17} />
               </button>
               <button
                 type="button"
                 onClick={handleToggleExcelMenu}
                 onMouseEnter={(e) => showHeaderTooltip(e, 'Excel出力 / 貼り付け用コピー')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, 'Excel出力 / 貼り付け用コピー')}
                 onBlur={hideHeaderTooltip}
                 aria-label="Excel出力 / 貼り付け用コピー"
                 aria-expanded={Boolean(excelMenuAnchor)}
                 className={`flex items-center justify-center w-9 h-9 rounded transition font-bold border shadow-sm shrink-0 ${
                   excelCopyDone
                     ? 'bg-emerald-600 text-white border-emerald-600'
                     : excelMenuAnchor
                       ? 'bg-emerald-100 text-emerald-800 border-emerald-400 ring-2 ring-emerald-200'
                       : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                 }`}
               >
                 {excelCopyDone ? <Check size={17} /> : <FileSpreadsheet size={17} />}
               </button>
               <button
                 type="button"
                 onClick={handleTriggerExcelImport}
                 onMouseEnter={(e) => showHeaderTooltip(e, 'Excel読込（inシート .xls / .xlsx）')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, 'Excel読込（inシート .xls / .xlsx）')}
                 onBlur={hideHeaderTooltip}
                 aria-label="Excel読込"
                 className="flex items-center justify-center w-9 h-9 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded transition font-bold border border-sky-300 shadow-sm shrink-0"
               >
                 <FileUp size={17} />
               </button>
               <input
                 ref={excelFileInputRef}
                 type="file"
                 accept=".xls,.xlsx"
                 onChange={handleExcelFileSelected}
                 className="hidden"
               />
             </>
           ) : (
             <button
               type="button"
               onClick={handleOpenPrintModal}
               className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-50 hover:bg-slate-200 text-slate-700 rounded transition font-bold border border-slate-300 shadow-sm shrink-0"
               title="全体表を印刷（A4・B4・A3サイズ調整対応）"
             >
               <Printer size={16} className="sm:w-4 sm:h-4" /> <span className="hidden md:inline text-sm">印刷</span>
             </button>
           )}
           {appUser.role === 'admin' && isMasterAdmin && (
             <button
               type="button"
               onClick={() => { hideHeaderTooltip(); setShowAdminChangeRequestsModal(true); }}
               onMouseEnter={(e) => showHeaderTooltip(e, '締切後の勤務変更申請の確認・承認')}
               onMouseLeave={hideHeaderTooltip}
               onFocus={(e) => showHeaderTooltip(e, '締切後の勤務変更申請の確認・承認')}
               onBlur={hideHeaderTooltip}
               aria-label="変更申請"
               className={`flex items-center justify-center h-9 px-2.5 gap-1 rounded transition font-bold border shadow-sm shrink-0 ${
                 pendingChangeRequests.length > 0
                   ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                   : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
               }`}
             >
               <RefreshCw size={17} />
               {pendingChangeRequests.length > 0 && (
                 <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] leading-tight">
                   {pendingChangeRequests.length}
                 </span>
               )}
             </button>
           )}
           {appUser.role === 'admin' && (
             <button
               type="button"
               onClick={() => { hideHeaderTooltip(); handleResetSchedule(); }}
               onMouseEnter={(e) => showHeaderTooltip(e, isMasterAdmin ? 'AIが作成したシフトのみ全消去' : `${getLoggedInAdminDisplayLabel()}が編集したシフトのみ全消去`)}
               onMouseLeave={hideHeaderTooltip}
               onFocus={(e) => showHeaderTooltip(e, isMasterAdmin ? 'AIが作成したシフトのみ全消去' : `${getLoggedInAdminDisplayLabel()}が編集したシフトのみ全消去`)}
               onBlur={hideHeaderTooltip}
               aria-label="全消去"
               className="flex items-center justify-center w-9 h-9 bg-red-50 hover:bg-red-100 text-red-600 rounded transition font-bold border border-red-200 shadow-sm shrink-0"
             >
               <Trash2 size={17} />
             </button>
           )}
           {appUser.role === 'admin' && isMasterAdmin && (
             <button
               type="button"
               onClick={() => {
                 hideHeaderTooltip();
                 setEditingShift(null);
                 handleAddNewShift();
                 setShowSettingsModal(true);
               }}
               onMouseEnter={(e) => showHeaderTooltip(e, '設定')}
               onMouseLeave={hideHeaderTooltip}
               onFocus={(e) => showHeaderTooltip(e, '設定')}
               onBlur={hideHeaderTooltip}
               aria-label="設定"
               className="flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300 shadow-sm shrink-0"
             >
               <Settings size={17} />
             </button>
           )}
           {appUser.role === 'admin' && !isMasterAdmin && (
             <button
               type="button"
               onClick={() => {
                 hideHeaderTooltip();
                 setTargetAdminKey(appUser.initialView);
                 setNewPassword('');
                 setShowPasswordChangeModal(true);
               }}
               onMouseEnter={(e) => showHeaderTooltip(e, 'パスワード変更')}
               onMouseLeave={hideHeaderTooltip}
               onFocus={(e) => showHeaderTooltip(e, 'パスワード変更')}
               onBlur={hideHeaderTooltip}
               aria-label="パスワード変更"
               className="flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition font-bold border border-gray-300 shadow-sm shrink-0"
             >
               <Key size={17} />
             </button>
           )}
           {appUser.role === 'admin' && (
             <>
               <div className="hidden sm:block h-6 w-px bg-gray-300 mx-0.5"></div>
               <button
                 type="button"
                 onClick={() => { hideHeaderTooltip(); handleLogout(); }}
                 onMouseEnter={(e) => showHeaderTooltip(e, 'ログアウト')}
                 onMouseLeave={hideHeaderTooltip}
                 onFocus={(e) => showHeaderTooltip(e, 'ログアウト')}
                 onBlur={hideHeaderTooltip}
                 aria-label="ログアウト"
                 className="flex items-center justify-center w-9 h-9 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition shrink-0"
               >
                 <LogOut size={17} />
               </button>
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
               <button onClick={handleLogout} className="flex items-center justify-center p-1.5 sm:px-3 sm:py-1.5 hover:bg-red-100 hover:text-red-600 text-gray-600 rounded-md transition shrink-0" title="ログアウト">
                 <LogOut size={16} /> <span className="hidden sm:inline ml-1 text-sm font-bold">ログアウト</span>
               </button>
             </div>
           )}
        </div>
      </header>

      {/* ★追加：勤務変更申請の未承認通知バー（全体管理者向け） */}
      {isMasterAdmin && pendingChangeRequests.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-6 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm shrink-0 z-10">
          <div className="flex items-center gap-2 text-amber-900 text-xs sm:text-sm font-bold">
            <RefreshCw size={16} className="text-amber-600 shrink-0" />
            <span>
              スタッフから勤務変更の申請が <strong className="text-amber-700 underline">{pendingChangeRequests.length}件</strong> 届いています。
            </span>
          </div>
          <button
            onClick={() => setShowAdminChangeRequestsModal(true)}
            className="flex items-center gap-1 px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700 shadow-sm shrink-0 transition"
          >
            <Check size={14} /> 内容を確認・承認する
          </button>
        </div>
      )}

      {/* ★修正：全体管理者への通知バー（確認ボタン付き） */}
      {isMasterAdmin && changeLogs.length > 0 && (
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
        {viewMode === 'personal' && appUser.role === 'staff' ? (
        <main className="flex-1 overflow-auto bg-gray-100 relative">
          <div className="w-full max-w-full p-2 sm:p-4">
              <div className="bg-white rounded-lg shadow max-w-lg mx-auto overflow-hidden border">
                <div className="bg-gray-50 px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2"><User size={18}/> {appUser.name}さんの勤務表</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div>木クリ: <span className="font-bold text-yellow-700 text-sm">{staffKikuriStats[appUser.id] || 0}回</span></div>
                    <div>残業合計: <span className="font-bold text-red-600 text-sm">{staffOvertimeStats[appUser.id] || 0}h</span></div>
                  </div>
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
                    const hasBell = day ? Boolean(bellData[appUser.id]?.[day]) : false;
                    const autoHighlight = day ? autoShiftHighlightMap[`${appUser.id}_${day}`] : null;
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
                    const isEditable = cell.currentMonth && (!isSun || hasKoushutsuShiftDef || isAfterDeadlineForCurrentMonth);
                    const offCount = day && !isSun ? (dailyOffRequestCounts[day] || 0) : 0;
                    const myPendingReqsForDay = day ? (pendingChangeRequestMapByStaffDay[`${appUser.id}_${day}`] || []) : [];
                    const alertThreshold = parseInt(adminSettings.offRequestAlertCount, 10);
                    const hasAlertThreshold = !isNaN(alertThreshold) && alertThreshold > 0;
                    const isOffAlert = hasAlertThreshold && offCount >= alertThreshold;
                    let bg = 'bg-white';
                    if (!cell.currentMonth) bg = 'bg-gray-50';
                    else if (isSun) bg = 'bg-red-50';
                    else if (isSat) bg = 'bg-blue-50';

                    return (
                      <div
                        key={idx}
                        onClick={(e) => {
                          if (cell.currentMonth && isAfterDeadlineForCurrentMonth) {
                            e.stopPropagation();
                            openStaffChangeRequestModal(day, 'swap');
                          }
                        }}
                        className={`${bg} min-h-[5rem] p-1 flex flex-col relative ${
                          cell.currentMonth && isAfterDeadlineForCurrentMonth ? 'cursor-pointer' : ''
                        }`}
                      >
                        <div className={`flex items-center justify-between gap-0.5 -mx-1 -mt-1 px-1 pt-1 pb-0.5 mb-0.5 min-h-[21px] border-b ${!isSun && isHol && cell.currentMonth ? 'bg-red-50 border-red-100' : 'border-transparent'}`}>
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
                          {cell.currentMonth && myPendingReqsForDay.length > 0 && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                openStaffChangeRequestModal(day, myPendingReqsForDay[0].type || 'swap');
                              }}
                              className="text-[9px] sm:text-[10px] leading-none px-1 py-0.5 rounded-full font-bold whitespace-nowrap border bg-amber-100 text-amber-800 border-amber-300 cursor-pointer hover:bg-amber-200"
                              title="申請中の勤務変更があります（クリックで確認）"
                            >
                              申請中
                            </span>
                          )}
                        </div>
                        {cell.currentMonth && (
                          <div className="flex-1 flex flex-col rounded border border-gray-200 overflow-hidden bg-white">
                            {/* シフト表示部分(上1/2) */}
                            <div 
                              onClick={(e) => { if(isEditable) { e.stopPropagation(); handleCellClick(e, appUser.id, day, 'shift'); }}}
                              title={reqReason ? `希望理由: ${reqReason}` : isSun && isEditable ? '日曜日は「公出」のみ入力可能です' : ''}
                              className={`h-1/2 flex-1 relative border-b border-gray-100 flex flex-col items-center justify-center transition px-0.5
                                ${activePopup?.day === day && activePopup?.type === 'shift' ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : 
                                  shift ? `${autoHighlight?.bgClass || 'bg-white'}` :
                                  reqShiftCode ? 'bg-pink-50/60' : 'bg-transparent'} 
                                ${isEditable ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}
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
                                  {(reqShiftCode === 'HOPE' || (reqShift && isReqCategoryId(reqShift.category, categoryDefs) && reqShift.label === '希望'))
                                    ? '希望済'
                                    : `${reqShift?.label || reqShiftCode}(希)`}
                                </span>
                              ) : (
                                <span className="text-[8px] text-gray-300">{isSun ? '' : '選択'}</span>
                              )}
                            </div>
                            {/* タスク表示部分(下1/2) */}
                            <div
                              title={hasBell && !task ? '緊急待機番' : hasBell && task ? `${task.label}（緊急待機番）` : ''}
                              className={`h-1/2 flex-1 relative flex items-center justify-center px-0.5 transition ${
                                hasBell ? 'bg-orange-200' : 'bg-white'
                              }`}
                            >
                              {task && (
                                <span className={`font-bold text-xs leading-tight truncate max-w-full ${task.text || 'text-gray-700'}`}>
                                  {task.label}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            </main>
            ) : (
              <>
                {/* #2: 月間全体表 ⇔ 施設別 の切替バーを上部固定 */}
                <div className="shrink-0 bg-gray-100 px-2 sm:px-4 pt-2 pb-1.5 z-30 border-b border-gray-200/70">
                  <div className="bg-white rounded-lg shadow-xs border border-gray-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
                        <button
                          type="button"
                          onClick={() => setOverallSubViewMode('monthly')}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                            overallSubViewMode === 'monthly'
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-gray-600 hover:text-gray-800'
                          }`}
                        >
                          <CalendarIcon size={13} />
                          <span>月間全体表</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOverallSubViewMode('daily')}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                            overallSubViewMode === 'daily'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-gray-600 hover:text-gray-800'
                          }`}
                        >
                          <Users size={13} />
                          <span>施設別</span>
                        </button>
                      </div>
                      {overallSubViewMode === 'monthly' && (
                        <span className="text-[11px] text-gray-400 hidden sm:inline">
                          ※日付数字をクリックするとその日の「施設別」表示に切り替わります
                        </span>
                      )}
                      {overallSubViewMode === 'daily' && appUser.role === 'admin' && (
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 ml-1">
                          <span className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block" />本人入力</span>
                          <span className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />管理者固定</span>
                          <span className="inline-flex items-center gap-0.5 text-pink-600"><span className="w-0 h-0 border-t-[6px] border-t-pink-500 border-l-[6px] border-l-transparent inline-block" />理由あり</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {overallSubViewMode === 'daily' ? (
                  (() => {
                    const d = Math.max(1, Math.min(daysInMonth, selectedDailyViewDay || 1));
                    const dow = getDayOfWeek(year, month, d);
                    const dowLabel = ['日', '月', '火', '水', '木', '金', '土'][dow];
                    const isSun = isSunday(year, month, d);
                    const isHol = isHoliday(year, month, d, clinicClosedDays);
                    const closedRule = getClinicClosedRuleMatch(year, month, d, clinicClosedDays);
                    const offReqCount = isSun ? 0 : (dailyOffRequestCounts[d] || 0);
                    const isDailyFirstWeek = d <= 7 - getDayOfWeek(year, month, 1);
                    const maxStreakLimitDaily = Number(adminSettings.maxConsecutiveWorkDays) || 5;

                    // 当日の職員を「①施設未割当の出勤・出勤希望(委・日勤・3以外・出勤)」「②元希望が委・日勤・3以外で施設割当済」「③各施設・ME室」「④休み・公出」「⑤空欄」に仕分け
                    const unassignedWorkReqStaff = [];
                    const assignedFromWorkReqStaff = [];
                    const offAndKoushutsuStaff = [];
                    const blankStaff = [];
                    const byCategoryStaff = {};
                    Object.keys(categoryDefs).forEach(cid => {
                      byCategoryStaff[cid] = [];
                    });

                    displayStaffList.forEach(staff => {
                      const sCode = shiftData[staff.id]?.[d] || null;
                      const tCode = taskData[staff.id]?.[d] || null;
                      const sDef = sCode ? shiftDefs[sCode] : null;
                      const tDef = tCode ? shiftDefs[tCode] : null;
                      const reqSCode = getUserRequestedShift(staff.id, d);
                      const reqSDef = reqSCode ? shiftDefs[reqSCode] : null;
                      const reqReason = getUserRequestedReason(staff.id, d);
                      const reqTaskCode = getUserRequestedTask(staff.id, d);
                      const reqTaskDef = reqTaskCode ? shiftDefs[reqTaskCode] : null;
                      const hasBell = Boolean(bellData[staff.id]?.[d]);
                      const teamShiftLock = appUser.role === 'admin' ? getTeamLockedShiftSource(staff.id, d) : null;
                      const teamTaskLock = appUser.role === 'admin' ? getTeamLockedTaskSource(staff.id, d) : null;
                      const isShiftEditable =
                        (!isSun || hasKoushutsuShiftDef) &&
                        (appUser.role === 'admin' || (appUser.role === 'staff' && staff.id === appUser.id));
                      const isTaskEditable =
                        (!isSun && (appUser.role === 'admin' || (appUser.role === 'staff' && staff.id === appUser.id))) ||
                        (isSun && appUser.role === 'admin');

                      const item = {
                        staff,
                        sCode,
                        tCode,
                        sDef,
                        tDef,
                        reqSCode,
                        reqSDef,
                        reqReason,
                        reqTaskCode,
                        reqTaskDef,
                        hasBell,
                        teamShiftLock,
                        teamTaskLock,
                        isShiftEditable,
                        isTaskEditable,
                      };

                      // 役職が「顧問」の職員は未割当・空欄には表示しない（施設シフトや休み・公出が入った日のみ通常表示）
                      const isAdvisorStaff = staff.jobTitle === '顧問';
                      if (sDef && isWorkRequestShiftDef(sDef, categoryDefs)) {
                        if (!isAdvisorStaff) unassignedWorkReqStaff.push(item);
                      } else if (!sDef && reqSDef && isWorkRequestShiftDef(reqSDef, categoryDefs)) {
                        if (!isAdvisorStaff) unassignedWorkReqStaff.push(item);
                      } else if (
                        sDef &&
                        getEffectiveShiftType(sDef, categoryDefs) === 'shift' &&
                        !isNonWorkOrKoushutsuShiftDef(sDef, categoryDefs) &&
                        sDef.category &&
                        byCategoryStaff[sDef.category]
                      ) {
                        byCategoryStaff[sDef.category].push(item);
                        if (!isAdvisorStaff && reqSDef && isWorkRequestShiftDef(reqSDef, categoryDefs) && sCode !== reqSCode) {
                          assignedFromWorkReqStaff.push(item);
                        }
                      } else if (sDef) {
                        offAndKoushutsuStaff.push(item);
                      } else {
                        if (!isAdvisorStaff) blankStaff.push(item);
                      }
                    });

                    const facilityAndMeGroups = dynamicSummaryGroups.filter(
                      g => g.kind === 'facility' || g.kind === 'me'
                    );
                    const facilityCatsForDayBalance = facilityAndMeGroups
                      .filter(g => g.kind === 'facility')
                      .map(g => categoryDefs[g.id])
                      .filter(Boolean);
                    const actualHcByCatForDay = {};
                    const powerScoreByCatForDay = {};
                    facilityCatsForDayBalance.forEach(cat => {
                      const items = byCategoryStaff[cat.id] || [];
                      actualHcByCatForDay[cat.id] = items.length;
                      powerScoreByCatForDay[cat.id] = items.reduce((sum, it) => sum + getStaffPowerScore(it.staff), 0);
                    });
                    const activePoolForDayAvg = staffList.filter(s => !s.excludeFromAi);
                    const avgPoolForDay = activePoolForDayAvg.length > 0 ? activePoolForDayAvg : staffList;
                    const fallbackAvgForDay =
                      avgPoolForDay.length > 0
                        ? avgPoolForDay.reduce((sum, s) => sum + getStaffPowerScore(s), 0) / avgPoolForDay.length
                        : 10;
                    const dayPowerBalance = evaluateDailyFacilityPowerBalance({
                      facilityCats: facilityCatsForDayBalance,
                      shiftDefs,
                      categoryDefs,
                      actualHeadcountByCat: actualHcByCatForDay,
                      powerScoreByCat: powerScoreByCatForDay,
                      readTargetCount: (code) => getTargetCount(code, d),
                      adminSettings,
                      fallbackStaffAvgScore: fallbackAvgForDay,
                    });

                    const renderStaffActionChip = (item, showCategoryBadge = false) => {
                      const {
                        staff,
                        tCode,
                        sDef,
                        tDef,
                        reqSCode,
                        reqSDef,
                        reqReason,
                        reqTaskCode,
                        reqTaskDef,
                        hasBell,
                        teamShiftLock,
                        teamTaskLock,
                        isShiftEditable,
                        isTaskEditable,
                      } = item;
                      const restrictionText = getStaffRestrictionSummaryText(staff);
                      const autoShiftHighlight = autoShiftHighlightMap[`${staff.id}_${d}`];
                      const isShiftPopupActive =
                        activePopup?.day === d && activePopup?.staffId === staff.id && activePopup?.type === 'shift';
                      const isTaskPopupActive =
                        activePopup?.day === d && activePopup?.staffId === staff.id && activePopup?.type === 'task';
                      const isMeRow = appUser.role === 'staff' && staff.id === appUser.id;
                      const hasTaskOrBell = Boolean(tDef || hasBell || (appUser.role === 'admin' && reqTaskCode));

                      const carry = appUser.role === 'admin' && isDailyFirstWeek ? prevMonthCarryOver.byStaff[staff.id] : null;
                      const showDailyCarryBadges = !!(
                        carry &&
                        prevMonthCarryOver.hasStraddlingWeek &&
                        carry.staffHasPrevWorkShift &&
                        (carry.trailingWorkStreak > 0 || carry.prevLastDayWasCool3)
                      );
                      const cool3Badge = getCool3BadgeInfo(staff);
                      const partContractBadge = getPartTimeWeeklyContractRange(staff);

                      return (
                        <div
                          key={staff.id}
                          className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg border transition min-w-0 ${
                            isMeRow
                              ? 'border-blue-300 bg-blue-50/40'
                              : 'border-gray-200 bg-white hover:border-indigo-300'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 flex-wrap min-w-0">
                              <span
                                className={`text-xs sm:text-sm font-bold text-gray-900 truncate ${isMasterAdmin ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                                onClick={(e) => {
                                  if (isMasterAdmin) {
                                    e.stopPropagation();
                                    handleEditStaff(staff);
                                  }
                                }}
                              >
                                {staff.name}
                              </span>
                              {appUser.role === 'admin' && (
                                <span className="text-[10px] text-gray-400 shrink-0">{staff.jobTitle}</span>
                              )}
                              {isMeRow && (
                                <span className="px-1 py-0.2 rounded bg-blue-600 text-white text-[9px] font-bold shrink-0">
                                  自分
                                </span>
                              )}
                              {autoShiftHighlight?.label && (
                                <span className={`px-1 py-0.2 rounded text-[9px] font-bold border border-black/10 shrink-0 ${autoShiftHighlight.bgClass || 'bg-indigo-50 text-indigo-800'}`}>
                                  {autoShiftHighlight.label}
                                </span>
                              )}
                              {appUser.role === 'admin' && cool3Badge && (
                                <span
                                  className="px-1 py-[1px] rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold leading-tight shrink-0"
                                  title={cool3Badge.title}
                                >
                                  {cool3Badge.label}
                                </span>
                              )}
                              {appUser.role === 'admin' && partContractBadge && (
                                <span
                                  className="px-1 py-[1px] rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold leading-tight shrink-0"
                                  title={`パート契約出勤日数: 週${partContractBadge.min === partContractBadge.max ? partContractBadge.min : `${partContractBadge.min}〜${partContractBadge.max}`}日`}
                                >
                                  契約:週{partContractBadge.min === partContractBadge.max ? partContractBadge.min : `${partContractBadge.min}〜${partContractBadge.max}`}日
                                </span>
                              )}
                              {restrictionText && appUser.role === 'admin' && (
                                <span
                                  className="hidden sm:inline px-1 py-[1px] rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold leading-tight shrink-0"
                                  title={`AI配置制限: ${restrictionText}`}
                                >
                                  制限あり
                                </span>
                              )}
                            </div>
                            {showDailyCarryBadges && (
                              <div className="flex items-center gap-1 flex-wrap mt-0.5" title={carry.tooltipText}>
                                {carry.trailingWorkStreak > 0 && (
                                  <span
                                    className={`px-1 py-[1px] rounded border text-[9px] font-bold leading-tight ${
                                      carry.isCrossMonthStreakViolated
                                        ? 'bg-red-100 text-red-700 border-red-300'
                                        : carry.trailingWorkStreak >= maxStreakLimitDaily
                                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                                          : carry.trailingWorkStreak >= maxStreakLimitDaily - 1
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                  >
                                    {carry.isCrossMonthStreakViolated
                                      ? `⚠️月またぎ${carry.crossMonthTotalStreak}連勤`
                                      : carry.trailingWorkStreak >= maxStreakLimitDaily
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
                            {(appUser.role === 'admin' || staff.id === appUser.id) && (reqSCode || reqReason) && (
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {reqSCode && (
                                  <span className="inline-flex items-center px-1 py-0.2 rounded bg-pink-50 text-pink-700 border border-pink-200 text-[9px] font-bold">
                                    元希:{reqSDef?.label || reqSCode}
                                  </span>
                                )}
                                {reqReason && (
                                  <span className="text-[9px] text-pink-600 bg-pink-50/60 px-1 py-0.2 rounded border border-pink-100 truncate max-w-[140px]">
                                    {reqReason}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {showCategoryBadge && sDef?.category && categoryDefs[sDef.category] && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">
                                {categoryDefs[sDef.category].label}
                              </span>
                            )}
                            {/* シフト表示・変更ボタン（管理固定・本人入力アイコン付き） */}
                            <button
                              type="button"
                              disabled={!isShiftEditable}
                              onClick={(e) => {
                                if (isShiftEditable) {
                                  e.stopPropagation();
                                  handleCellClick(e, staff.id, d, 'shift');
                                }
                              }}
                              title={[
                                teamShiftLock ? `${TEAM_ADMIN_LABELS[teamShiftLock]}固定` : '',
                                appUser.role === 'admin' && reqSCode ? `本人入力希望: ${reqSDef?.label || reqSCode}` : '',
                                reqReason ? `理由: ${reqReason}` : '',
                                isShiftEditable ? 'クリックしてシフトを変更' : '',
                              ].filter(Boolean).join(' / ') || undefined}
                              className={`relative min-w-[42px] sm:min-w-[48px] h-7 px-1.5 sm:px-2 rounded-md border text-xs font-extrabold flex items-center justify-center gap-0.5 transition ${
                                isShiftPopupActive
                                  ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-400'
                                  : autoShiftHighlight?.bgClass
                                    ? `${autoShiftHighlight.bgClass} border-black/15`
                                    : sDef
                                      ? 'bg-slate-50 border-gray-300'
                                      : 'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                              } ${isShiftEditable ? 'hover:border-blue-400 cursor-pointer' : 'cursor-default'}`}
                            >
                              {teamShiftLock && (
                                <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 pointer-events-none" />
                              )}
                              {appUser.role === 'admin' && reqSCode && (
                                reqReason ? (
                                  <span className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-pink-500 border-l-[6px] border-l-transparent pointer-events-none" />
                                ) : (
                                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-pink-500 pointer-events-none" />
                                )
                              )}
                              <span className={sDef ? sDef.text : 'text-gray-400 font-normal text-[10px]'}>
                                {sDef ? sDef.label : appUser.role === 'admin' ? '未割当' : '-'}
                              </span>
                            </button>

                            {/* タスク（業務）表示・変更ボタン（管理固定・本人入力アイコン付き） */}
                            {(hasTaskOrBell || isTaskEditable) ? (
                              <button
                                type="button"
                                disabled={!isTaskEditable}
                                onClick={(e) => {
                                  if (isTaskEditable) {
                                    e.stopPropagation();
                                    handleCellClick(e, staff.id, d, 'task');
                                  }
                                }}
                                title={[
                                  teamTaskLock ? `${TEAM_ADMIN_LABELS[teamTaskLock]}タスク固定` : '',
                                  appUser.role === 'admin' && reqTaskCode ? `本人タスク希望: ${reqTaskDef?.label || reqTaskCode}` : '',
                                  isTaskEditable ? 'クリックして下段タスク・待機番を変更' : hasBell ? `${tDef ? tDef.label + ' / ' : ''}緊急待機番` : tDef?.label,
                                ].filter(Boolean).join(' / ') || undefined}
                                className={`relative min-w-[36px] sm:min-w-[40px] h-7 px-1.5 rounded-md border text-[11px] font-extrabold flex items-center justify-center gap-0.5 transition ${
                                  isTaskPopupActive
                                    ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-400'
                                    : hasBell
                                      ? 'bg-orange-200 border-orange-400 text-orange-950'
                                      : tDef
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                        : 'bg-gray-50/60 border-dashed border-gray-200 text-gray-400'
                                } ${isTaskEditable ? 'hover:border-blue-400 cursor-pointer' : 'cursor-default'}`}
                              >
                                {teamTaskLock && (
                                  <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 pointer-events-none" />
                                )}
                                {appUser.role === 'admin' && reqTaskCode && (
                                  <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full pointer-events-none ${tCode !== reqTaskCode ? 'bg-pink-600' : 'bg-pink-400'}`} />
                                )}
                                {hasBell && <Bell size={10} className="text-orange-700 shrink-0" />}
                                <span className={tDef ? tDef.text : hasBell ? 'text-orange-900 text-[10px]' : reqTaskDef && !tDef ? 'text-pink-600 text-[9px]' : 'text-gray-400 font-normal text-[10px]'}>
                                  {tDef ? tDef.label : hasBell ? '待機' : reqTaskDef ? reqTaskDef.label : '+業務'}
                                </span>
                              </button>
                            ) : (
                              <span className="min-w-[36px] sm:min-w-[40px] text-center text-[10px] text-gray-300 select-none">
                                -
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* #2: 施設別ビューの上部固定ヘッダー（「施設シフト以外の…」より上のカレンダーまで固定） */}
                        <div className="shrink-0 bg-gray-100 px-2 sm:px-4 pb-2 z-20">
                          <div className="bg-white rounded-lg shadow-xs border border-gray-200 p-2 sm:px-4 sm:py-2.5 space-y-2 w-full max-w-full overflow-x-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDailyViewDay(prev => (prev > 1 ? prev - 1 : daysInMonth))}
                                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 text-gray-700"
                                  title="前日へ"
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`text-sm sm:text-lg font-extrabold ${
                                      isSun || isHol ? 'text-red-600' : dow === 6 ? 'text-blue-600' : 'text-gray-800'
                                    }`}
                                  >
                                    {year}年{month}月{d}日（{dowLabel}）
                                  </span>
                                  {(isSun || isHol) && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] sm:text-xs font-bold">
                                      {closedRule ? closedRule.label || '外来休診日' : isSun ? '日曜休診' : '祝日'}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedDailyViewDay(prev => (prev < daysInMonth ? prev + 1 : 1))}
                                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 text-gray-700"
                                  title="翌日へ"
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap text-[11px] sm:text-xs">
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 font-bold border border-blue-200">
                                  出勤合計: {dailyStats[d]?.total || 0}名
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 font-bold border border-pink-200">
                                  休み希望: {offReqCount}名
                                </span>
                                {appUser.role === 'admin' && (
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-bold border ${
                                      unassignedWorkReqStaff.length > 0
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : 'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}
                                  >
                                    施設未割当(委・日勤・3以外・出勤): {unassignedWorkReqStaff.length}名
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 1〜末日のクイック日付切替バー */}
                            <div className="flex items-center gap-1 overflow-x-auto pt-2 pb-0.5 pr-1.5 max-w-full">
                              {daysArray.map(dayNum => {
                                const dSun = isSunday(year, month, dayNum);
                                const dHol = isHoliday(year, month, dayNum, clinicClosedDays);
                                const dDow = getDayOfWeek(year, month, dayNum);
                                const isSelected = dayNum === d;
                                const unassignedCnt = appUser.role === 'admin' ? (dailyUnassignedWorkReqCountMap[dayNum] || 0) : 0;
                                return (
                                  <button
                                    key={dayNum}
                                    type="button"
                                    onClick={() => setSelectedDailyViewDay(dayNum)}
                                    className={`relative min-w-[32px] py-1 px-1 rounded-md border text-center transition shrink-0 ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white border-indigo-700 font-bold shadow-xs'
                                        : dSun || dHol
                                          ? 'bg-red-50/70 text-red-600 border-red-200 hover:bg-red-100'
                                          : dDow === 6
                                            ? 'bg-blue-50/70 text-blue-600 border-blue-200 hover:bg-blue-100'
                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                    }`}
                                    title={
                                      unassignedCnt > 0
                                        ? `${month}/${dayNum}: 施設未割当の出勤希望(委・日勤・3以外等) ${unassignedCnt}名`
                                        : `${month}/${dayNum}`
                                    }
                                  >
                                    <div className="text-[11px] font-bold leading-none">{dayNum}</div>
                                    <div className="text-[9px] opacity-80 leading-tight">
                                      {['日', '月', '火', '水', '木', '金', '土'][dDow]}
                                    </div>
                                    {unassignedCnt > 0 && (
                                      <span
                                        className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-extrabold flex items-center justify-center ${
                                          isSelected ? 'bg-amber-300 text-amber-950' : 'bg-amber-500 text-white'
                                        }`}
                                      >
                                        {unassignedCnt}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <main className="flex-1 overflow-auto bg-gray-100 px-2 sm:px-4 pb-4">
                          <div className="bg-white rounded-lg shadow border border-gray-200 p-2.5 sm:p-4 space-y-3 sm:space-y-4 w-full max-w-full overflow-x-hidden">
                            {/* セクション1: 管理者時は未割当確認＆変更案内を表示。個人カレンダーから見た際は「施設シフト以外の…」注意文章を削除し、該当者がいる場合のみ簡潔表示 */}
                        {appUser.role === 'admin' ? (
                          <div
                            className={`rounded-xl border p-3 ${
                              unassignedWorkReqStaff.length > 0
                                ? 'bg-amber-50/70 border-amber-300'
                                : 'bg-gray-50/70 border-gray-200'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-extrabold text-amber-900 flex items-center gap-1.5">
                                  <AlertTriangle size={15} className={unassignedWorkReqStaff.length > 0 ? 'text-amber-600' : 'text-gray-400'} />
                                  施設シフト以外の出勤・出勤希望（委・日勤・3以外・出勤など）
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white border border-amber-300 text-amber-900">
                                  未割当 {unassignedWorkReqStaff.length}名
                                </span>
                              </div>
                              <span className="text-[11px] text-amber-800">
                                ※右側のシフトボタンをクリックすると、その場で各施設シフト（坂1・君2・木1など）や下段タスクへ変更できます
                              </span>
                            </div>

                            {unassignedWorkReqStaff.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {unassignedWorkReqStaff.map(item => renderStaffActionChip(item, false))}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 py-1">
                                現在、この日に施設未割当の「委・日勤・3以外・出勤」の職員はいません。
                              </div>
                            )}

                            {assignedFromWorkReqStaff.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-amber-200/80">
                                <div className="text-[11px] font-bold text-amber-800 mb-1.5">
                                  元の出勤希望（委・日勤・3以外等）から施設シフトへ割り振り済みの職員（{assignedFromWorkReqStaff.length}名）:
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {assignedFromWorkReqStaff.map(item => renderStaffActionChip(item, true))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          unassignedWorkReqStaff.length > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 sm:p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-extrabold text-amber-900">
                                  委員会・その他出勤（{unassignedWorkReqStaff.length}名）
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {unassignedWorkReqStaff.map(item => renderStaffActionChip(item, false))}
                              </div>
                            </div>
                          )
                        )}

                        {/* セクション2: 施設別・ME室 割り振り一覧（人員の組み合わせ確認・変更） */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {facilityAndMeGroups.map(group => {
                            const assignedItems = (byCategoryStaff[group.id] || []).slice().sort((a, b) => {
                              const idxA = group.items.indexOf(a.sCode);
                              const idxB = group.items.indexOf(b.sCode);
                              return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                            });
                            const totalActual = group.items.reduce((sum, code) => sum + (dailyStats[d]?.[code] || 0), 0);
                            const totalTarget = group.items.reduce((sum, code) => sum + getTargetCount(code, d), 0);
                            const isHeadcountShort = !isSun && totalTarget > 0 && totalActual < totalTarget;
                            const skillShortages = dailyFacilitySkillSummary[d]?.shortagesByCat?.[group.id] || [];
                            const skillCounts = dailyFacilitySkillSummary[d]?.skillCountsByCat?.[group.id] || {};
                            const actualPower = assignedItems.reduce((sum, it) => sum + getStaffPowerScore(it.staff), 0);
                            const pBal = group.kind === 'facility' ? dayPowerBalance.byCat[group.id] : null;
                            const facilityRoleItems =
                              group.kind === 'facility'
                                ? (dailyFacilityTaskSummary[d]?.itemsByCat?.[group.id] || [])
                                : [];

                            return (
                              <div
                                key={group.id}
                                className={`rounded-xl border overflow-hidden flex flex-col bg-white ${
                                  isHeadcountShort
                                    ? 'border-red-300 ring-1 ring-red-200'
                                    : skillShortages.length > 0 && !isSun
                                      ? 'border-amber-300 ring-1 ring-amber-200'
                                      : 'border-gray-200'
                                }`}
                              >
                                <div className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-1.5 ${group.headerColor}`}>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-sm">{group.name}</span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                        appUser.role === 'admin' && isHeadcountShort
                                          ? 'bg-red-600 text-white'
                                          : 'bg-white/90 text-gray-800 border border-black/10'
                                      }`}
                                    >
                                      {appUser.role === 'admin' ? `${totalActual} / ${totalTarget}名` : `${totalActual}名`}
                                    </span>
                                  </div>
                                  {appUser.role === 'admin' && group.kind === 'facility' && (
                                    <div className="flex items-center justify-end gap-1 flex-wrap text-[11px] font-bold">
                                      {group.items.map(code => {
                                        const sDef = shiftDefs[code];
                                        if (!sDef) return null;
                                        const cnt = dailyStats[d]?.[code] || 0;
                                        const tgt = getTargetCount(code, d);
                                        const isShort = !isSun && tgt > 0 && cnt < tgt;
                                        return (
                                          <span
                                            key={code}
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                              isShort
                                                ? 'bg-red-100 text-red-700 border-red-300'
                                                : cnt > 0
                                                  ? 'bg-white/95 text-gray-700 border-black/10'
                                                  : 'bg-white/60 text-gray-400 border-black/10'
                                            }`}
                                          >
                                            <span className={sDef.text}>{sDef.label}</span>: {' '}
                                            {`${cnt}/${tgt}`}
                                          </span>
                                        );
                                      })}
                                      <span
                                        title={
                                          pBal?.isEnabled
                                            ? `パワーバランス（当日平均 ${pBal.dayAvg}点/人 × ${pBal.actualHc > 0 ? pBal.actualHc : pBal.targetHc}名 ＝ 目安${pBal.expectedScore}点）| ${group.name}平均: ${pBal.actualAvg}点/人 (${pBal.diffFromDayAvg >= 0 ? `+${pBal.diffFromDayAvg}` : pBal.diffFromDayAvg})${pBal.isImbalancedLow ? ' ⚠他施設より平均スコアが低く偏っています' : pBal.isImbalancedHigh ? ' ※高スコア者が多く集まっています' : ' ✓バランス良好'}`
                                            : `合計パワースコア: ${actualPower}点（スコアバランス判定対象外）`
                                        }
                                        className={`px-1.5 py-0.5 rounded ${
                                          !isSun && pBal?.isEnabled && pBal.isImbalancedLow
                                            ? 'bg-amber-100 text-amber-900 border border-amber-400'
                                            : !isSun && pBal?.isEnabled && pBal.isImbalancedHigh
                                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                              : 'bg-white/80 text-gray-700'
                                        }`}
                                      >
                                        {pBal?.isEnabled
                                          ? `${!isSun && pBal.isImbalancedLow ? '⚠ ' : ''}スコア:${actualPower}${pBal.expectedScore > 0 ? `/目安${pBal.expectedScore}` : ''}${totalActual > 0 ? ` (平均${pBal.actualAvg})` : ''}`
                                          : `スコア:${actualPower}${totalActual > 0 ? ` (平均${(actualPower / totalActual).toFixed(1)})` : ''}`}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded bg-white/80 text-blue-700">
                                        L:{skillCounts.isLeader || 0} V:{skillCounts.isVeteran || 0}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* 役割チェック・スキル不足バッジ（管理者の勤務施設は役割チェック、それ以外はシフト内訳） */}
                                <div className="px-2.5 sm:px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-1 min-h-[29px]">
                                  {appUser.role === 'admin' && group.kind === 'facility' ? (
                                    <>
                                      {facilityRoleItems.length > 0 ? (
                                        facilityRoleItems.map(rt => (
                                          <span
                                            key={rt.code}
                                            title={`役割「${rt.label}」: ${rt.actual}/${rt.target}名（${rt.isMet ? '必要数充足' : `あと${rt.target - rt.actual}名必要`}）`}
                                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                              rt.isMet
                                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                : !isSun
                                                  ? 'bg-red-100 text-red-700 border-red-300'
                                                  : 'bg-white text-gray-600 border-gray-200'
                                            }`}
                                          >
                                            <span>
                                              {rt.label}
                                              {rt.isMet ? (rt.target > 1 ? ` ${rt.actual}/${rt.target}` : '') : `:${rt.actual}/${rt.target}`}
                                            </span>
                                            {rt.isMet && <Check size={11} className="text-emerald-600 shrink-0" />}
                                          </span>
                                        ))
                                      ) : (
                                        skillShortages.length === 0 && (
                                          <span className="text-[10px] text-gray-400">役割設定なし</span>
                                        )
                                      )}
                                      {!isSun && skillShortages.length > 0 && (
                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
                                          ⚠ {skillShortages.map(s => `${s.skillLabel}${s.actual}/${s.target}`).join('・')}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    group.items.map(code => {
                                      const sDef = shiftDefs[code];
                                      if (!sDef) return null;
                                      const cnt = dailyStats[d]?.[code] || 0;
                                      const tgt = getTargetCount(code, d);
                                      if (appUser.role !== 'admin' && cnt === 0) return null;
                                      const isShort = appUser.role === 'admin' && !isSun && tgt > 0 && cnt < tgt;
                                      return (
                                        <span
                                          key={code}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                            isShort
                                              ? 'bg-red-100 text-red-700 border-red-300'
                                              : cnt > 0
                                                ? 'bg-white text-gray-700 border-gray-200'
                                                : 'bg-gray-100 text-gray-400 border-gray-200'
                                          }`}
                                        >
                                          <span className={sDef.text}>{sDef.label}</span>: {' '}
                                          {appUser.role === 'admin' ? `${cnt}/${tgt}` : `${cnt}名`}
                                        </span>
                                      );
                                    })
                                  )}
                                </div>

                                {/* 割り振られている職員リスト */}
                                <div className="p-2 sm:p-2.5 space-y-1.5 flex-1">
                                  {assignedItems.length > 0 ? (
                                    assignedItems.map(item => renderStaffActionChip(item, false))
                                  ) : (
                                    <div className="text-xs text-gray-400 text-center py-3">
                                      割り振られている職員はいません
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* 休み・公出カード（ME室の隣・次に配置） */}
                          {(() => {
                            const offKoushutsuCounts = {};
                            offAndKoushutsuStaff.forEach(item => {
                              if (!item.sCode) return;
                              offKoushutsuCounts[item.sCode] = (offKoushutsuCounts[item.sCode] || 0) + 1;
                            });
                            const orderedOffCodes = dynamicPaletteGroups
                              .flatMap(g => g.items)
                              .filter(code => offKoushutsuCounts[code] > 0);
                            Object.keys(offKoushutsuCounts).forEach(code => {
                              if (!orderedOffCodes.includes(code)) orderedOffCodes.push(code);
                            });
                            return (
                              <div className="rounded-xl border border-gray-200 overflow-hidden flex flex-col bg-white">
                                <div className="px-3 py-2 border-b flex items-center justify-between gap-2 bg-gray-100 text-gray-700">
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-sm">休み・公出</span>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/90 text-gray-800 border border-black/10">
                                      {offAndKoushutsuStaff.length}名
                                    </span>
                                  </div>
                                </div>
                                <div className="px-2.5 sm:px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-1 min-h-[29px]">
                                  {orderedOffCodes.length > 0 ? (
                                    orderedOffCodes.map(code => {
                                      const sDef = shiftDefs[code];
                                      return (
                                        <span
                                          key={code}
                                          className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-white text-gray-700 border-gray-200"
                                        >
                                          <span className={sDef?.text || 'text-gray-700'}>{sDef?.label || code}</span>:{' '}
                                          {offKoushutsuCounts[code]}名
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="text-[10px] text-gray-400">内訳なし</span>
                                  )}
                                </div>
                                <div className="p-2 sm:p-2.5 space-y-1.5 flex-1">
                                  {offAndKoushutsuStaff.length > 0 ? (
                                    offAndKoushutsuStaff.map(item => renderStaffActionChip(item, false))
                                  ) : (
                                    <div className="text-xs text-gray-400 text-center py-3">
                                      休み・公出の職員はいません
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* セクション3: 空欄（未入力）の職員（画面幅・人数に応じて上から下方向へ動的に折り返し表示） */}
                        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-2.5 sm:p-3">
                          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                            <span className="text-xs font-bold text-gray-700">
                              空欄（{blankStaff.length}名）
                            </span>
                            {appUser.role === 'admin' && (
                              <span className="text-[11px] text-gray-500">
                                ※人数補充が必要な場合はここから直接シフトを割り当てられます
                              </span>
                            )}
                          </div>
                          {blankStaff.length > 0 ? (
                            <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-1.5 sm:gap-2">
                              {blankStaff.map(item => (
                                <div key={item.staff.id} className="break-inside-avoid mb-1.5 sm:mb-2">
                                  {renderStaffActionChip(item, false)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 text-center py-2">
                              空欄の職員はいません
                            </div>
                          )}
                        </div>
                          </div>
                        </main>
                      </>
                    );
                  })()
                ) : (
                  <main className="flex-1 overflow-auto bg-gray-100 relative px-2 sm:px-4 pb-4 pt-1">
                    <div className="inline-block min-w-full align-middle">
                      <div className="bg-transparent rounded-lg overflow-hidden">
                <table className="w-full border-collapse select-none">
                  <thead>
                    <tr>
                      <th
                        rowSpan={appUser.role === 'admin' && adminRightFlatShifts.length > 0 ? 3 : 1}
                        className="sticky top-0 left-0 z-30 bg-gray-100 border-b border-r px-2 py-1.5 min-w-[116px] h-20 text-left"
                      >
                        <div className="flex flex-col justify-between h-full">
                          <span className="text-xs text-gray-500">職員 / 日付</span>
                          {appUser.role === 'admin' && (
                            <div className="text-[9px] font-normal text-gray-500 leading-tight space-y-0.5 my-0.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block"></span>本人入力
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block ml-1"></span>管理者固定
                                <span className="inline-flex items-center gap-0.5 text-pink-600 ml-1"><span className="w-0 h-0 border-t-[7px] border-t-pink-500 border-l-[7px] border-l-transparent inline-block" />理由あり</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="inline-flex items-center gap-0.5 px-1 py-[1px] rounded bg-pink-100 text-pink-700 border border-pink-200 font-bold text-[8px] leading-none">
                                  <span>希望</span>
                                  <MessageSquare size={7} className="text-pink-600 fill-pink-200" />
                                </span>
                                編集前の希望
                              </div>
                            </div>
                          )}
                          {isMasterAdmin && <button onClick={(e) => { e.stopPropagation(); handleAddStaff(); }} className="flex items-center gap-1 text-xs bg-white border px-2 py-1 rounded text-blue-600 font-bold"><Plus size={12}/> 職員追加</button>}
                        </div>
                      </th>
                      {daysArray.map(day => {
                        const isSun = isSunday(year, month, day);
                        const isHol = isHoliday(year, month, day, clinicClosedDays);
                        const closedRule = getClinicClosedRuleMatch(year, month, day, clinicClosedDays);
                        const unassignedWorkReqCnt = dailyUnassignedWorkReqCountMap[day] || 0;
                        let bgClass = getDayColor(year, month, day, clinicClosedDays); 
                        let headerBg = 'bg-gray-50';
                        if(isSun || isHol) headerBg = 'bg-red-50'; 

                        return (
                          <th
                            key={day}
                            rowSpan={appUser.role === 'admin' && adminRightFlatShifts.length > 0 ? 3 : 1}
                            onClick={() => {
                              setSelectedDailyViewDay(day);
                              setOverallSubViewMode('daily');
                            }}
                            title={
                              (closedRule ? `${closedRule.label || '外来休診日'} / ` : '') +
                              (unassignedWorkReqCnt > 0
                                ? `施設未割当(委・日勤・3以外等) ${unassignedWorkReqCnt}名 — クリックで${month}/${day}の「施設別」表示へ`
                                : `クリックで${month}/${day}の「施設別」表示を開く`)
                            }
                            className={`sticky top-0 z-20 border-b border-r min-w-[36px] px-0.5 py-1 text-center cursor-pointer hover:ring-2 hover:ring-inset hover:ring-indigo-400 transition relative ${headerBg} ${bgClass}`}
                          >
                            {unassignedWorkReqCnt > 0 && (
                              <span
                                className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500"
                                title={`施設未割当の出勤希望(委・日勤・3以外等): ${unassignedWorkReqCnt}名`}
                              />
                            )}
                            <div className="text-xs font-bold leading-tight">{day}</div>
                            <div className="text-[11px] font-normal opacity-80 leading-tight">{['日','月','火','水','木','金','土'][getDayOfWeek(year, month, day)]}</div>
                          </th>
                        );
                      })}
                      <th
                        rowSpan={appUser.role === 'admin' && adminRightFlatShifts.length > 0 ? 3 : 1}
                        className="sticky top-0 z-20 bg-red-50 border-b border-r px-1.5 py-1 min-w-[48px] text-center text-xs font-bold text-red-800"
                      >
                        残業
                      </th>
                      {appUser.role === 'admin' && adminRightFlatShifts.length > 0 && (
                        <>
                          {/* 残業セルと個人集計表の間の隙間セル（個人集計の1セル分: w-7 min-w-[28px]） */}
                          <th
                            rowSpan={3}
                            className="sticky top-0 z-20 w-7 min-w-[28px] bg-gray-100 border-0 p-0"
                            aria-hidden="true"
                          />
                          {/* 1段目: 個人集計の切替ボタン（開始位置＝坂田/3クールの上に左寄せ固定） */}
                          <th
                            colSpan={adminRightFlatShifts.length}
                            className="sticky top-0 z-20 bg-slate-100 border-b border-r border-l border-l-gray-300 px-2 py-1 text-left align-middle"
                          >
                            <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-[11px] font-bold text-slate-700">個人集計:</span>
                              <div className="inline-flex rounded border border-slate-300 bg-white p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setAdminCountDisplayMode('facility')}
                                  className={`px-2 py-0.5 rounded-xs text-[10px] font-bold transition ${
                                    adminCountDisplayMode === 'facility'
                                      ? 'bg-indigo-600 text-white'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  施設別
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminCountDisplayMode('slot')}
                                  className={`px-2 py-0.5 rounded-xs text-[10px] font-bold transition ${
                                    adminCountDisplayMode === 'slot'
                                      ? 'bg-indigo-600 text-white'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  シフト表示別
                                </button>
                              </div>
                            </div>
                          </th>
                        </>
                      )}
                    </tr>
                    {appUser.role === 'admin' && adminRightFlatShifts.length > 0 && (
                      <>
                        {/* 2段目: 施設名 / クール区分名 */}
                        <tr>
                          {adminRightCountGroups.map((grp, gIdx) => (
                            <th
                              key={grp.id}
                              colSpan={grp.shifts.length}
                              className={`sticky top-[29px] z-20 border-b border-r px-1.5 py-0.5 text-center text-[11px] font-bold whitespace-nowrap ${
                                gIdx === 0 ? 'border-l border-l-gray-300' : 'border-l-2 border-l-gray-300'
                              } ${grp.headerColor}`}
                            >
                              {grp.label}
                            </th>
                          ))}
                        </tr>
                        {/* 3段目: 個別シフト表示名 */}
                        <tr>
                          {adminRightFlatShifts.map((item, idx) => (
                            <th
                              key={`${item.groupId}_${item.shift.code}`}
                              title={`${item.groupLabel} — ${item.shift.label} (${item.shift.code})`}
                              className={`sticky top-[54px] z-20 bg-gray-50 border-b border-r px-1 py-0.5 w-7 min-w-[28px] text-center text-[11px] font-bold whitespace-nowrap ${
                                idx === 0
                                  ? 'border-l border-l-gray-300'
                                  : item.isFirstInGroup
                                    ? 'border-l-2 border-l-gray-300'
                                    : ''
                              }`}
                            >
                              <span className={item.shift.text || 'text-gray-700'}>{item.shift.label}</span>
                            </th>
                          ))}
                        </tr>
                      </>
                    )}
                  </thead>
                  <tbody className="bg-white">
                    {displayStaffList.map((staff) => {
                      const overtime = staffOvertimeStats[staff.id] || 0;
                      const carry = isMasterAdmin ? prevMonthCarryOver.byStaff[staff.id] : null;
                      const maxStreakLimit = Number(adminSettings.maxConsecutiveWorkDays) || 5;
                      const showCarryBadges = !!(
                        carry &&
                        prevMonthCarryOver.hasStraddlingWeek &&
                        carry.staffHasPrevWorkShift &&
                        (carry.trailingWorkStreak > 0 || carry.prevLastDayWasCool3)
                      );
                      const rowHasChangedShiftReq =
                        appUser.role === 'admin' &&
                        daysArray.some(d => {
                          const reqS = getUserRequestedShift(staff.id, d);
                          return Boolean(reqS && shiftData[staff.id]?.[d] !== reqS);
                        });
                      return (
                        <tr 
                          key={staff.id} 
                          className="group hover:bg-gray-50"
                          draggable={isMasterAdmin}
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', staff.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { 
                            e.preventDefault(); 
                            if (isMasterAdmin) handleSortStaff(e.dataTransfer.getData('text/plain'), staff.id); 
                          }}
                        >
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-b border-r px-2 py-1 font-medium text-gray-700 whitespace-nowrap">
                            <div className="flex items-center justify-between group/cell w-full">
                              <div className={isMasterAdmin ? "cursor-pointer flex-1" : "flex-1"} onClick={(e) => { if(isMasterAdmin) { e.stopPropagation(); handleEditStaff(staff); } }}>
                                <div
                                  className="text-xs sm:text-sm font-bold text-gray-800 leading-tight flex items-center gap-1"
                                  title={appUser.role === 'admin' && staff.requestNote?.trim() ? `希望要項・契約内容:\n${staff.requestNote}` : undefined}
                                >
                                  {staff.name}
                                  {isMasterAdmin && <Edit2 size={10} className="text-gray-300 opacity-0 group-hover/cell:opacity-100 transition"/>}
                                </div>
                                <div className="text-[10px] text-gray-500 leading-tight flex items-center gap-2">
                                  {staff.jobTitle}
                                  {staff.skills?.isLeader && (
                                    <span className="inline-flex items-center" title="リーダー可">
                                      <ShieldCheck size={10} className="text-blue-500" />
                                    </span>
                                  )}
                                  {staff.skills?.isVeteran && (
                                    <span className="inline-flex items-center" title="ベテラン">
                                      <Star size={10} className="text-yellow-500" />
                                    </span>
                                  )}
                                  {getStaffRestrictionSummaryText(staff) && (
                                    <span
                                      className="inline-flex items-center"
                                      title={`AI配置制限あり（${getStaffRestrictionSummaryText(staff)}）`}
                                    >
                                      <ListFilter size={10} className="text-amber-500" />
                                    </span>
                                  )}
                                  {appUser.role === 'admin' && staff.requestNote?.trim() && (
                                    <span
                                      className="inline-flex items-center p-1 -m-1 rounded hover:bg-indigo-100 transition"
                                      title={`希望要項・契約内容:\n${staff.requestNote}`}
                                    >
                                      <MessageSquare size={12} className="text-indigo-600 fill-indigo-100" />
                                    </span>
                                  )}
                                  {staff.excludeFromAi && (
                                    <span className="inline-flex items-center" title="AI自動生成対象外">
                                      <Lock size={10} className="text-red-500" />
                                    </span>
                                  )}
                                </div>
                                {appUser.role === 'admin' && (() => {
                                  const cool3Badge = getCool3BadgeInfo(staff);
                                  const partRangeBadge = getPartTimeWeeklyContractRange(staff);
                                  if (!cool3Badge && !partRangeBadge) return null;
                                  return (
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                      {cool3Badge && (
                                        <span
                                          className="px-1 py-[1px] rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold leading-tight"
                                          title={cool3Badge.title}
                                        >
                                          {cool3Badge.label}
                                        </span>
                                      )}
                                      {partRangeBadge && (
                                        <span
                                          className="px-1 py-[1px] rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold leading-tight"
                                          title={`パート契約出勤日数: 週${partRangeBadge.min === partRangeBadge.max ? partRangeBadge.min : `${partRangeBadge.min}〜${partRangeBadge.max}`}日`}
                                        >
                                          契約:週{partRangeBadge.min === partRangeBadge.max ? partRangeBadge.min : `${partRangeBadge.min}〜${partRangeBadge.max}`}日
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
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
                              {isMasterAdmin && (
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
                            const hasBell = Boolean(bellData[staff.id]?.[day]);
                            const autoShiftHighlight = autoShiftHighlightMap[`${staff.id}_${day}`];
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
                            const isTaskEditable = (!isSun && (appUser.role === 'admin' || (appUser.role === 'staff' && staff.id === appUser.id))) || (isSun && appUser.role === 'admin');
                            const isShiftEditable = (!isSun || hasKoushutsuShiftDef) && (appUser.role === 'admin' || (appUser.role === 'staff' && staff.id === appUser.id));
                            
                            // 該当するログを探す
                            const targetLog = changeLogs.find(log => log.staffId === staff.id && log.targetDay === day && log.type === 'shift');
                            const hasLog = !!targetLog;
                            const pendingReqsForCell =
                              isMasterAdmin || (appUser.role === 'staff' && staff.id === appUser.id)
                                ? pendingChangeRequestMapByStaffDay[`${staff.id}_${day}`] || []
                                : [];
                            const hasPendingReq = pendingReqsForCell.length > 0;

                            let cellBg = '';
                            if (isSun) cellBg = isShiftEditable ? 'bg-red-50 cursor-pointer hover:bg-red-100/60' : 'bg-red-50';
                            else if (!isShiftEditable) cellBg = 'bg-gray-50 opacity-80';
                            else cellBg = 'cursor-pointer hover:bg-blue-50 bg-white';

                            // ツールチップ用のテキスト生成（希望履歴・理由は管理者のみ表示。スタッフ自身は自分のセルのみ理由を確認可能）
                            const shiftTooltips = [];
                            if (autoShiftHighlight?.tooltip) {
                              shiftTooltips.push(autoShiftHighlight.tooltip);
                            }
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
                            if (hasPendingReq) {
                              pendingReqsForCell.forEach(req => {
                                if ((req.requestType || req.type) === 'swap') {
                                  const tDay = req.targetDay || req.requesterDay;
                                  shiftTooltips.push(
                                    `【職員同士交換申請中】\n${req.requesterName} (${month}/${req.requesterDay}) ⇔ ${req.targetStaffName} (${month}/${tDay})\n理由: ${req.reason || 'なし'}`
                                  );
                                } else {
                                  shiftTooltips.push(
                                    `【単独変更申請中】\n${req.requesterName} (${month}/${req.requesterDay}): ${formatShiftCodeLabel(req.beforeShift ?? req.snapshot?.requesterShift)} → ${formatShiftCodeLabel(req.requestedShiftCode)}\n理由: ${req.reason || 'なし'}`
                                  );
                                }
                              });
                            }
                            const tooltipText = shiftTooltips.join('\n\n');

                            const taskTooltips = [];
                            if (hasBell) {
                              taskTooltips.push('【緊急待機番】背景色オレンジ');
                            }
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
                              <td key={day} className={`border-b border-r text-center p-0 ${rowHasChangedShiftReq ? 'h-[58px]' : 'h-11'} relative ${cellBg}`}>
                                <div className="w-full h-full flex flex-col">
                                  {/* シフト表示部分(上段)：希望変更がある行は自動で高さを広げ、元希望バッジを枠右上寄せにしてシフト文字と上下分離 */}
                                  <div 
                                    className={`${rowHasChangedShiftReq ? 'flex-1 min-h-[36px]' : 'h-1/2'} relative flex items-center justify-center border-b border-gray-100 transition 
                                      ${hasLog ? 'bg-yellow-100 ring-2 ring-inset ring-orange-400 z-10 hover:bg-yellow-100' : ''} 
                                      ${!hasLog && hasPendingReq ? 'bg-amber-50 ring-2 ring-inset ring-amber-400 z-10 hover:bg-amber-100' : ''}
                                      ${!hasLog && !hasPendingReq && activePopup?.day === day && activePopup?.staffId === staff.id && activePopup?.type === 'shift' ? 'ring-2 ring-inset ring-blue-500 bg-blue-50 z-10' : ''}
                                      ${!hasLog && !hasPendingReq && !(activePopup?.day === day && activePopup?.staffId === staff.id && activePopup?.type === 'shift') && autoShiftHighlight ? `${autoShiftHighlight.bgClass} hover:brightness-95` : !hasLog && !hasPendingReq && !(activePopup?.day === day && activePopup?.staffId === staff.id && activePopup?.type === 'shift') ? 'hover:bg-black/5' : ''}
                                    `}
                                    title={tooltipText} 
                                    onClick={(e) => { if(isShiftEditable) { e.stopPropagation(); handleCellClick(e, staff.id, day, 'shift'); } }}
                                  >
                                    {teamShiftLock && (
                                      <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 pointer-events-none" />
                                    )}
                                    {appUser.role === 'admin' && reqShiftCode && (
                                      shiftCode !== reqShiftCode ? (
                                        <span className={`absolute top-[1px] right-[1px] px-1 py-[1px] rounded text-[8px] leading-none bg-pink-100 text-pink-700 border border-pink-200 font-bold pointer-events-none inline-flex items-center gap-0.5 ${teamShiftLock ? 'max-w-[27px]' : 'max-w-[34px]'}`}>
                                          <span className="truncate">{reqShift?.label || reqShiftCode}</span>
                                          {reqReason && <MessageSquare size={8} className="shrink-0 text-pink-600 fill-pink-200" />}
                                        </span>
                                      ) : reqReason ? (
                                        <span className="absolute top-0 right-0 w-0 h-0 border-t-[7px] border-t-pink-500 border-l-[7px] border-l-transparent pointer-events-none" />
                                      ) : (
                                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-pink-500 pointer-events-none" />
                                      )
                                    )}
                                    {shift ? (
                                      <span className={`font-bold text-xs leading-none ${shift.text} ${appUser.role === 'admin' && reqShiftCode && shiftCode !== reqShiftCode ? 'mt-[13px]' : ''}`}>
                                        {shift.label}
                                      </span>
                                    ) : null}
                                  </div>
                                  
                                  {/* タスク表示部分(下段) */}
                                  <div
                                    className={`${rowHasChangedShiftReq ? 'h-[22px] shrink-0' : 'h-1/2'} relative flex items-center justify-center transition
                                      ${isTaskEditable ? 'cursor-pointer' : ''}
                                      ${activePopup?.day === day && activePopup?.staffId === staff.id && activePopup?.type === 'task'
                                        ? 'ring-2 ring-inset ring-blue-500 bg-blue-50 z-10'
                                        : hasBell
                                          ? 'bg-orange-200 hover:bg-orange-300/80'
                                          : isTaskEditable ? 'hover:bg-black/5' : ''}
                                    `}
                                    title={taskTooltip}
                                    onClick={(e) => { if(isTaskEditable) { e.stopPropagation(); handleCellClick(e, staff.id, day, 'task'); } }}
                                  >
                                    {teamTaskLock && (
                                      <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 pointer-events-none" />
                                    )}
                                    {appUser.role === 'admin' && reqTaskCode && (
                                      taskCode !== reqTaskCode && !task ? (
                                        <span className="px-0.5 rounded text-[8px] leading-none bg-pink-100 text-pink-700 border border-pink-200 font-bold pointer-events-none max-w-[34px] truncate">
                                          {reqTask?.label || reqTaskCode}
                                        </span>
                                      ) : (
                                        <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full pointer-events-none ${taskCode !== reqTaskCode ? 'bg-pink-600 ring-1 ring-pink-200' : 'bg-pink-400'}`} />
                                      )
                                    )}
                                    {task ? <span className={`font-bold text-[10px] leading-none ${task.text}`}>{task.label}</span> : null}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className={`border-b border-r text-center px-1 py-0.5 font-bold text-xs ${overtime > 60 ? 'bg-red-100 text-red-600' : 'bg-gray-50 text-gray-600'}`}>
                            <div className="flex flex-col items-center justify-center h-full"><span>{overtime > 0 ? overtime : '-'}</span>{overtime > 60 && <AlertTriangle size={11} className="text-red-500 mt-0.5" />}</div>
                          </td>
                          {appUser.role === 'admin' && adminRightFlatShifts.length > 0 && (
                            <>
                              <td
                                className="w-7 min-w-[28px] bg-gray-100 border-0 p-0"
                                aria-hidden="true"
                              />
                              {adminRightFlatShifts.map((item, idx) => {
                                const cnt = staffShiftCodeCounts[staff.id]?.[item.shift.code] || 0;
                                if (item.shift.isCool3Total) {
                                  const minC3 = Number(staff.minCool3 ?? 0);
                                  const maxC3 = Number(staff.maxCool3 ?? 5);
                                  const isOverC3 = cnt > maxC3;
                                  const isUnderC3 = minC3 > 0 && cnt < minC3;
                                  return (
                                    <td
                                      key={`${item.groupId}_${item.shift.code}`}
                                      title={`${staff.name} — 3クール合計: ${cnt}回（設定: 下限${minC3}〜上限${maxC3}回）`}
                                      className={`border-b border-r text-center px-1 py-0.5 text-xs font-extrabold w-7 min-w-[28px] ${
                                        isOverC3
                                          ? 'bg-red-100 text-red-700'
                                          : isUnderC3
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-purple-50/70 text-purple-900'
                                      } ${
                                        idx === 0
                                          ? 'border-l border-l-gray-300'
                                          : item.isFirstInGroup
                                            ? 'border-l-2 border-l-gray-300'
                                            : 'border-l border-l-purple-200'
                                      }`}
                                    >
                                      {cnt > 0 ? cnt : <span className="text-gray-400 font-normal">0</span>}
                                    </td>
                                  );
                                }
                                return (
                                  <td
                                    key={`${item.groupId}_${item.shift.code}`}
                                    title={`${staff.name} — ${item.groupLabel} [${item.shift.label}]: ${cnt}回`}
                                    className={`border-b border-r text-center px-1 py-0.5 text-xs font-bold w-7 min-w-[28px] bg-white group-hover:bg-gray-50 ${
                                      idx === 0
                                        ? 'border-l border-l-gray-300'
                                        : item.isFirstInGroup
                                          ? 'border-l-2 border-l-gray-300'
                                          : ''
                                    }`}
                                  >
                                    {cnt > 0 ? (
                                      <span className={item.shift.text || 'text-gray-800'}>{cnt}</span>
                                    ) : (
                                      <span className="text-gray-300 font-normal">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {appUser.role === 'admin' && (
                      <>
                        <tr>
                          <td className="p-2 bg-gray-100 border-r border-b font-bold text-gray-600 text-xs text-right sticky left-0 z-10 flex justify-between items-center">
                            {isMasterAdmin ? (
                              <button onClick={(e) => { e.stopPropagation(); setShowTargetCountModal(true); }} className="text-gray-400 hover:text-blue-600"><Settings size={14}/></button>
                            ) : (
                              <span />
                            )}
                            <span>集計</span>
                          </td>
                          <td colSpan={daysInMonth + 1} className="bg-gray-100 border-b border-r"></td>
                          {adminRightFlatShifts.length > 0 && (
                            <td colSpan={1 + adminRightFlatShifts.length} className="bg-gray-100 border-0 p-0" aria-hidden="true" />
                          )}
                        </tr>
                        <tr>
                          <td className="sticky left-0 bg-gray-50 border-r border-b p-2 text-xs font-bold text-right">出勤人数</td>
                          {daysArray.map(day => <td key={day} className="border-r border-b text-center text-xs font-bold bg-gray-50">{dailyStats[day].total}</td>)}
                          <td className="bg-gray-50 border-b border-r"></td>
                          {adminRightFlatShifts.length > 0 && (
                            <td colSpan={1 + adminRightFlatShifts.length} className="bg-gray-100 border-0 p-0" aria-hidden="true" />
                          )}
                        </tr>
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
                          <td className="bg-gray-50 border-b border-r"></td>
                          {adminRightFlatShifts.length > 0 && (
                            <td colSpan={1 + adminRightFlatShifts.length} className="bg-gray-100 border-0 p-0" aria-hidden="true" />
                          )}
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
                                <td className="bg-gray-50 border-b border-r"></td>
                                {adminRightFlatShifts.length > 0 && (
                                  <td colSpan={1 + adminRightFlatShifts.length} className="bg-gray-100 border-0 p-0" aria-hidden="true" />
                                )}
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
                                  <td className="bg-gray-50 border-b border-r"></td>
                                  {adminRightFlatShifts.length > 0 && (
                                    <td colSpan={1 + adminRightFlatShifts.length} className="bg-gray-100 border-0 p-0" aria-hidden="true" />
                                  )}
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                        {roleTaskDefs.length > 0 && (
                          <React.Fragment>
                            <tr>
                              <td className="sticky left-0 border-r border-b p-2 text-xs font-bold text-right bg-teal-50 text-teal-800">
                                役割 計
                              </td>
                              {daysArray.map(day => {
                                const totalRoleCnt = roleTaskDefs.reduce(
                                  (sum, rt) => sum + (dailyStats[day]?.[rt.code] || 0),
                                  0
                                );
                                return (
                                  <td
                                    key={day}
                                    className="border-r border-b text-center text-xs font-bold bg-gray-50 text-gray-700"
                                  >
                                    {totalRoleCnt > 0 ? totalRoleCnt : '-'}
                                  </td>
                                );
                              })}
                              <td className="bg-gray-50 border-b border-r"></td>
                              {adminRightFlatShifts.length > 0 && (
                                <td colSpan={1 + adminRightFlatShifts.length} className="bg-gray-100 border-0 p-0" aria-hidden="true" />
                              )}
                            </tr>
                            {roleTaskDefs.map(taskDef => {
                              return (
                                <tr key={`role_sum_${taskDef.code}`}>
                                  <td className="sticky left-0 bg-white border-r border-b p-2 text-xs text-right text-gray-500">
                                    <span className={taskDef.text}>{taskDef.label}</span> ({taskDef.code})
                                  </td>
                                  {daysArray.map(day => {
                                    const count = dailyStats[day]?.[taskDef.code] || 0;
                                    const isSun = isSunday(year, month, day);
                                    const taskDayInfo = dailyFacilityTaskSummary[day]?.byTask?.[taskDef.code];
                                    const dayTarget = isSun ? 0 : (taskDayInfo?.totalTarget || 0);
                                    const isTotalShort = !isSun && dayTarget > 0 && count < dayTarget;
                                    const hasFacilityShort =
                                      !isSun && dayTarget > 0 && (taskDayInfo?.shortFacilities?.length || 0) > 0;
                                    const detailLines = (taskDayInfo?.facilityDetails || []).map(
                                      f => `${f.catLabel}: ${f.actual}/${f.target}名`
                                    );
                                    const cellTitle =
                                      dayTarget > 0
                                        ? [`【${taskDef.label}】全施設合計 ${count}/${dayTarget}名`, ...detailLines].join('\n')
                                        : count > 0
                                          ? `【${taskDef.label}】合計 ${count}名`
                                          : undefined;
                                    return (
                                      <td
                                        key={day}
                                        title={cellTitle}
                                        className={`border-r border-b text-center text-xs ${
                                          isTotalShort
                                            ? 'bg-red-100 text-red-600 font-bold'
                                            : hasFacilityShort
                                              ? 'bg-amber-100 text-amber-800 font-bold'
                                              : count > 0
                                                ? 'text-gray-700 font-bold'
                                                : 'text-gray-400'
                                        }`}
                                      >
                                        {count > 0 ? count : '-'}
                                      </td>
                                    );
                                  })}
                                  <td className="bg-gray-50 border-b border-r"></td>
                                  {adminRightFlatShifts.length > 0 && (
                                    <td colSpan={1 + adminRightFlatShifts.length} className="bg-gray-100 border-0 p-0" aria-hidden="true" />
                                  )}
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
                      </div>
                    </div>
                  </main>
                )}
              </>
            )}

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
          const popupOptions = getPopupOptions(activePopup.type);
          const teamClearPerm =
            appUser.role === 'admin' && !isMasterAdmin
              ? canTeamAdminClearCell(activePopup.staffId, activePopup.day, activePopup.type)
              : { allowed: true, reason: '' };
          const showPopupScheduleSummary = !(viewMode === 'personal' && appUser.role === 'staff') && Boolean(popupStaff);

          return (
            <div 
              ref={popupRef}
              className={`z-[80] bg-white border p-3 fixed bottom-0 left-0 right-0 w-full max-h-[85vh] flex flex-col rounded-t-xl shadow-[0_-4px_10px_rgba(0,0,0,0.1)] shrink-0 
                ${showPopupScheduleSummary ? 'md:w-96' : 'md:w-80'} md:max-h-[calc(100vh-24px)] md:rounded-xl md:bottom-auto md:left-auto md:right-auto md:shadow-2xl md:border-gray-300`}
              onClick={e => e.stopPropagation()}
            >
              <div
                onPointerDown={handlePopupDragStart}
                onDragStart={(e) => e.preventDefault()}
                className="flex justify-between items-center mb-2 pb-2 border-b shrink-0 md:cursor-grab md:active:cursor-grabbing md:touch-none select-none"
                title="ドラッグして移動"
              >
                <div className="flex items-center gap-1 text-sm font-bold text-gray-700 truncate pr-2 min-w-0">
                  <GripVertical size={15} className="hidden md:inline-block text-gray-400 shrink-0" />
                  <span className="truncate">
                    {month}月{activePopup.day}日{appUser.role === 'admin' && popupStaff ? ` (${popupStaff.name})` : ''} - {activePopup.type === 'shift' ? 'シフト選択' : 'タスク選択'}
                  </span>
                </div>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setActivePopup(null)}
                  className="p-1 bg-gray-100 text-gray-600 rounded-md font-bold hover:bg-gray-200 transition shrink-0 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              {showPopupScheduleSummary && (() => {
                // 案A: 「月間全体表」「施設別」画面でのシフト変更時に、対象人物のその週のミニシフト帯（前月末またぎ含む） ＋ 3クール・有休(残数/可能数) ＋ 1ヶ月展開を表示
                const curDay = activePopup.day;
                const curDow = getDayOfWeek(year, month, curDay);
                const weekStartDay = curDay - curDow; // 日曜始まり (0..6)
                const { prevYear, prevMonth, prevDaysInMonth } = prevMonthCarryOver;
                const closedRulesArr = Array.isArray(adminSettings.clinicClosedDays) ? adminSettings.clinicClosedDays : [];

                const weekCells = [];
                for (let i = 0; i < 7; i++) {
                  const dNum = weekStartDay + i;
                  const inMonth = dNum >= 1 && dNum <= daysInMonth;
                  const isPrevMonthStraddle = dNum < 1;
                  const prevDayNum = isPrevMonthStraddle ? prevDaysInMonth + dNum : null;
                  const sCode = inMonth
                    ? shiftData[popupStaff.id]?.[dNum]
                    : isPrevMonthStraddle && prevDayNum >= 1
                      ? prevMonthShiftData[popupStaff.id]?.[prevDayNum] || null
                      : null;
                  const tCode = inMonth ? taskData[popupStaff.id]?.[dNum] : null;
                  const sDef = sCode ? shiftDefs[sCode] : null;
                  const tDef = tCode ? shiftDefs[tCode] : null;
                  const reqCode = inMonth ? getUserRequestedShift(popupStaff.id, dNum) : null;
                  const reqDef = reqCode ? shiftDefs[reqCode] : null;
                  const reqReasonCell = inMonth ? getUserRequestedReason(popupStaff.id, dNum) : '';
                  const teamLockCell = inMonth && appUser.role === 'admin' ? getTeamLockedShiftSource(popupStaff.id, dNum) : null;
                  const hasBell = inMonth ? Boolean(bellData[popupStaff.id]?.[dNum]) : false;
                  weekCells.push({
                    dowIdx: i,
                    dowLbl: ['日', '月', '火', '水', '木', '金', '土'][i],
                    dNum,
                    inMonth,
                    isPrevMonthStraddle,
                    prevDayNum,
                    sCode,
                    sDef,
                    tDef,
                    reqCode,
                    reqDef,
                    reqReasonCell,
                    teamLockCell,
                    hasBell,
                    isHol:
                      (inMonth && isHoliday(year, month, dNum, clinicClosedDays)) ||
                      (isPrevMonthStraddle && prevDayNum >= 1 && isHoliday(prevYear, prevMonth, prevDayNum, closedRulesArr)),
                  });
                }

                const isPopupFirstWeek = curDay <= 7 - getDayOfWeek(year, month, 1);
                const popupCarry = appUser.role === 'admin' && isPopupFirstWeek ? prevMonthCarryOver.byStaff[popupStaff.id] : null;
                const showPopupCarryBadges = !!(
                  popupCarry &&
                  prevMonthCarryOver.hasStraddlingWeek &&
                  popupCarry.staffHasPrevWorkShift &&
                  (popupCarry.trailingWorkStreak > 0 || popupCarry.prevLastDayWasCool3)
                );
                const maxStreakPopup = Number(adminSettings.maxConsecutiveWorkDays) || 5;

                // 3クール残数/可能数 ＆ 年間有休残数/可能数（※有休管理機能未実装のためデフォルト20日ベース）
                let usedCool3 = 0;
                let usedPaidLeaveInMonth = 0;
                daysArray.forEach(dIdx => {
                  if (isSunday(year, month, dIdx)) return;
                  const c = shiftData[popupStaff.id]?.[dIdx];
                  const def = c ? shiftDefs[c] : null;
                  if (!def) return;
                  if (isCool3ShiftDef(def, categoryDefs)) usedCool3++;
                  if (isAnnualPaidLeaveShiftDef(def, categoryDefs)) usedPaidLeaveInMonth++;
                });
                const maxCool3 = Number(popupStaff.maxCool3 ?? 5);
                const minCool3 = Number(popupStaff.minCool3 ?? 0);
                const remCool3 = Math.max(0, maxCool3 - usedCool3);
                const isCool3Over = usedCool3 > maxCool3;

                const annualPaidLeaveMax = Number(popupStaff.annualPaidLeaveDays ?? 20);
                const remPaidLeave = Math.max(0, annualPaidLeaveMax - usedPaidLeaveInMonth);

                return (
                  <div className="mb-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 shrink-0">
                    {/* ミニ集計バー（3クール 残数/可能数 ＆ 年間有休 残数/可能数）＋ 1ヶ月全体トグル */}
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold border ${
                            isCool3Over
                              ? 'bg-red-100 text-red-700 border-red-300'
                              : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                          }`}
                          title={`今月の3クール取得: ${usedCool3}回（下限${minCool3}〜上限${maxCool3}回）`}
                        >
                          3クール(残/可能): {remCool3}/{maxCool3}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-900 border border-emerald-200"
                          title="※有休管理機能は未実装のため仮表示（当月の年休取得数を反映）"
                        >
                          有休(残/可能): {remPaidLeave}/{annualPaidLeaveMax}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPopupFullMonthCal(prev => !prev)}
                        className="px-1.5 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold transition shrink-0"
                      >
                        {showPopupFullMonthCal ? '▲ 週表示のみ' : '▼ 1ヶ月全体'}
                      </button>
                    </div>

                    {showPopupCarryBadges && (
                      <div className="flex items-center gap-1 flex-wrap" title={popupCarry.tooltipText}>
                        {popupCarry.trailingWorkStreak > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold leading-tight ${
                              popupCarry.isCrossMonthStreakViolated
                                ? 'bg-red-100 text-red-700 border-red-300'
                                : popupCarry.trailingWorkStreak >= maxStreakPopup
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : popupCarry.trailingWorkStreak >= maxStreakPopup - 1
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {popupCarry.isCrossMonthStreakViolated
                              ? `⚠️月またぎ${popupCarry.crossMonthTotalStreak}連勤`
                              : popupCarry.trailingWorkStreak >= maxStreakPopup
                                ? `前月${popupCarry.trailingWorkStreak}連勤(1日休要)`
                                : `前月${popupCarry.trailingWorkStreak}連勤`}
                          </span>
                        )}
                        {popupCarry.prevLastDayWasCool3 && (
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold leading-tight ${
                              popupCarry.isCrossMonthCool3Violated
                                ? 'bg-red-100 text-red-700 border-red-300'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                          >
                            {popupCarry.isCrossMonthCool3Violated
                              ? '⚠️1日3ｸｰﾙ連続'
                              : `前末:${popupCarry.prevLastDayLabel}`}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 今週（日〜土）の7日間ミニシフト帯（前月末またぎ日・管理固定・本人入力表示付き） */}
                    <div className="grid grid-cols-7 gap-1">
                      {weekCells.map(wc => {
                        const isTarget = wc.inMonth && wc.dNum === curDay;
                        const canJump =
                          wc.inMonth &&
                          (wc.dowIdx !== 0 || hasKoushutsuShiftDef || activePopup.type === 'task') &&
                          (appUser.role === 'admin' || popupStaff.id === appUser.id);
                        return (
                          <div
                            key={wc.dowIdx}
                            onClick={() => {
                              if (canJump) {
                                if (activePopup.type === 'shift') {
                                  setPopupReasonText(getUserRequestedReason(popupStaff.id, wc.dNum));
                                }
                                setActivePopup(prev => ({ ...prev, day: wc.dNum }));
                              }
                            }}
                            title={wc.isPrevMonthStraddle ? `前月 ${prevMonth}/${wc.prevDayNum}（${wc.sDef ? wc.sDef.label : '休'}）` : undefined}
                            className={`relative rounded border p-1 flex flex-col items-center justify-between min-h-[46px] text-center transition ${
                              !wc.inMonth && !wc.isPrevMonthStraddle
                                ? 'bg-gray-100/60 border-gray-200 opacity-40'
                                : wc.isPrevMonthStraddle
                                  ? 'bg-slate-100/90 border-slate-300 opacity-85'
                                  : isTarget
                                    ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-400 shadow-2xs'
                                    : wc.dowIdx === 0 || wc.isHol
                                      ? 'bg-red-50/60 border-red-200 hover:border-blue-300'
                                      : wc.dowIdx === 6
                                        ? 'bg-blue-50/40 border-blue-200 hover:border-blue-300'
                                        : 'bg-white border-gray-200 hover:border-blue-300'
                            } ${canJump ? 'cursor-pointer' : ''}`}
                          >
                            {wc.inMonth && wc.teamLockCell && (
                              <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 pointer-events-none" title="管理者固定" />
                            )}
                            {wc.inMonth && appUser.role === 'admin' && wc.reqCode && (
                              wc.reqReasonCell ? (
                                <span className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-pink-500 border-l-[6px] border-l-transparent pointer-events-none" title={`本人希望(${wc.reqDef?.label || wc.reqCode}) / 理由あり`} />
                              ) : (
                                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-pink-500 pointer-events-none" title={`本人希望(${wc.reqDef?.label || wc.reqCode})`} />
                              )
                            )}
                            <div
                              className={`text-[9px] font-bold leading-none ${
                                wc.isPrevMonthStraddle
                                  ? 'text-slate-500'
                                  : wc.dowIdx === 0 || wc.isHol
                                    ? 'text-red-600'
                                    : wc.dowIdx === 6
                                      ? 'text-blue-600'
                                      : 'text-gray-500'
                              }`}
                            >
                              {wc.inMonth
                                ? `${wc.dNum}(${wc.dowLbl})`
                                : wc.isPrevMonthStraddle
                                  ? `${prevMonth}/${wc.prevDayNum}`
                                  : wc.dowLbl}
                            </div>
                            {wc.inMonth || wc.isPrevMonthStraddle ? (
                              <>
                                <div className="text-[11px] font-extrabold leading-tight mt-0.5">
                                  {wc.sDef ? (
                                    <span className={wc.sDef.text || 'text-gray-800'}>{wc.sDef.label}</span>
                                  ) : wc.reqDef ? (
                                    <span className="text-[9px] text-pink-500">希:{wc.reqDef.label}</span>
                                  ) : (
                                    <span className="text-gray-300 font-normal text-[10px]">-</span>
                                  )}
                                </div>
                                <div
                                  className={`w-full text-[9px] leading-none rounded px-0.5 truncate ${
                                    wc.hasBell ? 'bg-orange-200 text-orange-900 font-bold' : 'text-gray-500'
                                  }`}
                                >
                                  {wc.tDef ? wc.tDef.label : wc.hasBell ? '🔔' : wc.isPrevMonthStraddle ? '前月' : ''}
                                </div>
                              </>
                            ) : (
                              <div className="text-[10px] text-gray-300">-</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 1ヶ月全体の展開ミニカレンダー（前月末の同じ週にかかる日も表示＋管理固定・本人入力アイコン付き） */}
                    {showPopupFullMonthCal && (
                      <div className="pt-1.5 border-t border-slate-200">
                        <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-gray-500 mb-0.5">
                          <span className="text-red-500">日</span>
                          <span>月</span>
                          <span>火</span>
                          <span>水</span>
                          <span>木</span>
                          <span>金</span>
                          <span className="text-blue-500">土</span>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {calendarDays.map((cCell, cIdx) => {
                            const dNum = cCell.currentMonth ? cCell.day : null;
                            const cellM = cCell.date.getMonth() + 1;
                            const cellY = cCell.date.getFullYear();
                            const cellD = cCell.date.getDate();
                            const isPrevStraddleCell =
                              !cCell.currentMonth &&
                              prevMonthCarryOver.hasStraddlingWeek &&
                              cellY === prevYear &&
                              cellM === prevMonth;
                            const sCode = dNum
                              ? shiftData[popupStaff.id]?.[dNum]
                              : isPrevStraddleCell
                                ? prevMonthShiftData[popupStaff.id]?.[cellD] || null
                                : null;
                            const sDef = sCode ? shiftDefs[sCode] : null;
                            const tCode = dNum ? taskData[popupStaff.id]?.[dNum] : null;
                            const tDef = tCode ? shiftDefs[tCode] : null;
                            const teamLockCal = dNum && appUser.role === 'admin' ? getTeamLockedShiftSource(popupStaff.id, dNum) : null;
                            const reqCodeCal = dNum && appUser.role === 'admin' ? getUserRequestedShift(popupStaff.id, dNum) : null;
                            const isTarget = dNum === curDay;
                            const isSunCell = cCell.date.getDay() === 0;
                            const isSatCell = cCell.date.getDay() === 6;
                            const isHolCell =
                              (dNum && isHoliday(year, month, dNum, clinicClosedDays)) ||
                              (isPrevStraddleCell && isHoliday(prevYear, prevMonth, cellD, closedRulesArr));
                            return (
                              <div
                                key={cIdx}
                                onClick={() => {
                                  if (dNum && (!isSunCell || hasKoushutsuShiftDef || activePopup.type === 'task')) {
                                    if (activePopup.type === 'shift') {
                                      setPopupReasonText(getUserRequestedReason(popupStaff.id, dNum));
                                    }
                                    setActivePopup(prev => ({ ...prev, day: dNum }));
                                  }
                                }}
                                title={isPrevStraddleCell ? `前月 ${cellM}/${cellD}（${sDef ? sDef.label : '休'}）` : undefined}
                                className={`relative rounded border px-0.5 py-0.5 flex flex-col items-center justify-center min-h-[32px] ${
                                  isPrevStraddleCell
                                    ? 'bg-slate-100/90 border-slate-200 opacity-85'
                                    : !cCell.currentMonth
                                      ? 'bg-gray-100/40 border-transparent opacity-30'
                                      : isTarget
                                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-400 font-bold'
                                        : isSunCell || isHolCell
                                          ? 'bg-red-50/50 border-red-100 cursor-pointer hover:border-blue-300'
                                          : isSatCell
                                            ? 'bg-blue-50/30 border-blue-100 cursor-pointer hover:border-blue-300'
                                            : 'bg-white border-gray-200 cursor-pointer hover:border-blue-300'
                                }`}
                              >
                                {dNum && teamLockCal && (
                                  <span className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-teal-500 pointer-events-none" />
                                )}
                                {dNum && reqCodeCal && (
                                  <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-pink-500 pointer-events-none" />
                                )}
                                <span
                                  className={`text-[8px] leading-none ${
                                    isPrevStraddleCell
                                      ? 'text-slate-500 font-bold'
                                      : isSunCell || isHolCell
                                        ? 'text-red-500'
                                        : isSatCell
                                          ? 'text-blue-500'
                                          : 'text-gray-400'
                                  }`}
                                >
                                  {isPrevStraddleCell ? `${cellM}/${cellD}` : cellD}
                                </span>
                                {(dNum || isPrevStraddleCell) && (
                                  <span className={`text-[10px] font-bold leading-tight ${sDef ? sDef.text : 'text-gray-300'}`}>
                                    {sDef ? sDef.label : '-'}
                                  </span>
                                )}
                                {dNum && tDef && (
                                  <span className="text-[8px] leading-none text-gray-500">{tDef.label}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {isMasterAdmin && (pendingChangeRequestMapByStaffDay[`${activePopup.staffId}_${activePopup.day}`] || []).length > 0 && (
                <div className="mb-2 p-2 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 shrink-0">
                  <div className="font-bold flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                      <RefreshCw size={13} className="text-amber-600" />
                      この日の勤務変更申請が届いています
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActivePopup(null);
                        setShowAdminChangeRequestsModal(true);
                      }}
                      className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[11px] transition shrink-0"
                    >
                      確認・承認画面へ
                    </button>
                  </div>
                </div>
              )}
              {appUser.role === 'staff' && activePopup.staffId === appUser.id && isAfterDeadlineForCurrentMonth && (
                <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 shrink-0">
                  <div className="font-bold mb-1.5 flex items-center gap-1">
                    <RefreshCw size={13} className="text-amber-600" />
                    締切後の勤務変更申請
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openStaffChangeRequestModal(activePopup.day, 'swap')}
                      className="flex-1 py-1.5 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs transition shadow-sm"
                    >
                      職員同士交換
                    </button>
                    <button
                      type="button"
                      onClick={() => openStaffChangeRequestModal(activePopup.day, 'single')}
                      className="flex-1 py-1.5 px-2 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded font-bold text-xs transition shadow-sm"
                    >
                      単独変更
                    </button>
                  </div>
                </div>
              )}
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
                      {popupCurrentCode !== popupReqCode && popupReqDef && !(activePopup.type === 'shift' && popupStaff && isMeShiftDef(popupReqCode, shiftDefs, categoryDefs) && !isMeTeamMember(popupStaff)) && (isMasterAdmin || teamClearPerm.allowed || popupOptions.some(o => o.code === popupReqCode)) && (
                        <button
                          onClick={() => {
                            if (!isMasterAdmin && teamClearPerm.allowed && !popupOptions.some(o => o.code === popupReqCode)) {
                              // 班管理者が自班の入力を取り消して元の個人希望に戻す場合
                              const beforeLbl = popupCurrentCode ? (shiftDefs[popupCurrentCode]?.label || popupCurrentCode) : '空欄';
                              const afterLbl = popupReqDef ? popupReqDef.label : popupReqCode;
                              recordAdminUndoSnapshot(null, {
                                label: `${popupStaff?.name || '職員'}（${month}/${activePopup.day}）希望に戻す`,
                                detail: `${beforeLbl} → ${afterLbl}`,
                              });
                              const nextShifts = { ...shiftData, [activePopup.staffId]: { ...(shiftData[activePopup.staffId] || {}), [activePopup.day]: popupReqCode } };
                              const entry = normalizeUserInputEntry(userInputs[activePopup.staffId]?.[activePopup.day], shiftData[activePopup.staffId]?.[activePopup.day], taskData[activePopup.staffId]?.[activePopup.day]);
                              delete entry.teamShiftBy;
                              delete entry.editedShiftBy;
                              const nextInputs = { ...userInputs, [activePopup.staffId]: { ...(userInputs[activePopup.staffId] || {}), [activePopup.day]: entry } };
                              setShiftData(nextShifts);
                              setUserInputs(nextInputs);
                              saveSchedule(nextShifts, taskData, nextInputs);
                            } else {
                              handleUpdateCell(activePopup.staffId, activePopup.day, popupReqCode, activePopup.type);
                            }
                            setActivePopup(null);
                          }}
                          className="px-2 py-1 bg-white hover:bg-pink-100 text-pink-700 border border-pink-300 rounded font-bold text-[10px] transition"
                          title="本人が入力した希望内容に戻します"
                        >
                          希望に戻す
                        </button>
                      )}
                      {isMasterAdmin && (
                        <button
                          onClick={() => { handleClearUserRequest(activePopup.staffId, activePopup.day, activePopup.type); setActivePopup(null); }}
                          className="px-2 py-1 bg-white hover:bg-red-100 text-red-600 border border-red-200 rounded font-bold text-[10px] transition"
                          title="個人の希望履歴自体を消去します"
                        >
                          希望取消
                        </button>
                      )}
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
              {appUser.role === 'admin' && activePopup.type === 'shift' && !isSunday(year, month, activePopup.day) && (() => {
                const curDef = popupCurrentCode ? shiftDefs[popupCurrentCode] : null;
                const curCat = curDef ? categoryDefs[curDef.category] : null;
                if (!curDef || getEffectiveShiftType(curDef, categoryDefs) !== 'shift' || !isLeaderHighlightTargetFacility(curCat)) {
                  return null;
                }
                const isManualOn = Boolean(leaderData[activePopup.staffId]?.[activePopup.day]);
                const curHighlight = autoShiftHighlightMap[`${activePopup.staffId}_${activePopup.day}`];
                const lightBg = resolveLightBgFromShiftOrCategory(curDef, curCat);
                if (curHighlight?.source === 'auto' && !isManualOn) {
                  return (
                    <div className={`mb-2.5 px-3 py-1.5 rounded-lg border border-black/10 text-xs font-bold flex items-center justify-between shrink-0 ${lightBg} ${curDef.text || 'text-gray-800'}`}>
                      <span>{curCat.label} リーダー色付け中（3クール自動）</span>
                      <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded border border-black/10">自動</span>
                    </div>
                  );
                }
                return (
                  <button
                    type="button"
                    onClick={() => { handleToggleManualLeader(activePopup.staffId, activePopup.day); setActivePopup(null); }}
                    className={`mb-2.5 w-full py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-between transition shrink-0 ${
                      isManualOn
                        ? `${lightBg} border-blue-400 text-gray-900 shadow-xs hover:brightness-95`
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                    title="3クールにリーダー不在時など、入っているシフト内容を変えずにリーダー色付けを手動でON/OFFします"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block w-3 h-3 rounded-sm border border-black/20 ${lightBg}`} />
                      <span>{curCat.label} リーダー色付け（手動）</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${isManualOn ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}>
                      {isManualOn ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })()}
              {appUser.role === 'admin' && activePopup.type === 'task' && (() => {
                const isBellActive = Boolean(bellData[activePopup.staffId]?.[activePopup.day]);
                return (
                  <button
                    type="button"
                    onClick={() => { handleToggleBell(activePopup.staffId, activePopup.day); setActivePopup(null); }}
                    className={`mb-2.5 w-full py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-between transition shrink-0 ${
                      isBellActive
                        ? 'bg-orange-200 border-orange-400 text-orange-900 hover:bg-orange-300 shadow-xs'
                        : 'bg-orange-50/70 border-orange-200 text-orange-800 hover:bg-orange-100'
                    }`}
                    title="入っているタスク内容を変えずにタスク欄の背景色（オレンジ）だけをON/OFFします"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block w-3 h-3 rounded-sm border ${isBellActive ? 'bg-orange-500 border-orange-600' : 'bg-orange-200 border-orange-300'}`} />
                      <span>緊急待機番 色付け</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${isBellActive ? 'bg-orange-600 text-white' : 'bg-white text-orange-700 border border-orange-300'}`}>
                      {isBellActive ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })()}
              {/* PC時は4列、スマホ時は4～6列に調整。クリアボタンは全体管理者・個人・または自班が入力したセルのみ表示。 */}
              {!(activePopup.type === 'task' && isSunday(year, month, activePopup.day)) ? (
                <>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-4 gap-2 overflow-y-auto flex-1 min-h-0 max-h-[40vh] md:max-h-[45vh] p-1">
                    {teamClearPerm.allowed && (
                      <button
                        onClick={() => { handleUpdateCell(activePopup.staffId, activePopup.day, null, activePopup.type); setActivePopup(null); }}
                        className="h-12 md:h-9 text-xs text-red-500 border border-red-200 bg-red-50 rounded hover:bg-red-100 flex items-center justify-center font-bold"
                        title={appUser.role === 'admin' && popupReqCode ? 'セルを空欄にします（個人の希望履歴・理由は保持されます）' : 'クリア'}
                      >
                        クリア
                      </button>
                    )}
                    {popupOptions.map(shift => {
                      const isMeLockedShiftOption =
                        activePopup.type === 'shift' &&
                        Boolean(popupStaff) &&
                        isMeShiftDef(shift.code, shiftDefs, categoryDefs) &&
                        !isMeTeamMember(popupStaff);
                      const isRestrictedShiftOption =
                        !isMeLockedShiftOption &&
                        appUser.role === 'admin' &&
                        activePopup.type === 'shift' &&
                        Boolean(popupStaff) &&
                        isAiAssignableFacilityShiftDef(shift.code, shiftDefs, categoryDefs) &&
                        !isShiftAllowedForStaff(popupStaff, shift.code);
                      return (
                        <button
                          key={shift.code}
                          type="button"
                          disabled={isMeLockedShiftOption}
                          onClick={() => {
                            if (isMeLockedShiftOption) return;
                            handleUpdateCell(
                              activePopup.staffId,
                              activePopup.day,
                              shift.code,
                              activePopup.type,
                              appUser.role === 'staff' && activePopup.type === 'shift' ? popupReasonText : undefined
                            );
                            setActivePopup(null);
                          }}
                          className={`h-12 md:h-9 w-full rounded flex items-center justify-center font-bold text-xs border transition ${
                            isMeLockedShiftOption
                              ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed opacity-75'
                              : isRestrictedShiftOption
                                ? 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-200/70'
                                : `${shift.text} hover:bg-gray-50`
                          }`}
                          title={
                            isMeLockedShiftOption
                              ? `${shift.label}（ME班（オペ班）のみ設定可能）`
                              : isRestrictedShiftOption
                                ? `${shift.label}（制限・除外対象 / クリックで設定可能）`
                                : shift.label
                          }
                        >
                          {shift.label}
                        </button>
                      );
                    })}
                  </div>
                  {popupOptions.length === 0 && (
                    <p className="text-[11px] text-gray-400 text-center py-2 shrink-0">
                      この班で入力可能な項目は設定されていません
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-gray-500 text-center py-2 shrink-0">
                  日曜日のタスク欄は緊急待機番の色付けのみ設定可能です
                </p>
              )}
            </div>
          );
        })()}

        {/* 作業履歴一覧・状態移行モーダル */}
        {showUndoHistoryModal && appUser?.role === 'admin' && (() => {
          const pastList = undoHistory.past || [];
          const futureList = undoHistory.future || [];
          const currentStep = pastList.length;
          const allActions = [
            ...pastList.map(p => p.actionMeta || { label: 'シフト編集', detail: '', timeStr: '' }),
            ...futureList.map(f => f.actionMeta || { label: 'シフト編集', detail: '', timeStr: '' }),
          ];
          const totalSteps = allActions.length;
          const stepRows = Array.from({ length: totalSteps + 1 }, (_, stepIdx) => {
            if (stepIdx === 0) {
              return {
                stepIdx: 0,
                label: '作業開始時の状態（初期状態）',
                detail: `${year}年${month}月を開いた時点、または履歴リセット時点の状態`,
                timeStr: '',
                isInitial: true,
              };
            }
            const meta = allActions[stepIdx - 1] || {};
            return {
              stepIdx,
              label: meta.label || 'シフト編集',
              detail: meta.detail || '',
              timeStr: meta.timeStr || '',
              isInitial: false,
            };
          }).reverse();

          return (
            <div className="absolute inset-0 bg-black/50 z-[115] flex items-center justify-center p-4" onClick={() => setShowUndoHistoryModal(false)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[82vh] border border-gray-200" onClick={e => e.stopPropagation()}>
                <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-slate-800 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-indigo-200" />
                    <div>
                      <h3 className="text-sm font-bold leading-tight">変更履歴（{year}年{month}月）</h3>
                      <p className="text-[11px] text-indigo-100">誰の何日を変更したかを確認し、クリックでその時点の状態に移行できます</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUndoHistoryModal(false)}
                    className="p-1 rounded-lg hover:bg-white/15 text-white transition"
                    title="閉じる"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="px-4 py-2 bg-slate-50 border-b border-gray-200 flex items-center justify-between text-xs text-gray-600 shrink-0">
                  <span>
                    記録件数: <strong className="text-gray-900">{totalSteps}</strong> 件（最大50件保持）
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleUndoSchedule}
                      disabled={pastList.length === 0}
                      className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 font-bold text-[11px] text-gray-700 flex items-center gap-0.5"
                    >
                      <ChevronLeft size={13} /> 1つ戻る
                    </button>
                    <button
                      type="button"
                      onClick={handleRedoSchedule}
                      disabled={futureList.length === 0}
                      className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 font-bold text-[11px] text-gray-700 flex items-center gap-0.5"
                    >
                      1つ進む <ChevronRight size={13} />
                    </button>
                  </div>
                </div>

                <div className="p-3 overflow-y-auto flex-1 space-y-1.5">
                  {totalSteps === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-xs">
                      まだこの画面での変更履歴はありません。<br />
                      シフト・タスクの変更やAI作成を行うとここに履歴が記録されます。
                    </div>
                  ) : (
                    stepRows.map(row => {
                      const isCurrent = row.stepIdx === currentStep;
                      const isFuture = row.stepIdx > currentStep;
                      return (
                        <div
                          key={`hist_step_${row.stepIdx}`}
                          onClick={() => {
                            if (!isCurrent) {
                              handleJumpToHistoryStep(row.stepIdx);
                            }
                          }}
                          className={`p-2.5 rounded-lg border transition flex items-center justify-between gap-2 ${
                            isCurrent
                              ? 'bg-indigo-50/90 border-indigo-400 ring-1 ring-indigo-300'
                              : isFuture
                                ? 'bg-amber-50/40 border-gray-200 hover:border-amber-300 hover:bg-amber-50/80 cursor-pointer'
                                : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                isCurrent
                                  ? 'bg-indigo-600 text-white'
                                  : row.isInitial
                                    ? 'bg-gray-200 text-gray-700'
                                    : isFuture
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-700'
                              }`}>
                                #{row.stepIdx}
                              </span>
                              <span className={`text-xs font-bold truncate ${isCurrent ? 'text-indigo-950' : 'text-gray-800'}`}>
                                {row.label}
                              </span>
                              {row.timeStr && (
                                <span className="text-[10px] text-gray-400 font-mono ml-auto">
                                  {row.timeStr}
                                </span>
                              )}
                            </div>
                            {row.detail && (
                              <div className="mt-1 text-[11px] text-gray-600 font-medium truncate">
                                {row.detail}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0">
                            {isCurrent ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 text-white text-[10px] font-bold shadow-xs">
                                <Check size={11} /> 現在の状態
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleJumpToHistoryStep(row.stepIdx);
                                }}
                                className={`px-2 py-1 rounded-md border text-[10px] font-bold transition ${
                                  isFuture
                                    ? 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100'
                                    : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                }`}
                              >
                                {isFuture ? 'この状態に進む' : 'この状態に戻す'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <span className="text-[11px] text-gray-500 leading-snug">
                    ※履歴はこのブラウザに月ごと保存されます（状態移行時はクラウドにも自動保存）
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      disabled={totalSteps === 0}
                      onClick={handleClearCurrentMonthHistory}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 text-xs font-bold transition"
                      title="この月の履歴のみブラウザから消去します（勤務表は変更されません）"
                    >
                      <Trash2 size={13} />
                      <span>履歴をクリア</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUndoHistoryModal(false)}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold transition"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 統合設定モーダル */}
        {showSettingsModal && isMasterAdmin && (
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
                  {isMasterAdmin && (
                    <button onClick={() => setActiveSettingsTab('teamAdmin')} className={`p-3 rounded text-left text-sm font-bold flex items-center gap-2 ${activeSettingsTab === 'teamAdmin' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}><ShieldCheck size={16}/> 班管理者権限</button>
                  )}
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
                              const newSettings = { ...adminSettings, deadlineDay: e.target.value, deadline: '' };
                              setAdminSettings(newSettings);
                              saveMasterData({ adminSettings: newSettings });
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
                          ここで選択したシフトのうち、<strong>個人（スタッフ本人）から入力されたもののみ</strong>を個人カレンダーの「休○」バッジおよび集計の「休み希望数」にカウントします（平日・平日の祝日・土曜すべて対象／日曜およびパート職員の入力分はカウント対象外）。
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
                              <div className="w-full border border-gray-200 p-2 rounded bg-gray-100 text-sm font-bold text-gray-700">
                                自動計算（週1日休みペース: 月4〜5日）
                              </div>
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-600 bg-white border border-gray-200 rounded-md p-3 space-y-1 leading-relaxed">
                            <div>・<strong>休みの表現と祝日・振休：</strong>AIは公休や祝日の休みにコードを入れず<strong>「空欄」</strong>のまま残します。祝日の空欄休みや、祝日出勤者の別日の<strong>「振休」</strong>はその週の週休1日分としてカウントし、基本は週5日出勤（同じ週に休み希望等がある場合は週4日以下の出勤も可）として扱います。</div>
                            <div>・<strong>休み・年休・公出の扱い：</strong>「休み」「希望」カテゴリのシフト（休・年休・特別・永年・子看・指定・振休など）はその週の週休1日分として扱い、基本は残り5日間を出勤配置します（複数日希望がある週は週4日以下も可）。一方、平日の<strong>「公出」</strong>は業務出張扱いのため現場出勤人数・出勤日数には含めず、公出しか入っていない週は別日に必ずもう1日<strong>「空欄の公休」</strong>を残します（その週の現場出勤は4日間）。</div>
                            <div>・<strong>ME室の扱い：</strong>ME室カテゴリのシフトはOPE班管理のためAIでの自動入力・既存変更は行いません（既に入力済みの日は連勤・出勤日数にカウント、祝日のME室必要人数は0人扱い）。</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'category' && (
                    <div className="flex h-full gap-4">
                      <div className="w-1/3 border-r pr-4 overflow-y-auto">
                        <button onClick={handleAddCategory} className="w-full mb-3 py-2 bg-blue-100 text-blue-700 font-bold rounded text-xs flex items-center justify-center gap-1 hover:bg-blue-200"><Plus size={12}/> 新規カテゴリ</button>
                        <div className="space-y-2">
                          {Object.values(categoryDefs).sort((a,b)=>(a.order ?? 99) - (b.order ?? 99)).map(cat => {
                            const kindVal = resolveCategoryKind(cat);
                            const kindMeta = CATEGORY_KIND_OPTIONS.find(o => o.value === kindVal);
                            return (
                              <div
                                key={cat.id}
                                className={`p-2 rounded border text-xs font-bold flex items-center gap-2 cursor-pointer ${targetCategory?.originalId === cat.id ? 'ring-2 ring-blue-400' : ''} ${cat.color}`}
                                onClick={() => handleEditCategory(cat.id)}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData('text/plain', cat.id)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => { e.preventDefault(); handleSortCategory(e.dataTransfer.getData('text/plain'), cat.id); }}
                              >
                                <GripVertical size={14} className="text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0" />
                                <span className="flex-1 truncate">{cat.label}</span>
                                <span className="px-1.5 py-0.5 rounded bg-white/80 text-gray-600 border border-black/10 text-[10px] font-semibold shrink-0">
                                  {kindMeta?.shortLabel || kindVal}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex-1 pl-4 overflow-y-auto">
                        {targetCategory ? (
                          <div className="space-y-4 max-w-lg pb-4">
                            <h4 className="font-bold text-gray-700 border-b pb-2">カテゴリ編集</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div><label className="text-xs font-bold text-gray-500">ID (英数字)</label><input type="text" className="w-full border p-2 rounded text-sm disabled:bg-gray-100" value={targetCategory.id} onChange={e => setTargetCategory({...targetCategory, id: e.target.value.trim()})} disabled={!!targetCategory.originalId}/></div>
                              <div><label className="text-xs font-bold text-gray-500">表示名</label><input type="text" className="w-full border p-2 rounded text-sm" value={targetCategory.label} onChange={e => setTargetCategory({...targetCategory, label: e.target.value})}/></div>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-gray-500 block mb-1">カテゴリの種類（AI作成・集計での役割）</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {CATEGORY_KIND_OPTIONS.map(opt => {
                                  const selected = resolveCategoryKind(targetCategory) === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setTargetCategory({ ...targetCategory, kind: opt.value })}
                                      className={`text-left p-2.5 rounded-lg border transition ${
                                        selected
                                          ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-400'
                                          : 'bg-white border-gray-200 hover:bg-gray-50'
                                      }`}
                                    >
                                      <div className={`text-xs font-bold ${selected ? 'text-blue-800' : 'text-gray-800'}`}>{opt.label}</div>
                                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{opt.desc}</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500">色スタイル</label><div className="grid grid-cols-3 gap-2 mt-1">{BG_COLOR_OPTIONS.map(opt => (<button key={opt.value} onClick={() => setTargetCategory({...targetCategory, color: opt.value})} className={`text-xs p-2 rounded border font-bold ${opt.value} ${targetCategory.color === opt.value ? 'ring-2 ring-blue-500' : ''}`}>{opt.label}</button>))}</div></div>
                            <div className="flex justify-between pt-4">{targetCategory.originalId && <button onClick={() => deleteCategory(targetCategory.originalId)} className="text-red-500 text-sm hover:underline">削除</button>}<button onClick={saveCategory} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 ml-auto">保存</button></div>
                          </div>
                        ) : <div className="text-gray-400 text-center mt-20">左側からカテゴリを選択または新規作成してください</div>}
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'shift' && (
                    <div className="flex h-full gap-4">
                      <div className="w-2/5 border-r pr-4 overflow-y-auto">
                        <button onClick={handleAddNewShift} className="w-full mb-2.5 py-2 bg-blue-100 text-blue-700 font-bold rounded text-xs flex items-center justify-center gap-1 hover:bg-blue-200"><Plus size={12}/> 新規シフト</button>
                        <p className="text-[10px] text-gray-500 mb-3 leading-snug bg-gray-50 border border-gray-200 rounded p-2">
                          右端の区分プルダウンを切り替えると即座に自動保存され、AI作成・検算ルールに反映されます。
                        </p>
                        <div className="space-y-4">
                          {dynamicPaletteGroups.map(g => (
                            <div key={g.id}>
                              <div className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center justify-between">
                                <span>{g.name}</span>
                                <span className="text-[9px] font-normal">表示名 (コード) / AI区分</span>
                              </div>
                              <div className="space-y-1">
                                {g.items.map(code => {
                                  const sItem = shiftDefs[code];
                                  if (!sItem) return null;
                                  const effType = getEffectiveShiftType(sItem, categoryDefs);
                                  const catKind = getCategoryKindById(sItem.category, categoryDefs);
                                  const workSlot = resolveShiftWorkSlot(sItem, categoryDefs);
                                  const slotMeta = workSlot ? getShiftWorkSlotMeta(workSlot) : null;
                                  return (
                                    <div
                                      key={code}
                                      draggable
                                      onDragStart={(e) => e.dataTransfer.setData('text/plain', code)}
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => { e.preventDefault(); handleSortShift(e.dataTransfer.getData('text/plain'), code); }}
                                      onClick={() => handleEditShift(code)}
                                      className={`p-1.5 rounded cursor-pointer border text-xs flex items-center gap-1.5 ${
                                        editingShift?.originalCode === code ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                                      }`}
                                    >
                                      <GripVertical size={13} className="text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0" />
                                      <span className={`font-bold truncate ${sItem.text}`}>{sItem.label}</span>
                                      <span className="text-[10px] text-gray-400 shrink-0">({sItem.code})</span>
                                      <div className="ml-auto shrink-0" onClick={e => e.stopPropagation()}>
                                        {effType === 'task' ? (() => {
                                          const taskFacTargets = getRoleFacilityTargets(sItem, categoryDefs);
                                          const taskFacEntries = Object.entries(taskFacTargets);
                                          const targetInfo = getRoleTotalTargetInfo(sItem, categoryDefs);
                                          if (taskFacEntries.length === 0) {
                                            return (
                                              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 text-[10px]">
                                                タスク
                                              </span>
                                            );
                                          }
                                          const facDetailStr = taskFacEntries
                                            .map(([tKey, n]) => {
                                              if (tKey.endsWith('_mwf')) {
                                                const baseId = tKey.slice(0, -4);
                                                return `${categoryDefs[baseId]?.label || baseId}(月水金):${n}名`;
                                              }
                                              if (tKey.endsWith('_tts')) {
                                                const baseId = tKey.slice(0, -4);
                                                return `${categoryDefs[baseId]?.label || baseId}(火木土):${n}名`;
                                              }
                                              return `${categoryDefs[tKey]?.label || tKey}:${n}名`;
                                            })
                                            .join(' / ');
                                          return (
                                            <span
                                              className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold"
                                              title={`施設別必要数（${targetInfo.summaryLabel}）: ${facDetailStr}`}
                                            >
                                              施設設定({targetInfo.isSame ? `計${targetInfo.mwfTotal}` : `${targetInfo.mwfTotal}/${targetInfo.ttsTotal}`})
                                            </span>
                                          );
                                        })() : catKind === 'req' ? (
                                          <span className="px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200 text-[10px] font-bold">
                                            希望枠
                                          </span>
                                        ) : catKind === 'off' ? (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold"
                                            title="その週の休み1日分として扱い、残り5日間はAIが出勤配置します"
                                          >
                                            週休枠
                                          </span>
                                        ) : catKind === 'me' ? (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold"
                                            title="OPE班管理者が入力するためAI自動配置対象外（既に入力済みの日は連勤・出勤日数にカウント）"
                                          >
                                            AI対象外(OPE班)
                                          </span>
                                        ) : catKind === 'basic' ? (
                                          <span
                                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                                              isKoushutsuShiftDef(sItem, categoryDefs)
                                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                : 'bg-gray-100 text-gray-600 border-gray-200'
                                            }`}
                                            title={
                                              isKoushutsuShiftDef(sItem, categoryDefs)
                                                ? '管理者・個人入力用（AI配置対象外 / 出勤人数・現場出勤日数には含めず、公出のみの週は別日に空欄の公休を1日残します）'
                                                : '管理者・個人入力用（AI配置対象外 / 既に入力済みの日は連勤・出勤日数にカウント）'
                                            }
                                          >
                                            {isKoushutsuShiftDef(sItem, categoryDefs) ? 'AI対象外(公出)' : 'AI対象外'}
                                          </span>
                                        ) : (
                                          <select
                                            value={workSlot || 'other'}
                                            onChange={e => handleQuickShiftMetaChange(code, { shiftSlot: e.target.value })}
                                            className={`text-[10px] font-bold rounded border px-1.5 py-0.5 cursor-pointer focus:outline-none ${
                                              slotMeta?.badgeClass || 'bg-slate-100 text-slate-600 border-slate-200'
                                            }`}
                                            title="勤務・クール区分を切り替え（即時保存）"
                                          >
                                            {SHIFT_WORK_SLOTS.map(sl => (
                                              <option key={sl.value} value={sl.value}>{sl.label}</option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 pl-4 overflow-y-auto">
                        {editingShift ? (() => {
                          const editCatKind = getCategoryKindById(editingShift.category, categoryDefs);
                          const editEffType = editCatKind === 'role' ? 'task' : (editingShift.type || 'shift');
                          const activeWorkSlot = resolveShiftWorkSlot({ ...editingShift, type: editEffType }, categoryDefs) || 'other';
                          return (
                            <div className="space-y-4 max-w-lg pb-4">
                              <h4 className="font-bold text-gray-700 border-b pb-2">シフト編集</h4>
                              <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 text-[11px] text-indigo-900 leading-relaxed">
                                <strong>💡 現在の設定をAIへ自動連携：</strong>コードと表示名が異なる設定（例：コード「1」・表示名「A」）でも、ここで設定した<strong>「カテゴリ」</strong>と<strong>「勤務・クール区分」</strong>をAI作成・AIチャット・検算が直接参照します。
                              </div>
                              <div className="grid grid-cols-2 gap-4 items-start">
                                <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">コード</label>
                                  <input
                                    type="text"
                                    className={`w-full border p-2 rounded text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                                      editingShift.originalCode && (editingShift.code || '').trim() !== editingShift.originalCode
                                        ? 'border-amber-400 bg-amber-50/50'
                                        : ''
                                    }`}
                                    value={editingShift.code || ''}
                                    disabled={isMigratingShiftCode}
                                    onChange={e => setEditingShift({ ...editingShift, code: e.target.value.trim() })}
                                    placeholder="例: 1, A, S1 など"
                                  />
                                  {editingShift.originalCode && (editingShift.code || '').trim() !== editingShift.originalCode ? (
                                    <p className="text-[10px] text-amber-700 font-bold mt-1 leading-snug">
                                      ※「{editingShift.originalCode}」→「{(editingShift.code || '').trim() || '(未入力)'}」へ変更します。保存時に全月のデータ・各種設定も自動で一括置換されます。
                                    </p>
                                  ) : editingShift.originalCode ? (
                                    <p className="text-[10px] text-gray-400 mt-1">※変更して保存すると全月のデータ・関連設定も自動で一括置換されます</p>
                                  ) : null}
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">表示名</label>
                                  <input
                                    type="text"
                                    className="w-full border p-2 rounded text-sm"
                                    value={editingShift.label || ''}
                                    onChange={e => setEditingShift({ ...editingShift, label: e.target.value })}
                                    placeholder="例: A, 坂3, 指定 など"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-gray-500">カテゴリ</label>
                                <select
                                  className="w-full border p-2 rounded text-sm"
                                  value={editingShift.category || ''}
                                  onChange={e => {
                                    const nextCat = e.target.value;
                                    const nextKind = getCategoryKindById(nextCat, categoryDefs);
                                    const nextType = nextKind === 'role' ? 'task' : 'shift';
                                    setEditingShift({
                                      ...editingShift,
                                      category: nextCat,
                                      type: nextType,
                                    });
                                  }}
                                >
                                  {Object.values(categoryDefs).sort((a,b)=>(a.order ?? 99) - (b.order ?? 99)).map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                                  ))}
                                </select>
                              </div>

                              {editEffType === 'shift' && editCatKind === 'facility' && (
                                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/40 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <label className="text-xs font-bold text-blue-900">勤務・クール区分（AI作成・検算で参照）</label>
                                    {activeWorkSlot === 'cool3' && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                                        3クール上限・連続禁止の対象
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                                    {SHIFT_WORK_SLOTS.map(slot => {
                                      const isSelected = activeWorkSlot === slot.value;
                                      return (
                                        <button
                                          key={slot.value}
                                          type="button"
                                          onClick={() => setEditingShift({ ...editingShift, shiftSlot: slot.value })}
                                          className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition ${
                                            isSelected
                                              ? `${slot.badgeClass} ring-2 ring-blue-500 shadow-xs`
                                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                          }`}
                                        >
                                          {slot.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <p className="text-[10px] text-gray-500 leading-snug">
                                    ※「3クール」を選ぶと、職員ごとの3クール上限回数および連続3クール禁止（月またぎ含む）として判定されます。また「1クール＝日勤」として扱われ、「坂田の日勤（1クール）に〇〇さん」等の条件指定もこの区分を参照します。
                                  </p>
                                </div>
                              )}

                              {editEffType === 'shift' && (editCatKind === 'me' || editCatKind === 'basic') && (
                                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 text-[11px] text-gray-700 leading-relaxed">
                                  {editCatKind === 'me' ? (
                                    <span>
                                      <strong>※ME室カテゴリ（AI自動配置対象外）：</strong>オペ班管理者が入力するためAI作成・提案では使用しません（既に入力済みの日は上書きせず、その職員の連勤・出勤日数および出勤人数にカウントします）。
                                    </span>
                                  ) : isKoushutsuShiftDef({ ...editingShift, type: editEffType }, categoryDefs) ? (
                                    <span>
                                      <strong>※公出（AI自動配置対象外・業務出張扱い）：</strong>管理者・個人が入力するシフトのためAI作成では使用・変更しません。<strong>出勤人数・現場出勤日数・連勤にはカウントせず</strong>、公出しか入っていない週は別日に必ずもう1日「空欄の公休」を残します（その週の現場出勤は4日間）。
                                    </span>
                                  ) : (
                                    <span>
                                      <strong>※その他カテゴリ（AI自動配置対象外）：</strong>管理者・個人が入力するシフトのためAI作成・提案では使用・変更しません（既に入力済みの日はその職員の連勤・出勤日数および出勤人数にカウントします）。
                                    </span>
                                  )}
                                </div>
                              )}

                              {editEffType === 'shift' && (editCatKind === 'off' || editCatKind === 'req') && (
                                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/40 text-[11px] text-emerald-900 leading-relaxed">
                                  <strong>※休み・希望カテゴリ（週休1日分として充当）：</strong>このシフトが1日入っている週は、その週の休み1日分として扱われ、残り5日間はAIが出勤シフトを割り当てます。
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-4 items-start">
                                <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">残業時間</label>
                                  <WheelDurationInput
                                    value={editingShift.overtime}
                                    onChange={val => setEditingShift({ ...editingShift, overtime: val })}
                                    label="残業時間"
                                  />
                                </div>
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">文字色</label><div className="flex flex-wrap gap-1 mt-1">{COLOR_OPTIONS.map(c => (<button key={c.value} onClick={() => setEditingShift({...editingShift, text: c.value})} className={`w-6 h-6 rounded border text-xs font-bold ${c.value} ${editingShift.text === c.value ? 'ring-2 ring-blue-500' : ''}`}>Aa</button>))}</div></div>
                              </div>
                              {editEffType === 'shift' && (
                                <div className="grid grid-cols-2 gap-4 bg-blue-50 p-2.5 rounded">
                                  <div>
                                    <label className="text-xs font-bold text-blue-700 block mb-1">開始</label>
                                    <WheelTimeInput
                                      value={editingShift.startTime || ''}
                                      onChange={val => setEditingShift({ ...editingShift, startTime: val })}
                                      label="開始時刻"
                                      defaultHour={7}
                                      defaultMinute={50}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-blue-700 block mb-1">終了</label>
                                    <WheelTimeInput
                                      value={editingShift.endTime || ''}
                                      onChange={val => setEditingShift({ ...editingShift, endTime: val })}
                                      label="終了時刻"
                                      defaultHour={18}
                                      defaultMinute={0}
                                    />
                                  </div>
                                </div>
                              )}
                              {editEffType === 'task' && (() => {
                                const editTargetInfo = getRoleTotalTargetInfo(editingShift, categoryDefs);
                                const curMap = getRoleFacilityTargets(editingShift, categoryDefs);
                                const facilityRows = [];
                                Object.values(categoryDefs)
                                  .filter(cat => resolveCategoryKind(cat) === 'facility')
                                  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
                                  .forEach(cat => {
                                    if (isJinkuriFacilityCategory(cat)) {
                                      facilityRows.push({
                                        targetKey: `${cat.id}_mwf`,
                                        label: `${cat.label}（月・水・金）`,
                                      });
                                      facilityRows.push({
                                        targetKey: `${cat.id}_tts`,
                                        label: `${cat.label}（火・木・土）`,
                                      });
                                    } else {
                                      facilityRows.push({
                                        targetKey: cat.id,
                                        label: cat.label,
                                      });
                                    }
                                  });
                                return (
                                  <div className="p-3 rounded-lg border border-teal-200 bg-teal-50/40 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <label className="text-xs font-bold text-teal-900">
                                        必要施設・必要数設定（役割）
                                      </label>
                                      <span className="text-[10px] font-bold text-teal-700">
                                        全施設合計: {editTargetInfo.summaryLabel || '0名'}
                                      </span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {facilityRows.map(row => {
                                        const reqVal = Math.max(0, Math.floor(Number(curMap[row.targetKey]) || 0));
                                        const isChecked = reqVal > 0;
                                        return (
                                          <div
                                            key={row.targetKey}
                                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                                              isChecked
                                                ? 'bg-white border-teal-400 text-teal-950 font-bold shadow-2xs'
                                                : 'bg-white/70 border-gray-200 text-gray-600'
                                            }`}
                                          >
                                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0 select-none">
                                              <input
                                                type="checkbox"
                                                className="w-4 h-4 text-teal-600 rounded"
                                                checked={isChecked}
                                                onChange={e => {
                                                  const nextMap = { ...curMap };
                                                  if (e.target.checked) {
                                                    nextMap[row.targetKey] = nextMap[row.targetKey] > 0 ? nextMap[row.targetKey] : 1;
                                                  } else {
                                                    delete nextMap[row.targetKey];
                                                  }
                                                  setEditingShift({ ...editingShift, facilityTargets: nextMap });
                                                }}
                                              />
                                              <span className="truncate">{row.label}</span>
                                            </label>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <span className="text-[10px] text-gray-500">必要数:</span>
                                              <select
                                                disabled={!isChecked}
                                                className="border rounded px-2 py-1 text-xs font-bold bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                                value={isChecked ? reqVal : 1}
                                                onChange={e => {
                                                  const nextNum = Math.max(1, parseInt(e.target.value, 10) || 1);
                                                  setEditingShift({
                                                    ...editingShift,
                                                    facilityTargets: { ...curMap, [row.targetKey]: nextNum },
                                                  });
                                                }}
                                              >
                                                {buildNumericOptions(ROLE_FACILITY_TARGET_OPTIONS, isChecked ? reqVal : 1).map(n => (
                                                  <option key={n} value={n}>{n}名</option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <p className="text-[10px] text-teal-800 leading-snug">
                                      ※チェックを入れて必要数を保存すると、全体表の「施設別」各施設スコア左側に役割が表示され、必要数達成でチェックマークが付きます。月別勤務表の下部集計にも全施設合計が表示されます。
                                    </p>
                                  </div>
                                );
                              })()}
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
                              <div className="flex justify-between items-center pt-4 mt-4">
                                {editingShift.originalCode && (
                                  <button
                                    type="button"
                                    disabled={isMigratingShiftCode}
                                    onClick={() => deleteShiftConfig(editingShift.originalCode)}
                                    className="text-red-500 text-sm hover:underline disabled:opacity-40"
                                  >
                                    削除
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isMigratingShiftCode}
                                  onClick={saveShiftConfig}
                                  className="flex items-center gap-1.5 px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50 ml-auto transition"
                                >
                                  {isMigratingShiftCode && <Loader2 size={15} className="animate-spin" />}
                                  <span>{isMigratingShiftCode ? '一括置換中...' : '保存'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })() : <div className="text-gray-400 text-center mt-20">左側からシフトを選択または新規作成してください</div>}
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'staff' && (
                    <div className="h-full flex flex-col">
                      <div className="mb-4 flex justify-between items-center gap-2">
                        <p className="text-xs text-gray-500">
                          スキル、3クール制限、AI配置可能施設、AI除外設定を一括管理します（施設バッジをクリックしてON/OFF切替できます ※ME室・その他は常時AI対象外）。
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
                              <th className="p-2 border text-center w-28">3クール(下限〜上限)</th>
                              <th className="p-2 border text-center w-32">契約出勤日数</th>
                              <th className="p-2 border text-left min-w-[210px]">AI配置可能施設 / 制限</th>
                              {STAFF_SKILLS.map(skill => (<th key={skill.key} className="p-2 border text-center w-16"><div className="flex flex-col items-center"><skill.icon size={14} className="text-gray-600 mb-1"/><span>{skill.label}</span></div></th>))}
                            </tr>
                          </thead>
                          <tbody>
                            {staffList.map((staff, index) => {
                              const exCats = Array.isArray(staff.excludedCategories) ? staff.excludedCategories : [];
                              const exShifts = (Array.isArray(staff.excludedShifts) ? staff.excludedShifts : []).filter(
                                c => isAiAssignableFacilityShiftDef(c, shiftDefs, categoryDefs)
                              );
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
                                  <td className="p-2 border text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <select
                                        title="3クール月間下限回数"
                                        className="w-12 p-1 border rounded text-center text-xs bg-white font-bold"
                                        value={String(staff.minCool3 ?? 0)}
                                        onChange={(e) => {
                                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                          const newList = [...staffList];
                                          newList[index] = {
                                            ...staff,
                                            minCool3: val,
                                            maxCool3: Math.max(val, staff.maxCool3 ?? 5),
                                          };
                                          setStaffList(newList);
                                        }}
                                      >
                                        {buildNumericOptions(COOL3_LIMIT_OPTIONS, staff.minCool3 ?? 0).map(n => (
                                          <option key={n} value={String(n)}>{n}</option>
                                        ))}
                                      </select>
                                      <span className="text-gray-400 text-xs">〜</span>
                                      <select
                                        title="3クール月間上限回数"
                                        className="w-12 p-1 border rounded text-center text-xs bg-white font-bold"
                                        value={String(staff.maxCool3 ?? 5)}
                                        onChange={(e) => {
                                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                          const newList = [...staffList];
                                          newList[index] = {
                                            ...staff,
                                            maxCool3: val,
                                            minCool3: Math.min(staff.minCool3 ?? 0, val),
                                          };
                                          setStaffList(newList);
                                        }}
                                      >
                                        {buildNumericOptions(COOL3_LIMIT_OPTIONS, staff.maxCool3 ?? 5).map(n => (
                                          <option key={n} value={String(n)}>{n}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </td>
                                  <td className="p-2 border text-center bg-emerald-50/30">
                                    {staff.jobTitle === 'パート' ? (
                                      <div className="flex items-center justify-center gap-1">
                                        <span className="text-[10px] font-bold text-emerald-800">週</span>
                                        <select
                                          title="週あたりの契約出勤日数（下限）"
                                          className="w-12 p-1 border rounded text-center text-xs bg-white font-bold"
                                          value={staff.contractWorkDaysMin === null || staff.contractWorkDaysMin === undefined || staff.contractWorkDaysMin === '' ? '' : String(staff.contractWorkDaysMin)}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const val = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                                            const hasCurMax = staff.contractWorkDaysMax !== null && staff.contractWorkDaysMax !== undefined && staff.contractWorkDaysMax !== '';
                                            const curMax = hasCurMax ? Number(staff.contractWorkDaysMax) : null;
                                            const newList = [...staffList];
                                            newList[index] = {
                                              ...staff,
                                              contractWorkDaysMin: val,
                                              contractWorkDaysMax: val !== null && curMax !== null && curMax < val ? val : curMax,
                                            };
                                            setStaffList(newList);
                                          }}
                                        >
                                          <option value="">-</option>
                                          {buildNumericOptions(CONTRACT_WORK_DAY_OPTIONS, staff.contractWorkDaysMin).map(dVal => (
                                            <option key={dVal} value={String(dVal)}>{dVal}</option>
                                          ))}
                                        </select>
                                        <span className="text-gray-400 text-xs">〜</span>
                                        <select
                                          title="週あたりの契約出勤日数（上限）"
                                          className="w-12 p-1 border rounded text-center text-xs bg-white font-bold"
                                          value={staff.contractWorkDaysMax === null || staff.contractWorkDaysMax === undefined || staff.contractWorkDaysMax === '' ? '' : String(staff.contractWorkDaysMax)}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const val = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                                            const hasCurMin = staff.contractWorkDaysMin !== null && staff.contractWorkDaysMin !== undefined && staff.contractWorkDaysMin !== '';
                                            const curMin = hasCurMin ? Number(staff.contractWorkDaysMin) : null;
                                            const newList = [...staffList];
                                            newList[index] = {
                                              ...staff,
                                              contractWorkDaysMax: val,
                                              contractWorkDaysMin: val !== null && curMin !== null && curMin > val ? val : curMin,
                                            };
                                            setStaffList(newList);
                                          }}
                                        >
                                          <option value="">-</option>
                                          {buildNumericOptions(CONTRACT_WORK_DAY_OPTIONS, staff.contractWorkDaysMax).map(dVal => (
                                            <option key={dVal} value={String(dVal)}>{dVal}</option>
                                          ))}
                                        </select>
                                        <span className="text-[10px] text-gray-500">日</span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-300 text-xs">-</span>
                                    )}
                                  </td>
                                  <td className="p-2 border">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {dynamicSummaryGroups.filter(g => g.items.length > 0 && g.kind === 'facility').map(group => {
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
                  {activeSettingsTab === 'teamAdmin' && isMasterAdmin && (() => {
                    const teamKeys = ['ope', 'echo', 'hhd'];
                    const shiftGroups = dynamicPaletteGroups
                      .map(g => ({
                        ...g,
                        color: categoryDefs[g.id]?.color || 'bg-gray-100 text-gray-700',
                        items: g.items.filter(code => shiftDefs[code] && getEffectiveShiftType(shiftDefs[code], categoryDefs) === 'shift'),
                      }))
                      .filter(g => g.items.length > 0);
                    const allShiftCodes = shiftGroups.flatMap(g => g.items);
                    const allTaskCodes = dynamicPaletteGroups
                      .flatMap(g => g.items)
                      .filter(code => shiftDefs[code] && getEffectiveShiftType(shiftDefs[code], categoryDefs) === 'task');
                    const currentAllowedShifts = resolveTeamAllowedShiftCodes(selectedTeamPermTab, adminSettings, shiftDefs, categoryDefs);
                    const currentAllowedTasks = resolveTeamAllowedTaskCodes(selectedTeamPermTab, adminSettings, shiftDefs, categoryDefs);
                    const currentShiftSet = new Set(currentAllowedShifts);
                    const currentTaskSet = new Set(currentAllowedTasks);
                    const isCustomShiftConfigured = Array.isArray(adminSettings?.teamAllowedShifts?.[selectedTeamPermTab]);
                    const isCustomTaskConfigured = Array.isArray(adminSettings?.teamAllowedTasks?.[selectedTeamPermTab]);
                    const activeTeamLabel = adminSettings[selectedTeamPermTab]?.label || TEAM_ADMIN_LABELS[selectedTeamPermTab] || '班管理者';

                    const toggleShiftCodeForTeam = (code) => {
                      const nextList = currentShiftSet.has(code)
                        ? currentAllowedShifts.filter(c => c !== code)
                        : [...currentAllowedShifts, code];
                      saveTeamAllowedCodes(selectedTeamPermTab, nextList, 'shift');
                    };

                    const toggleShiftCategoryForTeam = (catCodes) => {
                      const allChecked = catCodes.every(c => currentShiftSet.has(c));
                      const nextList = allChecked
                        ? currentAllowedShifts.filter(c => !catCodes.includes(c))
                        : Array.from(new Set([...currentAllowedShifts, ...catCodes]));
                      saveTeamAllowedCodes(selectedTeamPermTab, nextList, 'shift');
                    };

                    const toggleTaskCodeForTeam = (code) => {
                      const nextList = currentTaskSet.has(code)
                        ? currentAllowedTasks.filter(c => c !== code)
                        : [...currentAllowedTasks, code];
                      saveTeamAllowedCodes(selectedTeamPermTab, nextList, 'task');
                    };

                    return (
                      <div className="max-w-3xl mx-auto mt-4 space-y-6 pb-8">
                        <div>
                          <h4 className="font-bold text-gray-800 border-b pb-3 flex items-center gap-2">
                            <ShieldCheck size={18} className="text-blue-600" />
                            <span>各班管理者の入力可能シフト・タスク設定</span>
                          </h4>
                          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                            オペ班・エコー班・HHD班の各管理者としてログインした際（およびヘッダーの各班タブ選択時）に、シフト表上で選択・入力できる項目を設定します。<br />
                            ※チェックを外した項目は選択ポップアップに表示されず、該当する班の管理者からは入力できなくなります（変更は自動で保存されます）。
                          </p>
                        </div>

                        {/* 班ごとの切り替えタブ */}
                        <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
                          {teamKeys.map(tKey => {
                            const tLabel = adminSettings[tKey]?.label || TEAM_ADMIN_LABELS[tKey];
                            const allowedCount = resolveTeamAllowedShiftCodes(tKey, adminSettings, shiftDefs, categoryDefs).length;
                            const isActive = selectedTeamPermTab === tKey;
                            return (
                              <button
                                key={tKey}
                                type="button"
                                onClick={() => setSelectedTeamPermTab(tKey)}
                                className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition ${
                                  isActive
                                    ? 'bg-white text-blue-700 shadow border border-blue-200'
                                    : 'text-gray-600 hover:bg-gray-200/70'
                                }`}
                              >
                                <span className="truncate">{tLabel}</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                                }`}>
                                  シフト {allowedCount}/{allShiftCodes.length}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* セル上段：入力可能なシフト */}
                        <div className="border rounded-xl bg-gray-50/70 p-4 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
                            <div>
                              <div className="text-sm font-bold text-gray-800">
                                {activeTeamLabel}が入力できるシフト（セル上段）
                              </div>
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                現在 {currentAllowedShifts.length} / {allShiftCodes.length} 種類を許可中
                                {!isCustomShiftConfigured && (
                                  <span className="ml-1.5 text-gray-400">
                                    （初期値: {selectedTeamPermTab === 'ope' ? 'ME室シフトのみ' : '全シフト'}）
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => saveTeamAllowedCodes(selectedTeamPermTab, allShiftCodes, 'shift')}
                                className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-md transition"
                              >
                                全選択
                              </button>
                              <button
                                type="button"
                                onClick={() => saveTeamAllowedCodes(selectedTeamPermTab, [], 'shift')}
                                className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-gray-100 text-gray-600 border border-gray-300 rounded-md transition"
                              >
                                全解除
                              </button>
                              {isCustomShiftConfigured && (
                                <button
                                  type="button"
                                  onClick={() => saveTeamAllowedCodes(selectedTeamPermTab, null, 'shift')}
                                  className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-md transition flex items-center gap-1"
                                  title="初期設定に戻します"
                                >
                                  <RotateCcw size={12} />
                                  <span>初期値に戻す</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            {shiftGroups.map(group => {
                              const catAllChecked = group.items.every(c => currentShiftSet.has(c));
                              return (
                                <div key={group.id} className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${group.color}`}>
                                      {group.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleShiftCategoryForTeam(group.items)}
                                      className="text-[11px] font-bold text-blue-600 hover:underline"
                                    >
                                      {catAllChecked ? 'カテゴリ解除' : 'カテゴリ全選択'}
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {group.items.map(code => {
                                      const s = shiftDefs[code];
                                      if (!s) return null;
                                      const isChecked = currentShiftSet.has(code);
                                      return (
                                        <label
                                          key={code}
                                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition select-none ${
                                            isChecked
                                              ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-sm'
                                              : 'bg-gray-50/70 border-gray-200 opacity-65 hover:opacity-100 hover:bg-gray-100'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            className="w-4 h-4 text-blue-600 rounded"
                                            checked={isChecked}
                                            onChange={() => toggleShiftCodeForTeam(code)}
                                          />
                                          <span className={`text-xs font-bold ${s.text}`}>{s.label}</span>
                                          <span className="text-[10px] text-gray-400">({s.code})</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* セル下段：入力可能な役割・タスク */}
                        {allTaskCodes.length > 0 && (
                          <div className="border rounded-xl bg-gray-50/70 p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
                              <div>
                                <div className="text-sm font-bold text-gray-800">
                                  {activeTeamLabel}が入力できる役割・タスク（セル下段）
                                </div>
                                <div className="text-[11px] text-gray-500 mt-0.5">
                                  現在 {currentAllowedTasks.length} / {allTaskCodes.length} 種類を許可中
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => saveTeamAllowedCodes(selectedTeamPermTab, allTaskCodes, 'task')}
                                  className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-md transition"
                                >
                                  全選択
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveTeamAllowedCodes(selectedTeamPermTab, [], 'task')}
                                  className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-gray-100 text-gray-600 border border-gray-300 rounded-md transition"
                                >
                                  全解除
                                </button>
                                {isCustomTaskConfigured && (
                                  <button
                                    type="button"
                                    onClick={() => saveTeamAllowedCodes(selectedTeamPermTab, null, 'task')}
                                    className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-md transition flex items-center gap-1"
                                  >
                                    <RotateCcw size={12} />
                                    <span>初期値に戻す</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-wrap gap-2">
                              {allTaskCodes.map(code => {
                                const t = shiftDefs[code];
                                if (!t) return null;
                                const isChecked = currentTaskSet.has(code);
                                return (
                                  <label
                                    key={code}
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition select-none ${
                                      isChecked
                                        ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-sm'
                                        : 'bg-gray-50/70 border-gray-200 opacity-65 hover:opacity-100 hover:bg-gray-100'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 text-blue-600 rounded"
                                      checked={isChecked}
                                      onChange={() => toggleTaskCodeForTeam(code)}
                                    />
                                    <span className={`text-xs font-bold ${t.text}`}>{t.label}</span>
                                    <span className="text-[10px] text-gray-400">({t.code})</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {activeSettingsTab === 'password' && (
                    <div className="max-w-md mx-auto mt-8">
                      <h4 className="font-bold text-gray-700 border-b pb-4 mb-4">パスワード変更</h4>
                      <div className="space-y-4">
                        <div className="mb-4">
                          <label className="block text-xs font-bold text-gray-500 mb-1">変更対象</label>
                          {isMasterAdmin ? (
                            <select className="w-full border p-2 rounded-lg" value={targetAdminKey} onChange={e => setTargetAdminKey(e.target.value)}>
                              {Object.keys(adminSettings).filter(key => adminSettings[key]?.label).map(key => (<option key={key} value={key}>{adminSettings[key].label}</option>))}
                            </select>
                          ) : (
                            <>
                              <div className="w-full border border-gray-200 bg-gray-50 px-3 py-2 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2">
                                <Lock size={14} className="text-gray-400 shrink-0" />
                                <span>{adminSettings[appUser.initialView]?.label || '管理者'}</span>
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1.5">
                                ※全体管理者以外はご自身のパスワードのみ変更できます（他の管理者のパスワードは変更できません）。
                              </p>
                            </>
                          )}
                        </div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">新しいパスワード</label><input type="password" autoComplete="new-password" className="w-full border p-2 rounded" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                        <button onClick={handleChangePassword} className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">変更を保存</button>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'data' && (
                    <div className="max-w-lg mx-auto mt-8 text-center">
                      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                        <h4 className="font-bold text-red-700 text-lg mb-2 flex items-center justify-center gap-2"><AlertTriangle/> 危険な操作エリア</h4>
                        <p className="text-sm text-red-600 mb-6">現在表示中の月（{year}年{month}月）から、ログイン中の管理者（{getLoggedInAdminDisplayLabel()}）が編集したシフト・タスクのみを削除します。<br/>職員本人の希望や他の管理者が入力したシフトはそのまま残ります。</p>
                        {/* このボタンはヘッダーに移動しましたが、ここにも残しておきます */}
                        <button onClick={handleResetSchedule} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow flex items-center justify-center gap-2 w-full"><Eraser size={20}/> 自分の編集シフトを全消去（リセット）</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

{/* AI自動作成確認モーダル */}
        {showAutoFillModal && isMasterAdmin && (
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

                {/* 作成範囲（月全体 / 週ごと選択） */}
                <div className="mb-3 p-3 bg-white border border-orange-200 rounded-lg shadow-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-xs font-bold text-gray-800">作成する範囲を選択</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAutoFillTargetMode('all');
                          setSelectedAutoFillWeeks(currentMonthCalendarWeeks.map(w => w.weekIndex));
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border transition ${
                          autoFillTargetMode === 'all'
                            ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                            : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        月全体（全週）
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {currentMonthCalendarWeeks.map(w => {
                      const isSelected =
                        autoFillTargetMode === 'all' || selectedAutoFillWeeks.includes(w.weekIndex);
                      return (
                        <button
                          key={w.weekIndex}
                          type="button"
                          onClick={() => toggleAutoFillWeekSelection(w.weekIndex)}
                          className={`px-2 py-1.5 rounded-lg border text-left transition flex flex-col justify-center ${
                            isSelected
                              ? 'bg-orange-50 border-orange-400 text-orange-900 ring-1 ring-orange-300 font-bold'
                              : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-xs">
                            <span>第{w.weekIndex}週</span>
                            {isSelected && <Check size={12} className="text-orange-600 shrink-0" />}
                          </div>
                          <div className="text-[10px] opacity-80 leading-tight mt-0.5">{w.label}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-500 leading-tight">
                    ※週ボタンをクリックして、1週だけ・隔週（第1週と第3週など）・任意の複数週だけを作成できます（選択外の週は変更されません）。
                  </p>
                </div>

                <div className="mb-3 p-2.5 bg-orange-50/70 border border-orange-200 rounded-lg text-[11px] text-orange-900 space-y-0.5 leading-relaxed">
                  <div>・<strong>連勤・週休：</strong>最大<strong>{adminSettings.maxConsecutiveWorkDays || 5}連勤</strong>まで ／ 週1日の公休は<strong>空欄</strong>のまま残します</div>
                  <div>・<strong>月またぎ・3クール：</strong>前月末からの連勤引き継ぎと<strong>3クール連続配置禁止</strong>（月またぎ含む）を自動適用します</div>
                  <div>・<strong>必須スキル配置：</strong>各施設の必須スキル（<strong>リーダー等</strong>）を確保し、不足日は分散配置＋ベテラン補完します</div>
                  <div>・<strong>日替わり分散：</strong>機械的な固まり配置を防ぎ、<strong>日ごとに勤務地をローテーション＆月間の施設偏りを平準化</strong>します</div>
                  <div>・<strong>保護ルール：</strong><strong>個人入力分</strong>・<strong>各班管理者(HHD/エコー/オペ)入力分</strong>・既存シフトは変更不可（ME室・その他[出勤/公出]はAI対象外、公出のみの週は空欄公休を1日確保）</div>
                  <div>・<strong>段階ビルド＆検算：</strong>第1週から<strong>週ごとに順番に作成</strong>し、最後に<strong>1ヶ月通し検算＆自動手直し（最大1回）</strong>を行います</div>
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

                <button
                  onClick={executeAutoFill}
                  disabled={autoFillTargetMode === 'weeks' && selectedAutoFillWeeks.length === 0}
                  className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 disabled:from-gray-300 disabled:to-gray-300 text-white font-bold rounded-lg shadow hover:shadow-lg transition flex items-center justify-center gap-2"
                >
                  <Wand2 size={18}/>
                  {autoFillTargetMode === 'all' || selectedAutoFillWeeks.length >= currentMonthCalendarWeeks.length
                    ? '月全体で実行する'
                    : selectedAutoFillWeeks.length === 0
                      ? '作成する週を選択してください'
                      : `選択した週（${selectedAutoFillWeeks.map(w => `第${w}週`).join('・')}）を実行する`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI アシスタントモーダル */}
        {showAiModal && isMasterAdmin && (
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
                      {aiQuickPrompts.map((qp, idx) => (
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
                                      職員の「配置制限」外・「ME室」・または「3クール連続」に関する変更が <strong>{restrictedShiftCount}件</strong> 含まれています（特例でない場合はご注意ください）。
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
                                                ? 'ME室は通常OPE班管理のためAI対象外です'
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
                    {aiQuickPrompts.map((qp, idx) => (
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
        {showStaffModal && isMasterAdmin && (
          <div className="absolute inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center gap-2 bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 min-w-0">
                  <User size={18} className="shrink-0" />
                  <span className="shrink-0">職員情報</span>
                  {(targetStaff.name || targetStaff.jobTitle) && (
                    <span className="text-xs sm:text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md truncate">
                      {targetStaff.name || '新規職員'}
                      {targetStaff.jobTitle ? `（${targetStaff.jobTitle}）` : ''}
                    </span>
                  )}
                </h3>
                <button onClick={() => setShowStaffModal(false)} className="shrink-0"><X size={20} className="text-gray-400"/></button>
              </div>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">ログインID <span className="text-red-500">*</span></label><input type="text" className="w-full border p-2 rounded text-sm" value={targetStaff.loginId || ''} onChange={e => setTargetStaff({...targetStaff, loginId: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">役職</label><select className="w-full border p-2 rounded text-sm" value={targetStaff.jobTitle || '一般'} onChange={e => setTargetStaff({...targetStaff, jobTitle: e.target.value})}>{JOB_TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                </div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">名前</label><input type="text" className="w-full border p-2 rounded text-sm" value={targetStaff.name || ''} onChange={e => setTargetStaff({...targetStaff, name: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">ロール（班）</label><div className="flex flex-wrap gap-3">{STAFF_ROLES.map(r => (<label key={r} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={targetStaff.roles?.includes(r)} onChange={() => { const roles = targetStaff.roles?.includes(r) ? targetStaff.roles.filter(x=>x!==r) : [...(targetStaff.roles||[]), r]; setTargetStaff({...targetStaff, roles}); }}/> <span className="text-sm">{r}</span></label>))}</div></div>

                <div className="border-t pt-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                    <MessageSquare size={13} className="text-indigo-500" />
                    希望要項（個人的要望・パート契約内容など）
                  </label>
                  <textarea
                    rows={3}
                    className="w-full border p-2 rounded text-xs sm:text-sm focus:ring-2 focus:ring-indigo-300 outline-none resize-y"
                    value={targetStaff.requestNote || ''}
                    onChange={e => setTargetStaff({ ...targetStaff, requestNote: e.target.value })}
                    placeholder="例: パート週3日（月・水・金）契約、16時まで、祝日は休み希望など"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    ※管理者画面の職員名欄にアイコンが表示され、カーソルを合わせると内容をすぐ確認できます（AI作成用データには送信されません）。
                  </p>
                </div>

                {targetStaff.jobTitle === 'パート' && (
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="text-xs font-bold text-emerald-900">
                        契約出勤日数（週単位：下限 〜 上限）
                      </label>
                      {((targetStaff.contractWorkDaysMin !== null && targetStaff.contractWorkDaysMin !== undefined && targetStaff.contractWorkDaysMin !== '') ||
                        (targetStaff.contractWorkDaysMax !== null && targetStaff.contractWorkDaysMax !== undefined && targetStaff.contractWorkDaysMax !== '')) && (
                        <button
                          type="button"
                          onClick={() =>
                            setTargetStaff({
                              ...targetStaff,
                              contractWorkDaysMin: null,
                              contractWorkDaysMax: null,
                            })
                          }
                          className="text-[10px] text-emerald-700 hover:underline font-bold"
                        >
                          クリア
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-800 mb-1">週下限（日/週）</label>
                        <select
                          className="w-full border bg-white p-1.5 rounded text-sm text-center font-bold"
                          value={targetStaff.contractWorkDaysMin === null || targetStaff.contractWorkDaysMin === undefined || targetStaff.contractWorkDaysMin === '' ? '' : String(targetStaff.contractWorkDaysMin)}
                          onChange={e => {
                            const raw = e.target.value;
                            const val = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                            const hasCurMax = targetStaff.contractWorkDaysMax !== null && targetStaff.contractWorkDaysMax !== undefined && targetStaff.contractWorkDaysMax !== '';
                            const curMax = hasCurMax ? Number(targetStaff.contractWorkDaysMax) : null;
                            setTargetStaff({
                              ...targetStaff,
                              contractWorkDaysMin: val,
                              contractWorkDaysMax: val !== null && curMax !== null && curMax < val ? val : curMax,
                            });
                          }}
                        >
                          <option value="">未設定</option>
                          {buildNumericOptions(CONTRACT_WORK_DAY_OPTIONS, targetStaff.contractWorkDaysMin).map(dVal => (
                            <option key={dVal} value={String(dVal)}>{dVal}日</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-800 mb-1">週上限（日/週）</label>
                        <select
                          className="w-full border bg-white p-1.5 rounded text-sm text-center font-bold"
                          value={targetStaff.contractWorkDaysMax === null || targetStaff.contractWorkDaysMax === undefined || targetStaff.contractWorkDaysMax === '' ? '' : String(targetStaff.contractWorkDaysMax)}
                          onChange={e => {
                            const raw = e.target.value;
                            const val = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                            const hasCurMin = targetStaff.contractWorkDaysMin !== null && targetStaff.contractWorkDaysMin !== undefined && targetStaff.contractWorkDaysMin !== '';
                            const curMin = hasCurMin ? Number(targetStaff.contractWorkDaysMin) : null;
                            setTargetStaff({
                              ...targetStaff,
                              contractWorkDaysMax: val,
                              contractWorkDaysMin: val !== null && curMin !== null && curMin > val ? val : curMin,
                            });
                          }}
                        >
                          <option value="">未設定</option>
                          {buildNumericOptions(CONTRACT_WORK_DAY_OPTIONS, targetStaff.contractWorkDaysMax).map(dVal => (
                            <option key={dVal} value={String(dVal)}>{dVal}日</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-700 mt-1">
                      ※固定日数（例: 週3日）の場合は下限・上限に同じ数値（または片方のみ）を選択してください。AI作成・検算で絶対守るルールとして適用されます。
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 bg-indigo-50/50 border border-indigo-100 rounded-lg p-2.5">
                  <div>
                    <label className="block text-xs font-bold text-indigo-800 mb-1">3クール下限（回/月）</label>
                    <select
                      className="w-full border bg-white p-1.5 rounded text-sm text-center font-bold"
                      value={String(targetStaff.minCool3 ?? 0)}
                      onChange={e => {
                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setTargetStaff({
                          ...targetStaff,
                          minCool3: val,
                          maxCool3: Math.max(val, targetStaff.maxCool3 ?? 5),
                        });
                      }}
                    >
                      {buildNumericOptions(COOL3_LIMIT_OPTIONS, targetStaff.minCool3 ?? 0).map(n => (
                        <option key={n} value={String(n)}>{n}回</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-800 mb-1">3クール上限（回/月）</label>
                    <select
                      className="w-full border bg-white p-1.5 rounded text-sm text-center font-bold"
                      value={String(targetStaff.maxCool3 ?? 5)}
                      onChange={e => {
                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setTargetStaff({
                          ...targetStaff,
                          maxCool3: val,
                          minCool3: Math.min(targetStaff.minCool3 ?? 0, val),
                        });
                      }}
                    >
                      {buildNumericOptions(COOL3_LIMIT_OPTIONS, targetStaff.maxCool3 ?? 5).map(n => (
                        <option key={n} value={String(n)}>{n}回</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Step 1: AI配置可能な施設・個別シフト制限（B案） */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                      <ListFilter size={13} className="text-blue-600" />
                      AI配置可能な施設・シフト制限
                    </label>
                    {(
                      (targetStaff.excludedCategories || []).some(cid => categoryDefs[cid] && resolveCategoryKind(categoryDefs[cid]) === 'facility') ||
                      (targetStaff.excludedShifts || []).some(c => isAiAssignableFacilityShiftDef(c, shiftDefs, categoryDefs))
                    ) && (
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
                    ※AI作成・提案時のみ適用されます（管理者の手動入力時は全シフト選べます。ME室・その他は常時AI対象外）。
                  </p>

                  <div className="bg-gray-50 border rounded-lg p-3 space-y-2.5">
                    <div className="text-[11px] font-bold text-gray-600">配置可能な施設（チェックを外すとAI配置対象外）</div>
                    <div className="flex flex-wrap gap-2">
                      {dynamicSummaryGroups.filter(g => g.items.length > 0 && g.kind === 'facility').map(group => {
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
                      {(() => {
                        const effectiveExcludedShiftCount = (targetStaff.excludedShifts || []).filter(
                          c => isAiAssignableFacilityShiftDef(c, shiftDefs, categoryDefs)
                        ).length;
                        return (
                          <button
                            type="button"
                            onClick={() => setShowStaffShiftDetailRestriction(prev => !prev)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1"
                          >
                            <span>{showStaffShiftDetailRestriction ? '▼' : '▶'} 個別シフト単位で細かく制限する（2クール不可など）</span>
                            {effectiveExcludedShiftCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">
                                除外 {effectiveExcludedShiftCount}件
                              </span>
                            )}
                          </button>
                        );
                      })()}

                      {showStaffShiftDetailRestriction && (
                        <div className="mt-2 space-y-2.5 bg-white border rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-400">
                            チェックを外したシフトにはAIが割り振りません（特定のクールや時間帯のみ除外したい場合に使えます）。
                          </p>
                          {dynamicSummaryGroups.filter(g => g.items.length > 0 && g.kind === 'facility').map(group => {
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

                <div className="border-t pt-3">
                  <label className="block text-xs font-bold text-gray-500 mb-1">パスワード</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full border p-2 rounded text-sm"
                    value={targetStaff.password || ''}
                    onChange={e => setTargetStaff({...targetStaff, password: e.target.value})}
                    placeholder="パスワードを設定"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    ※セキュリティ保護のため管理者画面でも伏せ文字表示にしています（入力すると上書き変更されます）。
                  </p>
                </div>
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
                   isMasterAdmin ? (
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
                     <p className="mb-4 text-sm text-gray-600 leading-relaxed">
                       <b>{adminSettings[appUser.initialView]?.label || '管理者'}</b> のログインパスワードを変更します。
                       <span className="block text-[11px] text-gray-400 mt-1">※他の管理者のパスワードは変更できません。</span>
                     </p>
                   )
                 ) : (
                   <p className="mb-4 text-sm text-gray-600">
                     <b>{appUser.name}</b> さんのログインパスワードを変更します。
                   </p>
                 )}
                 <label className="block text-xs font-bold text-gray-500 mb-1">新しいパスワード</label>
                 <input type="password" autoComplete="new-password" className="w-full border p-2 rounded" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus />
               </div>
               <div className="p-4 border-t flex justify-end gap-2">
                 <button onClick={handleChangePassword} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">変更する</button>
               </div>
             </div>
          </div>
        )}

        {/* 必要人数設定モーダル (z-index 100) */}
        {showTargetCountModal && isMasterAdmin && (
          <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18}/> 必要人数・目標スコア・必須スキル設定</h3>
                 <button onClick={() => setShowTargetCountModal(false)}><X size={20} className="text-gray-400"/></button>
               </div>
               <div className="p-4 overflow-y-auto">
                 <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                   各シフト・曜日ごとの必要人数と、施設ごとの目標パワースコア・必須スキル最低人数を設定してください。<br/>
                   ※人数不足は<strong className="text-red-600">赤色</strong>、人数は足りているが必須スキル（リーダー等）が不足している日は集計欄が<strong className="text-amber-700">オレンジ色（⚠）</strong>で表示されます。
                 </p>
                 <div className="space-y-6">
                   {dynamicSummaryGroups.map(group => {
                     const savedSplitMode = adminSettings?.facilitySplitDays?.[group.id];
                     const hasAnyDayDiff = group.items.some(c => {
                       const tc = targetCounts[c] || {};
                       return [2, 3, 4, 5, 6].some(dow => (tc[dow] ?? 0) !== (tc[1] ?? 0));
                     });
                     const isMwfTtsPattern = group.items.every(c => {
                       const tc = targetCounts[c] || {};
                       return (
                         (tc[1] ?? 0) === (tc[3] ?? 0) &&
                         (tc[1] ?? 0) === (tc[5] ?? 0) &&
                         (tc[2] ?? 0) === (tc[4] ?? 0) &&
                         (tc[2] ?? 0) === (tc[6] ?? 0)
                       );
                     });
                     const defaultSplitMode =
                       group.id === 'jinkuri' || group.name.includes('じん') || group.name.includes('腎')
                         ? 'mwf_tts'
                         : hasAnyDayDiff
                           ? (isMwfTtsPattern ? 'mwf_tts' : 'daily')
                           : 'uniform';
                     const splitMode = savedSplitMode || defaultSplitMode;
                     const catObj = categoryDefs[group.id];
                     const powerTargetVal = group.kind === 'facility' ? getFacilityTargetPowerScore(catObj, adminSettings) : 0;

                     return (
                       <div key={group.id} className="border rounded-lg overflow-hidden">
                         <div className={`px-4 py-2 font-bold text-sm flex flex-wrap items-center justify-between gap-2 ${group.headerColor}`}>
                           <div className="flex items-center gap-2">
                             <span>{group.name}</span>
                           </div>
                           {group.kind === 'me' ? (
                             <span className="text-[11px] font-normal opacity-90">
                               ※OPE班管理のためAI自動入力対象外（祝日・外来休診日のL/Gは自動判定）
                             </span>
                           ) : group.kind === 'basic' ? (
                             <span className="text-[11px] font-normal opacity-90">
                               ※管理者・個人入力用のためAI自動入力対象外（公出は出勤人数・出勤日数カウント対象外）
                             </span>
                           ) : (
                             <div className="flex flex-wrap items-center gap-2 text-xs font-normal">
                               <label className="inline-flex items-center gap-1 bg-white/85 text-gray-700 px-2 py-0.5 rounded border border-black/10">
                                 <span className="text-[11px] font-bold">曜日入力:</span>
                                 <select
                                   value={splitMode}
                                   onChange={(e) => {
                                     const nextMode = e.target.value;
                                     setAdminSettings(prev => ({
                                       ...prev,
                                       facilitySplitDays: {
                                         ...(prev.facilitySplitDays || {}),
                                         [group.id]: nextMode,
                                       },
                                     }));
                                   }}
                                   className="bg-transparent text-[11px] font-bold text-blue-700 focus:outline-none cursor-pointer"
                                 >
                                   <option value="uniform">月〜土共通</option>
                                   <option value="mwf_tts">月水金 / 火木土</option>
                                   <option value="daily">各曜日別 (月〜土)</option>
                                 </select>
                               </label>
                               {group.kind === 'facility' && (
                                 <label className="inline-flex items-center gap-1 bg-white/85 text-gray-700 px-2 py-0.5 rounded border border-black/10">
                                   <span className="text-[11px] font-bold">パワーバランス:</span>
                                   <select
                                     value={powerTargetVal > 0 ? 'auto' : '0'}
                                     onChange={(e) => {
                                       const isAuto = e.target.value === 'auto';
                                       const nextScore = isAuto ? (DEFAULT_FACILITY_POWER_TARGETS[group.id] || 30) : 0;
                                       setAdminSettings(prev => ({
                                         ...prev,
                                         facilityPowerTargets: {
                                           ...(prev.facilityPowerTargets || {}),
                                           [group.id]: nextScore,
                                         },
                                       }));
                                     }}
                                     className="px-1.5 py-0.5 border border-gray-300 rounded text-center text-[11px] font-bold bg-white text-indigo-700 cursor-pointer"
                                     title="その日の出勤スタッフの平均スコア×人数比から動的に期待スコア・施設間バランスを判定します"
                                   >
                                     <option value="auto">自動均等化（当日平均×人数）</option>
                                     <option value="0">判定なし（除外）</option>
                                   </select>
                                 </label>
                               )}
                             </div>
                           )}
                         </div>
                         <div className="overflow-x-auto">
                           <table className="w-full text-center text-xs border-collapse">
                             <thead>
                               <tr className="bg-gray-100 text-gray-600">
                                 <th className="p-2 border text-left w-36">シフト（コード）</th>
                                 {splitMode === 'mwf_tts' ? (
                                   <>
                                     <th className="p-2 border w-24">月・水・金</th>
                                     <th className="p-2 border w-24">火・木・土</th>
                                   </>
                                 ) : splitMode === 'daily' ? (
                                   <>
                                     <th className="p-2 border">月</th>
                                     <th className="p-2 border">火</th>
                                     <th className="p-2 border">水</th>
                                     <th className="p-2 border">木</th>
                                     <th className="p-2 border">金</th>
                                     <th className="p-2 border text-blue-600">土</th>
                                   </>
                                 ) : (
                                   <th className="p-2 border w-32">通常 (月～土)</th>
                                 )}
                               </tr>
                             </thead>
                             <tbody>
                               {group.items.map(code => {
                                 const shift = shiftDefs[code];
                                 if (!shift) return null;
                                 const val1 = targetCounts[code]?.[1] ?? 0;
                                 const val2 = targetCounts[code]?.[2] ?? 0;
                                 return (
                                   <tr key={code} className="border-b last:border-b-0">
                                     <td className="p-2 border text-left font-bold text-gray-700">
                                       <span className={shift.text}>{shift.label}</span>
                                       <span className="text-[10px] text-gray-400 font-normal ml-1">({shift.code})</span>
                                     </td>
                                     {splitMode === 'mwf_tts' ? (
                                       <>
                                         <td className="p-1 border">
                                           <select
                                             className="w-16 p-1 border rounded text-center bg-white"
                                             value={String(val1)}
                                             onChange={(e) => { const v = parseInt(e.target.value, 10) || 0; setTargetCounts(prev => ({ ...prev, [code]: { ...(prev[code] || {}), 1:v, 3:v, 5:v } })); }}
                                           >
                                             {buildNumericOptions(SHIFT_TARGET_COUNT_OPTIONS, val1).map(n => (
                                               <option key={n} value={String(n)}>{n}</option>
                                             ))}
                                           </select>
                                         </td>
                                         <td className="p-1 border">
                                           <select
                                             className="w-16 p-1 border rounded text-center bg-white"
                                             value={String(val2)}
                                             onChange={(e) => { const v = parseInt(e.target.value, 10) || 0; setTargetCounts(prev => ({ ...prev, [code]: { ...(prev[code] || {}), 2:v, 4:v, 6:v } })); }}
                                           >
                                             {buildNumericOptions(SHIFT_TARGET_COUNT_OPTIONS, val2).map(n => (
                                               <option key={n} value={String(n)}>{n}</option>
                                             ))}
                                           </select>
                                         </td>
                                       </>
                                     ) : splitMode === 'daily' ? (
                                       [1, 2, 3, 4, 5, 6].map(dow => {
                                         const dVal = targetCounts[code]?.[dow] ?? 0;
                                         return (
                                           <td key={dow} className="p-1 border">
                                             <select
                                               className="w-14 p-1 border rounded text-center bg-white"
                                               value={String(dVal)}
                                               onChange={(e) => {
                                                 const v = parseInt(e.target.value, 10) || 0;
                                                 setTargetCounts(prev => ({
                                                   ...prev,
                                                   [code]: { ...(prev[code] || {}), [dow]: v },
                                                 }));
                                               }}
                                             >
                                               {buildNumericOptions(SHIFT_TARGET_COUNT_OPTIONS, dVal).map(n => (
                                                 <option key={n} value={String(n)}>{n}</option>
                                               ))}
                                             </select>
                                           </td>
                                         );
                                       })
                                     ) : (
                                       <td className="p-1 border">
                                         <select
                                           className="w-16 p-1 border rounded text-center bg-white"
                                           value={String(val1)}
                                           onChange={(e) => { const v = parseInt(e.target.value, 10) || 0; setTargetCounts(prev => ({ ...prev, [code]: { ...(prev[code] || {}), 1:v, 2:v, 3:v, 4:v, 5:v, 6:v } })); }}
                                         >
                                           {buildNumericOptions(SHIFT_TARGET_COUNT_OPTIONS, val1).map(n => (
                                             <option key={n} value={String(n)}>{n}</option>
                                           ))}
                                         </select>
                                       </td>
                                     )}
                                   </tr>
                                 );
                               })}
                             </tbody>
                           </table>
                         </div>
                         {group.kind === 'facility' && (
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
                                       <select
                                         className="w-12 p-0.5 border rounded text-center text-xs font-bold bg-white"
                                         value={String(reqVal)}
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
                                       >
                                         {buildNumericOptions(SKILL_TARGET_COUNT_OPTIONS, reqVal).map(n => (
                                           <option key={n} value={String(n)}>{n}</option>
                                         ))}
                                       </select>
                                       <span className="text-[10px] text-gray-500">名</span>
                                     </div>
                                   </label>
                                 );
                               })}
                             </div>
                           </div>
                         )}
                       </div>
                     );
                   })}
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

        {/* Step 6: 検算チェック結果モーダル */}
        {showValidationModal && isMasterAdmin && (
          <div
            className="absolute inset-0 bg-black/50 z-[115] flex items-center justify-center p-4"
            onClick={() => {
              setShowValidationModal(false);
              setAutoFillValidationSummary(null);
            }}
          >
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-teal-50 to-emerald-50">
                <div>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2 text-teal-900">
                    <ShieldCheck size={18} className="text-teal-600" />
                    シフト検算チェック（{year}年{month}月）
                  </h3>
                  <p className="text-[11px] text-teal-700/80 mt-0.5">
                    連勤上限・月またぎ引き継ぎ・3クール制限・必要人数・必須スキルを一括チェックします
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowValidationModal(false);
                    setAutoFillValidationSummary(null);
                  }}
                >
                  <X size={20} className="text-gray-400 hover:text-gray-600" />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                {validationScopeLabel && (
                  <div className="px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-between gap-2 text-xs text-teal-900">
                    <span>
                      検算対象：作成した週（<strong>{validationScopeLabel}</strong>）のみを表示中
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setValidationScopeDays(null);
                        setValidationScopeLabel('');
                      }}
                      className="px-2 py-0.5 rounded bg-white hover:bg-teal-100 text-teal-700 border border-teal-300 font-bold text-[11px] shrink-0 transition"
                    >
                      月全体の検算に切替
                    </button>
                  </div>
                )}
                {autoFillValidationSummary && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1 leading-relaxed">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <Sparkles size={14} className="text-amber-600 shrink-0" />
                      <span>
                        AI自動作成{autoFillValidationSummary.didAutoRepair ? '（＋自動手直し1回）' : ''}が完了しました
                        {autoFillValidationSummary.repairedIssueCount > 0
                          ? `（自動手直しで ${autoFillValidationSummary.repairedIssueCount}件 解消済み）`
                          : ''}
                      </span>
                    </div>
                    <p>
                      個人希望・各班管理者ロック・連勤上限を優先したため、以下の <strong>{liveValidationReport.totalActionableCount}件</strong> が未解消で残っています。手動で微調整するか、下のボタンからAIチャットで調整案を作成できます。
                    </p>
                  </div>
                )}

                {liveValidationReport.filledOperatingDaysCount === 0 && !showUncreatedDaysInValidation ? (
                  <div className="p-6 text-center bg-gray-50 border border-dashed rounded-xl space-y-2">
                    <p className="text-sm font-bold text-gray-700">まだ出勤シフトが入力されていません</p>
                    <p className="text-xs text-gray-500">
                      手動でシフトを入力するか「AI作成」を実行すると、連勤・3クール・必要人数・必須スキルを一括検算できます。
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowUncreatedDaysInValidation(true)}
                      className="mt-2 px-3 py-1.5 text-xs font-bold text-teal-700 bg-white border border-teal-300 rounded hover:bg-teal-50 transition"
                    >
                      未入力の日程も含めて必要人数を確認する
                    </button>
                  </div>
                ) : (
                  <>
                    {/* サマリーカード群 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className={`p-2.5 rounded-lg border text-center ${liveValidationReport.staffViolations.length > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                        <div className="text-[10px] font-bold opacity-80">個人ルール違反</div>
                        <div className="text-lg font-extrabold">{liveValidationReport.staffViolations.length}<span className="text-xs font-normal ml-0.5">件</span></div>
                      </div>
                      <div className={`p-2.5 rounded-lg border text-center ${liveValidationReport.dailyHeadcountShortages.length > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                        <div className="text-[10px] font-bold opacity-80">必要人数不足日</div>
                        <div className="text-lg font-extrabold">{liveValidationReport.dailyHeadcountShortages.length}<span className="text-xs font-normal ml-0.5">日</span></div>
                      </div>
                      <div className={`p-2.5 rounded-lg border text-center ${liveValidationReport.dailySkillShortages.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                        <div className="text-[10px] font-bold opacity-80">必須スキル不足日</div>
                        <div className="text-lg font-extrabold">{liveValidationReport.dailySkillShortages.length}<span className="text-xs font-normal ml-0.5">日</span></div>
                      </div>
                      <div className={`p-2.5 rounded-lg border text-center ${liveValidationReport.dailyPowerShortages.length > 0 ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                        <div className="text-[10px] font-bold opacity-80">パワーバランス偏り日</div>
                        <div className="text-lg font-extrabold">{liveValidationReport.dailyPowerShortages.length}<span className="text-xs font-normal ml-0.5">日</span></div>
                      </div>
                    </div>

                    {/* 作成途中の月の場合の未入力日フィルタ切替 */}
                    {liveValidationReport.emptyOperatingDaysCount > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border rounded-lg text-xs text-gray-600">
                        <span>
                          シフト入力済み営業日: <strong>{liveValidationReport.filledOperatingDaysCount} / {liveValidationReport.operatingDaysCount}日</strong>
                          {!showUncreatedDaysInValidation && liveValidationReport.omittedEmptyDaysCount > 0 && (
                            <span className="text-gray-400 ml-1">（※未入力の{liveValidationReport.omittedEmptyDaysCount}日は省略中）</span>
                          )}
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer font-bold text-teal-700">
                          <input
                            type="checkbox"
                            checked={showUncreatedDaysInValidation}
                            onChange={e => setShowUncreatedDaysInValidation(e.target.checked)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span>未入力の日も表示</span>
                        </label>
                      </div>
                    )}

                    {/* 全クリア時メッセージ */}
                    {liveValidationReport.totalActionableCount === 0 && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                          <Check size={18} />
                        </div>
                        <div className="text-xs leading-relaxed">
                          <div className="font-bold text-sm text-emerald-800">ルール違反・人数不足・必須スキル不足はありません！</div>
                          <div>
                            {liveValidationReport.isFullMonthCreated
                              ? '月間すべての営業日で勤務ルール・必要人数・必須スキルを満たしています。'
                              : '現在入力されている日程において、ルール違反や不足は見つかりませんでした。'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 1. 個人の勤務ルール違反 */}
                    {liveValidationReport.staffViolations.length > 0 && (
                      <div className="border border-rose-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 text-xs font-bold text-rose-800 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-rose-600" />
                            個人の勤務ルール確認（{liveValidationReport.staffViolations.length}件）
                          </span>
                          <span className="text-[10px] font-normal text-rose-600">連勤・3クール連続・上限・出勤日数</span>
                        </div>
                        <div className="divide-y divide-rose-100 bg-white">
                          {liveValidationReport.staffViolations.map((v, idx) => (
                            <div key={`${v.staffId}_${v.type}_${idx}`} className="px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-800 shrink-0">{v.staffName}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${v.severity === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}`}>
                                  {v.label}
                                </span>
                              </div>
                              <span className="text-gray-600 text-[11px]">{v.detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. 日別の必要人数不足 */}
                    {liveValidationReport.dailyHeadcountShortages.length > 0 && (
                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-xs font-bold text-red-800 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Users size={14} className="text-red-600" />
                            シフト必要人数の不足（{liveValidationReport.dailyHeadcountShortages.length}日）
                          </span>
                          <span className="text-[10px] font-normal text-red-600">※ME室はOPE班管轄</span>
                        </div>
                        <div className="divide-y divide-red-100 bg-white max-h-48 overflow-y-auto">
                          {liveValidationReport.dailyHeadcountShortages.map(dItem => (
                            <div key={dItem.day} className="px-3 py-2 text-xs flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-gray-800 w-16 shrink-0">
                                {month}/{dItem.day}({dItem.dowLabel})
                              </span>
                              <div className="flex flex-wrap gap-1 flex-1">
                                {dItem.items.map(it => (
                                  <span
                                    key={it.code}
                                    className={`px-1.5 py-0.5 rounded border text-[11px] font-bold ${
                                      it.isMeRoom
                                        ? 'bg-gray-100 text-gray-600 border-gray-300'
                                        : 'bg-red-50 text-red-700 border-red-200'
                                    }`}
                                  >
                                    {it.label}: {it.actual}/{it.target}名{it.isMeRoom ? ' (OPE班)' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. 施設別の必須スキル不足 */}
                    {liveValidationReport.dailySkillShortages.length > 0 && (
                      <div className="border border-amber-300 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs font-bold text-amber-900 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-amber-600" />
                            施設別の必須スキル不足（{liveValidationReport.dailySkillShortages.length}日）
                          </span>
                          <span className="text-[10px] font-normal text-amber-700">集計欄オレンジ⚠表示と連動</span>
                        </div>
                        <div className="divide-y divide-amber-100 bg-white max-h-48 overflow-y-auto">
                          {liveValidationReport.dailySkillShortages.map(dItem => (
                            <div key={dItem.day} className="px-3 py-2 text-xs flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-gray-800 w-16 shrink-0">
                                {month}/{dItem.day}({dItem.dowLabel})
                              </span>
                              <div className="flex flex-wrap gap-1.5 flex-1">
                                {dItem.items.map((it, iIdx) => (
                                  <span
                                    key={`${it.catId}_${it.skillKey}_${iIdx}`}
                                    className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <span>{it.catLabel}（{it.skillLabel} {it.actual}/{it.target}名）</span>
                                    {it.hint && (
                                      <span className="text-[10px] font-normal text-teal-700 bg-teal-50 px-1 rounded border border-teal-200">
                                        💡{it.hint}
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. 参考：施設間パワーバランス偏り日（折りたたみ） */}
                    {liveValidationReport.dailyPowerShortages.length > 0 && (
                      <details className="border border-gray-200 rounded-lg bg-gray-50/60 overflow-hidden text-xs">
                        <summary className="px-3 py-2 cursor-pointer font-bold text-gray-600 hover:bg-gray-100 select-none">
                          参考：施設間のパワーバランス（1人あたり平均スコア）に偏りがある日（{liveValidationReport.dailyPowerShortages.length}日・クリックで展開）
                        </summary>
                        <div className="divide-y divide-gray-100 bg-white max-h-40 overflow-y-auto border-t">
                          {liveValidationReport.dailyPowerShortages.map(pItem => (
                            <div key={pItem.day} className="px-3 py-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                              <span className="font-bold text-gray-700 w-16 shrink-0">{month}/{pItem.day}({pItem.dowLabel})</span>
                              <span>{pItem.items.join(' ／ ')}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>

              <div className="p-3.5 border-t bg-gray-50 flex flex-wrap items-center justify-end gap-2">
                {liveValidationReport.filledOperatingDaysCount > 0 && liveValidationReport.totalActionableCount > 0 && (
                  <button
                    type="button"
                    onClick={handleConsultValidationWithAi}
                    className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition"
                  >
                    <Bot size={15} />
                    AIチャットで調整案を作成する
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowValidationModal(false);
                    setAutoFillValidationSummary(null);
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold transition"
                >
                  閉じて手動で調整する
                </button>
              </div>
            </div>
          </div>
        )}

        {isAiLoading && !showAiModal && (
          isMonitorMinimized ? (
            /* 案Cモード：上部フローティング・タスクバー（背景の勤務表をスクロールしながら1週ごとの仮反映を広く確認可能） */
            <div className="fixed top-0 left-0 right-0 z-[150] bg-slate-900/95 text-white shadow-2xl border-b border-indigo-400/40 backdrop-blur-md px-3 py-2.5 sm:px-5">
              <div className="max-w-6xl mx-auto flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-indigo-500/25 border border-indigo-400/40 shrink-0">
                      <Loader2 size={16} className="animate-spin text-indigo-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white truncate">
                        {aiLoadingMessage || 'AIがシフトを作成中...'}
                      </div>
                      <div className="text-[11px] text-indigo-200 truncate">
                        {lastLiveFilledWeekLabel
                          ? `📡 ${lastLiveFilledWeekLabel}（表をスクロールして確認できます）`
                          : aiLoadingSubDetail || '完了した週から背景の勤務表にリアルタイム仮反映します'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
                      <span className="font-extrabold text-sky-300">{aiProgress}%</span>
                      <span className="text-slate-500">|</span>
                      <span className="flex items-center gap-1 text-amber-300 font-bold">
                        <Clock size={12} />
                        {aiRemainingText || '計算中...'}
                      </span>
                      <span className="text-slate-400 text-[11px]">（経過 {formatElapsedMmSs(aiElapsedSec)}）</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMonitorMinimized(false)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 shadow transition"
                    >
                      <ArrowDown size={13} />
                      進捗リストを開く
                    </button>

                    {!confirmingCancelAutoFill ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingCancelAutoFill(true)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1 transition"
                      >
                        <X size={13} />
                        中断
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 bg-rose-950/90 border border-rose-500/60 rounded-lg px-2 py-1">
                        <span className="text-[11px] text-rose-200 font-bold mr-1">元に戻して中断？</span>
                        <button
                          type="button"
                          onClick={handleCancelAutoFill}
                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                        >
                          はい
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingCancelAutoFill(false)}
                          className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-bold"
                        >
                          続行
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 h-1.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${aiProgress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* 案A＋案Cハイブリッド：工程チェックリスト付き「進捗モニターカード」（背景の勤務表も半透明越しにリアルタイム確認可能） */
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px] z-[150] flex items-center justify-center p-3 sm:p-4">
              <div
                className="bg-white rounded-2xl shadow-2xl border border-indigo-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
              >
                {/* ヘッダー */}
                <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 text-white flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles size={18} className="text-yellow-300 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm sm:text-base truncate">
                        AIシフト自動作成モニター（{year}年{month}月）
                      </h3>
                      <div className="text-[10px] text-indigo-100 truncate">
                        使用モデル: {AI_MODELS.find(m => m.value === aiModel)?.label || aiModel}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMonitorMinimized(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 border border-white/25 transition"
                    title="上部のタスクバーに最小化して、背景の勤務表が埋まっていく様子を広く確認します"
                  >
                    <ArrowUp size={13} />
                    背景の表を見る
                  </button>
                </div>

                {/* プログレスバー ＆ 残り時間・経過時間セクション */}
                <div className="px-4 pt-3.5 pb-3 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-end justify-between gap-2 mb-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-extrabold text-indigo-700 leading-none">
                        {aiProgress}%
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">進行中</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                        <Clock size={13} className="text-amber-600" />
                        残り目安: {aiRemainingText || '計算中...'}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-semibold">
                        経過 {formatElapsedMmSs(aiElapsedSec)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 h-3 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${aiProgress}%` }}
                    />
                  </div>
                </div>

                {/* 現在実行中の具体的な処理内容 */}
                <div className="px-4 py-3 bg-indigo-50/60 border-b border-indigo-100">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 p-1.5 rounded-lg bg-indigo-600 text-white shrink-0">
                      <Activity size={15} className="animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-bold text-indigo-950 leading-snug">
                        {aiLoadingMessage || 'AIがシフトを作成中...'}
                      </div>
                      {aiLoadingSubDetail && (
                        <div className="text-[11px] text-indigo-800/80 mt-0.5 leading-relaxed">
                          {aiLoadingSubDetail}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <span>
                          {lastLiveFilledWeekLabel || '完了した週から背景の勤務表へリアルタイムに仮反映します'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 全工程チェックリスト（案A） */}
                <div className="px-4 py-3 flex-1 overflow-y-auto space-y-1.5 bg-white">
                  <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                    <span>作成・検算ステップ一覧</span>
                    <span className="text-[10px] font-normal text-slate-400">第1週完了後の実測速度で残り時間を自動補正</span>
                  </div>
                  {autoFillSteps.map(step => {
                    const isDone = step.status === 'done';
                    const isActive = step.status === 'active';
                    const isSkipped = step.status === 'skipped';
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-xs transition ${
                          isActive
                            ? 'bg-blue-50/90 border-blue-300 text-blue-950 font-bold shadow-sm'
                            : isDone
                              ? 'bg-emerald-50/50 border-emerald-200/80 text-slate-700'
                              : isSkipped
                                ? 'bg-slate-50 border-slate-200 text-slate-400'
                                : 'bg-white border-slate-100 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isActive ? (
                            <Loader2 size={15} className="animate-spin text-blue-600 shrink-0" />
                          ) : isDone ? (
                            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                              <Check size={11} />
                            </span>
                          ) : isSkipped ? (
                            <span className="w-4 h-4 rounded-full bg-slate-300 text-white flex items-center justify-center shrink-0">
                              <Check size={10} />
                            </span>
                          ) : (
                            <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                          )}
                          <span className="truncate">{step.label}</span>
                        </div>
                        <span
                          className={`text-[11px] shrink-0 px-2 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-blue-600 text-white font-bold'
                              : isDone
                                ? 'bg-emerald-100 text-emerald-800 font-semibold'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {step.detail}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* フッター（安全中断・ロールバックボタン） */}
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  {!confirmingCancelAutoFill ? (
                    <>
                      <span className="text-[11px] text-slate-500">
                        ※中断すると作成開始前の勤務表にそのまま戻ります
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancelAutoFill(true)}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-1 transition ml-auto"
                      >
                        <RotateCcw size={13} />
                        作成を中断して元に戻す
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
                      <span className="text-xs font-bold text-rose-800">
                        自動作成を中断し、開始前の勤務表に戻しますか？
                      </span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={handleCancelAutoFill}
                          className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition"
                        >
                          はい、中断して戻す
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingCancelAutoFill(false)}
                          className="px-3 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition"
                        >
                          作成を続ける
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}
        {/* ↑↑↑ ここまで追加 ↑↑↑ */}

        {/* ★カテゴリ3（B案）：スタッフ向け 締切後の勤務交換・休み変更申請モーダル */}
        {showChangeRequestModal && appUser && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] p-2 sm:p-4"
            onClick={() => setShowChangeRequestModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <RefreshCw size={18} className="text-amber-600" />
                  <h3 className="font-bold text-gray-800 text-sm sm:text-base">
                    { year }年{ month }月 勤務変更申請
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangeRequestModal(false)}
                  className="p-1 text-gray-500 hover:text-gray-700 hover:bg-amber-100 rounded transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-4 text-xs sm:text-sm">
                {/* モード切替タブ */}
                <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCrMode('swap')}
                    className={`py-2 px-3 rounded-md font-bold transition ${
                      crMode === 'swap'
                        ? 'bg-white text-amber-700 shadow-sm border border-amber-200'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    職員同士交換
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrMode('single')}
                    className={`py-2 px-3 rounded-md font-bold transition ${
                      crMode === 'single'
                        ? 'bg-white text-amber-700 shadow-sm border border-amber-200'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    単独変更
                  </button>
                </div>

                {crMode === 'swap' ? (
                  <div className="space-y-3">
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                      事前に交換相手のスタッフと相談のうえ申請してください。管理者が承認すると勤務表に自動反映されます。
                    </div>

                    {/* 自分の対象日と現在の勤務 */}
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                      <div className="font-bold text-gray-700 flex items-center justify-between">
                        <span>① あなた（{appUser.name}）の対象日</span>
                        <select
                          value={crRequesterDay}
                          onChange={e => {
                            const d = Number(e.target.value);
                            setCrRequesterDay(d);
                            if (crSameDay) setCrTargetDay(d);
                          }}
                          className="border border-gray-300 rounded px-2.5 py-1 bg-white font-bold text-gray-800"
                        >
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>
                              {month}月{d}日({ getDayOfWeekStr(year, month, d) })
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-600 pt-1 border-t border-gray-200">
                        <span>
                          現在シフト:{' '}
                          <strong className="text-gray-900">
                            {formatShiftCodeLabel(shiftData[appUser.id]?.[crRequesterDay])}
                          </strong>
                        </span>
                        <span>
                          タスク:{' '}
                          <strong className="text-gray-900">
                            {formatTaskCodeLabel(taskData[appUser.id]?.[crRequesterDay])}
                          </strong>
                        </span>
                        <span>
                          ベル:{' '}
                          <strong className="text-gray-900">
                            {bellData[appUser.id]?.[crRequesterDay] ? '🔔あり' : 'なし'}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* 交換相手と相手の対象日 */}
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-gray-700">② 交換相手のスタッフ</span>
                        <select
                          value={crTargetStaffId}
                          onChange={e => setCrTargetStaffId(e.target.value)}
                          className="border border-gray-300 rounded px-2.5 py-1 bg-white font-bold text-gray-800 min-w-[160px]"
                        >
                          <option value="">-- 相手を選択 --</option>
                          {staffList
                            .filter(s => s.id !== appUser.id)
                            .map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-200">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={crSameDay}
                            onChange={e => {
                              const checked = e.target.checked;
                              setCrSameDay(checked);
                              if (checked) setCrTargetDay(crRequesterDay);
                            }}
                            className="rounded text-amber-600"
                          />
                          同じ日（{month}月{crRequesterDay}日）同士で交換する
                        </label>
                        {!crSameDay && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-600">相手の対象日:</span>
                            <select
                              value={crTargetDay}
                              onChange={e => setCrTargetDay(Number(e.target.value))}
                              className="border border-gray-300 rounded px-2 py-1 bg-white font-bold text-gray-800 text-xs"
                            >
                              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                                <option key={d} value={d}>
                                  {month}月{d}日({ getDayOfWeekStr(year, month, d) })
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {crTargetStaffId && (
                        <div className="flex flex-wrap gap-2 text-xs text-gray-600 pt-1 border-t border-gray-200">
                          <span>
                            相手の現在シフト({month}/{crSameDay ? crRequesterDay : crTargetDay}):{' '}
                            <strong className="text-gray-900">
                              {formatShiftCodeLabel(
                                shiftData[crTargetStaffId]?.[crSameDay ? crRequesterDay : crTargetDay]
                              )}
                            </strong>
                          </span>
                          <span>
                            タスク:{' '}
                            <strong className="text-gray-900">
                              {formatTaskCodeLabel(
                                taskData[crTargetStaffId]?.[crSameDay ? crRequesterDay : crTargetDay]
                              )}
                            </strong>
                          </span>
                          <span>
                            ベル:{' '}
                            <strong className="text-gray-900">
                              {bellData[crTargetStaffId]?.[crSameDay ? crRequesterDay : crTargetDay]
                                ? '🔔あり'
                                : 'なし'}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 入れ替え対象の選択（シフト／タスク／ベル） */}
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
                      <div className="font-bold text-gray-800 text-xs">③ 一緒に入れ替える（引き継ぐ）項目</div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs">
                        <label className="flex items-center gap-1.5 font-bold text-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={crSwapShift}
                            onChange={e => setCrSwapShift(e.target.checked)}
                            className="rounded text-amber-600"
                          />
                          シフトを入れ替える
                        </label>
                        <label className="flex items-center gap-1.5 font-bold text-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={crSwapTask}
                            onChange={e => setCrSwapTask(e.target.checked)}
                            className="rounded text-amber-600"
                          />
                          タスク欄も一緒に入れ替える
                        </label>
                        <label className="flex items-center gap-1.5 font-bold text-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={crSwapBell}
                            onChange={e => setCrSwapBell(e.target.checked)}
                            className="rounded text-amber-600"
                          />
                          緊急待機番も一緒に入れ替える
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                      体調不良や急用等による休み変更・単独の勤務変更を申請します。管理者が承認すると勤務表に反映されます。
                    </div>

                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-gray-700">① 対象日</span>
                        <select
                          value={crRequesterDay}
                          onChange={e => setCrRequesterDay(Number(e.target.value))}
                          className="border border-gray-300 rounded px-2.5 py-1 bg-white font-bold text-gray-800"
                        >
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>
                              {month}月{d}日({ getDayOfWeekStr(year, month, d) })
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-xs text-gray-600 flex flex-wrap gap-3 pt-1 border-t border-gray-200">
                        <span>
                          現在のシフト:{' '}
                          <strong className="text-gray-900">
                            {formatShiftCodeLabel(shiftData[appUser.id]?.[crRequesterDay])}
                          </strong>
                        </span>
                        <span>
                          タスク:{' '}
                          <strong className="text-gray-900">
                            {formatTaskCodeLabel(taskData[appUser.id]?.[crRequesterDay])}
                          </strong>
                        </span>
                        <span>
                          ベル:{' '}
                          <strong className="text-gray-900">
                            {bellData[appUser.id]?.[crRequesterDay] ? '🔔あり' : 'なし'}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-gray-700">② 変更後の希望シフト</span>
                        <select
                          value={crSingleShiftCode}
                          onChange={e => setCrSingleShiftCode(e.target.value)}
                          className="border border-gray-300 rounded px-2.5 py-1 bg-white font-bold text-gray-800 min-w-[160px]"
                        >
                          <option value="__CLEAR__">空欄（公休）</option>
                          {Object.entries(shiftDefs)
                            .filter(([, def]) => def && getEffectiveShiftType(def, categoryDefs) === 'shift')
                            .map(([code, def]) => (
                              <option key={code} value={code}>
                                {def.label || code}
                              </option>
                            ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer pt-1 border-t border-gray-200">
                        <input
                          type="checkbox"
                          checked={crClearTaskAndBell}
                          onChange={e => setCrClearTaskAndBell(e.target.checked)}
                          className="rounded text-amber-600"
                        />
                        休み等になる場合、当日のタスク欄・緊急待機番も自動で外す
                      </label>
                    </div>
                  </div>
                )}

                {/* 申請理由・メモ */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    理由・メモ（交換相手との合意内容や体調不良など）
                  </label>
                  <input
                    type="text"
                    value={crReason}
                    onChange={e => setCrReason(e.target.value)}
                    placeholder={
                      crMode === 'swap'
                        ? '例: 〇〇さんと相談済み、家庭の都合のため交換希望'
                        : '例: 発熱のため年休へ変更をお願いします'
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowChangeRequestModal(false)}
                    className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs sm:text-sm transition"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitChangeRequest}
                    className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm shadow transition flex items-center gap-1.5"
                  >
                    <Check size={16} />
                    管理者に申請を送る
                  </button>
                </div>

                {/* 自分が関係する当月の申請履歴 */}
                {myChangeRequests.length > 0 && (
                  <div className="pt-3 border-t border-gray-200 space-y-2">
                    <div className="font-bold text-gray-700 text-xs">あなたの当月の申請履歴（{myChangeRequests.length}件）</div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {myChangeRequests.map(req => {
                        const tDay = req.targetDay || req.requesterDay;
                        const statusBadge =
                          req.status === 'pending'
                            ? { label: '承認待ち', cls: 'bg-amber-100 text-amber-800 border-amber-300' }
                            : req.status === 'approved'
                              ? { label: '承認・反映済', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
                              : { label: '却下', cls: 'bg-rose-100 text-rose-800 border-rose-300' };
                        return (
                          <div
                            key={req.id}
                            className="p-2 rounded border border-gray-200 bg-gray-50 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusBadge.cls}`}>
                                  {statusBadge.label}
                                </span>
                                {(req.requestType || req.type) === 'swap' ? (
                                  <span className="font-bold text-gray-800">
                                    【交換】{req.requesterName}({month}/{req.requesterDay}:{formatShiftCodeLabel(req.requesterShift ?? req.snapshot?.requesterShift)}) ⇔{' '}
                                    {req.targetStaffName}({month}/{tDay}:{formatShiftCodeLabel(req.targetShift ?? req.snapshot?.targetShift)})
                                  </span>
                                ) : (
                                  <span className="font-bold text-gray-800">
                                    【変更】{month}/{req.requesterDay}: {formatShiftCodeLabel(req.beforeShift ?? req.snapshot?.requesterShift)} →{' '}
                                    {formatShiftCodeLabel(req.requestedShiftCode)}
                                  </span>
                                )}
                              </div>
                              {req.reason && <div className="text-gray-500 text-[11px]">理由: {req.reason}</div>}
                            </div>
                            {req.status === 'pending' && req.requesterId === appUser.id && (
                              <button
                                type="button"
                                onClick={() => handleCancelChangeRequest(req.id)}
                                className="px-2 py-1 rounded bg-white border border-gray-300 hover:bg-red-50 hover:text-red-600 text-gray-600 font-bold text-[11px] shrink-0 transition"
                              >
                                取り消し
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ★カテゴリ3（B案）：全体管理者向け 勤務変更申請の一覧・承認モーダル */}
        {showAdminChangeRequestsModal && isMasterAdmin && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] p-2 sm:p-4"
            onClick={() => setShowAdminChangeRequestsModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <RefreshCw size={18} className="text-amber-600" />
                  <h3 className="font-bold text-gray-800 text-sm sm:text-base">
                    {year}年{month}月 勤務変更申請の確認と承認
                  </h3>
                  {pendingChangeRequests.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                      未処理 {pendingChangeRequests.length}件
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdminChangeRequestsModal(false)}
                  className="p-1 text-gray-500 hover:text-gray-700 hover:bg-amber-100 rounded transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-4 text-xs sm:text-sm">
                {/* 未承認の申請リスト */}
                <div className="space-y-2.5">
                  <div className="font-bold text-gray-800 flex items-center justify-between">
                    <span>承認待ちの申請（{pendingChangeRequests.length}件）</span>
                  </div>

                  {pendingChangeRequests.length === 0 ? (
                    <div className="p-6 text-center bg-gray-50 border border-gray-200 rounded-lg text-gray-500">
                      現在、承認待ちの勤務変更申請はありません。
                    </div>
                  ) : (
                    pendingChangeRequests.map(req => {
                      const rDay = Number(req.requesterDay);
                      const tDay = Number(req.targetDay || req.requesterDay);
                      const isSwap = (req.requestType || req.type) === 'swap';
                      const curReqShift = shiftData[req.requesterId]?.[rDay] || '';
                      const curTgtShift = isSwap ? (shiftData[req.targetStaffId]?.[tDay] || '') : '';
                      const curReqTask = taskData[req.requesterId]?.[rDay] || '';
                      const curTgtTask = isSwap ? (taskData[req.targetStaffId]?.[tDay] || '') : '';
                      const curReqBell = !!bellData[req.requesterId]?.[rDay];
                      const curTgtBell = isSwap ? !!bellData[req.targetStaffId]?.[tDay] : false;

                      return (
                        <div
                          key={req.id}
                          className="p-3.5 rounded-lg border-2 border-amber-300 bg-amber-50/40 space-y-2.5 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    isSwap
                                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                                  }`}
                                >
                                  {isSwap ? '職員同士交換' : '単独変更'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  申請日時:{' '}
                                  {req.createdAt
                                    ? new Date(req.createdAt).toLocaleString('ja-JP', {
                                        month: 'numeric',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '-'}
                                </span>
                              </div>

                              {isSwap ? (
                                <div className="text-sm font-bold text-gray-900 pt-0.5">
                                  {req.requesterName}（{month}/{rDay}） ⇔ {req.targetStaffName}（{month}/{tDay}）
                                </div>
                              ) : (
                                <div className="text-sm font-bold text-gray-900 pt-0.5">
                                  {req.requesterName}（{month}/{rDay}）: {formatShiftCodeLabel(curReqShift)} →{' '}
                                  <span className="text-rose-700">{formatShiftCodeLabel(req.requestedShiftCode)}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleApproveChangeRequest(req)}
                                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1 transition"
                              >
                                <Check size={14} />
                                承認して勤務表に反映
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectChangeRequest(req.id)}
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs transition"
                              >
                                却下
                              </button>
                            </div>
                          </div>

                          {/* 現在のシフト・タスク・ベルの詳細プレビュー */}
                          {isSwap ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded border border-amber-200">
                              <div>
                                <div className="font-bold text-gray-700">
                                  {req.requesterName}（{month}/{rDay}）の現在値
                                </div>
                                <div className="text-gray-600 mt-0.5">
                                  シフト: <strong>{formatShiftCodeLabel(curReqShift)}</strong> / タスク:{' '}
                                  <strong>{formatTaskCodeLabel(curReqTask)}</strong> / ベル:{' '}
                                  <strong>{curReqBell ? '🔔あり' : 'なし'}</strong>
                                </div>
                              </div>
                              <div>
                                <div className="font-bold text-gray-700">
                                  {req.targetStaffName}（{month}/{tDay}）の現在値
                                </div>
                                <div className="text-gray-600 mt-0.5">
                                  シフト: <strong>{formatShiftCodeLabel(curTgtShift)}</strong> / タスク:{' '}
                                  <strong>{formatTaskCodeLabel(curTgtTask)}</strong> / ベル:{' '}
                                  <strong>{curTgtBell ? '🔔あり' : 'なし'}</strong>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs bg-white p-2.5 rounded border border-amber-200 text-gray-700">
                              現在の配置 — シフト: <strong>{formatShiftCodeLabel(curReqShift)}</strong> / タスク:{' '}
                              <strong>{formatTaskCodeLabel(curReqTask)}</strong> / ベル:{' '}
                              <strong>{curReqBell ? '🔔あり' : 'なし'}</strong>
                            </div>
                          )}

                          {/* 承認時の入れ替えオプション微調整（管理者側でもON/OFF変更可能） */}
                          {isSwap ? (
                            <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                              <span className="font-bold text-gray-700">反映対象:</span>
                              <label className="flex items-center gap-1 cursor-pointer font-bold text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={req.swapShift !== false}
                                  onChange={e =>
                                    handleUpdatePendingRequestOption(req.id, 'swapShift', e.target.checked)
                                  }
                                  className="rounded text-amber-600"
                                />
                                シフトを入れ替える
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer font-bold text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={!!req.swapTask}
                                  onChange={e =>
                                    handleUpdatePendingRequestOption(req.id, 'swapTask', e.target.checked)
                                  }
                                  className="rounded text-amber-600"
                                />
                                タスク欄も入れ替える
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer font-bold text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={!!req.swapBell}
                                  onChange={e =>
                                    handleUpdatePendingRequestOption(req.id, 'swapBell', e.target.checked)
                                  }
                                  className="rounded text-amber-600"
                                />
                                ベルも入れ替える
                              </label>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                              <label className="flex items-center gap-1 cursor-pointer font-bold text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={req.clearTaskAndBellOnOff !== false}
                                  onChange={e =>
                                    handleUpdatePendingRequestOption(req.id, 'clearTaskAndBellOnOff', e.target.checked)
                                  }
                                  className="rounded text-amber-600"
                                />
                                承認時に当日のタスク・ベルも自動で外す
                              </label>
                            </div>
                          )}

                          {req.reason && (
                            <div className="text-xs text-gray-700 bg-white/80 px-2.5 py-1.5 rounded border border-gray-200">
                              <span className="font-bold text-gray-600">理由・メモ: </span>
                              {req.reason}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 処理済み（承認・却下）の履歴 */}
                {(Array.isArray(changeRequests) ? changeRequests.filter(r => r && r.status !== 'pending') : []).length > 0 && (
                  <div className="pt-3 border-t border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-700 text-xs">
                        処理済みの申請履歴（
                        {(Array.isArray(changeRequests) ? changeRequests.filter(r => r && r.status !== 'pending') : []).length}
                        件）
                      </span>
                      <button
                        type="button"
                        onClick={handleClearResolvedChangeRequests}
                        className="text-xs text-gray-500 hover:text-red-600 underline"
                      >
                        処理済みの履歴をクリア
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {(Array.isArray(changeRequests) ? changeRequests.filter(r => r && r.status !== 'pending') : []).map(
                        req => {
                          const tDay = req.targetDay || req.requesterDay;
                          return (
                            <div
                              key={req.id}
                              className="p-2 rounded border border-gray-200 bg-gray-50 flex items-center justify-between gap-2 text-xs text-gray-600"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                    req.status === 'approved'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : 'bg-rose-100 text-rose-800 border-rose-300'
                                  }`}
                                >
                                  {req.status === 'approved' ? '承認済' : '却下'}
                                </span>
                                {(req.requestType || req.type) === 'swap' ? (
                                  <span>
                                    {req.requesterName}({month}/{req.requesterDay}) ⇔ {req.targetStaffName}({month}/{tDay})
                                  </span>
                                ) : (
                                  <span>
                                    {req.requesterName}({month}/{req.requesterDay}): {formatShiftCodeLabel(req.beforeShift ?? req.snapshot?.requesterShift)} →{' '}
                                    {formatShiftCodeLabel(req.requestedShiftCode)}
                                  </span>
                                )}
                                {req.reason && <span className="text-gray-400">（{req.reason}）</span>}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ★配布用全体表 印刷設定＆プレビューモーダル */}
        {showPrintModal && (() => {
          const previewPaperScale = Math.min(
            0.68,
            680 / Math.max(1, printPaperMetrics.widthPx),
            390 / Math.max(1, printPaperMetrics.heightPx)
          );
          const paperBoxW = Math.round(printPaperMetrics.widthPx * previewPaperScale);
          const paperBoxH = Math.round(printPaperMetrics.heightPx * previewPaperScale);
          const marginPx = Math.round(PRINT_MARGIN_MM * PRINT_PX_PER_MM * previewPaperScale);
          const previewContentScale = printPaperMetrics.effectiveScale * previewPaperScale;
          const scaledOutW = Math.ceil(printMeasuredSize.width * printPaperMetrics.effectiveScale);
          const scaledOutH = Math.ceil(printMeasuredSize.height * printPaperMetrics.effectiveScale);
          const overflowsPaper =
            scaledOutW > printPaperMetrics.printableWidthPx + 2 ||
            scaledOutH > printPaperMetrics.printableHeightPx + 2;
          const allowedPrintTeams =
            appUser?.role === 'admin' && appUser.initialView && appUser.initialView !== 'all'
              ? TEAMS.filter(t => t.id === appUser.initialView)
              : TEAMS;

          return (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-3 sm:p-4"
              onClick={() => setShowPrintModal(false)}
            >
              <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden border border-gray-200"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Printer size={18} className="text-slate-700" />
                    <h3 className="font-bold text-gray-800 text-sm sm:text-base">
                      全体表 印刷設定（配布用・シフト＆タスク）
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPrintModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* 設定コントロールバー */}
                <div className="px-4 py-3 border-b bg-white flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-600">用紙:</span>
                    {Object.entries(PRINT_PAPER_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPrintPaperSize(key)}
                        className={`px-2.5 py-1 rounded border font-bold transition ${
                          printPaperSize === key
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-600">向き:</span>
                    {[
                      { id: 'portrait', label: '縦向き' },
                      { id: 'landscape', label: '横向き' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPrintOrientation(opt.id)}
                        className={`px-2.5 py-1 rounded border font-bold transition ${
                          printOrientation === opt.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {allowedPrintTeams.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-600">対象:</span>
                      <select
                        value={printTeamFilter}
                        onChange={e => setPrintTeamFilter(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-xs font-bold text-gray-700 bg-white"
                      >
                        {allowedPrintTeams.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.id === 'all' ? '全体（職員全員）' : t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-600">収め方:</span>
                    <label className="inline-flex items-center gap-1 cursor-pointer font-bold text-gray-700">
                      <input
                        type="radio"
                        name="printFitMode"
                        checked={printFitMode === 'auto'}
                        onChange={() => setPrintFitMode('auto')}
                        className="text-blue-600"
                      />
                      1ページに自動収め ({Math.round(printPaperMetrics.autoFitScale * 100)}%)
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer font-bold text-gray-700 ml-1">
                      <input
                        type="radio"
                        name="printFitMode"
                        checked={printFitMode === 'manual'}
                        onChange={() => {
                          setPrintManualScale(Math.round(printPaperMetrics.autoFitScale * 100));
                          setPrintFitMode('manual');
                        }}
                        className="text-blue-600"
                      />
                      倍率指定
                    </label>
                    {printFitMode === 'manual' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min={35}
                          max={110}
                          value={printManualScale}
                          onChange={e => setPrintManualScale(Number(e.target.value))}
                          className="w-24"
                        />
                        <span className="font-bold text-blue-700 w-9 text-right">{printManualScale}%</span>
                      </div>
                    )}
                  </div>

                  <label className="inline-flex items-center gap-1 cursor-pointer text-gray-700 font-bold">
                    <input
                      type="checkbox"
                      checked={printShowMarks}
                      onChange={e => setPrintShowMarks(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    マークを表示（希望・班固定・スキル）
                  </label>

                  <label className="inline-flex items-center gap-1 cursor-pointer text-gray-700">
                    <input
                      type="checkbox"
                      checked={printShowJobTitle}
                      onChange={e => setPrintShowJobTitle(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    氏名の下に役職・雇用形態を表示
                  </label>

                  {printOrientation === 'landscape' && (
                    <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded border border-indigo-200">
                      <span className="font-bold text-indigo-800 text-[11px]">横印刷・個人集計:</span>
                      <button
                        type="button"
                        onClick={() => setAdminCountDisplayMode('slot')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                          adminCountDisplayMode === 'slot'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                        }`}
                      >
                        シフト表示別
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminCountDisplayMode('facility')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                          adminCountDisplayMode === 'facility'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                        }`}
                      >
                        施設別
                      </button>
                    </div>
                  )}
                </div>

                {/* 用紙プレビュー領域 */}
                <div className="flex-1 overflow-auto bg-gray-200/80 p-4 flex flex-col items-center justify-center min-h-[260px]">
                  <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-gray-600">
                    <span className="font-bold bg-white/90 px-2 py-0.5 rounded border border-gray-300">
                      {printPaperMetrics.label} {printOrientation === 'landscape' ? '横' : '縦'}（{printPaperMetrics.widthMm}×{printPaperMetrics.heightMm}mm）
                    </span>
                    <span className="bg-white/90 px-2 py-0.5 rounded border border-gray-300">
                      対象: 職員 {printStaffList.length}名分（マーク:{printShowMarks ? '表示' : '非表示'}{printOrientation === 'landscape' ? ` ／ 個人集計[${adminCountDisplayMode === 'slot' ? 'シフト表示別' : '施設別'}]を表示` : ''}）
                    </span>
                    {overflowsPaper && (
                      <span className="bg-rose-100 text-rose-700 border border-rose-300 px-2 py-0.5 rounded font-bold">
                        ※ 現在の手動倍率では1枚からはみ出します（「1ページに自動収め」または用紙拡大をおすすめします）
                      </span>
                    )}
                  </div>

                  <div
                    className={`bg-white shadow-lg border transition-all ${
                      overflowsPaper ? 'border-rose-400 ring-2 ring-rose-200' : 'border-gray-300'
                    }`}
                    style={{
                      width: `${paperBoxW}px`,
                      height: `${paperBoxH}px`,
                      padding: `${marginPx}px`,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.ceil(printMeasuredSize.width * previewContentScale) + 2}px`,
                        height: `${Math.ceil(printMeasuredSize.height * previewContentScale) + 2}px`,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        ref={printSheetMeasureRef}
                        className="inline-block"
                        style={{
                          width: 'max-content',
                          transform: `scale(${previewContentScale})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        {renderPrintScheduleSheet()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* フッター */}
                <div className="px-4 py-3 border-t bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                  <p className="text-[11px] text-gray-500">
                    ※ 印刷ダイアログでも用紙サイズ（{printPaperMetrics.label}）・向き（
                    {printOrientation === 'landscape' ? '横' : '縦'}
                    ）を合わせると正確に収まります（色が付かない場合は詳細設定の「背景のグラフィック」を有効にしてください）。
                  </p>
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowPrintModal(false)}
                      className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold"
                    >
                      閉じる
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      disabled={printStaffList.length === 0}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-bold shadow-sm transition"
                    >
                      <Printer size={15} />
                      この設定で印刷する
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>

    {/* 実際の印刷出力専用コンテナ（画面上は非表示、印刷時のみ1ページ用紙サイズで展開） */}
    {showPrintModal && (
      <>
        <style>{`
          @media print {
            @page {
              size: ${printPaperMetrics.widthMm}mm ${printPaperMetrics.heightMm}mm;
              margin: ${PRINT_MARGIN_MM}mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: auto !important;
              height: auto !important;
              overflow: visible !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #print-sheet-root * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>
        <div id="print-sheet-root" className="hidden print:block bg-white">
          <div
            style={{
              width: `${Math.ceil(printMeasuredSize.width * printPaperMetrics.effectiveScale) + 2}px`,
              height:
                printFitMode === 'auto'
                  ? `${Math.ceil(printMeasuredSize.height * printPaperMetrics.effectiveScale) + 2}px`
                  : 'auto',
              overflow: printFitMode === 'auto' ? 'hidden' : 'visible',
            }}
          >
            <div
              style={{
                width: `${printMeasuredSize.width}px`,
                transform: `scale(${printPaperMetrics.effectiveScale})`,
                transformOrigin: 'top left',
              }}
            >
              {renderPrintScheduleSheet()}
            </div>
          </div>
        </div>
      </>
    )}
    {excelMenuAnchor && (
      <div
        className="fixed z-[9998] print:hidden w-[236px] bg-white rounded-lg shadow-xl border border-gray-200 py-1.5"
        style={{ left: `${excelMenuAnchor.left}px`, top: `${excelMenuAnchor.top}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1 text-[11px] font-bold text-gray-400 border-b border-gray-100">
          Excel出力メニュー
        </div>
        <button
          type="button"
          onClick={() => {
            setExcelMenuAnchor(null);
            handleExportExcel();
          }}
          className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-emerald-50 transition"
        >
          <FileSpreadsheet size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-800">Excelファイル出力 (.xlsx)</div>
            <div className="text-[11px] text-gray-500">inシート形式で表をダウンロード</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            setExcelMenuAnchor(null);
            handleCopyShiftCodesForExcel();
          }}
          className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-teal-50 transition border-t border-gray-100"
        >
          <ClipboardCopy size={16} className="text-teal-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-800">Excel貼付用コピー</div>
            <div className="text-[11px] text-gray-500">1日〜末日のコードのみコピー</div>
          </div>
        </button>
      </div>
    )}
    {excelImportPreview && excelImportPlan && (
      <div
        className="fixed inset-0 z-[9990] print:hidden bg-black/50 flex items-center justify-center p-3 sm:p-4"
        onClick={() => { if (!isImportingExcel) setExcelImportPreview(null); }}
      >
        <div
          className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-gray-200 bg-sky-50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileUp size={18} className="text-sky-700 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-bold text-sm sm:text-base text-gray-800 truncate">
                  Excel読込プレビュー
                </h3>
                <p className="text-xs text-gray-600 truncate">
                  {excelImportPreview.fileName} ／ シート「{excelImportPreview.sheetName}」
                  {excelImportPreview.detectedYear && excelImportPreview.detectedMonth
                    ? `（${excelImportPreview.detectedYear}年${excelImportPreview.detectedMonth}月）`
                    : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { if (!isImportingExcel) setExcelImportPreview(null); }}
              className="p-1.5 rounded hover:bg-sky-100 text-gray-500 transition"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-4 text-xs sm:text-sm">
            {excelImportPreview.detectedYear &&
              excelImportPreview.detectedMonth &&
              (excelImportPreview.detectedYear !== year || excelImportPreview.detectedMonth !== month) && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    Excel内の年月（<strong>{excelImportPreview.detectedYear}年{excelImportPreview.detectedMonth}月</strong>）と、現在Webで表示中の月（<strong>{year}年{month}月</strong>）が異なります。意図した月かご確認ください。
                  </div>
                </div>
              )}

            <div className="space-y-2">
              <div className="font-bold text-gray-700 text-xs">既存セル・空欄セルの反映方法</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                    excelImportMode === 'overwrite_all'
                      ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-300'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="excelImportMode"
                    checked={excelImportMode === 'overwrite_all'}
                    onChange={() => setExcelImportMode('overwrite_all')}
                    className="mt-0.5 accent-sky-600"
                  />
                  <div>
                    <div className="font-bold text-gray-800 text-xs">すべて上書き（空欄もクリア）</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Excelの内容で上段を上書きし、Excelが空欄の日もクリアします
                    </div>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                    excelImportMode === 'fill_empty_only'
                      ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-300'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="excelImportMode"
                    checked={excelImportMode === 'fill_empty_only'}
                    onChange={() => setExcelImportMode('fill_empty_only')}
                    className="mt-0.5 accent-sky-600"
                  />
                  <div>
                    <div className="font-bold text-gray-800 text-xs">空欄セルのみ反映</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Webで現在空欄の日のみ入力し、既存入力はそのまま残します
                    </div>
                  </div>
                </label>
              </div>
              <p className="text-[11px] text-gray-500">
                ※上段シフトのみ更新されます。下段タスクおよびスタッフ本人の希望履歴・理由は消さずに保持されます（反映後も「戻る・履歴」で元に戻せます）。
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-center">
                <div className="text-[11px] text-gray-500">一致職員</div>
                <div className="text-base font-extrabold text-gray-800">{excelImportPreview.matchedStaffRows.length}名</div>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                <div className="text-[11px] text-emerald-700">新規入力</div>
                <div className="text-base font-extrabold text-emerald-800">{excelImportPlan.fillCount}件</div>
              </div>
              <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-center">
                <div className="text-[11px] text-sky-700">上書き</div>
                <div className="text-base font-extrabold text-sky-800">{excelImportPlan.overwriteCount}件</div>
              </div>
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-center">
                <div className="text-[11px] text-rose-700">空欄クリア</div>
                <div className="text-base font-extrabold text-rose-800">{excelImportPlan.clearCount}件</div>
              </div>
            </div>

            {excelImportPreview.transformedCount > 0 && (
              <div className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                火・木・土のコード「10」→「39」（{shiftDefs['39']?.label || 'Z1'}）へ自動変換：<strong>{excelImportPreview.transformedCount}件</strong>
              </div>
            )}

            {excelImportMode === 'fill_empty_only' && excelImportPlan.skippedExistingCount > 0 && (
              <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                既存入力があるためスキップされるセル：<strong>{excelImportPlan.skippedExistingCount}件</strong>
              </div>
            )}

            {excelImportPreview.matchedStaffRows.length === 0 && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                現在表示中の職員と一致する氏名がシート「{excelImportPreview.sheetName}」内に見つかりませんでした。
              </div>
            )}

            {excelImportPreview.unmatchedNames.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                <div className="font-bold text-amber-900 text-xs mb-1">
                  Web側の表示職員と一致しなかった氏名（{excelImportPreview.unmatchedNames.length}名・スキップ）
                </div>
                <div className="text-[11px] text-amber-800 max-h-20 overflow-y-auto leading-relaxed">
                  {excelImportPreview.unmatchedNames.map((u) => `${u.name}(行${u.excelRowNum})`).join('、')}
                </div>
              </div>
            )}

            {excelImportPreview.unknownCells.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50/70 p-2.5">
                <div className="font-bold text-orange-900 text-xs mb-1">
                  Webのシフト設定に該当しない値（{excelImportPreview.unknownCells.length}件・スキップ）
                </div>
                <div className="text-[11px] text-orange-800 max-h-24 overflow-y-auto space-y-0.5">
                  {excelImportPreview.unknownCells.slice(0, 30).map((item, idx) => (
                    <div key={idx}>
                      {item.staffName} {item.day}日: 「{item.rawValue}」
                    </div>
                  ))}
                  {excelImportPreview.unknownCells.length > 30 && (
                    <div>…ほか {excelImportPreview.unknownCells.length - 30} 件</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setExcelImportPreview(null)}
              disabled={isImportingExcel}
              className="px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs sm:text-sm transition"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirmExcelImport}
              disabled={
                isImportingExcel ||
                excelImportPreview.matchedStaffRows.length === 0 ||
                excelImportPlan.totalChanges === 0
              }
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-45 text-white font-bold text-xs sm:text-sm shadow-sm transition"
            >
              {isImportingExcel ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              <span>反映する（{excelImportPlan.totalChanges}セル）</span>
            </button>
          </div>
        </div>
      </div>
    )}
    {headerTooltip && (
      <div
        className="fixed z-[9999] pointer-events-none print:hidden -translate-x-1/2 px-2.5 py-1.5 rounded-md bg-slate-900/95 text-white text-xs font-medium shadow-lg whitespace-nowrap"
        style={{ left: `${headerTooltip.x}px`, top: `${headerTooltip.y}px` }}
      >
        {headerTooltip.label}
      </div>
    )}
    {headerNotice && (
      <div className="fixed bottom-5 right-5 z-[9999] print:hidden flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900/95 text-white text-xs sm:text-sm font-medium shadow-xl border border-slate-700">
        <Check size={16} className="text-emerald-400 shrink-0" />
        <span>{headerNotice}</span>
      </div>
    )}
    </>
  );
}