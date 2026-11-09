// Bộ mẫu in HyMath của chủ dự án (Nguyễn Vương Gia Hy), đưa vào HEdu 02/11/2026 — SINH TỰ ĐỘNG bằng scripts/gen-hymath.py, đừng sửa tay.
// Đã sửa cho HEdu: bỏ đường dẫn Caidat/, Themes/, fonts/ (phông lấy từ TeX Live: \IfFontExistsTF thay \IfFileExists). Dịch bằng XeLaTeX.
// Lõi: hymath-caidat.tex → hymath-core.tex (fontspec, ex_test, chế độ màu/in/lời giải) → mẫu \ThemeFile → hymath-adapter.tex (\TieuDeDeSo, \TieuDeDeThi → khung tiêu đề của mẫu).
/* eslint-disable */

export const HYMATH_CORE: Readonly<Record<string, string>> = {
  "hymath-caidat.tex": String.raw`% Nạp theme và gói phục vụ nội dung. Biên dịch bằng XeLaTeX.
\input{hymath-core.tex}
\usepackage{graphicx,multicol,mathrsfs,totpages}
\usepackage{tkz-tab,tkz-euclide}
\usetikzlibrary{shapes.geometric,arrows,arrows.meta,intersections,positioning}
\IfFileExists{fontawesome5.sty}{\usepackage{fontawesome5}}{\providecommand{\faPenNib}{\ensuremath{\triangleright}}}
% Toàn bộ định nghĩa macro người dùng từ caidat gốc được giữ dưới đây.
\newcommand{\heva}[1]{\left\{\begin{aligned}#1\end{aligned}\right.}
\newcommand{\hoac}[1]{\left[\begin{aligned}#1\end{aligned}\right.}

% Tiêu đề đầu đề thi chuẩn form Bộ GD&ĐT
\newcommand{\TieuDeDeThi}[6]{%
	% #1: Sở GD/Trường, #2: Tên kỳ thi, #3: Tên bài kiểm tra, #4: Môn học, #5: Thời gian, #6: Mã đề
	\noindent
	\begin{minipage}[t]{0.45\textwidth}
		\centering
		\textbf{\MakeUppercase{#1}}\\[3pt]
		\textbf{#2}\\[4pt]
		\rule{3cm}{0.6pt}
	\end{minipage}
	\hfill
	\begin{minipage}[t]{0.52\textwidth}
		\centering
		\textbf{\MakeUppercase{#3}}\\[3pt]
		\textbf{MÔN: \MakeUppercase{#4}}\\[2pt]
		\textit{Thời gian làm bài: #5 phút (không kể phát đề)}
	\end{minipage}
	\par\vspace{6pt}\noindent
	\hfill
	\tikz[baseline=-0.5ex]\node[draw=black, very thick, rounded corners=2pt, inner xsep=8pt, inner ysep=3pt, font=\bfseries]{MÃ ĐỀ: #6};
	\par\vspace{8pt}
	\noindent\hrule height 1pt
	\vspace{8pt}
}
% 2. Cấu hình Header & Footer của bạn:
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0.4pt}

\fancyhead[R]{\footnotesize\itshape Toán 11}
\fancyfoot[L]{\footnotesize\itshape Trang \thepage/\ref{TotPages}}
\fancyfoot[R]{\footnotesize\itshape Học sinh không được sử dụng tài liệu}

% Ép \choiceTF luôn luôn hiển thị 4 dòng thẳng hàng (1 cột)
% ==========================================================
% MACRO TẠO TIÊU ĐỀ ĐỀ THI CÓ Ô "ĐỀ SỐ..."
% Cú pháp: \TieuDeDeSo{Tên Trường}{Tên Kỳ Thi}{Môn - Lớp}{Thời gian}{Số đề}
% ==========================================================
\newcommand{\TieuDeDeSo}[5]{%
	\noindent
	\begin{minipage}[c]{0.78\textwidth}
		\begin{center}
			\textbf{#1}\\[3pt]
			{\large\bfseries #2}\\[3pt]
			\textbf{Môn: #3} --- \textit{Thời gian làm bài: #4}
		\end{center}
	\end{minipage}\hfill
	\begin{minipage}[c]{0.20\textwidth}
		\centering
		\setlength{\fboxrule}{1.2pt}%
		\setlength{\fboxsep}{4pt}%
		\fbox{%
			\parbox[c][1.1cm][c]{2.2cm}{%
				\centering
				\small\textbf{ĐỀ SỐ}\\[2pt]
				{\Large\bfseries #5}%
			}%
		}%
	\end{minipage}
	\vspace{8pt}\noindent\rule{\textwidth}{0.6pt}\vspace{10pt}%
}

% ==========================================================
% MACRO LỜI GIẢI CĂN GIỮA ĐÃ THU HẸP KHOẢNG TRỐNG TỐI ƯU
% ==========================================================
\NewDocumentCommand{\LoiGiaiCham}{ O{Lời giải} m }{%
	\par\vspace{1pt}\noindent
	{\centering
		\tikz[baseline=-0.5ex]{
			\draw[line width=0.5pt, gray!60] (-2.5,0) -- (-1.1,0);
			\node[
			draw=MainDark, line width=0.6pt, fill=white,
			rounded corners=3pt, inner xsep=7pt, inner ysep=2pt,
			font=\footnotesize\bfseries\itshape, text=MainDark
			] at (0,0) {\faPenNib\ #1};
			\draw[line width=0.5pt, gray!60] (1.1,0) -- (2.5,0);
		}\par
	}%
	\vspace{2pt}% Khoảng cách từ thẻ đến dòng chấm đầu tiên
	\foreach \i in {1,...,#2}{%
		\noindent\makebox[\linewidth]{\dotfill}\par\vspace{3.5pt}% Giãn cách giữa các dòng chấm
	}%
	\vspace{1pt}%
}

% Lệnh viết tắt
\newcommand{\lgc}[2][Lời giải]{\LoiGiaiCham[#1]{#2}}
\usepackage{xcolor}

% --- TÔNG 1: Xanh Dương Đậm / Navy (Chuẩn đề thi & Sách giáo khoa) ---
\definecolor{MainDark}{HTML}{1A365D}   % Xanh Navy đậm sang trọng
% hoặc \definecolor{MainDark}{HTML}{0D47A1} % Xanh hoàng gia (Royal Blue)

% --- TÔNG 2: Xanh Mòng Két / Teal (Hiện đại, dịu mắt) ---
% \definecolor{MainDark}{HTML}{005B5C} 

% --- TÔNG 3: Đỏ Rượu Vang / Wine Red (Nổi bật, trang trọng) ---
% \definecolor{MainDark}{HTML}{8B0000} 

% --- TÔNG 4: Tím Than / Dark Violet ---
% \definecolor{MainDark}{HTML}{4A148C} 

% --- TÔNG 5: Đen / Xám Đậm (Tối ưu tuyệt đối cho in ấn Trắng Đen) ---
% \definecolor{MainDark}{HTML}{222222}

% --- 1. Macro dòng chấm đoạn văn (hỗ trợ tiêu đề & nhiều dòng) ---
\NewDocumentCommand{\dongcham}{ O{} m }{%
	\par\vspace{3pt}\noindent
	\ifstrempty{#1}{%
		% Không có tiêu đề -> in các dòng chấm trống
		\foreach \i in {1,...,#2}{%
			\noindent\makebox[\linewidth]{\dotfill}\par\vspace{4.5pt}%
		}%
	}{%
		% Có tiêu đề -> Dòng đầu in Tiêu đề + chấm, các dòng sau in chấm tiếp
		\textbf{\textit{#1}}\space\dotfill\par\vspace{4.5pt}%
		\ifnum#2>1
		\pgfmathtruncatemacro{\conlai}{#2-1}%
		\foreach \i in {1,...,\conlai}{%
			\noindent\makebox[\linewidth]{\dotfill}\par\vspace{4.5pt}%
		}%
		\fi
	}%
	\vspace{1pt}%
}
% Áp dụng lớp thiết kế sau khai báo gốc; giữ bản cũ để gọi khi cần.
\input{hymath-adapter.tex}
`,
  "hymath-core.tex": String.raw`% Theme dành cho XeLaTeX; không chỉnh sửa ex_test.sty.
\usepackage{fontspec}
\setmainfont{lmroman10}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]
\setsansfont{lmsans10}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-oblique,BoldItalicFont=*-boldoblique]
\usepackage{amsmath}
\usepackage{unicode-math}
\setmathfont{latinmodern-math.otf}
\providecommand{\square}{\symbol{"25A1}}
\usepackage[margin=17mm,top=24mm,bottom=22mm,headheight=22pt,headsep=7mm]{geometry}
\usepackage[table]{xcolor}
\usepackage{tikz}
\usetikzlibrary{calc,patterns}
\usepackage[most]{tcolorbox}
% ex_test yêu cầu vietnam (dành cho pdfLaTeX). Với XeLaTeX, fontspec
% đã xử lý Unicode; đánh dấu gói để tránh nạp bộ mã font cũ.
\makeatletter
\@namedef{ver@vietnam.sty}{2026/10/06 Unicode handled by fontspec}
\@namedef{opt@vietnam.sty}{utf8}
\makeatother
\makeatletter
\@namedef{ver@amssymb.sty}{2013/01/14 v3.01 provided by unicode-math}
\@namedef{ver@amsfonts.sty}{2013/01/14 v3.01 provided by unicode-math}
\makeatother
\usepackage{ex_test}
\usepackage{enumitem,needspace}
\IfFileExists{\ThemeFile}{\input{\ThemeFile}}{\PackageError{HyMath}{Missing theme file: \ThemeFile}{Check ThemeFile in dethi.tex.}}
\ifExamColor
\colorlet{ExamAccent}{ThemeBase}\colorlet{ExamSecondary}{ThemeSecondary}\colorlet{ExamLight}{ThemeBase!6!white}
\else
\definecolor{ExamAccent}{gray}{0}\definecolor{ExamSecondary}{gray}{0.45}\definecolor{ExamLight}{gray}{1}
\fi
\definecolor{ExamRule}{gray}{0.45}
\ifExamColor\colorlet{PanelFill}{ExamAccent}\colorlet{PanelInk}{white}\else\colorlet{PanelFill}{white}\colorlet{PanelInk}{black}\fi
\linespread{1.06}
\setlength{\emergencystretch}{1em}
\tikzset{every picture/.append style={line width=.65pt}}
\setlength{\parindent}{0pt}
\setlength{\parskip}{3pt}
\setlist[enumerate]{label=\textbf{\alph*)},leftmargin=8mm,itemsep=3pt,topsep=3pt}
\renewcommand{\nameex}{\sffamily\bfseries\color{ExamAccent}Câu}
\renewcommand{\FalseEX}{\stepcounter{dapan}\AnswerBadge{\Alph{dapan}}\ignorespaces}
\renewcommand{\TrueEX}{\FalseEX}
\settowidth{\widthalpha}{\AnswerBadge{D}}
\addtolength{\widthalpha}{2pt}
\renewcommand{\arraystretch}{1.25}
\apptocmd{\callcotDS}{\setlength{\lengthDS}{12mm}}{}{}
\AtBeginEnvironment{longtable}{\arrayrulecolor{ExamRule}\setlength{\arrayrulewidth}{.5pt}\setlength{\extrarowheight}{3pt}}
\AtEndEnvironment{longtable}{\arrayrulecolor{black}}
\ifExamSolutions\showansEX{ex}\else\hideansEX{ex}
\AtBeginEnvironment{ex}{\renewcommand{\writekeyTF}{\ifthenelse{\equal{\cotDS}{2}}{&\centering\color{ExamAccent}$\bigcirc$ &\centering\color{ExamAccent}$\bigcirc$}{\ifthenelse{\equal{\cotDS}{1}}{&\centering$\bigcirc$}{}}}}
\fi
\AtBeginEnvironment{longtable}{%
\renewcommand{\phatbieu}{\cellcolor{PanelFill}\textcolor{PanelInk}{\sffamily\bfseries Mệnh đề}}%
\renewcommand{\Dung}{\cellcolor{PanelFill}\textcolor{PanelInk}{\sffamily\bfseries Đúng}}%
\renewcommand{\Sai}{\cellcolor{PanelFill}\textcolor{PanelInk}{\sffamily\bfseries Sai}}}
\newcommand{\HyApplyPageStyle}{\HyThemePageStyle}
\HyApplyPageStyle
% Éléments communs; informations centralisées dans settings.tex.
\newcommand{\ExamTitle}{\HyThemeTitle\StudentInfo}
\newcommand{\ExamPart}[2]{\par\addvspace{4mm}\Needspace{35mm}\setcounter{ex}{0}%
\HyThemePart{#1}
{\small #2}\par\vspace{1mm}}

`,
  "hymath-adapter.tex": String.raw`% Macro toán và dòng chấm giữ nguyên. Chỉ nối tiêu đề với 5 theme.
\let\TieuDeDeSoCu\TieuDeDeSo
\let\TieuDeDeThiCu\TieuDeDeThi
\renewcommand{\TieuDeDeSo}[5]{%
\gdef\SchoolName{#1}\gdef\ExamName{#2}\gdef\SubjectName{#3}%
\gdef\ExamTime{#4}\gdef\ExamCode{#5}%
\ExamTitle}
\renewcommand{\TieuDeDeThi}[6]{%
\gdef\SchoolName{#1\\#2}\gdef\ExamName{#3}%
\gdef\SubjectName{MÔN: #4}\gdef\ExamTime{#5 phút}\gdef\ExamCode{#6}%
\ExamTitle}
\colorlet{MainDark}{ExamAccent}
\renewtheorem{ex}{\sffamily\bfseries\color{ExamAccent}Câu}
\HyApplyPageStyle
\newcommand{\NapDe}[1]{\clearpage\input{#1}}
`,
  "hymath-hopgiaidap.tex": String.raw`% HỘP CÂU HỎI / GIẢI ĐÁP - BURGUNDY MODERN
% Chép file vào Themes/, nạp SAU caidat và TRƯỚC begin{document}:
%   \input{Themes/macro-hop-giai-dap.tex}
%
% CHỈ CÂU HỎI:
%   \HopCauHoi[Câu 1. Tập xác định]{Nội dung câu hỏi, công thức, hình TikZ...}
% CÂU HỎI + LỜI GIẢI:
%   \HopGiaiDap[Câu 1. Tập xác định]{Nội dung câu hỏi}{Nội dung lời giải}
% DÁN NGUYÊN MÔI TRƯỜNG ex CÓ loigiai, KHÔNG TÁCH NỘI DUNG:
%   \HopBaiGiai[Giải đáp cho học sinh]{\begin{ex} ... \loigiai{...} \end{ex}}
% ẨN / HIỆN phần lời giải của HopGiaiDap (mặc định: hiện):
%   \AnGiaiDap     hoặc     \HienGiaiDap
% Nội dung dài có thể viết bằng môi trường:
%   \begin{hopcauhoi}[Tiêu đề] ... \end{hopcauhoi}
%
% Không ghi đè ex / choice. HopBaiGiai chỉ định dạng loigiai bên trong hộp;
% các câu ex bên ngoài hộp vẫn theo chế độ ẩn/hiện của caidat.
% Hoạt động với công thức, enumerate, tabular, TikZ, hình ảnh có sẵn.
% Longtable (gồm choiceTF[1t] của ex_test) không đặt trong tcolorbox:
% dùng tabular cho bảng nhỏ hoặc để bảng longtable ngoài hộp.

\ifdefined\HyGDLoaded\expandafter\endinput\fi
\def\HyGDLoaded{1}
\RequirePackage{xcolor,tikz,tcolorbox,etoolbox,xparse}
\tcbuselibrary{skins,breakable}

\newcommand{\HyGDMau}{%
 \definecolor{HyGDAccent}{HTML}{772039}%
 \definecolor{HyGDSecondary}{HTML}{AD8751}%
 \definecolor{HyGDRule}{HTML}{D5BDC3}%
 \definecolor{HyGDSoft}{HTML}{FBF6F7}%
 \ifcsdef{color@HyBurgundyDeep}{\colorlet{HyGDAccent}{HyBurgundyDeep}}{}%
 \ifcsdef{color@ExamSecondary}{\colorlet{HyGDSecondary}{ExamSecondary}}{}%
}
\newcommand{\HyGDTrangDen}{%
 \colorlet{HyGDAccent}{black}%
 \definecolor{HyGDSecondary}{gray}{.4}%
 \definecolor{HyGDRule}{gray}{.6}%
 \colorlet{HyGDSoft}{white}%
}
\HyGDMau
% Tự theo chế độ màu/trắng đen trong main của bộ HyMath.
\AtBeginDocument{%
 \HyGDMau
 \ifcsdef{ifExamColor}{\ifExamColor\else\HyGDTrangDen\fi}{}%
}

\newif\ifHyGDShowSolution
\HyGDShowSolutiontrue
\NewDocumentCommand{\AnGiaiDap}{}{\HyGDShowSolutionfalse}
\NewDocumentCommand{\HienGiaiDap}{}{\HyGDShowSolutiontrue}

\newcommand{\HyGDMark}{%
 \tikz[baseline=-.4ex,x=1mm,y=1mm]{%
  \fill[HyGDAccent](0,0)--(1.2,0)--(2.8,2.3)--(1.6,2.3)--cycle;
  \fill[HyGDSecondary](2.5,0)--(3.1,0)--(4.7,2.3)--(4.1,2.3)--cycle;}}

\tcbset{hy gd/.style={%
 enhanced jigsaw,breakable,
 colback=white,colbacklower=HyGDSoft,colframe=HyGDRule,
 coltitle=HyGDAccent,colbacktitle=white,
 fonttitle=\sffamily\bfseries\fontsize{11}{14}\selectfont,
 boxrule=.5pt,arc=.7mm,
 left=4mm,right=4mm,top=2.5mm,bottom=2.5mm,boxsep=0pt,
 lefttitle=4mm,righttitle=4mm,toptitle=2.5mm,bottomtitle=2mm,
 titlerule=.5pt,titlerule style={HyGDSecondary},
 segmentation style={draw=HyGDSecondary,solid,line width=.45pt},
 before skip=4mm,after skip=4mm,
 before upper={\setlength{\parindent}{0pt}},
 before lower={\setlength{\parindent}{0pt}},
 overlay unbroken={%
  \draw[HyGDAccent,line width=1.2pt,line cap=rect]
   ([yshift=-5mm]frame.north west)--(frame.north west)--
   ([xshift=10mm]frame.north west);
  \draw[HyGDSecondary,line width=.65pt]
   ([xshift=-7mm,yshift=1.3mm]frame.south east)--++(3mm,3mm);
 },
 overlay first={%
  \draw[HyGDAccent,line width=1.2pt,line cap=rect]
   ([yshift=-5mm]frame.north west)--(frame.north west)--
   ([xshift=10mm]frame.north west);
 },
 overlay last={%
  \draw[HyGDSecondary,line width=.65pt]
   ([xshift=-7mm,yshift=1.3mm]frame.south east)--++(3mm,3mm);
 }
}}

\NewTColorBox{hopcauhoi}{O{CÂU HỎI}}{%
 hy gd,title={\HyGDMark\hspace{6pt}#1},
 title after break={\HyGDMark\hspace{6pt}#1\enspace{\normalfont\sffamily\small (tiếp)}}}

\NewDocumentCommand{\HopCauHoi}{O{CÂU HỎI} +m}{%
 \begin{hopcauhoi}[#1]#2\end{hopcauhoi}}

\NewDocumentCommand{\HopGiaiDap}{O{GIẢI ĐÁP CÂU HỎI} +m +m}{%
 \begin{hopcauhoi}[#1]
 #2%
 \ifHyGDShowSolution
  \ifblank{#3}{}{%
   \tcblower
   {\sffamily\bfseries\fontsize{10.5}{13}\selectfont\color{HyGDAccent}HƯỚNG GIẢI\par}
   \smallskip #3%
  }%
 \fi
 \end{hopcauhoi}}

% Adapter cục bộ cho ex_test: không gọi tcblower khi ex còn mở.
% Nhờ vậy giữ nguyên nhóm của ex và cho phép lời giải tự qua trang.
\newif\ifHyGDInsideEx
\HyGDInsideExfalse
\NewDocumentCommand{\HyGDExSolution}{+m}{%
 \ifHyGDShowSolution
  \par\addvspace{3mm}%
  {\color{HyGDSecondary}\hrule height .45pt}%
  \smallskip
  {\sffamily\bfseries\fontsize{10.5}{13}\selectfont\color{HyGDAccent}HƯỚNG GIẢI\par}%
  \smallskip #1\par
 \fi
 \ifcsdef{writeansbook}{\writeansbook{#1}}{}%
}
\AtBeginDocument{%
 \AtBeginEnvironment{ex}{%
  \ifHyGDInsideEx\let\loigiai\HyGDExSolution\fi
 }%
}
\NewDocumentCommand{\HopBaiGiai}{O{GIẢI ĐÁP CHO HỌC SINH} +m}{%
 \begingroup\HyGDInsideExtrue
 \begin{hopcauhoi}[#1]#2\end{hopcauhoi}%
 \endgroup}

% VÍ DỤ ĐÃ KIỂM TRA VỚI ĐOẠN ex CỦA ANH:
% Bỏ dấu % ở các dòng ví dụ dưới đây rồi đặt vào phần nội dung tài liệu.
% \HopBaiGiai[Giải đáp: Góc bé nhất của tam giác]{%
% \begin{ex}
% Cho tam giác $ABC$ có độ dài ba cạnh lần lượt là $a,b,c$ thỏa $\dfrac{a}{2} = \dfrac{b}{3} = \dfrac{c}{4}$. Tính số đo góc bé nhất của tam giác (làm tròn đến hàng đơn vị độ).
% \loigiai{
% Đặt $\dfrac{a}{2} = \dfrac{b}{3} = \dfrac{c}{4} = k \, (k > 0)$.
% 
% Suy ra $a = 2k$, $b = 3k$, $c = 4k$.
% 
% Trong một tam giác, góc đối diện với cạnh nhỏ nhất là góc nhỏ nhất.
% Vì $2k < 3k < 4k \Rightarrow a < b < c$, nên góc $A$ (đối diện với cạnh $a$) là góc bé nhất của tam giác $ABC$.
% 
% Áp dụng hệ quả định lý Côsin, ta có:
% $$ \cos A = \dfrac{b^2 + c^2 - a^2}{2bc} $$
% $$ \cos A = \dfrac{(3k)^2 + (4k)^2 - (2k)^2}{2 \cdot 3k \cdot 4k} $$
% $$ \cos A = \dfrac{9k^2 + 16k^2 - 4k^2}{24k^2} = \dfrac{21k^2}{24k^2} = \dfrac{7}{8} $$
% 
% Sử dụng máy tính cầm tay, ta suy ra:
% $$ \widehat{A} = \arccos\left(\dfrac{7}{8}\right) \approx 28^\circ 57' \approx 29^\circ. $$
% 
% Vậy số đo góc bé nhất của tam giác xấp xỉ $29^\circ$.
% }
% \end{ex}
% }
`,
};

