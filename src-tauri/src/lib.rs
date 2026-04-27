mod commands;
mod export;
mod fs_atomic;
mod watch;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::project_open,
            commands::project_save,
            commands::asset_import,
            commands::asset_read,
            commands::audio_read,
            commands::watch_assets,
            commands::export_start,
            commands::export_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Frog Animator");
}
