# Bearridge AI Generator

Локальное single-user приложение для production-пайплайна визуальной новеллы с AI-генерацией изображений. Главная идея: Gemini используется как renderer, а не как память проекта. Вся authoritative-информация хранится локально.

## Главный Принцип

```text
LOCAL PROJECT STATE
  -> REFERENCE RESOLVER
  -> PROMPT BUILDER
  -> IMAGE PROVIDER
  -> GENERATION
  -> HUMAN REVIEW
  -> LOCKED ASSET
  -> LOCAL PROJECT STATE
```

## Project Storage

Каждый VN-проект self-contained. Все production database data и assets живут внутри папки проекта:

```text
projects/
  bearridge-six/
    project.sqlite
    project.json
    bible/
    characters/
    locations/
    props/
    style/
    story/
    states/
    frames/
      drafts/
      locked/
    generations/
    references/
```

Global `app.sqlite` используется только как registry известных проектов:

```ts
ProjectRegistryEntry {
  id: string;
  name: string;
  projectPath: string;
  lastOpenedAt?: Date;
  createdAt: Date;
}
```

Characters, Locations, Outfits, Scenes, Frames, StoryState, References, Generations и canonical asset state хранятся только в `project.sqlite` конкретного проекта.

## Установка

```bash
npm install
npm run prisma:generate
```

`project.sqlite` создается автоматически при создании проекта. Для ручной инициализации legacy/dev базы можно использовать:

```bash
npm run db:init
```

## Переменные Окружения

```env
DATABASE_URL="file:./dev.sqlite"
PROJECTS_ROOT="./projects"
IMAGE_PROVIDER="mock"
GEMINI_API_KEY=""
OPENAI_API_KEY=""
OPENAI_IMAGE_MODEL="gpt-image-2.5-sunburst"
API_PORT=4317
```

`DATABASE_URL` остается для Prisma tooling и fallback-скриптов. Production-данные проекта пишутся в `project.sqlite` внутри папки проекта.

`IMAGE_PROVIDER` явно выбирает image provider:

- `mock` - dev/test provider, сохраняет тестовое PNG и не делает сетевых запросов;
- `gemini` - реальный Gemini Image Provider через Google Gemini API;
- `openai` - OpenAI Image Provider через Responses API и image-generation tool.

Если `IMAGE_PROVIDER` не задан, backend выбирает `gemini` при наличии `GEMINI_API_KEY`, иначе `mock`. Для production benchmark рекомендуется задавать оба значения явно:

```env
IMAGE_PROVIDER="gemini"
GEMINI_API_KEY="..."
```

Для OpenAI:

```env
IMAGE_PROVIDER="openai"
OPENAI_API_KEY="..."
OPENAI_IMAGE_MODEL="gpt-image-2.5-sunburst"
```

API key читается только backend-ом из environment/config. Он не сохраняется в `project.sqlite`, не попадает во frontend и не записывается в generation provenance.

## Запуск

```bash
npm run dev
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4317`

## Gemini Integration Audit

Текущая Gemini-интеграция описана в [docs/GEMINI_INTEGRATION_AUDIT.md](docs/GEMINI_INTEGRATION_AUDIT.md).

Коротко:

- Gemini вызывается через SDK `@google/genai`, метод `models.generateContent`;
- reference images передаются как `inlineData`;
- `aspectRatio` и `imageSize` передаются через `imageConfig`;
- API key остается только на backend;
- provider-specific SDK details не попадают в domain layer.

Используемая production model по умолчанию: `gemini-3.1-flash-image`. Она хранится как project setting `defaultProductionModel`, поэтому может быть изменена через настройки проекта без изменения provider architecture.

## Полный Рабочий Флоу

### 1. Создать Проект

Введите название проекта на левой панели и нажмите кнопку создания. Backend:

1. создает папку `projects/<slug>/`;
2. создает `project.json`;
3. создает `project.sqlite`;
4. инициализирует schema;
5. создает project metadata внутри `project.sqlite`;
6. регистрирует путь проекта в `app.sqlite`;
7. делает проект active.

### 2. Открыть Существующий Проект

В поле открытия укажите путь к папке проекта. Backend проверит:

