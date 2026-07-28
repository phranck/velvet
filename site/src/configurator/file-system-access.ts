const DATABASE_NAME = "velvet.configurator.files.v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "handles";
const ACTIVE_CONFIGURATION_KEY = "active-configuration";

interface FileSystemAccessEnvironment {
  indexedDB?: IDBFactory;
  showSaveFilePicker?: (
    options: SaveFilePickerOptions,
  ) => Promise<FileSystemFileHandle>;
}

interface SaveFilePickerOptions {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

interface PermissionAwareFileHandle extends FileSystemFileHandle {
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
}

export function supportsFileSystemAccess(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const environment = value as FileSystemAccessEnvironment;
  return (
    typeof environment.showSaveFilePicker === "function" &&
    "indexedDB" in environment
  );
}

export async function pickConfigurationFile(
  filename: string,
): Promise<FileSystemFileHandle> {
  const environment = getEnvironment();
  if (!supportsFileSystemAccess(environment)) {
    throw new Error("Direct file saves are unavailable in this browser.");
  }

  return environment.showSaveFilePicker!({
    suggestedName: filename,
    types: [
      {
        description: "YAML configuration",
        accept: {
          "application/yaml": [".yml", ".yaml"],
          "text/yaml": [".yml", ".yaml"],
        },
      },
    ],
  });
}

export async function writeConfigurationFile(
  handle: Pick<FileSystemFileHandle, "createWritable">,
  source: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(source);
  await writable.close();
}

export async function requestWritePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  const permissionHandle = handle as PermissionAwareFileHandle;
  if (typeof permissionHandle.requestPermission !== "function") return true;
  return (await permissionHandle.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function loadConfigurationFileHandle(): Promise<FileSystemFileHandle | null> {
  const environment = getEnvironment();
  if (!supportsFileSystemAccess(environment)) return null;

  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase(environment.indexedDB!);
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await requestResult(
      transaction.objectStore(STORE_NAME).get(ACTIVE_CONFIGURATION_KEY),
    );
    return isFileHandle(value) ? value : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function saveConfigurationFileHandle(
  handle: FileSystemFileHandle,
  environment: FileSystemAccessEnvironment = getEnvironment(),
): Promise<boolean> {
  if (!supportsFileSystemAccess(environment)) return false;

  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase(environment.indexedDB!);
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, ACTIVE_CONFIGURATION_KEY);
    await transactionComplete(transaction);
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

function getEnvironment(): FileSystemAccessEnvironment {
  return globalThis as unknown as FileSystemAccessEnvironment;
}

function isFileHandle(value: unknown): value is FileSystemFileHandle {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FileSystemFileHandle).createWritable === "function"
  );
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
