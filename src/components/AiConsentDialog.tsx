// Hộp xin phép TRƯỚC MỖI LƯỢT gửi dữ liệu tới AI (dùng chung cho mọi nhiệm vụ AI).
// Công tắc trong Cài đặt chỉ là đồng ý về nguyên tắc; lượt nào cũng phải bấm "Gửi" ở đây mới gọi mạng.
import { ConfirmDialog } from './ConfirmDialog';

export interface AiSendPlan {
  task: string;
  model: string;
  /** số câu hỏi THẬT sẽ gửi (0 với lượt thử kết nối) */
  questions: number;
  /** số lượt gọi (mỗi lượt tối đa vài câu) */
  calls: number;
  /** liệt kê đúng những gì sẽ rời khỏi máy */
  sends: string[];
}

export function AiConsentDialog({ plan, onSend, onCancel }: { plan: AiSendPlan; onSend(): void; onCancel(): void }) {
  return (
    <ConfirmDialog title={plan.questions ? `Gửi ${plan.questions} câu hỏi tới AI?` : 'Gửi lượt thử tới AI?'} confirmLabel={plan.questions ? `Gửi ${plan.questions} câu` : 'Gửi lượt thử'} onConfirm={onSend} onCancel={onCancel}>
      <p><b>Nhiệm vụ:</b> {plan.task} · <b>Model:</b> <span className="mono">{plan.model}</span> · {plan.calls} lượt gọi</p>
      <p><b>Sẽ gửi tới Google (Gemini):</b></p>
      <ul className="ai-sends">{plan.sends.map((s) => <li key={s}>{s}</li>)}</ul>
      <p className="aid-warn">Gói miễn phí: Google có thể dùng nội dung gửi lên để cải thiện sản phẩm và người duyệt của Google có thể đọc. HEdu không gửi tên, số điện thoại hay thông tin cá nhân, không gửi file sao lưu hay cả ngân hàng. Nếu tài khoản Google của thầy/cô đã bật trả phí thì lượt gọi có thể tính tiền.</p>
    </ConfirmDialog>
  );
}