- наличие `project.json`;
- наличие `project.sqlite`;
- наличие project metadata внутри базы.

После этого проект регистрируется в `app.sqlite`, если он еще неизвестен, и становится active. База не копируется и не пересоздается.

### 3. Удалить Проект

В разделе `Проект` есть блок `Удаление проекта`.

По умолчанию кнопка удаляет проект только из registry приложения (`app.sqlite`). Папка проекта, `project.sqlite`, `project.json` и assets остаются на диске. Такой проект можно снова открыть через поле `Путь к папке проекта`.

Если включить `Также удалить папку проекта`, приложение потребует точно ввести название проекта. После подтверждения backend:

1. закрывает active project database connection;
2. удаляет запись из registry;
3. проверяет, что в папке есть `project.json` и `project.sqlite`;
4. удаляет папку проекта с диска.

Это действие необратимо.

### 4. Создать Generic Сущности

Используйте разделы sidebar:

- `Персонажи`;
- `Локации`;
- `Стили`;
- `Сцены`;
- `Кадры`;
- `Генерации`;
- `Настройки`.

Больше нет hardcoded сущностей вроде `Анна`, `Спальня` или `Образ`. Character, Location, Outfit и Style создаются из пользовательских данных.

Outfit создается внутри выбранного Character. Location angles создаются внутри выбранной Location.

У каждого Outfit редактируются production metadata:

- `name` - название образа;
- `description` - полное визуальное описание одежды;
- `immutableFeatures` - элементы одежды, которые нельзя менять между кадрами.

Эти текстовые данные дополняют image references и попадают в production prompt, когда Outfit выбран для персонажа через Story State.

### 5. Загрузить Reference Version

В деталях Character, Outfit, Location, Location Angle или Style выберите logical reference slot:

- Character: `MASTER`, `FRONT`, `PROFILE_LEFT`, `FULL_BODY_FRONT`, `EXPRESSION`, `OTHER`;
- Outfit: `MASTER`, `FRONT`, `SIDE`, `BACK`, `DETAIL`;
- Location: `MASTER`, `FLOOR_PLAN`, `DETAIL`, `OTHER`;
- Location Angle: `VIEW`;
- Style: `REF`.

Style `REF` отличается от остальных canonical slots: один Style может иметь до 6 одновременно активных `LOCKED` references. Они используются как visual style guidance: линия, палитра, лица, шейдинг, фон, свет и camera language. Они не являются источником персонажей, поз, предметов или содержимого сцены.

Upload всегда создает новую version со статусом:

```text
DRAFT
```

Uploading a file never automatically makes it canonical.

Пример:

```text
MASTER V1 - DRAFT
```

### 6. Reference Lifecycle

Reference asset проходит явный lifecycle:

```text
DRAFT -> APPROVED -> LOCKED -> DEPRECATED
```

Также возможен статус:

```text
REJECTED
```

Значения:

- `DRAFT` - новый asset, не используется resolver-ом автоматически.
- `APPROVED` - asset качественный, но еще не canonical.
- `LOCKED` - текущая canonical version для logical slot.
- `DEPRECATED` - старая canonical version, сохраненная для provenance.
- `REJECTED` - неудачный asset, не использовать в production.

### 7. Lock As Canonical

Когда пользователь нажимает `Lock` на reference version, backend выполняет transaction:

```text
current LOCKED version -> DEPRECATED
selected version       -> LOCKED
```

Для одного logical slot одновременно может быть только одна active `LOCKED` version.

Исключение: Style reference library. Для Style `Lock` добавляет reference в активный набор, не депрекейтя остальные `LOCKED` style refs. Лимит активного набора - 6. Чтобы освободить место, используйте `Убрать из канона`, это переводит reference в `DEPRECATED`.

Пример:

```text
MASTER V1 - LOCKED
MASTER V2 - DRAFT
```

После lock V2:

```text
MASTER V1 - DEPRECATED
MASTER V2 - LOCKED
```

### 8. Story State

В правой панели `Состояние сцены` задается локальный authoritative state:

