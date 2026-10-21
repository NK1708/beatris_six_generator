import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const statements = [
  `CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rootPath" TEXT NOT NULL,
    "defaultAspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "defaultResolution" TEXT NOT NULL DEFAULT '1536x864',
    "defaultProvider" TEXT NOT NULL DEFAULT 'gemini',
    "defaultDraftModel" TEXT NOT NULL DEFAULT 'gemini-3.1-flash-image',
    "defaultProductionModel" TEXT NOT NULL DEFAULT 'gemini-3.1-flash-image',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Project_slug_key" ON "Project"("slug")`,
  `CREATE TABLE IF NOT EXISTS "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "age" TEXT NOT NULL DEFAULT '',
    "height" TEXT NOT NULL DEFAULT '',
    "bodyDescription" TEXT NOT NULL DEFAULT '',
    "faceDescription" TEXT NOT NULL DEFAULT '',
    "hairDescription" TEXT NOT NULL DEFAULT '',
    "distinctiveFeatures" TEXT NOT NULL DEFAULT '',
    "immutableFeatures" TEXT NOT NULL DEFAULT '',
    "masterReferenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generationStrategy" TEXT NOT NULL DEFAULT 'NEW_COMPOSITION',
    "continuityEditContract" TEXT NOT NULL DEFAULT '{"changes":[],"forbidden":[],"allowedChanges":[]}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Character_projectId_slug_key" ON "Character"("projectId", "slug")`,
  `CREATE TABLE IF NOT EXISTS "CharacterReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterReference_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CharacterReference_characterId_code_key" ON "CharacterReference"("characterId", "code")`,
  `CREATE TABLE IF NOT EXISTS "Outfit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "immutableFeatures" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "masterReferenceId" TEXT,
    CONSTRAINT "Outfit_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Outfit_characterId_slug_key" ON "Outfit"("characterId", "slug")`,
  `CREATE TABLE IF NOT EXISTS "OutfitReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outfitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutfitReference_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "Outfit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "OutfitReference_outfitId_code_key" ON "OutfitReference"("outfitId", "code")`,
  `CREATE TABLE IF NOT EXISTS "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "architectureDescription" TEXT NOT NULL DEFAULT '',
    "immutableFeatures" TEXT NOT NULL DEFAULT '',
    "masterReferenceId" TEXT,
    "floorPlanReferenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    CONSTRAINT "Location_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Location_projectId_slug_key" ON "Location"("projectId", "slug")`,
  `CREATE TABLE IF NOT EXISTS "LocationReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationReference_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LocationReference_locationId_code_key" ON "LocationReference"("locationId", "code")`,
  `CREATE TABLE IF NOT EXISTS "LocationAngle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cameraPositionDescription" TEXT NOT NULL DEFAULT '',
    "referenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    CONSTRAINT "LocationAngle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LocationAngle_locationId_slug_key" ON "LocationAngle"("locationId", "slug")`,
  `CREATE TABLE IF NOT EXISTS "LocationAngleReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationAngleId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VIEW',
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationAngleReference_locationAngleId_fkey" FOREIGN KEY ("locationAngleId") REFERENCES "LocationAngle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LocationAngleReference_locationAngleId_code_key" ON "LocationAngleReference"("locationAngleId", "code")`,
  `CREATE TABLE IF NOT EXISTS "Prop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "masterReferenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    CONSTRAINT "Prop_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Prop_projectId_slug_key" ON "Prop"("projectId", "slug")`,
  `CREATE TABLE IF NOT EXISTS "StyleProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "linework" TEXT NOT NULL DEFAULT '',
    "anatomy" TEXT NOT NULL DEFAULT '',
    "faces" TEXT NOT NULL DEFAULT '',
    "shading" TEXT NOT NULL DEFAULT '',
    "colorPalette" TEXT NOT NULL DEFAULT '',
    "backgroundDetail" TEXT NOT NULL DEFAULT '',
    "lighting" TEXT NOT NULL DEFAULT '',
    "cameraLanguage" TEXT NOT NULL DEFAULT '',
    "negativeRules" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    CONSTRAINT "StyleProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StyleProfile_projectId_slug_key" ON "StyleProfile"("projectId", "slug")`,
  `CREATE TABLE IF NOT EXISTS "StyleReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleProfileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StyleReference_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StyleReference_styleProfileId_code_key" ON "StyleReference"("styleProfileId", "code")`,
  `CREATE TABLE IF NOT EXISTS "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "locationId" TEXT,
    "styleProfileId" TEXT,
    "timeDescription" TEXT NOT NULL DEFAULT '',
    "previousSceneId" TEXT,
    CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Scene_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Scene_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Scene_projectId_sequence_key" ON "Scene"("projectId", "sequence")`,
  `CREATE TABLE IF NOT EXISTS "SceneCharacter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SceneCharacter_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SceneCharacter_sceneId_characterId_key" ON "SceneCharacter"("sceneId", "characterId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SceneCharacter_sceneId_order_key" ON "SceneCharacter"("sceneId", "order")`,
  `CREATE TABLE IF NOT EXISTS "StoryState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryState_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StoryState_sceneId_key" ON "StoryState"("sceneId")`,
  `CREATE TABLE IF NOT EXISTS "Frame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "frameCode" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CG',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "camera" TEXT NOT NULL DEFAULT '',
    "composition" TEXT NOT NULL DEFAULT '',
    "lighting" TEXT NOT NULL DEFAULT '',
    "expressionNotes" TEXT NOT NULL DEFAULT '',
    "continuityNotes" TEXT NOT NULL DEFAULT '',
    "previousFrameId" TEXT,
    "selectedGenerationId" TEXT,
    "locationId" TEXT,
    "locationAngleId" TEXT,
    "styleProfileId" TEXT,
    "targetWidth" INTEGER,
    "targetHeight" INTEGER,
    "targetAspectRatio" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Frame_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Frame_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Frame_locationAngleId_fkey" FOREIGN KEY ("locationAngleId") REFERENCES "LocationAngle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Frame_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Frame_frameCode_key" ON "Frame"("frameCode")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Frame_sceneId_sequence_key" ON "Frame"("sceneId", "sequence")`,
  `CREATE TABLE IF NOT EXISTS "FrameCharacter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frameId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "FrameCharacter_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "Frame" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FrameCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FrameCharacter_frameId_characterId_key" ON "FrameCharacter"("frameId", "characterId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FrameCharacter_frameId_order_key" ON "FrameCharacter"("frameId", "order")`,
  `CREATE TABLE IF NOT EXISTS "FrameCharacterReferenceSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frameCharacterId" TEXT NOT NULL,
    "characterReferenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "FrameCharacterReferenceSelection_frameCharacterId_fkey" FOREIGN KEY ("frameCharacterId") REFERENCES "FrameCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FrameCharacterReferenceSelection_characterReferenceId_fkey" FOREIGN KEY ("characterReferenceId") REFERENCES "CharacterReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FrameCharacterReferenceSelection_frameCharacterId_characterReferenceId_key" ON "FrameCharacterReferenceSelection"("frameCharacterId", "characterReferenceId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FrameCharacterReferenceSelection_frameCharacterId_order_key" ON "FrameCharacterReferenceSelection"("frameCharacterId", "order")`,
  `CREATE TABLE IF NOT EXISTS "Screen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Screen_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Screen_code_key" ON "Screen"("code")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Screen_sceneId_sequence_key" ON "Screen"("sceneId", "sequence")`,
  `CREATE TABLE IF NOT EXISTS "Panel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "screenId" TEXT NOT NULL,
    "frameId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "x" INTEGER,
    "y" INTEGER,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "zIndex" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Panel_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Panel_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "Frame" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Panel_screenId_sequence_key" ON "Panel"("screenId", "sequence")`,
  `CREATE TABLE IF NOT EXISTS "Generation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frameId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "outputFilePath" TEXT NOT NULL DEFAULT '',
    "resolution" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "estimatedCost" REAL,
    "targetWidth" INTEGER,
    "targetHeight" INTEGER,
    "targetAspectRatio" REAL,
    "requiresCrop" BOOLEAN NOT NULL DEFAULT false,
    "cropStrategy" TEXT NOT NULL DEFAULT 'NONE',
    "parentGenerationId" TEXT,
    "generationType" TEXT NOT NULL DEFAULT 'INITIAL',
    "rawMetadata" TEXT,
    "storyStateSnapshot" TEXT NOT NULL,
    "frameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Generation_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "Frame" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "GenerationReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generationId" TEXT NOT NULL,
    "referenceKind" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    CONSTRAINT "GenerationReference_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ModelPricing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "estimatedCost" REAL NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ModelPricing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ModelPricing_projectId_provider_model_key" ON "ModelPricing"("projectId", "provider", "model")`
];

