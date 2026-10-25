/**
 * TOTO SCANNER PRO - LOCAL HISTORY MODULE
 * Saves and manages scanned slips in browser localStorage
 */

const TotoHistory = {
  STORAGE_KEY: 'toto_scanner_saved_slips',

  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  saveSlip(slip, results) {
    const list = this.getAll();
    const entry = {
      id: 'slip_' + Date.now(),
      timestamp: new Date().toISOString(),
      displayDate: new Date().toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      game: slip.game,
      drawNum: slip.drawNum,
      controlNumber: slip.controlNumber,
      areas: slip.areas,
      totalWinsCount: results?.totalWinsCount || 0,
      highestWinTier: results?.highestWinTier || null
    };

    list.unshift(entry);
    // Keep max 30 saved slips
    if (list.length > 30) list.pop();

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    return entry;
  },

  deleteSlip(id) {
    let list = this.getAll();
    list = list.filter(item => item.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    return list;
  },

  clearAll() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
};