- время;
- произвольные параметры окружения, например `mainLight`, `curtains`, `window`, `door`, `weather`, `deskLamp`;
- какие персонажи присутствуют;
- текущий outfit персонажа;
- эмоция;
- состояние волос;
- поза;
- позиция в локации;
- предметы в руках;
- факты истории.

Story State сохраняется в `project.sqlite` и участвует в сборке prompt-а.

### 9. Scene Editor

Scene описывает narrative context, общий для её кадров. Это не canonical asset и не frame shot setup.

В разделе `Сцены` редактируются:

- `name`;
- `description` - что происходит в сцене и какой narrative context должен сохраняться;
- `locationId`;
- `styleProfileId`;
- `characters` - персонажи, присутствующие в сцене;
- `timeDescription`.

Outfit намеренно не привязан к Scene. Текущий outfit персонажа задаётся через Story State, чтобы одежда могла изменяться по ходу истории.

У Scene есть собственный Story State. Он является исходным состоянием для кадров сцены и может содержать состояние персонажей, окружения, props и story facts.

### 10. Frame Editor

В разделе `Кадры` выберите сцену и создайте frame. Frame хранит короткие поля intent-а:

- action;
- camera;
- composition;
- lighting;
- expression notes;
- continuity notes.

У кадра есть отдельный `Контекст кадра`. Здесь пользователь выбирает:

- персонажей, которые должны попасть именно в этот кадр;
- локацию;
- ракурс локации;
- style profile.

Frame наследует Scene context. Если у кадра нет собственного выбора персонажей, локации или стиля, используются значения Scene. Frame может уточнить действие, pose/position/emotion через Story State, camera, composition, location angle и свои overrides.

Если персонажи кадра выбраны явно, resolver использует их вместо списка персонажей Scene. Story State всё равно остается источником outfit/emotion/hair/pose/props для выбранных персонажей.

У каждого frame теперь может быть собственная целевая геометрия:

- `Ширина panel`;
- `Высота panel`;
- `targetAspectRatio`, если геометрия задана напрямую через API или базу.

Это не означает, что весь проект обязан быть `16:9`. Project default aspect ratio используется только как fallback, когда у конкретного кадра нет своей ширины, высоты или ratio.

В правой части frame editor отображается блок `Геометрия кадра`:

- `ЦЕЛЕВАЯ PANEL` - реальный размер панели, куда кадр должен лечь в итоговом экране;
- `ЗАПРОС GEMINI` - ближайший поддерживаемый aspect ratio и resolution, которые отправятся в image provider;
- `ПОСТОБРАБОТКА` - нужна ли последующая обрезка и какая стратегия запланирована.

Если целевая panel не совпадает с поддерживаемым Gemini ratio, preview показывает warning. Crop editor пока не реализован: приложение только сохраняет metadata, добавляет safe-area instruction в prompt и помечает будущий crop как `CENTER` или `MANUAL`.

Большой production prompt не пишется вручную. Он строится через `PromptBuilder` из локального состояния проекта.

PromptBuilder разделяет production prompt на:

- canonical character/outfit/location/style data;
- Scene narrative context;
- current Story State;
- Frame-specific instructions.

### 10.1 Benchmark Prep

На экране `Сводка проекта` есть wizard `Benchmark 20 кадров`. Перед созданием benchmark выберите:

- персонажа;
- образ;
- локацию;
- опциональный ракурс;
- стиль.

Кнопка `Подготовить benchmark` создает сцену `Consistency Benchmark` с 20 кадрами для проверки visual continuity на реальном Gemini. Все созданные кадры получают выбранный frame context и per-frame target geometry.

Benchmark-план включает разные формы panel:

- wide;
- normal landscape;
- near-square;
- portrait;
- cinematic wide;
- ultra-wide.

Полная инструкция по запуску и QC находится в [docs/BENCHMARK.md](docs/BENCHMARK.md).

### 11. Reference Resolver

Для каждого кадра `ReferenceResolver` выбирает только current `LOCKED` reference version:

- Character master для выбранных персонажей кадра;
- Outfit master из Story State;
- Location master;
- Location Angle `VIEW`, если кадр выбрал ракурс;
- все активные Style references выбранного style profile, максимум 6;
- previous locked frame, если он есть.

