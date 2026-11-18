# Credits — сторонние ассеты

| Ассет | Автор | Лицензия | Источник | Где в проекте |
|---|---|---|---|---|
| **Car Kit** (v3.1): `sedan`, `sedan-sports`, `hatchback-sports`, `suv`, `taxi`, `van`, `delivery`, `police`; `cone`; `tree-small`, `tree-large`, `planter` | Kenney (www.kenney.nl) | CC0 1.0 (public domain) | https://kenney.nl/assets/car-kit | `public/models/cars/`, `public/models/props/` |

Модели машин перекрашиваются в коде (замена клеток палитры `colormap`); фонари, скамейки, урны и знаки — собственные примитивы (`src/props.js`).
Суммарный вес моделей ≈ 1,3 МБ (бюджет 8 МБ).
# Credits

## Текстуры (`public/textures/`) — CC0

Все фото-текстуры — **CC0 1.0** (общественное достояние), ambientCG (https://ambientcg.com), автор — Lennart Demes / ambientCG. Использованы 1K-JPG карты цвета; обработка: уменьшение до 256×256, подгонка яркости/насыщенности, сжатие палитры до 256 цветов (стыки бесшовные).

| Файл | Источник | Лицензия |
| `asphalt.png` | ambientCG «Asphalt026C» (https://ambientcg.com/a/Asphalt026C) | CC0 1.0 |
| `sidewalk.png` | ambientCG «PavingStones070» (https://ambientcg.com/a/PavingStones070) | CC0 1.0 |
| `grass.png` | ambientCG «Grass004» (https://ambientcg.com/a/Grass004) | CC0 1.0 |
| `facade_brick.png` | кирпич — ambientCG «Bricks059» (https://ambientcg.com/a/Bricks059); окна 2×2 дорисованы скриптом (ImageMagick) | CC0 1.0 (окна — оригинальная работа проекта) |
| `facade_concrete.png` | бетон — ambientCG «Concrete034» (https://ambientcg.com/a/Concrete034); окна и швы панелей дорисованы скриптом | CC0 1.0 (окна — оригинальная работа проекта) |

`billboard_*.png`, `graffiti_*.png`, `facade.png`, `facade_glass.png` — сгенерированы для проекта (см. `public/textures/READY.txt`).
