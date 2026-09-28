use crate::atomic_write;
use crate::error::{AppError, AppResult};
use crate::workspace::{
    OpenedWorkspace, RepoNode, WorkspaceState, classify, list_nodes as scan_nodes, relative_path,
    resolve_directory, resolve_existing, resolve_new_child, sanitize_name, unique_path,
};
use serde::{Deserialize, Serialize};
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

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    id: String,
    original_path: String,
    name: String,
    kind: String,
    deleted_at: u64,
}

#[derive(Deserialize, Serialize)]
struct TrashIndex {
    version: u8,
    entries: Vec<TrashEntry>,
}

fn check_trash_id(id: &str) -> AppResult<()> {
    if id.len() != 36
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
    {
        return Err(AppError::InvalidPath("无效的回收站条目".into()));
    }
    Ok(())
}

fn trash_dir(root: &Path) -> PathBuf {
    root.join(".anydraft").join("trash")
}

fn checked_trash_dir(root: &Path, create: bool) -> AppResult<PathBuf> {
    let app = root.join(".anydraft");
    let trash = trash_dir(root);
    for directory in [&app, &trash] {
        if create && !directory.exists() {
            fs::create_dir(directory)?;
        }
        if directory.exists() && !fs::symlink_metadata(directory)?.is_dir() {
            return Err(AppError::InvalidPath("应用数据目录不是普通文件夹".into()));
        }
    }
    Ok(trash)
}

fn valid_trash_entry(info: &TrashEntry) -> bool {
    check_trash_id(&info.id).is_ok()
        && !info.original_path.is_empty()
        && !info.original_path.split('/').any(|part| {
            part.is_empty() || part.starts_with('.') || part.contains('\\') || part.contains(':')
        })
        && Path::new(&info.original_path)
            .file_name()
            .is_some_and(|name| name == info.name.as_str())
        && matches!(info.kind.as_str(), "dir" | "markdown" | "image" | "other")
}

fn write_trash_index(root: &Path, entries: &[TrashEntry]) -> AppResult<()> {
    let path = checked_trash_dir(root, true)?.join("index.json");
    let index = TrashIndex {
        version: 1,
        entries: entries.to_vec(),
    };
    atomic_write::write(&path, &serde_json::to_vec(&index)?)
}

fn read_trash_index(root: &Path) -> AppResult<Vec<TrashEntry>> {
    let path = checked_trash_dir(root, false)?.join("index.json");
    let bytes = match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(AppError::InvalidPath("回收站索引不能是符号链接".into()));
        }
        Ok(_) => fs::read(&path)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let index: TrashIndex = serde_json::from_slice(&bytes)?;
    if index.version != 1 || index.entries.iter().any(|entry| !valid_trash_entry(entry)) {
        return Err(AppError::InvalidPath("回收站索引已损坏".into()));
    }
    let mut active = Vec::new();
    for entry in &index.entries {
        let dir = trash_dir(root).join(&entry.id);
        let item = dir.join("item");
        if fs::symlink_metadata(&dir).is_ok_and(|metadata| !metadata.file_type().is_symlink())
            && fs::symlink_metadata(&item).is_ok_and(|metadata| !metadata.file_type().is_symlink())
        {
            active.push(entry.clone());
        }
    }
    if active.len() != index.entries.len() {
        write_trash_index(root, &active)?;
    }
    Ok(active)
}

fn read_trash_entry(root: &Path, id: &str) -> AppResult<TrashEntry> {
    check_trash_id(id)?;
    read_trash_index(root)?
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| AppError::InvalidPath("回收站条目不存在".into()))
}