Resolver не использует автоматически `DRAFT`, `APPROVED`, `DEPRECATED` или `REJECTED`.

Если locked canonical отсутствует, resolver возвращает structured warning, например:

```ts
{
  code: "MISSING_CANONICAL_CHARACTER_MASTER",
  entityId: characterId,
  severity: "blocking"
}
```

Draft generation разрешена даже при blocking warning. Production generation по умолчанию блокируется, пока обязательные canonical references не готовы. Warning `PREVIOUS_FRAME_NOT_LOCKED` остается неблокирующим: он сообщает, что continuity evidence пока нет.

### 12. Generation И Provenance

В редакторе кадра есть два режима:

- `Draft` - быстрый черновой прогон, разрешен при неполном canonical context;
- `Production` - боевой прогон, блокируется при missing canonical character/outfit/location/style/angle references.

При запуске generation backend:

1. загружает active project context;
2. собирает Story State и Frame;
3. разрешает current canonical references;
4. разрешает geometry через `GenerationGeometryResolver`;
5. строит prompt, включая safe-area instruction при необходимости;
6. создает новую Generation;
7. вызывает image provider с поддерживаемыми `aspectRatio` и `resolution`;
8. сохраняет image file;
9. сохраняет GenerationReference provenance;
10. сохраняет geometry provenance.

Generation хранит и целевую, и фактическую request-геометрию:

- `targetWidth`;
- `targetHeight`;
- `targetAspectRatio`;
- `aspectRatio`;
- `resolution`;
- `requiresCrop`;
- `cropStrategy`.

JSON provenance рядом с generated image также содержит блок `geometry`, чтобы позже было понятно, под какую panel кадр создавался, какой Gemini request был использован и нужен ли crop.

Provenance также сохраняет роли референсов: canonical identity, canonical outfit, location angle, style и previous locked frame. Это нужно для аудита, почему конкретный файл был отправлен provider-у.

Historical provenance не обновляется при смене canonical version. Если generation использовала `CHAR_ANNA_MASTER_V1`, а позже canonical стала `CHAR_ANNA_MASTER_V2`, старая generation продолжает ссылаться на V1.

### 12.1 Реальный Gemini Provider

Provider выбирается backend config-ом `IMAGE_PROVIDER`.

```env
IMAGE_PROVIDER="mock"   # dev/test, без платных запросов
IMAGE_PROVIDER="gemini" # production, реальный Gemini API
IMAGE_PROVIDER="openai" # production, OpenAI Responses API
```

При `IMAGE_PROVIDER="gemini"` backend создает `GeminiImageProvider`. Он получает уже готовые данные из существующего pipeline:

- production prompt из `PromptBuilder`;
- resolved references из `ReferenceResolver`;
- provider geometry из `GenerationGeometryResolver`.

Gemini request строится как `contents` для `models.generateContent`:

```text
Part 1: production prompt text
Part 2: role text for reference image 1
Part 3: reference image 1 as inlineData
Part 4: role text for reference image 2
Part 5: reference image 2 as inlineData
...
```

Если resolver выбрал 8 reference images, Gemini получает 8 `inlineData` image parts плюс 8 коротких text parts с semantic role. Роли сохраняются из resolver-а:

- Character - canonical identity reference;
- Outfit - canonical outfit reference;
- Location - canonical environment/layout reference;
- LocationAngle - canonical camera/view reference;
- Style - visual style guidance only, not a source of scene content;
- Previous Frame - continuity evidence only.

Успешный Gemini response сохраняет image bytes по существующему generation output path внутри папки проекта. Generation получает `provider: "gemini"`, фактический `model`, `status: "SUCCESS"` и raw metadata с `responseId`, `modelVersion`, `usageMetadata`, количеством references и reference roles.

Если Gemini возвращает ошибку, не возвращает image part или ключ не настроен, generation получает `status: "FAILED"` и diagnostic message в `rawMetadata`. Mock fallback в этом случае не используется.

Проверить, что следующий `Production` идет в Gemini, можно так:

