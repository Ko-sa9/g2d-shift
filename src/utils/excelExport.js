// Client-side Excel (.xlsx) & TSV clipboard exporter for the "in" shift-code sheet.
// Pure JS OOXML + ZIP (STORE method) builder with zero external dependencies.

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const utf8Encode = (str) => new TextEncoder().encode(str);

const escapeXml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const colIndexToLetter = (colIndex) => {
  let n = colIndex + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
};

// Pack files into a valid ZIP archive using STORE (compression method 0).
const buildZipBytes = (files) => {
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = utf8Encode(file.name);
    const dataBytes = typeof file.content === 'string' ? utf8Encode(file.content) : file.content;
    const checksum = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression: STORE
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cv.setUint16(10, 0, true); // Compression: STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const part of centralParts) centralDirSize += part.length;

  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central directory signature
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  const totalLength = centralDirOffset + centralDirSize + endRecord.length;
  const output = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of localParts) {
    output.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    output.set(part, pos);
    pos += part.length;
  }
  output.set(endRecord, pos);
  return output;
};

const isStrictNumericString = (value) => /^-?\d+(\.\d+)?$/.test(String(value).trim());

/**
 * Resolve the exported upper-row cell value for a staff member on a given day.
 * - Empty cell -> { kind: 'empty', value: '' }
 * - Hope (req) category shift -> display label as string
 * - Other shift -> shift code (numeric Excel value when digits, else string)
 */
export const resolveExportShiftCell = ({
  rawCode,
  shiftDefs = {},
  isReqCategory,
  transformCode,
  day,
  dow,
}) => {
  if (rawCode === null || rawCode === undefined || rawCode === '') {
    return { kind: 'empty', value: '' };
  }
  const codeStr = String(rawCode).trim();
  if (!codeStr) {
    return { kind: 'empty', value: '' };
  }
  const def = shiftDefs[codeStr];
  if (def && typeof isReqCategory === 'function' && isReqCategory(def.category)) {
    const labelStr = String(def.label || codeStr).trim();
    return { kind: 'req_label', value: labelStr };
  }
  const outputCode =
    typeof transformCode === 'function'
      ? String(transformCode(codeStr, { day, dow }) ?? codeStr).trim()
      : codeStr;
  if (!outputCode) {
    return { kind: 'empty', value: '' };
  }
  if (isStrictNumericString(outputCode)) {
    return { kind: 'number', value: Number(outputCode), text: outputCode };
  }
  return { kind: 'string', value: outputCode };
};

/**
 * Build a TSV string of ONLY the day 1..end matrix for direct paste into Excel's "in" tab.
 */
export const buildShiftCodeTsv = ({
  staffList = [],
  daysArray = [],
  shiftData = {},
  shiftDefs = {},
  isReqCategory,
  transformCode,
}) => {
  const rows = staffList.map((staff) =>
    daysArray
      .map((day) => {
        const resolved = resolveExportShiftCell({
          rawCode: shiftData[staff.id]?.[day],
          shiftDefs,
          isReqCategory,
          transformCode,
          day,
        });
        if (resolved.kind === 'empty') return '';
        const text = resolved.kind === 'number' ? resolved.text : String(resolved.value);
        // Strip tabs/newlines to keep grid alignment intact when pasted into Excel
        return text.replace(/[\t\r\n]+/g, ' ');
      })
      .join('\t')
  );
  return rows.join('\r\n');
};

/**
 * Build a valid .xlsx workbook (Uint8Array) with a single sheet named "in":
 * - Row 1: [year, month, "月"] title header (B1 = "YYYY年M月")
 * - Row 2: ["No.", "氏名", 1, 2, ..., daysInMonth]
 * - Row 3: ["", "曜日", "日", "月", ...]
 * - Row 4+: [index, staff.name, ...upper-row shift codes / req labels]
 */
