import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videosDir = path.resolve(__dirname, '../public/videos');
const catalogPath = path.resolve(__dirname, '../public/videos-list.json');

// Emojis for common animals
const emojis = {
  alpaca: '🦙',
  goat: '🐐',
  bat: '🦇',
  dolphin: '🐬',
  bear: '🐻',
  hippo: '🦛',
  jellyfish: '🪼',
  meerkat: '🦦',
  monkey: '🐒',
  peacock: '🦚',
  peacocks: '🦚',
  raccoon: '🦝',
  skunk: '🦨',
  chameleon: '🦎',
  cheetah: '🐆',
  alligator: '🐊',
  ant: '🐜',
  beaver: '🦫',
  bird: '🐦',
  bunny: '🐰',
  butterfly: '🦋',
  camel: '🐫',
  caterpillar: '🐛',
  cow: '🐄',
  crab: '🦀',
  donkey: '🫏',
  grasshopper: '🦗',
  horse: '🐎',
  kangaroo: '🦘',
  koala: '🐨',
  ladybug: '🐞',
  lion: '🦁',
  llama: '🦙',
  lobster: '🦞',
  panda: '🐼',
  parrot: '🦜',
  penguin: '🐧',
  seahorse: '🌊',
  sheep: '🐑',
  shrimp: '🦐',
  snail: '🐌',
  turkey: '🦃',
  turtle: '🐢',
  walrus: '🦭',
  bee: '🐝',
  deer: '🦌',
  elephant: '🐘',
  giraffe: '🦒',
  hamster: '🐹',
  mouse: '🐭',
  squid: '🦑',
  whale: '🐳',
  duck: '🦆',
  duckling: '🦆',
  firefly: '🪰',
  fox: '🦊',
  frog: '🐸',
  hedgehog: '🦔',
  hummingbird: '🐦',
  leopard: '🐆',
  cat: '🐱',
  fish: '🐟',
  orca: '🐋',
  otter: '🦦',
  owl: '🦉',
  pigeon: '🐦',
  flamingo: '🦩',
  pig: '🐷',
  platypus: '🦦',
  puppy: '🐶',
  dog: '🐶',
  octopus: '🐙',
  rhino: '🦏',
  seal: '🦭',
  shark: '🦈',
  sloth: '🦥',
  snake: '🐍',
  spider: '🕷️',
  wolf: '🐺',
  chick: '🐥',
  zebra: '🦓',
  clam: '🦪',
  dragon: '🐉',
  eel: '🐍',
  pelican: '🐦',
  tiger: '🐯'
};

function getCleanName(filename) {
  // Remove suffix pattern like _202607302154.mp4 or _202607302154_2.mp4
  let name = filename.replace(/_202607302154(_\d+)?\.mp4$/, '');
  name = name.replace(/\.mp4$/, '');
  // Replace underscores and hyphens with spaces
  name = name.replace(/[_-]/g, ' ');
  // Remove descriptors
  name = name.replace(/\b(figurine|animates|animation|character|toy|doing|movement|animal|waddling|scuttling|gliding|crawling|swimming|pulsing|bobbing)\b/gi, '');
  // Clean up double spaces
  name = name.replace(/\s+/g, ' ').trim();
  // Title case
  return name.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}

const files = fs.readdirSync(videosDir).filter(file => file.endsWith('.mp4'));

const catalog = files.map(file => {
  const cleanName = getCleanName(file);
  // Find emoji based on words in the name
  let emoji = '🎬';
  const words = cleanName.toLowerCase().split(' ');
  for (const word of words) {
    if (emojis[word]) {
      emoji = emojis[word];
      break;
    }
  }

  return {
    id: cleanName.toLowerCase().replace(/\s+/g, '_'),
    label: `${cleanName} ${emoji}`,
    path: `videos/${file}`,
    defaultName: cleanName
  };
});

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
console.log(`Generated video catalog at ${catalogPath} with ${catalog.length} items.`);
