// Màn “Câu hỏi mới” (và sửa một câu ở trang riêng). Toàn bộ logic nằm trong QuestionEditor dùng chung với ngăn sửa ở Ngân hàng.
import { useApp, type NewAt } from '../app-context';
import { QuestionEditor } from '../components/QuestionEditor';
import { useBank } from '../lib/store';

export function EditorScreen({ editUid, newAt, fromBank }: { editUid?: string; newAt?: NewAt; fromBank?: boolean }) {
  const { go } = useApp();
  const { questions } = useBank();
  const editing = editUid ? questions.find((q) => q.uid === editUid) : undefined;
  return (
    <QuestionEditor
      editing={editing}
      variant="page"
      prefill={editing ? undefined : newAt}
      onBack={fromBank ? () => go({ screen: 'bank', focusUid: editing?.uid }) : undefined}
      onSaved={(q) => { if (!editing) go({ screen: 'editor', editUid: q.uid, fromBank }); }}
    />
  );
}
