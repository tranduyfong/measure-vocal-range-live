# Voice Range Monitor

Extension Chrome/Edge (Manifest V3) đo cao độ từ âm thanh của tab đang phát, hiển thị nốt gần nhất và tần số Hz, đồng thời ghi nhận nốt thấp nhất/cao nhất trong phiên.

## Cài đặt để dùng thử

1. Mở `chrome://extensions` (Chrome) hoặc `edge://extensions` (Edge).
2. Bật **Developer mode**.
3. Chọn **Load unpacked** và trỏ tới thư mục `voice-range-extension`.
4. Mở tab có media, phát âm thanh rồi bấm biểu tượng extension → **Bắt đầu đo**.

Việc bắt âm thanh chỉ bắt đầu sau thao tác bấm nút của người dùng. Âm thanh tab được chuyển lại ra tai nghe/loa trong lúc phân tích. Giữ popup mở trong lúc đo; khi đóng popup, trình duyệt dừng capture. Quãng thấp/cao được tính trong lần mở popup đó.

## Giới hạn

Bộ dò đã được chỉnh để nhận tín hiệu nhỏ hơn, ưu tiên dải giọng hát khoảng 65–1100 Hz, lọc bớt bass/cymbal trong nhánh phân tích và làm mượt kết quả qua các khung âm thanh gần nhau. Âm thanh nghe vẫn giữ nguyên toàn dải. Đây là bộ lọc và dò cao độ, không phải công nghệ tách giọng; với bản phối dày, extension vẫn có thể bắt nhạc cụ hoặc bè thay vì giọng chính. Quãng đo phản ánh những nốt nhận diện được trong phiên, không phải đánh giá chuyên môn về quãng giọng tự nhiên.
