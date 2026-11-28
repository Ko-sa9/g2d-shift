import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Clock, X, Check } from 'lucide-react';

const ITEM_HEIGHT = 36;
const VISIBLE_ROWS = 5;
const PAD_HEIGHT = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2); // 72px

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const OVERTIME_HOURS = Array.from({ length: 16 }, (_, i) => i); // 0〜15時間
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);

/**
 * Convert stored overtime hours (number or string) to { hours, minutes } or null.
 */
const overtimeHoursToHM = (overtimeVal) => {
  if (overtimeVal === '' || overtimeVal === null || overtimeVal === undefined) {
    return null;
  }
  const num = Number(overtimeVal);
  if (!Number.isFinite(num) || num < 0) return null;
  const totalMinutes = Math.round(num * 60);
  const clamped = Math.min(totalMinutes, 15 * 60 + 59);
  return {
    hours: Math.floor(clamped / 60),
    minutes: clamped % 60,
  };
};

/**
 * Convert { hours, minutes } to stored overtime hours (rounded to 4 decimal places).
 */
const hmToOvertimeHours = (hours, minutes) => {
  const totalMinutes = Math.max(0, Math.round(Number(hours) || 0) * 60 + Math.round(Number(minutes) || 0));
  return Math.round((totalMinutes / 60) * 10000) / 10000;
};

/**
 * Format overtime hours nicely for compact display (e.g. "1時間15分 (1.25h)").
 */
const formatOvertimeSummary = (overtimeVal) => {
  const hm = overtimeHoursToHM(overtimeVal);
  if (!hm) return '未設定';
  const dec = Math.round(((hm.hours * 60 + hm.minutes) / 60) * 100) / 100;
  if (hm.hours === 0 && hm.minutes === 0) return '0分 (0h)';
  if (hm.minutes === 0) return `${hm.hours}時間 (${dec}h)`;
  if (hm.hours === 0) return `${hm.minutes}分 (${dec}h)`;
  return `${hm.hours}時間${String(hm.minutes).padStart(2, '0')}分 (${dec}h)`;
};

/**
 * Single iOS-alarm-style scroll-snap drum wheel column (supports wheel, touch, mouse drag, click, and arrow keys).
 */
