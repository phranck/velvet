import assert from "node:assert/strict";
import { test } from "bun:test";

type FileSystemAccess = {
  saveConfigurationFileHandle: (
    handle: FileSystemFileHandle,
    environment: unknown,
  ) => Promise<boolean>;
  supportsFileSystemAccess: (value: unknown) => boolean;
  writeConfigurationFile: (
    handle: {
      createWritable: () => Promise<{
        write: (source: string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    },
    source: string,
  ) => Promise<void>;
};

async function loadFileSystemAccess(): Promise<FileSystemAccess | null> {
  try {
    return (await import("../src/configurator/file-system-access.js")) as unknown as FileSystemAccess;
  } catch {
    return null;
  }
}

test("writes configuration through an existing file handle", async () => {
  const fileSystemAccess = await loadFileSystemAccess();
  assert.ok(fileSystemAccess, "expected file-system access helpers");

  const events: string[] = [];
  const handle = {
    async createWritable() {
      events.push("create");
      return {
        async write(source: string) {
          events.push(`write:${source}`);
        },
        async close() {
          events.push("close");
        },
      };
    },
  };

  await fileSystemAccess.writeConfigurationFile(handle, "theme: Cloudy Custom\n");

  assert.deepEqual(events, [
    "create",
    "write:theme: Cloudy Custom\n",
    "close",
  ]);
});

test("requires a native save picker and IndexedDB for direct file saves", async () => {
  const fileSystemAccess = await loadFileSystemAccess();
  assert.ok(fileSystemAccess, "expected file-system access helpers");

  assert.equal(
    fileSystemAccess.supportsFileSystemAccess({
      showSaveFilePicker: () => undefined,
      indexedDB: {},
    }),
    true,
  );
  assert.equal(
    fileSystemAccess.supportsFileSystemAccess({ indexedDB: {} }),
    false,
  );
  assert.equal(
    fileSystemAccess.supportsFileSystemAccess({
      showSaveFilePicker: () => undefined,
    }),
    false,
  );
});

test("keeps a successful save usable when the browser cannot clone its file handle", async () => {
  const fileSystemAccess = await loadFileSystemAccess();
  assert.ok(fileSystemAccess, "expected file-system access helpers");

  let databaseClosed = false;
  const transaction = {
    objectStore() {
      return {
        put() {
          throw new DOMException("The object can not be cloned.", "DataCloneError");
        },
      };
    },
  };
  const database = {
    transaction() {
      return transaction;
    },
    close() {
      databaseClosed = true;
    },
  };
  const indexedDB = {
    open() {
      const request: { result: typeof database; onsuccess?: () => void } = {
        result: database,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };

  assert.equal(
    await fileSystemAccess.saveConfigurationFileHandle(
      {} as FileSystemFileHandle,
      {
        indexedDB,
        showSaveFilePicker: () => Promise.reject(new Error("not used")),
      },
    ),
    false,
  );
  assert.equal(databaseClosed, true);
});
