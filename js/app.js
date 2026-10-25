/**
 * TOTO SCANNER PRO - MAIN APPLICATION CONTROLLER
 * 100% Dynamic data flow - Zero hardcoded values or fake fallbacks.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Database dynamically
  await TotoChecker.init();

  // Pre-warm the OCR engine in the background (downloads ~10MB language data once)
  // so the first scan doesn't wait for it.
  TotoOCR.initTesseract();

  let currentSlip = null;

  // Header & Views
  const appHeader = document.getElementById('app-header');
  const viewScanner = document.getElementById('view-scanner');
  const viewResult = document.getElementById('view-result');
  const headerScanBtn = document.getElementById('header-scan-btn');
  const logoHomeBtn = document.getElementById('logo-home-btn');

  // Camera Controls
  const captureBtn = document.getElementById('capture-btn');
  const fileInput = document.getElementById('file-upload-input');
  const uploadBtn = document.getElementById('upload-btn');
  const torchBtn = document.getElementById('torch-btn');
  const switchCamBtn = document.getElementById('switch-cam-btn');

  // Processing Overlay
  const processingOverlay = document.getElementById('processing-overlay');
  const processingStep = document.getElementById('processing-step');

  // Result Banner
  const statusBanner = document.getElementById('status-banner');
  const statusIcon = document.getElementById('status-icon');
  const statusTitle = document.getElementById('status-title');
  const statusDetail = document.getElementById('status-detail');
  const unreadableAlertBanner = document.getElementById('unreadable-alert-banner');

  // Receipt Fields
  const resDrawDisplay = document.getElementById('res-draw-display');
  const changeDrawBtn = document.getElementById('change-draw-btn');
  const resAcceptedAt = document.getElementById('res-accepted-at');
  const resGameType = document.getElementById('res-game-type');
  const changeGameBtn = document.getElementById('change-game-btn');
  const resSerialNum = document.getElementById('res-serial-num');
  const resSubCode = document.getElementById('res-sub-code');
  const resTotalPrice = document.getElementById('res-total-price');
  const resJokerDisplay = document.getElementById('res-joker-display');
  const resControlNum = document.getElementById('res-control-num');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const verifyTotoBtn = document.getElementById('verify-toto-btn');

  // Areas & Reference
  const resAreasContainer = document.getElementById('res-areas-container');
  const addNewAreaBtn = document.getElementById('add-new-area-btn');
  const resOfficialBalls = document.getElementById('res-official-balls');
  const resOfficialLabel = document.getElementById('res-official-label');
  const changeDrawNumbersBtn = document.getElementById('change-draw-numbers-btn');
  const scanAgainBtn = document.getElementById('scan-again-btn');

  const toastNotice = document.getElementById('toast-notice');
  const toastMessage = document.getElementById('toast-message');

  const nativeCameraInput = document.getElementById('native-camera-input');
  const openNativeCamBtn = document.getElementById('open-native-cam-btn');
  const cameraFallbackCard = document.getElementById('camera-fallback-card');
  const viewfinderGuide = document.querySelector('.viewfinder-guide');

  function updateCameraUI(isLive) {
    if (cameraFallbackCard) {
      cameraFallbackCard.style.display = isLive ? 'none' : 'block';
    }
    if (viewfinderGuide) {
      viewfinderGuide.style.display = isLive ? 'block' : 'none';
    }
  }

  // Start Camera on load
  const initialCameraLive = await TotoScanner.init('camera-stream');
  updateCameraUI(initialCameraLive);

  // Navigation Switchers
  async function showScannerView() {
    document.body.classList.add('camera-mode');
    appHeader.style.display = 'none';
    viewResult.classList.remove('active');
    viewScanner.classList.add('active');
    const isLive = await TotoScanner.startCamera();
    updateCameraUI(isLive);
  }

  function showResultView() {
    document.body.classList.remove('camera-mode');
    appHeader.style.display = 'block';
    viewScanner.classList.remove('active');
    viewResult.classList.add('active');
    TotoScanner.stopCamera();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  headerScanBtn.addEventListener('click', showScannerView);
  logoHomeBtn.addEventListener('click', showScannerView);
  scanAgainBtn.addEventListener('click', showScannerView);

  // Change Draw Button
  changeDrawBtn.addEventListener('click', () => {
    editDrawNumber();
  });

  function editDrawNumber() {
    if (!currentSlip) return;
    const current = currentSlip.drawNum || '';
    const input = prompt(`Въведете номер на тиража:`, current);
    if (input !== null) {
      const parsed = parseInt(input.trim(), 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 104) {
        currentSlip.drawNum = parsed;
        currentSlip.drawDisplay = currentSlip.drawYear ? `${parsed}/${currentSlip.drawYear}` : `${parsed}`;
        displaySlipResults(currentSlip);
        showToast(`Тиражът бе променен на № ${parsed}`);
      } else {
        alert('Моля, въведете валиден номер на тираж (от 1 до 104).');
      }
    }
  }

  // Change Game Button
  if (changeGameBtn) {
    changeGameBtn.addEventListener('click', () => {
      editGameType();
    });
  }

  function editGameType() {
    if (!currentSlip) return;
    const current = currentSlip.gameType || '6/49';
    const choice = prompt(
      `Изберете тип тото игра:\n1. 6/49 (Тото 2 - 6 от 49)\n2. 5/35 (Тото 2 - 5 от 35)\n3. 6/42 (Тото 2 - 6 от 42)\nТекуща: ${current}`,
      current
    );
    if (choice) {
      const clean = choice.trim();
      let newType = '6/49';
      if (clean === '2' || clean.includes('35')) {
        newType = '5/35';
      } else if (clean === '3' || clean.includes('42')) {
        newType = '6/42';
      } else if (clean === '1' || clean.includes('49')) {
        newType = '6/49';
      }
      currentSlip.gameType = newType;
      displaySlipResults(currentSlip);
      showToast(`Играта бе зададена на: TOTO2 ${newType}`);
    }
  }

  // Add Area Button
  if (addNewAreaBtn) {
    addNewAreaBtn.addEventListener('click', () => {
      if (!currentSlip) return;
      const gameType = currentSlip.gameType || '6/49';
      const maxVal = gameType.includes('35') ? 35 : (gameType.includes('42') ? 42 : 49);
      const targetCount = gameType.includes('35') ? 5 : 6;
      const nextIndex = (currentSlip.areas?.length || 0) + 1;
      const romanLabel = nextIndex === 1 ? 'I' : (nextIndex === 2 ? 'II' : (nextIndex === 3 ? 'III' : 'IV'));
      
      const inp = prompt(`Въведете ${targetCount} числа за Област ${romanLabel} (разделени със запетая или интервал):`);
      if (inp) {
        const nums = TotoOCR.extractValidNumbers(inp, maxVal);
        if (nums.length > 0) {
          if (!currentSlip.areas) currentSlip.areas = [];
          currentSlip.areas.push(nums.slice(0, targetCount));
          displaySlipResults(currentSlip);
          showToast(`Добавена е Област ${romanLabel}!`);
        } else {
          alert(`Моля, въведете валидни числа от 1 до ${maxVal}.`);
        }
      }
    });
  }

  // Change / Edit Official Drawn Numbers
  if (changeDrawNumbersBtn) {
    changeDrawNumbersBtn.addEventListener('click', () => {
      editOfficialDrawnNumbers();
    });
  }

  function editOfficialDrawnNumbers() {
    if (!currentSlip) return;
    const gameKey = TotoChecker.normalizeGameKey(currentSlip.gameType || '6/49');
    let draw = currentSlip.drawNum ? TotoChecker.getDraw(gameKey, currentSlip.drawNum) : null;
    const maxVal = gameKey === '5x35' ? 35 : (gameKey === '6x42' ? 42 : 49);

    if (!draw) {
      draw = {
        number: currentSlip.drawNum || 1,
        date: `Тираж № ${currentSlip.drawNum || 1}`,
        winningNumbers: [],
        winningNumbers1: [],
        winningNumbers2: [],
        currency: 'EUR',
        hasNumbers: true,
        jackpot: 'Няма данни',
        prizesNumeric: {}
      };
    }

    if (gameKey === '5x35') {
      const cur1 = (draw.winningNumbers1 || []).join(', ');
      const cur2 = (draw.winningNumbers2 || []).join(', ');
      const inp1 = prompt('Въведете числа за I теглене (пр. 4, 11, 18, 23, 31):', cur1);
      if (inp1 !== null) {
        const nums1 = TotoOCR.extractValidNumbers(inp1, maxVal);
        const inp2 = prompt('Въведете числа за II теглене (пр. 7, 14, 20, 28, 35):', cur2);
        if (inp2 !== null) {
          const nums2 = TotoOCR.extractValidNumbers(inp2, maxVal);
          draw.winningNumbers1 = nums1;
          draw.winningNumbers2 = nums2;
          draw.hasNumbers = (nums1.length > 0 || nums2.length > 0);
          TotoChecker.saveCustomDraw(gameKey, draw);
          displaySlipResults(currentSlip);
          showToast('Изтеглените числа за 5/35 бяха запазени!');
        }
      }
    } else {
      const cur = (draw.winningNumbers || []).join(', ');
      const inp = prompt(`Въведете официално изтеглените числа за тиража (пр. 9, 16, 18, 22, 30, 37):`, cur);
      if (inp !== null) {
        const nums = TotoOCR.extractValidNumbers(inp, maxVal);
        draw.winningNumbers = nums;
        draw.hasNumbers = nums.length > 0;
        TotoChecker.saveCustomDraw(gameKey, draw);
        displaySlipResults(currentSlip);
        showToast('Официално изтеглените числа бяха запазени!');
      }
    }
  }

  function editAreaNumbers(areaIndex) {
    if (!currentSlip || !currentSlip.areas || !currentSlip.areas[areaIndex]) return;
    const gameType = currentSlip.gameType || '6/49';
    const maxVal = gameType.includes('35') ? 35 : (gameType.includes('42') ? 42 : 49);
    const targetCount = gameType.includes('35') ? 5 : 6;
    const romanLabel = areaIndex === 0 ? 'I' : (areaIndex === 1 ? 'II' : (areaIndex === 2 ? 'III' : 'IV'));
    const curNums = currentSlip.areas[areaIndex].join(', ');

    const inp = prompt(`Редактирайте числата за Област ${romanLabel} (разделени със запетая):`, curNums);
    if (inp !== null) {
      const parsed = TotoOCR.extractValidNumbers(inp, maxVal);
      if (parsed.length > 0) {
        currentSlip.areas[areaIndex] = parsed.slice(0, targetCount);
        displaySlipResults(currentSlip);
        showToast(`Числата за Област ${romanLabel} бяха обновени!`);
      } else {
        alert(`Моля, въведете валидни числа от 1 до ${maxVal}.`);
      }
    }
  }

  function deleteArea(areaIndex) {
    if (!currentSlip || !currentSlip.areas || !currentSlip.areas[areaIndex]) return;
    const romanLabel = areaIndex === 0 ? 'I' : (areaIndex === 1 ? 'II' : (areaIndex === 2 ? 'III' : 'IV'));
    if (confirm(`Сигурни ли сте, че искате да премахнете Област ${romanLabel}?`)) {
      currentSlip.areas.splice(areaIndex, 1);
      displaySlipResults(currentSlip);
      showToast(`Област ${romanLabel} бе премахната.`);
    }
  }

  // Copy Control Number
  copyCodeBtn.addEventListener('click', () => {
    const code = resControlNum.textContent.trim();
    if (!code || code.includes('Не се чете')) {
      showToast('Контролният номер не е наличен.');
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        showToast('Контролният номер е копиран!');
      });
    } else {
      showToast('Контролен номер: ' + code);
    }
  });

  // Verify in toto.bg Button
  if (verifyTotoBtn) {
    verifyTotoBtn.addEventListener('click', () => {
      const code = resControlNum.textContent.trim();
      const hasCode = code && !code.includes('Не се чете');
      if (hasCode) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(code).catch(() => {});
        }
        showToast('Кодът е копиран! Отваряне на toto.bg...');
      } else {
        showToast('Отваряне на страницата за проверка в toto.bg...');
      }
      setTimeout(() => {
        window.open('https://toto.bg/?lang=1&pid=kvitanciaproverka', '_blank', 'noopener,noreferrer');
      }, 350);
    });
  }

  // Toast Helper
  function showToast(msg) {
    toastMessage.textContent = msg;
    toastNotice.classList.add('show');
    setTimeout(() => toastNotice.classList.remove('show'), 2600);
  }

  // Camera Controls
  torchBtn.addEventListener('click', async () => {
    const isOn = await TotoScanner.toggleTorch();
    torchBtn.classList.toggle('active', isOn);
    showToast(isOn ? 'Фенерче: ВКЛ.' : 'Фенерче: ИЗКЛ.');
  });

  switchCamBtn.addEventListener('click', async () => {
    await TotoScanner.switchCamera();
  });

  // Native Camera Button
  if (openNativeCamBtn) {
    openNativeCamBtn.addEventListener('click', () => {
      nativeCameraInput.click();
    });
  }

  // Capture Button (Shutter)
  captureBtn.addEventListener('click', async () => {
    // 1. If in test query mode (?test=1), use sample
    if (window.location.search.includes('test=1')) {
      showProcessing(true, 'Зареждане на снимката за тест...');
      try {
        const canvas = await TotoScanner.loadImageFromUrl('assets/user_receipt.jpg');
        await processSlipImage(canvas);
      } catch (e) {
        console.warn('Could not load test image:', e);
      }
      return;
    }

    // 2. If live WebRTC camera is streaming, capture a full-resolution still (falls back to video frame)
    if (TotoScanner.isLiveActive) {
      const canvas = await TotoScanner.capturePhoto();
      if (canvas) {
        await processSlipImage(canvas);
        return;
      }
    }

    // 3. On mobile over HTTP (or when live stream is blocked): open native camera app
    nativeCameraInput.click();
  });

  // Handle image taken from Native Mobile Camera
  nativeCameraInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      showProcessing(true, 'Зареждане на заснетата снимка...');
      try {
        const canvas = await TotoScanner.loadImageFromFile(file);
        await processSlipImage(canvas);
      } catch (err) {
        showProcessing(false);
        alert('Грешка при зареждане на снимката: ' + err.message);
      }
    }
  });

  window.testWithUserPhoto = async function() {
    showProcessing(true, 'Зареждане на снимката...');
    const canvas = await TotoScanner.loadImageFromUrl('assets/user_receipt.jpg');
    await processSlipImage(canvas);
  };

  // Upload Photo from Gallery
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      showProcessing(true, 'Зареждане на снимка...');
      try {
        const canvas = await TotoScanner.loadImageFromFile(file);
        await processSlipImage(canvas);
      } catch (err) {
        showProcessing(false);
        alert('Грешка при четене на файл: ' + err.message);
      }
    }
  });

  // Core Image Processing Pipeline - 100% Dynamic (multi-pass OCR)
  async function processSlipImage(rawCanvas) {
    TotoOCR.playFeedback('shutter');
    showProcessing(true, 'Обработка на снимката...');

    let slipData;
    if (typeof Tesseract !== 'undefined') {
      try {
        slipData = await TotoOCR.scanSlip(rawCanvas, (msg) => {
          processingStep.textContent = msg;
        });
      } catch (e) {
        console.warn('OCR error during dynamic scan:', e);
      }
    }
    if (!slipData) {
      slipData = TotoOCR.parseReceiptText('');
      const barcode = await TotoOCR.scanBarcode(rawCanvas);
      if (barcode) slipData.controlNumber = barcode;
    }

    window.lastOcrText = slipData.rawText || '';

    showProcessing(false);
    displaySlipResults(slipData);
  }

  function showProcessing(show, text = '') {
    processingOverlay.classList.toggle('active', show);
    if (text) processingStep.textContent = text;
  }

  /**
   * Helper to render a field value OR an exclamation mark warning badge if unreadable
   */
  function renderFieldWithWarning(element, value, fieldName, onManualSet) {
    element.innerHTML = '';
    if (value !== null && value !== undefined && value.toString().trim() !== '') {
      element.textContent = value;
      return false; // readable
    } else {
      const badge = document.createElement('span');
      badge.className = 'unreadable-badge';
      badge.innerHTML = `⚠️ <span>Не се чете</span>`;
      badge.title = `Полето "${fieldName}" не се чете. Кликнете за ръчно въвеждане.`;
      badge.addEventListener('click', () => {
        const input = prompt(`Въведете ${fieldName} от квитанцията:`);
        if (input !== null && input.trim() !== '') {
          onManualSet(input.trim());
          displaySlipResults(currentSlip);
          showToast(`${fieldName} бе въведено успешно!`);
        }
      });
      element.appendChild(badge);
      return true; // unreadable
    }
  }

  // DISPLAY ALL FIELDS & WIN/LOSS CALCULATION (100% DYNAMIC)
  function displaySlipResults(slip) {
    currentSlip = slip;

    // Look up draw results dynamically according to the extracted game type and draw number
    const gameKey = TotoChecker.normalizeGameKey(slip.gameType || '6/49');
    const draw = slip.drawNum ? TotoChecker.getDraw(gameKey, slip.drawNum) : null;
    const report = TotoChecker.checkSlip(slip, draw);

    let hasAnyUnreadable = false;

    // 1. Поле: ТИРАЖ
    if (slip.drawDisplay || slip.drawNum) {
      resDrawDisplay.textContent = slip.drawDisplay || `${slip.drawNum}`;
    } else {
      hasAnyUnreadable = true;
      resDrawDisplay.innerHTML = `<span class="unreadable-badge" title="Кликнете за въвеждане на тиража">⚠️ <span>Не се чете</span></span>`;
      resDrawDisplay.querySelector('.unreadable-badge').addEventListener('click', editDrawNumber);
    }

    // 2. Поле: ПРИЕТ
    if (renderFieldWithWarning(resAcceptedAt, slip.acceptedAt, 'дата и час на приемане (пр. 09.09.2026 18:45)', (val) => {
      currentSlip.acceptedAt = val;
    })) {
      hasAnyUnreadable = true;
    }

    // 3. Поле: ТИП ТОТО
    if (renderFieldWithWarning(resGameType, slip.gameType ? `TOTO2 ${slip.gameType}` : null, 'тип тото (пр. 6/49, 5/35, 6/42)', (val) => {
      currentSlip.gameType = val.replace(/[^0-9/]/g, '') || '6/49';
    })) {
      hasAnyUnreadable = true;
    }

    // 4. Поле: ПОРЕДЕН #
    if (renderFieldWithWarning(resSerialNum, slip.serialNumber, 'пореден номер (пр. 0000000110)', (val) => {
      currentSlip.serialNumber = val;
    })) {
      hasAnyUnreadable = true;
    }

    // 6. Поле: НОМЕР НА ФИША (9 цифри)
    const jCode = slip.jokerCode || slip.subCode || null;
    if (renderFieldWithWarning(resSubCode, jCode, 'номер на фиша (9 цифри)', (val) => {
      currentSlip.jokerCode = val;
      currentSlip.subCode = val;
    })) {
      hasAnyUnreadable = true;
    }

    // 8. Поле: ОБЩО (Сума)
    if (renderFieldWithWarning(resTotalPrice, slip.totalPrice, 'обща сума на фиша (пр. 2.00 EUR)', (val) => {
      currentSlip.totalPrice = val;
    })) {
      hasAnyUnreadable = true;
    }

    // 7. Поле: ТОТО ДЖОКЕР (поз/циф)
    const jokerDisplayStr = slip.joker?.display || 
      (slip.joker?.pairs ? slip.joker.pairs.join(', ') : 
      (slip.joker?.positions ? slip.joker.positions.map((p, i) => `${p}/${slip.joker.digits?.[i] || ''}`).join(', ') : null));

    if (jokerDisplayStr) {
      let badgeHtml = '';
      if (report?.jokerResult) {
        const jr = report.jokerResult;
        badgeHtml = jr.isWin
          ? `<span class="area-badge is-win" style="margin-left:6px;">🎯 ${jr.matchedCount}/3 познати (+${jr.amount.toFixed(2)} ${draw?.currency || 'EUR'})</span>`
          : `<span class="area-badge no-win" style="margin-left:6px;">${jr.matchedCount}/3 познати</span>`;
      }
      resJokerDisplay.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; flex-wrap:wrap; gap:6px;">
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            <span style="font-weight:800; color:#fff; font-size:1.02rem; letter-spacing:0.8px;">${jokerDisplayStr}</span>
            ${badgeHtml}
          </div>
          <button class="edit-pill-btn" id="edit-joker-btn" title="Редактирай Джокер">✏️</button>
        </div>
      `;
      resJokerDisplay.querySelector('#edit-joker-btn')?.addEventListener('click', () => {
        const inp = prompt('Въведете Джокер позиции/цифри (пр. 1/8, 4/8, 6/8):', jokerDisplayStr);
        if (inp !== null && inp.trim() !== '') {
          const slashPairs = inp.match(/\b([1-9])\s*[\/]\s*([0-9])\b/g);
          if (slashPairs && slashPairs.length > 0) {
            const positions = [];
            const digits = [];
            const parsedPairs = [];
            slashPairs.forEach(p => {
              const parts = p.split('/');
              positions.push(parseInt(parts[0].trim(), 10));
              digits.push(parseInt(parts[1].trim(), 10));
              parsedPairs.push(`${parts[0].trim()}/${parts[1].trim()}`);
            });
            currentSlip.joker = {
              pairs: parsedPairs,
              positions,
              digits,
              display: parsedPairs.join(', ')
            };
          } else {
            currentSlip.joker = { display: inp.trim(), pairs: [], positions: [], digits: [] };
          }
          displaySlipResults(currentSlip);
          showToast('Джокерът бе обновен!');
        }
      });
    } else {
      hasAnyUnreadable = true;
      resJokerDisplay.innerHTML = `<span class="unreadable-badge" title="Кликнете за въвеждане на Джокер">⚠️ <span>Не се чете</span></span>`;
      resJokerDisplay.querySelector('.unreadable-badge').addEventListener('click', () => {
        const inp = prompt('Въведете Джокер позиции/цифри (пр. 1/8, 4/8, 6/8):');
        if (inp !== null && inp.trim() !== '') {
          const slashPairs = inp.match(/\b([1-9])\s*[\/]\s*([0-9])\b/g);
          if (slashPairs && slashPairs.length > 0) {
            const positions = [];
            const digits = [];
            const parsedPairs = [];
            slashPairs.forEach(p => {
              const parts = p.split('/');
              positions.push(parseInt(parts[0].trim(), 10));
              digits.push(parseInt(parts[1].trim(), 10));
              parsedPairs.push(`${parts[0].trim()}/${parts[1].trim()}`);
            });
            currentSlip.joker = {
              pairs: parsedPairs,
              positions,
              digits,
              display: parsedPairs.join(', ')
            };
          } else {
            currentSlip.joker = { display: inp.trim(), pairs: [], positions: [], digits: [] };
          }
          displaySlipResults(currentSlip);
        }
      });
    }

    // 9. Поле: КОНТРОЛЕН НОМЕР
    if (renderFieldWithWarning(resControlNum, slip.controlNumber, 'контролен номер (24 символа)', (val) => {
      currentSlip.controlNumber = val;
    })) {
      hasAnyUnreadable = true;
    }

    // Show/Hide top alert banner if any field has ⚠️
    unreadableAlertBanner.style.display = hasAnyUnreadable ? 'flex' : 'none';

    // Set Big Status Banner dynamically
    if (!slip.drawNum) {
      statusBanner.className = 'status-banner no-win';
      statusIcon.textContent = 'ℹ️';
      statusTitle.textContent = 'НЕ Е РАЗПОЗНАТ ТИРАЖ';
      statusDetail.textContent = 'Моля, кликнете върху полето "Тираж", за да въведете номера му и да проверим фиша.';
    } else if (!draw || !report || !report.hasNumbers) {
      statusBanner.className = 'status-banner no-win';
      statusIcon.textContent = '⏳';
      statusTitle.textContent = `ТИРАЖ № ${slip.drawNum} (ОЧАКВА СЕ)`;

      if (!slip._isFetchingDraw) {
        slip._isFetchingDraw = true;
        statusDetail.textContent = `Сваляне на резултатите за Тираж № ${slip.drawNum} от интернет...`;
        
        TotoChecker.fetchDrawOnline(gameKey, slip.drawNum, slip.drawYear).then(newDraw => {
          slip._isFetchingDraw = false;
          if (newDraw && newDraw.hasNumbers) {
            showToast(`Резултатите за Тираж № ${slip.drawNum} бяха изтеглени успешно!`);
            displaySlipResults(slip);
          } else {
            statusDetail.innerHTML = `
              <span>Резултатите за този тираж още не са налични онлайн.</span>
              <div style="margin-top:8px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                <button class="edit-pill-btn" id="retry-fetch-btn" style="padding:4px 10px;">🔄 Свали отново</button>
                <button class="edit-pill-btn" id="manual-numbers-btn" style="padding:4px 10px;">✏️ Въведи числа</button>
              </div>
            `;
            document.getElementById('retry-fetch-btn')?.addEventListener('click', () => {
              slip._isFetchingDraw = false;
              fetchMissingDrawNow(slip);
            });
            document.getElementById('manual-numbers-btn')?.addEventListener('click', () => {
              editOfficialDrawnNumbers();
            });
          }
        }).catch(() => {
          slip._isFetchingDraw = false;
        });
      }
    } else if (report.isTotalWin) {
      TotoOCR.playFeedback('win');
      statusBanner.className = 'status-banner is-win';
      statusIcon.textContent = '🎉';
      statusTitle.textContent = `ФИШЪТ ПЕЧЕЛИ: ${report.totalWonAmount.toFixed(2)} ${draw.currency || 'EUR'}!`;
      statusDetail.textContent = report.winSummaries.join(', ');
    } else {
      TotoOCR.playFeedback('beep');
      statusBanner.className = 'status-banner no-win';
      statusIcon.textContent = '❌';
      statusTitle.textContent = `НЯМА ПЕЧАЛБА (0.00 ${draw.currency || 'EUR'})`;
      statusDetail.textContent = 'Няма печеливши съвпадения за този фиш в тиража.';
    }

    // Render Areas & Numbers
    resAreasContainer.innerHTML = '';
    const areaList = report?.areaResults || [];

    if (areaList.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'padding: 14px; background: rgba(239, 68, 68, 0.12); border: 1px dashed #ef4444; border-radius: 12px; margin-bottom: 12px; font-size: 0.9rem; text-align: center; color: #fca5a5;';
      emptyDiv.innerHTML = `⚠️ Числата по области не се четат.<br><button class="edit-pill-btn" style="margin-top:8px;" id="add-manual-area-btn">➕ Въведи числа</button>`;
      emptyDiv.querySelector('#add-manual-area-btn').addEventListener('click', () => {
        const inp = prompt('Въведете числата, разделени със запетая (пр. 9, 12, 18, 21, 22, 32):');
        if (inp) {
          const parsed = TotoOCR.extractValidNumbers(inp, 49);
          if (parsed.length > 0) {
            currentSlip.areas = [parsed];
            displaySlipResults(currentSlip);
          }
        }
      });
      resAreasContainer.appendChild(emptyDiv);
    } else {
      areaList.forEach((area, aIdx) => {
        const areaRow = document.createElement('div');
        areaRow.className = `area-row ${area.isWin ? 'win-area' : ''}`;

        const header = document.createElement('div');
        header.className = 'area-row-header';

        const leftGroup = document.createElement('div');
        leftGroup.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';

        const label = document.createElement('span');
        label.className = 'area-label';
        const roman = area.romanLabel || (aIdx === 0 ? 'I' : (aIdx === 1 ? 'II' : (aIdx === 2 ? 'III' : 'IV')));
        label.textContent = `Област ${roman}`;

        const badge = document.createElement('span');
        badge.className = `area-badge ${area.isWin ? 'is-win' : 'no-win'}`;
        badge.textContent = area.isWin 
          ? `🎯 ${area.hitsCount} познати (${area.prizeDescription})`
          : `${area.hitsCount} познати`;

        leftGroup.appendChild(label);
        leftGroup.appendChild(badge);

        const actionsGroup = document.createElement('div');
        actionsGroup.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-pill-btn';
        editBtn.textContent = '✏️ Редактирай';
        editBtn.title = `Редактирай числата за Област ${roman}`;
        editBtn.addEventListener('click', () => editAreaNumbers(aIdx));

        const delBtn = document.createElement('button');
        delBtn.className = 'edit-pill-btn';
        delBtn.style.cssText = 'background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.35); color: #f87171; padding: 2px 7px;';
        delBtn.textContent = '🗑️';
        delBtn.title = `Изтрий Област ${roman}`;
        delBtn.addEventListener('click', () => deleteArea(aIdx));

        actionsGroup.appendChild(editBtn);
        actionsGroup.appendChild(delBtn);

        header.appendChild(leftGroup);
        header.appendChild(actionsGroup);
        areaRow.appendChild(header);

        const ballsRow = document.createElement('div');
        ballsRow.className = 'balls-row';

        area.numbers.forEach(num => {
          const isHit = (area.hits || []).includes(num);
          const ball = document.createElement('div');
          ball.className = `lotto-ball ${isHit ? 'hit' : 'normal'}`;
          ball.textContent = num < 10 ? `0${num}` : num;
          ballsRow.appendChild(ball);
        });

        areaRow.appendChild(ballsRow);
        resAreasContainer.appendChild(areaRow);
      });
    }

    // Render Official Drawn Numbers dynamically
    resOfficialBalls.innerHTML = '';
    const gameName = gameKey === '5x35' ? 'Тото 2 - 5 от 35' : (gameKey === '6x42' ? 'Тото 2 - 6 от 42' : 'Тото 2 - 6 от 49');

    if (!draw || !report?.hasNumbers) {
      resOfficialLabel.textContent = `Официално изтеглени числа за ${gameName}:`;
      resOfficialBalls.innerHTML = `<span style="font-size:0.85rem; color:#94a3b8; font-style:italic;">Все още няма публикувани резултати за този тираж.</span>`;
    } else if (gameKey === '5x35') {
      resOfficialLabel.textContent = `Официално изтеглени числа за ${gameName}, Тираж № ${draw.number} (${draw.date} г.):`;

      const div1 = document.createElement('div');
      div1.style.cssText = 'width: 100%; font-size: 0.82rem; color: #94a3b8; font-weight: 600; margin-bottom: 4px;';
      div1.textContent = 'I теглене:';
      resOfficialBalls.appendChild(div1);

      const row1 = document.createElement('div');
      row1.className = 'mini-balls-row';
      row1.style.marginBottom = '8px';
      (draw.winningNumbers1 || []).forEach(n => {
        const b = document.createElement('div');
        b.className = 'mini-ball';
        b.textContent = n < 10 ? `0${n}` : n;
        row1.appendChild(b);
      });
      resOfficialBalls.appendChild(row1);

      const div2 = document.createElement('div');
      div2.style.cssText = 'width: 100%; font-size: 0.82rem; color: #94a3b8; font-weight: 600; margin-bottom: 4px;';
      div2.textContent = 'II теглене:';
      resOfficialBalls.appendChild(div2);

      const row2 = document.createElement('div');
      row2.className = 'mini-balls-row';
      (draw.winningNumbers2 || []).forEach(n => {
        const b = document.createElement('div');
        b.className = 'mini-ball';
        b.textContent = n < 10 ? `0${n}` : n;
        row2.appendChild(b);
      });
      resOfficialBalls.appendChild(row2);
    } else {
      resOfficialLabel.textContent = `Официално изтеглени числа за ${gameName}, Тираж № ${draw.number} (${draw.date} г.):`;
      (draw.winningNumbers || []).forEach(n => {
        const b = document.createElement('div');
        b.className = 'mini-ball';
        b.textContent = n < 10 ? `0${n}` : n;
        resOfficialBalls.appendChild(b);
      });
    }

    // Render Official Drawn Joker if present
    if (draw?.joker && draw.joker.positions?.length > 0) {
      const jDiv = document.createElement('div');
      jDiv.style.cssText = 'width: 100%; font-size: 0.82rem; color: #94a3b8; font-weight: 600; margin-top: 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;';
      jDiv.innerHTML = `
        <span>Официален Джокер за тиража:</span>
        <button class="edit-pill-btn" id="edit-official-joker-btn" style="font-size:0.7rem; padding:1px 6px;">✏️ Джокер</button>
      `;
      resOfficialBalls.appendChild(jDiv);

      const jRow = document.createElement('div');
      jRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; width: 100%;';
      draw.joker.positions.forEach((pos, idx) => {
        const dig = draw.joker.digits?.[idx] ?? '';
        const chip = document.createElement('div');
        chip.style.cssText = 'background: rgba(255, 183, 3, 0.12); border: 1px solid rgba(255, 183, 3, 0.35); border-radius: 8px; padding: 4px 10px; font-size: 0.84rem; font-weight: 800; color: #fbbf24; font-family: monospace; letter-spacing: 0.5px;';
        chip.textContent = `Поз ${pos} / Цифра ${dig}`;
        jRow.appendChild(chip);
      });
      resOfficialBalls.appendChild(jRow);

      jDiv.querySelector('#edit-official-joker-btn')?.addEventListener('click', () => {
        const curStr = draw.joker.positions.map((p, i) => `${p}/${draw.joker.digits?.[i] ?? ''}`).join(', ');
        const inp = prompt('Въведете изтеглените позиции/цифри за Джокер (пр. 4/0, 6/1, 9/8):', curStr);
        if (inp) {
          const matches = inp.match(/\b([1-9])\s*[\/]\s*([0-9])\b/g);
          if (matches && matches.length > 0) {
            const pos = [];
            const dig = [];
            matches.forEach(m => {
              const parts = m.split('/');
              pos.push(parseInt(parts[0].trim(), 10));
              dig.push(parseInt(parts[1].trim(), 10));
            });
            draw.joker.positions = pos;
            draw.joker.digits = dig;
            TotoChecker.saveCustomDraw(gameKey, draw);
            displaySlipResults(currentSlip);
            showToast('Изтегленият Джокер бе запазен!');
          }
        }
      });
    }

    // Switch view
    showResultView();
  }

  async function fetchMissingDrawNow(slip) {
    if (!slip || !slip.drawNum) return;
    const gameKey = TotoChecker.normalizeGameKey(slip.gameType || '6/49');
    showProcessing(true, `Сваляне на данни за Тираж № ${slip.drawNum}...`);
    try {
      const res = await TotoChecker.fetchDrawOnline(gameKey, slip.drawNum, slip.drawYear);
      showProcessing(false);
      if (res && res.hasNumbers) {
        showToast(`Тираж № ${slip.drawNum} бе изтеглен успешно!`);
        displaySlipResults(slip);
      } else {
        showToast('Тиражът не бе намерен онлайн.');
      }
    } catch (e) {
      showProcessing(false);
      showToast('Грешка при сваляне.');
    }
  }
});
