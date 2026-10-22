// Màn “Câu hỏi mới” (và sửa một câu ở trang riêng). Toàn bộ logic nằm trong QuestionEditor dùng chung với ngăn sửa ở Ngân hàng.
import { useApp } from '../app-context';
import { QuestionEditor } from '../components/QuestionEditor';
import { useBank } from '../lib/store';

export function EditorScreen({ editUid }: { editUid?: string }) {
  const { go } = useApp();
  const { questions } = useBank();
  const editing = editUid ? questions.find((q) => q.uid === editUid) : undefined;
  return (
    <QuestionEditor
      editing={editing}
      variant="page"
      onSaved={(q) => { if (!editing) go({ screen: 'editor', editUid: q.uid }); }}
    />
  );
}
