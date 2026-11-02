const dns = require('dns');
// Khắc phục lỗi ENOTFOUND www.tiktok.com: Ưu tiên IPv4 thay vì IPv6 của modem và dùng DNS Google/Cloudflare
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { TikTokLiveConnection } = require('tiktok-live-connector');

// Khởi tạo ứng dụng Express & HTTP Server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Tắt hoàn toàn cache trình duyệt để TikTok LIVE Studio & OBS luôn nhận mã mới nhất
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Endpoint kích hoạt tải lại toàn bộ Overlay
app.get('/api/reload', (req, res) => {
  io.emit('reload_overlay');
  res.send('Đã gửi lệnh làm mới Overlay');
});

// API Giọng đọc tiếng Việt (Google TTS - Phát âm tiếng Việt 100% chuẩn xác, không bị dính tiếng Anh)
app.get('/api/tts', (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Missing text');
  
  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
  https.get(googleTtsUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  }, ttsRes => {
    res.setHeader('Content-Type', 'audio/mpeg');
    ttsRes.pipe(res);
  }).on('error', err => {
    console.error('[TTS Error]:', err.message);
    res.status(500).send(err.message);
  });
});

// ==========================================
// QUẢN LÝ TRẠNG THÁI TRÊN RAM (IN-MEMORY STATE)
// ==========================================

// 60 chỗ ngồi trong chánh điện (5 hàng x 12 cột = 60 ghế, index 0 - 59)
const MAX_SEATS = 60;
let seats = new Array(MAX_SEATS).fill(null);

// Danh sách màu áo dài truyền thống
const CHARACTER_COLORS = ['gold', 'red', 'brown', 'pink', 'blue', 'purple'];

// Cấu hình hệ thống mặc định
let appConfig = {
  templeTitle: 'CHÙA ONLINE BÌNH AN',
  showLeaderboard: true,
  leaderboardPosition: 'bottom-right', // bottom-right (góc dưới), bottom-left, top-right, top-left
  showCouplets: true, // Công tắc bật / ẩn cặp liễn câu đối đỏ 2 bên
  chatKeyword: 'adidaphat, mophat',
  welcomeViewer: true, // Chào mừng người xem khi vào phòng
  autoResetWhenFull: true, // Tự động reset làm sạch 60 ghế khi đầy (60/60 Phật tử)
  resetDelaySeconds: 6,   // Số giây dừng chiêm bái và hoan hỷ trước khi làm sạch ghế
  couplets: [
    ['Tâm bình thế giới bình', 'Tâm an vạn sự an'],
    ['Phật tại tâm khởi thiện', 'Phước tại đức lưu hương'],
    ['Bồ đề tâm kiên cố', 'Hoa sen ngát hương lành'],
    ['Lắng lòng nghe tiếng chuông', 'Phiền não tan mây khói']
  ],
  giftPrayers: {
    'Rose': 'Cầu Bình An',
    'Hoa Hồng': 'Cầu Bình An',
    'TikTok': 'Cầu Sức Khỏe',
    'Peach': 'Cầu Gia Đình Bình An',
    'Quả Đào': 'Cầu Gia Đình Bình An',
    'Heart': 'Cầu Sớm Có Người Yêu',
    'Thả Tim': 'Cầu Sớm Có Người Yêu',
    'Kim Long': 'Cầu Tài Lộc Hanh Thông - Phúc Đức Trùng Phùng',
    'Dragon': 'Cầu Tài Lộc Hanh Thông - Đại Cát Đại Lợi',
    'DEFAULT': 'Cầu cho bách gia trăm họ bình an cát tường'
  },
  bellVolume: 0.8,
  ttsEnabled: true,
  bgmEnabled: true, // Bật nhạc nền Phật du dương
  bgmVolume: 0.35,  // Âm lượng nhạc nền êm dịu (35%)
  bgmSource: '/assets/buddhist_bgm.mp3'
};

// Bảng công đức (Top 5 nhiều kim cương nhất)
let leaderboard = [];

// Quản lý kết nối TikTok Live
let tiktokConnection = null;
let currentTiktokId = '';
let tiktokStatus = 'disconnected'; // disconnected | connecting | connected | error
let reconnectTimer = null;
let shouldAutoReconnect = false;

// ==========================================
// HÀM TIỆN ÍCH XỬ LÝ CHUỖI & DỮ LIỆU
// ==========================================

/**
 * Chuẩn hóa chuỗi tiếng Việt: Bỏ dấu, chuyển chữ thường, loại bỏ khoảng trắng thừa
 * Ví dụ: "A Di Đà Phật" -> "adidaphat"
 */
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  let result = str.toLowerCase();
  result = result.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  result = result.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  result = result.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  result = result.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  result = result.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  result = result.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  result = result.replace(/đ/g, 'd');
  // Bỏ dấu thanh tổ hợp Unicode
  result = result.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, '');
  result = result.replace(/\u02C6|\u0306|\u031B/g, '');
  // Bỏ toàn bộ khoảng trắng và ký tự đặc biệt để so khớp chuẩn xác
  result = result.replace(/[^a-z0-9]/g, '');
  return result;
}

/**
 * Kiểm tra xem bình luận có chứa từ khóa Niệm Phật không
 * Tự động nhận diện: "Mô Phật", "A Di Đà Phật", "Thích Ca Mâu Ni Phật" và từ khóa tùy chỉnh
 */
