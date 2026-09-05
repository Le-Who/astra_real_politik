# Современная карта: принятое решение и порядок сборки

Уточнение по замечанию пользователя от 2026-09-05. Этот документ обязателен для T05, T07, T20, T27 и T35. Он заменяет неопределённые указания «взять актуальные данные» и «подготовить дополнительные слои» в части современной карты.

## 1. Решение принято

Геометрическая основа — **Natural Earth v5.1.2**, immutable commit **f1890d9f152c896d250a77557a5751a93d494776**. Не `world-atlas`, не CShapes для современности и не произвольный набор, выбранный агентом во время реализации.

Точные восемь исходных файлов, их роли, размеры, Git blob hashes и URL-base закреплены в [машиночитаемом source manifest](modern-geography.sources.json). Tag и наличие всех файлов проверены по GitHub API. GeoJSON спорных областей дополнительно прочитан, поля проверены. SHA-1 в manifest — hash объекта Git blob, а не обычный SHA-1 содержимого файла; загрузчик проверяет `SHA1("blob " + byteLength + NUL + bytes)`.

Сборщик использует URL `rawBaseUrl + path`, проверяет bytes/hash и сохраняет скачанное в content-addressed cache. При mismatch сборка останавливается. Переход на новую версию — отдельный data update с diff и review, не скрытое обращение к `latest`.

