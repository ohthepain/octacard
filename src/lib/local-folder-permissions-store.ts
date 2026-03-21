/**
 * IndexedDB persistence for extra local folder permissions (FileSystemDirectoryHandle per id).
 * Library root handle is not stored here (session + user re-grant on reload).
 */
import { createStore, del, get, keys, set } from "idb-keyval";

const DB_NAME = "octacard-local-folder-permissions";
const STORE_NAME = "handles";

const store = createStore(DB_NAME, STORE_NAME);

export async function saveLocalFolderPermissionHandle(
  id: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await set(id, handle, store);
}

export async function getLocalFolderPermissionHandle(
  id: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  return get<FileSystemDirectoryHandle>(id, store);
}

export async function deleteLocalFolderPermissionHandle(id: string): Promise<void> {
  await del(id, store);
}

export async function listLocalFolderPermissionIds(): Promise<string[]> {
  const k = await keys<string>(store);
  return k;
}
