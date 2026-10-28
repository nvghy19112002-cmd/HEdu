// Công tắc tính năng tập trung. Tắt = ẩn khỏi giao diện nhưng KHÔNG xoá mã hay dữ liệu.
// Tắt/bật Tạo đề: đổi `exam` (một chỗ duy nhất), mọi lối vào ẩn/hiện theo.
export const FEATURES = {
  /** màn Tạo đề, nút “Thêm vào đề”, mục trong thanh bên và ô lệnh. Bật lại ở Tạo đề mới (lõi examgen + giao diện), thay màn cũ từng bị tắt theo Issue #2 (C). */
  exam: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;
export const featureOn = (k: FeatureKey): boolean => FEATURES[k];
