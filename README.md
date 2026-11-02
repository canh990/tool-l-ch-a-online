# 🪷 CHÙA ONLINE - TIKTOK LIVE GAME & STREAM OVERLAY

Hệ thống Interactive Stream Game Chùa Online chuyên nghiệp dành cho TikTok LIVE. Tối ưu hoàn hảo cho OBS Studio, Streamlabs và TikTok LIVE Studio ở độ phân giải dọc chuẩn **1080 x 1920 (9:16)**.

---

## 🏛️ 1. TÍNH NĂNG NỔI BẬT

### 🌟 Kiến trúc & Hiệu Năng
- **Backend Node.js & Socket.io (Port 3002):** Xử lý realtime hai chiều mượt mà, lưu trữ trạng thái chánh điện trên RAM, F5 màn hình Overlay không bao giờ bị mất vị trí hay danh sách người ngồi.
- **Tích hợp TikTok LIVE Connector:** Tự động lắng nghe sự kiện người vào phòng (`member`), bình luận (`chat`), và tặng quà (`gift`). Tự động retry kết nối sau 5 giây nếu mạng gián đoạn.
- **Màn hình LIVE 1080x1920 (`public/overlay.html`):** Tối ưu 60fps, không sử dụng thư viện nặng bên ngoài, đồ họa Tượng Phật Thích Ca Mâu Ni hoàng kim bằng Vector SVG sắc nét tuyệt đối.

### 🧘‍♂️ 60 Chỗ Ngồi Chánh Điện (5 Hàng x 12 Cột)
- Khi người xem vào phòng hoặc chat: tự động được xếp vào 1 chỗ trống ngẫu nhiên với áo dài truyền thống (ngẫu nhiên 1 trong 6 màu: Vàng hoàng gia, Đỏ cát tường, Nâu sòng thanh tịnh, Hồng sen, Lam từ bi, Tím trang nhã).
- **Hoạt ảnh lạy Phật chắp tay liên tục:** Nhân vật cúi mình bái Phật nhịp nhàng với độ lệch pha thời gian ngẫu nhiên giữa 60 người, tạo nên khung cảnh chánh điện vô cùng sống động và trang nghiêm.
- **Cơ chế nhường chỗ thông minh:** Khi đã đầy 60 chỗ, nếu có người mới tặng quà (`gift`), hệ thống tự động tìm người chưa từng tặng quà (`totalDiamonds === 0`) có thời gian tương tác cũ nhất để nhường chỗ cho Phật tử dâng lễ.

### 🎥 Hệ Thống Camera Viewport Chuyên Nghiệp (Camera Queue)
- **Trạng thái nghỉ (Idle Pan):** Camera tự động lia ngang nhẹ nhàng toàn cảnh chánh điện.
- **Hàng đợi Camera (Queue Zoom):** Khi có người gõ "A Di Đà Phật" hoặc tặng quà, hệ thống đẩy vào hàng đợi (chống lặp liên tiếp).
- **Cận cảnh thần tốc:** Camera lia và zoom `scale(2.8)` đến đúng vị trí ghế của người đó:
  - Làm mờ (`blur`) toàn bộ các ghế xung quanh, chỉ người đó sáng bừng hào quang.
  - Hiện bong bóng cầu nguyện lấp lánh (Speech Bubble 3D) trên đầu: `"🙏 Cầu Bình An · Minh Anh dâng Hoa Hồng x50"`.
  - Giữ cận cảnh 4 giây (khi tặng quà) hoặc 2.5 giây (khi niệm Phật).
  - Tự động chuyển tiếp mượt mà sang người tiếp theo trong hàng đợi hoặc trở về toàn cảnh khi hết sự kiện.

### 🔔 Hiệu Ứng Âm Thanh & Hình Ảnh Đặc Biệt
- **Chuông Chùa Ngân Bát Nhã:** Tổng hợp trực tiếp bằng **Web Audio API** (hài âm chuông đồng trầm hùng, sâu lắng) không lo bị lỗi thiếu file MP3 hay 404. Tích hợp cooldown 2 giây chống dội âm khi bão quà.
- **Mưa cánh hoa sen:** Canvas 60fps vẽ cánh hoa sen hồng bay lượn, xoay 3D rơi nhẹ theo gió.
- **Hào quang rực rỡ (Quà lớn >= 50 xu):** Hào quang sau lưng Tượng Phật bùng nổ ánh sáng thần thánh khắp toàn màn hình.
- **Giọng đọc AI (TTS Tiếng Việt):** Tích hợp Web Speech API tự động cảm ơn người dâng quà và chúc lời cầu nguyện tương ứng. Tự động rút gọn khi hàng đợi quá đông (> 5 người).
- **Hai liễn câu đối đỏ chữ vàng:** Tự động lật đổi câu sau mỗi 14 giây.

---

## 🚀 2. HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY

