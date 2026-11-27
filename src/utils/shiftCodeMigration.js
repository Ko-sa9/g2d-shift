// Pure helpers for validating shift code edits and cascading a shift/task code
// rename across masterData and all saved monthly schedule documents.

const FORBIDDEN_CODE_PATTERN = /[\s./~*[\]]/;
const RESERVED_CODE_PATTERN = /^__.*__$/;

/**
 * Validate a proposed shift/task code.
 * Returns { ok: true, code } or { ok: false, error }.
 */
export const validateShiftCode = (rawCode, existingShiftDefs = {}, originalCode = null) => {
  const code = String(rawCode ?? '').trim();
  if (!code) {
    return { ok: false, error: 'コードは必須です。' };
  }
  if (code !== originalCode) {
    if (FORBIDDEN_CODE_PATTERN.test(code)) {
      return {
        ok: false,
        error: 'コードに空白や記号（ . / ~ * [ ] ）は使用できません。英数字・ハイフン・アンダースコアを使用してください。',
      };
    }
    if (RESERVED_CODE_PATTERN.test(code)) {
      return {
        ok: false,
        error: '前後がアンダースコア2つ（__...__）のコードはシステム予約のため使用できません。',
      };
    }
    if (existingShiftDefs && Object.prototype.hasOwnProperty.call(existingShiftDefs, code)) {
      return {
        ok: false,
        error: `コード "${code}" は既に他のシフトで使用されています。別のコードを指定してください。`,
      };
    }
  }
  return { ok: true, code };
};

const replaceInStringArray = (arr, oldCode, newCode) => {
  if (!Array.isArray(arr)) return { changed: false, next: arr };
  let changed = false;
  const seen = new Set();
  const next = [];
  for (const item of arr) {
    const mapped = item === oldCode ? newCode : item;
    if (mapped !== item) changed = true;
    if (!seen.has(mapped)) {
      seen.add(mapped);
      next.push(mapped);
    } else if (mapped !== item) {
      changed = true;
    }
  }
  return { changed, next: changed ? next : arr };
};

const replaceInTeamCodeMap = (mapObj, oldCode, newCode) => {
  if (!mapObj || typeof mapObj !== 'object') return { changed: false, next: mapObj };
  let changed = false;
  const next = { ...mapObj };
  for (const key of Object.keys(mapObj)) {
    const res = replaceInStringArray(mapObj[key], oldCode, newCode);
    if (res.changed) {
      next[key] = res.next;
      changed = true;
    }
  }
  return { changed, next: changed ? next : mapObj };
};

/**
 * Migrate all masterData references from oldCode -> newCode:
 * - targetCounts[oldCode] -> targetCounts[newCode]
 * - staffList[].excludedShifts
 * - adminSettings.countedOffShifts / teamAllowedShifts / teamAllowedTasks
 */
export const migrateMasterDataShiftCode = ({
  oldCode,
  newCode,
  targetCounts = {},
  staffList = [],
  adminSettings = {},
}) => {
  let targetCountsChanged = false;
  const nextTargetCounts = { ...(targetCounts || {}) };
  if (Object.prototype.hasOwnProperty.call(nextTargetCounts, oldCode)) {
    nextTargetCounts[newCode] = nextTargetCounts[oldCode];
    delete nextTargetCounts[oldCode];
    targetCountsChanged = true;
  }

  let staffListChanged = false;
  const nextStaffList = (staffList || []).map((staff) => {
    if (!staff || !Array.isArray(staff.excludedShifts)) return staff;
    const res = replaceInStringArray(staff.excludedShifts, oldCode, newCode);
    if (!res.changed) return staff;
    staffListChanged = true;
    return { ...staff, excludedShifts: res.next };
  });

  let adminSettingsChanged = false;
  const nextAdminSettings = { ...(adminSettings || {}) };

  if (Array.isArray(nextAdminSettings.countedOffShifts)) {
    const res = replaceInStringArray(nextAdminSettings.countedOffShifts, oldCode, newCode);
    if (res.changed) {
      nextAdminSettings.countedOffShifts = res.next;
      adminSettingsChanged = true;
    }
  }
  if (nextAdminSettings.teamAllowedShifts && typeof nextAdminSettings.teamAllowedShifts === 'object') {
    const res = replaceInTeamCodeMap(nextAdminSettings.teamAllowedShifts, oldCode, newCode);
    if (res.changed) {
      nextAdminSettings.teamAllowedShifts = res.next;
      adminSettingsChanged = true;
    }
  }
  if (nextAdminSettings.teamAllowedTasks && typeof nextAdminSettings.teamAllowedTasks === 'object') {
    const res = replaceInTeamCodeMap(nextAdminSettings.teamAllowedTasks, oldCode, newCode);
    if (res.changed) {
      nextAdminSettings.teamAllowedTasks = res.next;
      adminSettingsChanged = true;
    }
  }

  return {
    targetCountsChanged,
    nextTargetCounts: targetCountsChanged ? nextTargetCounts : targetCounts,
    staffListChanged,
    nextStaffList: staffListChanged ? nextStaffList : staffList,
    adminSettingsChanged,
    nextAdminSettings: adminSettingsChanged ? nextAdminSettings : adminSettings,
  };
};

