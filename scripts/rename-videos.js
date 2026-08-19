import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videosDirs = [
  path.resolve(__dirname, '../public/videos'),
  path.resolve('g:/My Drive/Projects/Programming/See and Play/public/videos')
];

const animalKeywords = [
  'alpaca', 'alligator', 'ant', 'bat', 'beaver', 'bee', 'bear', 'bird', 'bunny', 'butterfly',
  'camel', 'cat', 'caterpillar', 'chameleon', 'cheetah', 'chick', 'clam', 'cow', 'crab',
  'deer', 'dog', 'dolphin', 'donkey', 'dragon', 'duckling', 'duck', 'eel', 'elephant',
  'firefly', 'fish', 'flamingo', 'fox', 'frog', 'giraffe', 'goat', 'grasshopper', 'hamster',
  'hedgehog', 'hippo', 'horse', 'hummingbird', 'jellyfish', 'kangaroo', 'koala', 'ladybug',
  'leopard', 'lion', 'llama', 'lobster', 'meerkat', 'monkey', 'mouse', 'octopus', 'orca',
  'otter', 'owl', 'panda', 'parrot', 'peacock', 'pelican', 'penguin', 'pig', 'platypus',
  'puppy', 'raccoon', 'rhino', 'seahorse', 'seal', 'shark', 'sheep', 'shrimp', 'skunk',
  'sloth', 'snail', 'snake', 'spider', 'squid', 'tiger', 'turkey', 'turtle', 'walrus',
  'whale', 'wolf', 'zebra'
];

function getSimplifiedName(filename) {
  let lower = filename.toLowerCase();

  // Find animal keyword
  let matchedAnimal = null;
  for (const keyword of animalKeywords) {
    // Check if filename contains the animal keyword
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(lower) || lower.includes(keyword)) {
      matchedAnimal = keyword;
      break;
    }
  }

  if (!matchedAnimal) {
    // Fallback: clean descriptors and numbers
    let clean = lower
      .replace(/_202607302154(_\d+)?\.mp4$/, '')
      .replace(/\.mp4$/, '')
      .replace(/[_-]/g, ' ')
      .replace(/\b(figurine|animates|animation|character|toy|doing|movement|animal|waddling|scuttling|gliding|crawling|swimming|pulsing|bobbing|cute|clay|blue|brown|cartoon)\b/g, '')
      .trim();
    clean = clean.split(' ').filter(Boolean)[0] || 'animal';
    matchedAnimal = clean;
  }

  return matchedAnimal;
}

for (const videosDir of videosDirs) {
  if (!fs.existsSync(videosDir)) continue;

  console.log(`Processing videos in ${videosDir}...`);
  const files = fs.readdirSync(videosDir).filter(file => file.endsWith('.mp4'));
  const nameCounts = {};

  for (const file of files) {
    const simplified = getSimplifiedName(file);
    nameCounts[simplified] = (nameCounts[simplified] || 0) + 1;
    const suffix = nameCounts[simplified] > 1 ? `_${nameCounts[simplified]}` : '';
    const newFilename = `${simplified}${suffix}.mp4`;

    const oldPath = path.join(videosDir, file);
    const newPath = path.join(videosDir, newFilename);

    if (oldPath !== newPath) {
      console.log(`Renaming: ${file} -> ${newFilename}`);
      fs.renameSync(oldPath, newPath);
    }
  }
}

console.log("Finished video renaming!");
