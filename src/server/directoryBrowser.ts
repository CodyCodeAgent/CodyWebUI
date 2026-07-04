import { readdir, realpath, stat } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

type DirectoryEntry = {
  name: string
  path: string
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function requestedPath(url: URL): string {
  const rawPath = url.searchParams.get('path')?.trim()
  if (!rawPath) return process.cwd() || homedir()
  if (rawPath === '~') return homedir()
  if (rawPath.startsWith('~/')) return resolve(homedir(), rawPath.slice(2))
  return resolve(rawPath)
}

export async function handleDirectoryList(url: URL, res: ServerResponse): Promise<void> {
  try {
    const targetPath = requestedPath(url)
    const targetStat = await stat(targetPath)
    if (!targetStat.isDirectory()) {
      setJson(res, 400, { error: 'Path is not a directory' })
      return
    }

    const currentPath = await realpath(targetPath)
    const rows = await readdir(currentPath, { withFileTypes: true })
    const directories: DirectoryEntry[] = rows
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: resolve(currentPath, entry.name),
      }))
      .sort((first, second) => first.name.localeCompare(second.name))

    setJson(res, 200, {
      result: {
        path: currentPath,
        parentPath: dirname(currentPath),
        directories,
      },
    })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to read directory'
    setJson(res, 400, { error: message })
  }
}