### Cách 1: Chạy nhanh bằng 1 click trên Windows (Khuyên dùng)
1. Nhấp đúp chuột vào file **`start.bat`**.
2. Script sẽ tự kiểm tra môi trường, tự động chạy `npm install` nếu cần và mở sẵn:
   - Dashboard: `http://localhost:3002/`
   - Overlay: `http://localhost:3002/overlay.html`

### Cách 2: Chạy qua Terminal / Command Prompt
```bash
# 1. Cài đặt thư viện
npm install

# 2. Khởi động server
npm start
```

---

## 📺 3. CẤU HÌNH OBS STUDIO / TIKTOK LIVE STUDIO

1. Mở **OBS Studio** hoặc **TikTok LIVE Studio**.
2. Thêm nguồn mới: Chọn **Browser Source** (Trình duyệt).
3. Đặt các thông số như sau:
   - **URL:** `http://localhost:3002/overlay.html`
   - **Width (Chiều rộng):** `1080`
   - **Height (Chiều cao):** `1920`
   - **Custom Frame Rate:** `60`
   - **Control audio via OBS (Kiểm soát âm thanh qua OBS):** Tích chọn (để thu được tiếng chuông chùa và giọng đọc AI).
4. Nhấn **OK**. Màn hình chánh điện Chùa Online sẽ hiển thị sắc nét toàn màn hình dọc 9:16.

---

## 🎮 4. HƯỚNG DẪN DÙNG BẢNG ĐIỀU KHIỂN (DASHBOARD)

Mở trình duyệt truy cập: `http://localhost:3002/`

### 1. Kết nối với TikTok LIVE thật
- Nhập TikTok Unique ID của kênh đang phát trực tiếp (ví dụ: `chuababy` hoặc `@username`).
- Nhấn nút **"Kết Nối"**. Khi thấy huy hiệu chuyển sang xanh lá `🟢 Đã kết nối`, hệ thống sẽ bắt đầu nhận diện người vào xem, chat và tặng quà từ LIVE thật.

### 2. Bộ nút bấm Giả lập (Test Simulation)
Bạn có thể thử nghiệm mọi tính năng mà không cần phải bật LIVE thật:
- **`[+1 Người vào phòng]`**: Thêm 1 Phật tử với tên và áo dài ngẫu nhiên.
- **`[+20 Người lấp đầy nhanh]`**: Lấp đầy nhanh chánh điện để kiểm tra phối cảnh 60 ghế.
- **`[Niệm "A Di Đà Phật"]`**: Chọn 1 Phật tử bất kỳ trong phòng -> Camera tự động zoom cận cảnh và hiện bong bóng niệm Phật.
- **`[Dâng Hoa Hồng (1 xu)]`**: Tặng quà 1 xu -> Rung chuông chùa + Camera zoom + Cập nhật Bảng Công Đức + Giọng đọc AI đọc lời chúc "Cầu Bình An".
- **`[Dâng Quả Đào (10 xu)]`**: Lời cầu "Cầu Gia Đình Bình An".
- **`[Dâng Kim Long (1000 xu)]`**: Kích hoạt hiệu ứng Hào quang thần thánh bừng sáng toàn màn hình chánh điện.
- **`[🧹 Dọn Trống 60 Ghế]`**: Làm sạch chánh điện về trạng thái ban đầu.

### 3. Tùy chỉnh trực tiếp (Real-time Config)
- Đổi **Tên Chùa / Tiêu đề hoành phi**.
- Bật/tắt hoặc đổi vị trí **Bảng Công Đức** (Góc Trên Phải, Trên Trái, Dưới Phải, Dưới Trái).
- Chỉnh sửa từ khóa Chat niệm Phật (mặc định: `adidaphat`).
- Chỉnh sửa danh sách các cặp câu đối 2 bên (ngăn cách bởi dấu `|`).
- Chỉnh âm lượng Chuông Chùa và bật/tắt Giọng đọc AI.
- Chỉnh sửa bảng ánh xạ **Tên Quà Tặng -> Lời Cầu Nguyện**.
- Nhấn **"Lưu Và Áp Dụng Ngay Lên Overlay"** để đồng bộ tức thì sang màn hình LIVE mà không cần tải lại trang.

---

## 📁 5. CẤU TRÚC MÃ NGUỒN

```
tool-l-ch-a-online/
├── server.js               # Backend Node.js, Express, Socket.io, TikTok Live Connector
├── package.json            # Khai báo dependencies (express, socket.io, tiktok-live-connector...)
├── start.bat               # File khởi chạy 1-click trên Windows
├── README.md               # Hướng dẫn chi tiết
└── public/
    ├── index.html          # Giao diện Bảng Điều Khiển (Dashboard Admin & Test)
    └── overlay.html        # Giao diện Màn hình LIVE Chánh Điện (1080x1920)
```

Chúc bạn có những buổi livestream bình an, thanh tịnh và tương tác bùng nổ cùng cộng đồng! 🙏

