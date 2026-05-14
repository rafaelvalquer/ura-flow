export function nodeClass(baseClassName, data) {
  return [
    baseClassName,
    data?.changeColor ? 'change-colored-node' : '',
    data?.hasComparisonChange ? 'comparison-changed-node' : '',
  ].filter(Boolean).join(' ');
}

export function nodeStyle(data) {
  return data?.changeColor ? { '--node-change-color': data.changeColor } : undefined;
}
