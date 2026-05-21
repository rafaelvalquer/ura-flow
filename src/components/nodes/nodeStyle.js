export function nodeClass(baseClassName, data) {
  return [
    baseClassName,
    data?.changeColor ? 'change-colored-node' : '',
    data?.hasComparisonChange ? 'comparison-changed-node' : '',
    data?.nodeType === 'uxState' ? 'ux-analyzed-node' : '',
    data?.role === 'target' ? 'ux-target-node' : '',
    uxScoreClass(data?.uxNodeAnalysis?.score),
  ].filter(Boolean).join(' ');
}

export function nodeStyle(data) {
  return data?.changeColor ? { '--node-change-color': data.changeColor } : undefined;
}

function uxScoreClass(score) {
  if (!Number.isFinite(score)) return '';
  if (score >= 85) return 'ux-score-good';
  if (score >= 65) return 'ux-score-attention';
  return 'ux-score-critical';
}
