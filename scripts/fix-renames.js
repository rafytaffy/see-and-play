import fs from 'fs';
import path from 'path';

const dirs = [
  'C:/Users/mail/see-and-play/public/videos',
  'g:/My Drive/Projects/Programming/See and Play/public/videos'
];

const renames = {
  'ant_2.mp4': 'elephant.mp4',
  'horse_2.mp4': 'seahorse.mp4',
  'cat.mp4': 'caterpillar.mp4',
  'cat_2.mp4': 'caterpillar_2.mp4',
  'cat_3.mp4': 'cat.mp4',
  'pig.mp4': 'pigeon.mp4',
  'pig_2.mp4': 'pig.mp4'
};

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const [oldName, newName] of Object.entries(renames)) {
    const oldP = path.join(dir, oldName);
    const newP = path.join(dir, newName);
    if (fs.existsSync(oldP)) {
      console.log(`Fixing ${oldName} -> ${newName} in ${dir}`);
      fs.renameSync(oldP, newP);
    }
  }
}
