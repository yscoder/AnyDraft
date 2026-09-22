use crate::atomic_write;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "workspace.json";

pub struct WorkspaceState {
    current: Mutex<Option<CurrentWorkspace>>,
    next_token: AtomicU64,
}

struct CurrentWorkspace {
    root: PathBuf,
    token: String,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
            next_token: AtomicU64::new(1),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedWorkspace {
    pub root_name: String,
    pub workspace_token: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceConfig {
    root_path: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoNode {
    kind: &'static str,
    name: String,
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
}

impl WorkspaceState {
    pub fn open(&self, app: &AppHandle, selected: PathBuf) -> AppResult<OpenedWorkspace> {
        let canonical = selected.canonicalize()?;
        if !canonical.is_dir() {
            return Err(AppError::InvalidPath("所选路径不是目录".into()));
        }
        save_config(app, &canonical)?;
        let token = self.next_token.fetch_add(1, Ordering::Relaxed).to_string();
        let opened = OpenedWorkspace {
            root_name: root_name(&canonical),
            workspace_token: token.clone(),
        };
        *self.current.lock().expect("workspace mutex poisoned") = Some(CurrentWorkspace {
            root: canonical,
            token,
        });
        Ok(opened)
    }

    pub fn reopen_last(&self, app: &AppHandle) -> AppResult<Option<OpenedWorkspace>> {
        let Some(path) = load_config(app)? else {
            return Ok(None);
        };
        match path.canonicalize() {
            Ok(path) if path.is_dir() => self.open(app, path).map(Some),
            Ok(_) | Err(_) => Ok(None),
        }
    }

    pub fn root(&self, token: &str) -> AppResult<PathBuf> {
        let current = self.current.lock().expect("workspace mutex poisoned");
        let current = current.as_ref().ok_or(AppError::WorkspaceNotOpen)?;
        if current.token != token {
            return Err(AppError::WorkspaceChanged);
        }
        Ok(current.root.clone())
    }
}

fn root_name(root: &Path) -> String {
    root.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| root.to_string_lossy().into_owned())
}

fn config_path(app: &AppHandle) -> AppResult<PathBuf> {
    let directory = app.path().app_config_dir().map_err(|error| {
        AppError::Io(std::io::Error::other(format!(
            "无法定位应用配置目录：{error}"
        )))
    })?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join(CONFIG_FILE))
}

fn save_config(app: &AppHandle, root: &Path) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(&WorkspaceConfig {
        root_path: root.to_path_buf(),
    })?;
    atomic_write::write(&config_path(app)?, &bytes)
}

fn load_config(app: &AppHandle) -> AppResult<Option<PathBuf>> {
    let path = config_path(app)?;
    match fs::read(path) {
        Ok(bytes) => Ok(serde_json::from_slice::<WorkspaceConfig>(&bytes)
            .ok()
            .map(|config| config.root_path)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn sanitize_name(input: &str) -> AppResult<String> {
    let replaced: String = input
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) || character == '\0'
            {
                '_'
            } else {
                character
            }
        })
        .collect();
    let compact = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut clean = compact.trim().trim_start_matches('.').to_string();
    if clean.is_empty() {
        clean = "未命名".into();
    }
    let stem = clean
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"))
            .is_some_and(|suffix| {
                matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            });
    if reserved {
        clean.insert(0, '_');
    }
    if clean.encode_utf16().count() > 240 {
        return Err(AppError::InvalidName("文件名过长".into()));
    }
    Ok(clean)
}

fn relative_segments(path: &str) -> AppResult<Vec<&str>> {
    if path.is_empty() {
        return Ok(Vec::new());
    }
    if path.starts_with('/') || path.starts_with('\\') || path.contains('\0') {
        return Err(AppError::InvalidPath(path.into()));
    }
    let segments: Vec<_> = path.split('/').collect();
    if segments.iter().any(|segment| {
        segment.is_empty()
            || *segment == "."
            || *segment == ".."
            || segment.contains('\\')
            || segment.contains(':')
    }) {
        return Err(AppError::InvalidPath(path.into()));
    }
    Ok(segments)
}

