// Mínimo envoltorio de IndexedDB (sin dependencias). Lo usa la grabadora para no perder audio.

const DB = 'brixx-hub'
const VERSION = 1

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('grabacion_meta')) db.createObjectStore('grabacion_meta')
      if (!db.objectStoreNames.contains('grabacion_partes')) db.createObjectStore('grabacion_partes', { autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(store: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, modo)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req ? (req.result as T) : undefined)
    t.onerror = () => reject(t.error)
  })
}

export const idb = {
  guardar: (store: string, valor: unknown, clave?: IDBValidKey) => tx(store, 'readwrite', (s) => s.put(valor, clave)),
  leer: <T>(store: string, clave: IDBValidKey) => tx<T>(store, 'readonly', (s) => s.get(clave)),
  todos: <T>(store: string) => tx<T[]>(store, 'readonly', (s) => s.getAll()),
  vaciar: (store: string) => tx(store, 'readwrite', (s) => s.clear()),
}
