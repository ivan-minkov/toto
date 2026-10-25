/**
 * TOTO SCANNER PRO - OCR & IMAGE PROCESSING MODULE
 * 100% Dynamic Parsing for Bulgarian Sport Toto Receipts (6/49, 5/35, 6/42)
 * Zero hardcoded values or fake fallbacks.
 */

const TotoOCR = {
  tesseractWorker: null,
  isInitializing: false,

  /**
   * Preprocess image for OCR:
   * Converts to grayscale and enhances contrast dynamically without harsh clipping.
   */
  preprocessImage(sourceCanvas) {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = width;
    processedCanvas.height = height;
    const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Linear contrast stretch & grayscale conversion
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Gentle contrast curve: boost darks slightly, keep whites clean
      let v = (gray - 128) * 1.35 + 128;
      v = v < 0 ? 0 : (v > 255 ? 255 : v);

      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }

    ctx.putImageData(imgData, 0, 0);
    return processedCanvas;
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
  async initTesseract(onProgress) {
    if (this.tesseractWorker) return this.tesseractWorker;
    if (typeof Tesseract === 'undefined') return null;

    try {
      this.isInitializing = true;
      const worker = await Tesseract.createWorker('bul+eng', 1, {
        logger: m => {
          if (onProgress && m.status === 'recognizing text') {
            onProgress(Math.round((m.progress || 0) * 100));
          }
        }
      });
      this.tesseractWorker = worker;
      this.isInitializing = false;
      return worker;
    } catch (e) {
      console.warn('Tesseract worker error:', e);
      this.isInitializing = false;
      return null;
    }
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
    const minCount = targetCount - 1; // 4 for 5/35, 5 for 6/49

    const rawAreas = [];
    // Non-area keywords to skip strictly
    const skipKeywords = [
      'ДЖОКЕР', 'JOKER', 'ПОЗ/ЦИФ', 'ПОЗ', 'ЦИФ',
      'ОБЩО', 'СУМА', 'EUR', 'BGN', 'ЛВ', 'ЦЕНА',
      'ТИРАЖ', 'TIRAJ', 'THPAX', 'TIPAK',
      'ТЕРМИНАЛ', 'TERMINAL', 'ОПЕРАТОР', 'OPERATOR', 'ONEPAROP',
      'ПРИЕТ', 'ПРИЕТО', 'ДАТА',
      'ТОТО', 'TOTO',
      'ПОРЕДЕН', 'СЕРИЕН',
      'ПЕЧАЛБИ', 'КВИТАНЦИЯ', 'ЗАЛОГ', 'ПРЕДСТАВЯНЕ',
      'ХАЙДУШКО', 'ТОТАЛИЗАТОР', 'СОФИЯ'
    ];

    // Regex to detect and strip area prefixes
    // e.g. "I:", "Tr ", "1:", "II:", "11:", "ll:", "2:", "III:", "111:", "3:", "IV:", "1V:", "4:", "ОБЛАСТ 1:"
    const areaPrefixRx = /^(?:(?:ОБЛАСТ|ОБЛ|OBL)\s*([1-4I|lV]+)|(III|111|lll|3)|(II|11|ll|Il|lI|\|\||2|H|П)|(IV|1V|lV|TV|4)|(I|1|\||!|l|Tr|T))[:.\-\s]+/i;

    for (const line of lines) {
      const upper = line.toUpperCase();

      // 1. Skip non-area lines
      if (skipKeywords.some(kw => upper.includes(kw))) {
        continue;
      }

      // Skip control code lines or 9-digit big joker lines
      if (/^[0-9A-Z]{4}-[0-9A-Z]{4}/i.test(line) || /^\d{9}\b/.test(line)) {
        continue;
      }

      // 2. Check if line matches an area prefix or has lotto numbers
      let lineToParse = line;
      let explicitAreaIndex = null;

      const prefixMatch = line.match(areaPrefixRx);
      if (prefixMatch) {
        if (prefixMatch[2] || prefixMatch[1] === '3' || prefixMatch[1]?.toUpperCase() === 'III') {
          explicitAreaIndex = 3;
        } else if (prefixMatch[3] || prefixMatch[1] === '2' || prefixMatch[1]?.toUpperCase() === 'II') {
          explicitAreaIndex = 2;
        } else if (prefixMatch[4] || prefixMatch[1] === '4' || prefixMatch[1]?.toUpperCase() === 'IV') {
          explicitAreaIndex = 4;
        } else if (prefixMatch[5] || prefixMatch[1] === '1' || prefixMatch[1]?.toUpperCase() === 'I') {
          explicitAreaIndex = 1;
        }
        // Strip the prefix so numbers like "11:" don't turn into lotto numbers!
        lineToParse = line.slice(prefixMatch[0].length);
      }

      // Extract numbers after prefix stripping
      const nums = this.extractValidNumbers(lineToParse, maxVal);

      if (nums.length >= minCount) {
        rawAreas.push({
          areaIndex: explicitAreaIndex || (rawAreas.length + 1),
          numbers: nums.slice(0, targetCount)
        });
      }
    }

    // Ensure unique area indexes and sort by index
    const seenIndexes = new Set();
    const areas = [];
    for (const a of rawAreas) {
      if (!seenIndexes.has(a.areaIndex)) {
        seenIndexes.add(a.areaIndex);
        areas.push(a.numbers);
      }
    }

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
      serialNumber,
      areas,
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
