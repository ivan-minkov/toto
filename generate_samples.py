import os

svg_template = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 700" width="420" height="700">
  <defs>
    <filter id="paper-texture" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
      <feDiffuseLighting in="noise" lighting-color="#fff" surfaceScale="2" result="light">
        <feDistantLight azimuth="45" elevation="60" />
      </feDiffuseLighting>
      <feBlend mode="multiply" in="SourceGraphic" in2="light" />
    </filter>
  </defs>

  <!-- Thermal Paper Background -->
  <rect x="0" y="0" width="420" height="700" fill="#f8f9fa" rx="8" />
  
  <!-- Subtle creasing and receipt edge -->
  <path d="M 0 0 L 420 0 L 420 700 L 0 700 Z" fill="#ffffff" opacity="0.8" />
  <line x1="20" y1="110" x2="400" y2="110" stroke="#333" stroke-dasharray="4,4" stroke-width="1.5" />
  <line x1="20" y1="380" x2="400" y2="380" stroke="#333" stroke-dasharray="4,4" stroke-width="1.5" />
  <line x1="20" y1="460" x2="400" y2="460" stroke="#333" stroke-dasharray="4,4" stroke-width="1.5" />
  <line x1="20" y1="560" x2="400" y2="560" stroke="#333" stroke-dasharray="4,4" stroke-width="1.5" />

  <!-- Header -->
  <g font-family="'Courier New', monospace, 'Lucida Console'" fill="#111" text-anchor="middle">
    <text x="210" y="42" font-size="17" font-weight="bold" letter-spacing="1">БЪЛГАРСКИ СПОРТЕН ТОТАЛИЗАТОР</text>
    <text x="210" y="68" font-size="20" font-weight="900" letter-spacing="2">ТОТО 2 - {game}</text>
    <text x="210" y="94" font-size="14" font-weight="bold">КВИТАНЦИЯ ЗА ЗАЛОГ</text>

    <!-- Draw and Date info -->
    <text x="210" y="138" font-size="15" font-weight="bold">ТИРАЖ: {draw_num} / 2026</text>
    <text x="210" y="162" font-size="13">ДАТА: {draw_date} г.  ЧАС: 16:45:10</text>
  </g>

  <!-- Combinations / Areas -->
  <g font-family="'Courier New', monospace, 'Lucida Console'" fill="#111" text-anchor="start">
    <text x="35" y="200" font-size="16" font-weight="bold">ОБЛАСТ 1:</text>
    <text x="145" y="200" font-size="18" font-weight="900" letter-spacing="3">{area1}</text>

    <text x="35" y="245" font-size="16" font-weight="bold">ОБЛАСТ 2:</text>
    <text x="145" y="245" font-size="18" font-weight="900" letter-spacing="3">{area2}</text>

    <text x="35" y="290" font-size="16" font-weight="bold">ОБЛАСТ 3:</text>
    <text x="145" y="290" font-size="18" font-weight="900" letter-spacing="3">{area3}</text>

    <text x="35" y="335" font-size="16" font-weight="bold">ОБЛАСТ 4:</text>
    <text x="145" y="335" font-size="18" font-weight="900" letter-spacing="3">{area4}</text>
  </g>

  <!-- Joker -->
  <g font-family="'Courier New', monospace, 'Lucida Console'" fill="#111" text-anchor="start">
    <text x="35" y="410" font-size="14" font-weight="bold">ТОТО ДЖОКЕР:</text>
    <text x="165" y="410" font-size="15" font-weight="bold">ПОЗИЦИИ: {joker_pos}</text>
    <text x="165" y="435" font-size="16" font-weight="900" letter-spacing="2">ЦИФРИ:   {joker_nums}</text>
  </g>

  <!-- Price & Terminal info -->
  <g font-family="'Courier New', monospace, 'Lucida Console'" fill="#111" text-anchor="start">
    <text x="35" y="490" font-size="15" font-weight="bold">СУМА ЗА ПЛАЩАНЕ: 5.60 ЛВ.</text>
    <text x="35" y="515" font-size="12">ТЕРМИНАЛ: 1042-08   ОПЕРАТОР: 014</text>
    <text x="35" y="538" font-size="12">ПУНКТ: СОФИЯ, БУЛ. ВАСИЛ ЛЕВСКИ 12</text>
  </g>

  <!-- Control Number and Barcode -->
  <g font-family="'Courier New', monospace, 'Lucida Console'" fill="#111" text-anchor="middle">
    <text x="210" y="590" font-size="13" font-weight="bold">КОНТРОЛЕН НОМЕР:</text>
    <text x="210" y="612" font-size="15" font-weight="900" letter-spacing="2">{control_num}</text>
  </g>

  <!-- Stylized Barcode -->
  <g fill="#111">
    {barcode_bars}
  </g>
