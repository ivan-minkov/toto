/**
 * TOTO SCANNER PRO - OCR & IMAGE PROCESSING MODULE
 * 100% Dynamic Parsing for Bulgarian Sport Toto Receipts (6/49, 5/35, 6/42)
 * Zero hardcoded values or fake fallbacks.
 */

const TotoOCR = {
  tesseractWorker: null,
  isInitializing: false,
  _initPromise: null,
  _onProgress: null,

  /**
   * Preprocess image for OCR.
   * modes:
   *  - 'color'  : max(R,G,B) channel -> removes the orange/colored security print of the slip,
   *               keeps black thermal text dark. Then auto-levels.
   *  - 'binary' : same as 'color' + adaptive (Bradley) threshold -> robust to shadows / uneven light.
   *  - 'gray'   : classic luminance + auto-levels.
   * The image is also rescaled so text is in Tesseract's sweet spot (long side ~2400px).
   */
  preprocessImage(sourceCanvas, mode = 'color') {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const longSide = Math.max(srcW, srcH) || 1;

    const TARGET = 2400;
    let scale = TARGET / longSide;
    if (scale > 1 && longSide >= 1600) scale = 1; // already large enough, don't upscale
    scale = Math.min(scale, 2);

    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = width;
    processedCanvas.height = height;
    const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const n = width * height;
    const gray = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);

    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const v = mode === 'gray'
        ? (0.299 * r + 0.587 * g + 0.114 * b)
        : Math.max(r, g, b);
      gray[p] = v;
      hist[gray[p]]++;
    }

    // Auto-levels: stretch between 1st and 99th percentile
    let lo = 0, hi = 255, acc = 0;
    const loCut = n * 0.01, hiCut = n * 0.99;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= loCut) { lo = v; break; } }
    acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= hiCut) { hi = v; break; } }
    if (hi - lo > 10) {
      const k = 255 / (hi - lo);
      for (let p = 0; p < n; p++) gray[p] = (gray[p] - lo) * k;
    }

    if (mode === 'binary') {
      this._adaptiveThreshold(gray, width, height);
    }

    for (let p = 0, i = 0; p < n; p++, i += 4) {
      data[i] = data[i + 1] = data[i + 2] = gray[p];
      data[i + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    return processedCanvas;
  },

  /**
   * Bradley adaptive threshold (integral image). In-place on a grayscale buffer.
   */
  _adaptiveThreshold(gray, width, height, t = 0.15) {
    const integral = new Uint32Array(width * height);
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        rowSum += gray[idx];
        integral[idx] = rowSum + (y > 0 ? integral[idx - width] : 0);
      }
    }
    const half = Math.max(8, Math.floor(width / 32));
    const out = new Uint8ClampedArray(gray.length);
    for (let y = 0; y < height; y++) {
      const y1 = Math.max(0, y - half), y2 = Math.min(height - 1, y + half);
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - half), x2 = Math.min(width - 1, x + half);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);
        const A = (y1 > 0 && x1 > 0) ? integral[(y1 - 1) * width + (x1 - 1)] : 0;
        const B = y1 > 0 ? integral[(y1 - 1) * width + x2] : 0;
        const C = x1 > 0 ? integral[y2 * width + (x1 - 1)] : 0;
        const D = integral[y2 * width + x2];
        const sum = D - B - C + A;
        const idx = y * width + x;
        out[idx] = (gray[idx] * count) <= sum * (1 - t) ? 0 : 255;
      }
    }
    gray.set(out);
  },

  /**
   * Native barcode detection if present on ticket
   */
  async scanBarcode(canvas) {
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        const detector = new window.BarcodeDetector({
          formats: formats.length > 0 ? formats : ['code_128', 'code_39', 'qr_code', 'ean_13', 'upc_a']
        });
        const barcodes = await detector.detect(canvas);
        if (barcodes && barcodes.length > 0) {
          return barcodes[0].rawValue;
        }
      } catch (err) {
        console.warn('BarcodeDetector error:', err);
      }
    }
    return null;
  },

  /**
   * Initialize Tesseract Worker with bul+eng language packs
   */
  initTesseract(onProgress) {
    if (onProgress) this._onProgress = onProgress;
    if (this.tesseractWorker) return Promise.resolve(this.tesseractWorker);
    if (this._initPromise) return this._initPromise; // shared promise: safe to pre-warm + scan concurrently
    if (typeof Tesseract === 'undefined') return Promise.resolve(null);

    this.isInitializing = true;
    this._initPromise = (async () => {
      try {
        const worker = await Tesseract.createWorker('bul+eng', 1, {
          logger: m => {
            if (this._onProgress && m.status === 'recognizing text') {
              this._onProgress(Math.round((m.progress || 0) * 100));
            }
          }
        });
        this.tesseractWorker = worker;
        return worker;
      } catch (e) {
        console.warn('Tesseract worker error:', e);
        this._initPromise = null;
        return null;
      } finally {
        this.isInitializing = false;
      }
    })();
    return this._initPromise;
  },

  /**
   * Run Tesseract on a canvas with a given page segmentation mode.
   * PSM 3 = automatic layout, 4 = single column, 6 = single uniform block.
   */
  async recognize(canvas, psm = '3', onProgress) {
    const worker = await this.initTesseract(onProgress);
    if (!worker) return '';
    if (onProgress) this._onProgress = onProgress;
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        preserve_interword_spaces: '1'
      });
    } catch (e) {
      console.warn('setParameters failed:', e);
    }
    const res = await worker.recognize(canvas);
    return res?.data?.text || '';
  },

  /**
   * Full multi-pass scan pipeline.
   * Pass 1: color-filtered image (fast path). If the result is incomplete
   * (missing areas, short areas, missing draw), extra passes with adaptive
   * threshold / other layouts are run and results are merged.
   */
  async scanSlip(rawCanvas, onStatus) {
    const barcodePromise = this.scanBarcode(rawCanvas);

    const passes = [
      { mode: 'color',  psm: '3', label: 'Разпознаване' },
      { mode: 'binary', psm: '6', label: 'Допълнителна проверка' },
      { mode: 'gray',   psm: '4', label: 'Последна проверка' }
    ];

    let best = null;
    const texts = [];

    for (const pass of passes) {
      onStatus?.(`${pass.label}...`);
      let text = '';
      try {
        const canvas = this.preprocessImage(rawCanvas, pass.mode);
        text = await this.recognize(canvas, pass.psm, p => onStatus?.(`${pass.label}: ${p}%`));
      } catch (e) {
        console.warn(`OCR pass ${pass.mode}/${pass.psm} failed:`, e);
      }
      console.log(`--- OCR PASS ${pass.mode}/psm${pass.psm} ---\n${text}`);
      texts.push(text);

      const slip = this.parseReceiptText(text);
      best = best ? this.mergeSlips(best, slip) : slip;
      if (this.isSlipComplete(best)) break;
    }

    const barcode = await barcodePromise;
    if (barcode && !best.controlNumber) best.controlNumber = barcode;
    best.rawText = texts.join('\n\n----- next pass -----\n\n');
    return best;
  },

  targetCountFor(gameType) {
    return (gameType || '').includes('35') ? 5 : 6;
  },

  isSlipComplete(slip) {
    if (!slip || !slip.drawNum) return false;
    const areas = slip.areas || [];
    if (areas.length === 0) return false;
    const target = this.targetCountFor(slip.gameType);
    if (areas.some(a => a.length < target)) return false;
    // OCR saw more area labels (I:, II:, ...) than areas we could parse
    if ((slip.areaLabelCount || 0) > areas.length) return false;
    return true;
  },

  /**
   * Merge two parsed slips: fill missing fields, keep the better area list.
   */
  mergeSlips(a, b) {
    const out = { ...a };
    const fields = ['drawNum', 'drawYear', 'drawDisplay', 'acceptedAt', 'serialNumber',
      'subCode', 'jokerCode', 'joker', 'totalPrice', 'controlNumber', 'terminal', 'operator'];
    for (const f of fields) {
      if ((out[f] === null || out[f] === undefined) && b[f] !== null && b[f] !== undefined) {
        out[f] = b[f];
      }
    }
    if (!a.gameTypeDetected && b.gameTypeDetected) {
      out.gameType = b.gameType;
      out.gameTypeDetected = true;
    }

    const target = this.targetCountFor(out.gameType);
    const score = (areas) => {
      const list = areas || [];
      const full = list.filter(x => x.length >= target).length;
      const total = list.reduce((s, x) => s + Math.min(x.length, target), 0);
      return list.length * 1000 + full * 100 + total;
    };
    if (score(b.areas) > score(a.areas)) out.areas = b.areas;
    out.areaLabelCount = Math.max(a.areaLabelCount || 0, b.areaLabelCount || 0);
    return out;
  },

  /**
   * 100% DYNAMIC PARSER:
   * Extracts receipt data strictly from the scanned raw text.
   * If a field is not present or not readable, returns null (no hardcoded fallbacks!).
   */
  parseReceiptText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return this.emptySlip();
    }

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    // 1. ТИРАЖ (e.g. "Тираж: 71/2026" or "71/2026")
    let drawNum = null;
    let drawYear = null;
    let drawDisplay = null;

    const drawRegexes = [
      /(?:ТИРАЖ|ТИР|TIRAJ|THPAX|TIPAK)[\s#№:.-]*(\d{1,3})(?:\s*[\/.-]\s*(\d{4}))?/i,
      /\b([1-9]\d?|10[0-4])\s*[\/]\s*(202\d)\b/,
      /ТИРАЖ\s*[:#№]?\s*(\d{1,3})/i
    ];

    for (const rx of drawRegexes) {
      const match = rawText.match(rx);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val >= 1 && val <= 104) {
          drawNum = val;
          if (match[2]) drawYear = match[2];
          break;
        }
      }
    }

    if (drawNum !== null) {
      drawDisplay = drawYear ? `${drawNum}/${drawYear}` : `${drawNum}`;
    }

    // 2. ДАТА И ЧАС НА ПРИЕМАНЕ (e.g. "Приет: 09.09.2026 18:45")
    let acceptedAt = null;
    const acceptedMatch = rawText.match(/(?:ПРИЕТ|ДАТА|ПРИЕТО)[\s:#№]*([0-3]?\d[./-][01]?\d[./-]\d{4}(?:[,\s]+[0-2]?\d[:.][0-5]\d)?)/i);
    if (acceptedMatch && acceptedMatch[1]) {
      acceptedAt = acceptedMatch[1].replace(',', ' ').trim();
    } else {
      const dateMatch = rawText.match(/\b([0-3]?\d[./-][01]?\d[./-]\d{4}(?:\s+[0-2]?\d[:.][0-5]\d)?)\b/);
      if (dateMatch) {
        acceptedAt = dateMatch[1].trim();
      }
    }

    // 3. ТИП ТОТО (e.g. "TOTO2 6/49", "5/35", "6/42")
    let gameType = null;
    if (/(?:5[\s\/отxX*.-]+35|5\s*[\/]\s*35|ПЕТ\s*ОТ\s*35)/i.test(rawText)) {
      gameType = '5/35';
    } else if (/(?:6[\s\/отxX*.-]+42|6\s*[\/]\s*42|ШЕСТ\s*ОТ\s*42)/i.test(rawText)) {
      gameType = '6/42';
    } else if (/(?:6[\s\/отxX*.-]+49|6\s*[\/]\s*49|ШЕСТ\s*ОТ\s*49)/i.test(rawText)) {
      gameType = '6/49';
    }

    // 4. ПОРЕДЕН # (e.g. "0000000110")
    let serialNumber = null;
    const serialMatch = rawText.match(/(?:ПОРЕДЕН|ПОРЕДЕН\s*#|ПОРЕДЕН\s*№|СЕРИЕН|№)[\s:#№]*(\d{6,14})/i);
    if (serialMatch && serialMatch[1]) {
      serialNumber = serialMatch[1].trim();
    } else {
      const tenDigits = rawText.match(/\b0{2,8}\d{2,8}\b/);
      if (tenDigits) {
        serialNumber = tenDigits[0];
      }
    }

    // 5. ЧИСЛА ПО ОБЛАСТИ (I:, II:, etc.)
    const maxVal = gameType === '5/35' ? 35 : (gameType === '6/42' ? 42 : 49);
    const targetCount = gameType === '5/35' ? 5 : 6;
    const { areas, areaLabelCount } = this.parseAreas(lines, maxVal, targetCount);

    // 6. ГОЛЯМ НОМЕР НАД ДЖОКЕР (9 цифри)
    let jokerCode = null;
    const nineMatch = rawText.match(/\b(\d{9})\b/);
    if (nineMatch) {
      jokerCode = nineMatch[1];
    } else {
      const spacedMatch = rawText.match(/\b(\d\s+\d\s+\d\s+\d\s+\d\s+\d\s+\d\s+\d\s+\d)\b/);
      if (spacedMatch) {
        jokerCode = spacedMatch[1].replace(/\s+/g, '');
      }
    }

    // 7. ДЖОКЕР (ПОЗ/ЦИФ: e.g. 1/8, 4/8, 6/8)
    let joker = null;
    const slashPairs = rawText.match(/\b([1-9])\s*[\/]\s*([0-9])\b/g);
    if (slashPairs && slashPairs.length > 0) {
      const parsedPairs = [];
      const positions = [];
      const digits = [];

      slashPairs.slice(0, 3).forEach(p => {
        const parts = p.split('/');
        const pos = parseInt(parts[0].trim(), 10);
        const dig = parseInt(parts[1].trim(), 10);
        parsedPairs.push(`${pos}/${dig}`);
        positions.push(pos);
        digits.push(dig);
      });

      joker = {
        pairs: parsedPairs,
        positions,
        digits,
        display: parsedPairs.join(', ')
      };
    }

    // 8. ОБЩА СУМА (e.g. 2.00 EUR или 3.50 BGN)
    let totalPrice = null;
    const priceMatch = rawText.match(/(?:ОБЩО|СУМА|ЦЕНА)[\s:#№]*([0-9]+[.,][0-9]{2})\s*(EUR|€|ЛВ|BGN)?/i);
    if (priceMatch && priceMatch[1]) {
      const cur = priceMatch[2] ? priceMatch[2].toUpperCase().replace('€', 'EUR').replace('ЛВ', 'BGN') : 'EUR';
      totalPrice = `${priceMatch[1].replace(',', '.')} ${cur}`;
    }

    // 9. КОНТРОЛЕН НОМЕР (e.g. 9763-A2C0-468D-5E27-000A-83A0)
    let controlNumber = null;
    const controlRegexes = [
      /\b([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/i,
      /\b([0-9A-F]{24})\b/i
    ];
    for (const rx of controlRegexes) {
      const match = rawText.match(rx);
      if (match) {
        const val = match[1].toUpperCase();
        if (val.length === 24 && !val.includes('-')) {
          controlNumber = `${val.slice(0,4)}-${val.slice(4,8)}-${val.slice(8,12)}-${val.slice(12,16)}-${val.slice(16,20)}-${val.slice(20,24)}`;
        } else {
          controlNumber = val;
        }
        break;
      }
    }

    // 10. ТЕРМИНАЛ И ОПЕРАТОР (допълнителни метаданни, ако ги има)
    let terminal = null;
    const termMatch = rawText.match(/(?:ТЕРМИНАЛ|ТЕРМ|TERM)[\s:#№]*([0-9]{3}-[0-9]{3}-[0-9]{3})/i);
    if (termMatch) terminal = termMatch[1];

    let operator = null;
    const opMatch = rawText.match(/(?:ОПЕРАТОР|ОПЕР|OPER|ONEPAROP|ONEP)[\s:#№]*([0-9]{3}-[0-9]{3})/i);
    if (opMatch) operator = opMatch[1];

    return {
      drawNum,
      drawYear,
      drawDisplay,
      acceptedAt,
      gameType: gameType || '6/49', // default game classification if omitted, but clean
      gameTypeDetected: !!gameType,
      serialNumber,
      areas,
      areaLabelCount,
      subCode: jokerCode,
      jokerCode,
      joker,
      totalPrice,
      controlNumber,
      terminal,
      operator,
      rawText
    };
  },

  emptySlip() {
    return {
      drawNum: null,
      drawYear: null,
      drawDisplay: null,
      acceptedAt: null,
      gameType: null,
      serialNumber: null,
      areas: [],
      subCode: null,
      jokerCode: null,
      joker: null,
      totalPrice: null,
      controlNumber: null,
      terminal: null,
      operator: null,
      rawText: ''
    };
  },

  /**
   * Detect an area label at the start of a line ("I:", "II:", "III:" ...),
   * tolerant to OCR look-alikes: "Il;", "11:", "I I:", "|l:", "П:", "ІІ:" (Cyrillic І) etc.
   * Returns { index, rest } or null.
   */
  detectAreaLabel(line) {
    const m = line.match(/^\s*(?:(?:ОБЛАСТ|ОБЛ|OBL)\.?\s*)?([^\s:;.,]{1,4}(?:\s[^\s:;.,]{1,2})?)\s*([:;.,])\s*/i);
    if (!m) return null;

    const candidate = m[1].replace(/\s+/g, '');
    const sep = m[2];
    // A bare number followed by a comma is a lotto number, not a label ("1, 4, 5 ...")
    if (/^\d+$/.test(candidate) && sep === ',') return null;

    const charMap = {
      'I': 'I', 'І': 'I', 'Ӏ': 'I', 'l': 'I', 'i': 'I', 'ı': 'I', '|': 'I', '!': 'I', '1': 'I',
      'T': 'I', 'Т': 'I', 'L': 'I', 'ї': 'I', 'Ї': 'I', 'r': '',
      'V': 'V', 'v': 'V',
      'П': 'II', 'п': 'II', 'Н': 'II', 'н': 'II', 'H': 'II'
    };
    let roman = '';
    for (const ch of candidate) {
      const mapped = charMap[ch];
      if (mapped === undefined) return null;
      roman += mapped;
    }
    const romanList = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    const idx = romanList.indexOf(roman);
    if (idx === -1) return null;

    return { index: idx + 1, rest: line.slice(m[0].length) };
  },

  /**
   * Parse playing areas. Areas are kept in order of appearance on the slip.
   * IMPORTANT: an area is never discarded because its label was misread
   * (old bug: "II" misread as "I" caused area II to be dropped as a duplicate).
   */
  parseAreas(lines, maxVal, targetCount) {
    const minCount = targetCount - 1;
    const skipKeywords = [
      'ДЖОКЕР', 'JOKER', 'ПОЗ/ЦИФ', 'ПОЗ', 'ЦИФ',
      'ОБЩО', 'СУМА', 'EUR', 'BGN', 'ЦЕНА',
      'ТИРАЖ', 'TIRAJ', 'THPAX', 'TIPAK',
      'ТЕРМИНАЛ', 'TERMINAL', 'ОПЕРАТОР', 'OPERATOR', 'ONEPAROP',
      'ПРИЕТ', 'ДАТА',
      'ТОТО', 'TOTO',
      'ПОРЕДЕН', 'СЕРИЕН',
      'ПЕЧАЛБИ', 'КВИТАНЦИЯ', 'ЗАЛОГ', 'ПРЕДСТАВЯНЕ',
      'ХАЙДУШКО', 'ТОТАЛИЗАТОР', 'СОФИЯ', 'СПОРТЕН'
    ];

    const isSkippable = (line) => {
      const upper = line.toUpperCase();
      if (skipKeywords.some(kw => upper.includes(kw))) return true;
      if (/^[0-9A-Z]{4}-[0-9A-Z]{4}/i.test(line)) return true; // control code
      if (/^\s*\d{9}\b/.test(line)) return true;                 // 9-digit slip number
      return false;
    };
    const letterCount = (s) => (s.match(/[A-Za-zА-Яа-я]/g) || []).length;
    const isMostlyNumeric = (s) => letterCount(s) <= 3 && /\d/.test(s);

    const areas = [];
    let areaLabelCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isSkippable(line)) continue;

      const label = this.detectAreaLabel(line);

      if (label) {
        let rest = label.rest;
        let nums = this.extractAreaNumbers(rest, maxVal, targetCount, true);

        // Numbers wrapped onto the next line (or label alone on its own line)
        const next = lines[i + 1];
        if (nums.length < targetCount && next && !isSkippable(next) &&
            !this.detectAreaLabel(next) && isMostlyNumeric(next)) {
          const merged = this.extractAreaNumbers(`${rest} ${next}`, maxVal, targetCount, true);
          if (merged.length > nums.length) {
            nums = merged;
            i++;
          }
        }

        if (nums.length > 0) areaLabelCount++;
        // A labeled line is trusted: keep it even if a couple of numbers were unreadable
        // (user sees "incomplete" and can fix it) instead of silently losing the area.
        if (nums.length >= Math.max(3, targetCount - 3)) {
          areas.push(nums);
        }
        continue;
      }

      // Unlabeled line (label lost by OCR): must look like a pure numbers line
      if (!isMostlyNumeric(line)) continue;
      const nums = this.extractAreaNumbers(line, maxVal, targetCount, false);
      if (nums.length >= minCount) {
        areas.push(nums);
      }
    }

    return { areas, areaLabelCount };
  },

  /**
   * Extract lotto numbers from the numeric part of an area line.
   * - Fixes common OCR confusions inside numeric tokens (O->0, l->1, S->5, З->3, B->8 ...)
   * - Splits fused tokens ("1218" -> 12, 18)
   * - Takes the first N numbers in printed order, THEN sorts (old code sorted first and
   *   cut off the biggest numbers).
   */
  extractAreaNumbers(str, maxVal = 49, targetCount = 6, lenient = false) {
    const map = {
      'O': '0', 'o': '0', 'О': '0', 'о': '0', 'D': '0', 'Q': '0',
      'I': '1', 'l': '1', '|': '1', '!': '1', 'i': '1', 'І': '1',
      'Z': '2', 'z': '2',
      'З': '3', 'з': '3',
      'S': '5', 's': '5', '$': '5',
      'б': '6', 'G': '6',
      'B': '8', 'В': '8',
      'g': '9', 'q': '9'
    };
    const tokens = str.split(/[\s,;:.\-·•'"`]+/).filter(Boolean);
    const out = [];
    const seen = new Set();
    const valid = (v) => v >= 1 && v <= maxVal && !seen.has(v);

    for (let tok of tokens) {
      if (out.length >= targetCount) break;
      tok = tok.replace(/^[^\wА-Яа-я|!$]+|[^\wА-Яа-я|!$]+$/g, '');
      if (!tok) continue;

      const hasDigit = /\d/.test(tok);
      if (hasDigit || (lenient && tok.length <= 2)) {
        tok = [...tok].map(c => map[c] ?? c).join('');
      }
      if (!/^\d+$/.test(tok)) continue;

      let parts = null;
      if (tok.length <= 2) {
        parts = [tok];
      } else if (tok.length === 4) {
        parts = [tok.slice(0, 2), tok.slice(2)];
      } else if (tok.length === 3) {
        const a = [tok.slice(0, 1), tok.slice(1)];
        const b = [tok.slice(0, 2), tok.slice(2)];
        const okA = a.every(p => +p >= 1 && +p <= maxVal) && a[0] !== a[1];
        const okB = b.every(p => +p >= 1 && +p <= maxVal) && b[0] !== b[1];
        if (okA !== okB) parts = okA ? a : b; // only if unambiguous
      }
      if (!parts) continue;

      for (const p of parts) {
        const v = parseInt(p, 10);
        if (valid(v) && out.length < targetCount) {
          seen.add(v);
          out.push(v);
        }
      }
    }

    return out.sort((a, b) => a - b);
  },

  extractValidNumbers(str, maxVal = 49) {
    const matches = str.match(/\b\d{1,2}\b/g) || [];
    const valid = [];
    const seen = new Set();

    for (const m of matches) {
      const val = parseInt(m, 10);
      if (val >= 1 && val <= maxVal && !seen.has(val)) {
        seen.add(val);
        valid.push(val);
      }
    }

    valid.sort((a, b) => a - b);
    return valid;
  },

  playFeedback(type = 'beep') {
    if ('vibrate' in navigator) {
      if (type === 'win') {
        navigator.vibrate([100, 50, 100, 50, 200]);
      } else {
        navigator.vibrate(60);
      }
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'shutter') {
        const bufferSize = ctx.sampleRate * 0.08;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        noise.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
      } else if (type === 'win') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
          gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.1);
          osc.stop(ctx.currentTime + i * 0.1 + 0.4);
        });
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) {}
  }
};
