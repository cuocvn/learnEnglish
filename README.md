# English Vocabulary Learning App 📚✨

Ứng dụng Web Học Từ Vựng Tiếng Anh (English Vocabulary Learning App) được thiết kế theo phong cách giao diện Pastel dễ thương, gọn gàng, hoạt động độc lập dưới dạng Single Page Application (SPA) / Route tĩnh, chạy hoàn toàn trực tiếp trên trình duyệt.

## 🚀 Tính năng nổi bật

1. **Tra từ & Phát âm chuẩn**: Tích hợp Free Dictionary API, hỗ trợ nghe phát âm trực tiếp (audio) và hiển thị chi tiết định nghĩa tiếng Anh kèm các tag từ loại (Noun, Verb, Adj, Adv...) đầy màu sắc.
2. **Dịch tự động**: Tích hợp Google Translate API giúp tự động dịch nghĩa từ vựng sang tiếng Việt và cho phép bạn chỉnh sửa lại nghĩa cho dễ nhớ trước khi lưu.
3. **Gợi ý thông minh (Autocomplete)**: Hỗ trợ tự động gợi ý từ vựng (debounce 300ms) thông qua Datamuse API khi gõ ô tìm kiếm.
4. **Luyện tập thông minh (Practice Mode)**: Ôn tập ngẫu nhiên từ vựng đã lưu. Mastery Algorithm tăng $10\%$ khi gõ đúng và giảm $10\%$ khi gõ sai. Nếu sai, ứng dụng hiển thị đáp án đỏ và bắt buộc người dùng gõ lại để ghi nhớ. Hiệu ứng pháo giấy (Canvas-Confetti) rực rỡ khi từ đạt $100\%$ thành thạo.
5. **Dashboard & Thống kê**: Biểu đồ hóa tiến độ, số từ đã học, số từ đã làm chủ ($100\%$) cùng bảng danh sách sắp xếp/lọc từ thông minh theo độ thành thạo từ thấp đến cao hoặc loại từ.
6. **Bảo mật**: Tích hợp Firebase Auth và Cloud Firestore để đồng bộ và phân tách dữ liệu riêng biệt cho mỗi người dùng.
7. **Demo Mode (Mở rộng)**: Tự động phát hiện nếu Firebase chưa được cấu hình để chuyển sang lưu trữ Offline (LocalStorage), giúp chạy thử nghiệm mọi tính năng ngay lập tức không cần cài đặt.

---

## 🛠️ Hướng dẫn cài đặt Firebase

Để kết nối với Firebase của riêng bạn:

1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Tạo một dự án mới và tạo một ứng dụng Web trong cấu hình dự án.
3. Bật **Authentication** và kích hoạt phương thức đăng nhập **Email/Password** và **Google**.
4. Bật **Cloud Firestore** và tạo Database ở chế độ test (hoặc cấu hình Rules bảo mật cho phép đọc ghi theo `request.auth.uid`).
   * *Gợi ý rules Firestore:*
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /users/{userId}/{document=**} {
           allow read, write: if request.auth != null && request.auth.uid == userId;
         }
       }
     }
     ```
5. Mở file [firebase-config.js](file:///c:/Users/ADMIN/Desktop/tieng%20anh/firebase-config.js) và thay thế các giá trị trong hằng số `firebaseConfig` bằng các tham số API Key, Project ID... của bạn.

---

## 📦 Cách chạy ứng dụng

### Chạy trực tiếp (Local)
Vì đây là ứng dụng client-side sử dụng ES Modules (`type="module"`), trình duyệt yêu cầu chạy qua một local server thay vì mở trực tiếp file `index.html` dạng `file:///`.

Bạn có thể dùng bất kỳ web server đơn giản nào:
* **VS Code**: Cài đặt extension **Live Server** và nhấn **Go Live**.
* **NodeJS**: Chạy `npx serve` hoặc cài `http-server`:
  ```bash
  npx serve .
  ```
* **Python**: Chạy lệnh server tích hợp:
  ```bash
  python -m http.server 8000
  ```
Sau đó mở trình duyệt tại địa chỉ `http://localhost:8000`.

---

## ☁️ Deploy lên GitHub Pages / Vercel

Ứng dụng chạy hoàn toàn ở front-end nên cực kỳ dễ deploy:

### Deploy lên GitHub Pages
1. Khởi tạo git và push code lên một repository GitHub mới.
2. Vào **Settings** -> **Pages** của repository.
3. Tại phần **Build and deployment**, chọn source là **Deploy from a branch** và chọn nhánh `main` (hoặc `master`), folder `/root`.
4. Nhấn **Save** và đợi khoảng 1-2 phút là trang web sẽ online!

### Deploy lên Vercel
1. Truy cập [Vercel](https://vercel.com/) và kết nối với tài khoản GitHub của bạn.
2. Chọn **Add New** -> **Project** và import repository này.
3. Giữ nguyên mọi thiết lập mặc định và nhấn **Deploy**. Vercel sẽ tự động cung cấp tên miền HTTPS miễn phí cực nhanh!

### Deploy lên Firebase Hosting
Đảm bảo bạn đã cài đặt NodeJS. Thực thi tuần tự 3 lệnh sau để đưa ứng dụng lên Hosting:
1. Cài đặt Firebase CLI toàn cục:
   ```bash
   npm install -g firebase-tools
   ```
2. Đăng nhập tài khoản Firebase:
   ```bash
   firebase login
   ```
3. Deploy ứng dụng lên Hosting:
   ```bash
   firebase deploy
   ```

---

## 📂 Cấu trúc thư mục

```plaintext
/
├── index.html        (Trang chủ: Tra từ, Gợi ý, Ôn tập)
├── dashboard.html    (Trang tổng hợp: Tiến độ, Danh sách từ & Bộ lọc)
├── login.html        (Trang đăng nhập Firebase & Demo)
├── firebase-config.js(Cấu hình Firebase SDK & Demo detection)
├── css/
│   └── style.css     (Hệ thống giao diện Cute Pastel & Responsive)
└── js/
    ├── auth.js       (Logic Authentication: Firebase & Demo Session)
    ├── app.js        (Logic tra từ, gợi ý, nghe nhạc & Ôn tập)
    ├── firestore.js  (Logic CRUD: Firebase Firestore & LocalStorage)
    └── dashboard.js  (Logic tính toán thống kê & render bảng từ)
```
