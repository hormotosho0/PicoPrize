import { NextRequest, NextResponse } from "next/server"
import type { LessonMetadata } from "@/lib/lesson-data"

type Store = Record<string, LessonMetadata>

// In-memory store for serverless environments (Vercel doesn't allow file system writes)
// In production, consider using Vercel KV, a database, or external storage
let inMemoryStore: Store = {}

// Try to load from file system if available (for local development)
async function loadFromFileSystem(): Promise<Store | null> {
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    const DATA_DIR = path.join(process.cwd(), "data")
    const STORE_PATH = path.join(DATA_DIR, "lessons.json")
    
    try {
      const raw = await fs.readFile(STORE_PATH, "utf8")
      return raw ? (JSON.parse(raw) as Store) : {}
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return {}
      }
      return null
    }
  } catch {
    // File system not available (serverless environment)
    return null
  }
}

async function saveToFileSystem(store: Store): Promise<boolean> {
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    const DATA_DIR = path.join(process.cwd(), "data")
    const STORE_PATH = path.join(DATA_DIR, "lessons.json")
    
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8")
    return true
  } catch {
    // File system not available (serverless environment)
    return false
  }
}

async function ensureStore(): Promise<Store> {
  // Try file system first (local development)
  const fileStore = await loadFromFileSystem()
  if (fileStore !== null) {
    inMemoryStore = fileStore
    return fileStore
  }
  
  // Fall back to in-memory store (serverless/production)
  return inMemoryStore
}

async function saveStore(store: Store) {
  // Try to save to file system (local development)
  const saved = await saveToFileSystem(store)
  
  // Always update in-memory store
  inMemoryStore = store
  
  if (!saved) {
    // In serverless, we can't persist to disk, so we rely on in-memory store
    // Note: This means data is lost on function restart. For production,
    // consider using Vercel KV, a database, or external storage service.
  }
}

export async function GET() {
  try {
    const store = await ensureStore()
    return NextResponse.json(store)
  } catch (err) {
    console.error("Error reading lessons store:", err)
    return NextResponse.json({ error: "Failed to read metadata" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, metadata, aliases } = body as {
      id?: string
      metadata: LessonMetadata
      aliases?: string[]
    }

    if (!metadata || typeof metadata !== "object") {
      return NextResponse.json({ error: "Invalid metadata" }, { status: 400 })
    }

    const primaryId = id && typeof id === "string" ? id : `lesson-${Date.now()}`

    const store = await ensureStore()
    store[primaryId] = metadata

    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (alias && typeof alias === "string") {
          store[alias] = metadata
        }
      }
    }

    await saveStore(store)

    return NextResponse.json({ id: primaryId })
  } catch (err) {
    console.error("Error saving lesson metadata:", err)
    return NextResponse.json({ error: "Failed to save metadata" }, { status: 500 })
  }
}


