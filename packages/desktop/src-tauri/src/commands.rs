use crate::atomic_write;
use crate::error::{AppError, AppResult};
use crate::workspace::{
    OpenedWorkspace, RepoNode, WorkspaceState, list_nodes as scan_nodes, relative_path,
    resolve_directory, resolve_existing, resolve_new_child, sanitize_name, unique_path,
};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    runtime: &'static str,
    platform: &'static str,
}

#[tauri::command]
pub fn get_runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        runtime: "tauri",
        platform: std::env::consts::OS,
    }
}

#[tauri::command(async)]
pub fn reopen_last_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> AppResult<Option<OpenedWorkspace>> {
    state.reopen_last(&app)
}

#[tauri::command(async)]
pub fn choose_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> AppResult<Option<OpenedWorkspace>> {
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(format!("系统目录选择结果不可用：{error}")))?;
    state.open(&app, path).map(Some)
}

#[tauri::command(async)]
pub fn list_nodes(
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<Vec<RepoNode>> {
    scan_nodes(&state.root(&workspace_token)?)
}

#[tauri::command(async)]
pub fn read_text_file(
    path: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<String> {
    let root = state.root(&workspace_token)?;
    Ok(fs::read_to_string(resolve_existing(&root, &path)?)?)
}

#[tauri::command(async)]
pub fn write_text_file(
    path: String,
    content: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<()> {
    let root = state.root(&workspace_token)?;
    atomic_write::write(&resolve_existing(&root, &path)?, content.as_bytes())
}

#[tauri::command(async)]
pub fn create_text_file(
    dir_path: String,
    desired_name: String,
    content: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<String> {
    let root = state.root(&workspace_token)?;
    let directory = resolve_directory(&root, &dir_path)?;
    let clean = sanitize_name(&desired_name)?;
    let target = unique_path(&directory, &clean);
    atomic_write::write(&target, content.as_bytes())?;
    relative_path(&root, &target)
}

#[tauri::command(async)]
pub fn create_directory(
    dir_path: String,
    desired_name: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<String> {
    let root = state.root(&workspace_token)?;
    let target = resolve_new_child(&root, &dir_path, &desired_name)?;
    let directory = target
        .parent()
        .ok_or_else(|| AppError::InvalidPath(dir_path.clone()))?;
    let name = target
        .file_name()
        .ok_or_else(|| AppError::InvalidName(desired_name.clone()))?
        .to_string_lossy();
    let unique = unique_path(directory, &name);
    fs::create_dir(&unique)?;
    relative_path(&root, &unique)
}

fn markdown_name(original: &Path, requested: &str) -> AppResult<String> {
    let mut clean = sanitize_name(requested)?;
    let original_extension = original
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase());
    let requested_extension = Path::new(&clean)
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase());
    if matches!(original_extension.as_deref(), Some("md" | "markdown"))
        && !matches!(requested_extension.as_deref(), Some("md" | "markdown"))
    {
        clean.push_str(".md");
    }
    Ok(clean)
}

#[tauri::command(async)]
pub fn rename_node(
    path: String,
    new_name: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<String> {
    let root = state.root(&workspace_token)?;
    let source = resolve_existing(&root, &path)?;
    if source == root {
        return Err(AppError::InvalidPath("不能重命名工作目录根节点".into()));
    }
    let parent = source
        .parent()
        .ok_or_else(|| AppError::InvalidPath(path.clone()))?;
    let target = parent.join(markdown_name(&source, &new_name)?);
    if target == source {
        return Ok(path);
    }
    if target.exists() {
        return Err(AppError::AlreadyExists(
            target
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        ));
    }
    fs::rename(source, &target)?;
    relative_path(&root, &target)
}

#[tauri::command(async)]
pub fn remove_node(
    path: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<()> {
    let root = state.root(&workspace_token)?;
    let target = resolve_existing(&root, &path)?;
    if target == root {
        return Err(AppError::InvalidPath("不能删除工作目录根节点".into()));
    }
    if target.is_dir() {
        fs::remove_dir_all(target)?;
    } else {
        fs::remove_file(target)?;
    }
    Ok(())
}

fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "image/avif" => "avif",
        _ => "png",
    }
}

fn request_header(request: &Request<'_>, name: &'static str) -> AppResult<String> {
    let encoded = request
        .headers()
        .get(name)
        .ok_or_else(|| AppError::InvalidPath(format!("缺少请求头：{name}")))?
        .to_str()
        .map_err(|_| AppError::InvalidPath(format!("请求头不可解析：{name}")))?;
    percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map(|value| value.into_owned())
        .map_err(|_| AppError::InvalidPath(format!("请求头不是 UTF-8：{name}")))
}

fn request_bytes(request: &Request<'_>) -> AppResult<Vec<u8>> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err(AppError::InvalidPath("请求正文必须是二进制数据".into())),
    }
}

#[tauri::command(async)]
pub fn create_image_file(
    request: Request<'_>,
    state: State<'_, WorkspaceState>,
) -> AppResult<String> {
    let dir_path = request_header(&request, "x-dir-path")?;
    let desired_name = request_header(&request, "x-desired-name")?;
    let mime = request_header(&request, "x-content-type")?;
    let workspace_token = request_header(&request, "x-workspace-token")?;
    let root = state.root(&workspace_token)?;
    let directory = resolve_directory(&root, &dir_path)?;
    let mut clean = sanitize_name(&desired_name)?;
    if Path::new(&clean).extension().is_none() {
        clean.push('.');
        clean.push_str(extension_for_mime(&mime));
    }
    let target = unique_path(&directory, &clean);
    atomic_write::write(&target, &request_bytes(&request)?)?;
    relative_path(&root, &target)
}

#[tauri::command(async)]
pub fn read_file_bytes(
    path: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<Response> {
    let root = state.root(&workspace_token)?;
    Ok(Response::new(fs::read(resolve_existing(&root, &path)?)?))
}

#[tauri::command(async)]
pub fn export_file(request: Request<'_>, app: AppHandle) -> AppResult<bool> {
    let suggested_name = request_header(&request, "x-suggested-name")?;
    let clean = sanitize_name(&suggested_name)?;
    let selected = app
        .dialog()
        .file()
        .set_file_name(&clean)
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(false);
    };
    let path: PathBuf = selected
        .into_path()
        .map_err(|error| AppError::InvalidPath(format!("系统保存路径不可用：{error}")))?;
    atomic_write::write(&path, &request_bytes(&request)?)?;
    Ok(true)
}