function checkPrayerKeyword(commentText) {
  if (!commentText || typeof commentText !== 'string') return null;
  const norm = removeVietnameseTones(commentText);
  if (!norm) return null;

  // 1. Nhận diện "Mô Phật"
  if (norm.includes('mophat') || norm.includes('mo phat') || norm.includes('nammo') || norm.includes('phatphap')) {
    return {
      type: 'mophat',
      title: 'MÔ PHẬT AN LẠC',
      prayerText: 'Mô Phật',
      speechText: nickname => `Phật tử ${nickname} niệm Mô Phật!`
    };
  }

  // 2. Nhận diện "A Di Đà Phật"
  if (norm.includes('adidaphat') || norm.includes('adida') || norm.includes('daphat') || norm.includes('nammoadi')) {
    return {
      type: 'adidaphat',
      title: 'NAM MÔ A DI ĐÀ PHẬT',
      prayerText: 'A Di Đà Phật',
      speechText: nickname => `Phật tử ${nickname} niệm Nam Mô A Di Đà Phật!`
    };
  }

  // 3. Nhận diện từ khóa tùy chỉnh trong Bảng Điều Khiển
  const userKeywords = (appConfig.chatKeyword || '')
    .split(',')
    .map(k => removeVietnameseTones(k.trim()))
    .filter(Boolean);

  for (const kw of userKeywords) {
    if (norm.includes(kw)) {
      return {
        type: 'custom',
        title: 'NAM MÔ A DI ĐÀ PHẬT',
        prayerText: 'A Di Đà Phật',
        speechText: nickname => `Phật tử ${nickname} niệm Phật gieo duyên lành!`
      };
    }
  }

  return null;
}

/**
 * Danh sách Lời chúc phúc dâng hoa cúng dường phong phú, ý nghĩa (Dành cho tặng bông / hoa hồng)
 */
const FLOWER_PRAYER_POOL = [
  'Cầu gia đạo bình an, tai qua nạn khỏi',
  'Cầu thân tâm an lạc, bách bệnh tiêu trừ',
  'Cầu vạn sự như ý, phước lộc tràn đầy',
  'Cầu tài lộc hanh thông, đại cát đại lợi',
  'Cầu sở cầu như ý, sở nguyện tòng tâm',
  'Cầu phước đức trùng phùng, gia môn hưng thịnh',
  'Cầu bồ đề tâm kiên cố, hoa sen ngát hương lành',
  'Cầu quý nhân phù trợ, công việc thuận buồm xuôi gió',
  'Cầu tâm bình thế giới bình, vạn sự cát tường',
  'Cầu trí tuệ khai sáng, an khang thịnh vượng',
  'Cầu gia đình hòa thuận, con cháu hiếu thảo thành đạt',
  'Cầu tiêu trừ phiền não, phước thọ vô biên',
  'Cầu mua may bán đắt, tài lộc dồi dào',
  'Cầu sức khỏe trường thọ, an vui mỗi ngày'
];

const FLOWER_SPEECH_TEMPLATES = [
  (nick, wish, repeat) => `Cảm ơn Phật tử ${nick} đã dâng đóa hoa tươi cúng dường Tam Bảo${repeat > 1 ? ` nhân ${repeat} bông hoa` : ''}! Nguyện cầu bạn ${wish.toLowerCase()}!`,
  (nick, wish, repeat) => `Hoan hỷ công đức Phật tử ${nick} đã dâng hoa hồng lễ Phật! Kính chúc bạn và gia đình ${wish.toLowerCase()}!`,
  (nick, wish, repeat) => `Cảm ơn Phật tử ${nick} đã gieo duyên dâng đóa hoa thơm ngát lên chư Phật! Chúc bạn ${wish.toLowerCase()}!`,
  (nick, wish, repeat) => `Cảm ơn tấm lòng thành kính của Phật tử ${nick}! Nguyện chúc bạn thân tâm luôn an lạc, ${wish.toLowerCase()}!`
];

/**
 * Sinh lời chúc phúc và câu xướng danh cho từng loại quà tặng
 */
function getGiftBlessing(giftName, nickname = 'Phật tử', repeatCount = 1) {
  const lowerName = (giftName || '').toLowerCase().trim();
  const isFlower = lowerName.includes('rose') || 
                   lowerName.includes('hoa') || 
                   lowerName.includes('bong') || 
                   lowerName.includes('bông') || 
                   lowerName.includes('hong') || 
                   lowerName.includes('hồng') ||
                   lowerName.includes('flower');

  if (isFlower) {
    const wish = FLOWER_PRAYER_POOL[Math.floor(Math.random() * FLOWER_PRAYER_POOL.length)];
    const tmpl = FLOWER_SPEECH_TEMPLATES[Math.floor(Math.random() * FLOWER_SPEECH_TEMPLATES.length)];
    return {
      isFlower: true,
      prayerText: wish,
      speechText: tmpl(nickname, wish, repeatCount)
    };
  }

  // Quả đào (Peach)
  if (lowerName.includes('peach') || lowerName.includes('dao') || lowerName.includes('đào')) {
    const peachWishes = [
      'Cầu gia đình bình an, phúc thọ diên niên',
      'Cầu cha mẹ sống lâu trăm tuổi, bình an vô sự',
      'Cầu gia đạo êm ấm, tai ương tiêu trừ',
      'Cầu trường thọ an khang, bách niên giai lão'
    ];
    const wish = peachWishes[Math.floor(Math.random() * peachWishes.length)];
    return {
      isFlower: false,
      prayerText: wish,
      speechText: `Cảm ơn Phật tử ${nickname} đã dâng quả đào cúng dường Phật! Kính chúc bạn ${wish.toLowerCase()}!`
    };
  }

  // Trái tim (Heart / Finger Heart)
  if (lowerName.includes('heart') || lowerName.includes('tim')) {
    const heartWishes = [
      'Cầu lương duyên tốt đẹp, tình duyên viên mãn',
      'Cầu tâm an vạn sự an, hạnh phúc tròn đầy',
      'Cầu gia đình hòa thuận, yêu thương gắn kết'
    ];
    const wish = heartWishes[Math.floor(Math.random() * heartWishes.length)];
    return {
      isFlower: false,
      prayerText: wish,
      speechText: `Cảm ơn Phật tử ${nickname} đã trao gửi tấm lòng thành! Chúc bạn ${wish.toLowerCase()}!`
    };
  }

  // Quà lớn (Dragon, Lion, Universe, Kim Long...)
  if (lowerName.includes('dragon') || lowerName.includes('long') || lowerName.includes('universe') || lowerName.includes('lion') || lowerName.includes('crown')) {
    const bigWishes = [
      'Cầu tài lộc hanh thông, đại cát đại lợi, phú quý vinh hoa',
      'Cầu phúc như đông hải, thọ tỷ nam sơn, công đức vô lượng',
      'Cầu sự nghiệp thăng hoa, quý nhân phù trợ vạn sự thành'
    ];
    const wish = bigWishes[Math.floor(Math.random() * bigWishes.length)];
    return {
      isFlower: true, // Quà lớn cũng rải mưa hoa!
      prayerText: wish,
      speechText: `Đại công đức! Cảm ơn Phật tử ${nickname} đã dâng đại lễ vật cúng dường Tam Bảo! Kính chúc bạn ${wish.toLowerCase()}!`
    };
  }

  // Mặc định
  const defaultWish = appConfig.giftPrayers[giftName] || appConfig.giftPrayers['DEFAULT'];
  return {
    isFlower: false,
    prayerText: defaultWish,
    speechText: `Cảm ơn Phật tử ${nickname} đã dâng tặng ${giftName}! Kính chúc bạn ${defaultWish.toLowerCase()}!`
  };
}

