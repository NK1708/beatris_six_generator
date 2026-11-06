# Confirmed Frame Lock

Studio uses `POST /api/frames/:frameId/lock-confirmed`:

```json
{
  "expectedGenerationId": "selected-generation-id",
  "expectedTargetRevision": 3
}
```

Both fields are required. The ID must be nonempty and the revision a positive
integer. The body is strict. Invalid input returns 400 `VALIDATION_ERROR`.

The client sends values captured when the human confirmation dialog opened.
The server compares them with current facts inside the write transaction and
fences the UPDATE by selection, Target revision/document, Frame status and Cast
revision. Existing SUCCESS, ownership, file, snapshot and metadata checks remain.
The operation does not change selection, Target, Generation snapshots or provenance.

A changed selection/revision returns 409 `FRAME_LOCK_READINESS_STALE`.
The client refreshes state and requires a new explicit confirmation. It never
retries with newer values automatically. Already-LOCKED and other integrity
failures retain the existing 409 `FRAME_LOCK_BLOCKED` behavior.

Legacy `POST /api/frames/:frameId/lock` remains available to old clients with its
existing lock-current semantics. Studio never falls back to it. A 404/405 from
the confirmed route is treated as an API compatibility/unavailability error.

A lost response does not prove that Lock failed. Studio queries the current
project/Frame state and displays the result; it does not optimistically mark
LOCKED or automatically repeat the POST.

The atomic guarantee covers the SQLite database and supported application
mutations. Filesystem checks cannot be atomic with a SQLite commit: external
deletion of a generation image remains outside that guarantee. SQLite write
contention can abort/timeout a transaction; it must not cause a retry using a
different confirmation. No schema migration is required by this API.