</svg>
"""

def generate_barcode_bars(seed=1):
    bars = []
    x = 60
    pattern = [2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 2, 3, 4, 1, 2, 1, 3, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3]
    for i, w in enumerate(pattern):
        if i % 2 == 0:
            bars.append(f'<rect x="{x}" y="625" width="{w * 1.5:.1f}" height="42" />')
        x += w * 1.5 + 2.2
    return "\\n    ".join(bars)

samples = [
    {
        "filename": "receipt_sample_1_win4.svg",
        "game": "6/49",
        "draw_num": "84",
        "draw_date": "22.10.2026",
        # Winning numbers in draw 84 are: 15, 16, 20, 24, 36, 47
        # Area 1 has 4 hits: 15, 20, 24, 47 (+ 03, 31) -> Четворка!
        "area1": "03  15  20  24  31  47",
        # Area 2 has 3 hits: 16, 20, 36 (+ 08, 12, 41) -> Тройка!
        "area2": "08  12  16  20  36  41",
        "area3": "02  11  19  28  33  49",
        "area4": "05  14  22  30  39  44",
        "joker_pos": "1  4  8",
        "joker_nums": "3  7  9",
        "control_num": "A842-9912-3401-8172-5509-3281",
        "seed": 1
    },
    {
        "filename": "receipt_sample_2_win3.svg",
        "game": "6/49",
        "draw_num": "83",
        "draw_date": "18.10.2026",
        # Winning numbers in draw 83: 4, 12, 19, 28, 35, 42
        # Area 1 has 3 hits: 04, 12, 28 (+ 10, 25, 46) -> Тройка!
        "area1": "04  10  12  25  28  46",
        "area2": "07  15  23  31  38  44",
        "area3": "01  09  18  27  34  43",
        "area4": "06  14  21  29  37  48",
        "joker_pos": "2  5  7",
        "joker_nums": "1  5  8",
        "control_num": "B931-4102-8824-1903-7281-9940",
        "seed": 2
    },
    {
        "filename": "receipt_sample_3_current.svg",
        "game": "6/49",
        "draw_num": "85",
        "draw_date": "25.10.2026",
        # Draw 85 winning numbers: 7, 14, 21, 33, 39, 44
        # Area 1: 5 hits: 07, 14, 21, 33, 44 (+ 19) -> ПЕТИЦА!
        "area1": "07  14  19  21  33  44",
        "area2": "02  09  16  24  35  48",
        "area3": "03  11  18  26  32  41",
        "area4": "05  13  22  30  38  46",
        "joker_pos": "3  6  9",
        "joker_nums": "4  6  2",
        "control_num": "C104-5820-9143-7721-4820-1194",
        "seed": 3
    }
]

os.makedirs("assets/samples", exist_ok=True)

for sample in samples:
    svg_content = svg_template.format(
        game=sample["game"],
        draw_num=sample["draw_num"],
        draw_date=sample["draw_date"],
        area1=sample["area1"],
        area2=sample["area2"],
        area3=sample["area3"],
        area4=sample["area4"],
        joker_pos=sample["joker_pos"],
        joker_nums=sample["joker_nums"],
        control_num=sample["control_num"],
        barcode_bars=generate_barcode_bars(sample["seed"])
    )
    with open(os.path.join("assets/samples", sample["filename"]), "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Generated {sample['filename']}")