const migrateNestedDayCodeMap = (grid, oldCode, newCode) => {
  if (!grid || typeof grid !== 'object') return { changed: false, next: grid };
  let changed = false;
  const next = {};
  for (const staffId of Object.keys(grid)) {
    const dayMap = grid[staffId];
    if (!dayMap || typeof dayMap !== 'object') {
      next[staffId] = dayMap;
      continue;
    }
    let staffChanged = false;
    const nextDayMap = {};
    for (const dayKey of Object.keys(dayMap)) {
      const val = dayMap[dayKey];
      if (val === oldCode) {
        nextDayMap[dayKey] = newCode;
        staffChanged = true;
        changed = true;
      } else {
        nextDayMap[dayKey] = val;
      }
    }
    next[staffId] = staffChanged ? nextDayMap : dayMap;
  }
  return { changed, next: changed ? next : grid };
};

const migrateUserInputsMap = (userInputs, oldCode, newCode) => {
  if (!userInputs || typeof userInputs !== 'object') return { changed: false, next: userInputs };
  let changed = false;
  const next = {};
  for (const staffId of Object.keys(userInputs)) {
    const dayMap = userInputs[staffId];
    if (!dayMap || typeof dayMap !== 'object') {
      next[staffId] = dayMap;
      continue;
    }
    let staffChanged = false;
    const nextDayMap = {};
    for (const dayKey of Object.keys(dayMap)) {
      const entry = dayMap[dayKey];
      if (typeof entry === 'string') {
        if (entry === oldCode) {
          nextDayMap[dayKey] = newCode;
          staffChanged = true;
          changed = true;
        } else {
          nextDayMap[dayKey] = entry;
        }
      } else if (entry && typeof entry === 'object') {
        let entryChanged = false;
        const nextEntry = { ...entry };
        if (nextEntry.shift === oldCode) {
          nextEntry.shift = newCode;
          entryChanged = true;
        }
        if (nextEntry.task === oldCode) {
          nextEntry.task = newCode;
          entryChanged = true;
        }
        if (entryChanged) {
          nextDayMap[dayKey] = nextEntry;
          staffChanged = true;
          changed = true;
        } else {
          nextDayMap[dayKey] = entry;
        }
      } else {
        nextDayMap[dayKey] = entry;
      }
    }
    next[staffId] = staffChanged ? nextDayMap : dayMap;
  }
  return { changed, next: changed ? next : userInputs };
};

const migrateChangeRequestsList = (changeRequests, oldCode, newCode) => {
  if (!Array.isArray(changeRequests)) return { changed: false, next: changeRequests };
  let changed = false;
  const next = changeRequests.map((req) => {
    if (!req || typeof req !== 'object') return req;
    let reqChanged = false;
    const copy = { ...req };
    for (const field of ['requesterShift', 'targetShift', 'beforeShift', 'requestedShiftCode']) {
      if (copy[field] === oldCode) {
        copy[field] = newCode;
        reqChanged = true;
      }
    }
    if (copy.snapshot && typeof copy.snapshot === 'object') {
      let snapChanged = false;
      const snapCopy = { ...copy.snapshot };
      for (const sField of ['requesterShift', 'requesterTask', 'targetShift', 'targetTask']) {
        if (snapCopy[sField] === oldCode) {
          snapCopy[sField] = newCode;
          snapChanged = true;
        }
      }
      if (snapChanged) {
        copy.snapshot = snapCopy;
        reqChanged = true;
      }
    }
    if (reqChanged) {
      changed = true;
      return copy;
    }
    return req;
  });
  return { changed, next: changed ? next : changeRequests };
};

/**
 * Migrate a single monthly schedule document's shifts, tasks, userInputs, and changeRequests.
 * Returns { changed, updates, nextDoc }.
 */
export const migrateScheduleDocShiftCode = (docData, oldCode, newCode) => {
  if (!docData || typeof docData !== 'object') {
    return { changed: false, updates: {}, nextDoc: docData };
  }
  const shiftsRes = migrateNestedDayCodeMap(docData.shifts, oldCode, newCode);
  const tasksRes = migrateNestedDayCodeMap(docData.tasks, oldCode, newCode);
  const userInputsRes = migrateUserInputsMap(docData.userInputs, oldCode, newCode);
  const changeRequestsRes = migrateChangeRequestsList(docData.changeRequests, oldCode, newCode);

  const updates = {};
  if (shiftsRes.changed) updates.shifts = shiftsRes.next;
  if (tasksRes.changed) updates.tasks = tasksRes.next;
  if (userInputsRes.changed) updates.userInputs = userInputsRes.next;
  if (changeRequestsRes.changed) updates.changeRequests = changeRequestsRes.next;

  const changed = Object.keys(updates).length > 0;
  return {
    changed,
    updates,
    nextDoc: changed ? { ...docData, ...updates } : docData,
  };
};
