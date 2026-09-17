import fs from 'fs';
import { createCanvas } from 'canvas';

// Generate clean PNG icon for extension
function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background gradient circle
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(1, '#0f172a');
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();

  // Radar symbol / pulse
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = Math.max(1, size / 16);
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/8, 0, Math.PI * 2);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
}

console.log('Generating extension icons...');
generateIcon(16, '/home/jmbx/apps/bsa_screener/extension/icons/icon-16.png');
generateIcon(48, '/home/jmbx/apps/bsa_screener/extension/icons/icon-48.png');
generateIcon(128, '/home/jmbx/apps/bsa_screener/extension/icons/icon-128.png');
console.log('Icons generated successfully.');
