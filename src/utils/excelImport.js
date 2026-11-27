import * as XLSX from 'xlsx';

/**
 * Normalize a Japanese/ASCII staff name for resilient matching across
 * full-width/half-width spaces and compatibility characters.
 */
export const normalizeStaffName = (name) =>
  String(name ?? '')
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .trim();

const normalizeCellToken = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return Number.isInteger(val) ? String(val) : String(val);
  }
  return String(val).normalize('NFKC').trim();
};

const NON_STAFF_ROW_KEYWORDS = new Set([
  '日付',
  '曜日',
  '氏名',
  '名前',
  '職員',
  '職員名',
  '合計',
  '計',
  '小計',
  '必要人数',
  '坂田',
  '君津',
  '木更津',
  '木クリ',
  'じんクリ',
  'ME',
  'ME室',
]);

/**
 * Locate the sheet to read: exact "in", case-insensitive "in", or first sheet.
 */
const pickTargetSheetName = (sheetNames = []) => {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) return null;
  const exact = sheetNames.find((n) => n === 'in');
  if (exact) return exact;
  const ci = sheetNames.find((n) => String(n || '').trim().toLowerCase() === 'in');
  if (ci) return ci;
  return sheetNames[0];
};

/**
 * Find the date header row containing sequential day numbers 1, 2, ..., >=28.
 */
const findDateHeaderRow = (rows) => {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const first = Number(normalizeCellToken(row[c]));
      if (first !== 1) continue;
      const dayColMap = new Map();
      let expected = 1;
      for (let k = c; k < row.length && expected <= 31; k++) {
        const num = Number(normalizeCellToken(row[k]));
        if (num === expected) {
          dayColMap.set(expected, k);
          expected++;
        } else {
          break;
        }
      }
      if (dayColMap.size >= 28) {
        return { dateRowIdx: r, dayStartCol: c, dayColMap };
      }
    }
  }
  return null;
};

/**
 * Try to detect year & month written above the date header row.
 */
const detectYearMonth = (rows, dateRowIdx) => {
  for (let r = Math.max(0, dateRowIdx - 5); r < dateRowIdx; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    let foundYear = null;
    let foundMonth = null;
    for (let c = 0; c < row.length; c++) {
      const token = normalizeCellToken(row[c]);
      if (!token) continue;
      const ymMatch = token.match(/(20\d{2})\s*[年/\-.]\s*(\d{1,2})\s*月?/);
      if (ymMatch) {
        const y = Number(ymMatch[1]);
        const m = Number(ymMatch[2]);
        if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
          return { year: y, month: m };
        }
      }
      if (/^20\d{2}$/.test(token) && foundYear === null) {
        foundYear = Number(token);
      } else if (foundYear !== null && /^([1-9]|1[0-2])$/.test(token) && foundMonth === null) {
        const nextTok = normalizeCellToken(row[c + 1]);
        if (nextTok === '月' || nextTok === '' || c <= 20) {
          foundMonth = Number(token);
        }
      }
    }
    if (foundYear !== null && foundMonth !== null) {
      return { year: foundYear, month: foundMonth };
    }
  }
  return { year: null, month: null };
};

/**
 * Build lookup resolver from Excel cell text -> upper-row Web shift code.
 */
const buildShiftTokenResolver = (shiftDefs = {}, isReqCategory, isUpperShift) => {
  const exactCodeMap = new Map();
  const lowerCodeMap = new Map();
  const reqLabelMap = new Map();
  const otherLabelMap = new Map();

  Object.entries(shiftDefs).forEach(([key, def]) => {
    if (!def) return;
    if (typeof isUpperShift === 'function' && !isUpperShift(def)) return;
    const code = String(def.code || key).trim();
    if (!code) return;
    exactCodeMap.set(code, code);
    exactCodeMap.set(code.normalize('NFKC'), code);
    lowerCodeMap.set(code.normalize('NFKC').toLowerCase(), code);

    const lbl = normalizeCellToken(def.label || '');
    if (lbl) {
      if (typeof isReqCategory === 'function' && isReqCategory(def.category)) {
        if (!reqLabelMap.has(lbl)) reqLabelMap.set(lbl, code);
      } else if (!otherLabelMap.has(lbl)) {
        otherLabelMap.set(lbl, code);
      }
    }
  });

  return (rawVal) => {
    const token = normalizeCellToken(rawVal);
    if (!token) return { status: 'empty', code: null, raw: '' };
    if (exactCodeMap.has(token)) {
      return { status: 'matched', code: exactCodeMap.get(token), raw: token };
    }
    const lower = token.toLowerCase();
    if (lowerCodeMap.has(lower)) {
      return { status: 'matched', code: lowerCodeMap.get(lower), raw: token };
    }
    if (reqLabelMap.has(token)) {
      return { status: 'matched', code: reqLabelMap.get(token), raw: token };
    }
    if (otherLabelMap.has(token)) {
      return { status: 'matched', code: otherLabelMap.get(token), raw: token };
    }
    return { status: 'unknown', code: null, raw: token };
  };
};