[Проверенный релиз Natural Earth](https://github.com/nvkelso/natural-earth-vector/releases/tag/v5.1.2). Геометрия этого релиза не является автоматически подтверждённым политическим состоянием на 2026-09-01.

## 2. Какая информация берётся из каждого файла

| Роль | Входной файл, префикс `ne_10m_` | Использование |
|---|---|---|
| Страны | `admin_0_countries.geojson` | Исходный country index, названия и внешние коды |
| Территории и зависимости | `admin_0_map_units.geojson` | Геометрическая оболочка территориальных единиц; не сливать зависимости с метрополией |
| Игровые регионы | `admin_1_states_provinces.geojson` | Исходные внутренние границы, из которых строятся игровые ячейки |
| Территориальные претензии | `admin_0_disputed_areas.geojson` | Дополнительное разбиение и исходная классификация спорных областей |
| Спорные линии | `admin_0_boundary_lines_disputed_areas.geojson` | Отдельный штриховой слой; не превращать каждую линию в государство |
| Линии стран | `admin_0_boundary_lines_land.geojson` | Контроль качества исходных внешних границ; игровые границы позднее вычисляются по ячейкам |
| Суша | `land.geojson` | Визуальная подложка, не источник суверенитета |
| Поселения | `populated_places.geojson` | Названия/координаты городов; столица определяется политическим пакетом, а не старым флагом файла |

В исходниках Natural Earth встречаются собственные административные коды, `NE_ID`, `ADM0_A3`, `SOV_A3`, `GU_A3`, `BRK_A3`, `ISO_A3`, `ISO_N3` и поля отдельных политических представлений. Поля различаются по слою, поэтому каждый importer имеет собственную runtime-схему. Нельзя считать `-99` валидным ISO-кодом, `SOV_A3` текущим контролёром, а viewpoint-поле — универсальным юридическим признанием.

Для идентичности использовать namespaced source ID и отдельную таблицу `actor-aliases.json`. Существующая неоднозначность alias вызывает ошибку сборки, не fuzzy-match по имени. Профили/даты существования акторов задаются пакетом сценария T07. Для государства без видимого полигона обязателен marker, созданный из его явно заданного label point.

geoBoundaries не включён вторым обязательным глобальным набором: в этом релизе регионы формируются из Natural Earth и сценарных разбиений, поэтому нет задачи «выбрать между двумя несовместимыми административными сетками». Дополнительная точность конкретного пользовательского сценария обслуживается редактором геометрии T27.

## 3. Алгоритм геометрической сборки

Геооперации выполняются PostGIS/GEOS в изолированной build DB, вызываемой TypeScript-сборщиком. Эта БД нужна для подготовки данных и geometry editing jobs, а не для каждого хода. Игровой runtime продолжает использовать собственные PostgreSQL projections и stable region IDs. PostGIS/GEOS/GDAL versions и build image digest фиксируются T01/T05; изменение любого из них запускает geometry regression.

1. Загрузить восемь закреплённых файлов. Проверить object type, CRS WGS84, bbox, обязательные поля, UTF-8, ID collisions и hashes.
2. Для полигонов применить `ST_MakeValid`, извлечь polygonal components через `ST_CollectionExtract(...,3)`; каждый collapsed/empty feature вынести в ошибку или явное marker-only exception, не терять молча.
3. Разрезать пересекающие ±180° полигоны на RFC 7946-совместимые части. Исходная суша остаётся WGS84; Mercator clipping делается только для renderer. Антарктика не становится playable country из-за отдельного полигона.
4. Внутренние admin-1 boundaries пересечь с map-unit envelopes. Пробелы внутри map unit сохранять как именованную residual cell, а не отдавать ближайшей стране. Отдельные острова не удалять фильтром площади.
5. Собрать linework границ map units, admin-1, disputed-area polygons и принятых `geometry-patches.geojson`; выполнить noding (`ST_UnaryUnion`/`ST_Node`), затем `ST_Polygonize`. Отфильтровать только ячейки внутри территориальной оболочки, сохранив исходные holes. Выполнять по затронутым map units с явным учётом общих границ, не одним гигантским глобальным запросом.
6. Через `ST_PointOnSurface` и spatial joins каждой ячейке присвоить source memberships. Claim memberships допускают множественность; они не создают перекрывающихся физических ячеек. Контролёр не выбирается по порядку файлов.
7. Для неизменённой единицы ID — namespaced source ID. Для новой ячейки — `cell:<map-unit-id>:<canonical-geometry-hash>`, плюс parent IDs. Canonicalization фиксирует orientation, порядок rings/components и точность координат; опубликованная версия не меняет ID. При реальном изменении геометрии создаются descendant IDs и lineage map.
8. Провести topology tests: self-intersections нет; площадь positive-area overlap ячеек ≤1 м² на пару; symmetric difference объединения ячеек и обработанной территориальной оболочки ≤max(1 м², 10^-8 её площади). Площадь измерять geodesic/equal-area методом, не в градусах. Обнаруженная ошибка не устраняется присвоением территории «по умолчанию».
9. Экспортировать canonical `territories.geojson`, `territory-index.json`, `adjacency.json`, `claim-memberships.json`. Для каждого общего граничного сегмента создать `edgeId`, `leftTerritoryId`, `rightTerritoryId` (у внешнего берега один сосед null), геометрию в `edges.geojson` и запись в `edge-index.json`. Отдельно — label points и исходные disputed lines. Все записи отсортировать детерминированно; digest считается после нормализации.
10. Создать render tiles через **Tippecanoe 2.79.0 → PMTiles**, диапазон zoom 0–7; геометрия отображения упрощается, каноническая — нет. Исчезающий на низком zoom регион получает marker/поисковый доступ. Whole-country overview строится dissolve собственных ячеек, не подменяется другим списком стран из `countries-110m.json`.
11. Проверить tiles, ID coverage и click/selection на границах tiles; op updates не пересобирают PMTiles. MapLibre получает immutable geometry и обновляемые control/claim/selection properties через feature-state/собственный overlay.
12. Для WebGL fallback построить обзорный TopoJSON из тех же ячеек и Canvas/SVG view с теми же IDs; минимальная геометрия не означает отсутствие актора в игре.

[Polygonize](https://postgis.net/docs/ST_Polygonize.html), [MakeValid](https://postgis.net/docs/ST_MakeValid.html), [UnaryUnion](https://postgis.net/docs/ST_UnaryUnion.html) — используемые операции, а не предложение подобрать алгоритм. [Tippecanoe 2.79.0](https://github.com/felt/tippecanoe/releases/tag/2.79.0) и [PMTiles/MapLibre](https://docs.protomaps.com/pmtiles/maplibre) — выбранный путь доставки.

## 4. Политическое состояние на современную дату

Геометрия и современная принадлежность — разные входы сборки. Начальный политический пакет имеет `asOf: 2026-09-01`; его состав фиксирован:

```text
content/scenarios/contemporary/
  actor-aliases.json
  territorial-baseline.json
  control-patches.json
  recognition.json
  claims.json
  geometry-patches.geojson
  evidence.json
  review-coverage.json
```

`territorial-baseline.json` сопоставляет ВСЕ physical cell IDs с состоянием из исходной географической базы. Эти значения имеют `origin:source_baseline`, а не автоматически `verifiedCurrent:true`. Пакет поправок обновляет их на выбранную дату. Для областей с частичным/оспариваемым контролем используется несколько игровых ячеек либо честное `mixed/unknown`, а не закрашивание всей области одним актором по газетному заголовку.

Типы обязательного дополнения к основному контракту:

```ts
interface TerritorialAssessment {
  territoryId: string;
  asOf: string;
  controlStatus: 'single' | 'mixed' | 'unknown' | 'not_applicable';
  controllerId: string | null;
  competingControllerIds: string[];
  sourceAsOf: string | null;
  evidenceIds: string[];
  reviewStatus: 'unreviewed' | 'verified' | 'contested' | 'scenario_estimate';
}
interface TerritorialPatch {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  territoryIds: string[];
  assessment: Omit<TerritorialAssessment, 'territoryId'>;
  supersedesPatchIds: string[];
}
```

`single` требует ровно один controller ID, `mixed` — минимум двух кандидатов и `controllerId:null`, `unknown` не означает ничейную/доступную для захвата землю. `not_applicable` используется для негосударственных зон без игрового контроля. Legal recognition и claims остаются отдельными записями с признáющей/заявляющей стороной и evidence.

### Откуда брать датированные поправки

Источники распределены по предмету, а не образуют конкурс, который агент должен придумать:

- **Членство/наблюдатели и международные решения:** официальный реестр ООН и конкретные резолюции/документы ООН. Они устанавливают содержание документа, не автоматически фактический контроль на земле.
- **Заявленная позиция/признание государством:** официальная публикация его правительства/МИД; запись имеет `assertedByActorId`. Заявление стороны конфликта не становится нейтральным фактом контроля.
- **Картографические референсы и пояснения к спорным границам:** Natural Earth disputed layers плюс карты UN Geospatial; URL конкретной карты, дата и отметки в легенде сохраняются в evidence. Отсутствие доступа к конкретной карте отражается в review, не заменяется придуманной ссылкой.
- **Текущая обстановка в конфликтных регионах:** датированные OCHA/UN humanitarian situation reports. Машинный collector использует ReliefWeb API v2 `/reports` с publisher/source/date/country filters; нужен pre-approved appname. Без него предусмотрен ручной импорт конкретного отчёта тем же evidence importer — не обязательная зависимость запуска игры от регистрации ещё в одном сервисе.

Сведения из отчётов сопоставляются с существующими cell IDs. Если сведения не устанавливают точную линию, importer не рисует её из текста: создаётся `mixed/unknown` assessment с датой и основанием. Если в отчёте есть пригодная разрешённая геометрия, её ручная оцифровка/импорт проходит тот же geometry patch review и topology tests. Авторские PDF/карты не перепубликуются целиком без разрешения; в игровом пакете — нормализованные факты, ссылки и самостоятельно подготовленные допустимые материалы.

Обязательный review backlog формируется из всех disputed features закреплённого набора, всех неоднозначных alias/control assignments и всех конфликтных регионов contemporary manifest. Стартовые тематические проверки включают Украину, Палестину/Израиль, Кипр, Косово, Тайвань, Западную Сахару, Кашмир, Южный Кавказ, Судан, Южный Судан, Сирию, Йемен и Сомали. Это перечень проверок, не утверждение текущих границ/статусов перечисленных территорий; полный backlog не ограничивается этим списком.

Два независимых источника требуются для спорного изменения контроля, заявленного как `verified`. Два пересказа одного сообщения не считаются независимыми. При несовместимых сведениях результат `contested`; отсутствие сведений нельзя скрыть псевдоточностью. Любой `scenario_estimate` видим в UI. `unreviewed` запись блокирует публикацию современного пакета.

Для обновления: загрузить новые source records → сформировать candidate patches → проверить даты/evidence/область → review → пересобрать только затронутую геометрию, если она менялась → выпустить новый digest. Существующие кампании остаются на закреплённой версии, игровые события не переписываются.

## 5. Выход и обслуживание карты

Готовый геопакет: `world.pmtiles`, `borders.pmtiles` из `edges.geojson`, `overview.topojson`, `territory-index.json`, `edge-index.json`, `adjacency.json`, `labels.json`, `initial-political-state.json`, `manifest.json`, `attribution.json`, `build-report.json`. Server хранит их по digest. PMTiles выдаётся с HTTP Range/206, ETag и immutable caching; deployment test проверяет реальный range response, не загрузку всего архива на каждое окно.

Web-клиент регистрирует PMTiles protocol один раз в app lifecycle. Начало кампании загружает index и player projection. После `world.committed` обновляются только затронутые feature IDs. Граница между государствами отображается по текущим контролёрам/выбранному слою, а не остаётся неизменной линией Natural Earth. Связи соседства вычислены из canonical cells, поэтому смена контроля не требует географического анализа заново.

## 6. Критерии окончания этой работы

1. Все 8 input assets совпадают с закреплёнными hashes; ни одного unpinned URL в release geography manifest.
2. Каждый actor представлен геометрией или явным marker-only exception; каждая ячейка имеет assessment.
3. Нет `unreviewed` assessments, dangling IDs, неявных overlaps или утраченных островов. `contested/unknown/scenario_estimate` сохранены и визуально различимы, а не ошибочно объявлены verified.
4. Два независимых запуска на одинаковом input/toolchain дают одинаковые canonical IDs и content hashes.
5. Synthetic test: изменение одного cell controller не меняет соседние cells, recognition или claims; replay восстанавливает точный результат.
6. World/selected modes используют один геопакет. Выбор стран не вырезает физическую географию и background actors.
7. Desktop/mobile/fallback показывают дату оценки, источник и политическую неопределённость; PMTiles payload не содержит скрытых игровых сведений.

Это закрывает **выбор источника, структуру данных, алгоритм преобразования, доставку и правила политической актуализации**. Реальные поправки по каждой территории создаются и проверяются в T07 как контентная работа; они ещё не выполнены и не выдаются за готовый мировой срез.
