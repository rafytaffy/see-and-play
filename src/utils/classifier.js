import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
import { saveClassifierDataset, getClassifierDataset, saveToy, getAllToys, deleteToy } from './db';

let mobilenetModel = null;
let classifier = null;
let isInitializing = false;
let isInitialized = false;

function datasetToJSON(dataset) {
  const datasetObj = {};
  Object.keys(dataset).forEach((key) => {
    const tensor = dataset[key];
    const data = tensor.dataSync();
    const shape = tensor.shape;
    datasetObj[key] = { data: Array.from(data), shape };
  });
  return JSON.stringify(datasetObj);
}

function datasetFromJSON(jsonStr) {
  try {
    const datasetObj = JSON.parse(jsonStr);
    const dataset = {};
    Object.keys(datasetObj).forEach((key) => {
      const { data, shape } = datasetObj[key];
      dataset[key] = tf.tensor2d(data, shape);
    });
    return dataset;
  } catch (e) {
    console.error('Error parsing dataset from JSON', e);
    return null;
  }
}

export async function initClassifier() {
  if (isInitialized) return { mobilenetModel, classifier };
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { mobilenetModel, classifier };
  }

  isInitializing = true;
  try {
    await tf.ready();
    mobilenetModel = await mobilenet.load({ version: 1, alpha: 1.0 });
    classifier = knnClassifier.create();
    
    // Attempt to load preloaded catalog from the server (GitHub Pages)
    const base = import.meta.env.BASE_URL || '/';
    const response = await fetch(`${base}preloaded-toys.json`).catch(() => null);
    
    let preloadedDataset = null;
    
    if (response && response.ok) {
      try {
        const catalog = await response.json();
        
        // Remove old built-in toys from IndexedDB to avoid stale items
        const currentLocalToys = await getAllToys();
        for (const toy of currentLocalToys) {
          if (toy.isBuiltIn) {
            await deleteToy(toy.id);
          }
        }
        
        // Save new preloaded toys metadata to DB
        if (catalog.toys && Array.isArray(catalog.toys)) {
          for (const toy of catalog.toys) {
            await saveToy(toy);
          }
        }
        
        if (catalog.datasetJson) {
          preloadedDataset = datasetFromJSON(catalog.datasetJson);
        }
      } catch (err) {
        console.error("Failed to parse preloaded catalog:", err);
      }
    }

    // Load local dataset
    const savedDatasetJson = await getClassifierDataset();
    const localDataset = savedDatasetJson ? datasetFromJSON(savedDatasetJson) : null;
    
    // Merge datasets (local overrides preloaded if there's an ID overlap)
    const combinedDataset = {};
    
    if (preloadedDataset) {
      Object.assign(combinedDataset, preloadedDataset);
    }
    if (localDataset) {
      Object.assign(combinedDataset, localDataset);
    }
    
    if (Object.keys(combinedDataset).length > 0) {
      classifier.setClassifierDataset(combinedDataset);
    }
    
    isInitialized = true;
  } catch (e) {
    console.error('Failed to initialize classifier', e);
  } finally {
    isInitializing = false;
  }
  return { mobilenetModel, classifier };
}

export async function addExample(label, imageElement) {
  const { mobilenetModel, classifier } = await initClassifier();
  if (!mobilenetModel || !classifier) return;

  const logits = mobilenetModel.infer(imageElement, true);
  classifier.addExample(logits, label);
  logits.dispose();
}

/**
 * Zero-Shot MobileNet ImageNet Classification
 */
export async function classifyZeroShot(imageElement) {
  const { mobilenetModel } = await initClassifier();
  if (!mobilenetModel) return null;
  try {
    const predictions = await mobilenetModel.classify(imageElement);
    return predictions;
  } catch (e) {
    console.error('Zero-shot classification error:', e);
    return null;
  }
}

export async function predict(imageElement) {
  const { mobilenetModel, classifier } = await initClassifier();
  if (!mobilenetModel || !classifier) return null;

  // 1. Try KNN classifier predictions if any classes are trained
  if (classifier.getNumClasses() > 0) {
    const logits = mobilenetModel.infer(imageElement, true);
    const result = await classifier.predictClass(logits);
    logits.dispose();
    return { type: 'knn', ...result };
  }

  // 2. Out-of-the-box Zero-Shot MobileNet classification fallback!
  try {
    const predictions = await mobilenetModel.classify(imageElement);
    if (predictions && predictions.length > 0) {
      const top = predictions[0];
      return {
        type: 'zeroshot',
        label: top.className,
        probability: top.probability,
        rawPredictions: predictions
      };
    }
  } catch (e) {
    console.error('Zero-shot fallback error:', e);
  }

  return null;
}

export async function saveClassifier() {
  if (!classifier) return;
  const dataset = classifier.getClassifierDataset();
  if (!dataset || Object.keys(dataset).length === 0) {
    await saveClassifierDataset(null);
    return;
  }
  const datasetJson = datasetToJSON(dataset);
  await saveClassifierDataset(datasetJson);
}

export async function clearClass(label) {
  if (!classifier) return;
  try {
    classifier.clearClass(label);
    await saveClassifier();
  } catch (e) {
    console.error('Error clearing class', label, e);
  }
}

export async function clearAll() {
  if (!classifier) return;
  classifier.clearAll();
  await saveClassifier();
}

export function getNumClasses() {
  if (!classifier) return 0;
  return classifier.getNumClasses();
}