/**
 * Parse an uploaded .xls or .xlsx ArrayBuffer and extract upper-row shift entries
 * from its "in" tab mapped to the Web app's staffList and shiftDefs.
 */
export const parseShiftExcelArrayBuffer = ({
  arrayBuffer,
  fileName = '',
  staffList = [],
  daysArray = [],
  shiftDefs = {},
  isReqCategory,
  isUpperShift,
}) => {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = pickTargetSheetName(wb.SheetNames);
  if (!sheetName || !wb.Sheets[sheetName]) {
    throw new Error('Excelファイル内に読み込めるシートが見つかりませんでした。');
  }

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const dateHeader = findDateHeaderRow(rows);
  if (!dateHeader) {
    throw new Error(`シート「${sheetName}」内に日付行（1〜28以上）が見つかりませんでした。`);
  }

  const { dateRowIdx, dayStartCol, dayColMap } = dateHeader;
  const detectedYM = detectYearMonth(rows, dateRowIdx);

  // Build normalized staff lookup map (using full staffList or displayStaffList provided)
  const staffByNormName = new Map();
  staffList.forEach((staff) => {
    const norm = normalizeStaffName(staff.name);
    if (norm && !staffByNormName.has(norm)) {
      staffByNormName.set(norm, staff);
    }
  });

  // Detect which column to the left of dayStartCol holds staff names
  let nameColIdx = -1;
  let bestMatchCount = -1;
  for (let c = 0; c < dayStartCol; c++) {
    let matches = 0;
    for (let r = dateRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const norm = normalizeStaffName(row[c]);
      if (norm && staffByNormName.has(norm)) matches++;
    }
    if (matches > bestMatchCount) {
      bestMatchCount = matches;
      nameColIdx = c;
    }
  }

  // Fallback if zero names matched: pick column with header "氏名" or "日付"
  if (bestMatchCount <= 0) {
    for (let c = dayStartCol - 1; c >= 0; c--) {
      const hdr = normalizeStaffName(rows[dateRowIdx]?.[c]);
      if (hdr === '氏名' || hdr === '日付' || hdr.includes('氏名')) {
        nameColIdx = c;
        break;
      }
    }
    if (nameColIdx === -1) nameColIdx = Math.max(0, dayStartCol - 1);
  }

  const resolveShift = buildShiftTokenResolver(shiftDefs, isReqCategory, isUpperShift);

  const matchedStaffIds = new Set();
  const matchedStaffRows = [];
  const unmatchedNames = [];
  const unknownCells = [];
  const validDaysSet = new Set(daysArray);

  // Identify the contiguous staff table span below dateRowIdx:
  // Stop collecting "unmatched" names once we hit a blank row after the staff block
  // (avoids flagging summary sections like "坂田"/"君津"/"木更津" below the staff rows).
  let seenAnyMatchedStaff = false;
  let passedStaffSectionBlankGap = false;

  for (let r = dateRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const rawName = String(row[nameColIdx] ?? '').trim();
    const normName = normalizeStaffName(rawName);

    if (!normName) {
      if (seenAnyMatchedStaff) {
        passedStaffSectionBlankGap = true;
      }
      continue;
    }

    const matchedStaff = staffByNormName.get(normName);
    if (matchedStaff) {
      seenAnyMatchedStaff = true;
      passedStaffSectionBlankGap = false;
      if (matchedStaffIds.has(matchedStaff.id)) continue;
      matchedStaffIds.add(matchedStaff.id);

      const dayEntries = {};
      let nonEmptyCount = 0;
      dayColMap.forEach((colIdx, dayNum) => {
        if (!validDaysSet.has(dayNum)) return;
        const resolved = resolveShift(row[colIdx]);
        if (resolved.status === 'empty') {
          dayEntries[dayNum] = null;
        } else if (resolved.status === 'matched') {
          dayEntries[dayNum] = resolved.code;
          nonEmptyCount++;
        } else {
          unknownCells.push({
            staffId: matchedStaff.id,
            staffName: matchedStaff.name,
            day: dayNum,
            rawValue: resolved.raw,
          });
        }
      });

      matchedStaffRows.push({
        staffId: matchedStaff.id,
        staffName: matchedStaff.name,
        excelRowNum: r + 1,
        dayEntries,
        nonEmptyCount,
      });
    } else if (!passedStaffSectionBlankGap && !NON_STAFF_ROW_KEYWORDS.has(normName)) {
      // Skip numeric-only rows or weekday header rows
      const looksLikeWeekdayRow =
        normalizeCellToken(row[dayStartCol]) === '日' ||
        normalizeCellToken(row[dayStartCol]) === '月' ||
        normalizeCellToken(row[dayStartCol]) === '火' ||
        normalizeCellToken(row[dayStartCol]) === '水' ||
        normalizeCellToken(row[dayStartCol]) === '木' ||
        normalizeCellToken(row[dayStartCol]) === '金' ||
        normalizeCellToken(row[dayStartCol]) === '土';
      if (!looksLikeWeekdayRow && !/^\d+$/.test(normName)) {
        unmatchedNames.push({ excelRowNum: r + 1, name: rawName });
      }
    }
  }

  return {
    fileName,
    sheetName,
    detectedYear: detectedYM.year,
    detectedMonth: detectedYM.month,
    detectedDayCount: dayColMap.size,
    matchedStaffRows,
    unmatchedNames,
    unknownCells,
  };
};

