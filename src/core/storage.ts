/**
 * localStorage 命名空间与读写封装。
 *
 * 命名空间的拼法只在这里出现一次，各业务模块只认 'theme' / 'drafts' 这样的短名。
 */

/** 当前命名空间 */
const NS = 'anydraft';

function keyOf(name: string): string {
  return `${NS}:${name}`;
}

/** 读偏好值 */
export function readStored(name: string): string | null {
  return localStorage.getItem(keyOf(name));
}

/** 写偏好值。配额超限时抛错，由调用方决定怎么提示 */
export function writeStored(name: string, value: string): void {
  localStorage.setItem(keyOf(name), value);
}