/**
 * Ánh xạ tên quà tặng sang Lời cầu nguyện tương ứng (Hàm tương thích cũ)
 */
function getPrayerByGiftName(giftName) {
  return getGiftBlessing(giftName).prayerText;
}

/**
 * Tự động Việt hóa tên quà TikTok sang tiếng Việt thuần túy
 */
const GIFT_NAME_TRANSLATIONS = {
  'rose': 'Hoa Hồng',
  'tiktok': 'Logo TikTok',
  'peach': 'Quả Đào',
  'heart': 'Trái Tim',
  'finger heart': 'Bắn Tim',
  'doughnut': 'Bánh Donut',
  'ice cream': 'Kem Ốc Quế',
  'panda': 'Gấu Trúc',
  'lion': 'Sư Tử Chúa',
  'dragon': 'Kim Long',
  'universe': 'Vũ Trụ Cát Tường',
  'perfume': 'Nước Hoa',
  'cap': 'Mũ Lưỡi Trai',
  'crown': 'Vương Miện',
  'firework': 'Pháo Hoa Rực Rỡ',
  'coffee': 'Cà Phê',
  'tea': 'Tách Trà Thanh Tịnh',
  'money': 'Bao Lì Xì'
};

function translateGiftName(giftName) {
  if (!giftName) return 'Lễ Vật';
  const lower = giftName.toLowerCase().trim();
  for (const [en, vi] of Object.entries(GIFT_NAME_TRANSLATIONS)) {
    if (lower === en || lower.includes(en)) return vi;
  }
  return giftName;
}

/**
 * Cập nhật bảng công đức Top 5
 */
function updateLeaderboard() {
  const activeDonors = seats
    .filter(s => s && s.totalDiamonds > 0)
    .map(s => ({
      userId: s.userId,
      uniqueId: s.uniqueId,
      nickname: s.nickname,
      profilePictureUrl: s.profilePictureUrl,
      totalDiamonds: s.totalDiamonds,
      seatIndex: s.seatIndex
    }));

  // Sắp xếp giảm dần theo tổng số kim cương
  activeDonors.sort((a, b) => b.totalDiamonds - a.totalDiamonds);
  leaderboard = activeDonors.slice(0, 5);
  io.emit('leaderboard_update', leaderboard);
}

/**
 * Tìm vị trí ghế của 1 userId
 */
function findUserSeat(userId) {
  return seats.find(s => s && String(s.userId) === String(userId));
}

/**
 * Tìm hoặc cấp chỗ ngồi trong chánh điện cho người xem
 * @param {Object} userData { userId, uniqueId, nickname, profilePictureUrl }
 * @param {Boolean} isGiftEvent Nếu là tặng quà, có cơ chế ưu tiên nhường chỗ khi đã đầy
 */
function assignSeat(userData, isGiftEvent = false) {
  const { userId, uniqueId, nickname, profilePictureUrl } = userData;

  // 1. Nếu người này đã có chỗ ngồi -> Cập nhật thông tin mới nhất
  const existingSeat = findUserSeat(userId);
  if (existingSeat) {
    existingSeat.lastActiveTime = Date.now();
    if (nickname) existingSeat.nickname = nickname;
    if (profilePictureUrl) existingSeat.profilePictureUrl = profilePictureUrl;
    io.emit('seats_update', seats);
    return existingSeat;
  }

  // 2. Nếu chưa có chỗ, tìm các ghế còn trống
  const emptySeatIndices = [];
  for (let i = 0; i < MAX_SEATS; i++) {
    if (seats[i] === null) {
      emptySeatIndices.push(i);
    }
  }

  let targetSeatIndex = -1;

  if (emptySeatIndices.length > 0) {
    // Chọn ngẫu nhiên 1 ghế trống để tạo cảm giác tự nhiên rải đều trong chùa
    const randomIndex = Math.floor(Math.random() * emptySeatIndices.length);
    targetSeatIndex = emptySeatIndices[randomIndex];
  } else {
    // 3. Đã đầy 60 chỗ: Tự động luân chuyển chỗ ngồi cho người xem mới/tương tác (LRU)
    // Ưu tiên 0: Ghế của bot giả lập (isSimulated)
    let candidateIndex = -1;
    let oldestActiveTime = Infinity;

    for (let i = 0; i < MAX_SEATS; i++) {
      if (seats[i] && seats[i].isSimulated) {
        if (seats[i].lastActiveTime < oldestActiveTime) {
          oldestActiveTime = seats[i].lastActiveTime;
          candidateIndex = i;
        }
      }
    }

    // Ưu tiên 1: Người chưa từng tặng quà (totalDiamonds === 0) lâu không tương tác nhất
    if (candidateIndex === -1) {
      oldestActiveTime = Infinity;
      for (let i = 0; i < MAX_SEATS; i++) {
        if (seats[i] && seats[i].totalDiamonds === 0) {
          if (seats[i].lastActiveTime < oldestActiveTime) {
            oldestActiveTime = seats[i].lastActiveTime;
            candidateIndex = i;
          }
        }
      }
    }

    // Ưu tiên 2: Nếu cả 60 người đều đã từng tặng quà -> Tìm người có số kim cương ít nhất và lâu không tương tác
    if (candidateIndex === -1) {
      let minDiamonds = Infinity;
      oldestActiveTime = Infinity;
      for (let i = 0; i < MAX_SEATS; i++) {
        if (seats[i]) {
          if (seats[i].totalDiamonds < minDiamonds) {
            minDiamonds = seats[i].totalDiamonds;
            oldestActiveTime = seats[i].lastActiveTime;
            candidateIndex = i;
          } else if (seats[i].totalDiamonds === minDiamonds && seats[i].lastActiveTime < oldestActiveTime) {
            oldestActiveTime = seats[i].lastActiveTime;
            candidateIndex = i;
          }
        }
      }
    }

    targetSeatIndex = candidateIndex;
  }

  // Nếu không tìm được chỗ (đầy 60 chỗ và là thành viên thường vào xem / chat thông thường)
  if (targetSeatIndex === -1) {
    return null;
  }

  // Tạo đối tượng ghế mới
  const randomColor = CHARACTER_COLORS[Math.floor(Math.random() * CHARACTER_COLORS.length)];
  const newSeat = {
    seatIndex: targetSeatIndex,
    userId: String(userId),
    uniqueId: uniqueId || ('user_' + String(userId).slice(-4)),
    nickname: nickname || uniqueId || 'Phật tử hữu duyên',
    profilePictureUrl: profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
    lastActiveTime: Date.now(),
    totalDiamonds: 0,
    characterColor: randomColor,
    isSimulated: Boolean(userData.isSimulated)
  };

  seats[targetSeatIndex] = newSeat;
  io.emit('seats_update', seats);

  // Kiểm tra nếu tất cả 60 ghế đã đầy (60/60) và bật chế độ tự động reset
  const occupiedCount = seats.filter(s => s !== null).length;
  if (appConfig.autoResetWhenFull !== false && occupiedCount >= MAX_SEATS && !isResettingSeats) {
    triggerTempleFullReset();
  }

  return newSeat;
}

