import { NextRequest, NextResponse } from "next/server"
import type { LessonMetadata } from "@/lib/lesson-data"

type Store = Record<string, LessonMetadata>

// In-memory store for serverless environments
let inMemoryStore: Store = {}

async function loadStore(): Promise<Store> {
  // Try file system first (local development)
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    const DATA_DIR = path.join(process.cwd(), "data")
    const STORE_PATH = path.join(DATA_DIR, "lessons.json")
    
    try {
      const raw = await fs.readFile(STORE_PATH, "utf8")
      const fileStore = raw ? (JSON.parse(raw) as Store) : {}
      inMemoryStore = fileStore
      return fileStore
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return inMemoryStore
      }
      // File system error, fall back to in-memory
      return inMemoryStore
    }
  } catch {
    // File system not available (serverless environment)
    return inMemoryStore
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const store = await loadStore()
  const metadata = store[id]

  if (!metadata) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(metadata)
}