#[tauri::command(async)]
pub fn trash_node(
    path: String,
    id: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<()> {
    let _guard = state.trash_lock.lock().expect("trash mutex poisoned");
    trash_node_at(&state.root(&workspace_token)?, path, id)
}

fn trash_node_at(root: &Path, path: String, id: String) -> AppResult<()> {
    check_trash_id(&id)?;
    if path.split('/').any(|part| part.starts_with('.')) {
        return Err(AppError::InvalidPath("不能删除应用数据目录".into()));
    }
    let target = resolve_existing(root, &path)?;
    if target == root {
        return Err(AppError::InvalidPath("不能删除工作目录根节点".into()));
    }
    let entry = TrashEntry {
        id: id.clone(),
        original_path: path,
        name: target
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        kind: if target.is_dir() {
            "dir"
        } else {
            classify(&target.file_name().unwrap_or_default().to_string_lossy())
        }
        .into(),
        deleted_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    };
    let mut entries = read_trash_index(root)?;
    let item_dir = checked_trash_dir(root, true)?.join(id);
    fs::create_dir(&item_dir)?;
    entries.push(entry);
    write_trash_index(root, &entries)?;
    fs::rename(target, item_dir.join("item"))?;
    Ok(())
}

#[tauri::command(async)]
pub fn list_trash(
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<Vec<TrashEntry>> {
    let _guard = state.trash_lock.lock().expect("trash mutex poisoned");
    let root = state.root(&workspace_token)?;
    let mut entries = read_trash_index(&root)?;
    entries.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(entries)
}

#[tauri::command(async)]
pub fn list_trash_nodes(
    id: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<Vec<RepoNode>> {
    let _guard = state.trash_lock.lock().expect("trash mutex poisoned");
    let root = state.root(&workspace_token)?;
    let info = read_trash_entry(&root, &id)?;
    if info.kind != "dir" {
        return Ok(Vec::new());
    }
    scan_nodes(&trash_dir(&root).join(id).join("item"))
}

#[tauri::command(async)]
pub fn read_trash_text(
    id: String,
    relative_path: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<String> {
    let _guard = state.trash_lock.lock().expect("trash mutex poisoned");
    let root = state.root(&workspace_token)?;
    let info = read_trash_entry(&root, &id)?;
    let item = trash_dir(&root).join(id).join("item");
    let file = if info.kind == "dir" && !relative_path.is_empty() {
        resolve_existing(&item, &relative_path)?
    } else if info.kind == "markdown" && relative_path.is_empty() {
        item
    } else {
        return Err(AppError::InvalidPath("不是 Markdown 文档".into()));
    };
    if !matches!(
        classify(&file.file_name().unwrap_or_default().to_string_lossy()),
        "markdown"
    ) && info.kind == "dir"
    {
        return Err(AppError::InvalidPath("不是 Markdown 文档".into()));
    }
    Ok(fs::read_to_string(file)?)
}

#[tauri::command(async)]
pub fn read_trash_image_bytes(
    id: String,
    relative_path: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<Response> {
    let _guard = state.trash_lock.lock().expect("trash mutex poisoned");
    let root = state.root(&workspace_token)?;
    let info = read_trash_entry(&root, &id)?;
    if info.kind != "dir" {
        return Err(AppError::InvalidPath("不是回收站文件夹".into()));
    }
    let item = trash_dir(&root).join(id).join("item");
    let file = resolve_existing(&item, &relative_path)?;
    if classify(&file.file_name().unwrap_or_default().to_string_lossy()) != "image" {
        return Err(AppError::InvalidPath("不是图片".into()));
    }
    Ok(Response::new(fs::read(file)?))
}

#[tauri::command(async)]
pub fn restore_trash(
    id: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<String> {
    let _guard = state.trash_lock.lock().expect("trash mutex poisoned");
    restore_trash_at(&state.root(&workspace_token)?, id)
}

fn restore_trash_at(root: &Path, id: String) -> AppResult<String> {
    let entries = read_trash_index(root)?;
    let info = read_trash_entry(root, &id)?;
    let original = Path::new(&info.original_path);
    let mut parent = root.to_path_buf();
    for part in original.parent().unwrap_or(Path::new("")).components() {
        let segment = part.as_os_str().to_string_lossy();
        let next = parent.join(segment.as_ref());
        if next.exists() {
            parent = resolve_directory(root, &relative_path(root, &next)?)?;
        } else {
            fs::create_dir(&next)?;
            parent = next;
        }
    }
    let target = unique_path(&parent, &info.name);
    fs::rename(
        checked_trash_dir(root, false)?.join(&id).join("item"),
        &target,
    )?;
    fs::remove_dir_all(trash_dir(root).join(&id))?;
    write_trash_index(
        root,
        &entries
            .into_iter()
            .filter(|entry| entry.id != id)
            .collect::<Vec<_>>(),
    )?;
    relative_path(root, &target)
}

#[tauri::command(async)]
pub fn remove_trash(
    id: String,
    workspace_token: String,
    state: State<'_, WorkspaceState>,
) -> AppResult<()> {
    let _guard = state.trash_lock.lock().expect("trash mutex poisoned");
    let root = state.root(&workspace_token)?;
    let entries = read_trash_index(&root)?;
    read_trash_entry(&root, &id)?;
    fs::remove_dir_all(checked_trash_dir(&root, false)?.join(&id))?;
    write_trash_index(
        &root,
        &entries
            .into_iter()
            .filter(|entry| entry.id != id)
            .collect::<Vec<_>>(),
    )?;
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

#[cfg(test)]
mod trash_tests {
    use super::*;

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "anydraft-trash-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn moves_and_restores_without_overwriting_a_new_file() {
        let root = TestRoot::new();
        let id = "12345678-1234-1234-1234-123456789abc".to_string();
        fs::create_dir(root.0.join("专题")).unwrap();
        fs::write(root.0.join("专题/文章.md"), "原稿").unwrap();
        trash_node_at(&root.0, "专题/文章.md".into(), id.clone()).unwrap();
        assert!(!root.0.join("专题/文章.md").exists());
        assert!(trash_dir(&root.0).join("index.json").exists());
        assert!(!trash_dir(&root.0).join(&id).join("info.json").exists());
        assert_eq!(
            read_trash_entry(&root.0, &id).unwrap().original_path,
            "专题/文章.md"
        );
        fs::write(root.0.join("专题/文章.md"), "新稿").unwrap();
        assert_eq!(restore_trash_at(&root.0, id).unwrap(), "专题/文章 2.md");
        assert_eq!(
            fs::read_to_string(root.0.join("专题/文章.md")).unwrap(),
            "新稿"
        );
        assert_eq!(
            fs::read_to_string(root.0.join("专题/文章 2.md")).unwrap(),
            "原稿"
        );
        assert!(read_trash_index(&root.0).unwrap().is_empty());
    }

    #[test]
    fn moves_a_directory_with_its_contents() {
        let root = TestRoot::new();
        let id = "12345678-1234-1234-1234-123456789abc".to_string();
        fs::create_dir(root.0.join("专题")).unwrap();
        fs::write(root.0.join("专题/文章.md"), "正文").unwrap();
        trash_node_at(&root.0, "专题".into(), id.clone()).unwrap();
        assert_eq!(read_trash_entry(&root.0, &id).unwrap().kind, "dir");
        assert_eq!(
            fs::read_to_string(trash_dir(&root.0).join(&id).join("item/文章.md")).unwrap(),
            "正文"
        );
        assert_eq!(restore_trash_at(&root.0, id).unwrap(), "专题");
        assert_eq!(
            fs::read_to_string(root.0.join("专题/文章.md")).unwrap(),
            "正文"
        );
    }

    #[test]
    fn keeps_multiple_entries_in_one_index() {
        let root = TestRoot::new();
        let first = "12345678-1234-1234-1234-123456789abc".to_string();
        let second = "12345678-1234-1234-1234-123456789abd".to_string();
        fs::write(root.0.join("甲.md"), "甲").unwrap();
        fs::write(root.0.join("乙.md"), "乙").unwrap();
        trash_node_at(&root.0, "甲.md".into(), first.clone()).unwrap();
        trash_node_at(&root.0, "乙.md".into(), second.clone()).unwrap();
        assert_eq!(read_trash_index(&root.0).unwrap().len(), 2);
        restore_trash_at(&root.0, first).unwrap();
        assert_eq!(read_trash_index(&root.0).unwrap()[0].id, second);
    }

    #[test]
    fn moves_and_restores_an_image() {
        let root = TestRoot::new();
        let id = "12345678-1234-1234-1234-123456789abc".to_string();
        fs::write(root.0.join("配图.png"), b"old image").unwrap();
        trash_node_at(&root.0, "配图.png".into(), id.clone()).unwrap();
        assert_eq!(read_trash_entry(&root.0, &id).unwrap().kind, "image");
        fs::write(root.0.join("配图.png"), b"new image").unwrap();
        assert_eq!(restore_trash_at(&root.0, id).unwrap(), "配图 2.png");
        assert_eq!(fs::read(root.0.join("配图.png")).unwrap(), b"new image");
        assert_eq!(fs::read(root.0.join("配图 2.png")).unwrap(), b"old image");
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
