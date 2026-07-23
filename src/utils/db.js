import { openDB } from 'idb';

const DB_NAME = 'see-and-play-db';
const DB_VERSION = 1;

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('toys')) {
        db.createObjectStore('toys', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('classifier')) {
        db.createObjectStore('classifier');
      }
    },
  });
}

export async function getAllToys() {
  const db = await getDB();
  return db.getAll('toys');
}

export async function saveToy(toy) {
  const db = await getDB();
  await db.put('toys', toy);
}

export async function deleteToy(id) {
  const db = await getDB();
  await db.delete('toys', id);
}

export async function saveClassifierDataset(datasetJson) {
  const db = await getDB();
  await db.put('classifier', datasetJson, 'dataset');
}

export async function getClassifierDataset() {
  const db = await getDB();
  return db.get('classifier', 'dataset');
}

// Automatically upload the local database to the Vite dev server
export async function syncToysWithViteServer(targetUrl = '/api/save-toys') {
  const toys = await getAllToys();
  const datasetJson = await getClassifierDataset();
  
  // We only sync built-in toys since uploaded Blobs are kept in local IndexedDB
  const payload = {
    toys: toys.map(t => ({
      id: t.id,
      name: t.name,
      mediaType: t.mediaType,
      isBuiltIn: t.isBuiltIn,
      mediaUrl: t.mediaUrl,
      addedAt: t.addedAt || Date.now()
    })),
    datasetJson
  };
  
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sync failed: ${errText || response.statusText}`);
  }
  
  return response.json();
}
