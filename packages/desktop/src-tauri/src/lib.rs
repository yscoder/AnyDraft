mod atomic_write;
mod commands;
mod error;
mod workspace;

use commands::*;
use workspace::WorkspaceState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            reopen_last_workspace,
            choose_workspace,
            list_nodes,
            read_text_file,
            write_text_file,
            create_text_file,
            create_directory,
            rename_node,
            remove_node,
            create_image_file,
            read_file_bytes,
            export_file,
        ])
        .run(tauri::generate_context!())
        .expect("稿域桌面客户端启动失败");
}
