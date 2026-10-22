// Không hiện cửa sổ dòng lệnh khi chạy bản phát hành trên Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hedu_lib::run()
}
