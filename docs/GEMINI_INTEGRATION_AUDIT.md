# Gemini Integration Audit

Дата аудита: 2026-09-03.

Источник проверки: официальная документация Google AI для Gemini image generation:

```text
https://ai.google.dev/gemini-api/docs/generate-content/image-generation
```

## Вывод

Интеграция приведена к текущему Gemini 3 image API:

- используется `GoogleGenAI`;
- вызов идет через `client.models.generateContent`;
- изображения передаются как `Part.inlineData`;
- результат читается из `candidate.content.parts[].inlineData`;
- конфигурация генерации передается через `config.imageConfig`;
- `aspectRatio` и `imageSize` задаются отдельно.

Старый путь через `interactions.create` больше не используется.

## Сохраненные архитектурные границы

Gemini остается renderer-ом, а не project memory.

Domain layer не зависит от SDK:

- `ReferenceResolver`;
- `PromptBuilder`;
- `GenerationGeometryResolver`;
- benchmark plan.

SDK-специфика изолирована в `GeminiImageProvider`.

## Geometry

Target Panel geometry не смешивается с Gemini request geometry.

`GenerationGeometryResolver` возвращает:

- `requestedAspectRatio`;
- `requestedResolution`;
- `requestedImageSize`;
- `targetAspectRatio`;
- `requiresCrop`;
- `cropStrategy`;
- `aspectRatioDifference`.

`requestedResolution` хранится для preview/provenance как ожидаемый pixel footprint выбранного формата. `requestedImageSize` используется provider-ом как API-параметр Gemini (`1K` на текущем этапе).

## Metadata

Provider сохраняет в `rawMetadata`:

- number of reference images;
- repair flag;
- semantic role каждого reference;
- Gemini response id;
- Gemini model version;
- usage metadata.

API key не уходит во frontend и не логируется.

## Provider Routing

Image provider выбирается backend config-ом `IMAGE_PROVIDER`:

- `mock` - локальный dev/test provider без сетевых запросов;
- `gemini` - реальный `GeminiImageProvider`.

Если выбран `gemini`, но `GEMINI_API_KEY` отсутствует или Gemini возвращает ошибку,
Generation фиксируется как `FAILED`. Mock fallback в этом случае не используется.

## Остаточные риски

- Реальный Gemini smoke test требует валидный `GEMINI_API_KEY`; unit test использует fake client и не делает сетевой запрос.
- Crop/resize пока не выполняется автоматически, только помечается metadata.
- Benchmark оценивает consistency через human QC; автоматической визуальной метрики пока нет.
