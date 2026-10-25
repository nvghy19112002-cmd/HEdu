# Báo cáo bảo mật beta.33 (26/10/2026)

Bối cảnh: Windows Defender cách ly `C:\Users\admin\AppData\Local\HEdu\hedu.exe` với tên `Trojan:Win32/Bearfoos.A!ml` (phát hiện bằng học máy, không phải chữ ký mã độc cụ thể).

**Kết luận hiện tại: CHƯA đủ căn cứ để nói là báo nhầm (false positive).** Chưa thấy dấu hiệu mã độc trong mã nguồn và quy trình phát hành, nhưng một số điều không thể kiểm chứng (mục 2).

## 1. Đã xác minh
- `main` (132 commit) chỉ có tác giả: tài khoản chủ dự án, "HEdu", "Claude". Tag `v0.1.0-beta.33` trỏ đúng `037aee1` = đầu `main`; release chạy bằng Run workflow (run `40215655548`, thành công) do chủ dự án bấm.
- Không có tệp nhị phân/script (`.exe .dll .bat .ps1 .vbs`) nào trong Git. Không có đoạn mã ẩn/mã hoá, ghi registry khởi động, lập lịch, nạp DLL, `unsafe`.
- Chương trình ngoài chỉ gồm `pdflatex`, `dvisvgm`, `kpsewhich`, `tlmgr` (đúng thiết kế). Mạng: chỉ `generativelanguage.googleapis.com` (khi người dùng cho phép) và GitHub (cập nhật). CSP chặn kết nối khác.
- Mọi crate Rust (514) từ crates.io, mọi gói npm (51) từ registry.npmjs.org; không nguồn git/URL lạ.
- Bộ cài `HEdu_0.1.0-beta.33_x64-setup.exe`: 3.944.367 byte, SHA-256 do GitHub ghi `55be595b95379f3bd7178fbdce5dea2b54e1ecd63edb69808f4bec702b49dfe5`. Tệp `.sig` trùng chữ ký trong `latest.json`; mã khoá trong chữ ký khớp `src-tauri/updater.pub` (`E6B75C30D0039882`, không đổi từ 22/10).
- Các bước job build beta.33 đều thành công, đúng thứ tự trong `release.yml` (kiểm thử trước, rồi gắn phiên bản, rồi đóng gói).

## 2. KHÔNG thể xác minh
- Nội dung log chi tiết của run build (GitHub chỉ cho xem khi đăng nhập; API trả 403). Chỉ đọc được tên + kết quả từng bước.
- Chữ ký minisign của bộ cài về mặt mật mã (chưa tải bộ cài; cần chủ dự án đồng ý).
- Hash của `hedu.exe` bị cách ly, và việc nó có trùng bản trong bộ cài chính thức không.
- Bản build không có chứng thực nguồn gốc (attestation: không có; run không để lại artifact).
- Commit không có chữ ký xác thực; không chứng minh được từng commit do ai đẩy. Chủ dự án nên xem Settings → Security log của tài khoản GitHub.
- Lý do Defender gắn nhãn: chỉ suy đoán (bộ cài không có chữ ký số Authenticode, ứng dụng Rust mới ít người dùng) — chưa phải bằng chứng.

## 3. Đã gia cố trong PR này (tính tái lập)
- Trước đây `Cargo.lock` và `package-lock.json` bị loại khỏi Git nên mỗi lần build CI lấy dependency mới nhất. Nay cả hai được theo dõi. `package-lock.json` cũ trên máy thiếu `@types/node` nên đã tạo lại cho khớp `package.json`; không nâng phiên bản gói nào.
- CI/release dùng `npm ci`; `cargo test --lib --locked`; release kiểm `cargo metadata --locked` sau khi gắn phiên bản. `scripts/ci-config.mjs` nay cũng đổi phiên bản gói `hedu` trong `Cargo.lock` (nếu không, `--locked` sẽ lỗi khi phát hành); có test.
- Mọi action ghim theo mã SHA (kèm chú thích tag), không nâng phiên bản lớn: `checkout` v5, `setup-node` v5, `rust-cache` v2, `tauri-action` v0, `rust-toolchain` (nhánh stable, thêm `toolchain: stable` vì SHA không mang tên nhánh).
- Còn lại: `npm audit` báo 1 lỗ hổng mức thấp ở `katex` (cần lên bản 0.19, đổi lớn) — chưa xử lý, sẽ tách PR riêng; liên kết `node_modules` đang bị Git theo dõi (xem AGENTS.md mục 7); chưa có chữ ký số Authenticode.

## 4. Lấy mẫu `hedu.exe` từ bản chính thức để gửi Microsoft (không chạy tệp, không khôi phục tệp cách ly)
1. Tạo thư mục trống riêng, ví dụ `D:\mau-hedu\`. Không đặt trong thư mục dự án.
2. Tải bộ cài từ trang Releases của kho (`v0.1.0-beta.33`) vào đó. Windows/Defender có thể cách ly ngay tại bước này — nếu vậy, đó cũng là thông tin hữu ích; đừng thêm ngoại lệ.
3. Kiểm hash (không chạy tệp):
   ```powershell
   Get-FileHash "D:\mau-hedu\HEdu_0.1.0-beta.33_x64-setup.exe" -Algorithm SHA256
   ```
   Phải đúng `55be595b95379f3bd7178fbdce5dea2b54e1ecd63edb69808f4bec702b49dfe5`.
4. Cách đơn giản nhất: gửi chính **bộ cài** cho Microsoft (họ phân tích được tệp này).
5. Nếu cần riêng `hedu.exe`: mở bộ cài bằng 7-Zip như một kho nén (chuột phải, 7-Zip, Giải nén vào thư mục riêng) — không bấm đúp, không chạy. Chỉ giải nén được khi bản 7-Zip đang dùng hỗ trợ NSIS.
6. Gửi tại https://www.microsoft.com/wdsi/filesubmission, chọn "Software developer"; ghi tên phát hiện `Trojan:Win32/Bearfoos.A!ml`, hash bộ cài, link release, và nói rõ app chưa ký số, mã nguồn công khai.
7. Không dùng `hedu.exe` bị cách ly trên máy thật, không tắt Defender, không thêm ngoại lệ.
