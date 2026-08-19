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

// Export all trained toys & AI dataset to a downloadable JSON file
export async function exportToysPack() {
  const toys = await getAllToys();
  const datasetJson = await getClassifierDataset();

  const payload = {
    version: 1,
    exportedAt: Date.now(),
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

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `see-and-play-toys-pack-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import a toys pack JSON payload into local IndexedDB
export async function importToysPack(packData) {
  if (!packData || !Array.isArray(packData.toys)) {
    throw new Error("Invalid toys pack file format.");
  }

  for (const toy of packData.toys) {
    await saveToy(toy);
  }

  if (packData.datasetJson) {
    // Merge datasets if an existing local dataset exists
    const currentDatasetJson = await getClassifierDataset();
    if (currentDatasetJson) {
      try {
        const existingObj = JSON.parse(currentDatasetJson);
        const importedObj = JSON.parse(packData.datasetJson);
        const mergedObj = { ...existingObj, ...importedObj };
        await saveClassifierDataset(JSON.stringify(mergedObj));
      } catch (e) {
        await saveClassifierDataset(packData.datasetJson);
      }
    } else {
      await saveClassifierDataset(packData.datasetJson);
    }
  }

  return packData.toys.length;
}

// Automatically upload the local database to the Vite dev server / cloud sync endpoint
export async function syncToysWithViteServer(targetUrl = '/api/save-toys') {
  const toys = await getAllToys();
  const datasetJson = await getClassifierDataset();
  
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