const WheelColumn = ({
  items,
  selectedValue,
  onSelect,
  formatItem = (v) => String(v).padStart(2, '0'),
  unitLabel = '',
  ariaLabel = '',
}) => {
  const scrollRef = useRef(null);
  const settleTimerRef = useRef(null);
  const userScrollActiveRef = useRef(false);
  const dragStateRef = useRef({ dragging: false, startY: 0, startTop: 0, moved: false });

  const selectedIndex = Math.max(0, items.indexOf(selectedValue));

  // Position scroll immediately on mount without flash
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = selectedIndex * ITEM_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  const commitScrollIndex = useCallback(() => {
    const el = scrollRef.current;
    userScrollActiveRef.current = false;
    if (!el) return;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
    const targetTop = idx * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - targetTop) > 1) {
      el.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
    const nextVal = items[idx];
    if (nextVal !== undefined && nextVal !== selectedValue) {
      onSelect(nextVal);
    }
  }, [items, onSelect, selectedValue]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    userScrollActiveRef.current = true;
    const liveIdx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
    const liveVal = items[liveIdx];
    if (liveVal !== undefined && liveVal !== selectedValue) {
      onSelect(liveVal);
    }
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(commitScrollIndex, 120);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    dragStateRef.current = {
      dragging: true,
      startY: e.clientY,
      startTop: el.scrollTop,
      moved: false,
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragStateRef.current.dragging) return;
      const dy = moveEvent.clientY - dragStateRef.current.startY;
      if (Math.abs(dy) > 4) {
        dragStateRef.current.moved = true;
      }
      el.scrollTop = dragStateRef.current.startTop - dy;
    };

    const handleMouseUp = () => {
      dragStateRef.current.dragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragStateRef.current.moved) {
        commitScrollIndex();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleItemClick = (val, idx) => {
    if (dragStateRef.current.moved) {
      dragStateRef.current.moved = false;
      return;
    }
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
    }
    if (val !== selectedValue) {
      onSelect(val);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(items.length - 1, selectedIndex + delta));
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: nextIdx * ITEM_HEIGHT, behavior: 'smooth' });
      onSelect(items[nextIdx]);
    }
  };

  return (
    <div className="relative flex flex-col items-center select-none">
      {unitLabel && (
        <span className="text-[11px] font-bold text-slate-400 mb-1">{unitLabel}</span>
      )}
      <div
        className="relative w-[72px] overflow-hidden rounded-lg bg-white"
        style={{ height: `${ITEM_HEIGHT * VISIBLE_ROWS}px` }}
      >
        {/* Center selection highlight band */}
        <div
          className="pointer-events-none absolute inset-x-1 rounded-md bg-blue-50/90 border-y border-blue-200 z-0"
          style={{ top: `${PAD_HEIGHT}px`, height: `${ITEM_HEIGHT}px` }}
        />
        {/* Top & bottom gradient fade masks */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-white via-white/80 to-transparent"
          style={{ height: `${PAD_HEIGHT}px` }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white/80 to-transparent"
          style={{ height: `${PAD_HEIGHT}px` }}
        />

        <div
          ref={scrollRef}
          role="listbox"
          tabIndex={0}
          aria-label={ariaLabel}
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyDown}
          className="relative z-10 h-full overflow-y-auto cursor-grab active:cursor-grabbing focus:outline-none [&::-webkit-scrollbar]:hidden"
          style={{
            scrollSnapType: 'y mandatory',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingTop: `${PAD_HEIGHT}px`,
            paddingBottom: `${PAD_HEIGHT}px`,
          }}
        >
          {items.map((item, idx) => {
            const dist = Math.abs(idx - selectedIndex);
            const isSelected = dist === 0;
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleItemClick(item, idx)}
                className={`w-full flex items-center justify-center tabular-nums transition-all duration-100 ${
                  isSelected
                    ? 'text-slate-900 font-extrabold text-lg'
                    : dist === 1
                      ? 'text-slate-500 font-medium text-sm'
                      : 'text-slate-300 font-normal text-xs'
                }`}
                style={{
                  height: `${ITEM_HEIGHT}px`,
                  scrollSnapAlign: 'center',
                }}
              >
                {formatItem(item)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Shared floating popover anchored near the trigger button so it is never clipped by modal overflow.
 */
const usePopoverPosition = (popWidth = 264) => {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const openPopover = useCallback(() => {
    const el = triggerRef.current;
    if (el && typeof window !== 'undefined') {
      const rect = el.getBoundingClientRect();
      const popHeight = 296;
      const left = Math.min(Math.max(rect.left, 10), window.innerWidth - popWidth - 10);
      const fitsBelow = rect.bottom + 8 + popHeight <= window.innerHeight - 10;
      const top = fitsBelow
        ? rect.bottom + 8
        : Math.max(10, rect.top - popHeight - 8);
      setPos({ left, top });
    }
    setOpen(true);
  }, [popWidth]);

  return { triggerRef, open, setOpen, pos, openPopover };
};

/**
 * iPhone-alarm-style 24h time wheel picker ("HH:MM", 1-minute step).
 */
export const WheelTimeInput = ({
  value = '',
  onChange,
  placeholder = '--:--',
  label = '時刻設定',
  defaultHour = 8,
  defaultMinute = 0,
  className = '',
}) => {
  const { triggerRef, open, setOpen, pos, openPopover } = usePopoverPosition(252);

  const parseValue = (val) => {
    if (typeof val === 'string' && val.includes(':')) {
      const [hStr, mStr] = val.split(':');
      const h = Number(hStr);
      const m = Number(mStr);
      if (Number.isInteger(h) && h >= 0 && h <= 23 && Number.isInteger(m) && m >= 0 && m <= 59) {
        return { hour: h, minute: m };
      }
    }
    return null;
  };

  const parsed = parseValue(value);
  const [draftHour, setDraftHour] = useState(parsed?.hour ?? defaultHour);
  const [draftMinute, setDraftMinute] = useState(parsed?.minute ?? defaultMinute);

  const handleOpen = () => {
    const current = parseValue(value);
    setDraftHour(current?.hour ?? defaultHour);
    setDraftMinute(current?.minute ?? defaultMinute);
    openPopover();
  };

  const emitTime = (h, m) => {
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  const handleHourChange = (h) => {
    setDraftHour(h);
    emitTime(h, draftMinute);
  };

  const handleMinuteChange = (m) => {
    setDraftMinute(m);
    emitTime(draftHour, m);
  };

  const handleConfirm = () => {
    emitTime(draftHour, draftMinute);
    setOpen(false);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onChange('');
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded border text-sm bg-white transition hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
          open ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Clock size={14} className={parsed ? 'text-blue-600 shrink-0' : 'text-gray-400 shrink-0'} />
          <span className={`tabular-nums font-bold ${parsed ? 'text-gray-800' : 'text-gray-400 font-normal'}`}>
            {parsed ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}` : placeholder}
          </span>
        </span>
        {parsed && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="未設定に戻す"
          >
            <X size={13} />
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[9995]"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-[9996] w-[252px] bg-white rounded-xl shadow-2xl border border-slate-200 p-3"
            style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">{label}</span>
              <span className="text-sm font-extrabold text-blue-700 tabular-nums">
                {String(draftHour).padStart(2, '0')}:{String(draftMinute).padStart(2, '0')}
              </span>
            </div>

            <div className="flex items-center justify-center gap-1.5">
              <WheelColumn
                items={HOURS_24}
                selectedValue={draftHour}
                onSelect={handleHourChange}
                unitLabel="時"
                ariaLabel="時を選択"
              />
              <span className="text-xl font-extrabold text-slate-400 mt-4">:</span>
              <WheelColumn
                items={MINUTES_60}
                selectedValue={draftMinute}
                onSelect={handleMinuteChange}
                unitLabel="分"
                ariaLabel="分を選択"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 mt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
              >
                未設定
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
              >
                <Check size={13} />
                <span>決定</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * iPhone-alarm-style duration wheel picker for overtime (hours 0..15, minutes 0..59, 1-minute step).
 * Stores value as numeric hours (or '' when unset) for full backward compatibility.
 */
export const WheelDurationInput = ({
  value = '',
  onChange,
  label = '残業時間',
  className = '',
}) => {
  const { triggerRef, open, setOpen, pos, openPopover } = usePopoverPosition(264);

  const parsed = overtimeHoursToHM(value);
  const [draftHours, setDraftHours] = useState(parsed?.hours ?? 0);
  const [draftMinutes, setDraftMinutes] = useState(parsed?.minutes ?? 0);

  const handleOpen = () => {
    const current = overtimeHoursToHM(value);
    setDraftHours(current?.hours ?? 0);
    setDraftMinutes(current?.minutes ?? 0);
    openPopover();
  };

  const handleHoursChange = (h) => {
    setDraftHours(h);
    onChange(hmToOvertimeHours(h, draftMinutes));
  };

  const handleMinutesChange = (m) => {
    setDraftMinutes(m);
    onChange(hmToOvertimeHours(draftHours, m));
  };

  const handleConfirm = () => {
    onChange(hmToOvertimeHours(draftHours, draftMinutes));
    setOpen(false);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onChange('');
    setOpen(false);
  };

  const draftDecimal = Math.round(((draftHours * 60 + draftMinutes) / 60) * 100) / 100;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-2 rounded border text-sm bg-white transition hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
          open ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Clock size={14} className={parsed ? 'text-blue-600 shrink-0' : 'text-gray-400 shrink-0'} />
          <span className={`truncate tabular-nums ${parsed ? 'text-gray-800 font-bold' : 'text-gray-400'}`}>
            {formatOvertimeSummary(value)}
          </span>
        </span>
        {parsed && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
            title="未設定に戻す"
          >
            <X size={13} />
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[9995]"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-[9996] w-[264px] bg-white rounded-xl shadow-2xl border border-slate-200 p-3"
            style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">{label}</span>
              <span className="text-xs font-extrabold text-blue-700 tabular-nums">
                {draftHours}時間{String(draftMinutes).padStart(2, '0')}分 ({draftDecimal}h)
              </span>
            </div>

            <div className="flex items-center justify-center gap-1.5">
              <WheelColumn
                items={OVERTIME_HOURS}
                selectedValue={draftHours}
                onSelect={handleHoursChange}
                formatItem={(v) => String(v)}
                unitLabel="時間"
                ariaLabel="残業の時間を選択"
              />
              <span className="text-xs font-bold text-slate-400 mt-4 whitespace-nowrap">時間</span>
              <WheelColumn
                items={MINUTES_60}
                selectedValue={draftMinutes}
                onSelect={handleMinutesChange}
                unitLabel="分"
                ariaLabel="残業の分を選択"
              />
              <span className="text-xs font-bold text-slate-400 mt-4 whitespace-nowrap">分</span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 mt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
              >
                未設定
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
              >
                <Check size={13} />
                <span>決定</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