export const buildShiftExcelXlsxBytes = ({
  year,
  month,
  daysArray = [],
  staffList = [],
  shiftData = {},
  shiftDefs = {},
  isReqCategory,
  getDayOfWeek,
  transformCode,
  sheetName = 'in',
}) => {
  const sharedStrings = [];
  const sharedStringMap = new Map();
  const internString = (str) => {
    const s = String(str ?? '');
    if (sharedStringMap.has(s)) return sharedStringMap.get(s);
    const idx = sharedStrings.length;
    sharedStrings.push(s);
    sharedStringMap.set(s, idx);
    return idx;
  };

  // Style indices defined in stylesXml below:
  // 0: default
  // 1: title bold (left)
  // 2: header center bold + gray fill + thin border
  // 3: header Sat (blue bold + light blue fill + thin border)
  // 4: header Sun (red bold + light red fill + thin border)
  // 5: body center + thin border (No., shift codes)
  // 6: body left + thin border (氏名)
  // 7: body center pink text + thin border (希望カテゴリ表示名)
  // 8: body center Sunday cell (light red tint + thin border)
  // 9: body center Saturday cell (light blue tint + thin border)

  const cellXml = (rowNum, colIdx, cellSpec, styleIdx) => {
    const ref = `${colIndexToLetter(colIdx)}${rowNum}`;
    if (!cellSpec || cellSpec.kind === 'empty') {
      return `<c r="${ref}" s="${styleIdx}"/>`;
    }
    if (cellSpec.kind === 'number') {
      return `<c r="${ref}" s="${styleIdx}"><v>${cellSpec.value}</v></c>`;
    }
    const sIdx = internString(cellSpec.value);
    return `<c r="${ref}" t="s" s="${styleIdx}"><v>${sIdx}</v></c>`;
  };

  const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  const dayDows = daysArray.map((day) =>
    typeof getDayOfWeek === 'function'
      ? getDayOfWeek(year, month, day)
      : new Date(year, month - 1, day).getDay()
  );

  const rowXmlList = [];

  // Row 1: Year / Month banner
  {
    const cells = [
      cellXml(1, 0, { kind: 'number', value: Number(year) }, 1),
      cellXml(1, 1, { kind: 'string', value: `${year}年${month}月 シフトコード表` }, 1),
    ];
    rowXmlList.push(`<row r="1" ht="22" customHeight="1">${cells.join('')}</row>`);
  }

  // Row 2: No., 氏名, 1..daysInMonth
  {
    const cells = [
      cellXml(2, 0, { kind: 'string', value: 'No.' }, 2),
      cellXml(2, 1, { kind: 'string', value: '氏名' }, 2),
    ];
    daysArray.forEach((day, idx) => {
      const dow = dayDows[idx];
      const style = dow === 0 ? 4 : dow === 6 ? 3 : 2;
      cells.push(cellXml(2, 2 + idx, { kind: 'number', value: Number(day) }, style));
    });
    rowXmlList.push(`<row r="2" ht="20" customHeight="1">${cells.join('')}</row>`);
  }

  // Row 3: Weekday header
  {
    const cells = [
      cellXml(3, 0, { kind: 'empty' }, 2),
      cellXml(3, 1, { kind: 'string', value: '曜日' }, 2),
    ];
    daysArray.forEach((_day, idx) => {
      const dow = dayDows[idx];
      const style = dow === 0 ? 4 : dow === 6 ? 3 : 2;
      cells.push(cellXml(3, 2 + idx, { kind: 'string', value: weekdayLabels[dow] || '' }, style));
    });
    rowXmlList.push(`<row r="3" ht="19" customHeight="1">${cells.join('')}</row>`);
  }

  // Row 4+: Staff rows (matching displayed order)
  staffList.forEach((staff, sIdx) => {
    const rowNum = 4 + sIdx;
    const cells = [
      cellXml(rowNum, 0, { kind: 'number', value: sIdx + 1 }, 5),
      cellXml(rowNum, 1, { kind: 'string', value: staff.name || '' }, 6),
    ];
    daysArray.forEach((day, dIdx) => {
      const dow = dayDows[dIdx];
      const resolved = resolveExportShiftCell({
        rawCode: shiftData[staff.id]?.[day],
        shiftDefs,
        isReqCategory,
        transformCode,
        day,
        dow,
      });
      let style = 5;
      if (resolved.kind === 'req_label') {
        style = 7;
      } else if (dow === 0) {
        style = 8;
      } else if (dow === 6) {
        style = 9;
      }
      cells.push(cellXml(rowNum, 2 + dIdx, resolved, style));
    });
    rowXmlList.push(`<row r="${rowNum}" ht="19" customHeight="1">${cells.join('')}</row>`);
  });

  const lastColLetter = colIndexToLetter(Math.max(1, 1 + daysArray.length));
  const lastRowNum = 3 + staffList.length;

  const colsXml = [
    '<col min="1" max="1" width="5.5" customWidth="1"/>',
    '<col min="2" max="2" width="16" customWidth="1"/>',
    daysArray.length > 0
      ? `<col min="3" max="${2 + daysArray.length}" width="6" customWidth="1"/>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${lastColLetter}${lastRowNum}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane xSplit="2" ySplit="3" topLeftCell="C4" activePane="bottomRight" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="19"/>' +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowXmlList.join('')}</sheetData>` +
    '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>';

  const sharedStringsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">` +
    sharedStrings
      .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
      .join('') +
    '</sst>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="5">' +
    '<font><sz val="10"/><name val="Yu Gothic"/></font>' + // 0: normal
    '<font><b/><sz val="11"/><name val="Yu Gothic"/></font>' + // 1: bold title/header
    '<font><b/><sz val="10"/><color rgb="FF1D4ED8"/><name val="Yu Gothic"/></font>' + // 2: Sat blue bold
    '<font><b/><sz val="10"/><color rgb="FFDC2626"/><name val="Yu Gothic"/></font>' + // 3: Sun red bold
    '<font><b/><sz val="10"/><color rgb="FFDB2777"/><name val="Yu Gothic"/></font>' + // 4: req pink bold
    '</fonts>' +
    '<fills count="6">' +
    '<fill><patternFill patternType="none"/></fill>' + // 0
    '<fill><patternFill patternType="gray125"/></fill>' + // 1
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>' + // 2: header gray
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>' + // 3: Sat light blue
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF2F2"/><bgColor indexed="64"/></patternFill></fill>' + // 4: Sun light red
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFDF2F8"/><bgColor indexed="64"/></patternFill></fill>' + // 5: req light pink
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' + // 0: none
    '<border>' +
    '<left style="thin"><color rgb="FFD1D5DB"/></left>' +
    '<right style="thin"><color rgb="FFD1D5DB"/></right>' +
    '<top style="thin"><color rgb="FFD1D5DB"/></top>' +
    '<bottom style="thin"><color rgb="FFD1D5DB"/></bottom>' +
    '<diagonal/>' +
    '</border>' + // 1: thin gray border
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 0: default
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 1: title
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 2: header
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 3: header Sat
    '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 4: header Sun
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 5: body center
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 6: body left
    '<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 7: body req label
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 8: body Sun
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 9: body Sat
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const safeSheetName = escapeXml(String(sheetName || 'in').slice(0, 31));

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    `<sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/>` +
    '</sheets>' +
    '</workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
    '</Relationships>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '</Types>';

  return buildZipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/sharedStrings.xml', content: sharedStringsXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ]);
};
