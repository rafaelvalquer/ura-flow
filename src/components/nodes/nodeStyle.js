export function nodeClass(baseClassName, data) {
  return data?.changeColor ? `${baseClassName} change-colored-node` : baseClassName;
}

export function nodeStyle(data) {
  return data?.changeColor ? { '--node-change-color': data.changeColor } : undefined;
}
