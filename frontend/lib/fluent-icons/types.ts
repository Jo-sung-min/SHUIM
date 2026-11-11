/** path 하나: d 문자열, 또는 even-odd 로 채울 path */
export type FluentPath = string | { d: string; e: 1 };
/** [이름, 한글 이름, 찾기 낱말, viewBox 크기(24|20), path 들] */
export type FluentIconRow = [name: string, label: string, keywords: string, size: number, paths: FluentPath[]];
