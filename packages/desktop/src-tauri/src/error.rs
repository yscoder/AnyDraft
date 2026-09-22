use serde::Serialize;
use std::io;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("尚未打开工作目录")]
    WorkspaceNotOpen,
    #[error("工作目录已经切换，请刷新后重试")]
    WorkspaceChanged,
    #[error("路径不合法：{0}")]
    InvalidPath(String),
    #[error("文件名不合法：{0}")]
    InvalidName(String),
    #[error("目标已经存在：{0}")]
    AlreadyExists(String),
    #[error("文件系统操作失败：{0}")]
    Io(#[from] io::Error),
    #[error("配置读写失败：{0}")]
    Config(#[from] serde_json::Error),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload<'a> {
    code: &'a str,
    message: String,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let code = match self {
            Self::WorkspaceNotOpen => "WORKSPACE_NOT_OPEN",
            Self::WorkspaceChanged => "WORKSPACE_CHANGED",
            Self::InvalidPath(_) => "INVALID_PATH",
            Self::InvalidName(_) => "INVALID_NAME",
            Self::AlreadyExists(_) => "ALREADY_EXISTS",
            Self::Io(_) => "IO_FAILED",
            Self::Config(_) => "CONFIG_FAILED",
        };
        ErrorPayload {
            code,
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}