export interface HyTheme { file: string; name: string; tex: string }
export const HYMATH_THEMES: readonly HyTheme[] = [
  { file: "theme-02-navy-editorial.tex", name: "Navy Editorial", tex: String.raw`% NAVY EDITORIAL — theme độc lập, dùng trong bộ Dethi-HyMath-Themes.
% Thay file cùng tên trong Themes/. Biên dịch dethi.tex bằng XeLaTeX.
% NAVY EDITORIAL: palette + title + section headings + answer badges + page furniture.
\definecolor{ThemeBase}{HTML}{193D66}
\definecolor{ThemeSecondary}{HTML}{537B9D}
\def\ThemeName{NAVY EDITORIAL}

% 2. Tiêu đề gọn: giữ tên kỳ thi ở một hàng riêng.
\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{10}{12}\selectfont\SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{13}{16}\selectfont\ExamName\par}}

% 3. Hai hàng điền thông tin; mã đề nằm cùng hàng lớp/SBD.
\newcommand{\StudentInfo}{%
 \par\vspace{1.5mm}\noindent
 {\fontsize{10.5}{13}\selectfont
 \textbf{Họ và tên:}\enspace\dotfill\par\vspace{1mm}
 \noindent\textbf{Lớp:}\enspace\makebox[25mm]{\dotfill}\hfill
 \textbf{SBD:}\enspace\makebox[35mm]{\dotfill}\hfill
 \tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=.8mm,
 left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\small\color{ExamAccent}Mã đề\enspace\textbf{\ExamCode}}\par}
 \vspace{2mm}}

% 4. Khung 3 tầng: trường / kỳ thi / môn + thời gian + năm học.
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[enhanced,colback=white,colframe=ExamAccent,
 colbacktitle=PanelFill,coltitle=PanelInk,arc=1mm,boxrule=.6pt,
 title={\TitleSchool},halign title=center,
 left=4mm,right=4mm,top=2mm,bottom=2mm,toptitle=1.5mm,bottomtitle=1.5mm,
 before skip=2mm,after skip=1mm,titlerule=.6pt]
 \centering\color{ExamAccent}\TitleExam\vspace{1.5mm}
 {\sffamily\fontsize{10}{12}\selectfont
 \textbf{\SubjectName}\quad\textcolor{ExamSecondary}{|}\quad
 \ExamTime\quad\textcolor{ExamSecondary}{|}\quad Năm học \SchoolYear\par}
 \end{tcolorbox}}

% 5. Tiêu đề phần; câu hỏi trong data giữ nguyên.
\newcommand{\HyThemePart}[1]{%
 \par{\sffamily\bfseries\fontsize{11.5}{14}\selectfont\color{ExamAccent}#1\par}%
 \vspace{1mm}{\color{ExamSecondary}\hrule height .5pt}\vspace{1mm}}

% 6. Nhãn đáp án nhẹ: dễ nhìn khi có nhiều câu, tiết kiệm mực.
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=ExamAccent,line width=.5pt,fill=ExamLight,text=ExamAccent,
 rounded corners=1pt,inner xsep=3pt,inner ysep=1pt,font=\sffamily\bfseries\small](a){#1};}

% 7. Tự tô màu tiêu đề phần kiểu cũ: \textbf{PHẦN I...}.
% Nhận diện tiền tố PHẦN/Phần + số La Mã; các chữ đậm khác giữ nguyên.
\newcommand{\HyStyledHeading}[1]{\tcbox[on line,colback=PanelFill,colframe=ExamAccent,arc=1pt,boxrule=.5pt,left=5pt,right=5pt,top=2pt,bottom=2pt]{\color{PanelInk}\sffamily\HyOriginalTextbf{#1}}}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyStyledHeading{#1}}
   {\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff

% 8. Dấu nhận diện navy và đường kẻ header/footer.
\newcommand{\HyNavyMark}{\tikz[baseline=-.4ex]{\fill[ExamAccent](0,0) rectangle (.12,.25);\fill[ExamSecondary](.18,0) rectangle (.50,.25);}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{30pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.6pt}
 \renewcommand{\footrulewidth}{.6pt}
 \renewcommand{\headrule}{\hbox to\headwidth{\color{ExamAccent}\leaders\hrule height .6pt\hfill}}
 \renewcommand{\footrule}{\vskip-2pt\hbox to\headwidth{\color{ExamAccent}\leaders\hrule height .6pt\hfill}\vskip3pt}
 \fancyhead[L]{\HyNavyMark\hspace{5pt}\sffamily\fontsize{9.5}{12}\selectfont\color{ExamAccent}\textbf{\SubjectName}\quad |\quad\SchoolYear}
 \fancyhead[R]{\tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=1pt,left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}MÃ ĐỀ\enspace\textbf{\ExamCode}}}
 \fancyfoot[L]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\TeacherName}
 \fancyfoot[R]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\HyNavyMark\hspace{5pt}Trang \textbf{\thepage}\,/\,\ref{TotPages}}}

\newcommand{\ExamEnd}{%
 \par\addvspace{5mm}\centerline{\color{ExamAccent}\rule{15mm}{.5pt}\quad\sffamily\bfseries HẾT\quad\rule{15mm}{.5pt}}}

% Hoàn thiện bảng và ô kết quả sau khi nạp core.
\AtBeginDocument{%
 \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 \setmathfont{texgyretermes-math.otf}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%

 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}
` },
  { file: "theme-06-navy-gold.tex", name: "Navy Gold Signature", tex: String.raw`% NAVY GOLD SIGNATURE — theme độc lập, dùng trong bộ Dethi-HyMath-Themes.
% Lưu trong Themes/; chọn ThemeFile = theme-06-navy-gold.tex.
% Không cần thêm font: dùng Termes–Heros nếu có, nếu thiếu giữ font core.
% NAVY GOLD SIGNATURE: palette + title + section headings + answer badges + page furniture.
\definecolor{ThemeBase}{HTML}{142D4E}
\definecolor{ThemeSecondary}{HTML}{9B783D}
\def\ThemeName{NAVY GOLD SIGNATURE}

% 2. Tiêu đề gọn: giữ tên kỳ thi ở một hàng riêng.
\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{10}{12}\selectfont\SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{13}{16}\selectfont\ExamName\par}}

% 3. Hai hàng điền thông tin; mã đề nằm cùng hàng lớp/SBD.
\newcommand{\StudentInfo}{%
 \par\vspace{1.5mm}\noindent
 {\fontsize{10.5}{13}\selectfont
 \textbf{Họ và tên:}\enspace\dotfill\par\vspace{1mm}
 \noindent\textbf{Lớp:}\enspace\makebox[25mm]{\dotfill}\hfill
 \textbf{SBD:}\enspace\makebox[35mm]{\dotfill}\hfill
 \tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=.8mm,
 left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\small\color{ExamAccent}Mã đề\enspace\textbf{\ExamCode}}\par}
 \vspace{2mm}}

% 4. Ba tầng chữ trên nền trắng; chi tiết góc bằng TikZ.
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[enhanced,colback=white,colframe=ExamAccent,arc=0mm,boxrule=.45pt,
 borderline north={1pt}{0pt}{ExamAccent},borderline south={.8pt}{0pt}{ExamSecondary},
 left=5mm,right=5mm,top=2mm,bottom=2mm,before skip=2mm,after skip=1mm,
 overlay={
  \draw[ExamSecondary,line width=1.1pt]
   ([xshift=1.4mm,yshift=-1.4mm]frame.north west)--++(5mm,0)
   ([xshift=-1.4mm,yshift=1.4mm]frame.south east)--++(-5mm,0);
 }]
 \centering\color{ExamAccent}\TitleSchool\vspace{1.3mm}
 {\color{ExamSecondary}\rule{18mm}{.5pt}\par}\vspace{1.3mm}
 \TitleExam\vspace{1.5mm}
 {\sffamily\fontsize{10}{12}\selectfont
 \textbf{\SubjectName}\quad\textcolor{ExamSecondary}{|}\quad
 \ExamTime\quad\textcolor{ExamSecondary}{|}\quad Năm học \SchoolYear\par}
 \end{tcolorbox}}

% 5. Tiêu đề phần; câu hỏi trong data giữ nguyên.
\newcommand{\HyThemePart}[1]{%
 \par{\sffamily\bfseries\fontsize{11.5}{14}\selectfont\color{ExamAccent}#1\par}%
 \vspace{1mm}{\color{ExamSecondary}\hrule height .5pt}\vspace{1mm}}

% 6. Nhãn đáp án nhẹ: dễ nhìn khi có nhiều câu, tiết kiệm mực.
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=ExamAccent,line width=.5pt,fill=ExamLight,text=ExamAccent,
 rounded corners=1pt,inner xsep=3pt,inner ysep=1pt,font=\sffamily\bfseries\small](a){#1};}

% 7. Tự tô màu tiêu đề phần kiểu cũ: \textbf{PHẦN I...}.
% Nhận diện tiền tố PHẦN/Phần + số La Mã; các chữ đậm khác giữ nguyên.
\newcommand{\HyStyledHeading}[1]{%
 \tcbox[on line,enhanced,colback=ExamLight,colframe=ExamLight,arc=0mm,boxrule=0pt,
 borderline south={.65pt}{0pt}{ExamSecondary},left=4pt,right=4pt,top=1.5pt,bottom=1.5pt]
 {\color{ExamAccent}\sffamily\HyOriginalTextbf{#1}}}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyStyledHeading{#1}}
   {\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff

% 8. Dấu nhận diện navy và đường kẻ header/footer.
\newcommand{\HyNavyMark}{%
 \tikz[baseline=-.4ex]{
  \fill[ExamAccent](.12,0)--(.24,.12)--(.12,.24)--(0,.12)--cycle;
  \draw[ExamSecondary,line width=.7pt](.32,.12)--(.59,.12);
 }}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{30pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.6pt}
 \renewcommand{\footrulewidth}{.6pt}
 \renewcommand{\headrule}{\hbox to\headwidth{\color{ExamSecondary}\rule{14mm}{.7pt}\color{ExamAccent}\leaders\hrule height .35pt\hfill}}
 \renewcommand{\footrule}{\vskip-2pt\hbox to\headwidth{\color{ExamSecondary}\leaders\hrule height .45pt\hfill}\vskip3pt}
 \fancyhead[L]{\HyNavyMark\hspace{5pt}\sffamily\fontsize{9.5}{12}\selectfont\color{ExamAccent}\textbf{\SubjectName}\quad |\quad\SchoolYear}
 \fancyhead[R]{\tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=1pt,left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}MÃ ĐỀ\enspace\textbf{\ExamCode}}}
 \fancyfoot[L]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\TeacherName}
 \fancyfoot[R]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\HyNavyMark\hspace{5pt}Trang \textbf{\thepage}\,/\,\ref{TotPages}}}

\newcommand{\ExamEnd}{%
 \par\addvspace{5mm}\centerline{\color{ExamAccent}\rule{15mm}{.5pt}\quad\sffamily\bfseries HẾT\quad\rule{15mm}{.5pt}}}

% Hoàn thiện bảng và ô kết quả sau khi nạp core.
\AtBeginDocument{%
 \IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyreheros-regular.otf}{%
  \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyretermes-math.otf}{%
  \setmathfont{texgyretermes-math.otf}%
 }{}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%

 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}
` },
  { file: "theme-07-navy-blueprint.tex", name: "Navy Blueprint", tex: String.raw`% NAVY BLUEPRINT — theme độc lập, dùng trong bộ Dethi-HyMath-Themes.
% Lưu trong Themes/; chọn ThemeFile = theme-07-navy-blueprint.tex.
% Không cần thêm font: dùng Termes–Heros nếu có, nếu thiếu giữ font core.
% NAVY BLUEPRINT: palette + title + section headings + answer badges + page furniture.
\definecolor{ThemeBase}{HTML}{163B5B}
\definecolor{ThemeSecondary}{HTML}{36808C}
\def\ThemeName{NAVY BLUEPRINT}

% 2. Tiêu đề gọn: giữ tên kỳ thi ở một hàng riêng.
\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{10}{12}\selectfont\SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{13}{16}\selectfont\ExamName\par}}

% 3. Hai hàng điền thông tin; mã đề nằm cùng hàng lớp/SBD.
\newcommand{\StudentInfo}{%
 \par\vspace{1.5mm}\noindent
 {\fontsize{10.5}{13}\selectfont
 \textbf{Họ và tên:}\enspace\dotfill\par\vspace{1mm}
 \noindent\textbf{Lớp:}\enspace\makebox[25mm]{\dotfill}\hfill
 \textbf{SBD:}\enspace\makebox[35mm]{\dotfill}\hfill
 \tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=.8mm,
 left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\small\color{ExamAccent}Mã đề\enspace\textbf{\ExamCode}}\par}
 \vspace{2mm}}

% 4. Khung hình học: lưới và góc cắt chỉ ở vùng trang trí.
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[enhanced,colback=white,colframe=ExamAccent,arc=0mm,boxrule=.45pt,
 left=5mm,right=5mm,top=2.2mm,bottom=2.2mm,before skip=2mm,after skip=1mm,
 borderline south={1pt}{0pt}{ExamSecondary},
 overlay={
  \ifExamColor
   \fill[ExamLight]([xshift=-13mm]frame.north east)--(frame.north east)--([yshift=-13mm]frame.north east)--cycle;
   \draw[ExamSecondary!25!white,line width=.3pt]
    ([xshift=-8mm,yshift=-1mm]frame.north east)--++(7mm,0)
    ([xshift=-5mm,yshift=-4mm]frame.north east)--++(4mm,0)
    ([xshift=-4mm,yshift=-1mm]frame.north east)--++(0,-4mm);
  \fi
  \draw[ExamSecondary,line width=.8pt]([xshift=1mm,yshift=-1mm]frame.north west)--++(5mm,0)
   ([xshift=-1mm,yshift=1mm]frame.south east)--++(-5mm,0);
 }]
 \centering\color{ExamAccent}\TitleSchool\vspace{1.5mm}
 \TitleExam\vspace{1.5mm}
 {\sffamily\fontsize{10}{12}\selectfont\textbf{\SubjectName}\quad
 \textcolor{ExamSecondary}{/}\quad\ExamTime\quad
 \textcolor{ExamSecondary}{/}\quad Năm học \SchoolYear\par}
 \end{tcolorbox}}

% 5. Tiêu đề phần; câu hỏi trong data giữ nguyên.
\newcommand{\HyThemePart}[1]{%
 \par{\sffamily\bfseries\fontsize{11.5}{14}\selectfont\color{ExamAccent}#1\par}%
 \vspace{1mm}{\color{ExamSecondary}\hrule height .5pt}\vspace{1mm}}

% 6. Nhãn đáp án nhẹ: dễ nhìn khi có nhiều câu, tiết kiệm mực.
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=ExamAccent,line width=.5pt,fill=ExamLight,text=ExamAccent,
 rounded corners=0pt,inner xsep=3pt,inner ysep=1pt,font=\sffamily\bfseries\small](a){#1};}

% 7. Tự tô màu tiêu đề phần kiểu cũ: \textbf{PHẦN I...}.
% Nhận diện tiền tố PHẦN/Phần + số La Mã; các chữ đậm khác giữ nguyên.
\newcommand{\HyStyledHeading}[1]{%
 \tcbox[on line,enhanced,colback=white,colframe=ExamAccent,arc=0mm,boxrule=.5pt,
 left=4pt,right=7pt,top=1.5pt,bottom=1.5pt,
 overlay={\fill[ExamSecondary]([xshift=-2mm]frame.north east)--(frame.north east)--([yshift=-2mm]frame.north east)--cycle;}]
 {\color{ExamAccent}\sffamily\HyOriginalTextbf{#1}}}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyStyledHeading{#1}}
   {\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff

% 8. Dấu nhận diện navy và đường kẻ header/footer.
\newcommand{\HyNavyMark}{\tikz[baseline=-.4ex]{%
 \draw[ExamAccent,line width=.6pt](0,0)--(.28,0)--(.28,.24)--cycle;
 \fill[ExamSecondary](.28,.24)circle(.025);\draw[ExamSecondary,line width=.6pt](.36,.12)--(.58,.12);}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{30pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.6pt}
 \renewcommand{\footrulewidth}{.6pt}
 \renewcommand{\headrule}{\hbox to\headwidth{\color{ExamSecondary}\rule{14mm}{.7pt}\color{ExamAccent}\leaders\hrule height .35pt\hfill}}
 \renewcommand{\footrule}{\vskip-2pt\hbox to\headwidth{\color{ExamSecondary}\leaders\hrule height .45pt\hfill}\vskip3pt}
 \fancyhead[L]{\HyNavyMark\hspace{5pt}\sffamily\fontsize{9.5}{12}\selectfont\color{ExamAccent}\textbf{\SubjectName}\quad |\quad\SchoolYear}
 \fancyhead[R]{\tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=1pt,left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}MÃ ĐỀ\enspace\textbf{\ExamCode}}}
 \fancyfoot[L]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\TeacherName}
 \fancyfoot[R]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\HyNavyMark\hspace{5pt}Trang \textbf{\thepage}\,/\,\ref{TotPages}}}

\newcommand{\ExamEnd}{%
 \par\addvspace{5mm}\centerline{\color{ExamAccent}\rule{15mm}{.5pt}\quad\sffamily\bfseries HẾT\quad\rule{15mm}{.5pt}}}

% Hoàn thiện bảng và ô kết quả sau khi nạp core.
\AtBeginDocument{%
 \IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyreheros-regular.otf}{%
  \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyretermes-math.otf}{%
  \setmathfont{texgyretermes-math.otf}%
 }{}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%

 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}

% Sửa bảng đúng/sai: không để nền ô tiêu đề che đường kẻ của ex_test.
% Vòng chọn là vector TikZ, không phụ thuộc glyph bigcirc của font toán.
\newcommand{\HyTFBubble}{%
 \raisebox{4.4pt}[\height][\depth]{\tikz[baseline=-.55ex]{\draw[ExamAccent,line width=.45pt](0,0)circle[radius=1.25mm];}}}
\AtBeginDocument{%
 \ifExamSolutions\else
  \AtBeginEnvironment{ex}{%
   \renewcommand{\writekeyTF}{%
    \ifthenelse{\equal{\cotDS}{2}}%
     {&\centering\HyTFBubble &\centering\HyTFBubble}%
     {\ifthenelse{\equal{\cotDS}{1}}{&\centering\HyTFBubble}{}}}%
  }%
 \fi
}
` },
  { file: "theme-08-navy-atelier.tex", name: "Navy Atelier", tex: String.raw`% NAVY ATELIER — theme độc lập, dùng trong bộ Dethi-HyMath-Themes.
% Lưu trong Themes/; chọn ThemeFile = theme-08-navy-atelier.tex.
% Không cần thêm font: dùng Termes–Heros nếu có, nếu thiếu giữ font core.
% NAVY ATELIER: palette + title + section headings + answer badges + page furniture.
\definecolor{ThemeBase}{HTML}{203047}
\definecolor{ThemeSecondary}{HTML}{947251}
\def\ThemeName{NAVY ATELIER}

% 2. Tiêu đề gọn: giữ tên kỳ thi ở một hàng riêng.
\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{10}{12}\selectfont\SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{13}{16}\selectfont\ExamName\par}}

% 3. Hai hàng điền thông tin; mã đề nằm cùng hàng lớp/SBD.
\newcommand{\StudentInfo}{%
 \par\vspace{1.5mm}\noindent
 {\fontsize{10.5}{13}\selectfont
 \textbf{Họ và tên:}\enspace\dotfill\par\vspace{1mm}
 \noindent\textbf{Lớp:}\enspace\makebox[25mm]{\dotfill}\hfill
 \textbf{SBD:}\enspace\makebox[35mm]{\dotfill}\hfill
 \tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=.8mm,
 left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\small\color{ExamAccent}Mã đề\enspace\textbf{\ExamCode}}\par}
 \vspace{2mm}}

% 4. Bố cục lệch trái; mép cắt xiên bằng TikZ, không tăng số dòng.
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[enhanced,colback=white,colframe=ExamAccent,arc=0mm,boxrule=.45pt,
 colbacktitle=PanelFill,coltitle=PanelInk,title={\TitleSchool},halign title=left,
 left=4mm,right=5mm,top=2.2mm,bottom=2.2mm,toptitle=1.5mm,bottomtitle=1.5mm,
 before skip=2mm,after skip=1mm,titlerule=0pt,
 overlay={
  \draw[ExamSecondary,line width=1.1pt]([xshift=-6mm,yshift=1.2mm]frame.south east)--++(3mm,3mm);
  \draw[ExamSecondary,line width=.55pt]([xshift=-3mm,yshift=1.2mm]frame.south east)--++(1.8mm,1.8mm);
 }]
 \raggedright\color{ExamAccent}\TitleExam\vspace{1.5mm}
 {\sffamily\fontsize{10}{12}\selectfont\textbf{\SubjectName}\quad
 \textcolor{ExamSecondary}{|}\quad\ExamTime\quad
 \textcolor{ExamSecondary}{|}\quad Năm học \SchoolYear\par}
 \end{tcolorbox}}

% 5. Tiêu đề phần; câu hỏi trong data giữ nguyên.
\newcommand{\HyThemePart}[1]{%
 \par{\sffamily\bfseries\fontsize{11.5}{14}\selectfont\color{ExamAccent}#1\par}%
 \vspace{1mm}{\color{ExamSecondary}\hrule height .5pt}\vspace{1mm}}

% 6. Nhãn đáp án nhẹ: dễ nhìn khi có nhiều câu, tiết kiệm mực.
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=ExamAccent,line width=.5pt,fill=ExamLight,text=ExamAccent,
 rounded corners=4pt,inner xsep=3pt,inner ysep=1pt,font=\sffamily\bfseries\small](a){#1};}

% 7. Tự tô màu tiêu đề phần kiểu cũ: \textbf{PHẦN I...}.
% Nhận diện tiền tố PHẦN/Phần + số La Mã; các chữ đậm khác giữ nguyên.
\newcommand{\HyStyledHeading}[1]{%
 \tcbox[on line,enhanced,colback=PanelFill,colframe=ExamAccent,arc=.6mm,boxrule=.4pt,
 borderline south={.8pt}{0pt}{ExamSecondary},left=4pt,right=4pt,top=1.5pt,bottom=1.5pt]
 {\color{PanelInk}\sffamily\HyOriginalTextbf{#1}}}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyStyledHeading{#1}}
   {\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff

% 8. Dấu nhận diện navy và đường kẻ header/footer.
\newcommand{\HyNavyMark}{\tikz[baseline=-.4ex]{%
 \fill[ExamAccent](0,0)--(.16,0)--(.30,.24)--(.14,.24)--cycle;
 \fill[ExamSecondary](.24,0)--(.33,0)--(.47,.24)--(.38,.24)--cycle;}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{30pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.6pt}
 \renewcommand{\footrulewidth}{.6pt}
 \renewcommand{\headrule}{\hbox to\headwidth{\color{ExamSecondary}\rule{14mm}{.7pt}\color{ExamAccent}\leaders\hrule height .35pt\hfill}}
 \renewcommand{\footrule}{\vskip-2pt\hbox to\headwidth{\color{ExamSecondary}\leaders\hrule height .45pt\hfill}\vskip3pt}
 \fancyhead[L]{\HyNavyMark\hspace{5pt}\sffamily\fontsize{9.5}{12}\selectfont\color{ExamAccent}\textbf{\SubjectName}\quad |\quad\SchoolYear}
 \fancyhead[R]{\tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=1pt,left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}MÃ ĐỀ\enspace\textbf{\ExamCode}}}
 \fancyfoot[L]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\TeacherName}
 \fancyfoot[R]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\HyNavyMark\hspace{5pt}Trang \textbf{\thepage}\,/\,\ref{TotPages}}}

\newcommand{\ExamEnd}{%
 \par\addvspace{5mm}\centerline{\color{ExamAccent}\rule{15mm}{.5pt}\quad\sffamily\bfseries HẾT\quad\rule{15mm}{.5pt}}}

% Hoàn thiện bảng và ô kết quả sau khi nạp core.
\AtBeginDocument{%
 \IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyreheros-regular.otf}{%
  \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyretermes-math.otf}{%
  \setmathfont{texgyretermes-math.otf}%
 }{}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%

 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}
` },
  { file: "theme-09-slate-folio.tex", name: "Slate Folio", tex: String.raw`% SLATE FOLIO — theme độc lập, dùng trong bộ Dethi-HyMath-Themes.
% Lưu trong Themes/; chọn ThemeFile = theme-09-slate-folio.tex.
% Không cần thêm font: dùng Termes–Heros nếu có, nếu thiếu giữ font core.
% SLATE FOLIO: palette + title + section headings + answer badges + page furniture.
\definecolor{ThemeBase}{HTML}{2A3C50}
\definecolor{ThemeSecondary}{HTML}{70848D}
\def\ThemeName{SLATE FOLIO}

% 2. Tiêu đề gọn: giữ tên kỳ thi ở một hàng riêng.
\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{10}{12}\selectfont\SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{13}{16}\selectfont\ExamName\par}}

% 3. Hai hàng điền thông tin; mã đề nằm cùng hàng lớp/SBD.
\newcommand{\StudentInfo}{%
 \par\vspace{1.5mm}\noindent
 {\fontsize{10.5}{13}\selectfont
 \textbf{Họ và tên:}\enspace\dotfill\par\vspace{1mm}
 \noindent\textbf{Lớp:}\enspace\makebox[25mm]{\dotfill}\hfill
 \textbf{SBD:}\enspace\makebox[35mm]{\dotfill}\hfill
 \tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=.8mm,
 left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\small\color{ExamAccent}Mã đề\enspace\textbf{\ExamCode}}\par}
 \vspace{2mm}}

% 4. Kiểu sách: không đóng hộp lớn; serif cho tên kỳ thi.
\newcommand{\HyThemeTitle}{%
 \par\vspace{2mm}\noindent{\color{ExamAccent}\TitleSchool}
 \vspace{1.5mm}\noindent
 \tikz{\draw[ExamSecondary,line width=.5pt](0,0)--(\the\dimexpr\linewidth-1pt\relax,0);
 \fill[ExamAccent](0,-.045) rectangle (.60,.045);}\par\vspace{1.5mm}
 {\centering\color{ExamAccent}\rmfamily\bfseries\fontsize{14}{17}\selectfont\ExamName\par}
 \vspace{1.5mm}
 {\centering\sffamily\fontsize{10}{12}\selectfont\color{ExamAccent}
 \textbf{\SubjectName}\quad\textcolor{ExamSecondary}{|}\quad\ExamTime\quad
 \textcolor{ExamSecondary}{|}\quad Năm học \SchoolYear\par}
 \vspace{1.5mm}{\color{ExamSecondary}\hrule height .4pt}\vspace{1mm}}

% 5. Tiêu đề phần; câu hỏi trong data giữ nguyên.
\newcommand{\HyThemePart}[1]{%
 \par{\sffamily\bfseries\fontsize{11.5}{14}\selectfont\color{ExamAccent}#1\par}%
 \vspace{1mm}{\color{ExamSecondary}\hrule height .5pt}\vspace{1mm}}

% 6. Nhãn đáp án nhẹ: dễ nhìn khi có nhiều câu, tiết kiệm mực.
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=none,fill=white,text=ExamAccent,
 rounded corners=1pt,inner xsep=3pt,inner ysep=1pt,font=\sffamily\bfseries\small](a){#1};}

% 7. Tự tô màu tiêu đề phần kiểu cũ: \textbf{PHẦN I...}.
% Nhận diện tiền tố PHẦN/Phần + số La Mã; các chữ đậm khác giữ nguyên.
\newcommand{\HyStyledHeading}[1]{%
 \tcbox[on line,enhanced,colback=white,colframe=white,arc=0mm,boxrule=0pt,
 borderline south={.5pt}{0pt}{ExamSecondary},left=0pt,right=3pt,top=1pt,bottom=1pt]
 {\color{ExamAccent}\sffamily\HyOriginalTextbf{#1}}}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyStyledHeading{#1}}
   {\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff

% 8. Dấu nhận diện navy và đường kẻ header/footer.
\newcommand{\HyNavyMark}{\tikz[baseline=-.4ex]{%
 \draw[ExamAccent,line width=.6pt](0,0)rectangle(.23,.23);
 \draw[ExamSecondary,line width=.6pt](.30,.115)--(.55,.115);}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{30pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.6pt}
 \renewcommand{\footrulewidth}{.6pt}
 \renewcommand{\headrule}{\hbox to\headwidth{\color{ExamSecondary}\rule{8mm}{.6pt}\color{ExamAccent}\leaders\hrule height .3pt\hfill}}
 \renewcommand{\footrule}{\vskip-2pt\hbox to\headwidth{\color{ExamSecondary}\leaders\hrule height .45pt\hfill}\vskip3pt}
 \fancyhead[L]{\HyNavyMark\hspace{5pt}\sffamily\fontsize{9.5}{12}\selectfont\color{ExamAccent}\textbf{\SubjectName}\quad |\quad\SchoolYear}
 \fancyhead[R]{\tcbox[on line,colback=ExamLight,colframe=ExamAccent,boxrule=.5pt,arc=1pt,left=3pt,right=3pt,top=1pt,bottom=1pt]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}MÃ ĐỀ\enspace\textbf{\ExamCode}}}
 \fancyfoot[L]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\TeacherName}
 \fancyfoot[R]{\sffamily\fontsize{9}{11}\selectfont\color{ExamAccent}\HyNavyMark\hspace{5pt}Trang \textbf{\thepage}\,/\,\ref{TotPages}}}

\newcommand{\ExamEnd}{%
 \par\addvspace{5mm}\centerline{\color{ExamAccent}\rule{15mm}{.5pt}\quad\sffamily\bfseries HẾT\quad\rule{15mm}{.5pt}}}

% Hoàn thiện bảng và ô kết quả sau khi nạp core.
\AtBeginDocument{%
 \IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyreheros-regular.otf}{%
  \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 }{}%
 \IfFontExistsTF{texgyretermes-math.otf}{%
  \setmathfont{texgyretermes-math.otf}%
 }{}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%

 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\cellcolor{ExamLight}\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}
` },
  { file: "theme-10-burgundy-pearl.tex", name: "Burgundy Modern", tex: String.raw`% BURGUNDY MODERN - bản nâng cấp của Burgundy Pearl, giữ tên file để đổi nhanh.
% 1. Chép file vào Themes/.
% 2. Trong main.tex: \providecommand{\ThemeFile}{theme-10-burgundy-pearl.tex}
% 3. Biên dịch bằng XeLaTeX. Không sửa Caidat/caidat.tex.
% Palette: burgundy sáng / burgundy đậm / champagne / ivory.
% Header/footer ít chữ; không hiển thị tên giáo viên.
% Đổi màu chính ở ThemeBase; màu trang trí ở ThemeSecondary.
\definecolor{ThemeBase}{HTML}{9E304C}
\definecolor{ThemeSecondary}{HTML}{AD8751}
\def\ThemeName{BURGUNDY MODERN}
\ifExamColor
 \definecolor{HyBurgundyDeep}{HTML}{772039}
 \definecolor{HyPearl}{HTML}{FCFBF9}
 \definecolor{HyRose}{HTML}{FBF5F6}
 \definecolor{HyRoseRule}{HTML}{CFA4AF}
\else
 \colorlet{HyBurgundyDeep}{black}
 \colorlet{HyPearl}{white}
 \colorlet{HyRose}{white}
 \definecolor{HyRoseRule}{gray}{.65}
\fi

\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{9.5}{11.5}\selectfont\SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{14}{18}\selectfont\color{HyBurgundyDeep}\ExamName\par}}

% Tiêu đề thoáng, không dùng dải màu đậm chiếm nhiều diện tích.
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[enhanced,colback=HyPearl,colframe=HyRoseRule,
 boxrule=.4pt,arc=0mm,left=4mm,right=4mm,top=2.4mm,bottom=2.4mm,
 before skip=1mm,after skip=1mm,
 overlay={%
  \draw[HyBurgundyDeep,line width=1.4pt,line cap=rect]
   ([xshift=.2mm,yshift=-6mm]frame.north west)--
   ([xshift=.2mm,yshift=-.2mm]frame.north west)--
   ([xshift=13mm,yshift=-.2mm]frame.north west);
  \draw[HyBurgundyDeep,line width=1.4pt,line cap=rect]
   ([xshift=-13mm,yshift=.2mm]frame.south east)--
   ([xshift=-.2mm,yshift=.2mm]frame.south east)--
   ([xshift=-.2mm,yshift=6mm]frame.south east);
  \draw[ExamSecondary,line width=.7pt]
   ([xshift=-7mm,yshift=2mm]frame.south east)--++(3mm,3mm);
 }]
 \centering\color{ExamAccent}\TitleSchool\vspace{1.4mm}
 \TitleExam\vspace{1.5mm}
 {\sffamily\fontsize{10}{12}\selectfont\bfseries\SubjectName\enspace
  \textcolor{ExamSecondary}{\textbullet}\enspace\mdseries\ExamTime\enspace
  \textcolor{ExamSecondary}{\textbullet}\enspace Năm học \SchoolYear\par}
 \end{tcolorbox}}

% Hai dòng thông tin, đường chấm trung tính để viết tay rõ.
\newcommand{\StudentInfo}{%
 \par\vspace{1mm}\noindent
 {\fontsize{10.5}{13}\selectfont
 \textcolor{ExamAccent}{\sffamily\bfseries Họ và tên:}\enspace\dotfill\par\vspace{1mm}
 \noindent\textcolor{ExamAccent}{\sffamily\bfseries Lớp:}\enspace\makebox[25mm]{\dotfill}\hfill
 \textcolor{ExamAccent}{\sffamily\bfseries SBD:}\enspace\makebox[35mm]{\dotfill}\hfill
 \tcbox[on line,colback=HyRose,colframe=HyBurgundyDeep,boxrule=.4pt,arc=0mm,
 left=4pt,right=4pt,top=1pt,bottom=1pt]
 {\sffamily\small\color{ExamAccent}Mã đề\enspace\textbf{\ExamCode}}\par}
 \vspace{2mm}}

\newcommand{\HyThemePart}[1]{%
 \par{\sffamily\bfseries\fontsize{11.5}{14}\selectfont\color{HyBurgundyDeep}#1\par}%
 \vspace{1mm}{\color{ExamSecondary}\hrule height .45pt}\vspace{1mm}}
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=HyBurgundyDeep,line width=.4pt,fill=HyRose,
 text=HyBurgundyDeep,rounded corners=.3pt,inner xsep=3pt,inner ysep=1pt,
 font=\sffamily\bfseries\small](a){#1};}

% Tô đồng bộ tiêu đề PHẦN I, II, III, IV trong các file đề cũ.
\newcommand{\HyStyledHeading}[1]{%
 \par\noindent
 \tcbox[on line,enhanced,colback=HyRose,colframe=HyRose,arc=0mm,boxrule=0pt,
 borderline west={2.2pt}{0pt}{HyBurgundyDeep},
 left=5pt,right=5pt,top=1.8pt,bottom=1.8pt]
 {\color{HyBurgundyDeep}\sffamily\HyOriginalTextbf{#1}}\par\nobreak}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyStyledHeading{#1}}{\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff

% Dấu nhận diện hai nét xiên; tất cả đường nét là vector TikZ.
\newcommand{\HyPearlMark}{\tikz[baseline=-.35ex]{%
 \fill[HyBurgundyDeep](0,0)--(.11,0)--(.25,.22)--(.14,.22)--cycle;
 \fill[ExamSecondary](.22,0)--(.28,0)--(.42,.22)--(.36,.22)--cycle;}}
% Hai nét xiên ở giữa đường kẻ; giữ header/footer một dòng như bản đầu.
% Bounding box thấp giúp họa tiết không làm tăng chiều cao hoặc đổi ngắt trang.
\newcommand{\HyPearlOrnament}{%
 \tikz[x=1mm,y=1mm,baseline=0pt]{%
  \useasboundingbox (-9,-.15)rectangle(9,.15);
  \fill[HyBurgundyDeep](-4,-.8)--(-1.8,-.8)--(-.4,.8)--(-2.6,.8)--cycle;
  \fill[ExamSecondary](.5,-.8)--(2.7,-.8)--(4.1,.8)--(1.9,.8)--cycle;
  \draw[HyBurgundyDeep,line width=.5pt](-9,0)--(-5.5,0) (5.5,0)--(9,0);
 }}
\newcommand{\HyPearlOrnamentRule}{%
 \hbox to\headwidth{%
  \color{HyBurgundyDeep}\rule{12mm}{1.15pt}%
  \color{HyBurgundyDeep}\leaders\hrule height .45pt\hfill
  \kern2pt\HyPearlOrnament\kern2pt
  \color{HyBurgundyDeep}\leaders\hrule height .45pt\hfill
  \color{HyBurgundyDeep}\rule{12mm}{1.15pt}}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{30pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.5pt}\renewcommand{\footrulewidth}{.5pt}
 \renewcommand{\headrule}{\HyPearlOrnamentRule}
 \renewcommand{\footrule}{\vskip-2pt\HyPearlOrnamentRule\vskip3pt}
 \fancyhead[L]{\HyPearlMark\hspace{5pt}\sffamily\fontsize{9.5}{12}\selectfont\color{HyBurgundyDeep}\textbf{\SubjectName}\quad |\quad\SchoolYear}
 \fancyhead[R]{\sffamily\fontsize{9}{11}\selectfont\color{HyBurgundyDeep}MÃ ĐỀ\enspace\textbf{\ExamCode}}
 \fancyfoot[L]{\HyPearlMark}%
 \fancyfoot[C]{\sffamily\fontsize{9}{11}\selectfont\color{HyBurgundyDeep}Trang\enspace\textbf{\thepage}\,/\,\ref{TotPages}}%
 \fancyfoot[R]{\reflectbox{\HyPearlMark}}}
\newcommand{\ExamEnd}{%
 \par\addvspace{5mm}\centerline{\color{ExamSecondary}\rule{12mm}{.4pt}\quad
 \textcolor{ExamAccent}{\sffamily\bfseries HẾT}\quad\rule{12mm}{.4pt}}}

\AtBeginDocument{%
 \IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]}{}%
 \IfFontExistsTF{texgyreheros-regular.otf}{%
  \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]}{}%
 \IfFontExistsTF{texgyretermes-math.otf}{\setmathfont{texgyretermes-math.otf}}{}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%
 \renewcommand{\loigiaiEX}{\noindent\parbox[c]{\dimexpr\linewidth-1mm\relax}{\centering\sffamily\color{ExamAccent}Lời giải.}}%
 \renewcommand{\keyCh}{\circEX[fill=HyRose,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 \renewcommand{\keyTF}{\squareTF[fill=HyRose,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 \renewcommand{\keySA}{\squareEX[fill=HyRose,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 % Không tô nền ô tiêu đề: tránh nền che viền bảng của ex_test.
 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}
% Vòng đúng/sai không phụ thuộc ký tự của font toán.
\newcommand{\HyTFBubble}{%
 \raisebox{4.4pt}[\height][\depth]{\tikz[baseline=-.55ex]{\draw[ExamAccent,line width=.45pt](0,0)circle[radius=1.25mm];}}}
\AtBeginDocument{%
 \ifExamSolutions\else
  \AtBeginEnvironment{ex}{%
   \renewcommand{\writekeyTF}{%
    \ifthenelse{\equal{\cotDS}{2}}%
     {&\centering\HyTFBubble &\centering\HyTFBubble}%
     {\ifthenelse{\equal{\cotDS}{1}}{&\centering\HyTFBubble}{}}}%
  }%
 \fi
}
` },
  { file: "theme-11-burgundy-axis.tex", name: "Burgundy Axis", tex: String.raw`% BURGUNDY AXIS - diện mạo riêng cho trung tâm thứ hai.
% Chép duy nhất file này vào Themes/; không sửa Caidat/caidat.tex.
% main.tex: \providecommand{\ThemeFile}{theme-11-burgundy-axis.tex}
% XeLaTeX. CheDo: mau / in / loigiai như bộ đề hiện có.
% Tên trung tâm lấy từ tham số đầu của \TieuDeDeSo trong file đề.
% Không hiển thị tên giáo viên. Họa tiết và khung đều là vector TikZ.
\definecolor{ThemeBase}{HTML}{9C304B}
\definecolor{ThemeSecondary}{HTML}{B38E57}
\def\ThemeName{BURGUNDY AXIS}
\ifExamColor
 \definecolor{HyBurgundyDeep}{HTML}{732239}
 \definecolor{HyAxisSage}{HTML}{637B73}
 \definecolor{HyPearl}{HTML}{FCFBF9}
 \definecolor{HyRose}{HTML}{FAF4F5}
 \definecolor{HyRoseRule}{HTML}{D9C6CA}
\else
 \colorlet{HyBurgundyDeep}{black}
 \definecolor{HyAxisSage}{gray}{.35}
 \colorlet{HyPearl}{white}
 \colorlet{HyRose}{white}
 \definecolor{HyRoseRule}{gray}{.65}
\fi

% Nhận diện hình thoi lồng, thay các nét xiên của Burgundy Modern.
\newcommand{\HyAxisMark}{%
 \tikz[x=1mm,y=1mm,baseline=-.6mm]{%
  \draw[HyBurgundyDeep,line width=.8pt] (0,0)--(2.1,2.1)--(4.2,0)--(2.1,-2.1)--cycle;
  \fill[ExamSecondary] (1.25,0)--(2.1,.85)--(2.95,0)--(2.1,-.85)--cycle;
  \draw[HyAxisSage,line width=.65pt] (5,0)--(8,0);
 }}
\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{9}{11.5}\selectfont\color{HyAxisSage}\SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{14}{17}\selectfont\color{HyBurgundyDeep}\ExamName\par}}
\newcommand{\HyAxisCode}{%
 \begin{tikzpicture}[x=1mm,y=1mm]
  \useasboundingbox (-10,-10) rectangle (10,10);
  \draw[HyRoseRule,line width=.45pt] (-9,-9) rectangle (9,9);
  \draw[HyBurgundyDeep,line width=1pt]
   (-7,2)--(-7,7)--(-2,7) (2,-7)--(7,-7)--(7,-2);
  \draw[ExamSecondary,line width=.65pt] (-9,0)--(-6,0) (6,0)--(9,0);
  \node[text=HyBurgundyDeep,font=\sffamily\fontsize{7.5}{9}\selectfont] at (0,3.3) {MÃ ĐỀ};
  \node[text=HyBurgundyDeep,font=\sffamily\bfseries\fontsize{19}{21}\selectfont] at (0,-2) {\ExamCode};
 \end{tikzpicture}}

% Bố cục bất đối xứng: chữ trái, dấu mã đề bên phải; cạnh dưới hai màu.
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[enhanced,colback=HyPearl,colframe=HyRoseRule,
 boxrule=.35pt,arc=0mm,left=4mm,right=3mm,top=2.4mm,bottom=2.8mm,
 before skip=1mm,after skip=1mm,
 overlay={%
  \draw[HyBurgundyDeep,line width=1.3pt]
   (frame.south west)--([xshift=-25mm]frame.south east);
  \draw[ExamSecondary,line width=1.3pt]
   ([xshift=-25mm]frame.south east)--(frame.south east);
  \draw[HyAxisSage,line width=.7pt]
   ([xshift=4mm,yshift=-.1mm]frame.north west)--++(13mm,0);
 }]
 \noindent\begin{minipage}[c]{\dimexpr\linewidth-28mm\relax}
  \raggedright\TitleSchool\vspace{1.5mm}
  \TitleExam\vspace{1.5mm}
  {\sffamily\fontsize{9.5}{12}\selectfont\color{HyBurgundyDeep}%
   \bfseries\SubjectName\enspace
   \textcolor{ExamSecondary}{\textbullet}\enspace\mdseries\ExamTime\enspace
   \textcolor{ExamSecondary}{\textbullet}\enspace\SchoolYear\par}
 \end{minipage}\hfill
 \begin{minipage}[c]{23mm}\centering\HyAxisCode\end{minipage}
 \end{tcolorbox}}

\newcommand{\StudentInfo}{%
 \par\vspace{1mm}\noindent
 {\fontsize{10.5}{13}\selectfont
  \textcolor{HyBurgundyDeep}{\sffamily\bfseries Họ và tên:}\enspace\dotfill\par\vspace{1mm}
  \noindent\textcolor{HyBurgundyDeep}{\sffamily\bfseries Lớp:}\enspace
  \makebox[36mm]{\dotfill}\hfill
  \textcolor{HyBurgundyDeep}{\sffamily\bfseries SBD:}\enspace
  \makebox[47mm]{\dotfill}\par}
 \vspace{2mm}}

% Phần I-IV: chữ trên nền trắng, một dấu hình thoi và đường chân mở.
\newcommand{\HyStyledHeading}[1]{%
 \par\noindent
 \begin{tcolorbox}[enhanced,colback=white,colframe=white,boxrule=0pt,
 arc=0mm,left=7mm,right=1mm,top=.8mm,bottom=1.3mm,
 before skip=.8mm,after skip=1mm,
 overlay={%
  \draw[HyRoseRule,line width=.4pt]
   ([xshift=7mm]frame.south west)--(frame.south east);
  \draw[ExamSecondary,line width=1pt]
   ([xshift=7mm]frame.south west)--++(18mm,0);
  \draw[HyBurgundyDeep,line width=.8pt]
   ([xshift=2.6mm,yshift=1mm]frame.west)--++(1.8mm,-1.8mm)--++(-1.8mm,-1.8mm)--++(-1.8mm,1.8mm)--cycle;
 }]
 {\color{HyBurgundyDeep}\sffamily\HyOriginalTextbf{#1}}%
 \end{tcolorbox}\nobreak}
\newcommand{\HyThemePart}[1]{\HyStyledHeading{#1}}
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=HyBurgundyDeep,line width=.5pt,fill=white,
 text=HyBurgundyDeep,rounded corners=2pt,inner xsep=3pt,inner ysep=1pt,
 font=\sffamily\bfseries\small](a){#1};}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyStyledHeading{#1}}{\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff


% Đường header: nhịp bất đối xứng, nhấn bằng hình thoi nhỏ.
\newcommand{\HyAxisHeadRule}{%
 \hbox to\headwidth{%
  {\color{HyBurgundyDeep}\rule{19mm}{1.15pt}}\kern3pt
  \tikz[x=1mm,y=1mm,baseline=0pt]{%
   \useasboundingbox(0,-.1)rectangle(4,.1);
   \fill[ExamSecondary](0,0)--(2,1.2)--(4,0)--(2,-1.2)--cycle;}
  \kern3pt{\color{HyRoseRule}\leaders\hrule height .4pt\hfill}%
  {\color{HyAxisSage}\rule{8mm}{.8pt}}}}
% Footer dạng trục: số trang trong capsule, hai cánh hình học cân đối.
\newcommand{\HyAxisFootWing}{%
 \tikz[x=1mm,y=1mm,baseline=0pt]{%
  \useasboundingbox(0,-.2)rectangle(24,.2);
  \draw[HyRoseRule,line width=.4pt](0,0)--(17,0);
  \draw[HyBurgundyDeep,line width=.75pt](0,-1)--(6,-1);
  \draw[HyBurgundyDeep,line width=.65pt](18,0)--(20,1.8)--(22,0)--(20,-1.8)--cycle;
  \fill[ExamSecondary](19.3,0)--(20,.7)--(20.7,0)--(20,-.7)--cycle;
 }}
\newcommand{\HyAxisPageBadge}{%
 \tcbox[on line,colback=white,colframe=HyRoseRule,boxrule=.4pt,arc=2mm,
 left=8pt,right=8pt,top=2pt,bottom=2pt]{%
  \sffamily\fontsize{9}{11}\selectfont\color{HyBurgundyDeep}%
  Trang\enspace\textbf{\thepage}\,/\,\ref{TotPages}}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{30pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.4pt}\renewcommand{\footrulewidth}{0pt}
 \renewcommand{\headrule}{\HyAxisHeadRule}
 \renewcommand{\footrule}{}%
 \fancyhead[L]{\HyAxisMark\hspace{5pt}\sffamily\fontsize{9.5}{12}\selectfont\color{HyBurgundyDeep}\textbf{\SubjectName}\quad |\quad\SchoolYear}
 \fancyhead[R]{\sffamily\fontsize{9}{11}\selectfont\color{HyBurgundyDeep}MÃ ĐỀ\enspace\textbf{\ExamCode}}
 \fancyfoot[C]{\HyAxisFootWing\hspace{4mm}\HyAxisPageBadge\hspace{4mm}\reflectbox{\HyAxisFootWing}}}
\newcommand{\ExamEnd}{%
 \par\addvspace{5mm}\centerline{\HyAxisFootWing\quad
 \textcolor{HyBurgundyDeep}{\sffamily\bfseries HẾT}\quad\reflectbox{\HyAxisFootWing}}}

\AtBeginDocument{%
 \IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]}{}%
 \IfFontExistsTF{texgyreheros-regular.otf}{%
  \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]}{}%
 \IfFontExistsTF{texgyretermes-math.otf}{\setmathfont{texgyretermes-math.otf}}{}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%
 \renewcommand{\loigiaiEX}{\noindent\parbox[c]{\dimexpr\linewidth-1mm\relax}{\centering\sffamily\color{ExamAccent}Lời giải.}}%
 \renewcommand{\keyCh}{\circEX[fill=HyRose,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 \renewcommand{\keyTF}{\squareTF[fill=HyRose,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 \renewcommand{\keySA}{\squareEX[fill=HyRose,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 % Không tô nền ô tiêu đề: tránh nền che viền bảng của ex_test.
 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}
% Vòng đúng/sai không phụ thuộc ký tự của font toán.
\newcommand{\HyTFBubble}{%
 \raisebox{4.4pt}[\height][\depth]{\tikz[baseline=-.55ex]{\draw[ExamAccent,line width=.45pt](0,0)circle[radius=1.25mm];}}}
\AtBeginDocument{%
 \ifExamSolutions\else
  \AtBeginEnvironment{ex}{%
   \renewcommand{\writekeyTF}{%
    \ifthenelse{\equal{\cotDS}{2}}%
     {&\centering\HyTFBubble &\centering\HyTFBubble}%
     {\ifthenelse{\equal{\cotDS}{1}}{&\centering\HyTFBubble}{}}}%
  }%
 \fi
}
` },
  { file: "theme-12-hy-luxe-grade.tex", name: "Hy Luxe Grade", tex: String.raw`% HY LUXE GRADE — một theme, ba bảng màu tự nhận diện lớp 10 / 11 / 12.
% Chỉ cần chọn file trong main.tex:
% \providecommand{\ThemeFile}{theme-12-hy-luxe-grade.tex}
% Theme đọc số lớp từ \SubjectName (ví dụ: Toán - Lớp 11).
% Nếu tiêu đề môn không ghi lớp, có thể đặt \def\ExamGrade{10}
% trong main.tex, trước \input{Caidat/caidat.tex}.
% Tương thích bộ HyMath-Gon, XeLaTeX; không cần gói ngoài theme-core.

\definecolor{HyLux10}{HTML}{174B43}       % Emerald / lớp 10
\definecolor{HyLux10Mid}{HTML}{4D8979}
\definecolor{HyLux10Metal}{HTML}{B5965A}
\definecolor{HyLux10Wash}{HTML}{F0F6F3}
\definecolor{HyLux10Rule}{HTML}{C9D9D2}

\definecolor{HyLux11}{HTML}{203F69}       % Sapphire / lớp 11
\definecolor{HyLux11Mid}{HTML}{5D7FA8}
\definecolor{HyLux11Metal}{HTML}{B5965A}
\definecolor{HyLux11Wash}{HTML}{F1F4F8}
\definecolor{HyLux11Rule}{HTML}{CBD5E1}

\definecolor{HyLux12}{HTML}{593348}       % Plum / lớp 12
\definecolor{HyLux12Mid}{HTML}{93677D}
\definecolor{HyLux12Metal}{HTML}{B98F68}
\definecolor{HyLux12Wash}{HTML}{F7F2F4}
\definecolor{HyLux12Rule}{HTML}{DDCDD4}

\colorlet{HyLuxPrimary}{HyLux11}
\colorlet{HyLuxMid}{HyLux11Mid}
\colorlet{HyLuxMetal}{HyLux11Metal}
\colorlet{HyLuxWash}{HyLux11Wash}
\colorlet{HyLuxRule}{HyLux11Rule}
\colorlet{ThemeBase}{HyLuxPrimary}
\colorlet{ThemeSecondary}{HyLuxMetal}
\def\ThemeName{HY LUXE GRADE}
\providecommand{\ExamGrade}{}

\newcommand{\HyLuxPaletteTen}{%
 \colorlet{HyLuxPrimary}{HyLux10}\colorlet{HyLuxMid}{HyLux10Mid}%
 \colorlet{HyLuxMetal}{HyLux10Metal}\colorlet{HyLuxWash}{HyLux10Wash}%
 \colorlet{HyLuxRule}{HyLux10Rule}\gdef\HyLuxGradeLabel{10}}
\newcommand{\HyLuxPaletteEleven}{%
 \colorlet{HyLuxPrimary}{HyLux11}\colorlet{HyLuxMid}{HyLux11Mid}%
 \colorlet{HyLuxMetal}{HyLux11Metal}\colorlet{HyLuxWash}{HyLux11Wash}%
 \colorlet{HyLuxRule}{HyLux11Rule}\gdef\HyLuxGradeLabel{11}}
\newcommand{\HyLuxPaletteTwelve}{%
 \colorlet{HyLuxPrimary}{HyLux12}\colorlet{HyLuxMid}{HyLux12Mid}%
 \colorlet{HyLuxMetal}{HyLux12Metal}\colorlet{HyLuxWash}{HyLux12Wash}%
 \colorlet{HyLuxRule}{HyLux12Rule}\gdef\HyLuxGradeLabel{12}}

\ExplSyntaxOn
\cs_new_protected:Npn \HyLuxSelectPalette
 {
  \tl_set:Nx \l_tmpa_tl {\ExamGrade}
  \tl_if_blank:VT \l_tmpa_tl {\tl_set:Nx \l_tmpa_tl {\SubjectName}}
  \tl_if_in:VnTF \l_tmpa_tl {10}
   {\HyLuxPaletteTen}
   {\tl_if_in:VnTF \l_tmpa_tl {12}{\HyLuxPaletteTwelve}{\HyLuxPaletteEleven}}
  \colorlet{ThemeBase}{HyLuxPrimary}
  \colorlet{ThemeSecondary}{HyLuxMetal}
  \ifExamColor
   \colorlet{ExamAccent}{HyLuxPrimary}
   \colorlet{ExamSecondary}{HyLuxMetal}
   \colorlet{ExamLight}{HyLuxWash}
   \colorlet{PanelFill}{HyLuxPrimary}
   \colorlet{PanelInk}{white}
   \colorlet{HyLuxBadgeFill}{HyLuxPrimary}
   \colorlet{HyLuxBadgeInk}{white}
  \else
   \colorlet{ExamAccent}{black}
   \definecolor{ExamSecondary}{gray}{.42}
   \colorlet{ExamLight}{white}
   \colorlet{PanelFill}{white}
   \colorlet{PanelInk}{black}
   \colorlet{HyLuxBadgeFill}{white}
   \colorlet{HyLuxBadgeInk}{black}
   \colorlet{HyLuxWash}{white}
   \colorlet{HyLuxPrimary}{black}
   \definecolor{HyLuxMid}{gray}{.35}
   \definecolor{HyLuxMetal}{gray}{.45}
   \definecolor{HyLuxRule}{gray}{.68}
   \colorlet{ThemeBase}{black}
   \definecolor{ThemeSecondary}{gray}{.45}
  \fi
 }
\AtBeginDocument{\pretocmd{\ExamTitle}{\HyLuxSelectPalette}{}{%
  \PackageWarning{HyMath}{Could not attach grade palette to ExamTitle}}}
\ExplSyntaxOff

% Dấu nhận diện: hai quỹ đạo mảnh và viên đá màu champagne, vẽ vector.
\newcommand{\HyLuxSeal}{%
 \tikz[x=1mm,y=1mm,baseline=-.5mm]{%
  \useasboundingbox (-4.5,-4.5) rectangle (4.5,4.5);
  \fill[HyLuxPrimary] (0,0) circle[radius=3.7mm];
  \draw[HyLuxMetal,line width=.55pt] (0,0) circle[radius=3.1mm];
  \draw[white,opacity=.55,line width=.35pt] (0,0) circle[radius=2.55mm];
  \node[text=white,font=\sffamily\bfseries\fontsize{7.5}{8}\selectfont] at (0,0) {\HyLuxGradeLabel};}}
\newcommand{\TitleSchool}{%
 {\sffamily\bfseries\fontsize{8.5}{10.5}\selectfont\color{HyLuxMid}%
  \SchoolName\par}}
\newcommand{\TitleExam}{%
 {\sffamily\bfseries\fontsize{14}{17}\selectfont\color{HyLuxPrimary}%
  \ExamName\par}}
\newcommand{\HyLuxCode}{%
 \begin{tikzpicture}[x=1mm,y=1mm]
  \useasboundingbox (-11,-10) rectangle (11,10);
  \draw[HyLuxRule,line width=.45pt] (-9,-8) rectangle (9,8);
  \draw[HyLuxPrimary,line width=1pt] (-9,5)--(-6,5)--(-6,8) (6,-8)--(6,-5)--(9,-5);
  \fill[HyLuxMetal] (0,4.6) circle[radius=.65mm];
  \node[text=HyLuxMid,font=\sffamily\fontsize{7}{8}\selectfont] at (0,1.8) {MÃ ĐỀ};
  \node[text=HyLuxPrimary,font=\sffamily\bfseries\fontsize{18}{20}\selectfont] at (0,-3) {\ExamCode};
 \end{tikzpicture}}

% Bảng tên đề nhỏ gọn, phối giấy sáng, viền đôi mảnh và điểm nhấn kim loại.
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[enhanced,colback=white,colframe=HyLuxRule,
  boxrule=.4pt,arc=0mm,left=4mm,right=3mm,top=2.5mm,bottom=2.5mm,
  before skip=1mm,after skip=1mm,
  overlay={%
   \draw[HyLuxPrimary,line width=1.35pt]
    (frame.south west)--([xshift=-26mm]frame.south east);
   \draw[HyLuxMetal,line width=1.35pt]
    ([xshift=-26mm]frame.south east)--(frame.south east);
   \draw[HyLuxPrimary,line width=.7pt]
    ([xshift=4mm,yshift=-.1mm]frame.north west)--++(17mm,0);
   \fill[HyLuxMetal] ([xshift=22mm,yshift=-.1mm]frame.north west) circle[radius=.55mm];
  }]
  \noindent\begin{minipage}[c]{\dimexpr\linewidth-30mm\relax}
   \raggedright\TitleSchool\vspace{1.4mm}
   \TitleExam\vspace{1.4mm}
   {\sffamily\fontsize{9.2}{11.5}\selectfont\color{HyLuxPrimary}%
    \bfseries\SubjectName\enspace
    \textcolor{HyLuxMetal}{\textbullet}\enspace\mdseries\ExamTime\enspace
    \textcolor{HyLuxMetal}{\textbullet}\enspace\SchoolYear\par}
  \end{minipage}\hfill
  \begin{minipage}[c]{24mm}\centering\HyLuxCode\end{minipage}
 \end{tcolorbox}}

\newcommand{\StudentInfo}{%
 \par\vspace{.8mm}\noindent
 {\fontsize{10}{12.5}\selectfont\color{black!88}%
  \textcolor{HyLuxPrimary}{\sffamily\bfseries Họ và tên:}\enspace\dotfill\par\vspace{.8mm}
  \noindent\textcolor{HyLuxPrimary}{\sffamily\bfseries Lớp:}\enspace
  \makebox[36mm]{\dotfill}\hfill
  \textcolor{HyLuxPrimary}{\sffamily\bfseries SBD:}\enspace
  \makebox[47mm]{\dotfill\par}}
 \vspace{1.6mm}}

% Dải tiêu đề phần lấy cảm hứng từ thẻ cắt góc trong ảnh tham khảo.
\newcommand{\HyLuxPartTag}[1]{%
 \tikz[baseline=(tag.base),x=1mm,y=1mm]{%
  \path[fill=HyLuxPrimary] (0,0)--(20,0)--(23,3.7)--(20,7.4)--(0,7.4)--cycle;
  \draw[HyLuxMetal,line width=.55pt] (1,.65)--(19.6,.65)--(22,3.7)--(19.6,6.75)--(1,6.75)--cycle;
  \node[inner sep=0pt,text=white,font=\sffamily\bfseries\fontsize{8.5}{9.5}\selectfont]
   (tag) at (10.1,3.7) {PHẦN~#1};}}
\ExplSyntaxOn
\cs_new_protected:Npn \HyLuxHeading #1
 {
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_extract_once:nVNTF
   {\A\s*(?:PHẦN|Phần|phần)\s+([IVX]+)\s*\.?\s*(.*)\Z}
   \l_tmpa_tl \l_tmpa_seq
   {\exp_args:Nee \HyLuxHeadingParts
     {\seq_item:Nn \l_tmpa_seq {2}}{\seq_item:Nn \l_tmpa_seq {3}}}
   {\HyLuxHeadingFallback{#1}}
 }
\ExplSyntaxOff
\newcommand{\HyLuxHeadingParts}[2]{%
 \par\addvspace{1.5mm}\noindent
 \begin{minipage}[c]{24mm}\HyLuxPartTag{#1}\end{minipage}%
 \hspace{1.5mm}%
 \begin{minipage}[c]{\dimexpr\linewidth-26mm\relax}
  {\sffamily\bfseries\fontsize{10.3}{12}\selectfont\color{HyLuxPrimary}#2\par}
 \end{minipage}\par\vspace{1mm}
 \noindent{\color{HyLuxMetal}\rule{17mm}{1.05pt}}%
 {\color{HyLuxRule}\rule{\dimexpr\linewidth-17mm\relax}{.45pt}}%
 \par\nobreak\addvspace{.8mm}}
\newcommand{\HyLuxHeadingFallback}[1]{%
 \par\addvspace{1.5mm}\noindent
 {\sffamily\bfseries\color{HyLuxPrimary}\HyLuxOriginalTextbf{#1}}\par
 \vspace{1mm}{\color{HyLuxRule}\hrule}\nobreak\addvspace{1mm}}
\newcommand{\HyThemePart}[1]{\HyLuxHeading{#1}}
\newcommand{\AnswerBadge}[1]{%
 \tikz[baseline=(a.base)]\node[draw=HyLuxPrimary,line width=.5pt,fill=white,
  text=HyLuxPrimary,rounded corners=1.2pt,inner xsep=3.2pt,inner ysep=1.1pt,
  font=\sffamily\bfseries\small](a){#1};}

% Tự áp cùng thiết kế tiêu đề phần cho các dòng \textbf{PHẦN I...}.
\ExplSyntaxOn
\NewCommandCopy{\HyLuxOriginalTextbf}{\textbf}
\cs_generate_variant:Nn \regex_extract_once:nnNTF { nV }
\cs_new_protected:Npn \HyLuxPartAwareBold #1
 {
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\HyLuxHeading{#1}}{\HyLuxOriginalTextbf{#1}}
 }
\RenewDocumentCommand{\textbf}{m}{\HyLuxPartAwareBold{#1}}
\ExplSyntaxOff

\newcommand{\HyLuxHeaderRule}{%
 \hbox to\headwidth{%
  {\color{HyLuxPrimary}\rule{22mm}{1.25pt}}\kern2.5pt
  \tikz[x=1mm,y=1mm,baseline=0pt]{%
   \useasboundingbox(0,-.1)rectangle(3,.1);
   \fill[HyLuxMetal](0,0)--(1.5,1.15)--(3,0)--(1.5,-1.15)--cycle;}
  \kern2.5pt{\color{HyLuxRule}\leaders\hrule height .42pt\hfill}%
  {\color{HyLuxMid}\rule{13mm}{.75pt}}}}
\newcommand{\HyLuxPageBadge}{%
 \tikz[baseline=(page.base),x=1mm,y=1mm]{%
  \path[fill=HyLuxPrimary] (0,0)--(22,0)--(22,6.2)--(2.2,6.2)--(0,4)--cycle;
  \draw[HyLuxMetal,line width=.45pt] (.6,.6)--(21.4,.6)--(21.4,5.6)--(2.4,5.6)--(.6,3.8)--cycle;
  \node[inner sep=0pt,text=white,font=\sffamily\bfseries\fontsize{8}{9}\selectfont]
   (page) at (11.3,3.1) {\thepage\,/\,\ref{TotPages}};}}
\newcommand{\HyLuxHeaderCode}{%
 \tikz[baseline=(code.base),x=1mm,y=1mm]{%
  \path[fill=HyLuxPrimary] (0,0)--(22,0)--(22,6.2)--(2.2,6.2)--(0,4)--cycle;
  \draw[HyLuxMetal,line width=.45pt] (.6,.6)--(21.4,.6)--(21.4,5.6)--(2.4,5.6)--(.6,3.8)--cycle;
  \node[inner sep=0pt,text=white,font=\sffamily\bfseries\fontsize{7.5}{8.5}\selectfont]
   (code) at (11.3,3.1) {MÃ ĐỀ\enspace\ExamCode};}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{29pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.5pt}\renewcommand{\footrulewidth}{0pt}
 \renewcommand{\headrule}{\HyLuxHeaderRule}\renewcommand{\footrule}{}%
 \fancyhead[L]{\HyLuxSeal\hspace{4pt}%
  \sffamily\fontsize{8.7}{10.5}\selectfont\color{HyLuxPrimary}%
  \textbf{\SubjectName}\quad\textcolor{HyLuxMetal}{\textbullet}\quad\SchoolYear}
 \fancyhead[R]{\HyLuxHeaderCode}
 \fancyfoot[L]{\sffamily\fontsize{8}{9.5}\selectfont\color{HyLuxMid}%
  \SubjectName\enspace\textcolor{HyLuxMetal}{\textbullet}\enspace\SchoolYear}
 \fancyfoot[R]{\HyLuxPageBadge}}
\newcommand{\ExamEnd}{%
 \par\addvspace{4mm}\noindent\makebox[\linewidth]{%
  \color{HyLuxRule}\rule{.25\linewidth}{.45pt}\hspace{3mm}%
  \tikz[baseline=(end.base)]\node[draw=HyLuxMetal,fill=HyLuxPrimary,
   rounded corners=1.5pt,text=white,inner xsep=9pt,inner ysep=3pt,
   font=\sffamily\bfseries\small](end){HẾT};\hspace{3mm}%
  \color{HyLuxRule}\rule{.25\linewidth}{.45pt}}}

\AtBeginDocument{%
 \IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,
   BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]}{}%
 \IfFontExistsTF{texgyreheros-regular.otf}{%
  \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,
   BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]}{}%
 \IfFontExistsTF{texgyretermes-math.otf}{\setmathfont{texgyretermes-math.otf}}{}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%
 \renewcommand{\loigiaiEX}{%
  \par\noindent\makebox[\linewidth]{%
   \tikz[baseline=(sol.base)]\node[draw=HyLuxMetal,fill=HyLuxPrimary,
    line width=.45pt,rounded corners=1.4pt,text=white,
    inner xsep=9pt,inner ysep=2.5pt,
    font=\sffamily\bfseries\fontsize{8.5}{10}\selectfont](sol){LỜI GIẢI};}%
  \par\vspace{1.1mm}}%
 \renewcommand{\keyCh}{\circEX[fill=HyLuxWash,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 \renewcommand{\keyTF}{\squareTF[fill=HyLuxWash,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 \renewcommand{\keySA}{\squareEX[fill=HyLuxWash,draw=ExamAccent]{\color{ExamAccent}\keyEX}}%
 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\textcolor{ExamAccent}{\sffamily\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\textcolor{ExamAccent}{\sffamily\bfseries Đúng}}%
  \renewcommand{\Sai}{\textcolor{ExamAccent}{\sffamily\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyLuxOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyLuxOriginalOKQ[#1]{#2}\endgroup}%
}

% Bọc lời giải sau khi ex_test đã chọn chế độ hiện đáp án.
\makeatletter
\long\def\HyLuxWrapDoSolution#1{%
 \ifshowanswers
  \begin{tcolorbox}[enhanced,breakable,colback=HyLuxWash,
   colframe=HyLuxRule,boxrule=.45pt,arc=1.2mm,
   left=3mm,right=3mm,top=2.2mm,bottom=2.4mm,
   before skip=1mm,after skip=1.5mm,
   borderline west={1.1pt}{0pt}{HyLuxPrimary},
   overlay first={%
    \draw[HyLuxMetal,line width=.7pt]
     ([xshift=5mm]frame.north east)--++(-9mm,0);},
   overlay last={%
    \fill[HyLuxMetal] ([xshift=-4mm,yshift=2mm]frame.south east) circle[radius=.55mm];}]
   \HyLuxOriginalDoSolution{#1}%
  \end{tcolorbox}%
 \else
  \HyLuxOriginalDoSolution{#1}%
 \fi
}
\NewCommandCopy{\HyLuxOriginalShowAnsEX}{\showansEX}
\RenewDocumentCommand{\showansEX}{m o}{%
 \IfNoValueTF{#2}
  {\HyLuxOriginalShowAnsEX{#1}}
  {\HyLuxOriginalShowAnsEX{#1}[#2]}%
 \AtBeginEnvironment{#1}{%
  \let\HyLuxOriginalDoSolution\do@onlysolution
  \let\do@onlysolution\HyLuxWrapDoSolution
 }%
}
\makeatother

% Ô đúng/sai vẽ bằng nét tròn vector, không lệ thuộc ký tự của font.
\newcommand{\HyLuxTFBubble}{%
 \raisebox{4.4pt}[\height][\depth]{\tikz[baseline=-.55ex]{%
  \draw[ExamAccent,line width=.45pt](0,0)circle[radius=1.25mm];}}}
\AtBeginDocument{%
 \ifExamSolutions\else
  \AtBeginEnvironment{ex}{%
   \renewcommand{\writekeyTF}{%
    \ifthenelse{\equal{\cotDS}{2}}%
     {&\centering\HyLuxTFBubble &\centering\HyLuxTFBubble}%
     {\ifthenelse{\equal{\cotDS}{1}}{&\centering\HyLuxTFBubble}{}}}%
  }%
 \fi
}
` },
  { file: "theme-13-sky-panel.tex", name: "Sky Panel", tex: String.raw`% SKY PANEL — khung tiêu đề xanh đậm chuyển sắc bo góc, ô thông tin thí sinh có khung mã đề, tiêu đề phần dạng dải màu, nhãn A B C D tô đặc.
% Thiết kế theo ảnh tham khảo của chủ dự án (02/11/2026), nâng cấp kiểu dáng 02/11/2026 tối. Chọn: \ThemeFile = theme-13-sky-panel.tex
\definecolor{ThemeBase}{HTML}{1F55A4}
\definecolor{ThemeSecondary}{HTML}{6C97CF}
\def\ThemeName{SKY PANEL}

% ---------- Tiêu đề: khung xanh nhạt chuyển sắc, chữ xanh đậm, vạch nhấn bên trái; hai cột (trường | kỳ thi) cách nhau bằng vạch mảnh ----------
\newcommand{\HyThemeTitle}{%
 \begin{tcolorbox}[hytitle]
  \begin{minipage}[c]{.40\linewidth}\centering
   {\bfseries\fontsize{12}{15}\selectfont\MakeUppercase{\SchoolName}\par}
   \ifx\SchoolYear\empty\else\vspace{1.6mm}{\fontsize{10.5}{13}\selectfont\color{ExamAccent}Năm học \SchoolYear\par}\fi
   \vspace{2.2mm}\tcbox[on line,hypill]{\sffamily\bfseries\fontsize{8.5}{11}\selectfont ĐỀ CHÍNH THỨC}\par
  \end{minipage}%
  \hfill{\color{SkyHi}\vrule width .6pt height 10mm depth 10mm}\hfill%
  \begin{minipage}[c]{.52\linewidth}\centering
   {\bfseries\fontsize{15}{18.5}\selectfont\MakeUppercase{\ExamName}\par}
   \vspace{1.2mm}{\bfseries\fontsize{12}{15}\selectfont\color{ExamAccent}\SubjectName\par}
   \vspace{1.2mm}{\itshape\fontsize{10}{13}\selectfont\color{SkyInk}Thời gian: \ExamTime\ (không kể thời gian phát đề)\par}
  \end{minipage}
 \end{tcolorbox}}

% ---------- Thông tin thí sinh: một ô nền nhạt, bên phải là khung Mã đề ----------
\newcommand{\StudentInfo}{%
 \par\noindent
 \begin{tcolorbox}[hyinfo]
  \fontsize{10.5}{13}\selectfont
  \textbf{Họ và tên thí sinh:}\,\dotfill\par\vspace{2.6mm}
  \noindent\textbf{Lớp:}\,\makebox[24mm]{\dotfill}\hfill\textbf{Số báo danh:}\,\makebox[44mm]{\dotfill}\par
  \tcblower
  \centering
  {\sffamily\bfseries\fontsize{8}{10}\selectfont\color{ExamAccent}MÃ ĐỀ THI\par}\vspace{.8mm}
  {\sffamily\bfseries\fontsize{24}{26}\selectfont\color{SkyDeep}\ExamCode\par}
 \end{tcolorbox}}

% ---------- Nhãn đáp án: chữ xanh đậm ----------
\newcommand{\AnswerBadge}[1]{%
 \leavevmode{\bfseries\color{ExamAccent}#1.}}

% ---------- Tiêu đề phần: dải màu nhạt, vạch xanh bên trái, nhãn PHẦN + điểm dạng viên thuốc ----------
\newcommand{\HyPartTag}[1]{\tcbox[on line,hytag]{\sffamily\bfseries\fontsize{9.5}{12}\selectfont #1}}
\newcommand{\HyPartPts}[1]{\tcbox[on line,hypts]{\sffamily\bfseries\fontsize{9.5}{12}\selectfont #1}}
% #1 nhãn (PHẦN I), #2 điểm (rỗng nếu không có), #3 tiêu đề, #4 ghi chú (rỗng nếu không có)
\newcommand{\HyPartBanner}[4]{%
 \par\addvspace{3mm}\needspace{6\baselineskip}%
 \begin{tcolorbox}[hypart]
  \noindent\HyPartTag{#1}\hspace{2.6mm}%
  {\sffamily\bfseries\fontsize{11.5}{14.5}\selectfont\color{SkyDeep}#3}%
  \ifx\relax#2\relax\else\hfill\HyPartPts{#2}\fi\par
  \ifx\relax#4\relax\else\vspace{1mm}{\fontsize{9.8}{12.4}\selectfont\itshape\color{black!72}#4}\par\fi
 \end{tcolorbox}\par\vspace{1.2mm}}
\newcommand{\HyThemePart}[1]{%
 \par{\bfseries\fontsize{11.5}{14}\selectfont\color{ExamAccent}#1\par}\vspace{.6mm}}
\newcommand{\HyStyledHeading}[1]{{\color{ExamAccent}\HyOriginalTextbf{#1}}}
\ExplSyntaxOn
\NewCommandCopy{\HyOriginalTextbf}{\textbf}
\tl_new:N \l_hy_i_tl
\tl_new:N \l_hy_p_tl
\tl_new:N \l_hy_t_tl
\tl_new:N \l_hy_n_tl
\seq_new:N \l_hy_parts_seq
% Tách "PHẦN I. (3,0 điểm) Tiêu đề. Ghi chú…" thành nhãn / điểm / tiêu đề / ghi chú; không tách được thì giữ kiểu chữ xanh đậm cũ.
\cs_new_protected:Npn \hy_part:n #1
 {
  \tl_set:Nn \l_tmpb_tl {#1}
  \regex_extract_once:nVNTF
   { \A\s*(?:PHẦN|Phần|phần)\s+([IVX]+)\b\s*[.:]?\s*(?:\(([^\)]*)\))?\s*([^.\s].*?\.)\s+(.+)\Z }
   \l_tmpb_tl \l_hy_parts_seq
   { \hy_banner: }
   {
    \regex_extract_once:nVNTF
     { \A\s*(?:PHẦN|Phần|phần)\s+([IVX]+)\b\s*[.:]?\s*(?:\(([^\)]*)\))?\s*(.+)\Z }
     \l_tmpb_tl \l_hy_parts_seq
     {
      \seq_put_right:Nn \l_hy_parts_seq {}
      \hy_banner:
     }
     { \HyStyledHeading{#1} }
   }
 }
\cs_new_protected:Npn \hy_do:nnnn #1#2#3#4 { \HyPartBanner {#1}{#2}{#3}{#4} }
\cs_generate_variant:Nn \hy_do:nnnn { VVVV }
\cs_new_protected:Npn \hy_banner:
 {
  \seq_pop_left:NN \l_hy_parts_seq \l_tmpa_tl
  \seq_pop_left:NN \l_hy_parts_seq \l_hy_i_tl
  \seq_pop_left:NN \l_hy_parts_seq \l_hy_p_tl
  \seq_pop_left:NN \l_hy_parts_seq \l_hy_t_tl
  \seq_pop_left:NN \l_hy_parts_seq \l_hy_n_tl
  \tl_put_left:Nn \l_hy_i_tl { PHẦN~ }
  \hy_do:VVVV \l_hy_i_tl \l_hy_p_tl \l_hy_t_tl \l_hy_n_tl
 }
\cs_new_protected:Npn \HyPartAwareBold #1
 {
  \group_begin:
  \tl_set:Nx \l_tmpa_tl {\tl_to_str:n {#1}}
  \regex_match:nVTF {\A\s*(PHẦN|Phần|phần)\s+[IVX]+} \l_tmpa_tl
   {\hy_part:n {#1}}
   {\HyOriginalTextbf{#1}}
  \group_end:
 }
\RenewDocumentCommand{\textbf}{m}{\HyPartAwareBold{#1}}
\ExplSyntaxOff

% ---------- Đầu / chân trang ----------
\newcommand{\HySlashes}{\tikz[x=1mm,y=1mm,baseline=-.8mm]{%
 \foreach \i in {0,1,2}{\fill[ExamAccent,opacity={1-.28*\i}] (\i*4.2,-2.5)--(\i*4.2+2.6,-2.5)--(\i*4.2+4.6,2.5)--(\i*4.2+2,2.5)--cycle;}}}
\newcommand{\HyThemePageStyle}{%
 \setlength{\headheight}{28pt}
 \pagestyle{fancy}\fancyhf{}
 \renewcommand{\headrulewidth}{.7pt}\renewcommand{\footrulewidth}{.7pt}
 \renewcommand{\headrule}{\hbox to\headwidth{\color{ExamAccent!55}\leaders\hrule height .7pt\hfill}}
 \renewcommand{\footrule}{\vskip-2pt\hbox to\headwidth{\color{ExamAccent!55}\leaders\hrule height .7pt\hfill}\vskip3pt}
 \fancyhead[L]{\HySlashes\hspace{6pt}\sffamily\fontsize{8.5}{11}\selectfont\color{ExamAccent}\MakeUppercase{\ExamName}}
 \fancyhead[R]{\tcbox[on line,colback=PanelFill,colframe=ExamAccent,arc=1.4mm,left=5pt,right=5pt,top=2pt,bottom=2pt]{\sffamily\bfseries\fontsize{9.5}{11}\selectfont\color{PanelInk}Trang \thepage}}
 \fancyfoot[L]{\sffamily\bfseries\fontsize{9}{11}\selectfont\color{ExamAccent}\TeacherName}
 \fancyfoot[R]{\sffamily\bfseries\fontsize{9}{11}\selectfont\color{ExamAccent}Mã đề \ExamCode\ \ \textbullet\ \ \thepage/\ref{TotPages}}}

\newcommand{\ExamEnd}{%
 \par\addvspace{4mm}\noindent\makebox[\linewidth]{\color{ExamAccent!40}\rule{.3\linewidth}{.5pt}\hspace{3mm}%
  \tikz[baseline=(e.base)]\node[fill=PanelFill,text=PanelInk,rounded corners=1.5pt,inner xsep=10pt,inner ysep=3pt,font=\sffamily\bfseries\small](e){HẾT};%
  \hspace{3mm}\color{ExamAccent!40}\rule{.3\linewidth}{.5pt}}}

\AtBeginDocument{%
 % Màu và kiểu khung dùng cho tiêu đề, ô thông tin, tiêu đề phần (bản in trắng đen: khung đen, nền trắng).
 \ifExamColor
  \definecolor{SkyDeep}{HTML}{0F2F66}\definecolor{SkyHi}{HTML}{BFDBFE}
  \definecolor{SkyPale}{HTML}{F3F7FF}\definecolor{SkyMist}{HTML}{DCE8FC}\definecolor{SkyInk}{HTML}{334E7A}
  \tcbset{
   hytitle/.style={enhanced,interior style={left color=SkyPale,right color=SkyMist},colframe=SkyHi,boxrule=.6pt,arc=3mm,
    left=8mm,right=6mm,top=4.4mm,bottom=4.4mm,before skip=2mm,after skip=3.5mm,coltext=SkyDeep,
    overlay={\begin{scope}\clip[rounded corners=3mm] (frame.south west) rectangle (frame.north east);
     \fill[ExamAccent] (frame.south west) rectangle ([xshift=2.2mm]frame.north west);\end{scope}}},
   hypill/.style={colback=ExamAccent,colframe=ExamAccent,boxrule=0pt,arc=1.6mm,left=8pt,right=8pt,top=2.4pt,bottom=2.4pt,coltext=white}}
 \else
  \colorlet{SkyDeep}{black}\colorlet{SkyHi}{black}\colorlet{SkyInk}{black}
  \tcbset{
   hytitle/.style={enhanced,colback=white,colframe=black,boxrule=.9pt,arc=3mm,
    left=6mm,right=6mm,top=4.4mm,bottom=4.4mm,before skip=2mm,after skip=3.5mm,coltext=black},
   hypill/.style={colback=white,colframe=black!70,boxrule=.5pt,arc=1.4mm,left=7pt,right=7pt,top=2pt,bottom=2pt,coltext=black}}
 \fi
 \tcbset{
  hyinfo/.style={enhanced,sidebyside,lefthand width=\dimexpr\linewidth-36mm\relax,sidebyside align=center,sidebyside gap=4mm,
   segmentation style={solid,ExamAccent!45,line width=.5pt},colback=ExamLight,colframe=ExamAccent!40,boxrule=.5pt,arc=2.2mm,
   left=4.5mm,right=2mm,top=2.4mm,bottom=2.4mm,before skip=0mm,after skip=3.5mm},
  hypart/.style={enhanced,colback=ExamLight,colframe=ExamAccent,boxrule=0pt,leftrule=1.8mm,arc=1.4mm,
   left=3mm,right=3mm,top=2mm,bottom=2mm,before skip=0mm,after skip=0mm},
  hytag/.style={colback=ExamAccent,colframe=ExamAccent,boxrule=0pt,arc=1.3mm,left=6pt,right=6pt,top=2.2pt,bottom=2.2pt,coltext=white},
  hypts/.style={colback=white,colframe=ExamAccent!60,boxrule=.5pt,arc=1.3mm,left=6pt,right=6pt,top=2pt,bottom=2pt,coltext=ExamAccent}}%
 \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 \setsansfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
 \setmathfont{texgyretermes-math.otf}%
 \settowidth{\widthalpha}{\AnswerBadge{D}}\addtolength{\widthalpha}{2pt}%
 % Một họ chữ (serif) cho nhãn Câu và hàng tiêu đề bảng đúng/sai; sans chỉ còn ở nhãn A B C D, tiêu đề phần và đầu/chân trang.
 \renewtheorem{ex}{\bfseries\color{ExamAccent}Câu}%
 \AtBeginEnvironment{longtable}{%
  \renewcommand{\phatbieu}{\cellcolor{PanelFill}\textcolor{PanelInk}{\bfseries Mệnh đề}}%
  \renewcommand{\Dung}{\cellcolor{PanelFill}\textcolor{PanelInk}{\bfseries Đúng}}%
  \renewcommand{\Sai}{\cellcolor{PanelFill}\textcolor{PanelInk}{\bfseries Sai}}}%
 \def\widthSA{4.4}%
 \pretocmd{\shortans}{\par\nobreak\noindent}{}{}%
 \NewCommandCopy{\HyOriginalOKQ}{\oKQ}%
 \renewcommand{\oKQ}[2][]{\begingroup\color{ExamAccent}%
  \tikzset{every path/.append style={draw=ExamAccent,line width=.5pt}}%
  \HyOriginalOKQ[#1]{#2}\endgroup}%
}
` },
];
