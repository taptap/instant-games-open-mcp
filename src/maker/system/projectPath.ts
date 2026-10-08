export function sameProjectPathSpelling(left: string, right: string): boolean {
  return (
    left === right ||
    (/^[A-Za-z]:[\\/]/.test(left) &&
      left[0].toUpperCase() === right[0]?.toUpperCase() &&
      left.slice(1) === right.slice(1))
  );
}