// Trạng thái đang diễn ra nghi lễ hoàn khóa (Khóa lễ viên mãn)
let isResettingSeats = false;

function triggerTempleFullReset() {
  if (isResettingSeats) return;
  isResettingSeats = true;

  console.log('🏛️ [Khóa Lễ] Đã đủ 60/60 Phật tử! Khóa lễ viên mãn, chuẩn bị tự động làm sạch ghế...');

  const speechText = 'Nam mô A Di Đà Phật. Khóa lễ đã viên mãn sáu mươi Phật tử! Kính chúc quý vị bách gia vạn sự an khang cát tường. Chùa xin làm sạch chỗ ngồi để đón chào khóa lễ tiếp theo!';
  const delaySec = appConfig.resetDelaySeconds || 6;

  io.emit('temple_full_milestone', {
    totalSeats: MAX_SEATS,
    occupiedSeats: MAX_SEATS,
    speechText: speechText,
    resetInSeconds: delaySec
  });

  setTimeout(() => {
    console.log('🏛️ [Khóa Lễ] Đã làm sạch 60 ghế ngồi, bắt đầu khóa lễ mới.');
    seats = new Array(MAX_SEATS).fill(null);
    isResettingSeats = false;
    io.emit('seats_update', seats);
    io.emit('seats_reset', { message: 'Khóa lễ mới đã bắt đầu, kính mời quý Phật tử vào an tọa!' });
  }, delaySec * 1000);
}

// ==========================================
// KẾT NỐI VÀ LẮNG NGHE SỰ KIỆN TIKTOK LIVE
// ==========================================

