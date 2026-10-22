// Câu hỏi mẫu để chạy thử giao diện (Toán 12). Không phải dữ liệu thật của giáo viên.
import type { Level, QType, Question } from './types';

type Seed = [QType, Level, string, string, string, string];
// [loại, mức độ, chương, bài, dạng, mã LaTeX]

const S: Seed[] = [
  ['tn', 'TH', 'c2D1', 'l2D11', 'f2D111', String.raw`\begin{ex}
  Cho hàm số $y = x^3 - 3x^2 + 2$. Hàm số đã cho nghịch biến trên khoảng nào dưới đây?
  \choice
  {\True $(0;2)$}
  {$(-\infty;0)$}
  {$(2;+\infty)$}
  {$(-2;2)$}
  \loigiai{
    Ta có $y' = 3x^2 - 6x$; $y' < 0 \Leftrightarrow 0 < x < 2$. Chọn A.
  }
\end{ex}`],
  ['tn', 'NB', 'c2D1', 'l2D11', 'f2D113', String.raw`\begin{ex}
  Hàm số $y = x^4 - 2x^2 + 3$ có bao nhiêu điểm cực trị?
  \choice
  {\True $3$}
  {$1$}
  {$2$}
  {$0$}
  \loigiai{
    $y' = 4x^3 - 4x = 4x(x^2-1)$ đổi dấu tại $x = 0$, $x = \pm 1$ nên hàm số có $3$ điểm cực trị.
  }
\end{ex}`],
  ['tln', 'TH', 'c2D1', 'l2D11', 'f2D113', String.raw`\begin{ex}
  Tìm giá trị cực đại của hàm số $y = x^3 - 3x + 1$.
  \shortans{3}
  \loigiai{
    $y' = 3x^2 - 3 = 0 \Leftrightarrow x = \pm 1$. Hàm số đạt cực đại tại $x = -1$, $y_{\text{CĐ}} = 3$.
  }
\end{ex}`],
  ['ds', 'TH', 'c2D1', 'l2D14', 'f2D141', String.raw`\begin{ex}
  Cho hàm số $y = \dfrac{x+1}{x-1}$. Xét tính đúng sai của các mệnh đề sau:
  \choiceTF
  {\True Tập xác định $D = \mathbb{R} \setminus \{1\}$.}
  {Hàm số đồng biến trên từng khoảng xác định.}
  {\True Tiệm cận đứng của đồ thị là $x = 1$.}
  {Tiệm cận ngang của đồ thị là $y = -1$.}
  \loigiai{
    $y' = \dfrac{-2}{(x-1)^2} < 0$ nên hàm số nghịch biến trên từng khoảng xác định. Tiệm cận ngang là $y = 1$.
  }
\end{ex}`],
  ['tn', 'VD', 'c2D1', 'l2D13', 'f2D131', String.raw`\begin{ex}
  Giá trị lớn nhất của hàm số $y = x^3 - 3x + 2$ trên đoạn $[0;2]$ bằng
  \choice
  {\True $4$}
  {$2$}
  {$0$}
  {$6$}
  \loigiai{
    $y' = 3x^2 - 3 = 0 \Leftrightarrow x = 1 \in [0;2]$. Ta có $y(0) = 2$, $y(1) = 0$, $y(2) = 4$. Vậy $\max\limits_{[0;2]} y = 4$.
  }
\end{ex}`],
  ['tl', 'VD', 'c2D1', 'l2D15', 'f2D152', String.raw`\begin{ex}
  Khảo sát sự biến thiên và vẽ đồ thị của hàm số $y = x^3 - 3x^2 + 2$.
  \loigiai{
    Tập xác định $D = \mathbb{R}$; $y' = 3x^2 - 6x$, $y' = 0 \Leftrightarrow x = 0$ hoặc $x = 2$. Bảng biến thiên:
    \begin{center}
    \begin{tikzpicture}
      \tkzTabInit[nocadre=false,lgt=1.2,espcl=2]{$x$/1,$y'$/1,$y$/2}{$-\infty$,$0$,$2$,$+\infty$}
      \tkzTabLine{,+,0,-,0,+,}
      \tkzTabVar{-/$-\infty$,+/$2$,-/$-2$,+/$+\infty$}
    \end{tikzpicture}
    \end{center}
  }
\end{ex}`],
  ['tn', 'NB', 'c2H2', 'l2H22', 'f2H221', String.raw`\begin{ex}
  Trong không gian $Oxyz$, cho $\overrightarrow{a} = (1;2;-3)$ và $\overrightarrow{b} = (2;0;1)$. Toạ độ của vectơ $\overrightarrow{a} + \overrightarrow{b}$ là
  \choice
  {\True $(3;2;-2)$}
  {$(-1;2;-4)$}
  {$(3;2;2)$}
  {$(2;0;-3)$}
  \loigiai{
    $\overrightarrow{a} + \overrightarrow{b} = (1+2;\,2+0;\,-3+1) = (3;2;-2)$.
  }
\end{ex}`],
  ['tln', 'TH', 'c2H2', 'l2H22', 'f2H222', String.raw`\begin{ex}
  Trong không gian $Oxyz$, cho $\overrightarrow{a} = (1;2;-3)$ và $\overrightarrow{b} = (2;0;1)$. Tính $\overrightarrow{a} \cdot \overrightarrow{b}$.
  \shortans{-1}
  \loigiai{
    $\overrightarrow{a} \cdot \overrightarrow{b} = 1\cdot 2 + 2 \cdot 0 + (-3)\cdot 1 = -1$.
  }
\end{ex}`],
  ['tn', 'NB', 'c2H2', 'l2H21', 'f2H212', String.raw`\begin{ex}
  Trong không gian $Oxyz$, hình chiếu vuông góc của điểm $M(2;-1;3)$ lên mặt phẳng $(Oxy)$ có toạ độ là
  \choice
  {\True $(2;-1;0)$}
  {$(0;-1;3)$}
  {$(2;0;3)$}
  {$(0;0;3)$}
  \loigiai{
    Hình chiếu lên $(Oxy)$ giữ nguyên hoành độ, tung độ và cho cao độ bằng $0$.
  }
\end{ex}`],
  ['tn', 'NB', 'c2D4', 'l2D41', 'f2D411', String.raw`\begin{ex}
  Họ nguyên hàm của hàm số $f(x) = 2x + \cos x$ là
  \choice
  {\True $x^2 + \sin x + C$}
  {$x^2 - \sin x + C$}
  {$2 + \sin x + C$}
  {$x^2 + \cos x + C$}
  \loigiai{
    $\displaystyle\int (2x + \cos x)\,\mathrm{d}x = x^2 + \sin x + C$.
  }
\end{ex}`],
  ['tl', 'NB', 'c2D4', 'l2D42', 'f2D421', String.raw`\begin{ex}
  Tính tích phân $I = \displaystyle\int_0^2 (2x+1)\,\mathrm{d}x$.
  \loigiai{
    $I = \left(x^2 + x\right)\Big|_0^2 = 6$.
  }
\end{ex}`],
  ['tn', 'TH', 'c2D4', 'l2D42', 'f2D421', String.raw`\begin{ex}
  Tích phân $\displaystyle\int_0^1 \mathrm{e}^x\,\mathrm{d}x$ bằng
  \choice
  {\True $\mathrm{e} - 1$}
  {$\mathrm{e}$}
  {$\mathrm{e} + 1$}
  {$1 - \mathrm{e}$}
  \loigiai{
    $\displaystyle\int_0^1 \mathrm{e}^x\,\mathrm{d}x = \mathrm{e}^x\Big|_0^1 = \mathrm{e} - 1$.
  }
\end{ex}`],
  ['ds', 'TH', 'c2D4', 'l2D41', 'f2D412', String.raw`\begin{ex}
  Cho hàm số $f(x) = 3x^2 - 4x + 1$. Xét tính đúng sai của các mệnh đề sau:
  \choiceTF
  {\True $\displaystyle\int f(x)\,\mathrm{d}x = x^3 - 2x^2 + x + C$.}
  {\True Nguyên hàm $F(x)$ của $f(x)$ thoả mãn $F(0) = 0$ là $F(x) = x^3 - 2x^2 + x$.}
  {\True $\displaystyle\int_0^1 f(x)\,\mathrm{d}x = 0$.}
  {$\displaystyle\int_0^2 f(x)\,\mathrm{d}x = 4$.}
  \loigiai{
    $\displaystyle\int_0^2 f(x)\,\mathrm{d}x = \left(x^3 - 2x^2 + x\right)\Big|_0^2 = 2$.
  }
\end{ex}`],
  ['tln', 'VD', 'c2D4', 'l2D43', 'f2D431', String.raw`\begin{ex}
  Tính diện tích hình phẳng giới hạn bởi các đường $y = x^2$ và $y = x$ (làm tròn đến hàng phần trăm).
  \shortans{0,17}
  \loigiai{
    $S = \displaystyle\int_0^1 \left(x - x^2\right)\mathrm{d}x = \dfrac{1}{2} - \dfrac{1}{3} = \dfrac{1}{6} \approx 0{,}17$.
  }
\end{ex}`],
  ['tn', 'TH', 'c2D6', 'l2D61', 'f2D611', String.raw`\begin{ex}
  Cho hai biến cố $A$, $B$ với $P(A) = 0{,}4$ và $P(B \mid A) = 0{,}5$. Khi đó $P(A \cap B)$ bằng
  \choice
  {\True $0{,}2$}
  {$0{,}9$}
  {$0{,}8$}
  {$0{,}1$}
  \loigiai{
    $P(A \cap B) = P(A)\cdot P(B \mid A) = 0{,}4 \cdot 0{,}5 = 0{,}2$.
  }
\end{ex}`],
];

export function seedQuestions(): Question[] {
  const now = Date.now();
  return S.map(([type, level, chapterId, lessonId, formId, latex], i) => ({
    uid: `seed-${i + 1}`,
    seq: i + 1,
    latex,
    type,
    level,
    grade: 12,
    chapterId,
    lessonId,
    formId,
    tags: i % 4 === 0 ? ['Đề thi thử'] : [],
    createdAt: now - (S.length - i) * 60000,
    updatedAt: now - (S.length - i) * 60000,
  }));
}
