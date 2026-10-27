CREATE TABLE "FrameStoryState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frameId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "originType" TEXT NOT NULL,
    "sourceFrameId" TEXT,
    "sourceGenerationId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "explicitlyEditedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FrameStoryState_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "Frame" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FrameStoryState_frameId_key" ON "FrameStoryState"("frameId");