1. В `.env` задайте `IMAGE_PROVIDER="gemini"` и `GEMINI_API_KEY`.
2. Перезапустите backend.
3. Откройте UI: в нижнем статусе API должно быть `готов / gemini`.
4. Запустите `Production` на кадре без blocking warnings.
5. В карточке generation проверьте подпись модели: должно быть `gemini-3.1-flash-image / gemini`, а не `/ mock`.
6. В `project.sqlite` у новой записи `Generation.provider` должно быть `gemini`.

### 12.2 Export for ChatGPT

В редакторе кадра рядом с действиями `Draft` и `Production` доступна кнопка `Export for ChatGPT`. Она формирует ZIP-пакет из того же подготовленного production context, который использует generation pipeline:

- prompt берется без изменений из существующего `PromptBuilder`;
- canonical references берутся в исходном порядке из существующего `ReferenceResolver`;
- geometry берется из `GenerationGeometryResolver`;
- оригинальные reference-файлы копируются без resize, crop, recompression или conversion.

Экспорт не вызывает ImageProvider, не создает Generation и не меняет состояние Frame или canonical assets. Endpoint: `POST /api/frames/:frameId/export/chatgpt`.

Архив содержит `CHATGPT_PROMPT.md`, `manifest.json` и каталог `references/`. API keys, credentials, data URLs, base64 и абсолютные локальные пути в пакет не включаются.

Для `NEW_COMPOSITION` экспорт по-прежнему содержит полный production prompt и полный набор canonical visual references. Для `CONTINUE_PREVIOUS_FRAME` применяется policy `CHATGPT_CONTINUATION_V2`: предыдущий locked Frame экспортируется как единственная visual authority сцены, а в `references/` включаются только уникальные Character identity references. Outfit, Location, LocationAngle и Style images остаются в production provenance, но не передаются ChatGPT как конкурирующие visual sources. Их canonical metadata преобразуется в короткие текстовые constraints; полный PromptBuilder output сохраняется в export receipt для аудита и импорта.

### 12.3 Дополнительные референсы персонажа для Frame

`MASTER` каждого выбранного персонажа по-прежнему подключается автоматически. В блоке `Контекст кадра` можно явно выбрать дополнительные `LOCKED` character references, например `PROFILE_LEFT` или `FULL_BODY_FRONT`.

- выбор хранится на связи конкретного `FrameCharacter`;
- автоматически дополнительные слоты не выбираются;
- `MASTER`, reference другого персонажа, non-`LOCKED` reference и дубликаты выбрать нельзя;
- Preview показывает точный порядок и semantic role;
- Production и `Export for ChatGPT` получают тот же набор через общий `ReferenceResolver`.

Существующие Frame после migration имеют пустой дополнительный выбор и продолжают использовать только автоматический `MASTER`.

### 13. Screen И Panel

`Screen` описывает итоговый экран/страницу визуальной новеллы внутри сцены. `Panel` связывает конкретный `Frame` с областью на этом screen:

- `Screen` принадлежит `Scene`;
- `Panel` принадлежит `Screen`;
- `Panel` указывает на `Frame`;
- `Panel.width` и `Panel.height` задают целевую область;
- `Frame.targetWidth`, `Frame.targetHeight` и `Frame.targetAspectRatio` используются generator-ом как target geometry.

UI layout editor для screen/panel пока не добавлен. На текущем этапе эти сущности есть в доменной модели и базе, а генерация уже умеет работать с per-frame target geometry.

### 14. Review И Lock Frame

После generation frame переходит в `REVIEW`. Пользователь проверяет результат в панели `Проверка` и нажимает `Утвердить и закрепить кадр`.

Frame получает:

```text
selectedGenerationId
status = LOCKED
```

Только locked frame может использоваться как continuity reference для следующих кадров.

## Рекомендуемый Acceptance Test