function connectTikTokLive(uniqueId, options = {}) {
  if (!uniqueId || typeof uniqueId !== 'string') return;
  const cleanId = uniqueId.trim().replace(/^@/, '');
  currentTiktokId = cleanId;

  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {
      console.error('Lỗi khi ngắt kết nối cũ:', e.message);
    }
  }

  tiktokStatus = 'connecting';
  shouldAutoReconnect = true;
  io.emit('tiktok_status', { status: tiktokStatus, uniqueId: currentTiktokId });
  console.log(`[TikTok] Đang kết nối tới phòng LIVE: @${cleanId}...`);

  const connectionOptions = {};

  if (options.sessionId) {
    connectionOptions.session = {
      cookie: `sessionid=${options.sessionId.trim()}`
    };
  }

  if (options.apiKey) {
    connectionOptions.signApiKey = options.apiKey.trim();
  }

  tiktokConnection = new TikTokLiveConnection(cleanId, connectionOptions);

  tiktokConnection.connect().then(state => {
    tiktokStatus = 'connected';
    io.emit('tiktok_status', { 
      status: tiktokStatus, 
      uniqueId: currentTiktokId,
      roomId: state.roomId 
    });
    console.log(`[TikTok] ✅ ĐÃ KẾT NỐI THÀNH CÔNG phòng LIVE @${cleanId} (Room ID: ${state.roomId})`);
  }).catch(err => {
    tiktokStatus = 'error';
    io.emit('tiktok_status', { 
      status: tiktokStatus, 
      uniqueId: currentTiktokId, 
      message: err.message || 'Không thể kết nối' 
    });
    console.error(`[TikTok] Kết nối thất bại: ${err.message}`);
    scheduleReconnect();
  });

  // Biến đệm giới hạn tần suất đọc TTS để âm thanh tự nhiên, không bị đè tiếng
  let lastWelcomeSpeechTime = 0;
  let lastLikeSpeechTime = 0;

  // 1. Sự kiện Thành viên vào xem phòng LIVE (Member Join / Chào người xem video)
  tiktokConnection.on('member', data => {
    try {
      const uId = data.user?.id || data.user?.userId || data.userId || String(Date.now());
      const unqId = data.user?.displayId || data.user?.uniqueId || data.uniqueId || ('user_' + String(uId).slice(-4));
      const nick = data.user?.nickname || data.nickname || unqId;
      const pic = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl;

      // Cấp chỗ ngồi cho người xem mới vào
      const seat = assignSeat({
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic
      });

      const now = Date.now();
      const shouldSpeak = (appConfig.welcomeViewer !== false) && (now - lastWelcomeSpeechTime > 8000);
      let speechText = null;
      if (shouldSpeak) {
        lastWelcomeSpeechTime = now;
        speechText = `Hoan hỷ chào mừng Phật tử ${nick} đã vào xem lễ Phật!`;
      }

      console.log(`[Member Join] Chào người xem ${nick} vào phòng live (Ghế #${seat ? seat.seatIndex : 'hết'})`);
      io.emit('member_join', {
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic,
        seatIndex: seat ? seat.seatIndex : -1,
        speechText: speechText
      });
    } catch (err) {
      console.error('[Error member]:', err);
    }
  });

  // 2. Sự kiện Bình luận (Chat) - Hỗ trợ "Mô Phật", "A Di Đà Phật" & Thỉnh chuông
  tiktokConnection.on('chat', data => {
    try {
      const uId = data.user?.id || data.user?.userId || data.userId || String(Date.now());
      const unqId = data.user?.displayId || data.user?.uniqueId || data.uniqueId || ('user_' + String(uId).slice(-4));
      const nick = data.user?.nickname || data.nickname || unqId;
      const pic = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl;

      const seat = assignSeat({
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic
      }) || {
        seatIndex: -1,
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic
      };

      const commentText = data.content || data.comment || '';
      
      // Luôn hiển thị bình luận nổi lên ngay trên đầu Phật tử
      io.emit('user_comment', {
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        nickname: seat.nickname,
        comment: commentText
      });

      const normalizedComment = removeVietnameseTones(commentText);

      // Nếu gõ "chuông" hoặc "thỉnh chuông" -> Rung chuông chùa ngay
      if (normalizedComment.includes('chuong')) {
        io.emit('test_sound');
      }

      // Kiểm tra từ khóa Niệm Phật ("Mô Phật" hoặc "A Di Đà Phật"...)
      const prayerMatch = checkPrayerKeyword(commentText);
      if (prayerMatch) {
        console.log(`[Pray Chat] ${seat.nickname} (${prayerMatch.prayerText}): "${commentText}" tại ghế #${seat.seatIndex}`);
        io.emit('pray_chat', {
          userId: seat.userId,
          uniqueId: seat.uniqueId,
          nickname: seat.nickname,
          profilePictureUrl: seat.profilePictureUrl,
          seatIndex: seat.seatIndex,
          message: commentText,
          prayerText: prayerMatch.prayerText,
          prayerTitle: prayerMatch.title,
          speechText: prayerMatch.speechText(seat.nickname)
        });
      }
    } catch (err) {
      console.error('[Error chat]:', err);
    }
  });

  // 3. Sự kiện Tặng quà (Gift)
  tiktokConnection.on('gift', data => {
    try {
      // Chỉ chốt khi quà không phải combo hoặc khi kết thúc chuỗi combo (repeat_end === 1)
      const isStreakFinished = data.giftType !== 1 || data.repeat_end === 1;
      if (!isStreakFinished) return;

      const diamondCount = data.gift?.diamondCount || data.diamondCount || 1;
      const repeatCount = data.repeatCount || 1;
      const totalDiamonds = diamondCount * repeatCount;
      const rawGiftName = data.gift?.name || data.giftName || data.describe || 'Hoa Hồng';
      const giftName = translateGiftName(rawGiftName);

      const uId = data.user?.id || data.user?.userId || data.userId || String(Date.now());
      const unqId = data.user?.displayId || data.user?.uniqueId || data.uniqueId || ('user_' + String(uId).slice(-4));
      const nick = data.user?.nickname || data.nickname || unqId;
      const pic = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl;

      // Ưu tiên xếp ghế cho người tặng quà
      const seat = assignSeat({
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic
      }, true);

      if (seat) {
        seat.totalDiamonds += totalDiamonds;
        seat.lastActiveTime = Date.now();
        io.emit('seats_update', seats);
        updateLeaderboard();
      }

      const blessing = getGiftBlessing(rawGiftName, nick, repeatCount);

      console.log(`[Gift] ${nick} dâng tặng ${giftName} x${repeatCount} (${totalDiamonds} kim cương) -> ${blessing.prayerText}`);

      io.emit('gift_event', {
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic,
        seatIndex: seat ? seat.seatIndex : -1,
        giftName: giftName,
        giftIcon: data.gift?.icon?.url_list?.[0] || data.giftPictureUrl || '',
        repeatCount: repeatCount,
        diamondCount: totalDiamonds,
        isBigGift: totalDiamonds >= 50,
        isFlower: blessing.isFlower,
        prayerText: blessing.prayerText,
        speechText: blessing.speechText
      });
    } catch (err) {
      console.error('[Error gift]:', err);
    }
  });

  // 4. Sự kiện Thả tim (Like / Cảm ơn thả tim)
  tiktokConnection.on('like', data => {
    try {
      const uId = data.user?.id || data.user?.userId || data.userId || String(Date.now());
      const unqId = data.user?.displayId || data.user?.uniqueId || data.uniqueId || ('user_' + String(uId).slice(-4));
      const nick = data.user?.nickname || data.nickname || unqId;
      const pic = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl;
      const likeCount = data.likeCount || 1;
      const totalLikes = data.totalLikeCount || 0;

      const seat = assignSeat({
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic
      });

      const now = Date.now();
      const canSpeakLike = (now - lastLikeSpeechTime > 8000);
      let speechText = null;
      if (canSpeakLike) {
        lastLikeSpeechTime = now;
        speechText = `Cảm ơn Phật tử ${nick} đã thả tim rải hoa sen!`;
      }

      console.log(`[Like] ${nick} thả tim (+${likeCount})`);
      io.emit('like_event', {
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic,
        seatIndex: seat ? seat.seatIndex : -1,
        likeCount: likeCount,
        totalLikes: totalLikes,
        speechText: speechText
      });
    } catch (err) {
      console.error('[Error like]:', err);
    }
  });

  // 5. Sự kiện Chia sẻ (Share / Cảm ơn chia sẻ livestream)
  tiktokConnection.on('share', data => {
    try {
      const uId = data.user?.id || data.user?.userId || data.userId || String(Date.now());
      const unqId = data.user?.displayId || data.user?.uniqueId || data.uniqueId || ('user_' + String(uId).slice(-4));
      const nick = data.user?.nickname || data.nickname || unqId;
      const pic = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl;

      const seat = assignSeat({
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic
      });

      console.log(`[Share] ${nick} đã chia sẻ phòng live`);
      const speechText = `Cảm ơn Phật tử ${nick} đã chia sẻ buổi lễ Phật! Phước đức trùng phùng!`;

      io.emit('share_event', {
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic,
        seatIndex: seat ? seat.seatIndex : -1,
        speechText: speechText
      });
    } catch (err) {
      console.error('[Error share]:', err);
    }
  });

  // 6. Sự kiện Theo dõi kênh (Follow / Flow kênh Chùa Online)
  tiktokConnection.on('follow', data => {
    try {
      const uId = data.user?.id || data.user?.userId || data.userId || String(Date.now());
      const unqId = data.user?.displayId || data.user?.uniqueId || data.uniqueId || ('user_' + String(uId).slice(-4));
      const nick = data.user?.nickname || data.nickname || unqId;
      const pic = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl;

      const seat = assignSeat({
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic
      });

      const followBlessings = [
        'Chúc bạn thân tâm luôn an lạc, phước lộc tràn đầy!',
        'Chúc bạn gia đạo bình an, vạn sự hanh thông cát tường!',
        'Nguyện cầu bạn gặp nhiều may mắn, sở cầu như ý!',
        'Chúc bạn và gia đình luôn an khang, công đức vô lượng!',
        'Chúc bạn tâm bình vạn sự an, phước đức trùng phùng!'
      ];
      const randomBlessing = followBlessings[Math.floor(Math.random() * followBlessings.length)];
      const speechText = `Cảm ơn Phật tử ${nick} đã theo dõi kênh Chùa Online! ${randomBlessing}`;

      console.log(`[Follow] ${nick} đã theo dõi kênh TikTok`);

      io.emit('follow_event', {
        userId: uId,
        uniqueId: unqId,
        nickname: nick,
        profilePictureUrl: pic,
        seatIndex: seat ? seat.seatIndex : -1,
        prayerText: 'Theo Dõi Kênh Gieo Duyên Lành',
        blessingText: randomBlessing,
        speechText: speechText
      });
    } catch (err) {
      console.error('[Error follow]:', err);
    }
  });

  // 4. Bắt lỗi và Ngắt kết nối
  tiktokConnection.on('disconnected', reason => {
    console.warn(`[TikTok] Đã ngắt kết nối: ${reason}`);
    tiktokStatus = 'disconnected';
    io.emit('tiktok_status', { status: tiktokStatus, uniqueId: currentTiktokId });
    scheduleReconnect();
  });

  tiktokConnection.on('error', err => {
    console.error(`[TikTok Error]:`, err);
    tiktokStatus = 'error';
    io.emit('tiktok_status', { status: tiktokStatus, uniqueId: currentTiktokId, message: err.message });
    scheduleReconnect();
  });
}