/**
 * Compute preview statistics & resulting shiftData for a given import mode.
 * mode:
 *   - 'overwrite_all': Overwrite existing cells and clear cells that are blank in Excel
 *   - 'fill_empty_only': Only write into currently blank Web cells; leave existing cells untouched
 */
export const computeExcelImportPlan = ({
  parsedResult,
  currentShiftData = {},
  mode = 'overwrite_all',
}) => {
  const nextShifts = {};
  Object.keys(currentShiftData || {}).forEach((sid) => {
    nextShifts[sid] = { ...(currentShiftData[sid] || {}) };
  });

  let fillCount = 0; // empty -> shift
  let overwriteCount = 0; // shiftA -> shiftB
  let clearCount = 0; // shift -> empty
  let unchangedCount = 0;
  let skippedExistingCount = 0;
  const affectedStaffIds = new Set();

  (parsedResult?.matchedStaffRows || []).forEach((row) => {
    const sid = row.staffId;
    if (!nextShifts[sid]) nextShifts[sid] = {};

    Object.entries(row.dayEntries || {}).forEach(([dayKey, importedCode]) => {
      const day = Number(dayKey);
      const currentCode = nextShifts[sid][day] || null;

      if (mode === 'fill_empty_only') {
        if (!importedCode) {
          unchangedCount++;
          return;
        }
        if (currentCode) {
          skippedExistingCount++;
          return;
        }
        nextShifts[sid][day] = importedCode;
        fillCount++;
        affectedStaffIds.add(sid);
        return;
      }

      // mode === 'overwrite_all'
      if (!importedCode) {
        if (currentCode) {
          delete nextShifts[sid][day];
          clearCount++;
          affectedStaffIds.add(sid);
        } else {
          unchangedCount++;
        }
      } else if (!currentCode) {
        nextShifts[sid][day] = importedCode;
        fillCount++;
        affectedStaffIds.add(sid);
      } else if (currentCode !== importedCode) {
        nextShifts[sid][day] = importedCode;
        overwriteCount++;
        affectedStaffIds.add(sid);
      } else {
        unchangedCount++;
      }
    });
  });

  return {
    nextShifts,
    fillCount,
    overwriteCount,
    clearCount,
    unchangedCount,
    skippedExistingCount,
    totalChanges: fillCount + overwriteCount + clearCount,
    affectedStaffCount: affectedStaffIds.size,
  };
};
