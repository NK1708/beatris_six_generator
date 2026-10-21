# Consistency Benchmark

Цель benchmark: проверить, насколько текущий pipeline помогает удерживать визуальную непрерывность в серии из 20 независимых Gemini-generated Frames.

## Подготовка

1. Создайте или откройте проект.
2. Создайте Character, Outfit, Location и StyleProfile.
3. Загрузите нужные references.
4. Проведите каждый reference через lifecycle:

```text
DRAFT -> APPROVED -> LOCKED
```

5. На экране `Сводка проекта` выберите персонажа, outfit, локацию, опциональный location angle и style profile.
6. Нажмите `Подготовить benchmark`.

Приложение создаст сцену `Consistency Benchmark` и 20 Frames с разными:

- camera distance;
- pose;
- character orientation;
- expression;
- movement;
- prop interaction;
- target panel geometry.

Повторное нажатие не дублирует уже созданные frame sequence.

Каждый созданный benchmark frame получает явный контекст кадра: selected character, selected location, selected location angle и selected style. Story State сцены фиксирует outfit, базовую эмоцию, волосы, held prop и стартовые environment keys.

## Geometry Cases

Benchmark intentionally includes:

- wide establishing panel;
- normal landscape;
- close-up landscape;
- near-square panel;
- portrait panel;
- cinematic wide panel;
- ultra-wide crop-risk panel.

Preview каждого кадра должен показывать:

- `ЦЕЛЕВАЯ PANEL`;
- `ЗАПРОС GEMINI`;
- `ПОСТОБРАБОТКА`.

Если target ratio отличается от Gemini request ratio, prompt должен содержать `COMPOSITION SAFE AREA`.

## Запуск Реального Gemini Benchmark

1. Установите `GEMINI_API_KEY` в `.env`.
2. Запустите приложение:

```bash
npm run dev
```

3. Для каждого frame:
   - откройте preview;
   - проверьте resolved references и warnings;
   - используйте `Draft`, если нужно проверить композицию при неполном canon;
   - используйте `Production`, когда blocking warnings устранены;
   - оцените результат в панели `Проверка`;
   - закрепите только приемлемый результат.

Не закрепляйте frame, если он ломает canon. Previous-frame continuity подключается только после `LOCKED`.

Production generation должна быть заблокирована, если отсутствует обязательный locked canonical reference для персонажа, outfit, локации/ракурса или стиля.

## QC Rubric

Оценивайте каждый кадр по шкале:

```text
PASS
WARN
FAIL
```

Минимальные dimensions для оценки:

- character identity;
- face proportions;
- apparent age;
- hair;
- outfit;
- body proportions;
- recurring location architecture;
- prop continuity;
- lighting continuity;
- style consistency;
- composition safety for future crop.

## Что Считать Успехом

Успех benchmark не означает, что все 20 изображений идеальны.

Успех означает, что:

- запросы воспроизводимы из local state;
- warnings видны до генерации;
- provenance сохраняет prompt, references, state и geometry;
- human reviewer может понять, почему кадр прошел или провалился;
- слабое место можно отнести к reference, resolver, prompt, geometry, provider или будущему repair workflow.