fn ensure_no_symlink(root: &Path, segments: &[&str]) -> AppResult<PathBuf> {
    let mut current = root.to_path_buf();
    for segment in segments {
        current.push(segment);
        if fs::symlink_metadata(&current)?.file_type().is_symlink() {
            return Err(AppError::InvalidPath(format!(
                "不允许访问符号链接：{}",
                current.display()
            )));
        }
    }
    Ok(current)
}

pub fn resolve_existing(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let segments = relative_segments(relative)?;
    let candidate = ensure_no_symlink(root, &segments)?;
    let canonical = candidate.canonicalize()?;
    if !canonical.starts_with(root) {
        return Err(AppError::InvalidPath(relative.into()));
    }
    Ok(canonical)
}

pub fn resolve_directory(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let directory = resolve_existing(root, relative)?;
    if !directory.is_dir() {
        return Err(AppError::InvalidPath(format!("不是目录：{relative}")));
    }
    Ok(directory)
}

pub fn resolve_new_child(root: &Path, dir_path: &str, name: &str) -> AppResult<PathBuf> {
    let directory = resolve_directory(root, dir_path)?;
    Ok(directory.join(sanitize_name(name)?))
}

pub fn relative_path(root: &Path, path: &Path) -> AppResult<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| AppError::InvalidPath(path.display().to_string()))?;
    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

pub fn unique_path(directory: &Path, desired_name: &str) -> PathBuf {
    let desired = Path::new(desired_name);
    let stem = desired
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| desired_name.into());
    let extension = desired
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    let mut candidate = directory.join(desired_name);
    let mut index = 2;
    while candidate.exists() {
        candidate = directory.join(format!("{stem} {index}{extension}"));
        index += 1;
    }
    candidate
}

fn classify(name: &str) -> &'static str {
    let extension = Path::new(name)
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "md" | "markdown" => "markdown",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif" => "image",
        _ => "other",
    }
}

pub fn list_nodes(root: &Path) -> AppResult<Vec<RepoNode>> {
    fn walk(root: &Path, directory: &Path, output: &mut Vec<RepoNode>) -> AppResult<()> {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "__MACOSX" {
                continue;
            }
            let metadata = fs::symlink_metadata(entry.path())?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            let path = relative_path(root, &entry.path())?;
            if metadata.is_dir() {
                output.push(RepoNode {
                    kind: "dir",
                    name,
                    path,
                    updated_at: None,
                    size: None,
                });
                walk(root, &entry.path(), output)?;
            } else if metadata.is_file() {
                let updated_at = metadata
                    .modified()
                    .ok()
                    .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                    .map(|value| value.as_millis().min(u128::from(u64::MAX)) as u64);
                output.push(RepoNode {
                    kind: classify(&name),
                    name,
                    path,
                    updated_at,
                    size: Some(metadata.len()),
                });
            }
        }
        Ok(())
    }

    let mut nodes = Vec::new();
    walk(root, root, &mut nodes)?;
    Ok(nodes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_cross_platform_file_names() {
        assert_eq!(sanitize_name("  A/B: C?.md ").unwrap(), "A_B_ C_.md");
        assert_eq!(sanitize_name("CON.md").unwrap(), "_CON.md");
        assert_eq!(sanitize_name("...").unwrap(), "未命名");
    }

    #[test]
    fn rejects_parent_and_windows_separator_paths() {
        assert!(relative_segments("../secret").is_err());
        assert!(relative_segments("folder\\secret").is_err());
        assert!(relative_segments("C:/secret").is_err());
        assert!(relative_segments("folder/article.md").is_ok());
    }

    #[test]
    fn rejects_commands_from_a_previous_workspace_generation() {
        let state = WorkspaceState::default();
        *state.current.lock().unwrap() = Some(CurrentWorkspace {
            root: PathBuf::from("/tmp/current"),
            token: "2".into(),
        });
        assert!(matches!(state.root("1"), Err(AppError::WorkspaceChanged)));
    }
}
