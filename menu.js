import { categories } from './menu/categories.js';
import { MenuAudio } from './menu/menu-audio.js';
import { MenuController } from './menu/menu-controller.js';

const controller = new MenuController({
  categories,
  audio: new MenuAudio()
});

controller.init();
