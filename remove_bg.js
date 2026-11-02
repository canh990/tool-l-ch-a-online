const { Jimp } = require('jimp');
const path = require('path');

async function processBuddha() {
  const inputPath = path.join(__dirname, 'public', 'assets', 'buddha_statue.jpg');
  const outputPath = path.join(__dirname, 'public', 'assets', 'buddha_statue.png');

  console.log('Đang đọc ảnh:', inputPath);
  const image = await Jimp.read(inputPath);
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  // Flood-fill từ 4 cạnh ngoài biên để tìm và xóa nền
  // Nền ngoài viền là màu trắng hoặc vàng sáng nhạt (R > 210, G > 200, B > 180)
  const visited = new Uint8Array(width * height);
  const queue = [];

  function isBackground(idx) {
    const r = image.bitmap.data[idx];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];
    
    // Nền trắng hoặc trắng ngà vàng nhạt
    // Độ sáng cao Luma > 200 và độ bão hòa thấp hoặc màu trắng vàng nhạt
    const brightness = (r + g + b) / 3;
    if (brightness > 235) return true;
    if (r > 215 && g > 210 && b > 185) return true;
    return false;
  }

  // Đẩy toàn bộ các pixel ở 4 cạnh ngoài viền vào hàng đợi nếu thỏa mãn điều kiện nền
  for (let x = 0; x < width; x++) {
    const idxTop = (0 * width + x) * 4;
    const idxBottom = ((height - 1) * width + x) * 4;
    if (isBackground(idxTop)) { queue.push({x, y: 0}); visited[0 * width + x] = 1; }
    if (isBackground(idxBottom)) { queue.push({x, y: height - 1}); visited[(height - 1) * width + x] = 1; }
  }

  for (let y = 0; y < height; y++) {
    const idxLeft = (y * width + 0) * 4;
    const idxRight = (y * width + (width - 1)) * 4;
    if (isBackground(idxLeft) && !visited[y * width + 0]) { queue.push({x: 0, y}); visited[y * width + 0] = 1; }
    if (isBackground(idxRight) && !visited[y * width + (width - 1)]) { queue.push({x: width - 1, y}); visited[y * width + (width - 1)] = 1; }
  }

  // BFS Flood Fill loang từ ngoài vào trong
  let head = 0;
  while (head < queue.length) {
    const {x, y} = queue[head++];
    const pIdx = (y * width + x) * 4;

    // Đặt pixel này thành trong suốt
    image.bitmap.data[pIdx + 3] = 0; // Alpha = 0

    // Kiểm tra 4 láng giềng
    const neighbors = [
      {x: x + 1, y}, {x: x - 1, y}, {x, y: y + 1}, {x, y: y - 1}
    ];

    for (const nb of neighbors) {
      if (nb.x >= 0 && nb.x < width && nb.y >= 0 && nb.y < height) {
        const nbPos = nb.y * width + nb.x;
        if (!visited[nbPos]) {
          visited[nbPos] = 1;
          const nbIdx = nbPos * 4;
          if (isBackground(nbIdx)) {
            queue.push(nb);
          }
        }
      }
    }
  }

  // Xử lý làm mịn mép (anti-aliasing)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pIdx = (y * width + x) * 4;
      if (image.bitmap.data[pIdx + 3] > 0) {
        // Kiểm tra xem có giáp với pixel trong suốt không
        let hasTrans = false;
        const neighbors = [
          ((y-1)*width + x)*4 + 3,
          ((y+1)*width + x)*4 + 3,
          (y*width + (x-1))*4 + 3,
          (y*width + (x+1))*4 + 3
        ];
        for (const a of neighbors) {
          if (image.bitmap.data[a] === 0) {
            hasTrans = true;
            break;
          }
        }
        if (hasTrans) {
          const r = image.bitmap.data[pIdx];
          const g = image.bitmap.data[pIdx + 1];
          const b = image.bitmap.data[pIdx + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 200) {
            image.bitmap.data[pIdx + 3] = Math.max(0, 255 - (brightness - 180) * 4);
          }
        }
      }
    }
  }

  await image.write(outputPath);
  console.log('✅ Đã xóa phông trắng và lưu tượng Phật thành công:', outputPath);
}

async function processCushion() {
  const inputPath = path.join(__dirname, 'public', 'assets', 'cushion.jpg');
  const outputPath = path.join(__dirname, 'public', 'assets', 'cushion.png');

  console.log('Đang đọc ảnh:', inputPath);
  const image = await Jimp.read(inputPath);
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  const visited = new Uint8Array(width * height);
  const queue = [];

  function isBackground(idx) {
    const r = image.bitmap.data[idx];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];
    const brightness = (r + g + b) / 3;
    if (brightness > 230) return true;
    return false;
  }

  for (let x = 0; x < width; x++) {
    const idxTop = (0 * width + x) * 4;
    const idxBottom = ((height - 1) * width + x) * 4;
    if (isBackground(idxTop)) { queue.push({x, y: 0}); visited[0 * width + x] = 1; }
    if (isBackground(idxBottom)) { queue.push({x, y: height - 1}); visited[(height - 1) * width + x] = 1; }
  }

  for (let y = 0; y < height; y++) {
    const idxLeft = (y * width + 0) * 4;
    const idxRight = (y * width + (width - 1)) * 4;
    if (isBackground(idxLeft) && !visited[y * width + 0]) { queue.push({x: 0, y}); visited[y * width + 0] = 1; }
    if (isBackground(idxRight) && !visited[y * width + (width - 1)]) { queue.push({x: width - 1, y}); visited[y * width + (width - 1)] = 1; }
  }

  let head = 0;
  while (head < queue.length) {
    const {x, y} = queue[head++];
    const pIdx = (y * width + x) * 4;
    image.bitmap.data[pIdx + 3] = 0;

    const neighbors = [
      {x: x + 1, y}, {x: x - 1, y}, {x, y: y + 1}, {x, y: y - 1}
    ];

    for (const nb of neighbors) {
      if (nb.x >= 0 && nb.x < width && nb.y >= 0 && nb.y < height) {
        const nbPos = nb.y * width + nb.x;
        if (!visited[nbPos]) {
          visited[nbPos] = 1;
          const nbIdx = nbPos * 4;
          if (isBackground(nbIdx)) {
            queue.push(nb);
          }
        }
      }
    }
  }

  await image.write(outputPath);
  console.log('✅ Đã xóa phông trắng và lưu bồ đoàn thành công:', outputPath);
}

async function run() {
  await processBuddha();
  await processCushion();
}

run().catch(console.error);
