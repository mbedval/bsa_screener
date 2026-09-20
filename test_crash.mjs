import fs from 'fs';
import path from 'path';

const file = fs.readFileSync('frontend/src/visualizer/index.jsx', 'utf-8');
console.log(file);