1. Создайте проект `Bearridge Six`.
2. Убедитесь, что в его папке появился `project.sqlite`.
3. Создайте Character `Anna`.
4. Загрузите `MASTER` reference.
5. Убедитесь, что он появился как `MASTER V1 - DRAFT`.
6. Нажмите `Approve`.
7. Убедитесь, что статус стал `APPROVED`.
8. Нажмите `Lock`.
9. Убедитесь, что статус стал `LOCKED`.
10. Загрузите новый `MASTER`.
11. Убедитесь, что `V1` остался `LOCKED`, а `V2` стал `DRAFT`.
12. После `Lock` на V2 убедитесь, что `V1` стал `DEPRECATED`, а `V2` стал `LOCKED`.
13. Создайте Character `Max` и Location `Apartment` без изменений кода.
14. Создайте несколько location angles.
15. Загрузите `VIEW` reference на один location angle, затем `Approve` и `Lock`.
16. В Story State отметьте персонажа present, выберите outfit, заполните emotion/hair/pose/held props.
17. Создайте frame, выберите character/location/location angle/style в `Контекст кадра` и сохраните.
18. Проверьте preview: resolved references должны включать character master, outfit master, location angle view, style reference и previous locked frame, если он есть.
19. Убедитесь, что кнопка `Production` disabled при blocking warnings и enabled после подготовки всех canonical refs.
20. Закройте приложение, скопируйте всю папку проекта, откройте ее как existing project.

## Backup

## Frame generation strategy

Each Frame stores an explicit `generationStrategy`:

- `NEW_COMPOSITION` keeps the existing flow and calls `ImageProvider.generate()`;
- `CONTINUE_PREVIOUS_FRAME` requires a previous `LOCKED` Frame with a selected successful Generation and calls `ImageProvider.edit()`.

For continuation, the selected previous image is the single authoritative base image. `ReferenceResolver` still resolves the normal canonical set, but the previous-frame item is removed from supporting references during common generation preparation. Character, outfit, location, location-angle and style references remain ordered canonical constraints. No fallback to new composition is performed when the base or provider edit capability is unavailable.

The preview shows strategy, base image, supporting references and delta instructions separately. ChatGPT Export uses the same prepared context and stores the base under `base/`, while canonical assets remain under `references/`. Successful continuation provenance uses `Generation.generationType = EDIT`, links `parentGenerationId` to the selected previous Generation, and records the base as `base-previous-frame` provenance.

## Import ChatGPT Result

`Export for ChatGPT` now assigns a unique `exportId`, writes it to `manifest.json`, and stores a portable receipt under `exports/chatgpt/<exportId>.json`. In the Frame Editor, select that export and use `Import ChatGPT Result` to choose a PNG, JPEG, or WEBP returned manually by ChatGPT.

The imported file is copied to `generations/<frame-code>/` and represented as a normal successful `Generation` with `provider = chatgpt-manual`. It enters the existing Review and Lock workflow. A continuation import retains its base Frame, selected base Generation, `parentGenerationId`, supporting export references, and Continuity Edit Contract provenance, but does not claim that ChatGPT used every supplied reference. Once locked, the imported Generation automatically becomes the previous-frame base for a following continuation Frame.

## Repair Generation

On the **Generations** page, choose **Repair Generation** on a successful result. Enter one correction per line under **Change Only**, and optional restrictions under **Forbidden**. **Export Repair for ChatGPT** downloads a portable ZIP with the chosen result as `AUTHORITATIVE_BASE`, a self-contained prompt and provenance. Upload the base image in a new ChatGPT chat, paste `01_CHATGPT_PROMPT.txt`, then import the corrected image using the matching repair export.

The import creates another Generation of the same Frame with `generationType = REPAIR` and `parentGenerationId` pointing to the source. Its contract is recorded in `rawMetadata`. The source remains available; the repaired result is not selected or locked automatically. Compare results on **Generations**, select the preferred one, then lock it through the existing review action. A previously locked Frame keeps its current selected result until you explicitly choose another.

To backup a project, copy its project folder.

Отдельно копировать `dev.sqlite` больше не нужно. Для переноса production-проекта достаточно папки, содержащей `project.sqlite`, `project.json` и assets.

## Проверки

```bash
npm run typecheck
npm test
npm run build
```

## Ограничения Текущего Этапа

В этом refactor не реализованы:

- semantic AI-based ReferenceResolver;
- pose reference selection;
- image embeddings;
- repair workflow;
- batch generation;
- sprite compositor;
- branching story;
- multi-provider routing.

Это отдельные следующие этапы.
