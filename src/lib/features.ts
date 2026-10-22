// Công tắc tính năng tập trung. Tắt = ẩn khỏi giao diện nhưng KHÔNG xoá mã hay dữ liệu.
// Bật lại Tạo đề: đổi `exam` thành true (một chỗ duy nhất), mọi lối vào hiện lại.
export const FEATURES = {
  /** màn Tạo đề, nút “Thêm vào đề”, mục trong thanh bên và ô lệnh. Tạm tắt theo Issue #2 (C). */
  exam: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;
export const featureOn = (k: FeatureKey): boolean => FEATURES[k];
