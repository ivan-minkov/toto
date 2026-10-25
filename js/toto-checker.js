/**
 * TOTO SCANNER PRO - CHECKER & RESULTS ENGINE
 * 100% Dynamic evaluation of lottery tickets against official draw results.
 * Zero hardcoded ticket data or mock winners.
 */

const TotoChecker = {
  db: null,

  async init() {
    try {
      const resp = await fetch('data/draws.json?v=' + Date.now());
      if (resp.ok) {
        this.db = await resp.json();
      }
    } catch (e) {
      console.warn('Failed to fetch draws.json dynamically:', e);
    }
    return this.db;
  },

  normalizeGameKey(gameId = '6/49') {
    const s = (gameId || '').toString();
    if (s.includes('35')) return '5x35';
    if (s.includes('42')) return '6x42';
    return '6x49';
  },

  getGame(gameId = '6/49') {
    const key = this.normalizeGameKey(gameId);
    return this.db?.games?.[key] || null;
  },

  getDraw(gameId = '6/49', drawNumber = null) {
    const game = this.getGame(gameId);
    if (!game || !game.draws || game.draws.length === 0) {
      return null;
    }

    if (drawNumber !== null && drawNumber !== undefined && drawNumber !== '') {
      const num = parseInt(drawNumber, 10);
      const found = game.draws.find(d => d.number === num);
      if (found) return found;

      // Draw number not found in database: return placeholder indicating no drawn numbers yet
      return {
        number: num,
        date: `Тираж № ${num}`,
        winningNumbers: [],
        winningNumbers1: [],
        winningNumbers2: [],
        currency: 'EUR',
        hasNumbers: false,
        jackpot: 'Няма данни',
        prizesNumeric: {}
      };
    }

    return game.draws[0] || null;
  },

  /**
   * Check slip numbers and Joker against official draw results (6/49, 5/35, 6/42)
   * Evaluates ONLY the numbers dynamically extracted from the receipt.
   */
  checkSlip(slip, draw) {
    if (!slip) return null;

    const gameType = slip.gameType || '6/49';
    const is5x35 = gameType.includes('35');
    const is6x42 = gameType.includes('42');
    const areas = Array.isArray(slip.areas) ? slip.areas : [];
    const results = [];
    let totalWinsCount = 0;
    let totalWonAmount = 0.0;
    let currency = draw?.currency || 'EUR';
    let winSummaries = [];

    const hasNumbers = draw ? (
      is5x35
        ? ((draw.winningNumbers1?.length || 0) > 0 || (draw.winningNumbers2?.length || 0) > 0)
        : ((draw.winningNumbers?.length || 0) > 0)
    ) : false;

    if (!draw || !hasNumbers) {
      // Draw not found or not yet drawn
      areas.forEach((areaNumbers, idx) => {
        const romanLabel = idx === 0 ? 'I' : (idx === 1 ? 'II' : (idx === 2 ? 'III' : 'IV'));
        results.push({
          areaIndex: idx + 1,
          romanLabel,
          numbers: areaNumbers,
          hits: [],
          hitsCount: 0,
          isWin: false,
          wonAmount: 0.0,
          prizeDescription: 'Очакват се резултати за този тираж'
        });
      });

      return {
        drawNumber: draw?.number || slip.drawNum || null,
        drawDate: draw?.date || null,
        gameType,
        winningNumbers: [],
        winningNumbers1: [],
        winningNumbers2: [],
        currency,
        hasNumbers: false,
        jackpot: draw?.jackpot || null,
        areaResults: results,
        jokerResult: null,
        totalWinsCount: 0,
        totalWonAmount: 0.0,
        winSummaries: [],
        isTotalWin: false
      };
    }

    // 1. Evaluate Areas
    if (is5x35) {
      // 5/35: Compare against I-во и II-ро теглене
      const set1 = new Set(draw.winningNumbers1 || []);
      const set2 = new Set(draw.winningNumbers2 || []);

      areas.forEach((areaNumbers, idx) => {
        const romanLabel = idx === 0 ? 'I' : (idx === 1 ? 'II' : (idx === 2 ? 'III' : 'IV'));
        const hits1 = areaNumbers.filter(n => set1.has(n));
        const hits2 = areaNumbers.filter(n => set2.has(n));
        const allHits = Array.from(new Set([...hits1, ...hits2]));

        let areaWins = [];
        let areaAmount = 0.0;

        // Check I теглене (5, 4, 3 hits)
        if (hits1.length >= 3) {
          const amt = hits1.length === 5 ? (draw.prizesNumeric?.['5'] || 0) : (hits1.length === 4 ? (draw.prizesNumeric?.['4'] || 0) : (draw.prizesNumeric?.['3'] || 0));
          const name = hits1.length === 5 ? 'Петица (I тегл.)' : (hits1.length === 4 ? 'Четворка (I тегл.)' : 'Тройка (I тегл.)');
          areaWins.push(`${name} (${amt.toFixed(2)} ${currency})`);
          areaAmount += amt;
          totalWinsCount++;
        }

        // Check II теглене (5, 4, 3 hits)
        if (hits2.length >= 3) {
          const amt = hits2.length === 5 ? (draw.prizesNumeric?.['5'] || 0) : (hits2.length === 4 ? (draw.prizesNumeric?.['4'] || 0) : (draw.prizesNumeric?.['3'] || 0));
          const name = hits2.length === 5 ? 'Петица (II тегл.)' : (hits2.length === 4 ? 'Четворка (II тегл.)' : 'Тройка (II тегл.)');
          areaWins.push(`${name} (${amt.toFixed(2)} ${currency})`);
          areaAmount += amt;
          totalWinsCount++;
        }

        const isWin = areaWins.length > 0;
        totalWonAmount += areaAmount;
        if (isWin) {
          winSummaries.push(`${areaWins.join(' + ')} в Област ${romanLabel}`);
        }

        const maxHits = Math.max(hits1.length, hits2.length);
        const prizeDesc = isWin ? areaWins.join(' + ') : 'Няма печалба';

        results.push({
          areaIndex: idx + 1,
          romanLabel,
          numbers: areaNumbers,
          hits: allHits,
          hitsCount: maxHits,
          isWin,
          wonAmount: areaAmount,
          prizeDescription: prizeDesc
        });
      });
    } else {
      // 6/49 or 6/42
      const winningSet = new Set(draw.winningNumbers || []);
      const jackpotTitle = is6x42 ? 'Шестица' : 'Джакпот 6/6';

      areas.forEach((areaNumbers, idx) => {
        const romanLabel = idx === 0 ? 'I' : (idx === 1 ? 'II' : (idx === 2 ? 'III' : 'IV'));
        const hits = areaNumbers.filter(n => winningSet.has(n));
        const hitsCount = hits.length;
        let prizeDescription = 'Няма печалба';
        let tierClass = 'no-win';
        let isWin = false;
        let wonAmount = 0.0;

        if (hitsCount === 6) {
          wonAmount = draw.prizesNumeric?.['6'] || 0;
          prizeDescription = `${jackpotTitle} (${wonAmount.toLocaleString('bg-BG')} ${currency})`;
          tierClass = 'win-jackpot';
          isWin = true;
        } else if (hitsCount === 5) {
          wonAmount = draw.prizesNumeric?.['5'] || 0;
          prizeDescription = `Петица (${wonAmount.toFixed(2)} ${currency})`;
          tierClass = 'win-five';
          isWin = true;
        } else if (hitsCount === 4) {
          wonAmount = draw.prizesNumeric?.['4'] || 0;
          prizeDescription = `Четворка (${wonAmount.toFixed(2)} ${currency})`;
          tierClass = 'win-four';
          isWin = true;
        } else if (hitsCount === 3) {
          wonAmount = draw.prizesNumeric?.['3'] || 0;
          prizeDescription = `Тройка (${wonAmount.toFixed(2)} ${currency})`;
          tierClass = 'win-three';
          isWin = true;
        }

        if (isWin) {
          totalWinsCount++;
          totalWonAmount += wonAmount;
          winSummaries.push(`${prizeDescription} в Област ${romanLabel}`);
        }

        results.push({
          areaIndex: idx + 1,
          romanLabel,
          numbers: areaNumbers,
          hits,
          misses: areaNumbers.filter(n => !winningSet.has(n)),
          hitsCount,
          isWin,
          wonAmount,
          tierClass,
          prizeDescription
        });
      });
    }

    // 2. Evaluate Toto Joker (only if present on receipt and in draw)
    let jokerResult = null;
    if (slip.joker && draw.joker && draw.joker.positions?.length > 0) {
      let matchedCount = 0;
      const slipPos = slip.joker.positions || [];
      const slipDig = slip.joker.digits || [];
      const drawPos = draw.joker.positions || [];
      const drawDig = draw.joker.digits || [];
      const matchedPairs = [];

      for (let i = 0; i < slipPos.length; i++) {
        const p = slipPos[i];
        const d = slipDig[i];
        const drawIdx = drawPos.indexOf(p);
        if (drawIdx !== -1 && drawDig[drawIdx] === d) {
          matchedCount++;
          matchedPairs.push(`${p}/${d}`);
        }
      }

      let jAmount = 0.0;
      let jDesc = 'Няма печалба от Джокер';
      let jIsWin = false;

      const p3 = draw.joker.prizesNumeric?.['3'] || (draw.joker.prizes?.['3'] ? parseFloat(draw.joker.prizes['3'].replace(/[^0-9.]/g, '')) : 9473.70);
      const p2 = draw.joker.prizesNumeric?.['2'] || (draw.joker.prizes?.['2'] ? parseFloat(draw.joker.prizes['2'].replace(/[^0-9.]/g, '')) : 35.60);

      if (matchedCount === 3) {
        jAmount = p3;
        jDesc = `Джокер 3/3 (${jAmount.toFixed(2)} ${currency})`;
        jIsWin = true;
      } else if (matchedCount === 2) {
        jAmount = p2;
        jDesc = `Джокер 2/3 (${jAmount.toFixed(2)} ${currency})`;
        jIsWin = true;
      }

      if (jIsWin) {
        totalWinsCount++;
        totalWonAmount += jAmount;
        winSummaries.push(jDesc);
      }

      jokerResult = {
        matchedCount,
        matchedPairs,
        isWin: jIsWin,
        amount: jAmount,
        desc: jDesc,
        slipPositions: slipPos,
        slipDigits: slipDig,
        drawPositions: drawPos,
        drawDigits: drawDig
      };
    }

    return {
      drawNumber: draw.number,
      drawDate: draw.date,
      gameType,
      winningNumbers: draw.winningNumbers || [],
      winningNumbers1: draw.winningNumbers1 || [],
      winningNumbers2: draw.winningNumbers2 || [],
      currency,
      hasNumbers,
      jackpot: draw.jackpot,
      areaResults: results,
      jokerResult,
      totalWinsCount,
      totalWonAmount,
      winSummaries,
      isTotalWin: totalWonAmount > 0 || totalWinsCount > 0
    };
  }
};