const registryStatements = [
  `CREATE TABLE IF NOT EXISTS "ProjectRegistryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectPath" TEXT NOT NULL,
    "lastOpenedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRegistryEntry_projectPath_key" ON "ProjectRegistryEntry"("projectPath")`
];

export async function initSqliteSchema(databaseUrl?: string): Promise<void> {
  await executeStatements(statements, databaseUrl);
  await applyProjectMigrations(databaseUrl);
}

export async function initAppRegistrySchema(databaseUrl?: string): Promise<void> {
  await executeStatements(registryStatements, databaseUrl);
}

async function executeStatements(input: string[], databaseUrl?: string): Promise<void> {
  const prisma = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
  try {
    for (const statement of input) {
      await prisma.$executeRawUnsafe(statement);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function applyProjectMigrations(databaseUrl?: string): Promise<void> {
  const prisma = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
  try {
    await ensureColumn(prisma, "Frame", "locationId", `ALTER TABLE "Frame" ADD COLUMN "locationId" TEXT`);
    await ensureColumn(prisma, "Frame", "locationAngleId", `ALTER TABLE "Frame" ADD COLUMN "locationAngleId" TEXT`);
    await ensureColumn(prisma, "Frame", "styleProfileId", `ALTER TABLE "Frame" ADD COLUMN "styleProfileId" TEXT`);
    await ensureColumn(prisma, "Frame", "generationStrategy", `ALTER TABLE "Frame" ADD COLUMN "generationStrategy" TEXT NOT NULL DEFAULT 'NEW_COMPOSITION'`);
    await ensureColumn(prisma, "Frame", "continuityEditContract", `ALTER TABLE "Frame" ADD COLUMN "continuityEditContract" TEXT NOT NULL DEFAULT '{"changes":[],"forbidden":[],"allowedChanges":[]}'`);
    await ensureColumn(prisma, "Scene", "styleProfileId", `ALTER TABLE "Scene" ADD COLUMN "styleProfileId" TEXT`);
    await ensureColumn(prisma, "Outfit", "immutableFeatures", `ALTER TABLE "Outfit" ADD COLUMN "immutableFeatures" TEXT NOT NULL DEFAULT ''`);
    await ensureColumn(prisma, "CharacterReference", "createdAt", `ALTER TABLE "CharacterReference" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "CharacterReference", "updatedAt", `ALTER TABLE "CharacterReference" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "OutfitReference", "createdAt", `ALTER TABLE "OutfitReference" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "OutfitReference", "updatedAt", `ALTER TABLE "OutfitReference" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "LocationReference", "createdAt", `ALTER TABLE "LocationReference" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "LocationReference", "updatedAt", `ALTER TABLE "LocationReference" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "LocationAngleReference", "createdAt", `ALTER TABLE "LocationAngleReference" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "LocationAngleReference", "updatedAt", `ALTER TABLE "LocationAngleReference" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "StyleReference", "createdAt", `ALTER TABLE "StyleReference" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await ensureColumn(prisma, "StyleReference", "updatedAt", `ALTER TABLE "StyleReference" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Frame_locationId_idx" ON "Frame"("locationId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Frame_locationAngleId_idx" ON "Frame"("locationAngleId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Frame_styleProfileId_idx" ON "Frame"("styleProfileId")`);
  } finally {
    await prisma.$disconnect();
  }
}

async function ensureColumn(prisma: PrismaClient, table: string, column: string, alterStatement: string): Promise<void> {
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  if (!columns.some((item) => item.name === column)) {
    await prisma.$executeRawUnsafe(alterStatement);
  }
}