/**
 * Tự động kết nối lại sau 5 giây nếu gặp sự cố
 */
function scheduleReconnect() {
  if (!shouldAutoReconnect || !currentTiktokId) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);

  console.log(`[TikTok] Sẽ thử tự động kết nối lại sau 5 giây...`);
  reconnectTimer = setTimeout(() => {
    if (shouldAutoReconnect && currentTiktokId) {
      connectTikTokLive(currentTiktokId);
    }
  }, 5000);
}

function disconnectTikTokLive() {
  shouldAutoReconnect = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {
      console.error(e);
    }
    tiktokConnection = null;
  }
  tiktokStatus = 'disconnected';
  io.emit('tiktok_status', { status: tiktokStatus, uniqueId: currentTiktokId });
  console.log('[TikTok] Đã chủ động ngắt kết nối.');
}

// ==========================================
// SOCKET.IO REALTIME EVENT HANDLERS
// ==========================================

io.on('connection', socket => {
  console.log(`[Socket] Client kết nối: ${socket.id}`);

  // Gửi toàn bộ trạng thái hiện tại ngay khi client mở màn hình (F5 không mất dữ liệu)
  socket.emit('init_state', {
    seats: seats,
    leaderboard: leaderboard,
    config: appConfig,
    tiktokStatus: tiktokStatus,
    currentTiktokId: currentTiktokId
  });

  // Dashboard yêu cầu kết nối TikTok
  socket.on('connect_tiktok', data => {
    if (data && data.uniqueId) {
      connectTikTokLive(data.uniqueId, data);
    }
  });

  // Dashboard yêu cầu ngắt kết nối TikTok
  socket.on('disconnect_tiktok', () => {
    disconnectTikTokLive();
  });

  // Dashboard cập nhật cấu hình
  socket.on('update_config', newConfig => {
    appConfig = { ...appConfig, ...newConfig };
    io.emit('config_update', appConfig);
    console.log('[Config] Cập nhật cấu hình thành công:', appConfig.templeTitle);
  });

  // Dashboard yêu cầu dọn sạch chỗ ngồi
  socket.on('clear_seats', () => {
    seats = new Array(MAX_SEATS).fill(null);
    leaderboard = [];
    io.emit('seats_update', seats);
    io.emit('leaderboard_update', leaderboard);
    console.log('[Seats] Đã làm trống toàn bộ 60 chỗ ngồi.');
  });

  // Dashboard yêu cầu phát âm thanh thử nghiệm & mở khóa âm thanh
  socket.on('test_sound', () => {
    io.emit('test_sound');
    console.log('[Audio] Rung chuông thử nghiệm từ Dashboard');
  });

  socket.on('unlock_audio', () => {
    io.emit('unlock_audio');
    console.log('[Audio] Lệnh mở khóa âm thanh từ Dashboard');
  });

  // ==========================================
  // BỘ NÚT BẤM GIẢ LẬP / MÔ PHỎNG (SIMULATION)
  // ==========================================

  const sampleNames = [
    'Minh Anh', 'Thanh Tâm', 'An Nhiên', 'Minh Tuệ', 'Thiện Nhân', 
    'Diệu Hoa', 'Ngọc Mai', 'Quang Khải', 'Bảo Hân', 'Tuệ Lâm',
    'Hoàng Phúc', 'Đức Trí', 'Thảo Nguyên', 'Văn Dũng', 'Kim Yến'
  ];

  // 1. Giả lập thêm 1 người vào phòng
  socket.on('sim_add_member', (count = 1) => {
    const addCount = Math.min(count, 60);
    for (let i = 0; i < addCount; i++) {
      const randId = Math.floor(100000 + Math.random() * 900000);
      const randName = sampleNames[Math.floor(Math.random() * sampleNames.length)] + ' ' + (randId % 100);
      assignSeat({
        userId: String(randId),
        uniqueId: 'phattu_' + randId,
        nickname: randName,
        profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}&backgroundColor=ffd5dc,ffdfbf,d1d4f9`,
        isSimulated: true
      });
    }
  });

  // 2. Giả lập chat từ khóa "adidaphat"
  socket.on('sim_chat', customMessage => {
    // Tìm những người đang có chỗ ngồi
    const seatedUsers = seats.filter(s => s !== null);
    let targetUser = null;

    if (seatedUsers.length === 0) {
      // Nếu chưa có ai, tự tạo 1 người rồi chat
      const randId = Math.floor(100000 + Math.random() * 900000);
      targetUser = assignSeat({
        userId: String(randId),
        uniqueId: 'phattu_' + randId,
        nickname: 'Phật tử ' + randId,
        profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}`
      });
    } else {
      // Chọn ngẫu nhiên 1 người đang ngồi
      targetUser = seatedUsers[Math.floor(Math.random() * seatedUsers.length)];
    }

    if (!targetUser) return;

    targetUser.lastActiveTime = Date.now();
    const chatMsg = customMessage || 'Nam Mô A Di Đà Phật 🙏';

    console.log(`[Sim Chat] ${targetUser.nickname} chat tại ghế #${targetUser.seatIndex}: "${chatMsg}"`);
    io.emit('user_comment', {
      seatIndex: targetUser.seatIndex,
      userId: targetUser.userId,
      nickname: targetUser.nickname,
      comment: chatMsg
    });

    const normMsg = removeVietnameseTones(chatMsg);
    if (normMsg.includes('chuong')) {
      io.emit('test_sound');
    }

    // Tự động nhận diện "Mô Phật" hoặc "A Di Đà Phật"
    const prayerMatch = checkPrayerKeyword(chatMsg);
    if (prayerMatch || !customMessage) {
      const pText = prayerMatch ? prayerMatch.prayerText : 'A Di Đà Phật';
      const pTitle = prayerMatch ? prayerMatch.title : 'NAM MÔ A DI ĐÀ PHẬT';
      const sText = prayerMatch ? prayerMatch.speechText(targetUser.nickname) : `Phật tử ${targetUser.nickname} niệm Nam Mô A Di Đà Phật!`;

      io.emit('pray_chat', {
        userId: targetUser.userId,
        uniqueId: targetUser.uniqueId,
        nickname: targetUser.nickname,
        profilePictureUrl: targetUser.profilePictureUrl,
        seatIndex: targetUser.seatIndex,
        message: chatMsg,
        prayerText: pText,
        prayerTitle: pTitle,
        speechText: sText
      });
    }
  });

  // 3. Giả lập Chào người xem vào phòng (Member Join)
  socket.on('sim_welcome', () => {
    const randId = Math.floor(100000 + Math.random() * 900000);
    const randName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const user = assignSeat({
      userId: String(randId),
      uniqueId: 'phattu_' + randId,
      nickname: randName,
      profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}&backgroundColor=ffd5dc,ffdfbf`
    });

    const nick = user ? user.nickname : randName;
    console.log(`[Sim Welcome] Chào Phật tử ${nick} vào xem phòng LIVE`);
    io.emit('member_join', {
      userId: user ? user.userId : String(randId),
      uniqueId: user ? user.uniqueId : 'sim_join',
      nickname: nick,
      profilePictureUrl: user ? user.profilePictureUrl : '',
      seatIndex: user ? user.seatIndex : -1,
      speechText: `Hoan hỷ chào mừng Phật tử ${nick} đã vào xem lễ Phật!`
    });
  });

  // 4. Giả lập Thả Tim (Like / Cảm ơn thả tim)
  socket.on('sim_like', () => {
    const seatedUsers = seats.filter(s => s !== null);
    let donor = null;
    if (seatedUsers.length > 0) {
      donor = seatedUsers[Math.floor(Math.random() * seatedUsers.length)];
    } else {
      const randId = Math.floor(100000 + Math.random() * 900000);
      const randName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      donor = assignSeat({
        userId: String(randId),
        uniqueId: 'phattu_' + randId,
        nickname: randName,
        profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}`
      });
    }
    const nick = donor ? donor.nickname : 'Phật tử ẩn danh';
    console.log(`[Sim Like] Phật tử ${nick} thả tim`);
    io.emit('like_event', {
      userId: donor ? donor.userId : 'sim_' + Date.now(),
      uniqueId: donor ? donor.uniqueId : 'sim_like',
      nickname: nick,
      profilePictureUrl: donor ? donor.profilePictureUrl : '',
      seatIndex: donor ? donor.seatIndex : -1,
      likeCount: 15,
      totalLikes: 999,
      speechText: `Cảm ơn Phật tử ${nick} đã thả tim rải hoa sen!`
    });
  });

  // 5. Giả lập Chia Sẻ (Share / Cảm ơn chia sẻ livestream)
  socket.on('sim_share', () => {
    const seatedUsers = seats.filter(s => s !== null);
    let donor = null;
    if (seatedUsers.length > 0) {
      donor = seatedUsers[Math.floor(Math.random() * seatedUsers.length)];
    } else {
      const randId = Math.floor(100000 + Math.random() * 900000);
      const randName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      donor = assignSeat({
        userId: String(randId),
        uniqueId: 'phattu_' + randId,
        nickname: randName,
        profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}`
      });
    }
    const nick = donor ? donor.nickname : 'Phật tử ẩn danh';
    console.log(`[Sim Share] Phật tử ${nick} chia sẻ livestream`);
    io.emit('share_event', {
      userId: donor ? donor.userId : 'sim_' + Date.now(),
      uniqueId: donor ? donor.uniqueId : 'sim_share',
      nickname: nick,
      profilePictureUrl: donor ? donor.profilePictureUrl : '',
      seatIndex: donor ? donor.seatIndex : -1,
      speechText: `Cảm ơn Phật tử ${nick} đã chia sẻ buổi lễ Phật! Phước đức trùng phùng!`
    });
  });

  // 6. Giả lập Theo dõi kênh (Follow)
  socket.on('sim_follow', () => {
    const seatedUsers = seats.filter(s => s !== null);
    let follower = null;
    if (seatedUsers.length > 0) {
      follower = seatedUsers[Math.floor(Math.random() * seatedUsers.length)];
    } else {
      const randId = Math.floor(100000 + Math.random() * 900000);
      const randName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      follower = assignSeat({
        userId: String(randId),
        uniqueId: 'phattu_' + randId,
        nickname: randName,
        profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}&backgroundColor=ffd5dc,ffdfbf`
      });
    }
    const nick = follower ? follower.nickname : 'Phật tử hữu duyên';
    const followBlessings = [
      'Chúc bạn thân tâm luôn an lạc, phước lộc tràn đầy!',
      'Chúc bạn gia đạo bình an, vạn sự hanh thông cát tường!',
      'Nguyện cầu bạn gặp nhiều may mắn, sở cầu như ý!',
      'Chúc bạn và gia đình luôn an khang, công đức vô lượng!',
      'Chúc bạn tâm bình vạn sự an, phước đức trùng phùng!'
    ];
    const randomBlessing = followBlessings[Math.floor(Math.random() * followBlessings.length)];
    const speechText = `Cảm ơn Phật tử ${nick} đã theo dõi kênh Chùa Online! ${randomBlessing}`;

    console.log(`[Sim Follow] Phật tử ${nick} đã theo dõi kênh`);
    io.emit('follow_event', {
      userId: follower ? follower.userId : 'sim_' + Date.now(),
      uniqueId: follower ? follower.uniqueId : 'sim_follow',
      nickname: nick,
      profilePictureUrl: follower ? follower.profilePictureUrl : '',
      seatIndex: follower ? follower.seatIndex : -1,
      prayerText: 'Theo Dõi Kênh Gieo Duyên Lành',
      blessingText: randomBlessing,
      speechText: speechText
    });
  });

  // 6. Giả lập tặng quà
  socket.on('sim_gift', giftOptions => {
    const rawGiftName = giftOptions?.name || 'Hoa Hồng';
    const giftName = translateGiftName(rawGiftName);
    const diamondCount = giftOptions?.diamonds || 1;
    const repeatCount = giftOptions?.repeat || 1;
    const totalDiamonds = diamondCount * repeatCount;

    // Chọn 1 người đang ngồi hoặc tạo người mới
    const seatedUsers = seats.filter(s => s !== null);
    let donor = null;

    if (seatedUsers.length > 0 && Math.random() > 0.3) {
      donor = seatedUsers[Math.floor(Math.random() * seatedUsers.length)];
    } else {
      const randId = Math.floor(100000 + Math.random() * 900000);
      const randName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      donor = assignSeat({
        userId: String(randId),
        uniqueId: 'phattu_' + randId,
        nickname: randName,
        profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}&backgroundColor=ffd5dc,ffdfbf`
      }, true);
    }

    if (donor) {
      donor.totalDiamonds += totalDiamonds;
      donor.lastActiveTime = Date.now();
      io.emit('seats_update', seats);
      updateLeaderboard();
    }

    const blessing = getGiftBlessing(giftName, donor ? donor.nickname : 'Phật tử', repeatCount);

    console.log(`[Sim Gift] ${donor ? donor.nickname : 'Khách'} tặng ${giftName} x${repeatCount} (${totalDiamonds} xu) -> ${blessing.prayerText}`);

    io.emit('gift_event', {
      userId: donor ? donor.userId : 'sim_' + Date.now(),
      uniqueId: donor ? donor.uniqueId : 'sim_donor',
      nickname: donor ? donor.nickname : 'Phật tử ẩn danh',
      profilePictureUrl: donor ? donor.profilePictureUrl : 'https://api.dicebear.com/7.x/notionists/svg?seed=donor',
      seatIndex: donor ? donor.seatIndex : -1,
      giftName: giftName,
      giftIcon: giftOptions?.icon || '',
      repeatCount: repeatCount,
      diamondCount: totalDiamonds,
      isBigGift: totalDiamonds >= 50,
      isFlower: blessing.isFlower,
      prayerText: blessing.prayerText,
      speechText: blessing.speechText
    });
  });

  // 7. Giả lập đầy 60 ghế và tự động kích hoạt Khóa Lễ Viên Mãn & Reset
  socket.on('sim_full_reset', () => {
    console.log('[Sim] Giả lập lấp đầy 60/60 ghế để kích hoạt tự động reset');
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!seats[i]) {
        const randId = 100000 + i;
        const randName = sampleNames[i % sampleNames.length] + ' ' + (i + 1);
        seats[i] = {
          seatIndex: i,
          userId: String(randId),
          uniqueId: 'phattu_' + randId,
          nickname: randName,
          profilePictureUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${randId}`,
          lastActiveTime: Date.now(),
          totalDiamonds: 0,
          characterColor: CHARACTER_COLORS[i % CHARACTER_COLORS.length],
          isSimulated: true
        };
      }
    }
    io.emit('seats_update', seats);
    triggerTempleFullReset();
  });

  socket.on('reload_overlay', () => {
    console.log('[Dashboard] Yêu cầu làm mới (reload) toàn bộ màn hình Overlay');
    io.emit('reload_overlay');
  });

  socket.on('overlay_metrics', metrics => {
    console.log(`[Overlay Metrics] Viewport: ${metrics.width}x${metrics.height}, DPR: ${metrics.dpr}, Zoom: ${metrics.scale}`);
    io.emit('overlay_metrics_update', metrics);
  });

  socket.on('disconnect', () => {
    // Client disconnect
  });
});

// Khởi động server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🌸 CHÙA ONLINE - TIKTOK LIVE GAME ĐÃ SẴN SÀNG! 🌸`);
  console.log(`- Màn hình Overlay LIVE (OBS): http://localhost:${PORT}/overlay.html`);
  console.log(`- Bảng điều khiển (Dashboard): http://localhost:${PORT}/`);
  console.log(`====================================================`);

  // Tự động kết nối tới phòng TikTok của chủ phòng
  setTimeout(() => {
    connectTikTokLive('nguyentranvancanh');
  }, 1000);
});

